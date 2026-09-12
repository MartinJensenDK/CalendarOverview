import { store, confirm, toast, effectiveTheme } from '../store.js';
import { t } from '../i18n.js';
import { closeModal, savePrefs, resetSettings } from '../actions.js';
import { hoursFor } from '../util/hours.js';
import { weekday, dayLabel, minutesToHhmm, todayYmd } from '../util/date.js';

const { computed, ref } = Vue;

export default {
  name: 'SettingsModal',
  setup() {
    const set = (patch) => savePrefs(patch);
    // Tabs group the settings by the part of the app they affect; the last tab is kept while the app is open.
    const TABS = [
      { key: 'site', label: 'Site settings' },
      { key: 'find', label: 'Find free time' },
      { key: 'overview', label: 'Calendar overview' },
      { key: 'mini', label: 'Month calendar' },
      { key: 'vacation', label: 'Vacation calendar' },
    ];
    const tab = ref(store.settingsTab || 'site');
    function pickTab(key) { tab.value = key; store.settingsTab = key; }
    function onTabKey(e) {
      const i = TABS.findIndex((x) => x.key === tab.value);
      const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : -1;
      if (next < 0) return;
      e.preventDefault();
      pickTab(TABS[next].key);
      const btn = e.currentTarget.querySelectorAll('button')[next];
      if (btn) btn.focus();
    }
    async function reset() {
      const ok = await confirm({ title: t('Reset all settings?'), text: t('Everything on this page goes back to the defaults. Your groups, colour rules and menu are kept.'), confirmLabel: t('Reset all settings'), danger: true });
      if (!ok) return;
      await resetSettings();
      toast(t('Settings reset'));
    }
    // Your own working hours for the days currently shown, straight from what Graph reported.
    const myHours = computed(() => {
      const o = store.overview;
      const me = o && o.users.find((u) => u.is_me);
      if (!o || !me) return null;
      return o.days.map((d) => ({ day: d, today: d === todayYmd(), spans: hoursFor(me, d).map((h) => ({ time: `${minutesToHhmm(h.sm)}–${minutesToHhmm(h.em)}`, loc: h.loc })) }));
    });
    function locIcon(loc) { return loc === 'remote' ? 'home' : 'building'; }
    function locLabel(loc) { return loc === 'remote' ? t('Home') : loc === 'office' ? t('Office') : loc === 'hybrid' ? t('Hybrid') : loc; }
    // The hours box is teleported to <body> and positioned in the viewport, above the trigger when
    // there is no room below, so it never ends up in the modal's scroll area.
    const hoursOpen = ref(false);
    const hoursStyle = ref({});
    function showHours(e) {
      const r = e.currentTarget.getBoundingClientRect();
      const est = 70 + ((myHours.value || []).length || 1) * 27;
      const below = r.bottom + 6 + est <= window.innerHeight;
      hoursStyle.value = {
        left: `${Math.max(8, Math.min(r.left, window.innerWidth - 320))}px`,
        top: below ? `${r.bottom + 6}px` : 'auto',
        bottom: below ? 'auto' : `${Math.max(8, window.innerHeight - r.top + 6)}px`,
      };
      hoursOpen.value = true;
    }
    function hideHours() { hoursOpen.value = false; }
    return { store, t, set, closeModal, reset, myHours, weekday, dayLabel, locIcon, locLabel, hoursOpen, hoursStyle, showHours, hideHours, effectiveTheme, TABS, tab, pickTab, onTabKey };
  },
  template: `
    <modal :title="t('Settings')" width="660px" height="620px" @close="closeModal">
      <div class="steps settings-tabs" role="tablist" :aria-label="t('Settings')" @keydown="onTabKey">
        <button v-for="x in TABS" :key="x.key" type="button" role="tab" :id="'settings-tab-' + x.key" :aria-selected="tab === x.key ? 'true' : 'false'" :aria-controls="'settings-panel-' + x.key" :tabindex="tab === x.key ? 0 : -1" :class="{ active: tab === x.key }" @click="pickTab(x.key)">{{ t(x.label) }}</button>
      </div>

      <section v-show="tab === 'site'" id="settings-panel-site" role="tabpanel" aria-labelledby="settings-tab-site" class="settings-panel">
        <div class="field-label">{{ t('Appearance') }}</div>
        <div class="grid-2">
          <label class="field"><span>{{ t('Theme') }}</span>
            <select class="select" :value="effectiveTheme(store.prefs.theme)" @change="set({ theme: $event.target.value })">
              <option value="light">{{ t('Light') }}</option><option value="dark">{{ t('Dark') }}</option>
            </select></label>
          <label class="field"><span>{{ t('Language') }}</span>
            <select class="select" :value="store.prefs.locale" @change="set({ locale: $event.target.value })"><option value="en">English</option><option value="da">Dansk</option></select></label>
        </div>
        <div class="field" style="margin-top:22px;margin-bottom:14px"><span class="field-label">{{ t('Working hours') }}</span>
          <span class="hours-info" tabindex="0" @mouseenter="showHours" @mouseleave="hideHours" @focus="showHours" @blur="hideHours">{{ t('Working hours are read from Outlook') }}<span class="i"><icon name="info" :size="14"></icon></span></span>
          <teleport to="body"><div class="hours-pop" role="tooltip" v-if="hoursOpen" :style="hoursStyle">
              <div class="hd">{{ t('Your working hours in the period shown') }}</div>
              <table v-if="myHours">
                <thead><tr><th>{{ t('Day') }}</th><th>{{ t('Hours') }}</th><th>{{ t('Location') }}</th></tr></thead>
                <tbody>
                  <tr v-for="r in myHours" :key="r.day" :class="{ off: !r.spans.length, today: r.today }">
                    <td class="d">{{ weekday(r.day) }} {{ dayLabel(r.day) }}</td>
                    <td class="h"><template v-if="r.spans.length"><div v-for="(s, k) in r.spans" :key="k">{{ s.time }}</div></template><span v-else>{{ t('No working hours') }}</span></td>
                    <td class="l"><div v-for="(s, k) in r.spans" :key="k"><span class="loc" v-if="s.loc"><icon :name="locIcon(s.loc)" :size="12"></icon>{{ locLabel(s.loc) }}</span><span v-else>–</span></div></td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="muted">{{ t('No data yet') }}</div>
          </div></teleport></div>
        <div class="field-label" style="margin-top:18px">{{ t('Demo data') }}</div>
        <label class="switch block" style="align-items:flex-start"><input type="checkbox" :checked="store.prefs.demo_enabled" @change="set({ demo_enabled: $event.target.checked })"><span class="track" style="margin-top:2px"></span><span>{{ t('Demo data') }}<br><small class="muted">{{ t('Show 150 fictional people with generated calendars. Handy for trying the app before your colleagues are in a group.') }}</small></span></label>
        <div class="row" style="margin-top:16px"><span class="muted" style="font-size:12px">{{ t('Version') }} {{ store.app.version }}</span></div>
      </section>

      <section v-show="tab === 'find'" id="settings-panel-find" role="tabpanel" aria-labelledby="settings-tab-find" class="settings-panel">
        <label class="switch block" style="margin-bottom:18px"><input type="checkbox" :checked="store.prefs.find_time_enabled" @change="set({ find_time_enabled: $event.target.checked })"><span class="track"></span>{{ t('Show the “Find free time” section in the menu') }}</label>
        <div class="field-label">{{ t('Defaults when the heatmap opens') }}</div>
        <div class="grid-2">
          <label class="field"><span>{{ t('Slot') }}</span>
            <select class="select" :value="store.prefs.heatmap_slot" @change="set({ heatmap_slot: Number($event.target.value) })"><option :value="15">{{ t('{n} min', { n: 15 }) }}</option><option :value="30">{{ t('{n} min', { n: 30 }) }}</option><option :value="60">{{ t('{n} min', { n: 60 }) }}</option></select></label>
          <label class="field"><span>{{ t('Meeting length') }}</span>
            <select class="select" :value="store.prefs.heatmap_duration" @change="set({ heatmap_duration: Number($event.target.value) })"><option :value="30">{{ t('{n} min', { n: 30 }) }}</option><option :value="60">{{ t('{n} min', { n: 60 }) }}</option><option :value="90">{{ t('{n} min', { n: 90 }) }}</option><option :value="120">{{ t('{n} min', { n: 120 }) }}</option></select></label>
        </div>
        <label class="switch block" style="margin-bottom:8px"><input type="checkbox" :checked="store.prefs.heatmap_work_only" @change="set({ heatmap_work_only: $event.target.checked })"><span class="track"></span>{{ t('Working hours only') }}</label>
        <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.heatmap_show_weekends" @change="set({ heatmap_show_weekends: $event.target.checked })"><span class="track"></span>{{ t('Show weekends') }}</label>
        <p class="modal-note">{{ t('Choices made inside “Find free time” are remembered here as well.') }}</p>
      </section>

      <section v-show="tab === 'overview'" id="settings-panel-overview" role="tabpanel" aria-labelledby="settings-tab-overview" class="settings-panel">
        <div class="grid-2">
          <label class="field"><span>{{ t('Row height') }}</span>
            <select class="select" :value="store.prefs.row_height" @change="set({ row_height: $event.target.value })">
              <option value="sm">{{ t('Compact') }} – {{ t('1 appointment per row') }}</option><option value="md">{{ t('Normal') }} – {{ t('{n} appointments per row', { n: 2 }) }}</option><option value="lg">{{ t('Comfortable') }} – {{ t('{n} appointments per row', { n: 3 }) }}</option>
            </select></label>
          <label class="field"><span>{{ t('Days to show') }}</span>
            <select class="select" :value="store.prefs.days" @change="set({ days: Number($event.target.value) })"><option v-for="d in store.options.day_options" :key="d" :value="d">{{ d }}</option></select></label>
        </div>
        <label class="switch block" style="margin-bottom:8px"><input type="checkbox" :checked="store.prefs.show_weekends" @change="set({ show_weekends: $event.target.checked })"><span class="track"></span>{{ t('Show weekends') }}</label>
        <label class="switch block" style="margin-bottom:8px"><input type="checkbox" :checked="store.prefs.show_week_numbers_overview" @change="set({ show_week_numbers_overview: $event.target.checked })"><span class="track"></span>{{ t('Show week numbers') }}</label>
        <label class="switch block" style="margin-bottom:8px"><input type="checkbox" :checked="store.prefs.start_monday" @change="set({ start_monday: $event.target.checked })"><span class="track"></span>{{ t('Always start on a Monday') }}</label>
        <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.show_hour_grid" @change="set({ show_hour_grid: $event.target.checked })"><span class="track"></span>{{ t('Show hour grid') }}</label>
      </section>

      <section v-show="tab === 'mini'" id="settings-panel-mini" role="tabpanel" aria-labelledby="settings-tab-mini" class="settings-panel">
        <div class="field"><span>{{ t('Months shown') }}</span>
          <div class="steps compact" role="group" :aria-label="t('Months shown')">
            <button type="button" :aria-pressed="store.prefs.mini_months === 1 ? 'true' : 'false'" @click="set({ mini_months: 1 })">{{ t('1 month') }}</button>
            <button type="button" :aria-pressed="store.prefs.mini_months === 2 ? 'true' : 'false'" @click="set({ mini_months: 2 })">{{ t('2 months') }}</button>
          </div></div>
        <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.show_week_numbers" @change="set({ show_week_numbers: $event.target.checked })"><span class="track"></span>{{ t('Show week numbers') }}</label>
      </section>

      <section v-show="tab === 'vacation'" id="settings-panel-vacation" role="tabpanel" aria-labelledby="settings-tab-vacation" class="settings-panel">
        <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.vacation_enabled" @change="set({ vacation_enabled: $event.target.checked })"><span class="track"></span>{{ t('Show the “Vacation calendar” section in the menu') }}</label>
        <label class="switch block" style="margin-bottom:8px"><input type="checkbox" :checked="store.prefs.vacation_show_weekends" @change="set({ vacation_show_weekends: $event.target.checked })"><span class="track"></span>{{ t('Show weekends') }}</label>
        <label class="switch block" style="margin-bottom:8px"><input type="checkbox" :checked="store.prefs.vacation_week_numbers" @change="set({ vacation_week_numbers: $event.target.checked })"><span class="track"></span>{{ t('Show week numbers') }}</label>
        <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.vacation_grid" @change="set({ vacation_grid: $event.target.checked })"><span class="track"></span>{{ t('Show day grid') }}</label>
      </section>
      <template #foot>
        <button type="button" class="btn danger" @click="reset"><icon name="refresh" :size="14"></icon>{{ t('Reset all settings') }}</button>
        <span class="grow"></span>
        <span class="modal-note">{{ t('Settings are saved to your account and follow you to other devices.') }}</span>
        <button type="button" class="btn primary" @click="closeModal">{{ t('Close') }}</button>
      </template>
    </modal>`,
};
