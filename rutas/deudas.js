const express = require("express");
const pool = require("../bd"); // Conexión a la BD
const router = express.Router();
const verificarToken = require("../middlewares/authMiddleware");

// 📌 Obtener resumen de deudas en un grupo optimizado
router.get("/resumen/:id_grupo", async (req, res) => {
    try {
      const { id_grupo } = req.params;
  
      if (isNaN(id_grupo)) {
        return res.status(400).json({ error: "El ID del grupo debe ser un número válido" });
      }
  
      const resumen = await pool.query(
        `SELECT 
            deudor.nombre AS deudor,
            acreedor.nombre AS acreedor,
            SUM(d.monto) AS monto_total
         FROM deudas d
         JOIN usuarios deudor ON d.id_usuario = deudor.id
         JOIN gastos g ON d.id_gasto = g.id
         JOIN usuarios acreedor ON g.pagado_por = acreedor.id
         WHERE g.id_grupo = $1
         GROUP BY deudor.nombre, acreedor.nombre
         ORDER BY monto_total DESC`,
        [parseInt(id_grupo)]
      );
  
      res.json(resumen.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// 📌 Obtener todas las deudas (PROTEGIDO)
router.get("/", verificarToken, async (req, res) => {
    try {
      const deudas = await pool.query("SELECT * FROM deudas ORDER BY id DESC");
      res.json(deudas.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 📌 Obtener desglose detallado de deudas en un grupo
router.get("/desglose/:id_grupo", verificarToken, async (req, res) => {
  try {
    const { id_grupo } = req.params;
    // Validación robusta
    if (!id_grupo || isNaN(Number(id_grupo))) {
      return res.status(400).json({ error: "El ID del grupo debe ser un número válido" });
    }

    const grupoIdNum = parseInt(id_grupo, 10);

    const desglose = await pool.query(
      `SELECT 
          d.id_usuario AS deudor_id,
          u.nombre AS deudor_nombre,
          g.pagado_por AS acreedor_id,
          u2.nombre AS acreedor_nombre,
          SUM(d.monto) AS monto_total
       FROM deudas d
       JOIN gastos g ON d.id_gasto = g.id
       JOIN usuarios u ON d.id_usuario = u.id
       JOIN usuarios u2 ON g.pagado_por = u2.id
       WHERE g.id_grupo = $1
       GROUP BY d.id_usuario, g.pagado_por, u.nombre, u2.nombre`,
      [grupoIdNum]
    );

    res.json({ resultado: desglose.rows });
  } catch (err) {
    console.error("❌ Error en GET /deudas/desglose/:id_grupo:", err);
    res.status(500).json({ error: "Error obteniendo desglose de deudas" });
  }
});

// 📌 Obtener resumen financiero global de un usuario
router.get("/resumen-financiero/:id_usuario", verificarToken, async (req, res) => {
  try {
    const { id_usuario } = req.params;

    if (isNaN(id_usuario)) {
      return res.status(400).json({ error: "El ID del usuario debe ser un número válido" });
    }

    const usuarioId = parseInt(id_usuario);

    // ✅ Total adeudado por el usuario (solo deudas reales)
    const { rows: totalAdeudadoRows } = await pool.query(
      `SELECT COALESCE(SUM(monto), 0) AS total_adeudado
       FROM deudas
       WHERE id_usuario = $1 AND tipo = 'deuda'`,
      [usuarioId]
    );

    // ✅ Total pagado por el usuario (solo pagos de tipo deuda)
    const { rows: totalPagadoRows } = await pool.query(
      `SELECT COALESCE(SUM(d.monto), 0) AS total_pagado
       FROM pagos p
       JOIN deudas d ON p.id_gasto = d.id_gasto AND p.id_usuario = d.id_usuario
       WHERE p.id_usuario = $1 AND p.pagado = true AND d.tipo = 'deuda'`,
      [usuarioId]
    );

    // Cantidad de grupos en los que participa
    const { rows: gruposRows } = await pool.query(
      `SELECT COUNT(*) AS cantidad_grupos
       FROM "usuarios_grupos"
       WHERE usuario_id = $1`,
      [usuarioId]
    );

    res.json({
      total_adeudado: parseInt(totalAdeudadoRows[0].total_adeudado),
      total_pagado: parseInt(totalPagadoRows[0].total_pagado),
      cantidad_grupos: parseInt(gruposRows[0].cantidad_grupos),
    });

  } catch (err) {
    console.error("❌ Error en GET /resumen-financiero:", err);
    res.status(500).json({ error: "Error al obtener el resumen financiero" });
  }
});

// 📌 Obtener deudas de un usuario en un grupo específico
router.get("/:id_usuario/:id_grupo", async (req, res) => {
  try {
    const { id_usuario, id_grupo } = req.params;

    // Validar que sean números enteros
    if (isNaN(id_usuario) || isNaN(id_grupo)) {
      return res.status(400).json({ error: "Los IDs deben ser números válidos" });
    }

    const deudas = await pool.query(
      `SELECT d.*, g.descripcion, g.monto 
       FROM deudas d 
       JOIN gastos g ON d.id_gasto = g.id 
       WHERE d.id_usuario = $1 AND g.id_grupo = $2`,
      [parseInt(id_usuario), parseInt(id_grupo)]
    );

    res.json(deudas.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 📌 Registrar deudas cuando se crea un gasto
router.post("/", async (req, res) => {
  try {
    const { id_gasto, id_usuarios, monto_total } = req.body;

    // Validaciones
    if (!id_gasto || !id_usuarios || id_usuarios.length === 0 || !monto_total) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    // Verificar que el gasto existe
    const gastoExiste = await pool.query("SELECT id FROM gastos WHERE id = $1", [id_gasto]);
    if (gastoExiste.rows.length === 0) {
      return res.status(400).json({ error: "El gasto no existe" });
    }

    // Calcular monto a dividir entre los usuarios
    const monto_dividido = (monto_total / id_usuarios.length).toFixed(2);

    // Insertar deudas
    for (let id_usuario of id_usuarios) {
      await pool.query(
        "INSERT INTO deudas (id_gasto, id_usuario, monto) VALUES ($1, $2, $3)",
        [id_gasto, id_usuario, monto_dividido]
      );
    }

    res.json({ mensaje: "Deudas registradas correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Marcar una deuda como pagada (eliminarla)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validar que el ID sea un número
    if (isNaN(id)) {
      return res.status(400).json({ error: "El ID debe ser un número válido" });
    }

    await pool.query("DELETE FROM deudas WHERE id = $1", [parseInt(id)]);

    res.json({ mensaje: "Deuda eliminada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Liquidar todas las deudas de un usuario en un grupo
router.delete("/liquidar/:id_usuario/:id_grupo", async (req, res) => {
  try {
    const { id_usuario, id_grupo } = req.params;

    // Validar que sean números
    if (isNaN(id_usuario) || isNaN(id_grupo)) {
      return res.status(400).json({ error: "Los IDs deben ser números válidos" });
    }

    await pool.query(
      `DELETE FROM deudas 
       WHERE id_usuario = $1 
       AND id_gasto IN (SELECT id FROM gastos WHERE id_grupo = $2)`,
      [parseInt(id_usuario), parseInt(id_grupo)]
    );

    res.json({ mensaje: "Todas las deudas liquidadas correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
