const express = require("express");
const pool = require("../bd");
const verificarToken = require("../middlewares/auth");
const router = express.Router();

// 📌 Obtener los gastos de un grupo con detalles de pago y deudas
router.get("/:id_grupo", verificarToken, async (req, res) => {
  try {
    const { id_grupo } = req.params;

    const gastos = await pool.query(
      `SELECT g.id, g.descripcion, g.monto, g.pagado_por, g.categoria, 
              u.nombre AS pagado_por_nombre, u.correo AS pagado_por_correo
       FROM gastos g
       JOIN usuarios u ON g.pagado_por = u.id
       WHERE g.id_grupo = $1
       ORDER BY g.creado_en DESC`,
      [id_grupo]
    );

    // Para cada gasto, buscar las deudas asociadas
    for (let gasto of gastos.rows) {
      const deudas = await pool.query(
        `SELECT d.id_usuario, u.nombre AS deudor_nombre, d.monto 
         FROM deudas d
         JOIN usuarios u ON d.id_usuario = u.id
         WHERE d.id_gasto = $1`,
        [gasto.id]
      );
      gasto.deudas = deudas.rows;
    }

    res.json(gastos.rows);
  } catch (error) {
    console.error("❌ Error en GET /gastos/:id_grupo:", error);
    res
      .status(500)
      .json({ error: "Error obteniendo los gastos", detalles: error.message });
  }
});

// 📌 Crear un nuevo gasto, insertar en tabla gastos y (opcional) generar las deudas
router.post("/", verificarToken, async (req, res) => {
  try {
    const {
      id_grupo,
      monto,
      descripcion,
      pagado_por,
      id_usuarios, // array de IDs de usuarios que participan en el gasto
      categoria,
    } = req.body;

    // Validación de datos
    if (!id_grupo || !monto || !descripcion || !pagado_por || !categoria) {
      return res
        .status(400)
        .json({ error: "Todos los campos son obligatorios" });
    }

    // Verificar que `monto` sea un número válido
    if (isNaN(monto) || monto <= 0) {
      return res.status(400).json({ error: "El monto debe ser un número válido" });
    }

    // Insertar el nuevo gasto
    const nuevoGasto = await pool.query(
      `INSERT INTO gastos (id_grupo, monto, descripcion, pagado_por, categoria)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id_grupo, monto, descripcion, pagado_por, categoria]
    );

    // Validar si hay usuarios para dividir el gasto
    if (Array.isArray(id_usuarios) && id_usuarios.length > 0) {
      const gastoId = nuevoGasto.rows[0].id;
      const montoIndividual = parseFloat((monto / id_usuarios.length).toFixed(2));

      for (const userId of id_usuarios) {
        if (userId == pagado_por) continue; // No creamos deuda para el pagador

        await pool.query(
          `INSERT INTO deudas (id_gasto, id_usuario, monto)
           VALUES ($1, $2, $3)`,
          [gastoId, userId, montoIndividual]
        );
      }
    }

    res.json(nuevoGasto.rows[0]);
  } catch (error) {
    console.error("❌ Error en POST /gastos:", error);
    res.status(500).json({ error: "Error al crear el gasto" });
  }
});


module.exports = router;
