#!/usr/bin/env node

/**
 * Admin Setup Script
 * Use this script to add admin privileges to users
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { pool } = require("../config/database");

async function setupAdmin() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
🛠  Admin Setup Script

Usage: node scripts/setup-admin.js <telegram_id> [name]

Examples:
  node scripts/setup-admin.js 123456789
  node scripts/setup-admin.js 123456789 "John Admin"

This script will:
1. Create user if doesn't exist
2. Grant admin privileges
3. Update environment variable instructions

Current Admin IDs from ENV: ${process.env.ADMIN_IDS || "None set"}
`);
    process.exit(1);
  }

  const telegramId = args[0];
  const name = args[1] || null;

  if (!/^\d+$/.test(telegramId)) {
    console.error("❌ Error: Telegram ID must be a number");
    process.exit(1);
  }

  try {
    console.log("🔍 Checking database connection...");
    await pool.getConnection();
    console.log("✅ Database connected");

    // Check if user exists
    console.log(`🔍 Checking if user ${telegramId} exists...`);
    const [existing] = await pool.query(
      "SELECT * FROM users WHERE telegram_id = ?",
      [telegramId]
    );

    if (existing.length === 0) {
      // Create user
      console.log("👤 Creating new user...");
      await pool.query(
        "INSERT INTO users (telegram_id, name, is_admin) VALUES (?, ?, TRUE)",
        [telegramId, name]
      );
      console.log("✅ User created with admin privileges");
    } else {
      // Update existing user
      console.log("👤 User exists, granting admin privileges...");
      const updateData = { is_admin: true };
      if (name) updateData.name = name;

      const updates = Object.keys(updateData).map((key) => `${key} = ?`);
      const values = Object.values(updateData);
      values.push(telegramId);

      await pool.query(
        `UPDATE users SET ${updates.join(", ")} WHERE telegram_id = ?`,
        values
      );
      console.log("✅ Admin privileges granted");
    }

    // Check current environment admins
    const currentAdmins = process.env.ADMIN_IDS
      ? process.env.ADMIN_IDS.split(",")
      : [];

    if (!currentAdmins.includes(telegramId)) {
      const newAdminList = [...currentAdmins, telegramId].filter((id) =>
        id.trim()
      );

      console.log(`
📝 IMPORTANT: Update your .env file

Add this line to your .env file or update ADMIN_IDS:
ADMIN_IDS=${newAdminList.join(",")}

Current: ADMIN_IDS=${process.env.ADMIN_IDS || ""}
New:     ADMIN_IDS=${newAdminList.join(",")}

Then restart your bot for changes to take effect.
`);
    } else {
      console.log("✅ User already in ADMIN_IDS environment variable");
    }

    console.log(`
🎉 Admin setup completed!

User Details:
- Telegram ID: ${telegramId}
- Name: ${name || "Not set"}
- Admin Status: ✅ Enabled

The user can now use /admin command in the bot.
`);
  } catch (error) {
    console.error("❌ Error setting up admin:", error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

setupAdmin();
