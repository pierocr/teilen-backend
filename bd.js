const { Pool } = require("pg");
require("dotenv").config();

let pool;

if (process.env.DATABASE_URL) {
  // 👉 Producción (Render u otro servidor online)
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  // 👉 Desarrollo local
  pool = new Pool({
    user: process.env.DB_USUARIO,
    host: process.env.DB_HOST,
    database: process.env.DB_NOMBRE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PUERTO,
    ssl: { rejectUnauthorized: false }
  });
}

pool.connect()
  .then(() => console.log("🔥 Conectado a Supabase"))
  .catch((err) => console.error("❌ Error conectando a Supabase:", err));

module.exports = pool;
