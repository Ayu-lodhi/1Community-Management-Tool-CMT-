const crypto = require('crypto');
const Certificate = require('./certificates.model');

exports.getMyCertificates = async (req, res) => {
  try {
    const certs = await Certificate.find({ studentId: req.user.sub }).sort({ issuedAt: -1 });
    res.json({ success: true, data: certs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllCertificates = async (req, res) => {
  try {
    const certs = await Certificate.find().sort({ issuedAt: -1 });
    res.json({ success: true, data: certs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.issueCertificate = async (req, res) => {
  try {
    const { studentId, studentName, eventId, eventTitle, role } = req.body;
    const certId = 'TBI-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const cert = await Certificate.create({
      studentId,
      studentName,
      eventId,
      eventTitle,
      role,
      certificateId: certId,
    });

    res.status(201).json({ success: true, message: 'Certificate issued', data: cert });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
