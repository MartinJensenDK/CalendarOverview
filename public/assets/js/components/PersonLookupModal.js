// Quick person lookup: opens when you start typing anywhere. Shows the person's
// calendar for the current overview range and can add them to a manual group.
import { api } from '../api.js';
import { store, toast } from '../store.js';
import { t } from '../i18n.js';
import { closeModal, openModal, loadOverview } from '../actions.js';
import { addDays, parseYmd, weekday, dayLabel, timeLabel, isWeekend, ymd } from '../util/date.js';
import { colorFor, readableText } from '../util/rules.js';
import { hoursFor } from '../util/hours.js';
import { minutesToHhmm } from '../util/date.js';

const { ref, computed, watch, onMounted, nextTick } = Vue;

export default {
  name: 'PersonLookupModal',
  props: { initial: { type: String, default: '' }, person: { type: Object, default: null } }, // person: open straight on their calendar
  setup(props) {
    const q = ref(props.initial);
    const input = ref(null);
    const results = ref([]);
    const active = ref(0);
    const searching = ref(false);
    const person = ref(null);
    const schedule = ref(null);
    const loadingSchedule = ref(false);
    const groupId = ref('');
    const adding = ref(false);
    let timer = null;
    let seq = 0;

    async function search() {
      const mine = ++seq;
      searching.value = true;
      try {
        const data = await api.get('/api/directory/users', { q: q.value, context: 'lookup' });
        if (mine !== seq) return;
        results.value = data.users;
        active.value = 0;
      } catch (e) {
        if (mine === seq) results.value = [];
      } finally {
        if (mine === seq) searching.value = false;
      }
    }
    watch(q, () => { person.value = null; schedule.value = null; clearTimeout(timer); timer = setTimeout(search, 160); });
    onMounted(async () => {
      await nextTick();
      if (props.person) { pick(props.person); return; }
      if (input.value) { input.value.focus(); input.value.setSelectionRange(q.value.length, q.value.length); }
      search();
    });

    const range = computed(() => ({ from: store.from, to: addDays(store.from, store.prefs.days) }));
    const days = computed(() => {
      const out = [];
      for (let d = range.value.from; d < range.value.to; d = addDays(d, 1)) if (store.prefs.show_weekends || !isWeekend(d)) out.push(d);
      return out;
    });

    async function pick(u) {
      person.value = u;
      results.value = [];
      loadingSchedule.value = true;
      try {
        const data = await api.get('/api/availability', { users: [u.id], from: range.value.from, to: range.value.to, tz: store.tz });
        schedule.value = data.users[0] || { items: [] };
      } catch (e) {
        toast(e.message || t('Something went wrong'), 'danger');
      } finally { loadingSchedule.value = false; }
    }
    // Working hours and location for the day, from the person's plan in Microsoft 365.
    function hoursOn(day) {
      if (!schedule.value) return [];
      return hoursFor(schedule.value, day).map((h) => ({ time: `${minutesToHhmm(h.sm)}–${minutesToHhmm(h.em)}`, loc: h.loc }));
    }
    function locIcon(loc) { return loc === 'remote' ? 'home' : 'building'; }
    function locLabel(loc) { return loc === 'remote' ? t('Home') : loc === 'office' ? t('Office') : loc === 'hybrid' ? t('Hybrid') : loc; }
    function itemsFor(day) {
      if (!schedule.value) return [];
      const ds = parseYmd(day).getTime(); const de = ds + 86400000;
      return schedule.value.items.filter((it) => new Date(it.e).getTime() > ds && new Date(it.s).getTime() < de).map((it) => {
        const rule = colorFor(it, store.rules);
        return {
          key: it.s + it.e + (it.sub || ''),
          label: it.sub || (it.pr ? t('Private') : t('Busy')),
          time: it.ad ? t('All-day') : `${timeLabel(new Date(it.s))}–${timeLabel(new Date(it.e))}`,
          loc: it.loc,
          st: it.st,
          style: rule ? { background: rule.color, color: rule.text_color || readableText(rule.color) } : {},
        };
      });
    }
    function onKey(e) {
      if (person.value) { if (e.key === 'Backspace' && q.value === '') { person.value = null; } return; }
      if (!results.value.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active.value = (active.value + 1) % results.value.length; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + results.value.length) % results.value.length; }
      else if (e.key === 'Enter') { e.preventDefault(); pick(results.value[active.value]); }
    }
    function back() { person.value = null; schedule.value = null; search(); nextTick(() => input.value && input.value.focus()); }

    const manualGroups = computed(() => store.menu.filter((g) => g.kind === 'group' && g.type === 'manual'));
    const alreadyIn = computed(() => person.value ? manualGroups.value.filter((g) => (g.manual_members || []).some((m) => m.id === person.value.id)).map((g) => g.id) : []);
    const memberOf = computed(() => manualGroups.value.filter((g) => alreadyIn.value.includes(g.id)).map((g) => g.name));
    async function addToGroup() {
      const g = manualGroups.value.find((x) => String(x.id) === String(groupId.value));
      if (!g || !person.value) return;
      adding.value = true;
      try {
        const data = await api.put(`/api/groups/${g.id}`, {
          name: g.name, type: 'manual',
          members: [...new Set([...(g.manual_members || []).map((m) => m.id), person.value.id])],
          managers: (g.managers || []).map((m) => m.id),
        });
        store.menu = data.menu;
        toast(t('{name} added to {group}', { name: person.value.name, group: g.name }));
        groupId.value = ''; // ready for the next group: a person may belong to several
        loadOverview();
      } catch (e) {
        toast(e.message || t('Something went wrong'), 'danger');
      } finally { adding.value = false; }
    }
    function newGroup() { const p = person.value; closeModal(); openModal('group', { presetMembers: [p] }); }

    return { store, t, q, input, results, active, searching, person, schedule, loadingSchedule, days, itemsFor, hoursOn, locIcon, locLabel, pick, onKey, back, manualGroups, alreadyIn, memberOf, groupId, adding, addToGroup, newGroup, closeModal, weekday, dayLabel, isWeekend, todayYmd: ymd(new Date()) };
  },
  template: `
    <modal :title="t('Look up a person')" width="640px" dismissable @close="closeModal">
      <div class="lookup-search">
        <span class="lookup-icon"><icon name="search"></icon></span>
        <input ref="input" class="input" type="search" v-model="q" :placeholder="t('Type a name, title or department')" @keydown="onKey" autocomplete="off">
        <button type="button" class="btn ghost sm" v-if="person" @click="back">{{ t('Back to results') }}</button>
      </div>

      <div v-if="!person" class="lookup-results">
        <div v-if="!results.length" class="muted" style="padding:14px 4px">{{ searching ? '…' : (q ? t('No matches') : t('Type to search')) }}</div>
        <button type="button" v-for="(r, i) in results" :key="r.id" class="lookup-row" :class="{ active: i === active }" @click="pick(r)" @mousemove="active = i">
          <img class="avatar" :src="r.photo_url" alt="">
          <span class="txt"><b>{{ r.name }}</b><small>{{ [r.title, r.department].filter(Boolean).join(' · ') || r.email }}</small></span>
          <icon name="chevron-right" :size="14"></icon>
        </button>
      </div>

      <div v-else class="lookup-person">
        <div class="lookup-head">
          <img class="avatar lg" :src="person.photo_url" alt="">
          <span class="txt"><b>{{ person.name }}</b><small>{{ [person.title, person.department].filter(Boolean).join(' · ') }}</small><small>{{ person.email }}</small></span>
        </div>
        <div class="lookup-add" v-if="manualGroups.length">
          <select class="select" v-model="groupId" style="max-width:260px">
            <option value="" disabled>{{ t('Add to a manual group…') }}</option>
            <option v-for="g in manualGroups" :key="g.id" :value="g.id" :disabled="alreadyIn.includes(g.id)">{{ g.name }}{{ alreadyIn.includes(g.id) ? ' · ' + t('already a member') : '' }}</option>
          </select>
          <button type="button" class="btn primary sm" :disabled="!groupId || adding" @click="addToGroup"><icon name="plus" :size="14"></icon>{{ t('Add') }}</button>
          <button type="button" class="btn sm ghost" @click="newGroup">{{ t('New group with this person') }}</button>
          <span class="muted lookup-memberof" v-if="memberOf.length">{{ t('Member of {groups}', { groups: memberOf.join(', ') }) }}</span>
        </div>
        <div class="lookup-add" v-else>
          <button type="button" class="btn primary sm" @click="newGroup"><icon name="plus" :size="14"></icon>{{ t('New group with this person') }}</button>
        </div>

        <div class="lookup-days" v-if="!loadingSchedule && schedule">
          <div v-if="schedule.error" class="callout warn">{{ t('No access to this calendar') }}</div>
          <div v-for="d in days" :key="d" class="lookup-day" :class="{ weekend: isWeekend(d), today: d === todayYmd }">
            <div class="lookup-date"><span class="dow">{{ weekday(d) }}</span><span class="date">{{ dayLabel(d) }}</span>
              <span class="hours" v-for="(h, k) in hoursOn(d)" :key="k"><span class="loc" v-if="h.loc" :title="locLabel(h.loc)"><icon :name="locIcon(h.loc)" :size="11"></icon></span>{{ h.time }}</span></div>
            <div class="lookup-items">
              <span v-if="!itemsFor(d).length" class="muted free">{{ t('free') }}</span>
              <span v-for="it in itemsFor(d)" :key="it.key" class="lookup-item" :class="it.st" :style="it.style" :title="it.loc || ''"><span class="mono">{{ it.time }}</span> {{ it.label }}</span>
            </div>
          </div>
        </div>
        <div v-else class="muted" style="padding:16px 4px">…</div>
      </div>
      <template #foot>
        <span class="modal-note">{{ t('Tip: just start typing anywhere to look someone up.') }}</span>
        <span class="grow"></span>
        <button type="button" class="btn" @click="closeModal">{{ t('Close') }}</button>
      </template>
    </modal>`,
};
