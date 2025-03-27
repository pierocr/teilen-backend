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

// 📌 Crear un nuevo gasto con validaciones y división de deudas (PROTEGIDO)
router.post("/", verificarToken, async (req, res) => {
  try {
    const {
      id_grupo,
      monto,
      descripcion,
      pagado_por,
      id_usuarios,
      montos_personalizados,
      imagen,
      categoria_id
    } = req.body;

    if (!id_grupo || !monto || !descripcion || !pagado_por || !id_usuarios.length) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }
    if (monto <= 0) {
      return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    }

    const grupoExiste = await pool.query("SELECT * FROM grupos WHERE id = $1", [id_grupo]);
    if (grupoExiste.rows.length === 0) {
      return res.status(400).json({ error: "El grupo no existe" });
    }

    const usuarioExiste = await pool.query("SELECT * FROM usuarios WHERE id = $1", [pagado_por]);
    if (usuarioExiste.rows.length === 0) {
      return res.status(400).json({ error: "El usuario que pagó no existe" });
    }

    const nuevoGasto = await pool.query(
      "INSERT INTO gastos (id_grupo, monto, descripcion, pagado_por, imagen, categoria_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [id_grupo, monto, descripcion, pagado_por, imagen, categoria_id]
    );

    const id_gasto = nuevoGasto.rows[0].id;
    const timestamp = new Date();
    const usuariosProcesados = new Set();

    if (montos_personalizados && Object.keys(montos_personalizados).length > 0) {
      let sumaMontos = Object.values(montos_personalizados).reduce((a, b) => a + b, 0);
      if (sumaMontos !== monto) {
        return res.status(400).json({ error: "La suma de los montos personalizados no coincide con el monto total" });
      }

      for (let id_usuario of id_usuarios) {
        const monto_final = montos_personalizados[id_usuario] || 0;
        const tipo = (id_usuario === pagado_por) ? 'a_favor' : 'deuda';

        await pool.query(
          "INSERT INTO deudas (id_gasto, id_usuario, monto, tipo, creado_en) VALUES ($1, $2, $3, $4, $5)",
          [id_gasto, id_usuario, monto_final, tipo, timestamp]
        );
        usuariosProcesados.add(id_usuario);
      }
    } else {
      let monto_dividido = Math.floor((monto / id_usuarios.length) * 100) / 100;
      let ajuste = monto - (monto_dividido * id_usuarios.length);

      let primer_usuario = true;
      for (let id_usuario of id_usuarios) {
        let monto_final = monto_dividido;

        if (primer_usuario) {
          monto_final += ajuste;
          primer_usuario = false;
        }

        const tipo = (id_usuario === pagado_por) ? 'a_favor' : 'deuda';

        await pool.query(
          "INSERT INTO deudas (id_gasto, id_usuario, monto, tipo, creado_en) VALUES ($1, $2, $3, $4, $5)",
          [id_gasto, id_usuario, monto_final, tipo, timestamp]
        );
        usuariosProcesados.add(id_usuario);
      }
    }

    // Si por alguna razón el pagador no estaba en id_usuarios, lo registramos igual
    if (!usuariosProcesados.has(pagado_por)) {
      await pool.query(
        "INSERT INTO deudas (id_gasto, id_usuario, monto, tipo, creado_en) VALUES ($1, $2, $3, $4, $5)",
        [id_gasto, pagado_por, monto, 'a_favor', timestamp]
      );
    }

    res.json({
      mensaje: "Gasto y deudas registradas correctamente",
      gasto: {
        id: id_gasto,
        id_grupo,
        monto,
        descripcion,
        pagado_por,
        imagen,
        categoria_id,
        creado_en: timestamp
      }
    });
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

// Al final de gastos.js
router.get("/actividad", verificarToken, async (req, res) => {
  try {
    const userId = req.usuario.id;

    // Consulta: cualquier gasto donde user haya pagado
    // o esté en "deudas" con su userId
    const query = `
      SELECT
        g.id AS gasto_id,
        g.descripcion,
        g.monto,
        g.pagado_por,
        g.id_grupo,
        g.creado_en,
        -- Info adicional: el nombre del grupo, el nombre del que pagó, etc.
        grupos.nombre AS nombre_grupo,
        up.nombre AS nombre_pagador
      FROM gastos g
      JOIN grupos ON g.id_grupo = grupos.id
      JOIN usuarios up ON g.pagado_por = up.id
      WHERE g.pagado_por = $1
         OR g.id IN (
            SELECT d.id_gasto FROM deudas d WHERE d.id_usuario = $1
         )
      ORDER BY g.creado_en DESC
    `;

    const resultado = await pool.query(query, [userId]);
    res.json(resultado.rows);
  } catch (error) {
    console.error("Error en GET /gastos/actividad:", error);
    res.status(500).json({ error: error.message });
  }
});

// 📌 Obtener el detalle de un gasto por ID (PROTEGIDO)
router.get("/:id/detalle", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;

    const gasto = await pool.query(
      `SELECT g.*, u.nombre as nombre_pagador 
       FROM gastos g 
       JOIN usuarios u ON g.pagado_por = u.id 
       WHERE g.id = $1`,
      [id]
    );

    if (gasto.rows.length === 0) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }

    const deudas = await pool.query(
      `SELECT d.*, u.nombre as nombre_usuario 
       FROM deudas d 
       JOIN usuarios u ON d.id_usuario = u.id 
       WHERE d.id_gasto = $1`,
      [id]
    );

    res.json({
      id: gasto.rows[0].id,
      descripcion: gasto.rows[0].descripcion,
      monto: gasto.rows[0].monto,
      pagado_por: {
        id: gasto.rows[0].pagado_por,
        nombre: gasto.rows[0].nombre_pagador,
      },
      deudas: deudas.rows.map((d) => ({
        id_usuario: d.id_usuario,
        nombre_usuario: d.nombre_usuario,
        monto: d.monto,
        tipo: d.tipo,
      })),
    });
  } catch (error) {
    console.error("❌ Error en GET /gastos/:id/detalle:", error);
    res.status(500).json({ error: error.message });
  }
});

// 📌 Obtener los gastos de un grupo específico con detalle para frontend (PROTEGIDO)
router.get("/:id_grupo", verificarToken, async (req, res) => {
  try {
    const { id_grupo } = req.params;
    const id_usuario = req.usuario.id;

    if (isNaN(id_grupo)) {
      return res.status(400).json({ error: "El ID del grupo debe ser un número válido" });
    }

    const gastosRaw = await pool.query(
      `SELECT g.*, u.nombre as pagador_nombre
       FROM gastos g
       JOIN usuarios u ON g.pagado_por = u.id
       WHERE g.id_grupo = $1
       ORDER BY g.creado_en DESC`,
      [parseInt(id_grupo)]
    );

    const gastos = [];

    for (const gasto of gastosRaw.rows) {
      const deuda = await pool.query(
        `SELECT monto, tipo FROM deudas WHERE id_gasto = $1 AND id_usuario = $2`,
        [gasto.id, id_usuario]
      );

      let relacion_usuario = "sin_participacion";
      let monto_usuario = 0;

      if (deuda.rows.length > 0) {
        relacion_usuario = deuda.rows[0].tipo === "a_favor" ? "a_favor" : "debes";
        monto_usuario = deuda.rows[0].monto;
      }

      gastos.push({
        id: gasto.id,
        descripcion: gasto.descripcion,
        monto: gasto.monto,
        imagen: gasto.imagen,
        fecha: gasto.creado_en,
        pagado_por: {
          id: gasto.pagado_por,
          nombre: gasto.pagador_nombre
        },
        relacion_usuario,
        monto_usuario
      });
    }

    res.json(gastos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;