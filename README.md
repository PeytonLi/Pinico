# Pinico

Autonomous standup & AI blocker-to-Jira engine. Async updates in, an AI proxy bot
in your Zoom/Meet call, spoken blockers out as real Jira tickets.

**New agent?** Read [`HANDOFF.md`](./HANDOFF.md) first — it defines the two build
tracks, file ownership, and the frozen contracts between them.

## Stack

Next.js 16 (App Router, `src/`) · React 19 · Tailwind 4 · Auth0 SDK v4 ·
Supabase (Postgres) · OpenAI structured outputs · Recall.ai · Stripe Billing meters

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
3. **Recall.ai / OpenAI / Jira / Stripe** — keys per `.env.example`. Only needed
   once Track B starts; the app builds and runs without them.

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
