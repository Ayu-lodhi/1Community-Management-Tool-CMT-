const hrService = require('./hr.service');

class HrController {
  // Factors Master
  async createFactor(req, res) {
    try {
      const factor = await hrService.createFactor({
        ...req.body,
        actor: req.user,
        ip: req.ip,
      });
      res.status(201).json({ success: true, data: factor });
    } catch (err) {
      const status = err.message.includes('authorized') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async listFactors(req, res) {
    try {
      const factors = await hrService.listFactors({ activeOnly: req.query.all !== 'true' });
      res.status(200).json({ success: true, data: factors });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateFactor(req, res) {
    try {
      const factor = await hrService.updateFactor({
        factorId: req.params.id,
        updates: req.body,
        actor: req.user,
        ip: req.ip,
      });
      res.status(200).json({ success: true, data: factor });
    } catch (err) {
      const status = err.message.includes('authorized') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async deleteFactor(req, res) {
    try {
      const factor = await hrService.deleteFactor({
        factorId: req.params.id,
        actor: req.user,
        ip: req.ip,
      });
      res.status(200).json({ success: true, data: factor });
    } catch (err) {
      const status = err.message.includes('authorized') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // Attendance Policy
  async getPolicy(req, res) {
    try {
      const policy = await hrService.getAttendancePolicy();
      res.status(200).json({ success: true, data: policy });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async updatePolicy(req, res) {
    try {
      const policy = await hrService.updateAttendancePolicy({
        updates: req.body,
        actor: req.user,
        ip: req.ip,
      });
      res.status(200).json({ success: true, data: policy });
    } catch (err) {
      const status = err.message.includes('authorized') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // Performance Reviews
  async submitReview(req, res) {
    try {
      const review = await hrService.submitPerformanceReview({
        ...req.body,
        reviewer: req.user,
        ip: req.ip,
      });
      res.status(201).json({ success: true, data: review });
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async getTeamReviews(req, res) {
    try {
      const { teamId } = req.params;
      const { fromDate, toDate } = req.query;
      const data = await hrService.getTeamPerformanceReviews({
        teamId,
        fromDate,
        toDate,
        requester: req.user,
      });
      res.status(200).json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async getEmployeeReviews(req, res) {
    try {
      const { employeeId } = req.params;
      const reviews = await hrService.getEmployeePerformanceHistory({
        employeeId,
        requester: req.user,
      });
      res.status(200).json({ success: true, data: reviews });
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // Incident Reports
  async createIncident(req, res) {
    try {
      const incident = await hrService.createIncidentReport({
        ...req.body,
        actor: req.user,
        ip: req.ip,
      });
      res.status(201).json({ success: true, data: incident });
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async listEmployeeIncidents(req, res) {
    try {
      const { employeeId } = req.params;
      const { fromDate, toDate } = req.query;
      const incidents = await hrService.listEmployeeIncidents({
        employeeId,
        fromDate,
        toDate,
        requester: req.user,
      });
      res.status(200).json({ success: true, data: incidents });
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async listTeamIncidents(req, res) {
    try {
      const { teamId } = req.params;
      const { fromDate, toDate } = req.query;
      const incidents = await hrService.listTeamIncidents({
        teamId,
        fromDate,
        toDate,
        requester: req.user,
      });
      res.status(200).json({ success: true, data: incidents });
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async resolveIncident(req, res) {
    try {
      const { id } = req.params;
      const { resolutionNotes } = req.body;
      const incident = await hrService.resolveIncidentReport({
        incidentId: id,
        resolutionNotes,
        actor: req.user,
        ip: req.ip,
      });
      res.status(200).json({ success: true, data: incident });
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // Attendance Exceptions
  async getTeamAttendanceExceptions(req, res) {
    try {
      const { teamId } = req.params;
      const { month } = req.query;
      if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return res.status(400).json({ success: false, message: 'Valid month (YYYY-MM) is required' });
      }

      const exceptions = await hrService.getTeamAttendanceExceptions({
        teamId,
        month,
        requester: req.user,
      });
      res.status(200).json({ success: true, data: exceptions });
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // Exports
  async exportReviews(req, res) {
    try {
      const { teamId } = req.params;
      const { fromDate, toDate } = req.query;
      const csv = await hrService.exportTeamReviewsCsv({
        teamId,
        fromDate,
        toDate,
        requester: req.user,
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="reviews_${teamId}.csv"`);
      res.status(200).send(csv);
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async exportIncidents(req, res) {
    try {
      const { teamId } = req.params;
      const { fromDate, toDate } = req.query;
      const csv = await hrService.exportTeamIncidentsCsv({
        teamId,
        fromDate,
        toDate,
        requester: req.user,
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="incidents_${teamId}.csv"`);
      res.status(200).send(csv);
    } catch (err) {
      const status = err.message.includes('Access denied') ? 403 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }
}

module.exports = new HrController();
