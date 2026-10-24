const Captcha = require('../models/Captcha.model');

const verifyCaptcha = async (req, res, next) => {
  if (process.env.CAPTCHA_ENABLED === 'false') {
    return next();
  }

  const captchaId = req.body.captchaId;
  const captchaAnswer = req.body.captchaAnswer;

  if (!captchaId || !captchaAnswer) {
    return res.status(400).json({
      success: false,
      message: 'CAPTCHA verification is required. Please enter the code shown.',
    });
  }

  try {
    const normalized = String(captchaAnswer).trim().toUpperCase();
    const match = await Captcha.findOneAndDelete({
      _id: captchaId,
      code: normalized,
    });

    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired CAPTCHA code. Please click refresh and try again.',
      });
    }

    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired CAPTCHA. Please refresh and try again.',
    });
  }
};

module.exports = verifyCaptcha;
