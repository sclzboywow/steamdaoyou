import {
  adminCapabilitiesForRole,
  adminRoleHasCapability,
  type AdminCapability,
  type AdminRole,
} from '@shared/contracts/adminAccess';

const ROLE_ENV_NAMES: Record<AdminRole, string> = {
  super_admin: 'ADMIN_USER_IDS',
  ops: 'ADMIN_OPS_USER_IDS',
  support: 'ADMIN_SUPPORT_USER_IDS',
  content: 'ADMIN_CONTENT_USER_IDS',
};

function parseCommaSeparatedEnv(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isLocalDevelopment() {
  return process.env.APP_ENV === 'local' && process.env.NODE_ENV !== 'production';
}

export function getAdminUserIds(): string[] {
  return parseCommaSeparatedEnv(ROLE_ENV_NAMES.super_admin);
}

export function isAdminUserId(userId?: string | null): boolean {
  if (!userId) return false;
  return getAdminUserIds().includes(userId.toLowerCase());
}

export function isLegacyAdminEmail(email?: string | null): boolean {
  if (!email || !isLocalDevelopment()) return false;
  return parseCommaSeparatedEnv('ADMIN_EMAILS').includes(email.toLowerCase());
}

export function getAdminRole(user?: {
  id?: string | null;
  email?: string | null;
}): AdminRole | null {
  const userId = user?.id?.trim().toLowerCase();
  if (userId) {
    const precedence: readonly AdminRole[] = [
      'super_admin',
      'ops',
      'support',
      'content',
    ];
    for (const role of precedence) {
      if (parseCommaSeparatedEnv(ROLE_ENV_NAMES[role]).includes(userId)) {
        return role;
      }
    }
  }

  // 旧 ADMIN_EMAILS 只允许本地开发，生产环境完全不参与授权。
  if (isLegacyAdminEmail(user?.email)) return 'super_admin';
  return null;
}

export function isAdminIdentity(user?: {
  id?: string | null;
  email?: string | null;
}): boolean {
  return getAdminRole(user) !== null;
}

export function hasAdminCapability(
  user: { id?: string | null; email?: string | null } | undefined,
  capability: AdminCapability,
): boolean {
  const role = getAdminRole(user);
  return role ? adminRoleHasCapability(role, capability) : false;
}

export { adminCapabilitiesForRole, adminRoleHasCapability };
export type { AdminCapability, AdminRole };
