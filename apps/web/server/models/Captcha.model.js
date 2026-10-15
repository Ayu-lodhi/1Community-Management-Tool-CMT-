const mongoose = require('mongoose');

const captchaSchema = new mongoose.Schema({
  code: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 120 },
});

module.exports = mongoose.models.Captcha || mongoose.model('Captcha', captchaSchema);
