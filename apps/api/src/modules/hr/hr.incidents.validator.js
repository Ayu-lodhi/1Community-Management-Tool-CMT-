'use strict';

const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const createIncidentSchema = Joi.object({
  employeeId:   Joi.string().pattern(objectIdPattern).required(),
  teamId:       Joi.string().pattern(objectIdPattern).optional().allow(''), // Ignored for T3; optional for admin
  date:         Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  feedbackType: Joi.string().valid('POSITIVE', 'NEGATIVE', 'NEUTRAL').required(),
  title:        Joi.string().min(1).max(200).required(),
  narrative:    Joi.string().min(1).max(2000).required(),
  severity:     Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
}).options({ allowUnknown: false });

const updateIncidentSchema = Joi.object({
  title:     Joi.string().min(1).max(200).optional(),
  narrative: Joi.string().min(1).max(2000).optional(),
  severity:  Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
}).min(1).options({ allowUnknown: false });

const resolveIncidentSchema = Joi.object({
  resolutionNotes: Joi.string().max(1000).allow('').optional(),
}).options({ allowUnknown: false });

const deleteIncidentSchema = Joi.object({
  deletedReason: Joi.string().min(3).max(500).required(),
}).options({ allowUnknown: false });

module.exports = {
  createIncidentSchema,
  updateIncidentSchema,
  resolveIncidentSchema,
  deleteIncidentSchema,
};
