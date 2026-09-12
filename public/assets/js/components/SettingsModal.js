import { store, confirm, toast } from '../store.js';
import { t } from '../i18n.js';
import { closeModal, savePrefs, resetSettings } from '../actions.js';
import { hoursFor } from '../util/hours.js';
import { weekday, dayLabel, minutesToHhmm, todayYmd } from '../util/date.js';

const { computed } = Vue;

export default {
  name: 'SettingsModal',
  setup() {
    const set = (patch) => savePrefs(patch);
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
    return { store, t, set, closeModal, reset, myHours, weekday, dayLabel, locIcon, locLabel };
  },
  template: `
    <modal :title="t('Settings')" width="560px" @close="closeModal">
      <div class="field-label">{{ t('Appearance') }}</div>
      <div class="grid-2">
        <label class="field"><span>{{ t('Theme') }}</span>
          <select class="select" :value="store.prefs.theme" @change="set({ theme: $event.target.value })">
            <option value="system">{{ t('System') }}</option><option value="light">{{ t('Light') }}</option><option value="dark">{{ t('Dark') }}</option>
          </select></label>
        <label class="field"><span>{{ t('Language') }}</span>
          <select class="select" :value="store.prefs.locale" @change="set({ locale: $event.target.value })"><option value="en">English</option><option value="da">Dansk</option></select></label>
      </div>
      <div class="field-label" style="margin-top:26px">{{ t('Calendar overview') }}</div>
      <div class="grid-2">
        <label class="field"><span>{{ t('Row height') }}</span>
          <select class="select" :value="store.prefs.row_height" @change="set({ row_height: $event.target.value })">
            <option value="sm">{{ t('Compact') }} – {{ t('Only the strip (no text)') }}</option><option value="md">{{ t('Normal') }}</option><option value="lg">{{ t('Comfortable') }}</option>
          </select></label>
        <label class="field"><span>{{ t('Days to show') }}</span>
          <select class="select" :value="store.prefs.days" @change="set({ days: Number($event.target.value) })"><option v-for="d in store.options.day_options" :key="d" :value="d">{{ d }}</option></select></label>
      </div>
      <label class="switch block" style="margin-bottom:8px"><input type="checkbox" :checked="store.prefs.show_weekends" @change="set({ show_weekends: $event.target.checked })"><span class="track"></span>{{ t('Show weekends') }}</label>
      <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.show_week_numbers_overview" @change="set({ show_week_numbers_overview: $event.target.checked })"><span class="track"></span>{{ t('Show week numbers') }}</label>
      <div class="field-label" style="margin-top:26px">{{ t('Month calendar') }}</div>
      <div class="field"><span>{{ t('Months shown') }}</span>
        <div class="steps compact" role="group" :aria-label="t('Months shown')">
          <button type="button" :aria-pressed="store.prefs.mini_months === 1 ? 'true' : 'false'" @click="set({ mini_months: 1 })">{{ t('1 month') }}</button>
          <button type="button" :aria-pressed="store.prefs.mini_months === 2 ? 'true' : 'false'" @click="set({ mini_months: 2 })">{{ t('2 months') }}</button>
        </div></div>
      <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.show_week_numbers" @change="set({ show_week_numbers: $event.target.checked })"><span class="track"></span>{{ t('Show week numbers') }}</label>
      <div class="field-label" style="margin-top:26px">{{ t('Find free time') }}</div>
      <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.find_time_enabled" @change="set({ find_time_enabled: $event.target.checked })"><span class="track"></span>{{ t('Show the “Find free time” section in the menu') }}</label>
      <div class="field" style="margin-top:26px;margin-bottom:14px"><span class="field-label">{{ t('Working hours') }}</span>
        <span class="hours-info" tabindex="0">{{ t('Working hours are read from Outlook') }}<span class="i"><icon name="info" :size="14"></icon></span>
          <div class="hours-pop" role="tooltip">
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
          </div>
        </span></div>
      <div class="field-label" style="margin-top:18px">{{ t('Demo data') }}</div>
      <label class="switch block" style="align-items:flex-start"><input type="checkbox" :checked="store.prefs.demo_enabled" @change="set({ demo_enabled: $event.target.checked })"><span class="track" style="margin-top:2px"></span><span>{{ t('Demo data') }}<br><small class="muted">{{ t('Show 150 fictional people with generated calendars. Handy for trying the app before your colleagues are in a group.') }}</small></span></label>
      <div class="row" style="margin-top:16px"><span class="muted" style="font-size:12px">{{ t('Version') }} {{ store.app.version }}</span></div>
      <template #foot>
        <button type="button" class="btn danger" @click="reset"><icon name="refresh" :size="14"></icon>{{ t('Reset all settings') }}</button>
        <span class="grow"></span>
        <span class="modal-note">{{ t('Settings are saved to your account and follow you to other devices.') }}</span>
        <button type="button" class="btn primary" @click="closeModal">{{ t('Close') }}</button>
      </template>
    </modal>`,
};
