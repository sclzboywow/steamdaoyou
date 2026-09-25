import { AuthPageShell } from '@app/components/auth';
import { InkButton } from '@app/components/ui/InkButton';
import { authClient } from '@app/lib/auth/client';
import { isSteamRuntime } from '@app/lib/runtime';
import { loginWithSteam, SteamSessionError } from '@app/lib/steamSession';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';

export default function SteamLoginRoute() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [loading, setLoading] = useState(true);
  const [unlinked, setUnlinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isSteamRuntime) return <Navigate to="/login" replace />;

  const login = async (createIfMissing = false) => {
    setLoading(true);
    setError(null);
    setUnlinked(false);
    try {
      await loginWithSteam({ createIfMissing });
      const session = await authClient.getSession({
        fetchOptions: { cache: 'no-store' },
      });
      if (!session.data?.user) {
        throw new Error('Steam 会话已建立，但本地登录状态同步失败，请重试');
      }
      navigate('/game', { replace: true });
    } catch (err) {
      if (
        err instanceof SteamSessionError &&
        err.code === 'STEAM_ACCOUNT_NOT_LINKED'
      ) {
        setUnlinked(true);
      } else {
        setError(err instanceof Error ? err.message : 'Steam 登录失败');
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void login(false);
  }, []);

  return (
    <AuthPageShell
      title="【Steam 登录】"
      lead="正在验证当前 Steam 身份。已绑定账号会自动进入游戏。"
      backHref="/login?fallback=1"
    >
      <div className="space-y-4">
        {loading ? (
          <p className="text-ink-secondary text-sm">正在向 Steam 验证身份……</p>
        ) : null}
        {error ? (
          <p className="border-crimson/30 bg-crimson/5 text-crimson border border-dashed px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        {unlinked ? (
          <div className="space-y-3">
            <p className="text-ink-secondary text-sm leading-7">
              当前 Steam 尚未绑定万界道友账号。新玩家可直接创建；已有网页账号请先用邮箱登录，再到“系统设置 → 账号管理”绑定当前 Steam。
            </p>
            <InkButton
              variant="primary"
              onClick={() => void login(true)}
              className="w-full text-center"
            >
              我是新玩家，创建 Steam 游戏账号
            </InkButton>
            <InkButton
              href="/login?fallback=1"
              variant="secondary"
              className="w-full text-center"
            >
              我已有账号，使用邮箱登录
            </InkButton>
          </div>
        ) : null}
        {!loading && !unlinked ? (
          <InkButton
            variant="primary"
            onClick={() => void login(false)}
            className="w-full text-center"
          >
            重新尝试 Steam 登录
          </InkButton>
        ) : null}
      </div>
    </AuthPageShell>
  );
}
