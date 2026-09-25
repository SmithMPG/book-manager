// Auth: gates the whole app behind a Supabase session, and behind each
// person having actually set their own password. Two full-screen overlays
// (their own markup, injected here) sit on top of everything at a high
// z-index; whichever one applies is shown, both hidden once the app
// itself should show — simpler than restructuring index.html's existing
// layout, since the overlay just covers it instead.
//
// Registration model (demo period, no email ever sent): an admin creates
// each person's login in the Supabase dashboard with a temporary
// password and adds them to `users` (supabase/fa-list.sql) with
// password_set = false. On first sign-in that sends them to the "set
// your password" screen below, so they choose their own. Nobody can
// sign themselves up. There's no self-service reset without email —
// fa-list.sql shows how an admin resets one.
//
// `users.password_set` is what gates the app itself, not just having a
// session: false shows the set-password screen instead, whatever kind
// of session exists. That also covers emailed invite links, should
// those come back once there's a real SMTP provider — an invite grants
// a session before any password exists.
//
// This is the login/onboarding/session gate only. It does not yet load
// any real client/case/activity data from the database — that's the
// next, separate piece of work. Once past this gate, the app still runs
// on its existing sample data for now.

function _injectAuthCSS() {
  if (document.getElementById('auth-styles')) return;
  const s = document.createElement('style');
  s.id = 'auth-styles';
  s.textContent = `
    .auth-overlay {
      position: fixed;
      inset: 0;
      z-index: 500;
      background: var(--navy);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .auth-overlay.hidden { display: none; }

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
      margin-bottom: 8px;
    }
    .login-brand .shield { color: var(--gold); display: inline-flex; align-items: center; }
    .login-brand .brand-gold { color: var(--gold); }
    .login-subtitle { font-size: 13px; color: var(--text-dim); margin-bottom: 24px; }

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
    .login-error.info { color: var(--text-dim); }

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

    .login-forgot {
      display: inline-block;
      margin-top: 14px;
      font-size: 12px;
      color: var(--text-dim);
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
    }
    .login-forgot:hover { color: var(--text); }
    .login-hint { margin-top: 8px; font-size: 12px; color: var(--text-dim); }
  `;
  document.head.appendChild(s);
}
_injectAuthCSS();

function _brandHTML() {
  return `
    <div class="login-brand">
      <span class="shield"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></span>
      <span>Book<span class="brand-gold">Manager</span></span>
    </div>
  `;
}

function _authScreensHTML() {
  return `
    <div class="auth-overlay hidden" id="login-overlay">
      <div class="login-card">
        ${_brandHTML()}
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
          <div class="login-hint">Forgot your password? Ask your admin to reset it.</div>
        </form>
      </div>
    </div>
    <div class="auth-overlay hidden" id="set-password-overlay">
      <div class="login-card">
        ${_brandHTML()}
        <div class="login-subtitle">Set a password for your account to continue.</div>
        <form id="set-password-form">
          <div class="login-field">
            <label for="set-password-new">New password</label>
            <input type="password" id="set-password-new" autocomplete="new-password" required minlength="8">
          </div>
          <div class="login-field">
            <label for="set-password-confirm">Confirm password</label>
            <input type="password" id="set-password-confirm" autocomplete="new-password" required minlength="8">
          </div>
          <div class="login-error" id="set-password-error"></div>
          <button type="submit" class="login-submit" id="set-password-submit">Set password &amp; continue</button>
        </form>
      </div>
    </div>
  `;
}

function _showError(el, message, info) {
  el.textContent = message;
  el.classList.add('visible');
  el.classList.toggle('info', !!info);
}

function _hideOverlay(id) {
  document.getElementById(id).classList.add('hidden');
}
function _showOverlay(id) {
  document.getElementById(id).classList.remove('hidden');
}

// The signed-in person's own users row, or null if it can't be read.
async function _fetchCurrentUser(userId) {
  const { data, error } = await supabaseClient
    .from('users')
    .select('id, name, surname, email, is_admin, branch, pcr_target, password_set')
    .eq('id', userId)
    .single();
  return error ? null : data;
}

// The single source of truth for which of the three states applies:
// signed out, signed in but not onboarded, or signed in and ready to use
// the app. Re-run on every auth event rather than special-cased per
// event type, so it can't drift out of sync with reality.
async function _renderAuthState() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    setCurrentUser(null);
    _hideOverlay('set-password-overlay');
    _showOverlay('login-overlay');
    return;
  }

  // Any failure to tell whether they've finished onboarding (missing
  // row, network hiccup) fails closed — show the set-password screen
  // rather than risk letting someone in we're not sure about.
  const user = await _fetchCurrentUser(session.user.id);
  _hideOverlay('login-overlay');
  if (user?.password_set) {
    _hideOverlay('set-password-overlay');
    setCurrentUser(user);
  } else {
    setCurrentUser(null);
    _showOverlay('set-password-overlay');
  }
}

async function initAuth() {
  document.body.insertAdjacentHTML('beforeend', _authScreensHTML());

  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit');

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    loginError.classList.remove('visible', 'info');
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Signing in…';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Sign in';
    if (error) _showError(loginError, error.message);
    // On success, onAuthStateChange (below) re-renders the right screen —
    // nothing else to do here.
  });

  const setPasswordForm = document.getElementById('set-password-form');
  const setPasswordError = document.getElementById('set-password-error');
  const setPasswordSubmit = document.getElementById('set-password-submit');

  setPasswordForm.addEventListener('submit', async e => {
    e.preventDefault();
    setPasswordError.classList.remove('visible', 'info');

    const newPassword = document.getElementById('set-password-new').value;
    const confirm = document.getElementById('set-password-confirm').value;
    if (newPassword !== confirm) {
      _showError(setPasswordError, 'Passwords do not match.');
      return;
    }

    setPasswordSubmit.disabled = true;
    setPasswordSubmit.textContent = 'Saving…';

    const { data: { user }, error: updateError } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (updateError) {
      setPasswordSubmit.disabled = false;
      setPasswordSubmit.textContent = 'Set password & continue';
      _showError(setPasswordError, updateError.message);
      return;
    }

    const { error: flagError } = await supabaseClient.from('users').update({ password_set: true }).eq('id', user.id);
    setPasswordSubmit.disabled = false;
    setPasswordSubmit.textContent = 'Set password & continue';
    if (flagError) {
      _showError(setPasswordError, flagError.message);
      return;
    }
    await _renderAuthState();
  });

  const signOutBtn = document.querySelector('.btn-signout');
  signOutBtn?.addEventListener('click', () => supabaseClient.auth.signOut());

  supabaseClient.auth.onAuthStateChange(() => { _renderAuthState(); });
  await _renderAuthState();
}
