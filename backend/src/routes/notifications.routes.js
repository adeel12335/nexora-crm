import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from '../controllers/notifications.controller.js';

export const notificationsRoutes = Router();

notificationsRoutes.use(requireAuth);

notificationsRoutes.get('/', asyncHandler(listNotifications));
notificationsRoutes.get('/unread-count', asyncHandler(unreadCount));
notificationsRoutes.post('/read-all', asyncHandler(markAllRead));
notificationsRoutes.patch('/:id/read', asyncHandler(markRead));
