require("dotenv").config();
const { initializeBot } = require("./services/botService");
const { setupRoutes } = require("./routes/botRoutes");

async function startServer() {
  try {
    console.log("🚀 Starting betbot server...");
    console.log("📡 Environment:", process.env.NODE_ENV || "development");

    // Initialize bot first
    await initializeBot();

    // Setup routes after bot is ready
    setupRoutes();

    console.log("✅ betbot server started successfully!");
    console.log("🤖 Bot is now ready to receive messages!");
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down gracefully...");
  process.exit(0);
});

// Start the server
startServer();
