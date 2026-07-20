# Nexora CRM Portal — Frontend (Phase 1)

React (Vite) frontend for the Nexora CRM Portal. No backend yet — every page
runs on mock data in `src/data/mockData.js`.

## Run

```bash
npm install
npm run dev
```

Visit the printed local URL (usually `http://localhost:5173`).

## Roles

There's no login yet. Visit `/` for a role-picker, or go straight to:

- `/admin` — org-wide dashboard, team attendance, production board, settings
- `/manager` — team dashboard, team attendance, production board
- `/agent` — check-in/checkout, personal attendance calendar
- `/production` — production dashboard, Trello-style drafts/revisions board

## Structure

- `src/styles/` — ported design system (CSS variables/theme, layout, board,
  attendance, notifications)
- `src/icons/IconSprite.jsx` — SVG icon sprite
- `src/context/` — theme (light/dark, persisted) and toast providers
- `src/config/roleNavConfig.js` — per-role navigation + demo user
- `src/utils/attendanceRules.js` — late/off/deduction rule engine (mock)
- `src/utils/deadlineUtils.js` — draft/revision deadline + alert logic (mock)
- `src/data/mockData.js` — seed agents, production cards, notifications
- `src/components/` — reusable UI (shell, board, attendance, notifications)
- `src/pages/` — one folder per role, plus `shared/` for cross-role pages
