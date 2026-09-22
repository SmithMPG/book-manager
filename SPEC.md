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

## Deferred to v2+
- Needs-follow-up list (clients with stalled activity, surfaced to the FA as a to-do)
- Leave tracking (excludes FA from compliance stats while on leave)
- Document uploads on client records (compliance/POPIA implications — needs separate review)
- Streaks (dropped — redundant since access is already gated behind checkout)
- Calendar / client-booking-link replacement (Outlook's "book with me" is unfriendly for clients, but building a real booking system is its own project)

---

## MVP build scope
Runs entirely in-browser for now (no backend wiring yet — this comes after the HTML/CSS/JS screens are built out in Claude Code). Once screens are validated, wire up Supabase (auth, tables above, RLS: FA sees own data, admin sees all).
