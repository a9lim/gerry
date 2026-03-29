/* ═══════════════════════════════════════════════════
   colors.js -- Gerry project-specific design tokens.
   Maps party names to shared extended palette colors
   and injects themed CSS custom properties via IIFE.
   ═══════════════════════════════════════════════════ */

// ─── Party Color Aliases ───
_PALETTE.orange = _PALETTE.extended.orange;
_PALETTE.lime   = _PALETTE.extended.lime;
_PALETTE.purple = _PALETTE.extended.purple;
_PALETTE.none   = _PALETTE.extended.slate;
_PALETTE.blue   = _PALETTE.extended.blue;

_freezeTokens();

// ─── CSS Variable Injection ───
(function injectProjectVars() {
  const P = _PALETTE, L = P.light, D = P.dark;

  // Themed vars: [css-name, palette-key, light-alpha, dark-alpha].
  // Alpha omitted = use the raw color value.
  const themed = [
    ['party-none',       'textMuted'],
    ['hex-stroke',       'text',          0.06,  0.04],
    ['hex-hover-stroke', 'text',          0.28,  0.22],
    ['bar-track',        'text',          0.07,  0.06],
  ];

  const genThemed = (T, dark) => themed.map(([name, key, lA, dA]) => {
    const a = dark ? (dA ?? lA) : lA;
    return `  --${name}: ${a != null ? _r(T[key], a) : T[key]};`;
  }).join('\n');

  // Light mode: darken party colors for better contrast on light canvas.
  // Dark mode: use base palette colors; darken the tooltip variants instead.
  const genParty = (darkenParty) => {
    const lines = [];
    for (const c of ['orange', 'lime', 'purple', 'blue']) {
      const base = P[c], dark = _darken(base);
      const party = darkenParty ? dark : base;
      const tip   = darkenParty ? base : dark;
      lines.push(`  --party-${c}: ${party};`);
      if (c !== 'blue') {
        lines.push(`  --party-${c}-tint: ${_r(party, 0.08)};`);
        lines.push(`  --party-${c}-wash: ${_r(party, 0.18)};`);
      }
      lines.push(`  --tip-${c}: ${tip};`);
    }
    return lines.join('\n');
  };

  _injectProjectVars(
    genParty(true) + '\n' + genThemed(L, false) + `\n  --hex-min-opacity: 0.22;
  --label-fill:       ${_r(D.text, 0.902)};
  --label-stroke:     ${_r(L.text, 0.502)};`,
    genParty(false) + '\n' + genThemed(D, true) + '\n  --hex-min-opacity: 0.30;'
  );
})();
