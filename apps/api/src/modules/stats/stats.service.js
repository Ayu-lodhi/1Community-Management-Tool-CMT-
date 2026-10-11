const User = require('../admin/admin.model');
const Event = require('../events/events.model');
const Team = require('../teams/teams.model');
const Application = require('../applications/applications.model');
const Attendance = require('../attendance/attendance.model');
const Certificate = require('../certificates/certificates.model');

const today = () => new Date().toISOString().split('T')[0];

class StatsService {

  // Admin dashboard KPIs
  async getAdminStats() {
    const [
      totalUsers,
      activeEvents,
      totalApplications,
      approvedApplications,
      rejectedApplications,
      pendingApplications,
      totalCertificates,
      totalTeams,
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Event.countDocuments({ status: 'published' }),
      Application.countDocuments(),
      Application.countDocuments({ status: 'approved' }),
      Application.countDocuments({ status: 'rejected' }),
      Application.countDocuments({ status: 'pending' }),
      Certificate.countDocuments(),
      Team.countDocuments(),
    ]);

    const approvalRate = totalApplications > 0
      ? Math.round((approvedApplications / totalApplications) * 100)
      : 0;

    return {
      totalUsers,
      activeEvents,
      totalApplications,
      approvedApplications,
      rejectedApplications,
      pendingApplications,
      totalCertificates,
      totalTeams,
      approvalRate,
    };
  }

  // Users grouped by role/tier
  async getUsersByTier() {
    const result = await User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);

    const map = {
      T1_VOLUNTEER: 0,
      T2_ASSOCIATE: 0,
      T3_EXECUTIVE: 0,
      ADMIN: 0,
      SUPER_ADMIN: 0,
    };

    result.forEach((r) => {
      map[r._id] = r.count;
    });

    const total = Object.values(map).reduce((a, b) => a + b, 0);

    return {
      T1: map.T1_VOLUNTEER,
      T2: map.T2_ASSOCIATE,
      T3: map.T3_EXECUTIVE,
      Admin: map.ADMIN,
      SuperAdmin: map.SUPER_ADMIN,
      total,
    };
  }

  // Applications grouped by day for last 7 days
  async getApplicationsTrend() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const result = await Application.aggregate([
      { $match: { appliedAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$appliedAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Build last 7 days array
    const days = [];
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const found = result.find((r) => r._id === key);
      days.push({
        day: labels[d.getDay()],
        date: key,
        count: found ? found.count : 0,
      });
    }

    return days;
  }

  // Applications grouped by month for last 12 months
  async getMonthlyApplications() {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const result = await Application.aggregate([
      { $match: { appliedAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$appliedAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const months = [];
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const found = result.find((r) => r._id === key);
      months.push({
        month: labels[d.getMonth()],
        count: found ? found.count : 0,
      });
    }

    return months;
  }

  // Attendance stats for today
  async getAttendanceStats() {
    const date = today();
    const records = await Attendance.find({ date });

    const present = records.filter((r) => r.status === 'present').length;
    const late = records.filter((r) => r.status === 'late').length;
    const absent = records.filter((r) => r.status === 'absent').length;
    const total = records.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { present, late, absent, total, rate, date };
  }

  // T3 dashboard stats
  async getT3Stats(userId) {
    const [myTeams, myEvents] = await Promise.all([
      Team.find({ $or: [{ leadId: userId }, { members: userId }] }),
      Event.find({ $or: [{ headId: userId }, { members: userId }] }),
    ]);

    const myTeamIds = myTeams.map((t) => t._id);
    const myEventIds = myEvents.map((e) => e._id);

    const [pendingApps, approvedApps, attendanceToday] = await Promise.all([
      Application.countDocuments({
        eventId: { $in: myEventIds },
        status: 'pending',
      }),
      Application.countDocuments({
        eventId: { $in: myEventIds },
        status: 'approved',
      }),
      Attendance.countDocuments({
        date: today(),
        status: { $in: ['present', 'late'] },
      }),
    ]);

    return {
      myTeams: myTeams.length,
      myEvents: myEvents.length,
      eventsAsHead: myEvents.filter((e) => e.headId && e.headId.toString() === userId).length,
      pendingApps,
      approvedApps,
      attendanceToday,
    };
  }

  // T2 dashboard stats
  async getT2Stats(userId) {
    const [myApplications, myTeamCount, attendanceCount, certCount] = await Promise.all([
      Application.find({ studentId: userId }),
      Team.countDocuments({ members: userId }),
      Attendance.countDocuments({ studentId: userId, status: { $in: ['present', 'late'] } }),
      Certificate.countDocuments({ studentId: userId }),
    ]);

    return {
      myApplications: myApplications.length,
      approved: myApplications.filter((a) => a.status === 'approved').length,
      pending: myApplications.filter((a) => a.status === 'pending').length,
      rejected: myApplications.filter((a) => a.status === 'rejected').length,
      myTeams: myTeamCount,
      attendanceDays: attendanceCount,
      certificates: certCount,
    };
  }

  // T1 dashboard stats
  async getT1Stats(userId) {
    const [myApplications, attendanceCount, certCount, myTeams] = await Promise.all([
      Application.find({ studentId: userId }),
      Attendance.countDocuments({ studentId: userId, status: { $in: ['present', 'late'] } }),
      Certificate.countDocuments({ studentId: userId }),
      Team.countDocuments({ members: userId }),
    ]);

    const todayRecord = await Attendance.findOne({
      studentId: userId,
      date: today(),
    });

    return {
      myApplications: myApplications.length,
      approved: myApplications.filter((a) => a.status === 'approved').length,
      pending: myApplications.filter((a) => a.status === 'pending').length,
      rejected: myApplications.filter((a) => a.status === 'rejected').length,
      attendanceDays: attendanceCount,
      certificates: certCount,
      myTeams,
      todayCheckedIn: !!(todayRecord && todayRecord.checkInTime),
      todayCheckedOut: !!(todayRecord && todayRecord.checkOutTime),
      todayStatus: todayRecord?.status || null,
    };
  }

  // Top performers (based on approved applications + attendance)
  async getTopPerformers(limit = 5) {
    const result = await Application.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$studentId', name: { $first: '$studentName' }, approvedCount: { $sum: 1 } } },
      { $sort: { approvedCount: -1 } },
      { $limit: limit },
    ]);

    // Enrich with role + attendance
    const enriched = await Promise.all(
      result.map(async (r) => {
        const user = await User.findById(r._id).select('role');
        const attendanceCount = await Attendance.countDocuments({
          studentId: r._id,
          status: { $in: ['present', 'late'] },
        });
        return {
          userId: r._id,
          name: r.name,
          role: user?.role || 'T1_VOLUNTEER',
          approvedCount: r.approvedCount,
          attendanceCount,
          score: r.approvedCount * 10 + attendanceCount,
        };
      })
    );

    return enriched;
  }

  // Super Admin stats
  async getSuperAdminStats() {
    const [totalUsers, admins, activeEvents, sessionsToday] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'ADMIN', isActive: true }),
      Event.countDocuments({ status: 'published' }),
      Attendance.countDocuments({ date: today() }),
    ]);

    return {
      totalUsers,
      admins,
      activeEvents,
      sessionsToday,
    };
  }
}

module.exports = new StatsService();
