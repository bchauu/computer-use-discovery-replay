import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

mkdirSync('.local/mongo', { recursive: true });
// Isolated project database; does not touch an existing service on port 27017.
const child = spawn('mongod', [
  '--dbpath', '.local/mongo', '--port', '27018', '--bind_ip', '127.0.0.1',
], { stdio: 'inherit' });
child.on('error', () => {
  console.error('mongod is unavailable. Install MongoDB Community or configure dedicated hosted databases in .env.');
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 0; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
