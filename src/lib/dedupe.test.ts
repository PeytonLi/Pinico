import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findDuplicate, similarity, DUPLICATE_THRESHOLD } from './dedupe.ts';

// The real tickets that slipped through exact-string dedupe (KAN-5/6/7).
const FILED = [
  'Recall.ai Output Audio duration limits unknown',
  'Auth0 staging webhook returning 500',
];

test('catches the real-world near-duplicates that got filed 3x', () => {
  // Differed only by "limit" vs "limits" — exact matching missed this.
  assert.ok(findDuplicate('Recall.ai output audio duration limit unknown', FILED));
  assert.ok(findDuplicate('Recall.ai Output Audio duration cap unknown', FILED) !== null);
  // Restated in a standup the next day, different phrasing.
  assert.ok(
    findDuplicate('Still blocked on the Recall output audio duration limit', FILED) !== null
  );
});

test('a genuinely different blocker is NOT suppressed', () => {
  assert.equal(findDuplicate('Stripe webhook signature verification failing', FILED), null);
  assert.equal(findDuplicate('Supabase connection pool exhausted in staging', FILED), null);
});

test('two distinct blockers about the same service stay distinct', () => {
  // Both mention Auth0 but are different problems — must not collapse.
  assert.equal(
    findDuplicate('Auth0 rate limiting our token refresh calls', [
      'Auth0 staging webhook returning 500',
    ]),
    null
  );
});

test('identical summary is always a duplicate', () => {
  assert.equal(findDuplicate(FILED[0], FILED), FILED[0]);
});

test('empty / no history cases', () => {
  assert.equal(findDuplicate('anything at all here', []), null);
  assert.equal(findDuplicate('', FILED), null);
});

test('similarity is bounded and ordered sensibly', () => {
  const same = similarity('Auth0 staging webhook returning 500', 'Auth0 staging webhook 500 error');
  const diff = similarity('Auth0 staging webhook returning 500', 'Stripe meter events rejected');
  assert.ok(same > diff);
  assert.ok(same >= DUPLICATE_THRESHOLD);
  assert.ok(diff < DUPLICATE_THRESHOLD);
  assert.ok(same <= 1);
});
