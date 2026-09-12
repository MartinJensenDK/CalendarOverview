// Typeahead against /api/directory/users, /api/directory/managers or /api/entra/groups.
import { api } from '../api.js';
import { t } from '../i18n.js';

const { ref, watch } = Vue;

export default {
  name: 'UserPicker',
  props: {
    endpoint: { type: String, required: true },
    placeholder: { type: String, default: '' },
    exclude: { type: Array, default: () => [] },
    kind: { type: String, default: 'users' }, // users | groups
  },
  emits: ['pick'],
  setup(props, { emit }) {
    const q = ref('');
    const results = ref([]);
    const open = ref(false);
    const active = ref(0);
    const loading = ref(false);
    let timer = null;
    let seq = 0;

    async function search() {
      const mine = ++seq;
      loading.value = true;
      try {
        const data = await api.get(props.endpoint, { q: q.value });
        if (mine !== seq) return;
        const list = props.kind === 'groups' ? data.groups : data.users;
        results.value = list.filter((x) => !props.exclude.includes(x.id));
        active.value = 0;
        open.value = true;
      } catch (e) {
        if (mine === seq) results.value = [];
      } finally {
        if (mine === seq) loading.value = false;
      }
    }
    watch(q, () => {
      clearTimeout(timer);
      timer = setTimeout(search, 180);
    });
    function pick(item) {
      emit('pick', item);
      q.value = '';
      results.value = [];
      open.value = false;
    }
    function onKey(e) {
      if (!open.value || !results.value.length) { if (e.key === 'ArrowDown') search(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); active.value = (active.value + 1) % results.value.length; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + results.value.length) % results.value.length; }
      else if (e.key === 'Enter') { e.preventDefault(); pick(results.value[active.value]); }
      else if (e.key === 'Escape') { e.stopPropagation(); open.value = false; }
    }
    function onFocus() { if (!results.value.length) search(); else open.value = true; }
    function onBlur() { setTimeout(() => { open.value = false; }, 150); }
    return { q, results, open, active, loading, pick, onKey, onFocus, onBlur, t };
  },
  template: `
    <div class="picker">
      <input class="input" type="search" v-model="q" :placeholder="placeholder" @keydown="onKey" @focus="onFocus" @blur="onBlur" autocomplete="off">
      <div class="results" v-if="open">
        <div v-if="!results.length" class="none">{{ loading ? '…' : (q ? t('No matches') : t('Type to search')) }}</div>
        <div v-for="(r, i) in results" :key="r.id" class="opt" :class="{ active: i === active }" @mousedown.prevent="pick(r)" @mousemove="active = i">
          <img v-if="kind === 'users'" class="avatar sm" :src="r.photo_url" alt="">
          <span v-else class="avatar sm" style="display:grid;place-items:center;font-size:11px;font-weight:600">{{ r.kind === 'm365' ? 'M' : r.kind === 'security' ? 'S' : 'D' }}</span>
          <span class="txt"><b>{{ r.name }}</b><small>{{ kind === 'users' ? [r.title, r.department].filter(Boolean).join(' · ') || r.email : (r.description || r.mail || r.id) }}</small></span>
        </div>
      </div>
    </div>`,
};
