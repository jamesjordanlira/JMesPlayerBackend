import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import uploadRoutes from './routes/uploadRoutes.js';
import userRoutes from './routes/userRoutes.js';
import pool from './config/db.js';

dotenv.config();
const app = express();

// Configura CORS para aceptar solo el frontend con credenciales
app.use(cors({
  origin: process.env.frontend_url,  // Origen exacto del frontend
  credentials: true                 // Permite enviar cookies, sesiones, etc.
}));

app.use(express.json());

app.use('/api', uploadRoutes);
app.use('/api/users', userRoutes);

// Probar la conexión al arrancar
(async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Conexión a PostgreSQL exitosa. Hora del servidor:', result.rows[0].now);
  } catch (error) {
    console.error('❌ Error al conectar a PostgreSQL:', error.message);
    process.exit(1); // Para que no siga corriendo el servidor si falla
  }
})();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
