// Frontend benchmark (not part of the test suite): hover cost in the heatmap and re-render cost in the
// overview with large data. Run from tests/js: node bench.mjs  (env BENCH_USERS, BENCH_DAYS, BENCH_HDAYS)
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets');
const dom = new JSDOM('<!doctype html><html data-theme="light"><head><meta name="csrf-token" content="tok"></head><body><div id="app"></div></body></html>', { url: 'https://calendar.test/', pretendToBeVisual: true, runScripts: 'dangerously' });
const w = dom.window;
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
{ const sc = w.document.createElement('script'); sc.textContent = fs.readFileSync(`${ROOT}/vendor/vue.global.prod.js`, 'utf8'); w.document.head.appendChild(sc); }
w.console.error = (...a) => console.error(...a);
for (const k of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'MouseEvent', 'KeyboardEvent', 'Event', 'CustomEvent', 'matchMedia']) {
  const v = k === 'window' ? w : (typeof w[k] === 'function' && !/^[A-Z]/.test(k) ? w[k].bind(w) : w[k]);
  try { globalThis[k] = v; } catch (e) { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
}
globalThis.Vue = w.Vue;
w.__APP__ = { csrf: 'tok', locale: 'en', theme: 'light', menuCollapsed: false, appName: 'Calendar overview', logoutUrl: '/auth/logout', loginUrl: '/auth/login' };

const DAYS = Number(process.env.BENCH_DAYS || 31), USERS = Number(process.env.BENCH_USERS || 150), HDAYS = Number(process.env.BENCH_HDAYS || 90);
const ymd = (d) => d.toISOString().slice(0, 10);
const mkDays = (n) => Array.from({ length: n }, (_, i) => ymd(new Date(Date.UTC(2026, 8, 14 + i))));
const days = mkDays(DAYS), hdays = mkDays(HDAYS);
let seed = 1; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const items = (n) => { const out = []; for (const d of mkDays(n)) { for (let k = 0; k < 3; k++) { const h = 8 + Math.floor(rnd() * 8); out.push({ s: `${d}T${String(h).padStart(2, '0')}:00:00Z`, e: `${d}T${String(h + 1).padStart(2, '0')}:00:00Z`, st: 'busy', sub: 'Meeting ' + k, loc: null, ad: false, pr: false }); } } return out; };
const user = (i, n) => ({ id: 'u' + i, name: 'User ' + i, email: `u${i}@x.dk`, title: 'T', department: 'D', initials: 'U', has_photo: false, photo_url: '/api/photos/u' + i, is_demo: true, is_me: i === 0, error: null, work: [], items: items(n) });
const overviewUsers = Array.from({ length: USERS }, (_, i) => user(i, DAYS));
const availUsers = Array.from({ length: USERS }, (_, i) => user(i, HDAYS));
const me = {
  user: { id: 'u0', name: 'User 0', email: 'u0@x.dk', initials: 'U', photo_url: '/api/photos/u0', has_manager: true, scopes: [] },
  preferences: { theme: 'light', locale: 'en', days: DAYS, row_height: 'md', show_weekends: true, heatmap_slot: 30, demo_enabled: true, my_team_visible: true, demo_visible: true, menu_collapsed: false, mini_months: 1, show_week_numbers: false, show_week_numbers_overview: false, start_monday: false, find_time_enabled: true, vacation_enabled: true, vacation_days: 92, vacation_collapsed: false, heatmap_duration: 30, heatmap_work_only: true, heatmap_show_weekends: true, heatmap_days: HDAYS },
  options: { themes: ['system', 'light', 'dark'], locales: ['en', 'da'], row_heights: ['sm', 'md', 'lg'], day_options: [1, 3, 5, 7, 10, 14, 21, 31], max_days: 366, statuses: ['free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown'] },
  color_rules: [], menu: [], directory: { synced_at: null, user_count: USERS, has_managers: true, error: null }, app: { name: 'Calendar overview', version: 'b', admin_consent_url: null },
};
const overview = { from: days[0], to: days[days.length - 1], days, tz: 'UTC', total: USERS, fetched_at: '', users: overviewUsers };
const availability = { from: hdays[0], to: hdays[hdays.length - 1], days: hdays, fetched_at: '', users: availUsers };
globalThis.fetch = async (url, opts = {}) => {
  const p = url.split('?')[0]; let body = {};
  if (p === '/api/me') body = me; else if (p === '/api/overview') body = overview; else if (p === '/api/availability') body = availability; else if (p === '/api/settings') body = { preferences: { ...me.preferences, ...JSON.parse(opts.body) }, menu: null };
  return { ok: true, status: 200, json: async () => body };
};
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
await import(`${ROOT}/js/app.js`); await tick(300);
const { store } = await import(`${ROOT}/js/store.js`);
const { openModal, toggleSelect } = await import(`${ROOT}/js/actions.js`);
const time = async (label, fn, n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) { await fn(i); } const ms = performance.now() - t0; console.log(`BENCH ${label}: ${(ms / n).toFixed(1)} ms per op (${n} ops)`); };

console.log(`grid blocks: ${w.document.querySelectorAll('.grid .blk').length}`);
await time('overview: select a person (re-render)', async (i) => { toggleSelect('u' + (i % USERS)); await Vue.nextTick(); }, 10);
await time('overview: search keystroke', async (i) => { store.search = 'user 1' + (i % 9); await Vue.nextTick(); }, 10);
store.search = '';
openModal('heatmap', { ids: overviewUsers.map((u) => u.id) }); await tick(400);
const cells = w.document.querySelectorAll('.heat .hc');
console.log(`heat cells: ${cells.length}`);
await time('heatmap: mousemove over a cell', async (i) => { cells[i % cells.length].dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 100 + i, clientY: 100 })); await Vue.nextTick(); }, 20);
await time('heatmap: drag-select step', async (i) => { cells[i].dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); await Vue.nextTick(); }, 5);
process.exit(0);
