const WK = ["日","一","二","三","四","五","六"];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const store = { get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }, set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} } };
let done = store.get("hk-done", {}), todoDone = store.get("hk-todo", {});
const wd = iso => WK[new Date(iso + "T12:00:00").getDay()];
const md = iso => { const [, m, d] = iso.split("-"); return `${+m}/${+d}`; };
const gmap = it => (it.lat && it.lng) ? `https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}` : (it.name_local ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.name_local.split("／")[0])}` : "");
const dayRoute = day => { const p = day.items.filter(i => i.lat && i.lng).map(i => `${i.lat},${i.lng}`); return p.length >= 2 ? `https://www.google.com/maps/dir/${p.join("/")}` : ""; };
const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : "";
function toast(m){ const t=$("#toast"); t.textContent=m; t.hidden=false; clearTimeout(toast.h); toast.h=setTimeout(()=>t.hidden=true,1600); }

let view = "plan", cur = 0, mapAll = false;

// hero
$("#sub").textContent = `${md(D.dates.start)}（${wd(D.dates.start)}）– ${md(D.dates.end)}（${wd(D.dates.end)}）`;
$("#journey").innerHTML = D.lodging.map((l, i) => `${i ? '<span class="ar">─</span>' : ''}<span class="st"><b>${esc(l.area.split("（")[0])}</b> ${esc(l.nights)}</span>`).join("");

// day strip
$("#days").innerHTML = D.days.map((d, i) => `<button class="day" data-i="${i}" aria-pressed="false"><div class="m">週${wd(d.date)}</div><div class="n">${+d.date.slice(8)}</div><div class="m">${+d.date.slice(5,7)}月</div></button>`).join("");
$("#days").addEventListener("click", e => { const b = e.target.closest(".day"); if (b) { cur = +b.dataset.i; mapAll = false; render(); } });

function renderPlan(){
  const d = D.days[cur], route = dayRoute(d);
  const ev = (d.events || []).map(e => `<span class="chip c-enji">${esc(e)}</span>`).join("");
  const items = d.items.map((it, j) => {
    const key = `${d.day}-${j}`, isDone = !!done[key];
    const mc = it.mapcode ? (it.mapcode === "待查" ? `<span class="mc pending">待查</span>` : `<span class="mc">${esc(it.mapcode)}</span> <button class="btn" data-copy="${esc(it.mapcode)}">複製</button>`) : "";
    const chips = [it.lesser_known ? `<span class="chip c-gunjo">人少</span>` : "", it.reservation_needed ? `<span class="chip c-enji">建議預約</span>` : "", it.latest_arrival ? `<span class="chip c-gold">最晚 ${esc(it.latest_arrival)} 到</span>` : ""].join("");
    const link = gmap(it), src = it.source && it.source.url ? `<a href="${esc(it.source.url)}" target="_blank" rel="noopener">資料來源</a>・查詢 ${esc(it.source.checked)}` : "";
    const drive = it.transport_to_next && it.transport_to_next.minutes ? `<div class="drive">下一站 ${esc(it.transport_to_next.mode)}約 ${it.transport_to_next.minutes} 分（粗估）</div>` : "";
    const detail = it.type === "transport" ? (it.notes ? `<p class="intro" style="color:var(--muted)">${esc(it.notes)}</p>` : "") : `
      ${it.name_local && it.name_local !== it.name ? `<div class="local">${esc(it.name_local)}</div>` : ""}
      ${chips ? `<div class="chips" style="margin-top:6px">${chips}</div>` : ""}
      ${it.intro ? `<p class="intro">${esc(it.intro)}</p>` : ""}
      ${it.why ? `<p class="why">${esc(it.why)}</p>` : ""}
      <dl class="rows">${row("時間", it.hours ? esc(it.hours) : "")}${row("休日", it.closed_check ? esc(it.closed_check) : "")}${row("費用", it.fee ? esc(it.fee) : "")}${row("Map Code", mc)}${row("備註", it.notes ? esc(it.notes) : "")}</dl>
      ${link || src ? `<div class="btns">${link ? `<a class="btn" href="${link}" target="_blank" rel="noopener">Google Maps</a>` : ""}</div>` : ""}
      ${src ? `<div class="src" style="margin-top:6px">${src}</div>` : ""}${drive}`;
    return `<li class="it${isDone ? " done" : ""}" data-type="${esc(it.type)}"><div class="t">${esc(it.time)}</div>
      <div class="card"><div class="top"><h3>${esc(it.name.replace(/^★\s*/, ""))}</h3><input type="checkbox" class="chk" id="chk-${key}" data-key="${key}" ${isDone ? "checked" : ""} aria-label="完成"></div>${detail}</div></li>`;
  }).join("");
  $("#v-plan").innerHTML = `<div class="dayhead fade"><div class="no">Day ${d.day} · ${md(d.date)} 週${wd(d.date)}</div><h2>${esc(d.theme)}</h2>
    <div class="meta"><span>住宿 <b>${esc(d.stay.name || "—")}</b></span></div>
    ${ev ? `<div class="chips" style="margin-top:8px">${ev}</div>` : ""}
    <div class="btns">${route ? `<a class="btn solid" href="${route}" target="_blank" rel="noopener">開啟本日路線</a>` : ""}<button class="btn" id="gomap">看路線地圖</button></div></div>
    <ol class="tl fade">${items}</ol>`;
  $("#gomap").onclick = () => setView("map");
}

function renderMap(){
  const d = D.days[cur];
  $("#mapsvg").innerHTML = MAPS.days[mapAll ? 0 : d.day];
  $("#mv-day").setAttribute("aria-pressed", String(!mapAll)); $("#mv-all").setAttribute("aria-pressed", String(mapAll));
  $("#mapday").textContent = mapAll ? "全程 8 天" : `Day ${d.day}・${d.theme}`;
  const legs = mapAll ? [] : (MAPS.legs[d.day] || []);
  $("#legs").innerHTML = legs.map(l => `<li><span class="tag ${l.mode === "walk" ? "c-enji" : "c-gold"}">${l.mode === "walk" ? "步行" : "開車"}</span><span>${esc(l.from)} → ${esc(l.to)}</span><span class="v">${l.km} km・約 ${Math.max(5, Math.round(l.min / 5) * 5)} 分${l.expKm ? `・高速 ${l.expKm} km` : ""}</span></li>`).join("");
  const ms = mapAll ? [] : (MAPS.michi[d.day] || []);
  $("#michis").innerHTML = ms.length ? `<div class="section-h" style="margin-top:22px"><h2 style="font-size:18px">沿途道之驛</h2><span class="en">Michi-no-eki</span></div><ul class="list" style="margin-top:0">` + ms.map(m => `<li><span class="michi-ic">駅</span><span><b>道の駅 ${esc(m.name)}</b> ${m.onStop ? '<span class="chip c-gunjo">行程點就在這</span>' : ""}${m.expwy ? ' <span class="chip c-enji">需下交流道</span>' : ""}</span>
    <span class="v">${esc(m.from)} → ${esc(m.to)} 途中・離路線約 ${m.d} km${m.exact ? "" : "（位置只到町名）"}</span>
    <span class="v">${esc(m.hours)}・休 ${esc(m.closed)}・<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("道の駅 " + m.name)}" target="_blank" rel="noopener">地圖</a>・<a href="${esc(m.src)}" target="_blank" rel="noopener">來源</a></span></li>`).join("") + `</ul>` : "";
}
$("#mv-day").onclick = () => { mapAll = false; renderMap(); };
$("#mv-all").onclick = () => { mapAll = true; renderMap(); };

function renderStay(){
  $("#lodge").innerHTML = (D.lodging_info || []).map(L => `<article>
    <div class="head"><div class="city">${esc(L.city || "")}</div><h3>${esc(L.name)}</h3><div class="src" style="margin-top:4px">${esc(L.nights)}</div></div>
    <div class="when"><div><small>CHECK-IN</small><b>${esc(L.checkin_time)}</b><span>${esc(L.checkin_date)}</span></div><div><small>CHECK-OUT</small><b>${esc(L.checkout_time)}</b><span>${esc(L.checkout_date)}</span></div></div>
    <div class="body">
      <dl class="rows" style="margin:0">${row("地址", esc(L.address))}${row("類型", esc(L.type))}${row("房型", esc(L.rooms))}${row("衛浴", esc(L.bath))}${row("設備", esc(L.amenities))}${row("位置", esc(L.location))}</dl>
      <div class="alert">停車　${esc(L.parking)}</div>
      ${L.todo && L.todo.length ? `<div><h4>入住前要確認</h4><ul>${L.todo.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
      <div><h4>入住規定</h4><ul>${L.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
      ${L.pending ? `<div class="pending">${esc(L.pending)}</div>` : ""}
      <div class="btns" style="margin-top:0">${L.link && !L.link.includes("google.com/maps") ? `<a class="btn" href="${esc(L.link)}" target="_blank" rel="noopener">房源頁</a>` : ""}<a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(L.address)}" target="_blank" rel="noopener">Google Maps</a></div>
      <div class="src">${esc(L.source)}</div>
    </div></article>`).join("");
}

function renderPrep(){
  const F = (arr) => arr.map(([k, v]) => `<div class="fact"><small>${k}</small><div>${esc(v)}</div></div>`).join("");
  $("#fl").innerHTML = F([["去程", D.flights.outbound], ["回程", D.flights.return]]);
  $("#ld").innerHTML = (D.lodging_info || []).map(L => `<div class="fact"><small>${esc(L.city || "")}</small><div><b>${esc(L.name)}</b></div><div style="font-size:13px;color:var(--muted)">${esc(L.checkin_date || "")} ${esc(L.checkin_time || "")} 入住 → ${esc(L.checkout_date || "")} ${esc(L.checkout_time || "")} 退房</div></div>`).join("");
  $("#facts").innerHTML = [["天氣", D.weather.type === "climate" ? "目前只有氣候參考，出發前 14 天內再查預報" : D.weather.summary], ["日落", D.weather.sunset]].map(([k, v]) => `<div class="fact"><small>${k}</small><div>${esc(v)}</div></div>`).join("");
  $("#todo").innerHTML = D.checklist.map((c, i) => `<li><label><input type="checkbox" class="chk" data-todo="${i}" ${todoDone[i] ? "checked" : ""}><span>${esc(c)}</span></label></li>`).join("");
  const lvl = {low:"低", medium:"中", high:"高"};
  $("#arisk").innerHTML = D.area_risks.map(r => `<div class="risk"><span class="chip ${r.level === "high" ? "c-enji" : "c-gold"}">風險${lvl[r.level] || ""}</span><div><p><b>${esc(r.area)}</b></p><p>${esc(r.detail)}</p><p class="adv">對策：${esc(r.advice)}</p><p class="adv">出發前：${esc(r.check_before)}</p></div></div>`).join("");
  $("#risks").innerHTML = D.risks.map(r => `<li style="font-size:14px;padding-left:14px;position:relative"><span style="position:absolute;left:0;color:var(--gold)">・</span>${esc(r)}</li>`).join("");
  $("#season").innerHTML = D.seasonal.map(s => `<span class="chip c-gunjo">${esc(s.name)}：${esc(s.detail)}</span>`).join("");
}

function setView(v){
  view = v;
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.v === v)));
  ["plan","map","stay","prep"].forEach(k => $("#v-" + k).hidden = k !== v);
  $("#days").hidden = !(v === "plan" || v === "map");
  store.set("hk-view", v);
  render();
  window.scrollTo({top: 0});
}
function render(){
  document.querySelectorAll(".day").forEach((b, i) => b.setAttribute("aria-pressed", String(i === cur && !(view === "map" && mapAll))));
  const act = document.querySelector('.day[aria-pressed="true"]'); if (act) act.scrollIntoView({block:"nearest", inline:"center"});
  store.set("hk-day", cur);
  if (view === "plan") renderPlan(); else if (view === "map") renderMap(); else if (view === "stay") renderStay(); else renderPrep();
}
document.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setView(b.dataset.v); });
document.addEventListener("change", e => {
  const k = e.target.dataset && e.target.dataset.key, t = e.target.dataset && e.target.dataset.todo;
  if (k) { if (e.target.checked) done[k] = 1; else delete done[k]; store.set("hk-done", done); e.target.closest(".it").classList.toggle("done", e.target.checked); }
  if (t !== undefined) { if (e.target.checked) todoDone[t] = 1; else delete todoDone[t]; store.set("hk-todo", todoDone); }
});
document.addEventListener("click", e => { const v = e.target.dataset && e.target.dataset.copy; if (!v) return; navigator.clipboard.writeText(v).then(() => toast("已複製 " + v), () => toast("請手動選取：" + v)); });
$("#foot").textContent = `資料最後查詢 ${D.last_checked}・車程為粗估，導航以 Map Code 或店家地址為準`;

cur = Math.min(store.get("hk-day", 0), D.days.length - 1);
const h = location.hash.slice(1);
const hd = h.match(/^d(\d)$/);
if (hd) cur = Math.min(+hd[1] - 1, D.days.length - 1);
setView(["plan","map","stay","prep"].includes(h) ? h : (hd ? "plan" : store.get("hk-view", "plan")));
