import { z } from 'zod';

export const SteamTicketRequestSchema = z.object({
  appId: z.number().int().positive(),
  steamId: z.string().regex(/^\d{17}$/),
  personaName: z.string().trim().min(1).max(80),
  ticket: z.string().regex(/^[0-9a-f]+$/i).min(32).max(6_000),
  identity: z.string().trim().min(1).max(128),
  createIfMissing: z.boolean().optional().default(false),
});
export type SteamTicketRequest = z.infer<typeof SteamTicketRequestSchema>;
