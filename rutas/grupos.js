const express = require("express");
const pool = require("../bd");
const router = express.Router();

// Ruta para obtener todos los grupos
router.get("/", async (req, res) => {
  try {
    const grupos = await pool.query("SELECT * FROM grupos");
    res.json(grupos.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ruta para crear un grupo
router.post("/", async (req, res) => {
  try {
    const { nombre } = req.body;
    const nuevoGrupo = await pool.query(
      "INSERT INTO grupos (nombre) VALUES ($1) RETURNING *",
      [nombre]
    );
    res.json(nuevoGrupo.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
