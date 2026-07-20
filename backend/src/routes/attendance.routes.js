import { Router } from 'express';
import {
  getToday,
  checkIn,
  checkOut,
  updateProgress,
  getMyMonth,
  getTeam,
  getMemberAttendance,
} from '../controllers/attendance.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const attendanceRoutes = Router();

attendanceRoutes.use(requireAuth);

attendanceRoutes.get('/today', requireRole('agent', 'manager'), asyncHandler(getToday));
attendanceRoutes.post('/check-in', requireRole('agent', 'manager'), asyncHandler(checkIn));
attendanceRoutes.post('/check-out', requireRole('agent', 'manager'), asyncHandler(checkOut));
attendanceRoutes.patch('/progress', requireRole('agent', 'manager'), asyncHandler(updateProgress));
attendanceRoutes.get('/me', requireRole('agent', 'manager'), asyncHandler(getMyMonth));
attendanceRoutes.get('/team', requireRole('admin', 'manager'), asyncHandler(getTeam));
attendanceRoutes.get(
  '/team/:userId',
  requireRole('admin', 'manager'),
  asyncHandler(getMemberAttendance)
);
