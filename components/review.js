// Review: the daily look back at the last weekday (see SPEC.md, "Review").
// Everything logged that day across all clients, laid out activity first,
// client last — "what did I do, and for whom?" — on one screen:
//
//   Prospects contacted   counts by channel, for people not in the app
//   Meetings · FNAs · Quotes · New cases · Contacts & notes
//                         that day's entries, then an add line: the same
//                         fields as the card's add form (card-items.js),
//                         with a client box at the end — any client, or
//                         "+ Add … as new client"
//   Open cases            one block per client with an open case: its
//                         cases with their next steps, and an update —
//                         required unless the client already has an
//                         entry that day ("Same as last" from the arrow;
//                         a nudge after 3 identical updates)
//
// Every line saves the moment it's added or deleted, onto the client's
// timeline, dated the review day. Done checks the open-case clients all
// have an update, then marks the day reviewed — as "no activity" if
// nothing at all was logged. A required Review (data.js enforceReview)
// can't be closed until it's done.

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
      width: 1040px;
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
      padding: 20px 24px 14px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }
    .rv-title { font-size: 18px; font-weight: 700; }
    .rv-sub { font-size: 12px; color: var(--ink-dim); margin-top: 3px; }
    .rv-close { background: none; border: none; font-size: 24px; line-height: 1; color: var(--ink-dim); cursor: pointer; }
    .rv-close:hover { color: var(--ink); }
    .rv-overlay.required .rv-close { display: none; }
    .rv-body { padding: 8px 24px 16px; }
    .rv-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
      padding: 14px 24px 20px;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
    }
    .rv-error { flex: 1; font-size: 13px; color: var(--red); }
    .rv-done {
      background: var(--gold);
      color: var(--navy);
      border: none;
      border-radius: 6px;
      padding: 10px 22px;
      font-size: 14px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
    }
    .rv-done:disabled { opacity: 0.6; cursor: default; }

    .rv-sec { padding: 14px 0 6px; border-bottom: 1px solid rgba(0, 0, 0, 0.06); }
    .rv-sec:last-child { border-bottom: none; }
    .rv-sec-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-dim);
      margin-bottom: 8px;
    }
    .rv-sec-title .rv-required { color: var(--red); text-transform: none; letter-spacing: 0; font-weight: 600; }

    .rv-prospects { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
    .rv-prospects .item-number input { background: #f7f7f5; }
    .rv-total { font-size: 13px; color: var(--ink-dim); margin-left: auto; }
    .rv-total b { color: var(--ink); }

    .rv-line { display: flex; align-items: baseline; gap: 14px; padding: 6px 0; font-size: 13px; }
    .rv-line .tl-text { flex: 1; }
    .rv-client { flex-shrink: 0; font-weight: 600; color: var(--ink); }
    .rv-line:hover .tl-del { visibility: visible; }
    .rv-form { padding: 6px 0 10px; border-bottom: none; margin-bottom: 0; }

    /* The client box at the end of an add line. */
    .rv-picker { position: relative; width: 220px; flex-shrink: 0; }
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
    .rv-picker input.picked { border-color: #1f7a52; font-weight: 600; }
    .rv-picker input.field-error { border-color: var(--red); }
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

    .rv-client-block { padding: 10px 0; border-top: 1px solid rgba(0, 0, 0, 0.05); }
    .rv-client-block:first-of-type { border-top: none; }
    .rv-client-name { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
    .rv-case { display: flex; align-items: center; gap: 14px; padding: 4px 0; font-size: 13px; }
    .rv-case .cb-type { flex: 0 0 180px; font-weight: 600; }
    .rv-case .cb-actions { margin-left: auto; }
    .rv-update { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
    .rv-update .status-input { max-width: 560px; }
    .rv-updated { font-size: 13px; color: #1f7a52; margin-top: 4px; }
    .rv-nudge { font-size: 12px; color: #8a6d0a; margin-top: 4px; }
    .rv-missing .status-input input { border-color: var(--red); }
    .rv-empty { font-size: 13px; color: var(--ink-dim); padding: 4px 0; }

    /* The toolbar button, once the review day is done. */
    .cc-trigger.checked-out { color: var(--green); border-color: var(--green); }
  `;
  document.head.appendChild(s);
}
_injectReviewCSS();

// The activity sections, in funnel order. kinds: which timeline entries
// it lists (a new case lists its "opened" entry).
const REVIEW_SECTIONS = [
  { title: 'Meetings', add: 'meeting', kinds: ['meeting'] },
  { title: 'FNAs', add: 'fna', kinds: ['fna'] },
  { title: 'Quotes', add: 'quote', kinds: ['quote'] },
  { title: 'New cases', add: 'case', kinds: ['case'] },
  { title: 'Contacts & notes', add: 'contact', kinds: ['contact', 'note'] },
];

// The day in words: "Friday 25 Sep".
function _reviewDayLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

// A client's last update (latest contact or note), for "Same as last".
function _lastUpdate(data) {
  return (data.timeline || []).find(e => e.type === 'contact' || e.type === 'note') || null;
}

// Same update for the last 3 days running → suggest a follow-up.
function _needsNudge(data) {
  const updates = (data.timeline || []).filter(e => e.type === 'contact' || e.type === 'note');
  const lastByDay = [];
  updates.forEach(e => { if (!lastByDay.some(u => u.date === e.date)) lastByDay.push(e); });
  const three = lastByDay.slice(0, 3);
  return three.length === 3 && three.every(e => e.text.trim().toLowerCase() === three[0].text.trim().toLowerCase());
}

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
        <div class="rv-body"></div>
        <div class="rv-footer">
          <span class="rv-error"></span>
          <button type="button" class="rv-done" data-rv="done">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    this.body = this.overlay.querySelector('.rv-body');
    this.errorEl = this.overlay.querySelector('.rv-error');
    this.doneBtn = this.overlay.querySelector('.rv-done');

    this.overlay.addEventListener('click', e => this._onClick(e));
    this.overlay.addEventListener('input', e => this._onInput(e));
    this.overlay.addEventListener('change', e => this._onChange(e));
    this.overlay.addEventListener('keydown', e => this._onKeyDown(e));
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
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }

  isOpen() {
    return this.overlay.classList.contains('open');
  }

  // day: ISO date under review. required: can't close until Done.
  async open(day, { required = false } = {}) {
    this.day = day;
    this.required = required;
    this.showErrors = false;
    this.contactKind = 'contact';
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
  }

  // ---------- what's in the day ----------

  _clients() {
    return getClientRecords().map(r => ({ ...r, data: getClientData(r.id) }));
  }

  // That day's entries of these kinds, across every client.
  _entries(kinds) {
    return this._clients().flatMap(c => (c.data.timeline || [])
      .filter(e => e.date === this.day && kinds.includes(e.type) && (e.type !== 'case' || e.details.event === 'opened'))
      .map(e => ({ entry: e, client: c })));
  }

  _openCaseClients() {
    return this._clients()
      .filter(c => (c.data.cases || []).some(isOpenCase))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _updatedOnDay(c) {
    return (c.data.timeline || []).some(e => e.date === this.day);
  }

  // ---------- rendering ----------

  render() {
    const top = this.overlay.scrollTop;
    this.body.innerHTML = [
      this._prospectsHTML(),
      ...REVIEW_SECTIONS.map(sec => this._sectionHTML(sec)),
      this._openCasesHTML(),
    ].join('');
    this.body.querySelectorAll('.rv-form[data-kind="case"]').forEach(_syncCaseFields);
    this.overlay.scrollTop = top;
  }

  _prospectsHTML() {
    const total = PROSPECT_CHANNELS.reduce((t, ch) => t + (Number(this.prospects[ch.key]) || 0), 0);
    return `
      <div class="rv-sec">
        <div class="rv-sec-title">Prospects contacted <span class="rv-sub">— people not yet in the app</span></div>
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

  _lineHTML({ entry, client }) {
    const kind = TIMELINE_KINDS[entry.type] || { label: entry.type };
    const del = entry.type === 'case'
      ? `<button type="button" class="tl-del" data-action="delete-case" data-client="${client.id}" data-case="${entry.caseId}" title="Delete this case">&times;</button>`
      : `<button type="button" class="tl-del" data-action="delete-entry" data-client="${client.id}" data-id="${entry.id}" title="Delete">&times;</button>`;
    return `
      <div class="rv-line">
        <span class="tl-kind">${kind.label}</span>
        <span class="tl-text">${_escHtml(timelineEntryText(client.data, entry))}</span>
        <span class="rv-client">${_escHtml(client.name)}</span>
        ${del}
      </div>
    `;
  }

  _pickerHTML() {
    return `
      <div class="rv-picker">
        <input type="text" class="rv-picker-input" placeholder="Client&hellip;" autocomplete="off">
        <div class="rv-picker-list"></div>
      </div>
    `;
  }

  _addLineHTML(kind) {
    // Contacts & notes share one line, with a Contact / Note switch.
    const lead = REVIEW_SECTIONS.find(s => s.add === kind)?.kinds.length > 1
      ? `<select class="rv-kind-switch" data-rv-kind>
           <option value="contact"${this.contactKind === 'contact' ? ' selected' : ''}>Contact</option>
           <option value="note"${this.contactKind === 'note' ? ' selected' : ''}>Note</option>
         </select>`
      : `<span class="tl-kind">${TIMELINE_KINDS[kind].label}</span>`;
    const fieldsKind = kind === 'contact' ? this.contactKind : kind;
    return `
      <div class="item-add-form open rv-form" data-kind="${fieldsKind}">
        ${lead}
        ${_addFormFieldsHTML(fieldsKind)}
        ${this._pickerHTML()}
        <button type="button" class="item-save" data-rv="save-line">Save</button>
        <div class="item-form-error"></div>
      </div>
    `;
  }

  _sectionHTML(sec) {
    const lines = this._entries(sec.kinds);
    return `
      <div class="rv-sec">
        <div class="rv-sec-title">${sec.title}</div>
        ${lines.map(l => this._lineHTML(l)).join('')}
        ${this._addLineHTML(sec.add)}
      </div>
    `;
  }

  _openCasesHTML() {
    const clients = this._openCaseClients();
    const blocks = clients.map(c => {
      const cases = (c.data.cases || []).filter(isOpenCase).map(k => {
        const stageBtn = (stage, label, primary) =>
          `<button type="button" class="cb-btn${primary ? ' primary' : ''}" data-rv="stage" data-client="${c.id}" data-case="${k.id}" data-stage="${stage}">${label}</button>`;
        return `
          <div class="rv-case">
            <span class="cb-type">${_escHtml(k.type)}</span>
            <span class="cb-stage">${CASE_STAGE_LABELS[k.stage]}</span>
            <span class="cb-check">&#10003; ${caseChecklistDone(k)}/${CASE_CHECKLIST.length}</span>
            <span class="cb-pcr">PCR ${formatNumber(casePcr(k))}</span>
            <span class="cb-actions">
              ${k.stage === 'opened' ? stageBtn('submitted', 'Mark submitted', true) : ''}
              ${k.stage === 'submitted' ? stageBtn('accepted', 'Mark accepted', true) : ''}
              ${stageBtn('not-taken-up', 'Not taken up')}
            </span>
          </div>
        `;
      }).join('');
      const updated = this._updatedOnDay(c);
      const last = _lastUpdate(c.data);
      const todays = (c.data.timeline || []).find(e => e.date === this.day);
      const update = updated
        ? `<div class="rv-updated">&#10003; Updated — ${_escHtml(timelineEntryText(c.data, todays))}</div>`
        : `
          ${_needsNudge(c.data) ? '<div class="rv-nudge">Same update for 3 days — follow up?</div>' : ''}
          <div class="rv-update${this.showErrors ? ' rv-missing' : ''}">
            ${statusInputHTML({ last: last?.text || '', attrs: `data-rv-update="${c.id}"`, placeholder: 'Update…' })}
            <button type="button" class="item-save" data-rv="save-update" data-client="${c.id}">Save update</button>
          </div>
        `;
      return `
        <div class="rv-client-block">
          <div class="rv-client-name">${_escHtml(c.name)}</div>
          ${cases}
          ${update}
        </div>
      `;
    }).join('');
    return `
      <div class="rv-sec">
        <div class="rv-sec-title">Open cases <span class="rv-required">— every client needs an update</span></div>
        ${blocks || '<div class="rv-empty">No open cases.</div>'}
      </div>
    `;
  }

  // ---------- the client box ----------

  _fillPicker(input) {
    const list = input.parentElement.querySelector('.rv-picker-list');
    input.classList.remove('picked');
    delete input.dataset.clientId;
    delete input.dataset.newName;
    const q = input.value.trim();
    if (!q) { list.classList.remove('open'); return; }
    const matches = _searchClients(q);
    const words = q.split(/\s+/);
    const canAdd = words.length >= 2 && !matches.some(m => m.name.toLowerCase() === q.toLowerCase());
    list.innerHTML = matches.map(m => `
      <button type="button" class="rv-pick" data-pick-id="${m.id}">
        <span>${_escHtml(m.name)}</span><span class="rv-pick-tab">${_escHtml(m.tabLabel)}</span>
      </button>
    `).join('') + (canAdd ? `<button type="button" class="rv-pick new" data-pick-new="${_escHtml(q)}">+ Add “${_escHtml(q)}” as new client</button>` : '')
      + (!matches.length && !canAdd ? '<div class="rv-empty">No match — type first name and surname to add them.</div>' : '');
    list.classList.add('open');
  }

  _pick(btn) {
    const input = btn.closest('.rv-picker').querySelector('input');
    if (btn.dataset.pickId) {
      input.dataset.clientId = btn.dataset.pickId;
      input.value = getClientRecords().find(r => r.id === btn.dataset.pickId)?.name || '';
    } else {
      input.dataset.newName = btn.dataset.pickNew;
      input.value = btn.dataset.pickNew;
    }
    input.classList.add('picked');
    input.classList.remove('field-error');
    btn.closest('.rv-picker-list').classList.remove('open');
  }

  // The picked client's id — creating them first if they're new.
  async _pickedClientId(input) {
    if (input.dataset.clientId) return input.dataset.clientId;
    const [firstName, ...rest] = input.dataset.newName.trim().split(/\s+/);
    const card = await dbCreateClient({ firstName, lastName: rest.join(' ') });
    appendClientCard('prospects-cards', card);
    return card.id;
  }

  // ---------- saving ----------

  async _saveLine(form) {
    const kind = form.dataset.kind;
    const v = _formValues(form);
    const errorEl = form.querySelector('.item-form-error');
    const picker = form.querySelector('.rv-picker-input');
    let message = _validateAddForm(form, v);
    if (!message && !picker.dataset.clientId && !picker.dataset.newName) {
      picker.classList.add('field-error');
      message = 'Pick the client.';
    }
    errorEl.textContent = message;
    if (message) return;

    const btn = form.querySelector('[data-rv="save-line"]');
    btn.disabled = true;
    try {
      const clientId = await this._pickedClientId(picker);
      if (kind === 'case') {
        if (clientTab(clientId) !== 'business') {
          const d = getClientData(clientId);
          const move = await showChoiceDialog({
            title: 'Move to Business?',
            message: `Opening this case will move ${d.firstName} ${d.lastName} to the Business tab.`,
            choices: [{ label: 'Cancel', value: null }, { label: 'Move', value: 'move', primary: true }],
          });
          if (!move) { btn.disabled = false; return; }
        }
        const r = await dbOpenCase(clientId, v, this.day);
        _addToCard(clientId, { activity: r.activity, caseItem: r.case });
        await syncTabAfterCaseChange(clientId).catch(showSaveError);
      } else {
        const row = await dbAddActivity(clientId, kind, this.day, _detailsFor(kind, v));
        _addToCard(clientId, { activity: activityItem(row) });
      }
      await refreshDashboard();
      this.render();
    } catch (err) {
      console.error(err);
      errorEl.textContent = `Couldn't save — ${err.message || err}`;
      btn.disabled = false;
    }
  }

  async _saveUpdate(btn) {
    const clientId = btn.dataset.client;
    const input = this.body.querySelector(`[data-rv-update="${clientId}"]`);
    const text = input.value.trim();
    if (!text) { input.classList.add('field-error'); input.focus(); return; }
    btn.disabled = true;
    try {
      const row = await dbAddActivity(clientId, 'note', this.day, { text });
      _addToCard(clientId, { activity: activityItem(row) });
      this.render();
    } catch (err) {
      btn.disabled = false;
      showSaveError(err);
    }
  }

  async _saveProspects() {
    const counts = {};
    this.body.querySelectorAll('[data-channel]').forEach(i => {
      counts[i.dataset.channel] = Math.max(0, parseInt(i.value, 10) || 0);
    });
    this.prospects = counts;
    const total = Object.values(counts).reduce((t, n) => t + n, 0);
    this.body.querySelector('.rv-total b').textContent = total;
    try {
      await dbReplaceProspectCounts(this.day, counts);
      await refreshDashboard();
    } catch (err) {
      showSaveError(err);
    }
  }

  async _done() {
    const missing = this._openCaseClients().filter(c => !this._updatedOnDay(c));
    if (missing.length) {
      this.showErrors = true;
      this.render();
      this.errorEl.textContent = `Still needs an update: ${missing.map(c => c.name).join(', ')}.`;
      this.body.querySelector('.rv-missing')?.scrollIntoView({ block: 'center' });
      return;
    }
    const logged = this._clients().some(c => this._updatedOnDay(c));
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

  async _onClick(e) {
    const btn = e.target.closest('[data-rv], [data-action]');
    if (!btn) return;
    const act = btn.dataset.rv || btn.dataset.action;
    if (act === 'close') this.close();
    else if (act === 'done') this._done();
    else if (act === 'save-line') this._saveLine(btn.closest('.rv-form'));
    else if (act === 'save-update') this._saveUpdate(btn);
    else if (act === 'stage') {
      btn.disabled = true;
      try {
        await changeCaseStage(btn.dataset.client, btn.dataset.case, btn.dataset.stage, this.day);
      } catch (err) {
        showSaveError(err);
      }
      this.render();
    } else if (act === 'delete-entry') {
      await _deleteEntry(btn);
      this.render();
    } else if (act === 'delete-case') {
      await _deleteCase(btn);
      this.render();
    }
  }

  _onInput(e) {
    const t = e.target;
    if (t.matches('.rv-picker-input')) this._fillPicker(t);
    if (t.matches('[data-rv-update]')) t.classList.remove('field-error');
  }

  _onChange(e) {
    const t = e.target;
    if (t.matches('[data-channel]')) this._saveProspects();
    if (t.matches('[data-rv-kind]')) {
      this.contactKind = t.value;
      this.render();
    }
  }

  _onKeyDown(e) {
    if (e.key !== 'Enter') return;
    if (e.target.matches('.rv-picker-input')) {
      e.preventDefault();
      const first = e.target.parentElement.querySelector('.rv-pick[data-pick-id], .rv-pick[data-pick-new]');
      if (first) this._pick(first);
      return;
    }
    const form = e.target.closest('.rv-form');
    if (form && !e.target.matches('.rv-picker-input')) { e.preventDefault(); this._saveLine(form); }
    const update = e.target.closest('.rv-update');
    if (update) { e.preventDefault(); this._saveUpdate(update.querySelector('[data-rv="save-update"]')); }
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
