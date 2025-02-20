const express = require("express");
const pool = require("../bd");
const verificarToken = require("../middlewares/auth");
const router = express.Router();

// 📌 Obtener todos los grupos (PROTEGIDO)
router.get("/", verificarToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    console.log("🔍 Buscando grupos para usuario:", usuario_id);

    const grupos = await pool.query(
      `SELECT g.id, g.nombre, g.imagen, 
              COALESCE(SUM(gastos.monto), 0) AS total 
       FROM grupos g
       JOIN usuarios_grupos ug ON g.id = ug.grupo_id
       LEFT JOIN gastos ON g.id = gastos.id_grupo  -- 🔹 Cambié grupo_id por id_grupo
       WHERE ug.usuario_id = $1
       GROUP BY g.id`,
      [usuario_id]
    );

    console.log("📋 Grupos encontrados:", grupos.rows);
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
    await pool.query("DELETE FROM grupos WHERE id = $1", [id]);
    res.json({ mensaje: "Grupo eliminado correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
