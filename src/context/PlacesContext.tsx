import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { Place, PLACES } from "@/data/places";
import { getPlaces } from "@/data/placesRepo";
import { supabase } from "@/lib/supabase";
type PlacesContextValue = {
  places: Place[];
  refresh: () => Promise<void>;
};

const PlacesContext = createContext<PlacesContextValue>({
  places: PLACES,
  refresh: async () => {},
});

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<Place[]>(PLACES);
  const mounted = useRef(true);
  const lastFetch = useRef(0);

  const refresh = useCallback(async () => {
    lastFetch.current = Date.now();
    const loaded = await getPlaces();
    if (mounted.current) setPlaces(loaded);
  }, []);

  // Initial load on app launch.
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
      if (state === "active" && Date.now() - lastFetch.current > 60 * 1000) {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  // Live updates: whenever any row in `places` changes on Supabase
  // (insert/update/delete), refetch the list. Requires Realtime to be
  // enabled on the `places` table in the Supabase dashboard.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("places-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "places" },
        () => {
          refresh();
        },
      )
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [refresh]);

  return (
    <PlacesContext.Provider value={{ places, refresh }}>
      {children}
    </PlacesContext.Provider>
  );
}

export function usePlaces(): PlacesContextValue {
  return useContext(PlacesContext);
}
