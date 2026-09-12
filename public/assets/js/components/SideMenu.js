import { store, confirm } from '../store.js';
import { t } from '../i18n.js';
import { toggleGroup, reorderGroups, deleteGroup, resyncGroup, openModal, toggleSelect, clearSelection } from '../actions.js';

const { ref, computed } = Vue;

export default {
  name: 'SideMenu',
  setup() {
    const dragId = ref(null);
    const dropTarget = ref(null);

    const entries = computed(() => store.menu);
    const selectedUsers = computed(() => {
      const map = new Map();
      store.menu.forEach((g) => g.members.forEach((m) => map.set(m.id, m)));
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
    function isExpanded(entry) {
      const key = String(entry.id);
      if (store.expanded[key] === undefined) return entry.kind === 'builtin' && entry.type === 'my_team';
      return store.expanded[key];
    }
    function toggleExpand(entry) { store.expanded[String(entry.id)] = !isExpanded(entry); }
    function isSelected(id) { return store.selected.includes(id); }

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

    return { store, t, entries, selectedUsers, label, kindLabel, isExpanded, toggleExpand, isSelected, toggleSelect, clearSelection, toggleGroup, remove, resyncGroup, openModal, dragId, dropTarget, onDragStart, onDragOver, onDrop, onDragEnd };
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
          <div class="group-row" :class="{ 'hidden-group': !entry.visible }">
            <button type="button" class="caret" :class="{ open: isExpanded(entry) }" @click="toggleExpand(entry)" :aria-expanded="isExpanded(entry)"><icon name="chevron-right" :size="14"></icon></button>
            <span class="name" @click="toggleExpand(entry)" :title="entry.kind === 'group' ? t('Drag to reorder') : ''">{{ label(entry) }}<small>{{ entry.members.length }}</small></span>
            <span class="kind" v-if="kindLabel(entry)">{{ kindLabel(entry) }}</span>
            <span class="tools" v-if="entry.kind === 'group'">
              <button type="button" class="eye" v-if="entry.type === 'entra'" :title="t('Sync members now')" @click="resyncGroup(entry)"><icon name="refresh" :size="14"></icon></button>
              <button type="button" class="eye" :title="t('Edit group')" @click="openModal('group', { group: entry })"><icon name="pencil" :size="14"></icon></button>
              <button type="button" class="eye" :title="t('Delete group')" @click="remove(entry)"><icon name="trash" :size="14"></icon></button>
            </span>
            <button type="button" class="eye" :class="{ on: entry.visible }" :title="entry.visible ? t('Hide from overview') : t('Show in overview')" @click="toggleGroup(entry)"><icon :name="entry.visible ? 'eye' : 'eye-off'"></icon></button>
          </div>
          <div v-if="isExpanded(entry)">
            <div v-if="!entry.members.length" class="members-empty">{{ entry.type === 'my_team' && !entry.has_manager ? t('You have no manager set in Entra ID, so “My team” only shows you.') : t('This group has no members yet.') }}</div>
            <label v-for="m in entry.members" :key="m.id" class="member" :class="{ me: store.me && m.id === store.me.id }">
              <input type="checkbox" :checked="isSelected(m.id)" @change="toggleSelect(m.id)">
              <img class="avatar" :src="m.photo_url" alt="" loading="lazy">
              <span class="txt"><b>{{ m.name }}</b><small>{{ m.title || m.email }}</small></span>
            </label>
          </div>
        </div>
      </div>
      <div class="sidebar-foot">
        <div class="selection-bar" v-if="store.selected.length">
          <span class="avatars"><img v-for="u in selectedUsers.slice(0, 5)" :key="u.id" class="avatar" :src="u.photo_url" alt=""></span>
          <span class="grow">{{ t('{n} selected', { n: store.selected.length }) }}</span>
          <button type="button" class="btn sm ghost" @click="clearSelection">{{ t('Clear') }}</button>
          <button type="button" class="btn sm primary" @click="openModal('heatmap', { ids: store.selected.slice() })"><icon name="clock" :size="14"></icon>{{ t('Find a time') }}</button>
        </div>
      </div>
    </aside>`,
};
