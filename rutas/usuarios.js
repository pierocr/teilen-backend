const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken"); // Aseguramos que jwt esté importado
const multer = require("multer");
const axios = require("axios");

const pool = require("../bd");
const verificarToken = require("../middlewares/auth");
const supabase = require("../supabase");

require("dotenv").config();

const upload = multer({ storage: multer.memoryStorage() });
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "perfiles";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Crear un nuevo usuario
//    POST /usuarios
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { nombre, correo } = req.body;

    // Validaciones básicas
    if (!nombre || nombre.length < 3) {
      return res
        .status(400)
        .json({ error: "El nombre debe tener al menos 3 caracteres" });
    }
    if (!correo || !correo.includes("@")) {
      return res.status(400).json({ error: "Correo electrónico inválido" });
    }

    // Verificar si ya existe
    const usuarioExiste = await pool.query(
      "SELECT * FROM usuarios WHERE correo = $1",
      [correo]
    );
    if (usuarioExiste.rows.length > 0) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }

    // Insertar
    const nuevoUsuario = await pool.query(
      "INSERT INTO usuarios (nombre, correo) VALUES ($1, $2) RETURNING *",
      [nombre, correo]
    );

    res.json(nuevoUsuario.rows[0]);
  } catch (err) {
    console.error("❌ Error al crear usuario:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Obtener todos los usuarios (PROTEGIDO)
//    GET /usuarios
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", verificarToken, async (req, res) => {
  try {
    const usuarios = await pool.query(
      "SELECT id, nombre, correo FROM usuarios ORDER BY creado_en DESC"
    );
    res.json(usuarios.rows);
  } catch (err) {
    console.error("❌ Error al obtener usuarios:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Obtener perfil del usuario logeado (PROTEGIDO)
//    GET /usuarios/perfil
// ─────────────────────────────────────────────────────────────────────────────
router.get("/perfil", verificarToken, async (req, res) => {
  try {
    // ID proviene del middleware verificarToken
    const userId = req.usuario.id;

    const usuario = await pool.query(
      `
        SELECT id, nombre, correo, telefono, direccion, fecha_nacimiento, imagen_perfil
        FROM usuarios
        WHERE id = $1
      `,
      [userId]
    );

    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    res.json(usuario.rows[0]);
  } catch (err) {
    console.error("❌ Error en GET /usuarios/perfil:", err);
    res.status(500).json({ error: "Error al obtener el perfil" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Obtener resumen financiero (PROTEGIDO)
//    GET /usuarios/resumen
// ─────────────────────────────────────────────────────────────────────────────
router.get("/resumen", verificarToken, async (req, res) => {
  const usuarioId = req.usuario.id;

  try {
    const query = `
      SELECT 
        COALESCE(SUM(CASE 
          WHEN d.id_usuario = $1 AND p.id IS NOT NULL THEN d.monto 
          ELSE 0 
        END), 0) AS total_a_favor,

        COALESCE(SUM(CASE 
          WHEN d.id_usuario = $1 AND p.id IS NULL THEN d.monto 
          ELSE 0 
        END), 0) AS total_adeudado,

        COALESCE(SUM(CASE 
          WHEN g.pagado_por = $1 
            AND d.id_usuario != $1 
            AND p.id IS NULL 
          THEN d.monto 
          ELSE 0 
        END), 0) AS total_por_cobrar

      FROM deudas d
      LEFT JOIN pagos p 
        ON p.id_gasto = d.id_gasto 
       AND p.id_usuario = d.id_usuario
      JOIN gastos g 
        ON g.id = d.id_gasto
      WHERE d.id_usuario = $1 
         OR g.pagado_por = $1;
    `;

    const resultado = await pool.query(query, [usuarioId]);
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error("❌ Error en GET /usuarios/resumen:", error);
    res.status(500).json({ error: "Error al obtener el resumen financiero" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Editar datos del usuario (PROTEGIDO)
//    PATCH /usuarios/editar
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/editar", verificarToken, async (req, res) => {
  try {
    const { id: userId } = req.usuario; // del token
    const { nombre, telefono, direccion, fecha_nacimiento } = req.body;

    // Validaciones mínimas:
    if (!nombre || nombre.length < 3) {
      return res
        .status(400)
        .json({ error: "El nombre debe tener al menos 3 caracteres" });
    }

    const query = `
      UPDATE usuarios
      SET nombre = $1,
          telefono = $2,
          direccion = $3,
          fecha_nacimiento = $4
      WHERE id = $5
      RETURNING id, nombre, correo, telefono, direccion, fecha_nacimiento, imagen_perfil
    `;
    const values = [nombre, telefono, direccion, fecha_nacimiento, userId];

    const resultado = await pool.query(query, values);
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error("❌ Error en /usuarios/editar:", error);
    res
      .status(500)
      .json({ error: "Error al editar los datos del usuario" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Subir imagen de perfil (PROTEGIDO)
//    POST /usuarios/imagen
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/imagen",
  verificarToken,
  upload.single("imagen"),
  async (req, res) => {
    const { id: userId } = req.usuario;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No se envió ninguna imagen" });
    }

    try {
      const nombreArchivo = `perfil_${userId}_${Date.now()}.jpg`;

      // Usamos el método upload del SDK
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(nombreArchivo, file.buffer, {
          contentType: file.mimetype,
          upsert: true, // sobrescribe si existe
        });

      if (error) {
        console.error("❌ Error al subir la imagen:", error);
        return res
          .status(500)
          .json({ error: "Error al subir la imagen a Supabase Storage" });
      }

      // Generamos la URL pública
      const { data: publicData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(nombreArchivo);

      const imagenUrl = publicData.publicUrl;

      // Guardamos la URL en la base de datos
      await pool.query(
        "UPDATE usuarios SET imagen_perfil = $1 WHERE id = $2",
        [imagenUrl, userId]
      );

      res.json({ mensaje: "Imagen subida correctamente", url: imagenUrl });
    } catch (error) {
      console.error("❌ Error al subir imagen:", error.message);
      res.status(500).json({ error: "Error al subir la imagen" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. Test Storage (opcional)
//    POST /usuarios/test-storage
// ─────────────────────────────────────────────────────────────────────────────
router.post("/test-storage", async (req, res) => {
  try {
    const response = await axios.post(
      `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`,
      { prefix: "" },
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      mensaje: "Conexión al Storage OK ✅",
      archivos: response.data,
    });
  } catch (error) {
    console.error("❌ Error al conectar con el Storage:", error.message);
    if (error.response) {
      console.error("📥 Detalle:", error.response.data);
      return res
        .status(500)
        .json({
          error: "Error al conectar con el Storage",
          detalle: error.response.data,
        });
    }
    res.status(500).json({ error: "Error desconocido" });
  }
});

// GET /usuarios/buscar?q=texto
router.get("/buscar", verificarToken, async (req, res) => {
  try {
    const { q } = req.query; 
    if (!q) {
      return res.json([]); 
    }

    // Buscar por nombre o correo que contenga `q`
    const query = `
      SELECT id, nombre, correo, imagen_perfil
      FROM usuarios
      WHERE 
        LOWER(nombre) LIKE LOWER('%' || $1 || '%')
        OR LOWER(correo) LIKE LOWER('%' || $1 || '%')
      LIMIT 10
    `;
    const resultado = await pool.query(query, [q]);
    res.json(resultado.rows);
  } catch (error) {
    console.error("Error en /usuarios/buscar:", error);
    res.status(500).json({ error: "Error al buscar usuarios" });
  }
});


module.exports = router;
