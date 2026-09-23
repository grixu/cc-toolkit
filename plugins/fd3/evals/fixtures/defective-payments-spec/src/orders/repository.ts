import { pool } from "../db";

export async function findOrder(orderId: string) {
  const { rows } = await pool.query("SELECT id, amount_minor FROM orders WHERE id = $1", [orderId]);
  return rows[0];
}
