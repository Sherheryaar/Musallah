# Triaging jamaat-time contributions

The place-detail screen invites two kinds of jamaat-time contribution, and
both arrive in the existing `submissions` table (`kind = 'edit'`, with
`place_id` set) carrying a machine-scannable marker at the front of
`message`. Nothing about the table or its RLS policies changed — the
structure lives entirely in the message text.

## The three markers

| Marker | Sent by | Meaning |
| --- | --- | --- |
| `[Jamaat confirmed]` | one tap on **Still right** | The times shown in the app were checked by a user on the stated date. The message restates the exact times they were looking at, so a later data update can't retroactively change what was confirmed. |
| `[Jamaat outdated]` | one tap on **Out of date** | Same restated payload, but the user says the times no longer match reality. Several of these against one place = refresh that place's timetable. |
| `[Jamaat times]` | the **Add them** sheet | Free-text times typed by a user for a place with no (or wrong) jamaat data. The bracketed topic that follows the marker is the provenance they picked: `[Masjid website or app]`, `[Noticeboard at the masjid]`, `[I pray here regularly]`, or `[Asked the masjid directly]`. |

Users can tap Still right / Out of date at most once per place per 30 days
per device (client-side cooldown in AsyncStorage), so counts stay a
meaningful pulse rather than one person's tapping habit.

## Useful queries (Supabase SQL editor)

Everything jamaat-related, newest first:

```sql
select created_at, place_id, message
from submissions
where message like '[Jamaat%'
order by created_at desc;
```

Places whose times the community disputes (refresh queue, worst first):

```sql
select place_id, count(*) as disputes, max(created_at) as latest
from submissions
where message like '[Jamaat outdated]%'
group by place_id
order by disputes desc;
```

Confirmation tallies — a place with several recent confirms is a good
candidate for `confidence = 'community'` on its jamaat record:

```sql
select place_id, count(*) as confirms, max(created_at) as latest
from submissions
where message like '[Jamaat confirmed]%'
group by place_id
order by confirms desc;
```

Typed-in timetables waiting to be applied, with their provenance visible in
the message prefix:

```sql
select created_at, place_id, message
from submissions
where message like '[Jamaat times]%'
order by created_at desc;
```

## Weighing provenance

The topic chips exist so triage can decide how much checking a contribution
needs without anyone having written a sentence about it:

- **Masjid website or app** / **Noticeboard at the masjid** — near-primary
  sources; spot-check against the website if one is on record, then apply.
- **Asked the masjid directly** — strong, unverifiable; apply with
  `confidence` left as-is unless corroborated.
- **I pray here regularly** — honest lived knowledge; ideally wait for a
  second submission or a confirm tap before adopting wholesale.

## Applying times to a place

Jamaat times live in `places.jamaat` (jsonb). Only include prayers actually
known; `source` and `recordedOn` are required (the app drops records missing
either — see `coerceJamaat` in `src/data/placesRepo.ts`):

```sql
update places
set jamaat = jsonb_build_object(
  'fajr',       '05:15',
  'dhuhr',      '13:30',
  'asr',        '18:00',
  'maghrib',    '20:40',
  'isha',       '22:00',
  'source',     'User submission (noticeboard), applied 2026-08-11',
  'recordedOn', '2026-08-11'
)
where id = '<place_id>';
```

The app's realtime subscription picks the change up within seconds — no
release needed.

## Test rows from 2026-08-10

The feature was verified end-to-end against the live database on
2026-08-10, which left two throwaway rows safe to delete:

```sql
delete from submissions
where message like '[Jamaat times]%TEST submission from the developer''s automated check%'
   or (message like '[Jamaat confirmed]%2026-08-10%'
       and place_id = 'afghan-islamic-cultural-centre-mib-1058');
```
