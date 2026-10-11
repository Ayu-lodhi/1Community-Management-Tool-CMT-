// Middleware: verifyCaptcha.js
// Verifies Google reCAPTCHA v2 token server-side.
// Controlled by CAPTCHA_ENABLED env flag — set to 'false' to bypass (e.g., in tests).

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

const verifyCaptcha = async (req, res, next) => {
  // Bypass only if CAPTCHA is not explicitly enabled
  if (process.env.CAPTCHA_ENABLED !== 'true') {
    return next();
  }

  // Fail closed if CAPTCHA is enabled but secret key is missing / placeholder
  const hasValidSecret =
    process.env.RECAPTCHA_SECRET_KEY &&
    process.env.RECAPTCHA_SECRET_KEY !== 'REPLACE_WITH_YOUR_RECAPTCHA_SECRET_KEY';

  if (!hasValidSecret) {
    return res.status(500).json({
      success: false,
      message: 'Server configuration error: CAPTCHA is enabled but no valid secret key is provided.',
    });
  }

  const token = req.body['g-recaptcha-response'];

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'CAPTCHA verification is required. Please complete the CAPTCHA.',
    });
  }

  try {
    const params = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY || '',
      response: token,
      remoteip: req.ip || req.headers['x-forwarded-for'] || '',
    });

    const verifyRes = await fetch(`${RECAPTCHA_VERIFY_URL}?${params.toString()}`, {
      method: 'POST',
    });

    const data = await verifyRes.json();

    if (!data.success) {
      return res.status(400).json({
        success: false,
        message: 'CAPTCHA verification failed. Please try again.',
      });
    }

    next();
  } catch (err) {
    // Never log or expose the secret key
    return res.status(500).json({
      success: false,
      message: 'CAPTCHA service is temporarily unavailable. Please try again.',
    });
  }
};

module.exports = verifyCaptcha;
