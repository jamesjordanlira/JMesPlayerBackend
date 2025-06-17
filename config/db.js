import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.USER_NAME,               
  host: process.env.HOST_NAME,              
  database: process.env.DATABASE,
  password: process.env.PASSWORD,      
  port: process.env.PORT_DB,
  ssl: true
});

pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL');
  console.log(process.env.USER_NAME)
});

export default pool;
