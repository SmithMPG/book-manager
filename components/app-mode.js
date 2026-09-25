// Current user + FA/Admin mode. auth.js calls setCurrentUser() with the
// signed-in person's `users` row once they're past the login gate.
//
// Admins (users.is_admin) get a toggle in the top bar to switch between
// working as an FA (their own book) and admin mode (the whole team).
// FAs never see it, and can't give themselves admin: is_admin isn't a
// column they're granted update on (supabase/schema.sql).
//
// The toggle is a view choice, not a permission: an admin's database
// reads return everyone's rows either way (RLS's is_admin()), so any
// code that loads data should, in FA mode, filter to
// fa_id = currentUser.id itself. Anything admin-only in the markup can
// carry class="admin-only" and it's hidden outside admin mode.
//
// Listen for changes with:
//   document.addEventListener('appmodechange', e => e.detail.mode)

let currentUser = null;
const _MODE_KEY = 'bm-app-mode';

function _injectAppModeCSS() {
  if (document.getElementById('app-mode-styles')) return;
  const s = document.createElement('style');
  s.id = 'app-mode-styles';
  s.textContent = `
    body:not([data-app-mode="admin"]) .admin-only { display: none !important; }

    .mode-toggle {
      display: inline-flex;
      background: var(--navy-lighter);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2px;
    }
    .mode-toggle.hidden { display: none; }
    .mode-toggle button {
      background: none;
      border: none;
      color: var(--text-dim);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
    }
    .mode-toggle button:hover { color: var(--text); }
    .mode-toggle button.active { background: var(--gold); color: var(--navy); font-weight: 600; }
  `;
  document.head.appendChild(s);
}
_injectAppModeCSS();

function _storedMode() {
  try { return localStorage.getItem(_MODE_KEY); } catch { return null; }
}

function getAppMode() {
  return currentUser?.is_admin && _storedMode() === 'admin' ? 'admin' : 'fa';
}

function _applyAppMode() {
  const mode = getAppMode();
  document.body.dataset.appMode = mode;
  document.querySelectorAll('#mode-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  document.dispatchEvent(new CustomEvent('appmodechange', { detail: { mode } }));
}

function setAppMode(mode) {
  if (!currentUser?.is_admin) return;
  try { localStorage.setItem(_MODE_KEY, mode); } catch {}
  _applyAppMode();
}

// Fires 'currentuser:changed' only when the person actually changes
// (sign in / sign out), not on every auth event — token refreshes re-run
// auth.js's render too, and data.js reloads everything on this event.
function setCurrentUser(user) {
  const changed = (currentUser?.id || null) !== (user?.id || null);
  currentUser = user;

  const fullName = user ? `${user.name} ${user.surname}` : '';
  const nameEl = document.querySelector('.advisor-name');
  const profileEl = document.querySelector('.profile-btn');
  if (nameEl) nameEl.textContent = fullName;
  if (profileEl) {
    profileEl.textContent = user ? (user.name[0] + user.surname[0]).toUpperCase() : '';
    profileEl.title = fullName;
  }

  document.getElementById('mode-toggle')?.classList.toggle('hidden', !user?.is_admin);
  _applyAppMode();
  if (changed) document.dispatchEvent(new CustomEvent('currentuser:changed'));
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#mode-toggle button').forEach(b => {
    b.addEventListener('click', () => setAppMode(b.dataset.mode));
  });
});
