const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// connect to MongoDB
//   localhost: mongodb://localhost:27017/rai

mongoose.connect(process.env.MONGODB_URI);

// generis REST endpoints
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

app.listen(5000, () => console.log("Server running on http://localhost:5000"));
