const express = require("express");
const pool = require("../bd"); // Conexión a la BD
const verificarToken = require("../middlewares/auth");

const router = express.Router();

// 📌 Obtener todos los gastos (PROTEGIDO)
router.get("/", verificarToken, async (req, res) => {
  try {
    const gastos = await pool.query("SELECT * FROM gastos ORDER BY creado_en DESC");
    res.json(gastos.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Obtener los gastos de un grupo específico (PROTEGIDO)
router.get("/:id_grupo", verificarToken, async (req, res) => {
  try {
    const { id_grupo } = req.params;
    
    // Validar que sea un número
    if (isNaN(id_grupo)) {
      return res.status(400).json({ error: "El ID del grupo debe ser un número válido" });
    }

    const gastos = await pool.query("SELECT * FROM gastos WHERE id_grupo = $1 ORDER BY creado_en DESC", [parseInt(id_grupo)]);
    res.json(gastos.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Crear un nuevo gasto con validaciones y división de deudas (PROTEGIDO)
router.post("/", verificarToken, async (req, res) => {
  try {
    const { id_grupo, monto, descripcion, pagado_por, id_usuarios } = req.body;

    // Validaciones básicas
    if (!id_grupo || !monto || !descripcion || !pagado_por || !id_usuarios.length) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }
    if (monto <= 0) {
      return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    }

    // Verificar si el grupo existe
    const grupoExiste = await pool.query("SELECT * FROM grupos WHERE id = $1", [id_grupo]);
    if (grupoExiste.rows.length === 0) {
      return res.status(400).json({ error: "El grupo no existe" });
    }

    // Verificar si el usuario que pagó existe
    const usuarioExiste = await pool.query("SELECT * FROM usuarios WHERE id = $1", [pagado_por]);
    if (usuarioExiste.rows.length === 0) {
      return res.status(400).json({ error: "El usuario que pagó no existe" });
    }

    // Verificar que todos los usuarios existan
    for (let id_usuario of id_usuarios) {
      const checkUsuario = await pool.query("SELECT id FROM usuarios WHERE id = $1", [id_usuario]);
      if (checkUsuario.rows.length === 0) {
        return res.status(400).json({ error: `El usuario con ID ${id_usuario} no existe` });
      }
    }

    // Insertar el gasto si todo es válido
    const nuevoGasto = await pool.query(
      "INSERT INTO gastos (id_grupo, monto, descripcion, pagado_por) VALUES ($1, $2, $3, $4) RETURNING *",
      [id_grupo, monto, descripcion, pagado_por]
    );

    const id_gasto = nuevoGasto.rows[0].id;

    // Calcular monto a dividir entre los usuarios
    const monto_dividido = (monto / id_usuarios.length).toFixed(2);

    // Registrar las deudas
    for (let id_usuario of id_usuarios) {
      if (id_usuario !== pagado_por) { // El que pagó no se debe a sí mismo
        await pool.query(
          "INSERT INTO deudas (id_gasto, id_usuario, monto) VALUES ($1, $2, $3)",
          [id_gasto, id_usuario, monto_dividido]
        );
      }
    }

    res.json({ mensaje: "Gasto y deudas registradas correctamente", gasto: nuevoGasto.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Actualizar un gasto (PROTEGIDO)
router.put("/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, descripcion, pagado_por } = req.body;

    // Validaciones
    if (!monto || !descripcion || !pagado_por) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }
    if (monto <= 0) {
      return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    }

    // Verificar si el gasto existe
    const gastoExiste = await pool.query("SELECT * FROM gastos WHERE id = $1", [id]);
    if (gastoExiste.rows.length === 0) {
      return res.status(400).json({ error: "El gasto no existe" });
    }

    // Actualizar el gasto
    const gastoActualizado = await pool.query(
      "UPDATE gastos SET monto = $1, descripcion = $2, pagado_por = $3 WHERE id = $4 RETURNING *",
      [monto, descripcion, pagado_por, id]
    );

    res.json(gastoActualizado.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Eliminar un gasto y sus deudas asociadas (PROTEGIDO)
router.delete("/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el gasto existe
    const gastoExiste = await pool.query("SELECT * FROM gastos WHERE id = $1", [id]);
    if (gastoExiste.rows.length === 0) {
      return res.status(400).json({ error: "El gasto no existe" });
    }

    // Eliminar las deudas asociadas antes de eliminar el gasto
    await pool.query("DELETE FROM deudas WHERE id_gasto = $1", [id]);

    // Eliminar el gasto
    await pool.query("DELETE FROM gastos WHERE id = $1", [id]);

    res.json({ mensaje: "Gasto y deudas eliminadas correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
