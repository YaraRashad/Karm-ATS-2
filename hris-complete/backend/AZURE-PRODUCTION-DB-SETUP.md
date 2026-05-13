# Azure Production Database Setup

Production server:

- Host: `karm-ats-postgres.postgres.database.azure.com`
- Admin user: `atsadmin`
- Database: `karm_ats`
- SSL: required

Production `DATABASE_URL` format:

```env
DATABASE_URL=postgresql://atsadmin:<PASSWORD>@karm-ats-postgres.postgres.database.azure.com:5432/karm_ats?sslmode=require&schema=public
```

Create the database first, using the default `postgres` database connection:

```bash
DATABASE_URL='postgresql://atsadmin:<PASSWORD>@karm-ats-postgres.postgres.database.azure.com:5432/postgres?sslmode=require&schema=public' \
  npx prisma db execute --file prisma/create-production-database.sql --schema prisma/schema.prisma
```

Then run production migrations:

```bash
DATABASE_URL='postgresql://atsadmin:<PASSWORD>@karm-ats-postgres.postgres.database.azure.com:5432/karm_ats?sslmode=require&schema=public' \
  npx prisma migrate deploy
```

Seed the first Admin only:

```bash
DATABASE_URL='postgresql://atsadmin:<PASSWORD>@karm-ats-postgres.postgres.database.azure.com:5432/karm_ats?sslmode=require&schema=public' \
  npm run db:seed:admin
```

Do not run `npm run db:seed` against production. That script is for demo/sample data.
