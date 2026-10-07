// Review: the daily look back at the last weekday (see SPEC.md, "Review"),
// as three steps, built from the client cards everyone already uses:
//
//   1. Prospecting    how many new people (not yet in the app) were
//                     contacted, by channel
//   2. Open case updates
//                     the cards of every client with an open case — the
//                     required part, so it comes first — in two groups:
//                     No activity (needs an update: anything from the
//                     card's "+" — a note with "Same as last", a call, a
//                     meeting…) and Had activity (anything logged on the
//                     review day or since). Next waits until No activity
//                     is empty. Cases move on through their case cards as
//                     usual; a nudge shows after 3 identical updates.
//   3. Activities     the cards of everyone else worked with that day,
//                     plus "+ Another client" for anyone else, or someone
//                     new
//
// The cards sit inside data-entry-date, so anything added or changed on
// them is recorded against the review day (card-items.js entryDateFor),
// and they stay in step with the same cards in their tabs (updateClient
// re-renders every copy). Done checks every open-case client is updated,
// then marks the day reviewed — as "no activity" if nothing at all was
// logged. A required Review (data.js enforceReview) can't be closed
// until it's done.

function _injectReviewCSS() {
  if (document.getElementById('review-styles')) return;
  const s = document.createElement('style');
  s.id = 'review-styles';
  s.textContent = `
    .rv-overlay {
      position: fixed;
      inset: 0;
      z-index: 300;
      background: rgba(15, 23, 41, 0.55);
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding: 32px 16px;
      overflow-y: auto;
    }
    .rv-overlay.open { display: flex; }
    .rv-modal {
      width: 1100px;
      max-width: 100%;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
      color: var(--ink);
    }
    .rv-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 24px 6px;
    }
    .rv-title { font-size: 18px; font-weight: 700; }
    .rv-sub { font-size: 12px; color: var(--ink-dim); margin-top: 3px; }
    .rv-close { background: none; border: none; font-size: 24px; line-height: 1; color: var(--ink-dim); cursor: pointer; }
    .rv-close:hover { color: var(--ink); }
    .rv-overlay.required .rv-close { display: none; }

    .rv-steps { display: flex; gap: 6px; padding: 6px 24px 0; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
    .rv-step {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      padding: 6px 10px 8px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      color: var(--ink-dim);
      cursor: pointer;
    }
    .rv-step:hover { color: var(--ink); }
    .rv-step.active { color: var(--ink); border-bottom-color: var(--gold); }
    .rv-step-n { color: var(--ink-dim); font-weight: 400; margin-right: 4px; }
    .rv-step-badge {
      display: inline-block;
      min-width: 18px;
      margin-left: 6px;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--red);
      color: #ffffff;
      font-size: 11px;
      line-height: 18px;
      text-align: center;
    }

    /* The cards are the app's own client cards (client-card.js), on the
       same light background they sit on in their tabs. */
    .rv-body { padding: 16px 24px; background: #e8e8e6; }
    .rv-subhead { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-dim); padding: 4px 0 8px; }
    .rv-cards + .rv-subhead { padding-top: 14px; }
    .rv-nudge { font-size: 12px; font-weight: 600; color: #8a6d0a; margin: 0 0 4px 4px; }
    .rv-empty { font-size: 13px; color: var(--ink-dim); padding: 6px 0; }

    .rv-sec { padding: 8px 0 12px; }
    .rv-prospects { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
    .rv-prospects .item-number input { background: #ffffff; }
    .rv-total { font-size: 13px; color: var(--ink-dim); margin-left: auto; }
    .rv-total b { color: var(--ink); }

    .rv-another { padding: 8px 0 4px; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--ink-dim); }
    .rv-picker { position: relative; width: 300px; }
    .rv-or { color: var(--ink-dim); }
    .rv-new-btn {
      background: #ffffff;
      border: 1px dashed rgba(0, 0, 0, 0.25);
      border-radius: 8px;
      height: 38px;
      padding: 0 14px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      color: var(--ink);
      cursor: pointer;
    }
    .rv-new-btn:hover { border-style: solid; border-color: var(--gold); }
    .rv-new-client { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .rv-new-client input {
      box-sizing: border-box;
      width: 170px;
      height: 38px;
      padding: 0 12px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
    }
    .rv-new-client input:focus { outline: none; border-color: var(--gold); }
    .rv-new-client input.field-error { border-color: var(--red); }
    .rv-new-error { font-size: 12px; color: var(--red); }
    .rv-picker input {
      box-sizing: border-box;
      width: 100%;
      height: 38px;
      padding: 0 12px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
    }
    .rv-picker input:focus { outline: none; border-color: var(--gold); }
    .rv-picker-list {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      z-index: 20;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
      padding: 4px;
      max-height: 240px;
      overflow-y: auto;
    }
    .rv-picker-list.open { display: block; }
    .rv-pick {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      background: none;
      border: none;
      border-radius: 6px;
      padding: 7px 8px;
      text-align: left;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
      cursor: pointer;
    }
    .rv-pick:hover { background: #f2f2f0; }
    .rv-pick-tab { color: var(--ink-dim); font-size: 12px; }
    .rv-pick.new { color: #8a6d0a; font-weight: 600; }

    .rv-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      padding: 14px 24px 20px;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
    }
    .rv-error { flex: 1; font-size: 13px; color: var(--red); }
    .rv-back, .rv-next, .rv-done {
      border-radius: 6px;
      padding: 9px 20px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
    }
    .rv-back { background: none; border: 1px solid rgba(0, 0, 0, 0.15); color: var(--ink); }
    .rv-next { background: var(--navy); border: 1px solid var(--navy); color: var(--text); }
    .rv-done { background: var(--gold); border: 1px solid var(--gold); color: var(--navy); font-weight: 700; }
    .rv-done:disabled { opacity: 0.6; cursor: default; }
    .rv-back[hidden], .rv-next[hidden], .rv-done[hidden] { display: none; }

    /* The toolbar button, once the review day is done. */
    .cc-trigger.checked-out { color: var(--green); border-color: var(--green); }
  `;
  document.head.appendChild(s);
}
_injectReviewCSS();

// The day in words: "Friday 25 Sep".
function _reviewDayLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

// Same update for the last 3 days running → suggest a follow-up.
function _needsNudge(data) {
  const updates = (data.timeline || []).filter(e => e.type === 'contact' || e.type === 'note');
  const lastByDay = [];
  updates.forEach(e => { if (!lastByDay.some(u => u.date === e.date)) lastByDay.push(e); });
  const three = lastByDay.slice(0, 3);
  return three.length === 3 && three.every(e => e.text.trim().toLowerCase() === three[0].text.trim().toLowerCase());
}

const REVIEW_STEPS = [
  { key: 'prospecting', label: 'Prospecting' },
  { key: 'cases', label: 'Open case updates' },
  { key: 'activities', label: 'Activities' },
];

class Review {
  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'rv-overlay';
    this.overlay.innerHTML = `
      <div class="rv-modal" role="dialog" aria-modal="true">
        <div class="rv-header">
          <div>
            <div class="rv-title"></div>
            <div class="rv-sub"></div>
          </div>
          <button type="button" class="rv-close" data-rv="close" aria-label="Close">&times;</button>
        </div>
        <div class="rv-steps"></div>
        <div class="rv-body"></div>
        <div class="rv-footer">
          <span class="rv-error"></span>
          <button type="button" class="rv-back" data-rv="back">Back</button>
          <button type="button" class="rv-next" data-rv="next">Next</button>
          <button type="button" class="rv-done" data-rv="done">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    this.stepsEl = this.overlay.querySelector('.rv-steps');
    this.body = this.overlay.querySelector('.rv-body');
    this.errorEl = this.overlay.querySelector('.rv-error');
    this.doneBtn = this.overlay.querySelector('.rv-done');

    this.overlay.addEventListener('click', e => this._onClick(e));
    this.overlay.addEventListener('input', e => {
      if (e.target.matches('.rv-picker-input')) this._fillPicker(e.target);
    });
    this.overlay.addEventListener('change', e => {
      if (e.target.matches('[data-channel]')) this._saveProspects();
    });
    this.overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.closest('.rv-new-client')) {
        e.preventDefault();
        this._addNewClient(e.target.closest('.rv-new-client').querySelector('[data-rv="add-new-client"]'));
        return;
      }
      if (e.key !== 'Enter' || !e.target.matches('.rv-picker-input')) return;
      e.preventDefault();
      const first = e.target.parentElement.querySelector('.rv-pick[data-pick-id], .rv-pick[data-pick-new]');
      if (first) this._pick(first);
    });
    // Picking on mousedown, before the box loses focus and its list closes.
    this.overlay.addEventListener('mousedown', e => {
      const pick = e.target.closest('.rv-pick[data-pick-id], .rv-pick[data-pick-new]');
      if (!pick) return;
      e.preventDefault();
      this._pick(pick);
    });
    this.overlay.addEventListener('focusout', e => {
      const picker = e.target.closest?.('.rv-picker');
      if (picker && !picker.contains(e.relatedTarget)) picker.querySelector('.rv-picker-list').classList.remove('open');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isOpen() && !document.querySelector('.cd-overlay')) this.close();
    });
    // A card changed (an entry added, a case moved on…). The card itself
    // re-renders in place; the Review only redraws when that moves a
    // client between its lists (e.g. from "Needs an update" to "Updated").
    document.addEventListener('clients:changed', () => {
      if (!this.isOpen() || this._listing() === this.lastListing) return;
      this.render();
      if (!this._needingUpdate().length) this.errorEl.textContent = '';
    });
  }

  isOpen() {
    return this.overlay.classList.contains('open');
  }

  // day: ISO date under review. required: can't close until Done.
  async open(day, { required = false } = {}) {
    this.day = day;
    this.required = required;
    this.step = 0;
    this.extraClients = []; // added via "+ Another client"
    this.newClientOpen = false; // the "+ New client" form is showing
    this.overlay.classList.toggle('required', required);
    this.overlay.querySelector('.rv-title').textContent = `Review — ${_reviewDayLabel(day)}`;
    this.overlay.querySelector('.rv-sub').textContent = required
      ? 'Review your last working day to carry on using the app. Everything saves as you go.'
      : 'Everything saves as you go.';
    this.errorEl.textContent = '';
    this.prospects = {};
    this.body.innerHTML = '<div class="rv-empty">Loading…</div>';
    this.overlay.classList.add('open');
    try {
      this.prospects = await dbLoadProspectCounts(day);
    } catch (err) {
      console.error(err);
    }
    this.render();
  }

  close() {
    if (this.required) return;
    this.overlay.classList.remove('open');
    this.body.innerHTML = ''; // drop the card copies
  }

  // ---------- who's listed ----------

  _hasEntryOnDay(data) {
    return (data.timeline || []).some(e => e.date === this.day);
  }

  _openCaseClients() {
    return getClientRecords()
      .filter(r => (getClientData(r.id).cases || []).some(isOpenCase))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Anything logged on the review day or since counts as an update — a
  // client already worked today doesn't need another for the review day.
  _hadActivity(data) {
    return (data.timeline || []).some(e => e.date >= this.day);
  }

  _needingUpdate() {
    return this._openCaseClients().filter(r => !this._hadActivity(getClientData(r.id)));
  }

  // Everyone else worked with that day (no open case), then anyone added
  // by hand.
  _activityClients() {
    const worked = getClientRecords()
      .filter(r => {
        const d = getClientData(r.id);
        return !(d.cases || []).some(isOpenCase) && this._hasEntryOnDay(d);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(r => r.id);
    const ids = [...worked, ...this.extraClients.filter(id => !worked.includes(id))];
    return ids.map(id => getClientRecords().find(r => r.id === id)).filter(Boolean);
  }

  // What the current step lists, in order — redraw only when this changes.
  _listing() {
    const key = REVIEW_STEPS[this.step]?.key;
    if (key === 'cases') {
      const needing = this._needingUpdate().map(r => r.id);
      return `cases|${needing.join()}|${this._openCaseClients().map(r => r.id).join()}`;
    }
    if (key === 'activities') return `activities|${this._activityClients().map(r => r.id).join()}`;
    return 'prospecting';
  }

  // ---------- rendering ----------

  render() {
    const top = this.overlay.scrollTop;
    const waiting = this._needingUpdate().length;
    this.stepsEl.innerHTML = REVIEW_STEPS.map((s, i) => `
      <button type="button" class="rv-step${i === this.step ? ' active' : ''}" data-rv="goto" data-step="${i}">
        <span class="rv-step-n">${i + 1}.</span>${s.label}${s.key === 'cases' && waiting ? `<span class="rv-step-badge">${waiting}</span>` : ''}
      </button>
    `).join('');
    const key = REVIEW_STEPS[this.step].key;
    this.body.innerHTML = key === 'prospecting' ? this._prospectsHTML()
      : key === 'cases' ? this._casesHTML()
      : this._activitiesHTML();
    this.lastListing = this._listing();
    const last = this.step === REVIEW_STEPS.length - 1;
    this.overlay.querySelector('.rv-back').hidden = this.step === 0;
    this.overlay.querySelector('.rv-next').hidden = last;
    this.doneBtn.hidden = !last;
    this.overlay.scrollTop = top;
  }

  _goTo(step) {
    const casesStep = REVIEW_STEPS.findIndex(s => s.key === 'cases');
    if (step > casesStep && this.step <= casesStep && this._needingUpdate().length) {
      if (this.step !== casesStep) { this.step = casesStep; this.render(); }
      this._showMissing();
      return;
    }
    this.step = step;
    this.errorEl.textContent = '';
    this.render();
    this.overlay.scrollTop = 0;
  }

  _cardsHTML(records, before) {
    return `<div class="rv-cards" data-entry-date="${this.day}">${records.map(r => {
      const data = getClientData(r.id);
      return `${before ? before(data) : ''}${clientCardHTML(data)}`;
    }).join('')}</div>`;
  }

  _prospectsHTML() {
    const total = PROSPECT_CHANNELS.reduce((t, ch) => t + (Number(this.prospects[ch.key]) || 0), 0);
    return `
      <div class="rv-sec">
        <div class="rv-prospects">
          ${PROSPECT_CHANNELS.map(ch => `
            <label class="item-number">${ch.label}
              <input type="number" min="0" step="1" data-channel="${ch.key}" value="${this.prospects[ch.key] || ''}" placeholder="0">
            </label>
          `).join('')}
          <span class="rv-total">Total <b>${total}</b></span>
        </div>
      </div>
    `;
  }

  _casesHTML() {
    const clients = this._openCaseClients();
    if (!clients.length) return '<div class="rv-empty">No open cases.</div>';
    // Two groups: No activity (still needs an update — Next waits on it
    // being empty) and Had activity.
    const needing = this._needingUpdate();
    const needingIds = new Set(needing.map(r => r.id));
    const updated = clients.filter(r => !needingIds.has(r.id));
    const nudge = data => (_needsNudge(data) ? '<div class="rv-nudge">Same update for 3 days — follow up?</div>' : '');
    return `
      ${needing.length ? `<div class="rv-subhead">No activity (${needing.length})</div>${this._cardsHTML(needing, nudge)}` : ''}
      ${updated.length ? `<div class="rv-subhead">Had activity (${updated.length})</div>${this._cardsHTML(updated)}` : ''}
    `;
  }

  _activitiesHTML() {
    const clients = this._activityClients();
    return `
      ${this._cardsHTML(clients)}
      <div class="rv-another">
        + Another client
        <div class="rv-picker">
          <input type="text" class="rv-picker-input" placeholder="Search your clients&hellip;" autocomplete="off">
          <div class="rv-picker-list"></div>
        </div>
        <span class="rv-or">or</span>
        ${this.newClientOpen ? `
          <div class="rv-new-client">
            <input type="text" class="rv-new-first" placeholder="First name" autocomplete="off">
            <input type="text" class="rv-new-last" placeholder="Surname" autocomplete="off">
            <button type="button" class="item-save" data-rv="add-new-client">Add</button>
            <button type="button" class="item-cancel" data-rv="cancel-new-client">Cancel</button>
            <span class="rv-new-error"></span>
          </div>` : `
          <button type="button" class="rv-new-btn" data-rv="new-client">+ New client</button>`}
      </div>
    `;
  }

  // ---------- "+ Another client" ----------

  _fillPicker(input) {
    const list = input.parentElement.querySelector('.rv-picker-list');
    const q = input.value.trim();
    if (!q) { list.classList.remove('open'); return; }
    const matches = _searchClients(q);
    const canAdd = q.split(/\s+/).length >= 2 && !matches.some(m => m.name.toLowerCase() === q.toLowerCase());
    list.innerHTML = matches.map(m => `
      <button type="button" class="rv-pick" data-pick-id="${m.id}">
        <span>${_escHtml(m.name)}</span><span class="rv-pick-tab">${_escHtml(m.tabLabel)}</span>
      </button>
    `).join('') + (canAdd ? `<button type="button" class="rv-pick new" data-pick-new="${_escHtml(q)}">+ Add “${_escHtml(q)}” as new client</button>` : '')
      + (!matches.length && !canAdd ? '<div class="rv-empty">No match — type first name and surname to add them.</div>' : '');
    list.classList.add('open');
  }

  // Picking a client (or adding a new one) adds their card, opened.
  async _pick(btn) {
    let id = btn.dataset.pickId;
    try {
      if (!id) {
        const [firstName, ...rest] = btn.dataset.pickNew.trim().split(/\s+/);
        const card = await dbCreateClient({ firstName, lastName: rest.join(' ') });
        appendClientCard('prospects-cards', card);
        id = card.id;
      }
    } catch (err) {
      showSaveError(err);
      return;
    }
    this._showClient(id);
  }

  // Puts a client in the list (Activities, or Case updates if they have
  // an open case) and opens their card, ready for their "+".
  _showClient(id) {
    // An open-case client lives under Case updates.
    if ((getClientData(id).cases || []).some(isOpenCase)) {
      this._goTo(REVIEW_STEPS.findIndex(s => s.key === 'cases'));
    } else {
      if (!this.extraClients.includes(id)) this.extraClients.push(id);
      this.render();
    }
    const row = this.body.querySelector(`.list-row[data-card-id="${id}"]`);
    if (row) {
      _openCard(row);
      row.scrollIntoView({ block: 'center' });
    }
  }

  // "+ New client": someone who isn't in the app yet. They land in
  // Prospects, and their card opens here for today's activity.
  async _addNewClient(btn) {
    const box = btn.closest('.rv-new-client');
    const first = box.querySelector('.rv-new-first');
    const last = box.querySelector('.rv-new-last');
    const firstName = first.value.trim();
    const lastName = last.value.trim();
    first.classList.toggle('field-error', !firstName);
    last.classList.toggle('field-error', !lastName);
    if (!firstName || !lastName) {
      box.querySelector('.rv-new-error').textContent = 'First name and surname are both needed.';
      return;
    }
    btn.disabled = true;
    try {
      const card = await dbCreateClient({ firstName, lastName });
      appendClientCard('prospects-cards', card);
      this.newClientOpen = false;
      this._showClient(card.id);
    } catch (err) {
      btn.disabled = false;
      box.querySelector('.rv-new-error').textContent = `Couldn't save — ${err.message || err}`;
    }
  }

  // ---------- saving ----------

  async _saveProspects() {
    const counts = {};
    this.body.querySelectorAll('[data-channel]').forEach(i => {
      counts[i.dataset.channel] = Math.max(0, parseInt(i.value, 10) || 0);
    });
    this.prospects = counts;
    this.body.querySelector('.rv-total b').textContent = Object.values(counts).reduce((t, n) => t + n, 0);
    try {
      await dbReplaceProspectCounts(this.day, counts);
      await refreshDashboard();
    } catch (err) {
      showSaveError(err);
    }
  }

  // Names who still needs an update, on the Open case updates step.
  _showMissing() {
    const missing = this._needingUpdate();
    this.errorEl.textContent = `Still needs an update: ${missing.map(r => r.name).join(', ')}.`;
  }

  async _done() {
    if (this._needingUpdate().length) {
      this.step = REVIEW_STEPS.findIndex(s => s.key === 'cases');
      this.render();
      this._showMissing();
      return;
    }
    const logged = getClientRecords().some(r => this._hasEntryOnDay(getClientData(r.id)));
    const prospects = Object.values(this.prospects).some(n => Number(n) > 0);
    this.doneBtn.disabled = true;
    this.errorEl.textContent = '';
    try {
      await dbMarkReviewed(this.day, !logged && !prospects);
      await refreshDashboard();
      this.required = false;
      this.close();
    } catch (err) {
      console.error(err);
      this.errorEl.textContent = `Couldn't save — ${err.message || err}. Try Done again.`;
    } finally {
      this.doneBtn.disabled = false;
    }
  }

  // ---------- events ----------

  _onClick(e) {
    const btn = e.target.closest('[data-rv]');
    if (!btn) return;
    const act = btn.dataset.rv;
    if (act === 'close') this.close();
    else if (act === 'goto') this._goTo(Number(btn.dataset.step));
    else if (act === 'back') this._goTo(this.step - 1);
    else if (act === 'next') this._goTo(this.step + 1);
    else if (act === 'done') this._done();
    else if (act === 'new-client') {
      this.newClientOpen = true;
      this.render();
      this.body.querySelector('.rv-new-first')?.focus();
    } else if (act === 'cancel-new-client') {
      this.newClientOpen = false;
      this.render();
    } else if (act === 'add-new-client') this._addNewClient(btn);
  }
}

// ---------- toolbar button and entry points ----------

let _reviewInstance = null;
let _reviewTriggerId = null;

function openReview(day, options) {
  _reviewInstance?.open(day, options);
}

function isReviewOpen() {
  return !!_reviewInstance?.isOpen();
}

// The toolbar button shows a tick once the review day is done.
function syncReviewTrigger() {
  const trigger = _reviewTriggerId && document.getElementById(_reviewTriggerId);
  if (!trigger) return;
  const done = COMPLETED_CHECKOUT_DATES.has(reviewDay());
  trigger.classList.toggle('checked-out', done);
  trigger.title = done ? `Review — ${_reviewDayLabel(reviewDay())} is done` : 'Review';
}

function initReview(triggerId) {
  const trigger = document.getElementById(triggerId);
  if (!trigger) return null;
  _reviewInstance = new Review();
  _reviewTriggerId = triggerId;
  trigger.addEventListener('click', () => openReview(reviewDay()));
  syncReviewTrigger();
  return _reviewInstance;
}
