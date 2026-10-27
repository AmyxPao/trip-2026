// 總覽、單日時間軸、單站面板與編輯
import { state, commit, uid, needsBackup, exportBackup } from './store.js';
import { icon } from './icons.js';
import { esc, openSheet, closeSheet, confirmTap, toast } from './ui.js';
import {
  TYPES, phase, daysUntil, todayDay, stopsOf, isMove, nextStop, md, weekday,
  navUrl, routeUrls, phoneOf, lodgingFor, destination, timeOrderIssue, nowHM, parkingQuery,
} from './trip.js';

const ui = { editing: false };

function shortStay(stay) {
  return stay.replace(/^高山\s*/, '').replace(/（.*?）/, '') || stay;
}

// ---------- 總覽 ----------
function masthead(trip) {
  const [name, sub] = trip.title.split('：');
  const ph = phase(trip);
  let stateHtml = '';
  if (ph === 'pre') {
    const n = daysUntil(trip);
    const f = trip.flights[0];
    stateHtml = `<div class="count"><b class="num">${n}</b><span>天後出發<small>${esc(f ? f.text : '')}</small></span></div>`;
  } else if (ph === 'during') {
    const d = todayDay(trip);
    const nx = d && nextStop(trip, d.n);
    const dest = nx && destination(trip, nx);
    const tel = nx && phoneOf(nx);
    stateHtml = `<div class="now-card"><a class="now" href="#/today"><span class="now-day">今天 · DAY <b class="num">${d.n}</b></span>
      <span class="now-next">${nx ? `下一站 <b class="num">${esc(nx.time)}</b> ${esc(nx.name.replace(/^★\s*/, ''))}` : '今天的行程走完了'}</span>${icon('next')}</a>
      ${dest || tel ? `<div class="now-acts">${dest ? `<a class="btn primary" href="${esc(navUrl(dest.q))}" target="_blank" rel="noopener">${icon('nav')}導航</a>` : ''}${tel ? `<a class="btn" href="tel:${esc(tel.replace(/-/g, ''))}">${icon('phone')}撥電話</a>` : ''}</div>` : ''}</div>`;
  } else {
    stateHtml = `<a class="now" href="#/ledger"><span class="now-day">旅程結束，歡迎回家</span><span class="now-next">看分帳結算</span>${icon('next')}</a>`;
  }
  return `<header class="mast">
    <div class="mast-row"><h1>${esc(name)}</h1><span class="offline-pill" hidden>${icon('offline')}離線中</span></div>
    <p class="mast-sub">${esc(sub || '')} · ${md(trip.start)}（${weekday(trip.start)}）– ${md(trip.end)}（${weekday(trip.end)}）</p>
    ${stateHtml}
  </header>`;
}

export function renderOverview() {
  const { trip } = state;
  const ph = phase(trip);
  const today = ph === 'during' ? todayDay(trip) : null;
  const rows = trip.days.map((d) => {
    const all = stopsOf(trip, d.n);
    const n = all.filter((s) => !isMove(s)).length;
    const count = n ? `${n} 站` : `${all.length} 段交通`;
    const stay = !d.stay || /^—/.test(d.stay) ? '' : `${icon('stay')}${esc(shortStay(d.stay))}<span class="dot">·</span>`;
    const cls = today && d.n === today.n ? 'is-today' : (today && d.n < today.n) || ph === 'post' ? 'is-past' : '';
    return `<li><a class="day-row ${cls}" href="#/day/${d.n}">
      <span class="dnum num"><small>DAY</small>${d.n}</span>
      <span class="dbody">
        <span class="ddate"><span class="num">${md(d.date)}</span> 週${weekday(d.date)}${cls === 'is-today' ? '<em>今天</em>' : ''}</span>
        <span class="dtitle">${esc(d.title)}</span>
        <span class="dmeta">${stay}${count}</span>
        ${d.note ? `<span class="dnote">${icon('alert')}${esc(d.note)}</span>` : ''}
      </span>
      ${icon('next', 'chev')}
    </a></li>`;
  }).join('');
  const backup = needsBackup()
    ? `<div class="nudge">${icon('download')}<span>手機上的修改還沒備份</span><button class="link" data-act="export">匯出備份</button></div>` : '';
  const flights = trip.flights.map((f) => `<li><span>${esc(f.label)}</span>${esc(f.text)}</li>`).join('');
  return `${masthead(trip)}${backup}<ol class="days">${rows}</ol><ul class="flights">${flights}</ul>`;
}

// ---------- 單日 ----------
export function renderDay(n, { isToday = false } = {}) {
  const { trip } = state;
  const d = trip.days.find((x) => x.n === n);
  if (!d) return `<div class="empty"><p>找不到這一天。</p><a class="btn" href="#/">回總覽</a></div>`;
  const ph = phase(trip);
  const live = ph === 'during' && todayDay(trip)?.n === n;
  const nx = live ? nextStop(trip, n) : null;
  const stops = stopsOf(trip, n);
  const routes = routeUrls(trip, n);
  const banner = isToday && ph !== 'during'
    ? `<p class="banner">${ph === 'pre' ? `還沒出發（${daysUntil(trip)} 天後）。出發當天這裡會直接顯示當天行程，現在先看 DAY 1。` : '旅程已經結束，這是最後一天的行程。'}</p>` : '';

  const hm = nowHM();
  const navBtn = (s) => {
    if (ui.editing) return '';
    const dest = destination(trip, s);
    return dest ? `<a class="icon-btn tl-nav" href="${esc(navUrl(dest.q))}" target="_blank" rel="noopener" aria-label="導航到${esc(dest.label)}">${icon('nav')}</a>` : '';
  };
  const parking = d.parking || [];
  const list = stops.map((s, i) => {
    const past = live && s.time && s.time < hm && !(nx && nx.id === s.id) ? ' is-past' : '';
    return stopRow(s, i, past) + parking.filter((p) => p.at === s.id).map((p) => parkingRow(d, p, past)).join('');
  }).join('');
  function stopRow(s, i, past) {
    const ctl = ui.editing ? `<span class="tl-ctl">
        <button class="icon-btn" data-act="move" data-id="${s.id}" data-dir="-1" aria-label="上移" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button class="icon-btn" data-act="move" data-id="${s.id}" data-dir="1" aria-label="下移" ${i === stops.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
        <span class="grip" data-grip="${s.id}" aria-hidden="true">${icon('grip')}</span>
      </span>` : '';
    if (isMove(s)) {
      return `<li class="tl tl-move${past}" data-id="${s.id}">
        <button class="tl-hit" data-act="${ui.editing ? 'edit-stop' : 'open-stop'}" data-id="${s.id}">
          <span class="tl-time num">${esc(s.time)}</span>
          <span class="tl-move-text">${icon('car')}<span>${esc(s.name)}</span></span>
        </button>${navBtn(s)}${ctl}</li>`;
    }
    const isNext = nx && nx.id === s.id;
    const meta = [s.hours && `營業 ${s.hours}`, s.closed && /休/.test(s.closed) && s.closed].filter(Boolean).join(' · ');
    return `<li class="tl tl-stop${isNext ? ' is-next' : ''}${past}" data-id="${s.id}">
      <button class="tl-hit" data-act="${ui.editing ? 'edit-stop' : 'open-stop'}" data-id="${s.id}">
        <span class="tl-time num">${esc(s.time)}${isNext ? '<em>下一站</em>' : ''}</span>
        <span class="tl-body">
          <span class="tl-name">${s.name.startsWith('★') ? icon('star', 'key') : ''}${esc(s.name.replace(/^★\s*/, ''))}</span>
          ${s.ja && s.ja !== s.name ? `<span class="tl-ja" lang="ja">${esc(s.ja)}</span>` : ''}
          ${meta ? `<span class="tl-meta">${esc(meta)}</span>` : ''}
        </span>
      </button>${isNext ? navBtn(s) : ''}${ctl}</li>`;
  }
  const loose = parking.filter((p) => !stops.some((s) => s.id === p.at));

  const notes = [d.note && ['注意', d.note], d.backup && ['備案', d.backup]].filter(Boolean)
    .map(([k, v]) => `<div class="dn"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

  const html = `
  <header class="bar">
    <a class="icon-btn" href="#/" aria-label="回總覽">${icon('back')}</a>
    <span class="bar-title">DAY <b class="num">${n}</b></span>
    <button class="bar-act ${ui.editing ? 'on' : ''}" data-act="toggle-edit">${ui.editing ? '完成' : `${icon('edit')}編輯`}</button>
  </header>
  ${banner}
  <section class="day-head">
    <p class="dh-date"><span class="num">${md(d.date)}</span> 週${weekday(d.date)}</p>
    <h1>${esc(d.title)}</h1>
    ${d.stay ? `<p class="dh-stay">${icon('stay')}住 ${esc(d.stay)}</p>` : ''}
    ${notes ? `<dl class="day-notes">${notes}</dl>` : ''}
    ${ui.editing ? `<div class="day-actions"><button class="btn" data-act="edit-day" data-day="${n}">${icon('edit')}改這一天的標題與住宿</button></div>` : ''}
    ${!ui.editing ? `<div class="day-actions">${routes.map((u, i) => `<a class="btn primary" href="${esc(u)}" target="_blank" rel="noopener">${icon('route')}今日路線${routes.length > 1 ? ` <span class="num">${i + 1}/${routes.length}</span>` : ''}</a>`).join('')}<button class="btn" data-act="new-entry" data-date="${d.date}">${icon('wallet')}記一筆</button></div>` : ''}
  </section>
  <ol class="timeline ${ui.editing ? 'editing' : ''}" data-day="${n}">${list}</ol>
  ${ui.editing ? `<div class="add-row"><button class="btn" data-act="add-stop" data-day="${n}">${icon('plus')}新增一站</button></div>` : ''}
  ${parkingSection(d, loose)}
  ${!ui.editing ? `<nav class="day-nav">${n > 1 ? `<a href="#/day/${n - 1}">${icon('back')}DAY ${n - 1}</a>` : '<span></span>'}${n < trip.days.length ? `<a href="#/day/${n + 1}">DAY ${n + 1}${icon('next')}</a>` : ''}</nav>` : ''}`;
  return html;
}

function parkingBody(p) {
  return `<span class="pk-name">${icon('parking')}${esc(p.name)}</span>
      ${p.fee ? `<span class="pk-fee">${esc(p.fee)}</span>` : ''}
      ${p.note ? `<span class="pk-note">${esc(p.note)}</span>` : ''}`;
}
function parkingNav(p) {
  const q = parkingQuery(p);
  return q ? `<a class="icon-btn pk-nav" href="${esc(navUrl(q))}" target="_blank" rel="noopener" aria-label="導航到${esc(p.name)}">${icon('nav')}</a>` : '';
}

// 掛在某一站下面的停車點：時間軸裡縮排一列，平常有導航鈕，編輯時點了就能改
function parkingRow(d, p, past) {
  if (ui.editing) {
    return `<li class="tl tl-park"><button class="pk-body pk-hit" data-act="edit-parking" data-day="${d.n}" data-id="${p.id}">${parkingBody(p)}</button></li>`;
  }
  return `<li class="tl tl-park${past}"><div class="pk-body">${parkingBody(p)}</div>${parkingNav(p)}</li>`;
}

// 沒指定站（或那一站被刪了）的停車點放在時間軸下方；編輯時這裡有「新增停車點」
function parkingSection(d, loose) {
  if (!loose.length && !ui.editing) return '';
  const rows = loose.map((p) => (ui.editing
    ? `<li class="pk"><button class="pk-body pk-hit" data-act="edit-parking" data-day="${d.n}" data-id="${p.id}">${parkingBody(p)}</button></li>`
    : `<li class="pk"><div class="pk-body">${parkingBody(p)}</div>${parkingNav(p)}</li>`)).join('');
  return `<section class="parking">
    ${rows ? `<h2>其他停車點</h2><ul class="pk-list">${rows}</ul>` : ''}
    ${ui.editing ? `<div class="pk-add"><button class="btn" data-act="add-parking" data-day="${d.n}">${icon('plus')}新增停車點</button></div>` : ''}
  </section>`;
}

// ---------- 編輯停車點 ----------
export function editParking(n, id) {
  const day = state.trip.days.find((x) => x.n === n);
  if (!day) return;
  const isNew = !id;
  const p = isNew
    ? { id: uid('p'), at: '', name: '', ja: '', address: '', fee: '', note: '', source: '' }
    : { ...day.parking.find((x) => x.id === id) };
  const places = stopsOf(state.trip, n).filter((s) => !isMove(s));
  openSheet(`
    <header class="sh-head"><div><h2>${isNew ? '新增停車點' : '編輯停車點'}</h2><p class="sh-meta">DAY ${n} · ${md(day.date)}（${weekday(day.date)}）</p></div>
      <button class="icon-btn" data-close aria-label="關閉">${icon('close')}</button></header>
    <form class="form" id="pk-form" novalidate>
      <label class="f full"><span>名稱</span><input name="name" value="${esc(p.name)}" placeholder="例：市營 神明停車場（三町老街）"></label>
      <label class="f full"><span>放在哪一站下面</span><select name="at">
        ${places.map((s) => `<option value="${s.id}" ${s.id === p.at ? 'selected' : ''}>${esc([s.time, s.name.replace(/^★\s*/, '')].filter(Boolean).join(' '))}</option>`).join('')}
        <option value="" ${places.some((s) => s.id === p.at) ? '' : 'selected'}>不指定（放在時間軸最下面）</option>
      </select></label>
      <label class="f full"><span>日文名稱（導航用）</span><input name="ja" value="${esc(p.ja)}" placeholder="例：市営神明駐車場"></label>
      <label class="f full"><span>地址（沒有日文名稱時用來導航）</span><input name="address" value="${esc(p.address)}"></label>
      <label class="f full"><span>停車費</span><input name="fee" value="${esc(p.fee)}" placeholder="例：每 30 分 150 円"></label>
      <label class="f full"><span>備註</span><textarea name="note" rows="3">${esc(p.note)}</textarea></label>
      <label class="f full"><span>資料來源（網址）</span><input name="source" type="url" value="${esc(p.source)}"></label>
      <p class="form-err" role="alert" hidden></p>
      <footer class="sh-foot sticky">
        ${isNew ? '<span></span>' : `<button type="button" class="btn danger" id="del">${icon('trash')}刪除</button>`}
        <button type="submit" class="btn primary">儲存</button>
      </footer>
    </form>`, (dlgEl) => {
    const f = dlgEl.querySelector('#pk-form');
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const next = { ...p };
      for (const k of ['at', 'name', 'ja', 'address', 'fee', 'note', 'source']) next[k] = f[k].value.trim();
      if (!next.name) {
        const err = f.querySelector('.form-err');
        err.textContent = '請填停車場名稱，例如「市營 神明停車場」。';
        err.hidden = false;
        f.name.focus();
        return;
      }
      commit(({ trip: t }) => {
        const list = t.days.find((x) => x.n === n).parking ||= [];
        const i = list.findIndex((x) => x.id === next.id);
        if (i >= 0) list[i] = next; else list.push(next);
      });
      closeSheet();
    });
    const del = dlgEl.querySelector('#del');
    if (del) confirmTap(del, () => {
      const idx = day.parking.findIndex((x) => x.id === p.id);
      const removed = day.parking[idx];
      const listOf = (t) => t.days.find((x) => x.n === n).parking;
      commit(({ trip: t }) => { listOf(t).splice(idx, 1); });
      closeSheet();
      toast('已刪除這個停車點', { label: '復原', run: () => commit(({ trip: t }) => { listOf(t).splice(Math.min(idx, listOf(t).length), 0, removed); }) });
    });
  });
}

export function afterDay() {
  if (ui.editing) bindDrag();
}

export function leaveDay() { ui.editing = false; }

// ---------- 單站面板 ----------
function field(label, value, cls = '') {
  return value ? `<div class="kv ${cls}"><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '';
}
function linkField(label, url) {
  if (!url) return '';
  const ok = /^https?:\/\//.test(url);
  return `<div class="kv"><dt>${label}</dt><dd>${ok ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 42))}…${icon('link')}</a>` : esc(url)}</dd></div>`;
}

export function openStop(id) {
  const s = state.trip.stops.find((x) => x.id === id);
  if (!s) return;
  const dest = destination(state.trip, s);
  const tel = phoneOf(s);
  const time = [s.time, s.stay ? `停留約 ${s.stay} 分` : ''].filter(Boolean).join(' · ');
  openSheet(`
    <header class="sh-head">
      <div><h2>${esc(s.name.replace(/^★\s*/, ''))}</h2>${s.ja ? `<p class="sh-ja" lang="ja">${esc(s.ja)}</p>` : ''}
      <p class="sh-meta num">DAY ${s.day} · ${esc(time)} · ${esc(s.type)}</p></div>
    </header>
    <div class="sh-actions">
      ${dest ? `<a class="btn primary" href="${esc(navUrl(dest.q))}" target="_blank" rel="noopener">${icon('nav')}導航到${esc(dest.label)}</a>` : '<span class="muted">目的地未定，填上日文名稱或地址就能導航</span>'}
      ${tel ? `<a class="btn" href="tel:${esc(tel.replace(/-/g, ''))}">${icon('phone')}${esc(tel)}</a>` : ''}
    </div>
    <dl class="kvs">
      ${field('營業時間', s.hours)}${field('公休', s.closed)}${field('費用', s.fee)}
      ${field('介紹', s.intro, 'long')}${field('推薦理由', s.reason)}${field('備註', s.note, 'long')}${field('地址', s.address)}
    </dl>
    ${s.source || s.verifySource ? `<dl class="kvs">${linkField('資料來源', s.source)}${linkField('參考來源', s.verifySource)}</dl>` : ''}
    <footer class="sh-foot">
      <button class="btn" data-close>關閉</button>
      <button class="btn" id="go-edit">${icon('edit')}編輯這一站</button>
    </footer>`, (d) => {
    d.querySelector('#go-edit').addEventListener('click', () => editStop(id));
  });
}

// ---------- 編輯 ----------
const FIELDS = [
  ['ja', '日文名稱（導航用）'], ['hours', '營業時間'], ['closed', '公休'], ['fee', '費用'], ['address', '地址'], ['phone', '電話'],
];
const LONG = [['intro', '介紹'], ['reason', '推薦理由'], ['note', '備註']];

export function editStop(id, newForDay) {
  const trip = state.trip;
  const isNew = !id;
  const s = isNew
    ? { id: uid('s'), day: newForDay, time: '', stay: null, type: '景點', name: '', ja: '', intro: '', reason: '', hours: '', closed: '', fee: '', note: '', address: '', source: '', phone: '', verifySource: '' }
    : { ...trip.stops.find((x) => x.id === id) };
  openSheet(`
    <header class="sh-head"><div><h2>${isNew ? `新增一站` : '編輯這一站'}</h2><p class="sh-meta">DAY ${s.day}${isNew ? '' : ` · ${esc(s.name.replace(/^★\s*/, ''))}`}</p></div>
      <button class="icon-btn" data-close aria-label="關閉">${icon('close')}</button></header>
    <form class="form" id="stop-form" novalidate>
      <label class="f full"><span>項目名稱</span><input name="name" required value="${esc(s.name)}" placeholder="例：午餐：味処古川"></label>
      <div class="f-row">
        <label class="f"><span>時間</span><input name="time" type="time" value="${esc(s.time)}"></label>
        <label class="f"><span>停留（分）</span><input name="stay" type="number" inputmode="numeric" min="0" step="5" value="${s.stay ?? ''}"></label>
      </div>
      <div class="f-row">
        <label class="f"><span>類型</span><select name="type">${TYPES.map((t) => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f"><span>哪一天</span><select name="day">${trip.days.map((d) => `<option value="${d.n}" ${d.n === s.day ? 'selected' : ''}>DAY ${d.n}（${md(d.date)}）</option>`).join('')}</select></label>
      </div>
      ${FIELDS.map(([k, l]) => `<label class="f full"><span>${l}</span><input name="${k}" value="${esc(s[k])}"></label>`).join('')}
      ${LONG.map(([k, l]) => `<label class="f full"><span>${l}</span><textarea name="${k}" rows="3">${esc(s[k])}</textarea></label>`).join('')}
      <label class="f full"><span>參考來源（網址）</span><input name="verifySource" type="url" value="${esc(s.verifySource)}"></label>
      <label class="f full"><span>資料來源（網址）</span><input name="source" type="url" value="${esc(s.source)}"></label>
      <p class="form-err" role="alert" hidden></p>
      <footer class="sh-foot">
        ${isNew ? '<span></span>' : `<button type="button" class="btn danger" id="del">${icon('trash')}刪除</button>`}
        <button type="submit" class="btn primary">儲存</button>
      </footer>
    </form>`, (d) => {
    const form = d.querySelector('#stop-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get('name')).trim();
      if (!name) {
        const err = form.querySelector('.form-err');
        err.textContent = '請填項目名稱，例如「午餐：味処古川」。';
        err.hidden = false;
        form.name.focus();
        return;
      }
      const next = { ...s };
      for (const [k, v] of fd.entries()) next[k] = typeof v === 'string' ? v.trim() : v;
      next.day = Number(next.day);
      next.stay = next.stay === '' ? null : Number(next.stay);
      commit(({ trip: t }) => {
        const i = t.stops.findIndex((x) => x.id === next.id);
        if (i >= 0 && t.stops[i].day === next.day) {
          t.stops[i] = next;
        } else {
          if (i >= 0) t.stops.splice(i, 1);
          insertByTime(t, next);
        }
      });
      closeSheet();
      if (Number(next.day) !== s.day && !isNew) location.hash = `#/day/${next.day}`;
    });
    const del = d.querySelector('#del');
    if (del) confirmTap(del, () => {
      const at = state.trip.stops.findIndex((x) => x.id === s.id);
      const removed = state.trip.stops[at];
      commit(({ trip: t }) => { t.stops.splice(at, 1); });
      closeSheet();
      toast('已刪除這一站', { label: '復原', run: () => commit(({ trip: t }) => { t.stops.splice(Math.min(at, t.stops.length), 0, removed); }) });
    });
  });
}

// ---------- 編輯一天：標題（主軸）、住宿、注意、備案 ----------
export function editDay(n) {
  const d = state.trip.days.find((x) => x.n === n);
  if (!d) return;
  openSheet(`
    <header class="sh-head"><div><h2>改這一天</h2><p class="sh-meta">DAY ${n} · ${md(d.date)}（${weekday(d.date)}）</p></div>
      <button class="icon-btn" data-close aria-label="關閉">${icon('close')}</button></header>
    <form class="form" id="day-form" novalidate>
      <label class="f full"><span>標題（總覽和這一天頁首顯示的主軸）</span><input name="title" value="${esc(d.title)}" placeholder="例：新穗高纜車 → 道之驛上宝 → 高山購物中心"></label>
      <label class="f full"><span>住宿</span><input name="stay" value="${esc(d.stay)}" placeholder="例：高山 Mine House（大新町）"></label>
      <label class="f full"><span>注意</span><textarea name="note" rows="2">${esc(d.note)}</textarea></label>
      <label class="f full"><span>備案</span><textarea name="backup" rows="2">${esc(d.backup)}</textarea></label>
      <p class="form-err" role="alert" hidden></p>
      <footer class="sh-foot sticky"><span></span><button type="submit" class="btn primary">儲存</button></footer>
    </form>`, (dlgEl) => {
    const f = dlgEl.querySelector('#day-form');
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const title = f.title.value.trim();
      if (!title) {
        const err = f.querySelector('.form-err');
        err.textContent = '標題不能空白，寫這一天的主要路線就好，例如「高山 → 白川鄉 → 金澤」。';
        err.hidden = false;
        f.title.focus();
        return;
      }
      commit(({ trip: t }) => {
        const day = t.days.find((x) => x.n === n);
        Object.assign(day, { title, stay: f.stay.value.trim(), note: f.note.value.trim(), backup: f.backup.value.trim() });
      });
      closeSheet();
      toast('這一天已更新');
    });
  });
}

// 新的站依時間插到那一天的適當位置；沒有時間就放最後
function insertByTime(t, stop) {
  const same = t.stops.map((x, i) => [x, i]).filter(([x]) => x.day === stop.day);
  let at = same.length ? same[same.length - 1][1] + 1 : t.stops.findIndex((x) => x.day > stop.day);
  if (stop.time) {
    const after = same.find(([x]) => x.time && x.time > stop.time);
    if (after) at = after[1];
  }
  if (at < 0) at = t.stops.length;
  t.stops.splice(at, 0, stop);
}

export function moveStop(id, dir) {
  commit(({ trip: t }) => {
    const s = t.stops.find((x) => x.id === id);
    const day = t.stops.filter((x) => x.day === s.day);
    const i = day.indexOf(s);
    const j = i + dir;
    if (j < 0 || j >= day.length) return;
    [day[i], day[j]] = [day[j], day[i]];
    reorderDay(t, s.day, day.map((x) => x.id));
  });
}

function reorderDay(t, n, ids) {
  const byId = new Map(t.stops.map((x) => [x.id, x]));
  const first = t.stops.findIndex((x) => x.day === n);
  const rest = t.stops.filter((x) => x.day !== n);
  rest.splice(first, 0, ...ids.map((id) => byId.get(id)));
  t.stops = rest;
}

// 拖曳把手：按住後上下移動，放開時存新順序
function bindDrag() {
  const list = document.querySelector('.timeline.editing');
  if (!list) return;
  list.querySelectorAll('[data-grip]').forEach((g) => {
    g.addEventListener('pointerdown', (e) => {
      const li = g.closest('li');
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      li.classList.add('dragging');
      const move = (ev) => {
        const sibs = [...list.children].filter((x) => x !== li);
        const target = sibs.find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
        list.insertBefore(li, target || null);
      };
      const up = () => {
        g.removeEventListener('pointermove', move);
        li.classList.remove('dragging');
        const ids = [...list.children].map((x) => x.dataset.id).filter(Boolean);
        commit(({ trip: t }) => reorderDay(t, Number(list.dataset.day), ids));
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up, { once: true });
      g.addEventListener('pointercancel', up, { once: true });
    });
  });
}

// 按「完成」離開編輯時，檢查時刻有沒有由早到晚
export function toggleEdit(n) {
  ui.editing = !ui.editing;
  if (ui.editing || !n) return;
  const issue = timeOrderIssue(state.trip, n);
  if (issue) toast(`時刻順序不對：${issue.after.time}「${issue.after.name.replace(/^★\s*/, '').slice(0, 10)}」排在 ${issue.before.time} 之後，請確認時間`);
}

export function doExport() {
  const name = exportBackup();
  toast(`已匯出 ${name}`);
}

export { lodgingFor };
