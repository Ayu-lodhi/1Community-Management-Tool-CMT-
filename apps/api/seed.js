const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/modules/admin/admin.model');

console.log('Loaded MONGODB_URI:', process.env.MONGODB_URI ? 'YES ' : 'NO ');

const seed = async () => {
  try {
    console.log(' Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(' Connected to MongoDB Atlas');

    await User.deleteMany({});
    console.log(' Cleared existing users');

    const bcrypt = require('bcryptjs');
    await User.create([
      { name: 'Shrey Mehra',     email: 'super@tbi.org',    password: await bcrypt.hash('super123', 12),    role: 'SUPER_ADMIN',  mustChangePassword: false },
      { name: 'Rajesh Kumar',    email: 'admin@tbi.org',    password: await bcrypt.hash('admin123', 12),    role: 'ADMIN',        mustChangePassword: false },
      { name: 'Mayank',          email: 'mayank@tbi.org',   password: await bcrypt.hash('mayank123', 12),   role: 'T3_EXECUTIVE', mustChangePassword: false },
      { name: 'Abhishek Singh',  email: 'abhishek@tbi.org', password: await bcrypt.hash('abhishek123', 12), role: 'T2_ASSOCIATE', mustChangePassword: false },
      { name: 'Ayush',           email: 'ayush@tbi.org',    password: await bcrypt.hash('ayush123', 12),    role: 'T1_VOLUNTEER', mustChangePassword: false },
    ]);

    console.log(' Seeded 5 users:');
    console.log('   Shrey Mehra    / super@tbi.org    / super123     (Super Admin)');
    console.log('   Rajesh Kumar   / admin@tbi.org    / admin123     (Admin)');
    console.log('   Mayank         / mayank@tbi.org   / mayank123    (T3 Executive)');
    console.log('   Abhishek Singh / abhishek@tbi.org / abhishek123  (T2 Associate)');
    console.log('   Ayush          / ayush@tbi.org    / ayush123     (T1 Volunteer)');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
};

seed();