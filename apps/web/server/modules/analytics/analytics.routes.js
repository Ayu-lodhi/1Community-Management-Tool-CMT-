import { Router } from 'express';
import { getAnalyticsById } from './analytics.controller.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';

const router = Router();

router.get('/:id', authenticate, getAnalyticsById);

export default router;
