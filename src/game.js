export const ACTIONS = {
  forage: { label: 'Forage', icon: '✦', description: 'Gather grain beyond the burrow.', risk: 'Balanced' },
  fortify: { label: 'Fortify', icon: '⌂', description: 'Brace the gates before nightfall.', risk: 'Safe' },
  explore: { label: 'Explore', icon: '⌁', description: 'Map a path into the blue wilds.', risk: 'Bold' },
  raid: { label: 'Raid', icon: '⚔', description: 'Strike the Hollowcat while the wheel turns.', risk: 'High risk' }
};

export const INITIAL_STATE = {
  season: 1,
  resolvedRounds: [],
  pendingAction: null,
  pendingRound: null,
  pendingSnapshot: null,
  resources: { grain: 34, timber: 18, glowseed: 3 },
  colony: { morale: 72, defense: 46, map: 12, boss: 100 },
  history: []
};

export function normalizeTelemetry(payload, now = Date.now()) {
  if (!payload || payload.status === 'unavailable') return { available: false, reason: payload?.reason || 'unavailable' };
  if (payload.schemaVersion !== 1) return { available: false, reason: 'unsupported_schema' };
  const measurement = payload.measurement || {};
  if (!payload.measurement) return { available: false, reason: 'no_measurement' };
  const anchor = payload.builder?.projected || payload.builder?.anchor || {};
  const observed = Date.parse(measurement.observedAt || payload.observedAt || '');
  const ageMs = Number.isFinite(observed) ? Math.max(0, now - observed) : null;
  const coreStatus = String(measurement.coreStatus || 'UNKNOWN').toUpperCase();
  const rpm = Number(measurement.rpmMilli ?? 0) / 1000;
  const lastClosedRound = payload.oracle?.latestClosure?.lastRound ?? payload.builder?.anchor?.settledThroughRound ?? null;
  let currentRound = null;
  try { if (lastClosedRound !== null) currentRound = (BigInt(lastClosedRound) + 1n).toString(); } catch { /* invalid API data */ }
  return {
    available: true,
    provenance: String(measurement.provenance || payload.provenance || 'unknown'),
    coreStatus,
    rpm: Number.isFinite(rpm) ? rpm : 0,
    speed: Number(measurement.speedMmPerSecond ?? 0),
    distance: String(measurement.distanceMm ?? '0'),
    cumulativeWorkUnits: String(measurement.cumulativeWorkUnits ?? '0'),
    counterEpoch: String(measurement.counterEpoch ?? ''),
    roundId: currentRound,
    lastClosedRound: lastClosedRound === null ? null : String(lastClosedRound),
    blockHeight: String(anchor.blockHeight ?? '—'),
    blockProgress: Math.min(1, Math.max(0, Number(anchor.blockProgress ?? 0) / 1e9)),
    observedAt: Number.isFinite(observed) ? new Date(observed).toISOString() : null,
    stale: measurement.freshness !== 'online' || ageMs === null || ageMs > Number(measurement.staleAfterSeconds ?? 120) * 1000,
    verified: measurement.provenance === 'hardware' && payload.oracle?.state === 'accepted' && payload.builder?.status === 'available',
    spinning: coreStatus === 'ACTIVE'
  };
}

export function normalizeCore(payload) {
  if (!payload || payload.status !== 'available') return { available: false, reason: payload?.reason || 'unavailable', rounds: [] };
  if (payload.schemaVersion !== 1) return { available: false, reason: 'unsupported_schema', rounds: [] };
  const rounds = (payload.events || []).filter(e => e.eventName === 'RoundRecorded').map(e => {
    const args = Object.fromEntries((e.arguments || []).map(a => [a.name, a.value]));
    return { roundId: String(args.roundId ?? ''), workUnits: String(args.work ?? ''), transactionHash: e.transactionHash || null, blockNumber: String(e.blockNumber ?? '') };
  }).filter(r => /^\d+$/.test(r.roundId) && /^\d+$/.test(r.workUnits));
  return { available: true, settledThroughRound: String(payload.core?.settledThroughRound ?? ''), blockHeight: String(payload.core?.blockHeight ?? ''), rounds };
}

export function settlementResult(core, pendingRound, maxBatchRounds = 16n) {
  if (!core?.available || !/^\d+$/.test(String(pendingRound)) || !/^\d+$/.test(String(core.settledThroughRound))) return null;
  const exact = core.rounds.find(r => r.roundId === String(pendingRound));
  if (exact) return exact;
  const settled = BigInt(core.settledThroughRound);
  const pending = BigInt(pendingRound);
  if (settled < pending) return null;
  if (settled - pending >= maxBatchRounds) return { expired: true, roundId: String(pendingRound) };
  return { roundId: String(pendingRound), workUnits: '0', transactionHash: null, blockNumber: null };
}

export function activityTier(result) {
  if (!result || !/^\d+$/.test(String(result.workUnits))) return 'unverified';
  const work = BigInt(result.workUnits);
  if (work === 0n) return 'rest';
  if (work < 500n) return 'jog';
  return 'zoom';
}

const clamp = (n, min = 0, max = 999) => Math.min(max, Math.max(min, n));

export function resolveRound(state, actionId, roundResult) {
  if (!ACTIONS[actionId]) throw new Error('Unknown action');
  const roundId = roundResult?.roundId;
  if (!roundId || state.resolvedRounds.includes(roundId)) return state;
  const tier = activityTier(roundResult);
  if (tier === 'unverified') return state;

  const next = structuredClone(state);
  const boost = tier === 'zoom' ? 2 : tier === 'jog' ? 1 : 0;
  const r = next.resources;
  const c = next.colony;
  let result = '';

  if (actionId === 'forage') {
    const gain = 5 + boost * 4;
    r.grain += gain; c.morale = clamp(c.morale + 2 + boost, 0, 100);
    result = `Foragers returned with ${gain} grain.`;
  } else if (actionId === 'fortify') {
    const gain = 4 + boost * 3;
    r.timber = clamp(r.timber - 2); c.defense = clamp(c.defense + gain, 0, 100);
    result = `The gate gained ${gain} defense.`;
  } else if (actionId === 'explore') {
    const gain = 2 + boost * 4;
    c.map = clamp(c.map + gain, 0, 100); r.glowseed += boost;
    result = `Scouts charted ${gain}% of the blue wilds.`;
  } else {
    const damage = tier === 'rest' ? 2 : 6 + boost * 6;
    c.boss = clamp(c.boss - damage, 0, 100); c.morale = clamp(c.morale + (boost ? 3 : -4), 0, 100);
    result = `The Hollowcat took ${damage} damage.`;
  }

  next.resolvedRounds.push(roundId);
  next.resolvedRounds = next.resolvedRounds.slice(-100);
  next.pendingAction = null;
  next.pendingRound = null;
  next.pendingSnapshot = null;
  next.history.unshift({ roundId, actionId, tier, workUnits: roundResult.workUnits, transactionHash: roundResult.transactionHash || null, result, at: new Date().toISOString() });
  next.history = next.history.slice(0, 12);
  return next;
}

export function trainingTelemetry(seed = Date.now()) {
  const phase = Math.floor(seed / 10000) % 3;
  return {
    available: true, provenance: 'training-simulation', verified: false, stale: false,
    coreStatus: phase === 0 ? 'IDLE' : 'ACTIVE', rpm: phase === 0 ? 0 : phase === 1 ? 5.4 : 12.8,
    speed: phase * 41, distance: 'training', roundId: `training-${Math.floor(seed / 600000)}`,
    blockHeight: '—', blockProgress: (seed % 600000) / 600000, observedAt: new Date(seed).toISOString(), spinning: phase > 0
  };
}
