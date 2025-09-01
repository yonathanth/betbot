require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { pool } = require("../config/database");

async function listUsers() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (
    command &&
    command !== "all" &&
    command !== "admins" &&
    command !== "active" &&
    command !== "inactive"
  ) {
    console.log(`
👥 User Listing Script

Usage: node scripts/list-users.js [filter]

Filters:
  all       - List all users (default)
  admins    - List only admin users
  active    - List only active users
  inactive  - List only inactive users

Examples:
  node scripts/list-users.js
  node scripts/list-users.js all
  node scripts/list-users.js admins
  node scripts/list-users.js active
  node scripts/list-users.js inactive
`);
    process.exit(1);
  }

  try {
    console.log("🔍 Connecting to database...");
    await pool.getConnection();
    console.log("✅ Database connected");

    const filter = command || "all";
    await displayUsers(filter);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

async function displayUsers(filter) {
  try {
    let query = `
      SELECT 
        id,
        telegram_id,
        name,
        phone,
        user_type,
        is_admin,
        is_active,
        created_at,
        updated_at
      FROM users
    `;

    let params = [];

    switch (filter) {
      case "admins":
        query += " WHERE is_admin = TRUE";
        break;
      case "active":
        query += " WHERE is_active = TRUE";
        break;
      case "inactive":
        query += " WHERE is_active = FALSE";
        break;
      default:
        // No filter - show all users
        break;
    }

    query += " ORDER BY created_at DESC";

    const [users] = await pool.query(query, params);

    if (users.length === 0) {
      console.log(
        `📭 No users found${filter !== "all" ? ` (filter: ${filter})` : ""}`
      );
      return;
    }

    console.log(
      `\n👥 Users (${users.length} total${
        filter !== "all" ? `, filtered by: ${filter}` : ""
      }):\n`
    );

    // Display detailed table
    console.log(
      "ID | Telegram ID    | Name              | Phone         | Type    | Admin | Status | Created    | Updated"
    );
    console.log(
      "---|----------------|-------------------|---------------|---------|-------|--------|------------|----------"
    );

    for (const user of users) {
      const id = String(user.id).padEnd(2);
      const telegramId = String(user.telegram_id).padEnd(14);
      const name = (user.name || "No name").padEnd(17).substring(0, 17);
      const phone = (user.phone || "No phone").padEnd(13).substring(0, 13);
      const userType = (user.user_type || "None").padEnd(7).substring(0, 7);
      const isAdmin = user.is_admin ? "Yes" : "No";
      const status = user.is_active !== false ? "🟢 Active" : "🔴 Inactive";
      const created = user.created_at.toISOString().substring(0, 10);
      const updated = user.updated_at.toISOString().substring(0, 10);

      console.log(
        `${id} | ${telegramId} | ${name} | ${phone} | ${userType} | ${isAdmin.padEnd(
          5
        )} | ${status}   | ${created} | ${updated}`
      );
    }

    // Display summary statistics
    console.log("\n📊 Summary Statistics:");

    const totalUsers = users.length;
    const adminUsers = users.filter((u) => u.is_admin).length;
    const activeUsers = users.filter((u) => u.is_active !== false).length;
    const inactiveUsers = users.filter((u) => u.is_active === false).length;

    const userTypeStats = {};
    users.forEach((user) => {
      const type = user.user_type || "None";
      userTypeStats[type] = (userTypeStats[type] || 0) + 1;
    });

    console.log(`   Total Users: ${totalUsers}`);
    console.log(`   Admin Users: ${adminUsers}`);
    console.log(`   Active Users: ${activeUsers}`);
    console.log(`   Inactive Users: ${inactiveUsers}`);

    console.log("\n   User Types:");
    Object.entries(userTypeStats).forEach(([type, count]) => {
      console.log(`     ${type}: ${count}`);
    });

    // Show recent users (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentUsers = users.filter(
      (user) => new Date(user.created_at) > sevenDaysAgo
    );

    if (recentUsers.length > 0) {
      console.log(`\n🆕 Recent Users (last 7 days): ${recentUsers.length}`);
    }
  } catch (error) {
    console.error("❌ Error fetching users:", error.message);
    throw error;
  }
}

// Run the script
listUsers().catch(console.error);
