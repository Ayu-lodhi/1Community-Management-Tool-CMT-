const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const mongoose = require('mongoose');

const fixIndexes = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Helper to safely get indexes even if collection doesn't exist yet
    const getIndexes = async (coll) => {
      try {
        return await coll.indexes();
      } catch (err) {
        if (err.code === 26 || err.message.includes('ns does not exist')) {
          return [];
        }
        throw err;
      }
    };

    // Clean attendance indexes
    console.log('=== ATTENDANCES ===');
    const attColl = db.collection('attendances');
    const attIdx = await getIndexes(attColl);
    console.log('Current:', attIdx.map(i => i.name).join(', ') || '(empty)');

    const oldAttIdx = ['studentId_1_date_1', 'studentId_1_teamName_1_date_1'];
    await Promise.allSettled(
      oldAttIdx.map(async (name) => {
        try {
          await attColl.dropIndex(name);
          console.log('Dropped:', name);
        } catch (e) {
          if (e.code !== 27) console.log('Skip:', name);
        }
      })
    );

    try {
      await attColl.createIndex(
        { studentId: 1, teamId: 1, date: 1 },
        { unique: true, name: 'studentId_1_teamId_1_date_1' }
      );
      console.log('Created: studentId_1_teamId_1_date_1');
    } catch (e) {
      console.log('Index exists or error:', e.message);
    }

    // Clean timesheets indexes
    console.log('\n=== TIMESHEETS ===');
    const tsColl = db.collection('timesheets');
    const tsIdx = await getIndexes(tsColl);
    console.log('Current:', tsIdx.map(i => i.name).join(', ') || '(collection not created yet)');

    const oldTsIdx = ['userId_1_date_1'];
    await Promise.allSettled(
      oldTsIdx.map(async (name) => {
        try {
          await tsColl.dropIndex(name);
          console.log('Dropped:', name);
        } catch (e) {
          if (e.code !== 27) console.log('Skip:', name);
        }
      })
    );

    try {
      await tsColl.createIndex(
        { userId: 1, date: 1, startTime: 1 },
        { unique: true, name: 'userId_1_date_1_startTime_1' }
      );
      console.log('Created: userId_1_date_1_startTime_1');
    } catch (e) {
      console.log('Index exists or error:', e.message);
    }

    // Clean applications indexes (drop dupes)
    console.log('\n=== APPLICATIONS ===');
    const appColl = db.collection('applications');
    const appIdx = await getIndexes(appColl);
    console.log('Current:', appIdx.map(i => i.name).join(', ') || '(empty)');

    console.log('\n✅ All indexes cleaned');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

fixIndexes();
