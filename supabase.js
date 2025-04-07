const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Nota: Usa la service role key solo en el backend, NUNCA en el frontend
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
