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
        imagen_perfil: usuario.rows[0].imagen_perfil,
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

// 📌 Registro de usuario (Crea un nuevo usuario con contraseña encriptada)
router.post("/register", async (req, res) => {
  try {
    const {
      nombre,
      correo,
      password,
      telefono,
      direccion,
      fecha_nacimiento,
      genero,
      pais,
      lenguaje,
      referido_por
    } = req.body;

    // Validar campos obligatorios
    if (!nombre || !correo || !password) {
      return res.status(400).json({ error: "Nombre, correo y contraseña son obligatorios" });
    }

    // Validar formato de correo
    const correoRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!correoRegex.test(correo)) {
      return res.status(400).json({ error: "Correo electrónico inválido" });
    }

    // Validar longitud mínima de la contraseña
    if (password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }

    // Validar fecha de nacimiento
    if (fecha_nacimiento) {
      const fecha = new Date(fecha_nacimiento);
      const hoy = new Date();
      if (isNaN(fecha.getTime()) || fecha > hoy) {
        return res.status(400).json({ error: "Fecha de nacimiento inválida" });
      }
    }

    // Validar género
    const generosPermitidos = ["masculino", "femenino", "otro", "prefiero no decir"];
    if (genero && !generosPermitidos.includes(genero.toLowerCase())) {
      return res.status(400).json({ error: "Género inválido" });
    }

    // Validar teléfono (opcional, debe ser numérico)
    if (telefono && !/^\d{7,15}$/.test(telefono)) {
      return res.status(400).json({ error: "Teléfono inválido (solo números, mínimo 7 dígitos)" });
    }

    // Validar lenguaje permitido
    const lenguajesPermitidos = ["es", "en", "pt"];
    if (lenguaje && !lenguajesPermitidos.includes(lenguaje.toLowerCase())) {
      return res.status(400).json({ error: "Lenguaje no soportado" });
    }

    // Verificar si el correo ya existe
    const usuarioExistente = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);
    if (usuarioExistente.rows.length > 0) {
      return res.status(409).json({ error: "El correo ya está registrado." });
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar usuario
    const nuevoUsuario = await pool.query(
      `INSERT INTO usuarios 
      (nombre, correo, password, telefono, direccion, fecha_nacimiento, genero, pais, lenguaje, es_premium, referido_por, creado_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, NOW())
      RETURNING id, nombre, correo`,
      [
        nombre,
        correo,
        hashedPassword,
        telefono || null,
        direccion || null,
        fecha_nacimiento || null,
        genero || null,
        pais || null,
        lenguaje || "es",
        referido_por || null
      ]
    );

    const usuario = nuevoUsuario.rows[0];

    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(201).json({
      mensaje: "Usuario registrado correctamente.",
      token,
      user: {
        id: usuario.id,
        nombreCompleto: usuario.nombre,
        correo: usuario.correo,
        imagen_perfil: null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
