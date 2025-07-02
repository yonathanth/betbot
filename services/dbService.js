const { pool } = require("../config/database");

module.exports = {
  // User methods
  async getUser(telegramId) {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM users WHERE telegram_id = ?",
        [telegramId]
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error getting user:", error);
      throw error;
    }
  },

  async createUser(telegramId) {
    try {
      const [result] = await pool.query(
        "INSERT INTO users (telegram_id) VALUES (?)",
        [telegramId]
      );
      return result.insertId;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  },

  async updateUser(telegramId, userData) {
    try {
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
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
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
        JOIN users u ON p.user_id = u.id
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

  async updatePostByAdmin(postId, postData) {
    try {
      const updates = [];
      const values = [];

      Object.keys(postData).forEach((key) => {
        if (postData[key] !== undefined) {
          updates.push(`${key} = ?`);
          values.push(postData[key]);
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
};
