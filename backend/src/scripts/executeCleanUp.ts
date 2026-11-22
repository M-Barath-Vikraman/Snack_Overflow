import { prisma } from '../config/database';

const TARGET_IDEMP_KEYS = [
  'dd19ef32-5946-4067-b405-9dc536842be3',
];

// Note: Vote 5bc3c9f0-08b1-4b5c-8d2c-2e750a4c83a8 was already unvoted, leaving 2 votes
const TARGET_VOTES = [
  '30d34981-0a4b-4308-a1a0-73330867851d',
  'ec4f190b-b641-4159-b28e-0faa64d354a1',
];

const TARGET_ACTIVITIES = [
  '0a142fa1-14e0-42b1-8107-a26989318fd3',
  '28284fdd-97bf-49ef-a43d-2b80590eb89d',
  '96e63231-39ae-4e33-979e-7b736ec67e6f',
  'a8ebe20c-de01-438a-a2b6-59c64f0da8dc',
  'c428fef0-7512-47bd-8793-1a0ddd1bfae0',
  'f9e21830-f338-48c1-b3e1-0abc4a7a324b',
];

const TARGET_SNACKS = [
  '18d7a3cc-610c-4e2f-a07c-cb3e0ab6f13e',
  '0ad6c6bb-0b53-4606-85d9-f01689e543e2',
  '78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a',
  'c98a1620-18e4-4cfb-bfbc-6a347e080d71',
  '2eebeae7-80ce-435d-b337-88fc19393a45',
  '6aad9bbc-3307-4b28-b7f9-894ae452e950',
  '37c95eaf-3875-4348-9fd8-f8f10358118b',
];

const TARGET_USERS = [
  'a358f5c6-38e9-472e-b8aa-e3835125fa32',
  '25d5155e-d278-490b-b26e-089797d28712',
  'e213a924-f551-4615-ba6b-60eb120bf07e',
  '0bf8ff47-a847-420e-bf29-4adaa40cc509',
  'b264b1ee-e2ad-461c-9bd5-1ab02a83e2ad',
  'f1a90fa1-331f-4d88-88c5-0008e345574f',
  '6a783c99-3442-4f68-91ef-fbe1dcc616ee',
  'b4352c17-db09-4cfd-8692-d80a1c496dc9',
];

const LEGITIMATE_EMAILS = [
  'admin@snackoverflow.com',
  'member@snackoverflow.com',
];

async function connectWithRetry(maxRetries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connecting to Railway PostgreSQL (attempt ${attempt}/${maxRetries})...`);
      await prisma.$connect();
      console.log('Successfully connected to database.\n');
      return;
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      console.warn(`Connection attempt ${attempt} failed (${err.message}). Retrying in ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function runCleanup() {
  console.log('================================================================');
  console.log('   SNACK OVERFLOW — APPROVED PHASE 4 TEST DATA CLEANUP          ');
  console.log('================================================================\n');

  try {
    await connectWithRetry();

    // -----------------------------------------------------------------
    // STEP 1: PRE-DELETION VERIFICATION
    // -----------------------------------------------------------------
    console.log('--- Step 1: Pre-Deletion Verification ---');

    // 1.1 Verify legitimate users exist
    const legitUsers = await prisma.user.findMany({
      where: { email: { in: LEGITIMATE_EMAILS } },
    });
    if (legitUsers.length !== 2) {
      throw new Error(`PRE-CHECK FAILED: Expected 2 legitimate accounts, found ${legitUsers.length}. Aborting.`);
    }
    console.log(`✔ Verified legitimate accounts: ${legitUsers.map((u) => u.email).join(', ')}`);

    // 1.2 Verify IdempotencyKey
    const idempRecords = await prisma.idempotencyKey.findMany({
      where: { id: { in: TARGET_IDEMP_KEYS } },
    });
    if (idempRecords.length !== TARGET_IDEMP_KEYS.length) {
      throw new Error(`PRE-CHECK FAILED: Expected ${TARGET_IDEMP_KEYS.length} idempotency keys, found ${idempRecords.length}. Aborting.`);
    }
    console.log(`✔ Verified ${idempRecords.length} target IdempotencyKey record(s) exist`);

    // 1.3 Verify Votes
    const voteRecords = await prisma.vote.findMany({
      where: { id: { in: TARGET_VOTES } },
    });
    if (voteRecords.length !== TARGET_VOTES.length) {
      throw new Error(`PRE-CHECK FAILED: Expected ${TARGET_VOTES.length} votes, found ${voteRecords.length}. Aborting.`);
    }
    console.log(`✔ Verified ${voteRecords.length} target Vote record(s) exist`);

    // 1.4 Verify Activities
    const activityRecords = await prisma.activity.findMany({
      where: { id: { in: TARGET_ACTIVITIES } },
    });
    if (activityRecords.length !== TARGET_ACTIVITIES.length) {
      throw new Error(`PRE-CHECK FAILED: Expected ${TARGET_ACTIVITIES.length} activities, found ${activityRecords.length}. Aborting.`);
    }
    console.log(`✔ Verified ${activityRecords.length} target Activity record(s) exist`);

    // 1.5 Verify Snacks
    const snackRecords = await prisma.snack.findMany({
      where: { id: { in: TARGET_SNACKS } },
    });
    if (snackRecords.length !== TARGET_SNACKS.length) {
      throw new Error(`PRE-CHECK FAILED: Expected ${TARGET_SNACKS.length} snacks, found ${snackRecords.length}. Aborting.`);
    }
    console.log(`✔ Verified ${snackRecords.length} target Snack record(s) exist`);

    // 1.6 Verify Users
    const userRecords = await prisma.user.findMany({
      where: { id: { in: TARGET_USERS } },
    });
    if (userRecords.length !== TARGET_USERS.length) {
      throw new Error(`PRE-CHECK FAILED: Expected ${TARGET_USERS.length} test users, found ${userRecords.length}. Aborting.`);
    }
    console.log(`✔ Verified ${userRecords.length} target User record(s) exist`);

    console.log('\nAll 25 target records pre-verified successfully. Proceeding with atomic transaction...\n');

    // -----------------------------------------------------------------
    // STEP 2: EXECUTE TRANSACTIONAL DELETION
    // -----------------------------------------------------------------
    console.log('--- Step 2: Atomic Transactional Deletion ---');

    await prisma.$transaction(
      async (tx) => {
        // 2.1 Delete IdempotencyKeys
        const delIdemp = await tx.idempotencyKey.deleteMany({
          where: { id: { in: TARGET_IDEMP_KEYS } },
        });
        if (delIdemp.count !== TARGET_IDEMP_KEYS.length) {
          throw new Error(`TX ABORT: IdempotencyKey deleted count ${delIdemp.count} != expected ${TARGET_IDEMP_KEYS.length}`);
        }
        console.log(`  [1/5] Deleted exactly ${delIdemp.count} IdempotencyKey record(s)`);

        // 2.2 Delete Votes
        const delVotes = await tx.vote.deleteMany({
          where: { id: { in: TARGET_VOTES } },
        });
        if (delVotes.count !== TARGET_VOTES.length) {
          throw new Error(`TX ABORT: Votes deleted count ${delVotes.count} != expected ${TARGET_VOTES.length}`);
        }
        console.log(`  [2/5] Deleted exactly ${delVotes.count} Vote record(s)`);

        // 2.3 Delete Activities (clearing ON DELETE RESTRICT foreign keys)
        const delActivities = await tx.activity.deleteMany({
          where: { id: { in: TARGET_ACTIVITIES } },
        });
        if (delActivities.count !== TARGET_ACTIVITIES.length) {
          throw new Error(`TX ABORT: Activity deleted count ${delActivities.count} != expected ${TARGET_ACTIVITIES.length}`);
        }
        console.log(`  [3/5] Deleted exactly ${delActivities.count} Activity record(s)`);

        // 2.4 Delete Snacks
        const delSnacks = await tx.snack.deleteMany({
          where: { id: { in: TARGET_SNACKS } },
        });
        if (delSnacks.count !== TARGET_SNACKS.length) {
          throw new Error(`TX ABORT: Snack deleted count ${delSnacks.count} != expected ${TARGET_SNACKS.length}`);
        }
        console.log(`  [4/5] Deleted exactly ${delSnacks.count} Snack record(s)`);

        // 2.5 Delete Users
        const delUsers = await tx.user.deleteMany({
          where: { id: { in: TARGET_USERS } },
        });
        if (delUsers.count !== TARGET_USERS.length) {
          throw new Error(`TX ABORT: User deleted count ${delUsers.count} != expected ${TARGET_USERS.length}`);
        }
        console.log(`  [5/5] Deleted exactly ${delUsers.count} User record(s)`);
      },
      {
        maxWait: 15000,
        timeout: 30000,
      }
    );

    console.log('\nTransaction committed successfully! Exactly 25 records deleted.\n');

    // -----------------------------------------------------------------
    // STEP 3: POST-CLEANUP VERIFICATION
    // -----------------------------------------------------------------
    console.log('--- Step 3: Post-Cleanup Verification ---');

    // 3.1 Verify legitimate users remain intact
    const remainingUsers = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true },
    });
    console.log(`Legitimate users remaining in database (${remainingUsers.length}):`);
    remainingUsers.forEach((u) => {
      console.log(`  - ${u.name} (${u.email}) [${u.role}] - ID: ${u.id}`);
    });
    if (remainingUsers.length !== 2 || !remainingUsers.every((u) => LEGITIMATE_EMAILS.includes(u.email))) {
      throw new Error('POST-CHECK WARNING: Legitimate users state unexpected!');
    }
    console.log('✔ Confirmed: Only the 2 legitimate users exist in the database.');

    // 3.2 Verify all approved test IDs are completely gone
    const [cIdemp, cVotes, cActivities, cSnacks, cUsers] = await Promise.all([
      prisma.idempotencyKey.count({ where: { id: { in: TARGET_IDEMP_KEYS } } }),
      prisma.vote.count({ where: { id: { in: TARGET_VOTES } } }),
      prisma.activity.count({ where: { id: { in: TARGET_ACTIVITIES } } }),
      prisma.snack.count({ where: { id: { in: TARGET_SNACKS } } }),
      prisma.user.count({ where: { id: { in: TARGET_USERS } } }),
    ]);

    if (cIdemp + cVotes + cActivities + cSnacks + cUsers === 0) {
      console.log('✔ Confirmed: All 25 approved test records are completely gone from the database.');
    } else {
      throw new Error(`POST-CHECK WARNING: Some test records still present (${cIdemp}, ${cVotes}, ${cActivities}, ${cSnacks}, ${cUsers})`);
    }

    // 3.3 Final Table Counts
    console.log('\n--- Step 4: Final Table Counts ---');
    const [finalSnackCount, finalUserCount, finalVoteCount, finalActivityCount, finalIdempCount] = await Promise.all([
      prisma.snack.count(),
      prisma.user.count(),
      prisma.vote.count(),
      prisma.activity.count(),
      prisma.idempotencyKey.count(),
    ]);

    console.log(`- Snack records:          ${finalSnackCount}`);
    console.log(`- User records:           ${finalUserCount}`);
    console.log(`- Vote records:           ${finalVoteCount}`);
    console.log(`- Activity records:       ${finalActivityCount}`);
    console.log(`- IdempotencyKey records: ${finalIdempCount}`);

    console.log('\n================================================================');
    console.log('               CLEANUP COMPLETED SUCCESSFULLY                   ');
    console.log('================================================================');
  } catch (err: any) {
    console.error('\n❌ Cleanup halted with error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

runCleanup();
