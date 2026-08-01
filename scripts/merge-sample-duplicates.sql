-- Merge the original hand-made SAMPLE rows into their imported MIB rows.
--
-- The seed dataset predates the MuslimsInBritain import, and 9 of its 12
-- rows describe places the import also brought in — users saw two pins for
-- one mosque, sometimes with different Jumu'ah times. Two rows (East London
-- Mosque, Lewisham) carried FABRICATED jamaat tables openly labelled
-- "Sample data — replace with real timetable", which rendered as
-- authoritative prayer times in the app.
--
-- WHAT IS AND ISN'T CARRIED OVER: the sample rows' facility ticks and
-- Jumu'ah times are placeholders (the README always said so), so they are
-- NOT copied — a placeholder "disabled access: yes" sends someone on a
-- wasted journey. Only two things move across: human-written wayfinding
-- notes, and facts re-verified against the mosque's own published
-- timetable today (2026-08-01).
--
-- Run in the Supabase SQL editor, then: npm run sync:places

-- 1) Facts re-verified from the mosques' own sources --------------------------

-- East London Mosque: 13:45 read off their published timetable
-- (eastlondonmosque.org.uk/prayer-times, checked 2026-08-01). Their page
-- states the Friday Zuhr Jama'ah IS the Jumu'ah prayer, and Fridays that
-- month (7th, 14th, 21st, 28th) show 1:45 where other days show 1:30 —
-- so the sample row's "13:15, 14:15" was wrong in both values.
update public.places set
  jumuah_times = '["13:45"]'::jsonb,
  notes = coalesce(notes || '; ', '') || 'One of the largest mosques in the UK. Sisters'' entrance via the London Muslim Centre.',
  last_verified = '2026-08-01'
where id = 'east-london-mosque-london-muslim-centre-mib-1378';

-- Westfield Stratford: "InSpiration" IS the Westfield prayer area — same
-- centre, same postcode, 85 m apart. Keep the wayfinding note only.
update public.places set
  notes = coalesce(notes || '; ', '') || 'Located near the Chestnut Plaza entrance. Ask guest services if unsure.'
where id = 'inspiration-multi-faith-worship-and-prayer-area-mib-537';

-- Finsbury Park, Al-Manaar, Brick Lane, Croydon, Lewisham and London
-- Central keep exactly what their MIB rows and the Mawaqit refresh give
-- them. (Finsbury Park's 13:00 is mosque-managed via Mawaqit and beats the
-- sample row's unsourced 13:15.) Nothing invented, nothing guessed.

-- 2) Delete the sample duplicates -------------------------------------------
-- St Thomas': the MIB row names the specific room (ground floor, South
-- Wing); the sample row added a second pin and nothing else.

delete from public.places where id = 'al-manaar';
delete from public.places where id = 'brick-lane-jamme-masjid';
delete from public.places where id = 'croydon-mosque';
delete from public.places where id = 'east-london-mosque';
delete from public.places where id = 'finsbury-park-mosque';
delete from public.places where id = 'lewisham-islamic-centre';
delete from public.places where id = 'london-central-mosque';
delete from public.places where id = 'st-thomas-multifaith';
delete from public.places where id = 'westfield-stratford-prayer-room';

-- 3) The three genuine non-duplicates ---------------------------------------
-- Canary Wharf's prayer room, Guy's chaplaincy, and UCL Student Central are
-- real places with no MIB counterpart. (The "UCL duplicate" 89 m away turned
-- out to be SOAS's own room — a different building.) Their facility ticks are
-- still placeholders, so drop the unverifiable ones and stop calling the
-- source "Sample data", which read like a placeholder to users.

update public.places set
  source = 'Initial dataset — details unconfirmed',
  facilities = facilities || '{"disabledAccess": false, "parking": false}'::jsonb,
  confidence = 'unverified'
where id in ('canary-wharf-multifaith', 'guys-hospital-multifaith', 'ucl-prayer-room');

-- Expect 9 fewer rows (2,253 -> 2,244 as of 2026-08-01):
select count(*) as places_after from public.places;
