const express = require("express");
const { login, logout, me } = require("../controllers/auth/authController");
const { protect } = require("../middlewares/authMiddleware");
const { loginLimiter } = require("../middlewares/rateLimiters");

const router = express.Router();

router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.get("/me", protect, me);

module.exports = router;
