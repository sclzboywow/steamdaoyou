export type AdminOverviewHealthStatus = 'up' | 'down' | 'disabled';

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
