export const ACTIONS = {
  forage: { label: 'Forage', icon: '✦', description: 'Gather grain beyond the burrow.', risk: 'Balanced' },
  fortify: { label: 'Fortify', icon: '⌂', description: 'Brace the gates before nightfall.', risk: 'Safe' },
  explore: { label: 'Explore', icon: '⌁', description: 'Map a path into the blue wilds.', risk: 'Bold' },
  raid: { label: 'Raid', icon: '⚔', description: 'Strike the Hollowcat while the wheel turns.', risk: 'High risk' }
};

export const INITIAL_STATE = {
  season: 1,
  turnsPlayed: 0,
  resolvedRounds: [],
  pendingAction: null,
  pendingRound: null,
  pendingSnapshot: null,
  resources: { grain: 34, timber: 18, glowseed: 3 },
  colony: { morale: 72, defense: 46, map: 12, boss: 100 },
  history: []
};

export function hydrateState(stored) {
  const next = structuredClone(INITIAL_STATE);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return next;
  if (Array.isArray(stored.resolvedRounds)) {
    next.resolvedRounds = [...new Set(stored.resolvedRounds.map(String).filter(v => /^\d+$/.test(v)))].slice(-100);
  }
  if (ACTIONS[stored.pendingAction]) next.pendingAction = stored.pendingAction;
  const pendingRound = String(stored.pendingRound ?? '');
  if (next.pendingAction && /^\d+$/.test(pendingRound) && !next.resolvedRounds.includes(pendingRound)) next.pendingRound = pendingRound;
  if (stored.resources && typeof stored.resources === 'object') {
    for (const k of Object.keys(next.resources)) if (Number.isFinite(stored.resources[k])) next.resources[k] = clamp(stored.resources[k]);
  }
  if (stored.colony && typeof stored.colony === 'object') {
    for (const k of Object.keys(next.colony)) if (Number.isFinite(stored.colony[k])) next.colony[k] = clamp(stored.colony[k], 0, 100);
  }
  if (Array.isArray(stored.history)) {
    next.history = stored.history.flatMap(h => {
      if (!h || !ACTIONS[h.actionId] || !/^\d+$/.test(String(h.roundId)) || !/^(rest|jog|zoom)$/.test(String(h.tier)) || !/^\d+$/.test(String(h.workUnits))) return [];
      const transactionHash = /^0x[0-9a-f]{64}$/i.test(String(h.transactionHash)) ? String(h.transactionHash) : null;
      return [{ roundId: String(h.roundId), actionId: h.actionId, tier: h.tier, workUnits: String(h.workUnits), transactionHash, result: String(h.result || '').slice(0, 180), at: String(h.at || '') }];
    }).slice(0, 12);
  }
  next.resolvedRounds = [...new Set([...next.resolvedRounds, ...next.history.map(h => h.roundId)])].slice(-100);
  const storedTurns = Number.isSafeInteger(stored.turnsPlayed) && stored.turnsPlayed >= 0 ? stored.turnsPlayed : 0;
  next.turnsPlayed = Math.max(storedTurns, next.resolvedRounds.length, next.history.length);
  return next;
}

export function normalizeTelemetry(payload, now = Date.now()) {
  if (!payload || payload.status === 'unavailable') return { available: false, reason: payload?.reason || 'unavailable' };
  if (payload.schemaVersion !== 1) return { available: false, reason: 'unsupported_schema' };
  const measurement = payload.measurement || {};
  if (!payload.measurement) return { available: false, reason: 'no_measurement' };
  const anchor = payload.builder?.projected || payload.builder?.anchor || {};
  const observed = Date.parse(measurement.observedAt || payload.observedAt || '');
  const ageMs = Number.isFinite(observed) ? now - observed : null;
  const configuredFreshness = Number(measurement.staleAfterSeconds);
  const staleAfterSeconds = Number.isFinite(configuredFreshness) && configuredFreshness > 0 ? configuredFreshness : 120;
  const coreStatus = String(measurement.coreStatus || 'UNKNOWN').toUpperCase();
  const queue = payload.settlementQueue || {};
  const settlementReady = queue.status === 'available' && queue.settlementEnabled === true && queue.incidentOpen === false && !['disabled', 'blocked', 'stale'].includes(queue.state);
  const rpm = Number(measurement.rpmMilli ?? 0) / 1000;
  const lastClosedRound = payload.oracle?.latestClosure?.lastRound ?? null;
  let currentRound = null;
  try { if (lastClosedRound !== null) currentRound = (BigInt(lastClosedRound) + 1n).toString(); } catch { /* invalid API data */ }
  return {
    available: true,
    installationId: String(payload.installationId || ''),
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
    staleAt: Number.isFinite(observed) ? observed + staleAfterSeconds * 1000 : 0,
    stale: measurement.freshness !== 'online' || ageMs === null || ageMs < -30000 || ageMs >= staleAfterSeconds * 1000,
    verified: measurement.provenance === 'hardware' && payload.oracle?.state === 'accepted' && payload.builder?.status === 'available' && (coreStatus === 'IDLE' || coreStatus === 'ACTIVE'),
    settlementReady,
    settlementReason: settlementReady ? null : String(queue.blockedReason || queue.reason || queue.state || 'unavailable'),
    spinning: coreStatus === 'ACTIVE'
  };
}

export function telemetryPresentation(mode, telemetry) {
  const trusted = mode === 'live' && telemetry?.verified === true;
  const fresh = trusted && telemetry?.stale === false && Number.isFinite(telemetry?.staleAt) && Date.now() < telemetry.staleAt;
  return {
    trusted,
    fresh,
    animate: fresh && telemetry.spinning === true,
    state: !trusted ? 'UNVERIFIED' : fresh ? (telemetry.spinning ? 'RUNNING' : 'RESTING') : 'SIGNAL STALE',
    speedLabel: !trusted ? 'OBSERVED SPEED' : fresh ? 'LIVE SPEED' : 'LAST VERIFIED SPEED'
  };
}

export function canLockRound(mode, telemetry, resolvedRounds = [], now = Date.now()) {
  if (mode !== 'live' || !telemetry?.verified) return { ok: false, reason: 'unverified' };
  if (telemetry.stale || !Number.isFinite(telemetry.staleAt) || now >= telemetry.staleAt) return { ok: false, reason: 'stale' };
  if (telemetry.settlementReady !== true) return { ok: false, reason: 'settlement' };
  if (!/^\d+$/.test(String(telemetry.roundId || ''))) return { ok: false, reason: 'round' };
  if (!Number.isFinite(telemetry.roundEndsAt) || now >= telemetry.roundEndsAt) return { ok: false, reason: 'round' };
  if (resolvedRounds.includes(String(telemetry.roundId))) return { ok: false, reason: 'resolved' };
  return { ok: true };
}

export function snapshotCompatibility(telemetry, core) {
  if (!telemetry?.installationId || telemetry.installationId !== core?.installationId) return { ok: false, reason: 'deployment_mismatch' };
  if (core.chainTarget !== 'sepolia' || core.chainId !== '11155111') return { ok: false, reason: 'unexpected_chain' };
  return { ok: true };
}

export function currentRoundWindow(core, now = Date.now()) {
  const genesis = String(core?.genesisTimestamp ?? '');
  const duration = String(core?.roundDuration ?? '');
  if (!/^\d+$/.test(genesis) || !/^\d+$/.test(duration) || BigInt(duration) === 0n || !Number.isFinite(now) || now < 0) return null;
  const nowSeconds = BigInt(Math.floor(now / 1000));
  const genesisSeconds = BigInt(genesis);
  const durationSeconds = BigInt(duration);
  if (nowSeconds < genesisSeconds) return null;
  const roundId = ((nowSeconds - genesisSeconds) / durationSeconds) + 1n;
  const endsAtSeconds = genesisSeconds + roundId * durationSeconds;
  const endsAt = Number(endsAtSeconds * 1000n);
  if (!Number.isSafeInteger(endsAt)) return null;
  return { roundId: roundId.toString(), endsAt };
}

export function normalizeCore(payload) {
  if (!payload || payload.status !== 'available') return { available: false, reason: payload?.reason || 'unavailable', rounds: [] };
  if (payload.schemaVersion !== 1) return { available: false, reason: 'unsupported_schema', rounds: [] };
  const coreAddress = String(payload.identities?.core || '').toLowerCase();
  const rounds = (payload.events || []).filter(e => e.eventName === 'RoundRecorded' && e.contractKind === 'core' && String(e.contractAddress || '').toLowerCase() === coreAddress).map(e => {
    const args = Object.fromEntries((e.arguments || []).map(a => [a.name, a.value]));
    const transactionHash = /^0x[0-9a-f]{64}$/i.test(String(e.transactionHash)) ? String(e.transactionHash) : null;
    return { roundId: String(args.roundId ?? ''), workUnits: String(args.work ?? ''), transactionHash, blockNumber: String(e.blockNumber ?? '') };
  }).filter(r => /^\d+$/.test(r.roundId) && /^\d+$/.test(r.workUnits) && r.transactionHash);
  return { available: true, installationId: String(payload.installationId || ''), chainId: String(payload.chain?.chainId || ''), chainTarget: String(payload.chain?.target || ''), genesisTimestamp: String(payload.configuration?.genesisTimestamp ?? ''), roundDuration: String(payload.configuration?.roundDuration ?? ''), paused: payload.core?.paused === true, settledThroughRound: String(payload.core?.settledThroughRound ?? ''), blockHeight: String(payload.core?.blockHeight ?? ''), rounds };
}

export function confirmedZeroRange(statusPayload) {
  const submission = statusPayload?.settlementQueue?.latestSubmission;
  if (!submission || submission.lifecycle !== 'confirmed') return null;
  const from = submission.previousSettledThroughRound;
  const to = submission.settledThroughRound;
  const roundCount = String(submission.roundCount ?? '');
  const activeRoundCount = String(submission.activeRoundCount ?? '');
  if (!/^\d+$/.test(String(from)) || !/^\d+$/.test(String(to)) || !/^\d+$/.test(roundCount) || !/^\d+$/.test(activeRoundCount) || BigInt(to) <= BigInt(from) || BigInt(roundCount) !== BigInt(to) - BigInt(from) || BigInt(activeRoundCount) > BigInt(roundCount) || BigInt(activeRoundCount) > 16n) return null;
  const transactionHash = /^0x[0-9a-f]{64}$/i.test(String(submission.transactionHash)) ? String(submission.transactionHash) : null;
  if (!transactionHash) return null;
  return { fromRound: (BigInt(from) + 1n).toString(), toRound: String(to), activeRoundCount, transactionHash };
}

export function settlementResult(core, pendingRound, zeroRange = null) {
  if (!core?.available || !/^\d+$/.test(String(pendingRound)) || !/^\d+$/.test(String(core.settledThroughRound))) return null;
  const settled = BigInt(core.settledThroughRound);
  const pending = BigInt(pendingRound);
  if (settled < pending) return null;
  const exact = core.rounds.find(r => r.roundId === String(pendingRound));
  if (exact) return exact;
  const zeroFrom = String(zeroRange?.fromRound ?? '');
  const zeroTo = String(zeroRange?.toRound ?? '');
  const activeRoundCount = String(zeroRange?.activeRoundCount ?? '');
  const validZeroRange = /^\d+$/.test(zeroFrom) && /^\d+$/.test(zeroTo);
  const submissionRounds = validZeroRange && /^\d+$/.test(activeRoundCount) && zeroRange?.transactionHash
    ? new Set(core.rounds.filter(r => r.transactionHash === zeroRange.transactionHash && BigInt(r.roundId) >= BigInt(zeroFrom) && BigInt(r.roundId) <= BigInt(zeroTo)).map(r => r.roundId))
    : new Set();
  const completeActiveEvidence = /^\d+$/.test(activeRoundCount) && BigInt(activeRoundCount) === BigInt(submissionRounds.size);
  if (validZeroRange && completeActiveEvidence && pending >= BigInt(zeroFrom) && pending <= BigInt(zeroTo)) {
    return { roundId: String(pendingRound), workUnits: '0', transactionHash: zeroRange.transactionHash, blockNumber: null };
  }
  return { expired: true, roundId: String(pendingRound), reason: 'missing_round_evidence' };
}

export function activityTier(result) {
  if (!result || !/^\d+$/.test(String(result.workUnits))) return 'unverified';
  const work = BigInt(result.workUnits);
  if (work === 0n) return 'rest';
  if (work < 500n) return 'jog';
  return 'zoom';
}

function clamp(n, min = 0, max = 999) { return Math.min(max, Math.max(min, n)); }

export function resolveRound(state, actionId, roundResult) {
  if (!ACTIONS[actionId]) throw new Error('Unknown action');
  const roundId = String(roundResult?.roundId ?? '');
  if (!/^\d+$/.test(roundId) || state.resolvedRounds.includes(roundId)) return state;
  const tier = activityTier(roundResult);
  if (tier === 'unverified') return state;

  const next = structuredClone(state);
  const boost = tier === 'zoom' ? 2 : tier === 'jog' ? 1 : 0;
  const r = next.resources;
  const c = next.colony;
  let result = '';

  if (actionId === 'forage') {
    const gain = 5 + boost * 4;
    r.grain = clamp(r.grain + gain); c.morale = clamp(c.morale + 2 + boost, 0, 100);
    result = `Foragers returned with ${gain} grain.`;
  } else if (actionId === 'fortify') {
    const gain = 4 + boost * 3;
    r.timber = clamp(r.timber - 2); c.defense = clamp(c.defense + gain, 0, 100);
    result = `The gate gained ${gain} defense.`;
  } else if (actionId === 'explore') {
    const gain = 2 + boost * 4;
    c.map = clamp(c.map + gain, 0, 100); r.glowseed = clamp(r.glowseed + boost);
    result = `Scouts charted ${gain}% of the blue wilds.`;
  } else {
    const damage = tier === 'rest' ? 2 : 6 + boost * 6;
    c.boss = clamp(c.boss - damage, 0, 100); c.morale = clamp(c.morale + (boost ? 3 : -4), 0, 100);
    result = `The Hollowcat took ${damage} damage.`;
  }

  next.resolvedRounds.push(roundId);
  next.resolvedRounds = next.resolvedRounds.slice(-100);
  next.turnsPlayed = Math.min(Number.MAX_SAFE_INTEGER, next.turnsPlayed + 1);
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
    available: true, provenance: 'training-simulation', verified: false, stale: false, settlementReady: false, settlementReason: 'training',
    coreStatus: phase === 0 ? 'IDLE' : 'ACTIVE', rpm: phase === 0 ? 0 : phase === 1 ? 5.4 : 12.8,
    speed: phase * 41, distance: 'training', roundId: `training-${Math.floor(seed / 600000)}`,
    blockHeight: '—', blockProgress: (seed % 600000) / 600000, observedAt: new Date(seed).toISOString(), spinning: phase > 0
  };
}
