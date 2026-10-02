// Current user + mode. auth.js calls setCurrentUser() with the signed-in
// person's `users` row once they're past the login gate.
//
// Three roles: FAs (no toggle); admins (users.is_admin) toggle between
//   My book  ('fa')    working as an FA, on their own clients
//   Admin    ('admin') the whole team (Home view only)
// and the super admin (users.is_super_admin) also gets
//   Test     ('test')  the shared Test Book — exactly like My book, but
//                      on a test user's clients that never show on the
//                      leaderboard or in team figures (see data.js).
// The database enforces the same: only the super admin can write to the
// Test Book (can_act_as in supabase/schema.sql).
// FAs never see it, and can't give themselves admin: is_admin isn't a
// column they're granted update on (supabase/schema.sql).
//
// The toggle is a view choice, not a permission: an admin's database
// reads return everyone's rows either way (RLS's is_admin()), so any
// code that loads data should, in FA mode, filter to
// fa_id = currentUser.id itself. Anything admin-only in the markup can
// carry class="admin-only" and it's hidden outside admin mode.
//
// Admin mode has its own tabs — Home, for the whole team (see data.js),
// and the admin's FA list: FAs and Resigned (team.js) — and none of the
// FA's own tools (the Review); the search box finds FAs instead of
// clients (client-search.js). Tabs that are only for
// working on a book carry class="fa-only".
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
    body[data-app-mode="admin"] .fa-only { display: none !important; }
    /* Hidden but still taking its space, so the search box doesn't move. */
    body[data-app-mode="admin"] #checkout-trigger { visibility: hidden; }

    .test-mode-strip {
      display: none;
      background: #f4e3a1;
      color: #6b5208;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      padding: 5px 12px;
    }
    body[data-app-mode="test"] .test-mode-strip { display: block; }

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
    .mode-toggle button.hidden { display: none; }
    .mode-toggle button.active { background: var(--gold); color: var(--navy); font-weight: 600; }
  `;
  document.head.appendChild(s);
}
_injectAppModeCSS();

function _storedMode() {
  try { return localStorage.getItem(_MODE_KEY); } catch { return null; }
}

function getAppMode() {
  const stored = _storedMode();
  if (stored === 'test' && currentUser?.is_super_admin) return 'test';
  if (stored === 'admin' && currentUser?.is_admin) return 'admin';
  return 'fa';
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
  document.querySelector('#mode-toggle [data-mode="test"]')?.classList.toggle('hidden', !user?.is_super_admin);
  _applyAppMode();
  if (changed) document.dispatchEvent(new CustomEvent('currentuser:changed'));
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#mode-toggle button').forEach(b => {
    b.addEventListener('click', () => setAppMode(b.dataset.mode));
  });
});
