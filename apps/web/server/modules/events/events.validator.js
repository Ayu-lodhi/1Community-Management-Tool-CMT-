const Joi = require('joi');
const { ValidationError } = require('../../core/errors/typedErrors');

// Event editor fields plus the model's lifecycle status. Membership, counters
// and audit fields are managed by their dedicated server-side flows.
const updateEventSchema = Joi.object({
  title: Joi.string().min(3).max(200),
  date: Joi.string(),
  location: Joi.string().min(2).max(200),
  description: Joi.string().allow('').max(2000),
  headId: Joi.string().hex().length(24).allow('', null),
  status: Joi.string().valid('draft', 'published', 'closed'),
}).min(1).unknown(false).strict().required();

function validateEventUpdate(data) {
  const { error, value } = updateEventSchema.validate(data, { abortEarly: false });
  if (error) {
    throw new ValidationError(error.details.map((detail) => detail.message).join(', '));
  }
  // The editor sends an empty string when no head is selected.
  if (value.headId === '') return { ...value, headId: null };
  return value;
}

module.exports = { validateEventUpdate };
