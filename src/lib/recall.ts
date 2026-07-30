// Recall.ai API wrapper. §B2 of HANDOFF-V2.md adds outputAudio() for voice.

// Minimal valid silent MP3 (single frame, 128kbps 44100Hz stereo). Plays once
// on bot join to satisfy Recall's automatic_audio_output config requirement —
// enables the Output Audio endpoint for real speech later. The frame is ~26ms
// of silence; meeting participants won't notice it.
const SILENT_MP3_BASE64 = (() => {
  // MPEG1 Layer3 frame header: sync(0xFFFB) | MPEG1+Layer3(0x02) | no CRC(0x00)
  //                              128kbps(0x09) | 44100Hz(0x00) | stereo+no pad(0x00)
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  // Frame size for 128kbps 44100Hz: ceil(144 * 128000 / 44100) = 418 bytes
  // One byte of padding → 417 bytes payload after the 4-byte header
  const silence = Buffer.alloc(413, 0);
  return Buffer.concat([header, silence]).toString('base64');
})();
//
// Corrections vs the PRD/HANDOFF guesses — see docs/api-notes-recall.md for
// doc URLs and full detail:
//   - Base host is region-specific (RECALL_API_BASE env var), never
//     "api.recall.ai".
//   - Auth header is `Authorization: Token <key>` (Bearer is wrong; the
//     "Token" prefix is actually optional per docs, but we send it since a
//     documented-correct prefixed form beats round-tripping again later).
//   - The realtime webhook config lives at
//     `recording_config.realtime_endpoints` (no underscore between "real"
//     and "time" — the obvious guess `real_time_endpoints` is wrong), and
//     the transcript event names are `transcript.data` (finalized) /
//     `transcript.partial_data` (partial) — NOT `bot.transcription`.
//   - Bot lifecycle webhooks are per-transition event names like
//     `bot.done` / `bot.in_call_recording`, NOT a generic `bot.status_change`.
//   - Chat send is `POST /bot/{id}/send_chat_message/` with body
//     `{ message: string }` (optionally `{ to: <participant_id> }` for a DM,
//     which we don't use — omitting it broadcasts to the whole meeting chat).
//
// No credentials are available in this environment (see HANDOFF.md / task
// brief). Everything below is built from Recall's public docs
// (https://docs.recall.ai/reference/*), never against a live call. Treat a
// live 4xx as the docs being subtly stale before assuming this file is wrong.

type RecallConfig = {
  base: string;
  key: string;
};

function getConfig(): RecallConfig {
  const base = process.env.RECALL_API_BASE;
  const key = process.env.RECALL_API_KEY;
  if (!base || !key) {
    throw new Error('RECALL_API_BASE and RECALL_API_KEY must be set');
  }
  // Trim any trailing slash so path joins below don't produce "//bot".
  return { base: base.replace(/\/+$/, ''), key };
}

/**
 * Thin fetch wrapper: sets auth + JSON headers, and throws with Recall's
 * actual response body on any non-2xx so a live failure is debuggable from
 * the thrown message alone.
 */
async function recallFetch(base: string, key: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable response body>');
    throw new Error(
      `Recall API ${init.method ?? 'GET'} ${path} failed: ${res.status} ${res.statusText} — ${body}`
    );
  }

  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

/**
 * Creates a bot that joins `meetingUrl`, with Recall's built-in real-time
 * transcription enabled and a realtime webhook registered so
 * /api/webhooks/recall gets `transcript.data` events as people speak.
 */
export async function createBot(meetingUrl: string): Promise<{ bot_id: string }> {
  const { base, key } = getConfig();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!appUrl || !secret) {
    throw new Error('NEXT_PUBLIC_APP_URL and RECALL_WEBHOOK_SECRET must be set to register the realtime webhook');
  }

  const webhookUrl = `${appUrl.replace(/\/+$/, '')}/api/webhooks/recall?secret=${encodeURIComponent(secret)}`;

  const data = (await recallFetch(base, key, '/bot', {
    method: 'POST',
    body: JSON.stringify({
      meeting_url: meetingUrl,
      recording_config: {
        transcript: {
          provider: { recallai_streaming: {} },
        },
        realtime_endpoints: [
          {
            type: 'webhook',
            url: webhookUrl,
            events: ['transcript.data'],
          },
        ],
      },
      automatic_audio_output: {
        in_call_recording: {
          data: { kind: 'mp3', b64_data: SILENT_MP3_BASE64 },
        },
      },
    }),
  })) as { id?: string } | null;

  if (!data?.id) {
    throw new Error(`Recall createBot: response missing bot id — ${JSON.stringify(data)}`);
  }
  return { bot_id: data.id };
}

/** Posts `text` into the live meeting chat via the bot. */
export async function sendChatMessage(botId: string, text: string): Promise<void> {
  const { base, key } = getConfig();
  await recallFetch(base, key, `/bot/${encodeURIComponent(botId)}/send_chat_message/`, {
    method: 'POST',
    body: JSON.stringify({ message: text }),
  });
}

type StatusChange = { code: string; created_at: string };

/**
 * Minutes the bot spent in the call, for Stripe metering. Derived from the
 * bot's `status_changes` history (GET /bot/{id}/).
 *
 * AMBIGUITY (flagged in docs/api-notes-recall.md): Recall's own docs disagree
 * on whether `status_changes[].code` is bare (`"in_call_recording"`,
 * `"done"`) or event-prefixed (`"bot.in_call_recording"`, `"bot.done"`) in
 * this endpoint's response — as opposed to the webhook payload, which is
 * definitely prefixed. We match with `.includes()` so either shape works,
 * and fall back to the first/last timestamp in the history if no matching
 * code is found at all, so this never throws on an unexpected shape.
 */
export async function getBotDuration(botId: string): Promise<number> {
  const { base, key } = getConfig();
  const data = (await recallFetch(base, key, `/bot/${encodeURIComponent(botId)}/`, {
    method: 'GET',
  })) as { status_changes?: StatusChange[] } | null;

  const changes = Array.isArray(data?.status_changes) ? data.status_changes : [];
  if (changes.length === 0) return 0;

  const sorted = [...changes].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const start = sorted.find((c) => c.code.includes('in_call')) ?? sorted[0];
  const end =
    [...sorted].reverse().find((c) => c.code.includes('done') || c.code.includes('call_ended')) ??
    sorted[sorted.length - 1];

  const startMs = new Date(start.created_at).getTime();
  const endMs = new Date(end.created_at).getTime();
  const minutes = Math.ceil((endMs - startMs) / 60000);

  if (!Number.isFinite(minutes) || minutes < 0) return 0;
  return minutes;
}

/**
 * POST /bot/{bot_id}/output_audio/ — makes the bot speak aloud in the meeting.
 * Sends a base64-encoded MP3. The `automatic_audio_output` config in
 * createBot() must be present for this endpoint to work.
 */
export async function outputAudio(botId: string, mp3Base64: string): Promise<void> {
  const { base, key } = getConfig();
  await recallFetch(base, key, `/bot/${encodeURIComponent(botId)}/output_audio/`, {
    method: 'POST',
    body: JSON.stringify({ kind: 'mp3', b64_data: mp3Base64 }),
  });
}
