// 帳本計算：換算台幣、反推刷卡匯率、分類／日期合計、三方結算
// entry: { id, date: 'pre' | 'YYYY-MM-DD', amount, currency: 'JPY'|'TWD', cat, payer: 'me'|'zhao'|'aunts',
//          method: 'cash' | cardId, split: { type: 'even' } | { type: 'custom', me: %, zhao: % }（阿姨們 = 剩下的）, note, billTWD }

// 同一天、同一張卡、有補帳單台幣的那幾筆，以金額加權反推匯率
function cardDayRate(ledger, date, method) {
  let jpy = 0;
  let twd = 0;
  for (const e of ledger.entries) {
    if (!e.deleted && e.date === date && e.method === method && e.currency === 'JPY' && e.billTWD > 0) {
      jpy += e.amount;
      twd += e.billTWD;
    }
  }
  return jpy > 0 ? twd / jpy : null;
}

// 回傳 { twd, basis }；basis: 'twd' 原本就是台幣、'bill' 有帳單金額、'card' 用反推匯率、'cash' 現金匯率、'est' 刷卡粗估
export function toTWD(ledger, e) {
  if (e.currency === 'TWD') return { twd: e.amount, basis: 'twd' };
  if (e.method === 'cash') return { twd: e.amount * ledger.cashRate, basis: 'cash' };
  if (e.billTWD > 0) return { twd: e.billTWD, basis: 'bill' };
  const rate = cardDayRate(ledger, e.date, e.method);
  if (rate) return { twd: e.amount * rate, basis: 'card', rate };
  return { twd: e.amount * ledger.cardRate, basis: 'est' };
}

export const isEstimate = (basis) => basis === 'est';

// ---------- 三方：鮑、趙、阿姨們（3 人） ----------
export const PARTIES = ['me', 'zhao', 'aunts'];
export const DEFAULT_NAMES = { me: '鮑', zhao: '趙', aunts: '阿姨們（3 人）' };
// 「均分」照人頭：鮑 1、趙 1、阿姨們 3，共 5 份 → 20 / 20 / 60
const HEADS = { me: 1, zhao: 1, aunts: 3 };
const HEAD_SUM = 5;

const pct = (v) => Math.min(100, Math.max(0, Number(v) || 0));

// 自訂比例：鮑、趙各填百分比，阿姨們 = 100 − 鮑 − 趙（鮑＋趙超過 100 時，趙被壓到只剩 100 − 鮑）
export function customPcts(split) {
  const me = pct(split?.me);
  const zhao = Math.min(pct(split?.zhao), 100 - me);
  return { me, zhao, aunts: 100 - me - zhao };
}

// 這筆帳三方各負擔幾成（0~1，加起來 = 1）
export function shares(e) {
  if (e.split?.type === 'custom') {
    const c = customPcts(e.split);
    return { me: c.me / 100, zhao: c.zhao / 100, aunts: c.aunts / 100 };
  }
  return Object.fromEntries(PARTIES.map((p) => [p, HEADS[p] / HEAD_SUM]));
}

const zero = () => ({ me: 0, zhao: 0, aunts: 0 });

// 把舊的兩方帳（me / mate、half / me / mate / custom 只有 me）轉成三方。可重複執行，已經是新格式的不動。
// 舊的 mate 一律對應 zhao；舊 custom 沒有 zhao 的補 0。
export function normalizeLedger(ledger) {
  const n = ledger.names || {};
  if (!('aunts' in n) || 'mate' in n) {
    ledger.names = {
      me: n.me && n.me !== '我' ? n.me : DEFAULT_NAMES.me,
      zhao: n.zhao || (n.mate && n.mate !== '旅伴' ? n.mate : DEFAULT_NAMES.zhao),
      aunts: n.aunts || DEFAULT_NAMES.aunts,
    };
  }
  ledger.parties = [...PARTIES];
  for (const e of ledger.entries || []) {
    if (e.payer === 'mate') e.payer = 'zhao';
    if (!PARTIES.includes(e.payer)) e.payer = 'me';
    const t = e.split?.type;
    if (t === 'custom') {
      const me = pct(e.split.me);
      e.split = { type: 'custom', me, zhao: Math.min(pct(e.split.zhao), 100 - me) };
    } else if (t === 'me') {
      e.split = { type: 'custom', me: 100, zhao: 0 };
    } else if (t === 'mate') {
      e.split = { type: 'custom', me: 0, zhao: 100 };
    } else {
      e.split = { type: 'even' };
    }
  }
  // 舊的結清標記是兩方的差額，三方算法不一樣，不能沿用
  if (ledger.settled && !ledger.settled.key) ledger.settled = null;
  return ledger;
}

// 淨額（正＝別人欠他、負＝他欠別人）換成「誰付給誰多少」。
// 錢一律經過趙（HUB）：要出錢的人把錢給趙，趙再轉給代墊的人。先列給趙的，再列趙轉出的。
const HUB = 'zhao';
export function transfersOf(net) {
  const toHub = [];
  const fromHub = [];
  for (const p of PARTIES) {
    if (p === HUB) continue;
    const v = Math.round(net[p]);
    if (v < 0) toHub.push({ from: p, to: HUB, amount: -v });
    else if (v > 0) fromHub.push({ from: HUB, to: p, amount: v });
  }
  return [...toHub, ...fromHub];
}

export function summarize(ledger) {
  const out = {
    jpy: 0, twdNative: 0, total: 0, estimates: 0,
    paid: zero(), owe: zero(),
    byCat: new Map(), byDate: new Map(),
  };
  for (const e of ledger.entries) {
    if (e.deleted) continue;
    const { twd, basis } = toTWD(ledger, e);
    if (e.currency === 'JPY') out.jpy += e.amount; else out.twdNative += e.amount;
    out.total += twd;
    if (isEstimate(basis)) out.estimates += 1;
    out.paid[e.payer] += twd;
    const sh = shares(e);
    for (const p of PARTIES) out.owe[p] += twd * sh[p];
    out.byCat.set(e.cat, (out.byCat.get(e.cat) || 0) + twd);
    const d = out.byDate.get(e.date) || { total: 0, entries: [] };
    d.total += twd;
    d.entries.push(e);
    out.byDate.set(e.date, d);
  }
  // 淨額：正數＝別人要給他；負數＝他要給別人
  out.net = Object.fromEntries(PARTIES.map((p) => [p, out.paid[p] - out.owe[p]]));
  out.transfers = transfersOf(out.net);
  out.key = PARTIES.map((p) => Math.round(out.net[p])).join(',');
  return out;
}

export const liveEntries = (ledger) => ledger.entries.filter((e) => !e.deleted);

export const fmtTWD = (n) => 'NT$ ' + Math.round(n).toLocaleString('zh-TW');
export const fmtJPY = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
export const fmtAmount = (e) => (e.currency === 'JPY' ? fmtJPY(e.amount) : fmtTWD(e.amount));
