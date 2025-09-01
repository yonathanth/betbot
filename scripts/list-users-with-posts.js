require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { pool } = require("../config/database");

async function listUsersWithPosts() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (
    command &&
    command !== "all" &&
    command !== "approved" &&
    command !== "published" &&
    command !== "top"
  ) {
    console.log(`
👥 Users with Posts Listing Script

Usage: node scripts/list-users-with-posts.js [filter]

Filters:
  all       - List all users with any posts (default)
  approved  - List users with approved posts only
  published - List users with published posts only
  top       - List top users by total clicks

Examples:
  node scripts/list-users-with-posts.js
  node scripts/list-users-with-posts.js all
  node scripts/list-users-with-posts.js approved
  node scripts/list-users-with-posts.js published
  node scripts/list-users-with-posts.js top
`);
    process.exit(1);
  }

  try {
    console.log("🔍 Connecting to database...");
    await pool.getConnection();
    console.log("✅ Database connected");

    const filter = command || "all";
    await displayUsersWithPosts(filter);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

async function displayUsersWithPosts(filter) {
  try {
    let query = `
      SELECT 
        u.id,
        u.telegram_id,
        u.name,
        u.phone,
        u.user_type,
        u.is_admin,
        u.is_active,
        u.created_at,
        COUNT(p.id) as total_posts,
        COUNT(CASE WHEN p.status = 'approved' THEN 1 END) as approved_posts,
        COUNT(CASE WHEN p.status = 'published' THEN 1 END) as published_posts,
        COALESCE(SUM(contact_clicks.count), 0) as total_contact_clicks,
        COALESCE(SUM(view_clicks.count), 0) as total_view_clicks,
        COALESCE(SUM(contact_clicks.count), 0) + COALESCE(SUM(view_clicks.count), 0) as total_clicks
      FROM users u
      LEFT JOIN posts p ON u.id = p.user_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as count 
        FROM post_clicks 
        WHERE click_type = 'contact' 
        GROUP BY post_id
      ) contact_clicks ON p.id = contact_clicks.post_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as count 
        FROM post_clicks 
        WHERE click_type = 'view' 
        GROUP BY post_id
      ) view_clicks ON p.id = view_clicks.post_id
    `;

    let whereClause = "";
    let params = [];

    switch (filter) {
      case "approved":
        whereClause = " WHERE p.status = 'approved'";
        break;
      case "published":
        whereClause = " WHERE p.status = 'published'";
        break;
      default:
        break;
    }

    query += whereClause;
    query += `
      GROUP BY u.id, u.telegram_id, u.name, u.phone, u.user_type, u.is_admin, u.is_active, u.created_at
    `;

    if (filter === "top") {
      query += " ORDER BY total_clicks DESC, total_posts DESC LIMIT 20";
    } else {
      query += " ORDER BY total_clicks DESC, u.created_at DESC";
    }

    const [users] = await pool.query(query, params);

    if (users.length === 0) {
      console.log(
        `📭 No users with posts found${
          filter !== "all" ? ` (filter: ${filter})` : ""
        }`
      );
      return;
    }

    console.log(
      `\n👥 Users with Posts (${users.length} total${
        filter !== "all" ? `, filtered by: ${filter}` : ""
      }):\n`
    );

    console.log(
      "ID | Telegram ID    | Name              | Phone         | Type    | Admin | Status | Posts | Approved | Published | Contact | Views | Total | Created"
    );
    console.log(
      "---|----------------|-------------------|---------------|---------|-------|--------|-------|----------|-----------|---------|-------|-------|---------"
    );

    for (const user of users) {
      const id = String(user.id).padEnd(2);
      const telegramId = String(user.telegram_id).padEnd(14);
      const name = (user.name || "No name").padEnd(17).substring(0, 17);
      const phone = (user.phone || "No phone").padEnd(13).substring(0, 13);
      const userType = (user.user_type || "None").padEnd(7).substring(0, 7);
      const isAdmin = user.is_admin ? "Yes" : "No";
      const status = user.is_active !== false ? "🟢 Active" : "🔴 Inactive";
      const totalPosts = String(user.total_posts).padEnd(5);
      const approvedPosts = String(user.approved_posts).padEnd(8);
      const publishedPosts = String(user.published_posts).padEnd(9);
      const contactClicks = String(user.total_contact_clicks).padEnd(7);
      const viewClicks = String(user.total_view_clicks).padEnd(5);
      const totalClicks = String(user.total_clicks).padEnd(5);
      const created = user.created_at.toISOString().substring(0, 10);

      console.log(
        `${id} | ${telegramId} | ${name} | ${phone} | ${userType} | ${isAdmin.padEnd(
          5
        )} | ${status}   | ${totalPosts} | ${approvedPosts} | ${publishedPosts} | ${contactClicks} | ${viewClicks} | ${totalClicks} | ${created}`
      );
    }

    // Summary statistics
    console.log("\n📊 Summary Statistics:");
    const totalUsers = users.length;
    const totalPosts = users.reduce((sum, user) => sum + user.total_posts, 0);
    const totalApprovedPosts = users.reduce(
      (sum, user) => sum + user.approved_posts,
      0
    );
    const totalPublishedPosts = users.reduce(
      (sum, user) => sum + user.published_posts,
      0
    );
    const totalClicks = users.reduce((sum, user) => sum + user.total_clicks, 0);

    console.log(`   Total Users with Posts: ${totalUsers}`);
    console.log(`   Total Posts: ${totalPosts}`);
    console.log(`   Total Approved Posts: ${totalApprovedPosts}`);
    console.log(`   Total Published Posts: ${totalPublishedPosts}`);
    console.log(`   Total Clicks: ${totalClicks}`);
    console.log(
      `   Average Clicks per User: ${(totalClicks / totalUsers).toFixed(1)}`
    );

    // Top users
    const topUsers = users
      .sort((a, b) => b.total_clicks - a.total_clicks)
      .slice(0, 5);
    if (topUsers.length > 0) {
      console.log("\n🏆 Top 5 Users by Clicks:");
      topUsers.forEach((user, index) => {
        console.log(
          `   ${index + 1}. ${user.name || "No name"} (${user.telegram_id}) - ${
            user.total_clicks
          } clicks, ${user.total_posts} posts`
        );
      });
    }
  } catch (error) {
    console.error("❌ Error fetching users with posts:", error.message);
    throw error;
  }
}

listUsersWithPosts().catch(console.error);
