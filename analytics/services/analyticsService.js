// Analytics service - database queries for analytics data

const { pool } = require("../../config/database");

// Get dashboard statistics
async function getDashboardStats() {
  try {
    // Get total users count
    const [usersResult] = await pool.query(`
      SELECT COUNT(*) as total FROM users WHERE is_active = TRUE
    `);
    const totalUsers = usersResult[0].total;

    // Get total posts count (published and rented)
    const [postsResult] = await pool.query(`
      SELECT COUNT(*) as total FROM posts WHERE status IN ('published', 'rented')
    `);
    const totalPosts = postsResult[0].total;

    // Get total clicks count
    const [clicksResult] = await pool.query(`
      SELECT COUNT(*) as total FROM post_clicks
    `);
    const totalClicks = clicksResult[0].total;

    return {
      totalUsers,
      totalPosts,
      totalClicks,
    };
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    throw error;
  }
}

async function getUsersWithStats() {
  try {
    const [users] = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.phone,
        u.user_type,
        u.is_admin,
        u.is_active,
        u.created_at,
        COALESCE(posts_count.count, 0) as posts_count,
        COALESCE(clicks_count.count, 0) as total_clicks
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) as count
        FROM posts
        WHERE status IN ('published', 'rented')
        GROUP BY user_id
      ) posts_count ON u.id = posts_count.user_id
      LEFT JOIN (
        SELECT p.user_id, COUNT(pc.id) as count
        FROM posts p
        JOIN post_clicks pc ON p.id = pc.post_id
        WHERE p.status IN ('published', 'rented')
        GROUP BY p.user_id
      ) clicks_count ON u.id = clicks_count.user_id
      WHERE u.is_active = TRUE
      ORDER BY u.created_at DESC
    `);

    return users;
  } catch (error) {
    console.error("Error getting users with stats:", error);
    throw error;
  }
}

async function getUserPosts(userId) {
  try {
    const [posts] = await pool.query(
      `
      SELECT
        p.id,
        p.title,
        p.location,
        p.price,
        p.property_type,
        p.status,
        p.created_at,
        p.published_at,
        COALESCE(clicks_count.count, 0) as total_clicks,
        COALESCE(unique_clickers.count, 0) as unique_clickers
      FROM posts p
      LEFT JOIN (
        SELECT post_id, COUNT(*) as count
        FROM post_clicks
        GROUP BY post_id
      ) clicks_count ON p.id = clicks_count.post_id
      LEFT JOIN (
        SELECT post_id, COUNT(DISTINCT user_telegram_id) as count
        FROM post_clicks
        GROUP BY post_id
      ) unique_clickers ON p.id = unique_clickers.post_id
      WHERE p.user_id = ? AND p.status IN ('published', 'rented')
      ORDER BY p.created_at DESC
    `,
      [userId]
    );

    return posts;
  } catch (error) {
    console.error("Error getting user posts:", error);
    throw error;
  }
}

async function getPostsWithStats() {
  try {
    const [posts] = await pool.query(`
      SELECT
        p.id,
        p.title,
        p.location,
        p.price,
        p.property_type,
        p.status,
        p.created_at,
        p.published_at,
        u.name as user_name,
        u.user_type as user_type,
        COALESCE(clicks_count.count, 0) as total_clicks,
        COALESCE(unique_clickers.count, 0) as unique_clickers
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as count
        FROM post_clicks
        GROUP BY post_id
      ) clicks_count ON p.id = clicks_count.post_id
      LEFT JOIN (
        SELECT post_id, COUNT(DISTINCT user_telegram_id) as count
        FROM post_clicks
        GROUP BY post_id
      ) unique_clickers ON p.id = unique_clickers.post_id
      WHERE p.status IN ('published', 'rented')
      ORDER BY p.created_at DESC
    `);

    return posts;
  } catch (error) {
    console.error("Error getting posts with stats:", error);
    throw error;
  }
}

async function getPostClickers(postId) {
  try {
    const [clickers] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.phone,
        u.user_type,
        pc.click_type,
        pc.created_at as clicked_at
      FROM post_clicks pc
      JOIN users u ON pc.user_telegram_id = u.telegram_id
      WHERE pc.post_id = ?
      ORDER BY pc.created_at DESC
    `,
      [postId]
    );

    return clickers;
  } catch (error) {
    console.error("Error getting post clickers:", error);
    throw error;
  }
}

module.exports = {
  getDashboardStats,
  getUsersWithStats,
  getUserPosts,
  getPostsWithStats,
  getPostClickers,
};
