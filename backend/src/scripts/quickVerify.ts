import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Overall process timeout to guarantee no hanging executions
const TIMEOUT_MS = 15000;
const safetyTimer = setTimeout(() => {
  console.error(`Verification timed out after ${TIMEOUT_MS / 1000} seconds.`);
  prisma.$disconnect().finally(() => process.exit(1));
}, TIMEOUT_MS);
safetyTimer.unref();

async function run() {
  console.log('=== RAILWAY POSTGRESQL VERIFICATION REPORT ===\n');

  try {
    // 1. Confirm migration status
    console.log('--- 1. Migration History (_prisma_migrations) ---');
    const migrations = await prisma.$queryRaw<
      Array<{
        id: string;
        migration_name: string;
        finished_at: Date | null;
        applied_steps_count: number;
      }>
    >`
      SELECT id, migration_name, finished_at, applied_steps_count 
      FROM "_prisma_migrations" 
      ORDER BY started_at ASC;
    `;
    migrations.forEach((m) => {
      console.log(`Migration: ${m.migration_name} | Finished: ${m.finished_at} | Steps: ${m.applied_steps_count}`);
    });

    // 2. Check application tables
    console.log('\n--- 2. Application Tables ---');
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    tables.forEach((t) => console.log(`Table: ${t.table_name}`));

    // 3. Check CHECK constraints
    console.log('\n--- 3. Required CHECK Constraints ---');
    const checks = await prisma.$queryRaw<
      Array<{ table_name: string; constraint_name: string; check_clause: string }>
    >`
      SELECT tc.table_name, tc.constraint_name, cc.check_clause 
      FROM information_schema.table_constraints tc 
      JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name 
      WHERE tc.constraint_schema = 'public' 
        AND tc.constraint_type = 'CHECK'
        AND tc.constraint_name IN ('snack_quantity_non_negative', 'snack_threshold_non_negative', 'activity_amount_positive')
      ORDER BY tc.table_name;
    `;
    checks.forEach((c) => {
      console.log(`Table: ${c.table_name} | Constraint: ${c.constraint_name} | Clause: ${c.check_clause}`);
    });

    // 4. Check Foreign Keys on Activity
    console.log('\n--- 4. Activity Foreign Keys & Delete Rules ---');
    const fks = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string; foreign_table: string; delete_rule: string }>
    >`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, rc.delete_rule 
      FROM information_schema.table_constraints tc 
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name 
      JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name 
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name 
      WHERE tc.constraint_schema = 'public' AND tc.table_name = 'Activity'
      ORDER BY kcu.column_name;
    `;
    fks.forEach((fk) => {
      console.log(`Activity.${fk.column_name} -> ${fk.foreign_table} | ON DELETE: ${fk.delete_rule}`);
    });

    // 5. Check Indexes on the 5 application tables
    console.log('\n--- 5. Indexes on Application Tables ---');
    const indexes = await prisma.$queryRaw<
      Array<{ tablename: string; indexname: string; indexdef: string }>
    >`
      SELECT tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename IN ('User', 'Snack', 'Vote', 'Activity', 'IdempotencyKey')
      ORDER BY tablename, indexname;
    `;
    indexes.forEach((idx) => {
      console.log(`Table: ${idx.tablename} | Index: ${idx.indexname} | Def: ${idx.indexdef}`);
    });

    console.log('\n==============================================');
    console.log('       VERIFICATION COMPLETED SUCCESSFULLY    ');
    console.log('==============================================');
  } catch (error: any) {
    const safeError = (error.message || '').replace(/postgresql:\/\/[^@]+@/g, 'postgresql://***:***@');
    console.error('Verification query failed:', safeError);
    process.exitCode = 1;
  } finally {
    clearTimeout(safetyTimer);
    await prisma.$disconnect();
    process.exit(process.exitCode || 0);
  }
}

run();
