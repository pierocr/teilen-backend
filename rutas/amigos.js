const express = require("express");
const pool = require("../bd"); // Conexión a la BD
const verificarToken = require("../middlewares/auth");

const router = express.Router();

// 📌 Obtener lista de amigos
router.get("/", verificarToken, async (req, res) => {
    try {
      const usuario_id = req.usuario.id;
      console.log("📢 Endpoint /amigos llamado por usuario ID:", usuario_id);
  
      const amigos = await pool.query(
        `SELECT u.id, u.nombre, u.correo,
                COALESCE(SUM(CASE WHEN d.id_usuario = $1 THEN d.monto ELSE 0 END), 0) AS le_debo,
                COALESCE(SUM(CASE WHEN g.pagado_por = $1 THEN d.monto ELSE 0 END), 0) AS me_debe
         FROM amigos
         JOIN usuarios u ON amigos.amigo_id = u.id
         LEFT JOIN deudas d ON (d.id_usuario = u.id OR d.id_usuario = $1)
         LEFT JOIN gastos g ON g.id = d.id_gasto
         WHERE amigos.usuario_id = $1
         GROUP BY u.id, u.nombre, u.correo`,
        [usuario_id]
      );
  
      console.log("✅ Amigos encontrados:", amigos.rows.length);
      res.json(amigos.rows);
    } catch (error) {
      console.error("❌ Error obteniendo amigos:", error);
      res.status(500).json({ error: "No se pudieron obtener los amigos", detalles: error.message });
    }
  });  

// 📌 Buscar usuarios por nombre o correo
router.get("/buscar", verificarToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: "Debe proporcionar un nombre o correo" });
    }

    const usuarios = await pool.query(
      `SELECT id, nombre, correo FROM usuarios 
       WHERE (nombre ILIKE $1 OR correo ILIKE $1) 
       AND id <> $2 LIMIT 10`,
      [`%${q}%`, req.usuario.id]
    );

    res.json(usuarios.rows);
  } catch (error) {
    console.error("❌ Error buscando usuarios:", error);
    res.status(500).json({ error: "Error buscando usuarios" });
  }
});

// 📌 Agregar amigo
router.post("/", verificarToken, async (req, res) => {
  try {
    const { amigo_id } = req.body;
    const usuario_id = req.usuario.id;

    if (!amigo_id) {
      return res.status(400).json({ error: "Debe especificar el ID del amigo" });
    }
    if (usuario_id === amigo_id) {
      return res.status(400).json({ error: "No puedes agregarte a ti mismo" });
    }

    await pool.query("INSERT INTO amigos (usuario_id, amigo_id) VALUES ($1, $2)", [usuario_id, amigo_id]);
    res.json({ mensaje: "Amigo agregado exitosamente" });
  } catch (error) {
    console.error("❌ Error agregando amigo:", error);
    res.status(500).json({ error: "No se pudo agregar al amigo" });
  }
});

// Eliminar amigos
router.delete("/:amigo_id", verificarToken, async (req, res) => {
    try {
      const usuario_id = req.usuario.id;
      const { amigo_id } = req.params;
  
      console.log(`📢 Eliminando amistad entre ${usuario_id} y ${amigo_id}`);
  
      const result = await pool.query(
        "DELETE FROM amigos WHERE (usuario_id = $1 AND amigo_id = $2) OR (usuario_id = $2 AND amigo_id = $1)",
        [usuario_id, amigo_id]
      );
  
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "No se encontró la amistad" });
      }
  
      res.json({ mensaje: "Amigo eliminado correctamente" });
    } catch (error) {
      console.error("❌ Error eliminando amigo:", error);
      res.status(500).json({ error: "No se pudo eliminar al amigo" });
    }
  });

module.exports = router;
