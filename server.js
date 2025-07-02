require("dotenv").config();
const { testConnection, initializeDatabase } = require("./config/database");
const { setupRoutes } = require("./routes/botRoutes");

async function startBot() {
  try {
    console.log("Starting BetBot...");

    // Test database connection
    await testConnection();

    // Initialize database schema
    await initializeDatabase();

    // Initialize services
    require("./services/dbService");
    require("./services/botService");

    // Setup bot routes
    setupRoutes();

    console.log("Bot is running successfully!");
    console.log("Available commands:");
    console.log("   /start - Start using the bot");
    console.log("   /admin - Access admin panel (admin only)");
  } catch (error) {
    console.error("Failed to start bot:", error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n⏹️  Bot shutting down...");
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled promise rejection:", error);
});

startBot();
