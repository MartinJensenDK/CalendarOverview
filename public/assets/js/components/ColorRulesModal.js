import { api, fieldErrors } from '../api.js';
import { store, toast, confirm } from '../store.js';
import { t } from '../i18n.js';
import { closeModal } from '../actions.js';
import { PALETTE, readableText } from '../util/rules.js';

const { ref, reactive, computed } = Vue;

const TEXT_OPS = ['contains', 'not_contains', 'equals', 'starts_with', 'regex'];
const OP_LABEL = { contains: 'contains', not_contains: 'does not contain', equals: 'equals', starts_with: 'starts with', regex: 'matches regex', is: 'is' };

export default {
  name: 'ColorRulesModal',
  setup() {
    const editing = ref(null); // null | reactive form
    const errors = ref({});
    const saving = ref(false);
    const dragId = ref(null);
    const dropTarget = ref(null);

    function blank() { return { id: null, name: '', field: 'subject', operator: 'contains', value: '', color: PALETTE[0], text_color: null, enabled: true }; }
    function startNew() { editing.value = reactive(blank()); errors.value = {}; }
    function startEdit(r) { editing.value = reactive({ ...r }); errors.value = {}; }
    function onFieldChange() {
      const f = editing.value;
      if (f.field === 'status') { f.operator = 'is'; if (!store.options.statuses.includes(f.value)) f.value = 'oof'; }
      else if (f.field === 'all_day') { f.operator = 'is'; f.value = 'yes'; }
      else if (!TEXT_OPS.includes(f.operator)) { f.operator = 'contains'; f.value = ''; }
    }
    const preview = computed(() => editing.value ? { background: editing.value.color, color: editing.value.text_color || readableText(editing.value.color) } : {});

    async function save() {
      const f = editing.value;
      saving.value = true; errors.value = {};
      const payload = { name: f.name, field: f.field, operator: f.operator, value: f.value, color: f.color, text_color: f.text_color || null, enabled: !!f.enabled };
      try {
        const data = f.id ? await api.put(`/api/color-rules/${f.id}`, payload) : await api.post('/api/color-rules', payload);
        store.rules = data.color_rules;
        editing.value = null;
        toast(t('Rule saved'));
      } catch (e) {
        errors.value = fieldErrors(e);
        if (!Object.keys(errors.value).length) toast(e.message || t('Something went wrong'), 'danger');
      } finally { saving.value = false; }
    }
    async function toggle(r) {
      const data = await api.put(`/api/color-rules/${r.id}`, { ...r, enabled: !r.enabled });
      store.rules = data.color_rules;
    }
    async function remove(r) {
      const ok = await confirm({ title: t('Remove rule “{name}”?', { name: r.name }), text: '', confirmLabel: t('Remove'), danger: true });
      if (!ok) return;
      const data = await api.del(`/api/color-rules/${r.id}`);
      store.rules = data.color_rules;
    }
    async function reset() {
      const ok = await confirm({ title: t('Reset colour rules?'), text: t('Your rules are replaced with the four default rules.'), confirmLabel: t('Reset'), danger: true });
      if (!ok) return;
      const data = await api.post('/api/color-rules/reset');
      store.rules = data.color_rules;
    }
    function describe(r) {
      const field = r.field === 'all_day' ? t('All-day') : t(r.field.charAt(0).toUpperCase() + r.field.slice(1));
      const value = r.field === 'status' ? t(r.value) : (r.field === 'all_day' ? t('is') : `“${r.value}”`);
      return r.field === 'all_day' ? `${field}` : `${field} ${t(OP_LABEL[r.operator])} ${value}`;
    }
    function onDragStart(r) { dragId.value = r.id; }
    function onDragOver(r, e) { if (dragId.value === null) return; e.preventDefault(); dropTarget.value = r.id; }
    async function onDrop(r) {
      if (dragId.value === null || r.id === dragId.value) { dragId.value = null; dropTarget.value = null; return; }
      const ids = store.rules.map((x) => x.id);
      const from = ids.indexOf(dragId.value); const to = ids.indexOf(r.id);
      ids.splice(from, 1); ids.splice(to, 0, dragId.value);
      dragId.value = null; dropTarget.value = null;
      const data = await api.post('/api/color-rules/reorder', { ids });
      store.rules = data.color_rules;
    }
    return { store, t, editing, errors, saving, startNew, startEdit, onFieldChange, preview, save, toggle, remove, reset, describe, closeModal, PALETTE, TEXT_OPS, OP_LABEL, readableText, dragId, dropTarget, onDragStart, onDragOver, onDrop };
  },
  template: `
    <modal :title="editing ? (editing.id ? t('Edit rule') : t('Add rule')) : t('Colour rules')" width="620px" @close="closeModal">
      <template v-if="!editing">
        <p class="muted" style="margin:0 0 12px">{{ t('Rules are checked from the top; the first match colours the appointment.') }}</p>
        <div class="rule-list">
          <div v-for="r in store.rules" :key="r.id" class="rule" :class="{ off: !r.enabled, dragging: dragId === r.id, 'drop-before': dropTarget === r.id && dragId !== r.id }" draggable="true" @dragstart="onDragStart(r)" @dragover="onDragOver(r, $event)" @drop="onDrop(r)" @dragend="dragId = null; dropTarget = null">
            <span class="grip" v-tip="t('Drag to reorder')"><icon name="grip" :size="14"></icon></span>
            <span class="swatch" :style="{ background: r.color }"></span>
            <span class="txt"><b>{{ r.name }}</b><small>{{ describe(r) }}</small></span>
            <label class="switch" v-tip="t('Enabled')"><input type="checkbox" :checked="r.enabled" @change="toggle(r)"><span class="track"></span></label>
            <span class="row" style="gap:2px">
              <button type="button" class="btn ghost icon sm" v-tip="t('Edit rule')" @click="startEdit(r)"><icon name="pencil" :size="14"></icon></button>
              <button type="button" class="btn ghost icon sm" v-tip="t('Remove')" @click="remove(r)"><icon name="trash" :size="14"></icon></button>
            </span>
          </div>
        </div>
      </template>
      <template v-else>
        <label class="field"><span>{{ t('Rule name') }}</span><input class="input" v-model.trim="editing.name" maxlength="60"><div class="field-error" v-if="errors.name">{{ errors.name }}</div></label>
        <div class="grid-2">
          <label class="field"><span>{{ t('When') }}</span>
            <select class="select" v-model="editing.field" @change="onFieldChange">
              <option value="subject">{{ t('Subject') }}</option><option value="location">{{ t('Location') }}</option><option value="status">{{ t('Status') }}</option><option value="all_day">{{ t('All-day') }}</option>
            </select>
          </label>
          <label class="field" v-if="editing.field !== 'all_day'"><span>&nbsp;</span>
            <select class="select" v-model="editing.operator" v-if="editing.field !== 'status'"><option v-for="op in TEXT_OPS" :key="op" :value="op">{{ t(OP_LABEL[op]) }}</option></select>
            <select class="select" v-model="editing.value" v-else><option v-for="s in store.options.statuses" :key="s" :value="s">{{ t(s) }}</option></select>
          </label>
        </div>
        <label class="field" v-if="editing.field === 'subject' || editing.field === 'location'"><span>{{ t('Text') }}</span>
          <input class="input" v-model="editing.value" :placeholder="editing.operator === 'regex' ? 'vacation|ferie' : 'Vacation'">
          <div class="field-error" v-if="errors.value">{{ errors.value }}</div>
        </label>
        <div class="field-label">{{ t('Colour') }}</div>
        <div class="row wrap" style="margin-bottom:14px">
          <div class="swatches"><button type="button" v-for="c in PALETTE" :key="c" :style="{ background: c }" :class="{ active: editing.color === c }" @click="editing.color = c" :aria-label="c"></button></div>
          <label class="row" style="gap:6px;font-size:12px;color:var(--muted)"><input type="color" v-model="editing.color" style="width:28px;height:28px;border:0;padding:0;background:none;cursor:pointer">{{ t('Custom colour') }}</label>
          <span class="preview-blk" :style="preview">{{ editing.name || t('Preview') }}</span>
        </div>
        <label class="switch"><input type="checkbox" v-model="editing.enabled"><span class="track"></span>{{ t('Enabled') }}</label>
      </template>
      <template #foot>
        <template v-if="!editing">
          <button type="button" class="btn ghost" @click="reset">{{ t('Reset to defaults') }}</button>
          <span class="grow"></span>
          <button type="button" class="btn" @click="closeModal">{{ t('Close') }}</button>
          <button type="button" class="btn primary" @click="startNew"><icon name="plus"></icon>{{ t('Add rule') }}</button>
        </template>
        <template v-else>
          <span class="grow"></span>
          <button type="button" class="btn" @click="editing = null">{{ t('Cancel') }}</button>
          <button type="button" class="btn primary" :disabled="saving || !editing.name" @click="save">{{ t('Save') }}</button>
        </template>
      </template>
    </modal>`,
};
