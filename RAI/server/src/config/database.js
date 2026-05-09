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
    // autoIndex eksplicitno: zelimo da Mongoose ustvari indexe iz
    // schema definicij (User.email unique, Session TTL,
    // SensorMeasurement compound indexi, ...). Brez tega bi v
    // produkciji (NODE_ENV=production) Mongoose autoIndex izklopil
    // in unique constraints + performance indexi NE bi obstajali ob
    // first run-u.
    // V resni produkciji bi indexe ustvarili z eksplicitnim
    // `Model.syncIndexes()` v migration skripti, za zdaj pa je
    // autoIndex=true najvarnejsi default za "deploy iz nica".
    autoIndex: true,
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
