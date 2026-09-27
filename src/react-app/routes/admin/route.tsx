import Link from '@app/components/router/AppLink';
import { InkButton } from '@app/components/ui/InkButton';
import type { AdminRole } from '@shared/contracts/adminAccess';
import { adminRoleHasCapability } from '@shared/contracts/adminAccess';
import type {
  AdminOverviewResponse,
  AdminOverviewSnapshot,
} from '@shared/contracts/adminOverview';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

const REFRESH_INTERVAL_MS = 60_000;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function statusLabel(status: 'up' | 'down' | 'disabled') {
  if (status === 'up') return '正常';
  if (status === 'disabled') return '未启用';
  return '异常';
}

function statusTone(status: 'up' | 'down' | 'disabled') {
  return status === 'up' ? 'text-emerald-700' : 'text-crimson';
}

function MetricCard(props: {
  title: string;
  value: string;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={props.href}
      className="border-ink/15 bg-bgpaper/85 hover:border-crimson/45 block border border-dashed p-5 no-underline transition"
    >
      <p className="text-ink-secondary text-xs tracking-[0.16em]">
        {props.title}
      </p>
      <p className="text-ink mt-2 text-3xl font-semibold">{props.value}</p>
      <p className="text-ink-secondary mt-2 text-xs leading-5">{props.hint}</p>
    </Link>
  );
}

async function fetchOverview(): Promise<AdminOverviewSnapshot> {
  const response = await fetch('/api/admin/overview', {
    cache: 'no-store',
    credentials: 'include',
  });
  const payload = (await response.json()) as
    | AdminOverviewResponse
    | { success?: false; error?: string };

  if (!response.ok || !payload.success || !('data' in payload)) {
    throw new Error(
      'error' in payload && payload.error ? payload.error : '加载总览失败',
    );
  }

  return payload.data;
}

export default function AdminOverviewPage() {
  const { adminRole } = useOutletContext<{ adminRole: AdminRole }>();
  const [snapshot, setSnapshot] = useState<AdminOverviewSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const next = await fetchOverview();
      setSnapshot(next);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载总览失败');
    } finally {
      if (showRefreshing) setRefreshing(false);
    }
  }, []);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    void loadRef.current();
    const timer = window.setInterval(() => {
      void loadRef.current();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const systemHealthy =
    snapshot?.system.postgres === 'up' &&
    snapshot.system.redis === 'up' &&
    snapshot.system.nats === 'up' &&
    snapshot.system.messaging === 'up';

  const accountHref = adminRoleHasCapability(adminRole, 'accounts')
    ? '/admin/accounts'
    : '/admin/steam-accounts';

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-dashed border-ink/15 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-ink-secondary text-xs tracking-[0.22em]">
            OVERVIEW
          </p>
          <h2 className="font-heading text-ink mt-2 text-4xl">总览</h2>
          <p className="text-ink-secondary mt-2 text-sm">
            只显示当前运行状态、活跃情况和需要处理的事项。
          </p>
        </div>
        <InkButton
          type="button"
          variant="secondary"
          disabled={refreshing}
          onClick={() => void load(true)}
        >
          {refreshing ? '刷新中…' : '刷新'}
        </InkButton>
      </header>

      {error ? (
        <div className="border-crimson/30 bg-crimson/5 text-crimson border border-dashed px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="border-ink/15 bg-bgpaper/80 border border-dashed px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className={systemHealthy ? 'text-emerald-700' : 'text-crimson'}>
            {systemHealthy ? '生产环境正常' : '生产环境存在异常'}
          </span>
          {snapshot ? (
            <>
              <span className={statusTone(snapshot.system.postgres)}>
                PostgreSQL {statusLabel(snapshot.system.postgres)}
              </span>
              <span className={statusTone(snapshot.system.redis)}>
                Redis {statusLabel(snapshot.system.redis)}
              </span>
              <span className={statusTone(snapshot.system.nats)}>
                NATS {statusLabel(snapshot.system.nats)}
              </span>
              <span className={statusTone(snapshot.system.messaging)}>
                消息系统 {statusLabel(snapshot.system.messaging)}
              </span>
              <span className="text-ink-secondary">
                版本 {snapshot.release}
              </span>
            </>
          ) : (
            <span className="text-ink-secondary">状态加载中…</span>
          )}
        </div>
        {snapshot ? (
          <p className="text-ink-secondary mt-2 text-xs">
            业务日 {snapshot.businessDate} · 最近刷新{' '}
            {formatDateTime(snapshot.generatedAt)}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {snapshot?.presence ? (
          <>
            <MetricCard
              title="当前在线"
              value={String(snapshot.presence.currentOnline)}
              hint={`今日峰值 ${snapshot.presence.todayPeakOnline}`}
              href="/admin/online-users"
            />
            <MetricCard
              title="24H 活跃"
              value={String(snapshot.presence.active24h)}
              hint="最近 24 小时有实时活动的活跃角色"
              href="/admin/online-users"
            />
          </>
        ) : null}

        {snapshot?.accounts ? (
          <MetricCard
            title="今日新增"
            value={String(snapshot.accounts.newToday)}
            hint={`其中 Steam ${snapshot.accounts.newSteamToday}`}
            href={accountHref}
          />
        ) : null}

        {snapshot?.feedback ? (
          <MetricCard
            title="反馈待办"
            value={String(snapshot.feedback.pending)}
            hint={`处理中 ${snapshot.feedback.processing}`}
            href="/admin/feedback"
          />
        ) : null}

        {snapshot?.moderation ? (
          <MetricCard
            title="内容安全"
            value={String(snapshot.moderation.unavailable24h)}
            hint={`审核不可用 · 24h 拒绝 ${snapshot.moderation.rejected24h}`}
            href="/admin/content-moderation"
          />
        ) : null}

        {snapshot?.llm ? (
          <MetricCard
            title="LLM 状态"
            value={
              snapshot.llm.calls > 0
                ? formatPercent(snapshot.llm.successRate)
                : '暂无调用'
            }
            hint={
              snapshot.llm.calls > 0
                ? `最近 ${snapshot.llm.calls}/${snapshot.llm.sampleSize} 次 · 失败 ${snapshot.llm.failureCalls}`
                : `最近 ${snapshot.llm.sampleSize} 次窗口无记录`
            }
            href="/admin/llm-metrics"
          />
        ) : null}
      </section>
    </div>
  );
}
