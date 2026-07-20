import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, deleteUser } from '../controllers/users.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const usersRoutes = Router();

usersRoutes.use(requireAuth);

// A manager needs to read the directory to pick people on their own screens;
// creating, editing and removing users stays with the admin.
usersRoutes.get('/', requireRole('admin', 'manager'), asyncHandler(listUsers));
usersRoutes.get('/:id', requireRole('admin', 'manager'), asyncHandler(getUser));

usersRoutes.post('/', requireRole('admin'), asyncHandler(createUser));
usersRoutes.patch('/:id', requireRole('admin'), asyncHandler(updateUser));
usersRoutes.delete('/:id', requireRole('admin'), asyncHandler(deleteUser));
