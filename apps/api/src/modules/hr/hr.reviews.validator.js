'use strict';

const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const reviewItemSchema = Joi.object({
  factorId:       Joi.string().pattern(objectIdPattern).allow(null, '').optional(),
  factorName:     Joi.string().min(1).max(100).required(),
  benchmarkScore: Joi.number().min(1).required(),
  weight:         Joi.number().min(0).required(),
  obtainedScore:  Joi.number().min(0).required(),
}).options({ allowUnknown: false });

const submitReviewSchema = Joi.object({
  employeeId: Joi.string().pattern(objectIdPattern).required(),
  teamId:     Joi.string().pattern(objectIdPattern).allow('', null).optional(),
  period:     Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
  items:      Joi.array().items(reviewItemSchema).min(1).required(),
  notes:      Joi.string().max(2000).allow('').optional(),
}).options({ allowUnknown: false });

module.exports = {
  submitReviewSchema,
};
