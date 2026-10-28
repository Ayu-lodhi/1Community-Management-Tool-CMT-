const Joi = require('joi');

const masterItemSchema = Joi.object({
  name:        Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).allow('').optional(),
  isActive:    Joi.boolean().optional(),
}).options({ allowUnknown: false });

const masterUpdateSchema = Joi.object({
  name:        Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).allow('').optional(),
  isActive:    Joi.boolean().optional(),
}).options({ allowUnknown: false });

const performanceFactorSchema = Joi.object({
  name:           Joi.string().min(1).max(100).required(),
  benchmarkScore: Joi.number().integer().min(1).required(),
  weight:         Joi.number().integer().min(1).required(),
  description:    Joi.string().max(500).allow('').optional(),
  isActive:       Joi.boolean().optional(),
}).options({ allowUnknown: false });

const performanceFactorUpdateSchema = Joi.object({
  name:           Joi.string().min(1).max(100).optional(),
  benchmarkScore: Joi.number().integer().min(1).optional(),
  weight:         Joi.number().integer().min(1).optional(),
  description:    Joi.string().max(500).allow('').optional(),
  isActive:       Joi.boolean().optional(),
}).options({ allowUnknown: false });

module.exports = {
  masterItemSchema,
  masterUpdateSchema,
  performanceFactorSchema,
  performanceFactorUpdateSchema,
};
