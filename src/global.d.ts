export {};

interface GoatCounter {
  count?: (vars: { path: string; title?: string; event?: boolean }) => void;
  no_onload?: boolean;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }

  // Build stamp injected by vite.config.ts `define`. Shown on the About page.
  const __APP_COMMIT__: string;
  const __APP_BUILT__: string;
}