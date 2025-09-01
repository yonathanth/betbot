// Users controller for analytics

async function getUsers(req, res) {
  try {
    const fs = require("fs");
    const path = require("path");
    const usersTemplate = fs.readFileSync(
      path.join(__dirname, "../public/views/users.ejs"),
      "utf8"
    );

    res.render("layout", {
      title: "Users - BetBot Analytics",
      currentPage: "users",
      body: usersTemplate,
    });
  } catch (error) {
    console.error("Users page error:", error);
    res.status(500).send("Error loading users page");
  }
}

async function getUsersData(req, res) {
  try {
    const analyticsService = require("../services/analyticsService");
    const users = await analyticsService.getUsersWithStats();
    res.json(users);
  } catch (error) {
    console.error("Users data error:", error);
    res.status(500).json({ error: "Failed to load users data" });
  }
}

async function getUserPosts(req, res) {
  try {
    const userId = req.params.id;
    const analyticsService = require("../services/analyticsService");
    const posts = await analyticsService.getUserPosts(userId);
    res.json(posts);
  } catch (error) {
    console.error("User posts error:", error);
    res.status(500).json({ error: "Failed to load user posts" });
  }
}

module.exports = {
  getUsers,
  getUsersData,
  getUserPosts,
};
