#!/usr/bin/env node
const path = require('path');

const resolveModule = (name) => {
  try {
    return require(name);
  } catch (_) {
    return require(path.resolve(__dirname, `../apps/api/node_modules/${name}`));
  }
};

const nodemailer = resolveModule('nodemailer');
const dotenv = resolveModule('dotenv');

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

const toIndex = process.argv.indexOf('--to');
const to = toIndex !== -1 ? process.argv[toIndex + 1] : process.env.EMAIL_TO;

if (!to) {
  console.error('Usage: node scripts/ses-send-test.js --to <recipient@example.com>');
  process.exit(1);
}

const crypto = require('crypto');

function deriveSesSmtpPassword(secretKey, region = 'ap-south-1') {
  const DATE = '11111111';
  const SERVICE = 'ses';
  const MESSAGE = 'SendRawEmail';
  const TERMINAL = 'aws4_request';
  const VERSION = Buffer.from([0x04]);

  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

  const kDate = hmac('AWS4' + secretKey, DATE);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, TERMINAL);
  const signature = hmac(kSigning, MESSAGE);

  return Buffer.concat([VERSION, signature]).toString('base64');
}

const region = process.env.AWS_REGION || 'ap-south-1';
const host = process.env.EMAIL_HOST || `email-smtp.${region}.amazonaws.com`;
const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
const user = process.env.EMAIL_USER || process.env.AWS_ACCESS_KEY_ID;
let pass = process.env.EMAIL_PASS;

if (!pass && process.env.AWS_SECRET_ACCESS_KEY) {
  pass = deriveSesSmtpPassword(process.env.AWS_SECRET_ACCESS_KEY, region);
} else if (pass && pass.length === 40 && !pass.startsWith('B')) {
  pass = deriveSesSmtpPassword(pass, region);
}

const from = process.env.EMAIL_FROM || process.env.SES_FROM_EMAIL || 'TBI-GEU <noreply@tbigeu.tech>';

async function run() {
  try {
    let transporter;
    if (host && user && pass) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { minVersion: 'TLSv1.2' },
      });
      console.log(`Connecting to SMTP server at ${host}:${port}...`);
    } else {
      console.log('EMAIL_HOST or credentials not set in local .env; creating Ethereal test account...');
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      console.log('Using Ethereal test account:', testAccount.user);
    }

    const mailHeaders = {};
    if (process.env.SES_CONFIGURATION_SET) {
      mailHeaders['X-SES-CONFIGURATION-SET'] = process.env.SES_CONFIGURATION_SET;
    }

    const info = await transporter.sendMail({
      from,
      to,
      subject: 'TBI Platform - SES SMTP Verification Test',
      text: 'This is a test message to verify email delivery from the TBI Platform.',
      html: '<p>This is a test message to verify email delivery from the <strong>TBI Platform</strong>.</p>',
      headers: Object.keys(mailHeaders).length > 0 ? mailHeaders : undefined,
    });

    console.log('Email sent successfully!');
    console.log('Message ID:', info.messageId);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('Preview URL:', previewUrl);
    }
  } catch (err) {
    console.error('Email send failed:', err.message);
    process.exit(1);
  }
}

run();
