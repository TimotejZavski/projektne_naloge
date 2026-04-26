const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// connect to mongdb (default localhost empty DB "rai")
mongoose.connect('mongodb://localhost:27017/rai');

// generis REST endpoints
app.get('/api/:collection', async (req, res) => {
  const docs = await mongoose.connection.db.collection(req.params.collection).find({}).toArray();
  res.json(docs);
});

app.post('/api/:collection', async (req, res) => {
  const result = await mongoose.connection.db.collection(req.params.collection).insertOne(req.body);
  res.json(result);
});

app.listen(5000, () => console.log('Server running on http://localhost:5000'));