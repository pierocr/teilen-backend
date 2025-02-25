const express = require("express");
const pool = require("../bd"); // Conexión a la BD
const verificarToken = require("../middlewares/auth");

const router = express.Router();

// 📌 Obtener la actividad de los grupos del usuario (PROTEGIDO)
router.get("/", verificarToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;

    const actividad = await pool.query(
      `SELECT 
          g.descripcion AS gasto,
          g.monto,
          g.id_grupo,
          grupos.nombre AS grupo_nombre,
          usuarios.nombre AS creador,
          CASE 
              WHEN g.pagado_por = $1 THEN 'Recuperas'
              ELSE 'Debes'
          END AS tipo,
          COALESCE(d.monto, 0) AS monto_balance,
          g.creado_en
      FROM gastos g
      JOIN grupos ON g.id_grupo = grupos.id
      JOIN usuarios ON g.pagado_por = usuarios.id
      LEFT JOIN deudas d ON g.id = d.id_gasto AND d.id_usuario = $1
      WHERE g.id_grupo IN (
          SELECT grupo_id FROM usuarios_grupos WHERE usuario_id = $1
      )
      ORDER BY g.creado_en DESC;`,
      [usuario_id]
    );

    res.json(actividad.rows);
  } catch (error) {
    console.error("❌ Error en GET /actividad:", error);
    res.status(500).json({ error: "Error obteniendo la actividad", detalles: error.message });
  }
});

module.exports = router;
