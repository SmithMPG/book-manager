// Auth: gates the whole app behind a Supabase session. A full-screen
// overlay (its own markup, injected here) sits on top of everything at a
// high z-index when there's no session, and is hidden the moment there
// is one — simpler than restructuring index.html's existing layout to
// show/hide, since the overlay just covers it instead.
//
// This is the login screen and session gate only. It does not yet load
// any real client/case/activity data from the database — that's the
// next, separate piece of work. Once logged in, the app still runs on
// its existing sample data for now.

function _injectAuthCSS() {
  if (document.getElementById('auth-styles')) return;
  const s = document.createElement('style');
  s.id = 'auth-styles';
  s.textContent = `
    .login-overlay {
      position: fixed;
      inset: 0;
      z-index: 500;
      background: var(--navy);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-overlay.hidden { display: none; }

    .login-card {
      width: 360px;
      max-width: 90vw;
      background: var(--navy-light);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 36px 32px;
    }
    .login-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: "Playfair Display", Georgia, "Times New Roman", serif;
      font-weight: 700;
      font-size: 22px;
      margin-bottom: 28px;
    }
    .login-brand .shield { color: var(--gold); display: inline-flex; align-items: center; }
    .login-brand .brand-gold { color: var(--gold); }

    .login-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    .login-field label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
    }
    .login-field input {
      background: var(--navy-lighter);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-family: inherit;
      font-size: 14px;
      padding: 10px 12px;
      outline: none;
    }
    .login-field input:focus { border-color: var(--gold); }

    .login-error {
      display: none;
      font-size: 13px;
      color: var(--red);
      margin-bottom: 14px;
    }
    .login-error.visible { display: block; }

    .login-submit {
      width: 100%;
      background: var(--gold);
      border: none;
      border-radius: 8px;
      color: var(--navy);
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      padding: 11px 18px;
      margin-top: 6px;
    }
    .login-submit:hover { opacity: 0.9; }
    .login-submit:disabled { opacity: 0.6; cursor: default; }
  `;
  document.head.appendChild(s);
}
_injectAuthCSS();

function _loginScreenHTML() {
  return `
    <div class="login-overlay hidden" id="login-overlay">
      <div class="login-card">
        <div class="login-brand">
          <span class="shield"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></span>
          <span>Book<span class="brand-gold">Manager</span></span>
        </div>
        <form id="login-form">
          <div class="login-field">
            <label for="login-email">Email</label>
            <input type="email" id="login-email" autocomplete="username" required>
          </div>
          <div class="login-field">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" autocomplete="current-password" required>
          </div>
          <div class="login-error" id="login-error"></div>
          <button type="submit" class="login-submit" id="login-submit">Sign in</button>
        </form>
      </div>
    </div>
  `;
}

// Shows the overlay (login) or hides it (app underneath is usable) —
// the only two states this screen has.
function _setLoginVisible(visible) {
  document.getElementById('login-overlay').classList.toggle('hidden', !visible);
}

async function initAuth() {
  document.body.insertAdjacentHTML('beforeend', _loginScreenHTML());

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.classList.remove('visible');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.add('visible');
    }
    // On success, onAuthStateChange (below) flips the screen — nothing
    // else to do here.
  });

  const signOutBtn = document.querySelector('.btn-signout');
  signOutBtn?.addEventListener('click', () => supabaseClient.auth.signOut());

  // Single source of truth for whether the overlay shows: every auth
  // change (sign in, sign out, session restored on page load) fires this.
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    _setLoginVisible(!session);
  });

  const { data: { session } } = await supabaseClient.auth.getSession();
  _setLoginVisible(!session);
}
