import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { whatsappStatus, whatsappTest } from '../controllers/whatsapp.controller.js';

export const whatsappRoutes = Router();

whatsappRoutes.use(requireAuth, requireRole('admin'));

whatsappRoutes.get('/status', asyncHandler(whatsappStatus));
whatsappRoutes.post('/test', asyncHandler(whatsappTest));
