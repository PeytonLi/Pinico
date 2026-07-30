# API notes — LLM + Jira (Track B / B-ai)

No live credentials were available while writing these modules. Nothing below
was curled against a real account — it's confirmed against official docs and
the TypeScript types shipped in `node_modules/openai@7.2.0`. Whoever gets
credentials first should do the real `curl` HANDOFF.md §B1 asks for and update
this file.

---

## ⚠️ SUPERSEDED: the provider is now DeepSeek, not OpenAI

`src/lib/openai.ts` no longer exists. It is **`src/lib/llm.ts`**, calling
DeepSeek through the OpenAI-compatible endpoint (`https://api.deepseek.com`)
with the same `openai` npm SDK, model `deepseek-v4-flash`.

**The consequential difference:** DeepSeek does **not** support
`response_format: {type: 'json_schema', strict: true}` — it rejects it as
"unavailable now". Only JSON mode (`{type: 'json_object'}`) is available on the
stable endpoint. There is a strict-schema beta, but it constrains *tool-call
arguments* only and needs a separate beta base URL.

JSON mode guarantees syntactically valid JSON and **nothing about fields,
required keys, or enums**. So schema enforcement moved client-side into
`parseBlockerResponse()` in `llm.ts`, validated by zod and covered by
`src/lib/llm.test.ts`. Two requirements from DeepSeek's docs are load-bearing
in the prompt and must not be edited away: the literal word "json", and an
example of the desired object. Without them the API can return empty content.

Docs: https://api-docs.deepseek.com/guides/json_mode

The OpenAI section below is kept only as the record of what the strict-mode
request looked like, in case the provider is ever switched back.

---

## OpenAI — Structured Outputs (historical; file removed)

Docs: https://developers.openai.com/api/docs/guides/structured-outputs
Also verified directly against `node_modules/openai/resources/shared.d.ts`
(`ResponseFormatJSONSchema`) and `node_modules/openai/resources/chat/completions/completions.d.ts`
in this repo's installed `openai@7.2.0`.

**Confirmed request shape** (this is what `extractBlocker()` sends):

```jsonc
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "extracted_blocker",
      "strict": true,
      "schema": { /* JSON Schema */ }
    }
  }
}
```

Important: the installed SDK types (`ResponseFormatJSONSchema`) nest `name`,
`strict`, and `schema` **inside** a `json_schema` object under
`response_format` — not flat on `response_format` itself. A generic web
summary I pulled while researching this flattened them (that's the newer
Responses API's `text.format` shape, not Chat Completions' `response_format`).
Trust the installed package types over a general web search for this kind of
detail — confirmed by reading `completions.d.ts` line ~1831 and
`shared.d.ts` line ~212 directly.

**Strict mode requirements (confirmed in the docs and via the PRD's own
callout, §7):**
- Every property must appear in `required` — no optional fields. Fixed by
  making all 6 `ExtractedBlocker` fields required; the model is instructed
  to return `""` for unknown `reported_by`/`suggested_assignee` rather than
  omitting them.
- `additionalProperties: false` must be set on the schema object.
- Model support: `gpt-4o-2024-08-06` and later, `gpt-4o-mini`, and their
  fine-tunes. `gpt-4o` (used here per the task spec) resolves to a
  Structured-Outputs-capable snapshot as of this writing — **unverified
  without a live call**; if OpenAI ever re-points the `gpt-4o` alias to a
  pre-2024-08-06 snapshot, this would need pinning to `gpt-4o-2024-08-06`
  explicitly.
- Unsupported keywords under `strict: true` (e.g. `minLength`, `maxLength`,
  `allOf`, `not`) cause a 400. This schema avoids all of them — no string
  length constraints, no unions beyond the `priority` enum.

**Response parsing:** `completion.choices[0].message.content` is a JSON
string matching the schema; `JSON.parse` it. Not independently verified
live, but this is the standard, unchanged Chat Completions response shape
and matches the SDK's own types.

**Uncertain / needs a live call to confirm:**
- Whether OpenAI ever refuses (400) rather than complying when
  `blocker_found: false` but the prompt still asks for a `priority` enum
  value — the prompt tells the model to use `"Low"` in that case, but strict
  mode enforcing the enum could theoretically conflict with a model that
  wants to say "N/A". Not something the schema can express (enums can't have
  an empty-string option), so this is a prompt-engineering risk, not a
  schema bug.
- Real latency for a `gpt-4o` structured-output call — relevant to the "5
  second" demo budget in HANDOFF.md §6, but has never been measured here.

## Jira — Create issue (`src/lib/jira.ts`)

Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue/#api-rest-api-3-issue-post
(Atlassian's live doc page returned an empty body to automated fetching in
this environment; the shape below is cross-confirmed from Atlassian's own
ADF documentation plus multiple independent worked examples, including
Atlassian Community threads that quote the real request/response bodies.)

**Confirmed request shape:**

```jsonc
POST https://{JIRA_HOST_NAME}/rest/api/3/issue
Authorization: Basic base64(JIRA_USER_EMAIL:JIRA_API_TOKEN)
Content-Type: application/json
Accept: application/json

{
  "fields": {
    "project": { "key": "DEV" },
    "issuetype": { "name": "Task" },
    "summary": "[AUTOMATED BLOCKER] ...",
    "priority": { "name": "High" },
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "..." }]
        }
      ]
    }
  }
}
```

`project` can be `{ "key": "DEV" }` or `{ "id": "10001" }` — this repo uses
`key` since `.env.example` already carries `JIRA_PROJECT_KEY`.

**Confirmed success response (201):**

```json
{
  "id": "10008",
  "key": "DEV-104",
  "self": "https://your-domain.atlassian.net/rest/api/3/issue/10008"
}
```

`createJiraBlockerTicket()` returns exactly `{ id, key, self }` from this
body.

**Confirmed failure shape for the priority-not-on-screen case** (this is
the specific 400 HANDOFF.md §7 and §B1 warn about, and the one
`jira.ts` is built to self-heal from):

```json
{
  "errorMessages": [],
  "errors": {
    "priority": "Field 'priority' cannot be set. It is not on the appropriate screen, or unknown."
  }
}
```

`jira.ts` checks for `res.status === 400 && body.errors.priority` present,
and if so retries once with `priority` dropped from `fields` and the
priority folded into the summary prefix instead
(`[AUTOMATED BLOCKER][High] ...`). Any other 400 (bad ADF, unknown
`issuetype`, unknown project key, etc.) is NOT retried — it throws with the
full response body so the failure is visible instead of silently swallowed.

**Uncertain / needs a live call to confirm:**
- Whether `errors` is always a flat `{ fieldName: message }` map for every
  failure mode, or whether some 400s (e.g. malformed ADF) come back with a
  different shape (`errorMessages` populated, `errors` empty). The retry
  logic only special-cases `errors.priority` specifically, so a
  differently-shaped ADF error would correctly fall through to the generic
  throw rather than being misidentified — but this fallback path itself is
  unverified against a real malformed-ADF response.
- Whether the target Jira project's `issuetype` really is `Task` (the
  `.env.example` default) or something else — `JIRA_ISSUE_TYPE` is read from
  env specifically because this varies per project, per HANDOFF.md §7.
- Real Jira Cloud host region/URL format quirks (custom domains, Jira Data
  Center vs Cloud path differences) — this code assumes Jira Cloud's
  `/rest/api/3/` path exists at `https://{JIRA_HOST_NAME}`, which is standard
  for Cloud but would differ for Data Center installs.

## What's confirmed vs. not, at a glance

| Claim | Confidence |
|---|---|
| OpenAI `response_format.json_schema.{name,strict,schema}` nesting | High — read directly from installed SDK's `.d.ts` |
| Structured Outputs strict-mode rules (all-required, `additionalProperties: false`) | High — official docs |
| Jira create-issue request/response shape, ADF doc structure | High — official ADF spec + multiple independent confirmed examples |
| Jira `errors.priority` 400 body shape for the missing-screen-field case | Medium-high — multiple independent reports of the exact same message, not a live call against this specific Jira instance |
| `gpt-4o` alias currently resolving to a Structured-Outputs-capable snapshot | Unverified — no live call possible |
| Actual round-trip latency for either API | Unverified — no live call possible |
