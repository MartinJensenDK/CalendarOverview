import { store } from '../store.js';
import { t } from '../i18n.js';
import { closeModal, savePrefs, syncPhotos } from '../actions.js';

export default {
  name: 'SettingsModal',
  setup() {
    const set = (patch) => savePrefs(patch);
    return { store, t, set, closeModal, syncPhotos };
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
      <div class="field-label" style="margin-top:6px">{{ t('Overview') }}</div>
      <div class="grid-2">
        <label class="field"><span>{{ t('Row height') }}</span>
          <select class="select" :value="store.prefs.row_height" @change="set({ row_height: $event.target.value })">
            <option value="sm">{{ t('Compact') }} – {{ t('Only the strip (no text)') }}</option><option value="md">{{ t('Normal') }}</option><option value="lg">{{ t('Comfortable') }}</option>
          </select></label>
        <label class="field"><span>{{ t('Days to show') }}</span>
          <select class="select" :value="store.prefs.days" @change="set({ days: Number($event.target.value) })"><option v-for="d in store.options.day_options" :key="d" :value="d">{{ d }}</option></select></label>
        <label class="field"><span>{{ t('Rows per page') }}</span>
          <select class="select" :value="store.prefs.page_size" @change="set({ page_size: Number($event.target.value) })"><option v-for="n in store.options.page_sizes" :key="n" :value="n">{{ n }}</option></select></label>
        <label class="field"><span>{{ t('Working hours') }}</span>
          <span class="row"><input class="input" type="time" :value="store.prefs.work_start" @change="set({ work_start: $event.target.value })"><span class="muted">–</span><input class="input" type="time" :value="store.prefs.work_end" @change="set({ work_end: $event.target.value })"></span></label>
      </div>
      <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.show_weekends" @change="set({ show_weekends: $event.target.checked })"><span class="track"></span>{{ t('Show weekends') }}</label>
      <div class="field-label" style="margin-top:18px">{{ t('Month calendar') }}</div>
      <label class="field"><span>{{ t('Months shown') }}</span>
        <select class="select" style="max-width:200px" :value="store.prefs.mini_months" @change="set({ mini_months: Number($event.target.value) })"><option :value="1">{{ t('1 month') }}</option><option :value="2">{{ t('2 months') }}</option></select></label>
      <label class="switch block" style="margin-bottom:14px"><input type="checkbox" :checked="store.prefs.show_week_numbers" @change="set({ show_week_numbers: $event.target.checked })"><span class="track"></span>{{ t('Show week numbers') }}</label>
      <div class="field-label">{{ t('Demo data') }}</div>
      <label class="switch block" style="align-items:flex-start"><input type="checkbox" :checked="store.prefs.demo_enabled" @change="set({ demo_enabled: $event.target.checked })"><span class="track" style="margin-top:2px"></span><span>{{ t('Demo data') }}<br><small class="muted">{{ t('Show 150 fictional people with generated calendars. Handy for trying the app before your colleagues are in a group.') }}</small></span></label>
      <div class="row" style="margin-top:16px"><button type="button" class="btn sm" @click="syncPhotos"><icon name="image" :size="14"></icon>{{ t('Sync photos') }}</button><span class="muted" style="font-size:12px">{{ t('Version') }} {{ store.app.version }}</span></div>
      <template #foot>
        <span class="modal-note">{{ t('Settings are saved to your account and follow you to other devices.') }}</span>
        <span class="grow"></span>
        <button type="button" class="btn primary" @click="closeModal">{{ t('Close') }}</button>
      </template>
    </modal>`,
};
