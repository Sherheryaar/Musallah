-- Proposed fixes from the 2026-08-07 place-validity audit.
-- NON-DESTRUCTIVE where possible; the one delete is called out explicitly.
-- Nothing here has been run. Review each block, then run in the Supabase
-- SQL editor, then locally: npm run sync:places
--
-- See the audit summary for full evidence on each row.

begin;

-- 1. DUPLICATE: "Faizan-e-Islam Educational & Cultural Organisation" is
--    entered twice, 64 m apart on the same street in Old Trafford,
--    Trafford -- identical name, identical phone (0161 877 4827),
--    identical capacity (~1050) and denomination (Barelvi). mib-1791 has
--    the stronger provenance (MIB+OSM, two independent sources); mib-2865
--    is MIB-only and looks like the same organisation entered a second
--    time under a slightly different house number (229 vs 235 Ayres Road).
--    REVIEW BEFORE RUNNING -- this permanently removes a row.
delete from public.places
where id = 'faizan-e-islam-educational-cultural-organisation-mib-2865';

-- 2. STALE POSTCODE TEXT: "McIndians Restaurant" (Leicester) stores address
--    postcode LE1 3JB, which does not resolve in postcodes.io. The stored
--    lat/lng (52.6379251, -1.1322087) match LE1 3GP's centroid to within
--    ~30 m, and LE1 3GP is the postcode independent mosque-finder sites
--    (Masjidway, MosqueNearMe, MosquePay) list for this address -- so the
--    pin is right and only the postcode text is stale. Non-destructive:
--    only the address column changes.
update public.places
set address = '36 Belgrave Gate, City of Leicester, LE1 3GP'
where id = 'mcindians-restaurant-mib-963';

-- 3. POLICY EXCLUSION: "Imam Ali Centre" (node/1116253471, Rochester/Medway,
--    Kent) is a Shia centre -- listed on masjideali.org's "UK Shia Mosques
--    & Centres" directory and run by "Kent Imam Ali Centre" (confirmed via
--    its own Facebook page and independent mosque directories). It carries
--    no denomination tag in OSM (generic religion=muslim), so it was not
--    caught by the dataset's standing Ahmadi/Shia exclusion policy when it
--    was imported. A full-dataset name sweep for Shia/Ahmadi indicators
--    (Imam Ali, Imambargah, KSIMC, Ahlul Bayt, Hujjat, Baitul Futuh, Fazl
--    Mosque, etc.) found no other matches.
--    REVIEW BEFORE RUNNING -- this permanently removes a row.
delete from public.places
where id = 'imam-ali-centre-node-1116253471';

-- 4. POLICY EXCLUSION: "Zain Abiya" (way/120199562, Reading, "unverified",
--    no denomination noted) is the Zainabiya Welfare Foundation -- an
--    explicitly Shia Ithna Ashari centre (registered charity 1153961,
--    zainabiya.uk, listed on shiatent.com's Shia-community directory). The
--    OSM import split "Zainabiya" into two words ("Zain Abiya"), which is
--    why the first Shia/Ahmadi name sweep (item 3) missed it -- a second,
--    looser sweep tolerant of split/hyphenated names found this one and no
--    others.
--    REVIEW BEFORE RUNNING -- this permanently removes a row.
delete from public.places
where id = 'zain-abiya-way-120199562';

-- 5. ENRICHMENT, NOT REMOVAL: the freshly re-run live audit (see
--    place-confidence-report.md) flagged "Al Hidaya Academy"
--    (way/1428001236, "unverified", no address on file) as a removal
--    candidate, because its OSM source way is now tagged only
--    building=house with no name -- i.e. someone re-mapped/split that
--    building in OSM and the religion/amenity tags were lost. This is a
--    real, purpose-built mosque: it opened in Queensbury/Clayton Heights,
--    Bradford in September 2023, holds five daily prayers plus Jumu'ah
--    (13:30), and is independently listed by mosquefinder.co.uk,
--    faseela.org, mosquepay.co.uk and masjid247.com. Do NOT remove it --
--    fill in what those checks actually turned up instead.
update public.places
set
  address = coalesce(nullif(address, ''), 'off Chapel Lane, Highgate Road, Queensbury, Bradford, BD13 1EG'),
  phone   = coalesce(nullif(phone, ''), '01274 020064'),
  website = coalesce(nullif(website, ''), 'https://alhidayaacademy.org/')
where id = 'al-hidaya-academy-way-1428001236';

-- 6. NOT A MUSLIM PRAYER SPACE: "Sai Grace Ashram" (node/6791430556, Darsham,
--    Suffolk, type multi_faith_room, no address on file) is a Sai Baba
--    interfaith spiritual healing centre -- declared the UK's Sai Baba ashram
--    in 2016 and run by "Rev Leonora van Gils" (confirmed via independent web
--    coverage of the centre). It is not a Muslim prayer space and has no
--    connection to Islam; it appears to have been swept in by the same
--    generic OSM import that missed the denomination tag on other rows.
--    REVIEW BEFORE RUNNING -- this permanently removes a row.
delete from public.places
where id = 'sai-grace-ashram-node-6791430556';

-- 7. NOT A MUSLIM PRAYER SPACE: "Stanley House" (way/1077116575, Handforth,
--    Cheshire East, type masjid, no address on file) was researched during
--    the 2026-08-07 "address not recorded" sweep. It is a former pub (the
--    Waggon and Horses / Wacky Warehouse) that the Cheadle Muslim Association
--    -- the charity behind the real, separate Cheadle Masjid at 377 Wilmslow
--    Road, SK8 3NP -- is converting into a SECULAR community hub (cafe,
--    youth programmes, wellbeing support, sports, workspace, events venue).
--    News coverage (wilmslow.co.uk, MSN) explicitly states it "will not be
--    used as additional prayer space for Cheadle Masjid." It should not be
--    listed as a masjid; the CMA's actual mosque is the separate Cheadle
--    Masjid entry, which already exists in the dataset.
--    REVIEW BEFORE RUNNING -- this permanently removes a row.
delete from public.places
where id = 'stanley-house-way-1077116575';

commit;

-- 8. NOT INCLUDED ABOVE, FLAGGED FOR YOUR JUDGMENT: the same live audit also
--    flagged and downgraded "Peace Islamic Centre" (node/14040384655, 3 Hyde
--    Business Park, Derry/Londonderry BT48 0LU) to `unverified`, for the
--    same reason (its OSM node lost its tags). This is also a real,
--    well-documented place -- it is the North West Islamic Association,
--    a registered NI charity (reg. 104801) with ~1,000 members and its own
--    site at nwia.org.uk, currently operating from this address while a
--    former church on Clarendon Street (which will carry the "Peace
--    Islamic Centre" name) is converted for future use. The audit's scoring
--    can't see any of that -- it only sees a single OSM source that just
--    "went quiet". If you want to keep it above `unverified` pending that
--    move, run:
--
-- update public.places set confidence = 'community'
-- where id = 'peace-islamic-centre-node-14040384655';

-- 9. NOT INCLUDED ABOVE, FLAGGED FOR YOUR JUDGMENT -- POLICY CONFLICT: the
--    "address not recorded" sweep confirmed "Multifaith Prayer Room"
--    (node/13451361548) is the multifaith room inside HMP Ford, a working
--    Category D prison near Arundel, West Sussex (confirmed via the prison's
--    Independent Monitoring Board Annual Report 2022-2023 and GOV.UK). It
--    genuinely exists and its address is filled in over in
--    fix-addresses-2026-08-07.sql, but it serves prisoners and staff only --
--    it is not accessible to the public. That conflicts with this dataset's
--    standing rule that listed places must offer a public prayer space. If
--    you agree it should not be listed, run:
--
-- delete from public.places where id = 'multifaith-prayer-room-node-13451361548';

-- Sanity check after running blocks 1-7:
--   select count(*) from public.places; -- expect five fewer than before
--   select address, phone, website from public.places where id = 'mcindians-restaurant-mib-963' or id = 'al-hidaya-academy-way-1428001236';
