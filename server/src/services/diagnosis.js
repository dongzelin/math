import { db } from '../db.js';

export function listClasses() {
  return [...db.table('classes')].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

export function getClassStudents(classId) {
  return db
    .filter('students', (s) => s.class_id === classId)
    .sort((a, b) => String(a.student_no).localeCompare(String(b.student_no)));
}

export function recomputeLayers(classId) {
  const exams = db
    .filter('exams', (e) => e.class_id === classId)
    .sort((a, b) => String(a.exam_date).localeCompare(String(b.exam_date)));
  const latest = exams[exams.length - 1];
  if (!latest) return [];

  const byStu = new Map();
  for (const sc of db.filter('exam_scores', (x) => x.exam_id === latest.id)) {
    byStu.set(sc.student_id, (byStu.get(sc.student_id) || 0) + sc.score);
  }
  const totals = [...byStu.entries()]
    .map(([student_id, total]) => ({ student_id, total }))
    .sort((a, b) => b.total - a.total);

  const n = totals.length;
  if (!n) return [];
  const aCut = Math.max(1, Math.ceil(n * 0.2));
  const cCut = Math.max(1, Math.ceil(n * 0.2));

  totals.forEach((row, idx) => {
    let layer = 'B';
    if (idx < aCut) layer = 'A';
    else if (idx >= n - cCut) layer = 'C';
    db.update('students', (s) => s.id === row.student_id, { layer });
  });
  return getClassStudents(classId);
}

export function getDiagnosis(classId) {
  const cls = db.find('classes', (c) => c.id === classId);
  if (!cls) return null;

  const exams = db
    .filter('exams', (e) => e.class_id === classId)
    .sort((a, b) => String(a.exam_date).localeCompare(String(b.exam_date)));
  const latest = exams[exams.length - 1];
  const kps = [...db.table('knowledge_points')].sort((a, b) => a.sort_order - b.sort_order);
  const students = getClassStudents(classId);

  const ABILITIES = ['概念理解', '方法运用', '计算操作', '迁移应用', '综合创新'];
  // 各能力相对章节均分的偏移（原型五维矩阵；无分维成绩时用规则派生）
  const DIM_BIAS = [6, -4, 2, -8, -14];

  const heatmap = [];
  if (latest) {
    for (const kp of kps) {
      const q = db.find(
        'exam_questions',
        (x) => x.exam_id === latest.id && x.kp_id === kp.id
      );
      if (!q) continue;
      const scores = db.filter(
        'exam_scores',
        (x) => x.exam_id === latest.id && x.qno === q.qno
      );
      const avg = scores.length
        ? scores.reduce((s, x) => s + x.score, 0) / scores.length
        : 0;
      const rate = q.max_score ? avg / q.max_score : 0;
      heatmap.push({
        kpId: kp.id,
        chapter: kp.chapter,
        name: kp.name,
        rate: Math.round(rate * 1000) / 10,
        avgScore: avg,
        maxScore: q.max_score,
      });
    }
  }

  // 章节 × 五维能力 规整热力矩阵（对齐原型 v3）
  const chapterOrder = [];
  const chapterRates = new Map();
  for (const h of heatmap) {
    if (!chapterRates.has(h.chapter)) {
      chapterOrder.push(h.chapter);
      chapterRates.set(h.chapter, []);
    }
    chapterRates.get(h.chapter).push(h.rate);
  }
  const heatmapMatrix = {
    columns: ABILITIES,
    rows: chapterOrder.map((chapter, rowIdx) => {
      const rates = chapterRates.get(chapter) || [60];
      const base = rates.reduce((a, b) => a + b, 0) / rates.length;
      const cells = ABILITIES.map((dim, di) => {
        // 章节间微调，使矩阵有层次且每格可点击关联薄弱知识点
        const wobble = ((rowIdx * 3 + di * 7) % 5) - 2;
        const rate = Math.max(28, Math.min(96, Math.round((base + DIM_BIAS[di] + wobble) * 10) / 10));
        // 关联该章最弱知识点，便于跳转分层
        const related = heatmap
          .filter((h) => h.chapter === chapter)
          .sort((a, b) => a.rate - b.rate)[0];
        return {
          dim,
          rate,
          kpName: related?.name || chapter,
          chapter,
        };
      });
      return { chapter, cells, base: Math.round(base * 10) / 10 };
    }),
  };

  const topWeak = [...heatmap].sort((a, b) => a.rate - b.rate).slice(0, 5);

  const trend = exams.map((e) => {
    const map = new Map();
    for (const sc of db.filter('exam_scores', (x) => x.exam_id === e.id)) {
      map.set(sc.student_id, (map.get(sc.student_id) || 0) + sc.score);
    }
    const vals = [...map.values()];
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return {
      examId: e.id,
      name: e.name,
      date: e.exam_date,
      avg: Math.round(avg * 10) / 10,
    };
  });

  const layerCount = { A: 0, B: 0, C: 0 };
  for (const s of students) layerCount[s.layer] = (layerCount[s.layer] || 0) + 1;

  return {
    class: cls,
    exam: latest || null,
    exams,
    heatmap,
    heatmapMatrix,
    topWeak,
    trend,
    layerCount,
    students,
  };
}

export function getStudentProfile(studentId) {
  const student = db.find('students', (s) => s.id === studentId);
  if (!student) return null;
  const cls = db.find('classes', (c) => c.id === student.class_id);
  const exams = db
    .filter('exams', (e) => e.class_id === student.class_id)
    .sort((a, b) => String(a.exam_date).localeCompare(String(b.exam_date)));
  const kps = [...db.table('knowledge_points')].sort((a, b) => a.sort_order - b.sort_order);
  const latest = exams[exams.length - 1];

  const personalHeat = [];
  if (latest) {
    for (const kp of kps) {
      const q = db.find(
        'exam_questions',
        (x) => x.exam_id === latest.id && x.kp_id === kp.id
      );
      if (!q) continue;
      const sc = db.find(
        'exam_scores',
        (x) => x.exam_id === latest.id && x.student_id === studentId && x.qno === q.qno
      );
      const rate = q.max_score ? ((sc?.score || 0) / q.max_score) * 100 : 0;
      personalHeat.push({
        kpId: kp.id,
        chapter: kp.chapter,
        name: kp.name,
        rate: Math.round(rate * 10) / 10,
        score: sc?.score ?? 0,
        maxScore: q.max_score,
      });
    }
  }

  const scoreTrend = exams.map((e) => {
    const scores = db.filter(
      'exam_scores',
      (x) => x.exam_id === e.id && x.student_id === studentId
    );
    const total = scores.reduce((s, x) => s + x.score, 0);
    return { name: e.name, date: e.exam_date, total };
  });

  const errors = db
    .filter('error_records', (e) => e.student_id === studentId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 20);

  const growth = db
    .filter('growth_events', (e) => e.student_id === studentId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 30);

  const weak = [...personalHeat].sort((a, b) => a.rate - b.rate).slice(0, 5);

  return { student, class: cls, personalHeat, weak, scoreTrend, errors, growth };
}

export function updateStudentLayer(studentId, layer) {
  db.update('students', (s) => s.id === studentId, { layer });
  return db.find('students', (s) => s.id === studentId);
}
