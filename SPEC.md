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
- **Timeline:** newest first, grouped by day, ending with "Client added". *Everything / Key moments* (Key moments hides contacts and notes). Delete mode removes entries one at a time; a case (with its entries) is deleted from its "Opened" entry.

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
- Tab rules are unchanged: an open case puts the client in Business; closing the last one asks where they go.
- **Numbers:** "Cases submitted" (funnel, leaderboard) counts the **Submitted** date. PCR counts on **Accepted**. Commission and PCR's in the Pot count every **open** case of a Business client.

### Daily update (client level)
- Every client with an open case needs **at least one timeline entry on the review day**. Any entry counts — a contact logged on the card at 2pm means that client is already done.
- This replaces the per-case daily status.

## Review (replaces Daily Checkout)

The Review is the day's timeline entries, across all clients, laid out **activity first, client last** — "what did I do yesterday, and for whom?" — the opposite of the card, where you start from the client.

### When it appears
- **Review day** = the last weekday before today (Monday, Saturday and Sunday all review Friday). Only ever one day; missed days show ✗ to the team lead.
- From **00:00**, the next time the app is used (opened, refreshed, returned to, or in use as midnight passes), the Review for the review day opens and **can't be closed until done**. Signing out doesn't matter.
- Not in Admin mode, and never for a day before the FA was added.
- **No early Reviews** — today can't be reviewed.
- It can also be opened from the toolbar for the review day, and closed.

### The screen
One screen, "Review — Friday 25 Sep", in funnel order:

1. **Prospects contacted** — counts by channel, with a total.
2. **Meetings, FNAs, Quotes** — each line: the activity's fields (a meeting's include referrals and wills lead), then the client.
3. **Contacts & notes** — each line: method · outcome, or a note, then the client. Any number per client.
4. **Cases** — opened, submitted, accepted and not taken up that day, plus opening a new case.
5. **Client updates** (required) — every client with an open case, showing their last update ("Yesterday: Waiting on PPS") with **Same as last** — FAs write their own updates, and repeating one is legitimate. Clients who already have an entry that day show as done.
   - **Follow-up nudge:** when a client has had the same update 3 days running, the Review suggests "Same update for 3 days — follow up?". A nudge, not a block.

- Lines already logged that day (on a card, or earlier) show as normal lines and can be deleted.
- **Client box** on every line: search any client in any tab, or "+ Add … as new client" (lands in Prospects; opening a case moves them to Business).
- **Saving:** each line saves the moment it's added or deleted, straight onto that client's timeline, dated the review day. After a line is saved, a fresh empty line of the same kind appears for the next one.
- **Done** checks the required client updates, then marks the day reviewed (✓ on the leaderboard).
- **No activity:** if the day is marked reviewed with **nothing at all** logged, it's recorded as **No activity**, and the leaderboard shows that instead of ✓. Every entry counts as activity, including a repeated client update — it shows the FA knows where things stand.

## Data model changes (for the timeline and Review)
Built as if the app had always worked this way — the old case status logs and client statuses are dropped, not converted.

- **activities** is the timeline. Types: `contact`, `note`, `meeting`, `fna`, `quote`, `wills_lead`, `referral`, `case` (with `case_id` and the event), plus the per-FA day records `prospect_contact` (counts) and `review` (renamed from `checkout`; carries "no activity"). Ordered by `date`, then `created_at`.
- **cases** keeps the money (type, lump sum, monthly, upfront advice fee) and gains `stage` (opened / submitted / accepted / not-taken-up), `submitted_at`, `accepted_at` and a `checklist` (which of the 7 items are ticked). `case_statuses` and `add_case_status` go.

## Deferred to v2+
- Needs-follow-up list (clients with stalled activity, surfaced to the FA as a to-do)
- Leave tracking (excludes FA from compliance stats while on leave)
- Document uploads on client records (compliance/POPIA implications — needs separate review)
- Streaks (dropped — redundant since access is already gated behind checkout)
- Calendar / client-booking-link replacement (Outlook's "book with me" is unfriendly for clients, but building a real booking system is its own project)

---

## MVP build scope
Runs entirely in-browser for now (no backend wiring yet — this comes after the HTML/CSS/JS screens are built out in Claude Code). Once screens are validated, wire up Supabase (auth, tables above, RLS: FA sees own data, admin sees all).
