import express from 'express';
import cors from 'cors';
import { healthCheck } from './controllers/health.controller.js';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { commissionsRoutes } from './routes/commissions.routes.js';
import { mailboxesRoutes } from './routes/mailboxes.routes.js';
import { attendanceRoutes } from './routes/attendance.routes.js';
import { clientsRoutes } from './routes/clients.routes.js';
import { whatsappRoutes } from './routes/whatsapp.routes.js';
import { notificationsRoutes } from './routes/notifications.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { productionRoutes } from './routes/production.routes.js';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

/** Load-balancer / uptime probe (no auth). */
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/mailboxes', mailboxesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/production', productionRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});
