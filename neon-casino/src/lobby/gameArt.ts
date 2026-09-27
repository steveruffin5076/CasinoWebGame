/* =============================================================================
   gameArt.ts — unique CSS/SVG gradient header art for the four lobby cards.
   100% code-drawn (no images), each game reads differently at a glance:
     blackjack → emerald felt + cards + betting circle
     poker     → midnight table + pot glow + dealer puck
     mahjong   → jade + bamboo + tile wall
     uno       → purple arena + tilted card stack + colour glow
   ========================================================================== */

import type { GameId } from '../core/storage';

export function gameArt(id: GameId): string {
  switch (id) {
    case 'blackjack':
      return blackArt();
    case 'poker':
      return pokerArt();
    case 'mahjong':
      return mahjongArt();
    case 'uno':
      return unoArt();
  }
}

/* shared canvas: 400x140 viewBox, stretched by CSS */
const wrap = (bg: string, inner: string) => `
<svg viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${bg}
    <linearGradient id="ga-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5e6b8"/><stop offset=".5" stop-color="#d4af37"/><stop offset="1" stop-color="#8c6d1f"/>
    </linearGradient>
  </defs>
  <rect width="400" height="140" fill="url(#ga-bg)"/>
  ${inner}
</svg>`;

function blackArt(): string {
  return wrap(
    `<radialGradient id="ga-bg" cx=".5" cy=".9" r="1.1">
       <stop offset="0" stop-color="#0e7a4c"/><stop offset=".55" stop-color="#0b5d3b"/><stop offset="1" stop-color="#04281a"/>
     </radialGradient>`,
    `
    <!-- wood rim -->
    <path d="M0 140 Q200 78 400 140 L400 141 L0 141 Z" fill="#3b2314"/>
    <path d="M0 140 Q200 80 400 140" stroke="#6b4426" stroke-width="3" fill="none" opacity=".8"/>
    <!-- betting circle -->
    <circle cx="200" cy="86" r="30" fill="none" stroke="url(#ga-gold)" stroke-width="2.4" opacity=".9"/>
    <!-- chips -->
    <g transform="translate(186 72)">
      <ellipse cx="14" cy="26" rx="15" ry="5" fill="#000" opacity=".35"/>
      <circle cx="14" cy="22" r="14" fill="#d13b3b" stroke="#fdfdfd" stroke-width="4"/>
      <circle cx="14" cy="14" r="14" fill="#d13b3b" stroke="#fdfdfd" stroke-width="4"/>
      <circle cx="14" cy="6" r="14" fill="#2563eb" stroke="#fdfdfd" stroke-width="4"/>
    </g>
    <!-- ace + ten -->
    <g transform="translate(96 22) rotate(-8)">
      <rect width="46" height="64" rx="6" fill="#fff" stroke="rgba(0,0,0,.25)"/>
      <text x="6" y="16" font-family="Georgia,serif" font-size="15" font-weight="700" fill="#1c2029">A</text>
      <path d="M23 26 l7 10 -7 10 -7 -10 z" fill="#1c2029"/>
    </g>
    <g transform="translate(258 30) rotate(7)">
      <rect width="46" height="64" rx="6" fill="#fff" stroke="rgba(0,0,0,.25)"/>
      <text x="5" y="15" font-family="Georgia,serif" font-size="13" font-weight="700" fill="#d3202a">10</text>
      <circle cx="23" cy="40" r="7" fill="#d3202a"/>
      <circle cx="15" cy="34" r="3.4" fill="#d3202a"/>
      <circle cx="31" cy="46" r="3.4" fill="#d3202a"/>
    </g>
    <!-- curved house text -->
    <path id="ga-bj" d="M60 34 Q200 6 340 34" fill="none"/>
    <text font-family="Georgia,serif" font-size="12.5" letter-spacing="2.2" fill="url(#ga-gold)">
      <textPath href="#ga-bj" startOffset="50%" text-anchor="middle">BLACKJACK PAYS 3 TO 2</textPath>
    </text>`,
  );
}

function pokerArt(): string {
  return wrap(
    `<linearGradient id="ga-bg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#312e81"/><stop offset=".6" stop-color="#1e1b4b"/><stop offset="1" stop-color="#0d0b26"/>
     </linearGradient>
     <radialGradient id="ga-pot" cx=".5" cy=".55" r=".5">
       <stop offset="0" stop-color="#f5e6b8" stop-opacity=".5"/><stop offset="1" stop-color="#f5e6b8" stop-opacity="0"/>
     </radialGradient>`,
    `
    <ellipse cx="200" cy="76" rx="150" ry="46" fill="url(#ga-pot)"/>
    <!-- board cards -->
    <g transform="translate(118 46)">
      ${[0, 52, 104, 156]
        .map(
          (x, i) => `<g transform="translate(${x} 0) rotate(${(i - 1.5) * 2})">
            <rect width="42" height="60" rx="5" fill="#fff" stroke="rgba(0,0,0,.3)"/>
            ${
              [
                '<text x="4" y="14" font-size="12" font-weight="700" font-family="Georgia,serif" fill="#d3202a">A</text><path d="M21 22 l6 8 -6 8 -6 -8z" fill="#d3202a"/>',
                '<text x="4" y="14" font-size="12" font-weight="700" font-family="Georgia,serif" fill="#1c2029">K</text><path d="M15 46 q6 8 12 0 q-6 4 -12 0z" fill="#1c2029"/>',
                '<text x="4" y="14" font-size="12" font-weight="700" font-family="Georgia,serif" fill="#d3202a">Q</text><circle cx="21" cy="30" r="6.4" fill="#d3202a"/>',
                '<rect x="6" y="6" width="30" height="48" rx="4" fill="#131a2e" stroke="#d4af37" stroke-opacity=".8"/><path d="M21 22 l7 8 -7 8 -7 -8z" fill="none" stroke="#d4af37" stroke-opacity=".9"/>',
              ][i]
            }
          </g>`,
        )
        .join('')}
    </g>
    <!-- dealer puck -->
    <g transform="translate(322 96)">
      <circle r="15" fill="url(#ga-gold)"/>
      <circle r="10.5" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.4"/>
      <text y="4.5" text-anchor="middle" font-family="Georgia,serif" font-size="11" font-weight="800" fill="#3b2314">D</text>
    </g>
    <!-- chips arc -->
    <g fill="none" stroke="url(#ga-gold)" stroke-width="2" opacity=".5">
      <path d="M40 110 Q200 66 360 110"/>
    </g>`,
  );
}

function mahjongArt(): string {
  return wrap(
    `<linearGradient id="ga-bg" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="#1c6b3c"/><stop offset=".55" stop-color="#14532d"/><stop offset="1" stop-color="#0a2b17"/>
     </linearGradient>`,
    `
    <!-- bamboo mat texture -->
    <g stroke="#0a2b17" stroke-width="1" opacity=".35">
      ${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 34 + 8} 0 V140"/>`).join('')}
      ${Array.from({ length: 6 }, (_, i) => `<path d="M0 ${i * 26 + 12} H400"/>`).join('')}
    </g>
    <!-- tile wall -->
    <g transform="translate(56 34)">
      ${Array.from(
        { length: 8 },
        (_, i) =>
          `<g transform="translate(${i * 38} ${(i % 2) * 6})">
            <rect width="30" height="44" rx="4" fill="#e9e2cd"/>
            <rect x="1.5" y="1.5" width="27" height="41" rx="3" fill="#faf7ef"/>
            ${
              [
                '<circle cx="15" cy="22" r="8" fill="#1d7fd0"/><circle cx="15" cy="22" r="4" fill="#d63b3b"/>',
                '<rect x="11" y="10" width="8" height="24" rx="4" fill="#41c06a"/>',
                '<text x="15" y="28" text-anchor="middle" font-family="Georgia,serif" font-size="16" font-weight="700" fill="#1f4f8f">E</text>',
                '<g stroke="#c62828" stroke-width="4" fill="none"><rect x="9" y="12" width="12" height="16"/><path d="M15 8 V36"/></g>',
                '<circle cx="15" cy="16" r="5" fill="#1d7fd0"/><circle cx="10" cy="27" r="5" fill="#1d7fd0"/><circle cx="20" cy="27" r="5" fill="#1d7fd0"/>',
                '<rect x="9" y="10" width="12" height="24" rx="2" fill="none" stroke="#1f4f8f" stroke-width="3"/>',
                '<rect x="11" y="10" width="8" height="24" rx="4" fill="#41c06a"/><circle cx="15" cy="8" r="4" fill="#b91c1c"/>',
                '<text x="15" y="28" text-anchor="middle" font-family="Georgia,serif" font-size="16" font-weight="700" fill="#1f4f8f">N</text>',
              ][i]
            }
          </g>`,
      ).join('')}
    </g>
    <!-- wind disc -->
    <g transform="translate(200 108)">
      <circle r="17" fill="#0a2b17" stroke="url(#ga-gold)" stroke-width="2"/>
      <circle r="11" fill="none" stroke="#d4af37" stroke-opacity=".6"/>
      <path d="M0 -13 L13 0 L0 13 L-13 0 Z" fill="url(#ga-gold)" opacity=".85"/>
    </g>`,
  );
}

function unoArt(): string {
  return wrap(
    `<linearGradient id="ga-bg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#4c1d95"/><stop offset=".6" stop-color="#2e1065"/><stop offset="1" stop-color="#170a38"/>
     </linearGradient>`,
    `
    <!-- colour glow strips -->
    <ellipse cx="90" cy="70" rx="80" ry="60" fill="#ef4444" opacity=".16"/>
    <ellipse cx="200" cy="70" rx="80" ry="60" fill="#eab308" opacity=".14"/>
    <ellipse cx="310" cy="70" rx="80" ry="60" fill="#3b82f6" opacity=".16"/>
    <!-- tilted discard stack -->
    <g transform="translate(140 30) rotate(-14)">
      <rect width="60" height="90" rx="8" fill="#1d4ed8" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
      <ellipse cx="30" cy="45" rx="26" ry="17" fill="#fff" transform="rotate(-21 30 45)"/>
      <text x="30" y="58" text-anchor="middle" font-family="Georgia,serif" font-size="34" font-weight="800" fill="#1d4ed8">7</text>
    </g>
    <g transform="translate(210 26) rotate(8)">
      <rect width="60" height="90" rx="8" fill="#15803d" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
      <ellipse cx="30" cy="45" rx="26" ry="17" fill="#fff" transform="rotate(-21 30 45)"/>
      <g stroke="#15803d" stroke-width="6" fill="none" stroke-linecap="round">
        <path d="M20 32 h20 M20 45 h20 M20 58 h20"/>
      </g>
    </g>
    <g transform="translate(280 34) rotate(20)">
      <rect width="60" height="90" rx="8" fill="#4c1d95" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
      <ellipse cx="30" cy="45" rx="26" ry="17" fill="#fff" transform="rotate(-21 30 45)"/>
      <path d="M30 24 l7 14 -7 14 -7 -14z M30 24 l7 14 -7 14 -7 -14z" fill="#e879f9"/>
      <text x="30" y="86" text-anchor="middle" font-family="Georgia,serif" font-size="15" font-weight="800" fill="#4c1d95">W</text>
    </g>
    <!-- UNO ball -->
    <g transform="translate(52 106)">
      <circle r="16" fill="#d4af37"/>
      <circle r="12.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-opacity=".85"/>
      <text y="5" text-anchor="middle" font-family="Georgia,serif" font-size="12" font-weight="800" fill="#3b2314">UNO</text>
    </g>`,
  );
}
