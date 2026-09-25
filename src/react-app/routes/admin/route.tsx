import Link from '@app/components/router/AppLink';
import type { AdminRole } from '@shared/contracts/adminAccess';
import { useOutletContext } from 'react-router';
import { adminNavItemsForRole } from './_config/nav';

export default function AdminOverviewPage() {
  const { adminRole } = useOutletContext<{ adminRole: AdminRole }>();
  const navItems = adminNavItemsForRole(adminRole).filter(
    (item) => item.href !== '/admin',
  );

  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.22em]">
          DASHBOARD
        </p>
        <h2 className="font-heading text-ink mt-2 text-4xl">运营总览</h2>
        <p className="text-ink-secondary mt-3 max-w-2xl text-sm leading-7">
          当前后台按管理员角色展示能力；真正权限同时由服务端 API 校验，前端菜单隐藏不作为安全边界。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group border-ink/15 bg-bgpaper/85 hover:border-crimson/50 border border-dashed p-5 no-underline transition"
          >
            <p className="text-ink-secondary text-xs tracking-[0.2em]">
              MODULE
            </p>
            <h3 className="text-ink group-hover:text-crimson mt-2 text-xl font-semibold">
              {item.title}
            </h3>
            <p className="text-ink-secondary mt-2 text-sm">
              {item.description}
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}
