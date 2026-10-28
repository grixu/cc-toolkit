import { z } from 'zod';

export const ProfileUpdate = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  timeZone: z.string().min(1).optional(),
});

export type ProfileUpdate = z.infer<typeof ProfileUpdate>;
