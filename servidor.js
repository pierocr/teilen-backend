require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./bd"); // Importa la conexión a la BD
const os = require("os");

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

// Importar rutas
const rutasUsuarios = require("./rutas/usuarios");
const rutasGrupos = require("./rutas/grupos");
const rutasGastos = require("./rutas/gastos");
const rutasDeudas = require("./rutas/deudas");
const rutasAuth = require("./rutas/auth");
const rutasBalance = require("./rutas/balance"); 
const actividadRoutes = require("./rutas/actividad");
const amigosRoutes = require("./rutas/amigos");

app.use("/auth", rutasAuth);
app.use("/usuarios", rutasUsuarios);
app.use("/grupos", rutasGrupos);
app.use("/gastos", rutasGastos);
app.use("/deudas", rutasDeudas);
app.use("/balance", rutasBalance);
app.use("/actividad", actividadRoutes);
app.use("/amigos", amigosRoutes);

// Iniciar el servidor
const PUERTO = process.env.PUERTO || 5001;
const HOST = "0.0.0.0"; // Permite conexiones desde cualquier dispositivo en la red

// Obtener la IP de la red local automáticamente
const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === "IPv4" && !config.internal) {
        return config.address;
      }
    }
  }
  return "localhost"; // En caso de que no encuentre una IP válida
};

const LOCAL_IP = getLocalIp();

app.listen(PUERTO, HOST, () => {
  console.log(`🔥 Servidor corriendo en:`);
  console.log(`➡ Local:    http://localhost:${PUERTO}`);
  console.log(`➡ Red LAN:  http://${LOCAL_IP}:${PUERTO}`);
});
