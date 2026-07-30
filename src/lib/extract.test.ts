import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ponytail: tsconfig.json (not mine to touch) uses moduleResolution
// "bundler", so every import in this project is written extensionless
// (`from './extract'`), which webpack/turbopack resolve fine. Node's native
// TS runner has no bundler and refuses to guess extensions on relative
// specifiers — it only resolves `./extract.ts` literally, which in turn
// makes tsc fail with TS5097 unless `allowImportingTsExtensions` is set
// (a tsconfig.json change outside this file's ownership). This loader hook
// resolves that tension without touching tsconfig.json or any other file:
// it's a `node:module` resolve hook, registered from a data: URL so no new
// file is needed, that retries an extensionless relative specifier with
// `.ts` appended. Ceiling: only intercepts extensionless relative imports;
// upgrade to `allowImportingTsExtensions` + real `.ts` specifiers everywhere
// once tsconfig.json is under one team's control.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && !specifier.match(/\\.[a-z]+$/i)) {
      return nextResolve(specifier + '.ts', context);
    }
    throw err;
  }
}
`),
  import.meta.url
);

const { shouldFlush, dedupeKey } = await import('./extract');

test('shouldFlush: short buffer + recent chunk -> false', () => {
  const lastChunkAt = new Date('2026-01-01T00:00:04.000Z');
  const now = new Date('2026-01-01T00:00:05.000Z'); // 1s gap
  assert.equal(shouldFlush('we are blocked on something', lastChunkAt, now), false);
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
