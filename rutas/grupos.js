const express = require("express");
const pool = require("../bd");
const verificarToken = require("../middlewares/auth");
const router = express.Router();

// 📌 Obtener todos los grupos (PROTEGIDO)
router.get("/", verificarToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    //console.log("🔍 Buscando grupos para usuario:", usuario_id);

    const grupos = await pool.query(
      `
      SELECT 
        g.id, 
        g.nombre, 
        g.imagen,
    
        -- Total gastado en el grupo (suma de todos los gastos del grupo)
        COALESCE((
          SELECT SUM(monto) FROM gastos ga WHERE ga.id_grupo = g.id
        ), 0) AS total_gastado,
    
        -- Total adeudado por el usuario en este grupo
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN gastos ga ON ga.id = d.id_gasto
          WHERE d.id_usuario = $1 AND ga.id_grupo = g.id
        ), 0) AS total_adeudado,
    
        -- Total pagado por el usuario en este grupo
        COALESCE((
          SELECT SUM(ga.monto)
          FROM pagos p
          JOIN gastos ga ON ga.id = p.id_gasto
          WHERE p.id_usuario = $1 AND p.pagado = true AND ga.id_grupo = g.id
        ), 0) AS total_pagado
    
      FROM grupos g
      JOIN usuarios_grupos ug ON ug.grupo_id = g.id
      WHERE ug.usuario_id = $1
      GROUP BY g.id, g.nombre, g.imagen
      `,
      [usuario_id]
    );
    

    //console.log("📋 Grupos encontrados:", grupos.rows);
    res.json(grupos.rows);
  } catch (error) {
    console.error("❌ Error en GET /grupos:", error);
    res.status(500).json({ error: "Error obteniendo los grupos", detalles: error.message });
  }
});

// 📌 Crear un nuevo grupo (PROTEGIDO)
router.post("/", verificarToken, async (req, res) => {
  try {
    const { nombre, imagen } = req.body;
    const usuario_id = req.usuario.id;

    // Crear el grupo
    const nuevoGrupo = await pool.query(
      "INSERT INTO grupos (nombre, imagen) VALUES ($1, $2) RETURNING *",
      [nombre, imagen]
    );

    // Asociar el usuario con el grupo
    await pool.query(
      "INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES ($1, $2)",
      [usuario_id, nuevoGrupo.rows[0].id]
    );

    res.json(nuevoGrupo.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creando el grupo" });
  }
});


// 📌 Actualizar un grupo
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    const grupoActualizado = await pool.query(
      "UPDATE grupos SET nombre = $1 WHERE id = $2 RETURNING *",
      [nombre, id]
    );
    res.json(grupoActualizado.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Eliminar un grupo
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Borrar deudas asociadas al grupo
    await pool.query(`
      DELETE FROM deudas
      WHERE id_gasto IN (
        SELECT id FROM gastos WHERE id_grupo = $1
      )
    `, [id]);

    // 2. Borrar gastos asociados
    await pool.query("DELETE FROM gastos WHERE id_grupo = $1", [id]);

    // 3. Borrar registros en usuarios_grupos
    await pool.query("DELETE FROM usuarios_grupos WHERE grupo_id = $1", [id]);

    // 4. Borrar el grupo
    await pool.query("DELETE FROM grupos WHERE id = $1", [id]);

    res.json({ mensaje: "Grupo eliminado correctamente (y deudas liquidadas)." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// 📌 Obtener participantes de un grupo específico
router.get("/:id/participantes", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;

    const participantes = await pool.query(
      `SELECT u.id, u.nombre, u.correo
       FROM usuarios u
       JOIN usuarios_grupos ug ON u.id = ug.usuario_id
       WHERE ug.grupo_id = $1`,
      [id]
    );

    res.json(participantes.rows);
  } catch (error) {
    console.error("❌ Error en GET /grupos/:id/participantes:", error);
    res.status(500).json({ error: "Error obteniendo participantes" });
  }
});

// 📌 Obtener resumen financiero del grupo
router.get("/:id/resumen", verificarToken, async (req, res) => {
  const grupoId = req.params.id;

  try {
    const resultado = await pool.query(
      `
      SELECT 
        g.id AS grupo_id,
    
        -- Total gastado en el grupo
        COALESCE((
          SELECT SUM(monto)
          FROM gastos
          WHERE id_grupo = g.id
        ), 0) AS total_gastado,
    
        -- Total pagado por los usuarios
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN pagos p ON p.id_gasto = d.id_gasto AND p.id_usuario = d.id_usuario
          WHERE d.id_gasto IN (
            SELECT id FROM gastos WHERE id_grupo = g.id
          )
        ), 0) AS total_pagado,
    
        -- Total adeudado = total_gastado - total_pagado
        COALESCE((
          SELECT SUM(monto) FROM gastos WHERE id_grupo = g.id
        ), 0) -
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN pagos p ON p.id_gasto = d.id_gasto AND p.id_usuario = d.id_usuario
          WHERE d.id_gasto IN (
            SELECT id FROM gastos WHERE id_grupo = g.id
          )
        ), 0) AS total_adeudado
    
      FROM grupos g
      WHERE g.id = $1
      GROUP BY g.id
      `,
      [grupoId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error("❌ Error en GET /grupos/:id/resumen:", error);
    res.status(500).json({ error: "Error obteniendo resumen del grupo" });
  }
});



module.exports = router;
