const express = require("express");
const pool = require("../bd");
const verificarToken = require("../middlewares/auth");

const router = express.Router();

// 📌 Obtener todos los usuarios (PROTEGIDO)
router.get("/", verificarToken, async (req, res) => {
  try {
    const usuarios = await pool.query("SELECT id, nombre, correo FROM usuarios ORDER BY creado_en DESC");
    res.json(usuarios.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Crear un nuevo usuario con validaciones
router.post("/", async (req, res) => {
  try {
    const { nombre, correo } = req.body;

    // Validar datos
    if (!nombre || nombre.length < 3) {
      return res.status(400).json({ error: "El nombre debe tener al menos 3 caracteres" });
    }
    if (!correo || !correo.includes("@")) {
      return res.status(400).json({ error: "Correo electrónico inválido" });
    }

    // Verificar si el usuario ya existe por correo
    const usuarioExiste = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);
    if (usuarioExiste.rows.length > 0) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }

    // Insertar usuario
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
