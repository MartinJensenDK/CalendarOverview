// Month calendar at the bottom of the menu: click a day to move the overview there.
import { store } from '../store.js';
import { t, locale } from '../i18n.js';
import { ymd, parseYmd, addDays, todayYmd, isoWeek } from '../util/date.js';
import { setFrom, savePrefs } from '../actions.js';

const { ref, computed, watch } = Vue;

export default {
  name: 'MiniCalendar',
  setup() {
    // First month shown; follows the overview until the user browses months manually.
    const anchor = ref(monthStart(store.from || todayYmd()));
    watch(() => store.from, (v) => { if (v) anchor.value = monthStart(v); });

    function monthStart(s) { const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }
    function shiftMonth(s, n) { const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth() + n, 1)); }

    const months = computed(() => {
      const count = store.prefs.mini_months === 2 ? 2 : 1;
      const out = [];
      for (let i = 0; i < count; i++) out.push(buildMonth(shiftMonth(anchor.value, i)));
      return out;
    });
    const range = computed(() => {
      if (!store.from) return null;
      return { from: store.from, to: addDays(store.from, store.prefs.days - 1) };
    });

    function buildMonth(first) {
      const d = parseYmd(first);
      const label = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(d);
      const offset = (d.getDay() + 6) % 7; // Monday first
      let cursor = addDays(first, -offset);
      const weeks = [];
      for (let w = 0; w < 6; w++) {
        const days = [];
        for (let i = 0; i < 7; i++) {
          days.push({ ymd: cursor, day: parseYmd(cursor).getDate(), outside: cursor.slice(0, 7) !== first.slice(0, 7), weekend: i >= 5 });
          cursor = addDays(cursor, 1);
        }
        weeks.push({ n: isoWeek(days[0].ymd), days });
        if (parseYmd(cursor).getMonth() !== d.getMonth() && cursor.slice(0, 7) !== first.slice(0, 7) && w >= 3) break;
      }
      return { first, label, weeks };
    }

    const weekdays = computed(() => {
      const base = parseYmd('2024-01-01'); // a Monday
      return [...Array(7)].map((_, i) => new Intl.DateTimeFormat(locale(), { weekday: 'narrow' }).format(new Date(base.getTime() + i * 86400000)));
    });
    const today = computed(() => todayYmd());
    function inRange(s) { return range.value && s >= range.value.from && s <= range.value.to; }
    function pick(s) { setFrom(s); }
    function browse(n) { anchor.value = shiftMonth(anchor.value, n); }
    function toggleMonths() { savePrefs({ mini_months: store.prefs.mini_months === 2 ? 1 : 2 }); }

    return { store, t, months, weekdays, today, inRange, pick, browse, toggleMonths };
  },
  template: `
    <div class="minical">
      <div class="minical-head">
        <button type="button" class="btn ghost icon sm" @click="browse(-1)" :title="t('Previous')"><icon name="chevron-left" :size="14"></icon></button>
        <span class="minical-title">{{ months[0].label }}</span>
        <button type="button" class="btn ghost icon sm" @click="browse(1)" :title="t('Next')"><icon name="chevron-right" :size="14"></icon></button>
        <span class="grow"></span>
        <button type="button" class="expand" :class="{ open: store.prefs.mini_months === 2 }" @click="toggleMonths" :title="store.prefs.mini_months === 2 ? t('1 month') : t('2 months')" :aria-label="store.prefs.mini_months === 2 ? t('1 month') : t('2 months')"><icon name="chevron-down" :size="14"></icon></button>
      </div>
      <div v-for="(m, i) in months" :key="m.first" class="minical-month">
        <div class="minical-title" v-if="i > 0">{{ m.label }}</div>
        <div class="minical-grid" :class="{ 'no-wk': !store.prefs.show_week_numbers }">
          <span class="wk" v-if="store.prefs.show_week_numbers"></span>
          <span v-for="(w, i) in weekdays" :key="i" class="dow" :class="{ weekend: i >= 5 }">{{ w }}</span>
          <template v-for="w in m.weeks" :key="w.n + m.first">
            <span class="wk" v-if="store.prefs.show_week_numbers" :title="t('Week') + ' ' + w.n">{{ w.n }}</span>
            <button type="button" v-for="d in w.days" :key="d.ymd" class="day" :class="{ outside: d.outside, weekend: d.weekend, today: d.ymd === today, range: inRange(d.ymd), start: d.ymd === store.from }" @click="pick(d.ymd)" :aria-label="d.ymd">{{ d.day }}</button>
          </template>
        </div>
      </div>
    </div>`,
};
