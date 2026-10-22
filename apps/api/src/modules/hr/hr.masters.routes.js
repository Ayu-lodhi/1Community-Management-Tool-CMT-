const express = require('express');
const { protect, restrictTo, requireAdminPermission } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  masterItemSchema,
  masterUpdateSchema,
  performanceFactorSchema,
  performanceFactorUpdateSchema,
} = require('./hr.masters.validator');
const { createMaster, listMasters, updateMaster, deleteMaster } = require('./hr.masters.controller');
const { hrWriteLimiter } = require('./hr.middleware');

const router = express.Router();

// All HR routes require authentication
router.use(protect);

// Derive the right Joi schema based on the master type
function pickSchema(baseSchema, pfSchema) {
  return (req, res, next) => {
    req._schema = req.params.type === 'performance-factors' ? pfSchema : baseSchema;
    next();
  };
}

function validateDynamic(req, res, next) {
  if (!req._schema) return next();
  const { error } = req._schema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details.map((d) => d.message).join(', '),
    });
  }
  next();
}

// GET /api/v1/hr/masters/:type  — T3 read + ADMIN/SUPER_ADMIN read
router.get(
  '/masters/:type',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  listMasters
);

// POST /api/v1/hr/masters/:type  — ADMIN/SUPER_ADMIN write
router.post(
  '/masters/:type',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  requireAdminPermission('hr:masters_manage'),
  hrWriteLimiter,
  pickSchema(masterItemSchema, performanceFactorSchema),
  validateDynamic,
  createMaster
);

// PATCH /api/v1/hr/masters/:type/:id  — ADMIN/SUPER_ADMIN write
router.patch(
  '/masters/:type/:id',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  requireAdminPermission('hr:masters_manage'),
  hrWriteLimiter,
  pickSchema(masterUpdateSchema, performanceFactorUpdateSchema),
  validateDynamic,
  updateMaster
);

// DELETE /api/v1/hr/masters/:type/:id  — ADMIN/SUPER_ADMIN soft-delete
router.delete(
  '/masters/:type/:id',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  requireAdminPermission('hr:masters_manage'),
  hrWriteLimiter,
  deleteMaster
);

module.exports = router;
