import { z } from 'zod';

export const ChannelInput = z.object({
  kind: z.enum(['email', 'sms', 'slack']),
  handle: z.string().trim().min(1).max(64),
});

export type ChannelInput = z.infer<typeof ChannelInput>;
