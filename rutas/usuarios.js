const express = require("express");
const pool = require("../bd"); // Importar conexión a la base de datos
const router = express.Router();

// Ruta para obtener todos los usuarios
router.get("/", async (req, res) => {
  try {
    const usuarios = await pool.query("SELECT * FROM usuarios");
    res.json(usuarios.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ruta para crear un usuario
router.post("/", async (req, res) => {
  try {
    const { nombre, correo } = req.body;
    const nuevoUsuario = await pool.query(
      "INSERT INTO usuarios (nombre, correo) VALUES ($1, $2) RETURNING *",
      [nombre, correo]
    );
    res.json(nuevoUsuario.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
