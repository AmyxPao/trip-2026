// 分帳：記帳、總帳、分類帳、日期帳、分帳帳目、設定
import { state, commit, uid, needsBackup } from './store.js';
import { icon } from './icons.js';
import { esc, stamp, openSheet, closeSheet, confirmTap, toast } from './ui.js';
import { summarize, toTWD, fmtTWD, fmtJPY, fmtAmount, liveEntries, PARTIES, DEFAULT_NAMES, customPcts } from './ledger.js';
import { sync, enabled as syncOn, configure, run as runSync, schedule, statusText } from './sync.js';
import { phase, todayDay, md, weekday } from './trip.js';

const ui = { tab: 'all', stampIn: null };
const TABS = [['all', '總帳'], ['cat', '分類'], ['date', '日期'], ['split', '分帳']];

const L = () => state.ledger;
const liveCount = () => liveEntries(L()).length;
const now = () => new Date().toISOString();
// 帳有異動：記下時間、標成待上傳
const touch = (e) => { e.updatedAt = now(); e._dirty = true; return e; };
const touchSettings = (ledger) => { ledger.settingsUpdatedAt = now(); ledger._settingsDirty = true; };
const catName = (id) => L().categories.find((c) => c.id === id)?.name || '未分類';
const methodName = (m) => (m === 'cash' ? '現金' : L().cards.find((c) => c.id === m)?.name || '已刪除的卡');
const who = (p) => L().names[p] || DEFAULT_NAMES[p];
// 三方各自的印章：字、顏色
const STAMP = { me: ['鮑', 'me'], zhao: ['趙', 'mate'], aunts: ['姨', 'call'] };
const pstamp = (p, size, seed = p, extra = {}) => stamp(STAMP[p][0], STAMP[p][1], { size, seed, ...extra });
const splitText = (split) => {
  if (split?.type !== 'custom') return '';
  const c = customPcts(split);
  return ` · ${PARTIES.map((p) => `${who(p)} ${Math.round(c[p] * 10) / 10}%`).join('、')}`;
};

function dateLabel(d) {
  if (d === 'pre') return '出發前';
  const day = state.trip.days.find((x) => x.date === d);
  return day ? `DAY ${day.n} · ${md(d)}（${weekday(d)}）` : md(d);
}
function dateOrder(d) { return d === 'pre' ? '0' : d; }

function payerStamp(e, size = 30) {
  return pstamp(e.payer, size, e.id, { label: `${who(e.payer)}付`, cls: ui.stampIn === e.id ? 'stamp-in' : '' });
}

function entryRow(e) {
  const { twd, basis } = toTWD(L(), e);
  const conv = e.currency === 'JPY'
    ? `<span class="en-twd num">≈ ${fmtTWD(twd)}${basis === 'est' ? stamp('估', 'sec', { size: 22, seed: e.id + 'r', label: '粗估匯率' }) : basis === 'bill' || basis === 'card' ? stamp('実', 'me', { size: 22, seed: e.id + 'r', label: '實際匯率', cls: ui.stampIn === e.id ? 'stamp-in' : '' }) : ''}</span>` : '';
  const split = splitText(e.split);
  return `<li><button class="entry" data-act="edit-entry" data-id="${e.id}">
    <span class="en-stamp">${payerStamp(e)}</span>
    <span class="en-body"><span class="en-cat">${esc(catName(e.cat))}${e.note ? `<span class="en-note">${esc(e.note)}</span>` : ''}</span>
      <span class="en-meta">${esc(methodName(e.method))}${split}</span></span>
    <span class="en-amt"><b class="num">${fmtAmount(e)}</b>${conv}</span>
  </button></li>`;
}

function settleBlock(sum) {
  const n = liveCount();
  if (!n) return `<section class="settle empty-settle"><p class="settle-who">還沒有任何一筆帳</p><p class="settle-hint">停好車、結完帳，按右下角「記帳」，幾秒就記完。</p></section>`;
  const settled = L().settled;
  const done = settled && settled.key === sum.key;
  const lines = sum.transfers.length
    ? sum.transfers.map((t) => `<p class="settle-who">${esc(who(t.from))}要給${esc(who(t.to))}</p>
    <p class="settle-amt num">${fmtTWD(t.amount)}</p>`).join('')
    : `<p class="settle-who">三方剛好扯平</p><p class="settle-amt num">NT$ 0</p>`;
  return `<section class="settle ${done ? 'is-done' : ''}">
    ${lines}
    ${sum.estimates ? `<p class="settle-hint">其中 ${sum.estimates} 筆刷卡是用 ${L().cardRate} 粗估，帳單出來補上台幣後金額會再變。</p>` : ''}
    ${settled && !done ? `<p class="settle-hint">${md(settled.at.slice(0, 10))} 結清後又有新的帳，差額已重新計算。</p>` : ''}
    ${done ? `<span class="settle-stamp">${stamp('済', 'ok', { size: 76, seed: 'settled', label: '已結清', cls: ui.stampIn === 'settled' ? 'stamp-in' : '' })}</span>` : ''}
  </section>`;
}

function viewAll(sum) {
  const groups = [...sum.byDate.entries()].sort((a, b) => dateOrder(b[0]).localeCompare(dateOrder(a[0])));
  return `<dl class="totals">
      <div><dt>日圓支出</dt><dd class="num">${fmtJPY(sum.jpy)}</dd></div>
      <div><dt>台幣支出</dt><dd class="num">${fmtTWD(sum.twdNative)}</dd></div>
      <div class="grand"><dt>合計（換算台幣）</dt><dd class="num">${fmtTWD(sum.total)}</dd></div>
    </dl>
    ${groups.map(([d, g]) => `<section class="eg"><h3>${esc(dateLabel(d))}<span class="num">${fmtTWD(g.total)}</span></h3>
      <ul class="entries">${g.entries.slice().reverse().map(entryRow).join('')}</ul></section>`).join('')}`;
}

function viewCat(sum) {
  const rows = [...sum.byCat.entries()].sort((a, b) => b[1] - a[1]);
  return `<ul class="bars">${rows.map(([c, v]) => {
    const pct = sum.total ? (v / sum.total) * 100 : 0;
    return `<li><span class="bar-name">${esc(catName(c))}</span><span class="bar-val num">${fmtTWD(v)}<small>${pct.toFixed(0)}%</small></span>
      <span class="bar-track"><i style="width:${pct.toFixed(1)}%"></i></span></li>`;
  }).join('')}</ul>`;
}

function viewDate(sum) {
  const keys = ['pre', ...state.trip.days.map((d) => d.date)];
  const extra = [...sum.byDate.keys()].filter((k) => !keys.includes(k)).sort();
  return `<ul class="dates">${[...keys, ...extra].map((k) => {
    const g = sum.byDate.get(k);
    if (!g) return `<li class="dz"><span>${esc(dateLabel(k))}</span><span class="muted">沒有支出</span></li>`;
    return `<li><details><summary><span>${esc(dateLabel(k))}</span><span class="num">${fmtTWD(g.total)}<small>${g.entries.length} 筆</small></span>${icon('down', 'chev')}</summary>
      <ul class="entries">${g.entries.map(entryRow).join('')}</ul></details></li>`;
  }).join('')}</ul>`;
}

function viewSplit(sum) {
  const row = (p) => `<tr><th scope="row">${pstamp(p, 26)}${esc(who(p))}</th>
    <td class="num">${fmtTWD(sum.paid[p])}</td><td class="num">${fmtTWD(sum.owe[p])}</td><td class="num">${fmtTWD(sum.net[p])}</td></tr>`;
  const settled = L().settled;
  const pay = sum.transfers.map((t) => `<li>${esc(who(t.from))} → ${esc(who(t.to))}<b class="num">${fmtTWD(t.amount)}</b></li>`).join('');
  return `<table class="split"><thead><tr><th></th><th scope="col">墊付</th><th scope="col">應負擔</th><th scope="col">淨額</th></tr></thead>
    <tbody>${PARTIES.map(row).join('')}</tbody></table>
    <p class="split-note">應負擔＝每一筆依分攤比例算出的份額（均分照人頭：鮑 20%、趙 20%、阿姨們 60%）。淨額為正，代表別人要給他；為負，代表他要給別人。</p>
    <h3 class="split-h">誰該付給誰</h3>
    ${pay ? `<ul class="transfers">${pay}</ul>` : '<p class="split-note">三方剛好扯平，不用互相給錢。</p>'}
    ${liveCount() ? `<div class="split-act">${settled && settled.key === sum.key
      ? `<button class="btn" data-act="unsettle">取消結清標記</button>`
      : `<button class="btn primary" data-act="settle">已經給完錢了，標記結清</button>`}</div>` : ''}`;
}

export function renderLedger() {
  const sum = summarize(L());
  const body = { all: viewAll, cat: viewCat, date: viewDate, split: viewSplit }[ui.tab](sum);
  const html = `<header class="bar"><span class="bar-title">分帳</span>
      <button class="bar-act" data-act="ledger-settings">${icon('settings')}設定</button></header>
    ${settleBlock(sum)}
    ${syncLine()}
    ${liveCount() ? `<div class="seg" role="tablist">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${ui.tab === k}" data-act="ledger-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="ledger-body">${body}</div>` : ''}
    <button class="fab" data-act="new-entry">${icon('plus')}記帳</button>`;
  return html;
}
export function afterLedger() { if (ui.stampIn) setTimeout(() => { ui.stampIn = null; }, 50); }
export function setLedgerTab(t) { ui.tab = t; }

export function settle(on) {
  ui.stampIn = on ? 'settled' : null;
  commit(({ ledger }) => {
    ledger.settled = on ? { at: new Date().toISOString(), key: summarize(ledger).key } : null;
    touchSettings(ledger);
  });
  schedule();
}

// ---------- 記帳／改一筆 ----------
function defaultDate() {
  const ph = phase(state.trip);
  if (ph === 'during') return todayDay(state.trip).date;
  if (ph === 'post') return state.trip.end;
  return 'pre';
}

export function editEntry(id, preset = {}) {
  const led = L();
  const isNew = !id;
  const e = isNew
    ? { id: uid('e'), date: preset.date || defaultDate(), amount: '', currency: 'JPY', cat: led.categories[0]?.id, payer: 'me', method: 'cash', split: { type: 'even' }, note: '', billTWD: null }
    : structuredClone(led.entries.find((x) => x.id === id));
  const dates = ['pre', ...state.trip.days.map((d) => d.date)];
  if (!dates.includes(e.date)) dates.push(e.date);
  const radio = (name, val, cur, label, extra = '') => `<label class="chip"><input type="radio" name="${name}" value="${esc(val)}" ${String(cur) === String(val) ? 'checked' : ''}>${extra}<span>${label}</span></label>`;
  // 分類先顯示最常用的 4 個（目前選的一定在裡面），其餘收在「更多」
  const used = new Map();
  liveEntries(led).forEach((x) => used.set(x.cat, (used.get(x.cat) || 0) + 1));
  const ranked = led.categories.map((c, i) => ({ c, i, n: used.get(c.id) || 0 })).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.c);
  const top = ranked.slice(0, 4);
  if (!top.some((c) => c.id === e.cat)) top[3] = ranked.find((c) => c.id === e.cat) || top[3];
  const rest = led.categories.filter((c) => !top.includes(c));
  const cp = customPcts(e.split);
  const splitLabel = (t, me, zhao) => {
    if (t !== 'custom') return '均分';
    const c = customPcts({ me, zhao });
    return `${who('me')} ${c.me}%・${who('zhao')} ${c.zhao}%・${who('aunts')} ${c.aunts}%`;
  };
  const summary = () => `${methodName(e.method)} · ${dateLabel(e.date).split(' · ')[0]} · ${splitLabel(e.split.type, cp.me, cp.zhao)}`;

  openSheet(`
    <header class="sh-head"><div><h2>${isNew ? '記帳' : '修改這筆帳'}</h2></div>
      <button class="icon-btn" data-close aria-label="關閉">${icon('close')}</button></header>
    <form class="form" id="entry-form" novalidate>
      <div class="amt-row">
        <label class="f amt"><span>金額</span><input name="amount" inputmode="decimal" autocomplete="off" value="${e.amount}" placeholder="0" required></label>
        <div class="cur" role="radiogroup" aria-label="幣別">${radio('currency', 'JPY', e.currency, '日圓')}${radio('currency', 'TWD', e.currency, '台幣')}</div>
      </div>
      <fieldset class="f full"><legend>分類</legend><div class="chips">${top.map((c) => radio('cat', c.id, e.cat, esc(c.name))).join('')}
        ${rest.length ? `<button type="button" class="chip-more" id="more-cats">更多（${rest.length}）</button>` : ''}</div>
        ${rest.length ? `<div class="chips" id="rest-cats" hidden>${rest.map((c) => radio('cat', c.id, e.cat, esc(c.name))).join('')}</div>` : ''}</fieldset>
      <fieldset class="f full"><legend>誰先付</legend><div class="chips">
        ${PARTIES.map((p) => radio('payer', p, e.payer, esc(who(p)), pstamp(p, 24))).join('')}</div></fieldset>
      <details class="more-opts" ${isNew ? '' : 'open'}>
      <summary><span class="mo-label">付款・日期・怎麼分</span><span class="mo-sum">${esc(summary())}</span><span class="mo-edit">更改</span></summary>
      <div class="more-body">
      <div class="f-row">
        <label class="f"><span>付款方式</span><select name="method">
          <option value="cash" ${e.method === 'cash' ? 'selected' : ''}>現金</option>
          ${led.cards.map((c) => `<option value="${c.id}" ${e.method === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          <option value="__new">＋ 新增一張卡…</option></select></label>
        <label class="f"><span>日期</span><select name="date">${dates.map((d) => `<option value="${d}" ${d === e.date ? 'selected' : ''}>${esc(dateLabel(d))}</option>`).join('')}</select></label>
      </div>
      <label class="f full new-card" hidden><span>新卡片名稱</span><input name="newCard" placeholder="例：我的國泰卡"></label>
      <label class="f full bill" ${e.currency === 'JPY' && e.method !== 'cash' ? '' : 'hidden'}><span>帳單上的台幣（帳單出來再補）</span>
        <input name="billTWD" inputmode="decimal" value="${e.billTWD ?? ''}" placeholder="還沒出帳就留空，先用 ${led.cardRate} 估">
        <small>補上後，同一天同一張卡的其他筆會改用反推出的匯率重算。</small></label>
      <fieldset class="f full"><legend>怎麼分</legend><div class="chips">
        ${radio('split', 'even', e.split.type, '均分（照人頭 20/20/60）')}${radio('split', 'custom', e.split.type, '自訂')}</div>
        <div class="f-row custom" ${e.split.type === 'custom' ? '' : 'hidden'}>
          <label class="f"><span>${esc(who('me'))}負擔（%）</span><input name="splitMe" type="number" inputmode="decimal" min="0" max="100" step="any" value="${e.split.type === 'custom' ? cp.me : 20}"></label>
          <label class="f"><span>${esc(who('zhao'))}負擔（%）</span><input name="splitZhao" type="number" inputmode="decimal" min="0" max="100" step="any" value="${e.split.type === 'custom' ? cp.zhao : 20}"></label>
        </div>
        <p class="custom split-rest" ${e.split.type === 'custom' ? '' : 'hidden'}></p>
      </fieldset>
      </div></details>
      <label class="f full"><span>備註</span><input name="note" value="${esc(e.note)}" placeholder="例：丸明 燒肉、城端 SA 加油"></label>
      <p class="form-err" role="alert" hidden></p>
      <footer class="sh-foot sticky">
        ${isNew ? '<span></span>' : `<button type="button" class="btn danger" id="del">${icon('trash')}刪除</button>`}
        <button type="submit" class="btn primary">${isNew ? '記下來' : '儲存'}</button>
      </footer>
    </form>`, (d) => {
    const f = d.querySelector('#entry-form');
    const sync = () => {
      const cur = f.currency.value;
      const m = f.method.value;
      f.querySelector('.new-card').hidden = m !== '__new';
      f.querySelector('.bill').hidden = !(cur === 'JPY' && m !== 'cash');
      const custom = f.split.value === 'custom';
      d.querySelectorAll('.custom').forEach((x) => { x.hidden = !custom; });
      const me = Number(f.splitMe.value) || 0;
      const zhao = Number(f.splitZhao.value) || 0;
      const rest = Math.round((100 - me - zhao) * 10) / 10;
      const rp = d.querySelector('.split-rest');
      rp.textContent = `${who('aunts')}負擔 ${rest}%（自動＝100 − ${who('me')} − ${who('zhao')}）`;
      rp.classList.toggle('is-bad', rest < 0);
      const m2 = m === '__new' ? (f.newCard.value.trim() || '新卡片') : methodName(m);
      f.querySelector('.mo-sum').textContent = `${m2} · ${dateLabel(f.date.value).split(' · ')[0]} · ${splitLabel(f.split.value, f.splitMe.value, f.splitZhao.value)}`;
    };
    d.querySelector('#more-cats')?.addEventListener('click', (ev) => { d.querySelector('#rest-cats').hidden = false; ev.currentTarget.remove(); });
    f.addEventListener('change', sync);
    f.addEventListener('input', sync);
    sync();
    if (isNew) setTimeout(() => f.amount.focus(), 220);
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const err = f.querySelector('.form-err');
      const amount = Number(String(f.amount.value).replace(/[,\s]/g, ''));
      if (!(amount > 0)) { err.textContent = '請輸入大於 0 的金額。'; err.hidden = false; f.amount.focus(); return; }
      let method = f.method.value;
      let newCard = null;
      if (method === '__new') {
        const name = f.newCard.value.trim();
        if (!name) { err.textContent = '請幫新卡片取個名字，例如「我的國泰卡」。'; err.hidden = false; f.newCard.focus(); return; }
        newCard = { id: uid('card'), name };
        method = newCard.id;
      }
      const billRaw = String(f.billTWD.value).replace(/[,\s]/g, '');
      const bill = f.currency.value === 'JPY' && method !== 'cash' && billRaw ? Number(billRaw) : null;
      if (billRaw && !(bill > 0) && !f.querySelector('.bill').hidden) { err.textContent = '帳單台幣要是大於 0 的數字，還沒出帳就留空。'; err.hidden = false; return; }
      const splitMe = Number(f.splitMe.value) || 0;
      const splitZhao = Number(f.splitZhao.value) || 0;
      if (f.split.value === 'custom') {
        if (splitMe < 0 || splitZhao < 0 || splitMe > 100 || splitZhao > 100) { err.textContent = '負擔比例要在 0 到 100 之間。'; err.hidden = false; return; }
        if (splitMe + splitZhao > 100) { err.textContent = `${who('me')}加${who('zhao')}的比例不能超過 100%，目前是 ${Math.round((splitMe + splitZhao) * 10) / 10}%。`; err.hidden = false; return; }
      }
      const next = {
        ...e, amount, currency: f.currency.value, cat: f.cat.value, payer: f.payer.value, method, date: f.date.value,
        split: f.split.value === 'custom' ? { type: 'custom', me: splitMe, zhao: splitZhao } : { type: 'even' }, note: f.note.value.trim(), billTWD: bill,
      };
      const becameReal = bill && !(e.billTWD > 0);
      ui.stampIn = isNew || becameReal ? next.id : null;
      commit(({ ledger }) => {
        if (newCard) { ledger.cards.push(newCard); touchSettings(ledger); }
        touch(next);
        const i = ledger.entries.findIndex((x) => x.id === next.id);
        if (i >= 0) ledger.entries[i] = next; else ledger.entries.push(next);
      });
      schedule();
      closeSheet();
      toast(becameReal ? '已補上帳單金額，同日同卡的帳已重算' : isNew ? '記下來了' : '已儲存');
    });
    const del = d.querySelector('#del');
    if (del) confirmTap(del, () => {
      // 不真的刪掉：標成已刪除，其他裝置同步時才知道要拿掉
      const setDeleted = (flag) => {
        commit(({ ledger }) => { const x = ledger.entries.find((y) => y.id === e.id); if (x) touch(Object.assign(x, { deleted: flag })); });
        schedule();
      };
      setDeleted(true);
      closeSheet();
      toast('已刪除這筆帳', { label: '復原', run: () => setDeleted(false) });
    });
  });
}

// ---------- 設定：名字、匯率、分類、卡片 ----------
export function ledgerSettings() {
  const led = L();
  const count = (field, id) => liveEntries(led).filter((x) => x[field] === id).length;
  const catRows = led.categories.map((c) => `<li data-id="${c.id}">
      <input aria-label="分類名稱" value="${esc(c.name)}" data-rename="cat">
      <button type="button" class="icon-btn" data-del="cat" aria-label="刪除分類 ${esc(c.name)}">${icon('trash')}</button>
      ${count('cat', c.id) ? `<div class="reassign" hidden><span>這個分類有 ${count('cat', c.id)} 筆帳，改歸到</span>
        <select>${led.categories.filter((x) => x.id !== c.id).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
        <button type="button" class="btn danger" data-confirm="cat">移過去並刪除</button></div>` : ''}</li>`).join('');
  const cardRows = led.cards.map((c) => `<li data-id="${c.id}">
      <input aria-label="卡片名稱" value="${esc(c.name)}" data-rename="card">
      <button type="button" class="icon-btn" data-del="card" aria-label="刪除卡片 ${esc(c.name)}">${icon('trash')}</button>
      ${count('method', c.id) ? `<div class="reassign" hidden><span>這張卡有 ${count('method', c.id)} 筆帳，不能刪除；可以改名。</span></div>` : ''}</li>`).join('');

  openSheet(`
    <header class="sh-head"><div><h2>分帳設定</h2></div><button class="icon-btn" data-close aria-label="關閉">${icon('close')}</button></header>
    <form class="form" id="set-form" novalidate>
      <div class="f-row">
        <label class="f"><span>第一位的稱呼</span><input name="me" value="${esc(led.names.me)}"></label>
        <label class="f"><span>第二位的稱呼</span><input name="zhao" value="${esc(led.names.zhao)}"></label>
      </div>
      <div class="f-row">
        <label class="f"><span>第三方的稱呼</span><input name="aunts" value="${esc(led.names.aunts)}"></label>
        <span></span>
      </div>
      <div class="f-row">
        <label class="f"><span>現金匯率（1 日圓＝台幣）</span><input name="cashRate" inputmode="decimal" value="${led.cashRate}"></label>
        <label class="f"><span>刷卡粗估匯率</span><input name="cardRate" inputmode="decimal" value="${led.cardRate}"></label>
      </div>
      <fieldset class="f full"><legend>分類</legend><ul class="manage" id="cats">${catRows}</ul>
        <div class="add-inline"><input id="new-cat" placeholder="新分類名稱，例：伴手禮"><button type="button" class="btn" id="add-cat">${icon('plus')}新增</button></div></fieldset>
      <fieldset class="f full"><legend>信用卡</legend>${led.cards.length ? `<ul class="manage" id="cards">${cardRows}</ul>` : '<p class="muted">還沒有卡片。記帳時在「付款方式」選「新增一張卡」。</p>'}</fieldset>
      <fieldset class="f full sync-set"><legend>雲端同步</legend>
        <p class="muted">帳和停車點會存到同步伺服器，換瀏覽器或換手機都能看到同一份。沒有網路時改的，連上後自動補傳。</p>
        <label class="f"><span>同步網址</span><input name="syncUrl" type="url" inputmode="url" autocomplete="off" value="${esc(sync.url)}" placeholder="https://…/api/sync"></label>
        <label class="f"><span>密語（和伺服器設定的一樣）</span><input name="syncSecret" autocomplete="off" value="${esc(sync.secret)}"></label>
        <div class="sh-actions"><button type="button" class="btn" id="sync-connect">${icon('cloud')}${syncOn() ? '儲存並同步' : '連線並同步'}</button>
          ${syncOn() ? '<button type="button" class="link danger-link" id="sync-off">停用同步</button>' : ''}</div>
        <p class="sync-msg" role="status">${esc(statusText())}</p>
        <p class="muted">網址和密語只存在這個瀏覽器，不會放進備份檔，也不會放到網站上。</p>
      </fieldset>
      <p class="form-err" role="alert" hidden></p>
      <footer class="sh-foot"><span></span><button type="submit" class="btn primary">儲存設定</button></footer>
    </form>`, (d) => {
    const f = d.querySelector('#set-form');
    d.querySelector('#add-cat').addEventListener('click', () => {
      const inp = d.querySelector('#new-cat');
      const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      commit(({ ledger }) => { ledger.categories.push({ id: uid('k'), name }); touchSettings(ledger); });
      schedule();
      ledgerSettings();
    });
    d.querySelectorAll('[data-del]').forEach((b) => {
      const li = b.closest('li');
      const kind = b.dataset.del;
      const reassign = li.querySelector('.reassign');
      if (reassign) { b.addEventListener('click', () => { reassign.hidden = !reassign.hidden; }); return; }
      confirmTap(b, () => {
        commit(({ ledger }) => {
          if (kind === 'cat') ledger.categories = ledger.categories.filter((x) => x.id !== li.dataset.id);
          else ledger.cards = ledger.cards.filter((x) => x.id !== li.dataset.id);
          touchSettings(ledger);
        });
        schedule();
        ledgerSettings();
      }, '確認');
    });
    d.querySelectorAll('[data-confirm="cat"]').forEach((b) => b.addEventListener('click', () => {
      const li = b.closest('li');
      const to = li.querySelector('select').value;
      commit(({ ledger }) => {
        ledger.entries.forEach((x) => { if (x.cat === li.dataset.id) touch(Object.assign(x, { cat: to })); });
        ledger.categories = ledger.categories.filter((x) => x.id !== li.dataset.id);
        touchSettings(ledger);
      });
      schedule();
      ledgerSettings();
    }));
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const err = f.querySelector('.form-err');
      const cash = Number(f.cashRate.value);
      const card = Number(f.cardRate.value);
      if (!(cash > 0 && cash < 1 && card > 0 && card < 1)) { err.textContent = '匯率要填 1 日圓換多少台幣，例如 0.22。'; err.hidden = false; return; }
      commit(({ ledger }) => {
        touchSettings(ledger);
        ledger.names = { me: f.me.value.trim() || DEFAULT_NAMES.me, zhao: f.zhao.value.trim() || DEFAULT_NAMES.zhao, aunts: f.aunts.value.trim() || DEFAULT_NAMES.aunts };
        ledger.cashRate = cash;
        ledger.cardRate = card;
        d.querySelectorAll('[data-rename]').forEach((inp) => {
          const id = inp.closest('li').dataset.id;
          const list = inp.dataset.rename === 'cat' ? ledger.categories : ledger.cards;
          const item = list.find((x) => x.id === id);
          if (item && inp.value.trim()) item.name = inp.value.trim();
        });
      });
      schedule();
      closeSheet();
      toast('設定已儲存');
    });
    const msg = d.querySelector('.sync-msg');
    d.querySelector('#sync-connect').addEventListener('click', async () => {
      const url = f.syncUrl.value.trim();
      const secret = f.syncSecret.value.trim();
      if (!/^https:\/\/.+\/api\/sync$/.test(url)) { msg.textContent = '網址要是 https 開頭、/api/sync 結尾，例：https://trip.example.com/api/sync'; f.syncUrl.focus(); return; }
      if (!secret) { msg.textContent = '請填密語，要和伺服器設定的一樣。'; f.syncSecret.focus(); return; }
      configure(url, secret);
      msg.textContent = '連線中…';
      await runSync();
      msg.textContent = sync.status === 'ok' ? `連線成功，${statusText()}` : statusText();
    });
    d.querySelector('#sync-off')?.addEventListener('click', () => {
      configure('', '');
      toast('已停用雲端同步；這個瀏覽器裡的資料都還在');
      ledgerSettings();
    });
  });
}

// 分帳頁頂部的同步狀態
function syncLine() {
  // 沒開同步：帳只在這支手機，很久沒匯出就提醒
  if (!syncOn()) {
    if (!liveCount() || !needsBackup()) return '';
    return `<div class="sync-line is-warn">${icon('download')}<span>帳只存在這支手機，${state.meta.exportedAt ? '已經超過一天沒備份' : '還沒備份過'}</span>
      <button class="link" data-act="export">匯出備份</button></div>`;
  }
  return `<div class="sync-line is-${sync.status}">${icon('cloud')}<span>${esc(statusText())}</span>
    <button class="link" data-act="sync-now" ${sync.status === 'syncing' ? 'disabled' : ''}>立即同步</button></div>`;
}
