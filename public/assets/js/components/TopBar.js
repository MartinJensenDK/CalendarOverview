import { store } from '../store.js';
import { t } from '../i18n.js';
import { rangeLabel, addDays, isoWeek, relativeTime } from '../util/date.js';
import { shiftDays, goToday, setFrom, savePrefs, refreshFromGraph, openModal, syncDirectory, logout } from '../actions.js';

const { ref, computed, onMounted, onBeforeUnmount } = Vue;

export default {
  name: 'TopBar',
  setup() {
    const profileOpen = ref(false);
    const refreshing = ref(false);
    const rootEl = ref(null);

    const range = computed(() => {
      if (!store.from) return '';
      const to = addDays(store.from, store.prefs.days - 1);
      return rangeLabel(store.from, to);
    });
    const week = computed(() => (store.from ? isoWeek(store.from) : ''));
    const updated = computed(() => (store.overview ? relativeTime(store.overview.fetched_at) : ''));

    async function refresh() {
      refreshing.value = true;
      try { await refreshFromGraph(); } finally { refreshing.value = false; }
    }
    function onDocClick(e) {
      if (rootEl.value && !rootEl.value.contains(e.target)) profileOpen.value = false;
    }
    onMounted(() => document.addEventListener('mousedown', onDocClick));
    onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick));

    function pick(patch) { savePrefs(patch); }
    function toggleMenu() { savePrefs({ menu_collapsed: !store.prefs.menu_collapsed }); }
    function open(name) { profileOpen.value = false; openModal(name); }
    async function sync() { profileOpen.value = false; try { await syncDirectory(); } catch (e) { /* toast shown by api */ } }
    function onDate(e) { if (e.target.value) setFrom(e.target.value); }

    return { store, t, range, week, updated, refreshing, refresh, profileOpen, rootEl, shiftDays, goToday, pick, toggleMenu, open, sync, logout, onDate };
  },
  template: `
    <header class="topbar">
      <button type="button" class="btn ghost icon" :title="store.prefs.menu_collapsed ? t('Show menu') : t('Hide menu')" @click="toggleMenu"><icon name="panel-left" :size="18"></icon></button>
      <div class="brand"><div class="brand-mark">C</div><h1>{{ t('Calendar overview') }}</h1></div>

      <div class="row" style="margin-left:12px">
        <div class="btn-group">
          <button type="button" class="btn icon" :title="t('Previous')" @click="shiftDays(-store.prefs.days)"><icon name="chevron-left"></icon></button>
          <button type="button" class="btn" @click="goToday">{{ t('Today') }}</button>
          <button type="button" class="btn icon" :title="t('Next')" @click="shiftDays(store.prefs.days)"><icon name="chevron-right"></icon></button>
        </div>
        <label class="daterange" style="position:relative;cursor:pointer">
          {{ range }} <span class="muted mono" style="font-size:12px;font-weight:400;margin-left:6px">{{ t('Week') }} {{ week }}</span>
          <input type="date" :value="store.from" @change="onDate" style="position:absolute;inset:0;opacity:0;width:100%;cursor:pointer" :aria-label="t('From')">
        </label>
        <select class="select inline" :value="store.prefs.days" @change="pick({ days: Number($event.target.value) })" :aria-label="t('Days to show')">
          <option v-for="d in store.options.day_options" :key="d" :value="d">{{ d === 1 ? t('1 day') : t('{n} days', { n: d }) }}</option>
        </select>
      </div>

      <span class="grow"></span>

      <span class="sync-state" :class="{ busy: store.loading || refreshing }"><span class="dot"></span>{{ store.loading || refreshing ? t('Refreshing…') : (updated ? t('Updated {time}', { time: updated }) : '') }}</span>
      <button type="button" class="btn icon" :title="t('Refresh from Microsoft 365')" @click="refresh" :disabled="refreshing"><icon name="refresh"></icon></button>
      <div class="search" style="position:relative">
        <input class="input" type="search" style="width:200px;padding-left:30px" :placeholder="t('Search people')" v-model="store.search">
        <span style="position:absolute;left:9px;top:9px;color:var(--muted)"><icon name="search"></icon></span>
      </div>

      <div class="dropdown" ref="rootEl">
        <button type="button" class="btn ghost" style="padding:0 6px 0 4px;height:38px" @click="profileOpen = !profileOpen" aria-haspopup="menu" :aria-expanded="profileOpen">
          <img class="avatar" v-if="store.me" :src="store.me.photo_url" alt="">
          <span class="avatar sk circle" v-else aria-hidden="true"></span>
          <icon name="chevron-down" :size="14"></icon>
        </button>
        <div class="menu" v-if="profileOpen" role="menu">
          <div class="head" v-if="store.me"><strong>{{ store.me.name }}</strong><small>{{ store.me.email }}</small></div>
          <div class="sep"></div>
          <div class="inline-seg row" style="justify-content:space-between">
            <span class="muted" style="font-size:12px">{{ t('Theme') }}</span>
            <div class="seg">
              <button type="button" :class="{ active: store.prefs.theme === 'light' }" @click="pick({ theme: 'light' })" :title="t('Light')"><icon name="sun" :size="14"></icon></button>
              <button type="button" :class="{ active: store.prefs.theme === 'dark' }" @click="pick({ theme: 'dark' })" :title="t('Dark')"><icon name="moon" :size="14"></icon></button>
              <button type="button" :class="{ active: store.prefs.theme === 'system' }" @click="pick({ theme: 'system' })" :title="t('System')"><icon name="monitor" :size="14"></icon></button>
            </div>
          </div>
          <div class="inline-seg row" style="justify-content:space-between">
            <span class="muted" style="font-size:12px">{{ t('Language') }}</span>
            <div class="seg">
              <button type="button" :class="{ active: store.prefs.locale === 'en' }" @click="pick({ locale: 'en' })">EN</button>
              <button type="button" :class="{ active: store.prefs.locale === 'da' }" @click="pick({ locale: 'da' })">DA</button>
            </div>
          </div>
          <div class="inline-seg row" style="justify-content:space-between">
            <span class="muted" style="font-size:12px">{{ t('Row height') }}</span>
            <div class="seg">
              <button type="button" v-for="h in store.options.row_heights" :key="h" :class="{ active: store.prefs.row_height === h }" @click="pick({ row_height: h })">{{ h === 'sm' ? 'S' : h === 'md' ? 'M' : 'L' }}</button>
            </div>
          </div>
          <div class="sep"></div>
          <button type="button" class="item" @click="open('rules')"><icon name="palette"></icon><span class="grow">{{ t('Colour rules') }}</span></button>
          <button type="button" class="item" @click="open('settings')"><icon name="sliders"></icon><span class="grow">{{ t('Settings') }}</span></button>
          <label class="item switch" style="cursor:pointer">
            <icon name="layers"></icon><span class="grow">{{ t('Demo data') }}</span>
            <input type="checkbox" :checked="store.prefs.demo_enabled" @change="pick({ demo_enabled: $event.target.checked })"><span class="track"></span>
          </label>
          <div class="sep"></div>
          <button type="button" class="item" @click="sync"><icon name="refresh"></icon><span class="grow">{{ t('Sync directory now') }}<br><small class="muted">{{ t('Directory: {n} people, updated {time}', { n: store.directory.user_count, time: store.directory.synced_at ? new Date(store.directory.synced_at).toLocaleString() : t('never') }) }}</small></span></button>
          <div class="sep"></div>
          <button type="button" class="item" @click="logout"><icon name="logout"></icon><span class="grow">{{ t('Sign out') }}</span></button>
        </div>
      </div>
    </header>`,
};
