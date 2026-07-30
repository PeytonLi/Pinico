import { test } from 'node:test';
import assert from 'node:assert/strict';

// Literal `.ts` specifier: Node's native TS runner does no extension guessing.
// Enabled by "allowImportingTsExtensions" in tsconfig.json.
import { shouldFlush, dedupeKey } from './buffer.ts';

// Covers the buffering decision that stands between Recall's continuous
// transcript stream and hundreds of redundant OpenAI calls / duplicate tickets.

// REGRESSION: this is the bug that made the agent silent in a live meeting.
// One finalized utterance arrived, buffered 33 chars, and nothing else ever
// came — so shouldFlush was never re-evaluated and the buffer sat forever.
// A finalized utterance must flush on its own, with no prior chunk and no timer.
test('shouldFlush: single finalized utterance, no prior chunk -> true', () => {
  assert.equal(shouldFlush(' Like, yeah. Okay, well, we have.', null, new Date()), true);
});

test('shouldFlush: a real utterance flushes immediately, not after a pause', () => {
  const lastChunkAt = new Date('2026-01-01T00:00:04.000Z');
  const now = new Date('2026-01-01T00:00:05.000Z'); // only 1s gap
  assert.equal(shouldFlush('we are blocked on something', lastChunkAt, now), true);
});

test('shouldFlush: sub-utterance fragment alone -> false (waits for more)', () => {
  assert.equal(shouldFlush('yeah', null, new Date()), false);
});

test('shouldFlush: buffer >= 200 chars -> true', () => {
  const lastChunkAt = new Date('2026-01-01T00:00:04.000Z');
  const now = new Date('2026-01-01T00:00:04.500Z'); // barely any gap
  assert.equal(shouldFlush('x'.repeat(200), lastChunkAt, now), true);
});

test('shouldFlush: short buffer + 6s pause -> true', () => {
  const lastChunkAt = new Date('2026-01-01T00:00:00.000Z');
  const now = new Date('2026-01-01T00:00:06.000Z'); // 6s gap
  assert.equal(shouldFlush('short blocker text', lastChunkAt, now), true);
});

test('shouldFlush: empty buffer + long pause -> false', () => {
  const lastChunkAt = new Date('2026-01-01T00:00:00.000Z');
  const now = new Date('2026-01-01T00:05:00.000Z'); // 5 minutes, but buffer empty
  assert.equal(shouldFlush('', lastChunkAt, now), false);
});

test('shouldFlush: empty buffer + no prior chunk -> false', () => {
  assert.equal(shouldFlush('', null, new Date()), false);
});

test('dedupeKey: normalizes case and whitespace', () => {
  assert.equal(dedupeKey('  Auth0   Staging  Webhook   Is Down '), 'auth0 staging webhook is down');
  assert.equal(dedupeKey('AUTH0 STAGING WEBHOOK IS DOWN'), 'auth0 staging webhook is down');
  assert.equal(dedupeKey('auth0 staging webhook is down'), 'auth0 staging webhook is down');
});
