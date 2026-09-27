/* =============================================================================
   dom.smoke.js — headless DOM smoke test for Neon Casino.

   Mounts the production bundle in jsdom (with browser polyfills), navigates
   to every route, clicks through the intro modals and deals a blackjack hand.
   Fails on any runtime error / console.error from the app.

   Run (dev-only, jsdom is not a runtime dependency of the game):
     npm run build && cp dist/assets/index-*.js /tmp/app.bundle.js
     cd /tmp && npm i jsdom && cp $OLDPWD/tests/dom.smoke.js . && node dom.smoke.js
   ============================================================================ */

/* DOM smoke test: mounts the built app in jsdom with polyfills, navigates to
   every route, and simulates basic interactions to catch runtime errors. */
const { JSDOM, VirtualConsole } = require('/tmp/node_modules/jsdom');
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.detail && e.detail.stack || e.stack || e.message)));
virtualConsole.on('error', (...a) => errors.push('vc.error: ' + a.join(' ')));
virtualConsole.on('log', () => {});
const fs = require('fs');

const errors = [];
const dom = new JSDOM(
  `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="boot"><div class="bar"><i></i></div></div><div id="app"></div></body></html>`,
  {
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
    virtualConsole,
  },
);

const { window } = dom;
const { document } = window;

/* ------------------------------- polyfills ------------------------------- */
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false,
  media: q,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));
window.ResizeObserver =
  window.ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
window.HTMLCanvasElement.prototype.getContext = function () {
  const noop = () => {};
  return {
    canvas: this,
    clearRect: noop,
    fillRect: noop,
    arc: noop,
    beginPath: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    putImageData: noop,
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform: noop,
  };
};
window.HTMLElement.prototype.animate =
  window.HTMLElement.prototype.animate ||
  function () {
    return { onfinish: null, oncancel: null, finished: Promise.resolve(), cancel: noopAnim, pause: noopAnim, play: noopAnim };
  };
const noopAnim = () => {};
window.AudioContext = class {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
    this.sampleRate = 44100;
  }
  createGain() {
    return { gain: { value: 0, setValueAtTime: noopF, exponentialRampToValueAtTime: noopF }, connect: noopF };
  }
  createOscillator() {
    return { type: '', frequency: { setValueAtTime: noopF, exponentialRampToValueAtTime: noopF }, connect: noopF, start: noopF, stop: noopF };
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(64) };
  }
  createBufferSource() {
    return { buffer: null, connect: noopF, start: noopF, stop: noopF };
  }
  createBiquadFilter() {
    return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect: noopF };
  }
  resume() {
    return Promise.resolve();
  }
};
const noopF = () => {};
window.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => (store[k] = String(v)),
    removeItem: (k) => delete store[k],
    clear: () => (store = {}),
  };
})();
window.navigator.vibrate = () => true;

window.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message));
const origError = console.error;
console.error = (...args) => {
  errors.push('console.error: ' + args.map((a) => (a && a.message) || String(a)).join(' '));
};

/* ------------------------------- run bundle ------------------------------- */
const bundle = fs.readFileSync('/tmp/app.bundle.js', 'utf8');

// inject + execute the bundle inside the jsdom window (all globals resolve)
const script = document.createElement('script');
script.textContent = bundle + '\n//# sourceURL=app.bundle.js';
try {
  document.body.appendChild(script);
} catch (e) {
  errors.push('bundle exec: ' + (e.stack || e.message));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(300);
  // preload is time-sliced over rAF; jsdom pretendToBeVisual provides rAF
  await sleep(2500);

  const state = () => ({
    route: window.location.hash,
    views: [...document.querySelectorAll('.view')].map((v) => v.dataset.route),
    hasTopbar: !!document.querySelector('.topbar'),
    cards: document.querySelectorAll('.gcard').length,
  });
  const log = (label) => origError(JSON.stringify({ label, ...state() }));
  log('after-boot');

  const assert = (cond, name) => {
    if (cond) origError('  ✓ ' + name);
    else {
      origError('  ✗ FAIL: ' + name);
      errors.push('assert: ' + name);
    }
  };

  assert(document.querySelector('.view[data-route="lobby"]') !== null, 'lobby mounted');
  assert(document.querySelectorAll('.gcard').length === 4, '4 game cards');
  assert(document.querySelector('.chip-pill .amt') !== null, 'balance pill');
  assert(document.querySelector('.btn-bonus') !== null, 'daily bonus button');

  // navigate to each game
  for (const route of ['blackjack', 'uno', 'poker', 'mahjong']) {
    window.location.hash = '#/' + route;
    await sleep(900);
    log('route-' + route);
    assert(document.querySelector(`.view[data-route="${route}"]`) !== null, `${route} view mounted`);
    assert(document.querySelector('.topbar') !== null, `${route} topbar`);
    // blackjack goes straight to the betting rack (no intro modal by design)
    if (route !== 'blackjack') assert(document.querySelector('.modal') !== null, `${route} intro modal`);
    else assert(document.querySelector('.chip-rack') !== null, 'blackjack betting rack');
    assert(document.querySelector('.stage') !== null, `${route} stage`);
    // close intro modal by clicking its primary action
    const btn = document.querySelector('.modal .btn-primary');
    if (btn) {
      btn.dispatchEvent(new window.Event('click', { bubbles: true }));
      await sleep(1200);
      log(route + '-started');
    }
    // back to lobby
    window.location.hash = '#/lobby';
    await sleep(400);
  }

  // lobby interaction: difficulty seg + play button navigation
  window.location.hash = '#/lobby';
  await sleep(500);
  const seg = document.querySelector('.gcard .seg button[data-d="hard"]');
  seg?.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(200);
  assert(JSON.parse(window.localStorage.getItem('neon-casino:v1')).settings.difficulty.blackjack === 'hard', 'difficulty saved');

  // blackjack mini-flow: place bet via chip button then deal
  window.location.hash = '#/blackjack';
  await sleep(800);
  document.querySelector('.modal .btn-primary')?.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(400);
  const chipBtn = document.querySelector('.chip-rack .chip-btn');
  chipBtn?.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  const deal = document.querySelector('.btn-primary');
  origError('deal button: ' + (deal && deal.textContent));
  deal?.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(4000); // deal animation + bot turns run
  const cards = document.querySelectorAll('.card').length;
  assert(cards > 0, `blackjack cards dealt (${cards})`);
  log('blackjack-after-deal');

  await sleep(3000);

  origError('\n=== RESULT ===');
  if (errors.length) {
    origError('ERRORS (' + errors.length + '):');
    errors.slice(0, 25).forEach((e) => origError(' -', e));
    process.exit(1);
  } else {
    origError('SMOKE TEST PASSED ✅ (no runtime errors)');
    process.exit(0);
  }
})().catch((e) => {
  origError('harness crash:', e);
  process.exit(1);
});
