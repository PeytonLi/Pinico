/**
 * Agent self-check. Owned by Track B per HANDOFF-V2.md §5/B5.
 *
 * Tests the pure decision logic: history management, dedupe key generation,
 * and agent pipeline structure. External APIs (LLM, TTS, Recall) are mocked
 * or skipped — this test verifies the wiring, not the API accounts.
 *
 * Run: node --test src/lib/agent.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

// Pure utilities from buffer.ts — testable without any mocks
// Literal `.ts` specifiers: Node's native TS runner does no extension guessing.
import { dedupeKey, shouldFlush } from './buffer.ts';

// History management from agent.ts
import { loadHistory, appendHistory } from './history.ts';

describe('dedupeKey', () => {
  it('normalizes whitespace', () => {
    const k1 = dedupeKey('Auth0  staging   webhook');
    const k2 = dedupeKey('auth0 staging webhook');
    assert.strictEqual(k1, k2);
  });

  it('lowercases', () => {
    assert.strictEqual(dedupeKey('PAYMENTS DOWN'), 'payments down');
  });

  it('trims', () => {
    assert.strictEqual(dedupeKey('  blocked on ci  '), 'blocked on ci');
  });
});

describe('shouldFlush', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('flushes when buffer >= 200 chars', () => {
    assert.ok(shouldFlush('x'.repeat(200), null, now));
  });

  it('does not flush when buffer is short and no last_chunk_at', () => {
    assert.strictEqual(shouldFlush('short', null, now), false);
  });

  it('does not flush when buffer is empty', () => {
    assert.strictEqual(shouldFlush('', new Date('2026-01-01T11:00:00Z'), now), false);
  });

  it('flushes after 5s silence', () => {
    const lastChunk = new Date('2026-01-01T11:59:54Z'); // 6 seconds ago
    assert.ok(shouldFlush('a few words', lastChunk, now));
  });

  it('does not flush within 5s silence', () => {
    const lastChunk = new Date('2026-01-01T11:59:57Z'); // 3 seconds ago
    assert.strictEqual(shouldFlush('a few words', lastChunk, now), false);
  });
});

describe('conversation history', () => {
  const meetingId = 'test-meeting-' + Date.now();

  it('starts empty', () => {
    const h = loadHistory(meetingId);
    assert.deepStrictEqual(h, []);
  });

  it('appends turns', () => {
    appendHistory(meetingId, {
      speaker: 'Alice',
      text: 'Hey how is the payments work going?',
      timestamp: new Date().toISOString(),
    });
    const h = loadHistory(meetingId);
    assert.strictEqual(h.length, 1);
    assert.strictEqual(h[0].speaker, 'Alice');
  });

  it('caps at 10 entries (sliding window)', () => {
    const mid = 'cap-test-' + Date.now();
    for (let i = 0; i < 15; i++) {
      appendHistory(mid, {
        speaker: `User${i}`,
        text: `Message ${i}`,
        timestamp: new Date().toISOString(),
      });
    }
    const h = loadHistory(mid);
    assert.strictEqual(h.length, 10);
    assert.strictEqual(h[0].speaker, 'User5'); // first 5 were dropped
    assert.strictEqual(h[9].speaker, 'User14');
  });

  it('different meetings are isolated', () => {
    const a = 'iso-a-' + Date.now();
    const b = 'iso-b-' + Date.now();
    appendHistory(a, { speaker: 'X', text: 'hi', timestamp: new Date().toISOString() });
    assert.strictEqual(loadHistory(b).length, 0);
    assert.strictEqual(loadHistory(a).length, 1);
  });
});

describe('bluffer shape', () => {
  it('dedupeKey returns a string', () => {
    assert.strictEqual(typeof dedupeKey('test'), 'string');
  });

  it('shouldFlush returns boolean', () => {
    assert.strictEqual(typeof shouldFlush('test', null, new Date()), 'boolean');
  });
});
