// 帳本計算：換算台幣、反推刷卡匯率、分類／日期合計、雙方結算
// entry: { id, date: 'pre' | 'YYYY-MM-DD', amount, currency: 'JPY'|'TWD', cat, payer: 'me'|'mate',
//          method: 'cash' | cardId, split: { type: 'half'|'me'|'mate'|'custom', me }, note, billTWD }

// 同一天、同一張卡、有補帳單台幣的那幾筆，以金額加權反推匯率
function cardDayRate(ledger, date, method) {
  let jpy = 0;
  let twd = 0;
  for (const e of ledger.entries) {
    if (e.date === date && e.method === method && e.currency === 'JPY' && e.billTWD > 0) {
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

export function meShare(e) {
  switch (e.split?.type) {
    case 'me': return 1;
    case 'mate': return 0;
    case 'custom': return Math.min(100, Math.max(0, Number(e.split.me) || 0)) / 100;
    default: return 0.5;
  }
}

export function summarize(ledger) {
  const out = {
    jpy: 0, twdNative: 0, total: 0, estimates: 0,
    paid: { me: 0, mate: 0 }, owe: { me: 0, mate: 0 },
    byCat: new Map(), byDate: new Map(),
  };
  for (const e of ledger.entries) {
    const { twd, basis } = toTWD(ledger, e);
    if (e.currency === 'JPY') out.jpy += e.amount; else out.twdNative += e.amount;
    out.total += twd;
    if (isEstimate(basis)) out.estimates += 1;
    out.paid[e.payer] += twd;
    const share = meShare(e);
    out.owe.me += twd * share;
    out.owe.mate += twd * (1 - share);
    out.byCat.set(e.cat, (out.byCat.get(e.cat) || 0) + twd);
    const d = out.byDate.get(e.date) || { total: 0, entries: [] };
    d.total += twd;
    d.entries.push(e);
    out.byDate.set(e.date, d);
  }
  // 正數：旅伴要給我；負數：我要給旅伴
  out.balance = Math.round(out.paid.me - out.owe.me);
  return out;
}

export const fmtTWD = (n) => 'NT$ ' + Math.round(n).toLocaleString('zh-TW');
export const fmtJPY = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
export const fmtAmount = (e) => (e.currency === 'JPY' ? fmtJPY(e.amount) : fmtTWD(e.amount));
