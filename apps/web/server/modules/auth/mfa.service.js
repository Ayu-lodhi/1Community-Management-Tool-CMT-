const { createCipheriv, createDecipheriv, randomBytes, randomUUID } = require('node:crypto');
const repository = require('./auth.repository');

const getOtplib = async () => {
  return await import('otplib');
};

const encryptionKey = () => {
  const key = process.env.MFA_ENCRYPTION_KEY || '4a09e55da348c11d7a876c866488955a18c08b9934e735e1f335b6fd2775fe76';
  if (!/^[a-f\d]{64}$/i.test(key || '')) throw new Error('MFA encryption key is not configured');
  return Buffer.from(key, 'hex');
};

const encrypt = (secret) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
};

const decrypt = (value) => {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
};

exports.createEnrollment = async (email) => {
  const { generateSecret, generateURI } = await getOtplib();
  const secret = generateSecret();
  return {
    otpauthUrl: generateURI({ issuer: 'TBI Platform', label: email, secret }),
    mfa: {
      secret: encrypt(secret), version: randomUUID(), lastStep: -1,
      attempts: 0, windowStartedAt: new Date(),
    },
  };
};

exports.verify = async (user, token) => {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) throw new Error('Invalid authenticator code');
  const attempt = await repository.reserveMfaAttempt(user._id, user.mfa.version);
  if (!attempt) throw new Error('Too many MFA attempts; try again in five minutes');
  const { verifySync } = await getOtplib();
  const result = verifySync({
    secret: decrypt(attempt.mfa.secret), token,
    epochTolerance: 30,
    afterTimeStep: attempt.mfa.lastStep >= 0 ? attempt.mfa.lastStep : undefined,
  });
  if (!result.valid) throw new Error('Invalid or already used authenticator code');
  const verified = await repository.consumeMfaCode(user, result.timeStep);
  if (!verified) throw new Error('MFA verification expired; sign in again');
  return verified;
};

exports.enroll = async (email, enrollment, code) => {
  const { requiresMfa } = require('./auth.tokens');
  const user = await repository.findByEmail(email);
  if (!user?.isActive || user.mfa || !(await requiresMfa(user.role))) {
    throw new Error('Account is not eligible for enrollment');
  }
  const { verifySync } = await getOtplib();
  const result = verifySync({ secret: decrypt(enrollment.mfa.secret), token: code, epochTolerance: 30 });
  if (!result.valid) throw new Error('Invalid authenticator code');
  const enrolled = await repository.enrollMfa(user._id, user.role, {
    ...enrollment.mfa, lastStep: result.timeStep,
  });
  if (!enrolled) throw new Error('Account enrollment changed; retry');
};
