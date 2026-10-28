const service = require('./workforce.service');

const handleWorkforceError = (res, err) => {
  const status = err.statusCode || err.status || 500;
  res.status(status).json({ success: false, message: err.message });
};

// 1. Shifts
exports.createShiftTemplate = async (req, res) => {
  try {
    const data = await service.createShiftTemplate(req.body, req.user.sub);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.getShiftTemplates = async (req, res) => {
  try {
    const data = await service.getShiftTemplates(req.query.teamId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

// 2. Tasks
exports.createTask = async (req, res) => {
  try {
    const data = await service.createTask(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.getTasks = async (req, res) => {
  try {
    const data = await service.getTasks(req.query.teamId, req.query.status);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

// 3. Assignments
exports.createAssignment = async (req, res) => {
  try {
    const data = await service.createAssignment(req.body, req.user.sub);
    res.status(201).json({ success: true, message: 'Shift assigned successfully', data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.getTeamAssignments = async (req, res) => {
  try {
    const data = await service.getTeamAssignments(req.query.teamId, req.query.startDate, req.query.endDate);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.getMyAssignments = async (req, res) => {
  try {
    const data = await service.getMyAssignments(req.user.sub, req.query.startDate, req.query.endDate);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const data = await service.deleteAssignment(req.params.id, req.user);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

// 4. Attendance
exports.markManualAttendance = async (req, res) => {
  try {
    const data = await service.markManualAttendance(req.body, req.user);
    res.status(200).json({ success: true, message: 'Attendance marked', data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.markAllPresent = async (req, res) => {
  try {
    const data = await service.markAllPresent(req.body, req.user);
    res.status(200).json({ success: true, message: `Marked ${data.markedCount} present (${data.skippedCount} skipped)`, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.getAttendanceRegister = async (req, res) => {
  try {
    const data = await service.getAttendanceRegister(req.query, req.user);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.requestRegularization = async (req, res) => {
  try {
    const data = await service.requestRegularization(req.user.sub, req.body);
    res.status(200).json({ success: true, message: 'Regularization requested successfully', data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.reviewRegularization = async (req, res) => {
  try {
    const data = await service.reviewRegularization(req.params.id, req.body.status, req.body.reviewComment, req.user);
    res.status(200).json({ success: true, message: `Regularization ${req.body.status.toLowerCase()}`, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

// 5. Day Timesheets
exports.submitDayTimesheet = async (req, res) => {
  try {
    const data = await service.submitDayTimesheet(req.user.sub, req.body);
    res.status(201).json({ success: true, message: 'Timesheet submitted successfully', data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.getMyDayTimesheets = async (req, res) => {
  try {
    const data = await service.getMyDayTimesheets(req.user.sub, req.query.startDate, req.query.endDate);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.getTeamDayTimesheets = async (req, res) => {
  try {
    const data = await service.getTeamDayTimesheets(req.query.teamId, req.query.date, req.query.status);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.reviewDayTimesheet = async (req, res) => {
  try {
    const data = await service.reviewDayTimesheet(req.params.id, req.body.status, req.body.comment, req.user);
    res.status(200).json({ success: true, message: `Timesheet ${req.body.status.toLowerCase()}`, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

// 6. Month Lock
exports.lockMonth = async (req, res) => {
  try {
    const data = await service.lockMonth(req.body.month, req.user);
    res.status(200).json({ success: true, message: `Month ${req.body.month} locked`, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.unlockMonth = async (req, res) => {
  try {
    const data = await service.unlockMonth(req.body.month, req.body.reason, req.user);
    res.status(200).json({ success: true, message: `Month ${req.body.month} unlocked`, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

exports.getMonthLockStatus = async (req, res) => {
  try {
    const data = await service.getMonthLockStatus(req.query.month);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleWorkforceError(res, err);
  }
};

// 7. Export
exports.exportMonthlyRegister = async (req, res) => {
  try {
    const { csv, filename } = await service.exportMonthlyRegisterCSV(req.query, req.user);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err) {
    handleWorkforceError(res, err);
  }
};
