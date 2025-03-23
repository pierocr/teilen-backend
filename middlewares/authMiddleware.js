require("dotenv").config(); // al inicio de authMiddleware.js si es necesario

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;// Reemplázalo con una variable de entorno en producción

const verificarToken = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({ error: "Acceso denegado, token no proporcionado" });
  }

  try {
    const verificado = jwt.verify(token.replace("Bearer ", ""), JWT_SECRET);
    req.usuario = verificado; // Almacenar los datos del usuario autenticado
    next();
  } catch (err) {
    res.status(400).json({ error: "Token inválido" });
  }
};

module.exports = verificarToken;
