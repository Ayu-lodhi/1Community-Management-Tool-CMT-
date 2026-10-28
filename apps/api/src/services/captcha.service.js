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

const CHAR_GLYPHS = {
  A: 'M 2 22 L 9 2 L 16 22 M 5 14 L 13 14',
  B: 'M 3 2 L 11 2 C 15 2 15 11 11 11 L 3 11 M 11 11 C 16 11 16 22 11 22 L 3 22 L 3 2',
  C: 'M 15 4 C 4 2 2 10 2 12 C 2 14 4 22 15 20',
  D: 'M 3 2 L 9 2 C 16 2 16 22 9 22 L 3 22 Z',
  E: 'M 15 2 L 3 2 L 3 22 L 15 22 M 3 12 L 12 12',
  F: 'M 15 2 L 3 2 L 3 22 M 3 12 L 12 12',
  G: 'M 15 4 C 4 2 2 10 2 12 C 2 14 4 22 15 22 L 15 12 L 9 12',
  H: 'M 3 2 L 3 22 M 15 2 L 15 22 M 3 12 L 15 12',
  J: 'M 14 2 L 14 17 C 14 22 7 23 4 19',
  K: 'M 3 2 L 3 22 M 14 2 L 3 12 L 14 22',
  L: 'M 3 2 L 3 22 L 15 22',
  M: 'M 2 22 L 2 2 L 9 14 L 16 2 L 16 22',
  N: 'M 3 22 L 3 2 L 15 22 L 15 2',
  P: 'M 3 22 L 3 2 L 10 2 C 15 2 15 12 10 12 L 3 12',
  Q: 'M 9 2 C 3 2 2 8 2 12 C 2 16 3 22 9 22 C 15 22 16 16 16 12 C 16 8 15 2 9 2 Z M 11 17 L 16 23',
  R: 'M 3 22 L 3 2 L 10 2 C 15 2 15 12 10 12 L 3 12 M 9 12 L 15 22',
  S: 'M 15 5 C 13 2 4 2 3 7 C 2 11 16 12 15 17 C 14 22 4 23 2 19',
  T: 'M 2 2 L 16 2 M 9 2 L 9 22',
  U: 'M 3 2 L 3 16 C 3 22 15 22 15 16 L 15 2',
  V: 'M 2 2 L 9 22 L 16 2',
  W: 'M 2 2 L 5 22 L 9 10 L 13 22 L 16 2',
  X: 'M 2 2 L 16 22 M 16 2 L 2 22',
  Y: 'M 2 2 L 9 12 L 16 2 M 9 12 L 9 22',
  Z: 'M 2 2 L 16 2 L 2 22 L 16 22',
  2: 'M 2 6 C 3 1 15 1 15 7 C 15 13 2 16 2 22 L 16 22',
  3: 'M 2 2 L 15 2 L 8 10 C 15 10 16 22 2 22',
  4: 'M 12 22 L 12 2 L 2 14 L 16 14',
  5: 'M 15 2 L 3 2 L 3 10 C 6 8 15 9 15 16 C 15 22 6 23 2 19',
  6: 'M 14 4 C 6 2 2 9 2 15 C 2 21 8 23 14 20 C 17 18 16 11 12 11 C 6 11 3 14 3 17',
  7: 'M 2 2 L 16 2 L 7 22',
  8: 'M 9 2 C 4 2 4 11 9 11 C 14 11 14 2 9 2 Z M 9 11 C 3 11 3 22 9 22 C 15 22 15 11 9 11 Z',
  9: 'M 3 19 C 11 21 15 14 15 8 C 15 2 9 0 3 3 C 0 5 1 12 5 12 C 11 12 14 9 14 6',
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

  // Vector glyph paths with rotation and jitter (prevents raw plaintext leakage in SVG)
  let paths = '';
  const startX = 16;
  const spacing = 26;
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const glyphPath = CHAR_GLYPHS[char] || CHAR_GLYPHS['A'];
    const x = startX + i * spacing + crypto.randomInt(-2, 3);
    const y = 12 + crypto.randomInt(-3, 4);
    const rot = crypto.randomInt(-18, 19);
    const color = colors[i % colors.length];
    paths += `<path d="${glyphPath}" stroke="${color}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(${x}, ${y}) rotate(${rot}, 9, 12)" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#0E2233;border-radius:8px;border:1.5px solid #1E3A52;display:block;">${lines}${dots}${paths}</svg>`;
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
