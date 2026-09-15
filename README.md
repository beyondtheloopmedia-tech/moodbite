# Moodbite

Six questions about your mood, then one thing to eat and a link to order it.

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · TypeScript.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Deploys to Vercel with no configuration.

## How it works

Every dish and every mood reading is a point in the same six-axis space:

`comfort · indulgence · heat · lightness · novelty · sweetness`

1. Six answers become a **target vector** plus a set of **axis weights** (`lib/scoring.ts`, `buildProfile`). The weights matter as much as the target. "Surprise me" does not only raise the novelty target, it raises how much novelty is allowed to decide the outcome.
2. Hard filters run first: diet, time-of-day slot, delivery-time ceiling.
3. Remaining dishes are scored by weighted L1 distance, then adjusted for portion fit and delivery headroom.
4. Dishes local to your city get a small bump. A nudge, never a filter, so every city still sees the whole catalogue.
5. The weather shifts the target vector: warm and heavy for rain and cold, light for heat.
6. The shortlist is capped at two dishes per cuisine so it does not return four biryanis.

Time of day is read from the browser clock and maps to breakfast / lunch / snack / dinner / late night.

## The clock and the sky

A small clock sits above everything, and the page reads the hour twice for two
different purposes:

- **`Slot`** (5 values) decides what food is plausible. It drives the engine.
- **`DayPart`** (8 values) decides what the page says and how it looks.

They are separate on purpose, so writing new copy can never move a meal boundary
by accident. `lib/daypart.ts` owns the day parts and their greetings: *Early start*,
*Good morning*, *Brunch, if we are being honest*, *Lunch time*, *The afternoon dip*,
*Good evening*, *Dinner time*, *Still up*.

The palette follows the same arc. Each day part redefines the tokens `@theme`
already declares, so every existing utility (`bg-sage`, `text-ink`, `bg-ink`/`text-paper`)
follows along and no component knows a theme exists. Evening warms; dinner and late
night invert ink and paper rather than adding tokens, so `text-ink` stays "the text
colour" and just swaps ends.

Weather **tints** that background rather than repainting it, so conditions read as
weather over the day instead of a competing second theme. Every one of the 8 × 6
day-part/weather combinations was measured for contrast; all pass WCAG AA at 4.5:1
for both body and secondary text.

### Weather moves the food, not just the page

`weatherBias()` reduces the forecast to the only three questions the vector space
can answer: warm and heavy, light, or neither.

| Condition | Effect on the target |
| --- | --- |
| Rain, drizzle, thunder | comfort and indulgence up, lightness down, heat up a little |
| Snow, fog, or feels-like at or below 16° | the same, harder |
| Feels-like at or above 34° | lightness up, indulgence down, heat down |
| Anything else | nothing |

Apparent temperature, not the raw number: 31° at 80% humidity decides your dinner
and 31° in dry heat does not.

Two deliberate limits. The bias is **weaker than mood and energy** — the weather is
the room, not the person. And it is applied **before** the heat slider, so moving the
slider still wins outright; an explicit choice beats an inferred one.

The API reads the weather itself from the city it already resolved, rather than
accepting it from the client, so it cannot be spoofed into recommending differently.
When it bites, the result says so: *Leaning warm and heavy, for the rain.*

`app/layout.tsx` stamps the day part before first paint, so a late-night visit never
flashes a daylight page. That inline script is generated from `DAY_PART_BOUNDARIES`
rather than written out, so its hours cannot drift from `dayPartForHour`.

Weather comes from Open-Meteo (no key, no account) through `app/api/weather`, not
from the browser. The browser sends a city slug; resolving that to coordinates
happens on our side, so Open-Meteo only ever sees a city centre from our own table
and never the device's position. If it is slow or down, the line simply does not
appear. Open-Meteo is free for non-commercial use; a commercial Moodbite needs
their paid plan.

## Standing preferences

`lib/interests.ts` holds six optional preferences — chilli, sweet tooth, keep it
light, try anything once, comfort over novelty, go big — each expressed as a delta
on the same six axes as everything else. A profile is not a second system bolted on;
it is a nudge to the target vector the six answers already produce.

Precedence, weakest last to win: **the six answers**, then the weather, then your
standing preferences, then the heat slider.

Two rules govern how preferences fold in, both learned from watching the naive
version get them wrong:

- **Contradictions cancel, including their weight.** Picking *keep it light* and
  *go big* together nets out to almost no preference on lightness, so the engine
  must not then weigh lightness *harder* than with no preference at all. The
  weight bump follows the surviving pull, not the sum of the shouting: one
  preference moves lightness weight 1.00 → 1.50, the contradictory pair moves it
  1.00 → 1.07, because only 19% of the pull survives.
- **Stacking has diminishing returns.** Six preferences describe taste in
  general, not tonight, and must never out-vote the six answers. Dividing by
  `sqrt(n)` keeps one preference meaningful while stopping six from dominating:
  with a *stressed* mood, all six selected returns the same three dishes merely
  reordered.

Axis weights are also capped, so no single axis can decide the answer alone. The slider is an explicit request made
just now, so it beats everything; preferences you set once should never outrank how
you say you feel tonight.

Storage is the only part that varies. Today it is `localStorage`, so this works with
no account and no backend. `components/useProfile.ts` isolates that: `load` and
`save` are the two functions that change when a database is wired in, and nothing
that renders has to know.

### Accounts

One invitation, not a wall. A sign-in dialog appears **after** the first
recommendation, never before: asking for an account before someone has seen
what the thing does is how you lose them. It is dismissible by Escape, by the
backdrop or by "Not now", and the dismissal is remembered, so it appears once
and never again.

Straight after a first sign-in there is a profile step, reachable afterwards
from **Preferences** in the header - set once and never changeable is not a
preference, it is a trap.

Four questions, each one clickable and each one changing an input the engine
actually reads:

| Question | What it moves |
| --- | --- |
| Where you usually order | `home_city`, the default city |
| Anything off the table? | `diet`, a hard filter |
| How much heat do you take? | the baseline of the heat axis, which was 0.45 for every person alive |
| Anything you would rather never see? | excludes whole cuisines outright |
| Anything you lean towards? | the standing preferences |

Heat deliberately has no entry in the last row. It used to - "Chilli, always" -
which put two controls in the same dialog arguing with each other: a binary
nudge beside a three-level tolerance. The tolerance is the better instrument,
so the nudge went.

The last two are the ones that were missing. The heat axis had a single
hardcoded starting point for everybody, and the engine could cap two dishes per
cuisine but had no way to rule one out across seventeen of them. Mood, weather
and the heat slider all still move from the stated baseline; "I do not eat
that" is a filter rather than a preference to be weighed.

The original profile step: default city, diet and standing preferences. It fills `home_city` and `diet`, which existed in the
schema from the beginning and which nothing ever wrote - every account showed
no city because of it. Every field is skippable; the six questions remain the
product.


Optional, and only ever changes *where* preferences are kept. There is no signup
wall: signed out, the app is exactly what it was.

- Sign-in sits top right, on the clock row, and says **Sign in**. It previously
  read "Keep these across devices" and sat below the fold under the preference
  chips, where it was mistaken for a description rather than a control and went
  unfound.
- Sign-in is a six digit code, or a magic link. No password to store, no OAuth
  provider to configure, no reset flow to build.
- Signed in, preferences live in the `profiles` row and follow you between devices.
  localStorage is still written, so signing out does not feel like losing settings.
- Picking preferences while signed out and *then* signing in carries them up into
  the empty profile rather than discarding them.

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see
`.env.example`) to switch it on. With either missing, `isSupabaseConfigured` is
false, the account UI does not render, and every Supabase helper returns null —
a supported state, not a misconfiguration.

`supabase/migrations/0001_profiles.sql` has the schema:
`profiles` (interests, diet, home city) and `recommendation_events` (the shown and
clicked stream the README has wanted from the start). Row level security is written
so a row is only ever visible to the user it belongs to, with no read-all path, and
the event log has no update or delete policy — a log that can be rewritten is not
evidence of anything.

## Where to actually get it

The engine answers *what to eat*. Google answers *where*, and until now the
answer ended at a Zomato delivery page. Under the headline dish there is now one
button, **Who does this well near me?**, which returns five real restaurants
ranked by the same mood that chose the dish.

- **Ratings have to be earned.** A 4.8 from eleven reviews is not better than a
  4.3 from eight hundred, and a raw sort by rating puts the eleven first every
  time. Each rating is pulled toward the mean by a prior worth fifty reviews, so
  volume buys the right to a high average. Google's own figure is what gets
  displayed; the shrunk one only decides the order.
- **Patience picks the trade-off.** It is the one answer already about distance
  in disguise — somebody who will not wait half an hour for delivery will not
  drive across town either — so it sets how hard proximity competes with
  quality. "Watching the spend" then pushes the price band down.
- **One result, one call.** It loads with the recommendation, for the headline
  dish only — never for the three under "also close", because four billed calls
  to furnish a glance is not a trade worth making.
- **Browsing does not buy anything.** It auto-loads for the *first* answer of a
  session only. Once somebody presses "show me something else" they are
  browsing rather than deciding, and buying restaurants for a dish they are
  about to skip past is paying for a choice nobody has made. Measured before
  the rule existed: one answer and four presses cost five calls, a whole day's
  allowance for one reader. After it, one. Browsed dishes get a button instead,
  which costs nothing until it is pressed.
- **It stays true.** Moving city, or the engine picking a different dish
  underneath the panel, leaves the list on screen wrong rather than merely stale,
  so it re-fetches — debounced by 600ms and skipped while a recommendation is
  still in flight, because the city picker is a native select and the heat slider
  fires on every step. Verified as five rapid city changes costing one call, and
  an eight-step heat drag costing one.
- **The cap is a precondition, not a refinement.** Asking for ratings puts the
  call in Google's Enterprise tier: 1,000 free a month, then about $35 per 1,000.
  `0010_places_free_ceiling.sql` holds a global monthly cap of **990** — under
  the free allowance on purpose, with ten calls of slack so the deliberate race
  in `claim_places_call` can never be what produces a first invoice — and a
  per-client daily cap of **5**. Both live server side because the anon key is
  public. Since the panel loads by itself, the budget is spent by whoever
  arrives rather than by whoever asks, which makes the scarce thing *how many
  different people it reaches*; hence the low per-client number. Run out and the
  panel says so while the order links carry on working. With no Supabase there
  is nowhere to count, so Google is never called at all.
- **The day gets an allowance, not an average.** "About 33 a day" was
  arithmetic, not a rule: nothing stopped a hundred people on a Friday spending
  a third of the month before dinner. `0011_places_daily_pacing.sql` gives each
  day *what is left divided by the days still to come*, floored at 10 and capped
  at 45. A quiet day leaves more for tomorrow, a busy one borrows less, and the
  budget lasts the month by construction rather than by luck. Overspend early
  and it throttles: 600 gone by the 10th drops the day to 19.
- **Ours has to refuse before Google's does.** The key also carries a daily
  quota in the Cloud console, and a refusal from Google is not one this code can
  explain — the route can only say it could not reach the restaurant list, while
  the admin gauge cheerfully shows hundreds of calls left. Two limiters
  disagreeing is worse than either alone, so the 45 ceiling sits under the
  console's 50 and ours is the message people see. Set the console quota above
  45, not below.
- **It never demands a location.** A permission dialog landing unbidden on the
  moment somebody finally gets their answer is a bad trade, so the panel uses
  whatever is already known — a coordinate if the opening screen got one, the
  city centroid otherwise — says which of the two it measured from, and offers
  once to sharpen it. Declining is an answer; the offer is withdrawn rather than
  repeated. `refineCoords` takes a coordinate without rewriting the city the
  reader chose, because somebody who already said "Mumbai" should not have that
  silently changed because a prompt finally got answered.
- **A coordinate is only used where it is relevant.** More than 120km from the
  city being asked about and it is dropped for the centroid, because somebody in
  Delhi looking up Mumbai wants the middle of Mumbai, not a radius around
  themselves. The header then says which of the two it measured from — calling a
  centroid "nearest to you" would be wrong by the width of a city.
- **The coordinate is blunted at source.** `useCity` rounds the browser's
  reading to two decimal places — about a kilometre — inside the geolocation
  callback, and the exact figure is discarded there. Enough to search around
  somebody, not enough to find their flat. Declining is a normal answer: the
  centroid still works and the panel says so.

Two fields were deliberately left out of the request. `delivery`/`takeout`/
`dineIn` and `servesVegetarianFood` would promote the call to Google's
Enterprise+Atmosphere tier for questions that proximity and an already
diet-filtered dish answer well enough. `lib/places.ts` says which tier each
field sits in; check before adding one.

Set `GOOGLE_PLACES_KEY` (see `.env.example`) to switch it on. Server side only —
a Places key in the browser bundle gets scraped and billed.

## Asking again without starting again

"Show me something else" re-runs the same answers with the dishes already seen
excluded, so it returns the *next* four by score rather than a reshuffle of the
same four. The engine stays deterministic, which matters because the result
carries a "picked because…" line: randomness would make that sentence a lie.

Run out and it loops rather than dead-ends — the server re-asks with no
exclusions, flags `wrapped`, and the page says so instead of silently repeating
the first four, which would read as the button being broken. Changing city or a
preference clears what was seen, because that is a different question rather
than the same one asked again.

Verified against the catalogue: eight distinct pages with no dish repeated
across thirty-two shown, every page still respecting the two-per-cuisine cap,
and identical inputs still producing identical output.

## What the evidence changed

Five sources were read against the engine. Three produced changes, one confirmed
something already built, and one argued against a feature.

**Stress reaches sweetness.** Sweet is the most reported craving under emotional
load (60%) and stress the most reported trigger (55%); the paper frames these as a
single stress-reward association rather than two facts. The engine raised comfort
and indulgence under stress but never touched sweetness. It does now.
*Saraswat & Harle 2026, IJSRA 18(03) 981-991.*

**Price counts, when asked for.** `priceBand` sat on all 46 dishes and was read
nowhere. Price is a top-three purchase factor for 39% of Indian consumers with 63%
concerned about food cost, and deals (36) rank almost level with cuisine (37) when
choosing where to order. A *Watching the spend* preference now applies a price fit,
the same shape as the existing portion fit. It stays opt-in rather than always-on,
because a silent price bias would quietly reshape everyone's results.
*PwC Voice of the Consumer 2025 India; Uber Eats / Ipsos, Food Moods of India.*

**Fasting is a mode, not an edge case.** A 19M-row dataset of Indian fasting
observance covers ramadan, navratri, ekadashi and monday fasts, with a permitted
food vocabulary of sabudana, kuttu, singhara, fruit, dairy and rock salt. The
catalogue contained none of it, so on a vrat day the entire app was unorderable.
Five vrat dishes were added and the filter runs **both ways**: vrat dishes are
deliberately plain, which made them win ordinary queries by being the least
opinionated option, and offering *vrat wale aloo* to someone who is not fasting
reads as a mistake.
*darshvit20/NutriRecIndia19M.*

**Weather was already right.** Consumption-value research on Indian staple food
delivery records weather as a contextual variable alongside the five value
dimensions, and situational context is one of those dimensions. The engine's
functional (eta, price), emotional (the six answers), conditional (weather, day
part, fasting) and epistemic (novelty) coverage all map onto that model.
*Theory of Consumption Value in Indian Staple Food Delivery.*

**And one feature the evidence argued against.** An obvious next question is "who
are you eating with", since social value is the one consumption dimension the
engine does not model. The Ipsos survey of 4,000 consumers says not to: company
(12) and occasion (9) rank far below cuisine (37) and deals (36) when choosing,
and it states plainly that the food order is largely agnostic to company and
occasion *unless the occasion is celebratory* - which the `celebrating` mood
already covers. The question would have added friction for a signal that does not
move the answer.

The same survey is the clearest statement of why this app exists: on 4 out of 10
occasions ordering in is chosen to lift spirits, and 82% of consumers order from
five or fewer restaurants, largely on autopilot. The two-per-cuisine cap on the
shortlist exists to push against exactly that.

## Admin

`/admin` shows sign-up counts, what gets ordered in each mood, and a way to
help someone who cannot get in.

**Sign-ups are counts only.** No individual accounts are listed and the query
does not select the email column at all, so the page cannot show who anyone is
even if the rendering were wrong. What it reports instead is the shape of the
user base: how many joined recently, how many completed each part of their
profile, which preferences get picked, and which home cities. Mood and ordering
history stay aggregate. Read only: nothing on the page can change a user's
data, and there is no admin write policy in the schema to allow it.

**No `service_role` key exists in this application.** An admin reads through
their own session under the policies in `0002_admin.sql`, so there is no key
that bypasses row level security and nothing whose leak would expose every
user. The page guard is the second lock, not the only one: if `is_admin` is
false the queries return empty on their own.

`is_admin` is a column on `profiles`, set by hand in the dashboard. Nothing in
the app can grant it, so admin cannot be reached by signing up.

There are no passwords, so there is nothing to reset. "Help someone sign in"
sends them a fresh one-time code, which goes to *their* address and never to
the admin: an admin can get a user back in without ever being able to get in
as them.

### The log records what shaped the answer

`recommend()` reads nine things: the six answers, the time slot, the city, the
weather, the standing preferences, the fasting flag and the heat slider. The
log kept four of them, so a row could say what was suggested but not enough to
reconstruct why - which makes the click stream useless for the one job it
exists to do.

`0003` adds the rest: `hunger`, `palate`, `patience`, `diet`, `weather`,
`temp_c`, `day_part`, `interests` and `heat_override`. The admin panel breaks
the log down by mood, time of day, city and weather, and counts how often the
heat slider was moved, since that is a reader overruling the engine outright.

The context is assembled in one place in `MoodQuiz`. Two call sites building it
separately is exactly how impressions ended up without a mood while clicks had
one.

### The mood data had to be recorded first

`recommendation_events` logged what was shown and clicked but not the mood it
was shown in, so "what do people order when stressed" was unanswerable. `0002`
adds `mood`, `energy` and `fasting` to the log. Rows written before it have
null moods and are grouped separately rather than silently folded in.

Each shortlist carries an id and each dish its rank, so the log can say *which
position was taken* - the most direct measure of ranking quality there is. If
the headline pick is not the one people choose, the ranking is wrong, and
nothing else on the page would say so. Grouping by shortlist also makes a
zero-click shortlist visible: four suggestions, none of them wanted.

The panel shows clicks against impressions, not clicks alone. A dish with many
impressions and no clicks is the engine being confidently wrong, which is the
thing worth seeing.

## What you are doing while you eat

Most eating happens in front of a screen: the consumption-value survey records
screen time while eating as a variable, and roughly two thirds of that sample
sat at the higher levels. So this is the common case, not a novelty.

It constrains the *form* of the food rather than its flavour, which is why it
is not a vector axis:

| Doing | What changes |
| --- | --- |
| Watching something | one-handed up, messy down |
| Working | messy down hard, and the target shifts lighter |
| People are over | feast portions up, single-serving snacks down |

Two new dish flags carry it, `handheld` and `messy`, tagged by what the eating
actually involves rather than by cuisine.

### Pro, and where the gate lives

The activity feature is Pro. `profiles.is_pro` records **entitlement only,
never billing state** - who has access, not who paid, when or how much. Billing
has its own failure modes and a boolean quietly doubling as a receipt is how
the two get confused. It is granted by hand, exactly like `is_admin`; nothing
in the app can set it.

**The gate is on the server.** `app/api/recommend` reads the session and checks
the entitlement itself, and ignores the `activity` field without it. Hiding the
control in the browser is presentation; this is the lock.

## Where you are

The browser gives a coordinate. `lib/cities.ts` holds the delivery cities with their
coordinates, and the nearest one wins by haversine distance.

**The coordinate never leaves the device.** The city list ships with the app, so
matching is arithmetic rather than a call to a geocoding service, and there is no
third party in the path and nothing to send anyone's location to.

Location is asked for on the Start tap, so the permission prompt is tied to a real
gesture, and the lookup runs while the six questions are being answered. It never
gates the quiz. Four states, all of them fine:

| State | What happens |
| --- | --- |
| Located within 120 km of a city | That city, with a "from your location" note |
| Chosen by hand | That city, remembered in `localStorage` for next time |
| Further than 120 km from all of them | No city claimed, distance shown, picker offered |
| Denied or unavailable | No city, national links, picker offered |

Locality itself comes from `CUISINE_HOME` (a cuisine's home cities) plus a per-dish
`localTo` for the cases a cuisine label cannot express. Momos are "Tibetan" everywhere,
but they are Delhi and Kolkata street food.

## Why there is no scraper

Zomato and Swiggy are SPAs behind commercial bot detection, with rotating obfuscated payloads and terms that prohibit scraping. A scraper built today breaks within weeks and is the least defensible part of the product.

So the app deep-links out instead:

```
https://www.swiggy.com/search?query=<dish>
https://www.zomato.com/<city>/delivery/dish-<slug>
```

**Zomato ignores `?q=` on a cold page load.** It writes that parameter when you
search inside the app and reads it back from client state, so a link built with it
lands on the city's generic delivery page every time. Typing the same search in the
app produces the identical URL and *does* show results, which makes it look like it
works right up until you open it in a fresh tab.

What survives a fresh load is the dish path, `/<city>/delivery/dish-<slug>`, which is
server rendered. Those pages exist only for dishes Zomato has curated and **404**
otherwise, so the slugs are verified per dish rather than generated: 31 of the 46
dishes have one, and the rest fall back to their city's delivery page. All of them
were checked in a second city to confirm a slug is not city-specific.

City slugs are verified for the same reason, because getting one wrong fails silently:

- Bengaluru is `bangalore`. `bengaluru` 404s.
- Delhi is `ncr`. `delhi` quietly serves a **Hyderabad** page.
- An unknown slug does not 404 either. It also quietly serves Hyderabad.
- So does `/india/delivery`, which is why no-city links go to `zomato.com` instead.

Only slugs from `CITIES` ever reach a link, and the API rejects a city it does not
recognise rather than passing it through.

Swiggy has no city or dish in its URL. It resolves both from the user's own session
and saved address, so its link is the same everywhere.

No scraping, works today, and it becomes an affiliate link the moment you have a partner deal.

## Swapping the catalogue

`lib/source.ts` defines the only seam that touches data:

```ts
export interface DishSource {
  name: string;
  list(city: string): Promise<Dish[]>;
}
```

`seedSource` reads the 45-dish file in `lib/dishes.ts`. Replace it with a partner feed, a per-city curated sheet, or your own ingestion job, call `setSource()`, and nothing else in the app changes.

Each dish needs its six vector values set honestly. The whole engine rests on that tagging, so it is worth doing by hand for the first few hundred dishes rather than generating it.

## Files

```
app/page.tsx              page shell
app/api/recommend/route.ts scoring endpoint
components/MoodQuiz.tsx   the six-question flow
components/Results.tsx    result, alternates, heat refinement
components/CityBar.tsx    where the order is going, and how to change it
components/useCity.ts     geolocation, nearest-city match, remembered choice
components/AmbienceBar.tsx clock, greeting, weather
components/useAmbience.ts the ticking clock, day part, and weather fetch
components/InterestPicker.tsx  the optional standing preferences
components/useProfile.ts  where those preferences live
components/AccountBar.tsx the optional magic-link sign-in
components/useSession.ts  session state
lib/types.ts              Dish, Answers, Vector, City
lib/dishes.ts             seed catalogue
lib/scoring.ts            profile building and matching
lib/cities.ts             delivery cities, verified Zomato slugs, locality map
lib/daypart.ts            the eight day parts and their greetings
lib/interests.ts          standing preferences, as vector deltas
lib/weather.ts            WMO codes to conditions, and the Open-Meteo call
lib/source.ts             data source adapter and order links
lib/supabase/             clients, config detection, hand-written schema types
supabase/migrations/      the SQL that creates profiles and the click stream
```

## Next

- Write to `recommendation_events`. The table and its policies exist; nothing logs to it yet, and that click stream is what lets you tune the vectors instead of guessing them.
- Per-city catalogues. Locality is a scoring nudge today because the seed catalogue is national; a real per-city feed behind `DishSource` would make it a filter.
- Persist the last answer set so a returning user skips to results.
