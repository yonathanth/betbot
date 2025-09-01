// Posts controller for analytics

async function getPosts(req, res) {
  try {
    const fs = require("fs");
    const path = require("path");
    const postsTemplate = fs.readFileSync(
      path.join(__dirname, "../public/views/posts.ejs"),
      "utf8"
    );

    res.render("layout", {
      title: "Posts - BetBot Analytics",
      currentPage: "posts",
      body: postsTemplate,
    });
  } catch (error) {
    console.error("Posts page error:", error);
    res.status(500).send("Error loading posts page");
  }
}

async function getPostsData(req, res) {
  try {
    const analyticsService = require("../services/analyticsService");
    const posts = await analyticsService.getPostsWithStats();
    res.json(posts);
  } catch (error) {
    console.error("Posts data error:", error);
    res.status(500).json({ error: "Failed to load posts data" });
  }
}

async function getPostClickers(req, res) {
  try {
    const postId = req.params.id;
    const analyticsService = require("../services/analyticsService");
    const clickers = await analyticsService.getPostClickers(postId);
    res.json(clickers);
  } catch (error) {
    console.error("Post clickers error:", error);
    res.status(500).json({ error: "Failed to load post clickers" });
  }
}

module.exports = {
  getPosts,
  getPostsData,
  getPostClickers,
};
