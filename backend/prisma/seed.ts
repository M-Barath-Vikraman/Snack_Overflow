import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password';

const INITIAL_SNACKS = [
  {
    name: 'Dark Chocolate Almonds',
    category: 'SWEET' as const,
    quantity: 24,
    lowStockThreshold: 5,
  },
  {
    name: 'Wasabi Peas',
    category: 'SAVOURY' as const,
    quantity: 18,
    lowStockThreshold: 5,
  },
  {
    name: 'Sparkling Lime Water',
    category: 'DRINK' as const,
    quantity: 12,
    lowStockThreshold: 6,
  },
  {
    name: 'Roasted Seaweed Crisps',
    category: 'HEALTHY_ISH' as const,
    quantity: 15,
    lowStockThreshold: 4,
  },
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

export async function main() {
  console.log('================================================================');
  console.log('        SNACK OVERFLOW — SEED INITIAL INVENTORY & USERS         ');
  console.log('================================================================\n');

  await connectWithRetry();

  const adminPass = await hashPassword('AdminPassword123!');
  const memberPass = await hashPassword('MemberPassword123!');

  // 1. Seed / Ensure Admin User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@snackoverflow.com' },
    update: {}, // Preserve existing user details
    create: {
      name: 'Office Admin',
      email: 'admin@snackoverflow.com',
      password: adminPass,
      role: 'ADMIN',
    },
  });

  // 2. Seed / Ensure Member User
  const member = await prisma.user.upsert({
    where: { email: 'member@snackoverflow.com' },
    update: {}, // Preserve existing user details
    create: {
      name: 'Alex Member',
      email: 'member@snackoverflow.com',
      password: memberPass,
      role: 'MEMBER',
    },
  });

  console.log('User Accounts:');
  console.log(`  - Admin:  ${admin.email} (ID: ${admin.id})`);
  console.log(`  - Member: ${member.email} (ID: ${member.id})\n`);

  // 3. Seed Initial 4 Snacks Idempotently (never overwrite quantities if existing)
  console.log('Seeding Initial Snacks:');
  const seededSnacks = [];
  for (const s of INITIAL_SNACKS) {
    const record = await prisma.snack.upsert({
      where: { name: s.name },
      update: {}, // Idempotent: Do NOT overwrite quantity if already present
      create: {
        name: s.name,
        category: s.category,
        quantity: s.quantity,
        lowStockThreshold: s.lowStockThreshold,
      },
    });
    seededSnacks.push(record);
    console.log(
      `  - [${record.category}] "${record.name}" | Qty: ${record.quantity} | Alert Threshold: ${record.lowStockThreshold} (ID: ${record.id})`
    );
  }

  console.log('\n================================================================');
  console.log('               SEEDING COMPLETED SUCCESSFULLY                   ');
  console.log('================================================================\n');
}

if (require.main === module || process.argv[1]?.includes('seed')) {
  main()
    .catch((e) => {
      console.error('Seed execution error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
