import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Places the user has saved.
 *
 * Stores nothing but IDS. That is the whole design: the places dataset is
 * deliberately never written to disk (see src/data/places.ts), so persisting
 * a copy of a place here — even one — would put a hole in that rule. Ids are
 * resolved against the live `places` array at render time; a favourite whose
 * id is not in the current data simply doesn't render, which is also the
 * correct behaviour when a place is removed upstream.
 *
 * Insertion order is preserved so the list doesn't reshuffle under the user.
 */

const STORAGE_KEY = "favourites:v1";
/** A guard against an unbounded list, not a product limit anyone will hit. */
const MAX_FAVOURITES = 100;

type FavouritesValue = {
  /** Ordered ids, oldest first. */
  ids: string[];
  /**
   * The same ids as a set, for membership tests. Consumers filter whole
   * datasets against this (the home screen excludes saved places from the
   * nearby list, and the saved-only filter runs over every place), which an
   * array scan turns into O(places × favourites).
   */
  idSet: ReadonlySet<string>;
  isFavourite: (id: string) => boolean;
  toggle: (id: string) => void;
  /** False until storage has been read, so the UI can avoid flicker. */
  hydrated: boolean;
};

const FavouritesContext = createContext<FavouritesValue>({
  ids: [],
  idSet: new Set(),
  isFavourite: () => false,
  toggle: () => {},
  hydrated: false,
});

export function FavouritesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // Writes are fire-and-forget, but they must not race the initial read.
  const ready = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setIds(
            parsed
              .filter((v): v is string => typeof v === "string")
              .slice(0, MAX_FAVOURITES),
          );
        }
      })
      .catch(() => {
        // Unreadable or corrupt storage just means "no favourites yet".
      })
      .finally(() => {
        if (cancelled) return;
        ready.current = true;
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id].slice(-MAX_FAVOURITES);
      // Guarded so a toggle fired before hydration can't persist an empty
      // list over the user's real one.
      if (ready.current) {
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(
          () => {},
        );
      }
      return next;
    });
  }, []);

  const idSet = useMemo(() => new Set(ids), [ids]);

  const value = useMemo<FavouritesValue>(
    () => ({
      ids,
      idSet,
      isFavourite: (id: string) => idSet.has(id),
      toggle,
      hydrated,
    }),
    [ids, idSet, toggle, hydrated],
  );

  return (
    <FavouritesContext.Provider value={value}>
      {children}
    </FavouritesContext.Provider>
  );
}

export function useFavourites(): FavouritesValue {
  return useContext(FavouritesContext);
}
