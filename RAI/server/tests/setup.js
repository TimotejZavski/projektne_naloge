/**
 * Test lifecycle helper - klicemo iz vsakega test fajla.
 *
 * Uporaba:
 *   const { setupTestDb, teardownTestDb, clearTestDb } = require('./setup');
 *   beforeAll(setupTestDb);
 *   afterEach(clearTestDb);
 *   afterAll(teardownTestDb);
 *
 * Uporablja `mongodb-memory-server` -> brez zunanje odvisnosti, vsak run
 * dobi cisto bazo.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

async function setupTestDb() {
  if (mongoServer) return;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
}

async function clearTestDb() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

async function teardownTestDb() {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

module.exports = { setupTestDb, clearTestDb, teardownTestDb };
