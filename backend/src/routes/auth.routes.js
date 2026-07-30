import { Router } from 'express';
import {
  login,
  me,
  updateProfile,
  changePassword,
  switchUser,
  switchBack,
} from '../controllers/auth.controller.js';
import { requireAuth, requireRole, rejectIfImpersonating } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const authRoutes = Router();

authRoutes.post('/login', asyncHandler(login));
authRoutes.get('/me', requireAuth, asyncHandler(me));
authRoutes.patch('/me', requireAuth, asyncHandler(updateProfile));
authRoutes.post('/change-password', requireAuth, asyncHandler(changePassword));

authRoutes.post(
  '/switch-user',
  requireAuth,
  requireRole('admin'),
  rejectIfImpersonating,
  asyncHandler(switchUser)
);
authRoutes.post('/switch-back', requireAuth, asyncHandler(switchBack));
