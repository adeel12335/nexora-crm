import { Router } from 'express';
import {
  listCards,
  getCard,
  listPortfolio,
  createCard,
  updateCard,
  moveCardPosition,
  deleteCard,
} from '../controllers/production.controller.js';
import {
  uploadProductionFiles,
  uploadProductionFilesMiddleware,
  migrateAllBase64Uploads,
} from '../controllers/uploads.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const productionRoutes = Router();

productionRoutes.use(requireAuth);

productionRoutes.get(
  '/portfolio',
  requireRole('admin', 'manager', 'agent'),
  asyncHandler(listPortfolio),
);

productionRoutes.get(
  '/cards',
  requireRole('admin', 'production'),
  asyncHandler(listCards),
);

productionRoutes.get(
  '/cards/:id',
  requireRole('admin', 'production'),
  asyncHandler(getCard),
);

productionRoutes.post(
  '/cards',
  requireRole('admin'),
  asyncHandler(createCard),
);

productionRoutes.patch(
  '/cards/:id/move',
  requireRole('admin', 'production'),
  asyncHandler(moveCardPosition),
);

productionRoutes.patch(
  '/cards/:id',
  requireRole('admin', 'production'),
  asyncHandler(updateCard),
);

productionRoutes.delete(
  '/cards/:id',
  requireRole('admin'),
  asyncHandler(deleteCard),
);

/** Multipart → Hostinger disk under /uploads/production */
productionRoutes.post(
  '/uploads',
  requireRole('admin', 'production'),
  (req, res, next) => {
    uploadProductionFilesMiddleware(req, res, (err) => {
      if (!err) return next();
      const status = err.status || 400;
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Each file must be 5 MB or smaller'
        : (err.message || 'Upload failed');
      return res.status(status).json({ error: message });
    });
  },
  asyncHandler(uploadProductionFiles),
);

/** One-shot: move legacy base64 blobs from MySQL onto disk. */
productionRoutes.post(
  '/uploads/migrate-base64',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const result = await migrateAllBase64Uploads();
    res.json({ ok: true, ...result });
  }),
);
