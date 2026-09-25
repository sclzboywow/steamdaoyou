import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkInput } from '@app/components/ui';
import type {
  AdminSteamAccountItem,
  AdminSteamAccountListResponse,
} from '@shared/contracts/adminOps';
import { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 20;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '暂无';
}

export default function AdminSteamAccountsPage() {
  const { pushToast } = useInkUI();
  const [accounts, setAccounts] = useState<AdminSteamAccountItem[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminSteamAccountItem | null>(null);
  const [reason, setReason] = useState('');
  const [unlinking, setUnlinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/admin/steam-accounts?${params}`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as
        | AdminSteamAccountListResponse
        | { success?: false; error?: string };
      if (!response.ok || !payload.success || !('data' in payload)) {
        throw new Error(('error' in payload && payload.error) || '加载 Steam 账号失败');
      }
      setAccounts(payload.data.accounts);
      setTotal(payload.data.total);
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '加载 Steam 账号失败',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [page, pushToast, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unlink() {
    if (!selected) return;
    setUnlinking(true);
    try {
      const response = await fetch(
        `/api/admin/steam-accounts/${encodeURIComponent(selected.steamId)}/unlink`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedUserId: selected.userId,
            reason: reason.trim(),
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '解除 Steam 绑定失败');
      }
      pushToast({ message: 'Steam 绑定已解除，相关登录会话已撤销。' });
      setSelected(null);
      setReason('');
      await load();
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '解除 Steam 绑定失败',
        tone: 'danger',
      });
    } finally {
      setUnlinking(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.22em]">STEAM ACCOUNTS</p>
        <h2 className="font-heading text-ink mt-2 text-3xl">Steam 账号</h2>
        <p className="text-ink-secondary mt-3 text-sm leading-7">
          查询 SteamID64 与万界道友账号绑定关系。Steam-only 账号禁止直接解绑，避免产生重复账号。
        </p>
      </header>

      <section className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <InkInput
              label="搜索"
              placeholder="SteamID / userId / 邮箱 / 昵称 / 角色名"
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
          </div>
          <InkButton type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
            {loading ? '刷新中...' : '刷新'}
          </InkButton>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="text-ink-secondary border-b border-dashed">
              <tr>
                <th className="px-2 py-3">SteamID64</th>
                <th className="px-2 py-3">账号</th>
                <th className="px-2 py-3">角色</th>
                <th className="px-2 py-3">状态</th>
                <th className="px-2 py-3">绑定时间</th>
                <th className="px-2 py-3">会话</th>
                <th className="px-2 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.steamId} className="border-ink/10 border-b border-dashed align-top">
                  <td className="px-2 py-3 font-mono">{account.steamId}</td>
                  <td className="px-2 py-3">
                    <div>{account.accountName}</div>
                    <div className="text-ink-secondary text-xs">{account.email}</div>
                    <div className="text-ink-secondary mt-1 font-mono text-[11px]">{account.userId}</div>
                    {account.otherProviders.length ? (
                      <div className="text-teal mt-1 text-xs">其他登录：{account.otherProviders.join(', ')}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-3">
                    {account.activeCultivator ? (
                      <>
                        <div>{account.activeCultivator.name}</div>
                        <div className="text-ink-secondary text-xs">
                          {account.activeCultivator.realm}{account.activeCultivator.realmStage}
                        </div>
                      </>
                    ) : '暂无'}
                  </td>
                  <td className="px-2 py-3">
                    {account.banned ? (
                      <span className="text-crimson">已封禁</span>
                    ) : (
                      <span className="text-teal">正常</span>
                    )}
                    {account.syntheticEmail ? (
                      <div className="text-wood mt-1 text-xs">Steam-only</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-3 text-xs">{formatDate(account.linkedAt)}</td>
                  <td className="px-2 py-3 text-xs">
                    <div>活动：{account.activeSessionCount}</div>
                    <div className="text-ink-secondary">最后：{formatDate(account.lastSessionAt)}</div>
                  </td>
                  <td className="px-2 py-3">
                    <InkButton
                      type="button"
                      variant="secondary"
                      disabled={account.syntheticEmail && account.otherProviders.length === 0}
                      onClick={() => {
                        setSelected(account);
                        setReason('');
                      }}
                    >
                      解除绑定
                    </InkButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && accounts.length === 0 ? (
            <p className="text-ink-secondary py-8 text-center text-sm">暂无匹配记录。</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-secondary">共 {total} 条 · 第 {page}/{totalPages} 页</span>
          <div className="flex gap-2">
            <InkButton type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              上一页
            </InkButton>
            <InkButton type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              下一页
            </InkButton>
          </div>
        </div>
      </section>

      {selected ? (
        <section className="border-crimson/30 bg-bgpaper/95 space-y-4 border border-dashed p-6">
          <h3 className="text-ink text-xl font-semibold">确认解除 Steam 绑定</h3>
          <p className="text-ink-secondary text-sm leading-7">
            SteamID：<span className="font-mono">{selected.steamId}</span>。解除后会撤销该账号全部登录会话，玩家需重新登录。
          </p>
          <InkInput
            label="处理原因"
            multiline
            rows={3}
            placeholder="例如：玩家已完成邮箱验证，申请更换 Steam 账号"
            value={reason}
            onChange={setReason}
          />
          <div className="flex gap-2">
            <InkButton type="button" disabled={unlinking || reason.trim().length < 5} onClick={() => void unlink()}>
              {unlinking ? '处理中...' : '确认解除'}
            </InkButton>
            <InkButton type="button" variant="secondary" disabled={unlinking} onClick={() => setSelected(null)}>
              取消
            </InkButton>
          </div>
        </section>
      ) : null}
    </div>
  );
}
