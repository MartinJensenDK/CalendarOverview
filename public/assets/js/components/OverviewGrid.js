import { store } from '../store.js';
import { t } from '../i18n.js';
import { isWeekend, weekday, dayLabel, todayYmd, minutesInDay, hhmmToMinutes, timeLabel, parseYmd, isoWeek } from '../util/date.js';
import { colorFor, readableText } from '../util/rules.js';
import { loadOverview, setPage, savePrefs, openModal, toggleSelect } from '../actions.js';

const { computed, ref, onMounted, onBeforeUnmount } = Vue;

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

    // The day strip covers working hours ± 1 h so early/late meetings stay visible.
    const strip = computed(() => {
      const ws = hhmmToMinutes(store.prefs.work_start);
      const we = hhmmToMinutes(store.prefs.work_end);
      const start = Math.max(0, ws - 60);
      const end = Math.min(1440, Math.max(we + 60, start + 120));
      return { start, end, len: end - start, ws, we };
    });
    const bandStyle = computed(() => {
      const s = strip.value;
      return { '--band-l': `${((s.ws - s.start) / s.len) * 100}%`, '--band-w': `${((s.we - s.ws) / s.len) * 100}%` };
    });
    const today = computed(() => todayYmd());
    const nowPct = computed(() => {
      const s = strip.value;
      const m = now.value.getHours() * 60 + now.value.getMinutes();
      if (m < s.start || m > s.end) return null;
      return `${((m - s.start) / s.len) * 100}%`;
    });

    function blocksFor(user, day) {
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

    const totalPages = computed(() => (store.overview ? Math.max(1, Math.ceil(store.overview.total / store.overview.per_page)) : 1));
    const pages = computed(() => {
      const total = totalPages.value; const cur = store.page;
      const set = new Set([1, total, cur, cur - 1, cur + 1, cur - 2, cur + 2].filter((p) => p >= 1 && p <= total));
      return [...set].sort((a, b) => a - b);
    });
    const rangeText = computed(() => {
      const o = store.overview;
      if (!o || !o.total) return '';
      const from = (o.page - 1) * o.per_page + 1;
      const to = Math.min(o.total, o.page * o.per_page);
      return t('Showing {from}–{to} of {total}', { from, to, total: o.total });
    });
    function errorText(code) {
      if (code === 'no_mailbox') return t('No mailbox');
      if (code === 'consent_required' || code === 'ErrorAccessDenied') return t('Consent needed');
      return t('No access to this calendar');
    }
    function selectUser(u) { openModal('heatmap', { ids: [u.id] }); }
    function weekBadge(d, i) { return store.prefs.show_week_numbers && (i === 0 || parseYmd(d).getDay() === 1) ? isoWeek(d) : null; }
    function isSelected(id) { return store.selected.includes(id); }

    return { store, t, days, users, bandStyle, today, nowPct, blocksFor, isWeekend, weekday, dayLabel, showTip, moveTip, hideTip, totalPages, pages, rangeText, setPage, savePrefs, loadOverview, errorText, selectUser, openModal, weekBadge, isSelected, toggleSelect };
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
        <div v-else-if="store.overview" class="grid" :class="'rh-' + store.prefs.row_height" :style="{ '--days': days.length, ...bandStyle }">
          <div class="h corner"><span class="count">{{ t('{n} people', { n: store.overview.total }) }}</span><span class="muted" style="font-size:11px">{{ t('Hover a block for details.') }}</span></div>
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
            <div v-for="d in days" :key="u.id + d" class="cell" :class="{ weekend: isWeekend(d), today: d === today }">
              <div class="band"></div>
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
      <div class="pager" v-if="store.overview && store.overview.total">
        <span>{{ rangeText }}</span>
        <span class="grow"></span>
        <select class="select inline" :value="store.prefs.page_size" @change="savePrefs({ page_size: Number($event.target.value) })" :aria-label="t('Rows per page')">
          <option v-for="n in store.options.page_sizes" :key="n" :value="n">{{ n }} {{ t('per page') }}</option>
        </select>
        <span class="pages" v-if="totalPages > 1">
          <button type="button" :disabled="store.page <= 1" @click="setPage(store.page - 1)"><icon name="chevron-left" :size="14"></icon></button>
          <template v-for="(p, i) in pages" :key="p">
            <span v-if="i > 0 && pages[i - 1] !== p - 1" class="muted">…</span>
            <button type="button" :class="{ active: p === store.page }" @click="setPage(p)">{{ p }}</button>
          </template>
          <button type="button" :disabled="store.page >= totalPages" @click="setPage(store.page + 1)"><icon name="chevron-right" :size="14"></icon></button>
        </span>
      </div>
    </section>`,
};
