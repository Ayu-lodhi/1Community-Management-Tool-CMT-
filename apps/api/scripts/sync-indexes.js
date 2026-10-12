require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tbi_db';

const models = [
  { name: 'User', model: require('../src/modules/admin/admin.model') },
  { name: 'Event', model: require('../src/modules/events/events.model') },
  { name: 'Team', model: require('../src/modules/teams/teams.model') },
  { name: 'Application', model: require('../src/modules/applications/applications.model') },
  { name: 'Attendance', model: require('../src/modules/attendance/attendance.model') },
  { name: 'AttendanceLink', model: require('../src/modules/attendance/attendanceLink.model') },
  { name: 'Certificate', model: require('../src/modules/certificates/certificates.model') },
  { name: 'Review', model: require('../src/modules/reviews/reviews.model') },
  { name: 'Notification', model: require('../src/modules/notifications/notifications.model') },
  { name: 'Timesheet', model: require('../src/modules/timesheets/timesheets.model') },
  { name: 'AuditLog', model: require('../src/models/AuditLog.model') },
];

async function syncAllIndexes() {
  console.log('Connecting to MongoDB for index sync:', MONGODB_URI.replace(/:([^:@]+)@/, ':****@'));
  await mongoose.connect(MONGODB_URI);
  console.log('Connected. Syncing indexes...');

  for (const { name, model } of models) {
    try {
      if (model && typeof model.syncIndexes === 'function') {
        await model.syncIndexes();
        console.log(`✓ [${name}] indexes synchronized successfully`);
      }
    } catch (err) {
      console.error(`✗ [${name}] index sync failed:`, err.message);
    }
  }

  await mongoose.disconnect();
  console.log('Index synchronization complete.');
}

if (require.main === module) {
  syncAllIndexes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error during index sync:', err.message);
      process.exit(1);
    });
}

module.exports = { syncAllIndexes };
