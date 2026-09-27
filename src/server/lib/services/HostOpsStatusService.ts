import type {
  AdminOpsSeverity,
  AdminOverviewOpsStatus,
} from '@shared/contracts/adminOverview';
import { readFile } from 'node:fs/promises';

const GIB = 1024 ** 3;
const OPS_STALE_MS = 15 * 60 * 1000;

type RawOpsStatus = {
  generatedAt?: string;
  disk?: {
    path?: string;
    totalBytes?: number;
    usedBytes?: number;
    freeBytes?: number;
    usedPercent?: number;
  };
  memory?: {
    totalBytes?: number;
    usedBytes?: number;
    availableBytes?: number;
    usedPercent?: number;
  };
  logs?: {
    dockerBytes?: number;
    openrestyBytes?: number | null;
    openrestyConfigured?: boolean;
    journalBytes?: number;
    totalBytes?: number;
    largestSource?: 'docker' | 'openresty' | 'journal' | 'none';
    largestDockerContainer?: string | null;
    largestDockerContainerBytes?: number;
  };
  backup?: {
    lastAttemptStatus?: 'success' | 'failed' | 'unknown';
    lastAttemptAt?: string | null;
    lastSuccessAt?: string | null;
    lastSuccessFile?: string | null;
    lastSuccessSizeBytes?: number | null;
  };
  tls?: {
    domain?: string | null;
    expiresAt?: string | null;
    daysRemaining?: number | null;
  } | null;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function maxSeverity(...levels: AdminOpsSeverity[]): AdminOpsSeverity {
  const rank: Record<AdminOpsSeverity, number> = {
    unknown: 0,
    ok: 1,
    warning: 2,
    critical: 3,
  };
  return levels.reduce((current, next) =>
    rank[next] > rank[current] ? next : current,
  );
}

function diskSeverity(
  usedPercent: number | null,
  freeBytes: number | null,
): AdminOpsSeverity {
  if (usedPercent === null || freeBytes === null) return 'unknown';
  if (usedPercent >= 90 || freeBytes < 5 * GIB) return 'critical';
  if (usedPercent >= 80 || freeBytes < 10 * GIB) return 'warning';
  return 'ok';
}

function memorySeverity(usedPercent: number | null): AdminOpsSeverity {
  if (usedPercent === null) return 'unknown';
  if (usedPercent >= 90) return 'critical';
  if (usedPercent >= 80) return 'warning';
  return 'ok';
}

function logSeverity(totalBytes: number | null): AdminOpsSeverity {
  if (totalBytes === null) return 'unknown';
  if (totalBytes >= 5 * GIB) return 'critical';
  if (totalBytes >= 2 * GIB) return 'warning';
  return 'ok';
}

function backupSeverity(
  lastAttemptStatus: 'success' | 'failed' | 'unknown',
  lastSuccessAt: string | null,
  now: Date,
): AdminOpsSeverity {
  if (!lastSuccessAt) return 'critical';
  const successAt = Date.parse(lastSuccessAt);
  if (!Number.isFinite(successAt)) return 'critical';
  const ageHours = (now.getTime() - successAt) / (60 * 60 * 1000);
  if (ageHours > 48) return 'critical';
  if (lastAttemptStatus === 'failed' || ageHours > 26) return 'warning';
  return 'ok';
}

function tlsSeverity(daysRemaining: number | null): AdminOpsSeverity {
  if (daysRemaining === null) return 'unknown';
  if (daysRemaining <= 7) return 'critical';
  if (daysRemaining <= 14) return 'warning';
  return 'ok';
}

function missingOpsStatus(): AdminOverviewOpsStatus {
  return {
    overallSeverity: 'warning',
    collector: { status: 'missing', generatedAt: null },
    disk: { path: '/', usedPercent: null, freeBytes: null, severity: 'unknown' },
    memory: { usedPercent: null, availableBytes: null, severity: 'unknown' },
    logs: {
      totalBytes: null,
      dockerBytes: null,
      openrestyBytes: null,
      openrestyConfigured: false,
      journalBytes: null,
      largestSource: 'none',
      largestDockerContainer: null,
      largestDockerContainerBytes: null,
      severity: 'unknown',
    },
    backup: {
      lastAttemptStatus: 'unknown',
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastSuccessFile: null,
      lastSuccessSizeBytes: null,
      severity: 'critical',
    },
    tls: null,
  };
}

export async function getHostOpsStatus(): Promise<AdminOverviewOpsStatus> {
  const file =
    process.env.OPS_STATUS_FILE?.trim() || '/run/daoyou/ops-status.json';

  let raw: RawOpsStatus;
  try {
    raw = JSON.parse(await readFile(file, 'utf8')) as RawOpsStatus;
  } catch {
    return missingOpsStatus();
  }

  const now = new Date();
  const generatedAt =
    typeof raw.generatedAt === 'string' ? raw.generatedAt : null;
  const generatedAtMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  const collectorStatus: AdminOverviewOpsStatus['collector']['status'] =
    !Number.isFinite(generatedAtMs)
      ? 'missing'
      : now.getTime() - generatedAtMs > OPS_STALE_MS
        ? 'stale'
        : 'fresh';

  const diskUsedPercent = finiteNumber(raw.disk?.usedPercent);
  const diskFreeBytes = finiteNumber(raw.disk?.freeBytes);
  const memoryUsedPercent = finiteNumber(raw.memory?.usedPercent);
  const memoryAvailableBytes = finiteNumber(raw.memory?.availableBytes);
  const logTotalBytes = finiteNumber(raw.logs?.totalBytes);
  const backupAttemptStatus =
    raw.backup?.lastAttemptStatus === 'success' ||
    raw.backup?.lastAttemptStatus === 'failed'
      ? raw.backup.lastAttemptStatus
      : 'unknown';
  const backupLastSuccessAt =
    typeof raw.backup?.lastSuccessAt === 'string'
      ? raw.backup.lastSuccessAt
      : null;
  const tlsDays = finiteNumber(raw.tls?.daysRemaining);

  const diskLevel = diskSeverity(diskUsedPercent, diskFreeBytes);
  const memoryLevel = memorySeverity(memoryUsedPercent);
  const logsLevel = logSeverity(logTotalBytes);
  const backupLevel = backupSeverity(
    backupAttemptStatus,
    backupLastSuccessAt,
    now,
  );
  const tlsLevel = tlsSeverity(tlsDays);
  const collectorLevel: AdminOpsSeverity =
    collectorStatus === 'fresh' ? 'ok' : 'warning';

  return {
    overallSeverity: maxSeverity(
      collectorLevel,
      diskLevel,
      memoryLevel,
      logsLevel,
      backupLevel,
      tlsLevel,
    ),
    collector: { status: collectorStatus, generatedAt },
    disk: {
      path: raw.disk?.path || '/',
      usedPercent: diskUsedPercent,
      freeBytes: diskFreeBytes,
      severity: diskLevel,
    },
    memory: {
      usedPercent: memoryUsedPercent,
      availableBytes: memoryAvailableBytes,
      severity: memoryLevel,
    },
    logs: {
      totalBytes: logTotalBytes,
      dockerBytes: finiteNumber(raw.logs?.dockerBytes),
      openrestyBytes: finiteNumber(raw.logs?.openrestyBytes),
      openrestyConfigured: raw.logs?.openrestyConfigured === true,
      journalBytes: finiteNumber(raw.logs?.journalBytes),
      largestSource:
        raw.logs?.largestSource === 'docker' ||
        raw.logs?.largestSource === 'openresty' ||
        raw.logs?.largestSource === 'journal'
          ? raw.logs.largestSource
          : 'none',
      largestDockerContainer:
        typeof raw.logs?.largestDockerContainer === 'string'
          ? raw.logs.largestDockerContainer
          : null,
      largestDockerContainerBytes: finiteNumber(
        raw.logs?.largestDockerContainerBytes,
      ),
      severity: logsLevel,
    },
    backup: {
      lastAttemptStatus: backupAttemptStatus,
      lastAttemptAt:
        typeof raw.backup?.lastAttemptAt === 'string'
          ? raw.backup.lastAttemptAt
          : null,
      lastSuccessAt: backupLastSuccessAt,
      lastSuccessFile:
        typeof raw.backup?.lastSuccessFile === 'string'
          ? raw.backup.lastSuccessFile
          : null,
      lastSuccessSizeBytes: finiteNumber(raw.backup?.lastSuccessSizeBytes),
      severity: backupLevel,
    },
    tls:
      raw.tls && typeof raw.tls.domain === 'string'
        ? {
            domain: raw.tls.domain,
            expiresAt:
              typeof raw.tls.expiresAt === 'string'
                ? raw.tls.expiresAt
                : null,
            daysRemaining: tlsDays,
            severity: tlsLevel,
          }
        : null,
  };
}
