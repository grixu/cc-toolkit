import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AdminNoteCard from './AdminNoteCard.vue';

vi.mock('../composables/useAdminNote', () => ({
  useAdminNote: () => ({ note: { value: null }, save: vi.fn(), canWrite: false }),
}));

describe('AdminNoteCard', () => {
  it('renders nothing for a user who can neither read a note nor write one', () => {
    expect(mount(AdminNoteCard, { props: { organizationId: 'org-1' } }).html()).toBe('<!--v-if-->');
  });
});
