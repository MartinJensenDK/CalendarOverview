import { api, fieldErrors } from '../api.js';
import { store, toast } from '../store.js';
import { t } from '../i18n.js';
import { closeModal, loadOverview } from '../actions.js';

const { ref, reactive, computed } = Vue;

export default {
  name: 'GroupModal',
  props: { group: { type: Object, default: null }, presetMembers: { type: Array, default: () => [] } },
  setup(props) {
    const g = props.group;
    const form = reactive({
      name: g ? g.name : '',
      type: g ? g.type : 'manual',
      members: g ? [...(g.manual_members || [])] : [...props.presetMembers],
      managers: g ? [...(g.managers || [])] : [],
      entra: g && g.entra_group_id ? { id: g.entra_group_id, name: g.entra_group_name } : null,
    });
    const errors = ref({});
    const saving = ref(false);
    const entraCount = ref(null);

    const excludeMembers = computed(() => form.members.map((m) => m.id));
    const excludeManagers = computed(() => form.managers.map((m) => m.id));

    function addMember(u) { form.members.push(u); }
    function addManager(u) { form.managers.push(u); }
    async function pickEntra(grp) {
      form.entra = grp;
      if (!form.name) form.name = grp.name;
      entraCount.value = null;
      try { const d = await api.get(`/api/entra/groups/${encodeURIComponent(grp.id)}/count`); entraCount.value = d.count; } catch (e) { /* optional */ }
    }

    async function save() {
      errors.value = {};
      saving.value = true;
      const payload = {
        name: form.name,
        type: form.type,
        members: form.type === 'manual' ? form.members.map((m) => m.id) : [],
        managers: form.type === 'manual' ? form.managers.map((m) => m.id) : [],
        entra_group_id: form.type === 'entra' && form.entra ? form.entra.id : null,
        entra_group_name: form.type === 'entra' && form.entra ? form.entra.name : null,
      };
      try {
        const data = g ? await api.put(`/api/groups/${g.id}`, payload) : await api.post('/api/groups', payload);
        store.menu = data.menu;
        if (data.warning) toast(data.warning.consent_required ? t('Some Microsoft Graph permissions have not been granted yet. Ask an administrator to grant admin consent.') : data.warning.message, 'danger', 7000);
        else toast(t('Group saved'));
        closeModal();
        loadOverview();
      } catch (e) {
        errors.value = fieldErrors(e);
        if (!Object.keys(errors.value).length) toast(e.message || t('Something went wrong'), 'danger');
      } finally {
        saving.value = false;
      }
    }
    return { form, errors, saving, entraCount, excludeMembers, excludeManagers, addMember, addManager, pickEntra, save, closeModal, t, isEdit: !!g };
  },
  template: `
    <modal :title="isEdit ? t('Edit group') : t('Create group')" width="600px" @close="closeModal">
      <label class="field"><span>{{ t('Group name') }}</span>
        <input class="input" v-model.trim="form.name" maxlength="80" required>
        <div class="field-error" v-if="errors.name">{{ errors.name }}</div>
      </label>
      <div class="field-label">{{ t('Type') }}</div>
      <div class="seg" style="margin-bottom:14px">
        <button type="button" :class="{ active: form.type === 'manual' }" @click="form.type = 'manual'">{{ t('Manual') }}</button>
        <button type="button" :class="{ active: form.type === 'entra' }" @click="form.type = 'entra'">{{ t('Entra ID group') }}</button>
      </div>

      <template v-if="form.type === 'manual'">
        <div class="field-label">{{ t('People') }}</div>
        <user-picker endpoint="/api/directory/users" :placeholder="t('Add a person')" :exclude="excludeMembers" @pick="addMember"></user-picker>
        <div class="chips" v-if="form.members.length">
          <span class="chip" v-for="(m, i) in form.members" :key="m.id"><img class="avatar" :src="m.photo_url" alt=""><span>{{ m.name }}</span><button type="button" @click="form.members.splice(i, 1)" :aria-label="t('Remove')"><icon name="x" :size="12"></icon></button></span>
        </div>
        <div class="field-label" style="margin-top:16px">{{ t('Everyone reporting to') }}</div>
        <user-picker endpoint="/api/directory/managers" :placeholder="t('Add a manager')" :exclude="excludeManagers" @pick="addManager"></user-picker>
        <div class="field-hint">{{ t('Their direct reports are included automatically, also new hires.') }}</div>
        <div class="chips" v-if="form.managers.length">
          <span class="chip" v-for="(m, i) in form.managers" :key="m.id"><img class="avatar" :src="m.photo_url" alt=""><span>{{ m.name }}</span><button type="button" @click="form.managers.splice(i, 1)" :aria-label="t('Remove')"><icon name="x" :size="12"></icon></button></span>
        </div>
      </template>

      <template v-else>
        <div class="field-label">{{ t('Entra ID group') }}</div>
        <div v-if="form.entra" class="callout row" style="justify-content:space-between">
          <span><strong>{{ form.entra.name }}</strong><span class="muted" v-if="entraCount !== null"> · {{ t('{n} members', { n: entraCount }) }}</span></span>
          <button type="button" class="btn sm" @click="form.entra = null">{{ t('Change') }}</button>
        </div>
        <user-picker v-else endpoint="/api/entra/groups" kind="groups" :placeholder="t('Search Entra ID groups')" @pick="pickEntra"></user-picker>
        <div class="field-error" v-if="errors.entra_group_id">{{ t('Choose a group') }}</div>
        <div class="field-hint">{{ t('Members are synced from Entra ID once a day.') }}</div>
      </template>

      <template #foot>
        <span class="modal-note">{{ t('Unsaved changes stay open until you save or cancel.') }}</span>
        <span class="grow"></span>
        <button type="button" class="btn" @click="closeModal">{{ t('Cancel') }}</button>
        <button type="button" class="btn primary" :disabled="saving || !form.name || (form.type === 'entra' && !form.entra)" @click="save">{{ isEdit ? t('Save changes') : t('Create group') }}</button>
      </template>
    </modal>`,
};
