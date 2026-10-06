// Runs before each test file — point Prisma at the test database before anything imports it.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/autobidx_test?schema=public";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.PAYMENT_GATEWAY = "mock";
process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
process.env.APP_MODE = "development";
process.env.DISABLE_RATE_LIMIT = "true";
process.env.STORAGE_DIR = "./storage-test";
process.env.JOBS_IN_PROCESS = "false";
