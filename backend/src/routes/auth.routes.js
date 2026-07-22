import { Router } from 'express';
import { login, me, updateProfile, changePassword } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const authRoutes = Router();

authRoutes.post('/login', asyncHandler(login));
authRoutes.get('/me', requireAuth, asyncHandler(me));
authRoutes.patch('/me', requireAuth, asyncHandler(updateProfile));
authRoutes.post('/change-password', requireAuth, asyncHandler(changePassword));
