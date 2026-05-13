import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'yara.rashad@karmsolar.com';

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      role: 'admin',
      accessScope: 'all_data',
      canViewSalary: true,
      canApproveOffers: true,
      canApproveRequisitions: true,
      entities: ['egypt', 'cyprus', 'uk', 'tunisia'],
      isActive: true,
    },
    create: {
      email: ADMIN_EMAIL,
      firstName: 'Yara',
      lastName: 'Rashad',
      role: 'admin',
      accessScope: 'all_data',
      canViewSalary: true,
      canApproveOffers: true,
      canApproveRequisitions: true,
      entities: ['egypt', 'cyprus', 'uk', 'tunisia'],
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'created',
      entity: 'users',
      entityId: admin.id,
      after: {
        email: admin.email,
        role: admin.role,
        source: 'production_admin_seed',
      },
    },
  });

  console.log(`Production Admin ready: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
