/* =============================================================================
   avatars.ts — AI bot avatars, drawn as SVG from code (no images, no emoji
   fonts needed). Mood swaps eyes + mouth so bots read as "alive".
   Gradients/accessories come from src/assets/avatars.svg (sprite, injected once).
   ========================================================================== */

import avatarsSprite from './avatars.svg?raw';

export type Mood = 'normal' | 'think' | 'happy' | 'sad' | 'mad';

/** Injects the avatar defs/accessory sprite once per document. */
let installed = false;
export function installAvatarsSprite() {
  if (installed) return;
  installed = true;
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = avatarsSprite;
  document.body.appendChild(holder);
}

export type AvatarId = 'vic' | 'lin' | 'bella' | 'charlie' | 'rae' | 'nick';

interface Look {
  accessory: 'shades' | 'visor' | 'cap' | 'fedora' | 'antenna' | 'clover' | 'crown' | 'headset';
  hair: string;
  cloth: string;
  skin?: string;
}

const LOOKS: Record<AvatarId, Look> = {
  vic: { accessory: 'shades', hair: '#2b1d12', cloth: '#b91c1c' },
  lin: { accessory: 'clover', hair: '#161a2b', cloth: '#16a34a' },
  bella: { accessory: 'crown', hair: '#7b2d5e', cloth: '#7c3aed' },
  charlie: { accessory: 'antenna', hair: '#94a3b8', cloth: '#0ea5e9', skin: '#cfd8e8' },
  rae: { accessory: 'headset', hair: '#3b2314', cloth: '#e11d48' },
  nick: { accessory: 'cap', hair: '#1f2937', cloth: '#f59e0b' },
};

/** Draws the head + shoulders + accessory inside a 100x100 box. */
export function avatarSvg(id: AvatarId, mood: Mood = 'normal'): string {
  const l = LOOKS[id] ?? LOOKS.vic;
  const skin = l.skin ?? '#f0c9a5';
  const eyes = eyesSvg(mood);
  const mouth = mouthSvg(mood);
  const acc = accessorySvg(l.accessory);
  return `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="50" cy="50" r="50" fill="url(#av-ring)"/>
  <!-- shoulders -->
  <path d="M14 100 q6-22 36-26 q30 4 36 26 z" fill="${l.cloth}"/>
  <path d="M40 78 h20 v22 h-20 z" fill="rgba(255,255,255,.16)"/>
  <!-- head -->
  <ellipse cx="50" cy="54" rx="25" ry="27" fill="${skin}"/>
  <ellipse cx="50" cy="54" rx="25" ry="27" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/>
  <!-- hair -->
  <path d="M25 50 q0-28 25-28 q25 0 25 28 q-8-12-25-12 q-17 0-25 12 z" fill="${l.hair}"/>
  <!-- eyes + mouth (mood) -->
  ${eyes}
  ${mouth}
  <!-- accessory -->
  ${acc}
</svg>`;
}

function eyesSvg(mood: Mood): string {
  const d = '#1c2233';
  switch (mood) {
    case 'happy':
      return `<g stroke="${d}" stroke-width="3.4" fill="none" stroke-linecap="round">
        <path d="M38 54 q5 -6 10 0"/><path d="M52 54 q5 -6 10 0"/></g>`;
    case 'think':
      return `<g fill="${d}">
        <circle cx="41" cy="53" r="3"/><circle cx="59" cy="53" r="3"/></g>
        <g stroke="${d}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8">
        <path d="M35 46 q6 -3 12 0"/><path d="M53 46 q6 -3 12 0"/></g>`;
    case 'sad':
      return `<g fill="${d}">
        <circle cx="41" cy="56" r="3.2"/><circle cx="59" cy="56" r="3.2"/></g>
        <g stroke="${d}" stroke-width="2.4" fill="none" stroke-linecap="round">
        <path d="M34 47 l12 5"/><path d="M66 47 l-12 5"/></g>`;
    case 'mad':
      return `<g fill="${d}">
        <circle cx="41" cy="56" r="3.2"/><circle cx="59" cy="56" r="3.2"/></g>
        <g stroke="${d}" stroke-width="2.8" fill="none" stroke-linecap="round">
        <path d="M34 52 l12 -4"/><path d="M66 52 l-12 -4"/></g>`;
    default:
      return `<g fill="${d}">
        <circle cx="41" cy="54" r="3.2"/><circle cx="59" cy="54" r="3.2"/>
        <circle cx="42.2" cy="52.8" r="1" fill="#fff" opacity=".9"/>
        <circle cx="60.2" cy="52.8" r="1" fill="#fff" opacity=".9"/></g>`;
  }
}

function mouthSvg(mood: Mood): string {
  const d = '#8a3b3b';
  switch (mood) {
    case 'happy':
      return `<path d="M41 64 q9 11 18 0 q-9 4 -18 0 z" fill="${d}"/>`;
    case 'sad':
      return `<path d="M42 70 q8 -8 16 0" stroke="${d}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'think':
      return `<ellipse cx="50" cy="67" rx="4" ry="3.4" fill="${d}" opacity=".85"/>`;
    case 'mad':
      return `<path d="M42 70 q8 -6 16 0" stroke="${d}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
    default:
      return `<path d="M43 66 q7 5 14 0" stroke="${d}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  }
}

function accessorySvg(kind: Look['accessory']): string {
  switch (kind) {
    case 'shades':
      return `<use href="#acc-shades" x="4" y="38" width="92" height="28"/>`;
    case 'visor':
      return `<use href="#acc-visor" x="4" y="34" width="92" height="30"/>`;
    case 'cap':
      return `<use href="#acc-cap" x="6" y="2" width="88" height="34"/>`;
    case 'fedora':
      return `<use href="#acc-fedora" x="4" y="0" width="92" height="42"/>`;
    case 'antenna':
      return `<use href="#acc-antenna" x="34" y="0" width="32" height="34"/>
              <ellipse cx="50" cy="54" rx="25" ry="27" fill="none" stroke="#94a3b8" stroke-width="2" opacity=".5"/>`;
    case 'clover':
      return `<use href="#acc-clover" x="72" y="4" width="26" height="26"/>`;
    case 'crown':
      return `<use href="#acc-crown" x="24" y="-6" width="52" height="30"/>`;
    case 'headset':
      return `<use href="#acc-headset" x="2" y="24" width="96" height="40"/>`;
    default:
      return '';
  }
}
