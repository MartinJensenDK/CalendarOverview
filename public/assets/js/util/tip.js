// One hover box for the whole app: every element with v-tip shows the same card as the
// free/busy lists in "Find a time" (surface, hairline border, soft shadow) instead of the
// browser's native title tooltip, so all info boxes look alike.
//
//   v-tip="'Previous'"                                  one line
//   v-tip="{ title: 'Sync', lines: ['…'], status: '…' }" title, extra lines, a status line with the green dot
//   v-tip="() => ({ … })"                               evaluated each time the box opens (live data)

let box = null;
let current = null;

function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'tip';
  box.setAttribute('role', 'tooltip');
  box.hidden = true;
  document.body.appendChild(box);
  return box;
}

function normalise(value) {
  const v = typeof value === 'function' ? value() : value;
  if (!v) return null;
  if (typeof v === 'string') return v.trim() ? { title: v } : null;
  if (Array.isArray(v)) return v.length ? { title: v[0], lines: v.slice(1) } : null;
  return v.title || (v.lines && v.lines.length) || v.status ? v : null;
}

function line(cls, text) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

function render(content) {
  const el = ensureBox();
  el.replaceChildren();
  if (content.title) el.appendChild(line('tip-title', content.title));
  (content.lines || []).forEach((l) => el.appendChild(line('tip-line', l)));
  if (content.status) {
    const st = line('sync-state', '');
    st.appendChild(line('dot', ''));
    st.appendChild(document.createTextNode(content.status));
    el.appendChild(st);
  }
}

function place(target) {
  const el = ensureBox();
  const r = target.getBoundingClientRect();
  const w = el.offsetWidth || 0;
  const h = el.offsetHeight || 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(r.left, vw - w - 8));
  const below = r.bottom + 6 + h <= vh || r.top - 6 - h < 8;
  el.style.left = `${left}px`;
  el.style.top = below ? `${r.bottom + 6}px` : `${r.top - 6 - h}px`;
}

function show(target) {
  const content = normalise(target.__tip);
  if (!content) return hide();
  current = target;
  render(content);
  const el = ensureBox();
  el.hidden = false;
  place(target);
}

function hide() {
  current = null;
  if (box) box.hidden = true;
}

function refresh() { if (current) show(current); }

// Icon-only elements get an aria-label from a plain-text tip; an author-set aria-label always wins.
function label(el, value) {
  const own = el.__tipLabelled === true;
  if (!own && el.hasAttribute('aria-label')) return;
  const v = typeof value === 'function' ? null : value;
  const text = typeof v === 'string' ? v : v && v.title;
  if (!text || el.textContent.trim()) {
    if (own) { el.removeAttribute('aria-label'); el.__tipLabelled = false; }
    return;
  }
  el.setAttribute('aria-label', text);
  el.__tipLabelled = true;
}

let globalBound = false;
function bindGlobal() {
  if (globalBound) return;
  globalBound = true;
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

export const tip = {
  mounted(el, binding) {
    bindGlobal();
    el.__tip = binding.value;
    el.removeAttribute('title');
    label(el, binding.value);
    el.__tipShow = () => show(el);
    el.__tipHide = () => { if (current === el) hide(); };
    el.addEventListener('mouseenter', el.__tipShow);
    el.addEventListener('mouseleave', el.__tipHide);
    el.addEventListener('focus', el.__tipShow);
    el.addEventListener('blur', el.__tipHide);
    el.addEventListener('mousedown', el.__tipHide);
  },
  updated(el, binding) {
    el.__tip = binding.value;
    el.removeAttribute('title');
    label(el, binding.value);
    if (current === el) refresh();
  },
  unmounted(el) {
    el.removeEventListener('mouseenter', el.__tipShow);
    el.removeEventListener('mouseleave', el.__tipHide);
    el.removeEventListener('focus', el.__tipShow);
    el.removeEventListener('blur', el.__tipHide);
    el.removeEventListener('mousedown', el.__tipHide);
    if (current === el) hide();
  },
};

export { hide as hideTip, refresh as refreshTip };
