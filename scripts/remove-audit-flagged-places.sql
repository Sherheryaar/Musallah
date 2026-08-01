-- Remove the 28 places the legitimacy audit flagged as not offering a
-- public Muslim prayer space (place-confidence-report.md, "Candidates for
-- REMOVAL"), confirmed for deletion by the owner on 2026-08-01.
--
-- 26 are OSM multi_faith_room sweeps that are actually cemetery/crematorium
-- chapels, plain chapels, a Boys Brigade HQ, and a tree cathedral; 2 are
-- madrasahs/schools with no public musalla (same rule that rejected the
-- Darul Hadis Latifiah insert).
--
-- Run in the Supabase SQL editor, then: npm run sync:places
delete from public.places where id = 'bilal-academy-mib-1792'; -- Bilal Academy (musalla)
delete from public.places where id = 'shah-jalal-latifia-madrasha-and-islamic-school-mib-336'; -- Shah Jalal Latifia Madrasha And Islamic School (musalla)
delete from public.places where id = 'beverley-queensgate-cemetery-way-251648063'; -- Beverley Queensgate Cemetery (multi_faith_room)
delete from public.places where id = 'boys-brigade-hq-node-655438939'; -- Boys Brigade HQ (multi_faith_room)
delete from public.places where id = 'cemetery-chapel-way-210368104'; -- Cemetery Chapel (multi_faith_room)
delete from public.places where id = 'cemetery-chapel-way-471117254'; -- Cemetery Chapel (multi_faith_room)
delete from public.places where id = 'chapel-node-13112619639'; -- Chapel (multi_faith_room)
delete from public.places where id = 'chapel-node-2700948643'; -- Chapel (multi_faith_room)
delete from public.places where id = 'chapel-node-4266351251'; -- Chapel (multi_faith_room)
delete from public.places where id = 'chapel-node-7239057515'; -- Chapel (multi_faith_room)
delete from public.places where id = 'chapel-of-meditation-way-804718146'; -- Chapel of Meditation (multi_faith_room)
delete from public.places where id = 'chapel-way-236009592'; -- Chapel (multi_faith_room)
delete from public.places where id = 'crematorium-chapel-way-1259175444'; -- Crematorium Chapel (multi_faith_room)
delete from public.places where id = 'east-cemetery-chapel-way-102549685'; -- East Cemetery Chapel (multi_faith_room)
delete from public.places where id = 'fgh-chapel-node-4107990754'; -- FGH Chapel (multi_faith_room)
delete from public.places where id = 'gillingham-cemetery-chapel-node-2755159491'; -- Gillingham Cemetery Chapel (multi_faith_room)
delete from public.places where id = 'ship-lane-cemetery-entrance-node-5271697499'; -- Ship Lane Cemetery Entrance (multi_faith_room)
delete from public.places where id = 'st-martin-s-chapel-node-977630491'; -- St. Martin's Chapel (multi_faith_room)
delete from public.places where id = 'tonbridge-cemetery-chapel-node-1110566195'; -- Tonbridge Cemetery Chapel (multi_faith_room)
delete from public.places where id = 'tree-cathedral-node-1171134373'; -- Tree Cathedral (multi_faith_room)
delete from public.places where id = 'the-vale-chapel-way-560424607'; -- The Vale Chapel (multi_faith_room)
delete from public.places where id = 'barter-memorial-chapel-1868-node-12954453270'; -- Barter Memorial Chapel 1868 (multi_faith_room)
delete from public.places where id = 'chapel-way-657436855'; -- Chapel (multi_faith_room)
delete from public.places where id = 'charter-chapel-way-1193551811'; -- Charter Chapel (multi_faith_room)
delete from public.places where id = 'east-chapel-node-11725854167'; -- East Chapel (multi_faith_room)
delete from public.places where id = 'mortonhall-chapel-way-33745877'; -- Mortonhall Chapel (multi_faith_room)
delete from public.places where id = 'oak-chapel-node-11711808379'; -- Oak Chapel (multi_faith_room)
delete from public.places where id = 'west-chapel-way-1460685281'; -- West Chapel (multi_faith_room)

-- Expect 28 fewer rows than before:
select count(*) as places_after from public.places;
