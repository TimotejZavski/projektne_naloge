const mongoose = require("mongoose");

async function connectMongo(uri) {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  await mongoose.connect(uri);
  return mongoose.connection;
}

module.exports = {
  connectMongo,
  mongoose,
};
