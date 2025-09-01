const express = require("express");
const router = express.Router();

// Import controllers (we'll create these next)
const dashboardController = require("../controllers/dashboardController");
const usersController = require("../controllers/usersController");
const postsController = require("../controllers/postsController");

// Dashboard routes
router.get("/", dashboardController.getDashboard);
router.get("/api/stats", dashboardController.getStats);

// Users routes
router.get("/users", usersController.getUsers);
router.get("/api/users", usersController.getUsersData);
router.get("/api/user/:id/posts", usersController.getUserPosts);

// Posts routes
router.get("/posts", postsController.getPosts);
router.get("/api/posts", postsController.getPostsData);
router.get("/api/post/:id/clickers", postsController.getPostClickers);

module.exports = router;
