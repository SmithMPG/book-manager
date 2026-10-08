# Cadence — Product Spec (MVP)

## The problem
A daily "checkout" questionnaire (Google Form) helps a sales leader track ~15 financial advisors (FAs), but adoption is inconsistent — there's no benefit to the FA for filling it in beyond compliance. Same issue with the monthly "pledge" form. The fix: build something genuinely valuable to the FA, and gate it behind checkout completion. This turns the sales leader into an "enabler" (provides a good tool) rather than a "nagger" (chasing forms).

## Core principle
**Clients are the single source of truth.** Meetings and activities (quotes, FNAs, cases, wills leads, referrals) both link directly to a client — never to each other. This avoids false-precision problems like "which of a client's 5 meetings does this quote belong to" when the quote happens weeks after the meeting that led to it.

**A business month runs close-off to close-off, not calendar month to calendar month.** It starts the day after one close-off date and ends on (inclusive of) the next — see `month_periods` below and `CLOSE_OFF_DATES` in `constants.js`. Every "this month" figure in the app (PCR, conversion rate, cases submitted, expected commission, …) means this business month, never the calendar one.

---

## Data model (Supabase)

```sql
fas
  id            uuid, pk (= auth.users.id)
  name          text
  surname       text
  phone         text
  email         text
  pcr_target    int        -- validation target, set by manager
  is_active     boolean default true   -- false = "left", data retained

clients
  id            uuid, pk
  fa_id         uuid, fk -> fas.id
  name          text
  surname       text
  phone         text
  email         text
  notes         text
  created_at    timestamptz

meetings
  id            uuid, pk
  fa_id         uuid, fk -> fas.id
  client_id     uuid, fk -> clients.id
  date          date
  type          text     -- 'fact_finder' | 'closing'
  status        text     -- 'booked' | 'attended' | 'postponed' | 'cancelled'
  joint_call    boolean
  created_at    timestamptz

activities
  id            uuid, pk
  fa_id         uuid, fk -> fas.id
  client_id     uuid, fk -> clients.id
  date          date
  type          text     -- 'fna' | 'quote' | 'case_submitted' | 'wills_lead' | 'referral'
  created_at    timestamptz

checkouts
  id                      uuid, pk
  fa_id                   uuid, fk -> fas.id
  date                    date
  in_office               boolean
  prospects_contacted     int
  tomorrow_prospects      int
  comments                text
  created_at              timestamptz
  unique(fa_id, date)

month_periods
  id            uuid, pk
  month_label   text
  start_date    date
  close_date    date    -- Friday cutoff for that production month
  payout_date   date    -- following Monday
```

No `meetings ↔ activities` foreign key. No `pledges` table (replaced by a live pipeline query). Leave-tracking deferred to v2.

---

## Screens

### Toolbar (all screens)
Nav: Dashboard / Clients / Prospects / Not Moved Forward &middot; Commission Tracker button &middot; Checkout button (green tick if already checked out today) &middot; user chip &middot; sign out.

### Dashboard (Home) — same layout for FA and Admin
1. **Month progress bar** — line from month start to close-off date, tick marks per day, heavier ticks at weekends, "today" marker. Shows close-off + payout dates.
2. **Metrics bar** (4 cards, click to expand a detail panel underneath):
   - PCR validations vs target
   - Conversion rate (global %, expands to funnel breakdown: prospects → meetings → fact finders → sales)
   - Live pipeline (count of clients mid-funnel, expands to stage breakdown — this is what replaced the monthly pledge)
   - Cases submitted MTD vs minimum standard
   - Only one detail panel open at a time.
3. **Leaderboard** — the team, in two views switched on its title line:
   - **PCR** (default, ranked by Accepted PCR's): **Cases submitted** · **Open case PCR's** (cases opened but not yet submitted — right now, not tied to the month) · **Submitted PCR's** (submitted this month, whatever happened since) · **Accepted PCR's** (accepted this month, at the final PCR).
   - **Activity** (ranked by Prospects): **Prospects · Referrals · Meetings · Wills Leads · FNAs · Quotes**.
   Managers who don't sell (`users.on_leaderboard = false` — Ameeth) are left off it, and so off the team figures.

**Admin view's stats column** (the team, or the FA picked on the leaderboard), each case row a count and its PCR: **Open cases** and **Submitted cases** — the pipeline right now (open but not yet submitted; submitted, waiting to be accepted), not affected by the month bar — then **Cases Accepted** this month (or the picked days), **Wills Leads** and **Referrals**. (The FA's own column keeps commission in the Pot, PCR's in the Pot and expected commission.) The admin's **PCR meter** shows the PCR on the team's **submitted cases waiting to be accepted** (the Submitted cases row) against the fixed team target (10m); with an FA picked, it's their meter (Accepted PCR's against Validation).

**FA view** = personal numbers. **Admin view** = team averages, plus an FA list (add/view individual FAs, each reusing the same dashboard component scoped to them).

### Clients screen
> **Superseded** by [Client timeline](#client-timeline) below.

- "+ New Client" button
- List of clients, click a row to expand inline (accordion — opening one closes any other open row) showing timeline of meetings + activities, and notes.
- Search bar to find existing clients (also reused inside checkout's client picker).

### Prospects screen
Same list pattern, for contacts not yet converted to clients.

### Not Moved Forward
Clients/prospects with no activity in X days — visibility only for now (auto-drop-off logic, no action required in MVP).

### Admin-only: Open and Submitted
Two tabs after Home, for what's coming in and from whom: **the whole team**, like Home's figures, and all their open cases — not tied to a month.
- **Open** — cases opened but not yet submitted. **Submitted** — cases submitted and waiting to be accepted.
- **Grouped by FA**, the biggest PCR first (FAs with nothing there are left out). The FA's line: case count · PCR total. Each case: client · product · checklist progress (e.g. 4/7) · **days waiting** (since opened / submitted — highlighted past 30 days open or 14 days submitted, oldest first) · PCR.
- **Accept** is on each Submitted case of an FA on the admin's own list — **the only place a case is accepted.** It asks for the **final PCR**: pre-filled with the PCR worked out from the premiums, changed if the case was accepted at a different value. That's saved on the case and is what Accepted PCR counts. Other FAs' groups say who accepts them ("Accepted by Ameeth Maharaj"). Accepting the client's last open case moves them to the FA's Clients tab (the confirmation says so).
- Home's **Open cases** and **Submitted cases** rows open these tabs. The tab counts are cases.
- Refreshed whenever the admin comes back to the app.

### Admin-only: FA list
Each FA has a **manager** (`users.manager_id`): the admin whose list they're on. In Admin mode the tab bar is **Home · Open cases · Submitted cases**, all three the same width, then a **☰ menu** at the end with **Products**, **Financial Advisers** and **Calendar** (the menu's tab shows as active on either page). The Financial Advisers page has two views at the top: **Active** and **Left**, each with its count.

- **FAs** — the admin's active FAs, alphabetical, like a client list. Collapsed row: name · branch · Validation target · "Not signed in yet" (until they set their password) · open cases · **N submitted** · an **edit** button at the far right.
- **Clicking a row** opens that FA's open cases, read-only (one row open at a time), submitted ones first. Accepting is on the [Submitted tab](#admin-only-open-and-submitted).
- **Edit** — name, surname, Validation target, and **Mark as left** (or **Bring back to Active** from Left).
- **Search:** in Admin mode the top bar's search box finds the admin's FAs ("Search FAs…"), active or left; picking one opens Financial Advisers on the right view with their row open.
- **Left** — FAs who've left. They can't sign in or write anything and drop off the leaderboard; their clients and history are kept.
- **Add FA** — the floating **+** in the bottom-right corner (name, surname, email, phone, Validation target) — creates their login with a temporary password, shown once to the admin to hand over (no email is sent). They're on that admin's list and branch, and choose their own password on first sign-in. Runs in the `add-fa` Edge Function, since creating a login needs the secret key.

### Admin-only: Case types
(☰ → Case types; called *products* in the code and database.) **Why:** what has to be in place before a case is submitted changes, and differs by product. Admins keep that up to date here, rather than it being fixed in the app.

The products are the New Case dropdown. Each has a **product type** and a **checklist** (what has to be ticked before submitting). Every case has the same stages whatever its product (see [Cases](#cases)), so there's nothing else to set. They're stored in the database (`products`), one list shared by every admin. **Only admins change it**; FAs just use it.

- **Rows:** one per product, alphabetical (the New Case dropdown too), like a client list. Collapsed row: product · **product type** · what a case records · checklist size · an **edit** button at the far right.
- **Clicking a row** opens its **checklist**, read-only, with an **Edit** button; while editing (until **Done**): rename an item in place (Enter or clicking away saves, Esc undoes), **×** removes it (after a confirmation), and the box under the list adds one. **Always alphabetical** (on cases too).
- **Changing a product's type** while it has open cases asks first, since what those cases record and earn changes too.
- **Edit:** the product's name and type, and **Delete product**.
- **Add product** — the floating **+** in the bottom-right corner: name and type. A new product starts with the standard 7-item checklist, which the admin then edits.

**Product types** are the hard-coded part. There are three, and a product's type decides what its cases record and how commission and PCR are worked out (rates in `constants.js`):

| Type | A case records | Commission | PCR |
|---|---|---|---|
| **Risk** | Monthly premium | 10× monthly premium | Annual premium × 26.15 |
| **RA Builder** | Lump sum, monthly premium, advice fee | 4× monthly premium | Annual premium × 15 |
| **Investment** | Lump sum, monthly premium, advice fee | Advice fee % of the lump sum | Lump sum |

Today's products: Risk and Educator are **Risk**; RA Builder is **RA Builder**; everything else is **Investment**, including RA Liberty.

**Rules**
- **Delete, not archive.** A deleted product leaves the dropdown for good. Its closed cases keep everything they had (see below) and still count in every figure. A product with **open** cases can't be deleted; the app says how many.
- **Open cases follow the product; closed cases keep what they had.** Editing a product (checklist, name or type) changes its **open** cases straight away: a new checklist item shows up unticked, and a removed one stops counting (4/7 can become 4/6). When a case closes (Accepted or Not taken up), its product name and type are **frozen on the case**, with its premiums and PCRs. Nothing done to the product afterwards changes it.

### Admin-only: Calendar
**Why:** close-off dates used to be typed into the app's code, so a new month needed a developer. Admins should set them, along with the team's **weekly submission target** for each month, and Home should show week by week whether the team is hitting it.

**Where:** a third option in the ☰ menu: **Products · Financial Advisers · Calendar**.

**The Calendar page** is purely for editing. One row per month, in date order:
- **Month and year** (e.g. October 2026), and two fields, saved as they're changed:
  - **Close-off date** — the month's last day (a Friday).
  - **Weekly submission target** — the PCR the whole team should submit in each week of that month (the same for every week of the month).
- **Always one month ahead:** after the last month with a close-off date there's one more row, empty, ready to fill in (if December 2026 is the last, January 2027 shows). Filling in its close-off date adds the next empty row.
- A close-off date has to fall after the previous month's.

**Weeks:** a business month runs from the day after the previous close-off to its own close-off. Its weeks are 7-day blocks from the first day (Saturday to Friday), so a month has 4 or 5 weeks. If a close-off isn't 7-day aligned, the last week is shorter.

**"Submitted in a week"** = every case whose Submitted date falls in that week, across the whole team, whatever's happened to it since (as the leaderboard's Submitted PCR's).

**The month bar** reads months from the Calendar instead of the code: ‹ › only move between months that have a close-off date. Payout date stays the Monday after close-off.

**No close-off for today's month** (not set yet): the app keeps showing the last month it has, and admins see a strip under the top bar: "No close-off date for this month yet — set it under ☰ → Calendar."

**Home (admin, the whole team): week rings** — replace the team PCR meter.
- **Drawn like the PCR meter:** each ring is open at the bottom, with "PCR's" in the opening, **0** at the bottom left and the **weekly target** at the bottom right (beside the outermost ring), and the month's name underneath.
- **Rings grow outward through the month.** Week 1 is the inner ring; at the start of each new week another ring is added around the outside for it. So in week 3 there are three rings, the outermost being this week. A past month shows all its weeks' rings.
- Each ring fills with that week's **submitted PCR** against the month's **weekly submission target**:
  - **Met** — full, green.
  - **This week, not met yet** — filling, gold.
  - **Past and missed** — filled as far as it got, red.
- **Centre:** this week's submitted PCR against the target, e.g. "1 200 000 of 2 000 000 · Week 3". (For a past month: the month's total.)
- **Under the rings:** a small key, one line per week so far: "W2 · 2 100 000 / 2 000 000 ✓", then the month.
- Follows the month on the month bar (‹ › to look at past months). Picking days on the bar doesn't change it.
- No weekly target set for the month: the rings still show the PCR submitted each week, with "No target set".
- **Clicking an FA on the leaderboard** still shows that FA's own meter (Accepted PCR's against Validation). **The FA's own Home** is unchanged.

**Data:**
- **months** — `month` (first day, e.g. 2026-10-01, standing for October 2026; unique), `close_off_date`, `weekly_target` (PCR). Start = the previous month's close-off + 1 day; the first row is only the starting boundary, as today. Everyone reads; admins write.
- The close-off dates that used to be written into `constants.js` were loaded in (`supabase/calendar.sql`); `CLOSE_OFF_DATES` is now filled from this table on sign-in.

---

## Daily Checkout (modal, gates app access)
> **Superseded** by [Review](#review-replaces-daily-checkout) below.

Triggered whenever an FA hasn't checked out today (checked on app load). No scheduled nudge — just gated on load.

Flow:
1. In office Y/N, prospects contacted
2. Appointments: count → per-item client picker (search-or-add-inline) + joint call Y/N + fact finder/closing type
3. Quotes / FNAs / cases / wills leads / referrals: count → per-item client picker
4. Tomorrow's plan: pre-book known appointments (creates `meetings` rows with `status = 'booked'`, date = tomorrow) — this is what enables carry-forward
5. Comments

**No double entry:** tomorrow's checkout opens with yesterday's "booked" meetings already listed; FA just confirms attended/postponed/cancelled instead of re-entering from scratch.

**Client picker pattern** (used in checkout, meetings, activities): type to search existing clients; if no match, inline "+ Add [name] as new client" — never leaves the current flow.

---

## Client timeline

**Why:** a client's history used to be split across separate Meetings / FNAs / Quotes / Cases screens, plus a status log on each case. Now there's one timeline per client, in the order things happened. FAs keep it up to date; the team lead reads it.

### Timeline entries
Every entry belongs to a **client**, has a **date** (the day it happened) and a **time** (when it was logged), so several a day sort correctly. The list is newest first, grouped under day headings.

| Entry | What it records | Example line |
|---|---|---|
| Contact | **Method** (standard list: Phone, Email, WhatsApp/SMS, LinkedIn, In person) + **outcome** — one box: pick a standard outcome from its arrow (Spoke to client, No answer, Left message, Sent) or type your own | Phone · No answer<br>Email · Asked for 3 months' bank statements |
| Note | Free text | Still waiting on ID copy |
| Meeting | Fact Finder / Relational / Closing, joint call or not, **referrals** (a number) and **wills lead** (yes/no) | Fact Finder · Joint call · 2 referrals · Wills lead |
| FNA | — | FNA |
| Quote | Risk, Investment or both | Quote · Risk & Investment |
| Case | One of the case's events: **opened, submitted, accepted, not taken up** — linked to that case | RA Builder · Submitted |

- "Client added" is shown at the bottom of every timeline, from the client's creation date. It isn't a stored entry.
- **Notes belong to the client, not a case.** With two open cases, one note covers both ("RA at underwriting, still waiting on ID for the Life cover"). The only link between the timeline and a case is the automatic Case entry, so it can't be wrong.
- Entries can be **deleted** (Delete mode, one at a time, as today), not edited.

### The client row and open card
- **Adding someone:** a floating **+** in the bottom-right corner of the **Prospects** and **Clients** tabs (no button in the top bar). First name and surname; they're added to the tab whose + was pressed.
- **Collapsed row:** name · latest timeline entry · **a chip per group of cases** the client has — **"2 open"** (not yet submitted), **"1 submitted"** (waiting to be accepted), **"3 closed"** (accepted or not taken up); only the groups they have · **+** at the end.
- **Clicking the row** opens the **client view**; **clicking a chip** opens the **case view** on those cases.
- **Client view**, top to bottom:
  - **A case card per open case**, stacked. Like a client card, it's **collapsed** by default: product · amounts · PCR · **✎** (change amounts), and at the right end what can happen next — **Mark submitted** · **Not taken up** (Opened), or **Awaiting acceptance** · **Not taken up** (Submitted). **Clicking the card** opens it: the breadcrumb **Opened ── Submitted ── Accepted**, each step dated once reached, the **checklist** to tick, and **Delete case**.
  - The timeline.
- **Case view** (from a chip on the row, or a case line's product chip on the timeline): just that group's cases — **Open**, **Submitted** or **Closed** — no bar of its own. The row's chip for the group showing is highlighted; another chip switches group; clicking the highlighted chip again, or the row, goes back to the client view. The cases as cards. Opened up, each card also lists its own timeline lines. Closed cards are read-only: their line ends in a badge (Accepted / Not taken up), and an accepted one shows its **final PCR**; opened up, the breadcrumb ends in Accepted or Not taken up with its date, then its premiums and PCRs. Opening a case line's chip lands on that case's group, opened up, scrolled to it and highlighted. The row's **+** goes back to the client view too; a card closed and reopened starts on the client view.
- **+** opens a menu, everything alphabetical; a ▸ section's list opens to the side on hover (tap on a touch screen), to the left when there's no room on the right:
  - **Activity ▸** FNA · Quote · Wills lead submitted.
  - **Contact ▸** Email · Phone call · Text → just the outcome.
  - **Meeting ▸** Closing · Fact Finder · Relational → joint call, referrals, wills lead.
  - **Note**.
  - **Open a case ▸** every case type → its amounts.
  Picking an option opens the card with that entry ready to fill in, the choice already made (beside the date: "Phone call", "Fact Finder", "RA Builder"), dated today. Older contacts logged as LinkedIn or In person keep their label.
- **Case fields depend on the type:** Risk and Educator take the monthly premium; everything else takes lump sum, monthly premium and upfront advice fee.
- **Timeline:** newest first, grouped by day, ending with "Client added". Entries can be deleted one at a time (×), except **case lines**: they're added automatically by whatever happens to the case — opened, amounts changed (before → after), submitted, accepted, not taken up — and each starts with the case's **product chip** (to the case view). A case goes, with its lines, by **Delete case** on its card.

### Cases
- **Stages — the same for every case and product:** **Opened** → **Submitted** → **Accepted** or **Not taken up**.
  A case is **open** until Accepted or Not taken up. (Reopening is left out for now.) FAs keep a case up to date with notes and contacts on the client's timeline.
- **Checklist:** the product's, visible from the moment the case is opened. Every product starts with the standard 7:
  ID · Proof of residence · Proof of bank account · Signed FAIS intro letter · Signed application form · Signed quote · Signed risk profile analyser.
  Ticks save instantly; the case shows progress (4/7).
- **Changing amounts:** while a case is open, the **✎** on its case card changes its amounts — the fields its product type records — e.g. R1 000 pm becomes R800. It adds a Case entry to the timeline with what changed, before → after (`Risk · Amended · R1 000 pm → R800 pm · PCR 313 800 → 251 040`), which counts as the client's update for the day like any entry. The case card, its Opened line, PCR and commission show the new amounts. Saving without changing anything adds nothing. Once Accepted or Not taken up, amounts are fixed (the database refuses).
- **Moving a case on:**
  - **Submitted** — the FA marks it. Allowed with checklist items unticked, but it first warns and lists them: "3 items aren't ticked: … Submit anyway?" (Cancel / Submit anyway).
  - **Accepted** — only once Submitted, and **only by the FA's manager**, from the [Submitted tab](#admin-only-open-and-submitted), with the case's **final PCR** (offered as the PCR worked out from the premiums; the manager can change it). The FA sees "Awaiting acceptance".
  - **Not taken up** — **only the FA**, any time while open; the client can back out before or after submission.
- Tab rules: an open case puts the client in **Open Cases** (the tab once called Business; `business` in the data). Accepting the last open case moves them to **Clients** (the database does this as part of accepting). Closing the last one any other way (not taken up, deleted) asks the FA where they go.
- **A closed case keeps** just its product, its premiums and its PCRs (the one worked out from the premiums, and the final PCR) — no checklist.
- **Numbers:** "Cases submitted" (funnel, leaderboard) counts the **Submitted** date. PCR counts on **Accepted**, at the case's **final PCR** (the leaderboard's **Accepted PCR's**, an FA's PCR meter, Cases Accepted; cases accepted before there was a final PCR count the PCR worked out from their premiums); the leaderboard's **Submitted PCR's** counts PCR on the **Submitted** date, whatever happened to the case since. Commission and PCR's in the Pot count every **open** case of a client in Open Cases.

### Daily update (client level)
- Every client with an open case needs **at least one timeline entry on the review day**. Any entry counts — a contact logged on the card at 2pm means that client is already done.
- This replaces the per-case daily status.

## Review (replaces Daily Checkout)

The Review is the day's work, **client first** — the same way of working as the client card, so there's one way to capture everything.

### When it appears
- **Review day** = the last weekday before today (Monday, Saturday and Sunday all review Friday). Only ever that one day: a missed day **can't be reviewed later**. No early reviews (today can't be reviewed).
- From **00:00**, the next time the app is used (opened, refreshed, returned to, or in use as midnight passes), the Review opens and **can't be closed until done**. Signing out doesn't matter.
- Not in Admin or Test mode, and never for a day before the FA was added.
- The toolbar button opens the Review for the review day (closable once it's done).

### The screen
"Review — Friday 25 Sep", as three steps (Next / Back, or click a step's name; everything saves as you go, so they can be visited in any order):

1. **Prospecting** — counts by channel (Phoned, Emailed, WhatsApp / SMS, LinkedIn, Other), with a total. Only people who **aren't** clients in the app; contact with a client is a Contact entry.
2. **Open case updates** (required, so it comes first) — the **client cards** of everyone with an open case, in two groups: **No activity** and **Had activity**. A client in No activity needs something logged, using the card as usual — its **+** (a note, with **Same as last** on its arrow; a call; a meeting…) — and moves to Had activity as soon as it is. Anything logged on the review day **or since** counts (a client already worked today doesn't need another update). Cases move on through their case cards (checklist, Mark submitted, Not taken up). **Next is blocked** until every one has an update (it names who's missing).
   - **Follow-up nudge:** above a card whose last 3 updates were the same: "Same update for 3 days — follow up?". A nudge, not a block.
3. **Activities** — the **client cards** of everyone **else** worked with that day (no open case). **+ Another client** finds anyone else, or adds someone new (lands in Prospects), and adds their card. No client appears in both steps.

- The Review uses the app's own client cards — nothing new to learn. A card inside the Review records everything against the **review day** (its add form shows that date), and stays in step with the same card in its tab.
- Every entry saves the moment it's added or deleted, straight onto the client's timeline, dated the review day. Entries can be deleted (×), as on the timeline.
- **Done** (on the last step) checks every open-case client has an update, then marks the day reviewed.
- **No activity:** a day reviewed with **nothing at all** logged is recorded as **No activity**.
- **The leaderboard's ✓ / ✗** (beside each name — on FAs' leaderboard and the admin's alike) is about **activity, not the Review**: ✓ if the FA logged anything for the last weekday — a contact, note, meeting, FNA, quote, case change, prospects contacted — ✗ if nothing. Doing the Review on its own doesn't earn a ✓.
- Internally the day is still recorded as a `checkout` activity, so the leaderboard needs no migration for the rename.

## Data model changes (for the timeline and Review)
Built as if the app had always worked this way — the old case status logs and client statuses are dropped, not converted.

- **activities** is the timeline. Types: `contact`, `note`, `meeting`, `fna`, `quote`, `wills_lead`, `referral`, `case` (with `case_id` and the event), plus the per-FA day records `prospect_contact` (counts) and `review` (renamed from `checkout`; carries "no activity"). Ordered by `date`, then `created_at`.
- **cases** keeps the money (type, lump sum, monthly, upfront advice fee) and gains `stage` (opened / submitted / accepted / not-taken-up), `submitted_at`, `accepted_at` and a `checklist` (which of the 7 items are ticked). `case_statuses` and `add_case_status` go.

## Data model changes (for Products)
- **products** — `name` (unique), `type` (`risk` / `ra-builder` / `investment`). Listed alphabetically. Readable by everyone signed in; only admins write.
- **product_checklist_items** — the checklist: `product_id`, `key`, `label`. Shown alphabetically. The standard 7 keep their keys (`id`, `bankProof`, …), so ticks saved on cases still match.
- **cases** gains `product_id` (null once the product is deleted) and `product_type` (what the rates and fields go by). `case_type` stays as the product's name. While a case is open these follow the product. On closing they're frozen. **`final_pcr`** is set on accepting (`supabase/final-pcr.sql`).
- Per-product stages were tried and dropped (`supabase/remove-stages.sql`).

## Roles and Test mode
- **FA** — their own book; no toggle.
- **Admin** (Ameeth) — toggle **My book · Admin**. Manages the FAs on their list: accepts their cases, edits them, adds new ones.
- **Super admin** (Matthew, `users.is_super_admin`) — toggle **My book · Admin · Test**.

**Viewing as** (super admin, Admin mode only): a picker beside the toggle — "Viewing: my own" or "Viewing as Ameeth Maharaj". It shows Admin mode as that admin sees it: their Financial Advisers (Active and Left), their search, which Submitted cases they can accept. **Look only:** Accept, edit and + are shown but greyed out. Products are shared, so they stay editable. Leaving Admin mode goes back to your own view.

Test works exactly like My book, but on the shared **Test Book** — a test user in the 'Test group' branch, owned by a login nobody signs in with. It never appears on the leaderboard or in team figures, the Review is never forced there, and a strip under the top bar says you're in it. Only the super admin can write to the Test Book, enforced in the database — `can_act_as` in schema.sql.

## Deferred to v2+
- Needs-follow-up list (clients with stalled activity, surfaced to the FA as a to-do)
- Leave tracking (excludes FA from compliance stats while on leave)
- Document uploads on client records (compliance/POPIA implications — needs separate review)
- Streaks (dropped — redundant since access is already gated behind checkout)
- Calendar / client-booking-link replacement (Outlook's "book with me" is unfriendly for clients, but building a real booking system is its own project)

---

## MVP build scope
Runs entirely in-browser for now (no backend wiring yet — this comes after the HTML/CSS/JS screens are built out in Claude Code). Once screens are validated, wire up Supabase (auth, tables above, RLS: FA sees own data, admin sees all).
