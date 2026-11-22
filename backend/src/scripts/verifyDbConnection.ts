import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Initiating database connection verification...');
  try {
    const result = await prisma.$queryRaw<
      Array<{
        current_database: string;
        current_user: string;
        version: string;
      }>
    >`SELECT current_database(), current_user, version();`;

    if (result && result.length > 0) {
      const info = result[0];
      console.log('\n--- Database Connection Verified Successfully ---');
      console.log(`Database Name     : ${info.current_database}`);
      console.log(`Database User     : ${info.current_user}`);
      console.log(`PostgreSQL Version: ${info.version}`);
      console.log('--------------------------------------------------\n');
    } else {
      console.warn('Verification query executed but returned empty row set.');
    }
  } catch (error: any) {
    console.error('\nDatabase Connection Verification Failed:');
    // Redact any potential credentials if present in the error output
    const safeError = (error.message || '').replace(
      /postgresql:\/\/[^@]+@/g,
      'postgresql://***:***@'
    );
    console.error(safeError);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    console.log('Prisma Client disconnected cleanly.');
  }
}

main();
