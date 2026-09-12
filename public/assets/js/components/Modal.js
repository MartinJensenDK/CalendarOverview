// Base modal. Editing modals are NOT dismissable by clicking outside or pressing Esc
// (they shake instead); notification/confirm dialogs pass dismissable=true.
import { t } from '../i18n.js';

const { ref, onMounted, onBeforeUnmount } = Vue;

export default {
  name: 'Modal',
  props: {
    title: { type: String, default: '' },
    width: { type: String, default: '560px' },
    // Optional fixed height (e.g. for tabbed content) so the window does not resize between views.
    height: { type: String, default: '' },
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
      // Only the topmost modal reacts (a lookup can sit on top of the vacation calendar).
      const all = document.querySelectorAll('.modal');
      if (box.value && all.length && all[all.length - 1] !== box.value) return;
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
        if (!box.value || box.value.contains(document.activeElement)) return; // the component already placed focus
        const body = box.value.querySelector('.modal-body');
        const el = (body && body.querySelector('input:not([type="hidden"]), select, textarea, button')) || box.value.querySelector('.modal-foot button.primary, .modal-foot button, .close');
        if (el) el.focus();
      });
    });
    onBeforeUnmount(() => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = document.querySelectorAll('.backdrop').length > 1 ? 'hidden' : '';
    });
    return { box, shaking, onBackdrop, attemptClose, t };
  },
  template: `
    <div class="backdrop" @mousedown="onBackdrop">
      <div class="modal" :class="{ shake: shaking }" :style="{ '--modal-w': width, '--modal-h': height || 'auto' }" role="dialog" aria-modal="true" :aria-label="title" ref="box">
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
