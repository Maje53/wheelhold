const BASE = 'https://api.squeekchain.com/v1';
const cache = new Map();

export async function apiGet(path, { signal } = {}) {
  const headers = { 'X-Request-Id': `wheelhold-${crypto.randomUUID()}` };
  const cached = cache.get(path);
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  const response = await fetch(`${BASE}${path}`, { headers, signal, cache: 'no-cache' });
  if (response.status === 304 && cached) return cached.data;
  if (response.status === 429 || response.status === 503) {
    const error = new Error(`API busy (${response.status})`);
    const requestedDelay = Number(response.headers.get('Retry-After'));
    error.retryAfter = Number.isFinite(requestedDelay) && requestedDelay > 0 ? Math.min(60, requestedDelay) : 5;
    throw error;
  }
  if (!response.ok) throw new Error(`Squeekchain API HTTP ${response.status}`);
  const data = await response.json();
  cache.set(path, { data, etag: response.headers.get('ETag') });
  return data;
}

export async function getSnapshot(signal) {
  const [status, core] = await Promise.all([apiGet('/status', { signal }), apiGet('/core', { signal })]);
  return { status, core };
}
