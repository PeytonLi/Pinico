/**
 * ElevenLabs Text-to-Speech wrapper. Owned by Track B per HANDOFF-V2.md §5/B1.
 *
 * Converts agent messages into spoken audio that the Recall bot plays aloud
 * via the Output Audio endpoint. Never throws — returns empty string on
 * failure so callers can fall back to text chat.
 */

// PHASE 1 STUB — returns empty string. Track B replaces with real TTS in Phase 2.
export async function textToSpeech(_text: string): Promise<string> {
  // TODO(Phase 2): POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
  // with model eleven_turbo_v2_5, return base64-encoded MP3 bytes.
  return '';
}
