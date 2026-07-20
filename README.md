# Nexora CRM Portal

A role-based CRM/attendance/production portal — React frontend, Node.js +
MySQL backend (Phase 2).

## Structure

- [`frontend/`](frontend) — React (Vite) app. **This is the active app.**
  Role-based routing for Admin, Manager, Agent and Production, an attendance
  system (check-in/checkout with late/off/deduction rules) and a Trello-style
  production board (draft/revision deadlines with auto alerts). Runs on mock
  data — no backend wired up yet. See [`frontend/README.md`](frontend/README.md)
  to run it.
- [`backend/`](backend) — reserved for the Node.js + Express + MySQL API
  (Phase 2, not started).
- `index.html` / `app.js` / `styles.css` / `assets/` (repo root) — the
  original static HTML/CSS/JS design concept. Kept as the visual reference
  the React app's design system was ported from; not actively developed.

## Roles

Admin, Manager, Agent, Production — each gets its own dashboard and
navigation. No login yet; visit `/`, `/admin`, `/manager`, `/agent`, or
`/production` in the frontend app to preview a role.

## Attendance rules (mock, to be confirmed against payroll policy)

- Every 4th late check-in auto-converts into 1 counted day off.
- 2 offs are free per month; the 3rd triggers a payroll deduction flag.

## Production deadlines

- New draft: 4-day limit.
- Revision: 2-day limit, with production auto-notified (in-app + WhatsApp)
  as a revision nears or passes its deadline.
