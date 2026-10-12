if (process.env.NODE_ENV === 'production') {
  console.error('FATAL: reset-demo-users cannot be executed in production environment.');
  process.exit(1);
}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('FATAL: MONGODB_URI environment variable is required.');
  process.exit(1);
}

// Ensure database host is local unless explicitly allowed
const getMongoHost = (uri) => {
  try {
    const match = uri.match(/mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?([^/:?]+)/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
};

const allowedHosts = ['localhost', '127.0.0.1', 'mongodb', 'tbi_mongo'];
const host = getMongoHost(URI);
if (process.env.ALLOW_NON_LOCAL_DEMO_RESET !== 'yes') {
  if (!host || !allowedHosts.includes(host)) {
    console.error(
      `FATAL: reset-demo-users can only target local MongoDB (${allowedHosts.join(', ')}). Target host is '${host || 'unknown'}'. Set ALLOW_NON_LOCAL_DEMO_RESET=yes to override.`
    );
    process.exit(1);
  }
}

const requireDemoPassword = (roleKey, nameKey) => {
  const val = process.env[`DEMO_PASSWORD_${roleKey}`] || process.env[`DEMO_PASSWORD_${nameKey}`];
  if (!val) {
    console.error(`FATAL: Missing required environment variable DEMO_PASSWORD_${roleKey} or DEMO_PASSWORD_${nameKey}`);
    process.exit(1);
  }
  return val;
};

const demoAccounts = [
  { email: 'super@tbi.org', pass: requireDemoPassword('SUPER_ADMIN', 'SUPER'), name: 'Shrey Mehra', role: 'SUPER_ADMIN' },
  { email: 'admin@tbi.org', pass: requireDemoPassword('ADMIN', 'ADMIN'), name: 'Rajesh Kumar', role: 'ADMIN' },
  { email: 'mayank@tbi.org', pass: requireDemoPassword('T3_EXECUTIVE', 'T3'), name: 'Mayank', role: 'T3_EXECUTIVE' },
  { email: 'abhishek@tbi.org', pass: requireDemoPassword('T2_ASSOCIATE', 'T2'), name: 'Abhishek Singh', role: 'T2_ASSOCIATE' },
  { email: 'ayush@tbi.org', pass: requireDemoPassword('T1_VOLUNTEER', 'T1'), name: 'Ayush', role: 'T1_VOLUNTEER' },
];

async function resetDemoAccounts() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(URI);
  const usersCol = mongoose.connection.collection('users');

  for (const acc of demoAccounts) {
    const hash = await bcrypt.hash(acc.pass, 12);
    const res = await usersCol.updateOne(
      { email: acc.email },
      {
        $set: {
          name: acc.name,
          role: acc.role,
          password: hash,
          isActive: true,
          mustChangePassword: false,
          passwordChangeStartedAt: null,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    console.log(`Updated ${acc.email} (Matched: ${res.matchedCount}, Upserted: ${res.upsertedCount})`);
  }

  await mongoose.disconnect();
  console.log('Done!');
}

resetDemoAccounts().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
