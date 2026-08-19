// DEPRECATED — no longer used.
//
// The separate super-admin login page/username field has been retired.
// Superadmin now signs in through the regular LoginPage.js email/password
// form — see the admin-identity check at the top of POST /api/auth/login
// in backend/src/server.js, which grants the same superadmin rights when
// the submitted email matches ADMIN_EMAIL (falls back to ADMIN_USERNAME
// if unset) and the password matches ADMIN_PASSWORD.
//
// This file is kept only because the sandbox this project is edited in
// can't delete files from the repo (only overwrite them in place) — it is
// not imported anywhere and is not part of the production bundle.
