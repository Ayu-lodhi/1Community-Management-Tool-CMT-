'use strict';

const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const hrProfileSchema = Joi.object({
  department: Joi.string().pattern(objectIdPattern).allow(null, '').optional(),
  post:       Joi.string().pattern(objectIdPattern).allow(null, '').optional(),
  category:   Joi.string().pattern(objectIdPattern).allow(null, '').optional(),
  joiningDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null, '').optional(),
  notes:      Joi.string().max(2000).allow('').optional(),
}).options({ allowUnknown: false });

module.exports = {
  hrProfileSchema,
};
