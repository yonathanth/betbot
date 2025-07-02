const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "betbot",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  idleTimeout: 60000,
  connectTimeout: 60000,
});

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Database connected successfully");
    connection.release();
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }
}

// Initialize database schema
async function initializeDatabase() {
  try {
    // Create users table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        telegram_id BIGINT UNIQUE NOT NULL,
        name VARCHAR(255),
        phone VARCHAR(50),
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_telegram_id (telegram_id),
        INDEX idx_created_at (created_at)
      )
    `);

    // Create posts table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS posts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        property_type ENUM('residential', 'commercial') NOT NULL,
        title VARCHAR(500),
        description TEXT,
        location VARCHAR(255),
        price VARCHAR(100),
        contact_info TEXT,
        status ENUM('pending', 'approved', 'rejected', 'published') DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        published_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_property_type (property_type)
      )
    `);

    // Create post_images table for future image support
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS post_images (
        id INT PRIMARY KEY AUTO_INCREMENT,
        post_id INT NOT NULL,
        telegram_file_id VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        INDEX idx_post_id (post_id)
      )
    `);

    console.log("Database schema initialized successfully");
  } catch (error) {
    console.error("Database schema initialization failed:", error.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection, initializeDatabase };
