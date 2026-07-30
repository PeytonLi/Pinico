# Recall.ai API notes (Track B — B-recall)

No credentials are available in this environment. Nothing below was verified
against a live call — everything comes from Recall's public docs
(`docs.recall.ai`), fetched on 2026-07-30. Whoever gets real
`RECALL_API_KEY` / a public tunnel should hand-verify §4 before the first
integration run (per HANDOFF.md §B1/§6).

## 1. Auth header

**PRD/HANDOFF guess:** `Authorization: Token ${RECALL_API_KEY}`, flagged as "not a standard Bearer scheme, verify."

**Confirmed:** correct, and it's not Bearer. Per
[docs.recall.ai/reference/authentication](https://docs.recall.ai/reference/authentication):
canonical form is the bare key (`Authorization: $RECALLAI_API_KEY`), but the
docs explicitly say *"the `Token` prefix is optional, and can be safely
omitted"* — i.e. `Authorization: Token $RECALLAI_API_KEY` is also documented
as valid. Implemented with the `Token ` prefix since that's what the task
spec required and the docs confirm it works.

## 2. Base host

**PRD said:** `https://api.recall.ai/api/v1` — wrong, confirmed in HANDOFF §7 already.

**Confirmed:** host is region-specific:
`https://{region}.recall.ai/api/v1`, one of `us-east-1`, `us-west-2`,
`eu-central-1`, `ap-northeast-1`.
Source: [docs.recall.ai/docs/regions](https://docs.recall.ai/docs/regions).
`.env.example` already has `RECALL_API_BASE="https://us-west-2.recall.ai/api/v1"`
— `recall.ts` reads this from the env var and never hardcodes a host.

## 3. Create Bot — `POST {base}/bot`

Confirmed shape (source:
[docs.recall.ai/reference/bot_create](https://docs.recall.ai/reference/bot_create),
[docs.recall.ai/docs/bot-real-time-transcription](https://docs.recall.ai/docs/bot-real-time-transcription),
[docs.recall.ai/docs/real-time-webhook-endpoints](https://docs.recall.ai/docs/real-time-webhook-endpoints)):

```json
{
  "meeting_url": "...",
  "recording_config": {
    "transcript": {
      "provider": { "recallai_streaming": {} }
    },
    "realtime_endpoints": [
      {
        "type": "webhook",
        "url": "https://<tunnel>/api/webhooks/recall?secret=...",
        "events": ["transcript.data"]
      }
    ]
  }
}
```

Response: `{ "id": "<uuid>", ... }` — the bot's id field is **`id`**, not
`bot_id`. `recall.ts::createBot` maps `data.id` -> `{ bot_id }` to match the
contract in `src/lib/types.ts`.

**Corrections vs the PRD/HANDOFF guesses:**

- The realtime-endpoint config key is `recording_config.realtime_endpoints`
  — **no underscore between "real" and "time."** The obvious guess
  (`real_time_endpoints`, which HANDOFF itself uses in prose) is wrong.
  Confirmed directly from the `bot_create` OpenAPI schema.
- Real-time transcript event names are `transcript.data` (finalized
  utterance) and `transcript.partial_data` (low-latency partial). The PRD's
  `bot.transcription` does not exist. We subscribe to `transcript.data` only
  — partials would multiply extraction calls in `extract.ts` for no benefit
  at demo scale.
- Bot lifecycle webhooks (join/done/etc.) are **separate per-transition
  event names** (`bot.joining_call`, `bot.in_call_recording`, `bot.done`,
  `bot.fatal`, ...), configured through the Recall dashboard's webhook
  settings, **not** through `recording_config.realtime_endpoints` and **not**
  a single generic `bot.status_change` event as the PRD guessed. Source:
  [docs.recall.ai/docs/bot-status-change-events](https://docs.recall.ai/docs/bot-status-change-events).
  This matters for whoever assembles `/api/webhooks/recall` (B6): the
  "bot-done" branch should match on `event === 'bot.done'` (or similar),
  not `event === 'bot.status_change'`.

**AMBIGUITY — flagged, not silently guessed:** the exact config object shape
under `transcript.provider.recallai_streaming` (language, interim results,
etc.) isn't shown as a full inline example on the fetched pages, only that
the key exists and other providers (`elevenlabs_streaming`,
`assembly_ai_v3_streaming`, `deepgram_streaming`, `aws_transcribe_streaming`,
`rev_streaming`, `speechmatics_streaming`, `gladia_v2_streaming`) are its
siblings. `recall.ts` sends `{}` (all defaults). If a live test needs e.g.
non-English audio, check
[docs.recall.ai/docs/recallai-transcription](https://docs.recall.ai/docs/recallai-transcription)
for the full options object before the first real call.

## 4. Send Chat Message — `POST {base}/bot/{id}/send_chat_message/`

Confirmed shape (source:
[docs.recall.ai/reference/bot_send_chat_message_create](https://docs.recall.ai/reference/bot_send_chat_message_create),
[docs.recall.ai/docs/sending-chat-messages](https://docs.recall.ai/docs/sending-chat-messages),
which quotes the exact curl example):

```bash
curl --request POST \
     --url https://us-west-2.recall.ai/api/v1/bot/{id}/send_chat_message/ \
     --header 'Authorization: {API_KEY}' \
     --header 'content-type: application/json' \
     --data '{ "message": "..." }'
```

Body field is `message` (confirmed against the doc's own curl example, not
guessed). An optional `to` field DMs a specific participant id — omitted, so
our messages broadcast to the whole meeting chat, matching the demo script
in HANDOFF §6 ("link appears in meeting chat" — everyone should see it).

**Not independently verified:** whether a trailing slash on the path is
mandatory. The doc's own example includes it; `recall.ts` matches the
example exactly rather than guessing it's optional.

## 5. Bot duration — `GET {base}/bot/{id}/`

Used for `getBotDuration()` (Stripe metering minutes). Confirmed: the Bot
object has a `status_changes` array of `{ code, sub_code, created_at }`
entries (source:
[docs.recall.ai/reference/bot_retrieve](https://docs.recall.ai/reference/bot_retrieve)),
and the standard approach is diffing the "joined/recording" timestamp
against the "done" timestamp
([docs.recall.ai/docs/bot-status-change-events](https://docs.recall.ai/docs/bot-status-change-events)
recommends exactly this for billing).

**RESOLVED against a live bot (2026-07-30).** The docs conflicted — the
retrieve-bot reference implied bare strings, the status-change-events guide
showed event-prefixed ones (`"bot.in_call_recording"`). A real bot
(`4d0c8c65…`) joining a live Google Meet returned **bare** codes:

```
joining_call -> joining_call -> in_waiting_room -> in_waiting_room
  -> in_call_not_recording -> in_call_not_recording
  -> in_call_recording -> in_call_recording
```

So `status_changes[].code` is bare; the `bot.`-prefixed form is the *webhook
`event`* field, a different thing. Codes also repeat (each appears twice).

`getBotDuration()` matches with `.includes('in_call')` / `.includes('done')` /
`.includes('call_ended')`, which is correct for this shape and still tolerant
if Recall ever switches. Note `in_call_not_recording` also contains `in_call`,
so the sorted `.find()` picks the earlier "joined" moment — the intended
behaviour for billing.

## 6. Things not touched by this file (for context, owned elsewhere)

- The exact assembly of `/api/webhooks/recall` (event dispatch, secret
  check, calling `extract.ts` / `jira.ts` / `sendChatMessage`) is B6's job,
  not this file's. The event-name corrections in §3 above are relevant to
  whoever assembles it.
- Websocket realtime delivery (`type: "websocket"`) exists as an
  alternative to the webhook we use, per
  [docs.recall.ai/docs/real-time-websocket-endpoints](https://docs.recall.ai/docs/real-time-websocket-endpoints).
  Not used — HANDOFF's webhook-based design is simpler for a 24h build and
  needs no persistent connection to manage.

## 7. Output Audio payload cap — MEASURED (2026-07-30)

HANDOFF-V2 §10 listed "Output Audio has undocumented duration limits" as a
guessed risk. Measured against the live API, it is **not** a duration limit:

```
POST /bot/{id}/output_audio/  with a 100.6s / 1574KB mp3
-> 400 {"b64_data":["Ensure this field has no more than 1835008 characters."]}
```

- Hard cap: **1,835,008 base64 characters** (~1.31 MiB of mp3), which at the
  ElevenLabs bitrate we use is roughly **88 seconds** of speech. The real limit
  is bytes, so a lower bitrate buys more seconds.
- Over the cap it **returns 400 and plays nothing — it does not truncate.**
  `agent.ts` catches the throw and falls back to a chat message, so the failure
  is silent in the meeting. `outputAudio()` now guards this explicitly with the
  size in the error message.
- A 3.2s clip plays fine (verified). Agent replies are prompted to ~2 sentences,
  so the cap is never approached in practice.

**Not implemented:** chunking long replies across multiple `outputAudio` calls.
Unnecessary while replies stay short; the guard names it as the upgrade path.

## 8. `recallai_streaming` options — RESOLVED (2026-07-30)

§3 flagged this object's shape as unknown. Determined by probing the live API:

- `mode`: only two valid values — `prioritize_accuracy` (**the default**) and
  `prioritize_low_latency`. Anything else returns
  `"<value>" is not a valid choice.`
- `language_code`: defaults to `auto`, but low-latency mode **rejects** it —
  `"language_code other than english is not supported in low latency mode"`.
  So `prioritize_low_latency` requires `language_code: "en"`.

**Why this matters:** on the default `prioritize_accuracy`, measured
`transcript.data` events spanned up to **170 seconds of speech** before being
delivered, with ~2.2s minimum lag even for a short isolated question. That
delay happens entirely before our code runs and was the dominant source of the
agent feeling slow. `createBot` now sets low-latency mode explicitly.

Trade-off: accuracy mode is better for non-English or transcript quality. Switch
back if a demo needs either.
