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
       LEFT JOIN gastos ON g.id = gastos.id_grupo
       WHERE ug.usuario_id = $1
       GROUP BY g.id`,
      [usuario_id]
    );

    console.log("📋 Grupos encontrados:", grupos.rows);
    res.json(grupos.rows);
  } catch (error) {
    console.error("❌ Error en GET /grupos:", error);
    res
      .status(500)
      .json({ error: "Error obteniendo los grupos", detalles: error.message });
  }
});

// 📌 Crear un nuevo grupo (PROTEGIDO)
router.post("/", verificarToken, async (req, res) => {
  try {
    const { nombre, imagen } = req.body;
    const usuario_id = req.usuario.id;

    if (!nombre) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    // Crear el grupo
    const nuevoGrupo = await pool.query(
      "INSERT INTO grupos (nombre, imagen) VALUES ($1, $2) RETURNING *",
      [nombre, imagen]
    );

    // Asociar el usuario con el grupo (asumiendo que el creador es parte de su propio grupo)
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

// 📌 Actualizar un grupo (PROTEGIDO)
router.put("/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, imagen } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    // Actualizar nombre e imagen del grupo
    const grupoActualizado = await pool.query(
      `UPDATE grupos 
       SET nombre = $1, imagen = $2 
       WHERE id = $3 
       RETURNING *`,
      [nombre, imagen, id]
    );

    if (grupoActualizado.rows.length === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    res.json(grupoActualizado.rows[0]);
  } catch (err) {
    console.error("❌ Error actualizando grupo:", err);
    res.status(500).json({ error: err.message });
  }
});

// 📌 Eliminar un grupo (PROTEGIDO)
router.delete("/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Borrar deudas asociadas al grupo
    await pool.query(
      `DELETE FROM deudas
       WHERE id_gasto IN (
         SELECT id FROM gastos WHERE id_grupo = $1
       )`,
      [id]
    );

    // 2. Borrar gastos asociados
    await pool.query("DELETE FROM gastos WHERE id_grupo = $1", [id]);

    // 3. Borrar registros en usuarios_grupos
    await pool.query("DELETE FROM usuarios_grupos WHERE grupo_id = $1", [id]);

    // 4. Borrar el grupo
    await pool.query("DELETE FROM grupos WHERE id = $1", [id]);

    res.json({
      mensaje: "Grupo eliminado correctamente (y deudas liquidadas).",
    });
  } catch (err) {
    console.error("❌ Error eliminando grupo:", err);
    res.status(500).json({ error: err.message });
  }
});

// 📌 Agregar participantes a un grupo (PROTEGIDO)
router.post("/:id_grupo/agregar", verificarToken, async (req, res) => {
  try {
    const { id_grupo } = req.params;
    const { idUsuario } = req.body;

    if (!idUsuario) {
      return res.status(400).json({ error: "ID del usuario es requerido" });
    }

    // Verificar si el usuario ya está en el grupo
    const existe = await pool.query(
      "SELECT * FROM usuarios_grupos WHERE grupo_id = $1 AND usuario_id = $2",
      [id_grupo, idUsuario]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "El usuario ya está en el grupo" });
    }

    // Agregar al usuario al grupo
    await pool.query(
      "INSERT INTO usuarios_grupos (grupo_id, usuario_id) VALUES ($1, $2)",
      [id_grupo, idUsuario]
    );

    res.json({ mensaje: "Usuario agregado al grupo correctamente" });
  } catch (error) {
    console.error("❌ Error agregando usuario al grupo:", error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// 📌 Obtener participantes de un grupo (PROTEGIDO)
router.get("/:id_grupo/participantes", verificarToken, async (req, res) => {
  try {
    const { id_grupo } = req.params;

    const participantes = await pool.query(
      `SELECT u.id, u.nombre, u.correo
       FROM usuarios u
       JOIN usuarios_grupos ug ON u.id = ug.usuario_id
       WHERE ug.grupo_id = $1`,
      [id_grupo]
    );

    res.json(participantes.rows);
  } catch (error) {
    console.error("❌ Error obteniendo participantes del grupo:", error);
    res
      .status(500)
      .json({ error: "Error obteniendo los participantes del grupo" });
  }
});

module.exports = router;
