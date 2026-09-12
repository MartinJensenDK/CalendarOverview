// Colour rules are evaluated in the browser; the first enabled matching rule wins.
const regexCache = new Map();

function text(item, field) {
  if (field === 'subject') return item.sub || '';
  if (field === 'location') return item.loc || '';
  return '';
}

export function ruleMatches(rule, item) {
  if (!rule.enabled) return false;
  const value = (rule.value || '').toString();
  if (rule.field === 'status') return item.st === value;
  if (rule.field === 'all_day') return !!item.ad === (value === '1' || value === 'true' || value === '' || value === 'yes');
  const hay = text(item, rule.field).toLowerCase();
  const needle = value.toLowerCase();
  switch (rule.operator) {
    case 'contains': return needle !== '' && hay.includes(needle);
    case 'not_contains': return needle !== '' && !hay.includes(needle);
    case 'equals': return hay === needle;
    case 'starts_with': return needle !== '' && hay.startsWith(needle);
    case 'is': return hay === needle;
    case 'regex': {
      let re = regexCache.get(value);
      if (re === undefined) {
        try { re = new RegExp(value, 'iu'); } catch (e) { re = null; }
        regexCache.set(value, re);
      }
      return !!re && re.test(text(item, rule.field));
    }
    default: return false;
  }
}

/** Returns the rule that colours this item, or null for the default colour. */
export function colorFor(item, rules) {
  for (const rule of rules) {
    if (ruleMatches(rule, item)) return rule;
  }
  return null;
}

export function readableText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1b1f26' : '#ffffff';
}

export const PALETTE = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f', '#8b8d98', '#5b6b8c', '#1b1f26'];
