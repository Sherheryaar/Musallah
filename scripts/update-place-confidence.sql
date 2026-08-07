-- Proposed `confidence` values for public.places
--
-- Generated 2026-08-07 by scripts/verify-places.mjs
-- (`npm run verify:places`). See place-confidence-report.md for the scoring
-- rules, the evidence behind each row, and the list of removal candidates.
--
-- PROVENANCE: every tier here comes from independently checkable signals --
-- the MIB/OSM provenance tag on the row, a live Overpass query for
-- amenity=place_of_worship + religion=muslim / building=mosque / room=prayer /
-- amenity=prayer_room / religion=multifaith near the stored coordinates, a
-- re-check of each OSM-sourced row's own element by id, the presence of a
-- phone/website, address specificity, MIB's own "irregular / part-time" flag,
-- and premises type. No place's existence was
-- confirmed by visiting or calling it; "verified" means "two independent
-- sources agree it is here and you can contact it", not "we went".
--
-- This is NON-DESTRUCTIVE: it only writes the confidence column, one row at a
-- time, by id. No inserts, no deletes, no other columns touched.
--
-- 3 of 2244 rows change tier
-- (1 -> verified, 0 -> community, 2 -> unverified).
--
-- AFTER RUNNING THIS in the Supabase SQL editor, re-sync the bundled dataset:
--
--     npm run sync:places
--
-- (src/data/places.json in this commit already carries these values, so the
-- sync should be a no-op unless the table has changed for other reasons.)

begin;

update public.places set confidence = 'unverified' where id = 'isle-of-man-muslim-association-mib-720'; -- was community, score 3
update public.places set confidence = 'verified' where id = 'masjid-eesa-ibn-maryam-mib-1634'; -- was community, score 8
update public.places set confidence = 'unverified' where id = 'peace-islamic-centre-node-14040384655'; -- was community, score 4

commit;

-- Sanity check:
--   select confidence, count(*) from public.places group by confidence order by 2 desc;
-- Expected: verified 899, community 664, unverified 681.
