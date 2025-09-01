require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { pool } = require("../config/database");

async function checkPostStatuses() {
  try {
    console.log("🔍 Connecting to database...");
    await pool.getConnection();
    console.log("✅ Database connected");

    // Check all post statuses
    const [statusCounts] = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM posts 
      GROUP BY status 
      ORDER BY count DESC
    `);

    console.log("\n📊 Post Status Distribution:");
    console.log("Status    | Count");
    console.log("----------|-------");

    for (const row of statusCounts) {
      const status = (row.status || "NULL").padEnd(8);
      console.log(`${status} | ${row.count}`);
    }

    // Check total posts
    const [totalPosts] = await pool.query(
      "SELECT COUNT(*) as count FROM posts"
    );
    console.log(`\n📋 Total Posts: ${totalPosts[0].count}`);

    // Check posts with clicks
    const [postsWithClicks] = await pool.query(`
      SELECT p.status, COUNT(DISTINCT p.id) as posts_with_clicks
      FROM posts p
      JOIN post_clicks pc ON p.id = pc.post_id
      GROUP BY p.status
      ORDER BY posts_with_clicks DESC
    `);

    if (postsWithClicks.length > 0) {
      console.log("\n🖱️ Posts with Clicks by Status:");
      console.log("Status    | Posts with Clicks");
      console.log("----------|------------------");

      for (const row of postsWithClicks) {
        const status = (row.status || "NULL").padEnd(8);
        console.log(`${status} | ${row.posts_with_clicks}`);
      }
    } else {
      console.log("\n🖱️ No posts have clicks yet.");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    process.exit(0);
  }
}

checkPostStatuses().catch(console.error);
