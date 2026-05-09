/**
 * Vzpostavi povezavo z MongoDB. Loceno od `app.js`, da je povezavo
 * mogoce v testih nadomestiti z `mongodb-memory-server`.
 */

const mongoose = require('mongoose');
const env = require('./env');

// Strict query: prepreci, da bi neznane lastnosti v filterju "tiho" prisle
// mimo - boljse je hard error kot lazni rezultati. (Mongoose 8 default je true,
// a postavimo eksplicitno za jasnost.)
mongoose.set('strictQuery', true);

async function connectDatabase(uri = env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  // eslint-disable-next-line no-console
  console.log(`[db] Povezan z MongoDB: ${uri.replace(/\/\/.*@/, '//***@')}`);
  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = { connectDatabase, disconnectDatabase };
