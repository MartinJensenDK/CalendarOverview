import { store } from '../store.js';

export default {
  name: 'Toasts',
  setup() {
    const dismiss = (id) => { store.toasts = store.toasts.filter((x) => x.id !== id); };
    return { store, dismiss };
  },
  template: `
    <div class="toasts" aria-live="polite">
      <div v-for="x in store.toasts" :key="x.id" class="toast" :class="x.kind">
        <span>{{ x.text }}</span>
        <button type="button" @click="dismiss(x.id)" aria-label="close"><icon name="x" :size="14"></icon></button>
      </div>
    </div>`,
};
