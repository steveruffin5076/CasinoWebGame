export type Route =
  | { name: 'lobby' }
  | { name: 'blackjack' }
  | { name: 'poker' }
  | { name: 'mahjong' };

type Listener = (route: Route) => void;

let current: Route = { name: 'lobby' };
const listeners: Listener[] = [];

export function getRoute(): Route {
  return current;
}

export function navigate(route: Route): void {
  current = route;
  for (const l of listeners) l(route);
}

export function onRoute(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}
