// Optional runtime smoke test for the Vue frontend. Needs Node 20+ and jsdom:
//   cd tests/js && npm install jsdom && node smoke.mjs
// Runtime smoke test: mounts the real Vue app in jsdom with a mocked API.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets');
const dom = new JSDOM('<!doctype html><html data-theme="light"><head><meta name="csrf-token" content="tok"></head><body><div id="app"></div></body></html>', { url: 'https://calendar.test/', pretendToBeVisual: true, runScripts: 'dangerously' });
const w = dom.window;
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
{ const sc = w.document.createElement('script'); sc.textContent = fs.readFileSync(`${ROOT}/vendor/vue.global.prod.js`, 'utf8'); w.document.head.appendChild(sc); }
if (!w.Vue) { throw new Error('Vue global not created'); }

const errors = [];
w.console.error = (...a) => errors.push(a.map(String).join(' '));
w.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message));

// Globals our modules use
for (const k of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'MouseEvent', 'KeyboardEvent', 'Event', 'CustomEvent', 'matchMedia']) {
  const v = k === 'window' ? w : (typeof w[k] === 'function' && !/^[A-Z]/.test(k) ? w[k].bind(w) : w[k]);
  try { globalThis[k] = v; } catch (e) { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
}
globalThis.Vue = w.Vue;
w.__APP__ = { csrf: 'tok', locale: 'en', theme: 'light', menuCollapsed: false, appName: 'Calendar overview', logoutUrl: '/auth/logout', loginUrl: '/auth/login' };

const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
const member = (id, name, title) => ({ id, name, email: `${id}@example.com`, title, department: 'Sales', initials: 'AB', has_photo: false, photo_url: `/api/photos/${id}`, is_demo: false });
const me = {
  user: { id: 'me', name: 'Anna Andersen', email: 'anna@example.com', photo_url: '/api/photos/me', has_manager: true, scopes: [] },
  preferences: { theme: 'light', locale: 'en', days: 7, row_height: 'md', show_weekends: true, heatmap_slot: 30, demo_enabled: false, my_team_visible: true, demo_visible: true, menu_collapsed: false, mini_months: 1, show_week_numbers: false, show_week_numbers_overview: false, start_monday: false, show_hour_grid: true, find_time_collapsed: false, find_time_enabled: true, vacation_enabled: true, vacation_days: 92, vacation_collapsed: false, vacation_grid: true, vacation_show_weekends: true, vacation_week_numbers: true, heatmap_duration: 30, heatmap_work_only: true, heatmap_show_weekends: true, heatmap_days: 7 },
  options: { themes: ['system', 'light', 'dark'], locales: ['en', 'da'], row_heights: ['sm', 'md', 'lg'], day_options: [1, 3, 5, 7, 10, 14, 21, 31], max_days: 62, statuses: ['free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown'] },
  color_rules: [{ id: 1, name: 'Vacation', field: 'subject', operator: 'regex', value: 'vacation|ferie', color: '#e5484d', text_color: null, enabled: true, sort_order: 0 }, { id: 2, name: 'OOF', field: 'status', operator: 'is', value: 'oof', color: '#f76b15', text_color: null, enabled: true, sort_order: 1 }],
  menu: [
    { id: 'my_team', kind: 'builtin', type: 'my_team', name: null, visible: true, has_manager: true, members: [member('me', 'Anna Andersen', 'Designer'), member('p1', 'Peter Peer', 'Engineer')] },
    { id: 7, kind: 'group', type: 'manual', name: 'Sales', visible: true, sort_order: 1, managers: [member('m1', 'Mona Manager', 'Head of Sales')], manual_members: [member('o1', 'Otto Other', 'Account Manager')], members: [member('o1', 'Otto Other', 'Account Manager'), member('p1', 'Peter Peer', 'Engineer')] },
    { id: 8, kind: 'group', type: 'entra', name: 'Board', visible: false, sort_order: 2, entra_group_id: 'g1', entra_group_name: 'Board', managers: [], manual_members: [], members: [] },
  ],
  directory: { synced_at: '2026-09-14T06:00:00Z', user_count: 3, has_managers: true, error: null },
  app: { name: 'Calendar overview', version: '1.0.0', admin_consent_url: null },
};
const overview = {
  from: '2026-09-14', to: '2026-09-21', days, tz: 'UTC', total: 3, fetched_at: new Date().toISOString(),
  users: [
    { ...member('me', 'Anna Andersen', 'Designer'), is_me: true, error: null, work: ['14', '15', '16', '17', '18'].map((d) => ({ s: `2026-09-${d}T06:00:00Z`, e: `2026-09-${d}T14:00:00Z`, loc: 'office' })), items: [
      { s: '2026-09-14T07:00:00Z', e: '2026-09-14T08:30:00Z', st: 'busy', sub: 'Team sync', loc: 'Teams', ad: false, pr: false },
      { s: '2026-09-15T00:00:00Z', e: '2026-09-16T00:00:00Z', st: 'oof', sub: 'Vacation', loc: null, ad: true, pr: false },
    ] },
    { ...member('p1', 'Peter Peer', 'Engineer'), is_me: false, error: null, work: [{ s: '2026-09-14T06:00:00Z', e: '2026-09-14T14:00:00Z', loc: null }, { s: '2026-09-15T06:00:00Z', e: '2026-09-15T14:00:00Z', loc: null }, { s: '2026-09-16T06:00:00Z', e: '2026-09-16T14:00:00Z', loc: null }, { s: '2026-09-17T07:00:00Z', e: '2026-09-17T13:00:00Z', loc: 'remote' }], items: [{ s: '2026-09-16T11:00:00Z', e: '2026-09-16T12:00:00Z', st: 'tentative', sub: null, loc: null, ad: false, pr: true }, { s: '2026-09-16T11:30:00Z', e: '2026-09-16T12:30:00Z', st: 'busy', sub: 'Overlap', loc: null, ad: false, pr: false }, { s: '2026-09-16T12:30:00Z', e: '2026-09-16T13:00:00Z', st: 'busy', sub: 'After', loc: null, ad: false, pr: false }] },
    { ...member('o1', 'Otto Other', 'Account Manager'), is_me: false, error: 'no_mailbox', work: [], items: [] },
  ],
};
const availability = { from: '2026-09-14', to: '2026-09-21', days, fetched_at: '', users: overview.users.slice(0, 2) };

const defaultPrefs = { ...me.preferences };
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push(`${opts.method || 'GET'} ${url}`);
  const path = url.split('?')[0];
  let body = {};
  if (path === '/api/me') body = me;
  else if (path === '/api/overview') body = overview;
  else if (path === '/api/vacations') body = { from: '2026-09-01', to: '2026-12-02', tz: 'UTC', fetched_at: '', users: [{ ...member('me', 'Anna Andersen', 'Designer'), is_me: true, periods: [{ from: '2026-09-15', to: '2026-09-16', days: 2, sub: 'Vacation' }] }], without: 2 };
  else if (path === '/api/availability') { await new Promise((r) => setTimeout(r, 40)); body = availability; } // slow enough to see the skeleton
  else if (path === '/api/settings/reset') body = { preferences: { ...defaultPrefs }, menu: null };
  else if (path === '/api/settings') body = { preferences: { ...me.preferences, ...JSON.parse(opts.body) }, menu: null };
  else if (path === '/api/directory/users') { const q = (new URLSearchParams(url.split('?')[1] || '').get('q') || '').toLowerCase(); body = { users: [member('x1', 'Xenia Search', 'Analyst'), member('p1', 'Peter Peer', 'Engineer'), member('o1', 'Otto Other', 'Account Manager')].filter((u) => u.name.toLowerCase().includes(q)) }; }
  else if (/^\/api\/groups\/\d+$/.test(path)) body = { menu: me.menu };
  else if (path === '/api/groups/reorder') body = { menu: [...me.menu].reverse() };
  else if (path === '/api/groups') body = { menu: me.menu };
  else if (path === '/api/sync/directory') body = { directory: { ...me.directory, synced_at: '2026-09-14T07:00:00Z', user_count: 4 }, count: 4, menu: me.menu };
  else if (path === '/api/color-rules') body = { color_rules: me.color_rules };
  return { ok: true, status: 200, json: async () => body };
};

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
await import(`${ROOT}/js/app.js`);
await tick(80);

const { store } = await import(`${ROOT}/js/store.js`);
const { openModal, closeModal, toggleSelect } = await import(`${ROOT}/js/actions.js`);
const { t } = await import(`${ROOT}/js/i18n.js`);
const html = () => w.document.body.innerHTML;
// Hover an element with v-tip and read the shared info box; every tooltip on the site goes through it.
const tipText = async (el) => { el.dispatchEvent(new w.Event('mouseenter')); await tick(5); const b = w.document.querySelector('.tip:not([hidden])'); const txt = b ? b.textContent : ''; el.dispatchEvent(new w.Event('mouseleave')); return txt; };
// Realistic click on the sync icon (svg child), full pointer sequence
w.document.querySelector('.topbar .dropdown > button').click(); await tick();
const sync = w.document.querySelector('.topbar .menu .sync-dir');
const svg = sync.querySelector('svg') || sync.firstElementChild;
const before = calls.length;
sync.dispatchEvent(new w.Event('mouseenter'));
svg.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
sync.focus();
svg.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
svg.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
await tick(80);
console.log('calls after click:', calls.slice(before));
console.log('menu open:', !!w.document.querySelector('.topbar .menu'), 'disabled:', sync.disabled);
console.log('tip:', w.document.querySelector('.tip') && w.document.querySelector('.tip').hidden, w.document.querySelector('.tip') && w.document.querySelector('.tip').textContent);
