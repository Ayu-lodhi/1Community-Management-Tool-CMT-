const Joi = require('joi');

const createEventSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  date: Joi.string().required(),
  location: Joi.string().min(2).max(200).required(),
  description: Joi.string().allow('').max(2000),
  // Accept empty string OR valid ObjectId
  headId: Joi.string().allow('', null).optional(),
  // Members array — optional
  memberIds: Joi.array().items(Joi.string()).optional(),
});

const validate = (schema) => (req, res, next) => {
  if (!schema) return next();
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details.map((d) => d.message).join(', '),
    });
  }
  next();
};

// E: Phone — empty string allowed (phone is optional), but non-empty must be a plausible
//    phone number: digits, spaces, +, -, (, ), max 20 chars after normalisation.
const phoneSchema = Joi.string()
  .allow('', null)
  .optional()
  .max(20)
  .pattern(/^[0-9 +\-().]*$/)
  .messages({
    'string.pattern.base': '"phone" must contain only digits, spaces, +, -, (, ) and be at most 20 characters',
    'string.max': '"phone" must be at most 20 characters',
  });

const addUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().max(254).required(),
  phone: phoneSchema,
  role: Joi.string().valid('T1_VOLUNTEER', 'T2_ASSOCIATE', 'T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN').optional(),
}).options({ allowUnknown: false }); // Fix G: reject extra keys (mass-assignment guard)

const bulkUserRowSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().max(254).required(),
  phone: phoneSchema,
  role: Joi.string().valid('T1_VOLUNTEER', 'T2_ASSOCIATE', 'T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN').optional(),
}).options({ allowUnknown: false });

const bulkUsersSchema = Joi.object({
  rows: Joi.array().items(bulkUserRowSchema).min(1).max(500).required(),
}).options({ allowUnknown: false });

const schemas = {
  createEvent: createEventSchema,
  addUser: addUserSchema,
  bulkUsers: bulkUsersSchema,
};

module.exports = {
  createEventSchema,
  addUserSchema,
  bulkUsersSchema,
  schemas,
  validate,
};

