import type { AdminCapability, AdminRole } from '@shared/contracts/adminAccess';
import { adminRoleHasCapability } from '@shared/contracts/adminAccess';

export interface AdminNavItem {
  title: string;
  description: string;
  href: string;
  capability: AdminCapability;
}

export const adminNavItems: AdminNavItem[] = [
  {
    title: '总览',
    description: '后台入口与能力地图',
    href: '/admin',
    capability: 'overview',
  },
  {
    title: 'Steam 账号',
    description: '查询 SteamID、绑定关系与异常解绑',
    href: '/admin/steam-accounts',
    capability: 'steam_accounts',
  },
  {
    title: '账号管理',
    description: '查询账号、改绑邮箱与封禁处理',
    href: '/admin/accounts',
    capability: 'accounts',
  },
  {
    title: '用户反馈',
    description: '处理玩家反馈工单',
    href: '/admin/feedback',
    capability: 'feedback',
  },
  {
    title: '系统邮件',
    description: '按条件发布公告与奖励',
    href: '/admin/broadcast/game-mail',
    capability: 'ops_messaging',
  },
  {
    title: '游戏公告',
    description: '认证页横幅公告配置',
    href: '/admin/announcement',
    capability: 'ops_messaging',
  },
  {
    title: '兑换码管理',
    description: '活动兑换码创建与停用',
    href: '/admin/redeem-codes',
    capability: 'ops_messaging',
  },
  {
    title: 'QQ交流群',
    description: '玩家社群 QQ 群号配置',
    href: '/admin/community-group',
    capability: 'ops_messaging',
  },
  {
    title: '材料库',
    description: '材料与灵种来源维护',
    href: '/admin/item-library',
    capability: 'game_content',
  },
  {
    title: '蜃楼敌人',
    description: '查看每周阵容、机制与战斗属性',
    href: '/admin/tower-enemy-sets',
    capability: 'game_content',
  },
  {
    title: '声望商店管理',
    description: '配置万界商行兑换商品',
    href: '/admin/reputation-shop',
    capability: 'commerce',
  },
  {
    title: '宗门宝库管理',
    description: '配置宗门贡献兑换商品',
    href: '/admin/sect-shop',
    capability: 'commerce',
  },
  {
    title: '功德簿管理',
    description: '爱发电映射、订单与认领处理',
    href: '/admin/sponsorship',
    capability: 'sponsorship',
  },
  {
    title: 'LLM 观测',
    description: '查看场景体积、usage 与缓存迹象',
    href: '/admin/llm-metrics',
    capability: 'llm_observe',
  },
  {
    title: '内容审核',
    description: '查看本地词库与语义审核结果',
    href: '/admin/content-moderation',
    capability: 'content_moderation',
  },
  {
    title: '在线人数',
    description: '查看实时在线与峰值',
    href: '/admin/online-users',
    capability: 'presence',
  },
  {
    title: '操作审计',
    description: '查看后台高风险操作记录',
    href: '/admin/audit',
    capability: 'audit',
  },
];

export function adminNavItemsForRole(role: AdminRole) {
  return adminNavItems.filter((item) =>
    adminRoleHasCapability(role, item.capability),
  );
}
