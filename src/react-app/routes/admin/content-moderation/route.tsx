import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkInput } from '@app/components/ui';
import type {
  AdminContentModerationEventView,
  ContentModerationDecision,
} from '@shared/contracts/adminOps';
import { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 50;
const DECISIONS: Array<'all' | ContentModerationDecision> = ['all', 'local_reject', 'pass', 'reject', 'unavailable'];

const LABELS: Record<'all' | ContentModerationDecision, string> = {
  all: '全部',
  local_reject: '本地词库拒绝',
  pass: '通过',
  reject: '语义拒绝',
  unavailable: '审核不可用',
};

export default function AdminContentModerationPage() {
  const { pushToast } = useInkUI();
  const [events, setEvents] = useState<AdminContentModerationEventView[]>([]);
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState<'all' | ContentModerationDecision>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), decision });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/admin/content-moderation?${params}`, { cache: 'no-store' });
      const payload = (await response.json()) as { success?: boolean; error?: string; data?: { events: AdminContentModerationEventView[]; total: number } };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || '加载审核记录失败');
      setEvents(payload.data.events);
      setTotal(payload.data.total);
    } catch (error) {
      pushToast({ message: error instanceof Error ? error.message : '加载审核记录失败', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [decision, page, pushToast, search]);

  useEffect(() => { void load(); }, [load]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.22em]">CONTENT SAFETY</p>
        <h2 className="font-heading text-ink mt-2 text-3xl">内容审核</h2>
        <p className="text-ink-secondary mt-3 text-sm leading-7">默认只保存内容哈希、长度和审核结果；只有显式启用 CONTENT_SAFETY_LOG_TEXT=true 才保存最多 240 字预览。</p>
      </header>
      <section className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
          <InkInput label="搜索" placeholder="userId / source / reason / hash" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
          <label className="flex flex-col gap-1"><span className="text-ink font-semibold tracking-[0.08em]">结果</span><select className="border-ink/20 bg-transparent border px-3 py-2" value={decision} onChange={(event) => { setDecision(event.target.value as typeof decision); setPage(1); }}>{DECISIONS.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}</select></label>
          <InkButton type="button" variant="secondary" disabled={loading} onClick={() => void load()}>{loading ? '刷新中...' : '刷新'}</InkButton>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="text-ink-secondary border-b border-dashed"><tr><th className="px-2 py-3">时间</th><th className="px-2 py-3">来源</th><th className="px-2 py-3">用户</th><th className="px-2 py-3">结果</th><th className="px-2 py-3">内容</th><th className="px-2 py-3">原因</th><th className="px-2 py-3">耗时</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-ink/10 border-b border-dashed align-top"><td className="px-2 py-3 text-xs">{new Date(event.createdAt).toLocaleString()}</td><td className="px-2 py-3"><div>{event.source}</div><div className="text-ink-secondary text-xs">{event.provider}</div></td><td className="px-2 py-3 font-mono text-xs">{event.userId}</td><td className="px-2 py-3">{LABELS[event.decision]}</td><td className="px-2 py-3 text-xs"><div>{event.contentLength} 字</div><div className="text-ink-secondary font-mono">{event.contentHash.slice(0, 16)}…</div>{event.contentExcerpt ? <div className="mt-1 max-w-md whitespace-pre-wrap">{event.contentExcerpt}</div> : null}</td><td className="px-2 py-3 text-xs">{event.reason ?? '-'}</td><td className="px-2 py-3 text-xs">{event.durationMs == null ? '-' : `${event.durationMs}ms`}</td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-ink-secondary">共 {total} 条 · 第 {page}/{totalPages} 页</span><div className="flex gap-2"><InkButton type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>上一页</InkButton><InkButton type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((v) => Math.min(totalPages, v + 1))}>下一页</InkButton></div></div>
      </section>
    </div>
  );
}
