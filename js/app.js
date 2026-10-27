import { state, load, subscribe } from './store.js';
import { icon } from './icons.js';
import { initSheet, closeSheet, toast } from './ui.js';
import { phase, todayDay } from './trip.js';
import {
  renderOverview, renderDay, afterDay, leaveDay, openStop, editStop, editDay, editParking, moveStop, toggleEdit, doExport,
} from './view-trip.js';
import { renderLedger, afterLedger, setLedgerTab, editEntry, ledgerSettings, settle } from './view-ledger.js';
import { renderMap, renderList, toggleCheck, importFile, confirmReset } from './view-misc.js';
import { enabled as syncOn, run as runSync, onSync } from './sync.js';
import { exportExcel } from './export-xlsx.js';

const TABS = [
  ['overview', '#/', '總覽', 'overview'],
  ['today', '#/today', '今天', 'today'],
  ['map', '#/map', '地圖', 'map'],
  ['ledger', '#/ledger', '分帳', 'wallet'],
  ['list', '#/list', '清單', 'list'],
];

const main = () => document.getElementById('app');
let lastRoute = '';

function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const m = h.match(/^\/day\/(\d+)/);
  if (m) {
    // 點進的剛好是今天那天，分頁亮「今天」
    const n = Number(m[1]);
    const t = state.trip;
    const today = t && phase(t) === 'during' ? todayDay(t) : null;
    return { tab: today && today.n === n ? 'today' : 'overview', view: 'day', n };
  }
  if (h.startsWith('/today')) return { tab: 'today', view: 'today' };
  if (h.startsWith('/map')) return { tab: 'map', view: 'map' };
  if (h.startsWith('/ledger')) return { tab: 'ledger', view: 'ledger' };
  if (h.startsWith('/list')) return { tab: 'list', view: 'list' };
  return { tab: 'overview', view: 'overview' };
}

function render() {
  const r = route();
  const key = r.view + (r.n || '');
  if (key !== lastRoute && r.view !== 'day' && r.view !== 'today') leaveDay();
  let html;
  if (r.view === 'day') html = renderDay(r.n);
  else if (r.view === 'today') {
    const t = state.trip;
    const ph = phase(t);
    const n = ph === 'during' ? todayDay(t).n : ph === 'pre' ? 1 : t.days.length;
    html = renderDay(n, { isToday: true });
  } else if (r.view === 'map') html = renderMap();
  else if (r.view === 'ledger') html = renderLedger();
  else if (r.view === 'list') html = renderList();
  else html = renderOverview();

  const el = main();
  el.innerHTML = html;
  el.dataset.view = r.view;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (key !== lastRoute) window.scrollTo(0, 0);
  lastRoute = key;
  if (r.view === 'day' || r.view === 'today') afterDay();
  if (r.view === 'ledger') afterLedger();
  const reset = el.querySelector('[data-act="reset"]');
  if (reset) confirmReset(reset);
  syncOnline();
}

function syncOnline() {
  const off = !navigator.onLine;
  document.querySelectorAll('.offline-pill').forEach((p) => { p.hidden = !off; });
  document.body.classList.toggle('is-offline', off);
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t || t.matches('input')) return;
  const { act, id } = t.dataset;
  switch (act) {
    case 'open-stop': openStop(id); break;
    case 'edit-stop': editStop(id); break;
    case 'add-stop': editStop(null, Number(t.dataset.day)); break;
    case 'edit-day': editDay(Number(t.dataset.day)); break;
    case 'edit-parking': editParking(Number(t.dataset.day), id); break;
    case 'add-parking': editParking(Number(t.dataset.day), null); break;
    case 'move': moveStop(id, Number(t.dataset.dir)); break;
    case 'toggle-edit': toggleEdit(Number(document.querySelector('.timeline')?.dataset.day)); render(); break;
    case 'export': doExport(); break;
    case 'export-xlsx': toast(`已匯出 ${exportExcel()}`); break;
    case 'ledger-tab': setLedgerTab(t.dataset.tab); render(); break;
    case 'new-entry': editEntry(null, { date: t.dataset.date }); break;
    case 'edit-entry': editEntry(id); break;
    case 'ledger-settings': ledgerSettings(); break;
    case 'settle': settle(true); break;
    case 'unsettle': settle(false); break;
    case 'sync-now': runSync(); break;
    default: return;
  }
}

function onChange(e) {
  const t = e.target;
  if (t.dataset.act === 'check') toggleCheck(t.dataset.id, t.checked);
  if (t.dataset.act === 'import' && t.files[0]) { importFile(t.files[0]); t.value = ''; }
}

function tabbar() {
  return TABS.map(([k, href, label, ic]) => `<a href="${href}" data-tab="${k}">${icon(ic)}<span>${label}</span></a>`).join('');
}

async function start() {
  document.querySelector('.tabbar').innerHTML = tabbar();
  initSheet();
  try {
    await load();
  } catch (err) {
    main().innerHTML = `<div class="empty"><h1>打不開行程資料</h1><p>${err.message}。第一次打開需要網路，連上後重新整理。</p></div>`;
    return;
  }
  render();
  subscribe(render);
  window.addEventListener('hashchange', () => { closeSheet(); render(); });
  window.addEventListener('online', () => { syncOnline(); runSync(); });
  onSync(() => { if (main().dataset.view === 'ledger' && !document.getElementById('sheet').open) render(); });
  if (syncOn()) runSync();
  window.addEventListener('offline', syncOnline);
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  // 跨過午夜或下一站時間到了，總覽與今天要更新
  setInterval(() => { if (!document.getElementById('sheet').open && ['overview', 'today', 'day'].includes(main().dataset.view)) render(); }, 60000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) toast('有新版本，下次打開就會更新');
        });
      });
    }).catch(() => {});
  }
}

start();
