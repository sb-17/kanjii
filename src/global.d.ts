export {};

interface GoatCounter {
  count?: (vars: { path: string; title?: string; event?: boolean }) => void;
  no_onload?: boolean;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }
}