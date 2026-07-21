const base = 'http://127.0.0.1:8787/api';

async function main() {
  const health = await fetch(`${base}/health`).then((r) => r.json());
  console.log('health', health);

  const meta = await fetch(`${base}/meta/demo`).then((r) => r.json());
  console.log('meta', meta);

  const d = await fetch(`${base}/classes/${meta.demo_class_id}/diagnosis`).then((r) => r.json());
  console.log('students', d.students?.length, 'heatmap', d.heatmap?.length);
  console.log('topWeak', d.topWeak?.map((x) => `${x.name}:${x.rate}%`).join(' | '));

  const ai = await fetch(`${base}/ai/status`).then((r) => r.json());
  console.log('ai', ai.configured, ai.model, ai.baseUrl);

  // 模板生成（不强制等 LLM 慢请求时也可测 fallback 路径）
  const sheet = await fetch(`${base}/ai/layered-sheet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kpName: '函数单调性', lessonType: '巩固练' }),
  }).then((r) => r.json());
  console.log(
    'sheet',
    sheet.fallback ? 'fallback' : 'ai',
    'A',
    sheet.sheet?.layers?.A?.items?.length,
    'B',
    sheet.sheet?.layers?.B?.items?.length,
    'C',
    sheet.sheet?.layers?.C?.items?.length
  );

  if (sheet.sheet?.layers) {
    const push = await fetch(`${base}/homework/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId: meta.demo_class_id,
        title: '冒烟·分层练习',
        layers: sheet.sheet.layers,
      }),
    }).then((r) => r.json());
    console.log('push', push);

    const hw = await fetch(`${base}/students/${meta.demo_student_id}/homework`).then((r) => r.json());
    console.log('student homework count', hw.length);
  }

  console.log('SMOKE OK');
}

main().catch((e) => {
  console.error('SMOKE FAIL', e);
  process.exit(1);
});
