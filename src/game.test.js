import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STATE, activityTier, confirmedZeroRange, normalizeCore, normalizeTelemetry, resolveRound, settlementResult } from './game.js';

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
});

test('extracts exact work from confirmed RoundRecorded events', () => {
  const core = normalizeCore({ schemaVersion: 1, status: 'available', core: { settledThroughRound: '346', blockHeight: '2366' }, events: [{ eventName: 'RoundRecorded', transactionHash: '0xabc', blockNumber: '12', arguments: [{ name: 'roundId', value: '346' }, { name: 'work', value: '609' }] }] });
  assert.deepEqual(core.rounds[0], { roundId: '346', workUnits: '609', transactionHash: '0xabc', blockNumber: '12' });
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
  const status = { settlementQueue: { latestSubmission: { lifecycle: 'confirmed', previousSettledThroughRound: '348', settledThroughRound: '350', activeRoundCount: '0', transactionHash: '0xzero' } } };
  const zeroRange = confirmedZeroRange(status);
  assert.deepEqual(zeroRange, { fromRound: '349', toRound: '350', transactionHash: '0xzero' });
  assert.equal(settlementResult(core, '350', zeroRange).workUnits, '0');
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
