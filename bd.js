const { Pool } = require("pg");
require("dotenv").config();

// Configuración de conexión a Supabase PostgreSQL
const pool = new Pool({
  user: process.env.DB_USUARIO,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PUERTO,
  database: process.env.DB_NOMBRE,
  ssl: { rejectUnauthorized: false }, // Requerido para Supabase
});

// Probar la conexión
pool.connect()
  .then(() => console.log("🔥 Conectado a Supabase PostgreSQL"))
  .catch((err) => console.error("❌ Error conectando a Supabase:", err));

module.exports = pool;
