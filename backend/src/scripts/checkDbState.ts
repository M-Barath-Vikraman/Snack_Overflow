import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking current database migration state...');
  try {
    // 1. Check existing tables in public schema
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;

    console.log(`Existing tables in public schema (${tables.length}):`);
    tables.forEach((t) => console.log(` - ${t.table_name}`));

    // 2. Check if _prisma_migrations table exists
    const hasMigrationsTable = tables.some((t) => t.table_name === '_prisma_migrations');
    if (hasMigrationsTable) {
      const migrations = await prisma.$queryRaw<
        Array<{
          id: string;
          migration_name: string;
          applied_steps_count: number;
          finished_at: Date | null;
        }>
      >`
        SELECT id, migration_name, applied_steps_count, finished_at 
        FROM "_prisma_migrations" 
        ORDER BY started_at ASC;
      `;
      console.log(`Applied Prisma migrations (${migrations.length}):`);
      migrations.forEach((m) =>
        console.log(` - ${m.migration_name} (steps: ${m.applied_steps_count}, finished: ${m.finished_at})`)
      );
    } else {
      console.log('No _prisma_migrations table found. Database is unmigrated.');
    }
  } catch (error: any) {
    console.error('Error checking database state:');
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
