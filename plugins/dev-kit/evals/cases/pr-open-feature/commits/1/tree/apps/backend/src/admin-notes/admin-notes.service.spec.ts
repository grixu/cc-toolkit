import { describe, expect, it, vi } from 'vitest';
import { AdminNotesService } from './admin-notes.service';

describe('AdminNotesService', () => {
  it('strips script tags before saving', async () => {
    const upsert = vi.fn(async (args) => args.create);
    const service = new AdminNotesService({ adminNote: { upsert } } as never);

    await service.save({ organizationId: 'org-1' }, '<p>VIP</p><script>alert(1)</script>', 'a@example.com');

    expect(upsert.mock.calls[0][0].create.html).toBe('<p>VIP</p>');
  });
});
