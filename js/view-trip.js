// 總覽、單日時間軸、單站面板與編輯
import { state, commit, uid, needsBackup, exportBackup } from './store.js';
import { icon } from './icons.js';
import { esc, stamp, openSheet, closeSheet, confirmTap, toast } from './ui.js';
import {
  STATUS, TYPES, phase, daysUntil, todayDay, stopsOf, isMove, nextStop, md, weekday,
  placeQuery, navUrl, routeUrls, phoneOf, lodgingFor,
} from './trip.js';

const ui = { editing: false, stampIn: null };

function statusStamp(s, size) {
  const st = STATUS[s.status];
  if (!st || !st.ch) return '';
  const big = s.name.startsWith('★');
  return stamp(st.ch, s.status, {
    size: size || (big ? 44 : 38), seed: s.id, label: st.label,
    cls: (big ? 'is-key ' : '') + (ui.stampIn === s.id ? 'stamp-in' : ''),
  });
}

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
    stateHtml = `<a class="now" href="#/today"><span class="now-day">今天 · Day <b class="num">${d.n}</b></span>
      <span class="now-next">${nx ? `下一站 <b class="num">${esc(nx.time)}</b> ${esc(nx.name.replace(/^★\s*/, ''))}` : '今天的行程走完了'}</span>${icon('next')}</a>`;
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
    const stay = /^—/.test(d.stay) ? '' : `${icon('stay')}${esc(shortStay(d.stay))}<span class="dot">·</span>`;
    const cls = today && d.n === today.n ? 'is-today' : (today && d.n < today.n) || ph === 'post' ? 'is-past' : '';
    return `<li><a class="day-row ${cls}" href="#/day/${d.n}">
      <span class="dnum num">${d.n}</span>
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
    ? `<p class="banner">${ph === 'pre' ? `還沒出發（${daysUntil(trip)} 天後）。出發當天這裡會直接顯示當天行程，現在先看 Day 1。` : '旅程已經結束，這是最後一天的行程。'}</p>` : '';

  const list = stops.map((s, i) => {
    const ctl = ui.editing ? `<span class="tl-ctl">
        <button class="icon-btn" data-act="move" data-id="${s.id}" data-dir="-1" aria-label="上移" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button class="icon-btn" data-act="move" data-id="${s.id}" data-dir="1" aria-label="下移" ${i === stops.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
        <span class="grip" data-grip="${s.id}" aria-hidden="true">${icon('grip')}</span>
      </span>` : '';
    if (isMove(s)) {
      return `<li class="tl tl-move" data-id="${s.id}">
        <button class="tl-hit" data-act="${ui.editing ? 'edit-stop' : 'open-stop'}" data-id="${s.id}">
          <span class="tl-time num">${esc(s.time)}</span>
          <span class="tl-move-text">${icon('car')}<span>${esc(s.name)}</span></span>
        </button>${ctl}</li>`;
    }
    const isNext = nx && nx.id === s.id;
    const meta = [s.hours && `營業 ${s.hours}`, s.closed && /休/.test(s.closed) && s.closed].filter(Boolean).join(' · ');
    return `<li class="tl tl-stop ${isNext ? 'is-next' : ''}" data-id="${s.id}">
      <button class="tl-hit" data-act="${ui.editing ? 'edit-stop' : 'open-stop'}" data-id="${s.id}">
        <span class="tl-time num">${esc(s.time)}${isNext ? '<em>下一站</em>' : ''}</span>
        <span class="tl-body">
          <span class="tl-name">${s.name.startsWith('★') ? icon('star', 'key') : ''}${esc(s.name.replace(/^★\s*/, ''))}</span>
          ${s.ja && s.ja !== s.name ? `<span class="tl-ja" lang="ja">${esc(s.ja)}</span>` : ''}
          ${meta ? `<span class="tl-meta">${esc(meta)}</span>` : ''}
        </span>
        <span class="tl-stamp">${statusStamp(s)}</span>
      </button>${ctl}</li>`;
  }).join('');

  const notes = [d.note && ['注意', d.note], d.backup && ['備案', d.backup]].filter(Boolean)
    .map(([k, v]) => `<div class="dn"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

  const html = `
  <header class="bar">
    <a class="icon-btn" href="#/" aria-label="回總覽">${icon('back')}</a>
    <span class="bar-title">Day <b class="num">${n}</b></span>
    <button class="bar-act ${ui.editing ? 'on' : ''}" data-act="toggle-edit">${ui.editing ? '完成' : `${icon('edit')}編輯`}</button>
  </header>
  ${banner}
  <section class="day-head">
    <p class="dh-date"><span class="num">${md(d.date)}</span> 週${weekday(d.date)}</p>
    <h1>${esc(d.title)}</h1>
    <p class="dh-stay">${icon('stay')}住 ${esc(d.stay)}</p>
    ${notes ? `<dl class="day-notes">${notes}</dl>` : ''}
    ${!ui.editing && routes.length ? `<div class="day-actions">${routes.map((u, i) => `<a class="btn primary" href="${esc(u)}" target="_blank" rel="noopener">${icon('route')}今日路線${routes.length > 1 ? ` <span class="num">${i + 1}/${routes.length}</span>` : ''}</a>`).join('')}</div>` : ''}
  </section>
  <ol class="timeline ${ui.editing ? 'editing' : ''}" data-day="${n}">${list}</ol>
  ${ui.editing ? `<div class="add-row"><button class="btn" data-act="add-stop" data-day="${n}">${icon('plus')}新增一站</button></div>` : ''}
  ${!ui.editing ? `<nav class="day-nav">${n > 1 ? `<a href="#/day/${n - 1}">${icon('back')}Day ${n - 1}</a>` : '<span></span>'}${n < trip.days.length ? `<a href="#/day/${n + 1}">Day ${n + 1}${icon('next')}</a>` : ''}</nav>` : ''}`;
  return html;
}

export function afterDay() {
  if (ui.stampIn) setTimeout(() => { ui.stampIn = null; }, 50);
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
  const q = placeQuery(state.trip, s);
  const tel = phoneOf(s);
  const st = STATUS[s.status] || STATUS.na;
  const time = [s.time, s.stay ? `停留約 ${s.stay} 分` : ''].filter(Boolean).join(' · ');
  openSheet(`
    <header class="sh-head">
      <div><h2>${esc(s.name.replace(/^★\s*/, ''))}</h2>${s.ja ? `<p class="sh-ja" lang="ja">${esc(s.ja)}</p>` : ''}
      <p class="sh-meta num">Day ${s.day} · ${esc(time)} · ${esc(s.type)}</p></div>
      <span class="sh-stamp">${st.ch ? stamp(st.ch, s.status, { size: 58, seed: s.id, label: st.label }) : ''}</span>
    </header>
    <div class="sh-actions">
      ${q ? `<a class="btn primary" href="${esc(navUrl(q))}" target="_blank" rel="noopener">${icon('nav')}導航</a>` : '<span class="muted">地點未定，沒有導航</span>'}
      ${tel ? `<a class="btn" href="tel:${esc(tel.replace(/-/g, ''))}">${icon('phone')}${esc(tel)}</a>` : ''}
    </div>
    <dl class="kvs">
      ${field('營業時間', s.hours)}${field('公休', s.closed)}${field('費用', s.fee)}
      ${field('介紹', s.intro, 'long')}${field('推薦理由', s.reason)}${field('備註', s.note, 'long')}${field('地址', s.address)}
    </dl>
    <section class="verify">
      <h3>查證 <span class="vtag" style="--tone:var(--ink-${s.status})">${esc(st.label)}</span>${s.verifyDate ? `<span class="muted num">${esc(s.verifyDate)}</span>` : ''}</h3>
      ${s.verify ? `<p>${esc(s.verify)}</p>` : ''}
      <dl class="kvs">${linkField('查證來源', s.verifySource)}${linkField('資料來源', s.source)}</dl>
    </section>
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
const LONG = [['intro', '介紹'], ['reason', '推薦理由'], ['note', '備註'], ['verify', '查證結果（對照當天）']];

export function editStop(id, newForDay) {
  const trip = state.trip;
  const isNew = !id;
  const s = isNew
    ? { id: uid('s'), day: newForDay, time: '', stay: null, type: '景點', name: '', ja: '', intro: '', reason: '', hours: '', closed: '', fee: '', note: '', address: '', source: '', status: 'na', verify: '', phone: '', verifySource: '', verifyDate: '' }
    : { ...trip.stops.find((x) => x.id === id) };
  const statusRadios = Object.entries(STATUS).map(([k, v]) => `<label class="st-opt">
      <input type="radio" name="status" value="${k}" ${s.status === k ? 'checked' : ''}>
      <span>${v.ch ? stamp(v.ch, k, { size: 30, seed: k }) : '<i class="st-none"></i>'}${v.label}</span></label>`).join('');
  openSheet(`
    <header class="sh-head"><div><h2>${isNew ? `新增一站` : '編輯這一站'}</h2><p class="sh-meta">Day ${s.day}${isNew ? '' : ` · ${esc(s.name.replace(/^★\s*/, ''))}`}</p></div>
      <button class="icon-btn" data-close aria-label="關閉">${icon('close')}</button></header>
    <form class="form" id="stop-form" novalidate>
      <label class="f full"><span>項目名稱</span><input name="name" required value="${esc(s.name)}" placeholder="例：午餐：味処古川"></label>
      <div class="f-row">
        <label class="f"><span>時間</span><input name="time" type="time" value="${esc(s.time)}"></label>
        <label class="f"><span>停留（分）</span><input name="stay" type="number" inputmode="numeric" min="0" step="5" value="${s.stay ?? ''}"></label>
      </div>
      <div class="f-row">
        <label class="f"><span>類型</span><select name="type">${TYPES.map((t) => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f"><span>哪一天</span><select name="day">${trip.days.map((d) => `<option value="${d.n}" ${d.n === s.day ? 'selected' : ''}>Day ${d.n}（${md(d.date)}）</option>`).join('')}</select></label>
      </div>
      <fieldset class="f full"><legend>查證狀態</legend><div class="st-opts">${statusRadios}</div></fieldset>
      ${FIELDS.map(([k, l]) => `<label class="f full"><span>${l}</span><input name="${k}" value="${esc(s[k])}"></label>`).join('')}
      ${LONG.map(([k, l]) => `<label class="f full"><span>${l}</span><textarea name="${k}" rows="3">${esc(s[k])}</textarea></label>`).join('')}
      <label class="f full"><span>查證來源（網址）</span><input name="verifySource" type="url" value="${esc(s.verifySource)}"></label>
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
      const changedStatus = next.status !== s.status || isNew;
      if (changedStatus && next.status !== 'na') {
        next.verifyDate = new Date().toISOString().slice(0, 10);
        ui.stampIn = next.id;
      }
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
      commit(({ trip: t }) => { t.stops = t.stops.filter((x) => x.id !== s.id); });
      closeSheet();
      toast('已刪除這一站');
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
        const ids = [...list.children].map((x) => x.dataset.id);
        commit(({ trip: t }) => reorderDay(t, Number(list.dataset.day), ids));
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up, { once: true });
      g.addEventListener('pointercancel', up, { once: true });
    });
  });
}

export function toggleEdit() { ui.editing = !ui.editing; }

export function doExport() {
  const name = exportBackup();
  toast(`已匯出 ${name}`);
}

export { lodgingFor };
