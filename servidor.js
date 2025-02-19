require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./bd"); // Importa la conexión a la BD

const app = express();
app.use(cors());
app.use(express.json()); // Permitir JSON en las peticiones

// Ruta principal de prueba
app.get("/", (req, res) => {
  res.send("🚀 API de Teilen funcionando correctamente");
});

// Ruta para probar la conexión a la BD
app.get("/test-db", async (req, res) => {
  try {
    const resultado = await pool.query("SELECT NOW()"); // Obtener la fecha actual del servidor
    res.json({ mensaje: "Conexión exitosa 🎉", fecha: resultado.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Error conectando a la BD", detalles: err.message });
  }
});

// Importar rutas (cuando las agreguemos)
const rutasUsuarios = require("./rutas/usuarios");
const rutasGrupos = require("./rutas/grupos");
const rutasGastos = require("./rutas/gastos");

app.use("/usuarios", rutasUsuarios);
app.use("/grupos", rutasGrupos);
app.use("/gastos", rutasGastos);

// Iniciar el servidor
const PUERTO = process.env.PUERTO || 5000;
app.listen(PUERTO, () => {
  console.log(`🔥 Servidor corriendo en http://localhost:${PUERTO}`);
});
