import mysql from 'mysql2/promise';
import 'dotenv/config';

/**
 * Hostinger MariaDB drops idle TCP connections. Without keep-alive the next
 * query can throw PROTOCOL_CONNECTION_LOST and take the Node process down.
 */
export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nexora_crm',
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 40,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  connectTimeout: 15_000,
  dateStrings: true,
});

pool.on?.('error', (err) => {
  console.error('[db] pool error:', err.code || '', err.message);
});

export async function pingDb() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}
