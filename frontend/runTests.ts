import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import fs from 'fs';
import { spawn } from 'child_process';

function runScript(scriptPath: string): Promise<number> {
  const tsxCli = path.resolve(__dirname, '../backend/node_modules/tsx/dist/cli.mjs');
  const useLocalCli = fs.existsSync(tsxCli);
  const command = useLocalCli ? 'node' : 'npx';
  const args = useLocalCli ? [tsxCli, scriptPath] : ['tsx', scriptPath];

  return new Promise((resolve) => {
    const child = spawn(command, args, {
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

  console.log('\n>>> 5. RUNNING FRONTEND SNACK IMAGE STORAGE TESTS...\n');
  const code5 = await runScript('testFrontendImage.ts');
  if (code5 !== 0) {
    process.exit(code5);
  }

  console.log('\n================================================================');
  console.log('       ALL FRONTEND TESTS COMPLETED SUCCESSFULLY!                ');
  console.log('================================================================');
}

main();
