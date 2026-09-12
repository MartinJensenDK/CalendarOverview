import { store, confirm } from '../store.js';
import { t } from '../i18n.js';
import { toggleGroup, reorderGroups, deleteGroup, resyncGroup, openModal, clearSelection } from '../actions.js';
import MiniCalendar from './MiniCalendar.js';

const { ref, computed } = Vue;

export default {
  name: 'SideMenu',
  components: { MiniCalendar },
  setup() {
    const dragId = ref(null);
    const dropTarget = ref(null);
    const entries = computed(() => store.menu);
    const selectedUsers = computed(() => {
      const map = new Map();
      store.menu.forEach((g) => g.members.forEach((m) => map.set(m.id, m)));
      (store.overview ? store.overview.users : []).forEach((u) => map.set(u.id, u));
      return store.selected.map((id) => map.get(id)).filter(Boolean);
    });

    function label(entry) {
      if (entry.kind === 'builtin') return entry.type === 'demo' ? t('Demo team') : t('My team');
      return entry.name;
    }
    function kindLabel(entry) {
      if (entry.kind !== 'group') return '';
      if (entry.type === 'entra') return 'Entra';
      return entry.managers && entry.managers.length ? t('Manager-based') : '';
    }
    function hint(entry) {
      if (entry.type === 'my_team' && !entry.has_manager) return t('You have no manager set in Entra ID, so “My team” only shows you.');
      return t('{n} people', { n: entry.members.length });
    }
    async function remove(entry) {
      const ok = await confirm({ title: t('Delete “{name}”?', { name: entry.name }), text: t('The group is removed from your menu. Nobody’s calendar is changed.'), confirmLabel: t('Delete'), danger: true });
      if (ok) deleteGroup(entry);
    }

    // Drag and drop reordering of user groups
    function onDragStart(entry, e) { if (entry.kind !== 'group') return; dragId.value = entry.id; e.dataTransfer.effectAllowed = 'move'; }
    function onDragOver(entry, e) { if (dragId.value === null || entry.kind !== 'group') return; e.preventDefault(); dropTarget.value = entry.id; }
    function onDrop(entry) {
      if (dragId.value === null || entry.kind !== 'group' || entry.id === dragId.value) { dragId.value = null; dropTarget.value = null; return; }
      const ids = store.menu.filter((g) => g.kind === 'group').map((g) => g.id);
      const from = ids.indexOf(dragId.value); const to = ids.indexOf(entry.id);
      ids.splice(from, 1); ids.splice(to, 0, dragId.value);
      dragId.value = null; dropTarget.value = null;
      reorderGroups(ids);
    }
    function onDragEnd() { dragId.value = null; dropTarget.value = null; }

    return { store, t, entries, selectedUsers, clearSelection, label, kindLabel, hint, toggleGroup, remove, resyncGroup, openModal, dragId, dropTarget, onDragStart, onDragOver, onDrop, onDragEnd };
  },
  template: `
    <aside class="sidebar">
      <div class="sidebar-head">
        <h2>{{ t('Groups') }}</h2>
        <button type="button" class="btn sm primary" @click="openModal('group')"><icon name="plus" :size="14"></icon>{{ t('Create group') }}</button>
      </div>
      <div class="sidebar-scroll">
        <div v-for="entry in entries" :key="entry.id" class="group" :class="{ dragging: dragId === entry.id, 'drop-before': dropTarget === entry.id && dragId !== entry.id }"
             :draggable="entry.kind === 'group'" @dragstart="onDragStart(entry, $event)" @dragover="onDragOver(entry, $event)" @drop="onDrop(entry)" @dragend="onDragEnd">
          <div class="group-row" :class="{ 'hidden-group': !entry.visible }" :title="hint(entry)">
            <span class="swatch-dot" :class="{ on: entry.visible }"></span>
            <span class="name" @click="toggleGroup(entry)">{{ label(entry) }}<small>{{ entry.members.length }}</small></span>
            <span class="kind" v-if="kindLabel(entry)">{{ kindLabel(entry) }}</span>
            <span class="tools" v-if="entry.kind === 'group'">
              <button type="button" class="eye" v-if="entry.type === 'entra'" :title="t('Sync members now')" @click="resyncGroup(entry)"><icon name="refresh" :size="14"></icon></button>
              <button type="button" class="eye" :title="t('Edit group')" @click="openModal('group', { group: entry })"><icon name="pencil" :size="14"></icon></button>
              <button type="button" class="eye" :title="t('Delete group')" @click="remove(entry)"><icon name="trash" :size="14"></icon></button>
            </span>
            <button type="button" class="eye" :class="{ on: entry.visible }" :title="entry.visible ? t('Hide from overview') : t('Show in overview')" @click="toggleGroup(entry)"><icon :name="entry.visible ? 'eye' : 'eye-off'"></icon></button>
          </div>
        </div>
      </div>
      <div class="sidebar-foot">
        <div class="findtime" v-if="store.prefs.find_time_enabled">
          <div class="findtime-head"><h2>{{ t('Find free time') }}</h2><span class="muted" v-if="store.selected.length">{{ t('{n} selected', { n: store.selected.length }) }}</span></div>
          <div class="findtime-body">
            <span class="avatars" v-if="selectedUsers.length"><img v-for="u in selectedUsers.slice(0, 8)" :key="u.id" class="avatar" :src="u.photo_url" :title="u.name" alt=""></span>
            <span class="muted hint" v-else>{{ t('Select people in the overview to compare their availability.') }}</span>
          </div>
          <div class="row">
            <button type="button" class="btn sm ghost" :disabled="!store.selected.length" @click="clearSelection">{{ t('Clear') }}</button>
            <span class="grow"></span>
            <button type="button" class="btn sm success" :disabled="!store.selected.length" @click="openModal('heatmap', { ids: store.selected.slice() })"><icon name="clock" :size="14"></icon>{{ t('Find a time') }}</button>
          </div>
        </div>
        <mini-calendar></mini-calendar>
      </div>
    </aside>`,
};
