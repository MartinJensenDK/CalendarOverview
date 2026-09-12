// Actions: everything that talks to the API and updates the store.
import { api } from './api.js';
import { store, toast, applyTheme } from './store.js';
import { t } from './i18n.js';
import { todayYmd, addDays } from './util/date.js';

export async function loadMe() {
  const data = await api.get('/api/me');
  store.me = data.user;
  store.prefs = data.preferences;
  store.options = data.options;
  store.rules = data.color_rules;
  store.menu = data.menu;
  store.directory = data.directory;
  store.app = data.app;
  if (!store.from) store.from = todayYmd();
  applyTheme(store.prefs.theme);
  document.documentElement.lang = store.prefs.locale;
  store.ready = true;
  if (data.directory && data.directory.error) {
    toast(data.directory.error.message || t('Something went wrong'), 'danger', 6000);
  }
}

let overviewController = null;
export async function loadOverview({ refresh = false } = {}) {
  if (overviewController) overviewController.abort();
  overviewController = new AbortController();
  store.loading = true;
  store.error = null;
  try {
    const data = await api.get('/api/overview', {
      from: store.from,
      days: store.prefs.days,
      tz: store.tz,
      refresh: refresh ? 1 : 0,
    }, { signal: overviewController.signal });
    store.overview = data;
  } catch (e) {
    if (e.name === 'AbortError') return;
    store.error = e.body && e.body.message ? e.body.message : t('Could not load the overview.');
    if (e.body && e.body.consent_required) store.error = t('Some Microsoft Graph permissions have not been granted yet. Ask an administrator to grant admin consent.');
  } finally {
    store.loading = false;
  }
}

export async function savePrefs(patch) {
  const before = { ...store.prefs };
  Object.assign(store.prefs, patch);
  if ('theme' in patch) applyTheme(patch.theme);
  if ('locale' in patch) document.documentElement.lang = patch.locale;
  try {
    const data = await api.put('/api/settings', patch);
    store.prefs = data.preferences;
    if (data.menu) store.menu = data.menu;
  } catch (e) {
    store.prefs = before;
    applyTheme(before.theme);
    toast(t('Something went wrong'), 'danger');
    throw e;
  }
  if (store.prefs.find_time_enabled === false) store.selected = [];
  if (store.prefs.demo_enabled === false) store.selected = store.selected.filter((id) => !String(id).startsWith('demo-'));
  const reload = ['days', 'demo_enabled', 'demo_visible', 'my_team_visible'].some((k) => k in patch && patch[k] !== before[k]);
  if (reload) loadOverview();
}

export async function resetSettings() {
  const data = await api.post('/api/settings/reset');
  store.prefs = data.preferences;
  if (data.menu) store.menu = data.menu;
  applyTheme(store.prefs.theme);
  document.documentElement.lang = store.prefs.locale;
  store.selected = [];
  loadOverview();
}

export async function refreshMenu() {
  const data = await api.get('/api/groups');
  store.menu = data.menu;
}

export function openModal(name, props = {}) {
  store.modal = { name, props };
}

export function closeModal() {
  store.modal = null;
}

export function toggleSelect(id) {
  const i = store.selected.indexOf(id);
  if (i >= 0) store.selected.splice(i, 1);
  else store.selected.push(id);
}

export function setSelection(ids) {
  store.selected = [...new Set(ids)];
}

export function clearSelection() {
  store.selected = [];
}

export function setFrom(ymd) {
  store.from = ymd;
  loadOverview();
}

export function shiftDays(n) {
  setFrom(addDays(store.from, n));
}

export function goToday() {
  setFrom(todayYmd());
}

export async function syncDirectory() {
  const data = await api.post('/api/sync/directory');
  store.directory = data.directory;
  store.menu = data.menu;
  toast(t('Directory synced: {n} people', { n: data.count }));
  loadOverview();
}

export async function refreshFromGraph() {
  await loadOverview({ refresh: true });
}

export async function toggleGroup(entry) {
  if (entry.kind === 'builtin') {
    const key = entry.type === 'demo' ? 'demo_visible' : 'my_team_visible';
    return savePrefs({ [key]: !entry.visible });
  }
  entry.visible = !entry.visible;
  try {
    await api.post(`/api/groups/${entry.id}/toggle`, { visible: entry.visible });
  } catch (e) {
    entry.visible = !entry.visible;
    toast(t('Something went wrong'), 'danger');
    return;
  }
  loadOverview();
}

export async function reorderGroups(ids) {
  const data = await api.post('/api/groups/reorder', { ids });
  store.menu = data.menu;
  loadOverview();
}

export async function deleteGroup(entry) {
  const data = await api.del(`/api/groups/${entry.id}`);
  store.menu = data.menu;
  toast(t('Group deleted'));
  loadOverview();
}

export async function resyncGroup(entry) {
  const data = await api.post(`/api/groups/${entry.id}/resync`);
  store.menu = data.menu;
  toast(t('Members synced'));
  loadOverview();
}

export function logout() {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = window.__APP__.logoutUrl;
  const input = document.createElement('input');
  input.type = 'hidden'; input.name = '_token'; input.value = window.__APP__.csrf;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}
