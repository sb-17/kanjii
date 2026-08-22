// Bridge between the service-worker registration in main.tsx and the toast that
// offers the reload (`components/update-toast`).
//
// Why a module rather than calling registerSW inside the component: registration
// has to stay where it is in boot(). `warmStrokeCache()` runs just after it and
// waits on `navigator.serviceWorker.ready`, so moving registration into a
// component effect would reorder the two. StrictMode double-invoking that effect
// would also register twice. Registering once during boot and pushing the result
// here keeps both problems away from React.

let apply: (() => void) | null = null;
let pending = false;
const listeners = new Set<() => void>();

// Called from boot() when a new service worker is installed and waiting.
export function markUpdateReady(applyFn: () => void): void {
  apply = applyFn;
  pending = true;
  for (const listener of listeners) listener();
}

export function subscribeToUpdate(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function isUpdatePending(): boolean {
  return pending;
}

// How long to wait for the new worker to take control before reloading anyway.
const TAKEOVER_GRACE_MS = 1500;

// Tells the waiting worker to take over; the generated registration reloads once
// it does.
//
// The timeout is the important half. `skipWaiting` is a message to a *waiting*
// worker, and by the time the button is pressed there may not be one — the
// update can have activated already, on a manual reload or in another tab. Then
// no `controlling` event fires, nothing reloads, and the button is simply dead,
// which is exactly what it did the first time this shipped. A reload is correct
// in that case anyway: the new version is what will load.
export function applyUpdate(): void {
  apply?.();
  window.setTimeout(() => window.location.reload(), TAKEOVER_GRACE_MS);
}
