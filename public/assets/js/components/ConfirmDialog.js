import { store } from '../store.js';
import { t } from '../i18n.js';

export default {
  name: 'ConfirmDialog',
  setup() {
    function answer(v) {
      const c = store.confirm;
      store.confirm = null;
      if (c) c.resolve(v);
    }
    return { store, answer, t };
  },
  template: `
    <modal v-if="store.confirm" :title="store.confirm.title" width="420px" dismissable @close="answer(false)">
      <p style="margin:0 0 4px">{{ store.confirm.text }}</p>
      <template #foot>
        <span class="grow"></span>
        <button type="button" class="btn" @click="answer(false)">{{ t('Cancel') }}</button>
        <button type="button" class="btn" :class="store.confirm.danger ? 'danger' : 'primary'" @click="answer(true)">{{ store.confirm.confirmLabel || t('OK') }}</button>
      </template>
    </modal>`,
};
