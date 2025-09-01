require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { pool } = require("../config/database");

async function listApprovedPosts() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (
    command &&
    command !== "all" &&
    command !== "recent" &&
    command !== "top"
  ) {
    console.log(`
📋 Published & Rented Posts Listing Script

Usage: node scripts/list-approved-posts.js [filter]

Filters:
  all       - List all published and rented posts (default)
  recent    - List published and rented posts from last 30 days
  top       - List top posts by click count

Examples:
  node scripts/list-approved-posts.js
  node scripts/list-approved-posts.js all
  node scripts/list-approved-posts.js recent
  node scripts/list-approved-posts.js top
`);
    process.exit(1);
  }

  try {
    console.log("🔍 Connecting to database...");
    await pool.getConnection();
    console.log("✅ Database connected");

    const filter = command || "all";
    await displayApprovedPosts(filter);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

async function displayApprovedPosts(filter) {
  try {
    let query = `
      SELECT 
        p.id,
        p.title,
        p.location,
        p.price,
        p.property_type,
        p.listing_type,
        p.status,
        p.created_at,
        p.published_at,
        u.id as user_id,
        u.telegram_id,
        u.name as user_name,
        u.phone as user_phone,
        u.user_type,
        COALESCE(contact_clicks.count, 0) as contact_clicks,
        COALESCE(view_clicks.count, 0) as view_clicks,
        COALESCE(contact_clicks.count, 0) + COALESCE(view_clicks.count, 0) as total_clicks,
        COALESCE(unique_clickers.count, 0) as unique_clickers
      FROM posts p
      JOIN users u ON p.user_id = u.id
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
      LEFT JOIN (
        SELECT post_id, COUNT(DISTINCT user_telegram_id) as count 
        FROM post_clicks 
        GROUP BY post_id
      ) unique_clickers ON p.id = unique_clickers.post_id
      WHERE p.status IN ('published', 'rented')
    `;

    let params = [];

    switch (filter) {
      case "recent":
        query += " AND p.published_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
        break;
      case "top":
        query += " ORDER BY total_clicks DESC, p.published_at DESC";
        break;
      default:
        query += " ORDER BY p.published_at DESC";
        break;
    }

    // Add limit for top posts
    if (filter === "top") {
      query += " LIMIT 20";
    }

    const [posts] = await pool.query(query, params);

    if (posts.length === 0) {
      console.log(
        `📭 No published or rented posts found${
          filter !== "all" ? ` (filter: ${filter})` : ""
        }`
      );
      return;
    }

    console.log(
      `\n📋 Published & Rented Posts (${posts.length} total${
        filter !== "all" ? `, filtered by: ${filter}` : ""
      }):\n`
    );

    // Display detailed table
    console.log(
      "ID | Title                    | Location        | Price    | Type | User Name        | Contact | Views | Total | Unique | Published"
    );
    console.log(
      "---|--------------------------|-----------------|----------|------|------------------|---------|-------|-------|--------|-----------"
    );

    for (const post of posts) {
      const id = String(post.id).padEnd(2);
      const title = (post.title || "No title").padEnd(24).substring(0, 24);
      const location = (post.location || "No location")
        .padEnd(15)
        .substring(0, 15);
      const price = (post.price || "No price").padEnd(8).substring(0, 8);
      const propertyType = (post.property_type || "N/A")
        .padEnd(4)
        .substring(0, 4);
      const userName = (post.user_name || "No name")
        .padEnd(16)
        .substring(0, 16);
      const contactClicks = String(post.contact_clicks).padEnd(7);
      const viewClicks = String(post.view_clicks).padEnd(5);
      const totalClicks = String(post.total_clicks).padEnd(5);
      const uniqueClickers = String(post.unique_clickers).padEnd(6);
      const published = post.published_at
        ? post.published_at.toISOString().substring(0, 10)
        : "Not pub";

      console.log(
        `${id} | ${title} | ${location} | ${price} | ${propertyType} | ${userName} | ${contactClicks} | ${viewClicks} | ${totalClicks} | ${uniqueClickers} | ${published}`
      );
    }

    // Display summary statistics
    console.log("\n📊 Summary Statistics:");

    const totalPosts = posts.length;
    const totalContactClicks = posts.reduce(
      (sum, post) => sum + post.contact_clicks,
      0
    );
    const totalViewClicks = posts.reduce(
      (sum, post) => sum + post.view_clicks,
      0
    );
    const totalClicks = posts.reduce((sum, post) => sum + post.total_clicks, 0);
    const totalUniqueClickers = posts.reduce(
      (sum, post) => sum + post.unique_clickers,
      0
    );

    const propertyTypeStats = {};
    const userTypeStats = {};
    posts.forEach((post) => {
      const propType = post.property_type || "Unknown";
      const userType = post.user_type || "None";
      propertyTypeStats[propType] = (propertyTypeStats[propType] || 0) + 1;
      userTypeStats[userType] = (userTypeStats[userType] || 0) + 1;
    });

    console.log(`   Total Published & Rented Posts: ${totalPosts}`);
    console.log(`   Total Contact Clicks: ${totalContactClicks}`);
    console.log(`   Total View Clicks: ${totalViewClicks}`);
    console.log(`   Total Clicks: ${totalClicks}`);
    console.log(`   Total Unique Clickers: ${totalUniqueClickers}`);
    console.log(
      `   Average Clicks per Post: ${(totalClicks / totalPosts).toFixed(1)}`
    );

    console.log("\n   Property Types:");
    Object.entries(propertyTypeStats).forEach(([type, count]) => {
      console.log(`     ${type}: ${count} posts`);
    });

    console.log("\n   User Types:");
    Object.entries(userTypeStats).forEach(([type, count]) => {
      console.log(`     ${type}: ${count} posts`);
    });

    // Show top performing posts
    const topPosts = posts
      .sort((a, b) => b.total_clicks - a.total_clicks)
      .slice(0, 5);

    if (topPosts.length > 0) {
      console.log("\n🏆 Top 5 Posts by Clicks:");
      topPosts.forEach((post, index) => {
        console.log(
          `   ${index + 1}. "${post.title}" by ${post.user_name} - ${
            post.total_clicks
          } clicks`
        );
      });
    }

    // Show recent posts (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentPosts = posts.filter(
      (post) => post.published_at && new Date(post.published_at) > sevenDaysAgo
    );

    if (recentPosts.length > 0) {
      console.log(`\n🆕 Recent Posts (last 7 days): ${recentPosts.length}`);
    }
  } catch (error) {
    console.error("❌ Error fetching approved posts:", error.message);
    throw error;
  }
}

// Run the script
listApprovedPosts().catch(console.error);
