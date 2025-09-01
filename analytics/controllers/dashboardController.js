// Dashboard controller for analytics
const analyticsService = require("../services/analyticsService");

async function getDashboard(req, res) {
  try {
    res.render("layout", {
      title: "Dashboard - BetBot Analytics",
      currentPage: "dashboard",
      body: require("fs").readFileSync(
        "analytics/public/views/dashboard.ejs",
        "utf8"
      ),
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("Error loading dashboard");
  }
}

async function getStats(req, res) {
  try {
    const stats = await analyticsService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Failed to load stats" });
  }
}

module.exports = {
  getDashboard,
  getStats,
};
