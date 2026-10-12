// Trusted operator tool. Never expose this provisioning flow as an HTTP endpoint.
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline/promises');
const mfaService = require('../src/modules/auth/mfa.service');

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: node scripts/enroll-mfa.js <email>');
  if (!process.stdin.isTTY) throw new Error('Enrollment requires an interactive trusted operator session');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const enrollment = mfaService.createEnrollment(email);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tbi-mfa-'));
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const artifact = path.join(directory, 'authenticator.txt');
    await fs.writeFile(artifact, enrollment.otpauthUrl, { mode: 0o600, flag: 'wx' });
    process.stdout.write(`Private enrollment URI saved to ${artifact}\n`);
    process.stdout.write('Verify the account owner independently, then securely import this URI into their authenticator.\n');
    const code = await input.question('Enter the code from their authenticator to confirm enrollment: ');
    await mfaService.enroll(email, enrollment, code.trim());
    process.stdout.write('MFA enrollment complete.\n');
  } finally {
    input.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(() => {
  // Avoid logging provider errors or credentials. Existing factors are never replaced.
  process.stderr.write('Enrollment failed. Check configuration, account eligibility, and authenticator code.\n');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
