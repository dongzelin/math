const base = 'http://127.0.0.1:8787/api';
const j = await fetch(`${base}/classes/cls-gaoyi-3/diagnosis`).then((r) => r.json());
const m = j.heatmapMatrix;
if (!m) {
  console.error('NO heatmapMatrix — server may need restart');
  process.exit(1);
}
console.log('columns:', m.columns.join(' | '));
for (const r of m.rows) {
  console.log(r.chapter.padEnd(8), r.cells.map((c) => String(c.rate).padStart(5)).join(' '));
}
console.log('OK rows=', m.rows.length, 'cols=', m.columns.length);
