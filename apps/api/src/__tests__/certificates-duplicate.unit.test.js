const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.ALLOW_NO_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const certificatesController = require('../modules/certificates/certificates.controller');
const Certificate = require('../modules/certificates/certificates.model');

test('Certificates Duplicate Issuance Protection', async (t) => {
  const origFindOne = Certificate.findOne;
  const origCreate = Certificate.create;

  t.afterEach(() => {
    Certificate.findOne = origFindOne;
    Certificate.create = origCreate;
  });

  await t.test('issueCertificate rejects duplicate certificate for same student and event with 409', async () => {
    const studentId = new mongoose.Types.ObjectId().toString();
    const eventId = new mongoose.Types.ObjectId().toString();

    Certificate.findOne = async () => ({
      _id: new mongoose.Types.ObjectId(),
      certificateId: 'TBI-EXISTING1',
      studentId,
      eventId,
    });

    let statusCode = 200;
    let responseData = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { responseData = data; return this; },
    };

    const req = {
      body: {
        studentId,
        studentName: 'Alice Volunteer',
        eventId,
        eventTitle: 'Hackathon 2026',
        role: 'Participant',
      },
    };

    await certificatesController.issueCertificate(req, res);
    assert.strictEqual(statusCode, 409);
    assert.match(responseData.message, /already.*issued/i);
  });
});
