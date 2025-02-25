const express = require("express");
const pool = require("../bd"); // Conexión a la BD
const router = express.Router();
const verificarToken = require("../middlewares/authMiddleware");

// 📌 Obtener desglose detallado de deudas en un grupo (Se coloca antes para evitar conflicto de rutas)
router.get("/desglose/:id_grupo", async (req, res) => {
    console.log("📌 Petición recibida en /deudas/desglose/:id_grupo");

    let id_grupo = Number(req.params.id_grupo);
    console.log("📌 ID convertido a número:", id_grupo);
    console.log("📌 Es número entero:", Number.isInteger(id_grupo));

    if (!Number.isInteger(id_grupo) || id_grupo <= 0) {
        return res.status(400).json({ 
            error: "El ID del grupo debe ser un número válido",
            recibido: req.params.id_grupo,
            convertido: id_grupo,
            es_entero: Number.isInteger(id_grupo)
        });
    }

    try {
        const desglose = await pool.query(
            `SELECT 
                deudor.id AS deudor_id,
                deudor.nombre AS deudor_nombre,
                acreedor.id AS acreedor_id,
                acreedor.nombre AS acreedor_nombre,
                SUM(d.monto) AS monto_total
            FROM deudas d
            JOIN usuarios deudor ON d.id_usuario = deudor.id
            JOIN gastos g ON d.id_gasto = g.id
            JOIN usuarios acreedor ON g.pagado_por = acreedor.id
            WHERE g.id_grupo = $1
            GROUP BY deudor.id, deudor.nombre, acreedor.id, acreedor.nombre
            ORDER BY monto_total DESC`,
            [id_grupo]
        );

        console.log("📌 Resultado de la consulta:", desglose.rows);

        res.json({
            grupo_id: id_grupo,
            resultado: desglose.rows.length > 0 ? desglose.rows : "No hay deudas en este grupo"
        });

    } catch (err) {
        console.error("❌ Error obteniendo desglose de deudas:", err);
        res.status(500).json({ 
            error: "Error obteniendo el desglose de deudas", 
            detalles: err.message 
        });
    }
});

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

// 📌 Obtener deudas de un usuario en un grupo específico (ANTES estaba antes, ahora lo movemos para evitar conflicto)
router.get("/:id_usuario/:id_grupo", async (req, res) => {
    try {
        const { id_usuario, id_grupo } = req.params;

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

        if (!id_gasto || !id_usuarios || id_usuarios.length === 0 || !monto_total) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        const gastoExiste = await pool.query("SELECT id FROM gastos WHERE id = $1", [id_gasto]);
        if (gastoExiste.rows.length === 0) {
            return res.status(400).json({ error: "El gasto no existe" });
        }

        const monto_dividido = (monto_total / id_usuarios.length).toFixed(2);

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

module.exports = router;
