// routes/invite.js

const express = require("express");
const router = express.Router();

// GET /invite?ref=123
router.get("/", (req, res) => {
  const { ref } = req.query;

  if (!ref) {
    return res.status(400).send("Falta el parámetro ref");
  }

  // Redirige a la app móvil usando deep linking
  const deepLink = `teilenapp://invite?ref=${ref}`;
  res.redirect(deepLink);
});

module.exports = router;
