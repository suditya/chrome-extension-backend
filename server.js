try {
  require("dotenv").config();
} catch (_e) {
  // Built-in fallback if dotenv is not yet installed
  const fs = require("fs");
  const path = require("path");
  const envPath = path.resolve(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || "").trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
const express = require("express");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const { createReminderEmail } = require("./emailTemplate");
const { calculateNextReview, normalizeTopic, TOPICS } = require("./srsEngine");
const { escapeHtml, isValidEmail, extractSlug } = require("./utils");

const PORT = process.env.PORT || 3000;
const DB_NAME = process.env.DB_NAME || "Leetcode-Extension";
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASS;
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || "https://chrome-extension-backend-cvc3.onrender.com";
const REMINDERS_COLL = "scheduledEmails";

if (!MONGODB_URI) {
  console.error("FATAL: MONGODB_URI environment variable is missing.");
}
if (!ADMIN_EMAIL || !ADMIN_PASS) {
  console.warn("WARNING: ADMIN_EMAIL or ADMIN_PASS environment variable is missing.");
}

const app = express();

app.set("trust proxy", 1);

// CORS setup
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : ["*"];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin) || origin.startsWith("chrome-extension://")) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const clientIp = req.headers["x-forwarded-for"]
    ? req.headers["x-forwarded-for"].split(",")[0].trim()
    : req.socket.remoteAddress || "unknown";

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms (IP: ${clientIp})`);
  });
  next();
});

// Database connection
const client = new MongoClient(MONGODB_URI || "mongodb://localhost:27017");
let dbInstance = null;

async function getDatabase() {
  if (!dbInstance) {
    await client.connect();
    dbInstance = client.db(DB_NAME);

    const collection = dbInstance.collection(REMINDERS_COLL);
    await collection.createIndex({ nextReviewAt: 1, status: 1 });
    await collection.createIndex({ email: 1, problemLink: 1 });
    await collection.createIndex({ email: 1, nextReviewAt: 1 });
    await collection.createIndex({ "emailDelivery.status": 1, nextReviewAt: 1 });
    console.log("Connected to MongoDB and verified indexes.");
  }
  return dbInstance;
}

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: ADMIN_EMAIL,
    pass: ADMIN_PASS,
  },
});

// Health check
app.get("/", (_req, res) => {
  return res.status(200).json({
    status: "healthy",
    service: "LeetCode Spaced Repetition API",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Topics list endpoint
app.get("/api/topics", (_req, res) => {
  return res.status(200).json({ topics: TOPICS });
});

/**
 * 1. SAVE OR UPDATE A PROBLEM IN REVISION QUEUE
 * POST /api/reminders/save
 */
app.post("/api/reminders/save", async (req, res) => {
  try {
    const { email, problemLink, problemTitle, topic, difficulty, initialDays } = req.body;

    if (!problemLink || !email || !problemTitle) {
      return res.status(400).json({ message: "❌ Missing required fields: email, problemLink, problemTitle" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ message: "❌ Invalid email format." });
    }

    const cleanLink = String(problemLink).trim();
    if (!cleanLink.startsWith("https://leetcode.com/problems/") && !cleanLink.startsWith("https://leetcode.cn/problems/")) {
      return res.status(400).json({ message: "❌ problemLink must be a valid LeetCode URL." });
    }

    const days = parseInt(initialDays, 10) || 3;
    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + Math.min(Math.max(days, 1), 30));

    const db = await getDatabase();
    const collection = db.collection(REMINDERS_COLL);

    const problemSlug = extractSlug(cleanLink);
    const normalizedTopic = normalizeTopic(topic);
    const cleanDifficulty = ["Easy", "Medium", "Hard"].includes(difficulty) ? difficulty : "Medium";

    // Upsert reminder document
    const existing = await collection.findOne({ email: cleanEmail, problemLink: cleanLink });

    if (existing) {
      // Update existing problem schedule
      await collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            problemTitle: String(problemTitle).trim(),
            topic: normalizedTopic,
            difficulty: cleanDifficulty,
            nextReviewAt,
            status: "active",
            "emailDelivery.status": "pending",
            updatedAt: new Date(),
          },
        }
      );

      const formattedDate = nextReviewAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return res.status(200).json({
        message: `🔄 Updated! Next review scheduled for ${formattedDate}`,
        reminderId: existing._id,
        nextReviewAt,
      });
    }

    // Insert new problem
    const newDoc = {
      email: cleanEmail,
      problemLink: cleanLink,
      problemSlug,
      problemTitle: String(problemTitle).trim(),
      topic: normalizedTopic,
      difficulty: cleanDifficulty,
      status: "active", // active | mastered
      reviewCount: 0,
      consecutiveIndependent: 0,
      lastReviewedAt: null,
      lastOutcome: null,
      nextReviewAt,
      history: [],
      emailDelivery: {
        status: "pending", // pending | sending | sent | failed
        sentAt: null,
        attemptCount: 0,
        lastError: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insertResult = await collection.insertOne(newDoc);
    const formattedDate = nextReviewAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    return res.status(200).json({
      message: `✅ Saved to Revision Queue! Next review: ${formattedDate}`,
      reminderId: insertResult.insertedId,
      nextReviewAt,
    });
  } catch (error) {
    console.error("Error saving reminder:", error);
    return res.status(500).json({ message: "❌ Failed to save problem to revision queue." });
  }
});

/**
 * Backward compatibility route for legacy extension
 */
app.post("/api/schedule-email", async (req, res) => {
  const { problemLink, email, afterDays, problemName } = req.body;
  req.body = {
    email,
    problemLink,
    problemTitle: problemName,
    initialDays: afterDays,
    topic: "Other",
    difficulty: "Medium",
  };
  return app._router.handle(req, res, () => {});
});

/**
 * 2. GET USER REVISION QUEUE & STATS
 * GET /api/reminders?email=user@example.com
 */
app.get("/api/reminders", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "❌ Valid email query parameter is required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const db = await getDatabase();
    const collection = db.collection(REMINDERS_COLL);

    const all = await collection.find({ email: cleanEmail }).sort({ nextReviewAt: 1 }).toArray();

    const now = new Date();
    const due = [];
    const upcoming = [];
    const mastered = [];

    const topicStats = {};

    all.forEach((item) => {
      const topic = item.topic || "Other";
      if (!topicStats[topic]) {
        topicStats[topic] = { total: 0, mastered: 0, struggling: 0 };
      }
      topicStats[topic].total += 1;

      if (item.status === "mastered") {
        topicStats[topic].mastered += 1;
        mastered.push(item);
      } else if (new Date(item.nextReviewAt) <= now) {
        if (item.lastOutcome === "failed") {
          topicStats[topic].struggling += 1;
        }
        due.push(item);
      } else {
        if (item.lastOutcome === "failed") {
          topicStats[topic].struggling += 1;
        }
        upcoming.push(item);
      }
    });

    return res.status(200).json({
      due,
      upcoming,
      mastered,
      stats: {
        totalProblems: all.length,
        dueCount: due.length,
        masteredCount: mastered.length,
        upcomingCount: upcoming.length,
        topicStats,
      },
    });
  } catch (error) {
    console.error("Error fetching revision queue:", error);
    return res.status(500).json({ message: "❌ Failed to fetch revision queue." });
  }
});

/**
 * 3. LOG A REVIEW OUTCOME (FROM EXTENSION)
 * POST /api/reminders/review
 */
app.post("/api/reminders/review", async (req, res) => {
  try {
    const { id, email, problemLink, outcome } = req.body;

    if (!outcome || !["failed", "hints", "independent"].includes(outcome)) {
      return res.status(400).json({ message: "❌ Valid outcome ('failed', 'hints', or 'independent') is required." });
    }

    const db = await getDatabase();
    const collection = db.collection(REMINDERS_COLL);

    let reminder = null;
    if (id && ObjectId.isValid(id)) {
      reminder = await collection.findOne({ _id: new ObjectId(id) });
    } else if (email && problemLink) {
      reminder = await collection.findOne({ email: String(email).trim().toLowerCase(), problemLink: String(problemLink).trim() });
    }

    if (!reminder) {
      return res.status(404).json({ message: "❌ Reminder not found." });
    }

    // Apply SRS interval logic
    const reviewResult = calculateNextReview({
      outcome,
      currentConsecutive: reminder.consecutiveIndependent || 0,
      totalReviews: reminder.reviewCount || 0,
    });

    const newHistoryEntry = {
      outcome,
      reviewedAt: new Date(),
      nextIntervalDays: reviewResult.nextIntervalDays,
    };

    const updateDoc = {
      $set: {
        nextReviewAt: reviewResult.nextReviewAt,
        consecutiveIndependent: reviewResult.newConsecutive,
        reviewCount: reviewResult.newTotalReviews,
        status: reviewResult.isMastered ? "mastered" : "active",
        lastReviewedAt: new Date(),
        lastOutcome: outcome,
        "emailDelivery.status": "pending",
        updatedAt: new Date(),
      },
      $push: {
        history: newHistoryEntry,
      },
    };

    await collection.updateOne({ _id: reminder._id }, updateDoc);

    const formattedNextDate = reviewResult.nextReviewAt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    let message;
    if (reviewResult.isMastered) {
      message = `🏆 Mastered! Problem marked as mastered after 3 consecutive independent solves.`;
    } else if (outcome === "failed") {
      message = `Scheduled for revision tomorrow to cement the pattern.`;
    } else if (outcome === "hints") {
      message = `Good progress! Scheduled for revision in 3 days.`;
    } else {
      message = `Great job! Independent solve streak: ${reviewResult.newConsecutive}. Next review: ${formattedNextDate}`;
    }

    return res.status(200).json({
      message,
      nextReviewAt: reviewResult.nextReviewAt,
      nextIntervalDays: reviewResult.nextIntervalDays,
      consecutiveIndependent: reviewResult.newConsecutive,
      isMastered: reviewResult.isMastered,
    });
  } catch (error) {
    console.error("Error logging review outcome:", error);
    return res.status(500).json({ message: "❌ Failed to record review outcome." });
  }
});

/**
 * 4. ONE-CLICK REVIEW FROM EMAIL
 * GET /api/reminders/review-click?id=...&outcome=...
 */
app.get("/api/reminders/review-click", async (req, res) => {
  try {
    const { id, outcome } = req.query;

    if (!id || !ObjectId.isValid(id) || !["failed", "hints", "independent"].includes(outcome)) {
      return res.status(400).send("Invalid review click parameters.");
    }

    const db = await getDatabase();
    const collection = db.collection(REMINDERS_COLL);
    const reminder = await collection.findOne({ _id: new ObjectId(id) });

    if (!reminder) {
      return res.status(404).send("Reminder not found or already deleted.");
    }

    const reviewResult = calculateNextReview({
      outcome,
      currentConsecutive: reminder.consecutiveIndependent || 0,
      totalReviews: reminder.reviewCount || 0,
    });

    await collection.updateOne(
      { _id: reminder._id },
      {
        $set: {
          nextReviewAt: reviewResult.nextReviewAt,
          consecutiveIndependent: reviewResult.newConsecutive,
          reviewCount: reviewResult.newTotalReviews,
          status: reviewResult.isMastered ? "mastered" : "active",
          lastReviewedAt: new Date(),
          lastOutcome: outcome,
          "emailDelivery.status": "pending",
          updatedAt: new Date(),
        },
        $push: {
          history: {
            outcome,
            reviewedAt: new Date(),
            nextIntervalDays: reviewResult.nextIntervalDays,
          },
        },
      }
    );

    const formattedNext = reviewResult.nextReviewAt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    const safeTitle = escapeHtml(reminder.problemTitle);
    const safeLink = encodeURI(reminder.problemLink);

    // Render confirmation web page
    const htmlResponse = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Outcome Recorded - LeetCode SRS</title>
  <style>
    body {
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 32px 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 80vh;
    }
    .box {
      max-width: 480px;
      width: 100%;
      background: #ffffff;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
      border: 1px solid #e2e8f0;
      text-align: center;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 22px;
      color: #0f172a;
      margin-bottom: 8px;
    }
    p {
      font-size: 15px;
      color: #475569;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .highlight {
      background-color: #f1f5f9;
      border-radius: 8px;
      padding: 12px 16px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 24px;
    }
    a.btn {
      display: inline-block;
      background-color: #ffa116;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">${reviewResult.isMastered ? "🏆" : outcome === "independent" ? "🎯" : "💪"}</div>
    <h1>${reviewResult.isMastered ? "Problem Mastered!" : "Review Recorded!"}</h1>
    <p>Your performance for <strong>${safeTitle}</strong> has been logged in your spaced repetition queue.</p>
    <div class="highlight">
      Next revision: <strong>${formattedNext}</strong> (${reviewResult.nextIntervalDays} days)
      <br>
      <small style="font-weight: normal; color: #64748b;">Independent streak: ${reviewResult.newConsecutive}</small>
    </div>
    <a href="${safeLink}" class="btn">Open Problem on LeetCode ↗</a>
  </div>
</body>
</html>`;

    return res.status(200).send(htmlResponse);
  } catch (error) {
    console.error("Error processing review click:", error);
    return res.status(500).send("An error occurred while recording your review.");
  }
});

/**
 * 5. DELETE A PROBLEM FROM REVISION QUEUE
 * DELETE /api/reminders/:id
 */
app.delete("/api/reminders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ message: "❌ Valid ID is required." });
    }

    const db = await getDatabase();
    const result = await db.collection(REMINDERS_COLL).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "❌ Reminder not found." });
    }

    return res.status(200).json({ message: "🗑️ Reminder removed from revision queue." });
  } catch (error) {
    console.error("Error deleting reminder:", error);
    return res.status(500).json({ message: "❌ Failed to delete reminder." });
  }
});

/**
 * RELIABLE CRON WORKER WITH ATOMIC CLAIM LEASE
 * Dispatches due revision reminders via Nodemailer
 */
async function dispatchDueReminders() {
  try {
    const db = await getDatabase();
    const collection = db.collection(REMINDERS_COLL);

    const now = new Date();

    // Query due active reminders that haven't been delivered
    const dueReminders = await collection
      .find({
        status: "active",
        nextReviewAt: { $lte: now },
        "emailDelivery.status": { $ne: "sent" },
      })
      .toArray();

    if (dueReminders.length === 0) {
      return;
    }

    console.log(`[Cron] Found ${dueReminders.length} reminder(s) eligible for delivery.`);

    for (const reminder of dueReminders) {
      // Atomic Lease: Lock document to prevent duplicate deliveries from concurrent workers
      const lockResult = await collection.findOneAndUpdate(
        {
          _id: reminder._id,
          "emailDelivery.status": { $ne: "sending" },
        },
        {
          $set: {
            "emailDelivery.status": "sending",
            "emailDelivery.lockedAt": new Date(),
          },
        },
        { returnDocument: "after" }
      );

      if (!lockResult) {
        continue; // Already claimed by another run
      }

      try {
        const mailOptions = createReminderEmail({
          to: reminder.email,
          from: ADMIN_EMAIL,
          problemName: reminder.problemTitle,
          problemLink: reminder.problemLink,
          topic: reminder.topic || "General",
          difficulty: reminder.difficulty || "Medium",
          consecutiveIndependent: reminder.consecutiveIndependent || 0,
          reviewUrlBase: BACKEND_PUBLIC_URL,
          reminderId: reminder._id.toString(),
        });

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Cron] Delivered reminder to ${reminder.email} for "${reminder.problemTitle}" (Id: ${info.messageId})`);

        await collection.updateOne(
          { _id: reminder._id },
          {
            $set: {
              "emailDelivery.status": "sent",
              "emailDelivery.sentAt": new Date(),
              "emailDelivery.lastError": null,
            },
          }
        );
      } catch (sendError) {
        console.error(`[Cron] Delivery error for ${reminder.email}:`, sendError.message);

        await collection.updateOne(
          { _id: reminder._id },
          {
            $set: {
              "emailDelivery.status": "failed",
              "emailDelivery.lastError": sendError.message,
            },
            $inc: {
              "emailDelivery.attemptCount": 1,
            },
          }
        );
      }
    }
  } catch (err) {
    console.error("[Cron] Error during reminder dispatch:", err);
  }
}

// Cron: every hour on the hour
cron.schedule("0 * * * *", async () => {
  console.log(`[Cron] Hourly check at: ${new Date().toISOString()}`);
  await dispatchDueReminders();
});

// Start Server
const server = app.listen(PORT, async () => {
  console.log(`LeetCode SRS Backend running on port ${PORT}`);
  try {
    await getDatabase();
  } catch (err) {
    console.error("Initial MongoDB connection error:", err.message);
  }
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down...`);
  server.close(async () => {
    try {
      await client.close();
      console.log("MongoDB closed.");
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app;
