'use strict';

const express = require('express');
const { protect, requireAdminPermission } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  createIncidentSchema,
  updateIncidentSchema,
  resolveIncidentSchema,
  deleteIncidentSchema,
} = require('./hr.incidents.validator');
const {
  createIncident,
  listIncidents,
  getIncident,
  updateIncident,
  resolveIncident,
  deleteIncident,
} = require('./hr.incidents.controller');
const { requireHrRole, hrWriteLimiter } = require('./hr.middleware');

const router = express.Router();

router.use(protect);
router.use(requireHrRole);

// GET /api/v1/hr/incidents
router.get(
  '/incidents',
  requireAdminPermission('hr:incidents_manage'),
  listIncidents
);

// POST /api/v1/hr/incidents
router.post(
  '/incidents',
  requireAdminPermission('hr:incidents_manage'),
  hrWriteLimiter,
  validate(createIncidentSchema),
  createIncident
);

// GET /api/v1/hr/incidents/:id
router.get(
  '/incidents/:id',
  requireAdminPermission('hr:incidents_manage'),
  getIncident
);

// PATCH /api/v1/hr/incidents/:id
router.patch(
  '/incidents/:id',
  requireAdminPermission('hr:incidents_manage'),
  hrWriteLimiter,
  validate(updateIncidentSchema),
  updateIncident
);

// POST /api/v1/hr/incidents/:id/resolve
router.post(
  '/incidents/:id/resolve',
  requireAdminPermission('hr:incidents_manage'),
  hrWriteLimiter,
  validate(resolveIncidentSchema),
  resolveIncident
);

// DELETE /api/v1/hr/incidents/:id  (Soft delete with reason)
router.delete(
  '/incidents/:id',
  requireAdminPermission('hr:incidents_manage'),
  hrWriteLimiter,
  validate(deleteIncidentSchema),
  deleteIncident
);

module.exports = router;
