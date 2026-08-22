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

// Tells the waiting worker to take over. The generated registration reloads the
// page once it does, so nothing here needs to.
export function applyUpdate(): void {
  apply?.();
}
