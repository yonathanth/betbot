require("dotenv").config();
const { pool } = require("../config/database");

async function manageAdmins() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (
    !command ||
    !["list", "activate", "deactivate", "remove"].includes(command)
  ) {
    console.log(`
🛠  Admin Management Script

Usage: node scripts/manage-admins.js <command> [telegram_id]

Commands:
  list                    - List all admin users and their status
  activate <telegram_id>  - Reactivate an inactive admin
  deactivate <telegram_id> - Deactivate an admin (stops notifications)
  remove <telegram_id>    - Remove admin privileges entirely

Examples:
  node scripts/manage-admins.js list
  node scripts/manage-admins.js activate 123456789
  node scripts/manage-admins.js deactivate 123456789
  node scripts/manage-admins.js remove 123456789
`);
    process.exit(1);
  }

  try {
    console.log("🔍 Connecting to database...");
    await pool.getConnection();
    console.log("✅ Database connected");

    switch (command) {
      case "list":
        await listAdmins();
        break;
      case "activate":
        if (!args[1]) {
          console.error("❌ Error: Please provide a telegram_id");
          process.exit(1);
        }
        await activateAdmin(args[1]);
        break;
      case "deactivate":
        if (!args[1]) {
          console.error("❌ Error: Please provide a telegram_id");
          process.exit(1);
        }
        await deactivateAdmin(args[1]);
        break;
      case "remove":
        if (!args[1]) {
          console.error("❌ Error: Please provide a telegram_id");
          process.exit(1);
        }
        await removeAdmin(args[1]);
        break;
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

async function listAdmins() {
  try {
    const [admins] = await pool.query(`
      SELECT telegram_id, name, is_admin, is_active, created_at 
      FROM users 
      WHERE is_admin = TRUE 
      ORDER BY created_at DESC
    `);

    if (admins.length === 0) {
      console.log("📭 No admin users found");
      return;
    }

    console.log(`\n👥 Admin Users (${admins.length} total):\n`);
    console.log("ID          | Name              | Status    | Created");
    console.log("------------|-------------------|-----------|----------");

    for (const admin of admins) {
      const status = admin.is_active !== false ? "🟢 Active" : "🔴 Inactive";
      const name = (admin.name || "No name").padEnd(17).substring(0, 17);
      const id = String(admin.telegram_id).padEnd(11);
      const created = admin.created_at.toISOString().substring(0, 10);

      console.log(`${id} | ${name} | ${status}   | ${created}`);
    }

    // Count active vs inactive
    const activeCount = admins.filter((a) => a.is_active !== false).length;
    const inactiveCount = admins.length - activeCount;

    console.log(
      `\n📊 Summary: ${activeCount} active, ${inactiveCount} inactive`
    );

    if (inactiveCount > 0) {
      console.log("💡 Use 'activate' command to reactivate inactive admins");
    }
  } catch (error) {
    console.error("Error listing admins:", error);
    throw error;
  }
}

async function activateAdmin(telegramId) {
  try {
    if (!/^\d+$/.test(telegramId)) {
      throw new Error("Telegram ID must be a number");
    }

    // Check if user exists and is admin
    const [users] = await pool.query(
      "SELECT telegram_id, name, is_admin, is_active FROM users WHERE telegram_id = ?",
      [telegramId]
    );

    if (users.length === 0) {
      throw new Error(
        `User ${telegramId} not found. Use setup-admin.js to create admin users.`
      );
    }

    const user = users[0];
    if (!user.is_admin) {
      throw new Error(
        `User ${telegramId} is not an admin. Use setup-admin.js to grant admin privileges.`
      );
    }

    if (user.is_active !== false) {
      console.log(`✅ Admin ${telegramId} is already active`);
      return;
    }

    // Activate the admin
    await pool.query(
      "UPDATE users SET is_active = TRUE WHERE telegram_id = ?",
      [telegramId]
    );

    console.log(
      `✅ Admin ${telegramId} (${user.name || "No name"}) has been reactivated`
    );
    console.log("🔔 They will now receive notification messages again");
  } catch (error) {
    console.error("Error activating admin:", error.message);
    throw error;
  }
}

async function deactivateAdmin(telegramId) {
  try {
    if (!/^\d+$/.test(telegramId)) {
      throw new Error("Telegram ID must be a number");
    }

    // Check if user exists and is admin
    const [users] = await pool.query(
      "SELECT telegram_id, name, is_admin, is_active FROM users WHERE telegram_id = ?",
      [telegramId]
    );

    if (users.length === 0) {
      throw new Error(`User ${telegramId} not found`);
    }

    const user = users[0];
    if (!user.is_admin) {
      throw new Error(`User ${telegramId} is not an admin`);
    }

    if (user.is_active === false) {
      console.log(`✅ Admin ${telegramId} is already inactive`);
      return;
    }

    // Deactivate the admin
    await pool.query(
      "UPDATE users SET is_active = FALSE WHERE telegram_id = ?",
      [telegramId]
    );

    console.log(
      `✅ Admin ${telegramId} (${user.name || "No name"}) has been deactivated`
    );
    console.log("🔕 They will no longer receive notification messages");
    console.log("💡 Use 'activate' command to reactivate them later");
  } catch (error) {
    console.error("Error deactivating admin:", error.message);
    throw error;
  }
}

async function removeAdmin(telegramId) {
  try {
    if (!/^\d+$/.test(telegramId)) {
      throw new Error("Telegram ID must be a number");
    }

    // Check if user exists and is admin
    const [users] = await pool.query(
      "SELECT telegram_id, name, is_admin FROM users WHERE telegram_id = ?",
      [telegramId]
    );

    if (users.length === 0) {
      throw new Error(`User ${telegramId} not found`);
    }

    const user = users[0];
    if (!user.is_admin) {
      console.log(`✅ User ${telegramId} is already not an admin`);
      return;
    }

    // Remove admin privileges
    await pool.query(
      "UPDATE users SET is_admin = FALSE, is_active = TRUE WHERE telegram_id = ?",
      [telegramId]
    );

    console.log(
      `✅ Admin privileges removed from ${telegramId} (${
        user.name || "No name"
      })`
    );
    console.log(
      "⚠️ Don't forget to update your ADMIN_IDS environment variable"
    );

    // Show current environment admins
    const currentAdmins = process.env.ADMIN_IDS
      ? process.env.ADMIN_IDS.split(",")
      : [];
    if (currentAdmins.includes(telegramId)) {
      const newAdminList = currentAdmins.filter(
        (id) => id.trim() !== telegramId
      );
      console.log(`\n📝 Update your .env file:`);
      console.log(`Current: ADMIN_IDS=${process.env.ADMIN_IDS}`);
      console.log(`New:     ADMIN_IDS=${newAdminList.join(",")}`);
    }
  } catch (error) {
    console.error("Error removing admin:", error.message);
    throw error;
  }
}

manageAdmins();
