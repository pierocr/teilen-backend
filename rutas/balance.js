// balance.js
const express = require("express");
const router = express.Router();
const pool = require("../bd");                // Tu conexión a la BD
const verificarToken = require("../middlewares/auth"); // O "authMiddleware", según tu proyecto

router.get("/", verificarToken, async (req, res) => {
  try {
    const userId = req.usuario.id;

    // Consulta para ver cuánto te deben (total_a_favor) y cuánto debes (total_adeudado)
    const resp = await pool.query(`
      SELECT
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN gastos g ON d.id_gasto = g.id
          WHERE g.pagado_por = $1
        ), 0) as total_a_favor,
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN gastos g ON d.id_gasto = g.id
          WHERE d.id_usuario = $1
        ), 0) as total_adeudado
    `, [userId]);

    const { total_a_favor, total_adeudado } = resp.rows[0];
    const balance = total_a_favor - total_adeudado;

    return res.json({
      balance,
      total_a_favor,
      total_adeudado,
    });
  } catch (err) {
    console.error("Error en GET /balance:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
