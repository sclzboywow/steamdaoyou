import { db } from '@server/lib/drizzle/db';
import {
  itemLibrary,
  reputationShopItems,
  sectShopItems,
} from '@server/lib/drizzle/schema';
import {
  RewardItemSchema,
  rewardDisplayItem,
} from '@shared/contracts/adminRewards';
import { getItemExchangePurchaseWeek } from '@shared/lib/itemExchangeShop';
import { CHARACTER_MANUALS_V1 } from '@shared/engine/combat-v6/manuals/content';
import type { ItemGrant } from '@shared/inventory';
import { libraryMaterialGrant } from '@shared/items/libraryMaterialGrant';
import { ITEM_DEFINITIONS } from '@shared/items/registry';
import {
  parseItemLibraryEntry,
  type ItemLibraryEntry,
} from '@shared/lib/itemLibrary';
import { eq } from 'drizzle-orm';

type Quality =
  | '凡品'
  | '灵品'
  | '玄品'
  | '真品'
  | '地品'
  | '天品'
  | '仙品'
  | '神品';

type LibraryCategory =
  | 'herb'
  | 'ore'
  | 'monster'
  | 'aux'
  | 'tcdb'
  | 'seed';

type StageKey =
  | 'lianqi'
  | 'zhuji'
  | 'jindan'
  | 'yuanying'
  | 'huashen'
  | 'lianxu'
  | 'heti'
  | 'dacheng'
  | 'dujie'
  | 'endgame';

interface StageConfig {
  label: string;
  sectQualities: Quality[];
  reputationQuality: Quality;
  manualRealm: '炼气' | '筑基' | '金丹' | '元婴' | null;
  blueprintLevel: 10 | 30 | 50 | 70 | 90 | null;
  inscriptionLevel: 1 | 3 | 5 | 7 | 9 | 11;
  ordinaryBookCount: number;
  advancedBookCount: number;
}

interface PlannedShopItem {
  shop: 'reputation' | 'sect';
  name: string;
  itemLibraryItemId: string | null;
  itemSnapshot: Omit<ItemGrant, 'quantity'>;
  price: number;
  quantity: number;
  perUserLimit: number | null;
  sortOrder: number;
}

const STAGES: Record<StageKey, StageConfig> = {
  lianqi: {
    label: '炼气',
    sectQualities: ['凡品', '凡品', '凡品', '凡品', '凡品', '凡品', '灵品', '灵品', '灵品', '灵品'],
    reputationQuality: '灵品',
    manualRealm: '炼气',
    blueprintLevel: 10,
    inscriptionLevel: 1,
    ordinaryBookCount: 2,
    advancedBookCount: 0,
  },
  zhuji: {
    label: '筑基',
    sectQualities: ['灵品', '灵品', '灵品', '灵品', '灵品', '灵品', '灵品', '玄品', '玄品', '玄品'],
    reputationQuality: '玄品',
    manualRealm: '筑基',
    blueprintLevel: 30,
    inscriptionLevel: 3,
    ordinaryBookCount: 2,
    advancedBookCount: 0,
  },
  jindan: {
    label: '金丹',
    sectQualities: ['玄品', '玄品', '玄品', '玄品', '玄品', '玄品', '玄品', '真品', '真品', '真品'],
    reputationQuality: '真品',
    manualRealm: '金丹',
    blueprintLevel: 50,
    inscriptionLevel: 5,
    ordinaryBookCount: 2,
    advancedBookCount: 1,
  },
  yuanying: {
    label: '元婴',
    sectQualities: ['玄品', '玄品', '玄品', '玄品', '玄品', '真品', '真品', '真品', '地品', '地品'],
    reputationQuality: '地品',
    manualRealm: '元婴',
    blueprintLevel: 70,
    inscriptionLevel: 7,
    ordinaryBookCount: 2,
    advancedBookCount: 1,
  },
  huashen: {
    label: '化神',
    sectQualities: ['玄品', '玄品', '玄品', '玄品', '真品', '真品', '真品', '地品', '地品', '天品'],
    reputationQuality: '天品',
    manualRealm: null,
    blueprintLevel: 90,
    inscriptionLevel: 9,
    ordinaryBookCount: 1,
    advancedBookCount: 2,
  },
  lianxu: {
    label: '炼虚',
    sectQualities: ['玄品', '玄品', '玄品', '玄品', '真品', '真品', '地品', '地品', '天品', '仙品'],
    reputationQuality: '仙品',
    manualRealm: null,
    blueprintLevel: null,
    inscriptionLevel: 11,
    ordinaryBookCount: 1,
    advancedBookCount: 3,
  },
  heti: {
    label: '合体',
    sectQualities: ['玄品', '玄品', '玄品', '真品', '真品', '真品', '地品', '地品', '天品', '仙品'],
    reputationQuality: '仙品',
    manualRealm: null,
    blueprintLevel: null,
    inscriptionLevel: 11,
    ordinaryBookCount: 1,
    advancedBookCount: 3,
  },
  dacheng: {
    label: '大乘',
    sectQualities: ['玄品', '玄品', '玄品', '真品', '真品', '地品', '地品', '天品', '天品', '仙品'],
    reputationQuality: '仙品',
    manualRealm: null,
    blueprintLevel: null,
    inscriptionLevel: 11,
    ordinaryBookCount: 1,
    advancedBookCount: 3,
  },
  dujie: {
    label: '渡劫',
    sectQualities: ['玄品', '玄品', '真品', '真品', '地品', '地品', '天品', '天品', '天品', '仙品'],
    reputationQuality: '仙品',
    manualRealm: null,
    blueprintLevel: null,
    inscriptionLevel: 11,
    ordinaryBookCount: 1,
    advancedBookCount: 3,
  },
  endgame: {
    label: '终局',
    // 宗门任务本身不要求神品，宗门宝库也不放神品。
    sectQualities: ['真品', '真品', '地品', '地品', '天品', '天品', '天品', '仙品', '仙品', '仙品'],
    reputationQuality: '神品',
    manualRealm: null,
    blueprintLevel: null,
    inscriptionLevel: 11,
    ordinaryBookCount: 0,
    advancedBookCount: 4,
  },
};

const STAGE_ALIASES: Record<string, StageKey> = {
  lianqi: 'lianqi',
  炼气: 'lianqi',
  zhuji: 'zhuji',
  筑基: 'zhuji',
  jindan: 'jindan',
  金丹: 'jindan',
  yuanying: 'yuanying',
  元婴: 'yuanying',
  huashen: 'huashen',
  化神: 'huashen',
  lianxu: 'lianxu',
  炼虚: 'lianxu',
  heti: 'heti',
  合体: 'heti',
  dacheng: 'dacheng',
  大乘: 'dacheng',
  dujie: 'dujie',
  渡劫: 'dujie',
  endgame: 'endgame',
  终局: 'endgame',
};

const SECT_CATEGORIES: LibraryCategory[] = [
  'herb',
  'ore',
  'monster',
  'aux',
  'tcdb',
  'seed',
  'herb',
  'ore',
  'monster',
  'seed',
];

const MATERIAL_CATEGORIES: Exclude<LibraryCategory, 'seed'>[] = [
  'herb',
  'ore',
  'monster',
  'aux',
  'tcdb',
];

const SECT_PRICE: Record<Quality, number> = {
  凡品: 8,
  灵品: 15,
  玄品: 30,
  真品: 55,
  地品: 90,
  天品: 140,
  仙品: 220,
  神品: 9999, // 不会进入宗门宝库，仅作防御性配置。
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

function takeRotating<T>(
  items: readonly T[],
  count: number,
  start: number,
): T[] {
  if (count <= 0) return [];
  if (!items.length) throw new Error('轮换池为空');
  return Array.from({ length: Math.min(count, items.length) }, (_, index) =>
    rotatePick(items, start + index),
  );
}

function stripQuantity(grant: ItemGrant): Omit<ItemGrant, 'quantity'> {
  const validated = RewardItemSchema.parse(grant);
  const { quantity: _quantity, ...snapshot } = validated;
  return snapshot;
}

function fixedItem(
  definitionId: string,
  input: {
    price: number;
    quantity?: number;
    perUserLimit?: number | null;
    sortOrder: number;
  },
): PlannedShopItem {
  const definition = ITEM_DEFINITIONS.find((item) => item.id === definitionId);
  if (!definition) throw new Error(`固定物品未注册：${definitionId}`);
  const quantity = input.quantity ?? 1;
  const grant = RewardItemSchema.parse({ definitionId, quantity });
  return {
    shop: 'reputation',
    name: rewardDisplayItem(grant).name,
    itemLibraryItemId: null,
    itemSnapshot: stripQuantity(grant),
    price: input.price,
    quantity,
    perUserLimit: input.perUserLimit ?? 1,
    sortOrder: input.sortOrder,
  };
}

function libraryItem(
  shop: 'reputation' | 'sect',
  entry: ItemLibraryEntry,
  input: {
    price: number;
    quantity: number;
    perUserLimit: number | null;
    sortOrder: number;
  },
): PlannedShopItem {
  const grant = RewardItemSchema.parse({
    ...libraryMaterialGrant(entry),
    quantity: input.quantity,
  });
  return {
    shop,
    name: rewardDisplayItem(grant).name,
    itemLibraryItemId: entry.itemId,
    itemSnapshot: stripQuantity(grant),
    price: input.price,
    quantity: input.quantity,
    perUserLimit: input.perUserLimit,
    sortOrder: input.sortOrder,
  };
}

function qualityOf(entry: ItemLibraryEntry): Quality {
  if (entry.type !== 'material') throw new Error('当前商店脚本仅从材料库读取 material');
  return entry.payload.rank;
}

function categoryOf(entry: ItemLibraryEntry): string {
  if (entry.type !== 'material') return '';
  return entry.payload.type;
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
    .sort((a, b) => a.itemId.localeCompare(b.itemId, 'en'));

  if (!pool.length) {
    throw new Error(`物品库缺货：${quality}/${category}`);
  }
  return rotatePick(pool, rotation + offset);
}

function buildSectPlan(
  entries: readonly ItemLibraryEntry[],
  config: StageConfig,
  rotation: number,
): PlannedShopItem[] {
  return config.sectQualities.map((quality, index) => {
    const category = SECT_CATEGORIES[index]!;
    const entry = pickLibraryEntry(entries, category, quality, rotation, index * 7);
    return libraryItem('sect', entry, {
      price: SECT_PRICE[quality],
      quantity: SECT_QUANTITY[quality],
      perUserLimit: SECT_LIMIT[quality],
      sortOrder: (index + 1) * 10,
    });
  });
}

function manualDefinitionIdsForRealm(
  realm: NonNullable<StageConfig['manualRealm']>,
): string[] {
  return CHARACTER_MANUALS_V1.filter((manual) => manual.realm === realm)
    .map((manual) => `jade.${manual.id}`)
    .sort();
}

function itemDefinitionIds(
  predicate: (item: (typeof ITEM_DEFINITIONS)[number]) => boolean,
): string[] {
  return ITEM_DEFINITIONS.filter(predicate)
    .map((item) => item.id)
    .sort();
}

function buildReputationPlan(
  entries: readonly ItemLibraryEntry[],
  config: StageConfig,
  stageKey: StageKey,
  rotation: number,
): PlannedShopItem[] {
  const plan: PlannedShopItem[] = [];
  let sortOrder = 10;
  const pushFixed = (
    id: string,
    price: number,
    limit = 1,
  ) => {
    plan.push(
      fixedItem(id, {
        price,
        perUserLimit: limit,
        sortOrder,
      }),
    );
    sortOrder += 10;
  };

  const highRealm =
    stageKey === 'yuanying' ||
    stageKey === 'huashen' ||
    stageKey === 'lianxu' ||
    stageKey === 'heti' ||
    stageKey === 'dacheng' ||
    stageKey === 'dujie' ||
    stageKey === 'endgame';

  pushFixed(
    highRealm
      ? 'beast.refinement.superior-origin-dew'
      : 'beast.refinement.origin-dew',
    highRealm ? 180 : 60,
    highRealm ? 1 : 2,
  );

  const ordinaryBooks = itemDefinitionIds(
    (item) =>
      item.kind === 'beast_book' && !item.id.includes('.advanced-'),
  );
  const advancedBooks = itemDefinitionIds(
    (item) => item.kind === 'beast_book' && item.id.includes('.advanced-'),
  );

  for (const id of takeRotating(
    ordinaryBooks,
    config.ordinaryBookCount,
    rotation,
  )) {
    pushFixed(id, 100 + Math.min(80, Object.keys(STAGES).indexOf(stageKey) * 15));
  }
  for (const id of takeRotating(
    advancedBooks,
    config.advancedBookCount,
    rotation * 3 + 1,
  )) {
    pushFixed(
      id,
      stageKey === 'endgame'
        ? 520
        : stageKey === 'lianxu' ||
            stageKey === 'heti' ||
            stageKey === 'dacheng' ||
            stageKey === 'dujie'
          ? 460
          : 400,
    );
  }

  if (config.manualRealm) {
    for (const id of takeRotating(
      manualDefinitionIdsForRealm(config.manualRealm),
      2,
      rotation * 5 + 2,
    )) {
      pushFixed(id, MANUAL_PRICE[config.manualRealm]);
    }
  } else {
    // 化神以后没有更高境界的新功法玉简注册项，保留1个补课轮换位。
    const allManuals = itemDefinitionIds((item) => item.kind === 'manual_jade');
    pushFixed(rotatePick(allManuals, rotation * 5 + 2), 320);
  }

  if (config.blueprintLevel !== null) {
    const blueprints = itemDefinitionIds(
      (item) =>
        item.kind === 'blueprint' && item.level === config.blueprintLevel,
    );
    for (const id of takeRotating(blueprints, 2, rotation * 7 + 3)) {
      pushFixed(id, BLUEPRINT_PRICE[config.blueprintLevel]);
    }
  }

  const inscriptions = itemDefinitionIds(
    (item) =>
      item.kind === 'inscription' && item.level === config.inscriptionLevel,
  );
  const inscriptionCount = config.blueprintLevel === null ? 3 : 2;
  for (const id of takeRotating(
    inscriptions,
    inscriptionCount,
    rotation * 11 + 4,
  )) {
    pushFixed(id, INSCRIPTION_PRICE[config.inscriptionLevel]);
  }

  const materialCategory = rotatePick(
    MATERIAL_CATEGORIES,
    rotation + Object.keys(STAGES).indexOf(stageKey),
  );
  const rareMaterial = pickLibraryEntry(
    entries,
    materialCategory,
    config.reputationQuality,
    rotation,
    101,
  );
  plan.push(
    libraryItem('reputation', rareMaterial, {
      price: REPUTATION_LIBRARY_PRICE[config.reputationQuality],
      quantity: 1,
      perUserLimit: 1,
      sortOrder,
    }),
  );
  sortOrder += 10;

  const rareSeed = pickLibraryEntry(
    entries,
    'seed',
    config.reputationQuality,
    rotation,
    131,
  );
  plan.push(
    libraryItem('reputation', rareSeed, {
      price: Math.min(
        9999,
        Math.round(REPUTATION_LIBRARY_PRICE[config.reputationQuality] * 1.15),
      ),
      quantity: 1,
      perUserLimit: 1,
      sortOrder,
    }),
  );

  return plan;
}

function assertPlan(plan: readonly PlannedShopItem[]) {
  for (const item of plan) {
    if (!Number.isInteger(item.price) || item.price < 1 || item.price > 9999)
      throw new Error(`价格非法：${item.name} = ${item.price}`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 30)
      throw new Error(`数量非法：${item.name} = ${item.quantity}`);
    if (
      item.perUserLimit !== null &&
      (!Number.isInteger(item.perUserLimit) || item.perUserLimit < 1)
    )
      throw new Error(`周限购非法：${item.name}`);
    RewardItemSchema.parse({
      ...item.itemSnapshot,
      quantity: item.quantity,
    });
  }
}

function printPlan(
  stage: StageConfig,
  weekKey: string,
  rotation: number,
  plan: readonly PlannedShopItem[],
) {
  console.log(`\n服务器阶段：${stage.label}`);
  console.log(`购买周：${weekKey}`);
  console.log(`轮换序号：${rotation}`);
  console.table(
    plan.map((item) => ({
      商店: item.shop === 'reputation' ? '声望商店' : '宗门宝库',
      商品: item.name,
      来源ID: item.itemLibraryItemId ?? item.itemSnapshot.definitionId,
      单次数量: item.quantity,
      价格: item.price,
      周限购: item.perUserLimit ?? '不限',
      排序: item.sortOrder,
    })),
  );
}

const rawStage = readArg('--stage') ?? 'lianqi';
const stageKey = STAGE_ALIASES[rawStage];
if (!stageKey) {
  throw new Error(
    `未知阶段：${rawStage}。可用：炼气/筑基/金丹/元婴/化神/炼虚/合体/大乘/渡劫/终局`,
  );
}
const config = STAGES[stageKey];

const weekKey = getItemExchangePurchaseWeek();
const automaticRotation = Number(weekKey.replaceAll('-', ''));
const rawRotation = readArg('--rotation');
const rotation =
  rawRotation === undefined ? automaticRotation : Number(rawRotation);
if (!Number.isInteger(rotation)) {
  throw new Error(`--rotation 必须为整数，当前：${rawRotation}`);
}

const dryRun = hasFlag('--dry-run');
const explicitOperator = readArg('--operator');

try {
  const rows = await db
    .select()
    .from(itemLibrary)
    .where(eq(itemLibrary.status, 'published'));

  const entries = rows.map((row) => parseItemLibraryEntry(row));
  if (!entries.length) throw new Error('published 物品库为空');

  // 只使用新版材料和有效灵种；明确排除旧 gongfa_manual / skill_manual 材料分类。
  const safeEntries = entries.filter(
    (entry) =>
      entry.type === 'material' &&
      ['herb', 'ore', 'monster', 'aux', 'tcdb', 'seed'].includes(
        entry.payload.type,
      ),
  );

  const operatorUserId =
    explicitOperator ?? safeEntries[0]?.updatedBy ?? entries[0]!.updatedBy;

  const sectPlan = buildSectPlan(safeEntries, config, rotation);
  const reputationPlan = buildReputationPlan(
    safeEntries,
    config,
    stageKey,
    rotation,
  );
  const plan = [...reputationPlan, ...sectPlan];

  assertPlan(plan);
  printPlan(config, weekKey, rotation, plan);

  if (dryRun) {
    console.log('\nDRY RUN：未修改数据库。');
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    // 保留历史商品与购买记录，只把当前在售商品归档。
    await tx
      .update(reputationShopItems)
      .set({
        status: 'archived',
        updatedBy: operatorUserId,
        updatedAt: new Date(),
      })
      .where(eq(reputationShopItems.status, 'active'));

    await tx
      .update(sectShopItems)
      .set({
        status: 'archived',
        updatedBy: operatorUserId,
        updatedAt: new Date(),
      })
      .where(eq(sectShopItems.status, 'active'));

    if (reputationPlan.length) {
      await tx.insert(reputationShopItems).values(
        reputationPlan.map((item) => ({
          itemLibraryItemId: item.itemLibraryItemId,
          itemSnapshot: item.itemSnapshot,
          price: item.price,
          quantity: item.quantity,
          perUserLimit: item.perUserLimit,
          status: 'active',
          sortOrder: item.sortOrder,
          createdBy: operatorUserId,
          updatedBy: operatorUserId,
        })),
      );
    }

    if (sectPlan.length) {
      await tx.insert(sectShopItems).values(
        sectPlan.map((item) => ({
          itemLibraryItemId: item.itemLibraryItemId,
          itemSnapshot: item.itemSnapshot,
          price: item.price,
          quantity: item.quantity,
          perUserLimit: item.perUserLimit,
          status: 'active',
          sortOrder: item.sortOrder,
          createdBy: operatorUserId,
          updatedBy: operatorUserId,
        })),
      );
    }
  });

  console.log(
    `\n上架完成：声望商店 ${reputationPlan.length} 件，宗门宝库 ${sectPlan.length} 件。`,
  );
  console.log('旧的 active 商品已归档，历史购买记录未删除。');
  process.exit(0);
} catch (error) {
  console.error('[shops:seed] 失败', error);
  process.exit(1);
}
