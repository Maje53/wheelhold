import './style.css';
import { ACTIONS, INITIAL_STATE, confirmedZeroRange, normalizeCore, normalizeTelemetry, resolveRound, settlementResult, trainingTelemetry } from './game.js';
import { getSnapshot } from './api.js';

const STORE = 'wheelhold-v1';
const LEGACY_STORE = 'squeek-colony-v1';
const app = document.querySelector('#app');
let state = load();
let telemetry = null;
let mode = 'connecting';
let refreshTimer = null;
let refreshController = null;
let apiReason = null;

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) || localStorage.getItem(LEGACY_STORE) || '{}');
    const next = structuredClone(INITIAL_STATE);
    if (stored && typeof stored === 'object') {
      if (Array.isArray(stored.resolvedRounds)) next.resolvedRounds = stored.resolvedRounds.filter(v => /^\d+$/.test(String(v))).slice(-100);
      if (ACTIONS[stored.pendingAction]) next.pendingAction = stored.pendingAction;
      if (/^\d+$/.test(String(stored.pendingRound || ''))) next.pendingRound = String(stored.pendingRound);
      if (stored.resources && typeof stored.resources === 'object') for (const k of Object.keys(next.resources)) if (Number.isFinite(stored.resources[k])) next.resources[k] = Math.max(0, stored.resources[k]);
      if (stored.colony && typeof stored.colony === 'object') for (const k of Object.keys(next.colony)) if (Number.isFinite(stored.colony[k])) next.colony[k] = Math.min(100, Math.max(0, stored.colony[k]));
      if (Array.isArray(stored.history)) next.history = stored.history.filter(h => h && ACTIONS[h.actionId] && /^\d+$/.test(String(h.roundId))).slice(0,12);
    }
    return next;
  }
  catch { return structuredClone(INITIAL_STATE); }
}
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
const pct = n => `${Math.round(n)}%`;
const short = v => String(v).length > 10 ? `${String(v).slice(0, 6)}…${String(v).slice(-3)}` : v;

function hamster() {
  return `<div class="habitat ${telemetry?.spinning ? 'awake' : ''}">
    <div class="stars">· ✦ · · ✧ · ✦</div><div class="moon"></div>
    <div class="hill h1"></div><div class="hill h2"></div>
    <div class="burrow"><i></i><i></i><i></i></div>
    <div class="wheel"><div class="spokes"></div><div class="hamster"><b></b><em></em></div></div>
    <div class="grass">╱╲╱╲ ╱╲╱╲ ╱╲</div>
  </div>`;
}

function render() {
  const focused = document.activeElement?.id || document.activeElement?.dataset?.action || null;
  const t = telemetry || trainingTelemetry();
  const live = mode === 'live' && t.verified;
  const untrusted = mode === 'live' && !t.verified;
  const statusLabel = mode === 'connecting' ? 'CONNECTING' : live ? (t.stale ? 'STALE SIGNAL' : 'LIVE WHEELY9000') : untrusted ? `${String(t.provenance).toUpperCase()} DATA — NOT LIVE` : 'TRAINING MODE';
  app.innerHTML = `
    <a class="skip" href="#game">Skip to game</a>
    <header><a class="brand" href="#" aria-label="Wheelhold home"><span>WH</span><div>WHEEL<br><b>HOLD</b></div></a>
      <div class="season">SEASON 01 <i></i> DAY ${Math.max(1, state.history.length + 1)}</div>
      <button class="wallet" id="wallet" aria-label="Connect wallet">CONNECT WALLET <span>↗</span></button>
    </header>
    <main id="game">
      <section class="hero">
        <div class="eyebrow"><i class="pulse ${live && !t.stale ? 'on' : ''}"></i>${statusLabel}</div>
        <h1>THE WHEEL<br><em>WRITES OUR FATE.</em></h1>
        <p>One real hamster. Your living colony. Choose a move before the current Squeekchain round settles.</p>
      </section>
      <section class="world-card">
        ${hamster()}
        <div class="telemetry">
          <div><small>WHEEL STATE</small><strong>${t.spinning ? 'RUNNING' : 'RESTING'}</strong></div>
          <div><small>LIVE SPEED</small><strong>${t.rpm.toFixed(1)} <sup>RPM</sup></strong></div>
          <div><small>SQUEEK BLOCK</small><strong>#${short(t.blockHeight)}</strong></div>
          <div class="progress"><small>BLOCK PROGRESS</small><strong>${pct(t.blockProgress * 100)}</strong><progress max="100" value="${t.blockProgress * 100}" aria-label="Block progress"></progress></div>
        </div>
        ${untrusted ? `<div class="notice warning"><b>UNTRUSTED TELEMETRY</b> — ${String(t.provenance).toUpperCase()} readings cannot lock or resolve a round.</div>` : !live ? `<div class="notice"><b>TRAINING SIMULATION</b> — No rewards or live round resolution. ${apiReason ? `Live API: ${apiReason}. ` : ''}Simulated telemetry is never presented as chain data.</div>` : t.stale ? `<div class="notice warning"><b>STALE TELEMETRY</b> — Actions are saved, but resolution is paused until verified data returns.</div>` : ''}
      </section>
      <section class="dashboard">
        <div class="panel colony">
          <div class="panel-title"><span>01</span><h2>COLONY STATUS</h2><small>BURROW 7F</small></div>
          ${meter('Morale', state.colony.morale, '#f4d35e')}
          ${meter('Defense', state.colony.defense, '#48c9a5')}
          ${meter('Wilds mapped', state.colony.map, '#66a8ff')}
          ${meter('Hollowcat', 100-state.colony.boss, '#ef6a6a', `${state.colony.boss} HP`)}
          <div class="resources"><div><b>${state.resources.grain}</b><span>GRAIN</span></div><div><b>${state.resources.timber}</b><span>TIMBER</span></div><div><b>${state.resources.glowseed}</b><span>GLOWSEED</span></div></div>
        </div>
        <div class="panel actions">
          <div class="panel-title"><span>02</span><h2>CHOOSE YOUR MOVE</h2><small>ONE PER ROUND</small></div>
          <div class="action-grid">${Object.entries(ACTIONS).map(([id,a]) => `<button class="action ${state.pendingAction===id?'selected':''}" data-action="${id}" aria-pressed="${state.pendingAction===id}" ${state.pendingRound?'disabled':''}><i aria-hidden="true">${a.icon}</i><div><b>${a.label}</b><p>${a.description}</p><small>${a.risk}</small></div><span aria-hidden="true">${state.pendingAction===id?'✓':'→'}</span></button>`).join('')}</div>
          <button id="commit" class="commit" ${!state.pendingAction||state.pendingRound?'disabled':''}>${state.pendingRound ? `LOCKED FOR ROUND ${short(state.pendingRound)}` : state.pendingAction ? `LOCK IN ${ACTIONS[state.pendingAction].label.toUpperCase()}` : 'SELECT AN ACTION'} <span>↗</span></button>
          <p class="proof">Round actions resolve only from fresh, hardware-provenance telemetry. Processed round IDs cannot score twice.</p>
        </div>
      </section>
      <section class="chronicle">
        <div class="panel-title"><span>03</span><h2>COLONY CHRONICLE</h2><small>${state.history.length} VERIFIED EVENTS</small></div>
        ${state.history.length ? state.history.slice(0,4).map(h=>`<article><i>${ACTIONS[h.actionId].icon}</i><div><b>${h.result}</b><small>ROUND ${h.roundId} · ${h.workUnits ?? '—'} WORK · ${h.tier.toUpperCase()} ${h.transactionHash ? `· <a href="https://eth-sepolia.blockscout.com/tx/${h.transactionHash}" target="_blank" rel="noopener">PROOF ↗</a>` : ''}</small></div></article>`).join('') : '<div class="empty">Your colony’s verified story begins with the next settled round.</div>'}
      </section>
    </main>
    <footer><span>WHEELHOLD / A SQUEEKCHAIN COLONY</span><span>POWERED BY VERIFIED SQUEEKCHAIN DATA · SEPOLIA</span><a href="https://squeekchain.com" target="_blank" rel="noopener">SQUEEKCHAIN ↗</a></footer>`;
  bind();
  if (focused) requestAnimationFrame(() => (document.getElementById(focused) || document.querySelector(`[data-action="${CSS.escape(focused)}"]`))?.focus({ preventScroll: true }));
}

function meter(label, value, color, display=pct(value)) { const tone = color === '#f4d35e' ? 'yellow' : color === '#48c9a5' ? 'green' : color === '#66a8ff' ? 'blue' : 'red'; return `<div class="meter ${tone}"><div><b>${label}</b><span>${display}</span></div><progress max="100" value="${value}" aria-label="${label}: ${display}"></progress></div>`; }

function bind() {
  document.querySelectorAll('[data-action]').forEach(el => el.onclick = () => { state.pendingAction = el.dataset.action; save(); render(); });
  document.querySelector('#commit').onclick = () => {
    if (!state.pendingAction) return;
    if (mode !== 'live') return toast('Training action saved. Live resolution requires verified telemetry.');
    if (telemetry.stale || Date.now() >= telemetry.staleAt || !telemetry.verified) return toast('Resolution paused: telemetry is not fresh and hardware-verified.');
    if (!telemetry.roundId) return toast('The current round cannot be verified yet. Try again after the next refresh.');
    if (state.resolvedRounds.includes(telemetry.roundId)) return toast('That round is already resolved. Waiting for the next verified round.');
    state.pendingRound = telemetry.roundId;
    state.pendingSnapshot = { counterEpoch: telemetry.counterEpoch, cumulativeWorkUnits: telemetry.cumulativeWorkUnits, lockedAt: new Date().toISOString() };
    save(); render();
    toast('Action locked. It will resolve when this verified round closes.');
  };
  document.querySelector('#wallet').onclick = async () => {
    if (!window.ethereum) return toast('No wallet detected. Guest play remains fully available.');
    try { const [a] = await window.ethereum.request({ method:'eth_requestAccounts' }); document.querySelector('#wallet').innerHTML = `${a.slice(0,6)}…${a.slice(-4)} <span>✓</span>`; }
    catch { toast('Wallet connection was cancelled.'); }
  };
}

function toast(message) { let el=document.querySelector('.toast'); if(!el){el=document.createElement('div');el.className='toast';document.body.append(el)} el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3500); }

function scheduleRefresh(seconds = 15) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, seconds * 1000);
}

async function refresh() {
  refreshController?.abort();
  refreshController = new AbortController();
  const timeout = setTimeout(() => refreshController.abort(), 8000);
  try {
    const raw = await getSnapshot(refreshController.signal);
    const next = normalizeTelemetry(raw.status);
    const core = normalizeCore(raw.core);
    if (!next.available) throw new Error(next.reason);
    if (!core.available) throw new Error(core.reason);
    if (next.roundId && /^\d+$/.test(core.settledThroughRound) && BigInt(core.settledThroughRound) >= BigInt(next.roundId)) next.roundId = (BigInt(core.settledThroughRound) + 1n).toString();
    telemetry = next; mode = 'live'; apiReason = null;
    if (state.pendingAction && state.pendingRound) {
      const result = settlementResult(core, state.pendingRound, confirmedZeroRange(raw.status));
      if (result?.expired) {
        state.pendingAction = null; state.pendingRound = null; state.pendingSnapshot = null; save();
        toast('The settlement proof window was missed. The action was cleared without scoring.');
      } else if (result) {
        state = resolveRound(state, state.pendingAction, result); save(); toast(`Round ${result.roundId} settled with ${result.workUnits} work.`);
      }
    }
    scheduleRefresh(15);
  } catch (error) {
    telemetry = trainingTelemetry(); mode = 'training'; apiReason = error.message || 'unavailable';
    scheduleRefresh(error.retryAfter || 20);
  }
  clearTimeout(timeout);
  render();
}

render(); refresh();
