import { db, initSchema } from '../src/db.js';
import { hashPassword } from '../src/services/auth.js';

initSchema();

const now = new Date().toISOString();
const teacherId = 't-liu';
const classId = 'cls-gaoer-2';
const accountId = 'acct-t-liu';

function upsert(table, key, row) {
  const exists = db.find(table, (item) => item.id === key);
  if (exists) db.update(table, (item) => item.id === key, row);
  else db.insert(table, { id: key, ...row });
}

function ensureKnowledgePoints() {
  const kps = [
    ['kp-1', '函数', '函数的概念', 1],
    ['kp-2', '函数', '函数单调性', 2],
    ['kp-3', '函数', '函数奇偶性', 3],
    ['kp-4', '函数', '二次函数', 4],
    ['kp-5', '三角', '任意角与弧度', 5],
    ['kp-6', '三角', '三角函数图像', 6],
    ['kp-7', '三角', '三角恒等变换', 7],
    ['kp-8', '数列', '等差数列', 8],
    ['kp-9', '数列', '等比数列', 9],
    ['kp-10', '不等式', '基本不等式', 10],
  ];
  for (const [id, chapter, name, sort_order] of kps) {
    upsert('knowledge_points', id, { chapter, name, sort_order });
  }
  return kps;
}

function liuScoreFor(studentIndex, kpIndex, examIndex, layers) {
  const layer = layers[studentIndex];
  let base = layer === 'A' ? 8.2 : layer === 'C' ? 4.2 : 6.3;
  if (kpIndex === 2 || kpIndex === 4 || kpIndex === 8) base -= 1.5;
  if (kpIndex === 5 || kpIndex === 9) base += 0.7;
  base += examIndex * 0.35;
  base += ((studentIndex * 5 + kpIndex * 4 + examIndex * 3) % 6) * 0.2 - 0.5;
  return Math.max(0, Math.min(10, Math.round(base * 2) / 2));
}

const kps = ensureKnowledgePoints();

upsert('teachers', teacherId, { name: '刘老师', account: 'liu' });
upsert('accounts', accountId, {
  role: 'teacher',
  name: '刘老师',
  account: 'liu',
  password_hash: hashPassword('123456'),
  teacher_id: teacherId,
  class_id: classId,
  created_at: now,
});
upsert('classes', classId, {
  teacher_id: teacherId,
  name: '高二(2)班',
  grade: '高二',
  subject: '高中数学',
  created_at: now,
});

const names = [
  ['L01', '陈雨晴'], ['L02', '刘承宇'], ['L03', '宋子墨'], ['L04', '林嘉怡'],
  ['L05', '许诺'], ['L06', '周可欣'], ['L07', '唐一凡'], ['L08', '何思源'],
  ['L09', '魏梓涵'], ['L10', '罗一鸣'], ['L11', '丁悦'], ['L12', '马晨曦'],
  ['L13', '邹雨萌'], ['L14', '蒋若涵'], ['L15', '贺知远'], ['L16', '沈佳琪'],
];
const layers = ['A', 'A', 'A', 'B', 'B', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'B', 'A', 'B', 'C'];
const students = names.map(([no, name], i) => ({
  id: `stu-${no.toLowerCase()}`,
  class_id: classId,
  student_no: no,
  name,
  layer: layers[i],
  is_monitor: i === 1 ? 1 : 0,
}));
for (const student of students) {
  upsert('students', student.id, {
    class_id: student.class_id,
    student_no: student.student_no,
    name: student.name,
    layer: student.layer,
    is_monitor: student.is_monitor,
  });
}

for (const student of students.slice(0, 5)) {
  const account = student.student_no.toLowerCase();
  upsert('accounts', `acct-${account}`, {
    role: 'student',
    name: student.name,
    account,
    password_hash: hashPassword('123456'),
    student_id: student.id,
    class_id: classId,
    created_at: now,
  });
}

const exams = [
  { id: 'liu-ex-1', name: '期初诊断', exam_date: '2026-03-06' },
  { id: 'liu-ex-2', name: '阶段测一', exam_date: '2026-04-12' },
  { id: 'liu-ex-3', name: '阶段测二', exam_date: '2026-05-20' },
];
for (const exam of exams) {
  upsert('exams', exam.id, {
    class_id: classId,
    name: exam.name,
    exam_date: exam.exam_date,
    total_score: 100,
  });
}

for (const [ei, exam] of exams.entries()) {
  for (let qi = 0; qi < kps.length; qi++) {
    const qno = String(qi + 1);
    upsert('exam_questions', `${exam.id}-q${qno}`, {
      exam_id: exam.id,
      qno,
      max_score: 10,
      kp_id: kps[qi][0],
    });
    for (let si = 0; si < students.length; si++) {
      upsert('exam_scores', `${exam.id}-${students[si].id}-q${qno}`, {
        exam_id: exam.id,
        student_id: students[si].id,
        qno,
        score: liuScoreFor(si, qi, ei, layers),
      });
    }
  }
}

upsert('grading_reports', 'gr-liu-1', {
  class_id: classId,
  title: '阶段测二 · 智能批改报告',
  created_at: now,
  summary_json: JSON.stringify({
    submitRate: 0.94,
    avgScore: 65.8,
    accuracy: 0.68,
    errorTypes: [
      { type: '概念', count: 21 },
      { type: '计算', count: 17 },
      { type: '审题', count: 14 },
      { type: '方法', count: 19 },
      { type: '表达', count: 6 },
    ],
    typical: [
      { qno: '3', kp: '函数奇偶性', tip: '对定义域关于原点对称的前提遗漏' },
      { qno: '5', kp: '任意角与弧度', tip: '角度制与弧度制转换不稳定' },
      { qno: '9', kp: '等比数列', tip: '通项与前 n 项和公式混用' },
    ],
    students: students.slice(0, 6).map((s, i) => ({
      studentId: s.id,
      name: s.name,
      score: 58 + i * 4,
      comment: '',
      wrong: [
        { qno: '3', errorType: '概念' },
        { qno: '9', errorType: '方法' },
      ],
    })),
  }),
});

upsert('error_records', 'err-liu-l01-1', {
  student_id: 'stu-l01',
  class_id: classId,
  kp_name: '函数奇偶性',
  question: '判断 f(x)=x^3+x 在 R 上的奇偶性，并说明理由',
  wrong_answer: '偶函数',
  correct_answer: '奇函数，因 f(-x)=-f(x)',
  error_type: '概念',
  source: '阶段测二',
  created_at: '2026-05-20T10:10:00',
});
upsert('error_records', 'err-liu-l01-2', {
  student_id: 'stu-l01',
  class_id: classId,
  kp_name: '等比数列',
  question: '已知等比数列首项为 2，公比为 3，求第 5 项',
  wrong_answer: '2×3×5',
  correct_answer: '2×3^4=162',
  error_type: '方法',
  source: '阶段测二',
  created_at: '2026-05-20T10:15:00',
});
upsert('growth_events', 'growth-liu-l01-1', {
  student_id: 'stu-l01',
  event_type: 'exam',
  title: '完成阶段测二',
  detail: '函数模块掌握稳定，数列模块需要巩固',
  created_at: '2026-05-20',
});
upsert('growth_events', 'growth-liu-l01-2', {
  student_id: 'stu-l01',
  event_type: 'practice',
  title: '完成补弱练习',
  detail: '围绕函数奇偶性完成 3 道题',
  created_at: '2026-05-22',
});
upsert('notifications', 'noti-liu-teacher-1', {
  audience: 'teacher',
  user_id: teacherId,
  class_id: classId,
  title: '阶段测二数据已入库',
  body: '高二(2)班已有热力图、薄弱 Top5 和分层概览数据',
  link: '/teacher/diagnosis',
  is_read: 0,
  created_at: now,
});
upsert('notifications', 'noti-liu-l01-1', {
  audience: 'student',
  user_id: 'stu-l01',
  class_id: classId,
  title: '刘老师发布了补弱任务',
  body: '请查看你的学情和错题本，优先复习函数奇偶性',
  link: '/student/profile',
  is_read: 0,
  created_at: now,
});

db.setMeta('liu_teacher_id', teacherId);
db.setMeta('liu_class_id', classId);
db.setMeta('liu_student_id', 'stu-l01');

console.log('Ensure Liu demo OK');
console.log({ teacherId, classId, account: 'liu', password: '123456', students: students.length });
