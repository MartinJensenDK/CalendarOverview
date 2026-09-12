// Base modal. Editing modals are NOT dismissable by clicking outside or pressing Esc
// (they shake instead); notification/confirm dialogs pass dismissable=true.
import { t } from '../i18n.js';

const { ref, onMounted, onBeforeUnmount } = Vue;

export default {
  name: 'Modal',
  props: {
    title: { type: String, default: '' },
    width: { type: String, default: '560px' },
    dismissable: { type: Boolean, default: false },
  },
  emits: ['close'],
  setup(props, { emit }) {
    const box = ref(null);
    const shaking = ref(false);

    function attemptClose() {
      if (props.dismissable) { emit('close'); return; }
      shaking.value = true;
      setTimeout(() => { shaking.value = false; }, 320);
    }
    function onBackdrop(e) {
      if (e.target === e.currentTarget) attemptClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); attemptClose(); }
      if (e.key === 'Tab' && box.value) {
        const focusable = box.value.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    onMounted(() => {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        const el = box.value && box.value.querySelector('input, select, textarea, button.primary, button');
        if (el) el.focus();
      });
    });
    onBeforeUnmount(() => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    });
    return { box, shaking, onBackdrop, attemptClose, t };
  },
  template: `
    <div class="backdrop" @mousedown="onBackdrop">
      <div class="modal" :class="{ shake: shaking }" :style="{ '--modal-w': width }" role="dialog" aria-modal="true" :aria-label="title" ref="box">
        <div class="modal-head">
          <h2>{{ title }}</h2>
          <slot name="head"></slot>
          <button type="button" class="close" :aria-label="t('Close')" @click="$emit('close')"><icon name="x" :size="18"></icon></button>
        </div>
        <div class="modal-body"><slot></slot></div>
        <div class="modal-foot" v-if="$slots.foot"><slot name="foot"></slot></div>
      </div>
    </div>`,
};
