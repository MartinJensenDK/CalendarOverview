// Reactive application state shared by all components.
const { reactive } = Vue;

const boot = window.__APP__ || {};

export const store = reactive({
  ready: false,
  me: null,
  prefs: { theme: boot.theme || 'system', locale: boot.locale || 'en', days: 7, row_height: 'md', show_weekends: true, heatmap_slot: 30, demo_enabled: false, my_team_visible: true, demo_visible: true, menu_collapsed: !!boot.menuCollapsed, mini_months: 1, show_week_numbers: false, show_week_numbers_overview: false, find_time_enabled: true, heatmap_duration: 30, heatmap_work_only: true, heatmap_show_weekends: true, heatmap_days: 7, menu_order: [] },
  options: { themes: ['system', 'light', 'dark'], locales: ['en', 'da'], row_heights: ['sm', 'md', 'lg'], day_options: [1, 3, 5, 7, 10, 14, 21, 31], max_days: 62, statuses: ['free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown'] },
  rules: [],
  menu: [],
  directory: { synced_at: null, user_count: 0, has_managers: false, error: null },
  app: { name: boot.appName || 'Calendar overview', version: '', admin_consent_url: null },

  // Overview
  from: null,           // 'YYYY-MM-DD' first visible day
  overview: null,       // last API response
  loading: false,
  error: null,
  search: '',
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',

  // Selection for the heatmap
  selected: [],         // directory user ids

  // UI
  modal: null,          // { name, props }
  confirm: null,        // { title, text, confirmLabel, danger, resolve }
  toasts: [],
  tooltip: null,
});

let toastId = 0;
export function toast(text, kind = 'ok', ms = 2600) {
  const id = ++toastId;
  store.toasts.push({ id, text, kind });
  setTimeout(() => { store.toasts = store.toasts.filter((x) => x.id !== id); }, ms);
}

/** Opens a confirmation dialog. Resolves true/false. */
export function confirm(opts) {
  return new Promise((resolve) => { store.confirm = { ...opts, resolve }; });
}

export function applyTheme(theme) {
  let mode = theme;
  if (theme === 'system') {
    mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', mode);
  try { localStorage.setItem('theme', theme); } catch (e) { /* ignore */ }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.prefs.theme === 'system') applyTheme('system');
});
