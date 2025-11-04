# Database Setup Instructions

## Step 1: Setup Database Environment

Create a `.env` file in the root directory with your database connection string:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/travel_db?schema=public"
```

Or if using cloud database:
```env
DATABASE_URL="your-postgres-connection-string"
```

## Step 2: Generate Prisma Client

Run this command from the root directory:

```bash
npm run prisma:generate
```

Or:
```bash
npx prisma generate --schema=prisma/schema.prisma
```

## Step 3: Run Database Migrations

Create the tables in your database:

```bash
npm run prisma:migrate
```

Or:
```bash
npx prisma migrate dev --name init --schema=prisma/schema.prisma
```

## Step 4: Seed Test Data

Add test managers to the database:

```bash
npm run prisma:seed
```

Or:
```bash
cd server && node prisma/seed.js
```

## Step 5: Start the Server

```bash
cd server && npm start
```

---

## Quick Commands Reference

```bash
# Generate Prisma client
npm run prisma:generate

# Create database tables
npm run prisma:migrate

# Add test managers
npm run prisma:seed

# Start server
cd server && npm start
```

## Test Managers Created

The seed script will create 4 test managers:

1. **MGR001** - John Smith - Finance Manager
2. **MGR002** - Sarah Johnson - Operations Manager  
3. **MGR003** - Michael Chen - Department Head
4. **MGR004** - Emma Williams - Regional Manager

These will automatically appear in your manager dropdown when you create a travel request.

