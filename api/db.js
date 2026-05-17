/**
 * Shared MongoDB connection for Vercel serverless functions.
 * Reuses connection across warm invocations.
 */

const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI env var is not set");

let client;
let clientPromise;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

async function getDb() {
  const c = await clientPromise;
  return c.db("signal");
}

module.exports = { getDb };
