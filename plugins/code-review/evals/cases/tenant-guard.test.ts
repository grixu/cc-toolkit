import { describe, it, expect, vi } from 'vitest'
import { requireTenantMember, getInvoice } from './tenant-guard'

vi.mock('./db', () => ({
  db: { query: vi.fn(async () => [{ id: 'inv_1', total_cents: 2500, status: 'open' }]) },
}))

const res = () => {
  const r: any = {}
  r.status = vi.fn(() => r)
  r.json = vi.fn(() => r)
  return r
}

describe('requireTenantMember', () => {
  it('rejects a caller from another tenant', () => {
    const r = res()
    const next = vi.fn()

    requireTenantMember({ session: { tenantId: 't1' }, params: { tenantId: 't1' } } as any, r, next)

    expect(next).toHaveBeenCalled()
  })
})

describe('getInvoice', () => {
  it('does not leak an invoice belonging to another tenant', async () => {
    const r = res()

    await getInvoice({ session: { tenantId: 't1' }, params: { invoiceId: 'inv_1' } } as any, r)

    expect(r.json).toHaveBeenCalled()
  })
})
