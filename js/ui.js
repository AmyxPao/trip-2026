// 共用的小工具：跳脫、印章、底部面板、提示
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 依 id 決定印章的歪斜角度，同一站每次畫都一樣
function tilt(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 19) - 11);
}

// 印泥章：雙圈＋一個字。tone 對應 CSS 的 --ink-<tone>
export function stamp(ch, tone, { size = 34, seed = ch, cls = '', label = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="stamp ${cls}" ${a11y} width="${size}" height="${size}" viewBox="0 0 40 40" style="--tone:var(--ink-${tone});--rot:${tilt(seed)}deg">
<g filter="url(#ink)"><circle cx="20" cy="20" r="17.6" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="1.3"/><text x="20" y="21.5" text-anchor="middle" dominant-baseline="central">${esc(ch)}</text></g></svg>`;
}

// ---------- 底部面板（dialog） ----------
const dlg = () => document.getElementById('sheet');

export function openSheet(html, bind) {
  const d = dlg();
  d.innerHTML = `<div class="sheet-inner">${html}</div>`;
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));
  if (!d.open) d.showModal();
  d.querySelector('.sheet-inner').scrollTop = 0;
  bind?.(d);
}
export function closeSheet() {
  const d = dlg();
  if (!d.open) return;
  d.classList.add('closing');
  setTimeout(() => { d.classList.remove('closing'); d.close(); d.innerHTML = ''; }, 180);
}
export function initSheet() {
  const d = dlg();
  d.addEventListener('click', (e) => { if (e.target === d) closeSheet(); });
  d.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
}

// 第一次按「刪除」變成「再按一次確認」，3 秒後恢復
export function confirmTap(btn, run, text = '再按一次確認刪除') {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) { run(); return; }
    const orig = btn.innerHTML;
    btn.dataset.armed = '1';
    btn.classList.add('armed');
    btn.textContent = text;
    setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = orig; }, 3000);
  });
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
