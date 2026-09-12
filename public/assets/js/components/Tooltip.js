import { store } from '../store.js';
import { t } from '../i18n.js';
import { timeLabel, dayLabel, ymd } from '../util/date.js';

const { computed } = Vue;

export default {
  name: 'Tooltip',
  setup() {
    const style = computed(() => {
      const tip = store.tooltip;
      if (!tip) return {};
      const x = Math.min(tip.x + 14, window.innerWidth - 300);
      const y = tip.y + 16 > window.innerHeight - 120 ? tip.y - 90 : tip.y + 16;
      return { left: `${x}px`, top: `${y}px` };
    });
    const time = computed(() => {
      const it = store.tooltip && store.tooltip.item;
      if (!it) return '';
      const s = new Date(it.s); const e = new Date(it.e);
      if (it.ad) {
        const last = new Date(e.getTime() - 1);
        const a = dayLabel(ymd(s)); const b = dayLabel(ymd(last));
        return a === b ? `${a} · ${t('All-day')}` : `${a} – ${b} · ${t('All-day')}`;
      }
      return `${dayLabel(ymd(s))} · ${timeLabel(s)} – ${timeLabel(e)}`;
    });
    return { store, style, time, t };
  },
  template: `
    <div v-if="store.tooltip" class="tooltip" :style="style">
      <span class="time">{{ time }}</span>
      <span class="sub">{{ store.tooltip.item.sub || (store.tooltip.item.pr ? t('Private') : t('Busy')) }}</span>
      <span class="loc" v-if="store.tooltip.item.loc">{{ store.tooltip.item.loc }}</span>
      <span class="st">{{ store.tooltip.user }} · {{ t(store.tooltip.item.st) }}</span>
    </div>`,
};
