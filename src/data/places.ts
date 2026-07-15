// ---------------------------------------------------------------------------
// SAMPLE SEED DATA — for building and testing the app only.
// Names/locations are real London places but facility details are placeholders.
// Verify everything before showing it to real users (see project plan, §3).
// ---------------------------------------------------------------------------

export type PlaceType = "masjid" | "musalla" | "multi_faith_room";

export type FacilityKey =
  | "sistersSpace"
  | "wudu"
  | "disabledAccess"
  | "parking"
  | "jumuah"
  | "janazah";

export const FACILITY_LABELS: Record<FacilityKey, string> = {
  sistersSpace: "Sisters' space",
  wudu: "Wudu",
  disabledAccess: "Disabled access",
  parking: "Parking",
  jumuah: "Jumu'ah",
  janazah: "Janazah",
};

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  masjid: "Masjid",
  musalla: "Prayer room",
  multi_faith_room: "Multi-faith room",
};

export type Place = {
  id: string;
  name: string;
  type: PlaceType;
  address: string;
  lat: number;
  lng: number;
  facilities: Record<FacilityKey, boolean>;
  /** Jumu'ah start time(s) as display strings, if known. */
  jumuahTimes?: string[];
  notes?: string;
  /** ISO date this record was last checked by a human. */
  lastVerified?: string;
  /** Where this record's info came from (website, phone call, visit...). */
  source?: string;
  /** Contact and source links — where this place's truth lives online. */
  phone?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  /** How trustworthy this record is. */
  confidence?: "verified" | "community" | "unverified";
};

export const PLACES: Place[] = [
  {
    id: "east-london-mosque",
    name: "East London Mosque & London Muslim Centre",
    type: "masjid",
    address: "82-92 Whitechapel Rd, London E1 1JQ",
    lat: 51.5169,
    lng: -0.0655,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: true,
      parking: true,
      jumuah: true,
      janazah: true,
    },
    jumuahTimes: ["13:15", "14:15"],
    notes: "One of the largest mosques in the UK. Sisters' entrance via the London Muslim Centre.",
    lastVerified: "2026-07-01",
    source: "Sample data — verify via eastlondonmosque.org.uk",
    phone: "020 7650 3000",
    website: "https://www.eastlondonmosque.org.uk/",
    confidence: "unverified",
  },
  {
    id: "london-central-mosque",
    name: "London Central Mosque (Regent's Park)",
    type: "masjid",
    address: "146 Park Rd, London NW8 7RG",
    lat: 51.5289,
    lng: -0.1647,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: true,
      parking: true,
      jumuah: true,
      janazah: true,
    },
    jumuahTimes: ["13:30"],
    lastVerified: "2026-06-20",
    source: "Sample data — verify via iccuk.org",
    phone: "020 7724 3363",
    website: "https://www.iccuk.org/",
    confidence: "unverified",
  },
  {
    id: "brick-lane-jamme-masjid",
    name: "Brick Lane Jamme Masjid",
    type: "masjid",
    address: "59 Brick Ln, London E1 6QL",
    lat: 51.5195,
    lng: -0.0717,
    facilities: {
      sistersSpace: false,
      wudu: true,
      disabledAccess: false,
      parking: false,
      jumuah: true,
      janazah: false,
    },
    jumuahTimes: ["13:30"],
    lastVerified: "2026-05-14",
    source: "Sample data",
    confidence: "unverified",
  },
  {
    id: "al-manaar",
    name: "Al-Manaar (Muslim Cultural Heritage Centre)",
    type: "masjid",
    address: "244 Acklam Rd, London W10 5YG",
    lat: 51.5208,
    lng: -0.2049,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: true,
      parking: false,
      jumuah: true,
      janazah: true,
    },
    jumuahTimes: ["13:30"],
    lastVerified: "2026-04-02",
    source: "Sample data",
    confidence: "unverified",
  },
  {
    id: "finsbury-park-mosque",
    name: "Finsbury Park Mosque",
    type: "masjid",
    address: "7-11 St Thomas's Rd, London N4 2QH",
    lat: 51.5645,
    lng: -0.1069,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: true,
      parking: false,
      jumuah: true,
      janazah: false,
    },
    jumuahTimes: ["13:15"],
    lastVerified: "2026-03-19",
    source: "Sample data",
    confidence: "unverified",
  },
  {
    id: "lewisham-islamic-centre",
    name: "Lewisham Islamic Centre",
    type: "masjid",
    address: "363-365 Lewisham High St, London SE13 6NZ",
    lat: 51.4507,
    lng: -0.0163,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: true,
      parking: true,
      jumuah: true,
      janazah: true,
    },
    jumuahTimes: ["13:05", "14:00"],
    lastVerified: "2026-06-11",
    source: "Sample data",
    confidence: "unverified",
  },
  {
    id: "croydon-mosque",
    name: "Croydon Mosque & Islamic Centre",
    type: "masjid",
    address: "525 London Rd, Thornton Heath CR7 6AR",
    lat: 51.3937,
    lng: -0.1049,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: true,
      parking: true,
      jumuah: true,
      janazah: true,
    },
    jumuahTimes: ["13:30"],
    lastVerified: "2026-02-27",
    source: "Sample data",
    confidence: "unverified",
  },
  {
    id: "ucl-prayer-room",
    name: "UCL Prayer Room (Student Central)",
    type: "musalla",
    address: "Malet St, London WC1E 7HY",
    lat: 51.5223,
    lng: -0.1301,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: true,
      parking: false,
      jumuah: true,
      janazah: false,
    },
    jumuahTimes: ["13:15"],
    notes: "Term-time access may require a student card. Jumu'ah run by the ISoc.",
    lastVerified: "2026-01-30",
    source: "Sample data — verify with UCL ISoc",
    confidence: "unverified",
  },
  {
    id: "guys-hospital-multifaith",
    name: "Guy's Hospital Multi-faith Chaplaincy",
    type: "multi_faith_room",
    address: "Great Maze Pond, London SE1 9RT",
    lat: 51.5033,
    lng: -0.0876,
    facilities: {
      sistersSpace: false,
      wudu: true,
      disabledAccess: true,
      parking: false,
      jumuah: true,
      janazah: false,
    },
    jumuahTimes: ["13:00"],
    notes: "Open to patients, visitors and staff. Ask at main reception for directions.",
    lastVerified: "2026-07-05",
    source: "Sample data — verify with GSTT chaplaincy",
    confidence: "unverified",
  },
  {
    id: "st-thomas-multifaith",
    name: "St Thomas' Hospital Multi-faith Room",
    type: "multi_faith_room",
    address: "Westminster Bridge Rd, London SE1 7EH",
    lat: 51.4986,
    lng: -0.1177,
    facilities: {
      sistersSpace: false,
      wudu: true,
      disabledAccess: true,
      parking: false,
      jumuah: false,
      janazah: false,
    },
    notes: "Quiet room available 24/7. Wudu facilities nearby.",
    lastVerified: "2026-07-05",
    source: "Sample data — verify with GSTT chaplaincy",
    confidence: "unverified",
  },
  {
    id: "westfield-stratford-prayer-room",
    name: "Westfield Stratford City Prayer Room",
    type: "musalla",
    address: "Montfichet Rd, London E20 1EJ",
    lat: 51.5423,
    lng: -0.0064,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: true,
      parking: true,
      jumuah: false,
      janazah: false,
    },
    notes: "Located near the Chestnut Plaza entrance. Ask guest services if unsure.",
    lastVerified: "2025-12-10",
    source: "Sample data",
    confidence: "unverified",
  },
  {
    id: "canary-wharf-multifaith",
    name: "Canary Wharf Multi-faith Prayer Room",
    type: "multi_faith_room",
    address: "Jubilee Place, London E14 5NY",
    lat: 51.5036,
    lng: -0.0184,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: true,
      parking: false,
      jumuah: true,
      janazah: false,
    },
    jumuahTimes: ["13:10"],
    lastVerified: "2026-05-22",
    source: "Sample data",
    confidence: "unverified",
  },
];
