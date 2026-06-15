const { MongoClient } = require("mongodb");

const DB_NAME = process.env.MONGODB_DB || "signal";

async function getDb() {
  const uri = (process.env.MONGODB_URI || "").trim();
  if (!uri) {
    throw new Error("MONGODB_URI env var not set. Add it in Vercel project settings.");
  }

  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }

  const client = await global._mongoClientPromise;
  return client.db(DB_NAME);
}

module.exports = { getDb };
