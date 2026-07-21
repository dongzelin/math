/**
 * 智能批改（可投产路径）
 * - 从班级考试分题成绩生成报告（规则统计 + 错因归类）
 * - 导入结构化成绩表（CSV / JSON）
 * - 评语写回、错题入库、通知学生
 * 不做：手写 OCR 承诺
 */
import { randomUUID as uuid } from 'crypto';
import { db } from '../db.js';
import { getClassStudents } from './diagnosis.js';
import { generateComment } from './aiTasks.js';

const ERROR_TYPES = ['概念', '计算', '审题', '方法', '表达'];

/** 按题号/知识点规则映射错因（可后续改成题库字段） */
function classifyError(qno, kpName, maxScore, score) {
  const ratio = maxScore > 0 ? score / maxScore : 1;
  if (ratio >= 1) return null;
  const name = kpName || '';
  if (/概念|定义|集合|逻辑/.test(name)) return '概念';
  if (/计算|运算|求值|化简/.test(name)) return '计算';
  if (/单调|导数|综合|证明/.test(name)) return '方法';
  if (/审题|应用|实际/.test(name)) return '审题';
  // 按题号稳定分流，保证分布合理
  const n = Number(qno) || 0;
  return ERROR_TYPES[n % ERROR_TYPES.length];
}

function typicalTip(kpName, errorType) {
  const map = {
    概念: `「${kpName}」相关概念不清，建议回归定义与适用条件`,
    计算: `「${kpName}」计算环节易出错，建议分步验算`,
    审题: `「${kpName}」审题不完整，易漏条件或定义域`,
    方法: `「${kpName}」方法选用不当，需对照典型解法训练`,
    表达: `「${kpName}」步骤书写不规范，影响得分`,
  };
  return map[errorType] || `「${kpName}」需针对性巩固`;
}

/**
 * 从某场考试生成完整批改报告
 */
export function buildReportFromExam(
  classId,
  examId,
  { title, syncErrors = true, notify = true, onlyWithScores = false } = {}
) {
  const cls = db.find('classes', (c) => c.id === classId);
  if (!cls) throw Object.assign(new Error('班级不存在'), { status: 404 });

  const exam = examId
    ? db.find('exams', (e) => e.id === examId && e.class_id === classId)
    : db
        .filter('exams', (e) => e.class_id === classId)
        .sort((a, b) => String(b.exam_date).localeCompare(String(a.exam_date)))[0];

  if (!exam) throw Object.assign(new Error('无可用考试，请先导入成绩'), { status: 400 });

  const questions = db
    .filter('exam_questions', (q) => q.exam_id === exam.id)
    .sort((a, b) => Number(a.qno) - Number(b.qno));

  const kpMap = Object.fromEntries(db.table('knowledge_points').map((k) => [k.id, k]));
  const allStudents = getClassStudents(classId);
  const scores = db.filter('exam_scores', (s) => s.exam_id === exam.id);
  const scoredIds = new Set(scores.map((s) => s.student_id));

  // 导入场景：只统计有成绩的学生；考试场景：全班（无分题记 0）
  const students = onlyWithScores
    ? allStudents.filter((s) => scoredIds.has(s.id))
    : allStudents;

  if (!students.length) {
    throw Object.assign(new Error('没有可批改的学生成绩'), { status: 400 });
  }

  const scoreByStuQ = new Map();
  for (const sc of scores) {
    scoreByStuQ.set(`${sc.student_id}::${sc.qno}`, sc.score);
  }

  const errorCount = Object.fromEntries(ERROR_TYPES.map((t) => [t, 0]));
  const wrongByQ = new Map(); // qno -> count
  const studentRows = [];

  for (const stu of students) {
    let total = 0;
    let maxTotal = 0;
    const wrong = [];

    for (const q of questions) {
      const kp = kpMap[q.kp_id];
      const kpName = kp?.name || '知识点';
      const has = scoreByStuQ.has(`${stu.id}::${q.qno}`);
      const got = has ? scoreByStuQ.get(`${stu.id}::${q.qno}`) : null;

      maxTotal += q.max_score;

      if (got == null) {
        // 全班考试：未录分按 0；仅有分名单：跳过该题不计入（宽表缺列）
        if (onlyWithScores) continue;
        total += 0;
        const et = classifyError(q.qno, kpName, q.max_score, 0) || '审题';
        errorCount[et] = (errorCount[et] || 0) + 1;
        wrong.push({ qno: q.qno, kp: kpName, errorType: et, score: 0, maxScore: q.max_score });
        wrongByQ.set(q.qno, (wrongByQ.get(q.qno) || 0) + 1);
        continue;
      }

      total += got;

      if (got >= q.max_score - 1e-9) {
        // full mark
      } else {
        const et = classifyError(q.qno, kpName, q.max_score, got);
        if (et) {
          errorCount[et] = (errorCount[et] || 0) + 1;
          wrong.push({
            qno: q.qno,
            kp: kpName,
            errorType: et,
            score: got,
            maxScore: q.max_score,
          });
          wrongByQ.set(q.qno, (wrongByQ.get(q.qno) || 0) + 1);
        }
      }
    }

    studentRows.push({
      studentId: stu.id,
      studentNo: stu.student_no,
      name: stu.name,
      layer: stu.layer,
      score: Math.round(total * 10) / 10,
      maxScore: maxTotal,
      rate: maxTotal ? Math.round((total / maxTotal) * 1000) / 10 : 0,
      wrong,
      comment: '',
    });
  }

  const n = studentRows.length || 1;
  const avgScore = Math.round((studentRows.reduce((s, r) => s + r.score, 0) / n) * 10) / 10;
  const maxPaper = studentRows[0]?.maxScore || 100;
  const accuracy = studentRows.reduce((s, r) => s + r.rate, 0) / n / 100;
  const submitted = scoredIds.size;
  const submitRate = allStudents.length ? submitted / allStudents.length : 0;

  // 典型错误：错题人数最多的前 3 题
  const typical = [...wrongByQ.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([qno, count]) => {
      const q = questions.find((x) => x.qno === String(qno) || x.qno === qno);
      const kp = q ? kpMap[q.kp_id] : null;
      const kpName = kp?.name || '综合';
      const sample = studentRows.find((r) => r.wrong.some((w) => String(w.qno) === String(qno)));
      const et = sample?.wrong.find((w) => String(w.qno) === String(qno))?.errorType || '方法';
      return {
        qno: String(qno),
        kp: kpName,
        tip: typicalTip(kpName, et),
        wrongCount: count,
        errorType: et,
      };
    });

  const errorTypes = ERROR_TYPES.map((type) => ({
    type,
    count: errorCount[type] || 0,
  }));

  const summary = {
    source: onlyWithScores ? 'import' : 'exam',
    examId: exam.id,
    examName: exam.name,
    examDate: exam.exam_date,
    submitRate: Math.round(submitRate * 1000) / 1000,
    submitted,
    totalStudents: allStudents.length,
    avgScore,
    maxScore: maxPaper,
    accuracy: Math.round(accuracy * 1000) / 1000,
    errorTypes,
    typical,
    students: studentRows,
  };

  const report = {
    id: uuid(),
    class_id: classId,
    title: title || `${exam.name} · 批改报告`,
    exam_id: exam.id,
    created_at: new Date().toISOString(),
    summary_json: JSON.stringify(summary),
    status: 'published',
  };
  db.insert('grading_reports', report);

  if (syncErrors) {
    syncWrongToErrorBook(classId, studentRows, exam.name);
  }
  if (notify) {
    notifyStudentsGraded(classId, studentRows, report.title);
  }

  return { ...report, summary };
}

/**
 * 导入结构化成绩：
 * rows: [{ studentNo|studentId|name, scores: { "1": 8, "2": 10 } } ] 或 flat [{studentNo,qno,score}]
 * questionsMeta 可选：[{qno,maxScore,kpName}]
 */
export function buildReportFromImport(classId, payload) {
  const {
    title = '导入成绩 · 批改报告',
    examName = '导入测验',
    examDate = new Date().toISOString().slice(0, 10),
    rows = [],
    questions = [],
    syncErrors = true,
    notify = true,
  } = payload || {};

  if (!rows.length) {
    throw Object.assign(new Error('成绩数据为空'), { status: 400 });
  }

  const students = getClassStudents(classId);
  const byNo = Object.fromEntries(students.map((s) => [String(s.student_no), s]));
  const byName = Object.fromEntries(students.map((s) => [s.name, s]));
  const byId = Object.fromEntries(students.map((s) => [s.id, s]));

  // 标准化 flat 或 nested
  let normalized = rows;
  if (rows[0] && rows[0].qno != null && rows[0].score != null) {
    const map = new Map();
    for (const r of rows) {
      const key = r.studentId || r.studentNo || r.name;
      if (!map.has(key)) {
        map.set(key, {
          studentId: r.studentId,
          studentNo: r.studentNo,
          name: r.name,
          scores: {},
        });
      }
      map.get(key).scores[String(r.qno)] = Number(r.score);
    }
    normalized = [...map.values()];
  }

  // 推断题目满分
  let qMeta = questions.length
    ? questions.map((q) => ({
        qno: String(q.qno),
        maxScore: Number(q.maxScore || q.max_score || 10),
        kpName: q.kpName || q.kp || q.name || `第${q.qno}题`,
      }))
    : null;

  if (!qMeta) {
    const qnos = new Set();
    for (const r of normalized) {
      Object.keys(r.scores || {}).forEach((q) => qnos.add(String(q)));
    }
    qMeta = [...qnos]
      .sort((a, b) => Number(a) - Number(b))
      .map((qno) => ({ qno, maxScore: 10, kpName: `第${qno}题` }));
  }

  // 写入一场考试，便于与学情诊断联动
  const examId = uuid();
  db.insert('exams', {
    id: examId,
    class_id: classId,
    name: examName,
    exam_date: examDate,
    total_score: qMeta.reduce((s, q) => s + q.maxScore, 0),
  });

  // 尽量挂知识点
  const kps = db.table('knowledge_points');
  for (const q of qMeta) {
    const kp =
      kps.find((k) => k.name === q.kpName) ||
      kps[Number(q.qno) - 1] ||
      kps[0];
    db.insert('exam_questions', {
      id: uuid(),
      exam_id: examId,
      qno: q.qno,
      max_score: q.maxScore,
      kp_id: kp?.id || null,
    });
  }

  for (const r of normalized) {
    const stu =
      (r.studentId && byId[r.studentId]) ||
      (r.studentNo && byNo[String(r.studentNo)]) ||
      (r.name && byName[r.name]);
    if (!stu) continue;
    for (const [qno, score] of Object.entries(r.scores || {})) {
      db.insert('exam_scores', {
        id: uuid(),
        exam_id: examId,
        student_id: stu.id,
        qno: String(qno),
        score: Number(score),
      });
    }
  }

  return buildReportFromExam(classId, examId, {
    title,
    syncErrors,
    notify,
    onlyWithScores: true,
  });
}

/** 解析 CSV 文本：表头 学号,姓名,1,2,3... 或 学号,题号,得分 */
export function parseScoreCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { rows: [], questions: [] };

  const split = (line) => {
    // 简单 CSV：逗号/制表符
    if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
    return line.split(',').map((x) => x.trim());
  };

  const header = split(lines[0]);
  const h0 = header[0] || '';
  const h1 = header[1] || '';

  // 长表：学号,题号,得分
  if (/题号|qno/i.test(h1) || header.some((h) => /题号/.test(h))) {
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = split(lines[i]);
      rows.push({
        studentNo: cols[0],
        name: /姓名/.test(header[1]) ? cols[1] : undefined,
        qno: /姓名/.test(header[1]) ? cols[2] : cols[1],
        score: Number(/姓名/.test(header[1]) ? cols[3] : cols[2]),
      });
    }
    return { rows, questions: [] };
  }

  // 宽表：学号,姓名,1,2,3...
  const qStart = /姓名|name/i.test(header[1]) ? 2 : 1;
  const questions = header.slice(qStart).map((q) => ({
    qno: String(q).replace(/^第/, '').replace(/题$/, ''),
    maxScore: 10,
    kpName: `第${String(q).replace(/^第/, '').replace(/题$/, '')}题`,
  }));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = split(lines[i]);
    if (!cols[0]) continue;
    const scores = {};
    header.slice(qStart).forEach((q, idx) => {
      const qno = String(q).replace(/^第/, '').replace(/题$/, '');
      const v = cols[qStart + idx];
      if (v === '' || v == null) return;
      scores[qno] = Number(v);
    });
    rows.push({
      studentNo: cols[0],
      name: qStart === 2 ? cols[1] : undefined,
      scores,
    });
  }
  return { rows, questions };
}

function syncWrongToErrorBook(classId, studentRows, source) {
  for (const stu of studentRows) {
    for (const w of stu.wrong || []) {
      // 避免同一次报告重复刷太多：同学生同学号来源去重
      const exists = db.find(
        'error_records',
        (e) =>
          e.student_id === stu.studentId &&
          e.source === source &&
          e.question?.includes(`第${w.qno}题`)
      );
      if (exists) continue;
      db.insert('error_records', {
        id: uuid(),
        student_id: stu.studentId,
        class_id: classId,
        kp_name: w.kp,
        question: `第${w.qno}题 · ${w.kp}（得分 ${w.score}/${w.maxScore}）`,
        wrong_answer: `得分 ${w.score}`,
        correct_answer: `满分 ${w.maxScore}`,
        error_type: w.errorType,
        source,
        created_at: new Date().toISOString(),
      });
    }
  }
}

function notifyStudentsGraded(classId, studentRows, title) {
  for (const stu of studentRows) {
    db.insert('notifications', {
      id: uuid(),
      audience: 'student',
      user_id: stu.studentId,
      class_id: classId,
      title: '批改完成',
      body: `「${title}」已完成，得分 ${stu.score}，可查看错题与评语`,
      link: '/student/errors',
      is_read: 0,
      created_at: new Date().toISOString(),
    });
  }
}

export function listReports(classId) {
  return db
    .filter('grading_reports', (r) => r.class_id === classId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((r) => ({
      id: r.id,
      title: r.title,
      exam_id: r.exam_id,
      created_at: r.created_at,
      status: r.status || 'published',
      summary: typeof r.summary_json === 'string' ? JSON.parse(r.summary_json) : r.summary_json,
    }));
}

export function getReport(reportId) {
  const r = db.find('grading_reports', (x) => x.id === reportId);
  if (!r) return null;
  return {
    ...r,
    summary: typeof r.summary_json === 'string' ? JSON.parse(r.summary_json) : r.summary_json,
  };
}

export async function writeComment(reportId, studentId, { autoAi = true, comment } = {}) {
  const r = getReport(reportId);
  if (!r) throw Object.assign(new Error('报告不存在'), { status: 404 });

  const summary = r.summary;
  const stu = (summary.students || []).find((s) => s.studentId === studentId);
  if (!stu) throw Object.assign(new Error('学生不在报告中'), { status: 404 });

  let text = comment;
  if (!text && autoAi) {
    const result = await generateComment({
      studentName: stu.name,
      weakPoints: (stu.wrong || []).map((w) => `${w.kp}(${w.errorType})`),
      wrongSummary: (stu.wrong || []).map((w) => `第${w.qno}题${w.errorType}`).join('、'),
    });
    text = result.comment;
  }
  if (!text) text = '';

  stu.comment = text;
  db.update(
    'grading_reports',
    (x) => x.id === reportId,
    { summary_json: JSON.stringify(summary) }
  );

  return { studentId, comment: text, report: getReport(reportId) };
}

export async function batchComments(reportId) {
  const r = getReport(reportId);
  if (!r) throw Object.assign(new Error('报告不存在'), { status: 404 });
  const summary = r.summary;
  for (const stu of summary.students || []) {
    if (stu.comment) continue;
    const result = await generateComment({
      studentName: stu.name,
      weakPoints: (stu.wrong || []).slice(0, 3).map((w) => `${w.kp}(${w.errorType})`),
      wrongSummary: (stu.wrong || []).map((w) => `第${w.qno}题`).join('、'),
    });
    stu.comment = result.comment;
  }
  db.update(
    'grading_reports',
    (x) => x.id === reportId,
    { summary_json: JSON.stringify(summary) }
  );
  return getReport(reportId);
}

export function listClassExams(classId) {
  return db
    .filter('exams', (e) => e.class_id === classId)
    .sort((a, b) => String(b.exam_date).localeCompare(String(a.exam_date)));
}
