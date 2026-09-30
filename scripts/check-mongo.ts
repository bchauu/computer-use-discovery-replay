import mongoose from 'mongoose';

for (const name of ['AUTOMATION_MONGODB_URI'] as const) {
  const uri = process.env[name];
  if (!uri) {
    console.error(`${name}: not configured`);
    process.exitCode = 1;
    continue;
  }
  const connection = mongoose.createConnection();
  try {
    await connection.openUri(uri, { serverSelectionTimeoutMS: 5000 });
    await connection.db!.admin().ping();
    console.info(`${name}: connection verified (no data written)`);
  } catch {
    console.error(`${name}: connection failed (connection details withheld)`);
    process.exitCode = 1;
  } finally {
    await connection.close();
  }
}

if (!process.env.BANK_MONGODB_URI?.trim()) {
  console.info('BANK_MONGODB_URI: not configured (expected; the synthetic bank uses bundled fixtures)');
}
