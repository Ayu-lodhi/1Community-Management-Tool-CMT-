const { Department, Post, EmployeeCategory, PerformanceFactor } = require('./hr.masters.model');
const { recordHrAudit } = require('./hr.middleware');

const ALLOWED_MASTERS = Object.freeze({
  departments:           Department,
  posts:                 Post,
  'employee-categories': EmployeeCategory,
  'performance-factors': PerformanceFactor,
});

function getModel(type) {
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(ALLOWED_MASTERS, type)) {
    const err = new Error(`Unknown master type: ${type}`);
    err.statusCode = 400;
    throw err;
  }
  return ALLOWED_MASTERS[type];
}

// ADMIN/SUPER_ADMIN: create a master record
async function createMaster(req, res, next) {
  try {
    const Model = getModel(req.params.type);
    const doc = await Model.create(req.body);
    await recordHrAudit({
      performedBy: req.user?.sub || req.user?._id,
      performedByName: req.user?.name || req.user?.role,
      action: `HR_MASTER_CREATE_${req.params.type.toUpperCase().replace(/-/g, '_')}`,
      targetId: doc._id,
      targetType: 'HR_MASTER',
      details: { name: doc.name },
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A record with that name already exists.' });
    }
    next(err);
  }
}

// ADMIN/SUPER_ADMIN/T3: list active master records
async function listMasters(req, res, next) {
  try {
    const Model = getModel(req.params.type);
    const activeOnly = req.query.activeOnly !== 'false';
    const filter = activeOnly ? { isActive: true } : {};
    const docs = await Model.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: docs });
  } catch (err) {
    next(err);
  }
}

// ADMIN/SUPER_ADMIN: update a master record
async function updateMaster(req, res, next) {
  try {
    const Model = getModel(req.params.type);
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Record not found.' });
    await recordHrAudit({
      performedBy: req.user?.sub || req.user?._id,
      performedByName: req.user?.name || req.user?.role,
      action: `HR_MASTER_UPDATE_${req.params.type.toUpperCase().replace(/-/g, '_')}`,
      targetId: doc._id,
      targetType: 'HR_MASTER',
      details: { updates: req.body },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A record with that name already exists.' });
    }
    next(err);
  }
}

// ADMIN/SUPER_ADMIN: soft-delete (set isActive=false)
async function deleteMaster(req, res, next) {
  try {
    const Model = getModel(req.params.type);
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Record not found.' });
    await recordHrAudit({
      performedBy: req.user?.sub || req.user?._id,
      performedByName: req.user?.name || req.user?.role,
      action: `HR_MASTER_DELETE_${req.params.type.toUpperCase().replace(/-/g, '_')}`,
      targetId: doc._id,
      targetType: 'HR_MASTER',
      details: { name: doc.name },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

module.exports = { createMaster, listMasters, updateMaster, deleteMaster };
