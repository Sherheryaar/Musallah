-- Address placeholder-junk cleanup, 2026-08-07 audit follow-up.
-- The import pipeline concatenated a blank "additional directions"-style CSV
-- column straight into the address field, so 69 rows carry literal
-- placeholder text ("n/a", "none", "not known", "None until 2015", a stray
-- +353/+44 dialling code, or an empty double-comma segment) as if it were a
-- real part of the street address. This surgically removes just that
-- segment; nothing else in the address is reformatted. Non-destructive --
-- only the address column changes, and no row loses real information (Irish
-- addresses that never had a postcode still won't have one after this --
-- the junk token was never a postcode, just a placeholder next to where one
-- might go).

begin;

-- Abu Bakr Masjid Trust (abu-bakr-masjid-trust-mib-2102)
-- was: 330 Oxford Road, None in 2015, Reading, RG30 1AF
update public.places set address = '330 Oxford Road, Reading, RG30 1AF' where id = 'abu-bakr-masjid-trust-mib-2102';

-- Al-Amanah Mosque (al-amanah-mosque-mib-242)
-- was: 29-35 Henley Street and Bordesley Centre, Camp Hill Island, , Camp Hill,Birmingham, Hall Green, B11 1AR
update public.places set address = '29-35 Henley Street and Bordesley Centre, Camp Hill Island, Camp Hill,Birmingham, Hall Green, B11 1AR' where id = 'al-amanah-mosque-mib-242';

-- Al Mustafa Islamic Centre (al-mustafa-islamic-centre-mib-1670)
-- was: 31 Coolmine Industrial Estate, Blanchardstown,Dublin,
update public.places set address = '31 Coolmine Industrial Estate, Blanchardstown,Dublin' where id = 'al-mustafa-islamic-centre-mib-1670';

-- Al-Rahman Mosque and Cultural Centre (al-rahman-mosque-and-cultural-centre-mib-159)
-- was: 3 Ellesmere Road, none, Burngreave,Sheffield, S4 7JA
update public.places set address = '3 Ellesmere Road, Burngreave,Sheffield, S4 7JA' where id = 'al-rahman-mosque-and-cultural-centre-mib-159';

-- Bait-ul-Mukarram Mosque (bait-ul-mukarram-mosque-mib-736)
-- was: 17 Wellington Road, n/a, Tipton,Sandwell, DY4 8RS
update public.places set address = '17 Wellington Road, Tipton,Sandwell, DY4 8RS' where id = 'bait-ul-mukarram-mosque-mib-736';

-- Ballyhaunis Mosque (ballyhaunis-mosque-mib-32)
-- was: 3 Sherwood Ave, Abbeyquarter, Ballyhaunis,None until 2015
update public.places set address = '3 Sherwood Ave, Abbeyquarter, Ballyhaunis' where id = 'ballyhaunis-mosque-mib-32';

-- Beaumont Leys Muslims (beaumont-leys-muslims-mib-15042201)
-- was: Home Farm Neighbourhood Centre, Home Farm Close,, Beaumont Leys,City of Leicester, LE4 0SU
update public.places set address = 'Home Farm Neighbourhood Centre, Home Farm Close, Beaumont Leys,City of Leicester, LE4 0SU' where id = 'beaumont-leys-muslims-mib-15042201';

-- Bilal Masjid (bilal-masjid-mib-504)
-- was: 39 Dunraven Street, none, Tondu, Aberkenfig ,Pen-y-bont ar Ogwr - Bridgend, CF32 9AS
update public.places set address = '39 Dunraven Street, Tondu, Aberkenfig ,Pen-y-bont ar Ogwr - Bridgend, CF32 9AS' where id = 'bilal-masjid-mib-504';

-- Blanchardstown Islamic Centre (blanchardstown-islamic-centre-mib-1671)
-- was: Unit 6, CoolPorts Business Park, Blanchardstown,Dublin,
update public.places set address = 'Unit 6, CoolPorts Business Park, Blanchardstown,Dublin' where id = 'blanchardstown-islamic-centre-mib-1671';

-- Bow Central Mosque & Islamic Centre (bow-central-mosque-islamic-centre-mib-1344)
-- was: 246 Bow Road, not known, Bow,Tower Hamlets, E3 3AP
update public.places set address = '246 Bow Road, Bow,Tower Hamlets, E3 3AP' where id = 'bow-central-mosque-islamic-centre-mib-1344';

-- British Estate Islamic Education Centre (british-estate-islamic-education-centre-mib-1514)
-- was: 31 Merchant Street, not known, Tower Hamlets, E3 4LX
update public.places set address = '31 Merchant Street, Tower Hamlets, E3 4LX' where id = 'british-estate-islamic-education-centre-mib-1514';

-- BWA Muslim Cultural Centre and Mosque (bwa-muslim-cultural-centre-and-mosque-mib-1320)
-- was: 10a Clifton Rise, none working, New Cross,Lewisham, SE14 6JP
update public.places set address = '10a Clifton Rise, New Cross,Lewisham, SE14 6JP' where id = 'bwa-muslim-cultural-centre-and-mosque-mib-1320';

-- Cavan Islamic Society (cavan-islamic-society-mib-303)
-- was: 9 Drumnavanagh Close, +353, Cavan,None until 2015
update public.places set address = '9 Drumnavanagh Close, Cavan' where id = 'cavan-islamic-society-mib-303';

-- Cavan Islamic Society (cavan-islamic-society-mib-600)
-- was: Kesh Road, +353, Gortnakesh,Cavan,
update public.places set address = 'Kesh Road, Gortnakesh,Cavan' where id = 'cavan-islamic-society-mib-600';

-- Charlton Mosque (charlton-mosque-mib-1144)
-- was: 30-32 Ransom Road, none, Charlton,Greenwich, SE7 8SR
update public.places set address = '30-32 Ransom Road, Charlton,Greenwich, SE7 8SR' where id = 'charlton-mosque-mib-1144';

-- Chiswick Park Mosque (chiswick-park-mosque-mib-1211)
-- was: Riverside Properties, 10 London Stile, Wellesley Road, n/a, Chiswick,Hounslow, W4 3AU
update public.places set address = 'Riverside Properties, 10 London Stile, Wellesley Road, Chiswick,Hounslow, W4 3AU' where id = 'chiswick-park-mosque-mib-1211';

-- Cork Islamic Centre (cork-islamic-centre-mib-626)
-- was: 69 Riverview Estate, Clashduv Road, +353, Cork,
update public.places set address = '69 Riverview Estate, Clashduv Road, Cork' where id = 'cork-islamic-centre-mib-626';

-- Dorset Islamic Cultural Association (dorset-islamic-cultural-association-mib-243)
-- was: 59-63 Ashley Road, Not known, Poole, BH14 9BT
update public.places set address = '59-63 Ashley Road, Poole, BH14 9BT' where id = 'dorset-islamic-cultural-association-mib-243';

-- Galway Islamic Centre (galway-islamic-centre-mib-771)
-- was: 13 Sandyview Drive, Riverside, +353, Galway,H91 KR22
update public.places set address = '13 Sandyview Drive, Riverside, Galway,H91 KR22' where id = 'galway-islamic-centre-mib-771';

-- Hira Masjid (hira-masjid-mib-673)
-- was: 62 Toller Lane, not known, Heaton,Bradford, BD8 9DA
update public.places set address = '62 Toller Lane, Heaton,Bradford, BD8 9DA' where id = 'hira-masjid-mib-673';

-- Iqra Learning Centre (iqra-learning-centre-mib-711)
-- was: ILC Darnley, West Hurlet House, Glasgow Road, not known, Barrhead,East Renfrewshire, G53 7TH
update public.places set address = 'ILC Darnley, West Hurlet House, Glasgow Road, Barrhead,East Renfrewshire, G53 7TH' where id = 'iqra-learning-centre-mib-711';

-- Islamic Cultural Centre of Ireland (islamic-cultural-centre-of-ireland-mib-722)
-- was: 19 Roebuck Road, +353, Clonskeagh,Dublin,D14
update public.places set address = '19 Roebuck Road, Clonskeagh,Dublin,D14' where id = 'islamic-cultural-centre-of-ireland-mib-722';

-- Islamic Culture Centre of Tuam (islamic-culture-centre-of-tuam-mib-372)
-- was: 177 Palace Fields, +353, Tuam,Not until 2015
update public.places set address = '177 Palace Fields, Tuam' where id = 'islamic-culture-centre-of-tuam-mib-372';

-- Islamic Society (islamic-society-mib-1928)
-- was: King George VI Building, University of Newcastle upon Tyne, , Newcastle upon Tyne, NE1 7RU
update public.places set address = 'King George VI Building, University of Newcastle upon Tyne, Newcastle upon Tyne, NE1 7RU' where id = 'islamic-society-mib-1928';

-- Jame Masjid and Madrassa Salafia Skipton (jame-masjid-and-madrassa-salafia-skipton-mib-2230)
-- was: 23-25 Midland Street, not known, Craven, BD23 1SE
update public.places set address = '23-25 Midland Street, Craven, BD23 1SE' where id = 'jame-masjid-and-madrassa-salafia-skipton-mib-2230';

-- Jame Masjid Ghausia (jame-masjid-ghausia-mib-548)
-- was: 19-24 Princess Street and 28-30 Princess Street, not known, East Staffordshire, DE14 2NW
update public.places set address = '19-24 Princess Street and 28-30 Princess Street, East Staffordshire, DE14 2NW' where id = 'jame-masjid-ghausia-mib-548';

-- Jamia Khulafa-e-Rashidin Ahle Sunnat wal Jamaat Islamic Centre (jamia-khulafa-e-rashidin-ahle-sunnat-wal-jamaat-islamic-cent-mib-15042301)
-- was: 2a Valentia Road, n/a, Reading, RG30 1DL
update public.places set address = '2a Valentia Road, Reading, RG30 1DL' where id = 'jamia-khulafa-e-rashidin-ahle-sunnat-wal-jamaat-islamic-cent-mib-15042301';

-- Jamia Masjid Aston (jamia-masjid-aston-mib-252)
-- was: 2 Trinity Road, not known, Aston (north west),Birmingham, Ladywood, B6 6AG
update public.places set address = '2 Trinity Road, Aston (north west),Birmingham, Ladywood, B6 6AG' where id = 'jamia-masjid-aston-mib-252';

-- Jamiah Masjid Anwar-e-Mustafa (jamiah-masjid-anwar-e-mustafa-mib-2153)
-- was: 112-114a College Road, not known, Masborough,Rotherham, S60 1JF
update public.places set address = '112-114a College Road, Masborough,Rotherham, S60 1JF' where id = 'jamiah-masjid-anwar-e-mustafa-mib-2153';

-- Jamiat-ul-Muslimeen Jamia Masjid (jamiat-ul-muslimeen-jamia-masjid-mib-2363)
-- was: 19-21 Arpley Street, n/a, Warrington, WA1 1LX
update public.places set address = '19-21 Arpley Street, Warrington, WA1 1LX' where id = 'jamiat-ul-muslimeen-jamia-masjid-mib-2363';

-- Jumu'ah Salaah (jumu-ah-salaah-mib-1049)
-- was: Edgware Islamic Centre c/o Watlington Community Association,, Edgware,Barnet, HA8 0TR
update public.places set address = 'Edgware Islamic Centre c/o Watlington Community Association, Edgware,Barnet, HA8 0TR' where id = 'jumu-ah-salaah-mib-1049';

-- Jumu'ah Salaah (jumu-ah-salaah-mib-770)
-- was: Westside Community Centre, Seamus Quirke Road, Westside, +353, Galway,None till 2015
update public.places set address = 'Westside Community Centre, Seamus Quirke Road, Westside, Galway' where id = 'jumu-ah-salaah-mib-770';

-- Jumu'ah Salaah organised by Isle of Man Muslim Association (jumu-ah-salaah-organised-by-isle-of-man-muslim-association-mib-2016062701)
-- was: Onchan Youth and Community Centre, School Road, Onchan,Manx,
update public.places set address = 'Onchan Youth and Community Centre, School Road, Onchan,Manx' where id = 'jumu-ah-salaah-organised-by-isle-of-man-muslim-association-mib-2016062701';

-- Jumu'ah Salaah organised by Jamiya Masjid and Islamic Centre (JMIC) (jumu-ah-salaah-organised-by-jamiya-masjid-and-islamic-centre-mib-1088)
-- was: hire of Bromley Common Village Hall on Friday, not known, Bromley area,Bromley, BR2 8NZ
update public.places set address = 'hire of Bromley Common Village Hall on Friday, Bromley area,Bromley, BR2 8NZ' where id = 'jumu-ah-salaah-organised-by-jamiya-masjid-and-islamic-centre-mib-1088';

-- Khatemun-Nabeyeen Mosque (khatemun-nabeyeen-mosque-mib-1254)
-- was: 35 Stockwell Green, none working, Stockwell,Lambeth, SW9 9HZ
update public.places set address = '35 Stockwell Green, Stockwell,Lambeth, SW9 9HZ' where id = 'khatemun-nabeyeen-mosque-mib-1254';

-- Kilkenny Islamic Centre (kilkenny-islamic-centre-mib-3004)
-- was: Desert Villa, Freshford Road, +353, Kilkenny,Not until 2015
update public.places set address = 'Desert Villa, Freshford Road, Kilkenny' where id = 'kilkenny-islamic-centre-mib-3004';

-- Lambeth Islamic Cultural Centre (lambeth-islamic-cultural-centre-mib-1244)
-- was: 30 Bellefields Road, not known, Brixton,Lambeth, SW9 9UQ
update public.places set address = '30 Bellefields Road, Brixton,Lambeth, SW9 9UQ' where id = 'lambeth-islamic-cultural-centre-mib-1244';

-- Limerick City Centre Masjid (limerick-city-centre-masjid-mib-3006)
-- was: 76 O'Connell Street, Limerick,Not until 2015
update public.places set address = '76 O''Connell Street, Limerick' where id = 'limerick-city-centre-masjid-mib-3006';

-- Limerick Islamic Centre (limerick-islamic-centre-mib-3005)
-- was: Old Dooradoyle Road, +353, Dooradoyle,Limerick,Not until 2015
update public.places set address = 'Old Dooradoyle Road, Dooradoyle,Limerick' where id = 'limerick-islamic-centre-mib-3005';

-- Limerick Islamic Society (limerick-islamic-society-mib-1024)
-- was: 54 Raheen Gardens, +353, Raheen,Limerick,Not until 2015
update public.places set address = '54 Raheen Gardens, Raheen,Limerick' where id = 'limerick-islamic-society-mib-1024';

-- Masjid-e-Bilal & Islamic Centre (masjid-e-bilal-islamic-centre-mib-2144)
-- was: 2-4 Beaconsfield Street, none, Haslingden,Rossendale, BB4 5TD
update public.places set address = '2-4 Beaconsfield Street, Haslingden,Rossendale, BB4 5TD' where id = 'masjid-e-bilal-islamic-centre-mib-2144';

-- Masjid-e-Noor (masjid-e-noor-mib-83)
-- was: 149-150 New John Street, not known, Halesowen,Dudley, B62 8HT
update public.places set address = '149-150 New John Street, Halesowen,Dudley, B62 8HT' where id = 'masjid-e-noor-mib-83';

-- Masjid Ezzeitouna (masjid-ezzeitouna-mib-523)
-- was: 6 Western Avenue, none, East Acton,Ealing, W3 7UD
update public.places set address = '6 Western Avenue, East Acton,Ealing, W3 7UD' where id = 'masjid-ezzeitouna-mib-523';

-- Masjid (masjid-mib-2785)
-- was: 79 Wellesley Road, not known, Methil,Fife, KY8 3AD
update public.places set address = '79 Wellesley Road, Methil,Fife, KY8 3AD' where id = 'masjid-mib-2785';

-- Masjid (masjid-mib-2999)
-- was: 3 Rampart Court, Rampart Lane, Dundalk,Not until 2015
update public.places set address = '3 Rampart Court, Rampart Lane, Dundalk' where id = 'masjid-mib-2999';

-- Masjid (masjid-mib-3002)
-- was: Ashley House, Dublin Road, PortLaoise,Not until 2015
update public.places set address = 'Ashley House, Dublin Road, PortLaoise' where id = 'masjid-mib-3002';

-- Masjid (masjid-mib-3003)
-- was: 141 Abbeylands, Mullingar,Not until 2015
update public.places set address = '141 Abbeylands, Mullingar' where id = 'masjid-mib-3003';

-- Masjid Wa Madrasah Usman Gani (RA) (masjid-wa-madrasah-usman-gani-ra-mib-1913)
-- was: Stanley Street, not known, Brierfield,Pendle, BB9 5DL
update public.places set address = 'Stanley Street, Brierfield,Pendle, BB9 5DL' where id = 'masjid-wa-madrasah-usman-gani-ra-mib-1913';

-- McDougall's Prayer Hall (mcdougall-s-prayer-hall-mib-1845)
-- was: McDougall Centre, Manchester University, Burlington Street, , Manchester, M15 6HQ
update public.places set address = 'McDougall Centre, Manchester University, Burlington Street, Manchester, M15 6HQ' where id = 'mcdougall-s-prayer-hall-mib-1845';

-- Medina Mosque (medina-mosque-mib-222)
-- was: 7 Park Avenue, not known, Hockley,Birmingham, Ladywood, B18 5ND
update public.places set address = '7 Park Avenue, Hockley,Birmingham, Ladywood, B18 5ND' where id = 'medina-mosque-mib-222';

-- Mitcham Islamic Centre (mitcham-islamic-centre-mib-496)
-- was: 246-248 London Road, none, Mitcham,Merton, CR4 3HD
update public.places set address = '246-248 London Road, Mitcham,Merton, CR4 3HD' where id = 'mitcham-islamic-centre-mib-496';

-- Mosque and Islamic Centre (mosque-and-islamic-centre-mib-723)
-- was: 163 South Circular Road, +353, Dublin,D8
update public.places set address = '163 South Circular Road, Dublin,D8' where id = 'mosque-and-islamic-centre-mib-723';

-- Mosque & Islamic Society (mosque-islamic-society-mib-2722)
-- was: Unit D, Sitecast Industrial Estate, +353, Togher,Cork,Not until 2015
update public.places set address = 'Unit D, Sitecast Industrial Estate, Togher,Cork' where id = 'mosque-islamic-society-mib-2722';

-- Multifaith Room (multifaith-room-mib-17080504)
-- was: Southwold Building, Great Ormond Street Hospital,, Bloomsbury,Camden, WC1N 3JH
update public.places set address = 'Southwold Building, Great Ormond Street Hospital, Bloomsbury,Camden, WC1N 3JH' where id = 'multifaith-room-mib-17080504';

-- Musallah (musallah-mib-3008)
-- was: Dwelling House, Kilirisk Road, Fortfield,Tralee,Not until 2015
update public.places set address = 'Dwelling House, Kilirisk Road, Fortfield,Tralee' where id = 'musallah-mib-3008';

-- Musallah (musallah-mib-3009)
-- was: 10 Springfield, Ennis,Not until 2015
update public.places set address = '10 Springfield, Ennis' where id = 'musallah-mib-3009';

-- New Peckham Mosque (new-peckham-mosque-mib-1321)
-- was: 99-101 Cobourg Road, not known, Peckham,Southwark, SE5 0HU
update public.places set address = '99-101 Cobourg Road, Peckham,Southwark, SE5 0HU' where id = 'new-peckham-mosque-mib-1321';

-- Nusrat-e-Islami Masjid (nusrat-e-islami-masjid-mib-472)
-- was: 94-98 Preston Street, none, Listerhills,Bradford, BD7 1JP
update public.places set address = '94-98 Preston Street, Listerhills,Bradford, BD7 1JP' where id = 'nusrat-e-islami-masjid-mib-472';

-- Omar Faruque Mosque and Cultural Centre (omar-faruque-mosque-and-cultural-centre-mib-2539)
-- was: Kirkwood Road, none, Cambridge, CB4 2PF
update public.places set address = 'Kirkwood Road, Cambridge, CB4 2PF' where id = 'omar-faruque-mosque-and-cultural-centre-mib-2539';

-- Pakistan Islamic Centre (pakistan-islamic-centre-mib-2149)
-- was: 16-18 Peter Street, not known, Rawtenstall,Rossendale, BB4 7NR
update public.places set address = '16-18 Peter Street, Rawtenstall,Rossendale, BB4 7NR' where id = 'pakistan-islamic-centre-mib-2149';

-- Prayer Room (prayer-room-mib-1101)
-- was: Leicester Royal Infirmary, Infirmary Square,, City of Leicester, LE1 5WW
update public.places set address = 'Leicester Royal Infirmary, Infirmary Square, City of Leicester, LE1 5WW' where id = 'prayer-room-mib-1101';

-- Prayer Room (prayer-room-mib-16050105)
-- was: 3rd Floor, Gateway Surgical Centre, Newham General Hospital,, Newham, E13 8SL
update public.places set address = '3rd Floor, Gateway Surgical Centre, Newham General Hospital, Newham, E13 8SL' where id = 'prayer-room-mib-16050105';

-- Prayer Room (prayer-room-mib-2750)
-- was: E Block Building 20, University of South Wales, Main Campus,, Trefforest,Rhondda Cynon Taf - Rhondda Cynon Taf, CF37 1DL
update public.places set address = 'E Block Building 20, University of South Wales, Main Campus, Trefforest,Rhondda Cynon Taf - Rhondda Cynon Taf, CF37 1DL' where id = 'prayer-room-mib-2750';

-- Shah Jalal Masjid (shah-jalal-masjid-mib-1557)
-- was: 47A Electricity Street, not known, Cheshire East, CW2 7EW
update public.places set address = '47A Electricity Street, Cheshire East, CW2 7EW' where id = 'shah-jalal-masjid-mib-1557';

-- Shah Jalal Mosque and Islamic Cultural Centre (shah-jalal-mosque-and-islamic-cultural-centre-mib-2605)
-- was: 170 Handcroft Road, not known, West Croydon,Croydon, CR0 3LE
update public.places set address = '170 Handcroft Road, West Croydon,Croydon, CR0 3LE' where id = 'shah-jalal-mosque-and-islamic-cultural-centre-mib-2605';

-- Shair-e-Rabbani Islamic Centre and Mosque (shair-e-rabbani-islamic-centre-and-mosque-mib-1860)
-- was: 4 Tariff Street, not known, Manchester, M1 2FF
update public.places set address = '4 Tariff Street, Manchester, M1 2FF' where id = 'shair-e-rabbani-islamic-centre-and-mosque-mib-1860';

-- Taunton Central Masjid and Islamic Centre (taunton-central-masjid-and-islamic-centre-mib-261)
-- was: Ivor House, Tower Lane, none, Taunton Deane, TA1 4AR
update public.places set address = 'Ivor House, Tower Lane, Taunton Deane, TA1 4AR' where id = 'taunton-central-masjid-and-islamic-centre-mib-261';

-- The Zawiya (the-zawiya-mib-121)
-- was: 1 Jenkins Street, not known, Small Heath,Birmingham, Ladywood, B10 0QH
update public.places set address = '1 Jenkins Street, Small Heath,Birmingham, Ladywood, B10 0QH' where id = 'the-zawiya-mib-121';

-- Waterford Musalla (waterford-musalla-mib-2365)
-- was: 1 Viewmount Park, Waterford,Not until 2015
update public.places set address = '1 Viewmount Park, Waterford' where id = 'waterford-musalla-mib-2365';

commit;

-- Sanity check: should return 0 rows (no placeholder tokens left in any address).
--   select id, address from public.places
--   where address ~* '(n/a|not known|none until|none till|not until|none working)\y'
--      or address ~ '\+[0-9]{2,4}\M';

-- ---------------------------------------------------------------------------
-- Individually-verified fixes for addresses that were truncated to
-- something other than a placeholder token (a bare housenumber, or a wrong
-- digit in a postcode). Each was independently confirmed against the named
-- source before being included here.
-- ---------------------------------------------------------------------------

begin;

-- "North Tyneside Bangladeshi Community Association & Mosque" stored only
-- the housenumber "6" -- the street/town/postcode were dropped on import.
-- Confirmed address: ntbca.org.uk and the association's own Facebook page
-- (facebook.com/NTBCAWBAY) both give 6 Esplanade Place, Whitley Bay,
-- NE26 2AU; postcodes.io places NE26 2AU 24 m from the stored pin.
update public.places
set address = '6 Esplanade Place, Whitley Bay, NE26 2AU'
where id = 'north-tyneside-bangladeshi-community-association-mosque-node-7638240544';

-- "The Sanctuary" stored only "30" -- this is Gate 30, not a housenumber.
-- Confirmed via North Bristol NHS Trust's own spiritual-care page
-- (nbt.nhs.uk): The Sanctuary is on Level 1 of the Brunel Building,
-- Southmead Hospital, reached via Gate 30. postcodes.io places Southmead
-- Hospital's postcode 55 m from the stored pin.
update public.places
set address = 'Gate 30, Level 1, Brunel Building, Southmead Hospital, Bristol, BS10 5NB'
where id = 'the-sanctuary-node-5816298510';

-- "European Islamic Centre" (Oldham) has a postcode typo: "0L8 4LN" uses a
-- digit zero where a UK postcode's outward code must start with a letter
-- ("OL8" is Oldham's real postcode area). Confirmed via the centre's own
-- site, ukimoldham.org.uk. Coordinates are unaffected -- text only.
update public.places
set address = 'Werneth House, 79 Manchester Road, Oldham, OL8 4LN'
where id = 'european-islamic-centre-mib-1150';

commit;

-- Sanity check:
--   select address from public.places where id in (
--     'north-tyneside-bangladeshi-community-association-mosque-node-7638240544',
--     'the-sanctuary-node-5816298510',
--     'european-islamic-centre-mib-1150'
--   );

-- ---------------------------------------------------------------------------
-- Remaining incomplete addresses (street present, postcode/city missing).
-- Every fix below is anchored by a postcodes.io reverse-geocode of the
-- place's own stored lat/lng (distances noted), and cross-checked against
-- an independent web source where one exists. Where no independent source
-- could confirm the exact building, that is called out explicitly -- the
-- postcode is still trustworthy (it comes from the coordinates, not the
-- name-matching step), but treat the *venue identity* as unconfirmed.
-- ---------------------------------------------------------------------------

begin;

-- Al Falah Community Centre: postcode 42 m from the pin.
update public.places set address = '64a Compton Avenue, Luton, LU4 9AY'
where id = 'al-falah-community-centre-way-828805026';

-- Al-Hudaa Islamic Prayer Group: postcode 26 m from the pin.
update public.places set address = '150 Homerton High Street, London, E9 6FP'
where id = 'al-hudaa-islamic-prayer-group-node-7687610864';

-- Al-Majid Centre: confirmed via its own PraySalat/MosquePay listings --
-- "215 Northumberland Ave, Reading RG2 7PX" (city and postcode were both
-- missing from our record).
update public.places set address = '215 Northumberland Avenue, Reading, RG2 7PX'
where id = 'al-majid-centre-node-13909896301';

-- BECA East Street Islamic Centre: independently confirmed as a real,
-- active mosque (dated Taraweeh/Tahajjud recordings under this exact name),
-- distinct from the nearby Old Kent Road Mosque and from BECA Masjid
-- (Peckham) -- but no independent source gave its exact house number, so
-- only the postcode from the stored pin (37 m away) is added; the venue's
-- exact street number is still worth a human confirming.
update public.places set address = 'Old Kent Road, London, SE1 5NA'
where id = 'beca-east-street-islamic-centre-node-13859056964';

-- Darul Ummah Goresbrook: postcode 45 m from the pin.
update public.places set address = '36 Maplestead Road, Dagenham, RM9 4XH'
where id = 'darul-ummah-goresbrook-way-1135456390';

-- Faizan-E-Madinah: postcode 27 m from the pin.
update public.places set address = '577-579 Fishponds Road, Bristol, BS16 3AE'
where id = 'faizan-e-madinah-way-631336714';

-- Greenbank Masjid: address was just "Bristol" -- confirmed via the
-- mosque's own site, greenbankbristol.org (housed in the former Castle
-- Green United Reformed Church).
update public.places set address = 'Castle Green Buildings, Greenbank Road, Bristol, BS5 6HE'
where id = 'greenbank-masjid-way-394676530';

-- Inverness Masjid: postcode 39 m from the pin.
update public.places set address = 'Portland Place, Inverness, IV1 1NB'
where id = 'inverness-masjid-node-10693365094';

-- Islamic Cultural Centre Neasden: postcode 23 m from the pin.
update public.places set address = '259 Neasden Lane, London, NW10 1QG'
where id = 'islamic-cultural-centre-neasden-node-6019922909';

-- Jamia Masjid St Ives Mosque: postcode 6 m from the pin.
update public.places set address = '22 Needingworth Road, St Ives, PE27 5JN'
where id = 'jamia-masjid-st-ives-mosque-node-552455084';

-- Lucan mosque: the trailing "D4" is WRONG, not just incomplete -- D4 is the
-- Dublin 4 (Ballsbridge) postal district, nowhere near Lucan. Lucan sits in
-- the separate Eircode routing-key area K78 (confirmed via the Lucan
-- Islamic Centre of Ireland's own Mawaqit listing, which gives its Eircode
-- as starting K78), so "D4" cannot be right for any Lucan address. Removed
-- rather than guessed at, since the full 7-character Eircode isn't known.
update public.places set address = '1 Liffey Road, Lucan'
where id = 'lucan-mosque-mib-300';

-- Masjid Almukhbiteen: "Masjid Almukhbiteen" turns up associated with
-- Shepherd's Bush Mosque (302 Uxbridge Road, W12 7LJ) in search results,
-- but our stored house number is 356-358 -- a different number on the same
-- long road, so this may be a distinct address rather than the same
-- venue under another name. Only the postcode from the stored pin (12 m
-- away) is added; the house number is left as-is rather than overwritten
-- on an unconfirmed guess.
update public.places set address = '356-358 Uxbridge Road, London, W12 7LL'
where id = 'masjid-almukhbiteen-node-8634306003';

-- Masjid Isa Ibn Maryam: confirmed via the mosque's own site,
-- isaibnmaryam.co.uk -- "98 Dames Road, London, E7 0EB" (matches our house
-- number exactly; only city/postcode were missing).
update public.places set address = '98 Dames Road, London, E7 0EB'
where id = 'masjid-isa-ibn-maryam-way-887069968';

-- Masjid Taha: postcode 27 m from the pin.
update public.places set address = '6-7 Park Lane, London, E15 2JG'
where id = 'masjid-taha-way-107024172';

-- Multi-Faith Chaplaincy (Aberdeen): postcode 20 m from the pin.
update public.places set address = '25 High Street, Aberdeen, AB24 3EA'
where id = 'multi-faith-chaplaincy-way-327065335';

-- Muslim Prayer Rooms (Dundee): postcode 41 m from the pin.
update public.places set address = 'Airlie Place, Dundee, DD1 4HQ'
where id = 'muslim-prayer-rooms-node-13000115153';

-- ShahJalaal Islamic Centre (Reading): postcode 30 m from the pin.
update public.places set address = '2 Stanley Street, Reading, RG1 7EY'
where id = 'shahjalaal-islamic-centre-way-541927176';

-- Tawakul: could not be independently confirmed by name -- no directory
-- lists a "Tawakul" on Dorothy Road. Postcode is from the stored pin alone
-- (43 m away); the venue's name/identity is unconfirmed, so it may be worth
-- a human double-check rather than treating this as fully resolved.
update public.places set address = '100B Dorothy Road, Leicester, LE5 5DQ'
where id = 'tawakul-node-13327052350';

-- Walworth Road Mosque: confirmed via its Charity Commission registration
-- (as "Dairatul Amni Islamic Welfare UK") -- "175A Walworth Road" (matches
-- our house number exactly), postcode SE17 1RW.
update public.places set address = '175A Walworth Road, London, SE17 1RW'
where id = 'walworth-road-mosque-node-13437720452';

-- Wirral Deen Centre: postcode 38 m from the pin.
update public.places set address = '371-375 Borough Road, Birkenhead, CH42 0HA'
where id = 'wirral-deen-centre-way-254523652';

commit;

-- NOT INCLUDED: "Ballyhaunis Mosque" (ballyhaunis-mosque-mib-32, "3 Sherwood
-- Ave, Abbeyquarter, Ballyhaunis" after the placeholder-junk cleanup above)
-- has no UK postcode or Eircode available -- postcodes.io does not cover
-- Eircodes, and no independent source turned up its exact Eircode. Left as
-- an honest partial address rather than guessed at.

-- Sanity check:
--   select id, address from public.places where id in (
--     'al-falah-community-centre-way-828805026', 'al-hudaa-islamic-prayer-group-node-7687610864',
--     'al-majid-centre-node-13909896301', 'beca-east-street-islamic-centre-node-13859056964',
--     'darul-ummah-goresbrook-way-1135456390', 'faizan-e-madinah-way-631336714',
--     'greenbank-masjid-way-394676530', 'inverness-masjid-node-10693365094',
--     'islamic-cultural-centre-neasden-node-6019922909', 'jamia-masjid-st-ives-mosque-node-552455084',
--     'lucan-mosque-mib-300', 'masjid-almukhbiteen-node-8634306003',
--     'masjid-isa-ibn-maryam-way-887069968', 'masjid-taha-way-107024172',
--     'multi-faith-chaplaincy-way-327065335', 'muslim-prayer-rooms-node-13000115153',
--     'shahjalaal-islamic-centre-way-541927176', 'tawakul-node-13327052350',
--     'walworth-road-mosque-node-13437720452', 'wirral-deen-centre-way-254523652'
--   );

-- ---------------------------------------------------------------------------
-- FINAL SWEEP (2026-08-07): the remaining 113 "Address not recorded yet"
-- places (OSM imports with coordinates but no address tag at all) were each
-- individually researched -- website first, then web search anchored by the
-- place's own reverse-geocoded district/postcode, then independent mosque
-- directories, charity/council/university/NHS records. Below are the 92
-- places a specific, independently-sourced street address was found for.
-- Every address was cross-checked against the stored pin's own
-- reverse-geocoded postcode; where the two differ by more than a few dozen
-- metres that is called out. Two places from this same sweep are NOT here:
-- "Sai Grace Ashram" and "Stanley House" turned out not to be Muslim prayer
-- spaces at all, and are proposed for removal instead in
-- fix-audit-2026-08-07.sql. A further 16 places could not be pinned to a
-- specific street address (best available anchor is just the reverse-geocoded
-- district) and 1 had no location data at all to search from -- none of
-- those are included here, per the same "never fabricate an address" rule.
-- ---------------------------------------------------------------------------

begin;

-- Abu Bakr Siddique Masjid: consistent across 4 independent mosque directories.
update public.places set address = '105 Kirkgate, Wakefield, West Yorkshire, WF1 1JG'
where id = 'abu-bakr-siddique-masjid-way-61012198';

-- Al Abrar Academy Masjid: Charity Commission registered address + own site.
update public.places set address = '10-20 Heap Lane, Bradford, West Yorkshire, BD3 0DT'
where id = 'al-abrar-academy-masjid-way-1427976307';

-- Al-Amin Masjid: business listing cross-referenced with 4 mosque directories.
update public.places set address = '71 Mexborough Drive, Leeds, LS7 3EL'
where id = 'al-amin-masjid-way-616095449';

-- Al-Mustafa Centre (Bradford, BD8): confirmed on the centre's own website.
update public.places set address = '249 Kensington Street, Girlington, Bradford, West Yorkshire, BD8 9LN'
where id = 'al-mustafa-centre-node-13128244550';

-- Al-Mustafa Centre (Middlesbrough): street unanimous across 5 directories.
update public.places set address = 'Parliament Road, Middlesbrough, TS1 5PE'
where id = 'al-mustafa-centre-way-1428046678';

-- Al-Mustaqeem Centre: Bradford Council planning portal + 2 directories.
update public.places set address = '4 Central Avenue, Bradford, West Yorkshire, BD5 0PB'
where id = 'al-mustaqeem-centre-way-1524412540';

-- Al-Rahmah Faith Centre: confirmed on the centre's own website, exact postcode match.
update public.places set address = '6 Sheepscar Way, Leeds, LS7 3JB'
where id = 'al-rahmah-faith-centre-node-13130476528';

-- Al-Shafeey Centre: two independent directories agree; postcode is ~1 mile
-- from the stored pin's nearest postcode, so treat the street number with
-- some caution even though it's the best sourced address found.
update public.places set address = '3 Balfour Road, Darnall, Sheffield, S9 4RX'
where id = 'al-shafeey-centre-way-1428085353';

-- As Sabr: postcode matches the pin exactly, but the venue does not appear
-- in Tower Hamlets Council's official mosque directory -- may be a small,
-- informal, or since-closed prayer space. Moderate-high confidence only.
update public.places set address = '62 Ben Jonson Road, London, E1 4QQ'
where id = 'as-sabr-node-8938826920';

-- Bethel Chapel: since 2023 this church building also houses "Sketty Mosque
-- and Community Centre" (Swansea Council, Charity Commission 1214336) --
-- confirmed as a real, current shared-use Muslim prayer space, not a mix-up.
update public.places set address = 'Sketty Mosque and Community Centre, Bethel United Reform Church, Sketty Park Road, Sketty, Swansea, SA2 9AS'
where id = 'bethel-chapel-way-885612663';

-- Chaplaincy (University of Surrey): postcode matches the pin exactly; venue
-- houses a multi-faith lounge alongside a Christian oratory and Jewish room.
update public.places set address = 'The Chaplaincy Centre (The Roundhouse), Stag Hill Campus, University of Surrey, Guildford, Surrey, GU2 7XH'
where id = 'chaplaincy-node-4971912746';

-- Craigavon Mosque: 3 independent directories agree on Legahory Centre.
update public.places set address = 'Legahory Centre, Legahory, Craigavon, County Armagh, BT65 5BE'
where id = 'craigavon-mosque-node-13208406265';

-- Faith Room: exact postcode match; UK community hospitals routinely have a
-- small multi-faith "Faith Room", consistent with the OSM tag.
update public.places set address = 'Johnson Community Hospital, Spalding Road, Spalding, Lincolnshire, PE11 3DT'
where id = 'faith-room-node-13306027073';

-- Faiz e Raza: distinguished from a differently-located, similarly-named
-- "Raza Centre" elsewhere in Leicester (Egginton Street) -- not the same place.
update public.places set address = 'Faiz-e-Raza Academy, Humberstone Road, Leicester, LE5 3DF'
where id = 'faiz-e-raza-way-1279017860';

-- Faizan E Madina Jamia Masjid: exact postcode match.
update public.places set address = '11a Pilgrim Avenue, Dewsbury, WF13 3NQ'
where id = 'faizan-e-madina-jamia-masjid-way-1428145312';

-- Faizan-e-Madina (Halifax): two independent Dawat-e-Islami sources agree.
update public.places set address = 'Queens Road Mills, Gibbet Street, Halifax, HX1 4JX'
where id = 'faizan-e-madina-node-13129750366';

-- Faizan e Madina (Leeds): directory-confirmed, close to the stored pin.
update public.places set address = '58-62 Francis Street, Chapel Allerton, Leeds, LS7 4BU'
where id = 'faizan-e-madina-way-1428165477';

-- Faizan e Madinah (Huddersfield): 3 independent sources agree; distinct
-- from a similarly-named but differently-located "Faizan E Madina Jamia
-- Masjid" also in Dewsbury -- not conflated.
update public.places set address = '75 New North Road, Huddersfield, HD1 5ND'
where id = 'faizan-e-madinah-node-13129929764';

-- Faizan-e-Madinah (Ravensthorpe): Dawat-e-Islami Yorkshire's own site, exact postcode match.
update public.places set address = 'Faizan-e-Madinah Education Centre, John Street, Ravensthorpe, Dewsbury, WF13 3LE'
where id = 'faizan-e-madinah-node-13129990702';

-- Faizan E Madinah (Rotherham): exact postcode match across 3 directories.
update public.places set address = 'Maltkiln Street, Rotherham, South Yorkshire, S60 2HY'
where id = 'faizan-e-madinah-way-385304637';

-- Faizan e Makkah Masjid: a converted former church; 4 independent sources agree.
update public.places set address = 'Lilycroft Road, Bradford, BD9 5AB'
where id = 'faizan-e-makkah-masjid-way-1428002130';

-- Felicity House: Islamic community building (nursery, education, prayer
-- hall) confirmed via Greensville Trust, the charity that runs it.
update public.places set address = 'Felicity House, Northdale Road, Liverpool, L15 4HT'
where id = 'felicity-house-way-650262937';

-- Feltham Masjid: matched to the CSCA-run "Feltham Masjid" specifically,
-- distinguished from two other, separate mosques in the same Feltham area.
update public.places set address = 'The Manor House, Manor Lane, Feltham, TW13 4JQ'
where id = 'feltham-masjid-way-23548668';

-- Ferham Islamic Cultural Centre: Charity Commission registered address, exact postcode match.
update public.places set address = '59 Holmes Lane, Rotherham, S61 1BH'
where id = 'ferham-islamic-cultural-centre-way-1428084687';

-- Firdaws Mosque: Charity Commission registered address (as "Firdaws Islamic Centre").
update public.places set address = 'Firdaws Islamic Centre, 75 Edward Street, Bradford, BD4 7BB'
where id = 'firdaws-mosque-way-201227502';

-- Goldsmiths Multifaith Prayer Room: Goldsmiths, University of London's own site.
update public.places set address = 'Richard Hoggart Building, 8 Lewisham Way, New Cross, London, SE14 6NW'
where id = 'goldsmiths-multifaith-prayer-room-node-1656342372';

-- Hendon Jami Masjid: 4 independent sources agree; note the Sunderland
-- "Hendon" district, not the London suburb of the same name.
update public.places set address = '6 Laura Street, Hendon, Sunderland, SR1 2QT'
where id = 'hendon-jami-masjid-way-1158181483';

-- Hough End Hall Academy: directory-confirmed, matches the pin's district.
update public.places set address = '95 Nell Lane, Manchester, M21 7SW'
where id = 'hough-end-hall-academy-node-11804834009';

-- Imam Yusuf Motala Academy: business-directory listings agree, exact postcode match.
update public.places set address = '68 Idle Road, Bradford, West Yorkshire, BD2 4NH'
where id = 'imam-yusuf-motala-academy-way-1350357402';

-- Indonesian Islamic Centre: confirmed on the centre's own site (iic-london.com).
update public.places set address = 'Clifford Way, Neasden, London, NW10 1AN'
where id = 'indonesian-islamic-centre-node-12830228966';

-- Iqra Masjid: multiple independent listings agree, exact postcode match.
update public.places set address = 'The Iqra Centre, off Farriers Croft, King''s Road, Bradford, BD2 1ET'
where id = 'iqra-masjid-way-1427957582';

-- Islamic Prayer Rooms: Durham University Islamic Society's own page --
-- this is the science-site room, distinct from DUISoc's separate Old Elvet room.
update public.places set address = 'Islamic Prayer Room, Durham University Science Site, Durham, DH1 3LF'
where id = 'islamic-prayer-rooms-way-502300435';

-- Jami'ah-tul-Madinah: treated as the same Dawat-e-Islami institution
-- directories list as "Jamia Tul Madina" (a common alternate transliteration).
update public.places set address = 'Faizan-e-Madina / Jamia Tul Madina, Maudsley Street, Bradford, BD3 9LE'
where id = 'jami-ah-tul-madinah-way-252172173';

-- Jami al-Imam Ahmed Raza Khan Barelwi: directory-confirmed, same LS7 pocket as the pin.
update public.places set address = '5 Mexborough Drive, Leeds, LS7 3EN'
where id = 'jami-al-imam-ahmed-raza-khan-barelwi-node-13129934750';

-- Jamia Abu Hanifa Mosque: the mosque's own official website.
update public.places set address = '35 Hustler Street, Undercliffe, Bradford, West Yorkshire, BD3 0PS'
where id = 'jamia-abu-hanifa-mosque-way-1427941928';

-- Jamia Dar Ul Uloom Qadiria Jillania Centre: Companies House registered office.
update public.places set address = '482 Barnsley Road, Sheffield, S5 7AE'
where id = 'jamia-dar-ul-uloom-qadiria-jillania-centre-way-123528135';

-- Jamia Masjid Noor-Ul-Huda: 3 independent directories agree.
update public.places set address = '113 Psalters Lane, Rotherham, South Yorkshire, S61 1DL'
where id = 'jamia-masjid-noor-ul-huda-way-386030104';

-- Jamia Mosque and Islamic Welfare Association Lozells: better known publicly
-- as "Faizul Quran Jamia Mosque", but the same directory cross-lists it
-- under this Islamic Welfare Association name; exact postcode match.
update public.places set address = '62 Wills Street, Lozells, Birmingham, West Midlands, B19 1QR'
where id = 'jamia-mosque-and-islamic-welfare-association-lozells-way-132922474';

-- Jamia Muhammadiyah Qadriyah: exact postcode match; distinct from a
-- differently-located "Jamia Muhammadia" also in Bradford -- not conflated.
update public.places set address = '179 Otley Road, Bradford, BD3 0HX'
where id = 'jamia-muhammadiyah-qadriyah-way-1427934326';

-- Jemia Mosque: also known as "Chapel Walk Masjid"; 3 independent sources agree.
update public.places set address = 'Hall Street, Rotherham, South Yorkshire, S60 1EX'
where id = 'jemia-mosque-way-226613539';

-- Keele University Islamic Centre: Keele University's own website, exact postcode match.
update public.places set address = 'Islamic Centre, Barnes Hall of Residence, Keele Road, Keele, Newcastle-under-Lyme, Staffordshire, ST5 5BP'
where id = 'keele-university-islamic-centre-way-139850347';

-- Lancaster University Chaplaincy Centre: the university's general campus
-- address (its own site doesn't give the Chaplaincy building a separate street number).
update public.places set address = 'Chaplaincy Centre, Lancaster University, Bailrigg, Lancaster, LA1 4YW'
where id = 'lancaster-university-chaplaincy-centre-way-42828223';

-- Laud Worship Rooms: mosque-directory listings; on the Canterbury Christ
-- Church University campus. Sources disagree on the final postcode letter
-- (1QT/1QU/1QX); kept the app's existing nearest-postcode (1QU).
update public.places set address = 'Laud Worship Rooms, North Holmes Road, Canterbury, Kent, CT1 1QU'
where id = 'laud-worship-rooms-node-4630679956';

-- Madina Education Trust: Companies House + Sandwell Council directory + own Facebook page.
update public.places set address = 'Madina House, Walsall Street, Wednesbury, WS10 9EL'
where id = 'madina-education-trust-way-372940812';

-- Madrasah Abdullah Bin Masood: 2 independent directories agree, exact postcode match.
update public.places set address = '21 Lynthorne Road, Bradford, BD9 4EZ'
where id = 'madrasah-abdullah-bin-masood-way-1428000520';

-- Madrasah Ghosia: 2 independent sources agree on street/postcode.
update public.places set address = '124 Hanson Lane, Halifax, HX1 4BS'
where id = 'madrasah-ghosia-way-1428227246';

-- Madrasatul Imam Muhammad Zakariya: UK Charity Commission + government
-- schools register both agree.
update public.places set address = 'Keswick Street, Bolton, BL1 8LX'
where id = 'madrasatul-imam-muhammad-zakariya-way-712902936';

-- Madrassa Tul Madinah: 2 independent directories agree, exact postcode match.
update public.places set address = 'The Old Library, Firth Park Road, Sheffield, S5 6WS'
where id = 'madrassa-tul-madinah-way-127886465';

-- Markaz Al-Takwa: commonly spelled "Al-Taqwa" by sources but clearly the same place.
update public.places set address = '230 Plymouth Grove, Manchester, M13 0AS'
where id = 'markaz-al-takwa-node-12133584181';

-- Martin Luther King Multi Faith Centre: Aston University's own chaplaincy
-- page + Birmingham City Council directory.
update public.places set address = 'MLK Multi-Faith Centre, James Watt Building, Aston University, Aston Triangle, Birmingham, B4 7ET'
where id = 'martin-luther-king-multi-faith-centre-node-2036058830';

-- Masjid Al-Salam: 2 independent sources agree (one conflicting aggregator
-- listing was not used); exact postcode match.
update public.places set address = '120 Eldon Road, Rotherham, S65 1RD'
where id = 'masjid-al-salam-way-1428083674';

-- Masjid Ar-Rashideen: no specific building number found in any source, but
-- street/postcode consistently reported.
update public.places set address = 'Ings Road, Batley, WF17 8LT'
where id = 'masjid-ar-rashideen-node-13129966917';

-- Masjid As-Salaam: confirmed on the masjid's own official website, exact postcode match.
update public.places set address = '4 New Street, Earlsheaton, Dewsbury, WF12 8JJ'
where id = 'masjid-as-salaam-node-13129991419';

-- Masjid Ayesha: confirmed on the masjid's own official website.
update public.places set address = '1 Thornacre Road, Shipley, BD18 1JY'
where id = 'masjid-ayesha-way-1427965916';

-- Masjid E Hamza: directory match ("Masjid Hamza and Madressa Tarteelul
-- Quran"), same small Manningham/BD8 7A pocket as the stored pin.
update public.places set address = '42 Woodview Terrace, Manningham, Bradford, West Yorkshire, BD8 7AH'
where id = 'masjid-e-hamza-way-1427992646';

-- Masjid Iman: directory match ("Iman Community Association"), independently
-- verified by forward-geocoding the street back to ~37m of the stored pin.
update public.places set address = '5 Waverley Road, Huddersfield, HD1 5NA'
where id = 'masjid-iman-way-1428226747';

-- Masjid Nur: consistently paired with "The Lux Mosque" across independent
-- listings for the same site; no specific building number found.
update public.places set address = 'Haworth Road, Bradford, BD9 6LH'
where id = 'masjid-nur-way-436696443';

-- Masjid Omar Mukhtar: 2 independent directories agree, same L8 district as the pin.
update public.places set address = '51 Granby Street, Liverpool, L8 2XP'
where id = 'masjid-omar-mukhtar-way-1311059305';

-- Masjid Salahuddin: Charity Commission registered address; street name
-- exactly matches the pin's own reverse-geocode. Strongest-confidence match of the sweep.
update public.places set address = '24 Crackenedge Lane, Dewsbury, WF13 1RB'
where id = 'masjid-salahuddin-way-101939993';

-- Masjid Yousuf: directory + stock-photo caption agree, matches the pin's
-- reverse-geocode. NOTE: one hard-to-parse source mentioned an "Imamia
-- Mission" possibly having occupied this address previously -- could not
-- verify further; every other source describes this simply as Masjid Yousuf
-- with no Shia association, so it is kept, but flagged here for awareness.
update public.places set address = '328 Romford Road, Forest Gate, London, E7 8BS'
where id = 'masjid-yousuf-way-144357797';

-- Masjidur Raashideen: the masjid's own official website, exact postcode
-- match (2m from pin) and exact street-name match. Very high confidence.
update public.places set address = '14 Farfield Street, off Scotchman Road, Bradford, BD9 5AS'
where id = 'masjidur-raashideen-way-393878795';

-- Mazhar E-Islam Ghousia: directory match, street name exactly matches the pin's reverse-geocode.
update public.places set address = '6/7 Low Green Terrace, Bradford, BD7 3LU'
where id = 'mazhar-e-islam-ghousia-way-1427954643';

-- Micklefield Mosque: Buckinghamshire Council's own directory + a second
-- independent listing; exact postcode match (1m from pin). Very high confidence.
update public.places set address = 'Centre Approach, High Wycombe, Buckinghamshire, HP13 7FY'
where id = 'micklefield-mosque-node-495242330';

-- Multi-faith Prayer Room (Greenwich): University of Greenwich's own
-- published address for its Avery Hill campus multi-faith room.
update public.places set address = 'University of Greenwich, Avery Hill Campus, Avery Hill Road, London, SE9 2UG'
where id = 'multi-faith-prayer-room-node-11876860561';

-- Multi Faith Room (Level A): Isle of Wight NHS Trust + Diocese of
-- Portsmouth chaplaincy pages both confirm the "Level A" room, exact postcode match.
update public.places set address = 'St Mary''s Hospital, Newport, Isle of Wight, PO30 5TG'
where id = 'multi-faith-room-level-a-node-5429171561';

-- Multifaith Centre (Stanmore): RNOH Charity's own reporting on its
-- Multifaith Room + the hospital trust's own address, exact postcode match.
update public.places set address = 'Royal National Orthopaedic Hospital, Brockley Hill, Stanmore, Middlesex, HA7 4LP'
where id = 'multifaith-centre-way-1464988785';

-- Multifaith Prayer Room: this is the multifaith room inside HMP Ford, a
-- working Category D prison (confirmed via the prison's own Independent
-- Monitoring Board Annual Report 2022-2023 and GOV.UK) -- serves prisoners
-- and staff only, not the public. See fix-audit-2026-08-07.sql item 9 for a
-- policy flag on whether this should be listed at all; address filled in
-- here regardless so it's correct either way.
update public.places set address = 'HMP Ford, Ford Road, Arundel, West Sussex, BN18 0BX'
where id = 'multifaith-prayer-room-node-13451361548';

-- New Abu Bakr Mosque: 3 independent directories agree, exact postcode match.
update public.places set address = '28-4 Cannon Park Way, Middlesbrough, TS1 5JU'
where id = 'new-abu-bakr-mosque-node-13128419079';

-- Nightingale Multi-Faith Chapel: hospital access guide confirms a
-- Nightingale Wing multi-faith prayer room with washing facilities, open 24/7.
update public.places set address = 'Royal Hampshire County Hospital, Romsey Road, Winchester, Hampshire, SO22 5DG'
where id = 'nightingale-multi-faith-chapel-node-7853027881';

-- Northwood Hills Masjid and Community Centre: the existing website on file
-- (ironaid.org) redirects to the venue's own current site, nhmcc.co.uk.
update public.places set address = 'Joel Street, Northwood Hills, HA6 1NL'
where id = 'northwood-hills-masjid-and-commnity-centre-way-79405101';

-- O Zone: OSM's own editor note ties this feature directly to Portland
-- College, corroborated by the college's own website and Wikipedia.
update public.places set address = 'Portland College, Nottingham Road, Mansfield, Nottinghamshire, NG18 4TJ'
where id = 'o-zone-way-636637393';

-- Oxford University Islamic Society Prayer Room: OUISoc's own website
-- (the existing prayer-room URL on file had moved; current page confirms this location).
update public.places set address = 'Robert Hooke Building, Parks Road, Oxford, OX1 3PR'
where id = 'oxford-university-islamic-society-prayer-room-node-4851854319';

-- Peckham High Street Islamic Centre: the centre's own website (phsicc.org).
-- Not to be confused with the separate, unrelated "Peckham Islamic Centre"
-- on Choumert Grove.
update public.places set address = '118/120 Peckham High Street, London, SE15 5ED'
where id = 'peckham-high-street-islamic-centre-node-2990261223';

-- Prayer Room (Liverpool): University of Liverpool's own HR faith-facilities
-- page names this as the sole Muslim prayer room on campus.
update public.places set address = 'Sydney Jones Library, University of Liverpool, Liverpool, L69 3GD'
where id = 'prayer-room-node-1990934810';

-- Prayer room (Rugby services): 2 independent mosque directories agree;
-- this is a public prayer/quiet room inside a motorway service station.
update public.places set address = 'Rugby Services (Moto), M6 Junction 1, Leicester Road, Churchover, Rugby, CV23 0EZ'
where id = 'prayer-room-node-9096863451';

-- Raza-E-Mustafa Mosque: UK Charity Commission registered address (one
-- lower-quality aggregator gave a conflicting house number, not used).
update public.places set address = '158 Broom Lane, Rotherham, S60 3NW'
where id = 'raza-e-mustafa-mosque-way-712311313';

-- Raza Education Centre: UK Charity Commission registered address, exact postcode match.
update public.places set address = '399 Lees Hall Road, Thornhill Lees, Dewsbury, West Yorkshire, WF12 9HB'
where id = 'raza-education-centre-way-1428120638';

-- Said Nursi Camii: 3 independent directories agree ("Said Nursi Mosque, Tottenham").
update public.places set address = '70A Willoughby Lane, London, N17 0SP'
where id = 'said-nursi-camii-node-9746962406';

-- Sandwell Grand Masjid: business directory + photo documentation of the
-- building (former Grade II-listed Ryland Memorial School of Art) agree.
update public.places set address = '42 Edward Street, West Bromwich, B70 8NU'
where id = 'sandwell-grand-masjid-way-1319633968';

-- Sheffield Grand Mosque: the mosque's own official website, exact postcode match.
update public.places set address = 'Grimesthorpe Road, Sheffield, S4 8DE'
where id = 'sheffield-grand-mosque-way-629211580';

-- Shipley Masjid Association: 3 independent sources agree, exact postcode
-- match. Note the same association separately runs a 24/7 prayer room at
-- 47 Commercial St -- this address is their main Jummah & Eid Hall.
update public.places set address = '60 Saltaire Road, Shipley, BD18 3HN'
where id = 'shipley-masjid-association-node-13129427390';

-- The Lingfield Centre: run by UK Islamic Mission (UKIM Leeds); zabihah.com
-- listing plus 2 further independent sources agree, exact postcode match.
update public.places set address = 'Lingfield Drive, Leeds, LS17 7EL'
where id = 'the-lingfield-centre-way-542705837';

-- The Sanctuary (Oxford): St Hilda's College's own student-life page names
-- this as its multi-faith room. Distinct from the other "The Sanctuary"
-- (Southmead Hospital, Bristol) already fixed earlier in this file.
update public.places set address = 'St Hilda''s College, Cowley Place, Oxford, OX4 1DY'
where id = 'the-sanctuary-node-13017104533';

-- The Spiritual Care Centre: no coordinates-based postcode was available,
-- but the existing website on file (ruh.nhs.uk) makes the identity unambiguous.
update public.places set address = 'Royal United Hospital, Combe Park, Bath, BA1 3NG'
where id = 'the-spiritual-care-centre-way-1127830725';

-- Umm ul Qura Islamic Centre: the centre's own official website, exact postcode match.
update public.places set address = '93 Greenhill Lane, Leeds Road, Bradford, BD3 8DZ'
where id = 'umm-ul-qura-islamic-centre-way-1427955247';

-- Prayer room (Peterborough City Hospital): OSM coordinates match the
-- hospital site exactly; NHS Trust's own chaplaincy page describes a
-- 24-hour chapel, consistent with the multi-faith tag.
update public.places set address = 'Peterborough City Hospital, Bretton Gate, Peterborough, PE3 9GZ'
where id = 'unnamed-prayer-space-node-10925674692';

-- Prayer room (Roselawn, Belfast): OSM data confirms a cemetery/crematorium
-- feature directly adjacent to this node; Belfast City Council's own page
-- gives this address for the site.
update public.places set address = 'Roselawn Cemetery and Crematorium, 129-131 Ballygowan Road, Crossnacreevy, Belfast, BT5 7TZ'
where id = 'unnamed-prayer-space-node-7435265085';

-- Prayer room (Poulton-le-Fylde): OSM data confirms this way sits within
-- Poulton New Cemetery; Wyre Council's own cemeteries page gives this address.
update public.places set address = 'Poulton New Cemetery, Garstang Road East, Poulton-le-Fylde, Lancashire, FY6 8JH'
where id = 'unnamed-prayer-space-way-120391781';

-- Prayer room (Street, Somerset): way carries an official UPRN tag;
-- Somerset Council's own site gives this address for Street Cemetery.
update public.places set address = 'Street Cemetery, Cemetery Lane, Street, Somerset, BA16 9PZ'
where id = 'unnamed-prayer-space-way-123228104';

-- Prayer room (Eltham): way is tagged with the Royal Borough of Greenwich as
-- operator; the council's own site describes chapels at this crematorium.
update public.places set address = 'Eltham Cemetery and Crematorium, Crown Woods Way, London, SE9 2AZ'
where id = 'unnamed-prayer-space-way-235593480';

-- Wibsey Musalla Jummah Salaah: mosque-directory + local business listing
-- agree, exact postcode match. Also known locally as "Al-Rahma Islamic Centre".
update public.places set address = '75 Odsal Road, Bradford, BD6 1PN'
where id = 'wibsey-musalla-jummah-salaah-way-1543175566';

-- Yorkshire Muslim Academy: the organisation's own official website, which
-- distinguishes this Bland Street site from its affiliated Masjid Umar.
update public.places set address = 'Crown Works, Bland Street, Sheffield, S4 8DG'
where id = 'yorkshire-muslim-academy-way-116536722';

commit;

-- NOT INCLUDED (2026-08-07 final sweep) -- researched but no independently-
-- sourced street address could be found, so these are LEFT with "Address not
-- recorded yet" rather than guessed at. District/postcode is the best
-- available anchor for a human surveyor:
--   bradford-islamic-centre-way-1428000084       (Bradford, BD8 7HH area)
--   chaplaincy-node-512529477                    (Western General Hospital, Edinburgh, EH4 2XU)
--   hsj-outreach-centre-node-2966093722          (High Wycombe, HP10 9SU area)
--   juma-jamat-mosque-way-258406537              (Smethwick, Sandwell, B66 4PB area -- OSM notes it's in no directory)
--   madina-tul-quran-node-2327707493             (Stoke-on-Trent, ST4 5RH area)
--   masjid-quba-way-1428229088                   (Thornhill Lees, Dewsbury, WF12 0LL area)
--   multi-faith-room-way-43290803                (Pancras Road, Camden, NW1 1UL area)
--   musalla-salaam-way-1543176865                (Clayton, Bradford, BD14 area)
--   ntu-prayer-room-node-13524967129             (Nottingham Trent University has several candidates, none confirmed)
--   prayer-room-node-11664987958                 (likely Univ. of Nottingham Jubilee Campus, but only OSM itself as a source)
--   sarah-turnvill-multifaith-centre-way-1347291937  (Univ. of Exeter Streatham Campus -- real & recent, no street address published)
--   spiritual-commons-node-11277303129           (Northumbria University, Newcastle -- real, but building address unconfirmed)
--   the-al-noor-node-13129976295                 (Leeds, LS9 area -- directory pages blocked automated fetch)
--   university-of-chester-chaplaincy-node-3043554872 (pin sits on a campus that closed in 2021; current site unclear)
--   unnamed-prayer-space-node-700515044          (Swansea area -- two similarly-named crematoria nearby, couldn't tell which)
--   unnamed-prayer-space-node-717355487          (Army Training Centre Pirbright -- likely non-public MOD land anyway)
--   chaplaincy-node-5845829754                   (no coordinates, postcode, phone or website on file -- nothing to search from)

-- Sanity check:
--   select count(*) from public.places where address = 'Address not recorded yet';
--   -- expect 113 - 92 - 2 (Sai Grace Ashram/Stanley House, removed separately) = 19 fewer than before this file existed
