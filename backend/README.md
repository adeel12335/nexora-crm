# Nexora CRM Portal — Backend (Phase 2)

Reserved for the Node.js + Express API and MySQL database. Not started yet —
the current focus is the React frontend in [`../frontend`](../frontend).

## Planned scope
- Auth (roles: admin, manager, agent, production)
- Attendance: check-in/checkout, late/off/deduction rule engine (mirrors
  `frontend/src/utils/attendanceRules.js`)
- Production: Trello-style board persistence, 4-day draft / 2-day revision
  deadlines (mirrors `frontend/src/utils/deadlineUtils.js`), auto-alerts
- Notifications: WhatsApp + email delivery for deadline and attendance alerts
- MySQL schema for users, attendance_records, production_cards, notifications
