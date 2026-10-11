const crypto = require('crypto');
const Certificate = require('./certificates.model');
const { enqueueCertificateGeneration } = require('../../core/queues/queue.service');

exports.getMyCertificates = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const hasExplicitLimit = req.query.limit !== undefined;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || (hasExplicitLimit ? 50 : 200)));
    const skip = (page - 1) * limit;

    const [certs, total] = await Promise.all([
      Certificate.find({ studentId: req.user.sub }).sort({ issuedAt: -1 }).skip(skip).limit(limit).lean(),
      Certificate.countDocuments({ studentId: req.user.sub }),
    ]);

    res.json({
      success: true,
      data: certs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllCertificates = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const hasExplicitLimit = req.query.limit !== undefined;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || (hasExplicitLimit ? 50 : 200)));
    const skip = (page - 1) * limit;

    const [certs, total] = await Promise.all([
      Certificate.find().sort({ issuedAt: -1 }).skip(skip).limit(limit).lean(),
      Certificate.countDocuments(),
    ]);

    res.json({
      success: true,
      data: certs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
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

    // Enqueue certificate PDF generation in background worker
    try {
      await enqueueCertificateGeneration({
        certificateId: certId,
        studentId,
        studentName,
        eventId,
        eventTitle,
        role,
        requestId: req.id || req.headers?.['x-request-id'] || null,
      });
    } catch (queueErr) {
      // Do not block certificate issuance response if worker queue is temporarily unavailable
    }

    res.status(201).json({ success: true, message: 'Certificate issued', data: cert });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
