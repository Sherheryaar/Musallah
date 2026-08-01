-- Enrich London masjids with verified official website / Facebook / Instagram links.
-- Generated 2026-07-31 from web research; every link was checked
-- against the place's street address/postcode before inclusion.
-- Non-destructive: each column is only set when currently NULL or empty.
-- Run in the Supabase SQL editor, then locally: npm run sync:places

begin;

-- Abubakr Masjid — 165-169 The Broadway, Southall,Ealing, UB1 1LR
--   verified: Contact page on abubakrmosque-southall.org.uk lists 165-169 The Broadway, Southall UB1 1LR, matching the input address; no official social accounts confirmed.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.abubakrmosque-southall.org.uk')
where id = 'abubakr-masjid-mib-1131';

-- Adara or Idara Minhaj-ul-Quran Educational Centre — 292-296 Romford Road, Forest Gate,Newham, E7 9HD
--   verified: minhajlondon.org (MQI London centre, Forest Gate) shows phone matching this listing's 020 8257 1786; the centre's published address is 292-296 Romford Road E7 9HD; facebook.com/MQILondon is the branch-specific Minhaj-ul-Quran London page.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://minhajlondon.org'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/MQILondon/')
where id = 'adara-or-idara-minhaj-ul-quran-educational-centre-mib-1298';

-- Afghan Islamic Cultural Centre — 212-214 Church Road, Willesden,Brent, NW10 9NP
--   verified: Site about-us page states 214 Church Road, London NW10 9NP (matches 212-214 Church Road NW10 9NP); FB and IG links taken from the official site.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://aiccmosque.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/afghanislamicculturalcentre'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/aiccmasjed')
where id = 'afghan-islamic-cultural-centre-mib-1058';

-- Al-Ansar Islamic Education Centre — 833-835 High Road, Goodmayes,Redbridge, IG3 8TD
--   verified: Site shows 833-835 High Rd, Goodmayes IG3 8TD and links both social accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://masjidansar.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/alansariec'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/alansariec/')
where id = 'al-ansar-islamic-education-centre-mib-812';

-- Al-Huda Cultural Centre and Mosque — 91 Mile End Road, Bethnal Green,Tower Hamlets, E1 4UJ
--   verified: Website contact section shows 91 Mile End Road, London E1 4UJ (matches), and the site links to the AlHudaCCM Facebook page; no Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.alhudamosque.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/AlHudaCCM/')
where id = 'al-huda-cultural-centre-and-mosque-mib-1363';

-- Al-Manaar (Muslim Cultural Heritage Centre) — 244 Acklam Road, Westbourne Park,Kensington and Chelsea, W10 5YG
--   verified: almanaar.org.uk loads as 'Almanaar | Muslim Cultural Heritage Centre'; KCSC and Westminster/LBHF council directories tie almanaar.org.uk to 244 Acklam Road W10 5YG matching the input, and the almanaarmchc Facebook/Instagram accounts describe the same North Kensington centre.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.almanaar.org.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/almanaarmchc'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/almanaarmchc/')
where id = 'muslim-cultural-heritage-centre-mib-1228';

-- Al-Manaar (Muslim Cultural Heritage Centre) — 244 Acklam Rd, London W10 5YG
--   verified: almanaar.org.uk loads as 'Almanaar | Muslim Cultural Heritage Centre'; KCSC and Westminster/LBHF council directories tie almanaar.org.uk to 244 Acklam Road W10 5YG matching the input, and the almanaarmchc Facebook/Instagram accounts describe the same North Kensington centre. (propagated from duplicate record muslim-cultural-heritage-centre-mib-1228)
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.almanaar.org.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/almanaarmchc'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/almanaarmchc/')
where id = 'al-manaar';

-- Al-Rahman Mosque & Community Centre — 78 Godwin Court, Crowndale Road, Camden, NW1 1NW
--   verified: Official site homepage lists Godwin Court, Crowndale Road, London NW1 1NW and links the Instagram account.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.alrahmanmosque.org/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/alrahmanmosque_camden/')
where id = 'al-rahman-mosque-community-centre-mib-1092';

-- An-Noor Masjid and Community Centre — 58-70 Church Road, Acton,Ealing, W3 8PP
--   verified: annoorcentre.com about page states the trust purchased 58-70 Church Road; Acton BID listing ties W3 8PP to this website, facebook.com/annoormasjid and IG @accctrust (account named Masjid Annoor).
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.annoorcentre.com'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/annoormasjid'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/accctrust/')
where id = 'an-noor-masjid-and-community-centre-mib-2628';

-- Assunnah Islamic Centre — Unit B1, 565a High Road, Tottenham,Haringey, N17 6SB
--   verified: Official site assunnah.co.uk lists 565A High Road, London N17 6SB (matching postcode and phone 020 8808 7951) and links to the AssunnahICentre Facebook and Instagram accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://assunnah.co.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/AssunnahICentre/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/AssunnahICentre/')
where id = 'assunnah-islamic-centre-mib-1173';

-- At-Taqwa Academy — 104-106 Ley Street, Ilford,Redbridge, IG1 4BX
--   verified: attaqwa.org contact page states 104-106 Ley Street, Ilford IG1 4BX, matching the input address; no social links on the site.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://attaqwa.org/')
where id = 'at-taqwa-academy-mib-1086';

-- Attaqwa Mosque — 97 Longbridge Road, Barking,Barking and Dagenham, IG11 8TB
--   verified: Facebook page 'Masjid At-Taqwa Islamic And Family Centre' lists 97 Longbridge Rd, matching the input; Instagram @attaqwabarking is the same centre in Barking; former website attaqwacentre.co.uk no longer resolves so omitted.
update public.places set
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/MasjidTaqwaBarking'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/attaqwabarking/')
where id = 'attaqwa-mosque-mib-1013';

-- Azhar Masjid Mosque — 235a Romford Road, Forest Gate,Newham, E7 9HL
--   verified: Official site masjid.azharacademy.org repeatedly failed to load over https (HTTP 425) so website omitted; Facebook page officialazharmasjid is Azhar Masjid, London, tied to 235A Romford Road, Forest Gate in listings.
update public.places set
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/officialazharmasjid/')
where id = 'azhar-masjid-mosque-mib-1297';

-- Azizia Mosque — 117-119 Stoke Newington Road, Stoke Newington,Hackney, N16 8BU
--   verified: Official Aziziye Mosque site shows 117-119 Stoke Newington Road, London N16 8BU (exact match); FB and IG links taken from the official site.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.aziziye.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/aziziyemosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/aziziye_mosque/')
where id = 'azizia-mosque-mib-1160';

-- Bait-ul-Aziz Islamic Cultural Centre — 1 Dickens Square, Southwark,Southwark, SE1 4JL
--   verified: Site contact page shows 1 Dickens Square, Southwark SE1 4JL and links the Facebook page; no Instagram listed.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.baitulazizmosque.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/BaitulAzizMosque/')
where id = 'bait-ul-aziz-islamic-cultural-centre-mib-1322';

-- Baitul Aman Mosque and Cultural Centre — 101 Braintree Street, Bethnal Green,Tower Hamlets, E2 0FT
--   verified: baitulaman.org homepage shows 101 Braintree Street, London E2 0FT (matches); Facebook page name 'Baitul Aman Mosque & CC' in Mile End/Globe Town matches the organisation.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://baitulaman.org/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/baitulamanmosqueandcc/')
where id = 'baitul-aman-mosque-and-cultural-centre-mib-2647';

-- Balham Mosque — 47A Balham High Road, Balham,Wandsworth, SW12 9AW
--   verified: Official site homepage shows 47a Balham High Road and links both the Facebook and Instagram accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://balhammosque.org/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/balhammosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/balhammosque_tic/')
where id = 'balham-mosque-mib-1400';

-- Barnet Islamic Centre — 18 Brookhill Road, Barnet,Barnet, EN4 8SD
--   verified: barnetislamiccentre.org shows 18 Brookhill Road, Barnet EN4 8SD and links both the Facebook page and Instagram account.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://barnetislamiccentre.org'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/barnetislamiccentre/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/barnetislamiccentre/')
where id = 'barnet-islamic-centre-mib-1719';

-- Bilal Masjid Trust (Greenford) — 82-84 Horsenden Lane North, North Greenford,Ealing, UB6 7QH
--   verified: bilalmasjid.co.uk shows 82-86 Horsenden Lane N, Greenford UB6 7QH (postcode match) and links to the Facebook page.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.bilalmasjid.co.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/bilalmasjidtrust/')
where id = 'bilal-masjid-trust-greenford-mib-707';

-- Brick Lane Jamme Masjid — 59 Brick Ln, London E1 6QL
--   verified: Official site shows 59 Brick Lane, London E1 6QL matching the input, and links to these Facebook and Instagram accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.bricklanejammemasjid.org.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/BrickLaneMosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/bricklanejammemasjid')
where id = 'brick-lane-jamme-masjid';

-- Brick Lane Jamme Masjid — 59 Brick Lane, Aldgate,Tower Hamlets, E1 6QL
--   verified: bricklanejammemasjid.org.uk shows 59 Brick Lane, London E1 6QL and links facebook.com/BrickLaneMosque and instagram.com/bricklanejammemasjid.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://bricklanejammemasjid.org.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/BrickLaneMosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/bricklanejammemasjid')
where id = 'jamia-masjid-mib-1347';

-- Camberwell Islamic Centre — 188 Camberwell Road, Camberwell Green,Southwark, SE5 0ED
--   verified: Site states its address as 188 Camberwell Road, London SE5 0ED, matching the listing; no official Facebook/Instagram found on the site.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://camberwellislamiccentre.co.uk')
where id = 'camberwell-islamic-centre-mib-307';

-- Central Jamia Masjid — 12 Montague Waye, Southall,Ealing, UB2 5PA
--   verified: Site shows Montague Way, Southall UB2 5PA (postcode match); Facebook page titled 'Central Jamia Masjid | Southall' matches org name and location; no Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://cjmsouthall.co.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/centraljamia.masjid')
where id = 'central-jamia-masjid-mib-1128';

-- Central Mosque Of Brent — Marley Walk, Station Parade and 41 Station Parade, Willesden Green,Brent, NW2 4PU
--   verified: Site contact page shows Station Parade, Willesden Green NW2 4PU; FB/IG handles unambiguously match the org name and borough.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.centralmosqueofbrent.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/CentralMosqueofBrent/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/centralmosqueofbrent/')
where id = 'central-mosque-of-brent-mib-1078';

-- Chingford Islamic Society — 92 Chingford Mount Road, Chingford,Waltham Forest, E4 9AA
--   verified: chingfordmasjid.org shows 90-92 Chingford Mount Road E4 9AA (matches) and itself links to this Facebook page; no Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.chingfordmasjid.org/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/Chingford-Islamic-Society-161442217202686/')
where id = 'chingford-islamic-society-mib-1382';

-- Croydon Islamic Community Trust — 89 London Road, West Croydon,Croydon, CR0 2RF
--   verified: Site's contact page confirms 89 London Road, Croydon CR0 2RF; homepage links the Facebook and Instagram accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://croydonict.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/croydonict'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/croydonict/')
where id = 'croydon-islamic-community-trust-mib-2768';

-- Croydon Masjid and Islamic Centre — 525 London Road, Thornton Heath,Croydon, CR7 6AR
--   verified: croydonmosque.com contact page shows 525 London Road, Thornton Heath CR7 6AR and links facebook.com/croydonmasjid; no Instagram found on site.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.croydonmosque.com'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/croydonmasjid')
where id = 'croydon-masjid-and-islamic-centre-mib-1114';

-- Croydon Mosque & Islamic Centre — 525 London Rd, Thornton Heath CR7 6AR
--   verified: croydonmosque.com states 525 London Road, Thornton Heath CR7 6AR (exact match) and links to the Facebook page; no Instagram on site.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.croydonmosque.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/croydonmasjid')
where id = 'croydon-mosque';

-- Dagenham Central Mosque — 798 Green Lane, Dagenham,Barking and Dagenham, RM8 1YT
--   verified: bhis.org.uk (Becontree Heath Islamic Society / Dagenham Central Masjid) shows 798 Green Lane, Dagenham RM8 1YT matching the input, and its footer links to the dagenhammasjid Facebook page.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://bhis.org.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/dagenhammasjid')
where id = 'dagenham-central-mosque-mib-453';

-- Dawat-e-Islami — 8-10 Forty Avenue, Wembley,Brent, HA9 8JW
--   verified: wembleylondonproject.co.uk is Dawat-e-Islami's branch-specific Faizan-e-Madinah Wembley site describing this building at the junction of Forty Avenue and Oakington Avenue (the location of 8-10 Forty Avenue HA9 8JW); its Facebook/Instagram are London-region accounts, not this branch, so omitted.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://wembleylondonproject.co.uk')
where id = 'dawat-e-islami-mib-1698';

-- East Ham Islamic Centre — 77-79 Market Street, East Ham,Newham, E6 2RD
--   verified: Site is titled 'East Ham Islamic Centre' and the Charity Commission record for East Ham Bangladeshi Islamic Community Trust (Market Street, E6) lists www.ebict.co.uk as its website; no address shown on-site and no verified socials.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://ebict.co.uk/')
where id = 'east-ham-islamic-centre-mib-289';

-- East London Mosque & London Muslim Centre — 46-92 Whitechapel Road, Whitechapel,Tower Hamlets, E1 1JX
--   verified: Official site lists 46 & 82-92 Whitechapel Road E1 1JX on its location page (matches); FB/IG handles 'eastlondonmosque' are the mosque's own accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://eastlondonmosque.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/eastlondonmosque/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/eastlondonmosque/')
where id = 'east-london-mosque-london-muslim-centre-mib-1378';

-- Edgware Central Mosque — 48 High Street, Edgware,Barnet, HA8 7EQ
--   verified: Official site shows 48 High St, Edgware HA8, matching street number and name; social icons on the site are unconfigured placeholders so no socials verified.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://edgwarecentralmosque.org/')
where id = 'edgware-central-mosque-mib-15063001';

-- Edmonton Islamic Centre — 20-34 Raynham Road, Edmonton,Enfield, N18 2SJ
--   verified: eicalmasjid.org.uk (EIC Al-Masjid Trust) shows 20-34 Raynham Road, Edmonton N18 2SJ; site has social buttons but no verifiable Facebook/Instagram URLs.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://eicalmasjid.org.uk')
where id = 'edmonton-islamic-centre-mib-2630';

-- Faizan-e-Islam Educational and Cultural Trust — 8 Corbett Road, Walthamstow,Waltham Forest, E17 3JZ
--   verified: faizaneislam.com lists 8 Corbett Rd, Walthamstow E17 3JZ as one of its sites (exact match) and links to the Facebook page.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://faizaneislam.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/faizaneislam.org.uk/')
where id = 'faizan-e-islam-educational-and-cultural-trust-mib-2814';

-- Finsbury Park Mosque — 7-11 St Thomas's Rd, London N4 2QH
--   verified: Official site contact page shows 7-11 St. Thomas's Road, London N4 2QH matching the input, and links to the Instagram account; Facebook page name and location match the mosque.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.finsburyparkmosque.org'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/FinsburyParkMosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/finsburyparkmosque/')
where id = 'finsbury-park-mosque';

-- Finsbury Park Mosque — 7-15 St Thomas's Road, Finsbury Park,Islington, N4 2QH
--   verified: Official site contact page shows 7-11 St. Thomas's Road, London N4 2QH matching the input, and links to the Instagram account; Facebook page name and location match the mosque. (propagated from duplicate record finsbury-park-mosque)
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.finsburyparkmosque.org'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/FinsburyParkMosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/finsburyparkmosque/')
where id = 'finsbury-park-mosque-mib-1226';

-- Forest Gate Mosque — 447-451 Romford Road, Forest Gate,Newham, E7 8AB
--   verified: Site shows phone 0208 555 6258 matching the listing and charity no. 293676, whose Charity Commission registered address is 447-451 Romford Road E7 8AB; Facebook/Instagram handles are the masjid's own name.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://forestgatecentralmasjid.org'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/forestgatecentralmasjid/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/forestgatecentralmasjid/')
where id = 'forest-gate-mosque-mib-1300';

-- Greenford Central Madina Mosque — Sanif House, 412 Greenford Road, Greenford,Ealing, UB6 9AH
--   verified: Site shows Allied Sanif House, 412 Greenford Road, Greenford UB6 9AH (exact match); the official site links its Facebook page of the same name; no Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.wlicgreenfordmosque.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/p/West-London-Islamic-Centre-Greenford-Medina-Mosque-100069480220314/')
where id = 'greenford-central-madina-mosque-mib-2820';

-- Hanwell Masjid — 9 Boston Road, Hanwell,Ealing, W7 3SJ
--   verified: No official website found (directory listings only); Facebook page is named 'Hanwell Masjid', unambiguously matching the only masjid of that name in Hanwell.
update public.places set
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/Hanwell.Masjid.1/')
where id = 'hanwell-masjid-mib-1065';

-- Havering Islamic Cultural Centre — 91 Waterloo Road, Romford,Havering, RM7 0AA
--   verified: Site's contact page confirms 91 Waterloo Road, Romford RM7 0AA; homepage footer links the Facebook and Instagram accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://haveringislamiccentre.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/haveringmosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/haveringmosque/')
where id = 'havering-islamic-cultural-centre-mib-2642';

-- Ilford Islamic Centre — 50-58 Albert Road, Ilford,Redbridge, IG1 1HW
--   verified: ilfordmosque.com contact page shows 50-58 Albert Road, Ilford IG1 1HW and links both facebook.com/ilfordmosque and instagram.com/ilfordmosque.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://ilfordmosque.com'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/ilfordmosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/ilfordmosque/')
where id = 'ilford-islamic-centre-mib-1307';

-- Ishaatul Islam Mosque — 16 Ford Square and 18-22 Damien Street, Whitechapel,Tower Hamlets, E1 2HS
--   verified: Facebook page 'Esha'atul Islam Mosque' (handle fordsquaremosque) matches the mosque's trading name Ford Square Mosque at 16 Ford Square E1 2HS; its website fordsquaremasjid.org has an invalid HTTPS certificate so the website is omitted.
update public.places set
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/fordsquaremosque')
where id = 'ishaatul-islam-mosque-mib-1357';

-- Islamic Association of North London — 683-685 High Road, Finchley,Barnet, N12 0DA
--   verified: ianl.org.uk contact page confirms 683-685 High Road, North Finchley N12 0DA and itself links the finchleymosque Facebook and finchley.mosque Instagram accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://ianl.org.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/finchleymosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/finchley.mosque/')
where id = 'islamic-association-of-north-london-mib-1047';

-- Islamic Cultural Centre — 72 Harrow Road, Wembley,Brent, HA9 6PL
--   verified: iccwembley.co.uk announcements page lists office phone matching the listing's 020 8903 3760 for 72 Harrow Road HA9 6PL; FB page 'ICC Monks Park Mosque, Wembley' matches this mosque's known name and location; no Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.iccwembley.co.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/MonksParkMosque/')
where id = 'islamic-cultural-centre-mib-1067';

-- Islamic Education & Cultural Society — Former Civic Hall, 3 Pump Lane, Hayes,Hillingdon, UB3 3NB
--   verified: Trading as Hayes Muslim Centre; official site lists 3 Pump Lane, Hayes UB3 3NB and phone 020 8561 7149 (both matching), links to the hayesmuslimcentre Facebook page, and the @hayesmuslimcentre Instagram bio matches the centre's own welcome text.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://hayesmuslimcentre.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/hayesmuslimcentre/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/hayesmuslimcentre/')
where id = 'islamic-education-cultural-society-mib-1204';

-- Jamia Masjid and Islamic Centre — 101-105 Townsend Road, Southall,Ealing, UB1 1HE
--   verified: Site homepage shows 101-105 Townsend Road, Southall UB1 1HE (matches) and the Charity Commission record for the Townsend Road charity lists this domain; no verified socials.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.jamiamasjid-southall.org.uk/')
where id = 'jamia-masjid-and-islamic-centre-mib-1132';

-- Jamia Masjid Ghosia — 439-451 Lea Bridge Road, Leyton,Waltham Forest, E10 7EA
--   verified: WFIA (Waltham Forest Islamic Association) site is Jamia Masjid Ghousia's official site, showing 439-451 Lea Bridge Rd, Leyton E10 7EA, and links both social accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.wfia.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/wfialondon'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/wfialondon/')
where id = 'jamia-masjid-ghosia-mib-1392';

-- Kilburn & Hampstead Islamic Centre — 233-235 Kilburn High Road, Kilburn,Brent, NW6 7JN
--   verified: kilburnhampsteadmasjid.org.uk shows 239 Kilburn High Road, London NW6 7JN - same street and exact postcode as the input (233-235 Kilburn High Road NW6 7JN); social accounts found belong to the separate Kilburn Islamic Centre (NW6 2DB) and were excluded.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://kilburnhampsteadmasjid.org.uk')
where id = 'kilburn-hampstead-islamic-centre-mib-704';

-- Kingston Jamia Mosque — 55 East Road, Kingston,Kingston upon Thames, KT2 6EJ
--   verified: kingstonmosque.org contact page confirms 55 East Rd, Kingston upon Thames KT2 6EJ and itself links the kmosque Facebook and kingstonmosque Instagram accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.kingstonmosque.org'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/kmosque/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/kingstonmosque/')
where id = 'kingston-jamia-mosque-mib-1242';

-- Lewisham Islamic Centre — 363-365 Lewisham High St, London SE13 6NZ
--   verified: Site contact page shows 363-365 Lewisham High Street SE13 6NZ (exact match); FB and IG links taken from the official site.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://lewishamislamiccentre.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/Lewishamislamiccentre'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/lewishammosque/')
where id = 'lewisham-islamic-centre';

-- Lewisham Islamic Centre — 363-365 Lewisham High Street, Lewisham,Lewisham, SE13 6NZ
--   verified: Site contact page shows 363-365 Lewisham High Street SE13 6NZ (exact match); FB and IG links taken from the official site. (propagated from duplicate record lewisham-islamic-centre)
update public.places set
  website   = coalesce(nullif(website, ''), 'https://lewishamislamiccentre.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/Lewishamislamiccentre'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/lewishammosque/')
where id = 'lewisham-islamic-centre-mib-1256';

-- Leytonstone Mosque — 9 Dacre Road, Leytonstone,Waltham Forest, E11 3AG
--   verified: Site contact page shows Dacre Road, Leytonstone E11 3AG (matches) and links to the LeytonstoneMosque Facebook page; no Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://leytonstonemasjid.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/LeytonstoneMosque/')
where id = 'leytonstone-mosque-mib-1384';

-- London Central Mosque (Islamic Cultural Centre) — 146 Park Road, Regents Park,City of Westminster, NW8 7RG
--   verified: iccuk.org shows 146 Park Road, London NW8 7RG and links both social accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.iccuk.org/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/iccuk.org/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/londoncentralmosque/')
where id = 'islamic-cultural-centre-mib-1433';

-- London Islamic Cultural Centre — 389-395 Wightman Road, Hornsey,Haringey, N8 0NA
--   verified: London Islamic Cultural Society (Wightman Road Mosque) site shows Wightman Road, London N8 0NA; its Facebook icon carries no URL and search results were ambiguous, so socials omitted.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.londonislamicculturalsociety.org/')
where id = 'london-islamic-cultural-centre-mib-1178';

-- Madina Masjid & Muslim Cultural Centre — 225 High Street North, East Ham,Newham, E6 1JG
--   verified: madinamasjideastham.com shows 225 High Street North, East Ham E6 1JG; Facebook page name 'Madina Masjid East Ham' unambiguously matches the org and location; no Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.madinamasjideastham.com'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/p/Madina-Masjid-East-Ham-100070330414440/')
where id = 'madina-masjid-muslim-cultural-centre-mib-1286';

-- Masjid Ayesha — 115 Clyde Road, Tottenham,Haringey, N15 4JZ
--   verified: masjidayesha.com about page shows 115 Clyde Rd, London N15 4JZ matching the input and links to the MasjidAyesha84 Facebook page; an Instagram handle could not be verified as this mosque, so omitted.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://masjidayesha.com'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/MasjidAyesha84')
where id = 'masjid-ayesha-mib-1169';

-- Masjid Daar as-Sunnah — Shepherd's Bush Market Approach, Lime Grove,Hammersmith and Fulham, W12 8DE
--   verified: dusunnah.com is Masjid Daar us Sunnah, Shepherd's Bush, operated by charity Market Community Centre (no. 1124421) matching the Market Approach W12 site, and it links the dusunnah Instagram; the masjid states it is temporarily relocated to 3 Warple Way W3 0RX.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://dusunnah.com'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/dusunnah/')
where id = 'masjid-daar-as-sunnah-mib-2842';

-- Masjid e Quba — 70-72 Cazenove Road, Stamford Hill,Hackney, N16 6AA
--   verified: mquba.org contact page shows 70-72 Cazenove Road, Stamford Hill N16 6AA (exact match); no Facebook or Instagram links found on the site or verifiable elsewhere.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://mquba.org/')
where id = 'masjid-e-quba-mib-1146';

-- Masjid Ezzeitouna — 6 Western Avenue, none, East Acton,Ealing, W3 7UD
--   verified: Official site ezzeitouna.com contact page lists 6 Western Avenue, East Acton, London W3 7UD (exact match); no Facebook or Instagram links found on the site so socials omitted.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://ezzeitouna.com/en')
where id = 'masjid-ezzeitouna-mib-523';

-- Masjid Ibnu Taymeeyah — 1 Gresham Road, Brixton,Lambeth, SW9 7PH
--   verified: Official site brixtonmasjid.co.uk has an expired TLS certificate (fails to load over https) so website omitted; @brixtonmosque FB/IG match the org (Instagram posts self-identify as 'Brixton Mosque - Masjid Ibn Taymeeyah', 1 Gresham Road SW9).
update public.places set
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/brixtonmosque/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/brixtonmosque/')
where id = 'masjid-ibnu-taymeeyah-mib-1251';

-- Masjid Ilyas — Riverine Centre Abbey Mills, Canning Road, West Ham,Newham, E15 3ND
--   verified: london-markaz.com identifies itself as London Markaz / Masjid Ilyas / Abbey Mills Riverine Centre, Stratford-West Ham - the unique venue matching this address; no verified Facebook/Instagram.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.london-markaz.com/')
where id = 'masjid-ilyas-mib-1277';

-- Masjid Ramadan — 9-15 Shacklewell Lane, Dalston,Hackney, E8 2DA
--   verified: Official site shows 9-15 Shacklewell Lane, London E8 2DA and links both the Facebook page and Instagram account.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.masjidramadan.org/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/pages/Masjid-Ramadan-Hackney/459000050963088'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/masjidramadan/')
where id = 'masjid-ramadan-mib-1159';

-- Mazahirul Uloom London — 241-243 Mile End Road, Whitechapel,Tower Hamlets, E1 4AA
--   verified: mulmosque.org.uk shows 241-243 Mile End Road E1 4AA; Facebook page 'Mazahirul Uloom, London' matches org name and location; Instagram not verifiable.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://mulmosque.org.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/mazahirululoomlondon/')
where id = 'mazahirul-uloom-london-mib-1365';

-- Mosque & Islamic Centre of Brent — 33a Howard Road and 26a Chichele Road, Cricklewood,Brent, NW2 6DS
--   verified: micb.org.uk states 33A Howard Road, Cricklewood NW2 6DS (postcode match); no social links on the site and candidate Facebook pages could not be confirmed as official.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://micb.org.uk/')
where id = 'mosque-islamic-centre-of-brent-mib-1072';

-- Muslim Community Trust (Jamia Masjid) — 324-328 High Road, Leyton,Waltham Forest, E10 5PW
--   verified: Official MCT Leyton site lists 324-328 High Rd, Leyton E10 5PW and phone 020 8532 8858 (both matching) and links to its own mctleyton Facebook and Instagram accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://mctleyton.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/mctleyton'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/mctleyton')
where id = 'muslim-community-trust-jamia-masjid-mib-1389';

-- Nasrul-lahi-Il-Fathi Society of Nigeria — 33 Pages Walk, Bermondsey,Southwark, SE1 5TF
--   verified: nasfat.org.uk about page states its location as 33 Pages Walk off Grange Road, Bermondsey (street number and name match this branch), and the nasfat.pageswalk Facebook and nasfatpgwalk Instagram handles are branch-specific (Pages Walk).
update public.places set
  website   = coalesce(nullif(website, ''), 'https://nasfat.org.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/nasfat.pageswalk/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/nasfatpgwalk/')
where id = 'nasrul-lahi-il-fathi-society-of-nigeria-mib-2634';

-- Norbury Islamic Academy — 1595-1597 London Road, Norbury,Croydon, SW16 4AA
--   verified: norbury.org contact section shows 1595-1597 London Road, Norbury SW16 4AA (exact match); no social media links on the site.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://norbury.org/')
where id = 'norbury-islamic-academy-mib-1113';

-- Old Kent Road Mosque & Islamic Cultural Centre — 365 Old Kent Road, Southwark, SE1 5JH
--   verified: manuk.org shows 365 Old Kent Road, London SE1 5JH and links both social accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.manuk.org/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/OKR.Mosque.MANUK'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/okr_mosque_manuk/')
where id = 'old-kent-road-mosque-islamic-cultural-centre-mib-1326';

-- Poplar Mosque & Community Centre — 6 Webber Path, Poplar,Tower Hamlets, E14 0FZ
--   verified: Former site pmcc.org.uk no longer resolves (omitted); Facebook page 'Poplar Mosque & Community Centre' (handle poplarmcc) in Poplar, Tower Hamlets unambiguously matches the organisation.
update public.places set
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/poplarmcc/')
where id = 'poplar-mosque-community-centre-mib-1432';

-- Purley Masjid — 63 Whytecliffe Road South, Croydon, CR8 2AZ
--   verified: Same organisation confirmed via its new-build project at 63 Whytecliffe Rd S CR8 (NLA project page); the site currently lists temporary premises at 130 Brighton Road CR8 4EX and links both social accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://purleymasjid.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/PurleyMosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/purleymasjid/')
where id = 'purley-masjid-mib-374';

-- Redbridge Masjid & Islamic Centre — 179 Eastern Avenue, Redbridge,Redbridge, IG4 5AW
--   verified: redbridgeislamiccentre.co.uk contact page explicitly lists 'Redbridge Masjid: 179 Eastern Avenue, IG4 5AW' as one of its two sites (alongside Gants Hill Masjid) and links this Facebook page.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.redbridgeislamiccentre.co.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/Redbridge-Islamic-Centre-143328075729175/')
where id = 'redbridge-masjid-islamic-centre-mib-1309';

-- Redbridge Mosque & Islamic Centre — 28-28a Woodford Avenue, also 34 and 36 Woodford Avenue, Gants Hill,Redbridge, IG2 6XG
--   verified: redbridgeislamiccentre.co.uk lists Gants Hill Masjid at 28 Woodford Avenue IG2 6XG (postcode match) and links to this Facebook page.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.redbridgeislamiccentre.co.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/Redbridge-Islamic-Centre-143328075729175')
where id = 'redbridge-mosque-islamic-centre-mib-1317';

-- Romford Mosque — 29 Lessington Avenue, Romford,Havering, RM7 9EB
--   verified: romfordmosque.co.uk shows 29 Lessington Avenue, Romford RM7 9EB matching the input; Facebook handle romfordmosque matches the organisation name and town.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://romfordmosque.co.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/romfordmosque')
where id = 'romford-mosque-mib-1192';

-- Seven Kings Mosque — 645-647 High Road, Seven Kings,Redbridge, IG3 8RG
--   verified: Seven Kings Muslim Educational Trust site shows 645-647 High Road, Seven Kings, Ilford (street match; site shows IG3 8RA vs listing IG3 8RG); site has Twitter/YouTube only, no verified Facebook or Instagram.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://skmet.org/')
where id = 'seven-kings-mosque-mib-1313';

-- Shadwell Jamme Masjid — 143-145 Shadwell Place, Shadwell,Tower Hamlets, E1 2QB
--   verified: Site shows 143-145 Martha Street, London E1 2QB (postcode matches input) and its Facebook share link resolves to the 'Shadwell Jame Masjid' page; no Instagram listed.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://shadwelljamemasjid.org.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/shadwellmasjidofficial/')
where id = 'shadwell-jamme-masjid-mib-1373';

-- Shah Jalal Masjid — Starcross Street, Euston,Camden, NW1 2HR
--   verified: Site contact page shows 204/A N Gower St, Star Cross St, London NW1 and self-identifies as the Euston Mosque (Starcross Street matches; listing phone 020 7387 0046 matches); Facebook page 'Shahjalal Jame Masjid Euston Mosque' matches.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://shahjalaljamemasjid.com/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/eustonmosque/')
where id = 'shah-jalal-masjid-mib-1100';

-- Shah Poran Masjid And Islamic Centre Trust — 444 Hackney Road and Treadway Street, Cambridge Heath,Tower Hamlets, E2 6QL
--   verified: Site's contact page confirms 444 Hackney Road, London E2 6QL and links the Facebook page; no Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://shahporanmasjid.uk/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/ShahporanMasjid')
where id = 'shah-poran-masjid-and-islamic-centre-trust-mib-1153';

-- Shoreditch Masjid Trust — 53-55 Redchurch Street, Shoreditch,Tower Hamlets, E2 7DJ
--   verified: shoreditchmosque.com contact page shows 53-55 Redchurch Street, London E2 7DJ; Facebook @shoreditch.masjid page name matches the org and area; no Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://shoreditchmosque.com'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/shoreditch.masjid/')
where id = 'shoreditch-masjid-trust-mib-1370';

-- South London Islamic Centre — 8 Mitcham Lane, Streatham,Lambeth, SW16 6NN
--   verified: slicmosque.org states 8 Mitcham Lane, London SW16 6NN (exact match) and links to the Instagram account; no Facebook on site.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://slicmosque.org/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/streathammosque')
where id = 'south-london-islamic-centre-mib-1252';

-- Streatham Hill Masjid — 106 Streatham High Road, Streatham,Lambeth, SW16 1BW
--   verified: Instagram @streathamhillmosque bio gives 108 Streatham High Road SW16 1BW - exact postcode match with the input; streathamhillmosque.co.uk is the matching-name site (pages titled 'Streatham Hill Islamic Centre').
update public.places set
  website   = coalesce(nullif(website, ''), 'https://streathamhillmosque.co.uk'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/streathamhillmosque/')
where id = 'streatham-hill-masjid-mib-876';

-- Süleymaniye Câmii — 212-216 Kingsland Road, Dalston,Hackney, E2 8AX
--   verified: suleymaniye.org about page confirms 212-216 Kingsland Road, London E2 8AX; candidate Facebook/Instagram accounts could not be verified as run by this London mosque, so omitted.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.suleymaniye.org')
where id = 's-uuml-leymaniye-c-226mii-mib-1154';

-- Sutton Islamic Centre — 62 Oakhill Road, Sutton,Sutton, SM1 3AG
--   verified: suttonislamiccentre.co.uk confirms 62 Oakhill Rd, Sutton SM1 3AG; social icons on the site are non-functional placeholders and no branch-specific Facebook/Instagram could be verified.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.suttonislamiccentre.co.uk')
where id = 'sutton-islamic-centre-mib-1332';

-- Thornton Heath Islamic Centre — 150 Gillett Road, Thornton Heath,Croydon, CR7 8SN
--   verified: Site shows 150 Gillett Road, Thornton Heath CR7 8SN (exact match); no verifiable official Facebook or Instagram found.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.thislamiccentre.org/')
where id = 'thornton-heath-islamic-centre-mib-2378';

-- Tooting Islamic Centre — 127-145 Upper Tooting Road, Tooting,Wandsworth, SW17 7TJ
--   verified: Combined org 'Balham Masjid & Tooting Islamic Centre' site shows 145 Upper Tooting Rd, London SW17 7TJ and links both social accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.balhammosque.org/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/balhammosque'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/balhammosque_tic')
where id = 'tooting-islamic-centre-mib-1412';

-- Turkish Religious Foundation of the United Kingdom — 31 High Street, Hornsey,Haringey, N8 7QB
--   verified: Old domain diyanet.org.uk now redirects to an unrelated site (website omitted); Facebook 'Ingiltere Diyanet Vakfi' (London) and Instagram 'Diyanet United Kingdom' (London) are the foundation's own accounts.
update public.places set
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/ingiltere.diyanet/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/diyanetunitedkingdom/')
where id = 'turkish-religious-foundation-of-the-united-kingdom-mib-15063004';

-- Uxbridge Masjid — 4-5 Cowley Mill Road, Uxbridge,Hillingdon, UB8 2QB
--   verified: Official site shows 4-5 Cowley Mill Road, UB8 2QB; no Facebook or Instagram links present on the site, so socials omitted.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.uxbridgemasjid.org.uk/')
where id = 'uxbridge-masjid-mib-1196';

-- Wembley Central Masjid — 35-37 Ealing Road, Wembley,Brent, HA0 4AE
--   verified: wembleycentralmasjid.co.uk about page shows 35-37 Ealing Road, Wembley HA0 4AE and links the WembleyCentralMasjidOfficial Facebook page; Instagram @wembleycentralmasjid_ is labelled the official account with the exact org name.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://wembleycentralmasjid.co.uk'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/WembleyCentralMasjidOfficial/'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/wembleycentralmasjid_/')
where id = 'wembley-central-masjid-mib-1063';

-- West London Islamic Centre Jamia Masjid — Brownlow House, Brownlow Road, West Ealing,Ealing, W13 0SQ
--   verified: wliconline.org location page gives Singapore Road, West Ealing W13 0SQ (postcode match) and phone 020 8840 4140 matching the input; site links both social accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://www.wliconline.org/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/westlondonislamiccentre'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/ukim.wlic')
where id = 'west-london-islamic-centre-jamia-masjid-mib-1122';

-- West London Islamic Cultural Centre — 7 Bridges Place, Parsons Green,Hammersmith and Fulham, SW6 4HW
--   verified: WLICC is housed at Al Muntada Trust; the trust's official site contact page lists 7 Bridges Place, Fulham, London SW6 4HW (matching address and postcode) and links to its Almuntadatrust Facebook and Instagram accounts.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://almuntadatrust.org/'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/Almuntadatrust'),
  instagram = coalesce(nullif(instagram, ''), 'https://www.instagram.com/almuntadatrust/')
where id = 'west-london-islamic-cultural-centre-mib-1161';

-- West Norwood Mosque — 58-60 Norwood High Street, West Norwood,Lambeth, SE27 9NR
--   verified: westnorwoodmosque.com shows 58-60 Norwood High St, London (street number and name match the input); Facebook page WestNorwoodMosque matches the organisation name and location.
update public.places set
  website   = coalesce(nullif(website, ''), 'https://westnorwoodmosque.com'),
  facebook  = coalesce(nullif(facebook, ''), 'https://www.facebook.com/WestNorwoodMosque')
where id = 'west-norwood-mosque-mib-1444';

commit;
