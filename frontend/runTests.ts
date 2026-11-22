import { spawn } from 'child_process';
import path from 'path';

function runScript(scriptPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', scriptPath], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' },
    });
    child.on('close', (code) => {
      resolve(code ?? 0);
    });
  });
}

async function main() {
  console.log('>>> 1. RUNNING FRONTEND STRICT RUNTIME CONFIG TESTS...\n');
  const code1 = await runScript('testRuntimeConfig.ts');
  if (code1 !== 0) {
    process.exit(code1);
  }

  console.log('\n>>> 2. RUNNING FRONTEND END-TO-END INTEGRATION TESTS...\n');
  const code2 = await runScript('testFrontendIntegration.ts');
  if (code2 !== 0) {
    process.exit(code2);
  }

  console.log('\n>>> 3. RUNNING FRONTEND WEBSOCKET & OPTIMISTIC UI TESTS...\n');
  const code3 = await runScript('testWebSocket.ts');
  if (code3 !== 0) {
    process.exit(code3);
  }

  console.log('\n>>> 4. RUNNING FRONTEND ADMIN ACTIVITY HISTORY TESTS...\n');
  const code4 = await runScript('testActivity.ts');
  if (code4 !== 0) {
    process.exit(code4);
  }

  console.log('\n================================================================');
  console.log('       ALL FRONTEND TESTS COMPLETED SUCCESSFULLY!                ');
  console.log('================================================================');
}

main();
