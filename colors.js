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
  return _hsl2hex(h, s, l * 0.7);
};

// ---------- Font Constants ----------
const _FONT = Object.freeze({
  heading: "'Instrument Serif', Georgia, 'Times New Roman', serif",
  mono:    "'Geist Mono', 'SF Mono', 'Menlo', monospace",
  body:    "'Geist', system-ui, -apple-system, sans-serif",
});

// ---------- Palette ----------
const _PALETTE = Object.freeze({
  light: Object.freeze({
    canvas:      '#F0EDE4',
    panelSolid:  '#FCFAF4',
    elevated:    '#FDFBF5',
    text:        '#1A1612',
    textSecondary: '#78706A',
    textMuted:   '#A8A098',
    accent:      '#FE3B01',
    accentLight: '#FF6B3D',

    red:    '#C42838',
    blue:   '#1A54B0',
    yellow: '#B88A00',
    none:   '#d1d5db',
    green: '#2B8650',
  }),

  dark: Object.freeze({
    canvas:      '#0C0B09',
    panelSolid:  '#181612',
    elevated:    '#1E1C18',
    text:        '#E8E2D4',
    textSecondary: '#8A8278',
    textMuted:   '#5A544C',
    accent:      '#FE3B01',
    accentLight: '#FF6B3D',

    red:    '#E86070',
    blue:   '#6498E6',
    yellow: '#E0B830',
    none:   '#5a564e',
    green: '#50B878',
  }),
});

// ---------- CSS Custom Property Injection ----------
(function injectPaletteVars() {
  const L = _PALETTE.light, D = _PALETTE.dark;

  const style = document.createElement('style');
  style.id = 'palette-vars';
  style.textContent =
`:root,
[data-theme="light"] {
  --font-heading:     ${_FONT.heading};
  --font-body:        ${_FONT.body};
  --font-mono:        ${_FONT.mono};

  --bg-canvas:        ${L.canvas};
  --bg-panel:         ${_r(L.panelSolid, 0.82)};
  --bg-panel-solid:   ${L.panelSolid};
  --bg-elevated:      ${L.elevated};
  --bg-hover:         ${_r(L.text, 0.04)};

  --text-primary:     ${L.text};
  --text-secondary:   ${L.textSecondary};
  --text-muted:       ${L.textMuted};

  --border:           ${_r(L.text, 0.08)};
  --border-strong:    ${_r(L.text, 0.14)};

  --shadow-sm: 0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02);
  --shadow-md: 0 4px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02);
  --shadow-lg: 0 12px 48px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.02);

  --accent:           ${L.accent};
  --accent-light:     ${L.accentLight};
  --accent-glow:      ${_r(L.accent, 0.20)};
  --accent-subtle:    ${_r(L.accent, 0.07)};

  --party-red:        ${L.red};
  --party-blue:       ${L.blue};
  --party-yellow:     ${L.yellow};
  --party-green:      ${L.green};
  --party-none:       ${L.textMuted};

  --hex-stroke:       ${_r(L.text, 0.06)};
  --hex-hover-stroke: ${_r(L.text, 0.28)};
  --hex-min-opacity:  0.22;

  --bar-track:        ${_r(L.text, 0.07)};

  --tooltip-bg:       ${L.text};
  --tooltip-fg:       ${L.canvas};
}
[data-theme="dark"] {
  --bg-canvas:        ${D.canvas};
  --bg-panel:         ${_r(D.panelSolid, 0.88)};
  --bg-panel-solid:   ${D.panelSolid};
  --bg-elevated:      ${D.elevated};
  --bg-hover:         ${_r(D.text, 0.05)};

  --text-primary:     ${D.text};
  --text-secondary:   ${D.textSecondary};
  --text-muted:       ${D.textMuted};

  --border:           ${_r(D.text, 0.06)};
  --border-strong:    ${_r(D.text, 0.12)};

  --shadow-sm: 0 1px 4px rgba(0,0,0,0.20), 0 0 0 1px rgba(255,255,255,0.03);
  --shadow-md: 0 4px 20px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.03);
  --shadow-lg: 0 12px 48px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.03);

  --accent:           ${D.accent};
  --accent-light:     ${D.accentLight};
  --accent-glow:      ${_r(D.accent, 0.18)};
  --accent-subtle:    ${_r(D.accent, 0.08)};

  --party-red:        ${D.red};
  --party-blue:       ${D.blue};
  --party-yellow:     ${D.yellow};
  --party-green:      ${D.green};
  --party-none:       ${D.textMuted};

  --hex-stroke:       ${_r(D.text, 0.04)};
  --hex-hover-stroke: ${_r(D.text, 0.22)};
  --hex-min-opacity:  0.30;

  --bar-track:        ${_r(D.text, 0.06)};

  --tooltip-bg:       ${D.text};
  --tooltip-fg:       ${D.canvas};

  color-scheme: dark;
}`;
  document.head.appendChild(style);
})();
