const base = 'http://127.0.0.1:8787/api';
const classId = 'cls-gaoyi-3';
const studentId = 'stu-s01';

console.log('1) generate by type composition + publish');
const quiz = await fetch(`${base}/classes/${classId}/quizzes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    generate: true,
    publish: true,
    title: '四题型闭环自测',
    kpNames: ['函数单调性', '三角恒等变换'],
    composition: { choice: 2, fill: 1, judge: 1, essay: 1 },
    difficulty: '中等',
  }),
}).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
});
console.log('quiz', quiz.id, quiz.source, 'items', quiz.items.length, 'composition', quiz.composition);
console.log(
  'types',
  quiz.items.map((it) => `${it.qno}:${it.type}`)
);

console.log('2) student submit');
const answers = {};
for (const it of quiz.items) {
  const key = it.id || it.qno;
  if (it.type === 'choice' || it.type === 'judge') {
    if (Number(it.qno) % 2 === 0) {
      const wrong = (it.options || []).find((o) => o.key !== it.answer);
      answers[key] = wrong?.key || 'X';
    } else {
      answers[key] = it.answer;
    }
  } else if (it.type === 'fill') {
    answers[key] = it.answer; // 填空做对
  } else {
    answers[key] = `过程：${it.answer || '略'} ∴ 得解`; // 解答题写一点
  }
}
const sub = await fetch(`${base}/students/${studentId}/quizzes/${quiz.id}/submit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ answers }),
}).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
});
console.log('score', sub.score, '/', sub.maxScore, 'essayPending', sub.hasEssayPending);
console.log(
  'detail',
  sub.detail.map((d) => `${d.qno}:${d.type}:${d.correct ? 'OK' : d.errorType}${d.pendingReview ? '(预)' : ''}`)
);

console.log('3) report');
const report = await fetch(`${base}/quizzes/${quiz.id}/report`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
}).then(async (r) => {
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
});
console.log('report', report.title);
console.log('source', report.summary.source);
console.log('errorTypes', report.summary.errorTypes);
console.log('itemStats', report.summary.itemStats?.map((i) => `${i.qno}:${i.type}:${i.correctRate}%`));
console.log('QUIZ LOOP OK');
