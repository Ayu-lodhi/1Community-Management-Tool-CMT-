const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect, restrictTo } = require('../auth/auth.middleware');
const AuditLog = require('../../models/AuditLog.model');
const User = require('../admin/admin.model');

router.use(protect);
router.use(restrictTo('SUPER_ADMIN'));

// Get all audit logs with pagination and lean optimization
router.get('/audit-logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find().sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('SuperAdmin API Error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get active sessions
router.get('/sessions', async (req, res) => {
  try {
    const users = await User.find({ activeSessionId: { $ne: null } })
      .select('name email role tier lastActivity activeSessionId createdAt')
      .sort({ lastActivity: -1 });
    res.json({ success: true, data: users });
  } catch (err) {
    console.error('SuperAdmin API Error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Terminate an active session
router.delete('/sessions/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid User ID format' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { activeSessionId: null, lastActivity: null } },
      { new: true }
    ).select('name email role activeSessionId');
    
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await AuditLog.create({
      action: 'TERMINATE_SESSION',
      performedBy: req.user.sub,
      performedByName: req.user.name,
      targetId: user._id,
      targetType: 'User',
      ipAddress: req.ip || req.connection.remoteAddress,
      details: {
        email: user.email,
        role: user.role
      }
    });

    res.json({ success: true, message: 'Session terminated successfully', data: user });
  } catch (err) {
    console.error('SuperAdmin API Error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
