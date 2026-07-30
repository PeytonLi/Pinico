/**
 * ElevenLabs Text-to-Speech wrapper. Owned by Track B per HANDOFF-V2.md §5/B1.
 *
 * Converts agent messages into spoken audio that the Recall bot plays aloud
 * via the Output Audio endpoint. Returns base64-encoded MP3 on success,
 * empty string on failure — callers always fall back to text chat.
 *
 * API: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
 * Model: eleven_turbo_v2_5 (~400ms latency)
 * Voice: configurable via ELEVENLABS_VOICE_ID (default: "Adam")
 */
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // "Adam"

export async function textToSpeech(text: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('[elevenlabs] ELEVENLABS_API_KEY not set');
    return '';
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      console.error(
        `[elevenlabs] TTS failed: ${res.status} ${res.statusText} — ${body.slice(0, 500)}`
      );
      return '';
    }

    const arrayBuffer = await res.arrayBuffer();
    const mp3Base64 = Buffer.from(arrayBuffer).toString('base64');
    return mp3Base64;
  } catch (err) {
    console.error('[elevenlabs] TTS exception:', err instanceof Error ? err.message : String(err));
    return '';
  }
}
