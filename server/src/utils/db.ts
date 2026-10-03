import { MongoClient, Db } from "mongodb";

let db: Db | null = null;
let client: MongoClient | null = null;

export async function connectDB(): Promise<Db> {
  if (db && client) {
    return db;
  }

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  client = new MongoClient(mongoUri);
  await client.connect();

  db = client.db("f1_prediction_league");
  
  // Create indexes
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("users").createIndex({ username: 1 }, { unique: true, sparse: true });
  await db.collection("users").createIndex({ resetTokenHash: 1 }, { unique: true, sparse: true });
  await db.collection("mailJobs").createIndex({ key: 1 }, { unique: true });
  await db.collection("mailJobs").createIndex({ status: 1, nextAttemptAt: 1 });
  await db.collection("notifications").createIndex({ key: 1 }, { unique: true });
  await db.collection("notifications").createIndex({ userId: 1, createdAt: -1 });
  await db.collection("predictions").createIndex({ userId: 1, raceWeekendId: 1, type: 1 });
  await db.collection("messages").createIndex({ discussionId: 1, createdAt: 1 });
  await db.collection("scores").createIndex({ userId: 1 });
  await db.collection("scores").createIndex({ userId: 1, raceId: 1, type: 1 }, { unique: true });
  await db.collection("results").createIndex({ raceId: 1, type: 1 }, { unique: true });
  await db.collection("races").createIndex({ raceId: 1 });
  await db.collection("pollVotes").createIndex({ pollId: 1, userId: 1 }, { unique: true });

  console.log("✅ Connected to MongoDB");
  return db;
}

export function getDB(): Db {
  if (!db) {
    throw new Error("Database not connected. Call connectDB() first.");
  }
  return db;
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("🔌 Connected database connection closed gracefully");
  }
}
