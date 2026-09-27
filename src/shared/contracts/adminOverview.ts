export type AdminOverviewHealthStatus = 'up' | 'down' | 'disabled';
export type AdminOpsSeverity = 'ok' | 'warning' | 'critical' | 'unknown';

export interface AdminOverviewOpsStatus {
  overallSeverity: AdminOpsSeverity;
  collector: {
    status: 'fresh' | 'stale' | 'missing';
    generatedAt: string | null;
  };
  disk: {
    path: string;
    usedPercent: number | null;
    freeBytes: number | null;
    severity: AdminOpsSeverity;
  };
  memory: {
    usedPercent: number | null;
    availableBytes: number | null;
    severity: AdminOpsSeverity;
  };
  logs: {
    totalBytes: number | null;
    dockerBytes: number | null;
    openrestyBytes: number | null;
    openrestyConfigured: boolean;
    journalBytes: number | null;
    largestSource: 'docker' | 'openresty' | 'journal' | 'none';
    largestDockerContainer: string | null;
    largestDockerContainerBytes: number | null;
    severity: AdminOpsSeverity;
  };
  backup: {
    lastAttemptStatus: 'success' | 'failed' | 'unknown';
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastSuccessFile: string | null;
    lastSuccessSizeBytes: number | null;
    severity: AdminOpsSeverity;
  };
  tls: {
    domain: string;
    expiresAt: string | null;
    daysRemaining: number | null;
    severity: AdminOpsSeverity;
  } | null;
}


export interface AdminOverviewSnapshot {
  generatedAt: string;
  businessDate: string;
  release: string;
  system: {
    postgres: 'up' | 'down';
    redis: AdminOverviewHealthStatus;
    nats: 'up' | 'down';
    messaging: 'up' | 'down';
  };
  ops: AdminOverviewOpsStatus | null;
  presence: {
    currentOnline: number;
    todayPeakOnline: number;
    active24h: number;
  } | null;
  accounts: {
    newToday: number;
    newSteamToday: number;
  } | null;
  feedback: {
    pending: number;
    processing: number;
  } | null;
  moderation: {
    unavailable24h: number;
    rejected24h: number;
  } | null;
  llm: {
    sampleSize: number;
    calls: number;
    failureCalls: number;
    successRate: number;
  } | null;
}

export interface AdminOverviewResponse {
  success: true;
  data: AdminOverviewSnapshot;
}
