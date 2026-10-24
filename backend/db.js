// Rolevia AI · Database Client Wrapper
// Singleton Prisma Client instance with graceful connection management.

const { PrismaClient } = require('@prisma/client');

let prisma;

if (!global.__prismaInstance) {
  global.__prismaInstance = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });
}

prisma = global.__prismaInstance;

module.exports = prisma;
