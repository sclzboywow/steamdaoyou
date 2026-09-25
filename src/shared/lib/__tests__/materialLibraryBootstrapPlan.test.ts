import { describe, expect, it } from 'vitest';
import {
  auditMaterialLibraryBootstrap,
  buildMaterialBootstrapFillTargets,
  marketPresetCoverageFacts,
} from '../materialLibraryBootstrapPlan';

describe('material library bootstrap plan', () => {
  it('recognizes the bundled 420 low/mid-tier market presets', () => {
    expect(marketPresetCoverageFacts()).toHaveLength(420);
  });

  it('derives only real coverage holes plus high-tier required cells', () => {
    const presetFacts = marketPresetCoverageFacts();
    const targets = buildMaterialBootstrapFillTargets(presetFacts);
    expect(targets.filter((target) => target.reason === 'sect_element_gap')).toHaveLength(17);
    expect(targets.filter((target) => target.reason === 'high_tier_market')).toHaveLength(168);
    expect(targets).toHaveLength(185);
  });

  it('passes strict market and sect coverage after applying the derived targets', () => {
    const presetFacts = marketPresetCoverageFacts();
    const targets = buildMaterialBootstrapFillTargets(presetFacts);
    const audit = auditMaterialLibraryBootstrap([
      ...presetFacts,
      ...targets.map(({ materialType, quality, element }) => ({
        materialType,
        quality,
        element,
      })),
    ]);
    expect(audit.ready).toBe(true);
    expect(audit.marketShortages).toHaveLength(0);
    expect(audit.sectElementGaps).toHaveLength(0);
  });
});
