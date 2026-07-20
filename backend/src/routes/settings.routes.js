import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getPortalSettings,
  updateWhatsAppSettings,
  testWhatsAppSettings,
} from '../controllers/settings.controller.js';

export const settingsRoutes = Router();

settingsRoutes.use(requireAuth, requireRole('admin'));

settingsRoutes.get('/', asyncHandler(getPortalSettings));
settingsRoutes.patch('/whatsapp', asyncHandler(updateWhatsAppSettings));
settingsRoutes.post('/whatsapp/test', asyncHandler(testWhatsAppSettings));
