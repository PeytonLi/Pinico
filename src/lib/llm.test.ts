import { test } from 'node:test';
import assert from 'node:assert/strict';

// Literal `.ts` specifier: Node's native TS runner does no extension guessing.
import { parseBlockerResponse } from './llm.ts';

// DeepSeek's JSON mode guarantees valid JSON syntax and nothing else — no
// required fields, no enum enforcement. This parser is the only thing standing
// between a hallucinated reply and a bogus Jira ticket, so it gets the test.

const good = JSON.stringify({
  blocker_found: true,
  summary: 'Auth0 staging webhook returning 500',
  description: 'Blocking end-to-end login tests.',
  reported_by: 'Priya',
  suggested_assignee: 'Devon',
  priority: 'High',
});

test('accepts a well-formed blocker', () => {
  const r = parseBlockerResponse(good);
  assert.equal(r?.blocker_found, true);
  assert.equal(r?.summary, 'Auth0 staging webhook returning 500');
  assert.equal(r?.priority, 'High');
});

test('strips markdown fences the model was told not to emit', () => {
  const r = parseBlockerResponse('```json\n' + good + '\n```');
  assert.equal(r?.blocker_found, true);
  assert.equal(r?.priority, 'High');
});

test('no blocker -> normalized empty result', () => {
  const r = parseBlockerResponse('{"blocker_found": false}');
  assert.equal(r?.blocker_found, false);
  assert.equal(r?.summary, '');
  assert.equal(r?.priority, 'Low');
});

test('hallucinated priority falls back to Medium, keeps the blocker', () => {
  const r = parseBlockerResponse(
    '{"blocker_found": true, "summary": "db down", "priority": "SUPER URGENT"}'
  );
  assert.equal(r?.blocker_found, true);
  assert.equal(r?.priority, 'Medium');
});

test('blocker_found true but empty summary -> no ticket', () => {
  // Would otherwise file "[AUTOMATED BLOCKER] " with an empty title.
  const r = parseBlockerResponse('{"blocker_found": true, "summary": "   "}');
  assert.equal(r?.blocker_found, false);
});

test('unusable replies -> null so the caller can no-op', () => {
  assert.equal(parseBlockerResponse(''), null);
  assert.equal(parseBlockerResponse('I could not find a blocker.'), null);
  assert.equal(parseBlockerResponse('{"summary": "missing the boolean"}'), null);
  assert.equal(parseBlockerResponse('{"blocker_found": "yes"}'), null);
});
