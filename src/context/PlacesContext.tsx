import React, { createContext, useContext, useEffect, useState } from "react";

import { Place, PLACES } from "@/data/places";
import { getPlaces } from "@/data/placesRepo";

type PlacesContextValue = {
  places: Place[];
};

const PlacesContext = createContext<PlacesContextValue>({ places: PLACES });

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<Place[]>(PLACES);

  useEffect(() => {
    let cancelled = false;
    getPlaces().then((loaded) => {
      if (!cancelled) setPlaces(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PlacesContext.Provider value={{ places }}>
      {children}
    </PlacesContext.Provider>
  );
}

export function usePlaces(): PlacesContextValue {
  return useContext(PlacesContext);
}
