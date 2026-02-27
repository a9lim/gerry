/* ===================================================================
   colors.js — Single source of truth for all color & font values
   Loads in <head> before styles.css. Injects CSS custom properties.
   =================================================================== */

// ---------- Alpha helper ----------
const _r = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

// ---------- Color Math Helpers ----------
const _parseHex = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255
];
function _rgb2hsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function _hsl2hex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}
const _darken = (hex) => {
  const [h, s, l] = _rgb2hsl(..._parseHex(hex));
  return _hsl2hex(h, s * 0.92, l * 0.75);
}

// ---------- Font Constants ----------
const _FONT = Object.freeze({
  display: "'Instrument Serif', Georgia, 'Times New Roman', serif",
  mono:    "'Geist Mono', 'SF Mono', 'Menlo', monospace",
  body:    "'Geist', system-ui, -apple-system, sans-serif",
});

// ---------- Palette ----------
const _PALETTE = Object.freeze({
  accent:      '#FE3B01',
  accentLight: '#FF6B3D',
  red:         '#c85c74',
  blue:        '#5898ba',
  yellow:      '#d9924c',
  none:        '#847a70',
  green:       '#52a87a',

  light: Object.freeze({
    canvas:        '#F0EDE4',
    panelSolid:    '#FCFAF4',
    elevated:      '#FDFBF5',
    text:          '#1A1612',
    textSecondary: '#78706A',
    textMuted:     '#A8A098',
  }),

  dark: Object.freeze({
    canvas:        '#0C0B09',
    panelSolid:    '#181612',
    elevated:      '#1E1C18',
    text:          '#E8E2D4',
    textSecondary: '#8A8278',
    textMuted:     '#5A544C',
  }),
});

// ---------- CSS Custom Property Injection ----------
(function injectPaletteVars() {
  const P = _PALETTE, L = P.light, D = P.dark;

  // Shared: identical both themes, emitted once in :root
  // [css-var, shared-key] or [css-var, shared-key, alpha]
  const shared = [
    ['accent',            'accent'],
    ['accent-light',      'accentLight'],
    ['accent-glow',       'accent',        0.18],
    ['accent-subtle',     'accent',        0.078],
    ['intro-warm',        'accentLight',   0.08],
    ['intro-warm-hover',  'accentLight',   0.12],
    ['intro-cool',        'blue',          0.04],
  ];

  // Themed: differs per theme
  // [css-var, palette-key] or [css-var, palette-key, alpha] or [css-var, palette-key, lightA, darkA]
  const themed = [
    ['bg-canvas',         'canvas'],
    ['bg-panel',          'panelSolid',    0.55,  0.58],
    ['bg-panel-solid',    'panelSolid'],
    ['bg-elevated',       'elevated'],
    ['bg-hover',          'text',          0.039, 0.051],

    ['text',              'text'],
    ['text-secondary',    'textSecondary'],
    ['text-muted',        'textMuted'],

    ['border',            'text',          0.078, 0.059],
    ['border-strong',     'text',          0.141, 0.122],

    ['party-none',        'textMuted'],

    ['hex-stroke',        'text',          0.06,  0.04],
    ['hex-hover-stroke',  'text',          0.28,  0.22],

    ['bar-track',         'text',          0.07,  0.06],

    ['tooltip-bg',        'text'],
    ['tooltip-fg',        'canvas'],
  ];

  const genShared = () => shared.map(([name, key, a]) =>
    `  --${name}: ${a != null ? _r(P[key], a) : P[key]};`
  ).join('\n');

  // Light: party colors darkened, tips = base
  // Dark:  party colors = base, tips darkened
  const genParty = (darkenParty) => {
    const lines = [];
    for (const c of ['red', 'blue', 'yellow', 'green']) {
      const base = P[c], dark = _darken(base);
      const party = darkenParty ? dark : base;
      const tip   = darkenParty ? base : dark;
      lines.push(`  --party-${c}: ${party};`);
      if (c !== 'green') {
        lines.push(`  --party-${c}-tint: ${_r(party, 0.08)};`);
        lines.push(`  --party-${c}-wash: ${_r(party, 0.18)};`);
      }
      lines.push(`  --tip-${c}: ${tip};`);
    }
    return lines.join('\n');
  };

  const genThemed = (P, dark) => themed.map(([name, key, lA, dA]) => {
    const a = dark ? (dA ?? lA) : lA;
    return `  --${name}: ${a != null ? _r(P[key], a) : P[key]};`;
  }).join('\n');

  const style = document.createElement('style');
  style.id = 'palette-vars';
  style.textContent = `:root {
  --font-display: ${_FONT.display};
  --font-body: ${_FONT.body};
  --font-mono: ${_FONT.mono};

${genShared()}

${genParty(true)}

${genThemed(L, false)}

  --shadow-sm: 0 1px 4px #0000000A, 0 0 0 1px #00000005;
  --shadow-md: 0 4px 20px #0000000F, 0 0 0 1px #00000005;
  --shadow-lg: 0 12px 48px #0000001A, 0 0 0 1px #00000005;
  --hex-min-opacity: 0.22;
  --label-fill: #FFFFFFE6;
  --label-stroke: #00000080;
}
[data-theme="dark"] {
${genParty(false)}

${genThemed(D, true)}

  --shadow-sm: 0 1px 4px #00000033, 0 0 0 1px #FFFFFF08;
  --shadow-md: 0 4px 20px #0000004D, 0 0 0 1px #FFFFFF08;
  --shadow-lg: 0 12px 48px #00000066, 0 0 0 1px #FFFFFF08;
  --hex-min-opacity: 0.30;

  color-scheme: dark;
}`;
  document.head.appendChild(style);
})();
