import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, deleteUser } from '../controllers/users.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const usersRoutes = Router();

usersRoutes.use(requireAuth, requireRole('admin'));

usersRoutes.get('/', asyncHandler(listUsers));
usersRoutes.get('/:id', asyncHandler(getUser));
usersRoutes.post('/', asyncHandler(createUser));
usersRoutes.patch('/:id', asyncHandler(updateUser));
usersRoutes.delete('/:id', asyncHandler(deleteUser));
