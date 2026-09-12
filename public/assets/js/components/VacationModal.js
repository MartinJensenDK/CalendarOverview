// Vacation calendar: a timeline of who is away when, for the people in the overview or in chosen groups.
import { api } from '../api.js';
import { store, toast } from '../store.js';
import { t } from '../i18n.js';
import { closeModal, savePrefs } from '../actions.js';
import { todayYmd, addDays, parseYmd, isWeekend, isoWeek, dayLabel, weekday, ymd } from '../util/date.js';
import PersonLookupModal from './PersonLookupModal.js';

const { ref, computed, onMounted, onBeforeUnmount, watch } = Vue;

const SPANS = [31, 92, 183, 366];

function monthStart(s) { const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }
function dayDiff(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }

export default {
  name: 'VacationModal',
  components: { PersonLookupModal },
  setup() {
    const lookupPerson = ref(null); // a person's calendar, shown on top without losing the timeline
    const from = ref(monthStart(todayYmd()));
    const span = ref(SPANS.includes(store.prefs.vacation_days) ? store.prefs.vacation_days : 92);
    // Inclusive last day shown; presets and arrows keep it in step with the start.
    const to = ref(addDays(from.value, span.value - 1));
    const MAX_DAYS = 366;
    function spanDays() { return dayDiff(from.value, to.value) + 1; }
    const q = ref('');
    // Which menu entries (My team, groups, Demo team) feed the timeline. Until the user picks, it follows the overview.
    const entries = computed(() => store.menu.map((e) => ({ key: String(e.id), label: e.kind === 'builtin' ? (e.type === 'demo' ? t('Demo team') : t('My team')) : e.name, count: (e.members || []).length, visible: !!e.visible })));
    const custom = computed(() => Array.isArray(store.prefs.vacation_groups));
    const groupKeys = ref(custom.value ? store.prefs.vacation_groups.map(String) : entries.value.filter((e) => e.visible).map((e) => e.key));
    const isOn = (key) => groupKeys.value.includes(key);
    function toggleGroup(key) {
      groupKeys.value = isOn(key) ? groupKeys.value.filter((k) => k !== key) : [...groupKeys.value, key];
      savePrefs({ vacation_groups: groupKeys.value }).catch(() => {});
      load();
    }
    function resetGroups() {
      groupKeys.value = entries.value.filter((e) => e.visible).map((e) => e.key);
      savePrefs({ vacation_groups: null }).catch(() => {});
      load();
    }
    const data = ref(null);
    const loading = ref(false);
    const today = todayYmd();

    async function load() {
      loading.value = true;
      try {
        data.value = await api.get('/api/vacations', { from: from.value, to: to.value, tz: store.tz, groups: custom.value ? groupKeys.value : undefined });
      } catch (e) {
        toast(e.message || t('Something went wrong'), 'danger');
      } finally { loading.value = false; }
    }
    onMounted(load);
    watch([from, to], () => { if (to.value > from.value && spanDays() <= MAX_DAYS) load(); });
    function usePreset(s) {
      span.value = s;
      to.value = addDays(from.value, s - 1);
      if (store.prefs.vacation_days !== s) savePrefs({ vacation_days: s }).catch(() => {});
    }
    function setFrom(v) { if (!v) return; from.value = v; if (to.value <= v || spanDays() > MAX_DAYS) to.value = addDays(v, Math.min(spanDays(), MAX_DAYS) - 1 || 30); }
    function setTo(v) { if (!v) return; if (v <= from.value) from.value = addDays(v, -30); to.value = v; if (spanDays() > MAX_DAYS) from.value = addDays(v, -(MAX_DAYS - 1)); }
    function shift(dir) { const n = spanDays(); from.value = addDays(from.value, dir * n); to.value = addDays(to.value, dir * n); }
    function goToday() { const n = spanDays(); from.value = monthStart(today); to.value = addDays(from.value, n - 1); }
    const rangeInvalid = computed(() => to.value <= from.value || spanDays() > MAX_DAYS);
    const isPreset = (s) => spanDays() === s;

    const end = computed(() => addDays(to.value, 1)); // exclusive, for geometry
    // The axis is the list of shown days; with weekends hidden, Saturday and Sunday take no room.
    const showWeekends = computed(() => store.prefs.vacation_show_weekends !== false);
    const shownDays = computed(() => {
      const out = [];
      for (let d = from.value; d < end.value; d = addDays(d, 1)) if (showWeekends.value || !isWeekend(d)) out.push(d);
      return out.length ? out : [from.value];
    });
    const dayIndex = computed(() => { const m = new Map(); shownDays.value.forEach((d, i) => m.set(d, i)); return m; });
    const total = computed(() => shownDays.value.length);
    // Position of a day on the axis; a hidden day maps to the next shown one (so ranges still line up).
    function idx(d) {
      const i = dayIndex.value.get(d);
      if (i !== undefined) return i;
      const j = shownDays.value.findIndex((x) => x >= d);
      return j === -1 ? total.value : j;
    }
    function pct(d) { return (idx(d) / total.value) * 100; }

    // Header: one segment per month in the range, plus weekend shading and the today line.
    const months = computed(() => {
      const out = [];
      let cursor = from.value;
      while (cursor < end.value) {
        const d = parseYmd(cursor);
        const next = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 1));
        const segEnd = next < end.value ? next : end.value;
        out.push({ key: cursor, label: d.toLocaleDateString(store.prefs.locale === 'da' ? 'da-DK' : 'en-GB', total.value > 183 ? { month: 'short' } : { month: 'long', year: 'numeric' }), left: pct(cursor), width: pct(segEnd) - pct(cursor) });
        cursor = next;
      }
      return out;
    });
    const weekends = computed(() => {
      const out = [];
      if (total.value > 183) return out; // too dense to be useful over a year
      if (!showWeekends.value) return out;
      for (const d of shownDays.value) if (isWeekend(d)) out.push({ key: d, left: pct(d), width: 100 / total.value });
      return out;
    });
    // ISO week numbers: one label per week in the range, thinned out when the weeks get narrow.
    const weeks = computed(() => {
      const out = [];
      if (!store.prefs.vacation_week_numbers) return out;
      const pxPerWeek = (trackW.value / total.value) * (showWeekends.value ? 7 : 5);
      const step = pxPerWeek >= 20 ? 1 : pxPerWeek >= 10 ? 2 : 4;
      let cursor = from.value;
      while (cursor < end.value) {
        let next = addDays(cursor, 1);
        while (next < end.value && parseYmd(next).getDay() !== 1) next = addDays(next, 1);
        const n = isoWeek(cursor);
        const left = pct(cursor); const width = pct(next) - left;
        if (width > 0 && (step === 1 || n % step === 0)) out.push({ key: cursor, n, left, width });
        cursor = next;
      }
      return out;
    });
    const todayLeft = computed(() => dayIndex.value.has(today) ? pct(today) : null);

    // Day numbers and grid lines thin out as the range grows; based on the measured track width.
    const headTrack = ref(null);
    const trackW = ref(820);
    let ro = null;
    onMounted(() => {
      if (typeof ResizeObserver === 'undefined') return;
      ro = new ResizeObserver((entries) => { const w = entries[0] && entries[0].contentRect.width; if (w) trackW.value = w; });
      watch(headTrack, (el, old) => { if (old) ro.unobserve(old); if (el) ro.observe(el); }, { immediate: true });
    });
    onBeforeUnmount(() => { if (ro) ro.disconnect(); });
    const pxPerDay = computed(() => trackW.value / total.value);
    const dayNumbers = computed(() => {
      const px = pxPerDay.value;
      const step = px >= 16 ? 1 : px >= 6 ? 5 : px >= 2.5 ? 15 : 0;
      const out = [];
      if (!step) return out;
      for (const d of shownDays.value) {
        const n = parseYmd(d).getDate();
        if (step === 1 || n === 1 || (step === 5 && n % 5 === 0 && n < 30) || (step === 15 && n === 15)) out.push({ key: d, n, left: pct(d), width: 100 / total.value, today: d === today });
      }
      return out;
    });
    // Grid: one line per day when there is room, otherwise one per week starting on Mondays.
    const gridStyle = computed(() => {
      const px = pxPerDay.value;
      const perDay = px >= 6;
      let offset = 0;
      if (!perDay) { let d = from.value; while (parseYmd(d).getDay() !== 1) d = addDays(d, 1); offset = idx(d) * px; }
      return { '--vac-step': `${(perDay ? 1 : (showWeekends.value ? 7 : 5)) * px}px`, '--vac-off': `${offset}px` };
    });

    const rows = computed(() => {
      if (!data.value) return [];
      const needle = q.value.trim().toLowerCase();
      return data.value.users
        .filter((u) => !needle || `${u.name} ${u.title || ''} ${u.department || ''}`.toLowerCase().includes(needle))
        .map((u) => ({
          ...u,
          bars: u.periods.map((p) => {
            const left = Math.max(0, pct(p.from));
            const right = Math.min(100, pct(addDays(p.to, 1)));
            return { ...p, left, right, style: { left: `${left}%`, width: `${Math.max(right - left, 0.6)}%` }, label: barLabel(p), current: p.from <= today && p.to >= today };
          }).filter((b) => b.right > b.left), // periods that fall only on hidden days take no room
        }));
    });
    function barLabel(p) {
      const range = p.from === p.to ? dayLabel(p.from) : `${dayLabel(p.from)} – ${dayLabel(p.to)}`;
      return `${range} · ${p.days === 1 ? t('1 day') : t('{n} days', { n: p.days })}${p.sub ? ' · ' + p.sub : ''}`;
    }
    const onVacationToday = computed(() => (data.value ? data.value.users.filter((u) => u.periods.some((p) => p.from <= today && p.to >= today)) : []));
    const barColor = computed(() => (store.rules.find((r) => /vacation|ferie/i.test(r.name || '') && r.enabled !== false) || {}).color || '#e5484d');

    return { store, t, lookupPerson, headTrack, dayNumbers, weeks, gridStyle, from, to, span, SPANS, q, entries, custom, groupKeys, isOn, toggleGroup, resetGroups, data, loading, rows, months, weekends, todayLeft, onVacationToday, barColor, shift, goToday, usePreset, setFrom, setTo, isPreset, rangeInvalid, MAX_DAYS, closeModal, dayLabel, weekday, today };
  },
  template: `
    <modal :title="t('Vacation calendar')" width="1040px" @close="closeModal">
      <div class="row wrap vac-toolbar">
        <div class="row" style="gap:4px">
          <button type="button" class="btn icon sm" :title="t('Previous')" @click="shift(-1)"><icon name="chevron-left" :size="14"></icon></button>
          <button type="button" class="btn sm" @click="goToday">{{ t('Today') }}</button>
          <button type="button" class="btn icon sm" :title="t('Next')" @click="shift(1)"><icon name="chevron-right" :size="14"></icon></button>
        </div>
        <label class="field inline"><span>{{ t('From') }}</span><input class="input" type="date" :value="from" @change="setFrom($event.target.value)"></label>
        <label class="field inline"><span>{{ t('To') }}</span><input class="input" type="date" :value="to" @change="setTo($event.target.value)"></label>
        <div class="steps compact vac-spans" role="group" :aria-label="t('Period')">
          <button type="button" v-for="s in SPANS" :key="s" :aria-pressed="isPreset(s) ? 'true' : 'false'" @click="usePreset(s)">{{ s === 31 ? t('1 month') : s === 92 ? t('3 months') : s === 183 ? t('6 months') : t('1 year') }}</button>
        </div>
        <span class="muted" style="font-size:12px;color:var(--danger)" v-if="rangeInvalid">{{ t('Choose an end date after the start, at most {n} days later.', { n: MAX_DAYS }) }}</span>
        <span class="grow"></span>
        <input class="input" v-model="q" :placeholder="t('Filter people')" style="max-width:220px">
      </div>

      <div class="vac-groups" role="group" :aria-label="t('Groups')">
        <span class="field-label">{{ t('Groups') }}</span>
        <button type="button" v-for="e in entries" :key="e.key" class="vac-group" :aria-pressed="isOn(e.key) ? 'true' : 'false'" @click="toggleGroup(e.key)">{{ e.label }} <span class="n">{{ e.count }}</span></button>
        <button type="button" class="vac-reset" v-if="custom" @click="resetGroups">{{ t('Same as the overview') }}</button>
      </div>

      <div class="vac-today" v-if="data">
        <span class="field-label" style="margin:0">{{ t('On vacation today') }}</span>
        <template v-if="onVacationToday.length"><span v-for="u in onVacationToday" :key="u.id" class="chip"><img class="avatar sm" :src="u.photo_url" alt="">{{ u.name }}</span></template>
        <span class="muted" v-else style="font-size:12px">{{ t('Nobody is on vacation today') }}</span>
      </div>

      <div class="vac-wrap" :class="{ reloading: loading && data }">
        <div class="vac" v-if="!data" aria-hidden="true">
          <div class="vac-head"><div class="vac-name"></div><div class="vac-track"><span class="sk" style="width:120px;height:12px;margin:8px"></span></div></div>
          <div class="vac-row" v-for="i in 8" :key="i"><div class="vac-name"><span class="avatar sk circle"></span><span class="sk" :style="{ width: (70 + (i * 37) % 60) + 'px', height: '11px' }"></span></div><div class="vac-track"><span class="sk vac-bar" :style="{ left: ((i * 23) % 70) + '%', width: (6 + (i * 5) % 14) + '%' }"></span></div></div>
        </div>
        <div class="vac" v-else :class="{ grid: store.prefs.vacation_grid, 'with-weeks': weeks.length }" :style="{ '--vac-bar': barColor, ...gridStyle }">
          <div class="vac-head">
            <div class="vac-name muted">{{ t('{n} people', { n: rows.length }) }}</div>
            <div class="vac-track" ref="headTrack">
              <span v-for="m in months" :key="m.key" class="vac-month" :style="{ left: m.left + '%', width: m.width + '%' }">{{ m.label }}</span>
              <span v-for="wk in weeks" :key="wk.key" class="vac-week" :style="{ left: wk.left + '%', width: wk.width + '%' }" :title="t('Week') + ' ' + wk.n">{{ wk.n }}</span>
              <span v-for="d in dayNumbers" :key="d.key" class="vac-daynum" :class="{ today: d.today }" :style="{ left: d.left + '%', width: d.width + '%' }">{{ d.n }}</span>
            </div>
          </div>
          <div class="vac-empty muted" v-if="!rows.length">{{ groupKeys.length ? t('No vacation in this period.') : t('Choose at least one group to show.') }}</div>
          <div v-for="u in rows" :key="u.id" class="vac-row" :class="{ me: u.is_me }">
            <div class="vac-name"><img class="avatar" :src="u.photo_url" alt=""><span class="txt"><b>{{ u.name }}</b><small>{{ u.title || u.email }}</small></span><button type="button" class="cal" :title="t('Show calendar')" :aria-label="t('Show calendar') + ': ' + u.name" @click="lookupPerson = u"><icon name="calendar" :size="15"></icon></button></div>
            <div class="vac-track">
              <span v-for="w in weekends" :key="w.key" class="vac-weekend" :style="{ left: w.left + '%', width: w.width + '%' }"></span>
              <span class="vac-now" v-if="todayLeft !== null" :style="{ left: todayLeft + '%' }"></span>
              <span v-for="b in u.bars" :key="b.from" class="vac-bar" :class="{ current: b.current }" :style="b.style" :title="u.name + ': ' + b.label"><span class="vac-bar-text">{{ b.days === 1 ? t('1 day') : t('{n} days', { n: b.days }) }}</span></span>
            </div>
          </div>
        </div>
      </div>
      <p class="muted" style="margin:10px 0 0;font-size:12px" v-if="data">{{ t('{n} people without vacation in this period', { n: data.without }) }} · {{ t('Vacation is read from whole-day out-of-office items and items called vacation or holiday.') }}</p>
      <template #foot>
        <span class="grow"></span>
        <button type="button" class="btn" @click="closeModal">{{ t('Close') }}</button>
      </template>
    </modal>
    <person-lookup-modal v-if="lookupPerson" :person="lookupPerson" embedded @close="lookupPerson = null"></person-lookup-modal>`,
};
