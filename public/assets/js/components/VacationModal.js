// Vacation calendar: a timeline of who is away when, for everyone in the overview.
import { api } from '../api.js';
import { store, toast } from '../store.js';
import { t } from '../i18n.js';
import { closeModal, savePrefs } from '../actions.js';
import { todayYmd, addDays, parseYmd, isWeekend, dayLabel, weekday, ymd } from '../util/date.js';

const { ref, computed, onMounted, watch } = Vue;

const SPANS = [31, 92, 183, 366];

function monthStart(s) { const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }
function dayDiff(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }

export default {
  name: 'VacationModal',
  setup() {
    const from = ref(monthStart(todayYmd()));
    const span = ref(SPANS.includes(store.prefs.vacation_days) ? store.prefs.vacation_days : 92);
    const q = ref('');
    const data = ref(null);
    const loading = ref(false);
    const today = todayYmd();

    async function load() {
      loading.value = true;
      try {
        data.value = await api.get('/api/vacations', { from: from.value, days: span.value, tz: store.tz });
      } catch (e) {
        toast(e.message || t('Something went wrong'), 'danger');
      } finally { loading.value = false; }
    }
    onMounted(load);
    watch([from, span], load);
    watch(span, (v) => { if (store.prefs.vacation_days !== v) savePrefs({ vacation_days: v }).catch(() => {}); });

    function shift(dir) { from.value = monthStart(addDays(from.value, dir * (span.value >= 183 ? span.value : span.value + 2))); }
    function goToday() { from.value = monthStart(today); }

    const to = computed(() => data.value ? data.value.to : addDays(from.value, span.value));
    const total = computed(() => Math.max(1, dayDiff(from.value, to.value)));
    function pct(d) { return (dayDiff(from.value, d) / total.value) * 100; }

    // Header: one segment per month in the range, plus weekend shading and the today line.
    const months = computed(() => {
      const out = [];
      let cursor = from.value;
      while (cursor < to.value) {
        const d = parseYmd(cursor);
        const next = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 1));
        const end = next < to.value ? next : to.value;
        out.push({ key: cursor, label: d.toLocaleDateString(store.prefs.locale === 'da' ? 'da-DK' : 'en-GB', span.value > 183 ? { month: 'short' } : { month: 'long', year: 'numeric' }), left: pct(cursor), width: pct(end) - pct(cursor) });
        cursor = next;
      }
      return out;
    });
    const weekends = computed(() => {
      const out = [];
      if (span.value > 183) return out; // too dense to be useful over a year
      for (let d = from.value; d < to.value; d = addDays(d, 1)) if (isWeekend(d)) out.push({ key: d, left: pct(d), width: 100 / total.value });
      return out;
    });
    const todayLeft = computed(() => (today >= from.value && today < to.value) ? pct(today) : null);

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
            return { ...p, style: { left: `${left}%`, width: `${Math.max(right - left, 0.6)}%` }, label: barLabel(p), current: p.from <= today && p.to >= today };
          }),
        }));
    });
    function barLabel(p) {
      const range = p.from === p.to ? dayLabel(p.from) : `${dayLabel(p.from)} – ${dayLabel(p.to)}`;
      return `${range} · ${p.days === 1 ? t('1 day') : t('{n} days', { n: p.days })}${p.sub ? ' · ' + p.sub : ''}`;
    }
    const onVacationToday = computed(() => (data.value ? data.value.users.filter((u) => u.periods.some((p) => p.from <= today && p.to >= today)) : []));
    const barColor = computed(() => (store.rules.find((r) => /vacation|ferie/i.test(r.name || '') && r.enabled !== false) || {}).color || '#e5484d');

    return { store, t, from, span, SPANS, q, data, loading, rows, months, weekends, todayLeft, onVacationToday, barColor, shift, goToday, closeModal, dayLabel, weekday, today, to };
  },
  template: `
    <modal :title="t('Vacation calendar')" width="1040px" @close="closeModal">
      <div class="row wrap vac-toolbar">
        <div class="row" style="gap:4px">
          <button type="button" class="btn icon sm" :title="t('Previous')" @click="shift(-1)"><icon name="chevron-left" :size="14"></icon></button>
          <button type="button" class="btn sm" @click="goToday">{{ t('Today') }}</button>
          <button type="button" class="btn icon sm" :title="t('Next')" @click="shift(1)"><icon name="chevron-right" :size="14"></icon></button>
        </div>
        <span class="vac-range">{{ dayLabel(from) }} – {{ dayLabel(to) }}</span>
        <div class="steps compact vac-spans" role="group" :aria-label="t('Period')">
          <button type="button" v-for="s in SPANS" :key="s" :aria-pressed="span === s ? 'true' : 'false'" @click="span = s">{{ s === 31 ? t('1 month') : s === 92 ? t('3 months') : s === 183 ? t('6 months') : t('1 year') }}</button>
        </div>
        <span class="grow"></span>
        <input class="input" v-model="q" :placeholder="t('Filter people')" style="max-width:220px">
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
        <div class="vac" v-else :style="{ '--vac-bar': barColor }">
          <div class="vac-head">
            <div class="vac-name muted">{{ t('{n} people', { n: rows.length }) }}</div>
            <div class="vac-track">
              <span v-for="m in months" :key="m.key" class="vac-month" :style="{ left: m.left + '%', width: m.width + '%' }">{{ m.label }}</span>
            </div>
          </div>
          <div class="vac-empty muted" v-if="!rows.length">{{ t('No vacation in this period.') }}</div>
          <div v-for="u in rows" :key="u.id" class="vac-row" :class="{ me: u.is_me }">
            <div class="vac-name"><img class="avatar" :src="u.photo_url" alt=""><span class="txt"><b>{{ u.name }}</b><small>{{ u.title || u.email }}</small></span></div>
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
    </modal>`,
};
