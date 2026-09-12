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
  preferences: { theme: 'light', locale: 'en', days: 7, row_height: 'md', page_size: 50, show_weekends: true, work_start: '08:00', work_end: '17:00', heatmap_slot: 30, demo_enabled: false, my_team_visible: true, demo_visible: true, menu_collapsed: false, mini_months: 1, find_time_enabled: true, heatmap_duration: 30, heatmap_work_only: true, heatmap_show_weekends: true, heatmap_days: 7 },
  options: { themes: ['system', 'light', 'dark'], locales: ['en', 'da'], row_heights: ['sm', 'md', 'lg'], page_sizes: [25, 50, 100, 200], day_options: [1, 3, 5, 7, 10, 14, 21, 31], max_days: 62, statuses: ['free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown'] },
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
  from: '2026-09-14', to: '2026-09-21', days, tz: 'UTC', page: 1, per_page: 50, total: 3, fetched_at: new Date().toISOString(),
  users: [
    { ...member('me', 'Anna Andersen', 'Designer'), is_me: true, error: null, items: [
      { s: '2026-09-14T07:00:00Z', e: '2026-09-14T08:30:00Z', st: 'busy', sub: 'Team sync', loc: 'Teams', ad: false, pr: false },
      { s: '2026-09-15T00:00:00Z', e: '2026-09-16T00:00:00Z', st: 'oof', sub: 'Vacation', loc: null, ad: true, pr: false },
    ] },
    { ...member('p1', 'Peter Peer', 'Engineer'), is_me: false, error: null, items: [{ s: '2026-09-16T11:00:00Z', e: '2026-09-16T12:00:00Z', st: 'tentative', sub: null, loc: null, ad: false, pr: true }] },
    { ...member('o1', 'Otto Other', 'Account Manager'), is_me: false, error: 'no_mailbox', items: [] },
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
  else if (path === '/api/availability') body = availability;
  else if (path === '/api/settings/reset') body = { preferences: { ...defaultPrefs }, menu: null };
  else if (path === '/api/settings') body = { preferences: { ...me.preferences, ...JSON.parse(opts.body) }, menu: null };
  else if (path === '/api/directory/users') body = { users: [member('x1', 'Xenia Search', 'Analyst')] };
  else if (path === '/api/groups/reorder') body = { menu: [...me.menu].reverse() };
  else if (path === '/api/groups') body = { menu: me.menu };
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

function assert(cond, msg) { if (!cond) { errors.push('ASSERT: ' + msg); } else console.log('ok -', msg); }

assert(store.ready, 'store ready after loadMe');
assert(html().includes('Calendar overview'), 'headline rendered');
assert(html().includes('My team') && html().includes('Sales') && html().includes('Board'), 'menu groups rendered');
assert(w.document.querySelectorAll('.grid .name').length === 3, 'three user rows rendered');
assert(w.document.querySelectorAll('.grid .h').length === 8, 'corner + 7 day headers');
const blocks = w.document.querySelectorAll('.grid .blk');
assert(blocks.length === 3, `three event blocks rendered (got ${blocks.length})`);
const vac = [...blocks].find((b) => b.textContent.includes('Vacation'));
assert(vac && vac.className.includes('allday') && vac.getAttribute('style').includes('#e5484d'), 'vacation block is all-day and coloured by rule');
assert(html().includes('No mailbox'), 'row error label shown');
assert(html().includes('Private'), 'private item labelled Private');

// Modals
openModal('group'); await tick();
assert(w.document.querySelector('.modal') && html().includes('Create group'), 'group modal opens');
// clicking the backdrop must NOT close an editing modal
w.document.querySelector('.backdrop').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
await tick();
assert(w.document.querySelector('.modal'), 'editing modal stays open on backdrop click');
w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
await tick();
assert(w.document.querySelector('.modal'), 'editing modal stays open on Escape');
closeModal(); await tick();
assert(!w.document.querySelector('.modal'), 'modal closes via close action');

openModal('group', { group: me.menu[1] }); await tick();
assert(html().includes('Edit group') && html().includes('Mona Manager'), 'edit group modal shows managers');
closeModal(); await tick();

openModal('rules'); await tick();
assert(html().includes('Colour rules') && html().includes('Vacation'), 'rules modal lists rules');
w.document.querySelector('.modal-foot .btn.primary').click(); await tick();
assert(html().includes('Add rule') && w.document.querySelector('.swatches'), 'rule editor opens with swatches');
closeModal(); await tick();

openModal('settings'); await tick();
assert(html().includes('Rows per page'), 'settings modal renders');
store.prefs.days = 14; w.document.querySelector('.modal-foot .btn.danger').click(); await tick();
assert(w.document.querySelectorAll('.modal').length === 2 && html().includes('Reset all settings?'), 'reset asks for confirmation');
[...w.document.querySelectorAll('.modal-foot .btn')].find((b) => b.className.includes('danger') && b.textContent.includes('Reset all settings') && b.closest('.modal') !== w.document.querySelector('.modal')).click(); await tick(60);
assert(store.prefs.days === 7 && calls.some((c) => c === 'POST /api/settings/reset'), 'reset restores defaults via API');
closeModal(); await tick();

// Members are not listed in the menu; selection happens on the overview rows
assert(w.document.querySelectorAll('.sidebar .member').length === 0, 'menu does not list members');
assert(w.document.querySelectorAll('.grid .name .pick').length === 3, 'each overview row has a selection checkbox');
w.document.querySelectorAll('.grid .name .pick')[0].click(); await tick();
assert(store.selected.length === 1, 'checkbox selects without double toggling');
w.document.querySelectorAll('.grid .name .txt b')[1].click(); await tick();
assert(store.selected.length === 2 && w.document.querySelector('.findtime').textContent.includes('2 selected') && !w.document.querySelector('.findtime .btn.success').disabled, 'find-time section in the menu shows the selection');

// Mini calendar in the menu footer
assert(w.document.querySelector('.minical'), 'mini calendar rendered');
assert(w.document.querySelectorAll('.minical-month').length === 1, 'one month by default');
const startBtn = w.document.querySelector('.minical .day.start');
assert(startBtn && startBtn.getAttribute('aria-label') === store.from, 'overview start day highlighted');
const callsBefore = calls.length;
const target = [...w.document.querySelectorAll('.minical .day')].find((b) => !b.classList.contains('outside') && b.getAttribute('aria-label') !== store.from);
target.click(); await tick(60);
assert(store.from === target.getAttribute('aria-label') && calls.slice(callsBefore).some((c) => c.includes('/api/overview?from=' + store.from)), 'clicking a day moves the overview');
w.document.querySelector('.minical-head .expand').click(); await tick(60);
assert(w.document.querySelectorAll('.minical-month').length === 2, 'expands to two months');
assert(w.document.querySelectorAll('.minical .wk').length === 0, 'week numbers hidden by default');
store.prefs.show_week_numbers = true; await tick();
assert(w.document.querySelectorAll('.minical .wk').length > 2, 'week numbers appear live when enabled');
assert(w.document.querySelectorAll('.grid .h .wkno').length >= 1 && w.document.querySelector('.grid .h .wkno').textContent.includes('Week'), 'week badge shown in overview header');
store.prefs.show_week_numbers = false; await tick();
assert(w.document.querySelectorAll('.minical .wk').length === 0 && w.document.querySelectorAll('.grid .h .wkno').length === 0, 'week numbers disappear live when disabled');
store.prefs.find_time_enabled = false; await tick();
assert(!w.document.querySelector('.findtime') && w.document.querySelectorAll('.grid .name .pick').length === 0, 'find-time section and row checkboxes hidden when disabled');
store.prefs.find_time_enabled = true; await tick();
assert(w.document.querySelector('.findtime') && w.document.querySelectorAll('.grid .name .pick').length === 3, 'find-time section returns when enabled');
assert(w.document.querySelector('.findtime .btn.success'), 'find-time button uses the green success style');
const allBox = w.document.querySelector('.grid .h.corner .pick-all input');
assert(allBox && allBox.indeterminate === false, 'corner select-all checkbox present');
allBox.click(); await tick();
assert(store.selected.length === 3 && allBox.checked, 'corner checkbox selects everyone on the page');
allBox.click(); await tick();
assert(store.selected.length === 0, 'corner checkbox clears the selection');
toggleSelect('me'); await tick();
assert(allBox.indeterminate === true, 'corner checkbox shows indeterminate for partial selection');
toggleSelect('me'); await tick();
openModal('heatmap', { ids: ['me', 'p1'] }); await tick(120);
const cells = w.document.querySelectorAll('.heat .hc');
assert(cells.length === 7 * 18, `heatmap cells for 7 days x 18 slots (got ${cells.length})`);
cells[2].dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); await tick();
assert(html().includes('Open in Outlook') && w.document.querySelector('.heat-detail a').href.includes('outlook.office.com/calendar/0/deeplink/compose'), 'slot selection shows Outlook link');
cells[3].dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 100 })); await tick();
assert([...w.document.querySelectorAll('.tooltip')].some((el) => /of 2 free/.test(el.textContent)), 'hovering a heatmap cell shows "x of y free"');
[...w.document.querySelectorAll('.heat-toolbar .btn')].find((b) => b.textContent.includes('Add more')).click(); await tick();
assert(w.document.querySelector('.modal .picker input'), 'Add more reveals a person picker');
const pickerInput = w.document.querySelector('.modal .picker input');
pickerInput.dispatchEvent(new w.Event('focus')); await tick(250);
w.document.querySelector('.modal .picker .opt').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); await tick(120);
assert(store.selected.includes('x1') && calls.some((c) => c.includes('/api/availability') && c.includes('x1')), 'picked person is added to the search');
const sugg = w.document.querySelectorAll('.suggest-btn');
assert(sugg.length === 3 && /\d+ of \d+ free/.test(sugg[0].textContent), `three suggested times with attendance shown (got ${sugg.length}: ${sugg[0] && sugg[0].textContent})`);
{ const counts = [...sugg].map((b) => Number(/(\d+) of/.exec(b.querySelector('.suggest-count').textContent)[1])); assert(counts[0] >= counts[1] && counts[1] >= counts[2], 'suggestions are ordered by attendance'); }
sugg[1].click(); await tick();
assert(sugg[1].className.includes('active') && html().includes('Open in Outlook'), 'choosing a suggestion selects it in the heatmap');
const modalRef = w.document.querySelector('.modal');
const weekendToggle = [...modalRef.querySelectorAll('.switch')].find((l) => l.textContent.includes('Show weekends')).querySelector('input');
const before = w.document.querySelectorAll('.heat .hh').length;
weekendToggle.click(); await tick();
assert(w.document.querySelectorAll('.heat .hh').length !== before, 'weekend toggle changes the heatmap columns');
await tick(500);
assert(calls.some((c) => c === 'PUT /api/settings') && store.prefs.heatmap_show_weekends === false, 'heatmap choices are saved as preferences');
closeModal(); await tick();

// Confirm dialog IS dismissable
const { confirm } = await import(`${ROOT}/js/store.js`);
const p = confirm({ title: 'Delete?', text: 'x', confirmLabel: 'Delete', danger: true }); await tick();
w.document.querySelector('.backdrop').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
const answer = await p;
assert(answer === false, 'confirm dialog closes on backdrop click');

// Danish
store.prefs.locale = 'da'; await tick();
assert(html().includes('Kalenderoversigt') && html().includes('Mit team'), 'Danish translation applied');
assert(t('{n} days', { n: 3 }) === '3 dage', 't() interpolation');

// Drag and drop menu entries (built-ins included)
{
  const rows = w.document.querySelectorAll('.sidebar .group');
  const dt = { effectAllowed: '', dropEffect: '', setData() {} };
  rows[0].dispatchEvent(Object.assign(new w.Event('dragstart', { bubbles: true }), { dataTransfer: dt }));
  rows[2].dispatchEvent(Object.assign(new w.Event('dragover', { bubbles: true, cancelable: true }), { dataTransfer: dt }));
  rows[2].dispatchEvent(new w.Event('drop', { bubbles: true })); await tick(60);
  assert(calls.some((c) => c === 'POST /api/groups/reorder') && store.menu[0].id === 8, 'dragging My team below a group reorders the menu (got ' + store.menu.map((g) => g.id).join(',') + ')');
}

// Type-to-search person lookup
store.prefs.locale = 'en'; await tick();
w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
await tick(250);
assert(store.modal && store.modal.name === 'lookup' && w.document.querySelector('.lookup-search input').value === 'x', 'typing a letter opens the lookup modal with the letter');
assert(w.document.querySelectorAll('.lookup-row').length === 1 && html().includes('Xenia Search'), 'lookup shows search results');
assert(w.document.activeElement === w.document.querySelector('.lookup-search input'), 'search field keeps focus after results arrive');
w.document.querySelector('.lookup-row').click(); await tick(120);
assert(w.document.querySelector('.lookup-person') && w.document.querySelectorAll('.lookup-day').length === store.prefs.days, `selecting a person shows their calendar for the overview range (${w.document.querySelectorAll('.lookup-day').length} days)`);
assert([...w.document.querySelectorAll('.lookup-add option')].some((o) => o.textContent.includes('Sales')), 'manual groups offered for adding the person');
w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'q', bubbles: true })); await tick();
assert(store.modal && store.modal.name === 'lookup', 'typing while a modal is open does not open another');
closeModal(); await tick();

// Theme toggle path
const { applyTheme } = await import(`${ROOT}/js/store.js`);
applyTheme('dark');
assert(w.document.documentElement.getAttribute('data-theme') === 'dark', 'dark theme attribute set');

console.log('\nAPI calls:', calls.join(' | '));
if (errors.length) { console.log('\nERRORS:'); errors.forEach((e) => console.log(' -', e.slice(0, 600))); process.exit(1); }
console.log('\nSMOKE OK');
process.exit(0);
