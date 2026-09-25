import { bootstrapInitialMaterialLibrary } from '@server/lib/services/MaterialLibraryBootstrapService';

function printAudit(result: Awaited<ReturnType<typeof bootstrapInitialMaterialLibrary>>) {
  console.log('材料库初始化完成');
  console.log(`- 新增预设材料：${result.curatedPresetInserted}`);
  console.log(`- 新增补位材料：${result.generatedFillInserted}`);
  console.log('- 每日自动生成：已关闭（20仅保留为未来启用时的数量配置）');
  console.log(`- 当前 published 材料总数：${result.audit.publishedMaterialCount}`);
  console.log(`- 高阶市场缺口：${result.audit.marketShortages.length}`);
  console.log(`- 宗门八系覆盖缺口：${result.audit.sectElementGaps.length}`);
  console.log(`- 开服审计：${result.audit.ready ? 'PASS' : 'FAIL'}`);

  if (result.audit.marketShortages.length > 0) {
    console.log('\n[高阶市场缺口]');
    console.table(result.audit.marketShortages);
  }
  if (result.audit.sectElementGaps.length > 0) {
    console.log('\n[宗门元素缺口]');
    console.table(result.audit.sectElementGaps);
  }
}

try {
  const result = await bootstrapInitialMaterialLibrary();
  printAudit(result);
  process.exit(result.audit.ready ? 0 : 1);
} catch (error) {
  console.error('[materials:bootstrap] 失败', error);
  process.exit(1);
}
