import test from 'node:test';
import assert from 'node:assert/strict';
import { apiGet } from './api.js';

test('rate-limit responses use a bounded, safe retry delay', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      status: 429,
      ok: false,
      headers: { get: name => name === 'Retry-After' ? 'not-a-number' : null }
    });
    await assert.rejects(apiGet('/rate-limit-audit'), error => error.retryAfter === 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
