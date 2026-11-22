import { spawn } from 'child_process';
import path from 'path';

function runScript(scriptPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', scriptPath], {
      stdio: 'inherit',
      shell: true,
      cwd: path.resolve(__dirname, '../../'),
      env: { ...process.env, NODE_ENV: 'test' },
    });
    child.on('close', (code) => {
      resolve(code ?? 0);
    });
  });
}

async function main() {
  console.log('>>> RUNNING PHASE 3 AUTHENTICATION TEST SUITE...\n');
  const authCode = await runScript('src/tests/authTestSuite.ts');
  if (authCode !== 0) {
    console.error('\n❌ Authentication test suite failed with exit code', authCode);
    process.exit(authCode);
  }

  console.log('\n>>> RUNNING PHASE 2 CORE API REGRESSION TEST SUITE...\n');
  const apiCode = await runScript('src/tests/apiTestSuite.ts');
  if (apiCode !== 0) {
    console.error('\n❌ Core API regression test suite failed with exit code', apiCode);
    process.exit(apiCode);
  }

  console.log('\n>>> RUNNING PHASE 5 WEBSOCKET & REALTIME TEST SUITE...\n');
  const wsCode = await runScript('src/tests/websocketTestSuite.ts');
  if (wsCode !== 0) {
    console.error('\n❌ WebSocket & Realtime test suite failed with exit code', wsCode);
    process.exit(wsCode);
  }

  console.log('\n>>> RUNNING PHASE 6 ADMIN ACTIVITY HISTORY TEST SUITE...\n');
  const actCode = await runScript('src/tests/activityTestSuite.ts');
  if (actCode !== 0) {
    console.error('\n❌ Admin Activity History test suite failed with exit code', actCode);
    process.exit(actCode);
  }

  console.log('\n================================================================');
  console.log('       ALL SUITES (AUTH + CORE APIS) COMPLETED SUCCESSFULLY!     ');
  console.log('================================================================');
}

main();
