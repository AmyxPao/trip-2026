// 行程相關的推算：今天是第幾天、下一站、導航與路線連結、電話
export const STATUS = {
  ok: { label: '官方確認', ch: '確' },
  sec: { label: '次級來源', ch: '次' },
  call: { label: '需電話確認', ch: '電' },
  bad: { label: '有衝突', ch: '衝' },
  na: { label: '不需查', ch: '' },
};
export const TYPES = ['景點', '用餐', '購物', '休息站', '住宿', '交通'];
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function localISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function nowHM(d = new Date()) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
export function md(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
}
export function weekday(iso) {
  return WEEK[new Date(iso + 'T00:00:00').getDay()];
}

// 'pre' 出發前、'during' 旅途中、'post' 已回國
export function phase(trip, today = localISO()) {
  if (today < trip.start) return 'pre';
  if (today > trip.end) return 'post';
  return 'during';
}
export function daysUntil(trip, today = localISO()) {
  return Math.round((new Date(trip.start + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
}
export function todayDay(trip, today = localISO()) {
  return trip.days.find((d) => d.date === today) || null;
}

export function stopsOf(trip, n) {
  return trip.stops.filter((s) => s.day === n);
}
export const isMove = (s) => s.type === '交通';

export function nextStop(trip, n, hm = nowHM()) {
  return stopsOf(trip, n).find((s) => !isMove(s) && s.time && s.time >= hm) || null;
}

export function lodgingFor(trip, day) {
  if (!day) return null;
  return trip.lodging.find((l) => {
    const key = (l['名稱'] || '').split('（')[0].trim();
    return key && day.stay.includes(key);
  }) || null;
}

const VAGUE = /待選|自由|睡飽|自己煮|自煮|熟食|順路|未指定|整理行李/;
const MEAL = /^(早餐|午餐|晚餐|早午餐|點心)：/;

export function cleanName(name) {
  return name.replace(/^★\s*/, '').replace(MEAL, '').split(/[：（(]/)[0].trim();
}

// 導航用的搜尋字串；地點未定或不是地點就回 null
export function placeQuery(trip, s) {
  const day = trip.days.find((d) => d.n === s.day);
  if (s.type === '住宿' || /回.*住處|入住/.test(s.name)) {
    const l = lodgingFor(trip, day);
    if (l) return l['地址'] || l['名稱'];
  }
  if (isMove(s)) return null;
  if (s.address) return s.address;
  if (s.ja) return s.ja.split('／')[0];
  if (VAGUE.test(s.name)) return null;
  const c = cleanName(s.name);
  return c || null;
}

export function navUrl(q) {
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(q);
}

// 手機版 Google Maps 一條路線最多 3 個中途點：每段 5 個點，段與段首尾相接
export function routeUrls(trip, n) {
  const pts = [];
  for (const s of stopsOf(trip, n)) {
    const q = placeQuery(trip, s);
    if (q && pts[pts.length - 1] !== q) pts.push(q);
  }
  if (pts.length < 2) return [];
  const urls = [];
  for (let i = 0; i < pts.length - 1; i += 4) {
    const seg = pts.slice(i, i + 5);
    if (seg.length < 2) break;
    const p = new URLSearchParams({ api: '1', travelmode: 'driving', origin: seg[0], destination: seg[seg.length - 1] });
    if (seg.length > 2) p.set('waypoints', seg.slice(1, -1).join('|'));
    urls.push('https://www.google.com/maps/dir/?' + p.toString());
  }
  return urls;
}

const PHONE = /0\d{1,4}-\d{1,4}-\d{3,4}/;
export function phoneOf(s) {
  for (const f of [s.phone, s.closed, s.hours, s.note, s.verify]) {
    const m = (f || '').match(PHONE);
    if (m) return m[0];
  }
  return null;
}

// 這一列要導航去哪：一般站點去自己；交通段去「下一個有地點的站」
// 回傳 { q: 搜尋字串, label: 按鈕上顯示的名稱 } 或 null
export function destination(trip, s) {
  const own = placeQuery(trip, s);
  if (own) return { q: own, label: isMove(s) || s.type === '住宿' ? '住處' : cleanName(s.name) };
  if (!isMove(s)) return null;
  const list = stopsOf(trip, s.day);
  for (const t of list.slice(list.indexOf(s) + 1)) {
    const q = placeQuery(trip, t);
    if (q) return { q, label: isMove(t) || t.type === '住宿' ? '住處' : cleanName(t.name) };
  }
  return null;
}

// 一天裡第一個「時刻比前一站早」的地方；沒有就回 null
export function timeOrderIssue(trip, n) {
  let prev = null;
  for (const s of stopsOf(trip, n)) {
    if (!s.time) continue;
    if (prev && s.time < prev.time) return { before: prev, after: s };
    prev = s;
  }
  return null;
}
