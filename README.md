# Pinico

Autonomous standup & AI blocker-to-Jira engine. Async updates in, an AI proxy bot
in your Zoom/Meet call, spoken blockers out as real Jira tickets.

**New agent?** Read [`HANDOFF.md`](./HANDOFF.md) first — it defines the two build
tracks, file ownership, and the frozen contracts between them.

## Stack

Next.js 16 (App Router, `src/`) · React 19 · Tailwind 4 · Auth0 SDK v4 ·
Supabase (Postgres) · DeepSeek (`deepseek-v4-flash`) · Recall.ai · Stripe Billing meters

## Run it

```bash
pnpm install
cp .env.example .env.local   # then fill it in — see below
pnpm dev
```

### Required setup

1. **Supabase** — create a project, run `supabase/schema.sql` in the SQL Editor,
   copy the project URL and **service role** key into `.env.local`.
2. **Auth0** — create a Regular Web Application. Set
   *Allowed Callback URLs* to `http://localhost:3000/auth/callback` and
   *Allowed Logout URLs* to `http://localhost:3000`. Generate `AUTH0_SECRET`
   with `openssl rand -hex 32`.
3. **Recall.ai / DeepSeek / Jira / Stripe** — keys per `.env.example`. Only
   needed once Track B starts; the app builds and runs without them.
4. **Jira** — see [Jira setup](#jira-setup) below.

## Jira setup

Four env vars. The token is a normal Atlassian API token used with Basic auth —
no OAuth app, no Jira app install.

**1. Get a project to write into.** In Jira, either use an existing project or
create one (*Projects → Create project → Scrum or Kanban*, team-managed is
fine). Note its **key** — the prefix on its issues, e.g. `DEV` in `DEV-104`.

```env
JIRA_HOST_NAME="your-domain.atlassian.net"   # no https://, no trailing slash
JIRA_PROJECT_KEY="DEV"
```

**2. Create an API token** at
<https://id.atlassian.com/manage-profile/security/api-tokens> → *Create API
token*. Give it any label and copy the value — it is shown once.

```env
JIRA_USER_EMAIL="you@example.com"   # the account that owns the token
JIRA_API_TOKEN="<paste>"
```

`JIRA_USER_EMAIL` must be the exact Atlassian account email for that token. A
mismatch gives a confusing `401` even though the token is valid. Tickets will be
created *as* this user.

**3. Pick the issue type that exists in your project.** This is the most common
cause of a `400` on first run: many projects have no `Bug` type.

```env
JIRA_ISSUE_TYPE="Task"
```

Check what's actually available with:

```bash
curl -s -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
  "https://$JIRA_HOST_NAME/rest/api/3/issue/createmeta?projectKeys=$JIRA_PROJECT_KEY&expand=projects.issuetypes.fields" \
  | grep -o '"name":"[^"]*"' | head -20
```

**4. Verify with one real ticket** before trusting the pipeline:

```bash
curl -s -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
  -X POST "https://$JIRA_HOST_NAME/rest/api/3/issue" \
  -H 'Content-Type: application/json' \
  -d '{"fields":{"project":{"key":"'"$JIRA_PROJECT_KEY"'"},"summary":"Pinico smoke test","issuetype":{"name":"'"$JIRA_ISSUE_TYPE"'"},"description":{"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"hello"}]}]}}}'
```

A `201` with `{"id":...,"key":"DEV-1",...}` means the pipeline will work. Delete
the test issue afterwards.

### Two gotchas already handled in `src/lib/jira.ts`

- **`description` must be ADF**, not a plain string — the `/rest/api/3/` API
  rejects strings. That's why the curl above nests `type: "doc"`.
- **`priority` is often not on a project's create screen**, which returns
  `400 Field 'priority' cannot be set`. The code retries once without it and
  folds the priority into the summary instead, so this self-heals.

Auth routes are mounted by `src/proxy.ts`, not by a route handler:
`/auth/login`, `/auth/logout`, `/auth/callback`.

> Webhooks need a public URL. Recall.ai cannot reach localhost — run a tunnel
> (`cloudflared tunnel --url http://localhost:3000`) and set `NEXT_PUBLIC_APP_URL`
> to it.

## Layout

```
src/lib/auth0.ts      Auth0 v4 client (shared, frozen)
src/lib/supabase.ts   service-role DB client, server-only (shared, frozen)
src/lib/profile.ts    session -> profiles row upsert (shared, frozen)
src/lib/types.ts      cross-track contracts (shared, frozen)
src/proxy.ts          mounts /auth/*, refreshes sessions (shared, frozen)
src/app/api/updates/          async standup updates      [Track A]
src/app/api/meetings/[id]/    dashboard polling          [Track A]
src/app/api/bot/dispatch/     send the bot to a call     [Track B]
src/app/api/webhooks/recall/  transcript -> Jira -> chat [Track B]
supabase/schema.sql   run once, by hand
```

Routes marked `PHASE 0 STUB` return correctly-shaped fake data so both tracks
can work in parallel. Their owning track replaces the body.

## Security notes

- RLS is **off**. All DB access is server-side with the service role key; there
  are no client-side queries. Revisit before real users.
- `/api/webhooks/recall` requires `?secret=$RECALL_WEBHOOK_SECRET`. It creates
  Jira tickets from its input — do not open it up.
