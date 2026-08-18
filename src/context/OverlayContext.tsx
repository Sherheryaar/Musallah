import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Animated } from "react-native";

// Lets a sheet dim and disarm the NATIVE navigation header while it is open.
//
// The sheets here are deliberately not <Modal>s — RN's modal host view
// crashed on iOS alongside react-native-screens while the map sheet was
// dragged, which SuggestionSheet and FilterSheet both document. The cost of
// that choice is that their `absoluteFillObject` scrim only covers the
// content view the native stack laid out BELOW the header, and no amount of
// zIndex or elevation can reach outside that subtree. So the header sat
// undimmed above a "modal" and, worse, stayed live:
//
//   - the back arrow popped the screen out from under a half-typed
//     suggestion, discarding it with no warning;
//   - the Qibla button was reachable during first-run onboarding, and that
//     screen asks for location on mount — spending the one prompt iOS ever
//     gives, which is the entire reason onboarding exists.
//
// A sheet calls useOverlayLock for as long as it is on screen. The root
// layout then paints the strip of scrim the sheet cannot reach and stops it
// taking taps. Sheets separately call usePreventRemove so the header's back
// arrow closes the sheet rather than the screen.

export type OverlayLock = {
  /** Status bar + header height, from useHeaderHeight() in the sheet. */
  headerHeight: number;
  /** The sheet's own scrim colour, so the strip is continuous with it. */
  color: string;
  /** The sheet's fade progress, so the strip fades in and out with it. */
  progress?: Animated.Value;
};

type OverlayApi = {
  /** The frontmost lock, or null when no sheet is on screen. */
  lock: OverlayLock | null;
  acquire: (id: string, lock: OverlayLock) => void;
  release: (id: string) => void;
};

const OverlayContext = createContext<OverlayApi | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [locks, setLocks] = useState<Record<string, OverlayLock>>({});

  const acquire = useCallback((id: string, next: OverlayLock) => {
    setLocks((prev) => {
      const current = prev[id];
      // Compared field by field: the caller passes a fresh object every
      // render, and storing it unconditionally would re-render this provider
      // — and therefore the caller — forever.
      if (
        current &&
        current.headerHeight === next.headerHeight &&
        current.color === next.color &&
        current.progress === next.progress
      ) {
        return prev;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  const release = useCallback((id: string) => {
    setLocks((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const value = useMemo<OverlayApi>(() => {
    const held = Object.values(locks);
    return {
      // Onboarding can be up while a sheet opens over it; the tallest strip
      // covers the header for either, and the last one registered owns the
      // colour so the strip matches whatever is frontmost.
      lock: held.length
        ? {
            ...held[held.length - 1],
            headerHeight: Math.max(...held.map((l) => l.headerHeight)),
          }
        : null,
      acquire,
      release,
    };
  }, [locks, acquire, release]);

  return (
    <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
  );
}

function useOverlayContext(): OverlayApi {
  const ctx = useContext(OverlayContext);
  if (!ctx) {
    throw new Error("useOverlay must be used inside OverlayProvider");
  }
  return ctx;
}

/** Read-only view for the root layout's scrim and header actions. */
export function useOverlay(): Pick<OverlayApi, "lock"> {
  return useOverlayContext();
}

/**
 * Hold the header scrim for as long as `active`. Pass the sheet's `mounted`
 * flag rather than `visible`, so the strip fades out with the sheet instead
 * of vanishing a frame before it.
 */
export function useOverlayLock(active: boolean, lock: OverlayLock) {
  const { acquire, release } = useOverlayContext();
  const id = useId();
  const { headerHeight, color, progress } = lock;

  useEffect(() => {
    if (!active) return;
    acquire(id, { headerHeight, color, progress });
    return () => release(id);
  }, [active, headerHeight, color, progress, id, acquire, release]);
}
