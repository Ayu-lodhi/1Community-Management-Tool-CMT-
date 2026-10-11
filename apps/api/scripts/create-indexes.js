import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Mongoose models
import '../src/modules/admin/admin.model.js';
import '../src/modules/attendance/attendance.model.js';
import '../src/modules/attendance/attendanceLink.model.js';
import '../src/modules/certificates/certificates.model.js';
import '../src/modules/profile/profile.model.js';
import '../src/modules/timesheets/timesheets.model.js';
import '../src/modules/announcements/announcements.model.js';
import '../src/modules/chat/chat.model.js';
import '../src/modules/notifications/notifications.model.js';

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('FATAL: MONGODB_URI environment variable is required.');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  if (!isDryRun) {
    await mongoose.connect(URI, { autoIndex: false });
    console.log(`Connected to MongoDB: ${mongoose.connection.host}`);
  } else {
    console.log('--- DRY RUN: No indexes will be created ---');
  }

  // Define correctness models first, then performance models
  const correctnessModels = [
    mongoose.models.User,
    mongoose.models.Attendance,
    mongoose.models.AttendanceLink,
    mongoose.models.Certificate,
    mongoose.models.Profile,
    mongoose.models.Timesheet
  ].filter(Boolean);

  const performanceModels = [
    mongoose.models.Announcement,
    mongoose.models.Chat,
    mongoose.models.Notification
  ].filter(Boolean);

  const allModels = [...correctnessModels, ...performanceModels];

  for (const model of allModels) {
    if (!model) continue;
    const indexes = model.schema.indexes();
    if (indexes.length === 0) continue;

    console.log(`Model: ${model.modelName}`);
    
    for (const index of indexes) {
      const keys = Object.keys(index[0]).join('_');
      const unique = index[1] && index[1].unique ? ' (Unique)' : '';
      const sparse = index[1] && index[1].sparse ? ' (Sparse)' : '';
      console.log(`  - Index: ${keys}${unique}${sparse}`);
    }

    if (!isDryRun) {
      await model.createIndexes();
      console.log(`  [Created/Verified]`);
    }
  }

  if (!isDryRun) {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  if (!isDryRun) mongoose.disconnect();
  process.exit(1);
});
