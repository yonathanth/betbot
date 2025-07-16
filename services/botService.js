const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

// Initialize database first
async function initializeDatabase() {
  try {
    const {
      testConnection,
      initializeDatabase: initDB,
    } = require("../config/database");

    console.log("🔗 Testing database connection...");
    await testConnection();

    console.log("🗄️ Initializing database schema...");
    await initDB();

    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error.message);
    throw error;
  }
}

// Clear any existing webhooks first
async function clearWebhooks(botToken) {
  try {
    const tempBot = new TelegramBot(botToken, { polling: false });
    await tempBot.deleteWebHook();
    console.log("✅ Webhooks cleared successfully");
  } catch (error) {
    console.log("⚠️ Warning: Could not clear webhooks:", error.message);
  }
}

// State management with memory optimization
const userStates = new Map();
const mediaGroups = new Map(); // Store media groups temporarily

const getState = (chatId) => userStates.get(chatId) || {};
const setState = (chatId, state) =>
  userStates.set(chatId, { ...getState(chatId), ...state });

// Clear state for a user
const clearState = (chatId) => userStates.delete(chatId);

// Memory optimization: Clean up old states periodically
function cleanupOldStates() {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours

  for (const [chatId, state] of userStates.entries()) {
    if (state.lastActivity && now - state.lastActivity > maxAge) {
      userStates.delete(chatId);
    }
  }

  console.log(`🧹 Cleaned up user states. Active: ${userStates.size}`);
}

// Update state with activity timestamp
const setStateWithActivity = (chatId, state) => {
  userStates.set(chatId, {
    ...getState(chatId),
    ...state,
    lastActivity: Date.now(),
  });
};

// Media group handling with cleanup
const addToMediaGroup = (mediaGroupId, photo) => {
  if (!mediaGroups.has(mediaGroupId)) {
    mediaGroups.set(mediaGroupId, {
      photos: [],
      timestamp: Date.now(),
      processed: false,
    });
  }
  mediaGroups.get(mediaGroupId).photos.push(photo);
};

const getMediaGroup = (mediaGroupId) => {
  const group = mediaGroups.get(mediaGroupId);
  return group ? group.photos : [];
};

const clearMediaGroup = (mediaGroupId) => mediaGroups.delete(mediaGroupId);

// Clean up old media groups (older than 10 minutes)
function cleanupOldMediaGroups() {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes

  for (const [mediaGroupId, group] of mediaGroups.entries()) {
    if (now - group.timestamp > maxAge) {
      mediaGroups.delete(mediaGroupId);
    }
  }

  if (mediaGroups.size > 0) {
    console.log(`🧹 Cleaned up media groups. Active: ${mediaGroups.size}`);
  }
}

// Schedule memory cleanup (every 30 minutes)
if (process.env.NODE_ENV === "production") {
  setInterval(() => {
    cleanupOldStates();
    cleanupOldMediaGroups();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log("🗑️ Forced garbage collection");
    }
  }, 30 * 60 * 1000);

  console.log("📅 Scheduled memory cleanup every 30 minutes");
}

// Bot instance
let bot = null;
let server = null;

// Initialize everything
async function initializeBot() {
  try {
    console.log("🤖 Initializing bot...");

    // Initialize database first
    await initializeDatabase();

    // Initialize database service
    require("./dbService");

    // Production vs Development setup
    const isProduction = process.env.NODE_ENV === "production";

    if (isProduction) {
      // Production: Use webhooks
      console.log("🚀 Production mode: Setting up webhooks...");

      // Create bot without polling
      bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });

      // Create Express server for webhooks
      const app = express();
      app.use(express.json());

      const WEBHOOK_URL = `${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_TOKEN}`;
      const PORT = process.env.PORT || 3000;

      // Set webhook
      await bot.setWebHook(WEBHOOK_URL);
      console.log(`✅ Webhook set to: ${WEBHOOK_URL}`);

      // Handle webhook requests
      app.post(`/webhook/${process.env.TELEGRAM_TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
      });

      // Health check endpoint
      app.get("/health", (req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() });
      });

      // Start server
      server = app.listen(PORT, () => {
        console.log(`🌐 Webhook server running on port ${PORT}`);
      });
    } else {
      // Development: Use polling
      console.log("🔧 Development mode: Using polling...");

      // Clear webhooks first
      await clearWebhooks(process.env.TELEGRAM_TOKEN);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Create bot with optimized polling
      bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
        polling: {
          interval: 1000, // Reduced from 2000ms
          autoStart: true,
          params: {
            timeout: 20, // Increased timeout
          },
        },
      });

      // Enhanced error handling for polling
      bot.on("polling_error", (error) => {
        console.error("❌ Polling error:", error.message);
        if (error.message.includes("409")) {
          console.log("🔄 Conflict detected - restarting...");
          restartPolling();
        }
      });
    }

    // Common bot error handling
    bot.on("error", (error) => {
      console.error("❌ Bot error:", error.message);
    });

    // Graceful shutdown handling
    setupGracefulShutdown();

    console.log("🎉 Bot initialized successfully!");
    return bot;
  } catch (error) {
    console.error("❌ Failed to initialize bot:", error.message);
    throw error;
  }
}

// Restart polling function
function restartPolling() {
  if (bot && bot.isPolling()) {
    bot.stopPolling().then(() => {
      setTimeout(() => {
        bot.startPolling().catch((err) => {
          console.error("Failed to restart polling:", err.message);
        });
      }, 5000);
    });
  }
}

// Setup graceful shutdown
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    try {
      if (bot) {
        if (process.env.NODE_ENV === "production") {
          await bot.deleteWebHook();
          console.log("✅ Webhook deleted");
        } else {
          await bot.stopPolling();
          console.log("✅ Polling stopped");
        }
      }

      if (server) {
        server.close(() => {
          console.log("✅ HTTP server closed");
        });
      }

      // Close database connections
      const db = require("./dbService");
      if (db.closeConnections) {
        await db.closeConnections();
        console.log("✅ Database connections closed");
      }

      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error.message);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (error) => {
    console.error("❌ Unhandled promise rejection:", error);
  });

  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught exception:", error);
    shutdown("UNCAUGHT_EXCEPTION");
  });
}

module.exports = {
  initializeBot,
  getBot: () => bot,
  getState,
  setState,
  clearState,
  addToMediaGroup,
  getMediaGroup,
  clearMediaGroup,
  mediaGroups,
};
