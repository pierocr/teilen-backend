const express = require("express");
const pool = require("../bd");
const router = express.Router();

// Ruta para obtener todos los gastos
router.get("/", async (req, res) => {
  try {
    const gastos = await pool.query("SELECT * FROM gastos");
    res.json(gastos.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ruta para crear un gasto
router.post("/", async (req, res) => {
  try {
    const { id_grupo, monto, descripcion, pagado_por } = req.body;
    const nuevoGasto = await pool.query(
      "INSERT INTO gastos (id_grupo, monto, descripcion, pagado_por) VALUES ($1, $2, $3, $4) RETURNING *",
      [id_grupo, monto, descripcion, pagado_por]
    );
    res.json(nuevoGasto.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
