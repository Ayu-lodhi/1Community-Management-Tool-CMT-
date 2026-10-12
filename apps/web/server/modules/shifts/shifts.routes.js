import { Router } from 'express';
import { getShiftsById } from './shifts.controller.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';

const router = Router();

router.get('/:id', authenticate, getShiftsById);

export default router;
