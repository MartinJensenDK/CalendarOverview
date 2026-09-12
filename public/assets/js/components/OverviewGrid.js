import { store } from '../store.js';
import { t } from '../i18n.js';
import { isWeekend, weekday, dayLabel, todayYmd, minutesInDay, timeLabel, parseYmd, isoWeek, addDays } from '../util/date.js';
import { colorFor, readableText } from '../util/rules.js';
import { hoursFor, hoursRange, DEFAULT_HOURS } from '../util/hours.js';
import { loadOverview, savePrefs, openModal, toggleSelect, setSelection } from '../actions.js';

const { computed, ref, watch, onMounted, onBeforeUnmount } = Vue;

export default {
  name: 'OverviewGrid',
  setup() {
    const now = ref(new Date());
    let timer = null;
    onMounted(() => { timer = setInterval(() => { now.value = new Date(); }, 60000); });
    onBeforeUnmount(() => clearInterval(timer));

    const days = computed(() => {
      if (!store.overview) return [];
      return store.overview.days.filter((d) => store.prefs.show_weekends || !isWeekend(d));
    });
    const users = computed(() => {
      if (!store.overview) return [];
      const q = (store.search || '').trim().toLowerCase();
      if (!q) return store.overview.users;
      return store.overview.users.filter((u) => `${u.name} ${u.title || ''} ${u.email || ''} ${u.department || ''}`.toLowerCase().includes(q));
    });

    // The day strip spans everyone's working hours (from Graph) ± 1 h so early/late meetings stay visible.
    const strip = computed(() => {
      const r = (store.overview && hoursRange(store.overview.users, days.value)) || DEFAULT_HOURS;
      const start = Math.max(0, r.start - 60);
      const end = Math.min(1440, Math.max(r.end + 60, start + 120));
      return { start, end, len: end - start };
    });
    // Working-hours bands per person and day: each person's own hours, which can differ per day.
    const bandIndex = computed(() => {
      const map = new Map();
      if (!store.overview) return map;
      const s = strip.value;
      for (const u of store.overview.users) {
        for (const d of days.value) {
          map.set(`${u.id}|${d}`, hoursFor(u, d).map((h) => {
            const a = Math.max(h.sm, s.start); const b = Math.min(h.em, s.end);
            return b > a ? { style: { left: `${((a - s.start) / s.len) * 100}%`, width: `${((b - a) / s.len) * 100}%` }, loc: h.loc } : null;
          }).filter(Boolean));
        }
      }
      return map;
    });
    const NO_BANDS = [];
    function bandsFor(user, day) { return bandIndex.value.get(`${user.id}|${day}`) || NO_BANDS; }
    // Work location from the person's plan (Outlook › Work hours and location): office, remote/home, hybrid.
    function locIcon(loc) { return loc === 'remote' ? 'home' : 'building'; }
    function locLabel(loc) { return loc === 'remote' ? t('Home') : loc === 'office' ? t('Office') : loc === 'hybrid' ? t('Hybrid') : loc; }
    const today = computed(() => todayYmd());
    const nowPct = computed(() => {
      const s = strip.value;
      const m = now.value.getHours() * 60 + now.value.getMinutes();
      if (m < s.start || m > s.end) return null;
      return `${((m - s.start) / s.len) * 100}%`;
    });

    // Blocks are built once per data change for every person and day, and looked up
    // during rendering. Together with v-memo on the cells, a re-render (selection,
    // search, the minute tick) touches only cells whose blocks actually changed.
    const blockIndex = computed(() => {
      const map = new Map();
      if (!store.overview) return map;
      for (const u of store.overview.users) {
        for (const d of days.value) map.set(`${u.id}|${d}`, buildBlocks(u, d));
      }
      return map;
    });
    const NO_BLOCKS = [];
    function blocksFor(user, day) { return blockIndex.value.get(`${user.id}|${day}`) || NO_BLOCKS; }
    // Skip the fade-in when the grid is large; animating thousands of blocks costs more than it shows.
    const bigGrid = computed(() => blockIndex.value.size > 600);

    // Skeleton for the first load: same columns as the real grid, twelve placeholder rows
    // with a deterministic scatter of bars so it looks like a calendar, not a table.
    const skDays = computed(() => {
      const out = [];
      for (let i = 0; i < Math.min(store.prefs.days, 14); i++) {
        const d = addDays(store.from || todayYmd(), i);
        if (store.prefs.show_weekends || !isWeekend(d)) out.push(d);
      }
      return out;
    });
    function skBlocks(row, col) {
      const h = (row * 7 + col * 13) % 11;
      const bars = [];
      if (h % 3 !== 2) bars.push({ left: `${8 + (h * 9) % 30}%`, width: `${12 + (h * 5) % 22}%` });
      if (h % 4 === 0 || h === 7) bars.push({ left: `${52 + (h * 4) % 18}%`, width: `${10 + (h * 3) % 18}%` });
      return bars;
    }

    function buildBlocks(user, day) {
      const dayStart = parseYmd(day).getTime();
      const dayEnd = dayStart + 86400000;
      const s = strip.value;
      const out = [];
      let allDayCount = 0;
      for (const it of user.items) {
        const a = new Date(it.s).getTime(); const b = new Date(it.e).getTime();
        if (b <= dayStart || a >= dayEnd) continue;
        const rule = colorFor(it, store.rules);
        const style = rule ? { '--blk': rule.color, '--blk-ink': rule.text_color || readableText(rule.color) } : {};
        const label = it.sub || (it.pr ? t('Private') : t('Busy'));
        if (it.ad) {
          if (allDayCount++ > 0) continue; // one all-day bar per cell keeps the strip readable
          out.unshift({ key: `${it.s}-ad`, item: it, cls: `blk allday ${it.st}${it.pr ? ' private' : ''}`, style, label, time: '' });
          continue;
        }
        const sm = Math.max(minutesInDay(it.s, day), s.start);
        const em = Math.min(minutesInDay(it.e, day), s.end);
        if (em <= sm) continue;
        const left = ((sm - s.start) / s.len) * 100;
        const width = Math.max(((em - sm) / s.len) * 100, 1.5);
        out.push({
          key: it.s + it.e + (it.sub || ''),
          item: it,
          cls: `blk ${it.st}${it.pr ? ' private' : ''}`,
          style: { ...style, left: `${left}%`, width: `calc(${width}% - 2px)` },
          label,
          time: `${timeLabel(new Date(it.s))}–${timeLabel(new Date(it.e))}`,
        });
      }
      return out;
    }

    function showTip(e, blk, user) { store.tooltip = { x: e.clientX, y: e.clientY, item: blk.item, user: user.name }; }
    function moveTip(e) { if (store.tooltip) { store.tooltip.x = e.clientX; store.tooltip.y = e.clientY; } }
    function hideTip() { store.tooltip = null; }

    function errorText(code) {
      if (code === 'no_mailbox') return t('No mailbox');
      if (code === 'consent_required' || code === 'ErrorAccessDenied') return t('Consent needed');
      return t('No access to this calendar');
    }
    function selectUser(u) { openModal('heatmap', { ids: [u.id] }); }
    function weekBadge(d, i) { return store.prefs.show_week_numbers_overview && (i === 0 || parseYmd(d).getDay() === 1) ? isoWeek(d) : null; }
    function isSelected(id) { return store.selected.includes(id); }
    // Corner checkbox: selects every row, or clears when all are selected.
    const allState = computed(() => {
      const ids = users.value.map((u) => u.id);
      const count = ids.filter((id) => store.selected.includes(id)).length;
      return { all: ids.length > 0 && count === ids.length, some: count > 0 && count < ids.length };
    });
    const allBox = ref(null);
    watch(allState, (s) => { if (allBox.value) allBox.value.indeterminate = s.some; }, { immediate: true, flush: 'post' });
    function toggleAll() {
      const ids = users.value.map((u) => u.id);
      if (allState.value.all) setSelection(store.selected.filter((id) => !ids.includes(id)));
      else setSelection([...store.selected, ...ids]);
    }

    return { store, t, days, users, today, nowPct, blocksFor, isWeekend, weekday, dayLabel, showTip, moveTip, hideTip, bigGrid, skDays, skBlocks, bandsFor, locIcon, locLabel, savePrefs, loadOverview, errorText, selectUser, openModal, weekBadge, isSelected, toggleSelect, allState, allBox, toggleAll };
  },
  template: `
    <section class="main">
      <div class="grid-wrap" @mouseleave="hideTip">
        <div class="loading-bar" v-if="store.loading"></div>
        <div v-if="store.error" class="grid-empty"><div class="card" style="box-shadow:none;border:0;background:transparent">
          <h3>{{ t('Something went wrong') }}</h3><p>{{ store.error }}</p>
          <button type="button" class="btn primary" @click="loadOverview()">{{ t('Try again') }}</button>
        </div></div>
        <div v-else-if="store.overview && !store.overview.total" class="grid-empty"><div class="card" style="box-shadow:none;border:0;background:transparent">
          <h3>{{ t('Nothing to show yet') }}</h3><p>{{ t('Show a group in the menu on the left, or create one with the people you want to follow.') }}</p>
          <button type="button" class="btn primary" @click="openModal('group')"><icon name="plus"></icon>{{ t('Create group') }}</button>
        </div></div>
        <div v-else-if="!store.overview" class="grid skeleton" :class="'rh-' + store.prefs.row_height" :style="{ '--days': skDays.length }" aria-hidden="true">
          <div class="h corner"></div>
          <div v-for="d in skDays" :key="d" class="h"><span class="sk" style="width:26px;height:9px"></span><span class="sk" style="width:46px;height:11px"></span></div>
          <template v-for="i in 12" :key="i">
            <div class="name"><span class="avatar sk circle"></span><span class="txt" style="flex:1"><span class="sk" :style="{ width: (70 + (i * 37) % 60) + 'px', height: '11px' }"></span><span class="sk" style="width:56px;height:8px"></span></span></div>
            <div v-for="(d, j) in skDays" :key="d" class="cell" :class="{ weekend: isWeekend(d) }"><div class="band" v-if="!isWeekend(d)" style="left:10%;width:70%"></div><span v-for="(b, k) in skBlocks(i, j)" :key="k" class="sk sk-blk" :style="b"></span></div>
          </template>
        </div>
        <div v-else class="grid" :class="['rh-' + store.prefs.row_height, { 'no-anim': bigGrid }]" :style="{ '--days': days.length }">
          <div class="h corner">
            <label class="pick-all" v-if="store.prefs.find_time_enabled" :title="allState.all ? t('Clear selection') : t('Select everyone on this page')">
              <input type="checkbox" ref="allBox" :checked="allState.all" @change="toggleAll" :aria-label="allState.all ? t('Clear selection') : t('Select everyone on this page')">
            </label>
            <span class="txt"><span class="count">{{ t('{n} people', { n: store.overview.total }) }}</span><span class="muted" style="font-size:11px">{{ t('Hover a block for details.') }}</span></span>
          </div>
          <div v-for="(d, i) in days" :key="d" class="h" :class="{ weekend: isWeekend(d), today: d === today }">
            <span class="dow">{{ weekday(d) }}</span><span class="date">{{ dayLabel(d) }}</span>
            <span class="wkno" v-if="weekBadge(d, i)">{{ t('Week') }} {{ weekBadge(d, i) }}</span>
          </div>
          <template v-for="u in users" :key="u.id">
            <div class="name" :class="{ me: u.is_me, selected: isSelected(u.id), selectable: store.prefs.find_time_enabled }" @click="store.prefs.find_time_enabled && toggleSelect(u.id)" :title="store.prefs.find_time_enabled ? t('Click to select') : ''">
              <input v-if="store.prefs.find_time_enabled" type="checkbox" class="pick" :checked="isSelected(u.id)" @click.stop @change="toggleSelect(u.id)" :aria-label="u.name">
              <img class="avatar" :src="u.photo_url" alt="" loading="lazy">
              <span class="txt"><b>{{ u.name }}</b><small v-if="u.error" class="warn">{{ errorText(u.error) }}</small><small v-else>{{ u.title || u.email }}</small></span>
            </div>
            <div v-for="d in days" :key="u.id + d" v-memo="[blocksFor(u, d), bandsFor(u, d), d === today ? nowPct : null, u.error]" class="cell" :class="{ weekend: isWeekend(d), today: d === today }">
              <div v-for="(b, k) in bandsFor(u, d)" :key="k" class="band" :style="b.style"><span class="loc" v-if="b.loc" :title="locLabel(b.loc)"><icon :name="locIcon(b.loc)" :size="11"></icon></span></div>
              <div class="now" v-if="d === today && nowPct" :style="{ '--now-pct': nowPct }"></div>
              <div class="strip">
                <div v-for="b in blocksFor(u, d)" :key="b.key" :class="b.cls" :style="b.style" @mouseenter="showTip($event, b, u)" @mousemove="moveTip" @mouseleave="hideTip">
                  <span class="t" v-if="b.time">{{ b.time }}</span>{{ b.label }}
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </section>`,
};
