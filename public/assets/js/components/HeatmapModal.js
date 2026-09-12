import { api } from '../api.js';
import { store, toast } from '../store.js';
import { t } from '../i18n.js';
import { closeModal, savePrefs } from '../actions.js';
import { todayYmd, addDays, isWeekend, weekday, dayLabel, hhmmToMinutes, minutesToHhmm, parseYmd, localIso } from '../util/date.js';

const { ref, reactive, computed, watch, onMounted } = Vue;

const MAX_DAYS = 366; // the server splits this into Graph-sized windows

const BUSY = new Set(['busy', 'oof', 'tentative', 'unknown']);

export default {
  name: 'HeatmapModal',
  props: { ids: { type: Array, required: true } },
  setup(props) {
    const ids = ref([...props.ids]);
    const addingMore = ref(false);
    const p = store.prefs;
    const form = reactive({
      from: todayYmd(),
      to: addDays(todayYmd(), Math.min(MAX_DAYS, p.heatmap_days || 7)),
      slot: p.heatmap_slot || 30,
      workOnly: p.heatmap_work_only !== false,
      showWeekends: p.heatmap_show_weekends !== false,
      duration: p.heatmap_duration || 30,
      subject: '',
    });
    // Remember the choices on the server (they follow the user to other devices).
    let saveTimer = null;
    watch(() => [form.slot, form.workOnly, form.showWeekends, form.duration, form.from, form.to], () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const span = Math.max(1, Math.min(MAX_DAYS, Math.round((parseYmd(form.to) - parseYmd(form.from)) / 86400000)));
        const patch = { heatmap_slot: form.slot, heatmap_work_only: form.workOnly, heatmap_show_weekends: form.showWeekends, heatmap_duration: form.duration, heatmap_days: span };
        if (Object.keys(patch).some((k) => store.prefs[k] !== patch[k])) savePrefs(patch).catch(() => {});
      }, 400);
    });
    const data = ref(null);
    const loading = ref(false);
    const sel = ref(null); // { day, start, end } minutes
    let dragging = null;

    async function load() {
      loading.value = true;
      try {
        data.value = await api.get('/api/availability', { users: ids.value, from: form.from, to: form.to, tz: store.tz });
      } catch (e) {
        toast(e.message || t('Something went wrong'), 'danger');
      } finally { loading.value = false; }
    }
    onMounted(load);
    watch(() => [form.from, form.to], () => {
      if (form.to <= form.from) return;
      const span = Math.round((parseYmd(form.to) - parseYmd(form.from)) / 86400000);
      if (span > MAX_DAYS) { form.to = addDays(form.from, MAX_DAYS); toast(t('Up to {n} days at a time', { n: MAX_DAYS })); return; }
      load();
    });
    function preset(days) { form.to = addDays(form.from, days); }
    function addPerson(u) {
      if (ids.value.includes(u.id)) return;
      ids.value.push(u.id);
      if (!store.selected.includes(u.id)) store.selected.push(u.id);
      addingMore.value = false;
      load();
    }

    const days = computed(() => (data.value ? data.value.days.filter((d) => form.showWeekends || !isWeekend(d)) : []));
    const range = computed(() => {
      const ws = form.workOnly ? hhmmToMinutes(store.prefs.work_start) : 0;
      const we = form.workOnly ? hhmmToMinutes(store.prefs.work_end) : 1440;
      return { start: ws, end: Math.max(we, ws + form.slot) };
    });
    const slots = computed(() => {
      const out = [];
      for (let m = range.value.start; m < range.value.end; m += form.slot) out.push(m);
      return out;
    });
    const users = computed(() => (data.value ? data.value.users : []));

    // Busy intervals per user per day in minutes since local midnight.
    const busyIndex = computed(() => {
      const idx = {};
      for (const u of users.value) {
        idx[u.id] = {};
        for (const it of u.items) {
          if (!BUSY.has(it.st)) continue;
          const a = new Date(it.s).getTime(); const b = new Date(it.e).getTime();
          for (const d of days.value) {
            const ds = parseYmd(d).getTime(); const de = ds + 86400000;
            if (b <= ds || a >= de) continue;
            (idx[u.id][d] ||= []).push([Math.max(0, (a - ds) / 60000), Math.min(1440, (b - ds) / 60000)]);
          }
        }
      }
      return idx;
    });
    function isFree(uid, day, start, end) {
      const list = (busyIndex.value[uid] || {})[day] || [];
      return !list.some(([a, b]) => a < end && b > start);
    }
    function freeCount(day, start, end) {
      return users.value.filter((u) => isFree(u.id, day, start, end)).length;
    }
    // Red (nobody free) → amber (half) → green (everyone free), in muted modern tones.
    const STOPS = [[229, 85, 96], [245, 190, 60], [46, 176, 114]];
    function mix(a, b, f) { return a.map((v, i) => Math.round(v + (b[i] - v) * f)); }
    function heatColor(p) {
      const rgb = p < 0.5 ? mix(STOPS[0], STOPS[1], p * 2) : mix(STOPS[1], STOPS[2], (p - 0.5) * 2);
      return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
    }
    function cellStyle(day, m) {
      const total = users.value.length || 1;
      return { background: heatColor(freeCount(day, m, m + form.slot) / total) };
    }
    function isSel(day, m) { return sel.value && sel.value.day === day && m >= sel.value.start && m < sel.value.end; }
    function down(day, m) { dragging = { day, anchor: m }; sel.value = { day, start: m, end: m + form.slot }; }
    function enter(day, m) {
      if (!dragging || dragging.day !== day) return;
      const a = Math.min(dragging.anchor, m); const b = Math.max(dragging.anchor, m) + form.slot;
      sel.value = { day, start: a, end: b };
    }
    function up() { dragging = null; }

    // Hover tooltip: "x of y free" for the slot under the cursor.
    const hov = ref(null);
    function hover(e, day, m) {
      const free = freeCount(day, m, m + form.slot);
      const total = users.value.length;
      let meeting = null;
      if (form.duration > form.slot && m + form.duration <= range.value.end) {
        meeting = t('{free} of {total} free for the whole meeting ({time})', { free: freeCount(day, m, m + form.duration), total, time: `${minutesToHhmm(m)}–${minutesToHhmm(m + form.duration)}` });
      }
      hov.value = { x: e.clientX, y: e.clientY, label: `${weekday(day, 'short')} ${dayLabel(day)} · ${minutesToHhmm(m)}–${minutesToHhmm(m + form.slot)}`, text: t('{free} of {total} free', { free, total }), meeting };
    }
    function unhover() { hov.value = null; }
    const hovStyle = computed(() => hov.value ? { left: `${Math.min(hov.value.x + 14, window.innerWidth - 220)}px`, top: `${hov.value.y + 18}px` } : {});

    // The next three windows of the chosen length where the most people are free
    // (everyone, when possible; otherwise the best attendance in the period).
    const suggestions = computed(() => {
      if (!users.value.length || !days.value.length) return [];
      const total = users.value.length;
      const todayS = todayYmd();
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const step = 15;
      const windows = [];
      for (const d of days.value) {
        if (d < todayS) continue;
        let start = range.value.start;
        if (d === todayS) start = Math.max(start, Math.ceil(nowMin / step) * step);
        for (let m = start; m + form.duration <= range.value.end; m += step) {
          windows.push({ day: d, start: m, end: m + form.duration, free: users.value.filter((u) => isFree(u.id, d, m, m + form.duration)).length });
        }
      }
      // Best attendance first, earliest first among equals; never two overlapping windows.
      const ranked = windows.filter((w) => w.free > 0).sort((a, b) => b.free - a.free || a.day.localeCompare(b.day) || a.start - b.start);
      const out = [];
      for (const w of ranked) {
        if (out.some((o) => o.day === w.day && w.start < o.end && w.end > o.start)) continue;
        out.push({ ...w, total, label: `${weekday(w.day, 'short')} ${dayLabel(w.day)} · ${minutesToHhmm(w.start)}–${minutesToHhmm(w.end)}` });
        if (out.length >= 3) break;
      }
      return out;
    });
    function isSuggestionActive(s) { return !!sel.value && sel.value.day === s.day && sel.value.start === s.start && sel.value.end === s.end; }
    function useSuggestion(s) { sel.value = isSuggestionActive(s) ? null : { day: s.day, start: s.start, end: s.end }; }
    function clearSel() { sel.value = null; }

    const detail = computed(() => {
      if (!sel.value) return null;
      const s = sel.value;
      const list = users.value.map((u) => ({ ...u, free: isFree(u.id, s.day, s.start, s.end) }));
      return { ...s, list, free: list.filter((x) => x.free).length, label: `${weekday(s.day, 'long')} ${dayLabel(s.day)} · ${minutesToHhmm(s.start)}–${minutesToHhmm(s.end)}` };
    });
    const outlookUrl = computed(() => {
      if (!detail.value) return '#';
      const d = parseYmd(detail.value.day);
      const start = new Date(d); start.setMinutes(detail.value.start);
      const end = new Date(d); end.setMinutes(detail.value.end);
      const to = users.value.map((u) => u.email).filter(Boolean).join(',');
      const params = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', startdt: localIso(start), enddt: localIso(end), subject: form.subject || t('Meeting'), to });
      return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
    });

    return { store, t, ids, addingMore, addPerson, clearSel, isSuggestionActive, form, data, loading, days, slots, users, cellStyle, isSel, down, enter, up, hov, hover, unhover, hovStyle, detail, outlookUrl, closeModal, isWeekend, weekday, dayLabel, minutesToHhmm, preset, suggestions, useSuggestion, MAX_DAYS };
  },
  template: `
    <modal :title="t('Find a time')" width="900px" @close="closeModal">
      <div class="heat-toolbar">
        <label class="field"><span>{{ t('From') }}</span><input class="input" type="date" v-model="form.from"></label>
        <label class="field"><span>{{ t('To') }}</span><input class="input" type="date" v-model="form.to" :min="form.from"></label>
        <div class="seg" style="height:34px;align-self:end">
          <button type="button" @click="preset(7)">{{ t('1 week') }}</button><button type="button" @click="preset(14)">{{ t('2 weeks') }}</button><button type="button" @click="preset(31)">{{ t('1 month') }}</button><button type="button" @click="preset(92)">{{ t('3 months') }}</button><button type="button" @click="preset(183)">{{ t('6 months') }}</button><button type="button" @click="preset(365)">{{ t('1 year') }}</button>
        </div>
        <label class="field"><span>{{ t('Slot') }}</span><select class="select" v-model.number="form.slot"><option :value="15">{{ t('{n} min', { n: 15 }) }}</option><option :value="30">{{ t('{n} min', { n: 30 }) }}</option><option :value="60">{{ t('{n} min', { n: 60 }) }}</option></select></label>
        <label class="field"><span>{{ t('Meeting length') }}</span><select class="select" v-model.number="form.duration"><option :value="30">{{ t('{n} min', { n: 30 }) }}</option><option :value="60">{{ t('{n} min', { n: 60 }) }}</option><option :value="90">{{ t('{n} min', { n: 90 }) }}</option><option :value="120">{{ t('{n} min', { n: 120 }) }}</option></select></label>
        <label class="switch" style="height:34px"><input type="checkbox" v-model="form.workOnly"><span class="track"></span>{{ t('Working hours only') }}</label>
        <label class="switch" style="height:34px"><input type="checkbox" v-model="form.showWeekends"><span class="track"></span>{{ t('Show weekends') }}</label>
        <span class="grow"></span>
        <span class="avatars row" style="gap:0"><img v-for="u in users.slice(0, 8)" :key="u.id" class="avatar sm" :src="u.photo_url" :title="u.name" alt="" style="margin-left:-6px;border:2px solid var(--surface)"></span>
        <span class="muted" style="font-size:12px">{{ t('{n} people', { n: users.length }) }}</span>
        <button type="button" class="btn ghost sm" @click="addingMore = !addingMore"><icon name="plus" :size="14"></icon>{{ t('Add more') }}</button>
      </div>
      <div class="row" style="margin:-4px 0 10px" v-if="addingMore">
        <div style="flex:1;max-width:360px"><user-picker endpoint="/api/directory/users" :placeholder="t('Add a person')" :exclude="ids" @pick="addPerson"></user-picker></div>
        <button type="button" class="btn ghost sm" @click="addingMore = false">{{ t('Cancel') }}</button>
      </div>
      <div class="suggest" v-if="data">
        <div class="field-label">{{ t('Next 3 times when most people can') }}</div>
        <div class="row wrap" v-if="suggestions.length">
          <button type="button" v-for="s in suggestions" :key="s.day + s.start" class="btn sm suggest-btn" :class="{ active: isSuggestionActive(s), partial: s.free < s.total }" :aria-pressed="isSuggestionActive(s)" :title="isSuggestionActive(s) ? t('Click again to deselect') : ''" @click="useSuggestion(s)"><icon name="clock" :size="14"></icon>{{ s.label }}<span class="suggest-count">{{ t('{free} of {total} free', { free: s.free, total: s.total }) }}</span></button>
        </div>
        <div class="muted" style="font-size:12px" v-else>{{ t('No common free time in this period.') }}</div>
      </div>
      <p class="muted" style="margin:0 0 10px;font-size:12px">{{ t('Click a slot to see who is free. Drag to select a longer time.') }}</p>
      <div class="heat-detail" v-if="detail">
        <div class="row" style="align-items:flex-start"><h3 class="grow">{{ detail.label }} · {{ t('{free} of {total} free', { free: detail.free, total: users.length }) }}</h3><button type="button" class="btn ghost icon sm" :title="t('Clear selection')" @click="clearSel"><icon name="x" :size="14"></icon></button></div>
        <ul>
          <li v-for="u in detail.list" :key="u.id" :class="{ busy: !u.free }"><img class="avatar sm" :src="u.photo_url" alt=""><span>{{ u.name }}</span><span class="st">{{ u.free ? t('free') : t('busy') }}</span></li>
        </ul>
        <div class="row" style="margin-top:12px">
          <input class="input" v-model="form.subject" :placeholder="t('Meeting subject')" style="max-width:320px">
          <a class="btn primary" :href="outlookUrl" target="_blank" rel="noopener"><icon name="external"></icon>{{ t('Open in Outlook') }}</a>
        </div>
      </div>
      <div class="heat-wrap" @mouseup="up" @mouseleave="up(); unhover()">
        <div class="heat" :style="{ '--hdays': days.length }" v-if="data">
          <div class="hh"></div>
          <div v-for="d in days" :key="d" class="hh" :class="{ weekend: isWeekend(d) }"><span class="dow">{{ weekday(d) }}</span><span class="date">{{ dayLabel(d) }}</span></div>
          <template v-for="m in slots" :key="m">
            <div class="ht">{{ m % 60 === 0 ? minutesToHhmm(m) : '' }}</div>
            <div v-for="d in days" :key="d + m" class="hc" :class="{ hour: m % 60 === 0, weekend: isWeekend(d), sel: isSel(d, m) }" :style="cellStyle(d, m)" @mousedown.prevent="down(d, m)" @mouseenter="enter(d, m); hover($event, d, m)" @mousemove="hover($event, d, m)"></div>
          </template>
        </div>
        <div v-else style="padding:40px;text-align:center" class="muted">…</div>
      </div>
      <div class="tooltip" v-if="hov" :style="hovStyle"><span class="time">{{ hov.label }}</span><span class="sub">{{ hov.text }}</span><span class="loc" v-if="hov.meeting">{{ hov.meeting }}</span></div>
      <div class="heat-legend"><span>{{ t('nobody free') }}</span><span class="bar"></span><span>{{ t('everyone free') }}</span></div>
      <template #foot>
        <span class="grow"></span>
        <button type="button" class="btn" @click="closeModal">{{ t('Close') }}</button>
      </template>
    </modal>`,
};
