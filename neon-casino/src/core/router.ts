/* =============================================================================
   router.ts — hash router (#/blackjack). Hash routing (not history API) means
   the app works unchanged when hosted on a sub-path such as
   https://<USER>.github.io/<REPO>/. No absolute "/" URLs anywhere.
   ========================================================================== */

export type ViewMount = (root: HTMLElement) => (() => void) | void;

const routes = new Map<string, ViewMount>();
let outlet: HTMLElement | null = null;
let cleanup: (() => void) | void | null = null;
let current = '';

export function register(path: string, mount: ViewMount) {
  routes.set(path, mount);
}

/** Programmatic navigation. */
export function go(path: string) {
  const target = path.replace(/^#\/?/, '');
  location.hash = `#/${target}`;
}

export function currentRoute() {
  return current;
}

function readHash(): string {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  return h || 'lobby';
}

function render() {
  if (!outlet) return;
  const path = readHash();
  if (path === current) return;
  const mount = routes.get(path) ?? routes.get('lobby');
  if (!mount) return;
  try {
    if (typeof cleanup === 'function') cleanup();
  } catch (err) {
    console.error('[router] cleanup failed', err);
  }
  current = path;
  outlet.innerHTML = '';
  const view = document.createElement('div');
  view.className = 'view';
  view.dataset.route = path;
  outlet.appendChild(view);
  cleanup = mount(view);
  // scroll containers back to top on navigation
  outlet.querySelectorAll('.scroll').forEach((n) => ((n as HTMLElement).scrollTop = 0));
  window.dispatchEvent(new CustomEvent('route:change', { detail: { path } }));
}

export function start(out: HTMLElement) {
  outlet = out;
  window.addEventListener('hashchange', render);
  if (!location.hash) location.replace('#/lobby');
  render();
}
