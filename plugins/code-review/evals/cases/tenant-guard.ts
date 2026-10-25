import { Router, type Request, type Response } from 'express'
import { db } from './db'

export type Session = { userId: string; tenantId: string; roles: string[] }

export function requireTenantMember(req: Request, res: Response, next: () => void) {
  const session = req.session as Session | undefined
  if (!session) return res.status(401).json({ error: 'unauthenticated' })
  if (session.tenantId !== req.params.tenantId) {
    return res.status(403).json({ error: 'forbidden' })
  }
  next()
}

export async function listInvoices(req: Request, res: Response) {
  const session = req.session as Session
  const rows = await db.query(
    'SELECT id, total_cents, status FROM invoices WHERE tenant_id = $1 ORDER BY issued_at DESC LIMIT 100',
    [session.tenantId],
  )
  res.json(rows)
}

export async function getInvoice(req: Request, res: Response) {
  const session = req.session as Session
  const [row] = await db.query(
    'SELECT id, total_cents, status FROM invoices WHERE id = $1 AND tenant_id = $2',
    [req.params.invoiceId, session.tenantId],
  )
  if (!row) return res.status(404).json({ error: 'not found' })
  res.json(row)
}

export const router = Router()
router.get('/tenants/:tenantId/invoices', requireTenantMember, listInvoices)
router.get('/tenants/:tenantId/invoices/:invoiceId', requireTenantMember, getInvoice)
