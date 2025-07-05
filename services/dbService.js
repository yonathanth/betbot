const { pool, closePool } = require("../config/database");

// Add retry wrapper for database operations
async function withRetry(operation, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Only retry on connection errors
      if (
        error.code === "ECONNRESET" ||
        error.code === "PROTOCOL_CONNECTION_LOST" ||
        error.code === "ETIMEDOUT"
      ) {
        console.log(
          `Database operation failed (attempt ${attempt}/${maxRetries}):`,
          error.message
        );

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * attempt, 5000); // Exponential backoff, max 5 seconds
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError;
}

// Memory cleanup function
async function cleanupOldData() {
  try {
    // Delete old clicks (keep only last 30 days)
    await pool.query(
      "DELETE FROM post_clicks WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );

    // Clean up orphaned images
    await pool.query(`
      DELETE FROM post_images 
      WHERE post_id NOT IN (SELECT id FROM posts)
    `);

    console.log("🧹 Database cleanup completed");
  } catch (error) {
    console.error("❌ Database cleanup failed:", error.message);
  }
}

// Schedule periodic cleanup (every 24 hours)
if (process.env.NODE_ENV === "production") {
  setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
  console.log("📅 Scheduled daily database cleanup");
}

module.exports = {
  // Cleanup and connection management
  async closeConnections() {
    await closePool();
  },

  async performMaintenance() {
    await cleanupOldData();
  },

  // User methods
  async getUser(telegramId) {
    return withRetry(async () => {
      const [rows] = await pool.query(
        "SELECT * FROM users WHERE telegram_id = ?",
        [telegramId]
      );
      return rows[0] || null;
    });
  },

  async createUser(telegramId) {
    return withRetry(async () => {
      const [result] = await pool.query(
        "INSERT INTO users (telegram_id) VALUES (?)",
        [telegramId]
      );
      return result.insertId;
    });
  },

  async updateUser(telegramId, userData) {
    return withRetry(async () => {
      const updates = [];
      const values = [];

      Object.keys(userData).forEach((key) => {
        if (userData[key] !== undefined) {
          updates.push(`${key} = ?`);
          values.push(userData[key]);
        }
      });

      if (updates.length === 0) return;

      values.push(telegramId);
      await pool.query(
        `UPDATE users SET ${updates.join(", ")} WHERE telegram_id = ?`,
        values
      );
    });
  },

  // Post methods
  async createPost(telegramId, postData) {
    try {
      const [users] = await pool.query(
        "SELECT id FROM users WHERE telegram_id = ?",
        [telegramId]
      );

      if (!users.length) {
        throw new Error("User not found");
      }

      const userId = users[0].id;

      const [result] = await pool.query(
        "INSERT INTO posts (user_id, property_type, title, description, location, price, contact_info) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          userId,
          postData.property_type || "residential",
          postData.title || "",
          postData.description || "",
          postData.location || "",
          postData.price || "",
          postData.contact_info || "",
        ]
      );
      return result.insertId;
    } catch (error) {
      console.error("Error creating post:", error);
      throw error;
    }
  },

  async updatePost(telegramId, postData) {
    try {
      const [users] = await pool.query(
        "SELECT id FROM users WHERE telegram_id = ?",
        [telegramId]
      );

      if (!users.length) {
        throw new Error("User not found");
      }

      const userId = users[0].id;

      // Get the latest pending post for this user
      const [posts] = await pool.query(
        "SELECT id FROM posts WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
        [userId]
      );

      if (!posts.length) {
        throw new Error("No pending post found");
      }

      const updates = [];
      const values = [];

      Object.keys(postData).forEach((key) => {
        if (postData[key] !== undefined) {
          updates.push(`${key} = ?`);
          values.push(postData[key]);
        }
      });

      if (updates.length === 0) return;

      values.push(posts[0].id);
      await pool.query(
        `UPDATE posts SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

      return posts[0].id;
    } catch (error) {
      console.error("Error updating post:", error);
      throw error;
    }
  },

  async getPost(postId) {
    try {
      const [rows] = await pool.query(
        `
        SELECT p.*, u.name as user_name, u.telegram_id, u.phone 
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `,
        [postId]
      );

      return rows[0] || null;
    } catch (error) {
      console.error("Error getting post:", error);
      throw error;
    }
  },

  async getPendingPosts() {
    try {
      const [rows] = await pool.query(`
        SELECT p.*, u.name as user_name, u.telegram_id, u.phone 
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.status = 'pending'
        ORDER BY p.created_at ASC
      `);
      return rows;
    } catch (error) {
      console.error("Error getting pending posts:", error);
      throw error;
    }
  },

  async updatePostStatus(postId, status, adminNotes = null) {
    try {
      const updateData = { status };
      if (status === "published") {
        updateData.published_at = new Date();
      }
      if (adminNotes) {
        updateData.admin_notes = adminNotes;
      }

      const updates = Object.keys(updateData).map((key) => `${key} = ?`);
      const values = Object.values(updateData);
      values.push(postId);

      await pool.query(
        `UPDATE posts SET ${updates.join(", ")} WHERE id = ?`,
        values
      );
    } catch (error) {
      console.error("Error updating post status:", error);
      throw error;
    }
  },

  // Admin methods
  async getStats() {
    try {
      const [totalUsers] = await pool.query(
        "SELECT COUNT(*) as count FROM users"
      );
      const [totalPosts] = await pool.query(
        "SELECT COUNT(*) as count FROM posts"
      );
      const [pendingPosts] = await pool.query(
        "SELECT COUNT(*) as count FROM posts WHERE status = 'pending'"
      );
      const [publishedPosts] = await pool.query(
        "SELECT COUNT(*) as count FROM posts WHERE status = 'published'"
      );

      return {
        totalUsers: totalUsers[0].count,
        totalPosts: totalPosts[0].count,
        pendingPosts: pendingPosts[0].count,
        publishedPosts: publishedPosts[0].count,
      };
    } catch (error) {
      console.error("Error getting stats:", error);
      throw error;
    }
  },

  async isAdmin(telegramId) {
    try {
      const [rows] = await pool.query(
        "SELECT is_admin FROM users WHERE telegram_id = ?",
        [telegramId]
      );
      return rows[0]?.is_admin || false;
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  },

  // Photo methods
  async savePostPhotos(telegramId, photos) {
    try {
      const [users] = await pool.query(
        "SELECT id FROM users WHERE telegram_id = ?",
        [telegramId]
      );

      if (!users.length) {
        throw new Error("User not found");
      }

      const userId = users[0].id;

      // Get the latest pending post for this user
      const [posts] = await pool.query(
        "SELECT id FROM posts WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
        [userId]
      );

      if (!posts.length) {
        throw new Error("No pending post found");
      }

      const postId = posts[0].id;

      // Insert all photos
      for (const photo of photos) {
        await pool.query(
          "INSERT INTO post_images (post_id, telegram_file_id, file_type) VALUES (?, ?, ?)",
          [postId, photo.file_id, "photo"]
        );
      }

      console.log(`✅ Saved ${photos.length} photos for post #${postId}`);
      return postId;
    } catch (error) {
      console.error("Error saving post photos:", error);
      throw error;
    }
  },

  async getPostPhotos(postId) {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM post_images WHERE post_id = ? ORDER BY created_at ASC",
        [postId]
      );
      return rows;
    } catch (error) {
      console.error("Error getting post photos:", error);
      throw error;
    }
  },

  // Click tracking methods
  async recordClick(postId, userTelegramId, clickType = "contact") {
    try {
      await pool.query(
        "INSERT INTO post_clicks (post_id, user_telegram_id, click_type) VALUES (?, ?, ?)",
        [postId, userTelegramId, clickType]
      );
    } catch (error) {
      console.error("Error recording click:", error);
      throw error;
    }
  },

  async getPostStats(postId) {
    try {
      const [post] = await pool.query(
        "SELECT id, title, location, price, created_at FROM posts WHERE id = ?",
        [postId]
      );

      if (!post.length) {
        return null;
      }

      const [contactClicks] = await pool.query(
        "SELECT COUNT(*) as count FROM post_clicks WHERE post_id = ? AND click_type = 'contact'",
        [postId]
      );

      const [viewClicks] = await pool.query(
        "SELECT COUNT(*) as count FROM post_clicks WHERE post_id = ? AND click_type = 'view'",
        [postId]
      );

      const [uniqueClickers] = await pool.query(
        "SELECT COUNT(DISTINCT user_telegram_id) as count FROM post_clicks WHERE post_id = ?",
        [postId]
      );

      return {
        post: post[0],
        contactClicks: contactClicks[0].count,
        viewClicks: viewClicks[0].count,
        uniqueClickers: uniqueClickers[0].count,
      };
    } catch (error) {
      console.error("Error getting post stats:", error);
      throw error;
    }
  },

  async getPostByChannelMessageId(messageId, channelId) {
    try {
      // This is a simple approach - in a real app you'd store message IDs
      // For now, we'll need to implement this differently
      return null;
    } catch (error) {
      console.error("Error getting post by message ID:", error);
      throw error;
    }
  },

  async getAdmins() {
    try {
      const [rows] = await pool.query(
        "SELECT telegram_id FROM users WHERE is_admin = TRUE"
      );
      return rows;
    } catch (error) {
      console.error("Error getting admins:", error);
      throw error;
    }
  },

  async deletePostPhotos(postId) {
    try {
      await pool.query("DELETE FROM post_images WHERE post_id = ?", [postId]);
    } catch (error) {
      console.error("Error deleting post photos:", error);
      throw error;
    }
  },

  async updatePostByAdmin(postId, updateData) {
    try {
      const updates = [];
      const values = [];

      Object.keys(updateData).forEach((key) => {
        if (updateData[key] !== undefined) {
          updates.push(`${key} = ?`);
          values.push(updateData[key]);
        }
      });

      if (updates.length === 0) return;

      values.push(postId);
      await pool.query(
        `UPDATE posts SET ${updates.join(", ")} WHERE id = ?`,
        values
      );
    } catch (error) {
      console.error("Error updating post by admin:", error);
      throw error;
    }
  },
};
