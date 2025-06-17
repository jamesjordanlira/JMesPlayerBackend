import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  user: 'jaime',               
  host: 'localhost',              
  database: 'JMesPlayer',
  password: '123456',      
  port: 5432    
});

pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL');
});

export default pool;
