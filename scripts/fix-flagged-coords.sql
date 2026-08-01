-- Corrections for the coordinate-verification red/amber flags
-- (coord-report.md). Every fix below was verified against at least two
-- independent sources on 2026-08-01: postcodes.io reverse geocoding of the
-- stored pin, OpenStreetMap (Overpass/Nominatim/direct node fetch), the
-- venue's own website or Charity Commission record, and Google Maps place
-- lookups. Run in the Supabase SQL editor, then `npm run sync:places`.
-- (src/data/places.json in this repo already carries the same values.)

-- ---- Pins wrong, addresses right: move the pin -----------------------------

-- OSM place_of_worship on Lucas Street, Cathays (matches the address and the
-- mosque's planning record). Old pin was 2.5 km away in Penylan.
update public.places
  set lat = 51.49597, lng = -3.17573
  where id = 'madina-mosque-mib-574';

-- Google Maps place for 525 London Road CR7 6AR; agrees with the CR7 6AR
-- unit centroid. Old pin was 0.75 km north-east.
update public.places
  set lat = 51.389534, lng = -0.1124819
  where id = 'croydon-mosque';

-- Google Maps place on Priory Street; agrees with the SA31 1LR centroid.
-- Old pin was 1.2 km north-east in Tanerdy.
update public.places
  set lat = 51.8590654, lng = -4.3010923
  where id = 'west-wales-islamic-cultural-association-mib-500';

-- M16 0NL unit centroid on Ayres Road; sibling record (235 Ayres Road,
-- mib-1791) pins the same street. Old pin was 0.8 km east, off-street.
update public.places
  set lat = 53.45608, lng = -2.28261
  where id = 'faizan-e-islam-educational-cultural-organisation-mib-2865';

-- OSM centroid of the Westfield Stratford City building the address names.
-- Old pin was ~0.5 km east, over the old Stratford Centre.
update public.places
  set lat = 51.54306, lng = -0.00642
  where id = 'inspiration-multi-faith-worship-and-prayer-area-mib-537';

-- ---- Pins right, addresses wrong: fix the postcode/address -----------------

-- Baldock Services' real postcode is SG7 5TR (Extra MSA, plugshare, Wikipedia);
-- the pin sits 6 m from it. PE7 3UQ is a Peterborough postcode pasted in error.
update public.places
  set address = 'Baldock Services, A1(M) and A1 at Junction 10, Stevenage North,North Hertfordshire, SG7 5TR'
  where id = 'multifaith-room-mib-1705';

-- Official address per the centre's website and Charity Commission record
-- (charity 1176290): 27-31 Clare Road, Grangetown, CF11 6QP. The pin sits on
-- Clare Road; CF14 6HZ is Llanishen, 6 km north.
update public.places
  set address = '27-31 Clare Road, Grangetown,Caerdydd - Cardiff, CF11 6QP'
  where id = 'rabbaniah-islamic-cultural-centre-mib-634';

-- The masjid's own website header: "13-17 Barley Lane. Luton. Beds LU4 9HT";
-- the pin sits 32 m from LU4 9HT.
update public.places
  set address = '13-17 Barley Lane, Leagrave,Luton, LU4 9HT'
  where id = 'hockwell-ring-masjid-mib-944';

-- OSM place_of_worship is 50 m from the pin on Evington Valley Road; property
-- records give LE5 5LJ. LE5 6LG is 3 km east.
update public.places
  set address = '62 Evington Valley Road and 81 Chesterfield Road, City of Leicester, LE5 5LJ'
  where id = 'jamia-masjid-e-bilal-mib-964';

-- Paterson's Land / Moray House, Holyrood Road is EH8 8AQ (University of
-- Edinburgh); the pin sits 8 m from it. EH9 3DW is Marchmont, 3 km south.
update public.places
  set address = 'Moray House School of Education, Paterson''s Land, Holyrood R, University of Edinburgh,City of Edinburgh, EH8 8AQ'
  where id = 'moray-house-prayer-room-mib-2016042905';

-- Derby Road, Bevois is SO14 0; the pin sits 30 m from SO14 0DZ. SO14 6BD is
-- 0.9 km north.
update public.places
  set address = '169-193 Derby Road, City of Southampton, SO14 0DZ'
  where id = 'southampton-umar-al-farooq-islamic-centre-mib-2249';
