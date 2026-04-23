const mysql = require("mysql2/promise");

// Optimized pool configuration for VPS
const isProduction = process.env.NODE_ENV === "production";
const connectionLimit = parseInt(
  process.env.DB_POOL_CONNECTION_LIMIT,
  10
) || (isProduction ? 20 : 5);
const queueLimit = parseInt(process.env.DB_POOL_QUEUE_LIMIT, 10);
const effectiveQueueLimit = Number.isNaN(queueLimit)
  ? isProduction
    ? 0
    : 20
  : queueLimit;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "betbot",
  waitForConnections: true,
  connectionLimit,
  queueLimit: effectiveQueueLimit,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000, // Increased keep alive
  acquireTimeout: 15000, // Reduced timeout
  connectTimeout: 20000,
  idleTimeout: 600000, // 10 minutes idle timeout
  maxRetries: 3,
  retryDelay: 2000,
  // Add charset for better performance
  charset: "utf8mb4",
  // Enable compression for network efficiency
  compress: true,
  // Timezone setting
  timezone: "+00:00",
});

// Connection monitoring and cleanup
let connectionMetrics = {
  created: 0,
  destroyed: 0,
  acquired: 0,
  released: 0,
};

// Enhanced connection testing and monitoring
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Database connected successfully");

    // Test the connection with a simple query
    await connection.query("SELECT 1");
    console.log("✅ Database query test successful");

    connection.release();

    // Set up optimized connection monitoring
    pool.on("error", function (err) {
      console.error("Database pool error:", err);
      if (
        err.code === "PROTOCOL_CONNECTION_LOST" ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT"
      ) {
        console.log("🔄 Connection lost - attempting reconnect...");
        setTimeout(() => {
          testConnection().catch(console.error);
        }, 5000);
      }
    });

    // Connection lifecycle monitoring (only in development)
    if (process.env.NODE_ENV !== "production") {
      pool.on("acquire", function (connection) {
        connectionMetrics.acquired++;
        console.log(
          `Connection ${connection.threadId} acquired (Total: ${connectionMetrics.acquired})`
        );
      });

      pool.on("release", function (connection) {
        connectionMetrics.released++;
        console.log(
          `Connection ${connection.threadId} released (Total: ${connectionMetrics.released})`
        );
      });

      pool.on("enqueue", function () {
        console.log("⏳ Waiting for available connection slot");
      });
    }

    // Periodic connection cleanup (every 5 minutes)
    setInterval(() => {
      pool.query("SELECT 1").catch((err) => {
        if (err.message?.includes("Queue limit reached")) {
          console.warn("Keep-alive skipped due to temporary pool saturation");
          return;
        }
        console.error("Keep-alive query failed:", err.message);
      });
    }, 5 * 60 * 1000);

    console.log(
      `📊 Pool configured: connectionLimit=${connectionLimit}, queueLimit=${
        effectiveQueueLimit === 0 ? "unlimited" : effectiveQueueLimit
      }`
    );
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);

    // If it's a connection error, wait and retry
    if (
      error.code === "ECONNREFUSED" ||
      error.code === "ECONNRESET" ||
      error.code === "ETIMEDOUT"
    ) {
      console.log("🔄 Retrying connection in 10 seconds...");
      setTimeout(testConnection, 10000);
      return;
    }

    process.exit(1);
  }
}

// Graceful pool shutdown
async function closePool() {
  try {
    console.log("🔄 Closing database pool...");
    await pool.end();
    console.log("✅ Database pool closed successfully");
    console.log(`📊 Final connection metrics:`, connectionMetrics);
  } catch (error) {
    console.error("❌ Error closing database pool:", error.message);
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
        user_type ENUM('broker', 'owner', 'tenant') DEFAULT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_telegram_id (telegram_id),
        INDEX idx_created_at (created_at)
      )
    `);

    // Add is_active column to existing users table if it doesn't exist
    try {
      await pool.execute(`
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE
      `);
      console.log("✅ Added is_active column to users table");
    } catch (error) {
      // Column already exists, which is fine
      if (!error.message.includes("Duplicate column name")) {
        console.error(
          "Warning: Could not add is_active column:",
          error.message
        );
      }
    }

    // Create posts table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS posts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        property_type ENUM('residential', 'commercial') NOT NULL,
        listing_type ENUM('rent') DEFAULT 'rent',
        title VARCHAR(500),
        villa_type VARCHAR(100),
        villa_type_other VARCHAR(255),
        rooms_count INT,
        floor VARCHAR(50),
        bedrooms INT,
        bathrooms INT,
        bathroom_type VARCHAR(50),
        property_size VARCHAR(100),
        description TEXT,
        location VARCHAR(255),
        price VARCHAR(100),
        contact_info TEXT,
        display_name VARCHAR(255),
        status ENUM('pending', 'approved', 'rejected', 'published') DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        published_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_property_type (property_type),
        INDEX idx_listing_type (listing_type)
      )
    `);

    // Add new columns to existing tables if they don't exist

    // Add user_type column to users table if it doesn't exist
    try {
      await pool.execute(
        `ALTER TABLE users ADD COLUMN user_type ENUM('broker', 'owner') DEFAULT NULL`
      );
      console.log(`✅ Added column: user_type to users table`);
    } catch (error) {
      if (error.message.includes("Duplicate column name")) {
        console.log(`↳ Column user_type already exists in users table`);
      } else {
        console.error(`Error adding column user_type to users:`, error.message);
      }
    }

    // Update user_type ENUM to include 'tenant' if needed
    try {
      await pool.execute(
        `ALTER TABLE users MODIFY COLUMN user_type ENUM('broker', 'owner', 'tenant') DEFAULT NULL`
      );
      console.log(`✅ Updated user_type ENUM to include 'tenant'`);
    } catch (error) {
      if (error.message.includes("tenant")) {
        console.log(`↳ user_type already includes 'tenant' value`);
      } else {
        console.error(`Error updating user_type ENUM:`, error.message);
      }
    }

    // Add 'rented' status to posts table if it doesn't exist
    try {
      await pool.execute(
        `ALTER TABLE posts MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'published', 'rented') DEFAULT 'pending'`
      );
      console.log(`✅ Added 'rented' status to posts table`);
    } catch (error) {
      console.log(
        `↳ Posts status column already includes 'rented' or error:`,
        error.message
      );
    }

    // Add new columns to existing posts table if they don't exist
    const columns = [
      {
        name: "listing_type",
        definition: "ENUM('rent') DEFAULT 'rent'",
      },
      { name: "villa_type", definition: "VARCHAR(100)" },
      { name: "villa_type_other", definition: "VARCHAR(255)" },
      { name: "rooms_count", definition: "INT" },
      { name: "floor", definition: "VARCHAR(50)" },
      { name: "bedrooms", definition: "INT" },
      { name: "bathrooms", definition: "INT" },
      { name: "bathroom_type", definition: "VARCHAR(50)" },
      { name: "property_size", definition: "VARCHAR(100)" },
      { name: "display_name", definition: "VARCHAR(255)" },
      { name: "platform_link", definition: "TEXT" },
      { name: "platform_name", definition: "VARCHAR(100)" },
      { name: "channel_message_id", definition: "INT" },
    ];

    for (const column of columns) {
      try {
        await pool.execute(
          `ALTER TABLE posts ADD COLUMN ${column.name} ${column.definition}`
        );
        console.log(`✅ Added column: ${column.name}`);
      } catch (error) {
        if (error.message.includes("Duplicate column name")) {
          // Column already exists, skip
          console.log(`↳ Column ${column.name} already exists`);
        } else {
          console.error(`Error adding column ${column.name}:`, error.message);
        }
      }
    }

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

    // Create post_clicks table for tracking contact button clicks
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS post_clicks (
        id INT PRIMARY KEY AUTO_INCREMENT,
        post_id INT NOT NULL,
        user_telegram_id BIGINT NOT NULL,
        click_type ENUM('contact', 'view', 'media') DEFAULT 'contact',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        INDEX idx_post_id (post_id),
        INDEX idx_user_telegram_id (user_telegram_id),
        INDEX idx_created_at (created_at)
      )
    `);

    // Update existing post_clicks table to include 'media' in ENUM if needed
    try {
      await pool.execute(
        `ALTER TABLE post_clicks MODIFY COLUMN click_type ENUM('contact', 'view', 'media') DEFAULT 'contact'`
      );
      console.log(`✅ Updated post_clicks.click_type ENUM to include 'media'`);
    } catch (error) {
      if (
        error.message.includes("Duplicate entry") ||
        error.message.includes("already exists")
      ) {
        console.log(`↳ Column click_type already includes 'media'`);
      } else {
        console.error(`Error updating click_type ENUM:`, error.message);
      }
    }

    console.log("Database schema initialized successfully");
  } catch (error) {
    console.error("Database schema initialization failed:", error.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection, initializeDatabase, closePool };
