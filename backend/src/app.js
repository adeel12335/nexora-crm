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

/** Allow production portal + Vercel + optional CORS_ORIGINS (comma-separated). */
const corsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const defaultOrigins = [
  'https://portal.thewikistudio.com',
  'https://www.portal.thewikistudio.com',
  'https://thewikistudio.com',
  'https://www.thewikistudio.com',
  'https://nexora-crm-tau.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const allowlist = new Set([...defaultOrigins, ...corsOrigins]);

function corsOrigin(origin, cb) {
  // Same-origin / curl / server-to-server (no Origin header)
  if (!origin) return cb(null, true);
  if (allowlist.has(origin)) return cb(null, true);
  // Reflect any *.vercel.app preview deploy
  if (/^https:\/\/[\w-]+\.vercel\.app$/i.test(origin)) return cb(null, true);
  return cb(null, false);
}

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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
