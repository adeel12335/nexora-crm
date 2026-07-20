import { Router } from 'express';
import {
  listRates,
  updateUserRate,
  rateHistory,
  setManagerCut,
  deleteManagerCut,
  getTeam,
} from '../controllers/commissions.controller.js';
import { getEarnings, getCycle, listPendingCommissions, postCommissions } from '../controllers/clients.controller.js';
import {
  listCyclePolicies,
  createCyclePolicy,
  listCycleOverrides,
  createCycleOverride,
  deleteCycleOverride,
} from '../controllers/cyclePolicy.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const commissionsRoutes = Router();

commissionsRoutes.use(requireAuth);

commissionsRoutes.get('/cycle', requireRole('admin', 'manager', 'agent'), asyncHandler(getCycle));
commissionsRoutes.get(
  '/earnings',
  requireRole('admin', 'manager', 'agent'),
  asyncHandler(getEarnings)
);
commissionsRoutes.get('/pending', requireRole('admin'), asyncHandler(listPendingCommissions));
commissionsRoutes.post('/post', requireRole('admin'), asyncHandler(postCommissions));

commissionsRoutes.get('/cycle-policy', requireRole('admin'), asyncHandler(listCyclePolicies));
commissionsRoutes.post('/cycle-policy', requireRole('admin'), asyncHandler(createCyclePolicy));
commissionsRoutes.get('/cycle-overrides', requireRole('admin'), asyncHandler(listCycleOverrides));
commissionsRoutes.post('/cycle-overrides', requireRole('admin'), asyncHandler(createCycleOverride));
commissionsRoutes.delete(
  '/cycle-overrides/:id',
  requireRole('admin'),
  asyncHandler(deleteCycleOverride)
);

commissionsRoutes.get('/team', requireRole('admin', 'manager'), asyncHandler(getTeam));

commissionsRoutes.get('/rates', requireRole('admin'), asyncHandler(listRates));
commissionsRoutes.get('/rates/:userId/history', requireRole('admin'), asyncHandler(rateHistory));
commissionsRoutes.patch('/rates/:userId', requireRole('admin'), asyncHandler(updateUserRate));
commissionsRoutes.put('/overrides', requireRole('admin'), asyncHandler(setManagerCut));
commissionsRoutes.delete(
  '/overrides/:managerId/:agentId',
  requireRole('admin'),
  asyncHandler(deleteManagerCut)
);
