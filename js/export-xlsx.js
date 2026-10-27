// 把手機上目前的行程與帳本匯出成 Excel
import { state } from './store.js';
import { buildXlsx } from './xlsx.js';
import { md, weekday } from './trip.js';
import { summarize, toTWD, meShare, liveEntries } from './ledger.js';

const BASIS = { twd: '台幣', cash: '現金匯率', bill: '帳單金額', card: '同日同卡反推', est: '刷卡粗估' };

export function exportExcel() {
  const { trip, ledger } = state;
  const dayLabel = (iso) => `${md(iso)}（${weekday(iso)}）`;
  const dayOf = (n) => trip.days.find((d) => d.n === n);

  const overview = [['天', '日期', '主軸', '住宿', '注意', '備案'],
    ...trip.days.map((d) => [`DAY ${d.n}`, dayLabel(d.date), d.title, d.stay, d.note, d.backup])];
  overview.push([], ...trip.flights.map((f) => [f.label, f.text]));

  const stops = [['天', '日期', '時間', '停留(分)', '類型', '項目', '日文名稱', '介紹', '推薦理由', '營業時間', '公休', '費用', '備註', '地址', '電話', '資料來源', '參考來源'],
    ...trip.stops.map((s) => {
      const d = dayOf(s.day);
      return [`DAY ${s.day}`, d ? dayLabel(d.date) : '', s.time, s.stay ?? '', s.type, s.name, s.ja, s.intro, s.reason, s.hours, s.closed, s.fee, s.note, s.address, s.phone, s.source, s.verifySource];
    })];

  const stopName = (id) => trip.stops.find((s) => s.id === id)?.name || '';
  const parking = [['天', '日期', '放在哪一站下面', '停車場', '日文名稱', '地址', '停車費', '備註', '資料來源'],
    ...trip.days.flatMap((d) => (d.parking || []).map((p) => [`DAY ${d.n}`, dayLabel(d.date), stopName(p.at), p.name, p.ja, p.address, p.fee, p.note, p.source]))];

  const lodgeKeys = [...new Set(trip.lodging.flatMap((l) => Object.keys(l)))];
  const lodging = [['項目', ...trip.lodging.map((l) => l['名稱'] || '')],
    ...lodgeKeys.filter((k) => k !== '名稱').map((k) => [k, ...trip.lodging.map((l) => l[k] || '')])];

  const checklist = [['分類', '事項', '完成', '備註'], ...trip.checklist.map((c) => [c.cat, c.text, c.done ? 'Y' : 'N', c.note])];

  const who = (p) => ledger.names[p] || (p === 'me' ? '我' : '旅伴');
  const catName = (id) => ledger.categories.find((c) => c.id === id)?.name || '';
  const method = (m) => (m === 'cash' ? '現金' : ledger.cards.find((c) => c.id === m)?.name || '');
  const dateText = (d) => (d === 'pre' ? '出發前' : (() => { const day = trip.days.find((x) => x.date === d); return day ? `DAY ${day.n} ${dayLabel(d)}` : d; })());
  const order = (d) => (d === 'pre' ? '0' : d);
  const entries = liveEntries(ledger).slice().sort((a, b) => order(a.date).localeCompare(order(b.date)));
  const book = [['日期', '分類', '金額', '幣別', '換算台幣', '換算依據', '誰付', '付款方式', `${who('me')}負擔`, '備註', '帳單台幣'],
    ...entries.map((e) => {
      const { twd, basis } = toTWD(ledger, e);
      return [dateText(e.date), catName(e.cat), e.amount, e.currency === 'JPY' ? '日圓' : '台幣', Math.round(twd), BASIS[basis] || '',
        who(e.payer), method(e.method), `${Math.round(meShare(e) * 100)}%`, e.note, e.billTWD || ''];
    })];

  const sum = summarize(ledger);
  const b = sum.balance;
  const settle = [['項目', who('me'), who('mate')],
    ['墊付（台幣）', Math.round(sum.paid.me), Math.round(sum.paid.mate)],
    ['應負擔（台幣）', Math.round(sum.owe.me), Math.round(sum.owe.mate)],
    ['差額', Math.round(sum.paid.me - sum.owe.me), Math.round(sum.paid.mate - sum.owe.mate)],
    [],
    ['結算', b === 0 ? '兩邊扯平' : b > 0 ? `${who('mate')}要給${who('me')} NT$ ${Math.abs(b).toLocaleString('zh-TW')}` : `${who('me')}要給${who('mate')} NT$ ${Math.abs(b).toLocaleString('zh-TW')}`],
    ['日圓支出', Math.round(sum.jpy)], ['台幣支出', Math.round(sum.twdNative)], ['合計（換算台幣）', Math.round(sum.total)],
    ['現金匯率', ledger.cashRate], ['刷卡粗估匯率', ledger.cardRate],
    ...(sum.estimates ? [['提醒', `其中 ${sum.estimates} 筆刷卡是粗估，帳單出來補上後金額會變`]] : [])];

  const blob = buildXlsx([
    { name: '總覽', cols: [8, 14, 40, 26, 36, 36], rows: overview },
    { name: '每日行程', cols: [8, 12, 7, 8, 7, 34, 22, 40, 24, 22, 20, 16, 44, 30, 14, 30, 30], rows: stops },
    { name: '停車點', cols: [8, 12, 24, 34, 26, 30, 36, 50, 30], rows: parking },
    { name: '住宿', cols: [10, 50, 50], rows: lodging },
    { name: '出發前清單', cols: [16, 50, 6, 24], rows: checklist },
    { name: '帳本', cols: [20, 10, 10, 6, 10, 12, 8, 14, 10, 30, 10], rows: book },
    { name: '分帳結算', cols: [18, 30, 14], rows: settle },
  ]);
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const name = `北陸自駕-行程與帳本-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return name;
}
