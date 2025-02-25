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

// Obtener datos del perfil
router.get("/perfil", verificarToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    console.log("📢 Buscando perfil para usuario ID:", usuario_id);

    const resultado = await pool.query(
      `SELECT id, nombre, correo, creado_en FROM usuarios WHERE id = $1`,
      [usuario_id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Obtener balance
    const balanceResp = await pool.query(
      `SELECT 
          COALESCE((SELECT SUM(d.monto) FROM deudas d 
          JOIN gastos g ON d.id_gasto = g.id WHERE g.pagado_por = $1), 0) AS total_a_favor,
          
          COALESCE((SELECT SUM(d.monto) FROM deudas d 
          JOIN gastos g ON d.id_gasto = g.id WHERE d.id_usuario = $1), 0) AS total_adeudado
      FROM usuarios u WHERE u.id = $1`,
      [usuario_id]
    );

    const { total_a_favor, total_adeudado } = balanceResp.rows[0];

    res.json({
      ...resultado.rows[0],
      total_a_favor,
      total_adeudado,
    });
  } catch (error) {
    console.error("❌ Error en GET /perfil:", error); // 🔹 Imprimir error exacto en la terminal
    res.status(500).json({ error: "Error obteniendo perfil", detalles: error.message });
  }
});

// 📌 Generar enlace de invitación para compartir
router.get("/invitar", verificarToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const resultado = await pool.query("SELECT nombre FROM usuarios WHERE id = $1", [usuario_id]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const nombreUsuario = resultado.rows[0].nombre || "un usuario";
    const enlace = `https://teilen.app/invitar?id=${usuario_id}`;
    const mensaje = `¡Únete a Teilen! Agrega a ${nombreUsuario}: ${enlace}`;

    res.json({ enlace, mensaje });
  } catch (error) {
    console.error("❌ Error generando enlace de invitación:", error);
    res.status(500).json({ error: "No se pudo generar la invitación" });
  }
});

router.get("/buscar", verificarToken, async (req, res) => {
  try {
    const { q } = req.query;
    const usuario_id = req.usuario.id;

    console.log("📢 Endpoint /buscar llamado con query:", q);
    console.log("📢 Usuario autenticado ID:", usuario_id);

    if (!q) {
      console.log("⚠️ Error: No se proporcionó un criterio de búsqueda");
      return res.status(400).json({ error: "Debe proporcionar un nombre o correo" });
    }

    const usuarios = await pool.query(
      `SELECT id, nombre, correo FROM usuarios 
       WHERE (nombre ILIKE $1 OR correo ILIKE $1) 
       AND id <> $2 LIMIT 10`,
      [`%${q}%`, usuario_id]
    );

    console.log("✅ Usuarios encontrados:", usuarios.rows.length);

    res.json(usuarios.rows);
  } catch (error) {
    console.error("❌ Error en GET /usuarios/buscar:", error);
    res.status(500).json({ error: "Error buscando usuarios", detalles: error.message });
  }
});
module.exports = router;
