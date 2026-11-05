import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STATE, activityTier, canLockRound, confirmedZeroRange, hydrateState, normalizeCore, normalizeTelemetry, resolveRound, settlementResult, telemetryPresentation } from './game.js';

const statusFixture = {
  schemaVersion: 1,
  measurement: { freshness: 'online', staleAfterSeconds: 120, coreStatus: 'ACTIVE', rpmMilli: 12500, distanceMm: 3455808, cumulativeWorkUnits: '99999999999999999999', counterEpoch: 'epoch-1', observedAt: '2026-11-04T10:00:00Z', provenance: 'hardware' },
  builder: { status: 'available', anchor: { blockHeight: '44', blockProgress: '500000000', settledThroughRound: '346' }, projected: { blockHeight: '45', blockProgress: '600000000' } },
  oracle: { state: 'accepted', latestClosure: { lastRound: '346' } }
};

test('normalizes the documented status v1 schema and preserves big integers', () => {
  const t = normalizeTelemetry(statusFixture, Date.parse('2026-11-04T10:00:30Z'));
  assert.equal(t.rpm, 12.5); assert.equal(t.cumulativeWorkUnits, '99999999999999999999'); assert.equal(t.blockProgress, .6);
  assert.equal(t.roundId, '347'); assert.equal(t.spinning, true); assert.equal(t.verified, true);
});

test('rejects unsupported, stale and simulated telemetry', () => {
  assert.equal(normalizeTelemetry({ ...statusFixture, schemaVersion: 2 }).available, false);
  const simulated = structuredClone(statusFixture); simulated.measurement.provenance = 'simulated';
  assert.equal(normalizeTelemetry(simulated, Date.parse('2026-11-04T10:00:30Z')).verified, false);
  assert.equal(normalizeTelemetry(statusFixture, Date.parse('2026-11-04T10:03:00Z')).stale, true);
  const malformed = structuredClone(statusFixture); malformed.measurement.staleAfterSeconds = 'not-a-number';
  assert.equal(normalizeTelemetry(malformed, Date.parse('2026-11-04T10:02:00Z')).stale, true);
});

test('never presents simulated or unverified readings as live hardware', () => {
  const t = normalizeTelemetry({ ...statusFixture, measurement: { ...statusFixture.measurement, provenance: 'simulated' } }, Date.parse('2026-11-04T10:00:30Z'));
  const display = telemetryPresentation('live', t);
  assert.deepEqual(display, { trusted: false, fresh: false, animate: false, state: 'UNVERIFIED', speedLabel: 'OBSERVED SPEED' });
  const stale = telemetryPresentation('live', { ...t, verified: true, stale: true, staleAt: 0 });
  assert.deepEqual(stale, { trusted: true, fresh: false, animate: false, state: 'SIGNAL STALE', speedLabel: 'LAST VERIFIED SPEED' });
});

test('lock eligibility fails closed for stale, invalid and already resolved rounds', () => {
  const base = { verified: true, stale: false, staleAt: 2000, roundId: '347' };
  assert.equal(canLockRound('live', base, [], 1999).ok, true);
  assert.equal(canLockRound('live', base, [], 2000).reason, 'stale');
  assert.equal(canLockRound('live', { ...base, roundId: null }, [], 1000).reason, 'round');
  assert.equal(canLockRound('live', base, ['347'], 1000).reason, 'resolved');
  assert.equal(canLockRound('training', base, [], 1000).reason, 'unverified');
});

test('extracts exact work from confirmed RoundRecorded events', () => {
  const hash = `0x${'a'.repeat(64)}`;
  const core = normalizeCore({ schemaVersion: 1, status: 'available', core: { settledThroughRound: '346', blockHeight: '2366' }, events: [{ eventName: 'RoundRecorded', transactionHash: hash, blockNumber: '12', arguments: [{ name: 'roundId', value: '346' }, { name: 'work', value: '609' }] }] });
  assert.deepEqual(core.rounds[0], { roundId: '346', workUnits: '609', transactionHash: hash, blockNumber: '12' });
});

test('repairs legacy state invariants and normalizes numeric round IDs', () => {
  const repaired = hydrateState({ resolvedRounds: [346, '346', 'bad'], pendingRound: '347', resources: { grain: 1e9 }, history: [{ actionId: 'raid', roundId: '346', tier: '<script>', workUnits: '1', result: '<img>' }] });
  assert.deepEqual(repaired.resolvedRounds, ['346']);
  assert.equal(repaired.pendingRound, null);
  assert.equal(repaired.resources.grain, 999);
  assert.deepEqual(repaired.history, []);
  const valid = hydrateState({ pendingAction: 'forage', pendingRound: 347 });
  assert.equal(valid.pendingRound, '347');
});

test('uses deterministic work tiers at boundaries', () => {
  assert.equal(activityTier({ workUnits: '0' }), 'rest'); assert.equal(activityTier({ workUnits: '1' }), 'jog');
  assert.equal(activityTier({ workUnits: '499' }), 'jog'); assert.equal(activityTier({ workUnits: '500' }), 'zoom');
  assert.equal(activityTier({ workUnits: '-1' }), 'unverified');
});

test('requires affirmative batch evidence before treating a missing RoundRecorded event as zero', () => {
  const core = { available: true, settledThroughRound: '350', rounds: [] };
  assert.equal(settlementResult(core, '350').expired, true);
  assert.equal(settlementResult(core, '351'), null);
  const hash = `0x${'b'.repeat(64)}`;
  const status = { settlementQueue: { latestSubmission: { lifecycle: 'confirmed', previousSettledThroughRound: '348', settledThroughRound: '350', activeRoundCount: '1', transactionHash: hash } } };
  const zeroRange = confirmedZeroRange(status);
  assert.deepEqual(zeroRange, { fromRound: '349', toRound: '350', transactionHash: hash });
  assert.equal(settlementResult(core, '350', zeroRange).workUnits, '0');
  const mixedCore = { ...core, rounds: [{ roundId: '349', workUnits: '12', transactionHash: hash }] };
  assert.equal(settlementResult(mixedCore, '349', zeroRange).workUnits, '12');
  assert.equal(settlementResult(core, '350', { fromRound: 'bad', toRound: '350' }).expired, true);
  assert.equal(confirmedZeroRange({ settlementQueue: { latestSubmission: { lifecycle: 'pending', previousSettledThroughRound: '348', settledThroughRound: '350' } } }), null);
});

test('resolves only a confirmed round and cannot score it twice', () => {
  const result = { roundId: '347', workUnits: '609', transactionHash: '0xproof' };
  const once = resolveRound(INITIAL_STATE, 'forage', result);
  assert.equal(once.resources.grain, 47); assert.equal(once.history[0].transactionHash, '0xproof');
  assert.deepEqual(resolveRound(once, 'raid', result), once);
});

test('all actions keep bounded colony state', () => {
  for (const action of ['forage', 'fortify', 'explore', 'raid']) {
    const state = structuredClone(INITIAL_STATE); state.colony.morale = action === 'raid' ? 0 : 100;
    const next = resolveRound(state, action, { roundId: action, workUnits: action === 'raid' ? '0' : '999' });
    for (const value of Object.values(next.colony)) assert.ok(value >= 0 && value <= 100);
    for (const value of Object.values(next.resources)) assert.ok(value >= 0);
  }
});
