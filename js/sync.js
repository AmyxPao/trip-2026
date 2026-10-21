// 帳本雲端同步：送出有改過的帳（_dirty），再把 Google Sheet 上的整本帳拉回來合併
// 網址與密語只存在這個瀏覽器，不進備份檔、不進 repo
import { state, commit } from './store.js';

const KEY = 'hokuriku-sync-v1';
const listeners = new Set();
export const sync = { url: '', secret: '', lastSync: null, status: 'off', message: '' };

try { Object.assign(sync, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 沒有設定就算了 */ }
if (sync.url) sync.status = 'idle';

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ url: sync.url, secret: sync.secret, lastSync: sync.lastSync })); } catch { /* 存不了就只在這次有效 */ }
}
function emit() { listeners.forEach((fn) => fn()); }
export function onSync(fn) { listeners.add(fn); }

export const enabled = () => Boolean(sync.url && sync.secret);
export const pendingCount = () => (state.ledger?.entries || []).filter((e) => e._dirty).length + (state.ledger?._settingsDirty ? 1 : 0);

export function configure(url, secret) {
  sync.url = url.trim();
  sync.secret = secret.trim();
  sync.status = sync.url ? 'idle' : 'off';
  sync.message = '';
  save();
  emit();
}

// 帳本有異動時呼叫：給 1.5 秒把連續的修改合併成一次
let timer;
export function schedule() {
  if (!enabled()) return;
  clearTimeout(timer);
  timer = setTimeout(() => run(), 1500);
}

const SETTINGS_KEYS = ['names', 'cashRate', 'cardRate', 'categories', 'cards', 'settled'];
const strip = (e) => { const { _dirty, ...rest } = e; return rest; };

let running = null;
export function run() {
  if (!enabled()) return Promise.resolve();
  if (running) return running.then(() => run());
  running = doRun().finally(() => { running = null; });
  return running;
}

async function doRun() {
  if (!navigator.onLine) {
    sync.status = 'offline';
    sync.message = '';
    emit();
    return;
  }
  const L = state.ledger;
  // 舊版留下、還沒有 updatedAt 的帳，第一次同步時一併送上去
  for (const e of L.entries) if (!e.updatedAt) { e.updatedAt = new Date().toISOString(); e._dirty = true; }
  const sent = L.entries.filter((e) => e._dirty).map(strip);
  const settings = L._settingsDirty || !L.settingsUpdatedAt
    ? { data: Object.fromEntries(SETTINGS_KEYS.map((k) => [k, L[k]])), updatedAt: L.settingsUpdatedAt || '' } : null;
  const labels = {
    cats: Object.fromEntries(L.categories.map((c) => [c.id, c.name])),
    cards: Object.fromEntries(L.cards.map((c) => [c.id, c.name])),
    names: L.names,
  };
  sync.status = 'syncing';
  emit();
  let res;
  try {
    const r = await fetch(sync.url, {
      method: 'POST',
      // text/plain 不會觸發 CORS 預檢，Apps Script 才收得到
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: sync.secret, op: 'sync', entries: sent, settings, labels }),
      redirect: 'follow',
    });
    res = await r.json();
  } catch {
    sync.status = 'error';
    sync.message = '連不到 Google Sheet。請確認網址是「網頁應用程式網址」，並且部署時「誰可以存取」選「任何人」。';
    emit();
    return;
  }
  if (!res.ok) {
    sync.status = 'error';
    sync.message = res.error || '同步失敗';
    emit();
    return;
  }
  const sentAt = new Map(sent.map((e) => [e.id, e.updatedAt]));
  commit(({ ledger }) => {
    // 送出後沒再改過的，清掉待上傳記號
    for (const e of ledger.entries) if (e._dirty && sentAt.get(e.id) === e.updatedAt) delete e._dirty;
    const byId = new Map(ledger.entries.map((e) => [e.id, e]));
    for (const remote of res.entries || []) {
      const local = byId.get(remote.id);
      if (!local) ledger.entries.push(remote);
      else if (!local._dirty && (remote.updatedAt || '') > (local.updatedAt || '')) Object.assign(local, remote);
    }
    const rs = res.settings;
    if (rs && rs.data && (rs.updatedAt || '') >= (ledger.settingsUpdatedAt || '') && !(ledger._settingsDirty && !settings)) {
      SETTINGS_KEYS.forEach((k) => { if (rs.data[k] !== undefined) ledger[k] = rs.data[k]; });
      ledger.settingsUpdatedAt = rs.updatedAt;
    }
    if (settings) delete ledger._settingsDirty;
  });
  sync.status = 'ok';
  sync.message = '';
  sync.lastSync = new Date().toISOString();
  save();
  emit();
}

export function statusText() {
  const n = pendingCount();
  switch (sync.status) {
    case 'off': return '';
    case 'syncing': return '同步中…';
    case 'offline': return n ? `沒有網路，${n} 筆等連上再上傳` : '沒有網路，連上後自動同步';
    case 'error': return `同步失敗：${sync.message}`;
    default: {
      if (n) return `${n} 筆待上傳`;
      if (!sync.lastSync) return '尚未同步';
      const t = new Date(sync.lastSync);
      return `已同步 ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    }
  }
}
