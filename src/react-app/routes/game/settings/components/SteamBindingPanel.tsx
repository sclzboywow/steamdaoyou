import { InkButton } from '@app/components/ui/InkButton';
import { isSteamRuntime } from '@app/lib/runtime';
import { bindCurrentAccountToSteam } from '@app/lib/steamSession';
import { useEffect, useState } from 'react';

export function SteamBindingPanel() {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [steamId, setSteamId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSteamRuntime) return;
    let cancelled = false;
    void fetch('/api/steam-auth/status')
      .then(async (response) => {
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          data?: { steamId: string | null };
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Steam 绑定状态读取失败');
        }
        if (!cancelled) setSteamId(payload.data?.steamId ?? null);
      })
      .catch((error) => {
        if (!cancelled)
          setMessage(error instanceof Error ? error.message : '读取失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isSteamRuntime) return null;

  const bind = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const nextSteamId = await bindCurrentAccountToSteam();
      setSteamId(nextSteamId);
      setMessage('Steam 账号绑定成功。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Steam 绑定失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-ink/15 mb-6 border border-dashed px-4 py-4">
      <h3 className="font-medium">Steam 账号</h3>
      <p className="text-ink-secondary mt-2 text-sm leading-7">
        {loading
          ? '正在读取 Steam 绑定状态……'
          : steamId
            ? `当前账号已绑定 SteamID ${steamId}。`
            : '若你使用邮箱账号进入客户端，可将当前 Steam 账号绑定到此游戏账号。绑定后以后将自动通过 Steam 登录。'}
      </p>
      {!loading && !steamId ? (
        <div className="mt-3 flex items-center gap-3">
          <InkButton
            variant="secondary"
            onClick={() => void bind()}
            pending={busy}
            pendingLabel="绑定中……"
          >
            绑定当前 Steam 账号
          </InkButton>
        </div>
      ) : null}
      {message ? (
        <p className="text-ink-secondary mt-3 text-sm">{message}</p>
      ) : null}
    </section>
  );
}
