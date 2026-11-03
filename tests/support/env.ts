/**
 * Entorno de pruebas: modo demostración, base de datos de pruebas dedicada y
 * secretos efímeros. Nunca apunta a recursos reales de Microsoft 365.
 */
process.env.APP_MODE = "demo";
process.env.APP_URL = "http://localhost:3999";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://portal:portal_dev_pw@localhost:5432/portal_test";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789";
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.DEMO_STORAGE_DIR = "./.demo-storage-test";
process.env.TRUST_PROXY = "true";
(process.env as Record<string, string>).NODE_ENV = "test";
