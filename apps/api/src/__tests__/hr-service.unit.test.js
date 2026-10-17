const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';

const hrService = require('../modules/hr/hr.service');
const HrPerformanceFactor = require('../models/hr_PerformanceFactor.model');
const HrPerformanceReview = require('../models/hr_PerformanceReview.model');
const HrIncidentReport = require('../models/hr_IncidentReport.model');
const HrAttendancePolicy = require('../models/hr_AttendancePolicy.model');
const DailyAttendance = require('../models/DailyAttendance.model');
const User = require('../modules/admin/admin.model');
const Team = require('../modules/teams/teams.model');

const id = (char) => new mongoose.Types.ObjectId(char.repeat(24));

test('HR Service & Object Authorization Engine (Phase 2 Integration)', async (t) => {
  const memberAId = id('1'); // Belongs to Team A
  const memberBId = id('2'); // Belongs to Team B
  const teamAId = id('a');
  const teamBId = id('b');
  const leadAId = id('3'); // Leads Team A
  const leadBId = id('4'); // Leads Team B
  const adminId = id('5');

  const mockMemberA = {
    _id: memberAId,
    name: 'Diya Sen',
    email: 'diya@incubator.org',
    role: 'T1_VOLUNTEER',
    teamId: teamAId,
    isActive: true,
  };

  const mockMemberB = {
    _id: memberBId,
    name: 'Rohan Sharma',
    email: 'rohan@incubator.org',
    role: 'T2_ASSOCIATE',
    teamId: teamBId,
    isActive: true,
  };

  const mockLeadA = {
    sub: leadAId.toString(),
    _id: leadAId,
    name: 'T3 Lead Ananya',
    role: 'T3_EXECUTIVE',
  };

  const mockLeadB = {
    sub: leadBId.toString(),
    _id: leadBId,
    name: 'T3 Lead Vikram',
    role: 'T3_EXECUTIVE',
  };

  const mockAdmin = {
    sub: adminId.toString(),
    _id: adminId,
    name: 'Platform Admin',
    role: 'ADMIN',
  };

  const mockTeamA = {
    _id: teamAId,
    name: 'Robotics Team A',
    leadId: leadAId,
    members: [memberAId],
  };

  const mockTeamB = {
    _id: teamBId,
    name: 'Fintech Team B',
    leadId: leadBId,
    members: [memberBId],
  };

  const mockFactors = [
    { _id: id('f'), name: 'Code Quality', benchmarkScore: 10, weight: 3, isActive: true },
    { _id: id('e'), name: 'Punctuality', benchmarkScore: 10, weight: 1, isActive: true },
  ];

  await t.test('1. Performance Factor Master CRUD: Admin creates and updates factors', async () => {
    t.mock.method(HrPerformanceFactor, 'create', async (doc) => ({
      _id: id('f'),
      ...doc,
    }));

    const factor = await hrService.createFactor({
      name: 'System Architecture',
      benchmarkScore: 10,
      weight: 3,
      actor: mockAdmin,
    });

    assert.equal(factor.name, 'System Architecture');
    assert.equal(factor.weight, 3);
  });

  await t.test('2. Attendance Policy: Admin updates penalty ratios and grace minutes', async () => {
    t.mock.method(HrAttendancePolicy, 'findOne', async () => ({
      key: 'GLOBAL',
      lateComingThreshold: 3,
      earlyGoingThreshold: 3,
    }));

    t.mock.method(HrAttendancePolicy, 'findOneAndUpdate', async (filter, update) => ({
      key: 'GLOBAL',
      ...update.$set,
    }));

    const updated = await hrService.updateAttendancePolicy({
      updates: { lateComingThreshold: 4, gracePeriodMinutes: 20 },
      actor: mockAdmin,
    });

    assert.equal(updated.lateComingThreshold, 4);
    assert.equal(updated.gracePeriodMinutes, 20);
  });

  await t.test('3. submitPerformanceReview: accurately calculates weighted score percentage', async () => {
    t.mock.method(User, 'findById', () => ({
      select: async () => ({ ...mockMemberA }),
    }));
    t.mock.method(Team, 'findById', () => ({
      select: async () => ({ ...mockTeamA }),
    }));
    t.mock.method(HrPerformanceFactor, 'find', async () => mockFactors);

    let savedReview = null;
    t.mock.method(HrPerformanceReview, 'findOneAndUpdate', async (filter, update) => {
      savedReview = update.$set;
      return { _id: id('9'), ...savedReview };
    });

    // Code Quality: 9/10 * 3 = 27 (max 30)
    // Punctuality:  8/10 * 1 = 8  (max 10)
    // Total max = 40, obtained = 35 -> 35/40 * 100 = 87.50%
    const review = await hrService.submitPerformanceReview({
      employeeId: memberAId,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      factorScores: [
        { factorName: 'Code Quality', obtainedScore: 9 },
        { factorName: 'Punctuality', obtainedScore: 8 },
      ],
      notes: 'Excellent technical ownership',
      reviewer: mockLeadA,
    });

    assert.equal(review.maxWeightedScore, 40);
    assert.equal(review.obtainedWeightedScore, 35);
    assert.equal(review.netScorePercentage, 87.5);
    assert.equal(savedReview.employeeName, 'Diya Sen');
  });

  await t.test('4. IDOR DEFENSE: T3 Lead A attempting to review Member B is strictly blocked (even with spoofed teamId)', async () => {
    // Member B belongs to Team B
    t.mock.method(User, 'findById', () => ({
      select: async () => ({ ...mockMemberB }),
    }));
    t.mock.method(Team, 'findById', () => ({
      select: async () => ({ ...mockTeamB }), // Team B lead is Lead B, not Lead A!
    }));

    // Lead A attempts to submit a review for Member B
    await assert.rejects(
      async () => {
        await hrService.submitPerformanceReview({
          employeeId: memberBId,
          fromDate: '2026-09-01',
          toDate: '2026-09-30',
          factorScores: [{ factorName: 'Code Quality', obtainedScore: 9 }],
          reviewer: mockLeadA, // Unauthorized lead!
        });
      },
      /Access denied/
    );

    // Lead A attempts to log an incident for Member B
    await assert.rejects(
      async () => {
        await hrService.createIncidentReport({
          employeeId: memberBId,
          title: 'Unauthorized Note',
          narrative: 'Testing cross-team boundary',
          feedbackType: 'NEGATIVE',
          actor: mockLeadA,
        });
      },
      /Access denied/
    );
  });

  await t.test('5. PRIVACY SCOPING: Member cannot view peer reviews; Lead can only view led team members', async () => {
    t.mock.method(HrPerformanceReview, 'find', () => ({
      sort: async () => [{ employeeName: 'Diya Sen', netScorePercentage: 87.5 }],
    }));

    t.mock.method(User, 'findById', () => ({
      select: async () => ({ ...mockMemberA }),
    }));
    t.mock.method(Team, 'findById', () => ({
      select: async () => ({ ...mockTeamA }),
    }));

    // 1. Member A can view own review history
    const selfReviews = await hrService.getEmployeePerformanceHistory({
      employeeId: memberAId,
      requester: { sub: memberAId.toString(), role: 'T1_VOLUNTEER' },
    });
    assert.equal(selfReviews.length, 1);

    // 2. Member A attempting to view Member B review history is blocked
    await assert.rejects(
      async () => {
        await hrService.getEmployeePerformanceHistory({
          employeeId: memberBId,
          requester: { sub: memberAId.toString(), role: 'T1_VOLUNTEER' },
        });
      },
      /Access denied/
    );

    // 3. Lead A can view Member A review history
    const leadReviews = await hrService.getEmployeePerformanceHistory({
      employeeId: memberAId,
      requester: mockLeadA,
    });
    assert.equal(leadReviews.length, 1);

    // 4. Lead A attempting to view Member B review history is blocked
    t.mock.method(User, 'findById', () => ({
      select: async () => ({ ...mockMemberB }),
    }));
    t.mock.method(Team, 'findById', () => ({
      select: async () => ({ ...mockTeamB }),
    }));

    await assert.rejects(
      async () => {
        await hrService.getEmployeePerformanceHistory({
          employeeId: memberBId,
          requester: mockLeadA,
        });
      },
      /Access denied/
    );
  });

  await t.test('6. getTeamAttendanceExceptions: aggregates DailyAttendance and flags chronic tardiness', async () => {
    t.mock.method(Team, 'findById', () => {
      const q = Promise.resolve({ ...mockTeamA });
      q.select = () => q;
      return q;
    });
    t.mock.method(User, 'find', () => ({
      select: async () => [mockMemberA],
    }));
    t.mock.method(HrAttendancePolicy, 'findOne', async () => ({
      lateComingThreshold: 3,
      lateComingPenaltyDays: 0.5,
      earlyGoingThreshold: 3,
      earlyGoingPenaltyDays: 0.5,
    }));

    // Mock 4 days of attendance: 3 LATE, 1 PRESENT
    t.mock.method(DailyAttendance, 'find', async () => [
      { userId: memberAId, status: 'LATE' },
      { userId: memberAId, status: 'LATE' },
      { userId: memberAId, status: 'LATE' },
      { userId: memberAId, status: 'PRESENT' },
    ]);

    const result = await hrService.getTeamAttendanceExceptions({
      teamId: teamAId,
      month: '2026-10',
      requester: mockLeadA,
    });

    assert.equal(result.members.length, 1);
    const memberEntry = result.members[0];
    assert.equal(memberEntry.daysPresent, 4);
    assert.equal(memberEntry.lateCount, 3);
    assert.equal(memberEntry.penaltyDays, 0.5);
    assert.equal(memberEntry.netAttendedDays, 3.5);
    assert.equal(memberEntry.isChronicTardy, true, '3 lates >= threshold 3 must flag chronic tardiness');
  });

  await t.test('7. CSV Exports: neutralizes formula injection prefixes and outputs valid CSV', async () => {
    t.mock.method(Team, 'findById', () => {
      const q = Promise.resolve({ ...mockTeamA });
      q.select = () => q;
      return q;
    });

    t.mock.method(HrPerformanceReview, 'find', () => ({
      sort: async () => [
        {
          _id: 'rev1',
          employeeName: '=cmd|/C calc.exe', // Formula injection attempt!
          fromDate: '2026-09-01',
          toDate: '2026-09-30',
          maxWeightedScore: 50,
          obtainedWeightedScore: 45,
          netScorePercentage: 90.0,
          reviewerName: 'T3 Lead Ananya',
          notes: '+SUM(A1:A10)', // Injection attempt in notes!
        },
      ],
    }));

    const csv = await hrService.exportTeamReviewsCsv({
      teamId: teamAId,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      requester: mockLeadA,
    });

    assert.ok(csv.includes('Review ID,Employee Name,From Date,To Date'));
    assert.ok(csv.includes("'=cmd|/C calc.exe"), 'Formula starting with = must be prepended with single quote');
    assert.ok(csv.includes("'+SUM(A1:A10)"), 'Formula starting with + must be prepended with single quote');
    assert.ok(csv.includes('90.00%'));
  });

  await t.test('8. Incident Resolution: updates resolution notes and marks incident resolved', async () => {
    const mockIncident = {
      _id: id('8'),
      employeeId: memberAId,
      teamId: teamAId,
      isResolved: false,
      save: async function () {
        return this;
      },
    };

    t.mock.method(HrIncidentReport, 'findById', async () => mockIncident);
    t.mock.method(User, 'findById', () => ({
      select: async () => ({ ...mockMemberA }),
    }));
    t.mock.method(Team, 'findById', () => ({
      select: async () => ({ ...mockTeamA }),
    }));

    const resolved = await hrService.resolveIncidentReport({
      incidentId: id('8'),
      resolutionNotes: 'Completed remedial safety workshop',
      actor: mockLeadA,
    });

    assert.equal(resolved.isResolved, true);
    assert.equal(resolved.resolutionNotes, 'Completed remedial safety workshop');
    assert.equal(resolved.resolvedBy.toString(), leadAId.toString());
  });
});
