import { z } from 'zod';
import type { AdminRole } from './adminAccess';

export const AdminSteamAccountListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
});

export const AdminSteamUnlinkRequestSchema = z.object({
  expectedUserId: z.string().uuid(),
  reason: z.string().trim().min(5, '请填写至少 5 个字的处理原因').max(500),
});

export type AdminSteamAccountListQuery = z.infer<
  typeof AdminSteamAccountListQuerySchema
>;
export type AdminSteamUnlinkRequest = z.infer<
  typeof AdminSteamUnlinkRequestSchema
>;

export interface AdminSteamAccountItem {
  steamId: string;
  userId: string;
  accountName: string;
  email: string;
  syntheticEmail: boolean;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  linkedAt: string;
  otherProviders: string[];
  activeSessionCount: number;
  lastSessionAt: string | null;
  activeCultivator: {
    id: string;
    name: string;
    realm: string;
    realmStage: string;
    lastActiveAt: string | null;
  } | null;
}

export interface AdminSteamAccountListResponse {
  success: true;
  data: {
    accounts: AdminSteamAccountItem[];
    total: number;
    page: number;
    limit: number;
  };
}

export type AdminAuditOutcome = 'success' | 'failure';

export const AdminAuditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(200).optional(),
});

export type AdminAuditListQuery = z.infer<typeof AdminAuditListQuerySchema>;

export interface AdminAuditEventView {
  id: string;
  operatorUserId: string;
  operatorEmail: string | null;
  operatorRole: AdminRole;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export type ContentModerationDecision =
  | 'local_reject'
  | 'pass'
  | 'reject'
  | 'unavailable';

export const AdminContentModerationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  decision: z
    .enum(['all', 'local_reject', 'pass', 'reject', 'unavailable'])
    .default('all'),
  search: z.string().trim().max(200).optional(),
});

export type AdminContentModerationListQuery = z.infer<
  typeof AdminContentModerationListQuerySchema
>;

export interface AdminContentModerationEventView {
  id: string;
  userId: string;
  source: string;
  provider: string;
  decision: ContentModerationDecision;
  reason: string | null;
  contentHash: string;
  contentLength: number;
  contentExcerpt: string | null;
  durationMs: number | null;
  createdAt: string;
}
