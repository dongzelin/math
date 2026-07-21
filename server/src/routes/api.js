import { Router } from 'express';
import { randomUUID as uuid } from 'crypto';
import { db } from '../db.js';
import { getAiStatus } from '../ai/client.js';
import { loginAccount, registerAccount, requireAuth } from '../services/auth.js';
import {
  listClasses,
  getDiagnosis,
  getStudentProfile,
  getClassStudents,
  recomputeLayers,
  updateStudentLayer,
} from '../services/diagnosis.js';
import {
  generateLayeredSheet,
  refineSheet,
  generateComment,
  generateDiagnosisText,
  buildDailyItems,
} from '../services/aiTasks.js';
import {
  listReports,
  getReport,
  buildReportFromExam,
  buildReportFromImport,
  parseScoreCsv,
  writeComment,
  batchComments,
  listClassExams,
} from '../services/grading.js';
import {
  generateQuizPaper,
  createQuiz,
  publishQuiz,
  listQuizzes,
  listPublishedForStudent,
  getQuizForStudent,
  submitAttempt,
  buildReportFromQuiz,
} from '../services/quiz.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, name: '智学伴', time: new Date().toISOString() });
});

router.get('/ai/status', (_req, res) => {
  res.json(getAiStatus());
});

router.get('/meta/demo', (_req, res) => {
  res.json(db.allMeta());
});

router.post('/auth/register', (req, res) => {
  try {
    res.status(201).json(registerAccount(req.body || {}));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/auth/login', (req, res) => {
  try {
    res.json(loginAccount(req.body || {}));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.use(requireAuth);

function deny(res, status, error) {
  res.status(status).json({ error });
  return null;
}

router.patch('/auth/profile', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  db.update('accounts', (account) => account.id === req.auth.id, { name });
  if (req.auth.role === 'teacher') {
    db.update('teachers', (teacher) => teacher.id === req.auth.teacherId, { name });
  } else {
    db.update('students', (student) => student.id === req.auth.studentId, { name });
  }
  res.json({ ...req.auth, name });
});

function requireTeacher(req, res) {
  return req.auth?.role === 'teacher' || deny(res, 403, '仅教师可执行此操作');
}

function getClass(classId) {
  return db.find('classes', (item) => item.id === classId);
}

function requireTeacherClass(req, res, classId) {
  if (!requireTeacher(req, res)) return null;
  const cls = getClass(classId);
  if (!cls) return deny(res, 404, 'class not found');
  if (cls.teacher_id !== req.auth.teacherId) return deny(res, 403, '无权访问该班级');
  return cls;
}

function requireStudent(req, res, studentId) {
  if (req.auth?.role !== 'student') return deny(res, 403, '仅学生本人可访问');
  if (req.auth.studentId !== studentId) return deny(res, 403, '无权访问其他学生数据');
  const student = db.find('students', (item) => item.id === studentId);
  if (!student) return deny(res, 404, 'student not found');
  return student;
}

function requireStudentOrTeacher(req, res, studentId) {
  const student = db.find('students', (item) => item.id === studentId);
  if (!student) return deny(res, 404, 'student not found');
  if (req.auth?.role === 'student') {
    return req.auth.studentId === studentId ? student : deny(res, 403, '无权访问其他学生数据');
  }
  return requireTeacherClass(req, res, student.class_id) ? student : null;
}

function requireTeacherQuiz(req, res, quizId) {
  const quiz = db.find('quizzes', (item) => item.id === quizId);
  if (!quiz) return deny(res, 404, 'quiz not found');
  return requireTeacherClass(req, res, quiz.class_id) ? quiz : null;
}

function requireTeacherReport(req, res, reportId) {
  const report = db.find('grading_reports', (item) => item.id === reportId);
  if (!report) return deny(res, 404, 'report not found');
  return requireTeacherClass(req, res, report.class_id) ? report : null;
}

router.get('/classes', (req, res) => {
  if (!requireTeacher(req, res)) return;
  res.json(listClasses().filter((item) => item.teacher_id === req.auth.teacherId));
});

router.post('/classes', (req, res) => {
  if (!requireTeacher(req, res)) return;
  const { name, grade, subject } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const row = {
    id: uuid(),
    teacher_id: req.auth.teacherId,
    name,
    grade: grade || '高一',
    subject: subject || '高中数学',
    created_at: new Date().toISOString(),
  };
  db.insert('classes', row);
  res.json(row);
});

router.patch('/classes/:id', (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  db.update('classes', (item) => item.id === req.params.id, { name });
  res.json(getClass(req.params.id));
});

router.get('/classes/:id/students', (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  res.json(getClassStudents(req.params.id));
});

router.post('/classes/:id/students', (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  const { name, studentNo, layer } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const row = {
    id: uuid(),
    class_id: req.params.id,
    student_no: studentNo || '',
    name,
    layer: layer || 'B',
    is_monitor: 0,
  };
  db.insert('students', row);
  res.json(row);
});

router.post('/classes/:id/recompute-layers', (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  res.json(recomputeLayers(req.params.id));
});

router.patch('/students/:id/layer', (req, res) => {
  if (!requireTeacher(req, res)) return;
  const student = db.find('students', (item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'student not found' });
  if (!requireTeacherClass(req, res, student.class_id)) return;
  const { layer } = req.body || {};
  if (!['A', 'B', 'C'].includes(layer)) return res.status(400).json({ error: 'layer A/B/C' });
  res.json(updateStudentLayer(req.params.id, layer));
});

router.patch('/students/:id', (req, res) => {
  const student = db.find('students', (item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'student not found' });
  const canEdit =
    req.auth.role === 'student'
      ? req.auth.studentId === student.id
      : Boolean(requireTeacherClass(req, res, student.class_id));
  if (!canEdit) return;

  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  db.update('students', (item) => item.id === student.id, { name });
  db.update('accounts', (account) => account.student_id === student.id, { name });
  res.json(db.find('students', (item) => item.id === student.id));
});

router.get('/classes/:id/diagnosis', (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  const data = getDiagnosis(req.params.id);
  if (!data) return res.status(404).json({ error: 'class not found' });
  res.json(data);
});

router.get('/students/:id/profile', (req, res) => {
  if (!requireStudentOrTeacher(req, res, req.params.id)) return;
  const data = getStudentProfile(req.params.id);
  if (!data) return res.status(404).json({ error: 'student not found' });
  res.json(data);
});

router.post('/ai/layered-sheet', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  const { kpName, lessonType, classContext } = req.body || {};
  if (!kpName) return res.status(400).json({ error: 'kpName required' });
  res.json(await generateLayeredSheet({ kpName, lessonType, classContext }));
});

router.post('/ai/refine-sheet', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  const { sheet, instruction } = req.body || {};
  if (!sheet || !instruction) return res.status(400).json({ error: 'sheet & instruction required' });
  res.json(await refineSheet({ sheet, instruction }));
});

router.post('/resource-sheets', (req, res) => {
  const { classId, kpName, lessonType, content } = req.body || {};
  if (!requireTeacherClass(req, res, classId)) return;
  if (!classId || !content) return res.status(400).json({ error: 'classId & content required' });
  const row = {
    id: uuid(),
    class_id: classId,
    kp_name: kpName || content.kpName || '',
    lesson_type: lessonType || content.lessonType || '',
    content_json: JSON.stringify(content),
    created_at: new Date().toISOString(),
    source: content.source || 'ai',
  };
  db.insert('resource_sheets', row);
  res.json(row);
});

router.get('/classes/:id/resource-sheets', (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  const rows = db
    .filter('resource_sheets', (r) => r.class_id === req.params.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 20)
    .map((r) => ({ ...r, content: JSON.parse(r.content_json) }));
  res.json(rows);
});

router.post('/homework/push', (req, res) => {
  const { classId, sheetId, title, layers } = req.body || {};
  if (!requireTeacherClass(req, res, classId)) return;
  if (!classId || !layers) return res.status(400).json({ error: 'classId & layers required' });

  const students = getClassStudents(classId);
  const created = [];

  for (const layer of ['A', 'B', 'C']) {
    const items = layers[layer]?.items || layers[layer] || [];
    if (!items.length) continue;
    const pushId = uuid();
    const t = title || `分层练习 · ${layer}档`;
    db.insert('homework_pushes', {
      id: pushId,
      class_id: classId,
      sheet_id: sheetId || null,
      title: t,
      layer,
      items_json: JSON.stringify(items),
      created_at: new Date().toISOString(),
    });
    created.push({ pushId, layer, title: t, count: items.length });

    for (const s of students.filter((x) => x.layer === layer)) {
      db.insert('homework_submissions', {
        id: uuid(),
        push_id: pushId,
        student_id: s.id,
        answers_json: null,
        score: null,
        status: 'pending',
        submitted_at: null,
      });
      db.insert('notifications', {
        id: uuid(),
        audience: 'student',
        user_id: s.id,
        class_id: classId,
        title: '新的分层作业',
        body: `${t} 已推送，请及时完成`,
        link: '/student/homework',
        is_read: 0,
        created_at: new Date().toISOString(),
      });
    }
  }

  res.json({ ok: true, created });
});

router.get('/students/:id/homework', (req, res) => {
  if (!requireStudent(req, res, req.params.id)) return;
  const subs = db.filter('homework_submissions', (h) => h.student_id === req.params.id);
  const rows = subs
    .map((hs) => {
      const hp = db.find('homework_pushes', (p) => p.id === hs.push_id);
      if (!hp) return null;
      return {
        ...hs,
        title: hp.title,
        layer: hp.layer,
        items_json: hp.items_json,
        push_at: hp.created_at,
        items: JSON.parse(hp.items_json || '[]'),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.push_at).localeCompare(String(a.push_at)));
  res.json(rows);
});

router.post('/homework/submissions/:id/submit', (req, res) => {
  const submission = db.find('homework_submissions', (item) => item.id === req.params.id);
  if (!submission) return res.status(404).json({ error: 'submission not found' });
  if (!requireStudent(req, res, submission.student_id)) return;
  const { answers } = req.body || {};
  db.update(
    'homework_submissions',
    (h) => h.id === req.params.id,
    {
      answers_json: JSON.stringify(answers || {}),
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }
  );
  res.json(db.find('homework_submissions', (h) => h.id === req.params.id));
});

// —— 在线测验闭环（主路径）：AI 出卷 → 作答 → 自动评测 → 错因 ——
router.post('/ai/quiz-paper', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  try {
    const paper = await generateQuizPaper(req.body || {});
    res.json({ ok: true, paper, fallback: paper.source !== 'ai' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/classes/:id/quizzes', (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  res.json(listQuizzes(req.params.id));
});

router.post('/classes/:id/quizzes', async (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  try {
    const body = req.body || {};
    const {
      paper,
      publish,
      generate,
      title,
      kpNames,
      count,
      difficulty,
      composition,
      choiceCount,
      fillCount,
      judgeCount,
      essayCount,
    } = body;
    let p = paper;
    if (!p && generate !== false) {
      p = await generateQuizPaper({
        title,
        kpNames,
        count,
        difficulty,
        composition,
        choiceCount,
        fillCount,
        judgeCount,
        essayCount,
        classContext: '高一',
      });
    }
    if (!p) return res.status(400).json({ error: 'paper or generate required' });
    const quiz = createQuiz({
      classId: req.params.id,
      paper: p,
      publish: Boolean(publish),
    });
    res.json(quiz);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/quizzes/:id/publish', (req, res) => {
  if (!requireTeacherQuiz(req, res, req.params.id)) return;
  try {
    res.json(publishQuiz(req.params.id));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/students/:id/quizzes', (req, res) => {
  if (!requireStudent(req, res, req.params.id)) return;
  res.json(listPublishedForStudent(req.params.id));
});

router.get('/students/:studentId/quizzes/:quizId', (req, res) => {
  try {
    const student = requireStudent(req, res, req.params.studentId);
    if (!student) return;
    const quiz = db.find('quizzes', (item) => item.id === req.params.quizId);
    if (!quiz) return res.status(404).json({ error: 'quiz not found' });
    if (quiz.class_id !== student.class_id) return res.status(403).json({ error: '无权访问其他班级测验' });
    res.json(getQuizForStudent(req.params.quizId, req.params.studentId));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/students/:studentId/quizzes/:quizId/submit', (req, res) => {
  try {
    const student = requireStudent(req, res, req.params.studentId);
    if (!student) return;
    const quiz = db.find('quizzes', (item) => item.id === req.params.quizId);
    if (!quiz) return res.status(404).json({ error: 'quiz not found' });
    if (quiz.class_id !== student.class_id) return res.status(403).json({ error: '无权提交其他班级测验' });
    const { answers } = req.body || {};
    const result = submitAttempt(req.params.quizId, req.params.studentId, answers || {});
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/quizzes/:id/report', (req, res) => {
  try {
    if (!requireTeacherQuiz(req, res, req.params.id)) return;
    const report = buildReportFromQuiz(req.params.id, req.body || {});
    res.json(report);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// —— 智能批改（辅助：历史考试/导入） ——
router.get('/classes/:id/exams', (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  res.json(listClassExams(req.params.id));
});

router.get('/classes/:id/grading', (req, res) => {
  if (!requireTeacherClass(req, res, req.params.id)) return;
  res.json(listReports(req.params.id));
});

router.get('/grading/:reportId', (req, res) => {
  if (!requireTeacherReport(req, res, req.params.reportId)) return;
  const r = getReport(req.params.reportId);
  if (!r) return res.status(404).json({ error: 'report not found' });
  res.json(r);
});

/** 从已有考试成绩生成批改报告 */
router.post('/classes/:id/grading/from-exam', (req, res) => {
  try {
    if (!requireTeacherClass(req, res, req.params.id)) return;
    const { examId, title, syncErrors, notify } = req.body || {};
    const report = buildReportFromExam(req.params.id, examId, {
      title,
      syncErrors: syncErrors !== false,
      notify: notify !== false,
    });
    res.json(report);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** 导入 JSON 结构化成绩并生成报告 */
router.post('/classes/:id/grading/import', (req, res) => {
  try {
    if (!requireTeacherClass(req, res, req.params.id)) return;
    const report = buildReportFromImport(req.params.id, req.body || {});
    res.json(report);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** 导入 CSV 文本 */
router.post('/classes/:id/grading/import-csv', (req, res) => {
  try {
    if (!requireTeacherClass(req, res, req.params.id)) return;
    const { csv, title, examName, examDate } = req.body || {};
    if (!csv) return res.status(400).json({ error: 'csv required' });
    const parsed = parseScoreCsv(csv);
    const report = buildReportFromImport(req.params.id, {
      title,
      examName: examName || '导入测验',
      examDate,
      rows: parsed.rows,
      questions: parsed.questions,
    });
    res.json(report);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** 单生评语 */
router.post('/grading/:reportId/comment', async (req, res) => {
  try {
    if (!requireTeacherReport(req, res, req.params.reportId)) return;
    const { studentId, comment, autoAi } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    const result = await writeComment(req.params.reportId, studentId, {
      comment,
      autoAi: autoAi !== false,
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** 批量生成评语 */
router.post('/grading/:reportId/comments/batch', async (req, res) => {
  try {
    if (!requireTeacherReport(req, res, req.params.reportId)) return;
    const report = await batchComments(req.params.reportId);
    res.json(report);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** 兼容：直接 AI 评语（不绑报告） */
router.post('/ai/comment', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  res.json(await generateComment(req.body || {}));
});

/** 兼容旧路径：改为「用最近考试生成报告」而非假演示 */
router.post('/classes/:id/grading/demo', (req, res) => {
  try {
    if (!requireTeacherClass(req, res, req.params.id)) return;
    const report = buildReportFromExam(req.params.id, null, {
      title: undefined,
      syncErrors: true,
      notify: true,
    });
    res.json(report);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/ai/diagnosis-text', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  res.json(await generateDiagnosisText(req.body || {}));
});

router.get('/students/:id/errors', (req, res) => {
  if (!requireStudent(req, res, req.params.id)) return;
  res.json(
    db
      .filter('error_records', (e) => e.student_id === req.params.id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  );
});

router.get('/students/:id/daily', (req, res) => {
  if (!requireStudent(req, res, req.params.id)) return;
  const today = new Date().toISOString().slice(0, 10);
  let row = db.find(
    'daily_practices',
    (d) => d.student_id === req.params.id && d.practice_date === today
  );

  if (!row) {
    const profile = getStudentProfile(req.params.id);
    const items = buildDailyItems(profile?.weak || []);
    row = {
      id: uuid(),
      student_id: req.params.id,
      practice_date: today,
      items_json: JSON.stringify(items),
      status: 'open',
      score: null,
      created_at: new Date().toISOString(),
    };
    db.insert('daily_practices', row);
  }

  res.json({ ...row, items: JSON.parse(row.items_json) });
});

router.post('/students/:id/daily/submit', (req, res) => {
  if (!requireStudent(req, res, req.params.id)) return;
  const { answers } = req.body || {};
  const today = new Date().toISOString().slice(0, 10);
  const row = db.find(
    'daily_practices',
    (d) => d.student_id === req.params.id && d.practice_date === today
  );
  if (!row) return res.status(404).json({ error: 'no practice' });

  const items = JSON.parse(row.items_json);
  const profile = getStudentProfile(req.params.id);
  let correct = 0;
  const detail = items.map((it) => {
    const ans = answers?.[it.id];
    const ok = String(ans ?? '') === String(it.answer);
    if (ok) correct += 1;
    else {
      db.insert('error_records', {
        id: uuid(),
        student_id: req.params.id,
        class_id: profile?.student?.class_id,
        kp_name: it.kp,
        question: it.stem,
        wrong_answer: String(ans ?? ''),
        correct_answer: String(it.answer),
        error_type: '概念',
        source: '每日练',
        created_at: new Date().toISOString(),
      });
    }
    return { id: it.id, ok, answer: it.answer, yours: ans };
  });

  const score = items.length ? Math.round((correct / items.length) * 100) : 0;
  db.update('daily_practices', (d) => d.id === row.id, { status: 'done', score });
  db.insert('growth_events', {
    id: uuid(),
    student_id: req.params.id,
    event_type: 'practice',
    title: '完成每日练',
    detail: `得分 ${score}`,
    created_at: new Date().toISOString(),
  });

  res.json({ score, correct, total: items.length, detail });
});

router.get('/notifications', (req, res) => {
  const { audience, userId, classId } = req.query;
  const ownAudience = req.auth.role;
  const ownUserId = req.auth.role === 'teacher' ? req.auth.teacherId : req.auth.studentId;
  if ((audience && audience !== ownAudience) || (userId && userId !== ownUserId) || (classId && classId !== req.auth.classId)) {
    return res.status(403).json({ error: '无权访问其他用户通知' });
  }
  let rows = [...db.table('notifications')];
  rows = rows.filter((n) => n.audience === ownAudience);
  rows = rows.filter((n) => n.user_id === ownUserId || n.user_id == null);
  rows = rows.filter((n) => n.class_id === req.auth.classId || n.class_id == null);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  res.json(rows.slice(0, 50));
});

router.post('/notifications/:id/read', (req, res) => {
  const notification = db.find('notifications', (item) => item.id === req.params.id);
  if (!notification) return res.status(404).json({ error: 'notification not found' });
  const ownUserId = req.auth.role === 'teacher' ? req.auth.teacherId : req.auth.studentId;
  if (notification.audience !== req.auth.role || (notification.user_id && notification.user_id !== ownUserId)) {
    return res.status(403).json({ error: '无权操作其他用户通知' });
  }
  db.update('notifications', (n) => n.id === req.params.id, { is_read: 1 });
  res.json({ ok: true });
});

export default router;
