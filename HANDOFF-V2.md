# Pinico V2 — Agentic Standup Bot (with Voice)

**Pivot from silent listener → AI voice agent that represents you in meetings.**

V1 (current `main`): bot joins, listens, extracts blockers, creates Jira tickets, posts chat link.
V2 (this handoff): bot joins, **has your context**, **speaks with a real voice**, **answers questions on your behalf**, still creates tickets. Voice via ElevenLabs TTS → Recall Output Audio.

The infra is the same (Auth0, Supabase, Stripe, Recall.ai, Jira, OpenAI). What changes is what happens between "transcript arrives" and "response goes out" — plus ElevenLabs for TTS and Recall's Output Audio endpoint for the bot to speak aloud.

---

## 0. Ground rules (same as V1)

| Rule | Why |
|---|---|
| No agent edits a file outside its ownership column (§2). | Two agents, one repo. |
| Commit small and often to `main`. Pull before every commit. | Hackathon pace. |
| A stub that returns fake data beats a blocked teammate. | Stubs unblock. |
| Any change to a shared contract = announce it. | Contracts are coupling. |
| Verify each external API with `curl` before writing TS. | Auth fails fast. |

---

## 1. What changes (and what stays)

### Stays the same
- Auth0 (SDK v4 via `src/proxy.ts`)
- Supabase schema + `getDb()`
- Stripe metering (`reportMeetingUsage`)
- Recall.ai bot dispatch + transcription (`createBot`, `getBotDuration`)
- Jira ticket creation (`createJiraBlockerTicket`)
- All API routes except recall webhook + bot dispatch
- `.env.local` (only two new env vars: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`)

### Changes

| File | Change | Owner |
|---|---|---|
| `src/lib/types.ts` | New types: `Persona`, `AgentAction`, `ConversationTurn` | **Frozen** — both agree first |
| `src/lib/persona.ts` | **New.** Builds agent persona from user context | **A** |
| `src/lib/agent.ts` | **New.** Core agent loop: transcript → LLM → speak + tickets | **B** |
| `src/lib/agent.test.ts` | **New.** Self-check for agent decision logic | **B** |
| `src/lib/openai.ts` | New function: `runAgentTurn()` alongside existing `extractBlocker()` | **B** |
| `src/lib/elevenlabs.ts` | **New.** Text-to-speech: text → MP3 base64 | **B** |
| `src/lib/recall.ts` | Modify `createBot()` to include `automatic_audio_output` config. New function: `outputAudio()` | **B** |
| `src/app/api/webhooks/recall/route.ts` | Route transcript through agent; agent speaks via voice + chat | **B** |
| `src/app/page.tsx` | Update landing copy to reflect voice agent | **A** |
| `src/app/context/page.tsx` | **New.** Enhanced context submission page | **A** |
| `src/app/api/context/route.ts` | **New.** Save enhanced agent context | **A** |
| `src/app/dashboard/page.tsx` | Add context entry to dashboard | **A** |
| `src/lib/extract.ts` | Gutted — buffering stays, flush calls agent instead of `extractBlocker` | **B** |

---

## 2. Voice architecture

### How the bot speaks aloud

Recall.ai has an **Output Audio** endpoint: `POST /bot/{id}/output_audio/` with a base64-encoded MP3. The bot plays it in the meeting. This works on Zoom, Meet, Teams, and Webex.

```
Transcript chunk arrives via webhook
        │
        ▼
   Buffer (same char/time heuristic from V1)
        │
        ▼
   Flush → Agent turn (LLM)
        │
        ├─ LLM decides: should I speak? what do I say?
        │
        ▼
   If should_speak:
        │
        ├─ ElevenLabs TTS: text → MP3 audio bytes
        ├─ Recall Output Audio: POST MP3 → bot speaks in meeting
        └─ ALSO sendChatMessage(text) as fallback (muted participants, audio fail)
        │
        ▼
   If blocker_found:
        │
        └─ Jira ticket + chat link (same as V1)
```

### ElevenLabs TTS (`src/lib/elevenlabs.ts`)

One function:
```ts
export async function textToSpeech(text: string): Promise<string>
// Returns base64-encoded MP3 string ready for Recall's Output Audio endpoint.
// Returns empty string on failure — caller falls back to chat message.
```

Uses ElevenLabs Text-to-Speech API: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- Voice: configurable via `ELEVENLABS_VOICE_ID` (default: "Adam" — `pNInz6obpgDQGcFmaJgB`)
- Model: `eleven_turbo_v2_5` (fastest, ~400ms latency)
- Returns: MP3 audio bytes → base64 encode → return

### Recall Output Audio (`src/lib/recall.ts`)

New function:
```ts
export async function outputAudio(botId: string, mp3Base64: string): Promise<void>
// POST /bot/{bot_id}/output_audio/ with { kind: "mp3", b64_data: mp3Base64 }
```

`createBot()` must include `automatic_audio_output` config with a short silent MP3 to enable the endpoint:
```ts
automatic_audio_output: {
  in_call_recording: {
    data: { kind: "mp3", b64_data: SILENT_MP3_BASE64 }
  }
}
```
The silent MP3 is a constant — a few bytes of silence encoded as base64. It plays once when the bot joins and is never replayed. It exists only to satisfy Recall's requirement that `automatic_audio_output` be configured for the Output Audio endpoint to work.

### Latency budget

| Step | Est. time |
|------|-----------|
| Transcript webhook delivery | ~500ms |
| Buffering (up to 5s silence or 200 chars) | variable |
| LLM (GPT-4o) | ~1-2s |
| ElevenLabs TTS (turbo v2.5) | ~400ms |
| Recall Output Audio | ~500ms |
| **Total after flush** | **~2-3s** |

This is acceptable. Meeting participants are accustomed to slight delays (people unmute, think, etc.). The agent's voice responses feel like a remote participant on a laggy connection — which is actually the right UX expectation.

---

## 3. Shared contracts (proposed — both agents agree before implementation)

```ts
// Add to src/lib/types.ts

/** Agent persona — built from user-submitted context before the meeting. */
export type Persona = {
  user_name: string;
  user_role: string;
  current_work: string;
  active_blockers: string;
  recent_wins: string;
  communication_style: string;
  delegation_instructions: string;
  topics_to_track: string;
  questions_for_team: string;
  meeting_goal: string;
  raw_context: string;
};

/** One turn in the meeting conversation. */
export type ConversationTurn = {
  speaker: string;
  text: string;
  timestamp: string;
};

/** Agent's decision after processing a transcript segment. */
export type AgentAction = {
  should_speak: boolean;
  message: string;              // what to say (text, fed to TTS)
  thinking: string;             // internal reasoning (logged, not spoken)
  blocker: {
    found: boolean;
    summary: string;
    description: string;
    priority: 'Highest' | 'High' | 'Medium' | 'Low';
  };
};

/** POST /api/context request body */
export type ContextRequest = {
  current_work: string;
  active_blockers?: string;
  recent_wins?: string;
  communication_style?: string;
  delegation_instructions?: string;
  topics_to_track?: string;
  questions_for_team?: string;
  meeting_goal?: string;
};

// A's function that B calls
export async function getPersona(userId: string): Promise<Persona | null>;
```

---

## 4. Track A — Persona, context UI, landing update

### A1 — Landing page rewrite
`src/app/page.tsx` — rewrite copy for voice agent:
- Headline: "Your AI Stand-in for Standup"
- Subhead: "Can't make standup? Pinico sends a voice agent that knows your context, speaks for you, and flags blockers — so your team never waits on you."
- Steps: (1) Set your context (2) Agent joins standup (3) Agent speaks for you + creates tickets
- Same pricing line, same auth flow

### A2 — Context submission page
`src/app/context/page.tsx` — new page at `/context`:
- Form fields matching `ContextRequest` type
- Pre-populate from today's async update if one exists
- "Save Context" → POST `/api/context`
- Show "Your voice agent is ready for the next standup" confirmation
- Auth-gated

### A3 — Context API route
`src/app/api/context/route.ts`:
- `POST` — validate with zod, upsert into `agent_context` table
- `GET` — return current context for authenticated user
- Auth required

### A4 — Persona builder
`src/lib/persona.ts`:
```ts
export async function getPersona(userId: string): Promise<Persona | null>
```
- Reads saved context, async updates, and profile
- Builds and returns a `Persona` object
- This is what B calls to get the agent's "brain"

### A5 — Dashboard integration
- Add "Set Agent Voice Context" link on dashboard
- Show current context status

---

## 5. Track B — Agent engine, voice output, webhook rewrite

### B1 — ElevenLabs TTS (`src/lib/elevenlabs.ts`)
```ts
export async function textToSpeech(text: string): Promise<string>
```
- Calls ElevenLabs API: `POST /v1/text-to-speech/{voice_id}`
- Voice ID from env var `ELEVENLABS_VOICE_ID` (default: "Adam")
- Model: `eleven_turbo_v2_5`
- Returns base64-encoded MP3
- Must not throw; log and return empty string on failure
- Verify with curl BEFORE writing TS wrapper

### B2 — Recall Output Audio (`src/lib/recall.ts` — modify)
- Modify `createBot()`: add `automatic_audio_output` config with silent MP3
- New function: `outputAudio(botId, mp3Base64)` → POST `/bot/{id}/output_audio/`
- Silent MP3 is a const (~500 bytes of silence, base64-encoded)
- Verify with curl BEFORE writing TS wrapper

### B3 — Agent LLM (`src/lib/openai.ts`)
Add `runAgentTurn()`:
```ts
export async function runAgentTurn(
  persona: Persona,
  history: ConversationTurn[],
  transcript: string
): Promise<AgentAction>
```
- System prompt built from persona — instructs model it IS the person, speaking through a voice agent
- Includes last 5-10 conversation turns
- Uses GPT-4o with json_schema strict mode
- Key prompt instructions:
  - "You are {user_name} speaking through a voice agent in a standup meeting."
  - "Keep spoken responses under 2 sentences. You are speaking out loud, not typing."
  - "Only speak when addressed or when your tracked topics come up."
  - "Never invent information. Say you don't have context if unsure."

### B4 — Agent core (`src/lib/agent.ts`)
```ts
export async function processTranscript(
  meetingId: string,
  botId: string,
  text: string
): Promise<void>
```
- Gets persona via `getPersona()`
- Loads recent conversation turns (in-memory sliding window for MVP)
- Calls `runAgentTurn()`
- If `should_speak`:
  1. `textToSpeech(message)` → MP3 base64
  2. `outputAudio(botId, mp3)` → bot speaks aloud
  3. ALSO `sendChatMessage(botId, message)` as text fallback
- If `blocker_found` → Jira ticket pipeline (same dedupe guard as V1)
- Logs turn to conversation history

### B5 — Agent self-check (`src/lib/agent.test.ts`)
- Feed fake persona + transcript → assert agent speaks when addressed
- Assert agent stays silent on irrelevant conversation
- Assert blocker extraction still works
- Mock TTS + Output Audio calls (don't hit real APIs)
- `node --test src/lib/agent.test.ts` must pass

### B6 — Webhook rewrite (`src/app/api/webhooks/recall/route.ts`)
`handleTranscript()` changes:
- Instead of `ingestChunk()` → `extractBlocker()` → ticket
- Now: `ingestChunk()` buffers → on flush → `processTranscript()` (handles speaking + tickets)
- Buffering logic stays identical
- `after()` wrapping stays (send 200 first, do work after)

### B7 — `src/lib/extract.ts` changes
- `ingestChunk()` still handles buffering
- At flush time: calls `processTranscript()` instead of `extractBlocker()` directly
- Dedupe logic moves into agent.ts

---

## 6. New env vars

```
# ElevenLabs (new — needed for voice)
ELEVENLABS_API_KEY="sk_..."
ELEVENLABS_VOICE_ID="pNInz6obpgDQGcFmaJgB"  # "Adam" — stable, professional male voice

# No other new vars needed
```

---

## 7. Supabase schema additions

```sql
CREATE TABLE agent_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) UNIQUE,
  current_work TEXT NOT NULL DEFAULT '',
  active_blockers TEXT DEFAULT '',
  recent_wins TEXT DEFAULT '',
  communication_style TEXT DEFAULT 'Direct and professional',
  delegation_instructions TEXT DEFAULT '',
  topics_to_track TEXT DEFAULT '',
  questions_for_team TEXT DEFAULT '',
  meeting_goal TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. Implementation order

### Phase 1: Contracts + stubs (both, 30 min)
1. Both agree on §3 types → add to `src/lib/types.ts`
2. **A** stubs `src/lib/persona.ts` → `getPersona()` returns hardcoded demo persona
3. **B** stubs `src/lib/agent.ts` → `processTranscript()` no-op
4. **B** stubs `src/lib/elevenlabs.ts` → `textToSpeech()` returns empty string
5. Commit. Both unblocked.

### Phase 2: B builds voice agent engine (B, ~2.5 hours)
1. Verify ElevenLabs TTS with curl — confirm MP3 comes back
2. Verify Recall Output Audio with curl — confirm bot plays audio
3. `textToSpeech()` in `src/lib/elevenlabs.ts`
4. `outputAudio()` in `src/lib/recall.ts` + modify `createBot()` config
5. `runAgentTurn()` in `src/lib/openai.ts` — the LLM call with agent persona
6. `processTranscript()` in `src/lib/agent.ts` — full agent loop with voice
7. `agent.test.ts` — self-check
8. Rewire recall webhook to use agent pipeline
9. Test end-to-end: dispatch bot → bot speaks aloud in meeting

### Phase 3: A builds context UI (A, ~2 hours)
1. `src/app/context/page.tsx` + `POST /api/context`
2. `src/lib/persona.ts` real implementation
3. Dashboard integration
4. Landing page copy update
5. Run `agent_context` schema migration

### Phase 4: Integration (both, 1 hour)
1. Submit context → dispatch bot → agent speaks with voice → ticket created
2. Test: agent answers questions about user's blockers (out loud)
3. Test: agent stays silent when irrelevant
4. Test: text chat fallback works when TTS fails
5. Land on `main`

---

## 9. Deliberately NOT building (roadmap)

- **Output Media (streaming webpage + OpenAI Realtime).** The Output Audio endpoint + ElevenLabs is simpler and sufficient. Sub-second latency via streaming audio I/O is the post-hackathon upgrade path.
- **Multi-person agent routing.** One user = one persona per meeting.
- **Persistent memory across meetings.** Fresh context each standup.
- **Proactive agent scheduling.** User manually dispatches.
- **Custom ElevenLabs voice clones.** Adam is fine for MVP.

---

## 10. Known risks

| Risk | Mitigation |
|---|---|
| TTS latency makes responses feel laggy | ElevenLabs Turbo v2.5 is ~400ms. Total ~2-3s — acceptable for a "remote participant" UX. |
| Output Audio has undocumented duration limits | Test with real meeting early. If clips are capped, chunk long responses into multiple calls. |
| Agent hallucinates information | System prompt forbids invention. Test with adversarial transcripts. |
| Bot speaks over someone talking | Flush only after silence or char threshold. Not perfect, fine for demo. |
| ElevenLabs API costs | ~$0.015 per 1K chars. Demo-scale is negligible. |

---

## 11. Kickoff messages

**To Agent A (context UI + landing):**
> Read HANDOFF-V2.md. You own Track A (§4). Build context submission page, persona builder, and landing copy. Start by stubbing `getPersona()` so B isn't blocked. Respect the ownership table in §1.

**To Agent B (voice agent engine):**
> Read HANDOFF-V2.md. You own Track B (§5). You are the critical path — the voice agent IS the demo. Build ElevenLabs TTS, Recall Output Audio, `runAgentTurn()`, and `processTranscript()`. Rewire the recall webhook. Verify ElevenLabs + Output Audio with curl BEFORE writing TS. Get ngrok running in the first 30 minutes. Respect the ownership table in §1.
