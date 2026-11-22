import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('         DATABASE MIGRATION VERIFICATION (READ-ONLY)            ');
  console.log('================================================================');

  try {
    // 1. Verify Tables
    console.log('\n--- 1. Tables in Public Schema ---');
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    const tableNames = tables.map((t) => t.table_name);
    tableNames.forEach((name) => console.log(` [TABLE] ${name}`));

    const requiredTables = ['User', 'Snack', 'Vote', 'Activity', 'IdempotencyKey'];
    const missingTables = requiredTables.filter((t) => !tableNames.includes(t));
    if (missingTables.length > 0) {
      throw new Error(`Missing expected tables: ${missingTables.join(', ')}`);
    }
    console.log('✔ All 5 required application tables exist.');

    // 2. Verify Enums
    console.log('\n--- 2. Enums in Public Schema ---');
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      JOIN pg_namespace n ON n.oid = t.typnamespace 
      WHERE n.nspname = 'public' 
      ORDER BY t.typname, e.enumsortorder;
    `;
    const enumMap: Record<string, string[]> = {};
    enums.forEach((e) => {
      if (!enumMap[e.typname]) enumMap[e.typname] = [];
      enumMap[e.typname].push(e.enumlabel);
    });
    Object.entries(enumMap).forEach(([name, values]) => {
      console.log(` [ENUM] ${name}: ${values.join(', ')}`);
    });

    // 3. Verify CHECK Constraints
    console.log('\n--- 3. PostgreSQL CHECK Constraints ---');
    const checks = await prisma.$queryRaw<
      Array<{ table_name: string; constraint_name: string; check_clause: string }>
    >`
      SELECT tc.table_name, tc.constraint_name, cc.check_clause 
      FROM information_schema.table_constraints tc 
      JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name 
      WHERE tc.constraint_schema = 'public' AND tc.constraint_type = 'CHECK'
      ORDER BY tc.table_name, tc.constraint_name;
    `;
    checks.forEach((c) => {
      console.log(` [CHECK] Table: ${c.table_name} | Name: ${c.constraint_name} | Clause: ${c.check_clause}`);
    });

    const checkQuantity = checks.find((c) => c.constraint_name === 'snack_quantity_non_negative');
    const checkThreshold = checks.find((c) => c.constraint_name === 'snack_threshold_non_negative');
    const checkAmount = checks.find((c) => c.constraint_name === 'activity_amount_positive');

    if (!checkQuantity) throw new Error('Missing CHECK constraint: snack_quantity_non_negative');
    if (!checkThreshold) throw new Error('Missing CHECK constraint: snack_threshold_non_negative');
    if (!checkAmount) throw new Error('Missing CHECK constraint: activity_amount_positive');
    console.log('✔ All 3 required PostgreSQL CHECK constraints verified.');

    // 4. Verify Unique Constraints
    console.log('\n--- 4. Unique Constraints ---');
    const uniques = await prisma.$queryRaw<
      Array<{ table_name: string; constraint_name: string; column_name: string; ordinal_position: number }>
    >`
      SELECT tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc 
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name 
      WHERE tc.constraint_schema = 'public' AND tc.constraint_type = 'UNIQUE'
      ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
    `;
    const uniqueMap: Record<string, { table: string; columns: string[] }> = {};
    uniques.forEach((u) => {
      if (!uniqueMap[u.constraint_name]) {
        uniqueMap[u.constraint_name] = { table: u.table_name, columns: [] };
      }
      uniqueMap[u.constraint_name].columns.push(u.column_name);
    });
    Object.entries(uniqueMap).forEach(([name, info]) => {
      console.log(` [UNIQUE] Table: ${info.table} | Constraint: ${name} (${info.columns.join(', ')})`);
    });

    const voteUnique = Object.values(uniqueMap).find(
      (u) => u.table === 'Vote' && u.columns.includes('userId') && u.columns.includes('snackId')
    );
    const idempUnique = Object.values(uniqueMap).find(
      (u) => u.table === 'IdempotencyKey' && u.columns.includes('userId') && u.columns.includes('key')
    );

    if (!voteUnique) throw new Error('Missing Vote composite unique constraint on (userId, snackId)');
    if (!idempUnique) throw new Error('Missing IdempotencyKey composite unique constraint on (userId, key)');
    console.log('✔ Required unique constraints verified.');

    // 5. Verify Foreign Keys and ON DELETE Rules
    console.log('\n--- 5. Foreign Key Constraints and Delete Rules ---');
    const fks = await prisma.$queryRaw<
      Array<{
        table_name: string;
        constraint_name: string;
        column_name: string;
        foreign_table_name: string;
        foreign_column_name: string;
        delete_rule: string;
      }>
    >`
      SELECT 
        tc.table_name, 
        tc.constraint_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name, 
        ccu.column_name AS foreign_column_name, 
        rc.delete_rule 
      FROM information_schema.table_constraints tc 
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name 
      JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name 
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name 
      WHERE tc.constraint_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, tc.constraint_name;
    `;
    fks.forEach((fk) => {
      console.log(
        ` [FK] Table: ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name} | ON DELETE: ${fk.delete_rule}`
      );
    });

    const activityUserFk = fks.find((fk) => fk.table_name === 'Activity' && fk.column_name === 'userId');
    const activitySnackFk = fks.find((fk) => fk.table_name === 'Activity' && fk.column_name === 'snackId');

    if (!activityUserFk || activityUserFk.delete_rule !== 'RESTRICT') {
      throw new Error(`Activity.userId FK must be RESTRICT. Found: ${activityUserFk?.delete_rule}`);
    }
    if (!activitySnackFk || activitySnackFk.delete_rule !== 'RESTRICT') {
      throw new Error(`Activity.snackId FK must be RESTRICT. Found: ${activitySnackFk?.delete_rule}`);
    }
    console.log('✔ Activity foreign keys verified to use ON DELETE RESTRICT.');

    // 6. Verify Indexes
    console.log('\n--- 6. Indexes in Public Schema ---');
    const indexes = await prisma.$queryRaw<Array<{ tablename: string; indexname: string; indexdef: string }>>`
      SELECT tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      ORDER BY tablename, indexname;
    `;
    indexes.forEach((idx) => {
      console.log(` [INDEX] Table: ${idx.tablename} | Name: ${idx.indexname}`);
    });

    console.log('\n================================================================');
    console.log('       ALL VERIFICATION CHECKS PASSED SUCCESSFULLY              ');
    console.log('================================================================');
  } catch (err: any) {
    console.error('Verification failure:', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    console.log('Prisma Client disconnected cleanly.');
  }
}

main();
