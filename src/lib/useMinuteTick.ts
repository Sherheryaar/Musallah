// The current minute, as state.
//
// Every countdown and "current prayer" highlight in the app re-renders on
// this. It ticks on the minute BOUNDARY rather than every N seconds: a fixed
// interval fires at an arbitrary phase, so the displayed minute could change
// up to a whole period late — "1 min" sitting on screen while the prayer
// time actually passed. Sleeping to the next boundary and rescheduling keeps
// the label honest and wakes up once a minute, not twice.
//
// It also resyncs when the app returns to the foreground, because timers are
// frozen in the background and a screen left open overnight would otherwise
// show a countdown that is hours stale.

import { useEffect, useState } from "react";
import { AppState } from "react-native";

export function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      id = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    id = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(new Date());
    });
    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, []);

  return now;
}
