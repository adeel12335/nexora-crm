import { Router } from 'express';
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  addPayment,
} from '../controllers/clients.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const clientsRoutes = Router();

clientsRoutes.use(requireAuth);

// Agent/manager: read own / team clients + payments. Admin: full access.
clientsRoutes.get('/', requireRole('admin', 'manager', 'agent'), asyncHandler(listClients));
clientsRoutes.get('/:id', requireRole('admin', 'manager', 'agent'), asyncHandler(getClient));

clientsRoutes.post('/', requireRole('admin'), asyncHandler(createClient));
clientsRoutes.patch('/:id', requireRole('admin'), asyncHandler(updateClient));
clientsRoutes.post('/:id/payments', requireRole('admin'), asyncHandler(addPayment));
