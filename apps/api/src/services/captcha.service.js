const crypto = require('crypto');
const Captcha = require('../models/Captcha.model');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateRandomCode = (length = 5) => {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHARS[crypto.randomInt(0, CHARS.length)];
  }
  return code;
};

const generateCaptchaSvg = (code) => {
  const width = 160;
  const height = 48;
  const colors = ['#E5B558', '#FFFFFF', '#67E8F9', '#FCD34D'];

  // Random noise lines across the image
  let lines = '';
  for (let i = 0; i < 4; i++) {
    const x1 = crypto.randomInt(0, width);
    const y1 = crypto.randomInt(0, height);
    const x2 = crypto.randomInt(0, width);
    const y2 = crypto.randomInt(0, height);
    const stroke = i % 2 === 0 ? '#38BDF8' : '#F59E0B';
    const opacity = (crypto.randomInt(30, 60) / 100).toFixed(2);
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1.5" opacity="${opacity}" />`;
  }

  // Random noise dots
  let dots = '';
  for (let i = 0; i < 25; i++) {
    const cx = crypto.randomInt(0, width);
    const cy = crypto.randomInt(0, height);
    const r = (crypto.randomInt(10, 20) / 10).toFixed(1);
    const fill = i % 2 === 0 ? '#CBD5E1' : '#E5B558';
    dots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.4" />`;
  }

  // Letters with jitter and rotation
  let letters = '';
  const startX = 18;
  const spacing = 26;
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const x = startX + i * spacing + crypto.randomInt(-2, 3);
    const y = 32 + crypto.randomInt(-4, 5);
    const rot = crypto.randomInt(-22, 23);
    const color = colors[i % colors.length];
    letters += `<text x="${x}" y="${y}" fill="${color}" font-size="24" font-weight="900" font-family="'Space Mono', 'Courier New', monospace" transform="rotate(${rot}, ${x}, ${y})" letter-spacing="2">${char}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#0E2233;border-radius:8px;border:1.5px solid #1E3A52;display:block;">${lines}${dots}${letters}</svg>`;
};

/**
 * Creates and persists a new CAPTCHA challenge in MongoDB with a 120-second TTL.
 */
const createCaptchaChallenge = async () => {
  const code = generateRandomCode(5);
  const captcha = await Captcha.create({ code });
  const svg = generateCaptchaSvg(code);

  return {
    captchaId: String(captcha._id),
    svg,
  };
};

module.exports = {
  createCaptchaChallenge,
  generateRandomCode,
  generateCaptchaSvg,
};
