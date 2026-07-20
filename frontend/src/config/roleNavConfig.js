export const roles = {
  admin: {
    key: 'admin',
    label: 'Admin',
    basePath: '/admin',
    nav: [
      { to: '/admin', label: 'Dashboard', icon: 'i-grid', end: true },
      { to: '/admin/attendance', label: 'Attendance', icon: 'i-calendar' },
      { to: '/admin/production', label: 'Production Board', icon: 'i-kanban' },
      { to: '/admin/notifications', label: 'Notifications', icon: 'i-bell' },
      { to: '/admin/settings', label: 'Settings', icon: 'i-settings' },
    ],
  },
  manager: {
    key: 'manager',
    label: 'Manager',
    basePath: '/manager',
    nav: [
      { to: '/manager', label: 'Dashboard', icon: 'i-grid', end: true },
      { to: '/manager/attendance', label: 'Team Attendance', icon: 'i-calendar' },
      { to: '/manager/production', label: 'Production Board', icon: 'i-kanban' },
      { to: '/manager/notifications', label: 'Notifications', icon: 'i-bell' },
    ],
  },
  agent: {
    key: 'agent',
    label: 'Agent',
    basePath: '/agent',
    nav: [
      { to: '/agent', label: 'Dashboard', icon: 'i-grid', end: true },
      { to: '/agent/attendance', label: 'My Attendance', icon: 'i-clock' },
      { to: '/agent/notifications', label: 'Notifications', icon: 'i-bell' },
    ],
  },
  production: {
    key: 'production',
    label: 'Production',
    basePath: '/production',
    nav: [
      { to: '/production', label: 'Dashboard', icon: 'i-grid', end: true },
      { to: '/production/board', label: 'Production Board', icon: 'i-production' },
      { to: '/production/notifications', label: 'Notifications', icon: 'i-bell' },
    ],
  },
};
