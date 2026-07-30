import { Router } from 'express';
import {
  listFollowUps,
  createFollowUp,
  updateFollowUp,
  deleteFollowUp,
} from '../controllers/followups.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const followupsRoutes = Router();

followupsRoutes.use(requireAuth);

// Admin: read-only oversight of everyone's follow-ups.
// Agents/managers: full CRUD on their own rows.
followupsRoutes.get(
  '/',
  requireRole('admin', 'agent', 'manager'),
  asyncHandler(listFollowUps)
);
followupsRoutes.post('/', requireRole('agent', 'manager'), asyncHandler(createFollowUp));
followupsRoutes.patch('/:id', requireRole('agent', 'manager'), asyncHandler(updateFollowUp));
followupsRoutes.delete('/:id', requireRole('agent', 'manager'), asyncHandler(deleteFollowUp));
