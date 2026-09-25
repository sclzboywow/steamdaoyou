import { MARKET_PRESET_POOL } from '@shared/engine/material/creation/marketPresets';
import { INVENTORY_MATERIAL_TYPES } from '@shared/items/definitions/materials';
import {
  ELEMENT_VALUES,
  QUALITY_VALUES,
  type ElementType,
  type MaterialType,
  type Quality,
} from '@shared/types/constants';

export type BootstrapMaterialType = (typeof INVENTORY_MATERIAL_TYPES)[number];

export interface MaterialCoverageFact {
  materialType: BootstrapMaterialType;
  quality: Quality;
  element?: ElementType | null;
}

export interface MaterialBootstrapFillTarget {
  materialType: BootstrapMaterialType;
  quality: Quality;
  element: ElementType;
  reason: 'sect_element_gap' | 'high_tier_market';
}

export interface MaterialMarketCoverageShortage {
  materialType: BootstrapMaterialType;
  quality: Quality;
  required: number;
  actual: number;
}

export interface MaterialElementCoverageGap {
  materialType: (typeof MATERIAL_BOOTSTRAP_SECT_TYPES)[number];
  quality: Quality;
  element: ElementType;
}

export interface MaterialLibraryBootstrapAudit {
  ready: boolean;
  publishedMaterialCount: number;
  marketShortages: MaterialMarketCoverageShortage[];
  sectElementGaps: MaterialElementCoverageGap[];
  typeQualityCounts: Record<string, number>;
}

export const MATERIAL_BOOTSTRAP_TYPES = INVENTORY_MATERIAL_TYPES;
export const MATERIAL_BOOTSTRAP_PRESET_QUALITIES = [
  '凡品',
  '灵品',
  '玄品',
  '真品',
  '地品',
] as const satisfies readonly Quality[];
export const MATERIAL_BOOTSTRAP_HIGH_QUALITIES = [
  '天品',
  '仙品',
  '神品',
] as const satisfies readonly Quality[];
export const MATERIAL_BOOTSTRAP_MARKET_STRICT_QUALITIES = [
  '地品',
  '天品',
  '仙品',
  '神品',
] as const satisfies readonly Quality[];
export const MATERIAL_BOOTSTRAP_SECT_TYPES = [
  'herb',
  'ore',
  'monster',
  'aux',
] as const satisfies readonly BootstrapMaterialType[];
export const MATERIAL_BOOTSTRAP_MARKET_MIN_PER_TYPE_QUALITY = 8;

function typeQualityKey(type: BootstrapMaterialType, quality: Quality) {
  return `${type}:${quality}`;
}

function cellKey(
  type: BootstrapMaterialType,
  quality: Quality,
  element: ElementType,
) {
  return `${type}:${quality}:${element}`;
}

export function marketPresetCoverageFacts(): MaterialCoverageFact[] {
  return MATERIAL_BOOTSTRAP_TYPES.flatMap((materialType) =>
    MATERIAL_BOOTSTRAP_PRESET_QUALITIES.flatMap((quality) =>
      (MARKET_PRESET_POOL[materialType]?.[quality] ?? []).map((preset) => ({
        materialType,
        quality,
        element: preset.element,
      })),
    ),
  );
}

export function buildMaterialBootstrapFillTargets(
  existingFacts: readonly MaterialCoverageFact[],
): MaterialBootstrapFillTarget[] {
  const existingCells = new Set(
    existingFacts.flatMap((fact) =>
      fact.element
        ? [cellKey(fact.materialType, fact.quality, fact.element)]
        : [],
    ),
  );
  const targets: MaterialBootstrapFillTarget[] = [];

  // Low/mid tier: only fill exact element holes that affect the four material
  // families used by sect delivery tasks. This keeps the curated 420 presets
  // intact instead of replacing them with generated content.
  for (const materialType of MATERIAL_BOOTSTRAP_SECT_TYPES) {
    for (const quality of MATERIAL_BOOTSTRAP_PRESET_QUALITIES) {
      for (const element of ELEMENT_VALUES) {
        const key = cellKey(materialType, quality, element);
        if (existingCells.has(key)) continue;
        existingCells.add(key);
        targets.push({
          materialType,
          quality,
          element,
          reason: 'sect_element_gap',
        });
      }
    }
  }

  // Heaven/black markets have no preset fallback. One forced entry for every
  // element gives each type+quality at least eight distinct rows and complete
  // element coverage at the same time.
  for (const materialType of MATERIAL_BOOTSTRAP_TYPES) {
    for (const quality of MATERIAL_BOOTSTRAP_HIGH_QUALITIES) {
      for (const element of ELEMENT_VALUES) {
        const key = cellKey(materialType, quality, element);
        if (existingCells.has(key)) continue;
        existingCells.add(key);
        targets.push({
          materialType,
          quality,
          element,
          reason: 'high_tier_market',
        });
      }
    }
  }

  return targets;
}

export function auditMaterialLibraryBootstrap(
  facts: readonly MaterialCoverageFact[],
): MaterialLibraryBootstrapAudit {
  const typeQualityCounts = new Map<string, number>();
  const cells = new Set<string>();

  for (const fact of facts) {
    const key = typeQualityKey(fact.materialType, fact.quality);
    typeQualityCounts.set(key, (typeQualityCounts.get(key) ?? 0) + 1);
    if (fact.element) {
      cells.add(cellKey(fact.materialType, fact.quality, fact.element));
    }
  }

  const marketShortages: MaterialMarketCoverageShortage[] = [];
  for (const materialType of MATERIAL_BOOTSTRAP_TYPES) {
    for (const quality of MATERIAL_BOOTSTRAP_MARKET_STRICT_QUALITIES) {
      const actual = typeQualityCounts.get(typeQualityKey(materialType, quality)) ?? 0;
      if (actual < MATERIAL_BOOTSTRAP_MARKET_MIN_PER_TYPE_QUALITY) {
        marketShortages.push({
          materialType,
          quality,
          required: MATERIAL_BOOTSTRAP_MARKET_MIN_PER_TYPE_QUALITY,
          actual,
        });
      }
    }
  }

  const sectElementGaps: MaterialElementCoverageGap[] = [];
  for (const materialType of MATERIAL_BOOTSTRAP_SECT_TYPES) {
    for (const quality of QUALITY_VALUES) {
      for (const element of ELEMENT_VALUES) {
        if (cells.has(cellKey(materialType, quality, element))) continue;
        sectElementGaps.push({ materialType, quality, element });
      }
    }
  }

  return {
    ready: marketShortages.length === 0 && sectElementGaps.length === 0,
    publishedMaterialCount: facts.length,
    marketShortages,
    sectElementGaps,
    typeQualityCounts: Object.fromEntries(
      [...typeQualityCounts.entries()].sort(([left], [right]) =>
        left.localeCompare(right, 'zh-Hans-CN'),
      ),
    ),
  };
}
