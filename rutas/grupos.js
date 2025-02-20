const express = require("express");
const pool = require("../bd");
const verificarToken = require("../middlewares/auth");

const router = express.Router();

// 📌 Obtener todos los grupos (PROTEGIDO)
router.get("/", verificarToken, async (req, res) => {
  try {
    const grupos = await pool.query("SELECT * FROM grupos ORDER BY creado_en DESC");
    res.json(grupos.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Crear un nuevo grupo (PROTEGIDO)
router.post("/", verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    const nuevoGrupo = await pool.query(
      "INSERT INTO grupos (nombre) VALUES ($1) RETURNING *",
      [nombre]
    );
    res.json(nuevoGrupo.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
