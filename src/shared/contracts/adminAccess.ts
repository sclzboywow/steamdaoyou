export const ADMIN_ROLES = [
  'super_admin',
  'ops',
  'support',
  'content',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_CAPABILITIES = [
  'overview',
  'accounts',
  'steam_accounts',
  'feedback',
  'ops_messaging',
  'game_content',
  'commerce',
  'sponsorship',
  'llm_observe',
  'presence',
  'content_moderation',
  'audit',
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<AdminRole, readonly AdminCapability[]> = {
  super_admin: ADMIN_CAPABILITIES,
  ops: [
    'overview',
    'feedback',
    'ops_messaging',
    'commerce',
    'sponsorship',
    'presence',
  ],
  support: [
    'overview',
    'steam_accounts',
    'feedback',
    'presence',
    'content_moderation',
  ],
  content: [
    'overview',
    'game_content',
    'commerce',
    'llm_observe',
    'content_moderation',
  ],
};

export function adminCapabilitiesForRole(
  role: AdminRole,
): readonly AdminCapability[] {
  return ROLE_CAPABILITIES[role];
}

export function adminRoleHasCapability(
  role: AdminRole,
  capability: AdminCapability,
): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: '超级管理员',
  ops: '运营',
  support: '客服',
  content: '内容',
};

export interface AdminSessionData {
  userId: string;
  email: string;
  role: AdminRole;
  capabilities: readonly AdminCapability[];
}
