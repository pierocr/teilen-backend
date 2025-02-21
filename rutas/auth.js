const express = require("express");
const pool = require("../bd"); // Conexión a la BD
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const router = express.Router();

router.get("/admin-token", async (req, res) => {
    try {
      const token = jwt.sign(
        { id: 1, nombre: "Admin", correo: "admin@example.com", rol: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "100y" } // Expira en 100 años
      );
  
      res.json({ token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });  

// 📌 Registro de usuario (Crea un nuevo usuario con contraseña encriptada)
router.post("/login", async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    // Buscar usuario por correo
    const usuario = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);
    if (usuario.rows.length === 0) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    // Comparar la contraseña
    const esValido = await bcrypt.compare(password, usuario.rows[0].password);
    if (!esValido) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: usuario.rows[0].id,
        nombre: usuario.rows[0].nombre,
        correo: usuario.rows[0].correo,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ENVIAR EL USUARIO AL FRONTEND
    res.json({
      mensaje: "Inicio de sesión exitoso",
      token,
      user: {
        id: usuario.rows[0].id,
        nombreCompleto: usuario.rows[0].nombre,
        correo: usuario.rows[0].correo,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Login de usuario (Genera y devuelve un token JWT)
router.post("/login", async (req, res) => {
  try {
    const { correo, password } = req.body;

    // Validaciones
    if (!correo || !password) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    // Buscar usuario por correo
    const usuario = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);

    if (usuario.rows.length === 0) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    // Comparar la contraseña con la almacenada en la base de datos
    const esValido = await bcrypt.compare(password, usuario.rows[0].password);

    if (!esValido) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    // Generar un token JWT
    const token = jwt.sign(
      { id: usuario.rows[0].id, nombre: usuario.rows[0].nombre, correo: usuario.rows[0].correo },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ mensaje: "Inicio de sesión exitoso", token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Obtener perfil del usuario autenticado
router.get("/perfil", async (req, res) => {
  try {
    const token = req.header("Authorization");

    if (!token) {
      return res.status(401).json({ error: "Acceso denegado. No hay token." });
    }

    // Verificar el token
    try {
      const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
      const usuario = await pool.query("SELECT id, nombre, correo FROM usuarios WHERE id = $1", [decoded.id]);

      if (usuario.rows.length === 0) {
        return res.status(400).json({ error: "Usuario no encontrado." });
      }

      res.json(usuario.rows[0]);
    } catch (err) {
      return res.status(403).json({ error: "Token inválido." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
