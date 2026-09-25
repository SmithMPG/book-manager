// New client: the small form behind the top bar's "+ New Client" button.
// Just first name and surname; the client is saved
// (data.js) and lands in the Prospects tab, same as a client added
// on the fly during checkout.

function _injectNewClientCSS() {
  if (document.getElementById('new-client-styles')) return;
  const s = document.createElement('style');
  s.id = 'new-client-styles';
  s.textContent = `
    .nc-overlay {
      position: fixed;
      inset: 0;
      z-index: 300;
      background: rgba(15, 23, 41, 0.55);
      display: none;
      align-items: center;
      justify-content: center;
    }
    .nc-overlay.open { display: flex; }
    .nc-modal {
      width: 380px;
      max-width: calc(100vw - 32px);
      background: #ffffff;
      border-radius: 10px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
      padding: 24px;
      color: var(--ink);
    }
    .nc-title { margin: 0 0 18px; font-size: 17px; font-weight: 700; }
    .nc-row { display: flex; gap: 12px; }
    .nc-row .nc-field { flex: 1; min-width: 0; }
    .nc-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
    .nc-field label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-dim);
    }
    .nc-field input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
      font-family: inherit;
      color: var(--ink);
    }
    .nc-error { min-height: 18px; font-size: 12px; color: var(--red); margin-bottom: 8px; }
    .nc-actions { display: flex; justify-content: flex-end; gap: 10px; }
    .nc-cancel {
      background: none;
      border: none;
      color: var(--ink-dim);
      font-size: 13px;
      cursor: pointer;
      padding: 8px 12px;
    }
    .nc-cancel:hover { color: var(--ink); }
    .nc-save {
      background: var(--gold);
      color: var(--navy);
      border: none;
      border-radius: 6px;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .nc-save:disabled { opacity: 0.6; cursor: default; }
  `;
  document.head.appendChild(s);
}
_injectNewClientCSS();

function initNewClient(triggerSelector) {
  const trigger = document.querySelector(triggerSelector);
  if (!trigger) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="nc-overlay" id="new-client-overlay">
      <form class="nc-modal" id="new-client-form" role="dialog" aria-modal="true">
        <h3 class="nc-title">New client</h3>
        <div class="nc-row">
          <div class="nc-field">
            <label for="nc-first">First name</label>
            <input id="nc-first" autocomplete="off" required>
          </div>
          <div class="nc-field">
            <label for="nc-last">Surname</label>
            <input id="nc-last" autocomplete="off" required>
          </div>
        </div>
        <div class="nc-error" id="nc-error"></div>
        <div class="nc-actions">
          <button type="button" class="nc-cancel" id="nc-cancel">Cancel</button>
          <button type="submit" class="nc-save" id="nc-save">Add to Prospects</button>
        </div>
      </form>
    </div>
  `);

  const overlay = document.getElementById('new-client-overlay');
  const form = document.getElementById('new-client-form');
  const errorEl = document.getElementById('nc-error');
  const saveBtn = document.getElementById('nc-save');

  const close = () => overlay.classList.remove('open');
  const open = () => {
    form.reset();
    errorEl.textContent = '';
    overlay.classList.add('open');
    document.getElementById('nc-first').focus();
  };

  trigger.addEventListener('click', open);
  document.getElementById('nc-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const firstName = document.getElementById('nc-first').value.trim();
    const lastName = document.getElementById('nc-last').value.trim();
    if (!firstName || !lastName) {
      errorEl.textContent = 'First name and surname are both needed.';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const card = await dbCreateClient({ firstName, lastName });
      appendClientCard('prospects-cards', card);
      close();
    } catch (err) {
      console.error(err);
      errorEl.textContent = `Couldn't save — ${err.message || err}`;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Add to Prospects';
    }
  });
}
