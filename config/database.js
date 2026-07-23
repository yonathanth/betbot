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
  console.log("⏭️  Skipping database schema initialization (tables already exist)");
  console.log("✅ Database ready");
  return;
}

module.exports = { pool, testConnection, initializeDatabase, closePool };
