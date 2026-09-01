import { Router } from 'express';
import multer from 'multer';
import {
  listLeads,
  listMeta,
  exportLeads,
  importLeads,
  createLead,
  updateLead,
  deleteLead,
} from '../controllers/dataCenter.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    const type = String(file.mimetype || '');
    const ok = name.endsWith('.csv')
      || type === 'text/csv'
      || type === 'application/vnd.ms-excel'
      || type === 'application/octet-stream'
      || type === 'text/plain';
    if (!ok) {
      const err = new Error('Upload a .csv file');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

export const dataCenterRoutes = Router();

dataCenterRoutes.use(requireAuth);
dataCenterRoutes.use(requireRole('admin'));

dataCenterRoutes.get('/', asyncHandler(listLeads));
dataCenterRoutes.get('/meta', asyncHandler(listMeta));
dataCenterRoutes.get('/export', asyncHandler(exportLeads));
dataCenterRoutes.post(
  '/import',
  (req, res, next) => {
    csvUpload.single('file')(req, res, (err) => {
      if (!err) return next();
      const status = err.status || 400;
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'CSV must be 8 MB or smaller'
        : (err.message || 'Upload failed');
      return res.status(status).json({ error: message });
    });
  },
  asyncHandler(importLeads),
);
dataCenterRoutes.post('/', asyncHandler(createLead));
dataCenterRoutes.patch('/:id', asyncHandler(updateLead));
dataCenterRoutes.delete('/:id', asyncHandler(deleteLead));
