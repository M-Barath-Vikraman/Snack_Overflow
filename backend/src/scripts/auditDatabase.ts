import { prisma } from '../config/database';

async function connectWithRetry(maxRetries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connecting to Railway PostgreSQL (attempt ${attempt}/${maxRetries})...`);
      console.time('db_connect');
      await prisma.$connect();
      console.timeEnd('db_connect');
      console.log('Successfully connected to database.\n');
      return;
    } catch (err: any) {
      console.timeEnd('db_connect');
      if (attempt === maxRetries) throw err;
      console.warn(`Connection attempt ${attempt} failed (${err.message}). Retrying in ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('       SNACK OVERFLOW — LIGHTWEIGHT READ-ONLY DB AUDIT          ');
  console.log('================================================================\n');

  try {
    await connectWithRetry();

    // -------------------------------------------------------------
    // 1. Table Record Counts (Sequential to avoid connection contention)
    // -------------------------------------------------------------
    console.log('--- Step 1: Table Record Counts ---');
    
    console.time('count_snacks');
    const snackCount = await prisma.snack.count();
    console.timeEnd('count_snacks');

    console.time('count_users');
    const userCount = await prisma.user.count();
    console.timeEnd('count_users');

    console.time('count_votes');
    const voteCount = await prisma.vote.count();
    console.timeEnd('count_votes');

    console.time('count_activities');
    const activityCount = await prisma.activity.count();
    console.timeEnd('count_activities');

    console.time('count_idempotency_keys');
    const idempCount = await prisma.idempotencyKey.count();
    console.timeEnd('count_idempotency_keys');

    console.log(`\nTotals:`);
    console.log(`- Snack records:          ${snackCount}`);
    console.log(`- User records:           ${userCount}`);
    console.log(`- Vote records:           ${voteCount}`);
    console.log(`- Activity records:       ${activityCount}`);
    console.log(`- IdempotencyKey records: ${idempCount}\n`);

    // -------------------------------------------------------------
    // 2. Inspect All Snacks (lightweight select, up to 100)
    // -------------------------------------------------------------
    console.log('--- Step 2: All Snack Records ---');
    console.time('query_snacks');
    const snacks = await prisma.snack.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        quantity: true,
        lowStockThreshold: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    console.timeEnd('query_snacks');

    const testSnacks: typeof snacks = [];
    const legitSnacks: typeof snacks = [];

    for (const s of snacks) {
      // Identifying evidence: timestamp in name, "Test", "Race Packet", "FE Test"
      const isTest =
        /\d{10,}/.test(s.name) ||
        /test/i.test(s.name) ||
        /race packet/i.test(s.name) ||
        /hacked/i.test(s.name);

      if (isTest) {
        testSnacks.push(s);
      } else {
        legitSnacks.push(s);
      }
    }

    console.log(`Found ${legitSnacks.length} Legitimate Snack(s):`);
    legitSnacks.forEach((s) =>
      console.log(`  [LEGIT] ID: ${s.id} | Name: "${s.name}" | Qty: ${s.quantity} | Created: ${s.createdAt.toISOString()}`)
    );

    console.log(`\nFound ${testSnacks.length} Suspected Test Snack(s):`);
    testSnacks.forEach((s) =>
      console.log(`  [TEST]  ID: ${s.id} | Name: "${s.name}" | Qty: ${s.quantity} | Created: ${s.createdAt.toISOString()}`)
    );

    // -------------------------------------------------------------
    // 3. Inspect All Users (lightweight select, up to 100)
    // -------------------------------------------------------------
    console.log('\n--- Step 3: All User Records ---');
    console.time('query_users');
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    console.timeEnd('query_users');

    const testUsers: typeof users = [];
    const legitUsers: typeof users = [];

    for (const u of users) {
      // Identifying evidence: @snackoverflow.test domain or timestamp in email/name
      const isTest =
        u.email.endsWith('@snackoverflow.test') ||
        /\d{10,}/.test(u.email) ||
        /\d{10,}/.test(u.name) ||
        /test/i.test(u.name) ||
        /hacker/i.test(u.email);

      if (isTest) {
        testUsers.push(u);
      } else {
        legitUsers.push(u);
      }
    }

    console.log(`Found ${legitUsers.length} Legitimate User(s):`);
    legitUsers.forEach((u) =>
      console.log(`  [LEGIT] ID: ${u.id} | Email: "${u.email}" | Role: ${u.role} | Created: ${u.createdAt.toISOString()}`)
    );

    console.log(`\nFound ${testUsers.length} Suspected Test User(s):`);
    testUsers.forEach((u) =>
      console.log(`  [TEST]  ID: ${u.id} | Email: "${u.email}" | Role: ${u.role} | Created: ${u.createdAt.toISOString()}`)
    );

    // -------------------------------------------------------------
    // 4. Inspect Suspected Test Votes
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Votes Inspection ---');
    console.time('query_votes');
    const testSnackIds = testSnacks.map((s) => s.id);
    const testUserIds = testUsers.map((u) => u.id);

    const votes = await prisma.vote.findMany({
      select: {
        id: true,
        userId: true,
        snackId: true,
        createdAt: true,
      },
      take: 100,
    });
    console.timeEnd('query_votes');

    const testVotes = votes.filter(
      (v) => testSnackIds.includes(v.snackId) || testUserIds.includes(v.userId)
    );
    const legitVotes = votes.filter(
      (v) => !testSnackIds.includes(v.snackId) && !testUserIds.includes(v.userId)
    );

    console.log(`Total Votes: ${votes.length} (Legitimate: ${legitVotes.length}, Test-Linked: ${testVotes.length})`);
    testVotes.forEach((v) =>
      console.log(`  [TEST VOTE] ID: ${v.id} | User: ${v.userId} | Snack: ${v.snackId} | Created: ${v.createdAt.toISOString()}`)
    );

    // -------------------------------------------------------------
    // 5. Inspect Suspected Test Activities
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Activities Inspection ---');
    console.time('query_activities');
    const activities = await prisma.activity.findMany({
      select: {
        id: true,
        action: true,
        amount: true,
        userId: true,
        snackId: true,
        createdAt: true,
      },
      take: 100,
    });
    console.timeEnd('query_activities');

    const testActivities = activities.filter(
      (a) => testSnackIds.includes(a.snackId) || testUserIds.includes(a.userId)
    );
    const legitActivities = activities.filter(
      (a) => !testSnackIds.includes(a.snackId) && !testUserIds.includes(a.userId)
    );

    console.log(`Total Activities: ${activities.length} (Legitimate: ${legitActivities.length}, Test-Linked: ${testActivities.length})`);
    testActivities.forEach((a) =>
      console.log(`  [TEST ACTIVITY] ID: ${a.id} | Action: ${a.action} | Amount: ${a.amount} | User: ${a.userId} | Snack: ${a.snackId} | Created: ${a.createdAt.toISOString()}`)
    );

    // -------------------------------------------------------------
    // 6. Inspect Idempotency Keys
    // -------------------------------------------------------------
    console.log('\n--- Step 6: Idempotency Keys Inspection ---');
    console.time('query_idempotency_keys');
    const idempKeys = await prisma.idempotencyKey.findMany({
      select: {
        id: true,
        key: true,
        userId: true,
        createdAt: true,
        expiresAt: true,
      },
      take: 100,
    });
    console.timeEnd('query_idempotency_keys');

    console.log(`Total Idempotency Keys: ${idempKeys.length}`);
    idempKeys.forEach((k) =>
      console.log(`  [KEY] ID: ${k.id} | Key: "${k.key}" | User: ${k.userId} | Expires: ${k.expiresAt?.toISOString()}`)
    );

    console.log('\n================================================================');
    console.log('                   AUDIT EXECUTION COMPLETE                     ');
    console.log('================================================================');
  } catch (err) {
    console.error('Audit failed with error:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
