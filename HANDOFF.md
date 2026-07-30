# Pinico — Two-Agent Build Handoff

24h hackathon MVP. Read this whole file before touching anything.

**Repo is empty.** Phase 0 must run to completion, by ONE agent, before Track A and Track B start.

---

## 0. Ground rules

| Rule | Why |
|---|---|
| **No agent edits a file outside its ownership column** (§2). | Two agents in one repo = merge hell otherwise. |
| Commit small and often to `main`. Pull before every commit. | Hackathon; branches cost more than they save at this size. |
| A stub that returns fake data beats a blocked teammate. Ship stubs in Phase 0, fill them in later. | Track A's UI must not wait on Track B's pipeline. |
| Any change to a shared contract (§3) = announce it, don't just do it. | Contracts are the only real coupling. |
| Use Context7 for Recall.ai / Jira / Stripe / OpenAI API shapes. **Do not trust the API snippets in the PRD or in this doc** — they are sketches, and at least three are subtly wrong (§7). | Wrong endpoint = 30 min lost at 3am. |
| Verify each external API with one `curl` before writing the TS wrapper. | Auth/permission failures surface instantly instead of buried in Next.js. |

**Track B is the critical path.** The demo is: bot joins → someone says a blocker out loud → Jira ticket exists → link appears in meeting chat. If Track B slips, there is no demo. Track A is the supporting story (dashboard, async updates, billing). If time runs out, Track A ships less, not Track B.

---

## 1. Phase 0 — Setup — ✅ DONE, one thing blocked

**Status: complete except credentials.** Scaffold, schema, shared libs, proxy, and
all four stub routes are committed. `pnpm build` and `npx tsc --noEmit` are green;
all four routes verified with `curl`.

**Blocked on the repo owner, not on an agent:** `.env.local` holds placeholders.
Nobody has Auth0/Supabase/Stripe/Recall/OpenAI/Jira accounts yet. `AUTH0_SECRET`
and `RECALL_WEBHOOK_SECRET` are generated and real; everything else needs filling
in per `README.md` → *Required setup*. Until `AUTH0_DOMAIN` etc. are real,
`/auth/login` returns 500 (`OAUTH_RESPONSE_IS_NOT_CONFORM` — discovery hits a
nonexistent tenant). The wiring is verified correct; only the values are missing.

**First agent to get credentials** should log in once and confirm a `profiles`
row appears, then say so here. Neither track is blocked on that in the meantime —
both can build against the stubs.

<details>
<summary>Original Phase 0 instructions (for reference)</summary>

Nobody else touches the repo until the exit criteria pass.

```bash
# 1. Scaffold in place (repo already has .git)
pnpm create next-app . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# 2. Deps  (note: the OpenAI package is `openai`, not `@openai/openai-api`)
pnpm add @auth0/nextjs-auth0 stripe @stripe/stripe-js openai @supabase/supabase-js zod lucide-react

# 3. Provisioning — try the CLI, but do NOT burn more than 10 minutes on it.
#    If it fights you, create Auth0 + Supabase + Stripe by hand in their dashboards
#    and paste keys into .env.local. Same result, less yak.
stripe projects init pinico
stripe projects add auth0/client
stripe projects add supabase/project
```

### Phase 0 deliverables

1. **`.env.local`** — ⚠️ *use the committed `.env.example` as the source of truth, not PRD §5.1 (v3 Auth0 names).* Originally specified as:
   ```env
   SUPABASE_SERVICE_ROLE_KEY="..."   # server-side writes from webhooks
   RECALL_API_BASE="https://us-west-2.recall.ai/api/v1"  # region-specific host, verify
   RECALL_WEBHOOK_SECRET="pick-any-random-string"
   ```
   Also write **`.env.example`** with the same keys and empty values, and confirm `.env.local` is gitignored.

2. **Supabase schema** — run all four `CREATE TABLE` blocks from PRD §5.2, plus these two additions:
   ```sql
   ALTER TABLE meetings ADD COLUMN transcript_buffer TEXT DEFAULT '';
   ALTER TABLE meetings ADD COLUMN stripe_customer_id TEXT;
   ALTER TABLE tickets  ADD COLUMN dedupe_key TEXT;
   CREATE UNIQUE INDEX tickets_dedupe ON tickets (meeting_id, dedupe_key);
   ```
   RLS: **off** for the hackathon. Server routes use the service role key; there is no client-side direct DB access. Say this out loud in the demo if a judge asks.

3. **`src/lib/supabase.ts`** — one exported server client using the service role key. That's it.

4. **Auth0 wired end to end.** ⚠️ *This step was written for SDK v3 and is wrong — v4 shipped instead. See §1's "What Phase 0 actually built" for what the repo really does.* **Log in successfully once** and confirm `profiles` gets a row (upsert on `auth0_user_id` inside `getOrCreateProfile()` in `src/lib/profile.ts`).

5. **`src/lib/types.ts`** — the shared contract types from §3, and nothing else.

6. **Four stub routes** that compile, typecheck, and return correctly-shaped fake data:
   - `POST /api/updates` → `{ ok: true }`
   - `POST /api/bot/dispatch` → `{ bot_id: "stub-bot-1", meeting_id: "stub-meeting-1" }`
   - `POST /api/webhooks/recall` → `200` and logs its body
   - `GET /api/meetings/[id]` → `{ status: "in_call", tickets: [] }`

7. **`README.md`** — how to run it, and which env vars are required.

### Exit criteria (all must pass)

- `pnpm build` clean, `pnpm dev` serves `/`
- Auth0 round trip works, `profiles` row exists
- All four stub routes reachable with `curl`
- Committed and pushed to `main`

Post "Phase 0 green" before the other two agents begin.

</details>

### What Phase 0 actually built (read this, it differs from the plan above)

The installed versions are newer than the PRD assumes. Four things changed:

1. **Next.js 16 + React 19 + Tailwind 4.** There is **no `tailwind.config.ts`** —
   Tailwind 4 configures in CSS. Theme work goes in `src/app/globals.css`.
2. **Auth0 SDK v4** (`4.26.0`), which is a hard break from the v3 API in the PRD:
   - No `app/api/auth/[auth0]/route.ts`, no `handleAuth`, no `UserProvider`.
   - `src/proxy.ts` (Next 16's replacement for `middleware.ts`) mounts
     `/auth/login`, `/auth/logout`, `/auth/callback` automatically.
   - Server-side session: `await auth0.getSession()` from `@/lib/auth0`.
   - Env names are `AUTH0_DOMAIN` + `APP_BASE_URL`, **not**
     `AUTH0_ISSUER_BASE_URL` + `AUTH0_BASE_URL`.
   - Use `<a href="/auth/login">`, never `<Link>` — the proxy handles these, not
     the router.
   - **No client-side Auth0 provider is installed, deliberately.** Read the
     session in a server component and pass what you need down as props. Add
     `Auth0Provider`/`useUser` only if something genuinely needs it client-side.
3. **Construct API clients inside functions, never at module scope.** Next 16
   imports every route module at build time to collect metadata, so a top-level
   `new Stripe(...)` / `new OpenAI(...)` / `createClient(...)` makes `pnpm build`
   fail whenever credentials are absent. This already bit Phase 0. Follow the
   `getDb()` pattern in `src/lib/supabase.ts` — the DB handle is
   **`getDb()`, not `db`**.
4. **Dynamic route params are async** in Next 16:
   `{ params }: { params: Promise<{ id: string }> }` then `await params`.

---

## 2. File ownership

Hard boundaries. Do not cross them.

| Path | Owner |
|---|---|
| `src/app/page.tsx` (landing) | **A** |
| `src/app/dashboard/**` | **A** |
| `src/app/api/updates/**` | **A** |
| `src/app/api/meetings/**` | **A** |
| `src/lib/stripe.ts` | **A** |
| `src/components/**` | **A** |
| `src/app/globals.css` (Tailwind 4 has no config file) | **A** |
| `src/lib/recall.ts` | **B** |
| `src/lib/llm.ts` (was `openai.ts` — provider is DeepSeek now) | **B** |
| `src/lib/jira.ts` | **B** |
| `src/lib/extract.ts` (buffer + dedupe logic) | **B** |
| `src/app/api/bot/dispatch/**` | **B** |
| `src/app/api/webhooks/recall/**` | **B** |
| `src/lib/types.ts`, `src/lib/supabase.ts`, `src/lib/auth0.ts`, `src/lib/profile.ts`, `src/proxy.ts`, `src/app/layout.tsx`, `.env*`, `supabase/schema.sql` | **Frozen.** Changes require both agents to agree. |

Two deliberate exceptions, both one-liners:
- **B imports `reportMeetingUsage` from A's `src/lib/stripe.ts`** in the bot-done handler. A ships that function signature early (§3) even if the body is a no-op at first.
- **A's dashboard calls B's `POST /api/bot/dispatch`.** Contract frozen in Phase 0.

---

## 3. Shared contracts (frozen after Phase 0)

`src/lib/types.ts`:

```ts
export type DispatchRequest  = { meeting_url: string };
export type DispatchResponse = { bot_id: string; meeting_id: string };

export type MeetingStatus = 'scheduled' | 'in_call' | 'completed';

export type MeetingState = {
  status: MeetingStatus;
  duration_minutes: number;
  tickets: { jira_ticket_key: string; summary: string; priority: string }[];
};

export type ExtractedBlocker = {
  blocker_found: boolean;
  summary: string;
  description: string;
  reported_by: string;
  suggested_assignee: string;
  priority: 'Highest' | 'High' | 'Medium' | 'Low';
};
```

A's function that B calls:

```ts
// src/lib/stripe.ts  — owned by A
export async function reportMeetingUsage(
  stripeCustomerId: string,
  minutes: number
): Promise<void>;
```

---

## 4. Track A — Product surface, async updates, billing

Goal: a dashboard that looks like a real product, ingests async updates, dispatches the bot, shows tickets appearing live, and meters usage to Stripe.

### A1 — Landing page
Hero built on PRD §1.1's numbers ("the $60,000 standup"), Auth0 login CTA, three-step "how it works", the pricing line ($99 base + $0.15/min). One page, no CMS, no animation library. This is demo-slide-quality-in-the-browser — spend real effort on it, judges see it first.

### A2 — Async update form
`/dashboard` — textarea for `status_text`, textarea for `blockers_text`, submit → `POST /api/updates` → insert into `async_updates` keyed to the caller's profile. Show today's submitted updates for the whole team below the form (they're the "async context" the bot represents in the meeting).

Route must reject unauthenticated calls and validate the body with `zod`. Trust boundary — do not skip this.

### A3 — Dispatch + live meeting panel
URL input → "Dispatch Bot" → `POST /api/bot/dispatch` → then poll `GET /api/meetings/[id]` every 2s and render status + tickets as they land. **Polling, not Realtime** — 6 lines vs a subscription lifecycle, and the demo runs for 90 seconds.

Ticket cards link to `https://{JIRA_HOST_NAME}/browse/{key}`. Make the moment a ticket appears feel good; that's the money shot on stage.

### A4 — Stripe metering
`src/lib/stripe.ts` with `reportMeetingUsage()` per PRD §5.6. Create the `pinico_meeting_minutes` meter in the Stripe dashboard, create one test customer, store its id on the `meetings` row at dispatch time. **Ship the real function body in the first hour** so B can wire it whenever B gets there. Verify a usage event actually lands in the Stripe dashboard — a silent no-op you discover on stage is worse than not claiming the feature.

Skip subscriptions, checkout, a customer portal, and Metronome proper. One meter event proves the model; the rest is pitch narrative.

### Suggested subagent split for A
- **A-frontend** (`frontend-design` skill): A1 landing, then A3's panel styling.
- **A-backend**: A2 route + validation, A4 Stripe, `GET /api/meetings/[id]`.
- Run them in parallel; A-frontend owns `src/app/page.tsx` + `src/components/**`, A-backend owns the routes and `src/lib/stripe.ts`. Same ownership discipline one level down.

---

## 5. Track B — Bot, extraction, Jira, chat loop

Goal: spoken blocker becomes a real Jira ticket and a chat message, in under 5 seconds.

### B1 — Verify the three external APIs by hand, FIRST
Before any TypeScript. In order:

1. **Jira** — `curl` a real issue creation with basic auth. This is the most likely thing to break, because:
   - `description` must be ADF (Atlassian Document Format) on `/rest/api/3/issue`, and malformed ADF gives an unhelpful 400.
   - `issuetype: { name: 'Bug' }` must exist in that project (`Task` in some setups).
   - **`priority` is often not on the project's create screen** → 400 `Field 'priority' cannot be set`. If so, drop it from `fields` and put the priority in the summary prefix instead. Decide this now, not during the demo.
2. **Recall.ai** — create a bot against a real Meet/Zoom link you're hosting. Confirm the correct regional base URL, the real-time transcript webhook config shape, and the chat-send endpoint. Note the exact event names you receive; the PRD's `bot.transcription` / `bot.status_change` are guesses.
3. **OpenAI** — one structured-output call. See B3 for the strict-mode gotcha.

Write the working curl commands into `docs/api-notes.md` as you go. Future-you at hour 20 will need them.

### B2 — `src/lib/recall.ts`
Three functions, nothing more:
```ts
createBot(meetingUrl: string): Promise<{ bot_id: string }>
sendChatMessage(botId: string, text: string): Promise<void>
getBotDuration(botId: string): Promise<number>  // minutes, for billing
```
`createBot` registers the webhook at `${NEXT_PUBLIC_APP_URL}/api/webhooks/recall` with `RECALL_WEBHOOK_SECRET` as a query param or header. **You need a public URL** — start an ngrok/cloudflared tunnel early and set `NEXT_PUBLIC_APP_URL` to it. Localhost cannot receive webhooks. This bites people at hour 3.

### B3 — `src/lib/llm.ts` (⚠️ provider changed to DeepSeek — see §7)
Structured extraction per PRD §5.4, with one correction: **under `strict: true`, every property must be listed in `required`.** The PRD's schema lists only 4 of 6 and will fail. Make all six required and instruct the model to return `""` for unknown `reported_by` / `suggested_assignee`.

Feed the model the day's `async_updates` as context alongside the transcript segment, so it can attribute a blocker to someone who isn't in the room. That's the actual product thesis — don't drop it.

### B4 — `src/lib/extract.ts` — buffering and dedupe
The non-obvious core of this track. Naively calling OpenAI per transcript chunk means hundreds of calls and a pile of duplicate tickets for one spoken sentence.

- Append incoming chunks to `meetings.transcript_buffer`.
- Only call OpenAI when the buffer has ≥ ~200 chars **or** ~5s of silence has passed since the last chunk, then clear it.
- Before creating a ticket, compute a `dedupe_key` (lowercased, whitespace-collapsed summary is fine) and rely on the unique index from Phase 0 to swallow repeats.

```
// ponytail: char/time threshold + summary-string dedupe. Upgrade to
// speaker-turn segmentation + embedding similarity if it misfires in testing.
```

Leave a runnable self-check: one `src/lib/extract.test.ts` (or an `assert`-based script) that feeds a fake chunk sequence through the buffering logic and asserts exactly one extraction fires. This is branching logic on the demo's critical path — it gets a test.

### B5 — `POST /api/bot/dispatch`
Auth required. Validate with `zod`. Call `createBot`, insert the `meetings` row (`recall_bot_id`, `meeting_url`, `status: 'in_call'`, `stripe_customer_id`), return `DispatchResponse`.

### B6 — `POST /api/webhooks/recall`
1. Reject requests without the shared secret. **Trust boundary — this endpoint creates Jira tickets from its input; do not leave it open.**
2. Always return `200` fast. Recall retries on non-2xx and you do not want a retry storm mid-demo.
3. Transcript event → `extract.ts` → if `blocker_found`, `createJiraBlockerTicket()` → insert into `tickets` → `sendChatMessage(botId, "Pinico Alert: Technical blocker detected → DEV-104 https://...")`.
4. Bot-done / status event → compute duration, update `meetings` to `completed`, call A's `reportMeetingUsage()`.
5. Wrap Jira and OpenAI calls in try/catch that logs and continues. **One failed extraction must never kill the bot session.**

### Suggested subagent split for B
- **B-recall**: B1 (Recall + tunnel), B2, B5.
- **B-ai**: B1 (Jira + OpenAI curls), B3, B4, `src/lib/jira.ts`.
- Then one of them assembles B6 while the other tests end to end. B6 is the join point — single owner, no concurrent edits.

---

## 6. Integration checkpoint

When A3 and B6 are both claimed done, run this together, once, on a real meeting:

1. Two people submit async updates via the dashboard.
2. Dispatch the bot at a live Meet link. Bot appears in the call.
3. Say, out loud: *"I'm blocked because the Auth0 staging webhook is returning a 500 error."*
4. Within 5s: Jira ticket exists, link is in the meeting chat, card renders on the dashboard.
5. End the call. `meetings.status = completed`, duration set, Stripe usage event visible in the dashboard.
6. Say a second, different blocker → second ticket. Repeat the first blocker → **no** duplicate ticket.

Anything failing here outranks every remaining polish task on both tracks.

Then run it **three more times end to end** before demo time. Live API demos fail on the run you didn't rehearse.

---

## 7. Known-wrong things in the PRD

Fix these; don't copy them.

| PRD says | Reality |
|---|---|
| `pnpm add @openai/openai-api` | Package is `openai`. **Confirmed in Phase 0.** |
| OpenAI `gpt-4o` with strict `json_schema` structured outputs | **Provider is now DeepSeek** (`deepseek-v4-flash` via `https://api.deepseek.com`, still the `openai` SDK). DeepSeek rejects `json_schema`/`strict` — only `json_object` JSON mode exists. Schema enforcement is client-side zod in `parseBlockerResponse()`. The prompt's literal word "json" and its example object are required by DeepSeek; do not edit them out. |
| Auth0 v3 (`handleAuth`, `UserProvider`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_BASE_URL`) | Installed SDK is v4. Everything moves — see §1's "What Phase 0 actually built". **Confirmed in Phase 0.** |
| `tailwind.config.ts` exists | Tailwind 4 configures in CSS. No such file. **Confirmed in Phase 0.** |
| `pnpm create next-app pinico` in this repo | Fails: dir is `Pinico`, npm rejects capitals. Scaffolded in a temp lowercase dir and moved. **Already done.** |
| `https://api.recall.ai/api/v1/bot` | Recall hosts are region-specific (e.g. `us-west-2.recall.ai`). Verify. |
| §5.4 schema: 4 of 6 props in `required` | `strict: true` requires all of them. Will 400. |
| §5.5 Jira payload always includes `priority` | Frequently rejected — field not on the create screen. Have the fallback ready. |
| `bot.transcription`, `bot.status_change` | Event names are a guess. Read the actual docs. |
| Stripe `apiVersion: '2023-10-16'` | Stale. Omit it and let the SDK default. |
| "Stripe Metronome" as a product | Stripe Billing meters. Same pitch, real API. |

---

## 8. Deliberately not building

Say these are roadmap if asked; don't let anyone drift into them.

- **Auth0 RBAC (`Admin` vs `Developer`)** — no MVP feature branches on role. Add when there's a permission to enforce.
- **Supabase Realtime** — 2s polling for a 90-second demo.
- **ElevenLabs voice** — chat injection carries the demo. This is the headline roadmap item; pitch it, don't build it.
- **GitHub / Linear / Shortcut routing** — one tracker proves the pattern.
- **Slack digest** — nothing in the demo reads it.
- **Subscriptions, checkout, customer portal** — one meter event proves the billing model.
- **RLS policies** — server-only DB access, service role key, no client queries. Revisit before any real user.
- **Retries, queues, background workers** — the webhook handler does the work inline. Fine at demo scale.

---

## 9. Kickoff messages

Phase 0 is done — skip straight to A and B.

**To Agent A:**
> Read `HANDOFF.md` — all of it, including §1's "What Phase 0 actually built" (Auth0 v4, Tailwind 4, `getDb()`, no module-scope clients). You own Track A (§4). Respect the ownership table in §2 — never edit a Track B path. Ship `reportMeetingUsage()` in your first hour; Agent B is blocked on its signature. Build against the Phase 0 stub of `/api/bot/dispatch`; don't wait for B.

**To Agent B:**
> Read `HANDOFF.md` — all of it, including §1's "What Phase 0 actually built" (especially: construct OpenAI/Stripe/Recall clients inside functions, never at module scope, or you break the build). You own Track B (§5). You are the critical path — the demo is your track. Do §B1 (hand-verify all three APIs) before writing any TypeScript, and get a public tunnel running in the first 30 minutes. Respect the ownership table in §2.
