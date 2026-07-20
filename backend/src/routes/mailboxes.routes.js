import { Router } from 'express';
import {
  listMailboxes,
  createMailbox,
  updateMailbox,
  deleteMailbox,
} from '../controllers/mailboxes.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const mailboxesRoutes = Router();

// Ownership is enforced per row inside the controller: an agent manages their
// own, a manager their team's, an admin anyone's.
mailboxesRoutes.use(requireAuth);

mailboxesRoutes.get('/', asyncHandler(listMailboxes));
mailboxesRoutes.post('/', asyncHandler(createMailbox));
mailboxesRoutes.patch('/:id', asyncHandler(updateMailbox));
mailboxesRoutes.delete('/:id', asyncHandler(deleteMailbox));
