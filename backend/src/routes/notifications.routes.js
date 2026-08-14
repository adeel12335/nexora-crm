import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  listNotifications,
  unreadCount,
  unreadCards,
  markRead,
  markAllRead,
  markCardRead,
} from '../controllers/notifications.controller.js';

export const notificationsRoutes = Router();

notificationsRoutes.use(requireAuth);

notificationsRoutes.get('/', asyncHandler(listNotifications));
notificationsRoutes.get('/unread-count', asyncHandler(unreadCount));
notificationsRoutes.get('/unread-cards', asyncHandler(unreadCards));
notificationsRoutes.post('/read-all', asyncHandler(markAllRead));
notificationsRoutes.post('/read-card/:cardId', asyncHandler(markCardRead));
notificationsRoutes.patch('/:id/read', asyncHandler(markRead));
