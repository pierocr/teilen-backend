const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const pool = require("../bd");
const verificarToken = require("../middlewares/authMiddleware");


// 🔍 GET /amigos - Lista de amigos del usuario autenticado
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.usuario.id;

    const result = await pool.query(
      `SELECT u.id, u.nombre, u.correo, u.imagen_perfil
       FROM amigos a
       JOIN usuarios u ON u.id = a.amigo_id
       WHERE a.usuario_id = $1`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener amigos:", error);
    res.status(500).json({ mensaje: "Error al obtener amigos" });
  }
});

// ➕ POST /amigos - Agregar un nuevo amigo por ID
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.usuario.id;
    const { amigo_id } = req.body;

    if (userId === amigo_id) {
      return res.status(400).json({ mensaje: "No puedes agregarte a ti mismo como amigo." });
    }

    // Verificar si ya son amigos
    const yaSonAmigos = await pool.query(
      `SELECT * FROM amigos WHERE usuario_id = $1 AND amigo_id = $2`,
      [userId, amigo_id]
    );

    if (yaSonAmigos.rows.length > 0) {
      return res.status(400).json({ mensaje: "Ya son amigos." });
    }

    // Insertar relación en ambos sentidos
    await pool.query(
      `INSERT INTO amigos (usuario_id, amigo_id) VALUES ($1, $2), ($2, $1)`,
      [userId, amigo_id]
    );

    res.status(201).json({ mensaje: "Amigo agregado correctamente." });
  } catch (error) {
    console.error("Error al agregar amigo:", error);
    res.status(500).json({ mensaje: "Error al agregar amigo" });
  }
});

// ❌ DELETE /amigos/:id - Eliminar a un amigo
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.usuario.id;
    const amigoId = req.params.id;

    // Eliminar relación en ambos sentidos
    await pool.query(
      `DELETE FROM amigos WHERE 
         (usuario_id = $1 AND amigo_id = $2) 
      OR (usuario_id = $2 AND amigo_id = $1)`,
      [userId, amigoId]
    );

    res.json({ mensaje: "Amigo eliminado correctamente." });
  } catch (error) {
    console.error("Error al eliminar amigo:", error);
    res.status(500).json({ mensaje: "Error al eliminar amigo" });
  }
});

// 📌 Obtener detalle de un amigo (grupos compartidos + deuda mutua)
router.get("/:id/detalle", verificarToken, async (req, res) => {
    try {
      const usuario_id = req.usuario.id;
      const amigo_id = parseInt(req.params.id);
  
      // Verifica que son amigos
      const amistad = await pool.query(
        "SELECT * FROM amigos WHERE usuario_id = $1 AND amigo_id = $2",
        [usuario_id, amigo_id]
      );
  
      if (amistad.rows.length === 0) {
        return res.status(403).json({ error: "Este usuario no es tu amigo." });
      }
  
      // Obtener info del amigo
      const amigoResp = await pool.query(
        "SELECT id, nombre, correo, imagen_perfil FROM usuarios WHERE id = $1",
        [amigo_id]
      );
  
      const amigo = amigoResp.rows[0];
  
      // Obtener grupos compartidos
      const gruposResp = await pool.query(
        `
        SELECT g.id, g.nombre
        FROM grupos g
        JOIN usuarios_grupos ug1 ON ug1.grupo_id = g.id AND ug1.usuario_id = $1
        JOIN usuarios_grupos ug2 ON ug2.grupo_id = g.id AND ug2.usuario_id = $2
      `,
        [usuario_id, amigo_id]
      );
  
      const grupos_compartidos = gruposResp.rows;
  
      // Deuda: cuánto le debes tú a él
      const deudaTuLeDebes = await pool.query(
        `
        SELECT COALESCE(SUM(d.monto), 0) AS total
        FROM deudas d
        JOIN gastos g ON d.id_gasto = g.id
        WHERE d.id_usuario = $1 AND g.pagado_por = $2
      `,
        [usuario_id, amigo_id]
      );
  
      // Deuda: cuánto te debe él a ti
      const deudaElTeDebe = await pool.query(
        `
        SELECT COALESCE(SUM(d.monto), 0) AS total
        FROM deudas d
        JOIN gastos g ON d.id_gasto = g.id
        WHERE d.id_usuario = $2 AND g.pagado_por = $1
      `,
        [usuario_id, amigo_id]
      );
  
      const tuDebes = parseFloat(deudaTuLeDebes.rows[0].total);
      const elDebe = parseFloat(deudaElTeDebe.rows[0].total);
  
      res.json({
        amigo,
        grupos_compartidos,
        deuda_tu_le_debes: tuDebes,
        deuda_el_te_debe: elDebe,
        saldo_total: elDebe - tuDebes,
      });
    } catch (err) {
      console.error("Error en GET /amigos/:id/detalle:", err);
      res.status(500).json({ error: "Error al obtener detalle del amigo." });
    }
  });
  

module.exports = router;
