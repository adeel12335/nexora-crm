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

// Follow-ups are an outreach tool — only agents and managers keep them, and each
// person sees only their own (enforced per row in the controller).
followupsRoutes.use(requireAuth, requireRole('agent', 'manager'));

followupsRoutes.get('/', asyncHandler(listFollowUps));
followupsRoutes.post('/', asyncHandler(createFollowUp));
followupsRoutes.patch('/:id', asyncHandler(updateFollowUp));
followupsRoutes.delete('/:id', asyncHandler(deleteFollowUp));
