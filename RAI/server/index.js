require("dotenv").config();

const { createApp } = require("./src/app");
const { connectMongo, mongoose } = require("./src/db/mongo");

const app = createApp();
const port = Number(process.env.PORT || 5000);

// Generic endpoints stay for backward compatibility until specific query routes are added.
app.get("/api/:collection", async (req, res) => {
  const docs = await mongoose.connection.db
    .collection(req.params.collection)
    .find({})
    .toArray();
  res.json(docs);
});

app.post("/api/:collection", async (req, res) => {
  const result = await mongoose.connection.db
    .collection(req.params.collection)
    .insertOne(req.body);
  res.json(result);
});

async function start() {
  await connectMongo(process.env.MONGODB_URI);

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
