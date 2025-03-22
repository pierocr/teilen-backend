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

// auth.js (por ejemplo, en router.get("/perfil")...):
router.get("/perfil", async (req, res) => {
  try {
    const token = req.header("Authorization");
    if (!token) {
      return res.status(401).json({ error: "Acceso denegado. No hay token." });
    }

    // Verificar el token
    const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
    const usuario = await pool.query(`
      SELECT id, nombre, correo, telefono, direccion, fecha_nacimiento
      FROM usuarios
      WHERE id = $1
    `, [decoded.id]);

    if (usuario.rows.length === 0) {
      return res.status(400).json({ error: "Usuario no encontrado." });
    }

    res.json(usuario.rows[0]);
  } catch (err) {
    return res.status(403).json({ error: "Token inválido." });
  }
});

module.exports = router;
