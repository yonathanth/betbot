#!/usr/bin/env node

require("dotenv").config();
const { pool, closePool } = require("../config/database");

async function cleanDatabase() {
  try {
    console.log("🔄 Starting database cleanup...");

    // Disable foreign key checks
    await pool.execute("SET FOREIGN_KEY_CHECKS = 0");
    console.log("✅ Foreign key checks disabled");

    // Clean all tables
    const tables = ["post_clicks", "post_images", "posts", "users"];
    for (const table of tables) {
      await pool.execute(`TRUNCATE TABLE ${table}`);
      console.log(`✅ Cleaned table: ${table}`);
    }

    // Re-enable foreign key checks
    await pool.execute("SET FOREIGN_KEY_CHECKS = 1");
    console.log("✅ Foreign key checks re-enabled");

    // Verify tables are empty
    for (const table of tables) {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) as count FROM ${table}`
      );
      if (rows[0].count === 0) {
        console.log(`✅ Verified ${table} is empty`);
      } else {
        throw new Error(`Table ${table} is not empty!`);
      }
    }

    console.log("\n🎉 Database cleanup completed successfully!");
    console.log("\n⚠️  IMPORTANT: Remember to:");
    console.log("1. Update your .env file with the new credentials");
    console.log("2. Run the setup-admin script to recreate admin users");
    console.log("3. Restart the bot\n");
  } catch (error) {
    console.error("❌ Error during database cleanup:", error.message);
    process.exit(1);
  } finally {
    await closePool();
    process.exit(0);
  }
}

cleanDatabase();
