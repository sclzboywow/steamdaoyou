import { db } from '@server/lib/drizzle/db';
import {
  itemLibrary,
  reputationShopItems,
  sectShopItems,
} from '@server/lib/drizzle/schema';
import {
  AdminRewardItemSchema,
  rewardDisplayItem,
} from '@shared/contracts/adminRewards';
import { CHARACTER_MANUALS_V1 } from '@shared/engine/combat-v6/manuals/content';
import type { ItemGrant } from '@shared/inventory';
import { libraryMaterialGrant } from '@shared/items/libraryMaterialGrant';
import { ITEM_DEFINITIONS } from '@shared/items/registry';
import { getItemExchangePurchaseWeek } from '@shared/lib/itemExchangeShop';
import {
  parseItemLibraryEntry,
  type ItemLibraryEntry,
} from '@shared/lib/itemLibrary';
import {
  REALM_ORDER,
  REALM_VALUES,
  type RealmType,
} from '@shared/types/constants';
import { eq, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';

type Quality =
  | '凡品'
  | '灵品'
  | '玄品'
  | '真品'
  | '地品'
  | '天品'
  | '仙品'
  | '神品';

type LibraryCategory = 'herb' | 'ore' | 'monster' | 'aux' | 'tcdb' | 'seed';
type ShopName = 'reputation' | 'sect';

interface PlannedShopItem {
  shop: ShopName;
  slotKey: string;
  id: string;
  name: string;
  itemLibraryItemId: string | null;
  itemSnapshot: Omit<ItemGrant, 'quantity'>;
  price: number;
  quantity: number;
  perUserLimit: number | null;
  minRealm: RealmType;
  maxRealm: RealmType | null;
  sortOrder: number;
}

interface RealmCatalogConfig {
  realm: RealmType;
  sectQualities: readonly Quality[];
  rareQuality: Quality;
  ordinaryBookCount: number;
  advancedBookCount: number;
  manualRealm: '炼气' | '筑基' | '金丹' | '元婴' | null;
  blueprintLevel: 10 | 30 | 50 | 70 | 90 | null;
  inscriptionLevel: 1 | 3 | 5 | 7 | 9 | 11 | null;
}

const SECT_CATEGORIES: readonly LibraryCategory[] = [
  'herb',
  'ore',
  'monster',
  'aux',
  'tcdb',
  'seed',
];

// 每个境界都有自己的六格宗门补给。玩家看到“本境界 + 前一境界”两层，
// 既避免升级后低阶材料立刻消失，也避免渡劫玩家一次看到五十多格低阶商品。
const REALM_CATALOGS: readonly RealmCatalogConfig[] = [
  {
    realm: '炼气',
    sectQualities: ['凡品', '凡品', '凡品', '凡品', '凡品', '灵品'],
    rareQuality: '灵品',
    ordinaryBookCount: 2,
    advancedBookCount: 0,
    manualRealm: '炼气',
    blueprintLevel: 10,
    inscriptionLevel: 1,
  },
  {
    realm: '筑基',
    sectQualities: ['灵品', '灵品', '灵品', '灵品', '玄品', '玄品'],
    rareQuality: '玄品',
    ordinaryBookCount: 2,
    advancedBookCount: 0,
    manualRealm: '筑基',
    blueprintLevel: 30,
    inscriptionLevel: 3,
  },
  {
    realm: '金丹',
    sectQualities: ['玄品', '玄品', '玄品', '玄品', '真品', '真品'],
    rareQuality: '真品',
    ordinaryBookCount: 1,
    advancedBookCount: 1,
    manualRealm: '金丹',
    blueprintLevel: 50,
    inscriptionLevel: 5,
  },
  {
    realm: '元婴',
    sectQualities: ['真品', '真品', '真品', '地品', '地品', '地品'],
    rareQuality: '地品',
    ordinaryBookCount: 1,
    advancedBookCount: 1,
    manualRealm: '元婴',
    blueprintLevel: 70,
    inscriptionLevel: 7,
  },
  {
    realm: '化神',
    sectQualities: ['地品', '地品', '地品', '天品', '天品', '天品'],
    rareQuality: '天品',
    ordinaryBookCount: 1,
    advancedBookCount: 2,
    manualRealm: null,
    blueprintLevel: 90,
    inscriptionLevel: 9,
  },
  {
    realm: '炼虚',
    sectQualities: ['天品', '天品', '天品', '仙品', '仙品', '仙品'],
    rareQuality: '仙品',
    ordinaryBookCount: 0,
    advancedBookCount: 2,
    manualRealm: null,
    blueprintLevel: null,
    inscriptionLevel: 11,
  },
  {
    realm: '合体',
    sectQualities: ['天品', '天品', '仙品', '仙品', '仙品', '仙品'],
    rareQuality: '仙品',
    ordinaryBookCount: 0,
    advancedBookCount: 2,
    manualRealm: null,
    blueprintLevel: null,
    inscriptionLevel: null,
  },
  {
    realm: '大乘',
    sectQualities: ['天品', '天品', '仙品', '仙品', '仙品', '仙品'],
    rareQuality: '仙品',
    ordinaryBookCount: 0,
    advancedBookCount: 2,
    manualRealm: null,
    blueprintLevel: null,
    inscriptionLevel: null,
  },
  {
    realm: '渡劫',
    // 宗门任务最高只要求仙品，所以神品不进入宗门宝库。
    sectQualities: ['天品', '天品', '仙品', '仙品', '仙品', '仙品'],
    rareQuality: '神品',
    ordinaryBookCount: 0,
    advancedBookCount: 2,
    manualRealm: null,
    blueprintLevel: null,
    inscriptionLevel: null,
  },
] as const;

const SECT_PRICE: Record<Quality, number> = {
  凡品: 8,
  灵品: 15,
  玄品: 30,
  真品: 55,
  地品: 90,
  天品: 140,
  仙品: 220,
  神品: 9999,
};

const SECT_QUANTITY: Record<Quality, number> = {
  凡品: 5,
  灵品: 3,
  玄品: 2,
  真品: 2,
  地品: 1,
  天品: 1,
  仙品: 1,
  神品: 1,
};

const SECT_LIMIT: Record<Quality, number> = {
  凡品: 3,
  灵品: 3,
  玄品: 2,
  真品: 2,
  地品: 2,
  天品: 1,
  仙品: 1,
  神品: 1,
};

const REPUTATION_LIBRARY_PRICE: Record<Quality, number> = {
  凡品: 40,
  灵品: 70,
  玄品: 100,
  真品: 140,
  地品: 200,
  天品: 300,
  仙品: 450,
  神品: 700,
};

const BLUEPRINT_PRICE: Record<10 | 30 | 50 | 70 | 90, number> = {
  10: 80,
  30: 120,
  50: 180,
  70: 240,
  90: 320,
};

const INSCRIPTION_PRICE: Record<1 | 3 | 5 | 7 | 9 | 11, number> = {
  1: 40,
  3: 80,
  5: 140,
  7: 220,
  9: 320,
  11: 450,
};

const MANUAL_PRICE: Record<'炼气' | '筑基' | '金丹' | '元婴', number> = {
  炼气: 120,
  筑基: 180,
  金丹: 240,
  元婴: 320,
};

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function normalizeIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function rotatePick<T>(items: readonly T[], offset: number): T {
  if (!items.length) throw new Error('轮换池为空');
  return items[normalizeIndex(offset, items.length)]!;
}

function takeRotating<T>(items: readonly T[], count: number, start: number): T[] {
  if (count <= 0) return [];
  if (!items.length) throw new Error('轮换池为空');
  return Array.from({ length: Math.min(count, items.length) }, (_, index) =>
    rotatePick(items, start + index),
  );
}

function nextRealm(realm: RealmType): RealmType | null {
  const index = REALM_VALUES.indexOf(realm);
  return index >= 0 && index < REALM_VALUES.length - 1
    ? REALM_VALUES[index + 1]!
    : null;
}

function stableUuid(slotKey: string): string {
  const hex = createHash('sha256')
    .update(`wanjiedaoyou.exchange-shop.slot.v1:${slotKey}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function stripQuantity(grant: ItemGrant): Omit<ItemGrant, 'quantity'> {
  const validated = AdminRewardItemSchema.parse(grant);
  const { quantity: _quantity, ...snapshot } = validated;
  return snapshot;
}

function sortBase(realm: RealmType): number {
  // 高境界玩家看到多层商品时，优先展示本境界和更高相关度商品。
  return 1000 - REALM_ORDER[realm] * 100;
}

function fixedItem(
  slotKey: string,
  definitionId: string,
  input: {
    minRealm: RealmType;
    maxRealm?: RealmType | null;
    price: number;
    quantity?: number;
    perUserLimit?: number | null;
    sortOrder: number;
  },
): PlannedShopItem {
  const definition = ITEM_DEFINITIONS.find((item) => item.id === definitionId);
  if (!definition) throw new Error(`固定物品未注册：${definitionId}`);
  const quantity = input.quantity ?? 1;
  const grant = AdminRewardItemSchema.parse({ definitionId, quantity });
  return {
    shop: 'reputation',
    slotKey,
    id: stableUuid(`reputation:${slotKey}`),
    name: rewardDisplayItem(grant).name,
    itemLibraryItemId: null,
    itemSnapshot: stripQuantity(grant),
    price: input.price,
    quantity,
    perUserLimit: input.perUserLimit ?? 1,
    minRealm: input.minRealm,
    maxRealm: input.maxRealm ?? null,
    sortOrder: input.sortOrder,
  };
}

function libraryItem(
  shop: ShopName,
  slotKey: string,
  entry: ItemLibraryEntry,
  input: {
    minRealm: RealmType;
    maxRealm?: RealmType | null;
    price: number;
    quantity: number;
    perUserLimit: number | null;
    sortOrder: number;
  },
): PlannedShopItem {
  const grant = AdminRewardItemSchema.parse({
    ...libraryMaterialGrant(entry),
    quantity: input.quantity,
  });
  return {
    shop,
    slotKey,
    id: stableUuid(`${shop}:${slotKey}`),
    name: rewardDisplayItem(grant).name,
    itemLibraryItemId: entry.itemId,
    itemSnapshot: stripQuantity(grant),
    price: input.price,
    quantity: input.quantity,
    perUserLimit: input.perUserLimit,
    minRealm: input.minRealm,
    maxRealm: input.maxRealm ?? null,
    sortOrder: input.sortOrder,
  };
}

function qualityOf(entry: ItemLibraryEntry): Quality {
  if (entry.type !== 'material') throw new Error('仅支持材料库物品');
  return entry.payload.rank;
}

function categoryOf(entry: ItemLibraryEntry): string {
  return entry.type === 'material' ? entry.payload.type : '';
}

function pickLibraryEntry(
  entries: readonly ItemLibraryEntry[],
  category: LibraryCategory,
  quality: Quality,
  rotation: number,
  offset: number,
): ItemLibraryEntry {
  const pool = entries
    .filter(
      (entry) =>
        entry.type === 'material' &&
        entry.status === 'published' &&
        categoryOf(entry) === category &&
        qualityOf(entry) === quality,
    )
    .sort((left, right) => left.itemId.localeCompare(right.itemId, 'en'));
  if (!pool.length) throw new Error(`物品库缺货：${quality}/${category}`);
  return rotatePick(pool, rotation + offset);
}

function definitionIds(
  predicate: (item: (typeof ITEM_DEFINITIONS)[number]) => boolean,
): string[] {
  return ITEM_DEFINITIONS.filter(predicate)
    .map((item) => item.id)
    .sort();
}

function manualIds(
  realm: NonNullable<RealmCatalogConfig['manualRealm']>,
): string[] {
  return CHARACTER_MANUALS_V1.filter((manual) => manual.realm === realm)
    .map((manual) => `jade.${manual.id}`)
    .sort();
}

function buildSectPlan(
  entries: readonly ItemLibraryEntry[],
  rotation: number,
): PlannedShopItem[] {
  const plan: PlannedShopItem[] = [];
  for (const config of REALM_CATALOGS) {
    const maxRealm = nextRealm(config.realm);
    for (let index = 0; index < SECT_CATEGORIES.length; index += 1) {
      const category = SECT_CATEGORIES[index]!;
      const quality = config.sectQualities[index]!;
      const entry = pickLibraryEntry(
        entries,
        category,
        quality,
        rotation + REALM_ORDER[config.realm] * 97,
        index * 17,
      );
      plan.push(
        libraryItem('sect', `${config.realm}:${category}`, entry, {
          minRealm: config.realm,
          maxRealm,
          price: SECT_PRICE[quality],
          quantity: SECT_QUANTITY[quality],
          perUserLimit: SECT_LIMIT[quality],
          sortOrder: sortBase(config.realm) + index * 10,
        }),
      );
    }
  }
  return plan;
}

function buildReputationPlan(
  entries: readonly ItemLibraryEntry[],
  rotation: number,
): PlannedShopItem[] {
  const plan: PlannedShopItem[] = [];

  // 灵兽洗练道具是明确的替代关系：普通露只服务炼气～金丹；上品从元婴开始。
  plan.push(
    fixedItem('beast-refinement:origin-dew', 'beast.refinement.origin-dew', {
      minRealm: '炼气',
      maxRealm: '金丹',
      price: 60,
      perUserLimit: 2,
      sortOrder: sortBase('炼气'),
    }),
    fixedItem(
      'beast-refinement:superior-origin-dew',
      'beast.refinement.superior-origin-dew',
      {
        minRealm: '元婴',
        price: 180,
        perUserLimit: 1,
        sortOrder: sortBase('元婴'),
      },
    ),
  );

  const ordinaryBooks = definitionIds(
    (item) => item.kind === 'beast_book' && !item.id.includes('.advanced-'),
  );
  const advancedBooks = definitionIds(
    (item) => item.kind === 'beast_book' && item.id.includes('.advanced-'),
  );

  for (const config of REALM_CATALOGS) {
    let slot = 10;
    const realmOffset = REALM_ORDER[config.realm] * 131;

    for (const [index, id] of takeRotating(
      ordinaryBooks,
      config.ordinaryBookCount,
      rotation + realmOffset,
    ).entries()) {
      plan.push(
        fixedItem(`${config.realm}:ordinary-book:${index + 1}`, id, {
          minRealm: config.realm,
          price: 100 + REALM_ORDER[config.realm] * 15,
          perUserLimit: 1,
          sortOrder: sortBase(config.realm) + slot,
        }),
      );
      slot += 10;
    }

    for (const [index, id] of takeRotating(
      advancedBooks,
      config.advancedBookCount,
      rotation + realmOffset * 3 + 7,
    ).entries()) {
      plan.push(
        fixedItem(`${config.realm}:advanced-book:${index + 1}`, id, {
          minRealm: config.realm,
          price: config.realm === '渡劫' ? 520 : 400 + REALM_ORDER[config.realm] * 10,
          perUserLimit: 1,
          sortOrder: sortBase(config.realm) + slot,
        }),
      );
      slot += 10;
    }

    if (config.manualRealm) {
      for (const [index, id] of takeRotating(
        manualIds(config.manualRealm),
        2,
        rotation + realmOffset * 5 + 11,
      ).entries()) {
        plan.push(
          fixedItem(`${config.realm}:manual:${index + 1}`, id, {
            minRealm: config.realm,
            price: MANUAL_PRICE[config.manualRealm],
            perUserLimit: 1,
            sortOrder: sortBase(config.realm) + slot,
          }),
        );
        slot += 10;
      }
    }

    if (config.blueprintLevel !== null) {
      const blueprints = definitionIds(
        (item) =>
          item.kind === 'blueprint' && item.level === config.blueprintLevel,
      );
      for (const [index, id] of takeRotating(
        blueprints,
        2,
        rotation + realmOffset * 7 + 13,
      ).entries()) {
        plan.push(
          fixedItem(`${config.realm}:blueprint:${index + 1}`, id, {
            minRealm: config.realm,
            price: BLUEPRINT_PRICE[config.blueprintLevel],
            perUserLimit: 1,
            sortOrder: sortBase(config.realm) + slot,
          }),
        );
        slot += 10;
      }
    }

    if (config.inscriptionLevel !== null) {
      const inscriptions = definitionIds(
        (item) =>
          item.kind === 'inscription' && item.level === config.inscriptionLevel,
      );
      for (const [index, id] of takeRotating(
        inscriptions,
        2,
        rotation + realmOffset * 11 + 17,
      ).entries()) {
        plan.push(
          fixedItem(`${config.realm}:inscription:${index + 1}`, id, {
            minRealm: config.realm,
            price: INSCRIPTION_PRICE[config.inscriptionLevel],
            perUserLimit: 1,
            sortOrder: sortBase(config.realm) + slot,
          }),
        );
        slot += 10;
      }
    }

    const rareMaxRealm = nextRealm(config.realm);
    const rareCategory = rotatePick(
      ['herb', 'ore', 'monster', 'aux', 'tcdb'] as const,
      rotation + realmOffset,
    );
    const rareMaterial = pickLibraryEntry(
      entries,
      rareCategory,
      config.rareQuality,
      rotation + realmOffset,
      211,
    );
    plan.push(
      libraryItem('reputation', `${config.realm}:rare-material`, rareMaterial, {
        minRealm: config.realm,
        maxRealm: rareMaxRealm,
        price: REPUTATION_LIBRARY_PRICE[config.rareQuality],
        quantity: 1,
        perUserLimit: 1,
        sortOrder: sortBase(config.realm) + slot,
      }),
    );
    slot += 10;

    const rareSeed = pickLibraryEntry(
      entries,
      'seed',
      config.rareQuality,
      rotation + realmOffset,
      307,
    );
    plan.push(
      libraryItem('reputation', `${config.realm}:rare-seed`, rareSeed, {
        minRealm: config.realm,
        maxRealm: rareMaxRealm,
        price: Math.min(
          9999,
          Math.round(REPUTATION_LIBRARY_PRICE[config.rareQuality] * 1.15),
        ),
        quantity: 1,
        perUserLimit: 1,
        sortOrder: sortBase(config.realm) + slot,
      }),
    );
  }

  return plan;
}

function assertPlan(plan: readonly PlannedShopItem[]) {
  const ids = new Set<string>();
  for (const item of plan) {
    if (ids.has(item.id)) throw new Error(`商店槽位ID重复：${item.slotKey}`);
    ids.add(item.id);
    if (!Number.isInteger(item.price) || item.price < 1 || item.price > 9999)
      throw new Error(`价格非法：${item.name} = ${item.price}`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 30)
      throw new Error(`数量非法：${item.name} = ${item.quantity}`);
    if (
      item.perUserLimit !== null &&
      (!Number.isInteger(item.perUserLimit) || item.perUserLimit < 1)
    )
      throw new Error(`周限购非法：${item.name}`);
    if (
      item.maxRealm !== null &&
      REALM_ORDER[item.minRealm] > REALM_ORDER[item.maxRealm]
    )
      throw new Error(`境界范围非法：${item.name}`);
    AdminRewardItemSchema.parse({ ...item.itemSnapshot, quantity: item.quantity });
  }
}

function printPlan(plan: readonly PlannedShopItem[], weekKey: string, rotation: number) {
  console.log(`购买周：${weekKey}`);
  console.log(`轮换序号：${rotation}`);
  console.table(
    plan.map((item) => ({
      商店: item.shop === 'reputation' ? '声望商店' : '宗门宝库',
      槽位: item.slotKey,
      商品: item.name,
      来源ID: item.itemLibraryItemId ?? item.itemSnapshot.definitionId,
      开放境界: item.minRealm,
      最高境界: item.maxRealm ?? '不限',
      单次数量: item.quantity,
      价格: item.price,
      周限购: item.perUserLimit ?? '不限',
    })),
  );
}

const weekKey = getItemExchangePurchaseWeek();
const rawRotation = readArg('--rotation');
const rotation = rawRotation === undefined
  ? Number(weekKey.replaceAll('-', ''))
  : Number(rawRotation);
if (!Number.isInteger(rotation)) throw new Error('--rotation 必须是整数');

const dryRun = hasFlag('--dry-run');
const replaceAll = hasFlag('--replace-all');
const explicitOperator = readArg('--operator');

try {
  const rows = await db
    .select()
    .from(itemLibrary)
    .where(eq(itemLibrary.status, 'published'));
  const entries = rows.map((row) => parseItemLibraryEntry(row));
  const safeEntries = entries.filter(
    (entry) =>
      entry.type === 'material' &&
      ['herb', 'ore', 'monster', 'aux', 'tcdb', 'seed'].includes(
        entry.payload.type,
      ),
  );
  if (!safeEntries.length) throw new Error('published 新版材料/灵种为空');

  const operatorUserId =
    explicitOperator ?? safeEntries[0]?.updatedBy ?? entries[0]?.updatedBy;
  if (!operatorUserId) throw new Error('无法确定后台操作人 UUID，请传 --operator');

  const reputationPlan = buildReputationPlan(safeEntries, rotation);
  const sectPlan = buildSectPlan(safeEntries, rotation);
  const plan = [...reputationPlan, ...sectPlan];
  assertPlan(plan);
  printPlan(plan, weekKey, rotation);

  if (dryRun) {
    console.log('\nDRY RUN：未修改数据库。');
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    if (replaceAll) {
      await tx
        .update(reputationShopItems)
        .set({ status: 'archived', updatedBy: operatorUserId, updatedAt: new Date() })
        .where(eq(reputationShopItems.status, 'active'));
      await tx
        .update(sectShopItems)
        .set({ status: 'archived', updatedBy: operatorUserId, updatedAt: new Date() })
        .where(eq(sectShopItems.status, 'active'));
    } else {
      const reputationIds = reputationPlan.map((item) => item.id);
      const sectIds = sectPlan.map((item) => item.id);
      if (reputationIds.length) {
        await tx
          .update(reputationShopItems)
          .set({ status: 'archived', updatedBy: operatorUserId, updatedAt: new Date() })
          .where(inArray(reputationShopItems.id, reputationIds));
      }
      if (sectIds.length) {
        await tx
          .update(sectShopItems)
          .set({ status: 'archived', updatedBy: operatorUserId, updatedAt: new Date() })
          .where(inArray(sectShopItems.id, sectIds));
      }
    }

    for (const item of reputationPlan) {
      await tx
        .insert(reputationShopItems)
        .values({
          id: item.id,
          itemLibraryItemId: item.itemLibraryItemId,
          itemSnapshot: item.itemSnapshot,
          price: item.price,
          quantity: item.quantity,
          perUserLimit: item.perUserLimit,
          minRealm: item.minRealm,
          maxRealm: item.maxRealm,
          status: 'active',
          sortOrder: item.sortOrder,
          createdBy: operatorUserId,
          updatedBy: operatorUserId,
        })
        .onConflictDoUpdate({
          target: reputationShopItems.id,
          set: {
            itemLibraryItemId: item.itemLibraryItemId,
            itemSnapshot: item.itemSnapshot,
            price: item.price,
            quantity: item.quantity,
            perUserLimit: item.perUserLimit,
            minRealm: item.minRealm,
            maxRealm: item.maxRealm,
            status: 'active',
            sortOrder: item.sortOrder,
            updatedBy: operatorUserId,
            updatedAt: new Date(),
          },
        });
    }

    for (const item of sectPlan) {
      await tx
        .insert(sectShopItems)
        .values({
          id: item.id,
          itemLibraryItemId: item.itemLibraryItemId,
          itemSnapshot: item.itemSnapshot,
          price: item.price,
          quantity: item.quantity,
          perUserLimit: item.perUserLimit,
          minRealm: item.minRealm,
          maxRealm: item.maxRealm,
          status: 'active',
          sortOrder: item.sortOrder,
          createdBy: operatorUserId,
          updatedBy: operatorUserId,
        })
        .onConflictDoUpdate({
          target: sectShopItems.id,
          set: {
            itemLibraryItemId: item.itemLibraryItemId,
            itemSnapshot: item.itemSnapshot,
            price: item.price,
            quantity: item.quantity,
            perUserLimit: item.perUserLimit,
            minRealm: item.minRealm,
            maxRealm: item.maxRealm,
            status: 'active',
            sortOrder: item.sortOrder,
            updatedBy: operatorUserId,
            updatedAt: new Date(),
          },
        });
    }
  });

  console.log(
    `\n上架完成：声望商店 ${reputationPlan.length} 件，宗门宝库 ${sectPlan.length} 件。`,
  );
  console.log('固定槽位 UUID 保证同一周重复执行不会重置玩家周限购。');
  process.exit(0);
} catch (error) {
  console.error('[shops:seed] 失败', error);
  process.exit(1);
}
