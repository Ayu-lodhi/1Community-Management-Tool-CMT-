import { Router } from 'express';
import { getUsersById } from './users.controller.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';

const router = Router();

router.get('/:id', authenticate, getUsersById);

export default router;
