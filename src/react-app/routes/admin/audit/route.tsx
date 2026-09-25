import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkInput } from '@app/components/ui';
import type { AdminAuditEventView } from '@shared/contracts/adminOps';
import { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const { pushToast } = useInkUI();
  const [events, setEvents] = useState<AdminAuditEventView[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/admin/audit?${params}`, { cache: 'no-store' });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: { events: AdminAuditEventView[]; total: number };
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || '加载操作审计失败');
      }
      setEvents(payload.data.events);
      setTotal(payload.data.total);
    } catch (error) {
      pushToast({ message: error instanceof Error ? error.message : '加载操作审计失败', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [page, pushToast, search]);

  useEffect(() => { void load(); }, [load]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.22em]">ADMIN AUDIT</p>
        <h2 className="font-heading text-ink mt-2 text-3xl">操作审计</h2>
        <p className="text-ink-secondary mt-3 text-sm leading-7">记录所有后台写操作。该页面只向超级管理员开放。</p>
      </header>
      <section className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <InkInput label="搜索" placeholder="操作 / 目标ID / 管理员邮箱或ID" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
          </div>
          <InkButton type="button" variant="secondary" disabled={loading} onClick={() => void load()}>{loading ? '刷新中...' : '刷新'}</InkButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="text-ink-secondary border-b border-dashed"><tr><th className="px-2 py-3">时间</th><th className="px-2 py-3">管理员</th><th className="px-2 py-3">操作</th><th className="px-2 py-3">目标</th><th className="px-2 py-3">状态</th><th className="px-2 py-3">原因</th><th className="px-2 py-3">Request ID</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-ink/10 border-b border-dashed align-top">
                  <td className="px-2 py-3 text-xs">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-3"><div>{event.operatorEmail ?? event.operatorUserId}</div><div className="text-ink-secondary text-xs">{event.operatorRole}</div></td>
                  <td className="px-2 py-3 font-mono text-xs">{event.action}</td>
                  <td className="px-2 py-3 text-xs">{event.targetType ?? '-'}{event.targetId ? <div className="font-mono">{event.targetId}</div> : null}</td>
                  <td className="px-2 py-3">{event.status && event.status < 400 ? <span className="text-teal">{event.status}</span> : <span className="text-crimson">{event.status ?? '-'}</span>}</td>
                  <td className="px-2 py-3 text-xs">{event.reason ?? '-'}</td>
                  <td className="px-2 py-3 font-mono text-[11px]">{event.requestId ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-ink-secondary">共 {total} 条 · 第 {page}/{totalPages} 页</span><div className="flex gap-2"><InkButton type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>上一页</InkButton><InkButton type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((v) => Math.min(totalPages, v + 1))}>下一页</InkButton></div></div>
      </section>
    </div>
  );
}
