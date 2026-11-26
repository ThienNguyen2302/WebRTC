import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('E2E_DATABASE_URL_REQUIRED: configure a dedicated local e2e database');
}

const url = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  !url.pathname.slice(1).endsWith('_e2e')
) {
  throw new Error('E2E_DATABASE_URL_UNSAFE: use a local database with an _e2e suffix');
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
try {
  await prisma.$connect();
  await prisma.room.count();
} catch (error) {
  throw new Error('E2E_POSTGRES_NOT_READY: start PostgreSQL and apply Prisma migrations', {
    cause: error,
  });
} finally {
  await prisma.$disconnect();
}
