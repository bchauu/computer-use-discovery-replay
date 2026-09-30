import { spawn } from 'node:child_process';

const commands = ['dev:automation-api', 'dev:bank-api', 'dev:operator', 'dev:bank'];
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    }
  }
}
if (process.platform === 'win32') {
  console.error('Use the four individual dev scripts in separate terminals on Windows.');
  process.exit(1);
}
for (const command of commands) {
  const child = spawn('npm', ['run', command], { stdio: 'inherit', detached: true });
  children.push(child);
  child.on('error', () => stop(1));
  child.on('exit', (code) => { if (!stopping) stop(code || 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
