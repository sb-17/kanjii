import { useEffect, useState } from "react";

// A "now" timestamp that is stable within a render and refreshed on an interval.
//
// Reading Date.now() while rendering makes a component non-idempotent: two
// renders of the same state can disagree about what's due, so React is free to
// show either. This makes time an explicit input instead — and refreshing it
// means a long session still notices words coming due, which a value captured
// once at mount would not.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
