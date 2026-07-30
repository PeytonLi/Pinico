# Pinico V2 — Agentic Standup Bot

**Pivot from silent listener → AI agent that represents you in meetings.**

V1 (current `main`): bot joins, listens, extracts blockers, creates Jira tickets.
V2 (this handoff): bot joins, **has your context**, **answers questions on your behalf**, **speaks in chat**, still creates tickets.

The infra is the same (Auth0, Supabase, Stripe, Recall.ai, Jira, OpenAI). What changes is what happens between "transcript arrives" and "response goes out."

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
- All API routes except the recall webhook handler
- `.env.local` (no new env vars needed)
- Phase 0 setup (already done)

### Changes

| File | Change | Owner |
|---|---|---|
| `src/lib/types.ts` | New types: `Persona`, `AgentAction`, `ConversationTurn` | **Frozen** — both agree first |
| `src/lib/persona.ts` | **New.** Builds agent persona from user context | **A** |
| `src/lib/agent.ts` | **New.** Core agent loop: transcript → LLM → action | **B** |
| `src/lib/agent.test.ts` | **New.** Self-check for agent decision logic | **B** |
| `src/lib/openai.ts` | New function: `runAgentTurn()` alongside existing `extractBlocker()` | **B** |
| `src/app/api/webhooks/recall/route.ts` | Route transcript through agent instead of raw extraction | **B** |
| `src/app/page.tsx` | Update landing copy to reflect agent capabilities | **A** |
| `src/app/context/page.tsx` | **New.** Enhanced context submission page | **A** |
| `src/app/api/context/route.ts` | **New.** Save enhanced agent context | **A** |
| `src/app/dashboard/page.tsx` | Add context entry to dashboard | **A** |
| `src/lib/extract.ts` | Gutted — buffering stays, but flush calls agent instead of `extractBlocker` | **B** |

---

## 2. New architecture

### The agent loop

```
Transcript chunk arrives
        │
        ▼
   Buffer it (same char/time heuristic)
        │
        ▼
   Flush → Agent turn
        │
        ├─ Build persona from DB (user's async updates, profile, past blockers)
        ├─ Build conversation history (last 5-10 turns from this meeting)
        ├─ Call LLM with: persona + history + transcript segment
        │
        ▼
   LLM returns structured AgentAction:
        │
        ├─ should_speak: true/false
        ├─ message: what to say in chat
        ├─ blocker_found: true/false
        └─ blocker: { summary, description, priority }
        │
        ▼
   Execute actions:
        ├─ If should_speak → sendChatMessage(botId, message)
        └─ If blocker_found → createJiraBlockerTicket + dedupe guard
```

### Persona system

Before the meeting, the user submits **agent context** via a new page. This is different from async updates — it's specifically "what your agent should know and how it should represent you."

```ts
type Persona = {
  // Who the agent is representing
  user_name: string;
  user_role: string;
  
  // What the agent knows
  current_work: string;       // "I'm building the payments integration"
  active_blockers: string;    // "Blocked on Auth0 staging webhook returning 500"
  recent_wins: string;        // "Shipped the dashboard yesterday"
  
  // How the agent should behave
  communication_style: string; // "Direct and technical", "Friendly", etc.
  delegation_instructions: string; // "If asked about the API, direct them to the OpenAPI spec"
  
  // What the agent should watch for
  topics_to_track: string;    // "Mention of 'Auth0', 'staging', or 'webhook'"
  questions_for_team: string; // "Ask DevOps: when will staging be fixed?"
  
  // Meeting-specific
  meeting_goal: string;       // "Get an ETA on the staging fix"
  
  // Raw context blob (async updates + anything else)
  raw_context: string;
};
```

### Agent LLM

One call per flush, handles conversation + extraction together:

```ts
// src/lib/types.ts — new types
type AgentAction = {
  should_speak: boolean;
  message: string;              // empty if !should_speak
  thinking: string;             // internal reasoning (logged, not shown)
  blocker: {
    found: boolean;
    summary: string;
    description: string;
    priority: 'Highest' | 'High' | 'Medium' | 'Low';
  };
};

type ConversationTurn = {
  speaker: string;              // "Alice", "Bot", etc.
  text: string;
  timestamp: string;
};
```

The system prompt is the key differentiator. It instructs the model to be an agent representing a specific person:

```
You are {user_name}, a {user_role}, represented by an AI agent in a standup 
meeting you couldn't attend. 

Your context:
- Currently working on: {current_work}
- Active blockers: {active_blockers}
- Recent wins: {recent_wins}
- Communication style: {communication_style}

Rules:
1. Answer questions directed at you using your context. Be concise.
2. If someone asks about your blockers, give specifics.
3. If the conversation touches your topics_to_track, chime in proactively.
4. If your questions_for_team are relevant to the discussion, ask them.
5. Never make up information not in your context. Say "I don't have that context" if unsure.
6. Extract technical blockers as they're discussed (even if not yours).
7. Your response goes to meeting chat — keep messages under 3 sentences.
```

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
  message: string;
  thinking: string;
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

/** A's function that B calls to load persona before dispatching */
// In src/lib/persona.ts, owned by A
export async function getPersona(userId: string): Promise<Persona | null>;
```

---

## 4. Track A — Persona, context UI, landing update

### A1 — Landing page rewrite
`src/app/page.tsx` — the current copy says "spoken blockers become Jira tickets in real time." Change to reflect the agent:
- Headline: "Your AI Stand-in for Standup"
- Subhead: "Can't make standup? Pinico sends an AI agent that knows your context, answers questions, and flags blockers — so your team never waits on you."
- Steps: (1) Set your context (2) Agent joins standup (3) Agent speaks for you + creates tickets
- Same pricing line, same auth flow
- Keep the same visual style, just change copy

### A2 — Context submission page
`src/app/context/page.tsx` — new page at `/context`:
- Form fields matching `ContextRequest` type
- Pre-populate from today's async update if one exists
- "Save Context" button → POST `/api/context`
- Show "Your agent is ready for the next standup" confirmation
- Auth-gated (redirect to login if no session)

### A3 — Context API route
`src/app/api/context/route.ts`:
- `POST` — validate with zod, upsert into a new `agent_context` table (or a JSON column on `profiles`)
- `GET` — return current context for the authenticated user
- Auth required

### A4 — Persona builder
`src/lib/persona.ts`:
```ts
export async function getPersona(userId: string): Promise<Persona | null>
```
- Reads the user's saved context, async updates, and profile
- Builds and returns a `Persona` object
- This is the function B calls to get the agent's "brain" before a meeting

### A5 — Dashboard integration
- Add a "Set Agent Context" link/card on the dashboard
- Show current context status ("Context set 2 hours ago" / "No context set")

---

## 5. Track B — Agent engine, conversational LLM, webhook rewrite

### B1 — Agent LLM (`src/lib/openai.ts`)
Add `runAgentTurn()`:

```ts
export async function runAgentTurn(
  persona: Persona,
  history: ConversationTurn[],
  transcript: string
): Promise<AgentAction>
```

- Builds system prompt from persona
- Includes last 5-10 conversation turns as context
- Uses GPT-4o with json_schema strict mode
- The existing `extractBlocker()` stays (may be used as fallback)

### B2 — Agent core (`src/lib/agent.ts`)
```ts
export async function processTranscript(
  meetingId: string,
  botId: string,
  text: string
): Promise<void>
```

- Gets persona via `getPersona()`
- Loads recent conversation turns from a new `conversation_log` table (or in-memory for MVP)
- Calls `runAgentTurn()`
- If `should_speak` → `sendChatMessage(botId, message)`
- If `blocker_found` → ticket creation pipeline (same as current)
- Logs the turn to conversation history

### B3 — Agent self-check (`src/lib/agent.test.ts`)
- Feed a fake persona + transcript through `runAgentTurn()`
- Assert the agent responds when its name/topics are mentioned
- Assert the agent stays silent on irrelevant conversation
- Assert blocker extraction still works
- `node --test src/lib/agent.test.ts` must pass

### B4 — Webhook rewrite (`src/app/api/webhooks/recall/route.ts`)
The `handleTranscript()` function changes:
- Instead of `ingestChunk()` → `extractBlocker()` → ticket
- Now: `ingestChunk()` → `processTranscript()` (which handles speaking + tickets)
- The buffering logic in `ingestChunk` stays — it still decides when to flush
- But at flush time, instead of calling `extractBlocker()`, it calls the agent pipeline

### B5 — `src/lib/extract.ts` changes
- `ingestChunk()` still handles buffering
- At flush time, calls `processTranscript()` from agent.ts instead of `extractBlocker()` directly
- The `dedupeKey` logic stays
- This file becomes thinner — buffering only

### B6 — Conversation storage (minimal)
- New Supabase table: `conversation_turns (meeting_id, speaker, text, created_at)`
- Or simpler: append to `meetings.transcript_buffer` and parse for history
- For MVP, just keep last 10 turns in memory (simplest)
- ponytail: in-memory, last-10 sliding window. Upgrade to DB table if we need persistence.

---

## 6. Supabase schema additions

```sql
-- Agent context storage (or add as JSONB column to profiles)
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

-- Conversation log (optional — may skip for MVP)
CREATE TABLE conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id),
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 7. Implementation order (critical path)

### Phase 1: Contracts + stubs (both agents, 30 min)
1. **Both agree on §3 types** and add them to `src/lib/types.ts`
2. **A** stubs `src/lib/persona.ts` → `getPersona()` returns hardcoded demo persona
3. **B** stubs `src/lib/agent.ts` → `processTranscript()` returns no-op
4. Commit. Both tracks unblocked.

### Phase 2: B builds agent engine (B, ~2 hours)
1. `runAgentTurn()` in `src/lib/openai.ts` — the LLM call
2. `processTranscript()` in `src/lib/agent.ts` — the agent loop
3. `agent.test.ts` — self-check
4. Rewire recall webhook to use agent pipeline
5. Test end-to-end with a real meeting + ngrok

### Phase 3: A builds context UI (A, ~2 hours)
1. `src/app/context/page.tsx` + `POST /api/context`
2. `src/lib/persona.ts` real implementation
3. Dashboard integration
4. Landing page copy update

### Phase 4: Integration (both, 1 hour)
1. Run the full flow: submit context → dispatch bot → agent speaks in meeting → ticket created
2. Test: agent answers questions about user's blockers
3. Test: agent stays silent when irrelevant
4. Test: blocker extraction still works
5. Land on `main`

---

## 8. What we're NOT building (roadmap)

- **Voice output (ElevenLabs).** Chat injection IS the agent's voice. Real TTS requires audio injection into meetings, which is platform-specific and Recall.ai doesn't support natively. Pitch it, don't build it.
- **Multi-person agent routing.** One user = one agent. The persona is tied to the authenticated user who dispatched the bot.
- **Agent-to-agent conversation.** One bot per meeting.
- **Persistent conversation memory across meetings.** Fresh context each standup.
- **Proactive agent scheduling.** User manually dispatches the bot for now.

---

## 9. Known risks

| Risk | Mitigation |
|---|---|
| LLM latency makes agent responses feel slow | The chat message is the response — people read async. 2-3s is fine. |
| Agent hallucinates information not in context | System prompt explicitly forbids this. Test with edge cases. |
| Recall.ai transcript accuracy is low | The agent works with what it gets. "I didn't catch that" is a valid response. |
| buffering heuristic misfires for conversation | The 200-char / 5s thresholds were for blocker extraction. May need tuning for conversation. |

---

## 10. Kickoff messages

**To Agent A (context UI + landing):**
> Read HANDOFF-V2.md. You own Track A (§4). Build the context submission page, persona builder, and update the landing copy. Start by stubbing `getPersona()` so B isn't blocked. Respect the ownership table in §1.

**To Agent B (agent engine):**
> Read HANDOFF-V2.md. You own Track B (§5). You are the critical path — the agent engine IS the demo. Build `runAgentTurn()` and `processTranscript()`, then rewire the recall webhook. Start with a self-check test. Get a public tunnel running in the first 30 minutes. Respect the ownership table in §1.
