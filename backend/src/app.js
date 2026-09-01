import express from 'express';
import cors from 'cors';
import { healthCheck } from './controllers/health.controller.js';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { commissionsRoutes } from './routes/commissions.routes.js';
import { mailboxesRoutes } from './routes/mailboxes.routes.js';
import { attendanceRoutes } from './routes/attendance.routes.js';
import { clientsRoutes } from './routes/clients.routes.js';
import { dataCenterRoutes } from './routes/dataCenter.routes.js';
import { whatsappRoutes } from './routes/whatsapp.routes.js';
import { notificationsRoutes } from './routes/notifications.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { productionRoutes } from './routes/production.routes.js';
import { followupsRoutes } from './routes/followups.routes.js';
import path from 'path';
import { ensureUploadDirs, isHashedUploadPath, resolveUploadOnDisk, UPLOAD_ROOT, uploadLookupRoots } from './services/uploads.js';

export const app = express();

ensureUploadDirs();

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
  'https://lightslategray-cat-532319.hostingersite.com',
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
app.use(express.json({ limit: '2mb' }));

// Disk uploads under /api/uploads (Hostinger usually proxies /api → Node)
app.use('/api/uploads', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const rel = decodeURIComponent(String(req.path || '')).replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return res.status(400).json({ error: 'Invalid path' });
  const abs = resolveUploadOnDisk(rel);
  if (!abs) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({
      error: 'File not found on the server. It was likely lost on deploy — please re-upload.',
    });
  }
  const hashed = isHashedUploadPath(rel) || isHashedUploadPath(abs);
  const downloadName = path.basename(abs).replace(/[\r\n"]/g, '');
  const ext = path.extname(abs).toLowerCase();
  const inline = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt'].includes(ext);
  return res.sendFile(abs, {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${downloadName}"`,
      'Cache-Control': hashed
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=604800',
    },
    maxAge: hashed ? '1y' : '7d',
  });
});
function uploadCacheHeaders(res, filePath) {
  const hashed = isHashedUploadPath(filePath);
  res.setHeader(
    'Cache-Control',
    hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=604800',
  );
}
for (const root of uploadLookupRoots()) {
  app.use('/api/uploads', express.static(root, {
    fallthrough: true,
    maxAge: '7d',
    setHeaders: uploadCacheHeaders,
  }));
  app.use('/uploads', express.static(root, {
    fallthrough: true,
    maxAge: '7d',
    setHeaders: uploadCacheHeaders,
  }));
}
console.log(`[uploads] writing to ${UPLOAD_ROOT}; lookup ${uploadLookupRoots().join(' | ')}`);

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
app.use('/api/follow-ups', followupsRoutes);
app.use('/api/data-center', dataCenterRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});
