import pool from "../config/db.js";
import tokenConfirmado from "../helpers/tokenConfirmado.js";
import bcrypt from "bcrypt";
import { emailRegistro, emailOlvidePassword } from "../helpers/emails.js";
import generateJWT from "../helpers/generateJWT.js";

const registerUser = async (req, res) => {
  try {
    const {
      nombre,
      apellidos,
      edad,
      direccion,
      telefono,
      correo_electronico,
      password,
      imagen_perfil
    } = req.body;

    if (
      !nombre || !apellidos || !edad || !direccion || !telefono ||
      !correo_electronico || !password
    ) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    // Verifica si el correo o teléfono ya existen
    const userCheck = await pool.query(
      `SELECT correo_electronico, telefono FROM usuarios 
       WHERE correo_electronico = $1 OR telefono = $2`,
      [correo_electronico, telefono]
    );

    if (userCheck.rows.length > 0) {
      const user = userCheck.rows[0];
      if (user.correo_electronico === correo_electronico) {
        return res.status(400).json({ error: "El correo ya está registrado" });
      }
      if (user.telefono === telefono) {
        return res.status(400).json({ error: "El teléfono ya está registrado" });
      }
    }

    const fecha_creacion = new Date();
    const token = tokenConfirmado();

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      `INSERT INTO usuarios 
      (nombre, apellidos, edad, direccion, telefono, correo_electronico, fecha_creacion, password, imagen_perfil, token)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        nombre,
        apellidos,
        edad,
        direccion,
        telefono,
        correo_electronico,
        fecha_creacion,
        hashedPassword,
        imagen_perfil || null,
        token
      ]
    );

    // ✅ Enviar email de confirmación
    await emailRegistro({
      nombre,
      apellidos,
      email: correo_electronico,
      token
    });

    res.status(201).json({
      message: "Usuario creado exitosamente. Revisa tu correo para confirmar la cuenta.",
      usuario: result.rows[0]
    });

  } catch (error) {
    console.error("Error en registerUser:", error.message);
    res.status(500).json({ error: "Error en el servidor" });
  }
};

const confirmAccount = async (req, res) => {
  const { token } = req.params;

  try {
    // Buscar usuario con el token
    const userResult = await pool.query(
      'SELECT * FROM usuarios WHERE token = $1',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Token no válido' });
    }

    const user = userResult.rows[0];

    if (user.confirmado) {
      return res.status(400).json({ error: 'La cuenta ya fue confirmada anteriormente' });
    }

    // Confirmar la cuenta y limpiar el token
    await pool.query(
      `UPDATE usuarios SET confirmado = true, token = '' WHERE token = $1`,
      [token]
    );

    res.json({ message: 'Cuenta confirmada exitosamente' });

  } catch (error) {
    console.error('Error en confirmAccount:', error.message);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

const forgetPassword = async (req, res) => {
  const { correo_electronico, telefono } = req.body;

  try {
    // Buscar usuario que coincida con correo o teléfono
    const usuarioResult = await pool.query(
      'SELECT * FROM usuarios WHERE correo_electronico = $1 OR telefono = $2',
      [correo_electronico, telefono]
    );

    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({ msg: 'El usuario no existe' });
    }

    const usuario = usuarioResult.rows[0];

    // Generar nuevo token para restablecer contraseña
    const nuevoToken = tokenConfirmado();
    const confirmado = false;

    // Actualizar token en la base de datos para ese usuario
      await pool.query(
        'UPDATE usuarios SET token = $1, confirmado = $2 WHERE correo_electronico = $3 OR telefono = $4',
        [nuevoToken, confirmado, usuario.correo_electronico, usuario.telefono]
      );

    // Enviar email con token para restablecer contraseña
    await emailOlvidePassword({
      nombre: usuario.nombre,
      apellidos: usuario.apellidos,
      email: usuario.correo_electronico,
      token: nuevoToken
    });

    // Responder al cliente
    res.json({ msg: 'Hemos enviado un email con las instrucciones para restablecer la contraseña' });

  } catch (error) {
    console.error('Error en forgetPassword:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

const validateToken = async (req, res) => {
  const { token } = req.params;

  try {
    const tokenValido = await pool.query(
      'SELECT * FROM usuarios WHERE token = $1',
      [token]
    );

    if (tokenValido.rows.length === 0) {
      return res.status(404).json({ msg: 'Token no válido' });
    }

    res.json({ msg: 'Token válido y el usuario existe' });

  } catch (error) {
    console.error('Error en validateToken:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

const newPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  // Validar password
  if (!password || password.trim() === '') {
    return res.status(400).json({ msg: 'El password no puede ser nulo o estar vacío' });
  }

  try {
    // Verificar que el token sea válido
    const usuarioResult = await pool.query(
      'SELECT * FROM usuarios WHERE token = $1',
      [token]
    );

    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({ msg: 'Token no válido' });
    }

    const usuario = usuarioResult.rows[0];
    const confirmado = true;

    // Encriptar el nuevo password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Actualizar password, vaciar el token y confirmar
    await pool.query(
      'UPDATE usuarios SET password = $1, token = $2, confirmado = $3 WHERE id = $4',
      [hashedPassword, '', confirmado, usuario.id]
    );

    res.json({ msg: 'Password actualizado correctamente' });

  } catch (error) {
    console.error('Error en newPassword:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};



const authenticate = async (req, res) => {
  const { correo_electronico, telefono, password } = req.body;

  if ((!correo_electronico && !telefono) || !password) {
    return res.status(400).json({ msg: 'Correo o teléfono y password son obligatorios' });
  }

  try {
    let query = '';
    let params = [];

    if (correo_electronico && telefono) {
      query = 'SELECT * FROM usuarios WHERE correo_electronico = $1 OR telefono = $2';
      params = [correo_electronico, telefono];
    } else if (correo_electronico) {
      query = 'SELECT * FROM usuarios WHERE correo_electronico = $1';
      params = [correo_electronico];
    } else {
      query = 'SELECT * FROM usuarios WHERE telefono = $1';
      params = [telefono];
    }

    const usuarioResult = await pool.query(query, params);

    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({ msg: 'Usuario no encontrado' });
    }

    const usuario = usuarioResult.rows[0];

    // Validar contraseña
    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {
      return res.status(401).json({ msg: 'Password incorrecto' });
    }

    // Validar si el usuario ha confirmado su cuenta
    if (!usuario.confirmado) {
      return res.status(403).json({ msg: 'Cuenta no confirmada' });
    }

    // Generar token JWT
    const token = generateJWT(usuario.id);

    // Responder con usuario y token (sin password ni token sensible)
    res.json({
      msg: 'Autenticación exitosa',
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo_electronico: usuario.correo_electronico,
        telefono: usuario.telefono,
        // agrega otros campos que quieras exponer
      },
      token
    });

  } catch (error) {
    console.error('Error en authenticate:', error);
    res.status(500).json({ msg: 'Error en el servidor' });
  }
};


const profile = async (req, res) => {
  // Leemos del servidor la variable donde almacenamos la info del jwt decifrado
  const { usuario } = req;
  res.json({usuario});
} 


export { registerUser, confirmAccount, forgetPassword, newPassword, validateToken, profile, authenticate };