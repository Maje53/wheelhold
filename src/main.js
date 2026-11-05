import './style.css';
import { ACTIONS, canLockRound, confirmedZeroRange, currentRoundWindow, hydrateState, normalizeCore, normalizeTelemetry, resolveRound, settlementResult, snapshotCompatibility, telemetryPresentation, trainingTelemetry } from './game.js';
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
let connectedAccount = null;
let toastTimer = null;

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) || localStorage.getItem(LEGACY_STORE) || '{}');
    return hydrateState(stored);
  }
  catch { return hydrateState(null); }
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* gameplay remains available without persistence */ } }
const pct = n => `${Math.round(n)}%`;
const short = v => String(v).length > 10 ? `${String(v).slice(0, 6)}…${String(v).slice(-3)}` : v;
const esc = value => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);

function hamster(animate) {
  return `<div class="habitat ${animate ? 'awake' : ''}">
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
  const presentation = telemetryPresentation(mode, t);
  const effectiveStale = live && !presentation.fresh;
  const settlementBlocked = live && !t.settlementReady;
  const statusLabel = mode === 'connecting' ? 'CONNECTING' : live ? (effectiveStale ? 'STALE SIGNAL' : 'LIVE WHEELY9000') : untrusted ? `${String(t.provenance).toUpperCase()} DATA — NOT LIVE` : 'TRAINING MODE';
  app.innerHTML = `
    <a class="skip" id="skip-link" href="#game">Skip to game</a>
    <header><a class="brand" id="brand-link" href="#" aria-label="Wheelhold home"><span>WH</span><div>WHEEL<br><b>HOLD</b></div></a>
      <div class="season">SEASON 01 <i></i> DAY ${state.turnsPlayed + 1}</div>
      <button class="wallet" id="wallet" aria-label="${connectedAccount ? `Wallet connected: ${connectedAccount}` : 'Connect wallet'}">${connectedAccount ? `${connectedAccount.slice(0,6)}…${connectedAccount.slice(-4)} <span>✓</span>` : 'CONNECT WALLET <span>↗</span>'}</button>
    </header>
    <main id="game">
      <section class="hero">
        <div class="eyebrow"><i class="pulse ${live && !effectiveStale ? 'on' : ''}"></i>${esc(statusLabel)}</div>
        <h1>THE WHEEL<br><em>WRITES OUR FATE.</em></h1>
        <p>One real hamster. Your living colony. Choose a move before the current Squeekchain round settles.</p>
      </section>
      <section class="world-card">
        ${hamster(presentation.animate)}
        <div class="telemetry">
          <div><small>WHEEL STATE</small><strong>${presentation.state}</strong></div>
          <div><small>${presentation.speedLabel}</small><strong>${t.rpm.toFixed(1)} <sup>RPM</sup></strong></div>
          <div><small>SQUEEK BLOCK</small><strong>#${esc(short(t.blockHeight))}</strong></div>
          <div class="progress"><small>BLOCK PROGRESS</small><strong>${pct(t.blockProgress * 100)}</strong><progress max="100" value="${t.blockProgress * 100}" aria-label="Block progress"></progress></div>
        </div>
        ${untrusted ? `<div class="notice warning"><b>UNTRUSTED TELEMETRY</b> — ${esc(String(t.provenance).toUpperCase())} readings cannot lock or resolve a round.</div>` : !live ? `<div class="notice"><b>TRAINING SIMULATION</b> — No rewards or live round resolution. ${apiReason ? `Live API: ${esc(apiReason)}. ` : ''}Simulated telemetry is never presented as chain data.</div>` : effectiveStale ? `<div class="notice warning"><b>STALE TELEMETRY</b> — Actions are saved, but resolution is paused until verified data returns.</div>` : settlementBlocked ? `<div class="notice warning"><b>SETTLEMENT PAUSED</b> — New round locks are disabled while the Squeekchain settlement pipeline is ${esc(t.settlementReason)}.</div>` : ''}
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
          <button id="commit" class="commit" ${!state.pendingAction||state.pendingRound||settlementBlocked?'disabled':''}>${state.pendingRound ? `LOCKED FOR ROUND ${short(state.pendingRound)}` : settlementBlocked ? 'SETTLEMENT PAUSED' : state.pendingAction ? `LOCK IN ${ACTIONS[state.pendingAction].label.toUpperCase()}` : 'SELECT AN ACTION'} <span>↗</span></button>
          <p class="proof">Round actions resolve only from fresh, hardware-provenance telemetry. Processed round IDs cannot score twice.</p>
        </div>
      </section>
      <section class="chronicle">
        <div class="panel-title"><span>03</span><h2>COLONY CHRONICLE</h2><small>${state.history.length} VERIFIED EVENTS</small></div>
        ${state.history.length ? state.history.slice(0,4).map(h=>`<article><i>${ACTIONS[h.actionId].icon}</i><div><b>${esc(h.result)}</b><small>ROUND ${esc(h.roundId)} · ${esc(h.workUnits ?? '—')} WORK · ${esc(h.tier.toUpperCase())} ${h.transactionHash ? `· <a id="proof-${h.roundId}" href="https://eth-sepolia.blockscout.com/tx/${h.transactionHash}" target="_blank" rel="noopener">PROOF ↗</a>` : ''}</small></div></article>`).join('') : '<div class="empty">Your colony’s verified story begins with the next settled round.</div>'}
      </section>
    </main>
    <footer><span>WHEELHOLD / A SQUEEKCHAIN COLONY</span><span>POWERED BY VERIFIED SQUEEKCHAIN DATA · SEPOLIA</span><a id="imd-link" href="https://explorer.imd.fun/jobs/10243a89-33c6-4399-a3b2-85890e3ddc68" target="_blank" rel="noopener">IMD BUILD ↗</a><a id="squeekchain-link" href="https://squeekchain.com" target="_blank" rel="noopener">SQUEEKCHAIN ↗</a></footer>`;
  bind();
  if (focused) requestAnimationFrame(() => (document.getElementById(focused) || document.querySelector(`[data-action="${CSS.escape(focused)}"]`))?.focus({ preventScroll: true }));
}

function meter(label, value, color, display=pct(value)) { const tone = color === '#f4d35e' ? 'yellow' : color === '#48c9a5' ? 'green' : color === '#66a8ff' ? 'blue' : 'red'; return `<div class="meter ${tone}"><div><b>${label}</b><span>${display}</span></div><progress max="100" value="${value}" aria-label="${label}: ${display}"></progress></div>`; }

function bind() {
  document.querySelectorAll('[data-action]').forEach(el => el.onclick = () => { state.pendingAction = el.dataset.action; save(); render(); });
  document.querySelector('#commit').onclick = () => {
    if (!state.pendingAction) return;
    const eligibility = canLockRound(mode, telemetry, state.resolvedRounds);
    if (!eligibility.ok && eligibility.reason === 'unverified') return toast('Training action saved. Live resolution requires verified telemetry.');
    if (!eligibility.ok && eligibility.reason === 'stale') return toast('Resolution paused: telemetry is not fresh and hardware-verified.');
    if (!eligibility.ok && eligibility.reason === 'settlement') return toast('New locks are paused until the settlement pipeline is available.');
    if (!eligibility.ok && eligibility.reason === 'round') return toast('The current round cannot be verified yet. Try again after the next refresh.');
    if (!eligibility.ok && eligibility.reason === 'resolved') return toast('That round is already resolved. Waiting for the next verified round.');
    state.pendingRound = telemetry.roundId;
    state.pendingSnapshot = { counterEpoch: telemetry.counterEpoch, cumulativeWorkUnits: telemetry.cumulativeWorkUnits, lockedAt: new Date().toISOString() };
    save(); render();
    toast('Action locked. It will resolve when this verified round closes.');
  };
  document.querySelector('#wallet').onclick = async () => {
    if (!window.ethereum) return toast('No wallet detected. Guest play remains fully available.');
    try {
      const [account] = await window.ethereum.request({ method:'eth_requestAccounts' });
      if (!/^0x[0-9a-f]{40}$/i.test(String(account))) throw new Error('invalid_account');
      connectedAccount = String(account); render();
    }
    catch { toast('Wallet connection was cancelled.'); }
  };
}

function toast(message) { let el=document.querySelector('.toast'); if(!el){el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.append(el)} clearTimeout(toastTimer);el.textContent=message;el.classList.add('show');toastTimer=setTimeout(()=>el.classList.remove('show'),3500); }

function scheduleRefresh(seconds = 15) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, seconds * 1000);
}

async function refresh() {
  refreshController?.abort();
  const controller = new AbortController();
  refreshController = controller;
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const raw = await getSnapshot(controller.signal);
    if (controller !== refreshController) { clearTimeout(timeout); return; }
    const next = normalizeTelemetry(raw.status);
    const core = normalizeCore(raw.core);
    if (!next.available) throw new Error(next.reason);
    if (!core.available) throw new Error(core.reason);
    const compatibility = snapshotCompatibility(next, core);
    if (!compatibility.ok) throw new Error(compatibility.reason);
    next.settlementReady = next.settlementReady && !core.paused;
    if (core.paused) next.settlementReason = 'core-paused';
    const currentRound = currentRoundWindow(core);
    next.roundId = currentRound?.roundId || null;
    next.roundEndsAt = currentRound?.endsAt || 0;
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
    if (controller !== refreshController) { clearTimeout(timeout); return; }
    telemetry = trainingTelemetry(); mode = 'training'; apiReason = error.message || 'unavailable';
    scheduleRefresh(error.retryAfter || 20);
  }
  clearTimeout(timeout);
  render();
}

render(); refresh();
