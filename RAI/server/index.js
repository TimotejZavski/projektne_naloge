require("dotenv").config();

const { createApp } = require("./src/app");
const { connectMongo } = require("./src/db/mongo");

const app = createApp();
const port = Number(process.env.PORT || 5000);

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
