const base = 'http://127.0.0.1:8787/api';
const classId = 'cls-gaoyi-3';

const exams = await fetch(`${base}/classes/${classId}/exams`).then((r) => r.json());
console.log('exams', exams.map((e) => e.name).join(', '));

const report = await fetch(`${base}/classes/${classId}/grading/from-exam`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ examId: exams[0]?.id }),
}).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
});

console.log('report', report.title);
console.log('avg', report.summary?.avgScore, 'acc', report.summary?.accuracy);
console.log('students', report.summary?.students?.length);
console.log('errors', report.summary?.errorTypes);
console.log('typical', report.summary?.typical?.map((t) => t.qno + t.kp));

const csv = `学号,姓名,1,2,3
S01,李明,9,5,8
S02,王芳,8,6,7`;
const imp = await fetch(`${base}/classes/${classId}/grading/import-csv`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ csv, examName: '单元小测' }),
}).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
});
console.log('import ok', imp.title, 'avg', imp.summary?.avgScore);
console.log('GRADING PROD OK');
