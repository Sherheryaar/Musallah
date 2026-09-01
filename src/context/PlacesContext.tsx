import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { Place, placesEqual } from "@/data/places";
import { fetchPlaces } from "@/data/placesRepo";
import { supabase } from "@/lib/supabase";

/**
 * "loading": nothing yet, first fetch still in flight.
 * "ready": at least one successful fetch this session -- `places` is real.
 * "offline": no successful fetch yet AND the most recent attempt failed.
 *   A LATER failure while already "ready" does NOT move back to "offline":
 *   whatever's already on screen stays up, since it's still genuinely true
 *   (places don't move), and punishing a brief signal drop by hiding
 *   everything the user already found would be a worse experience than a
 *   quietly stale foreground-refresh.
 */
export type PlacesStatus = "loading" | "ready" | "offline";

type PlacesContextValue = {
  places: Place[];
  /**
   * The same places, indexed by id. Built once per dataset here rather than
   * with a linear `places.find()` at each call site — the place-detail screen
   * looks one up on every render, and the home screen resolves every saved id
   * on every GPS fix.
   */
  byId: ReadonlyMap<string, Place>;
  status: PlacesStatus;
  refresh: () => Promise<void>;
};

const EMPTY_BY_ID: ReadonlyMap<string, Place> = new Map();

const PlacesContext = createContext<PlacesContextValue>({
  places: [],
  byId: EMPTY_BY_ID,
  status: "loading",
  refresh: async () => {},
});

const FOREGROUND_REFRESH_MS = 60 * 1000;
const REALTIME_DEBOUNCE_MS = 500;
// While showing the offline screen, retry on a timer too -- not just on the
// user's tap or the app returning to the foreground -- so a connection that
// comes back while the app is sitting open in front of them is picked up
// without any action on their part.
const OFFLINE_RETRY_MS = 10 * 1000;

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<PlacesStatus>("loading");
  const mounted = useRef(true);
  const lastFetch = useRef(0);
  const hasLoadedOnce = useRef(false);
  const inFlightRefresh = useRef<Promise<void> | null>(null);
  // The rows currently on screen, so a refresh returning identical data
  // doesn't force a pointless re-render of the map and list (see placesEqual
  // for why this is a structural compare and not a fingerprint).
  const lastApplied = useRef<Place[] | null>(null);

  // Deduped network refresh: concurrent callers (launch + foreground +
  // realtime + the offline retry timer) share a single request instead of
  // racing, and lastFetch only advances on success so a failed fetch
  // doesn't block the next retry.
  const refresh = useCallback((): Promise<void> => {
    if (inFlightRefresh.current) return inFlightRefresh.current;
    const request = (async () => {
      const loaded = await fetchPlaces();
      if (!mounted.current) return;
      if (loaded) {
        hasLoadedOnce.current = true;
        lastFetch.current = Date.now();
        setStatus("ready");
        if (
          lastApplied.current === null ||
          !placesEqual(lastApplied.current, loaded)
        ) {
          lastApplied.current = loaded;
          setPlaces(loaded);
        }
      } else if (!hasLoadedOnce.current) {
        setStatus("offline");
      }
      // else: already showing real data from an earlier success -- a
      // failed refresh just means "no change", not "go blank".
    })().finally(() => {
      inFlightRefresh.current = null;
    });
    inFlightRefresh.current = request;
    return request;
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // Refetch when the app returns to the foreground (e.g. the user switches
  // back to it hours later), at most once per minute.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        Date.now() - lastFetch.current > FOREGROUND_REFRESH_MS
      ) {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  // Auto-retry while offline (see OFFLINE_RETRY_MS above).
  useEffect(() => {
    if (status !== "offline") return;
    const id = setInterval(refresh, OFFLINE_RETRY_MS);
    return () => clearInterval(id);
  }, [status, refresh]);

  // Live updates: whenever any row in `places` changes on Supabase
  // (insert/update/delete), refetch the list. Debounced so a burst of row
  // changes (e.g. a bulk import) triggers one refetch, not one per row.
  // Requires Realtime to be enabled on the `places` table in Supabase.
  useEffect(() => {
    if (!supabase) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("places-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "places" },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            refresh();
          }, REALTIME_DEBOUNCE_MS);
        },
      )
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      supabase?.removeChannel(channel);
    };
  }, [refresh]);

  const byId = useMemo(() => {
    const index = new Map<string, Place>();
    for (const place of places) index.set(place.id, place);
    return index;
  }, [places]);

  // Stable context value: consumers only re-render when places/status
  // change, not every time the provider re-renders.
  const value = useMemo(
    () => ({ places, byId, status, refresh }),
    [places, byId, status, refresh],
  );

  return (
    <PlacesContext.Provider value={value}>{children}</PlacesContext.Provider>
  );
}

export function usePlaces(): PlacesContextValue {
  return useContext(PlacesContext);
}
