// 地圖（Excel 版的靜態路線圖）與清單（出發前清單、住宿、風險、查證說明、備份）
import { state, commit, exportBackup, parseBackup, restoreBackup, resetToSeed } from './store.js';
import { icon } from './icons.js';
import { esc, stamp, openSheet, closeSheet, confirmTap, toast } from './ui.js';
import { STATUS, md, weekday, navUrl } from './trip.js';

// 「• 甲 / • 乙」這類串在一起的條列拆成清單
function listify(v) {
  const parts = String(v).split(/\s*(?:\s\/\s|[•・])\s*/).map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 || /[•・]/.test(v) ? `<ul class="lodge-list">${parts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : esc(v);
}

export function renderMap() {
  const { trip } = state;
  const figs = trip.maps.map((m) => {
    const d = m.day ? trip.days.find((x) => x.n === m.day) : null;
    const cap = d ? `<b>DAY <span class="num">${d.n}</span></b> ${md(d.date)}（${weekday(d.date)}）${esc(d.title)}` : '<b>全程總覽</b>';
    return `<figure class="map-fig"><a href="${esc(m.src)}" target="_blank" rel="noopener"><img src="${esc(m.src)}" alt="${d ? `DAY ${d.n} 路線圖` : '全程路線總覽圖'}" loading="lazy" width="1600" height="1200"></a>
      <figcaption>${cap}${d ? `<a class="link" href="#/day/${d.n}">看行程${icon('next')}</a>` : ''}</figcaption></figure>`;
  }).join('');
  return `<header class="bar"><span class="bar-title">地圖</span></header>
    <p class="banner">這些是 Excel 版的靜態路線圖，沒有網路也看得到；手機上改了行程，圖不會跟著變。金色實線是開車路線，標籤是預估車程。可縮放的互動地圖之後再做。</p>
    <div class="maps">${figs}</div>`;
}

export function renderList() {
  const { trip, meta } = state;
  const done = trip.checklist.filter((c) => c.done).length;
  const groups = [];
  for (const c of trip.checklist) {
    let g = groups.find((x) => x.cat === c.cat);
    if (!g) groups.push(g = { cat: c.cat, items: [] });
    g.items.push(c);
  }
  const check = groups.map((g) => `<li class="cg"><h3>${esc(g.cat)}</h3><ul>${g.items.map((c) => `<li>
      <label class="check ${c.done ? 'is-done' : ''}"><input type="checkbox" data-act="check" data-id="${c.id}" ${c.done ? 'checked' : ''}><span>${esc(c.text)}</span></label></li>`).join('')}</ul></li>`).join('');

  const lodging = trip.lodging.map((l) => {
    const rows = ['晚數', '入住', '退房', '停車', '房間', '衛浴', '設備', '位置', '規定', '待辦']
      .filter((k) => l[k]).map((k) => `<div class="kv ${['規定', '設備', '位置', '待辦', '房間'].includes(k) ? 'long' : ''}"><dt>${k}</dt><dd>${listify(l[k])}</dd></div>`).join('');
    return `<article class="lodge"><h3>${esc(l['名稱'])}</h3>
      <p class="lodge-addr">${esc(l['地址'])}</p>
      <div class="sh-actions">${l['地址'] ? `<a class="btn primary" href="${esc(navUrl(l['地址']))}" target="_blank" rel="noopener">${icon('nav')}導航回住處</a>` : ''}
        ${/^https?:/.test(l['連結'] || '') ? `<a class="btn" href="${esc(l['連結'])}" target="_blank" rel="noopener">${icon('link')}房源頁</a>` : ''}</div>
      <dl class="kvs">${rows}</dl></article>`;
  }).join('');

  const r = trip.risks;
  const risks = `
    ${r.trip.map((x) => `<li><span>${esc(x.text)}</span>${x.state ? `<small>${esc(x.state.replace(/^[^\s]+\s/, ''))}</small>` : ''}</li>`).join('')}
    ${r.area.map((x) => `<li><span><b>${esc(x.kind)}</b> ${esc(x.area)}：${esc(x.text)}</span><small>${esc(x.advice)}${x.check ? `；${esc(x.check)}` : ''}</small></li>`).join('')}
    ${r.weather.map((x) => `<li><span><b>天氣</b> ${esc(x)}</span></li>`).join('')}
    ${r.season.map((x) => `<li><span><b>${esc(x.item)}</b> ${esc(x.text)}</span><small>${esc(x.state)}</small></li>`).join('')}`;

  const legend = Object.entries(STATUS).map(([k, v]) => {
    const key = Object.keys(trip.legend).find((x) => x.includes(v.label));
    return `<li>${v.ch ? stamp(v.ch, k, { size: 30, seed: k }) : '<i class="st-none"></i>'}<span><b>${v.label}</b>${esc(key ? trip.legend[key] : '')}</span></li>`;
  }).join('');

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '從來沒有');
  return `<header class="bar"><span class="bar-title">清單</span></header>
    <section class="block"><h2>出發前清單 <span class="num muted">${done} / ${trip.checklist.length}</span></h2><ul class="checks">${check}</ul></section>
    <section class="block"><h2>住宿</h2>${lodging}</section>
    <section class="block"><h2>風險與季節</h2><ul class="risks">${risks}</ul></section>
    <section class="block"><h2>查證印章</h2><ul class="legend">${legend}</ul>
      ${trip.legend['這份表仍然無法保證的事'] ? `<p class="fine">印章也保證不了的事：${esc(trip.legend['這份表仍然無法保證的事'])}</p>` : ''}</section>
    <section class="block" id="backup"><h2>資料與備份</h2>
      <p class="fine">行程和帳都只存在這支手機的瀏覽器裡。清除瀏覽器資料或換手機前，先匯出備份檔，存到雲端硬碟或傳到 LINE。</p>
      <dl class="kvs"><div class="kv"><dt>上次修改</dt><dd>${fmt(meta.modifiedAt)}</dd></div><div class="kv"><dt>上次備份</dt><dd>${fmt(meta.exportedAt)}</dd></div></dl>
      ${meta.storageOk ? '' : '<p class="form-err">這支手機的瀏覽器不讓網頁存資料（可能是無痕模式），修改在關掉後會消失。請改用一般模式開啟。</p>'}
      <div class="sh-actions">
        <button class="btn primary" data-act="export">${icon('download')}匯出備份</button>
        <label class="btn">${icon('upload')}匯入備份<input type="file" accept="application/json,.json" data-act="import" hidden></label>
      </div>
      <button class="link danger-link" data-act="reset">把行程還原成 Excel 版（帳本不受影響）</button>
    </section>`;
}

export function toggleCheck(id, on) {
  commit(({ trip }) => { const c = trip.checklist.find((x) => x.id === id); if (c) c.done = on; });
}

export async function importFile(file) {
  try {
    const data = await parseBackup(file);
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('zh-TW') : '不明時間';
    openSheet(`<header class="sh-head"><div><h2>用備份檔取代目前的資料？</h2><p class="sh-meta">備份時間：${esc(when)}</p></div></header>
      <p class="sheet-text">目前手機上的行程和帳會被這個備份檔整個取代，取代後無法復原。不確定的話，先按「匯出目前資料」留一份。</p>
      <footer class="sh-foot"><button class="btn" id="exp-first">${icon('download')}匯出目前資料</button><button class="btn danger" id="do-restore">取代</button></footer>
      <button class="link" data-close>取消</button>`, (d) => {
      d.querySelector('#exp-first').addEventListener('click', () => { exportBackup(); toast('已匯出目前資料'); });
      d.querySelector('#do-restore').addEventListener('click', () => { restoreBackup(data); closeSheet(); toast('已從備份還原'); });
    });
  } catch (err) {
    toast(err.message);
  }
}

export function confirmReset(btn) {
  confirmTap(btn, async () => {
    try { await resetToSeed(); toast('行程已還原成 Excel 版'); } catch (err) { toast(err.message); }
  }, '再按一次：手機上改過的行程會全部消失');
}
