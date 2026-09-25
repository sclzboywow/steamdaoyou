import { auditPersistedMaterialLibrary } from '@server/lib/services/MaterialLibraryBootstrapService';

try {
  const audit = await auditPersistedMaterialLibrary();
  console.log(`published 材料：${audit.publishedMaterialCount}`);
  console.log(`高阶市场缺口：${audit.marketShortages.length}`);
  console.log(`宗门八系覆盖缺口：${audit.sectElementGaps.length}`);
  console.log(`材料库开服状态：${audit.ready ? 'PASS' : 'FAIL'}`);

  if (audit.marketShortages.length > 0) {
    console.log('\n[高阶市场缺口]');
    console.table(audit.marketShortages);
  }
  if (audit.sectElementGaps.length > 0) {
    console.log('\n[宗门元素缺口]');
    console.table(audit.sectElementGaps);
  }
  console.log('\n[类型×品质库存]');
  console.table(audit.typeQualityCounts);
  process.exit(audit.ready ? 0 : 1);
} catch (error) {
  console.error('[materials:audit] 失败', error);
  process.exit(1);
}
