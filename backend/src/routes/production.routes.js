import { Router } from 'express';
import {
  listCards,
  getCard,
  listPortfolio,
  createCard,
  updateCard,
  deleteCard,
} from '../controllers/production.controller.js';
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
  requireRole('admin', 'production'),
  asyncHandler(createCard),
);

productionRoutes.patch(
  '/cards/:id',
  requireRole('admin', 'production'),
  asyncHandler(updateCard),
);

productionRoutes.delete(
  '/cards/:id',
  requireRole('admin', 'production'),
  asyncHandler(deleteCard),
);
