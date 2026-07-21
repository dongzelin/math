import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, '..');
const runDir = path.join(serverDir, 'data', `test-run-${Date.now()}`);
const dbPath = path.join(runDir, 'zhixueban.json');
const port = Number(process.env.TEST_PORT || 8790);
const base = `http://127.0.0.1:${port}/api`;
const timeoutMs = Number(process.env.TEST_TIMEOUT_MS || 3500);
const results = [];
let server;
let activeToken = null;
let teacherToken = null;
let studentToken = null;

function record(id, title, status, detail = '') {
  results.push({ id, title, status, detail });
  console.log(`${status.toUpperCase().padEnd(5)} ${id} ${title}${detail ? ` | ${detail}` : ''}`);
}

async function request(pathname, options = {}, timeout = timeoutMs) {
  const { authToken, headers, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${base}${pathname}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken === null || !(authToken || activeToken) ? {} : { Authorization: `Bearer ${authToken || activeToken}` }),
        ...(headers || {}),
      },
      ...fetchOptions,
      signal: controller.signal,
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function check(id, title, assertion) {
  try {
    await assertion();
    record(id, title, 'pass');
  } catch (error) {
    const detail = error.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : error.message;
    record(id, title, 'fail', detail);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealth() {
  for (let i = 0; i < 30; i++) {
    try {
      const result = await request('/health', {}, 1000);
      if (result.status === 200 && result.body.ok) return;
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('test server did not become healthy');
}

function post(pathname, body) {
  return request(pathname, { method: 'POST', body: JSON.stringify(body) });
}

async function main() {
  fs.mkdirSync(runDir, { recursive: true });
  const env = { ...process.env, DB_PATH: dbPath, PORT: String(port), HOST: '127.0.0.1' };
  execFileSync(process.execPath, ['src/seed.js'], { cwd: serverDir, env, stdio: 'pipe' });
  server = spawn(process.execPath, ['src/index.js'], { cwd: serverDir, env, stdio: 'ignore' });
  await waitForHealth();

  const classId = 'cls-gaoyi-3';
  const studentId = 'stu-s01';
  const otherStudentId = 'stu-s03';
  const unique = `qa-${Date.now()}`;
  let registeredStudent;
  let otherClassId;
  let crossClassStudentId;
  let sheet;
  let homeworkId;
  let quiz;
  let report;

  await check('API-001', 'health returns service metadata', async () => {
    const r = await request('/health');
    assert(r.status === 200 && r.body.ok === true && r.body.name === '智学伴', `status ${r.status}`);
  });
  await check('API-002', 'AI status does not expose a full API key', async () => {
    const r = await request('/ai/status');
    assert(r.status === 200 && typeof r.body.configured === 'boolean', `status ${r.status}`);
    assert(!('apiKey' in r.body), 'raw apiKey field exposed');
    assert(!r.body.keyHint || r.body.keyHint.includes('…'), 'key hint is not masked');
  });
  await check('API-003', 'seed metadata has demo identifiers', async () => {
    const r = await request('/meta/demo');
    assert(r.status === 200 && r.body.demo_class_id === classId && r.body.demo_student_id === studentId, `body ${JSON.stringify(r.body)}`);
  });
  await check('API-004', 'seed teacher can log in', async () => {
    const r = await request('/auth/login', { method: 'POST', body: JSON.stringify({ role: 'teacher', account: 'zhang', password: '123456' }), authToken: null });
    assert(r.status === 200 && r.body.role === 'teacher' && r.body.teacherId === 't-zhang', `status ${r.status}`);
    teacherToken = r.body.token;
    activeToken = teacherToken;
  });
  await check('API-005', 'seed student can log in', async () => {
    const r = await request('/auth/login', { method: 'POST', body: JSON.stringify({ role: 'student', account: 's01', password: '123456' }), authToken: null });
    assert(r.status === 200 && r.body.role === 'student' && r.body.studentId === studentId, `status ${r.status}`);
    studentToken = r.body.token;
  });
  await check('API-006', 'invalid credentials are rejected', async () => {
    const r = await post('/auth/login', { role: 'student', account: 's01', password: 'wrong' });
    assert(r.status === 401 && r.body.error, `status ${r.status}`);
  });
  await check('API-007', 'student registration creates a profile without returning a hash', async () => {
    const r = await post('/auth/register', { role: 'student', name: '测试学生', account: unique, password: '654321' });
    assert(r.status === 201 && r.body.studentId && !('password_hash' in r.body), `status ${r.status}`);
    registeredStudent = r.body;
    const profile = await request(`/students/${registeredStudent.studentId}/profile`, { authToken: registeredStudent.token });
    assert(profile.status === 200 && profile.body.student.name === '测试学生', `profile ${profile.status}`);
  });
  await check('API-008', 'duplicate registration is rejected', async () => {
    const r = await post('/auth/register', { role: 'student', name: '重复', account: unique, password: '654321' });
    assert(r.status === 409, `status ${r.status}`);
  });
  await check('API-009', 'short registration password is rejected', async () => {
    const r = await post('/auth/register', { role: 'teacher', name: '短密码', account: `${unique}-t`, password: '12345' });
    assert(r.status === 400, `status ${r.status}`);
  });
  await check('API-010', 'class list and create class work', async () => {
    const before = await request('/classes');
    const created = await post('/classes', { name: '测试班级', grade: '高二', subject: '高中数学' });
    const after = await request('/classes');
    assert(before.status === 200 && created.status === 200 && after.body.some((item) => item.id === created.body.id), 'class not persisted');
    otherClassId = created.body.id;
    const student = await post(`/classes/${otherClassId}/students`, { name: '跨班学生', studentNo: 'QA-CROSS', layer: 'B' });
    assert(student.status === 200, 'cross-class student not created');
    crossClassStudentId = student.body.id;
  });
  await check('API-011', 'class creation validates name', async () => {
    const r = await post('/classes', { name: '' });
    assert(r.status === 400, `status ${r.status}`);
  });
  await check('API-012', 'student list and add student work', async () => {
    const added = await post(`/classes/${classId}/students`, { name: '新增学生', studentNo: 'QA-01', layer: 'B' });
    const list = await request(`/classes/${classId}/students`);
    assert(added.status === 200 && list.body.some((item) => item.id === added.body.id), 'student not listed');
  });
  await check('API-013', 'student add validates name', async () => {
    const r = await post(`/classes/${classId}/students`, { name: '' });
    assert(r.status === 400, `status ${r.status}`);
  });
  await check('API-014', 'diagnosis, profile and recompute return usable data', async () => {
    const [diagnosis, profile, recompute] = await Promise.all([
      request(`/classes/${classId}/diagnosis`),
      request(`/students/${studentId}/profile`),
      post(`/classes/${classId}/recompute-layers`, {}),
    ]);
    assert(diagnosis.status === 200 && diagnosis.body.heatmapMatrix?.columns?.length === 5, 'diagnosis matrix missing');
    assert(profile.status === 200 && profile.body.personalHeat?.length, 'profile heat missing');
    assert(recompute.status === 200, `recompute ${recompute.status}`);
  });
  await check('API-015', 'manual layer validates allowed values', async () => {
    const invalid = await request(`/students/${studentId}/layer`, { method: 'PATCH', body: JSON.stringify({ layer: 'Z' }) });
    const valid = await request(`/students/${studentId}/layer`, { method: 'PATCH', body: JSON.stringify({ layer: 'A' }) });
    assert(invalid.status === 400 && valid.status === 200 && valid.body.layer === 'A', `statuses ${invalid.status}/${valid.status}`);
  });
  await check('API-016', 'resource sheet save and list round trip', async () => {
    const r = await post('/resource-sheets', {
      classId,
      kpName: '函数单调性',
      lessonType: '巩固',
      content: { kpName: '函数单调性', source: 'template', A: { items: [{ stem: 'A题' }] } },
    });
    const list = await request(`/classes/${classId}/resource-sheets`);
    assert(r.status === 200 && list.body.some((item) => item.id === r.body.id && item.content.kpName === '函数单调性'), 'resource round trip failed');
    sheet = r.body;
  });
  await check('API-017', 'resource sheet validates required data', async () => {
    const r = await post('/resource-sheets', { classId });
    assert(r.status === 400, `status ${r.status}`);
  });
  await check('API-018', 'layered homework reaches only its target student', async () => {
    await request(`/students/${studentId}/layer`, { method: 'PATCH', body: JSON.stringify({ layer: 'A' }) });
    await request(`/students/${otherStudentId}/layer`, { method: 'PATCH', body: JSON.stringify({ layer: 'B' }) });
    const r = await post('/homework/push', {
      classId,
      sheetId: sheet.id,
      title: '分层互通测试',
      layers: { A: { items: [{ stem: 'A题', answer: '1' }] } },
    });
    const mine = await request(`/students/${studentId}/homework`, { authToken: studentToken });
    const other = await request(`/students/${registeredStudent.studentId}/homework`, { authToken: registeredStudent.token });
    assert(r.status === 200 && mine.body.some((item) => item.title === '分层互通测试'), 'target homework missing');
    assert(!other.body.some((item) => item.title === '分层互通测试'), 'homework leaked to another layer');
    homeworkId = mine.body.find((item) => item.title === '分层互通测试').id;
  });
  await check('API-019', 'homework submission persists answers', async () => {
    const r = await request(`/homework/submissions/${homeworkId}/submit`, { method: 'POST', body: JSON.stringify({ answers: { q1: '1' } }), authToken: studentToken });
    const list = await request(`/students/${studentId}/homework`, { authToken: studentToken });
    const current = list.body.find((item) => item.id === homeworkId);
    assert(r.status === 200 && current.status === 'submitted' && current.answers_json.includes('q1'), 'submission not persisted');
  });

  const items = [
    { id: 'q1', qno: '1', type: 'choice', stem: '2+2?', options: [{ key: 'A', text: '3', errorType: '计算' }, { key: 'B', text: '4', errorType: null }], answer: 'B', score: 5, kp: '函数单调性' },
    { id: 'q2', qno: '2', type: 'fill', stem: '3+4', answer: '7', score: 5, kp: '函数单调性', commonError: '计算' },
    { id: 'q3', qno: '3', type: 'judge', stem: '1<2', options: [{ key: 'T', text: '正确', errorType: null }, { key: 'F', text: '错误', errorType: '概念' }], answer: 'T', score: 3, kp: '函数单调性' },
    { id: 'q4', qno: '4', type: 'essay', stem: '解 x+1=2', answer: 'x=1', score: 12, kp: '函数单调性', commonError: '方法' },
  ];
  await check('API-020', 'manual four-type quiz can be created and published', async () => {
    const r = await post(`/classes/${classId}/quizzes`, {
      generate: false,
      publish: true,
      paper: { title: '四题型回归卷', timeLimitMin: 10, composition: { choice: 1, fill: 1, judge: 1, essay: 1 }, items },
    });
    assert(r.status === 200 && r.body.status === 'published' && r.body.items.length === 4, `status ${r.status}`);
    quiz = r.body;
  });
  await check('API-021', 'published quiz is visible without answer leakage', async () => {
    const list = await request(`/students/${studentId}/quizzes`, { authToken: studentToken });
    const paper = await request(`/students/${studentId}/quizzes/${quiz.id}`, { authToken: studentToken });
    assert(list.status === 200 && list.body.some((item) => item.id === quiz.id), 'quiz not listed');
    assert(paper.status === 200 && !JSON.stringify(paper.body.quiz.items).includes('"answer"'), 'answer leaked');
  });
  await check('API-022', 'quiz submit grades objective questions and marks essay pending', async () => {
    const r = await request(`/students/${studentId}/quizzes/${quiz.id}/submit`, { method: 'POST', body: JSON.stringify({ answers: { q1: 'A', q2: '7', q3: 'T', q4: 'x=1' } }), authToken: studentToken });
    assert(r.status === 200 && r.body.maxScore === 25 && r.body.hasEssayPending === true, `body ${JSON.stringify(r.body)}`);
  });
  await check('API-023', 'quiz report is based on submitted attempts', async () => {
    const r = await post(`/quizzes/${quiz.id}/report`, {});
    assert(r.status === 200 && r.body.summary?.source === 'online_quiz' && r.body.summary?.students?.length === 1, `status ${r.status}`);
    report = r.body;
  });
  await check('API-024', 'grading report list and read work', async () => {
    const list = await request(`/classes/${classId}/grading`);
    const detail = await request(`/grading/${report.id}`);
    assert(list.status === 200 && list.body.some((item) => item.id === report.id) && detail.status === 200, 'report not readable');
  });
  await check('API-025', 'historical grading can produce a report', async () => {
    const r = await post(`/classes/${classId}/grading/from-exam`, { examId: 'ex-3', syncErrors: false, notify: false });
    assert(r.status === 200 && r.body.summary, `status ${r.status}`);
  });
  await check('API-026', 'CSV grading validates missing csv and accepts a valid CSV', async () => {
    const invalid = await post(`/classes/${classId}/grading/import-csv`, {});
    const valid = await post(`/classes/${classId}/grading/import-csv`, { csv: 'student_no,name,Q1\nS01,李明,8' });
    assert(invalid.status === 400 && valid.status === 200, `statuses ${invalid.status}/${valid.status}`);
  });
  await check('API-027', 'manual grading comment updates only the chosen student', async () => {
    const r = await post(`/grading/${report.id}/comment`, { studentId, comment: '人工回归评语', autoAi: false });
    assert(r.status === 200 && r.body.report.summary.students.find((item) => item.studentId === studentId)?.comment === '人工回归评语', `status ${r.status}`);
  });
  await check('API-028', 'daily practice is stable within one day and records result', async () => {
    const first = await request(`/students/${studentId}/daily`, { authToken: studentToken });
    const second = await request(`/students/${studentId}/daily`, { authToken: studentToken });
    const answers = Object.fromEntries(first.body.items.map((item) => [item.id, item.answer]));
    const submit = await request(`/students/${studentId}/daily/submit`, { method: 'POST', body: JSON.stringify({ answers }), authToken: studentToken });
    assert(first.status === 200 && second.status === 200 && first.body.id === second.body.id && submit.status === 200, 'daily lifecycle failed');
  });
  await check('API-029', 'error book, notifications and read status work', async () => {
    const errors = await request(`/students/${studentId}/errors`, { authToken: studentToken });
    const notices = await request(`/notifications?audience=student&userId=${studentId}&classId=${classId}`, { authToken: studentToken });
    assert(errors.status === 200 && notices.status === 200, 'lists unavailable');
    if (notices.body[0]) {
      const read = await request(`/notifications/${notices.body[0].id}/read`, { method: 'POST', body: '{}', authToken: studentToken });
      assert(read.status === 200, `read ${read.status}`);
    }
  });

  await check('XAUTH-001', 'cross-student profile access is rejected', async () => {
    const r = await request(`/students/${registeredStudent.studentId}/profile`, { authToken: studentToken });
    assert(r.status === 403, `expected 403, got ${r.status}`);
  });
  await check('XAUTH-002', 'cross-class quiz access is rejected', async () => {
    const r = await request(`/students/${crossClassStudentId}/quizzes/${quiz.id}`, { authToken: studentToken });
    assert(r.status === 403 || r.status === 404, `expected 403/404, got ${r.status}`);
  });

  await check('API-AI-001', 'layered AI endpoint has a bounded fallback response', async () => {
    const r = await post('/ai/layered-sheet', { kpName: '函数单调性', lessonType: '巩固', classContext: '高一' });
    assert(r.status === 200 && r.body.sheet, `status ${r.status}`);
  });
  await check('API-AI-002', 'quiz AI endpoint has a bounded fallback response', async () => {
    const r = await post('/ai/quiz-paper', { composition: { choice: 1, fill: 1, judge: 1, essay: 1 }, kpNames: ['函数单调性'] });
    assert(r.status === 200 && r.body.paper?.items?.length === 4, `status ${r.status}`);
  });
} 

try {
  await main();
} catch (error) {
  record('HARNESS-001', 'test harness boot', 'fail', error.message);
} finally {
  if (server && !server.killed) server.kill('SIGTERM');
  fs.rmSync(runDir, { recursive: true, force: true });
  const summary = {
    total: results.length,
    passed: results.filter((item) => item.status === 'pass').length,
    failed: results.filter((item) => item.status === 'fail').length,
    failures: results.filter((item) => item.status === 'fail'),
  };
  console.log(`REGRESSION_SUMMARY ${JSON.stringify(summary)}`);
  if (summary.failed) process.exitCode = 1;
}
