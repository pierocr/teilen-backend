const express = require("express");
const pool = require("../bd");
const verificarToken = require("../middlewares/auth");
const router = express.Router();
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const supabase = require("../supabase");
const upload = multer({ storage: multer.memoryStorage() });

// 📌 Obtener todos los grupos (PROTEGIDO)
router.get("/", verificarToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;

    const grupos = await pool.query(
      `
      SELECT 
        g.id, 
        g.nombre, 
        g.imagen,

        -- Total gastado en el grupo
        COALESCE((
          SELECT SUM(monto) FROM gastos ga WHERE ga.id_grupo = g.id
        ), 0) AS total_gastado,

        -- Total adeudado por el usuario (solo tipo 'deuda')
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN gastos ga ON ga.id = d.id_gasto
          WHERE d.id_usuario = $1
            AND ga.id_grupo = g.id
            AND d.tipo = 'deuda'
        ), 0) AS total_adeudado,

        -- Total pagado por el usuario en este grupo (solo pagos reales de deuda)
        COALESCE((
          SELECT SUM(d.monto)
          FROM pagos p
          JOIN deudas d ON p.id_gasto = d.id_gasto AND p.id_usuario = d.id_usuario
          JOIN gastos ga ON ga.id = d.id_gasto
          WHERE p.id_usuario = $1
            AND p.pagado = true
            AND ga.id_grupo = g.id
            AND d.tipo = 'deuda'
        ), 0) AS total_pagado,

        -- Total por cobrar al usuario (deudas a favor del usuario)
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN gastos ga ON d.id_gasto = ga.id
          WHERE ga.pagado_por = $1
            AND ga.id_grupo = g.id
            AND d.tipo = 'a_favor'
        ), 0) AS total_por_cobrar,

        -- Total recibido (pagos de otros hacia el usuario que pagó)
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN gastos ga ON d.id_gasto = ga.id
          JOIN pagos p ON p.id_gasto = d.id_gasto AND p.id_usuario = d.id_usuario
          WHERE ga.pagado_por = $1
            AND ga.id_grupo = g.id
            AND p.pagado = true
            AND d.tipo = 'a_favor'
        ), 0) AS total_recibido

      FROM grupos g
      JOIN usuarios_grupos ug ON ug.grupo_id = g.id
      WHERE ug.usuario_id = $1
      GROUP BY g.id, g.nombre, g.imagen
      `,
      [usuario_id]
    );

    res.json(grupos.rows);
  } catch (error) {
    console.error("❌ Error en GET /grupos:", error);
    res
      .status(500)
      .json({ error: "Error obteniendo los grupos", detalles: error.message });
  }
});

// 📌 Crear un nuevo grupo + participantes (PROTEGIDO)
router.post("/", verificarToken, async (req, res) => {
  const { nombre, imagen, participantes } = req.body;
  const usuario_id = req.usuario.id;

  try {
    const nuevoGrupo = await pool.query(
      "INSERT INTO grupos (nombre, imagen, creado_por) VALUES ($1, $2, $3) RETURNING *",
      [nombre, imagen, usuario_id]
    );

    // Asociar el usuario creador
    await pool.query(
      "INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES ($1, $2)",
      [usuario_id, nuevoGrupo.rows[0].id]
    );

    // Participantes
    if (Array.isArray(participantes) && participantes.length) {
      for (const pid of participantes) {
        if (pid !== usuario_id) {
          await pool.query(
            "INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES ($1, $2)",
            [pid, nuevoGrupo.rows[0].id]
          );
        }
      }
    } else {
    }
    res.status(201).json(nuevoGrupo.rows[0]);
  } catch (error) {
    console.error("❌ Error creando grupo:", error);
    res.status(500).json({ error: "Error creando el grupo" });
  }
});

// 📌 Actualizar un grupo
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, imagen } = req.body;

    const grupoActualizado = await pool.query(
      "UPDATE grupos SET nombre = $1, imagen = $2 WHERE id = $3 RETURNING *",
      [nombre, imagen, id]
    );

    res.json(grupoActualizado.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint DELETE para eliminar imagen – ¡DECLARA ESTE ANTES DE DELETE /:id!
router.delete("/imagen", verificarToken, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL de imagen requerida" });
    }

    const bucket = "grupos";
    const supabaseUrl = process.env.SUPABASE_URL;
    const prefijo = `${supabaseUrl}/storage/v1/object/public/${bucket}/`;

    console.log("🧾 URL recibida:", url);
    console.log("🔎 Prefijo esperado:", prefijo);

    const rutaRelativa = url.replace(prefijo, "");

    // Validación de seguridad: evitar borrar fuera del bucket esperado
    if (!rutaRelativa || rutaRelativa === url) {
      return res
        .status(400)
        .json({ error: "URL inválida o fuera del bucket permitido" });
    }

    const { error } = await supabase.storage
      .from(bucket)
      .remove([rutaRelativa]);

    if (error) {
      console.error("❌ Supabase error:", error);
      return res
        .status(500)
        .json({ error: "Error al eliminar la imagen del bucket" });
    }

    console.log("✅ Imagen eliminada correctamente:", rutaRelativa);
    res.json({ mensaje: "Imagen eliminada correctamente" });
  } catch (error) {
    console.error("❌ Error en DELETE /grupos/imagen:", error.message);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 📌 Eliminar un grupo
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 📥 Buscar imagen del grupo
    const grupoResult = await pool.query(
      "SELECT imagen FROM grupos WHERE id = $1",
      [id]
    );

    if (grupoResult.rows.length === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    const imagenUrl = grupoResult.rows[0].imagen;

    // 🧽 Si no es imagen por defecto, eliminar del bucket
    if (imagenUrl && !imagenUrl.includes("default")) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const bucket = "grupos";

      // Extraer la ruta relativa
      const rutaRelativa = imagenUrl.replace(
        `${supabaseUrl}/storage/v1/object/public/${bucket}/`,
        ""
      );

      const { error: errorEliminar } = await supabase.storage
        .from(bucket)
        .remove([rutaRelativa]);

      if (errorEliminar) {
        console.warn(
          "⚠️ No se pudo eliminar la imagen:",
          errorEliminar.message
        );
        // no detenemos el proceso, solo lo notificamos
      }
    }

    // 1. Borrar deudas asociadas al grupo
    await pool.query(
      `
      DELETE FROM deudas
      WHERE id_gasto IN (
        SELECT id FROM gastos WHERE id_grupo = $1
      )
    `,
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
    console.error("❌ Error al eliminar grupo:", err.message);
    res.status(500).json({ error: err.message });
  }
});
// 📌 Obtener participantes de un grupo específico
router.get("/:id/participantes", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;

    const participantes = await pool.query(
      `SELECT u.id, u.nombre, u.correo, u.imagen_perfil
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

// 📌 Agregar participantes a un grupo específico
router.post("/:id/participantes", verificarToken, async (req, res) => {
  try {
    const grupoId = req.params.id;
    const { usuariosAAgregar } = req.body;
    // Ej: usuariosAAgregar = [2, 7, 10]

    // Insertar cada usuario en usuarios_grupos (si no existe ya)
    for (let userId of usuariosAAgregar) {
      // Verificar si ya está en el grupo
      const yaEsta = await pool.query(
        "SELECT * FROM usuarios_grupos WHERE usuario_id = $1 AND grupo_id = $2",
        [userId, grupoId]
      );
      if (yaEsta.rows.length === 0) {
        await pool.query(
          "INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES ($1, $2)",
          [userId, grupoId]
        );
      }
    }

    res.json({ mensaje: "Participantes agregados correctamente." });
  } catch (error) {
    console.error("❌ Error al agregar participantes:", error);
    res.status(500).json({ error: "No se pudieron agregar los participantes" });
  }
});

// 📌 Obtener resumen financiero del grupo
router.get("/:id/resumen", verificarToken, async (req, res) => {
  const grupoId = req.params.id;
  const usuarioId = req.usuario.id;

  try {
    const resultado = await pool.query(
      `
      SELECT 
        g.id AS grupo_id,

        -- Total gastado en el grupo
        COALESCE((SELECT SUM(monto) FROM gastos WHERE id_grupo = g.id), 0) AS total_gastado,

        -- Total pagado por todos (pagos reales)
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN pagos p ON p.id_gasto = d.id_gasto AND p.id_usuario = d.id_usuario
          JOIN gastos ga ON ga.id = d.id_gasto
          WHERE ga.id_grupo = g.id AND d.tipo = 'deuda' AND p.pagado = true
        ), 0) AS total_pagado,

        -- Total adeudado general
        COALESCE((SELECT SUM(monto) FROM gastos WHERE id_grupo = g.id), 0) -
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN pagos p ON p.id_gasto = d.id_gasto AND p.id_usuario = d.id_usuario
          JOIN gastos ga ON ga.id = d.id_gasto
          WHERE ga.id_grupo = g.id AND d.tipo = 'deuda' AND p.pagado = true
        ), 0) AS total_adeudado,

        -- Total adeudado por el usuario actual
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN gastos ga ON ga.id = d.id_gasto
          WHERE d.id_usuario = $2 AND ga.id_grupo = g.id AND d.tipo = 'deuda'
        ), 0) -
        COALESCE((
          SELECT SUM(d.monto)
          FROM deudas d
          JOIN pagos p ON p.id_gasto = d.id_gasto AND p.id_usuario = d.id_usuario
          JOIN gastos ga ON ga.id = d.id_gasto
          WHERE d.id_usuario = $2 AND ga.id_grupo = g.id AND d.tipo = 'deuda' AND p.pagado = true
        ), 0) AS total_adeudado_usuario

      FROM grupos g
      WHERE g.id = $1
      GROUP BY g.id
      `,
      [grupoId, usuarioId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    // 🔍 Obtener detalle de a quién le debe
    const detalleDeuda = await pool.query(
      `
      SELECT 
        u.nombre AS a_quien,
        SUM(d.monto) AS monto
      FROM deudas d
      JOIN gastos ga ON ga.id = d.id_gasto
      JOIN usuarios u ON ga.pagado_por = u.id
      WHERE d.id_usuario = $1
        AND ga.id_grupo = $2
        AND d.tipo = 'deuda'
        AND NOT EXISTS (
          SELECT 1
          FROM pagos p
          WHERE p.id_gasto = d.id_gasto AND p.id_usuario = d.id_usuario AND p.pagado = true
        )
      GROUP BY u.nombre
      `,
      [usuarioId, grupoId]
    );

    res.json({
      ...resultado.rows[0],
      detalles_deuda: detalleDeuda.rows,
    });
  } catch (error) {
    console.error("❌ Error en GET /grupos/:id/resumen:", error);
    res.status(500).json({ error: "Error obteniendo resumen del grupo" });
  }
});


router.post(
  "/imagen",
  verificarToken,
  upload.single("imagen"),
  async (req, res) => {
    try {
      const file = req.file;
      const extension = file.originalname.split(".").pop();
      const filename = `grupo_${uuidv4()}.${extension}`;

      const { error } = await supabase.storage
        .from("grupos")
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (error) throw error;

      const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/grupos/${filename}`;
      res.json({ url });
    } catch (err) {
      console.error("❌ Error al subir imagen de grupo:", err.message);
      res.status(500).json({ error: "No se pudo subir la imagen" });
    }
  }
);

module.exports = router;
