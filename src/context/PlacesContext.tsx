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
import { Place, PLACES } from "@/data/places";
import { fetchPlaces, getCachedPlaces } from "@/data/placesRepo";
import { supabase } from "@/lib/supabase";

type PlacesContextValue = {
  places: Place[];
  refresh: () => Promise<void>;
};

const PlacesContext = createContext<PlacesContextValue>({
  places: PLACES,
  refresh: async () => {},
});

const FOREGROUND_REFRESH_MS = 60 * 1000;
const REALTIME_DEBOUNCE_MS = 500;

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<Place[]>(PLACES);
  const mounted = useRef(true);
  const lastFetch = useRef(0);
  const hasNetworkData = useRef(false);
  const inFlightRefresh = useRef<Promise<void> | null>(null);

  // Deduped network refresh: concurrent callers (launch + foreground +
  // realtime) share a single request instead of racing, and lastFetch only
  // advances on success so a failed fetch doesn't block the next retry.
  const refresh = useCallback((): Promise<void> => {
    if (inFlightRefresh.current) return inFlightRefresh.current;
    const request = (async () => {
      const loaded = await fetchPlaces();
      if (loaded && mounted.current) {
        hasNetworkData.current = true;
        lastFetch.current = Date.now();
        setPlaces(loaded);
      }
    })().finally(() => {
      inFlightRefresh.current = null;
    });
    inFlightRefresh.current = request;
    return request;
  }, []);

  // Launch: hydrate instantly from the on-device cache (no network wait)
  // while the network refresh runs in parallel. Network data always wins,
  // so a slow cache read can never overwrite fresher rows.
  useEffect(() => {
    mounted.current = true;
    getCachedPlaces().then((cached) => {
      if (cached && mounted.current && !hasNetworkData.current) {
        setPlaces(cached);
      }
    });
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

  // Stable context value: consumers only re-render when places change,
  // not every time the provider re-renders.
  const value = useMemo(() => ({ places, refresh }), [places, refresh]);

  return (
    <PlacesContext.Provider value={value}>{children}</PlacesContext.Provider>
  );
}

export function usePlaces(): PlacesContextValue {
  return useContext(PlacesContext);
}
