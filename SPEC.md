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
3. **Leaderboard** — team ranked by cases submitted MTD (replaces the daily production email).

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

### Admin-only: FA management
- "+ Add FA" (name, surname, email, phone, PCR target)
- Active FA list (alphabetical) + toggle for FAs who've left (deactivated, not deleted)
- Click an FA → their dashboard, admin-scoped

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
- **Collapsed row:** name · latest timeline entry · a **chip per open case** (e.g. `Risk · Opened · 2/7`) · **+** at the end. No count chips.
- **Clicking the row** opens the timeline. **Clicking a case chip** opens the client with that case's checklist and next steps at the top (again to hide it).
- **+** opens a menu — Contact, Note, Meeting, FNA, Quote, Case — and opens the card with that entry ready to fill in: **the event on the left, its own fields on the right**, dated today.
- **Case fields depend on the type:** Risk and Educator take the monthly premium; everything else takes lump sum, monthly premium and upfront advice fee.
- **Timeline:** newest first, grouped by day, ending with "Client added". Delete mode removes entries one at a time; a case (with its entries) is deleted from its "Opened" entry.

### Cases
- **Stages:** Opened → Submitted → Accepted or Not taken up. A case is **open** while Opened or Submitted. (Reopening is left out for now.)
- **Checklist**, the same for every product, visible from the moment the case is opened:
  ID · Proof of residence · Proof of bank account · Signed FAIS intro letter · Signed application form · Signed quote · Signed risk profile analyser.
  Ticks save instantly; the case shows progress (4/7).
- **Actions** on an open case:
  - **Submitted** — the FA marks it. Allowed with items unticked, but it first warns and lists them: "3 items aren't ticked: … Submit anyway?" (Cancel / Submit anyway).
  - **Accepted** — only once Submitted.
  - **Not taken up** — any time while open; the client can back out before submission.
- Every stage change adds a Case entry to the timeline.
- Tab rules: an open case puts the client in Business. Accepting the last open case moves them to **Clients** — the confirmation offers only *Cancel* or *Accept & move to Clients*. Closing the last one any other way (not taken up, deleted) asks where they go.
- **Numbers:** "Cases submitted" (funnel, leaderboard) counts the **Submitted** date. PCR counts on **Accepted**. Commission and PCR's in the Pot count every **open** case of a Business client.

### Daily update (client level)
- Every client with an open case needs **at least one timeline entry on the review day**. Any entry counts — a contact logged on the card at 2pm means that client is already done.
- This replaces the per-case daily status.

## Review (replaces Daily Checkout)

The Review is the day's work, **client first** — the same way of working as the client card, so there's one way to capture everything.

### When it appears
- **Review day** = the last weekday before today (Monday, Saturday and Sunday all review Friday). Only ever that one day: a missed day **can't be reviewed later** — it stays ✗ for the team lead. No early reviews (today can't be reviewed).
- From **00:00**, the next time the app is used (opened, refreshed, returned to, or in use as midnight passes), the Review opens and **can't be closed until done**. Signing out doesn't matter.
- Not in Admin or Test mode, and never for a day before the FA was added.
- The toolbar button opens the Review for the review day (closable once it's done).

### The screen
"Review — Friday 25 Sep", as three steps (Next / Back, or click a step's name; everything saves as you go, so they can be visited in any order):

1. **Prospecting** — counts by channel (Phoned, Emailed, WhatsApp / SMS, LinkedIn, Other), with a total. Only people who **aren't** clients in the app; contact with a client is a Contact entry.
2. **Open case updates** (required, so it comes first) — the **client cards** of everyone with an open case, in two groups: **No activity** and **Had activity**. A client in No activity needs something logged, using the card as usual — its **+** (a note, with **Same as last** on its arrow; a call; a meeting…) — and moves to Had activity as soon as it is. Anything logged on the review day **or since** counts (a client already worked today doesn't need another update). Cases move on through their chips (checklist, Mark submitted / accepted / Not taken up). **Next is blocked** until every one has an update (it names who's missing).
   - **Follow-up nudge:** above a card whose last 3 updates were the same: "Same update for 3 days — follow up?". A nudge, not a block.
3. **Activities** — the **client cards** of everyone **else** worked with that day (no open case). **+ Another client** finds anyone else, or adds someone new (lands in Prospects), and adds their card. No client appears in both steps.

- The Review uses the app's own client cards — nothing new to learn. A card inside the Review records everything against the **review day** (its add form shows that date), and stays in step with the same card in its tab.
- Every entry saves the moment it's added or deleted, straight onto the client's timeline, dated the review day. Entries can be deleted (×), as on the timeline.
- **Done** (on the last step) checks every open-case client has an update, then marks the day reviewed (✓ on the leaderboard).
- **No activity:** a day reviewed with **nothing at all** logged is recorded as **No activity**, and the leaderboard shows that instead of ✓. Every entry counts, including a repeated update.
- Internally the day is still recorded as a `checkout` activity, so the leaderboard needs no migration for the rename.

## Data model changes (for the timeline and Review)
Built as if the app had always worked this way — the old case status logs and client statuses are dropped, not converted.

- **activities** is the timeline. Types: `contact`, `note`, `meeting`, `fna`, `quote`, `wills_lead`, `referral`, `case` (with `case_id` and the event), plus the per-FA day records `prospect_contact` (counts) and `review` (renamed from `checkout`; carries "no activity"). Ordered by `date`, then `created_at`.
- **cases** keeps the money (type, lump sum, monthly, upfront advice fee) and gains `stage` (opened / submitted / accepted / not-taken-up), `submitted_at`, `accepted_at` and a `checklist` (which of the 7 items are ticked). `case_statuses` and `add_case_status` go.

## Roles and Test mode
- **FA** — their own book; no toggle.
- **Admin** (Ameeth) — toggle **My book · Admin**.
- **Super admin** (Matthew, `users.is_super_admin`) — toggle **My book · Admin · Test**.

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
