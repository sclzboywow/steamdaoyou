import { getExecutor } from '@server/lib/drizzle/db';
import { itemLibrary } from '@server/lib/drizzle/schema';
import { upsertItemLibraryDailyMaterialGenerationSettings } from '@server/lib/repositories/appSettingsRepository';
import { computeItemLibrarySampleKey } from '@server/lib/services/itemLibrarySampleKey';
import { MaterialGenerator } from '@shared/engine/material/creation/MaterialGenerator';
import { FALLBACK_MATERIAL_LIBRARY } from '@shared/engine/material/creation/fallbackPresets';
import { MARKET_PRESET_POOL } from '@shared/engine/material/creation/marketPresets';
import { MaterialFactsSchema } from '@shared/items/definitions/materials';
import {
  auditMaterialLibraryBootstrap,
  buildMaterialBootstrapFillTargets,
  MATERIAL_BOOTSTRAP_PRESET_QUALITIES,
  MATERIAL_BOOTSTRAP_TYPES,
  type MaterialCoverageFact,
  type MaterialLibraryBootstrapAudit,
} from '@shared/lib/materialLibraryBootstrapPlan';
import {
  ELEMENT_VALUES,
  type ElementType,
  type Quality,
} from '@shared/types/constants';
import { and, eq } from 'drizzle-orm';
import { ITEM_LIBRARY_SYSTEM_USER_ID } from './MaterialLibraryService';

const QUALITY_SLUG: Record<Quality, string> = {
  凡品: 'fan',
  灵品: 'ling',
  玄品: 'xuan',
  真品: 'zhen',
  地品: 'di',
  天品: 'tian',
  仙品: 'xian',
  神品: 'shen',
};

const ELEMENT_SLUG: Record<ElementType, string> = {
  金: 'metal',
  木: 'wood',
  水: 'water',
  火: 'fire',
  土: 'earth',
  风: 'wind',
  雷: 'thunder',
  冰: 'ice',
};

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function presetItemId(
  materialType: (typeof MATERIAL_BOOTSTRAP_TYPES)[number],
  quality: Quality,
  index: number,
) {
  return `bootstrap_preset_${materialType}_${QUALITY_SLUG[quality]}_${String(index + 1).padStart(2, '0')}`;
}

function fillItemId(args: {
  materialType: (typeof MATERIAL_BOOTSTRAP_TYPES)[number];
  quality: Quality;
  element: ElementType;
}) {
  return `bootstrap_fill_${args.materialType}_${QUALITY_SLUG[args.quality]}_${ELEMENT_SLUG[args.element]}`;
}

function assertGeneratedMaterialIsAuthored(
  target: {
    materialType: (typeof MATERIAL_BOOTSTRAP_TYPES)[number];
    quality: Quality;
    element: ElementType;
  },
  material: {
    name: string;
    description: string;
    type: string;
    rank: Quality;
    element: ElementType;
  },
) {
  if (
    material.type !== target.materialType ||
    material.rank !== target.quality ||
    material.element !== target.element
  ) {
    throw new Error(
      `材料生成事实偏离骨架：${target.materialType}/${target.quality}/${target.element}`,
    );
  }
  if (material.name === '未知材料' || material.description.includes('天道感应模糊')) {
    throw new Error(
      `材料生成返回占位内容：${target.materialType}/${target.quality}/${target.element}，请检查 AI 配置后重试`,
    );
  }
  const fallbacks = FALLBACK_MATERIAL_LIBRARY[target.materialType]?.[target.quality] ?? [];
  if (
    fallbacks.some(
      (preset) =>
        preset.name === material.name && preset.description === material.description,
    )
  ) {
    throw new Error(
      `材料生成退回 fallback：${target.materialType}/${target.quality}/${target.element}，初始化已停止以避免把兜底文案写入正式新服`,
    );
  }
}

async function insertCuratedMarketPresets(): Promise<number> {
  const values = MATERIAL_BOOTSTRAP_TYPES.flatMap((materialType) =>
    MATERIAL_BOOTSTRAP_PRESET_QUALITIES.flatMap((quality) =>
      (MARKET_PRESET_POOL[materialType]?.[quality] ?? []).map((preset, index) => {
        const itemId = presetItemId(materialType, quality, index);
        const facts = MaterialFactsSchema.parse({
          name: preset.name,
          type: materialType,
          rank: quality,
          element: preset.element,
          description: preset.description,
        });
        const payload = {
          name: facts.name,
          type: facts.type,
          rank: facts.rank,
          element: preset.element,
          description: facts.description,
        };
        return {
          itemId,
          type: 'material' as const,
          status: 'published' as const,
          name: payload.name,
          description: payload.description,
          quality: payload.rank,
          element: payload.element,
          category: payload.type,
          sampleKey: computeItemLibrarySampleKey(itemId),
          payload,
          editorConfig: {
            source: 'bootstrap_market_preset_v1',
          },
          createdBy: ITEM_LIBRARY_SYSTEM_USER_ID,
          updatedBy: ITEM_LIBRARY_SYSTEM_USER_ID,
        };
      }),
    ),
  );

  let inserted = 0;
  for (const batch of chunks(values, 100)) {
    const rows = await getExecutor()
      .insert(itemLibrary)
      .values(batch)
      .onConflictDoNothing({ target: itemLibrary.itemId })
      .returning({ itemId: itemLibrary.itemId });
    inserted += rows.length;
  }
  return inserted;
}

async function readPublishedCoverageFacts(): Promise<MaterialCoverageFact[]> {
  const rows = await getExecutor()
    .select({
      category: itemLibrary.category,
      quality: itemLibrary.quality,
      element: itemLibrary.element,
    })
    .from(itemLibrary)
    .where(
      and(
        eq(itemLibrary.type, 'material'),
        eq(itemLibrary.status, 'published'),
      ),
    );

  const types = new Set<string>(MATERIAL_BOOTSTRAP_TYPES);
  const qualities = new Set<string>([
    '凡品',
    '灵品',
    '玄品',
    '真品',
    '地品',
    '天品',
    '仙品',
    '神品',
  ]);
  const elements = new Set<string>(ELEMENT_VALUES);

  return rows.flatMap((row) => {
    if (!row.category || !types.has(row.category)) return [];
    if (!row.quality || !qualities.has(row.quality)) return [];
    return [
      {
        materialType: row.category as MaterialCoverageFact['materialType'],
        quality: row.quality as Quality,
        element:
          row.element && elements.has(row.element)
            ? (row.element as ElementType)
            : null,
      },
    ];
  });
}

async function generateMissingForcedElementMaterials(
  existingFacts: readonly MaterialCoverageFact[],
): Promise<number> {
  const targets = buildMaterialBootstrapFillTargets(existingFacts);
  if (targets.length === 0) return 0;

  let inserted = 0;
  for (const batch of chunks(targets, 8)) {
    const generated = await MaterialGenerator.generateFromSkeletons(
      batch.map((target) => ({
        type: target.materialType,
        rank: target.quality,
        quantity: 1,
        forcedElement: target.element,
      })),
    );
    if (generated.length !== batch.length) {
      throw new Error(
        `材料生成数量异常：请求 ${batch.length}，实际 ${generated.length}`,
      );
    }

    const values = batch.map((target, index) => {
      const material = generated[index];
      if (!material) throw new Error('材料生成结果缺失');
      assertGeneratedMaterialIsAuthored(target, material);
      const itemId = fillItemId(target);
      const facts = MaterialFactsSchema.parse({
        name: material.name,
        type: target.materialType,
        rank: target.quality,
        element: target.element,
        description: material.description,
      });
      const payload = {
        name: facts.name,
        type: facts.type,
        rank: facts.rank,
        element: target.element,
        description: facts.description,
      };
      return {
        itemId,
        type: 'material' as const,
        status: 'published' as const,
        name: payload.name,
        description: payload.description,
        quality: payload.rank,
        element: payload.element,
        category: payload.type,
        sampleKey: computeItemLibrarySampleKey(itemId),
        payload,
        editorConfig: {
          source: 'bootstrap_forced_element_v1',
          reason: target.reason,
        },
        createdBy: ITEM_LIBRARY_SYSTEM_USER_ID,
        updatedBy: ITEM_LIBRARY_SYSTEM_USER_ID,
      };
    });

    const rows = await getExecutor()
      .insert(itemLibrary)
      .values(values)
      .onConflictDoNothing({ target: itemLibrary.itemId })
      .returning({ itemId: itemLibrary.itemId });
    inserted += rows.length;
  }
  return inserted;
}

export async function auditPersistedMaterialLibrary(): Promise<MaterialLibraryBootstrapAudit> {
  return auditMaterialLibraryBootstrap(await readPublishedCoverageFacts());
}

export async function bootstrapInitialMaterialLibrary() {
  const curatedPresetInserted = await insertCuratedMarketPresets();
  const afterPreset = await readPublishedCoverageFacts();
  const generatedFillInserted = await generateMissingForcedElementMaterials(afterPreset);

  await upsertItemLibraryDailyMaterialGenerationSettings({
    settings: { enabled: false, count: 20 },
    updatedBy: ITEM_LIBRARY_SYSTEM_USER_ID,
  });

  const audit = await auditPersistedMaterialLibrary();
  return {
    curatedPresetInserted,
    generatedFillInserted,
    dailyGeneration: { enabled: false, count: 20 },
    audit,
  };
}
