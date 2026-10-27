import { normalizeStops } from './trip.js';

// 資料只存在這支手機的瀏覽器：行程（由 data/trip.json 初始化）＋帳本＋中繼資料
const KEY = 'hokuriku-trip-v1';
const APP_ID = 'hokuriku-trip';

export const DEFAULT_CATEGORIES = ['餐飲', '租車', '油費', '高速費', '停車', '住宿', '門票', '購物', '其他'];

function defaultLedger() {
  return {
    names: { me: '我', mate: '旅伴' },
    cashRate: 0.22,
    cardRate: 0.22,
    categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: 'k' + (i + 1), name })),
    cards: [],
    entries: [],
    settled: null, // { at, balance }
  };
}

export const state = {
  trip: null,
  ledger: null,
  meta: { modifiedAt: null, exportedAt: null, storageOk: true },
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ app: APP_ID, version: 1, trip: state.trip, ledger: state.ledger, meta: state.meta }));
    state.meta.storageOk = true;
  } catch {
    state.meta.storageOk = false;
  }
}

export async function load() {
  const saved = readLocal();
  if (saved && saved.trip) {
    state.trip = normalizeStops(saved.trip);
    state.ledger = { ...defaultLedger(), ...saved.ledger };
    state.meta = { ...state.meta, ...saved.meta };
  } else {
    state.trip = normalizeStops(await fetchSeed());
    state.ledger = defaultLedger();
  }
  await fillParking(state.trip);
  writeLocal();
  try { navigator.storage?.persist?.(); } catch { /* 不支援就算了 */ }
}

// 停車點只從 data/trip.json 帶入一次：沒有停車點（或是空的）的天補上預設停車場，補過就記 parkingSeeded，
// 之後使用者刪光也不會再補。讀不到、或讀到的是還沒有停車點的舊快取，就先不動，下次打開再試
async function fillParking(trip) {
  if (trip.parkingSeeded) return;
  let seed;
  try { seed = await fetchSeed(); } catch { return; }
  if (!seed.days.every((d) => Array.isArray(d.parking))) return;
  for (const d of trip.days) {
    if (d.parking?.length) continue;
    d.parking = structuredClone(seed.days.find((x) => x.n === d.n)?.parking || []);
  }
  trip.parkingSeeded = true;
}

async function fetchSeed() {
  const res = await fetch('data/trip.json');
  if (!res.ok) throw new Error('讀不到行程資料（data/trip.json）');
  return res.json();
}

// 所有修改都走這裡：改完立刻存、通知畫面
export function commit(mutator) {
  mutator(state);
  state.meta.modifiedAt = new Date().toISOString();
  writeLocal();
  listeners.forEach((fn) => fn());
}

export function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- 備份 ----------
export function exportBackup() {
  const now = new Date();
  const payload = { app: APP_ID, version: 1, exportedAt: now.toISOString(), trip: state.trip, ledger: state.ledger };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const pad = (n) => String(n).padStart(2, '0');
  const name = `北陸自駕-備份-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  state.meta.exportedAt = now.toISOString();
  writeLocal();
  listeners.forEach((fn) => fn());
  return name;
}

export async function parseBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('這個檔案不是備份檔（讀不出內容）。請選匯出時存下的 .json 檔。');
  }
  if (data?.app !== APP_ID || !data.trip?.days || !data.trip?.stops) {
    throw new Error('這個檔案不是這個 App 的備份檔。請選檔名開頭為「北陸自駕-備份」的檔案。');
  }
  return data;
}

export async function restoreBackup(data) {
  const trip = normalizeStops(data.trip);
  await fillParking(trip);
  commit((s) => {
    s.trip = trip;
    s.ledger = { ...defaultLedger(), ...data.ledger };
    s.meta.exportedAt = data.exportedAt || null;
  });
}

export async function resetToSeed() {
  const seed = await fetchSeed();
  commit((s) => { s.trip = normalizeStops(seed); });
}

// 有修改且超過一天沒備份（或從沒備份過）就提醒
export function needsBackup() {
  const { modifiedAt, exportedAt } = state.meta;
  if (!modifiedAt) return false;
  if (!exportedAt) return true;
  return new Date(modifiedAt) > new Date(exportedAt) && Date.now() - new Date(exportedAt) > 24 * 3600 * 1000;
}
