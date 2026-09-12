import { api } from '../api.js';
import { store, toast } from '../store.js';
import { t } from '../i18n.js';
import { closeModal } from '../actions.js';
import { todayYmd, addDays, isWeekend, weekday, dayLabel, hhmmToMinutes, minutesToHhmm, parseYmd, localIso } from '../util/date.js';

const { ref, reactive, computed, watch, onMounted } = Vue;

const BUSY = new Set(['busy', 'oof', 'tentative', 'unknown']);

export default {
  name: 'HeatmapModal',
  props: { ids: { type: Array, required: true } },
  setup(props) {
    const form = reactive({ from: todayYmd(), to: addDays(todayYmd(), 7), slot: store.prefs.heatmap_slot || 30, workOnly: true, subject: '' });
    const data = ref(null);
    const loading = ref(false);
    const sel = ref(null); // { day, start, end } minutes
    let dragging = null;

    async function load() {
      loading.value = true;
      try {
        data.value = await api.get('/api/availability', { users: props.ids, from: form.from, to: form.to, tz: store.tz });
      } catch (e) {
        toast(e.message || t('Something went wrong'), 'danger');
      } finally { loading.value = false; }
    }
    onMounted(load);
    watch(() => [form.from, form.to], () => { if (form.to > form.from) load(); });

    const days = computed(() => (data.value ? data.value.days.filter((d) => store.prefs.show_weekends || !isWeekend(d)) : []));
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
    function cellStyle(day, m) {
      const total = users.value.length || 1;
      return { '--p': (freeCount(day, m, m + form.slot) / total).toFixed(2) };
    }
    function isSel(day, m) { return sel.value && sel.value.day === day && m >= sel.value.start && m < sel.value.end; }
    function down(day, m) { dragging = { day, anchor: m }; sel.value = { day, start: m, end: m + form.slot }; }
    function enter(day, m) {
      if (!dragging || dragging.day !== day) return;
      const a = Math.min(dragging.anchor, m); const b = Math.max(dragging.anchor, m) + form.slot;
      sel.value = { day, start: a, end: b };
    }
    function up() { dragging = null; }

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

    return { store, t, form, data, loading, days, slots, users, cellStyle, isSel, down, enter, up, detail, outlookUrl, closeModal, isWeekend, weekday, dayLabel, minutesToHhmm };
  },
  template: `
    <modal :title="t('When is everyone free?')" width="900px" @close="closeModal">
      <div class="heat-toolbar">
        <label class="field"><span>{{ t('From') }}</span><input class="input" type="date" v-model="form.from"></label>
        <label class="field"><span>{{ t('To') }}</span><input class="input" type="date" v-model="form.to" :min="form.from"></label>
        <label class="field"><span>{{ t('Slot') }}</span><select class="select" v-model.number="form.slot"><option :value="15">{{ t('{n} min', { n: 15 }) }}</option><option :value="30">{{ t('{n} min', { n: 30 }) }}</option><option :value="60">{{ t('{n} min', { n: 60 }) }}</option></select></label>
        <label class="switch" style="height:34px"><input type="checkbox" v-model="form.workOnly"><span class="track"></span>{{ t('Working hours only') }}</label>
        <span class="grow"></span>
        <span class="avatars row" style="gap:0"><img v-for="u in users.slice(0, 8)" :key="u.id" class="avatar sm" :src="u.photo_url" :title="u.name" alt="" style="margin-left:-6px;border:2px solid var(--surface)"></span>
        <span class="muted" style="font-size:12px">{{ t('{n} people', { n: users.length }) }}</span>
      </div>
      <p class="muted" style="margin:0 0 10px;font-size:12px">{{ t('Click a slot to see who is free. Drag to select a longer time.') }}</p>
      <div class="heat-wrap" @mouseup="up" @mouseleave="up">
        <div class="heat" :style="{ '--hdays': days.length }" v-if="data">
          <div class="hh"></div>
          <div v-for="d in days" :key="d" class="hh" :class="{ weekend: isWeekend(d) }"><span class="dow">{{ weekday(d) }}</span><span class="date">{{ dayLabel(d) }}</span></div>
          <template v-for="m in slots" :key="m">
            <div class="ht">{{ m % 60 === 0 ? minutesToHhmm(m) : '' }}</div>
            <div v-for="d in days" :key="d + m" class="hc" :class="{ hour: m % 60 === 0, weekend: isWeekend(d), sel: isSel(d, m) }" :style="cellStyle(d, m)" @mousedown.prevent="down(d, m)" @mouseenter="enter(d, m)" :title="d + ' ' + minutesToHhmm(m)"></div>
          </template>
        </div>
        <div v-else style="padding:40px;text-align:center" class="muted">…</div>
      </div>
      <div class="heat-legend"><span>{{ t('nobody free') }}</span><span class="bar"></span><span>{{ t('everyone free') }}</span></div>
      <div class="heat-detail" v-if="detail">
        <h3>{{ detail.label }} · {{ t('{free} of {total} free', { free: detail.free, total: users.length }) }}</h3>
        <ul>
          <li v-for="u in detail.list" :key="u.id" :class="{ busy: !u.free }"><img class="avatar sm" :src="u.photo_url" alt=""><span>{{ u.name }}</span><span class="st">{{ u.free ? t('free') : t('busy') }}</span></li>
        </ul>
        <div class="row" style="margin-top:12px">
          <input class="input" v-model="form.subject" :placeholder="t('Meeting subject')" style="max-width:320px">
          <a class="btn primary" :href="outlookUrl" target="_blank" rel="noopener"><icon name="external"></icon>{{ t('Open in Outlook') }}</a>
        </div>
      </div>
      <template #foot>
        <span class="grow"></span>
        <button type="button" class="btn" @click="closeModal">{{ t('Close') }}</button>
      </template>
    </modal>`,
};
