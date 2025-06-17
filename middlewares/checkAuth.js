import jwt from 'jsonwebtoken';
import pool from "../config/db.js";

const checkAuth = async (req, res, next) => {
  let token;

  // Verificamos que el header contenga un Bearer token
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Extraemos el token quitando la palabra Bearer
      token = req.headers.authorization.split(' ')[1];

      // Verificamos el token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Buscamos al usuario por el id que guardamos en el token
      const result = await pool.query(
        'SELECT id, nombre, apellidos, correo_electronico, telefono, direccion, edad, imagen_perfil, fecha_creacion FROM usuarios WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ msg: 'Usuario no encontrado' });
      }

      // Adjuntamos al req el usuario (sin password, sin token, etc.)
      req.usuario = result.rows[0];

      // Continuamos al siguiente middleware o controlador
      return next();

    } catch (error) {
      console.error('Error en checkAuth:', error.message);
      return res.status(401).json({ msg: 'Token no válido o expirado' });
    }
  }

  if (!token) {
    return res.status(401).json({ msg: 'No hay token en la petición' });
  }
};

export default checkAuth;
