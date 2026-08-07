# Place confidence audit

Generated 2026-08-07 by `scripts/verify-places.mjs`
(`npm run verify:places`). Re-runnable; the Overpass results it depends on are
checkpointed to `scripts/.overpass-cache.json`.

The shipped `confidence` column was derived from nothing more than which import
a row came from — every MuslimsInBritain row was "community", every
OpenStreetMap row was "unverified". This audit replaces it with a score built
only from signals a third party can check.

> **Reading the "change" columns.** Movement is measured against whatever
> `confidence` values `src/data/places.json` held when the script ran. This
> report was generated against the original import-derived values; re-running
> `npm run verify:places` after those changes have been applied will correctly
> report zero movement, with every row listed under its settled tier instead.

## Proposed distribution

| Tier | Before | After | Change |
|---|---|---|---|
| verified | 898 | 899 | +1 |
| community | 667 | 664 | -3 |
| unverified | 679 | 681 | +2 |
| **total** | 2244 | 2244 | |

**3 of 2244 places change tier:**

- community -> unverified: 2
- community -> verified: 1

## OpenStreetMap coverage actually achieved

- **54 of 55** 1° grid cells fetched from Overpass (plus 10 of 10 coarse cells for the shared multi-faith layer), yielding **1713** distinct Muslim / multi-faith / prayer-room elements across the UK & Ireland.
- **2242 of 2244 places (99.9%)** sit in a cell that was successfully fetched, so their live OSM check is real rather than assumed absent.
- **1129** places have an OSM prayer space within 150 m of the pin; a further **316** have one between 150 m and 400 m.
- **255 of 255** OSM-sourced rows had their own OSM element re-checked by id; **0** of those elements no longer exist in OSM.
- The remaining 2 places were scored on offline signals alone; the report marks them "could not be re-checked" and they are never downgraded *because of* a missing live check (an unfetched cell scores 0, not a penalty).

### Does the provenance tag hold up?

Cross-tabbing the `Data:` tag against today's independent Overpass result, for
the places that got a live check. If `MIB+OSM` were noise, its rows would not
line up with OSM any better than `MIB`-only rows do.

| Provenance | Checked | OSM match ≤ 150 m | 150–400 m | none |
|---|---|---|---|---|
| `MIB+OSM` | 995 | 99.8% | 0.1% | 0.1% |
| `MIB` | 988 | 11.2% | 24.6% | 64.2% |
| `OSM` | 255 | 9.4% | 27.8% | 62.7% |
| `seed` | 4 | 25.0% | 25.0% | 50.0% |

That gap is the justification for weighting `MIB+OSM` at +3 and a single source
at +1: the tag predicts the live result almost perfectly, and `MIB`-only rows
really are the ones OSM has never heard of.

## The scoring rules, in plain English

Every point comes from something someone else could verify from the outside.
Nothing is inferred from the record's own confidence value.

**Positive**

| Signal | Points | Why it counts |
|---|---|---|
| Provenance `MIB+OSM` | +3 | MuslimsInBritain surveyed it *and* an OSM mapper mapped it. Two organisations, no shared copy. |
| Provenance `MIB` / `OSM` alone, or a hand-entered seed row | +1 | One unreviewed source. |
| An **independent** OSM prayer space within 150 m of the pin, today | +3 | Someone stood there and mapped it. |
| …but mapped under a clearly different name | +2 instead of +3 | In dense areas two separate masjids sit a street apart, so a name clash may mean OSM mapped the *neighbour*. |
| …between 150 m and 400 m | +1 | Same block — suggestive, but might be a different building. |
| The matched OSM element's name agrees with ours | +1 | Withheld from OSM-sourced rows, where a name match would be self-referential. |
| An OSM-sourced row's own element still exists and is still tagged as a prayer space | +1 | Re-asking the row's only source is not corroboration, so it earns one point, not three — but the *opposite* answer is decisive (see below). |
| Website | +2 | A self-published, checkable presence. Rare in this dataset (373 of 2244), so it discriminates. |
| Phone number | +1 | A contactable organisation, though MIB phone numbers are often a volunteer's mobile. |
| Facebook / Instagram page | +1 | Weaker than a website but still a public presence. |
| *(contact subtotal capped at +3)* | | |
| Address names a specific building (house number, unit, or a named premises) | +1 | "125 Woodmill Road" or "Argyle Centre, 91 Argyle Road" pins a building. |
| MIB capacity ≥ 200 | +1 | A venue that seats hundreds is a building, not a borrowed room. A small capacity is never penalised — plenty of real musallas are small. |

**Crucially, a row is never allowed to corroborate itself.** For the 255
rows imported from a specific OSM element, that element is excluded from the
proximity search. Without that exclusion every OSM-only row matched itself at
0 m and scored +3 for it, which is why an earlier draft of this audit promoted
plain OSM nodes with a website straight to `verified`. The cross-tab above is
the proof it is fixed: `OSM`-only rows now line up with *other* OSM prayer
spaces at roughly the same rate `MIB`-only rows do, instead of 100%.

**Negative**

| Signal | Points | Why it counts |
|---|---|---|
| MIB flags "Irregular / part-time venue" | −2 | MIB itself is telling us the venue is volatile. Such a place can never reach `verified`. |
| `musalla` in ordinary premises (no hospital / campus / airport / services / station / retail / prison in the name or address) | −1 | A room rented above a shop closes without anyone updating a map. `multi_faith_room` is exempt by definition — it is a shared room *inside* a host building, and the host vouches for it. Keyword matching alone was not enough: it missed "Quiet Room, Blue Zone, Metro Centre", because the address never says "shopping centre". |
| Address recorded as "Address not recorded yet" | −1 | Nothing to check and nothing to navigate to. |
| The row's own OSM element has been deleted from OSM | −3 | Its only source has withdrawn it. Forces `unverified`. |
| The row's own OSM element is no longer a Muslim prayer space (e.g. `religion=christian`) | −3 | The import matched a cemetery chapel or another faith's building. Forces `unverified`. |

On this run, **0 of 255** OSM-sourced elements had been deleted and
**2** were contradicted — the OSM import has not rotted. The problem with
those rows is not that they are stale, it is that nothing except OSM has ever
said they are there.

Total range: −6 to +12.

"A Muslim prayer space" above means an OSM element tagged
`religion=muslim`, `building=mosque`, `room=prayer`, `amenity=prayer_room`,
or `religion=multifaith` — a hospital multi-faith room is somewhere a Muslim
can actually pray. An element with an explicitly non-Muslim religion
(`christian`, `jewish`, …) never counts as a match, so a cemetery chapel
cannot corroborate a musalla.

**Independent corroboration families.** Four things that can be wrong
independently of each other: (1) two datasets agreeing, (2) OSM mapping a
prayer space within 400 m, (3) a website, (4) a phone number. Counted
separately because a website and a phone number can both come from the same MIB
survey, but a map match cannot. The tighter 150 m radius is tracked
separately and only matters for reaching `verified`.

Honest caveat: families (1) and (2) are **not** fully independent — the `+OSM`
half of the provenance tag and today's live check both ultimately rest on
OpenStreetMap, just years apart. That is precisely why the `verified` gate
*also* insists on a website or a phone number: a row cannot reach `verified` on
OSM evidence alone, however many times OSM is asked.

**Thresholds**

- `verified` — needs **all** of: a map/dataset corroboration (`MIB+OSM` *or* a live OSM match within 150 m); a contactable organisation (website *or* phone); at least **2** independent families; a total of **≥ 7**; not part-time; not contradicted by OSM. In plain terms: *two things that were not copied from each other both say this place is here, and you can ring it up.*
- `unverified` — **0** independent families, **or** exactly 1 family with a total of **≤ 3**, **or** its own OSM source now contradicts it. These are the rows the app's filter should be able to hide.
- `community` — everything else: plausible, single-source or partly corroborated. The honest default for anything that does not clear the `verified` bar but is not close to worthless either.

Roughly, the three tiers separate into: purpose-built masjids that both
MuslimsInBritain and OpenStreetMap record and that answer a phone
(`verified`); masjids one of the two knows about (`community`); and small
musallas, part-time venues and bare OSM nodes with no contact details at all
(`unverified`).

The worked example that prompted this audit, **Mount Pleasant Musallah**
(`mount-pleasant-musallah-mib-1411`): score 0, 0 independent families → **unverified**. Missing: single source only (MIB); nearest independent OSM prayer space is 823 m away; no website; no phone number; address is a bare street name, no house number or named premises; musalla in ordinary premises (rented/shared rooms come and go).

## Most doubtful entries — review these 2 by hand first

The very bottom of the list: the lowest-scoring rows in the whole dataset that
are currently shown to users at a higher confidence than they deserve.

| Name | id | Address | Score | Corrob. | Missing / negative signals |
|---|---|---|---|---|---|
| Isle of Man Muslim Association | `isle-of-man-muslim-association-mib-720` | 3 Mona Terrace, Harris View, Manx, IM1 3NA | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Peace Islamic Centre | `peace-islamic-centre-node-14040384655` | 3 Hyde Business Park, Derry/Londonderry, BT48 0LU | 4 | 2 | single source only (OSM); no phone number; its only source, OSM node/14040384655, is not a Muslim prayer space (religion=unset, amenity=unset) |

## Proposed downgrades to `unverified` (2)

Every row that loses tier, worst score first. `Corrob.` is how many of the four
independent corroboration families the row has.

| Name | id | Address | Score | Corrob. | Missing / negative signals |
|---|---|---|---|---|---|
| Isle of Man Muslim Association | `isle-of-man-muslim-association-mib-720` | 3 Mona Terrace, Harris View, Manx, IM1 3NA | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Peace Islamic Centre | `peace-islamic-centre-node-14040384655` | 3 Hyde Business Park, Derry/Londonderry, BT48 0LU | 4 | 2 | single source only (OSM); no phone number; its only source, OSM node/14040384655, is not a Muslim prayer space (religion=unset, amenity=unset) |

## Already `unverified`, and staying there (679)

No change is proposed for these — they are listed so the doubtful set is
complete. Provenance breakdown: 497 MIB, 179 OSM, 3 seed.

| Name | id | Address | Score | Corrob. | Missing / negative signals |
|---|---|---|---|---|---|
| Abingdon Muslims | `abingdon-muslims-mib-1203` | 4 East St Helen Street, Vale of White Horse, OX14 3HG | -1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Masjid Noor | `masjid-noor-mib-667` | 8 Woodhall Avenue, Thornbury,Bradford, BD3 7DA | -1 | 0 | single source only (MIB); nearest independent OSM prayer space is 585 m away; no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Altrincham Grammar School for Boys Islamic … | `altrincham-grammar-school-for-boys-islamic-society-mib-1838` | Marlborough Road, Altrincham,Trafford, WA14 2RS | 0 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises; musalla in ordinary premises (rented/shared rooms come and go) |
| Islam Hounslow | `islam-hounslow-mib-596` | 263-273 High Street, Hounslow,Hounslow, TW3 1EF | 0 | 0 | single source only (MIB); nearest independent OSM prayer space is 462 m away; no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Mount Pleasant Musallah | `mount-pleasant-musallah-mib-1411` | Woodmill Road, Clapton,Hackney, E5 9GS | 0 | 0 | single source only (MIB); nearest independent OSM prayer space is 823 m away; no website; no phone number; address is a bare street name, no house number or named premises; musalla in ordinary premises (rented/shared rooms come and go) |
| Musalla Dalston Lane | `musalla-dalston-lane-mib-1408` | Madinah Road, Dalston,Hackney, E8 1PG | 0 | 0 | single source only (MIB); nearest independent OSM prayer space is 555 m away; no website; no phone number; address is a bare street name, no house number or named premises; musalla in ordinary premises (rented/shared rooms come and go) |
| Prayer Room | `prayer-room-mib-2016042901` | Ground Floor, International Arrivals, Edinburgh Airport,Cit… | 0 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; MIB flags it as an irregular / part-time venue |
| Prayer Room | `prayer-room-mib-2578` | Heathfield  Building, Birmingham City University, Westbourn… | 0 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; MIB flags it as an irregular / part-time venue |
| Prayer Room | `prayer-room-mib-2922` | Cannock Chase Hospital, Brunswick Road, Cannock Chase, WS11… | 0 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; MIB flags it as an irregular / part-time venue |
| Quiet Room | `quiet-room-mib-834` | Blue Zone, Metro Centre, Gateshead, NE11 9YG | 0 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; MIB flags it as an irregular / part-time venue |
| Shair-e-Rabbani Islamic Centre and Mosque | `shair-e-rabbani-islamic-centre-and-mosque-mib-1860` | 4 Tariff Street, not known, Manchester, M1 2FF | 0 | 0 | single source only (MIB); nearest independent OSM prayer space is 457 m away; no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| UCL Prayer Room (Student Central) | `ucl-prayer-room` | Malet St, London WC1E 7HY | 0 | 0 | hand-entered seed row, no dataset provenance; nearest independent OSM prayer space is 511 m away; no website; no phone number; address is a bare street name, no house number or named premises; musalla in ordinary premises (rented/shared rooms come and go) |
| Al Falaah Academy | `al-falaah-academy-mib-12` | 311 Calder Street, Crosshill,Glasgow, G42 7NH | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 494 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Al Hidaya Academy | `al-hidaya-academy-way-1428001236` | Address not recorded yet | 0 | 1 | single source only (OSM); no website; no phone number; no address recorded; its only source, OSM way/1428001236, is not a Muslim prayer space (religion=unset, amenity=unset) |
| Al Hidayah Centre | `al-hidayah-centre-mib-1487` | 65 James Street, Frenchwood,Preston, PR1 4JX | 0 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Al Huda Welfare Foundation UK | `al-huda-welfare-foundation-uk-mib-2016062001` | 14 Wangey Road, Cedar Park Gardens, Chadwell Heath, Romford… | 0 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Al-Bayan Welfare Centre | `al-bayan-welfare-centre-mib-980` | 55 Green Lane, Ilford,Redbridge, IG1 1XG | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 766 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Al-Haroon Educational Centre | `al-haroon-educational-centre-mib-284` | 25 St Benedicts Road, Small Heath,Birmingham, Hodge Hill, B… | 0 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Al-Nasr Centre | `al-nasr-centre-mib-2726` | Ansar House, 8 Ledgers Road, Chalvey,Slough, SL1 2QX | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 1025 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Anwar-e-Medina | `anwar-e-medina-mib-138` | 68 Nansen Road, Sparkhill (south),Birmingham, Hall Green, B… | 0 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Birmingham Cultural and Education Centre | `birmingham-cultural-and-education-centre-mib-219` | Oldknow Junior School, Oldknow Road, Small Heath,Birmingham… | 0 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Bradford Dawah Centre | `bradford-dawah-centre-mib-1660` | Shearbridge Mills, 137 Great Horton Road, Little Horton,Bra… | 0 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Coventry İslam Kültür Merkezi | `coventry-304-slam-k-uuml-lt-uuml-r-merkezi-mib-14051009` | 280 Foleshill Road, Coventry, CV6 5AH | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 680 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Dar-ul-Alum | `dar-ul-alum-mib-541` | 141 Leyland Road, Burnley, BB11 3DN | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 970 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Edmonton Fazilet Câmii | `edmonton-fazilet-c-acirc-mii-mib-14051006` | Centre Way, Edmonton,Enfield, N9 0AP | 0 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Inclusive Mosque Initiative | `inclusive-mosque-initiative-mib-1512` | New Unity, 277a Upper Street, Islington,Islington, N1 2TZ | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 1283 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Jamia Noor ul Qur'an | `jamia-noor-ul-qur-an-mib-712` | 80 The Crescent, Ravensthorpe,Kirklees, WF13 3AZ | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 517 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2829` | 29 Park Street, Digbeth,Birmingham, Ladywood, B5 5JH | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 534 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Madni Dawah Academy | `madni-dawah-academy-mib-2016052703` | 260 Kings Causeway, Brierfield,Pendle, BB9 0EZ | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 1174 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Madrassah Nur-ul-Qur'an | `madrassah-nur-ul-qur-an-mib-610` | 234 Parkside Road, Little Horton,Bradford, BD5 8PW | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 719 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Maidstone Câmii ve İslam Kültür Merkezi | `maidstone-c-acirc-mii-ve-304-slam-k-uuml-lt-uuml-r-merkezi-mib-14051007` | 441 or 447 Tonbridge Road, Maidstone, ME16 8NJ | 0 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Markazi Jamiat Ahl-e-Hadith | `markazi-jamiat-ahl-e-hadith-mib-633` | 25 Fisher Road, Coventry, CV6 5HU | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 669 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Muhammadiyah House of Wisdom | `muhammadiyah-house-of-wisdom-mib-2544` | 33 Ridling Lane, Hyde,Tameside, SK14 1NP | 0 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Northampton İslam Kültür Merkezi | `northampton-304-slam-k-uuml-lt-uuml-r-merkezi-mib-14051008` | 26 Newnham Road, Northampton, NN2 7RE | 0 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Prayer Room | `prayer-room-mib-62` | above Javid Fashions, 1a Adelaide Street, Wyre, FY7 6AD | 0 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| South Croydon Prayer Room | `south-croydon-prayer-room-mib-810` | 292 High Street, Croydon,Croydon, CR0 1NG | 0 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Sunni Muslim Association (South London) | `sunni-muslim-association-south-london-mib-1410` | 20 Tooting Bec Road, Tooting,Wandsworth, SW17 8BD | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 502 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Tajweed ul Quran Madrassah | `tajweed-ul-quran-madrassah-mib-1603` | 212A Manchester Road, Pendle, BB9 7DD | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 816 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| UWAIS Foundation | `uwais-foundation-mib-2744` | 113-115 Fenham Hall Drive, Fenham,Newcastle upon Tyne, NE4 … | 0 | 1 | single source only (MIB); nearest independent OSM prayer space is 744 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Abu Bakr Siddique Masjid | `abu-bakr-siddique-masjid-way-61012198` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 944 m away; no website; no phone number; no address recorded |
| Al-Mustafa Centre | `al-mustafa-centre-node-13128244550` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 442 m away; no website; no phone number; no address recorded |
| Al-Mustafa Centre | `al-mustafa-centre-way-1428046678` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 715 m away; no website; no phone number; no address recorded |
| Al-Rahmah Faith Centre | `al-rahmah-faith-centre-node-13130476528` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 507 m away; no website; no phone number; no address recorded |
| Berea Masjid | `berea-masjid-mib-2536` | Berea Cottages, Nantyglo,Blaenau Gwent - Blaenau Gwent, NP1… | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Bethel Chapel | `bethel-chapel-way-885612663` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 686 m away; no website; no phone number; no address recorded |
| Brunel University Islamic Society | `brunel-university-islamic-society-mib-14051002` | Brunel University, Kingston Lane, Uxbridge,Hillingdon, UB8 … | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 674 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Canolfan Iman Centre | `canolfan-iman-centre-mib-625` | Glyn Y Marl Road, Llandudno Junction,Conwy - Conwy, LL31 9NS | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Chaplaincy | `chaplaincy-mib-308` | Arrivals entrance, Luton Airport,Luton, LU2 9LU | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Chaplaincy | `chaplaincy-mib-773` | Gatwick Airport, Crawley, RH6 0NP | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 1805 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Chaplaincy | `chaplaincy-node-512529477` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Chaplaincy | `chaplaincy-node-5845829754` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1592 m away; no website; no phone number; no address recorded |
| Craigavon Mosque | `craigavon-mosque-node-13208406265` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Faith Room | `faith-room-node-13306027073` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Felicity House | `felicity-house-way-650262937` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Feltham Masjid | `feltham-masjid-way-23548668` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1399 m away; no website; no phone number; no address recorded |
| Ferham Islamic Cultural Centre | `ferham-islamic-cultural-centre-way-1428084687` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 481 m away; no website; no phone number; no address recorded |
| Firdaws Mosque | `firdaws-mosque-way-201227502` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 730 m away; no website; no phone number; no address recorded |
| Guy's Hospital Multi-faith Chaplaincy | `guys-hospital-multifaith` | Great Maze Pond, London SE1 9RT | 1 | 0 | hand-entered seed row, no dataset provenance; nearest independent OSM prayer space is 784 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Harrow College Islamic Society (HCIS) | `harrow-college-islamic-society-hcis-mib-1578` | Harrow,Harrow, HA3 6RR | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Hendon Jami Masjid | `hendon-jami-masjid-way-1158181483` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Hough End Hall Academy | `hough-end-hall-academy-node-11804834009` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1300 m away; no website; no phone number; no address recorded |
| Imam Ali Centre | `imam-ali-centre-node-1116253471` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Imam Yusuf Motala Academy | `imam-yusuf-motala-academy-way-1350357402` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 829 m away; no website; no phone number; no address recorded |
| Inverness Masjid | `inverness-masjid-mib-882` | Northern Meeting Park, Ardross Street, Highland, IV3 5NP | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 976 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Iqra Masjid | `iqra-masjid-way-1427957582` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 708 m away; no website; no phone number; no address recorded |
| Islamic Prayer Rooms | `islamic-prayer-rooms-way-502300435` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1165 m away; no website; no phone number; no address recorded |
| Jamia Masjid Noor-Ul-Huda | `jamia-masjid-noor-ul-huda-way-386030104` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 478 m away; no website; no phone number; no address recorded |
| Jumu'ah salaah | `jumu-ah-salaah-mib-1206` | Abingdon Guildhall, Abbey Close, Vale of White Horse, OX14 … | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1413` | Scout Headquarters, New Broad Street, Stratford-on-Avon, CV… | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-17080604` | Cambourne Community Hub, High Street, Cambourne,South Cambr… | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Keele University Islamic Centre | `keele-university-islamic-centre-way-139850347` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Kings College London Islamic Society - Not … | `kings-college-london-islamic-society-not-open-to-public-mib-1726` | Strand Campus, The Strand, Temple,City of Westminster, WC2R… | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 913 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Lammack Prayer Room | `lammack-prayer-room-mib-1614` | 7 Whinney Lane, Lammack,Blackburn with Darwen, BB2 7BX | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 773 m away; no website; no phone number; musalla in ordinary premises (rented/shared rooms come and go) |
| Lancaster University Chaplaincy Centre | `lancaster-university-chaplaincy-centre-way-42828223` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Laud Worship Rooms | `laud-worship-rooms-node-4630679956` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Limerick Islamic Centre | `limerick-islamic-centre-mib-3005` | Old Dooradoyle Road, +353, Dooradoyle,Limerick,Not until 20… | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 1194 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| London School of Economics Islamic Society | `london-school-of-economics-islamic-society-mib-1434` | Lincoln's Inn Chambers, LSE Building 'L', Portsmouth Street… | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 635 m away; no website; no phone number; musalla in ordinary premises (rented/shared rooms come and go) |
| Madina Tul Quran | `madina-tul-quran-node-2327707493` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Madrassa Tul Madinah | `madrassa-tul-madinah-way-127886465` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 631 m away; no website; no phone number; no address recorded |
| Martin Luther King Multi Faith Centre | `martin-luther-king-multi-faith-centre-node-2036058830` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1103 m away; no website; no phone number; no address recorded |
| Masjid Ar-Rashideen | `masjid-ar-rashideen-node-13129966917` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 896 m away; no website; no phone number; no address recorded |
| Masjid As-Salaam | `masjid-as-salaam-node-13129991419` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1059 m away; no website; no phone number; no address recorded |
| Masjid Ayesha | `masjid-ayesha-way-1427965916` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1289 m away; no website; no phone number; no address recorded |
| Masjid Bilaal | `masjid-bilaal-mib-15050303` | Waterloo Road, Burslem,City of Stoke-on-Trent, ST6 3HX | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid E Hamza | `masjid-e-hamza-way-1427992646` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 463 m away; no website; no phone number; no address recorded |
| Masjid Imaam Muqbil | `masjid-imaam-muqbil-mib-298` | The Arches, Stanley Road, Harrow,Harrow, HA2 8AA | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 1075 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid Quba | `masjid-quba-way-1428229088` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 522 m away; no website; no phone number; no address recorded |
| Masjid-e-Aishah | `masjid-e-aishah-mib-3714` | Seymour Road, Bolton, BL1 8PG | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 552 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| MIcklefield Mosque | `micklefield-mosque-node-495242330` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1427 m away; no website; no phone number; no address recorded |
| Multi Faith Room (Level A) | `multi-faith-room-level-a-node-5429171561` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Multi-faith Prayer Room | `multi-faith-prayer-room-node-11876860561` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1152 m away; no website; no phone number; no address recorded |
| Multi-Faith Room | `multi-faith-room-way-43290803` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 699 m away; no website; no phone number; no address recorded |
| Multifaith Centre | `multifaith-centre-way-1464988785` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Multifaith Prayer Room | `multifaith-prayer-room-node-13451361548` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Multifaith Room | `multifaith-room-mib-1705` | Baldock Services, A1(M) and A1 at Junction 10, Stevenage No… | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Multifaith Room | `multifaith-room-mib-375` | IKEA Croydon, Valley Park, Croydon,Croydon, CR0 4UZ | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 1251 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Musalla Salaam | `musalla-salaam-way-1543176865` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1023 m away; no website; no phone number; no address recorded |
| Musallah | `musallah-mib-17` | basement of Butlers News, 16 Great Western Road, Paddington… | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 550 m away; no website; no phone number; musalla in ordinary premises (rented/shared rooms come and go) |
| Musallah | `musallah-mib-3009` | 10 Springfield, Ennis,Not until 2015 | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; musalla in ordinary premises (rented/shared rooms come and go) |
| Muslim Prayer Room | `muslim-prayer-room-mib-1677` | Bradford Royal Infirmary, Duckworth Lane, Bradford, BD9 6RJ | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 540 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| NTU Prayer Room | `ntu-prayer-room-node-13524967129` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 943 m away; no website; no phone number; no address recorded |
| O Zone | `o-zone-way-636637393` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Oasis Faith and Spirituality Centre | `oasis-faith-and-spirituality-centre-mib-1612` | University of Central Lancashire, Kirkham Street, Preston, … | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 753 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Peckham High Street Islamic Centre | `peckham-high-street-islamic-centre-node-2990261223` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 717 m away; no website; no phone number; no address recorded |
| Prayer room | `prayer-room-node-9096863451` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Prayer room | `unnamed-prayer-space-node-700515044` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Prayer room | `unnamed-prayer-space-node-717355487` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Prayer room | `unnamed-prayer-space-node-7435265085` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Prayer room | `unnamed-prayer-space-way-120391781` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Prayer room | `unnamed-prayer-space-way-123228104` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Prayer room | `unnamed-prayer-space-way-235593480` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1153 m away; no website; no phone number; no address recorded |
| Prayer Room | `prayer-room-mib-2049` | Oxford-Brookes University, Gipsy Lane, Headington,Oxford, O… | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 911 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Prayer Room | `prayer-room-mib-2054` | Air Service Training School, Perth and Kinross, PH2 6NP | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; musalla in ordinary premises (rented/shared rooms come and go) |
| Prayer Room | `prayer-room-mib-410` | Gallery 2, British Museum, Bloomsbury,Camden, WC1B 3DG | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 674 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Prayer Room | `prayer-room-mib-48` | Basement, Charles Ward Building, Cope Street, Coventry, CV1… | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 953 m away; no website; no phone number; musalla in ordinary premises (rented/shared rooms come and go) |
| Prayer Room | `prayer-room-mib-586` | Portakabin, Toddington Services, southbound carriageway, Ce… | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Prayer Room | `prayer-room-mib-643` | M4 Westbound, Leigh Delamare Services, Wiltshire, SN14 6LB | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Prayer Room | `prayer-room-mib-644` | M1 Northbound, Trowell Services, Broxtowe, NG9 3PL | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Prayer Room | `prayer-room-mib-645` | M61 Rivington Services, Chorley, BL6 5UZ | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Prayer Room | `prayer-room-mib-658` | M6 Southbound, Lancaster Services between J32 and 33, Wyre,… | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Prayer Room | `prayer-room-node-1990934810` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 861 m away; no website; no phone number; no address recorded |
| Purley musallah | `purley-musallah-mib-1213` | behind 1 The Parade, Old Lodge Lane, Reedham,Croydon, CR8 4… | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; musalla in ordinary premises (rented/shared rooms come and go) |
| Raza-E-Mustafa Mosque | `raza-e-mustafa-mosque-way-712311313` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Sai Grace Ashram | `sai-grace-ashram-node-6791430556` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Said Nursi Camii | `said-nursi-camii-node-9746962406` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Sarah Turnvill Multifaith Centre | `sarah-turnvill-multifaith-centre-way-1347291937` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 843 m away; no website; no phone number; no address recorded |
| Shipley Masjid Association | `shipley-masjid-association-node-13129427390` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 491 m away; no website; no phone number; no address recorded |
| Spiritual Commons | `spiritual-commons-node-11277303129` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Stafford Muslim Prayer Hall Committee Ltd | `stafford-muslim-prayer-hall-committee-ltd-mib-2267` | Greyfriars Place, Stafford, ST16 2SD | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| The Al Noor | `the-al-noor-node-13129976295` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 450 m away; no website; no phone number; no address recorded |
| The City Mussalla | `the-city-mussalla-mib-2591` | Under City Barbers, Whitefriars Street and Tudor Street, Te… | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 810 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| The Lingfield Centre | `the-lingfield-centre-way-542705837` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1570 m away; no website; no phone number; no address recorded |
| University of Chester Chaplaincy | `university-of-chester-chaplaincy-node-3043554872` | Address not recorded yet | 1 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; no address recorded |
| Waterford Musalla | `waterford-musalla-mib-2365` | 1 Viewmount Park, Waterford,Not until 2015 | 1 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number; musalla in ordinary premises (rented/shared rooms come and go) |
| West Cambridge Prayer Room | `west-cambridge-prayer-room-mib-2493` | Merton Farmhouse at the junction of JJ Thomson Avenue and M… | 1 | 0 | single source only (MIB); nearest independent OSM prayer space is 408 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Wibsey Musalla Jummah Salaah | `wibsey-musalla-jummah-salaah-way-1543175566` | Address not recorded yet | 1 | 0 | single source only (OSM); nearest independent OSM prayer space is 1066 m away; no website; no phone number; no address recorded |
| Abrar Academy | `abrar-academy-mib-1314` | 34-36 Garstang Road, Preston, PR1 1NA | 1 | 1 | single source only (MIB); nearest independent OSM prayer space is 766 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Afghan Community Association | `afghan-community-association-mib-989` | Unit 2, Block A, New Normanton Mills, Stanhope Street, City… | 1 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Islamic Society of Bristol University | `islamic-society-of-bristol-university-mib-2702` | Wills Memorial Building, Queens Road, Clifton,City of Brist… | 1 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; MIB flags it as an irregular / part-time venue |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2818` | St Pauls Street, Kirklees, HD1 3DH | 1 | 1 | single source only (MIB); nearest independent OSM prayer space is 791 m away; no website; address is a bare street name, no house number or named premises; musalla in ordinary premises (rented/shared rooms come and go) |
| Masjid e Ali | `masjid-e-ali-mib-1022` | 396 Wigan Road, Bolton, BL3 4QH | 1 | 1 | single source only (MIB); nearest independent OSM prayer space is 783 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Masjid Thaqwa | `masjid-thaqwa-mib-359` | 470 Green Lane, Small Heath,Birmingham, Hodge Hill, B9 5QJ | 1 | 1 | single source only (MIB); nearest independent OSM prayer space is 439 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Mosque and Community Centre | `mosque-and-community-centre-mib-1984` | 163 Woodborough Road, St Anns,City of Nottingham, NG3 1AX | 1 | 1 | single source only (MIB); nearest independent OSM prayer space is 583 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Musallah | `musallah-mib-2998` | Blackpitts, Dublin,D8 | 1 | 1 | single source only (MIB); no website; no phone number; address is a bare street name, no house number or named premises; musalla in ordinary premises (rented/shared rooms come and go) |
| Nali Community Cantre | `nali-community-cantre-mib-593` | First Floor,  46 - 50 Elswick Road, High Elswick,Newcastle … | 1 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Private Masjid | `private-masjid-mib-1937` | Stanley House Stables, Bury Road, Forest Heath, CB8 7DF | 1 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Riverside Muslim Association | `riverside-muslim-association-mib-1715` | Rivergate Centre, Minter Road, Barking,Barking and Dagenham… | 1 | 1 | single source only (MIB); nearest independent OSM prayer space is 1518 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Wood Green Fatih Câmii; Fatih Mosque | `wood-green-fatih-c-acirc-mii-fatih-mosque-mib-1168` | 10 Caxton Road, Wood Green,Haringey, N22 6TB | 1 | 1 | single source only (MIB); nearest independent OSM prayer space is 887 m away; no website; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| (private) Multi Faith Room | `private-multi-faith-room-mib-2603` | Blackpool and The Fylde College, Ashfield Road, Bispham,Bla… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Al-Qamar Islamic Institute | `al-qamar-islamic-institute-mib-384` | 12 Beverley Road, Bolton, BL1 4DT | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 549 m away; no website; no phone number |
| Bishopbriggs Muslim Community Centre | `bishopbriggs-muslim-community-centre-mib-1601` | behind Cha Cha Gz, 140a Auchinairn Road, Bishopbriggs,East … | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Broomhouse Mosque | `broomhouse-mosque-way-243007668` | Broomhouse Crescent, Edinburgh, EH11 3RH | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Cavan Islamic Society | `cavan-islamic-society-mib-303` | 9 Drumnavanagh Close, +353, Cavan,None until 2015 | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Chapel and Multifaith Room | `chapel-and-multifaith-room-mib-1437` | Wells Wing, Epsom General Hospital, Dorking Road, Epsom,Eps… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1623 m away; no website; no phone number |
| Chiswick Park Mosque | `chiswick-park-mosque-mib-1211` | Riverside Properties, 10 London Stile, Wellesley Road, n/a,… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 2064 m away; no website; no phone number |
| City University Islaamic Society | `city-university-islaamic-society-mib-1227` | City University, 10 Northampton Square, Angel,Islington, EC… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1100 m away; no website; no phone number |
| Clarkston Community Centre | `clarkston-community-centre-way-530423639` | Stamperland Gardens, Glasgow, G76 8LJ | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Collier Row Masjid | `collier-row-masjid-mib-1605` | 148a Chase Cross Road, Havering, RM5 3UU | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Collingwood Masjid | `collingwood-masjid-mib-17080307` | 4 Ashington House, Barnsley Street, Limehouse,Tower Hamlets… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 445 m away; no website; no phone number |
| Cork Islamic Centre | `cork-islamic-centre-mib-626` | 69 Riverview Estate, Clashduv Road, +353, Cork, | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Cotham Islamic Centre - University of Brist… | `cotham-islamic-centre-university-of-bristol-mib-2772` | 17 Alfred Place, Kingsdown,City of Bristol, BS2 8HD | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Dar al Ilm Cultural and Learning Centre | `dar-al-ilm-cultural-and-learning-centre-mib-1366` | 65 Lilburn Walk, Stonebridge,Brent, NW10 0TW | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1571 m away; no website; no phone number |
| Darussalam Masjid | `darussalam-masjid-mib-1598` | 75 Cumbernauld Road, Stepps,North Lanarkshire, G33 6LR | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Daventry Muslim Association | `daventry-muslim-association-mib-1110` | Bridge Hall, Brook Street, Daventry, NN11 4GG | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Dawat E Islami Shaftesbury | `dawat-e-islami-shaftesbury-way-729248301` | Shaftesbury Street, Newport, NP20 5FA | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 540 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Dawat-e-Islami Masjid | `dawat-e-islami-masjid-mib-1448` | 95 Niddrie Road, Queens Park,Glasgow City, G42 8PR | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 418 m away; no website; no phone number |
| Derby Jamia Mosque | `derby-jamia-mosque-way-58724482` | Village Street, Derby, DE23 8DE | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 897 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Diyanet Mosque | `diyanet-mosque-way-571333587` | Hull, HU3 2NT | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 680 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Elaf Masjid | `elaf-masjid-node-4193826904` | Stockport Rd, Stockport, SK3 0HZ | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Firth Park Mosque | `firth-park-mosque-way-1428079574` | Bevercotes Road, Sheffield, S5 6HB | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 666 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Frank's Uthman Masjid | `frank-s-uthman-masjid-node-13514434319` | Parkside Road, Bexley, DA17 6DA | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Ghousia Islamic Learning Centre | `ghousia-islamic-learning-centre-mib-2660` | 41 St Pauls Road, Sandwell, B66 1EE | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Greenbank Masjid | `greenbank-masjid-way-394676530` | Bristol | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 472 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Hulton Lane Centre for Education | `hulton-lane-centre-for-education-mib-1688` | Hulton Lane Playing Fields, Linnyshaw Close, Daubhill,Bolto… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1123 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Idara Misbah-ul-Qur'an (Int) | `idara-misbah-ul-qur-an-int-mib-209` | 38 Manor Farm Road, Greet,Birmingham, Yardley, B11 2HU | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 662 m away; no website; no phone number |
| Imperial College Union Islamic Society | `imperial-college-union-islamic-society-mib-1238` | The Basement, 10 Princes Gardens, City of Westminster, SW7 … | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1345 m away; no website; no phone number |
| InSpiration multi-faith worship and prayer … | `inspiration-multi-faith-worship-and-prayer-area-mib-537` | Westfield Stratford City shopping centre, Stratford,Newham,… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 687 m away; no website; no phone number |
| Islamic Cultural Educational Centre | `islamic-cultural-educational-centre-mib-208` | 190 Toller Lane, Toller Lane area,Bradford, BD9 5JB | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 425 m away; no website; no phone number |
| Islamic Culture Centre of Tuam | `islamic-culture-centre-of-tuam-mib-372` | 177 Palace Fields, +353, Tuam,Not until 2015 | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1336 m away; no website; no phone number |
| Islamic Society of Edinburgh University | `islamic-society-of-edinburgh-university-mib-760` | Weir Building, Kings Buildings, West Mains Road, City of Ed… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1019 m away; no website; no phone number |
| Jamia Ghausia Mosque & Islamic Centre | `jamia-ghausia-mosque-islamic-centre-mib-2116` | Albion Road, Rochdale, OL11 4HQ | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 691 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Jamia Islamia Razvia Zia-ul-Eiman | `jamia-islamia-razvia-zia-ul-eiman-mib-231` | Reddings Lane, Tyseley ,Birmingham, Yardley, B11 3EY | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 685 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Jumu'ah salaah | `jumu-ah-salaah-mib-12271` | Finsbury Library, 245 St John Street, Angel,Islington, EC1V… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 954 m away; no website; no phone number |
| Jumu'ah salaah | `jumu-ah-salaah-mib-1488` | Quaker Meeting House, St John Street, St Edmundsbury, IP33 … | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 888 m away; no website; no phone number |
| Jumu'ah salaah | `jumu-ah-salaah-mib-1491` | Britwell Youth & Community Project, 80 Wentworth Avenue, Sl… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah salaah | `jumu-ah-salaah-mib-57630150` | Regal Community Centre, 123-127 Ridgefield Road, Southfield… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 482 m away; no website; no phone number |
| Jumu'ah salaah | `jumu-ah-salaah-mib-729` | Edgware Quaker Meeting, Rectory Lane, Edgware,Barnet, HA8 7… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 738 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1214` | Town Hall, High Street, Oxfordshire, OX7 5AB | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1388` | Scout Hut, Oakdene Surgery, 58 Laindon Road, Basildon, CM12… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1595` | Room 4, Samworth Centre, 8 Burton Street, Melton, LE13 1XD | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2016051301` | Friends Meeting House, 50 Railway Street, East Hertfordshir… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2588` | Shiraz Mirza Trust Manor Park Hall, Malden Road, New Malden… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2727` | Rochford Youth & Community Centre, Rochford Gardens, Uxbrid… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 578 m away; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2730` | Citylife House (previously Howard Mallet Centre), corner of… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 822 m away; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2735` | Scout Hut, 500, Basingstoke Road, Reading, RG2 0QN | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1209 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2800` | South Ruislip Community Centre, The Lodge, Deane Park, Long… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2870` | Management Suite, Top Floor, O2 Centre, 255 Finchley Road, … | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1483 m away; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-3085` | 50 Sycamore Avenue, Northumberland, NE66 1DT | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah Salaah organised by Jamiya Masjid a… | `jumu-ah-salaah-organised-by-jamiya-masjid-and-islamic-centre-mib-1088` | hire of Bromley Common Village Hall on Friday, not known, B… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1152 m away; no website; no phone number |
| Kaim Cottage | `kaim-cottage-way-185195879` | Garthdee Road, Aberdeen, AB10 7QB | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Kilkenny Islamic Centre | `kilkenny-islamic-centre-mib-3004` | Desert Villa, Freshford Road, +353, Kilkenny,Not until 2015 | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| King's Buildings Prayer Room | `king-s-buildings-prayer-room-mib-2016042904` | Chaplaincy, Mary Brück Building, Colin MacLaurin Road, Univ… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 839 m away; no website; no phone number |
| Kingswood Masjid | `kingswood-masjid-node-630801815` | Moravian Road, Bristol, BS15 8LR | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| LAF Centre | `laf-centre-mib-15041701` | 179 New Road, Rainham,Havering, RM13 8SH | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| LCB Mosque & Islamic Centre | `lcb-mosque-islamic-centre-mib-1473` | 149a High Street, London Colney,St. Albans, AL2 1RP | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Leeds Metropolitan University SU Islamic So… | `leeds-metropolitan-university-su-islamic-society-mib-930` | 18, Queen Square, Leeds, LS2 8AJ | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 536 m away; no website; no phone number |
| Leeds Metropolitan University SU Islamic So… | `leeds-metropolitan-university-su-islamic-society-mib-933` | The Grange, St Chad's Drive, Headingley Campus, Beckett Par… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Lewisham Way Islamic Centre | `lewisham-way-islamic-centre-mib-1396` | First Floor, 199 Lewisham Way, Lewisham,Lewisham, SE4 1UY | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 565 m away; no website; no phone number |
| Limerick City Centre Masjid | `limerick-city-centre-masjid-mib-3006` | 76 O'Connell Street, Limerick,Not until 2015 | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Limerick Islamic Society | `limerick-islamic-society-mib-1024` | 54 Raheen Gardens, +353, Raheen,Limerick,Not until 2015 | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 737 m away; no website; no phone number |
| London Metropolitan University Islamic Soci… | `london-metropolitan-university-islamic-society-city-campus-mib-1523` | Prayer room (City campus), Level 5, room 512, Calcutta Hous… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 467 m away; no website; no phone number |
| Loughborough Students Union Islamic Society | `loughborough-students-union-islamic-society-mib-1758` | Brockington Building, University of Loughborough, Charnwood… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Lucan mosque | `lucan-mosque-mib-300` | 1 Liffey Road, Lucan,D4 | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Madina Islamic Cultural (Studies) Centre | `madina-islamic-cultural-studies-centre-mib-2138` | 35 Whitworth Road, Rochdale, OL12 0RA | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 510 m away; no website; no phone number |
| Madina Masjid | `madina-masjid-mib-655` | 21-23 Victoria Street, Blackburn with Darwen, BB3 3HB | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid | `masjid-mib-3002` | Ashley House, Dublin Road, PortLaoise,Not until 2015 | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid | `masjid-mib-3003` | 141 Abbeylands, Mullingar,Not until 2015 | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid Al Falah and Islamic Cultural Centre | `masjid-al-falah-and-islamic-cultural-centre-mib-1358` | 58 Caerau Lane, Ely,Caerdydd - Cardiff, CF5 5HQ | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid Darul Arqam | `masjid-darul-arqam-way-460912873` | Condercum Road Back, Newcastle upon Tyne, NE4 8XQ | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid Darul Hijra Alula | `masjid-darul-hijra-alula-mib-1453` | 131 Fairfield Road, Droylsden,Tameside, M43 6AX | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid e Anwaar e Madinah | `masjid-e-anwaar-e-madinah-way-443149108` | St Mark's Road North, Sunderland, SR4 7EG | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 434 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid ibn Taymeeyah | `masjid-ibn-taymeeyah-mib-2299` | Wearmouth Hall, University of Sunderland, Chester Road, Sun… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 447 m away; no website; no phone number |
| Masjid Maryam | `masjid-maryam-way-1410333620` | Green Lane, Middlesbrough, TS5 7RX | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 1947 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid Umar | `masjid-umar-way-235960872` | Burnham Road, Glasgow, G14 0XA | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid-e-Abu Bakr - Billesley | `masjid-e-abu-bakr-billesley-mib-1264` | 713 Yardley Wood Road, Selly Oak,Birmingham, Selly Oak, B13… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Moray House Prayer Room | `moray-house-prayer-room-mib-2016042905` | Moray House School of Education, Paterson's Land, Holyrood … | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 668 m away; no website; no phone number |
| Mosque & Islamic Society | `mosque-islamic-society-mib-2722` | Unit D, Sitecast Industrial Estate, +353, Togher,Cork,Not u… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Multi-Faith and Reflection Centre | `multi-faith-and-reflection-centre-node-5967267948` | Cambridge, CB3 0FT | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Multi-faith room | `multi-faith-room-mib-20` | Selfridges, 400 Oxford Street, City of Westminster, W1A 1AB | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1014 m away; no website; no phone number |
| musallah | `musallah-mib-296` | Royal College of Surgeons, Dublin,D2 | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 404 m away; no website; no phone number |
| musallah | `musallah-mib-297` | Goldsmith Hall, Trinity College Dublin, Dublin,D2 | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1448 m away; no website; no phone number |
| musallah | `musallah-mib-301` | University College Dublin, Belfield,Dublin,D4 | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 959 m away; no website; no phone number |
| Musallah | `musallah-mib-2738` | Quiet Room, Withington Community Hospital, Nell Lane, West … | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 444 m away; no website; no phone number |
| Musallah | `musallah-mib-2849` | Chapel, East Surrey Hospital, Canada Avenue, Earlswood,Reig… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1214 m away; no website; no phone number |
| Muslim Community Centre | `muslim-community-centre-mib-569` | 40 Foxland Road, Gately, Cheadle,Stockport, SK8 4QB | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Muslim Prayer Room | `muslim-prayer-room-mib-1678` | St Luke’s Hospital, Little Horton Lane, Bradford, BD5 0NA | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 429 m away; no website; no phone number |
| Muslim Welfare Association Hartlepool | `muslim-welfare-association-hartlepool-mib-2745` | 94 Milton Road, Hartlepool, TS26 8DS | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 848 m away; no website; no phone number |
| Prayer room | `unnamed-prayer-space-way-129132296` | Dunstan Road, Oxford, OX3 9BY | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Prayer Room | `prayer-room-mib-1021` | Portakabin, Pymmes Building Garden, North Middlesex Hospita… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1173 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-16050103` | Ground Floor, Mile End Hospital, Bancroft Road, Tower Hamle… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 535 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-16050104` | First Floor, Zone 12, Newham General Hospital, Glen Road, N… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 462 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-16050105` | 3rd Floor, Gateway Surgical Centre, Newham General Hospital… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 885 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-16050107` | 1st Floor, Catering Block, St Bartholomew's Hospital, West … | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 739 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-16050108` | Whipps Cross Hospital, Whipps Cross Road, Leytonstone,Walth… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 427 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-1699` | Moto Woolley Edge, M1 Southbound between Junction 38 and 39… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Prayer Room | `prayer-room-mib-17080402` | Ground floor, south wing corridor, Hammersmith Hospital, Du… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 487 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-2001` | Basement, Jenner Wing (i.e, the Medical School), St George'… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 703 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-2599` | Diana Princess of Wales Hospital, Scartho Road, North East … | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1481 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-2602` | Right (south) 10 metres off the foot of the bridge, southbo… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Prayer Room | `prayer-room-mib-2750` | E Block Building 20, University of South Wales, Main Campus… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Prayer Room | `prayer-room-mib-2766` | Baker Building, Birmingham City University, Aldridge Road, … | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 435 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-2867` | Basement Floor, Barnet General Hospital, Wellhouse Lane, Ba… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1109 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-2868` | Royal Free Hospital, 10 Pond Street, Hampstead,Camden, NW3 … | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1086 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-2869` | Ground Floor, Northwick Park Hospital, Watford Road, Harrow… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1682 m away; no website; no phone number |
| Prayer Room | `prayer-room-mib-376` | Stafford Hospital, Weston Road, Littleworth,Stafford, ST16 … | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Prayer Room | `prayer-room-mib-377` | Walsall Manor Hospital, Walsall, WS2 9PS | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 636 m away; no website; no phone number |
| Prince Charles Hospital Mosque | `prince-charles-hospital-mosque-mib-1455` | Prince Charles Hospital, Gurnos,Merthyr Tydfil, CF47 9DT | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| QMC Prayer Room Level 3 | `qmc-prayer-room-level-3-node-4715712714` | Nottingham, NG7 2UH | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 828 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Queensgate Islamic Centre | `queensgate-islamic-centre-mib-2611` | Colne Road, Reedley,Burnley, BB10 1EF | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 935 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Queensway Mosque | `queensway-mosque-mib-3080` | Unit A12, Queensway Market, 23 - 25 Queensway, Bayswater,Ci… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 882 m away; no website; no phone number |
| Quiet Room | `quiet-room-mib-539` | Westfield White City shopping centre, Ariel Way, White City… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 618 m away; no website; no phone number |
| Quiet Space | `quiet-space-mib-2822` | Trafford Shopping Centre, Trafford, M17 8AA | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Rawdhah Academy and Mosque | `rawdhah-academy-and-mosque-mib-1466` | 1 Park Road, Chiltern, HP5 2JE | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 522 m away; no website; no phone number |
| Salahuddin Mosque and Islamic Centre | `salahuddin-mosque-and-islamic-centre-mib-802` | 16 Avenue Street, Glasgow City, G40 3SA | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Seven Sisters Islamic Centre | `seven-sisters-islamic-centre-mib-1571` | 41 Suffield Road, Tottenham,Haringey, N15 5JX | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 558 m away; no website; no phone number |
| Sevenoaks Muslim Centre | `sevenoaks-muslim-centre-way-1448486011` | St John’s Road, Sevenoaks, TN13 3LR | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Slough School for Arabic & Islamic Studies | `slough-school-for-arabic-islamic-studies-mib-16062302` | 5 Church Street, Slough, SL1 1PQ | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1210 m away; no website; no phone number |
| South Manchester Muslim Community Associati… | `south-manchester-muslim-community-association-mib-1465` | Weybrook Road, Heaton Chapel,Stockport, M19 2QD | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1404 m away; no website; no phone number |
| Springbank Mosque | `springbank-mosque-way-702400789` | Hull, HU3 1AG | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 549 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Tees Valley Muslim Community Centre | `tees-valley-muslim-community-centre-way-370689714` | Sopwith Close, Stockton-on-Tees, TS18 3TT | 2 | 0 | single source only (OSM); nearest independent OSM prayer space is 1258 m away; no website; no phone number; address is a bare street name, no house number or named premises |
| Tewkesbury Islamic Society | `tewkesbury-islamic-society-mib-1691` | Tewkesbury C of E Primary & Pre School Community Centre, Ch… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| UCLan Islamic Society | `uclan-islamic-society-mib-1331` | Multi-Faith Centre, 36 St Peter's Square, Preston, PR1 7BX | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 582 m away; no website; no phone number |
| University of Bath Islamic Society | `university-of-bath-islamic-society-mib-43` | Norwood House, Convocation Avenue, Bath and North East Some… | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| University of Hertfordshire Islamic Society | `university-of-hertfordshire-islamic-society-mib-839` | University of Hertfordshire, College Lane,Welwyn Hatfield, … | 2 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| University of Leicester Islamic Society | `university-of-leicester-islamic-society-mib-1009` | Percy Gee Building, University Road, City of Leicester, LE1… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 581 m away; no website; no phone number |
| University of Oxford Islamic Society | `university-of-oxford-islamic-society-mib-2052` | c/o Hassan Malik, Pembroke College, Oxford, OX1 1DW | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 929 m away; no website; no phone number |
| University of Portsmouth Islamic Society | `university-of-portsmouth-islamic-society-mib-2071` | Wiltshire Building, Hampshire Terrace and variously 1.10 (G… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1293 m away; no website; no phone number |
| University of York Islamic Society | `university-of-york-islamic-society-mib-2743` | University Chaplaincy, Room W029, Wentworth College, Wentwo… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1234 m away; no website; no phone number |
| Vibast Community Centre | `vibast-community-centre-mib-2635` | 163 Old Street, Islington, EC1V 9NH | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 827 m away; no website; no phone number |
| Weavers Fields Muslim Prayer Hall | `weavers-fields-muslim-prayer-hall-mib-17080308` | 3a Railway Arches, Brady Street, Bethnal Green,Tower Hamlet… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 537 m away; no website; no phone number |
| Woodford Muslim Cultural Centre | `woodford-muslim-cultural-centre-mib-1449` | 114-116 Snakes Lane East, Woodford Green, Redbridge,Redbrid… | 2 | 0 | single source only (MIB); nearest independent OSM prayer space is 1798 m away; no website; no phone number |
| Zain Abiya | `zain-abiya-way-120199562` | Reading | 2 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number; address is a bare street name, no house number or named premises |
| Al Abrar Academy Masjid | `al-abrar-academy-masjid-way-1427976307` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Al Khair Musallah | `al-khair-musallah-mib-1108` | 109-117 Cherry Orchard Road, Croydon,Croydon, CR0 6BE | 2 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; musalla in ordinary premises (rented/shared rooms come and go) |
| Al-Amin Masjid | `al-amin-masjid-way-616095449` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Al-Aqsa School Masjid | `al-aqsa-school-masjid-mib-2428` | The Wayne Way, North Evington,City of Leicester, LE5 4PP | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 425 m away; no website; address is a bare street name, no house number or named premises |
| Al-Mustaqeem Centre | `al-mustaqeem-centre-way-1524412540` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Al-Shafeey Centre | `al-shafeey-centre-way-1428085353` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| As Sabr | `as-sabr-node-8938826920` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Berkeley Street Musallah | `berkeley-street-musallah-mib-1600` | Basement of Shah Noor Restaurant, 73 Berkeley Street, Woods… | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 732 m away; no website; musalla in ordinary premises (rented/shared rooms come and go) |
| Bradford Islamic Centre | `bradford-islamic-centre-way-1428000084` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Chesterfield Jamia Mosque Education & Welfa… | `chesterfield-jamia-mosque-education-welfare-trust-mib-2816` | Portacabin A, Barker Lane, Chesterfield, S40 1DY | 2 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Faith Room | `faith-room-mib-215` | Natural History Museum, Cromwell Road, South Kensington,Ken… | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 1057 m away; no website; address is a bare street name, no house number or named premises |
| Faiz e Raza | `faiz-e-raza-way-1279017860` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Faizan e Madina | `faizan-e-madina-way-1428165477` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Faizan e Madinah | `faizan-e-madinah-node-13129929764` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Faizan E Madinah | `faizan-e-madinah-way-385304637` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Faizan e Makkah Masjid | `faizan-e-makkah-masjid-way-1428002130` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Faizan-e-Madina | `faizan-e-madina-node-13129750366` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Faizan-e-Madinah | `faizan-e-madinah-node-13129990702` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Huddersfield University Islamic Society | `huddersfield-university-islamic-society-mib-870` | University of Huddersfield Students' Union, Queensgate, Kir… | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 727 m away; no website; address is a bare street name, no house number or named premises |
| Idara Fezan Ul Quran | `idara-fezan-ul-quran-mib-769` | Farmcote Road, Stechford,Birmingham, Hodge Hill, B33 9LU | 2 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Indonesian Islamic Centre | `indonesian-islamic-centre-node-12830228966` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Islamic Information Centre | `islamic-information-centre-mib-302` | Camden Street, Dublin,D2 | 2 | 1 | single source only (MIB); no website; no phone number; address is a bare street name, no house number or named premises |
| Islamic Society | `islamic-society-mib-430` | Carlton Prayer Room, University of Bradford, University,Bra… | 2 | 1 | single source only (MIB); no website; no phone number; address is a bare street name, no house number or named premises |
| Islamic Society of Lancaster University | `islamic-society-of-lancaster-university-mib-908` | Lancaster University Islamic Society, Lancaster University … | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 523 m away; no website; address is a bare street name, no house number or named premises |
| Islamic Society of the University of the We… | `islamic-society-of-the-university-of-the-west-of-england-mib-512` | Islamic Society, Room 4E13, The University of the West of E… | 2 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Jami al-Imam Ahmed Raza Khan Barelwi | `jami-al-imam-ahmed-raza-khan-barelwi-node-13129934750` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Jamia Abu Hanifa Mosque | `jamia-abu-hanifa-mosque-way-1427941928` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Jamia Dar Ul Uloom Qadiria Jillania Centre | `jamia-dar-ul-uloom-qadiria-jillania-centre-way-123528135` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Jamia Muhammadiyah Qadriyah | `jamia-muhammadiyah-qadriyah-way-1427934326` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Jemia Mosque | `jemia-mosque-way-226613539` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Juma Jamat Mosque | `juma-jamat-mosque-way-258406537` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1621` | Jack Carter Pavillion, Oakfield Playing Fields, Fencepiece … | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 1836 m away; no website; address is a bare street name, no house number or named premises |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-516` | University of Bristol Union, Queens Road, Clifton,City of B… | 2 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Jumu'ah Salaah and Dhuhar salaah | `jumu-ah-salaah-and-dhuhar-salaah-mib-1218` | Sir Ralph Perring Room, Golden Lane Sport & Fitness, Fann S… | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 1164 m away; no website; address is a bare street name, no house number or named premises |
| Madina Education Trust | `madina-education-trust-way-372940812` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Madrasa-Tul-Binnat-taleem-Ul-Islam | `madrasa-tul-binnat-taleem-ul-islam-mib-340` | 576a Coventry Road, Small Heath,Birmingham, Hodge Hill, B10… | 2 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Madrasah Abdullah Bin Masood | `madrasah-abdullah-bin-masood-way-1428000520` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Madrasah Ghosia | `madrasah-ghosia-way-1428227246` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Madrasatul Imam Muhammad Zakariya | `madrasatul-imam-muhammad-zakariya-way-712902936` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Markaz Al-Takwa | `markaz-al-takwa-node-12133584181` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Masjid Al-Khazra | `masjid-al-khazra-mib-1044` | Leen Place, St Peters Street, City of Nottingham, NG7 3EN | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 494 m away; no website; address is a bare street name, no house number or named premises |
| Masjid Al-Salam | `masjid-al-salam-way-1428083674` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Masjid Ilyas | `masjid-ilyas-mib-1751` | Whitby Road, Slough, SL1 3DW | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 697 m away; no website; address is a bare street name, no house number or named premises |
| Masjid Iman | `masjid-iman-way-1428226747` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Masjid Nur | `masjid-nur-way-436696443` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Masjid Omar Mukhtar | `masjid-omar-mukhtar-way-1311059305` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Masjid Yousuf | `masjid-yousuf-way-144357797` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Masjid-e-Jinnah | `masjid-e-jinnah-mib-2861` | Mexborough Grove, Leeds, LS7 3DZ | 2 | 1 | single source only (MIB); no website; no phone number; address is a bare street name, no house number or named premises |
| Masjidur Raashideen | `masjidur-raashideen-way-393878795` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Mazhar E-Islam Ghousia | `mazhar-e-islam-ghousia-way-1427954643` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Musallaa An-Noor | `musallaa-an-noor-mib-2633` | 101 Stoke Newington High Street, Hackney, N16 0PH | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 504 m away; no website; musalla in ordinary premises (rented/shared rooms come and go) |
| Musallah | `musallah-mib-1443` | Selera Malaysia Bistro, 19 Correction Wynd, Aberdeen City, … | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 426 m away; no website; musalla in ordinary premises (rented/shared rooms come and go) |
| Musallah | `musallah-mib-3008` | Dwelling House, Kilirisk Road, Fortfield,Tralee,Not until 2… | 2 | 1 | single source only (MIB); no website; no phone number; musalla in ordinary premises (rented/shared rooms come and go) |
| Musallah | `musallah-mib-762` | 2nd floor, Qasida Turkish Restaurant, 96 Whitechapel High S… | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 430 m away; no website; musalla in ordinary premises (rented/shared rooms come and go) |
| Muslim Community Centre | `muslim-community-centre-mib-2580` | Clare Hill, Kirklees, HD1 5BS | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 476 m away; no website; address is a bare street name, no house number or named premises |
| Muslim Prayer Room | `muslim-prayer-room-mib-2513` | Mansefield, 3 St Mary's Place, St Andrews,Fife, KY16 9UY | 2 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; musalla in ordinary premises (rented/shared rooms come and go) |
| New Abu Bakr Mosque | `new-abu-bakr-mosque-node-13128419079` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Prayer room | `prayer-room-mib-2734` | Rochdale Infirmary, Whitehall Street, Rochdale, OL12 0NB | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 666 m away; no website; address is a bare street name, no house number or named premises |
| Prayer room | `unnamed-prayer-space-node-10925674692` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Prayer Room | `prayer-room-mib-1101` | Leicester Royal Infirmary, Infirmary Square,, City of Leice… | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 523 m away; no website; address is a bare street name, no house number or named premises |
| Prayer Room | `prayer-room-mib-16` | Middlesex University Students Union, Hendon Campus, Middles… | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 1520 m away; no website; address is a bare street name, no house number or named premises |
| Sandwell Grand Masjid | `sandwell-grand-masjid-way-1319633968` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Sheffield Grand Mosque | `sheffield-grand-mosque-way-629211580` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Temporary location of Al-Rahma Islamic Cent… | `temporary-location-of-al-rahma-islamic-centre-mib-1495` | East Finchley Library, 126 Finchley Road, Finchley,Barnet, … | 2 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; MIB flags it as an irregular / part-time venue |
| temporary musallah for Maidstone Community … | `temporary-musallah-for-maidstone-community-and-islamic-centr-mib-1648` | 24 Lower Stone Street, Maidstone, ME15 6LX | 2 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; musalla in ordinary premises (rented/shared rooms come and go) |
| The Place of Quiet | `the-place-of-quiet-mib-2784` | Lower Rose Gallery, Bluewater, Greenhithe,Dartford, DA9 9ST | 2 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Umm ul Qura Islamic Centre | `umm-ul-qura-islamic-centre-way-1427955247` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Winchester Muslim Cultural Association | `winchester-muslim-cultural-association-mib-2392` | Winchester Guildhall, Broadway, High Street, Winchester, SO… | 2 | 1 | single source only (MIB); nearest independent OSM prayer space is 943 m away; no website; address is a bare street name, no house number or named premises |
| Yorkshire Muslim Academy | `yorkshire-muslim-academy-way-116536722` | Address not recorded yet | 2 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Abington Jame Masjid | `abington-jame-masjid-mib-721` | 49 Stimpson Avenue, Abington,Northampton, NN1 4LR | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 438 m away; no website; no phone number |
| Ad Duha Institute | `ad-duha-institute-way-167976345` | 1164 Stratford Road, Birmingham, B28 8AF | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 1321 m away; no website; no phone number |
| Al-Madinah Muslim Community Centre | `al-madinah-muslim-community-centre-way-119569263` | 58 Sandy Lane, Norwich, NR1 2NR | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Al-Majid Centre | `al-majid-centre-node-13909896301` | 215 Northumberland Avenue | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 1734 m away; no website; no phone number |
| Al-Tawheed Mosque | `al-tawheed-mosque-way-80249100` | 179 Braidfauld Street, Glasgow, G32 8PJ | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Anwar-e-Madina Islamic Centre | `anwar-e-madina-islamic-centre-mib-295` | 8-9 Talbot Street, Dublin,D1 | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 617 m away; no website; no phone number |
| Ar-Rahaman Community Centre | `ar-rahaman-community-centre-mib-1476` | 22 Ladbrooke Road, Slough, SL1 2SR | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Aylesbury Vale Islamic Centre | `aylesbury-vale-islamic-centre-mib-1689` | Matrix House, 10 Chamberlain Road, Aylesbury Vale, HP19 8DY | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 1408 m away; no website; no phone number |
| Bilal Masjid | `bilal-masjid-mib-504` | 39 Dunraven Street, none, Tondu, Aberkenfig ,Pen-y-bont ar … | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Bourneville Masjid & Community Centre | `bourneville-masjid-community-centre-mib-1743` | 122 Cob Lane, Bournville,Birmingham, Selly Oak, B30 1QD | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| British Estate Islamic Education Centre | `british-estate-islamic-education-centre-mib-1514` | 31 Merchant Street, not known, Tower Hamlets, E3 4LX | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 851 m away; no website; no phone number |
| Broughty Ferry Mosque | `broughty-ferry-mosque-way-1157727092` | 42 Strathern Road, Dundee, DD5 1PN | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Charlton Mosque | `charlton-mosque-mib-1144` | 30-32 Ransom Road, none, Charlton,Greenwich, SE7 8SR | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Coventry Muslim Swahili Association | `coventry-muslim-swahili-association-mib-1472` | 88 Paynes Lane, Coventry, CV1 5LJ | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 928 m away; no website; no phone number |
| Darul Ihsaan | `darul-ihsaan-node-190396731` | 1 Gervas Road, Leicester, LE5 2EP | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 814 m away; no website; no phone number |
| Darul Uloom Samiah Arabiah Islamiah | `darul-uloom-samiah-arabiah-islamiah-mib-168` | 221-223 Cotterills Lane, Alum Rock,Birmingham, Hodge Hill, … | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 543 m away; no website; no phone number |
| Denbigh Mosque | `denbigh-mosque-node-13160159368` | 10 Hall Square, Denbigh, LL16 3NU | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Dover Masjid | `dover-masjid-way-70931702` | 6 Park Place, Dover, CT16 1DQ | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| East Kilbride Mosque | `east-kilbride-mosque-mib-1594` | 2c Alison Lea, South Lanarkshire, G74 3HW | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Ellesmere Port Masjid & Islamic Centre | `ellesmere-port-masjid-islamic-centre-way-326269689` | 82-84 Station Road, Ellesmere Port, CH65 4BH | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Faizan-e-Madina Lincoln Islamic Centre & Mo… | `faizan-e-madina-lincoln-islamic-centre-mosque-way-324799887` | 2 Proctors Road, Lincoln, LN2 4LA | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Faizan-E-Madinah | `faizan-e-madinah-way-631336714` | 577-579 Fishponds Road, Bristol | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 652 m away; no website; no phone number |
| Glasgow Mena Trust | `glasgow-mena-trust-mib-18032502` | 83-85 Lister Street, Townhead,Glasgow, G4 0BZ | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 1746 m away; no website; no phone number |
| Green Dome Mosque | `green-dome-mosque-way-273916864` | 6 Canmore Street, Dunfermline, KY12 7PX | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Green Oak Academy (Kings Heath) | `green-oak-academy-kings-heath-way-277030928` | 240 Alcester Road South, Birmingham, B14 6DR | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 1524 m away; no website; no phone number |
| Grimesthorpe Academy | `grimesthorpe-academy-way-121084113` | 191 Grimesthorpe Road, Sheffield, S4 7EU | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 565 m away; no website; no phone number |
| Hanwell Masjid | `hanwell-masjid-mib-1065` | 9 Boston Road, Hanwell,Ealing, W7 3SJ | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 829 m away; no website; no phone number |
| High Barnet Islamic Centre | `high-barnet-islamic-centre-node-13478914593` | 1 Bath Place, Barnet, EN5 5XA | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Iqra Learning Centre | `iqra-learning-centre-mib-711` | ILC Darnley, West Hurlet House, Glasgow Road, not known, Ba… | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Iqraa Ethiopian Muslim Centre | `iqraa-ethiopian-muslim-centre-node-12169889359` | 60 Craven Park Road, London, NW10 4AE | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Islamic Cultural Centre | `islamic-cultural-centre-mib-1824` | St David's Church, Grove Lane, Altrincham,Trafford, WA15 8JG | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jame Masjid Ghausia | `jame-masjid-ghausia-mib-548` | 19-24 Princess Street and 28-30 Princess Street, not known,… | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jami Masjid | `jami-masjid-way-228486383` | 24 Gladstone Street, Nottingham, NG7 6GA | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 519 m away; no website; no phone number |
| Jamia Anwar-ul-Quran Education Centre Lye | `jamia-anwar-ul-quran-education-centre-lye-mib-2298` | 3-4 Talbot Street, Lye,Dudley, DY9 8UF | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jamia Masjid St Ives Mosque | `jamia-masjid-st-ives-mosque-node-552455084` | 22 Needingworth Road, St Ives | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Jamiat-ul-Muslimeen Jamia Masjid | `jamiat-ul-muslimeen-jamia-masjid-mib-2363` | 19-21 Arpley Street, n/a, Warrington, WA1 1LX | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 1406 m away; no website; no phone number |
| Jumu'ah salaah | `jumu-ah-salaah-mib-713` | Guildford United Reformed Church, 83 Portsmouth Road, Guild… | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 1318 m away; no website; no phone number |
| Jumu'ah salaah | `jumu-ah-salaah-mib-952` | Kindle Centre, Belmont Road, County of Herefordshire, HR2 7… | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah salaah | `jumu-ah-salaah-mib-966` | Gossops Green Community Centre, Kidborough Road, Gossops Gr… | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1019` | Petts Wood Memorial Hall, 200 Petts Wood Road, Petts Wood, … | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-14051003` | Netball hall, Brunel University, Kingston Lane, Uxbridge,Hi… | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 1145 m away; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1559` | The Friendship Club, Oxford Road North, Chiswick,Hounslow, … | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 1789 m away; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1620` | IRDSA Hall, Craven Gardens, Fullwell, Barkingside,Redbridge… | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 1354 m away; no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-782` | St Johns Community Centre and Social Club, 37-43 Glengall G… | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 652 m away; no website; no phone number |
| Jumu'ah salaah for City University Islaamic… | `jumu-ah-salaah-for-city-university-islaamic-society-mib-12270` | Tompion Community Hall, 40 Percival Street, Angel,Islington… | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 1001 m away; no website; no phone number |
| Jumu'ah salaah for UCLan Islamic Society | `jumu-ah-salaah-for-uclan-islamic-society-mib-1330` | Sir Tom Finney Sports Centre, Marsh Lane, Preston, PR1 2HE | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 794 m away; no website; no phone number |
| Madina Foundation Dagenham East Islamic Cen… | `madina-foundation-dagenham-east-islamic-centre-way-122868372` | 539 Rainham Road South, Dagenham, RM10 7XJ | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Markazi Jamia Ghausia Mosque | `markazi-jamia-ghausia-mosque-mib-2293` | 191 Waterloo Road, Cobridge,City of Stoke-on-Trent, ST6 2HJ | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid | `masjid-mib-2785` | 79 Wellesley Road, not known, Methil,Fife, KY8 3AD | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid Abubakr | `masjid-abubakr-mib-1087` | 555 Lees Hall Road, Thornton Lees,Kirklees, WF12 9EN | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 460 m away; no website; no phone number |
| Masjid Adam Mosque | `masjid-adam-mosque-way-715874107` | 2 Broadgate, Bolton, BL3 4PZ | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid Ali Murtaza | `masjid-ali-murtaza-mib-2732` | 3 Talbot Street, Burnley, BB11 2RZ | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 857 m away; no website; no phone number |
| Masjid Ar Rahman SCT | `masjid-ar-rahman-sct-way-180756469` | 4-6 Abbots Avenue, St Albans, AL1 2HX | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid As-Sahabah | `masjid-as-sahabah-mib-1336` | 15 Epworth Street, City of Kingston upon Hull, HU5 1AW | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 427 m away; no website; no phone number |
| Masjid at Tawheed | `masjid-at-tawheed-mib-3193` | Onward Chambers, 1 Onward Street, Hyde,Tameside, SK14 1HW | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Masjid Taha | `masjid-taha-way-107024172` | 6-7 Park Lane, London | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 965 m away; no website; no phone number |
| Masjid Tawfiq | `masjid-tawfiq-mib-503` | 116 Broad Street, Foleshill,Coventry, CV6 5BG | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 653 m away; no website; no phone number |
| Masjid Taybah | `masjid-taybah-way-103021050` | 12 Victory Road, Nottingham, NG9 1LH | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 986 m away; no website; no phone number |
| Masjid-e-Quwwatul Islam | `masjid-e-quwwatul-islam-mib-358` | 84-86 Stansfield Street, Blackburn with Darwen, BB2 2NG | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 657 m away; no website; no phone number |
| Medina Mosque | `medina-mosque-mib-222` | 7 Park Avenue, not known, Hockley,Birmingham, Ladywood, B18… | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 695 m away; no website; no phone number |
| Menzil Trust Masjid | `menzil-trust-masjid-way-695630024` | 500 High Road Leyton, London, E10 6RL | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 556 m away; no website; no phone number |
| MM-UK Islamic Centre | `mm-uk-islamic-centre-mib-1693` | 75-77 Whitehorse Road, Croydon,Croydon, CR0 2JJ | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 473 m away; no website; no phone number |
| MTO Shahmaghsoudi | `mto-shahmaghsoudi-way-183069320` | 23 Edison Road, London, N8 8AE | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 1260 m away; no website; no phone number |
| Multi-Faith Chaplaincy | `multi-faith-chaplaincy-way-327065335` | 25 High Street, Aberdeen | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 1240 m away; no website; no phone number |
| Muslim Community Mosque | `muslim-community-mosque-way-912392832` | 130 Lower Church Road, Burgess Hill, RH15 9AB | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Naqshbandia Aslamiyya Spiritual Centre | `naqshbandia-aslamiyya-spiritual-centre-mib-351` | 78 Pringle Street, Blackburn with Darwen, BB1 1SA | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 423 m away; no website; no phone number |
| Nimab Trust Mosque | `nimab-trust-mosque-way-81176724` | Duddeston Mill Road, Birmingham, B7 4QN | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 801 m away; no website; no phone number |
| NMC Centre & Masjid | `nmc-centre-masjid-way-320881256` | 6 Church Road, Northwich, CW9 5NT | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Norbury Muslim Centre | `norbury-muslim-centre-mib-2812` | 1116 London Road, Norbury,Croydon, SW16 4DT | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 1060 m away; no website; no phone number |
| North Nottinghamshire Muslim Welfare Associ… | `north-nottinghamshire-muslim-welfare-association-mib-1556` | 36 Bancroft Lane, Mansfield, NG18 5LQ | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| North Tyneside Bangladeshi Community Associ… | `north-tyneside-bangladeshi-community-association-mosque-node-7638240544` | 6 | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 1137 m away; no website; no phone number |
| Paisley Muslim Community Centre | `paisley-muslim-community-centre-mib-72` | 22 Wellmeadow Street, Renfrewshire, PA1 2EE | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Pakistan Islamic Centre | `pakistan-islamic-centre-mib-2149` | 16-18 Peter Street, not known, Rawtenstall,Rossendale, BB4 … | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 676 m away; no website; no phone number |
| Peacehaven Mosque | `peacehaven-mosque-way-1287258792` | 8 Phyllis Avenue, Peacehaven, BN10 7HY | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| Perth Mosque | `perth-mosque-node-12556162026` | 37 St Catherine's Road, Perth, PH1 5YA | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 533 m away; no website; no phone number |
| Portsmouth Hafiziah Madrasah | `portsmouth-hafiziah-madrasah-way-430150560` | 73,75 Marmion Road, Southsea, PO5 2AX | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 991 m away; no website; no phone number |
| Salaam Community Centre | `salaam-community-centre-mib-2747` | St Paul's Hall, Murray Street, Hartlepool, TS26 8PE | 3 | 0 | single source only (MIB); nearest independent OSM prayer space is 796 m away; no website; no phone number |
| Shahporan | `shahporan-way-648513199` | 382 Filton Avenue, Bristol, BS7 0BE | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| The Eden Centre | `the-eden-centre-way-1428234908` | 35 Dryclough Road, Huddersfield, HD4 5HY | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 879 m away; no website; no phone number |
| The Sanctuary | `the-sanctuary-node-5816298510` | 30 | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| United Muslim Masjid | `united-muslim-masjid-mib-2168` | 29 Gilliat Street, North Lincolnshire, DN15 6EY | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Walworth Road Mosque | `walworth-road-mosque-node-13437720452` | 175A Walworth Road | 3 | 0 | single source only (OSM); nearest independent OSM prayer space is 844 m away; no website; no phone number |
| West Dunbartonshire Muslim Education Society | `west-dunbartonshire-muslim-education-society-mib-1602` | Victoria Institute, Lennox Street, Renton,West Dunbartonshi… | 3 | 0 | single source only (MIB); no independent OSM prayer space within 400 m; no website; no phone number |
| Wirral Deen Centre | `wirral-deen-centre-way-254523652` | 371-375 Borough Road, Birkenhead | 3 | 0 | single source only (OSM); no independent OSM prayer space within 400 m; no website; no phone number |
| AII Voice | `aii-voice-mib-1680` | Jubilee Community Hall, Tulse Hill Estate (behind Medora Ro… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 579 m away; no website |
| Al Huda Mosque | `al-huda-mosque-mib-1232` | 76 Golborne Road, Kensington,Kensington and Chelsea, W10 5PS | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 763 m away; no website |
| Al Markaz As Salafi Islamic Centre | `al-markaz-as-salafi-islamic-centre-mib-15023855` | 107 Moira Street, Charnwood, LE11 1AU | 3 | 1 | single source only (MIB); no website; no phone number |
| Al-Farooq Islamic Teaching & Community Cent… | `al-farooq-islamic-teaching-community-centre-mib-241` | 130 Station Road, Handsworth,Birmingham, Ladywood, B21 0EX | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 474 m away; no website |
| Al-Hidaayah Foundation | `al-hidaayah-foundation-way-1428232940` | BD21 1AA | 3 | 1 | single source only (OSM); no website; no phone number; address is a bare street name, no house number or named premises |
| Al-Hira Educational Centre & Mosque | `al-hira-educational-centre-mosque-mib-2664` | 1209-1211 Stratford Road, Hall Green,Birmingham, Hall Green… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 518 m away; no website |
| Al-Ikhlas | `al-ikhlas-mib-17080303` | 25 Chapel Brow, South Ribble, PR25 3NH | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Al-Jamiah Al-Islamiyah | `al-jamiah-al-islamiyah-mib-186` | Mount St Joseph's Convent, Willows Lane, Deane,Bolton, BL3 … | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 703 m away; no website; address is a bare street name, no house number or named premises |
| Al-Kauthar Mosque | `al-kauthar-mosque-mib-904` | Ashton Road, Lancaster, LA1 5AJ | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 634 m away; no website; address is a bare street name, no house number or named premises |
| As-Salam Centre | `as-salam-centre-mib-1076` | 14 Moss Road, Stretford,Trafford, M32 0AH | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Ashaadibi Masjid and Cultural Centre | `ashaadibi-masjid-and-cultural-centre-mib-746` | 167 Canon Street Road, Bethnal Green,Tower Hamlets, E1 2LX | 3 | 1 | single source only (MIB); no website; no phone number |
| Ashton Jame' Mosque & Islamic Centre | `ashton-jame-mosque-islamic-centre-mib-2719` | 243 Cavendish Street, Tameside, OL6 7DS | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 495 m away; no website |
| Aysha Siddique Muslim Community Centre And … | `aysha-siddique-muslim-community-centre-and-prayers-room-mib-1582` | 9 Queen Street, Earlestown,St. Helens, WA12 9AS | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Azhar Academy | `azhar-academy-mib-3713` | 20 Devonshire Road, Bolton, BL1 4PG | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 866 m away; no website |
| Bait ul-Huda Jame Masjid | `bait-ul-huda-jame-masjid-mib-2598` | Rear of 43 or of 51, Market Street, North East Lincolnshire… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Balgreen Mosque and Turkish Community Centre | `balgreen-mosque-and-turkish-community-centre-mib-1281` | 199-201 Balgreen Road, Balgreen,City of Edinburgh, EH11 2RZ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Bangladesh Islamic Community Centre | `bangladesh-islamic-community-centre-mib-191` | 24 Greenwell Street, Ards and North Down, BT23 7LN | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Bangladeshi Sunni Mosque | `bangladeshi-sunni-mosque-mib-2172` | 107 West Street, North Lincolnshire, DN15 6EQ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Barnoldswick Learning & Cultural Trust | `barnoldswick-learning-cultural-trust-mib-1195` | 45 Rainhall Road, Pendle, BB18 6AA | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Bismillah Cultural Centre | `bismillah-cultural-centre-mib-2682` | 1370c London Road, Norbury,Croydon, SW16 4DE | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1852 m away; no website |
| Borehamwood Islamic Society | `borehamwood-islamic-society-mib-46` | 160 Aycliffe Road, Hertsmere, WD6 4EG | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Bournemouth Câmii | `bournemouth-c-acirc-mii-mib-1185` | 20 St Michael's Road, Bournemouth, BH2 5DX | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 471 m away; no website |
| Bristol Turkish Community BSW | `bristol-turkish-community-bsw-mib-2794` | 272a Gloucester Road, Horfield, Bishopston,City of Bristol,… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1628 m away; no website |
| Bromley Islamic Centre | `bromley-islamic-centre-mib-1707` | 1st floor 94 High Street, Bromley,Bromley, BR1 1EY | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| BWA Muslim Cultural Centre and Mosque | `bwa-muslim-cultural-centre-and-mosque-mib-1320` | 10a Clifton Rise, none working, New Cross,Lewisham, SE14 6JP | 3 | 1 | single source only (MIB); no website; no phone number |
| Cambridge University Islamic Society's Jumu… | `cambridge-university-islamic-society-s-jumu-ah-venue-mib-2490` | Bowett Room, Queens College, Silver Street, Cambridge, CB3 … | 3 | 1 | single source only (MIB); no website; no phone number |
| Canary Wharf Multi-faith Prayer Room | `canary-wharf-multifaith` | Jubilee Place, London E14 5NY | 3 | 1 | hand-entered seed row, no dataset provenance; no website; no phone number; address is a bare street name, no house number or named premises |
| Caribbean Islamic Cultural Society | `caribbean-islamic-cultural-society-mib-1502` | 98 Horsenden Lane South, Perivale, Greenford,Ealing, UB6 7NN | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Castlepoint Jame Mosque | `castlepoint-jame-mosque-mib-1075` | 1a Grafton Road, Castle Point,Castle Point, SS8 7BT | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Cavendish Prayer Rooms | `cavendish-prayer-rooms-node-11765933362` | Cavendish Street, Manchester, M15 6BG | 3 | 1 | single source only (OSM); no website; no phone number; address is a bare street name, no house number or named premises |
| Cemetery Lodge Prayer Room | `cemetery-lodge-prayer-room-way-517328320` | Leeds, LS2 9JT | 3 | 1 | single source only (OSM); nearest independent OSM prayer space is 630 m away; no phone number; address is a bare street name, no house number or named premises; musalla in ordinary premises (rented/shared rooms come and go) |
| Chapel | `chapel-mib-1518` | Addenbrooke's Hospital, Hill's Road, Cambridge, CB2 0QQ | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 761 m away; no website |
| Chaplaincy | `chaplaincy-mib-2824` | Terminal 2 Arrivals, Manchester Airport, Manchester, M90 1QX | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Chaplaincy | `chaplaincy-node-4971912746` | Address not recorded yet | 3 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Chashma-e-Rahat Mosque | `chashma-e-rahat-mosque-mib-218` | Oldbury Road, Sandwell, B66 1NN | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1246 m away; no website; address is a bare street name, no house number or named premises |
| Chelsea Muslim Community | `chelsea-muslim-community-mib-15042204` | 14 Blantyre Street, Chelsea,Kensington and Chelsea, SW10 0DS | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1438 m away; no website |
| Clayhall Islamic Centre | `clayhall-islamic-centre-node-14019871418` | Heathcote Avenue, Ilford, IG5 0QS | 3 | 1 | single source only (OSM); no website; no phone number; address is a bare street name, no house number or named premises |
| Clitheroe Masjid | `clitheroe-masjid-mib-2767` | Mount Vale, Lowergate, Ribble Valley, BB7 1AG | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Contemplation Room | `contemplation-room-mib-863` | adjacent Unit 55, Bicester Village, 50 Pingle Drive, Cherwe… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Dar Ul Uloom Tajdar-e-Madina Islamic and Cu… | `dar-ul-uloom-tajdar-e-madina-islamic-and-cultural-educationa-mib-285` | 160 Stratford Road, Sparkbrook,Birmingham, Hall Green, B11 … | 3 | 1 | single source only (MIB); no website; no phone number |
| Dar-ul-Uloom Madani (No | `dar-ul-uloom-madani-no-mib-828` | 4), 2 Mayfield Terrace South, King Cross,Calderdale, HX1 3LG | 3 | 1 | single source only (MIB); no website; no phone number |
| Daraloom Jamia Rahima Karima & Education Cu… | `daraloom-jamia-rahima-karima-education-culture-centre-mib-2022` | 17 Queens Road, Oldham, OL8 2AX | 3 | 1 | single source only (MIB); no website; no phone number |
| Darbar Unique Centre | `darbar-unique-centre-mib-2291` | Oldfield Street, Fenton,City of Stoke-on-Trent, ST4 3PG | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Darul Quran Islamic Centre | `darul-quran-islamic-centre-mib-2769` | 218 Paisley Road, Renfrew,Renfrewshire, PA4 8AA | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Darul Taclim Educational and Cultural Centre | `darul-taclim-educational-and-cultural-centre-mib-1082` | 106 High Road, Willesden Green,Brent, NW10 2PP | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 611 m away; no website |
| Darus Sunnah Islamic Foundation | `darus-sunnah-islamic-foundation-mib-1652` | 53 Church Vale, Handsworth Wood,Birmingham, Perry Barr, B20… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 916 m away; no website |
| Dawatul-Islam Mosque | `dawatul-islam-mosque-mib-792` | 31 Oakfield Avenue, Hillhead,Glasgow City, G12 8LL | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 451 m away; no website |
| Dorset Community Mosque | `dorset-community-mosque-mib-17080305` | former Dorset Social Club, Diss Street, Hoxton,Tower Hamlet… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 633 m away; no website |
| Dorset County Hospital Chapel Prayer room | `dorset-county-hospital-chapel-prayer-room-mib-235` | Level 3 of the South Wing, Dorset County Hospital, Williams… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Edgware Islamic Cultural Trust | `edgware-islamic-cultural-trust-mib-304` | 82 Chandos Crescent, Edgware,Harrow, HA8 6HL | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 792 m away; no website |
| Education Centre Madni No.3 | `education-centre-madni-no-3-mib-831` | 229 Pellon Lane, Calderdale, HX1 4PZ | 3 | 1 | single source only (MIB); no website; no phone number |
| Faith Centre | `faith-centre-way-653266379` | Peterborough, PE3 9GZ | 3 | 1 | single source only (OSM); no website; no phone number; address is a bare street name, no house number or named premises |
| Faizan E Madina Jamia Masjid | `faizan-e-madina-jamia-masjid-way-1428145312` | Address not recorded yet | 3 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Faizan-e-Madina | `faizan-e-madina-mib-1584` | Briercliffe Road, Burnley, BB10 1XA | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 552 m away; no website; address is a bare street name, no house number or named premises |
| Faizan-e-Madinah | `faizan-e-madinah-mib-1486` | 14 Bence Road, Frenchwood,Preston, PR1 4NN | 3 | 1 | single source only (MIB); no website; no phone number |
| Falah Education Society | `falah-education-society-mib-3192` | 79 Burlington Street, Tameside, OL6 7HJ | 3 | 1 | single source only (MIB); no website; no phone number |
| Fife Islamic Centre | `fife-islamic-centre-mib-806` | Poplar Road, Fife, KY7 4AA | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Fife Muslim Educational and Cultural Centre | `fife-muslim-educational-and-cultural-centre-mib-2623` | 22 Main Street, Kinglassie,Fife, KY5 0XA | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Folkestone Mosque | `folkestone-mosque-mib-768` | 8a Foord Road South, Shepway, CT20 1HJ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Goldsmiths Multifaith Prayer Room | `goldsmiths-multifaith-prayer-room-node-1656342372` | Address not recorded yet | 3 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Gravesend Shahjalal Masjid | `gravesend-shahjalal-masjid-node-528510599` | St Hilda's Way, Gravesend, DA12 4AZ | 3 | 1 | single source only (OSM); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Greenwich Madina Trust | `greenwich-madina-trust-mib-858` | Camrose Street, Abbey Wood,Greenwich, SE2 0JA | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Gulzar-E-Madina Mosque | `gulzar-e-madina-mosque-mib-1752` | 10 St Stephen's Road, Selly Oak,Birmingham, Selly Oak, B29 … | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1619 m away; no website |
| Hadley Mosque | `hadley-mosque-mib-2507` | 18 Mafeking Road, Hadley,Telford and Wrekin, TF1 5LB | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Halesowen Dudley Yemeni Community Associati… | `halesowen-dudley-yemeni-community-association-mib-1654` | Highfield Lane, Dudley, B63 4SG | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Haverfordwest Mosque | `haverfordwest-mosque-mib-840` | 2 Albert Street, Sir Benfro - Pembrokeshire, SA61 1TB | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Hazrat Belal Masjid | `hazrat-belal-masjid-mib-1722` | 100 Waterloo Road, Burslem, Cobridge,City of Stoke-on-Trent… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Heathrow Airport | `heathrow-airport-mib-1205` | 1st floor, Corner btn Arrivals and Departures, Terminal 3; … | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Horsebridge Arts and Community Centre | `horsebridge-arts-and-community-centre-mib-2653` | 11 Horsebridge Road, Canterbury, CT5 1AF | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Huda Community Centre | `huda-community-centre-mib-2830` | 131 Great Hampton Row, Lozells,Birmingham, Ladywood, B19 3JN | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 927 m away; no website |
| Imperial College Chaplaincy Centre | `imperial-college-chaplaincy-centre-mib-2706` | East Basement, Beit Hall Quad, Prince Consort Road, South K… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1063 m away; no website |
| Iqra Centre | `iqra-centre-mib-2667` | 180-184 Allesley Old Road, Chapel Fields,Coventry, CV5 8GJ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Iqra Centre (Ahle-Sunnah Wal-Jam'aah) | `iqra-centre-ahle-sunnah-wal-jam-aah-mib-15041702` | 112 Rutland Street, Normanton,City of Derby, DE23 8PR | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 515 m away; no website |
| Islamic Centre | `islamic-centre-mib-1038` | 62 Station Road, Sir Gaerfyrddin - Carmarthenshire, SA15 1AN | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1176 m away; no website |
| Islamic Centre | `islamic-centre-mib-246` | 10 Avon Street, South Lanarkshire, ML3 7HU | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Islamic Centre and Mosque | `islamic-centre-and-mosque-mib-2604` | Legahorey Court, Craigavon, BT65 5BP | 3 | 1 | single source only (MIB); no website; no phone number |
| Islamic Education Centre | `islamic-education-centre-mib-195` | 172-174 Havelock Road, Alum Rock,Birmingham, Hodge Hill, B8… | 3 | 1 | single source only (MIB); no website; no phone number |
| Islamic Society | `islamic-society-mib-1851` | Sub-Basement, Main Building, UMIST, Sackville Street, Manch… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 539 m away; no website; musalla in ordinary premises (rented/shared rooms come and go) |
| Islamic Welfare Trust | `islamic-welfare-trust-mib-2663` | 114 Crocketts Road, Handsworth,Birmingham, Ladywood, B21 0HT | 3 | 1 | single source only (MIB); no website; no phone number |
| Island Garden Bangladeshi Cultural Associat… | `island-garden-bangladeshi-cultural-association-mib-15042405` | 3 Capstan House, Glengarnock Avenue, Island Gardens,Tower H… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jaame-al-Hashmi | `jaame-al-hashmi-mib-321` | 43 Copperfield Street, Blackburn with Darwen, BB1 1RB | 3 | 1 | single source only (MIB); no website; no phone number |
| Jabir bin Zayd Islamic Centre | `jabir-bin-zayd-islamic-centre-mib-74` | Medite House, 11-13 Broadway, Barking,Barking and Dagenham,… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 656 m away; no website |
| Jaima Ala Abba Community Center | `jaima-ala-abba-community-center-node-12609664004` | Probert Place, Newport, NP19 8EZ | 3 | 1 | single source only (OSM); no website; no phone number; address is a bare street name, no house number or named premises |
| Jalalia Mosque and Islamic Education Centre | `jalalia-mosque-and-islamic-education-centre-mib-2619` | Machen Place, Riverside,Caerdydd - Cardiff, CF11 6ER | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 439 m away; no website; address is a bare street name, no house number or named premises |
| Jam'at Ihyaa' Minhaaj Al-Sunnah | `jam-at-ihyaa-minhaaj-al-sunnah-mib-883` | 24 Bishops Hill, Ipswich, IP3 8EN | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 932 m away; no website |
| Jameah Islameah Islamic Educational Institu… | `jameah-islameah-islamic-educational-institute-mib-652` | Catts Hill, Mark Cross,Wealden, TN6 3NJ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Jamia Al-Karam | `jamia-al-karam-mib-2114` | Eaton Hall, London Road, Bassetlaw, DN22 0PR | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jamia Fatima Al-Zahra | `jamia-fatima-al-zahra-mib-328` | 105 St Agatha's Road, Ward End,Birmingham, Hodge Hill, B8 2… | 3 | 1 | single source only (MIB); no website; no phone number |
| Jamia Masjid Hall Green | `jamia-masjid-hall-green-mib-2670` | 1 Wycombe Road, Hall Green,Birmingham, Hall Green, B28 9EN | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 657 m away; no website |
| Jamia Masjid Madina | `jamia-masjid-madina-mib-624` | 3-5 Chapel Street, Pendle, BB8 0SE | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jamia Mosque and Islamic Welfare Associatio… | `jamia-mosque-and-islamic-welfare-association-lozells-way-132922474` | Address not recorded yet | 3 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Jamia Noor ul Quran and Community Centre | `jamia-noor-ul-quran-and-community-centre-mib-1639` | 208 Green Lane, Redbridge, IG1 1YF | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1077 m away; no website |
| Jamia Noor-ul-Huda | `jamia-noor-ul-huda-mib-1712` | Unit 4, Firtree House, 4 Creek Road, Barking,Barking and Da… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1437 m away; no website |
| Jamia Rizvia Mohi-ul-Islam | `jamia-rizvia-mohi-ul-islam-mib-1888` | 1 Aire Street, Middlesbrough, TS1 4PQ | 3 | 1 | single source only (MIB); no website; no phone number |
| Jamiat-ul-Imam Muhammad Zakaria | `jamiat-ul-imam-muhammad-zakaria-mib-486` | Thornton View Road, Clayton,Bradford, BD14 6JX | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 904 m away; no website; address is a bare street name, no house number or named premises |
| Jersey Mussalla | `jersey-mussalla-mib-2258` | Doner King / Turkish Kitchen, 13 Cheapside, States of Jerse… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-10` | Rochdale Scout Centre, 41 Dale Avenue, Edgware,Harrow, HA8 … | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1217 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1035` | Newmarket Turner Hall, Church Lane, Forest Heath, CB8 0HL | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1049` | Edgware Islamic Centre c/o Watlington Community Association… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 546 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1054` | Basement of Post Office, 146 Shepherds Bush Road, Hammersmi… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1140 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1219` | Betty Brunker Hall, Gambier House, Mora Street and Lever St… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 660 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1220` | Wax Chandlers Hall, 6 Gresham Street, Cheapside,City and Co… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1721 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1222` | Fleet Meadow Community Hall, Sandringham Road, Northbourne,… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-13` | Veterans Hall, Osidge Lane, Southgate,Barnet, N14 5DU | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1345` | Friends Meeting House, 20 Nigel Playfair Avenue, Hammersmit… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1664 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1436` | Grosvenor Hall, 20 Tothill House, Vincent Street, Pimlico,C… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1883 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-15041802` | Avalon Room, Glastonbury Experience Courtyard, 2-4 High Str… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-15042406` | Christ Church, Manchester Road, Island Gardens,Tower Hamlet… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1505` | Swanfield Park Community Centre, 46 Swanfield Drive, Chiche… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-15090801` | St Bride Foundation, Bride Lane, Temple,City and County of … | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 775 m away; no website; address is a bare street name, no house number or named premises |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1520` | The Communal Hall, Northolt Road, South Harrow,Harrow, HA2 … | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 573 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1593` | West End Centre, 48 Queens Road, Rushmoor, GU11 3JD | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 756 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1608` | Tottenham Community Sports Centre, 701-703 High Road, Totte… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1026 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1625` | Flanders Community Centre, 116 Napier Road, Newham, E6 2SG | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 746 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1629` | Woodman Community Centre, 12 or 32a Woodman Street, Royal D… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1679` | Launceston Ambulance Hall, Westgate Street, Cornwall, PL15 … | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1703` | St Clements Church Hall, Waddington Way, East Lindsey, PE25… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 726 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-17080404` | Beckton Globe, 1 Kingsford Way, Beckton,Newham, E6 5JQ | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 929 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1713` | Hedgecock Community Centre, 28 Stephen Jewers Gardens, Bark… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1076 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-1778` | Liverpool Road Hall, 33 Liverpool Road, West Lancashire, WN… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2015101101` | Morton Jubilee Hall, Union Road, Cheshire East, SK11 7BN | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-2871` | Breaks Manor Youth Centre, Link Drive, Welwyn Hatfield, AL1… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-3083` | 90 Southdown Road, St. Albans, AL5 1PS | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-3408` | Langley Pavilion Community Centre, Langley Road, Langley,Sl… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 961 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-371` | The Dropped Pin Quaker Centre aka Wanstead Quaker Meeting H… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 492 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-415` | Room 1 or Forest Suite, Bracknell Sports Centre, Bagshot Ro… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-473` | Caudwell Community Centre, 48 Althorpe Street, Bedford, MK4… | 3 | 1 | single source only (MIB); no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-561` | Thetford Art Galley, Market Place, Breckland, IP24 2AA | 3 | 1 | single source only (MIB); no website; no phone number |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-691` | Jubilee Hall, 2 Parsonage Lane, Enfield,Enfield, EN2 0AJ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-877` | The Penfold Centre, 1 Neville Gill Close, Wandsworth,Wandsw… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 957 m away; no website |
| Jumu'ah Salaah | `jumu-ah-salaah-mib-878` | The Abbey Centre, 34 Great Smith Street, Westminster,City o… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah and Tarawih | `jumu-ah-salaah-and-tarawih-mib-1711` | Kingswood Pre-School, Clay Hill Road, Basildon, SS16 5AD | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Jumu'ah Salaah organised by Isle of Man Mus… | `jumu-ah-salaah-organised-by-isle-of-man-muslim-association-mib-2016062701` | Onchan Youth and Community Centre, School Road, Onchan,Manx, | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Kirkcaldy Islamic Centre | `kirkcaldy-islamic-centre-mib-2625` | 1 St Marys Road, Fife, KY1 2RQ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Lewisham & Kent Islamic Centre (Chislehurst) | `lewisham-kent-islamic-centre-chislehurst-mib-619` | Foxbury Avenue, Chislehurst,Bromley, BR7 6SD | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Lewisham Afghan Community Ltd | `lewisham-afghan-community-ltd-mib-521` | 4-16 Deptford Bridge, Deptford, Lewisham,Greenwich, SE8 4HH | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 813 m away; no website |
| London Colney Islamic Centre | `london-colney-islamic-centre-mib-1458` | 174-174a High Street, London Colney,St. Albans, AL2 1JY | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| London South Bank University Islamic Society | `london-south-bank-university-islamic-society-mib-1318` | Borough Road Building, Borough Road and Keyworth Street or … | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 512 m away; no website |
| Loxford Muslim Society and Education Centre | `loxford-muslim-society-and-education-centre-mib-1199` | 117 Hampton Road, Ilford,Redbridge, IG1 1PU | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 534 m away; no website |
| Lytham St | `lytham-st-mib-1709` | Annes Islamic Community Centre, 11 Moorland Road, Fylde, FY… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Madina Jame Masjid and Muslim Community Cen… | `madina-jame-masjid-and-muslim-community-centre-mib-1377` | 248 Westferry Road, Millwall,Tower Hamlets, E14 3AG | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 940 m away; no website |
| Madina Masjid | `madina-masjid-mib-2295` | 273 Waterloo Road, Cobridge,City of Stoke-on-Trent, ST6 3HR | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Madni Educational Centre | `madni-educational-centre-mib-826` | 92 Hopwood Lane, Calderdale, HX1 4EJ | 3 | 1 | single source only (MIB); no website; no phone number |
| Madrasa Ghulzar-a-Madina | `madrasa-ghulzar-a-madina-mib-1997` | 60 Burlington Avenue , Oldham, OL8 1AP | 3 | 1 | single source only (MIB); no website; no phone number |
| Madrasah Taleemul Quran | `madrasah-taleemul-quran-mib-2352` | 90a Wednesbury Road, not connected, Palfrey,Walsall, WS1 4JH | 3 | 1 | single source only (MIB); no website; no phone number |
| Madrasah Talim ul Quran | `madrasah-talim-ul-quran-mib-2583` | 153 Loughborough Road, West Bridgford,Rushcliffe, NG2 7JS | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1224 m away; no website |
| Madrassa Khassat Ta'alim | `madrassa-khassat-ta-alim-mib-1234` | 303 North End Road, Fulham,Hammersmith and Fulham, W14 9NS | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1059 m away; no website |
| Makki Masjid | `makki-masjid-mib-1672` | Wigmore Road, Bilborough,Nottingham, NG8 4PB | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Manor Road Masjid | `manor-road-masjid-mib-1558` | 207 Manor Road, Pollards Hill,Croydon, CR4 1JH | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Marhaba Welcome Centre | `marhaba-welcome-centre-mib-65` | 151 Balmoral Street, Whiteinch,Glasgow City, G14 0HB | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 819 m away; no website |
| Markaz Mu'aadh Ibn Jabal | `markaz-mu-aadh-ibn-jabal-mib-2863` | 19 Spackmans Way, Chalvey,Slough, SL1 2SA | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1731 m away; no website |
| Markazi Jamiat Ahl-e-Hadith | `markazi-jamiat-ahl-e-hadith-mib-2205` | 26 Seabrook Street, Sheffield, S2 2RZ | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1462 m away; no website |
| Markazi Jamiat Ahl-e-Hadith | `markazi-jamiat-ahl-e-hadith-mib-409` | 13 Westwood Road, Bolton, BL1 4DL | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 403 m away; no website |
| Masjid | `masjid-mib-2999` | 3 Rampart Court, Rampart Lane, Dundalk,Not until 2015 | 3 | 1 | single source only (MIB); no website; no phone number |
| Masjid Abu Bakr | `masjid-abu-bakr-way-117007188` | Bawtry Road, Sheffield, S9 1WZ | 3 | 1 | single source only (OSM); no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid al-Huda | `masjid-al-huda-mib-15041803` | The Citadel, Bella Street, Bolton, BL3 4DU | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 423 m away; no website; address is a bare street name, no house number or named premises |
| Masjid Al-Humera | `masjid-al-humera-mib-875` | 183 Green Street, Forest Gate,Newham, E7 8LL | 3 | 1 | single source only (MIB); no website; no phone number |
| Masjid At-Taqwa | `masjid-at-taqwa-mib-2576` | Multifaith Room, 9th Floor, Crown House, North Circular Roa… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 781 m away; no website |
| Masjid Bilal | `masjid-bilal-mib-2079` | 15 Eldon Street, Preston, PR1 7YD | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 597 m away; no website |
| Masjid e Rizwan | `masjid-e-rizwan-mib-343` | Newton Street, Blackburn with Darwen, BB1 1NE | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 500 m away; no website; address is a bare street name, no house number or named premises |
| Masjid Ibn Seereen | `masjid-ibn-seereen-way-562334690` | Lower Ashley Road, Bristol, BS2 9QA | 3 | 1 | single source only (OSM); no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid Noor and Islamic Education Centre | `masjid-noor-and-islamic-education-centre-mib-2095` | 48 Bridgefield Street, Bury, M26 2SG | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Masjid Salaam | `masjid-salaam-way-56187058` | Corden Street, Derby, DE23 8GN | 3 | 1 | single source only (OSM); no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid Salahuddin | `masjid-salahuddin-way-101939993` | Address not recorded yet | 3 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Masjid Usman | `masjid-usman-mib-1031` | 513 Slade Road, Stockland Green, Erdington,Birmingham, Erdi… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 901 m away; no website |
| Masjid Wa Madrasah Usman Gani (RA) | `masjid-wa-madrasah-usman-gani-ra-mib-1913` | Stanley Street, not known, Brierfield,Pendle, BB9 5DL | 3 | 1 | single source only (MIB); no website; no phone number; address is a bare street name, no house number or named premises |
| Masjid-e-Ibrahim | `masjid-e-ibrahim-mib-588` | 17 Carter Street, Bolton, BL3 2HG | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 682 m away; no website |
| Masjid-e-Irfan | `masjid-e-irfan-mib-330` | 49 Eldon Road, Blackburn with Darwen, BB1 8BE | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 428 m away; no website |
| Masjid-e-Noor | `masjid-e-noor-mib-266` | 327-329 St Helens Road, Bolton, BL3 3QD | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 925 m away; no website |
| Masjid-e-Noor | `masjid-e-noor-mib-83` | 149-150 New John Street, not known, Halesowen,Dudley, B62 8… | 3 | 1 | single source only (MIB); no website; no phone number |
| Masjid-e-Saliheen | `masjid-e-saliheen-mib-2081` | 20-21 Fishergate Hill, Preston, PR1 8JB | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Masjid-ul-Abraar | `masjid-ul-abraar-mib-602` | 77 Dale Street, Medway, ME4 6QG | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1134 m away; no website |
| Mawlawi Kurdish Cultural Centre | `mawlawi-kurdish-cultural-centre-way-611855752` | Parsonage Street, Manchester, M15 5WD | 3 | 1 | single source only (OSM); no website; no phone number; address is a bare street name, no house number or named premises |
| Mosque and Islamic Centre | `mosque-and-islamic-centre-mib-1492` | 157a High Street, Penge ,Bromley, SE20 7DG | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Multifaith Room | `multifaith-room-mib-17080504` | Southwold Building, Great Ormond Street Hospital,, Bloomsbu… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 625 m away; no website |
| Murqas al Ansar | `murqas-al-ansar-mib-1014` | Woodgreen Road, Humberstone,City of Leicester, LE4 9UD | 3 | 1 | single source only (MIB); no website; no phone number; address is a bare street name, no house number or named premises |
| musallah | `musallah-mib-299` | Dublin City University, Dublin,D9 | 3 | 1 | single source only (MIB); no website; no phone number; address is a bare street name, no house number or named premises |
| Musallah | `musallah-mib-2737` | Spiritual Care Centre, St George's Hospital, Blackshaw Road… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 609 m away; no website |
| Musallah | `musallah-mib-2739` | Royal Bolton Hospital, Minerva Road, Farnworth,Bolton, BL4 … | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1507 m away; no website |
| Muslim Community Centre | `muslim-community-centre-mib-1915` | 14-20 Spencer Street, Arun, PO21 1AN | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Muslim Prayer Room | `muslim-prayer-room-mib-1096` | First Floor, Birmingham Children’s Hospital, Steelhouse Lan… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 402 m away; no website |
| Muslim Welfare House (Durham) | `muslim-welfare-house-durham-mib-1930` | 6 North Terrace, Spital Tongues,Newcastle upon Tyne, NE2 4AD | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1701 m away; no website |
| Naqshabandia Mosque | `naqshabandia-mosque-mib-2287` | 18 Dyke Street, Hanley,City of Stoke-on-Trent, ST1 2DF | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1093 m away; no website |
| Neath Mosque and Islamic Cultural Centre | `neath-mosque-and-islamic-cultural-centre-mib-1360` | St Annes Terrace, Tonna,Castell-nedd Port Talbot - Neath Po… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| North Devon Islamic Culture Centre | `north-devon-islamic-culture-centre-mib-1197` | 9 Vicarage Street, North Devon, EX32 7BT | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Northwood Hills Masjid and Commnity Centre | `northwood-hills-masjid-and-commnity-centre-way-79405101` | Address not recorded yet | 3 | 1 | single source only (OSM); no independent OSM prayer space within 400 m; no phone number; no address recorded |
| Oxford University Islamic Society Prayer Ro… | `oxford-university-islamic-society-prayer-room-node-4851854319` | Address not recorded yet | 3 | 1 | single source only (OSM); nearest independent OSM prayer space is 1350 m away; no phone number; no address recorded |
| Pakistan High Commission | `pakistan-high-commission-mib-1428` | 35 Lowndes Square, Knightsbridge,Kensington and Chelsea, SW… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 944 m away; no website |
| Perth Islamic Society | `perth-islamic-society-mib-2055` | 65 Glasgow Road, Perth and Kinross, PH2 0PE | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 600 m away; no website |
| Prayer Room | `prayer-room-mib-1093` | All Faiths Prayer Room, George Eliot Hospital, College Stre… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 841 m away; no website |
| Prayer Room | `prayer-room-mib-1094` | Faith Centre, Walsgrave (University) Hospital, Clifford Bri… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Prayer Room | `prayer-room-mib-1098` | Chapel, Glenfield Hospital, Groby Road, City of Leicester, … | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Prayer Room | `prayer-room-mib-1099` | Leicester General Hospital, Gwendolen Road, City of Leicest… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 822 m away; no website |
| Prayer Room | `prayer-room-mib-1540` | Ground floor, Clarence Wing,  St Mary's Hospital, Praed Str… | 3 | 1 | single source only (MIB); no website; no phone number |
| Prayer Room | `prayer-room-mib-16050106` | 2nd Floor, Lift Core 5, Royal London Hospital, Whitechapel … | 3 | 1 | single source only (MIB); no website; no phone number |
| Prayer Room | `prayer-room-mib-17080502` | Ground floor, South Wing, St Thomas' Hospital, Westminster … | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Prayer Room | `prayer-room-mib-2684` | Room LG64, School of Oriental & African Studies, University… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 573 m away; no website |
| Prayer Room | `prayer-room-mib-2777` | Level 1, Millennium Point, Birmingham City University, Curz… | 3 | 1 | single source only (MIB); no website; no phone number |
| Prayer Room | `prayer-room-mib-2826` | Terminal 1 Departures, Manchester Airport, Manchester, M90 … | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Prayer Room | `prayer-room-mib-2827` | Terminal 3 Departures, Manchester Airport, Manchester, M90 … | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Prayer Room | `prayer-room-mib-42` | 3rd Floor, The Hub, Jordan Well, Coventry, CV1 5QP | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1061 m away; no website |
| Prayer Room | `prayer-room-mib-471` | South Wing, Bedford Hospital, Kempston Road, Bedford, MK42 … | 3 | 1 | single source only (MIB); no website; no phone number |
| Prayer Room | `prayer-room-mib-532` | Block A, Faculty of Health & Sciences, Stafford Campus, Sta… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Prayer Room | `prayer-room-node-11664987958` | Address not recorded yet | 3 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Queen Mary's Prayer rooms | `queen-mary-s-prayer-rooms-mib-1362` | Queen Mary's College University of London, Mile End Road, B… | 3 | 1 | single source only (MIB); no website; no phone number |
| Quiet Room | `quiet-room-mib-2823` | National Exhibition Centre, Solihull, B40 1NT | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Quinborne Muslim Education and Community Ce… | `quinborne-muslim-education-and-community-centre-mib-1742` | 1 Simmons Drive, Quinton,Sandwell, B32 1SL | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Rainham Muslim Community Mosque | `rainham-muslim-community-mosque-mib-17080506` | Royals Youth Centre, Viking Way, Havering, RM13 9YG | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Raza Education Centre | `raza-education-centre-way-1428120638` | Address not recorded yet | 3 | 1 | single source only (OSM); no website; no phone number; no address recorded |
| Reading University Muslim Society | `reading-university-muslim-society-mib-2107` | Archway Lodge, Whiteknights Campus, Wokingham, RG6 6AR | 3 | 1 | single source only (MIB); no website; no phone number |
| Roehampton Cultural Centre | `roehampton-cultural-centre-mib-1716` | 57 Minstead Gardens, Roehampton,Wandsworth, SW15 4ER | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Salaam Masjid | `salaam-masjid-mib-737` | 44-46 Bunyan Road, Kempston,Bedford, MK42 8HL | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Salford University Mosque | `salford-university-mosque-mib-1842` | Newton Annexe (opposite Crescent Station), Salford Universi… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Shah Jalal Al-Jumm'ah Masjid | `shah-jalal-al-jumm-ah-masjid-mib-598` | 1-3 Brook Street, Carlisle, CA1 2JA | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Shah Jalal Masjid & Madrassa | `shah-jalal-masjid-madrassa-mib-1162` | Burleigh Street, Burnley, BB12 0AL | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 664 m away; no website; address is a bare street name, no house number or named premises |
| ShahJalal Jame Mosque Trust Limited | `shahjalal-jame-mosque-trust-limited-mib-2540` | 4 Argyle Street, Bath and North East Somerset, BA2 4BA | 3 | 1 | single source only (MIB); no website; no phone number |
| Somali Community and Cultural Association | `somali-community-and-cultural-association-mib-3253` | Selby Centre, Selby Road, Tottenham,Haringey, N17 8JL | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| South Tottenham Mosque | `south-tottenham-mosque-mib-1174` | 152 Olinda Road, Tottenham,Hackney, N16 6TP | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1276 m away; no website |
| Stanford-le-Hope Jamme Masjid | `stanford-le-hope-jamme-masjid-mib-1747` | High Street, Stanford-le-Hope,Thurrock, SS17 0EY | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Stratford Muslim Centre | `stratford-muslim-centre-mib-1727` | 243-245 Plaistow Road, Stratford,Newham, E15 3EU | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 511 m away; no website |
| Strathclyde University Muslim Students Asso… | `strathclyde-university-muslim-students-association-mib-780` | Basement Level, St, Pauls Building, University of Strathcly… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 1120 m away; no website |
| Taiba Welfare Foundation | `taiba-welfare-foundation-mib-718` | Pride House, Rectory Lane, Edgware,Barnet, HA8 7LG | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 767 m away; no website |
| Teviot Bangladeshi Cultural Community Group | `teviot-bangladeshi-cultural-community-group-mib-15042402` | 181 Teviot Street, Poplar,Tower Hamlets, E14 6PY | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 488 m away; no website |
| Thames View Muslim Centre | `thames-view-muslim-centre-mib-1714` | 17 Farr Avenue, Barking,Barking and Dagenham, IG11 0NY | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 857 m away; no website |
| The Guidance Centre | `the-guidance-centre-mib-1701` | 102 Victoria Road, Ruislip Manor,Hillingdon, HA4 0AL | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| The Mosque | `the-mosque-mib-2277` | 9 Kenley Gardens, Norton, \Clydeland\,Stockton-on-Tees, TS2… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| The Prayer Space | `the-prayer-space-mib-1493` | 2nd Floor, Aperture Building, 42 Chandlers Avenue, Greenwic… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| The Spiritual Care Centre | `the-spiritual-care-centre-way-1127830725` | Address not recorded yet | 3 | 1 | single source only (OSM); no independent OSM prayer space within 400 m; no phone number; no address recorded |
| The Zawiya | `the-zawiya-mib-121` | 1 Jenkins Street, not known, Small Heath,Birmingham, Ladywo… | 3 | 1 | single source only (MIB); no website; no phone number; MIB flags it as an irregular / part-time venue; musalla in ordinary premises (rented/shared rooms come and go) |
| Tilbury Mosque | `tilbury-mosque-mib-1748` | 159 St Chads Road, Tilbury,Thurrock, RM18 8LJ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Torbay Islamic Centre | `torbay-islamic-centre-mib-2322` | 128-130 Avenue Road, Torbay, TQ2 5LQ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| UEA Islamic Centre | `uea-islamic-centre-mib-1958` | Chancellor Drive, University of East Anglia, Norwich, NR4 7… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Union Masjid & Educational Centre | `union-masjid-educational-centre-mib-642` | 183 Prince Street, Pleck,Walsall, WS2 9JQ | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 408 m away; no website |
| United Afghan Community Centre | `united-afghan-community-centre-mib-2016050101` | 229 Roundhay Road, Harehills,Leeds, LS8 4HS | 3 | 1 | single source only (MIB); no website; no phone number |
| Unity Welfare Education Centre | `unity-welfare-education-centre-mib-1506` | The Upper Hall, 8 Greenland Street, Camden,Camden, NW1 0ND | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 718 m away; no website |
| University College of London Islamic Society | `university-college-of-london-islamic-society-mib-1095` | Student Union, 25 Gordon Street, Westminster,Camden, WC1H 0… | 3 | 1 | single source only (MIB); no website; no phone number |
| University of Aberdeen Muslim Students Asso… | `university-of-aberdeen-muslim-students-association-mib-2` | Powis Gate, College Bounds, Aberdeen City, AB24 3DY | 3 | 1 | single source only (MIB); no website; no phone number |
| Victoria Islamic Community and Education Ce… | `victoria-islamic-community-and-education-centre-mib-14061501` | Lower Ground Floor, Sherbourne House, Cumberland Street, Ab… | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Village Islamic Centre | `village-islamic-centre-mib-369` | 37 Daniels Road, Small Heath,Birmingham, Hodge Hill, B9 5XU | 3 | 1 | single source only (MIB); no website; no phone number |
| West Cumbria Muslim Society | `west-cumbria-muslim-society-mib-527` | 2 College Street, Copeland, CA28 7EG | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| West Wales Islamic Cultural Association | `west-wales-islamic-cultural-association-mib-500` | 131 Priory Street, Sir Gaerfyrddin - Carmarthenshire, SA31 … | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Weston Islamic Education Centre | `weston-islamic-education-centre-mib-578` | 66 Palmer Street, North Somerset, BS23 1RU | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website |
| Zaytuna Masjid | `zaytuna-masjid-mib-1741` | Quinton Road West, Quinton,Sandwell, B32 1PJ | 3 | 1 | single source only (MIB); no independent OSM prayer space within 400 m; no website; address is a bare street name, no house number or named premises |
| Zumunta Community and Cultural Studies Cent… | `zumunta-community-and-cultural-studies-centre-mib-1732` | Unit 39, Newtown Shopping Centre, Birmingham, Ladywood, B19… | 3 | 1 | single source only (MIB); nearest independent OSM prayer space is 667 m away; no website |

## Proposed upgrades to `verified` (1)

| Name | id | Score | Corrob. | Corroborating signals |
|---|---|---|---|---|
| Masjid Eesa ibn Maryam | `masjid-eesa-ibn-maryam-mib-1634` | 8 | 2 | OSM maps a prayer space 24 m from the pin (w/103044268 "Masjid Esa Ibn Maryam"); name agrees with the OSM element ("Masjid Esa Ibn Maryam"); has a phone number; address identifies a specific building; MIB capacity ~300 -- a building, not a borrowed room |

## Moved to `community` (0)

_none_

## Candidates for REMOVAL, not just downgrading (2)

These do not look like venues offering a public Muslim prayer space, which is
the dataset's inclusion rule. **Nothing has been deleted** — this is a list for
a human to confirm, then remove from Supabase.

| Name | id | Type | Address | Why |
|---|---|---|---|---|
| Al Hidaya Academy | `al-hidaya-academy-way-1428001236` | masjid | Address not recorded yet | its only source, OSM way/1428001236, is not a Muslim prayer space (religion=unset, amenity=unset) |
| Peace Islamic Centre | `peace-islamic-centre-node-14040384655` | masjid | 3 Hyde Business Park, Derry/Londonderry, BT… | its only source, OSM node/14040384655, is not a Muslim prayer space (religion=unset, amenity=unset) |

## What this audit cannot tell you

- **Whether a place is still open.** No signal here is a visit or a phone call. A mosque that closed last month still scores well.
- **Whether the facilities are right.** Sisters' space, wudu and disabled access are copied from MIB and are not checked at all.
- **Whether a phone number or website still works.** Presence is scored; reachability is not. Fetching 373 websites and honouring robots.txt was out of scope.
- **Whether the coordinates are right.** A pin in the wrong place still scores well here as long as an OSM prayer space happens to be near it. That is `scripts/verify-coords.mjs`' job (stored point vs. postcode centroid) and the two reports should be read together.
- **Ahmadi / Shia exclusions.** The dataset deliberately omits these. A live OSM match is counted regardless of the element's `denomination` tag, so a match could in principle be a neighbouring mosque of a different school. Matches within 150 m of the pin are near-certainly the same building.
- **Anything about the 2 places whose Overpass cell failed**, beyond their offline signals.
