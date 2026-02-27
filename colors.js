/* ===================================================================
   colors.js — gerry project-specific tokens
   Extends shared-tokens.js with party colors, color math helpers,
   and project-specific CSS vars.
   =================================================================== */

// Color math helpers (_parseHex, _rgb2hsl, _hsl2hex, _darken) now in shared-tokens.js

// ---------- Project-specific palette keys ----------
_PALETTE.red    = _PALETTE.extended.rose;
_PALETTE.blue   = _PALETTE.extended.blue;
_PALETTE.yellow = _PALETTE.extended.orange;
_PALETTE.none   = _PALETTE.extended.slate;
_PALETTE.green  = _PALETTE.extended.green;

Object.freeze(_PALETTE.extended);
Object.freeze(_PALETTE.light);
Object.freeze(_PALETTE.dark);
Object.freeze(_FONT);
Object.freeze(_PALETTE);

// ---------- Project-specific CSS vars ----------
(function injectProjectVars() {
  const P = _PALETTE, L = P.light, D = P.dark;

  // Extra themed vars (depend on light/dark text/surface values)
  const themed = [
    ['party-none',       'textMuted'],
    ['hex-stroke',       'text',          0.06,  0.04],
    ['hex-hover-stroke', 'text',          0.28,  0.22],
    ['bar-track',        'text',          0.07,  0.06],
    ['tooltip-bg',       'text'],
    ['tooltip-fg',       'canvas'],
  ];

  const genThemed = (T, dark) => themed.map(([name, key, lA, dA]) => {
    const a = dark ? (dA ?? lA) : lA;
    return `  --${name}: ${a != null ? _r(T[key], a) : T[key]};`;
  }).join('\n');

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

  const style = document.createElement('style');
  style.id = 'project-vars';
  style.textContent = `:root {
${genParty(true)}

${genThemed(L, false)}

  --hex-min-opacity:  0.22;
  --label-fill:       #FFFFFFE6;
  --label-stroke:     #00000080;
}
[data-theme="dark"] {
${genParty(false)}

${genThemed(D, true)}

  --hex-min-opacity:  0.30;
}`;
  document.head.appendChild(style);
})();
