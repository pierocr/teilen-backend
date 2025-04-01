const { Pool } = require("pg");
require("dotenv").config();

// Configuración de conexión a Supabase PostgreSQL
/*const pool = new Pool({
  user: process.env.DB_USUARIO,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PUERTO),
  database: process.env.DB_NOMBRE,
  ssl: { rejectUnauthorized: false },
  // 👇 Esto fuerza uso de IPv4
  statement_timeout: 10000,
  query_timeout: 10000,
});*/

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


// Probar la conexión
pool.connect()
  .then(() => console.log("🔥 Conectado a Supabase PostgreSQL"))
  .catch((err) => console.error("❌ Error conectando a Supabase:", err));

module.exports = pool;
