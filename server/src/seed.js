import { randomUUID as uuid } from 'crypto';
import { db, initSchema } from './db.js';
import { hashPassword } from './services/auth.js';

initSchema();
db.clearAll();

const classId = 'cls-gaoyi-3';
const teacherId = 't-zhang';

db.insert('teachers', { id: teacherId, name: '张老师', account: 'zhang' });
db.insert('accounts', {
  id: 'acct-t-zhang', role: 'teacher', name: '张老师', account: 'zhang',
  password_hash: hashPassword('123456'), teacher_id: teacherId, class_id: classId, created_at: new Date().toISOString(),
});
db.insert('classes', {
  id: classId,
  teacher_id: teacherId,
  name: '高一(3)班',
  grade: '高一',
  subject: '高中数学',
  created_at: new Date().toISOString(),
});

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
  db.insert('knowledge_points', { id, chapter, name, sort_order });
}

const names = [
  ['S01', '李明'], ['S02', '王芳'], ['S03', '张伟'], ['S04', '刘洋'],
  ['S05', '陈静'], ['S06', '杨帆'], ['S07', '赵磊'], ['S08', '黄婷'],
  ['S09', '周杰'], ['S10', '吴倩'], ['S11', '徐浩'], ['S12', '孙悦'],
];
const layers = ['A', 'A', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'C', 'C', 'B'];
const students = names.map(([no, name], i) => ({
  id: `stu-${no.toLowerCase()}`,
  class_id: classId,
  student_no: no,
  name,
  layer: layers[i],
  is_monitor: i === 0 ? 1 : 0,
}));
for (const s of students) db.insert('students', s);
db.insert('accounts', {
  id: 'acct-s01', role: 'student', name: '李明', account: 's01',
  password_hash: hashPassword('123456'), student_id: 'stu-s01', class_id: classId, created_at: new Date().toISOString(),
});

const exams = [
  { id: 'ex-1', name: '开学摸底', exam_date: '2026-03-01' },
  { id: 'ex-2', name: '月考一', exam_date: '2026-04-08' },
  { id: 'ex-3', name: '月考二', exam_date: '2026-05-15' },
];
for (const e of exams) {
  db.insert('exams', { ...e, class_id: classId, total_score: 100 });
}

function scoreFor(studentIndex, kpIndex, examIndex) {
  const layer = layers[studentIndex];
  let base = layer === 'A' ? 8.5 : layer === 'C' ? 4.5 : 6.5;
  if (kpIndex === 1 || kpIndex === 6) base -= 1.8;
  if (kpIndex === 0 || kpIndex === 7) base += 0.8;
  base += (examIndex - 1) * 0.3;
  base += ((studentIndex * 3 + kpIndex * 7 + examIndex * 5) % 5) * 0.25 - 0.5;
  return Math.max(0, Math.min(10, Math.round(base * 2) / 2));
}

const qRows = [];
const scoreRows = [];
for (const [ei, e] of exams.entries()) {
  for (let qi = 0; qi < kps.length; qi++) {
    qRows.push({
      id: uuid(),
      exam_id: e.id,
      qno: String(qi + 1),
      max_score: 10,
      kp_id: kps[qi][0],
    });
    for (let si = 0; si < students.length; si++) {
      scoreRows.push({
        id: uuid(),
        exam_id: e.id,
        student_id: students[si].id,
        qno: String(qi + 1),
        score: scoreFor(si, qi, ei),
      });
    }
  }
}
db.insertMany('exam_questions', qRows);
db.insertMany('exam_scores', scoreRows);

db.insert('grading_reports', {
  id: 'gr-demo-1',
  class_id: classId,
  title: '月考二 · 智能批改报告',
  created_at: new Date().toISOString(),
  summary_json: JSON.stringify({
    submitRate: 1,
    avgScore: 68.4,
    accuracy: 0.71,
    errorTypes: [
      { type: '概念', count: 18 },
      { type: '计算', count: 24 },
      { type: '审题', count: 12 },
      { type: '方法', count: 15 },
      { type: '表达', count: 8 },
    ],
    typical: [
      { qno: '3', kp: '函数单调性', tip: '忽略定义域导致单调区间错误' },
      { qno: '7', kp: '三角恒等变换', tip: '公式选用不当，辅助角法不熟' },
    ],
    students: students.slice(0, 5).map((s, i) => ({
      studentId: s.id,
      name: s.name,
      score: 55 + i * 6,
      comment: '',
      wrong: [
        { qno: '3', errorType: '概念' },
        { qno: '7', errorType: '方法' },
      ],
    })),
  }),
});

const liming = students[0];
db.insert('error_records', {
  id: uuid(),
  student_id: liming.id,
  class_id: classId,
  kp_name: '函数单调性',
  question: '求 f(x)=x+1/x 在 (0,+∞) 上的单调区间',
  wrong_answer: '在(0,+∞)单调递增',
  correct_answer: '在(0,1]递减，[1,+∞)递增',
  error_type: '概念',
  source: '月考二',
  created_at: '2026-05-15T10:00:00',
});
db.insert('error_records', {
  id: uuid(),
  student_id: liming.id,
  class_id: classId,
  kp_name: '三角恒等变换',
  question: '化简 sin15° 的值',
  wrong_answer: '√2/2',
  correct_answer: '(√6-√2)/4',
  error_type: '方法',
  source: '月考二',
  created_at: '2026-05-15T10:05:00',
});

db.insert('growth_events', {
  id: uuid(), student_id: liming.id, event_type: 'exam',
  title: '完成月考二', detail: '班级均分附近，函数模块有进步', created_at: '2026-05-15',
});
db.insert('growth_events', {
  id: uuid(), student_id: liming.id, event_type: 'practice',
  title: '每日练打卡', detail: '完成函数单调性 2 题', created_at: '2026-05-18',
});
db.insert('growth_events', {
  id: uuid(), student_id: liming.id, event_type: 'badge',
  title: '连续学习 3 天', detail: '获得「持之以恒」徽章', created_at: '2026-05-20',
});

db.insert('notifications', {
  id: uuid(), audience: 'teacher', user_id: teacherId, class_id: classId,
  title: '月考二成绩已入库', body: '可查看学情热力与薄弱 Top5',
  link: '/teacher/diagnosis', is_read: 0, created_at: new Date().toISOString(),
});
db.insert('notifications', {
  id: uuid(), audience: 'student', user_id: liming.id, class_id: classId,
  title: '欢迎使用智学伴', body: '可从「我的学情」查看薄弱点，并完成每日练',
  link: '/student/profile', is_read: 0, created_at: new Date().toISOString(),
});

db.setMeta('seeded_at', new Date().toISOString());
db.setMeta('demo_class_id', classId);
db.setMeta('demo_teacher_id', teacherId);
db.setMeta('demo_student_id', liming.id);

console.log('Seed OK');
console.log({ classId, teacherId, studentId: liming.id, students: students.length, exams: exams.length, db: db.path });
