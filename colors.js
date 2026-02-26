/* ===================================================================
   colors.js — Single source of truth for all color & font values
   Loads in <head> before styles.css. Injects CSS custom properties.
   =================================================================== */

// ---------- Alpha helper ----------
const _r = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

// ---------- Font Constants ----------
const _FONT = Object.freeze({
  heading: "'Instrument Serif', Georgia, serif",
  body:    "'Geist', system-ui, -apple-system, sans-serif",
  mono:    "'Geist Mono', 'SF Mono', monospace",
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
    accent:      '#D97757',
    accentLight: '#E89B80',

    red: Object.freeze({ base: '#C42838', dark: '#8A1C28', light: '#E84858', muted: '#e1a6b0', district: '#C42838' }),
    blue: Object.freeze({ base: '#1A54B0', dark: '#0E3470', light: '#4D88E8', muted: '#a5bccc', district: '#1A54B0' }),
    yellow: Object.freeze({ base: '#B88A00', dark: '#7A5C00', light: '#E0B830', muted: '#ebe4ab', district: '#B88A00' }),
    none: Object.freeze({ base: '#d1d5db', dark: '#374151', light: '#e5e7eb', muted: '#f3f4f6', district: '#9ca3af' }),
    green: '#2B8650',
  }),

  dark: Object.freeze({
    canvas:      '#0C0B09',
    panelSolid:  '#181612',
    elevated:    '#1E1C18',
    text:        '#E8E2D4',
    textSecondary: '#8A8278',
    textMuted:   '#5A544C',
    accent:      '#E89B80',
    accentLight: '#F0B8A0',

    red: Object.freeze({ base: '#E86070', dark: '#C44050', light: '#F08888', muted: '#4a1820', district: '#E86070' }),
    blue: Object.freeze({ base: '#6498E6', dark: '#3868B8', light: '#88B0F0', muted: '#182848', district: '#6498E6' }),
    yellow: Object.freeze({ base: '#E0B830', dark: '#B89020', light: '#F0D060', muted: '#3a3010', district: '#E0B830' }),
    none: Object.freeze({ base: '#5a564e', dark: '#3a3830', light: '#706860', muted: '#2a2820', district: '#5a564e' }),
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

  --party-red:        ${L.red.base};
  --party-red-dark:   ${L.red.dark};
  --party-blue:       ${L.blue.base};
  --party-blue-dark:  ${L.blue.dark};
  --party-yellow:     ${L.yellow.base};
  --party-yellow-dark:${L.yellow.dark};
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

  --party-red:        ${D.red.base};
  --party-red-dark:   ${D.red.dark};
  --party-blue:       ${D.blue.base};
  --party-blue-dark:  ${D.blue.dark};
  --party-yellow:     ${D.yellow.base};
  --party-yellow-dark:${D.yellow.dark};
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
