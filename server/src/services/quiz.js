/**
 * 在线测验闭环（生产主路径）
 * 教师按题型设题量 → AI(Codex) 出卷 → 发布 → 学生作答 → 自动判分 → 真实错因
 * 题型：选择题 / 填空题 / 判断题 / 解答题
 */
import { randomUUID as uuid } from 'crypto';
import { db } from '../db.js';
import { chatJson } from '../ai/client.js';
import { getClassStudents } from './diagnosis.js';
const ERROR_TYPES = ['概念', '计算', '审题', '方法', '表达'];

/** 四种题型（与教师端输入一致） */
export const QUIZ_TYPES = [
  { key: 'choice', label: '选择题', defaultScore: 5 },
  { key: 'fill', label: '填空题', defaultScore: 5 },
  { key: 'judge', label: '判断题', defaultScore: 3 },
  { key: 'essay', label: '解答题', defaultScore: 12 },
];

export const QUIZ_TYPE_MAX = 30; // 单题型上限
export const QUIZ_TOTAL_MAX = 60;

function normalizeAnswer(v) {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/．/g, '.')
    .toLowerCase();
}

function answersEqual(a, b) {
  return normalizeAnswer(a) === normalizeAnswer(b);
}

/** 教师输入 → 规范 composition */
export function normalizeComposition(input = {}) {
  const raw =
    input.composition ||
    input.typeCounts ||
    {
      choice: input.choiceCount ?? input.countChoice,
      fill: input.fillCount ?? input.countFill,
      judge: input.judgeCount ?? input.countJudge,
      essay: input.essayCount ?? input.countEssay,
    };

  const clamp = (v) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(QUIZ_TYPE_MAX, n);
  };

  let composition = {
    choice: clamp(raw.choice ?? 0),
    fill: clamp(raw.fill ?? 0),
    judge: clamp(raw.judge ?? 0),
    essay: clamp(raw.essay ?? 0),
  };

  // 兼容旧接口：只传 count
  if (
    !composition.choice &&
    !composition.fill &&
    !composition.judge &&
    !composition.essay &&
    input.count != null
  ) {
    const n = Math.min(QUIZ_TOTAL_MAX, Math.max(1, Number(input.count) || 6));
    composition = { choice: n, fill: 0, judge: 0, essay: 0 };
  }

  let total =
    composition.choice + composition.fill + composition.judge + composition.essay;

  if (total === 0) {
    composition = { choice: 4, fill: 2, judge: 2, essay: 1 };
    total = 9;
  }

  if (total > QUIZ_TOTAL_MAX) {
    // 等比压缩（极少触发）
    const scale = QUIZ_TOTAL_MAX / total;
    composition = {
      choice: Math.max(0, Math.floor(composition.choice * scale)),
      fill: Math.max(0, Math.floor(composition.fill * scale)),
      judge: Math.max(0, Math.floor(composition.judge * scale)),
      essay: Math.max(0, Math.floor(composition.essay * scale)),
    };
    total =
      composition.choice + composition.fill + composition.judge + composition.essay;
  }

  return { composition, total };
}

function typeLabel(t) {
  return QUIZ_TYPES.find((x) => x.key === t)?.label || t;
}

function defaultScore(type) {
  return QUIZ_TYPES.find((x) => x.key === type)?.defaultScore || 5;
}

// —— 本地题库（按题型，无 AI 时仍可闭环） ——
const BANK = {
  choice: [
    {
      stem: '函数 f(x)=x+1/x 在区间 (0,+∞) 上的单调性是？',
      options: [
        { key: 'A', text: '在 (0,+∞) 上单调递增', errorType: '概念' },
        { key: 'B', text: '在 (0,1] 递减，在 [1,+∞) 递增', errorType: null },
        { key: 'C', text: '在 (0,+∞) 上单调递减', errorType: '概念' },
        { key: 'D', text: '在 (0,1] 递增，在 [1,+∞) 递减', errorType: '方法' },
      ],
      answer: 'B',
      kp: '函数单调性',
      analysis: '求导 f′(x)=1-1/x²，在 (0,1) 为负、(1,+∞) 为正。',
      commonError: '概念',
    },
    {
      stem: 'sin15° 的值等于？',
      options: [
        { key: 'A', text: '√2/2', errorType: '方法' },
        { key: 'B', text: '(√6-√2)/4', errorType: null },
        { key: 'C', text: '(√6+√2)/4', errorType: '计算' },
        { key: 'D', text: '1/2', errorType: '概念' },
      ],
      answer: 'B',
      kp: '三角恒等变换',
      analysis: 'sin(45°-30°)=sin45°cos30°-cos45°sin30°。',
      commonError: '方法',
    },
    {
      stem: '等差数列 {a_n} 中 a_1=2，公差 d=3，则 a_5=？',
      options: [
        { key: 'A', text: '11', errorType: '计算' },
        { key: 'B', text: '14', errorType: null },
        { key: 'C', text: '17', errorType: '计算' },
        { key: 'D', text: '5', errorType: '概念' },
      ],
      answer: 'B',
      kp: '等差数列',
      analysis: 'a_n=a_1+(n-1)d ⇒ a_5=2+4×3=14。',
      commonError: '计算',
    },
    {
      stem: '二次函数 f(x)=x²-2x+3 的最小值是？',
      options: [
        { key: 'A', text: '1', errorType: '计算' },
        { key: 'B', text: '2', errorType: null },
        { key: 'C', text: '3', errorType: '方法' },
        { key: 'D', text: '0', errorType: '概念' },
      ],
      answer: 'B',
      kp: '二次函数',
      analysis: '配方 (x-1)²+2，顶点最小值为 2。',
      commonError: '方法',
    },
  ],
  fill: [
    {
      stem: '若 f(x)=2x+1，则 f(3)=____。',
      answer: '7',
      kp: '函数的概念',
      analysis: 'f(3)=2×3+1=7。',
      commonError: '计算',
    },
    {
      stem: '函数 y=sin x 的最小正周期是____。',
      answer: '2π',
      kp: '三角函数图像',
      analysis: '正弦函数最小正周期为 2π。',
      commonError: '概念',
    },
    {
      stem: '等比数列 a_1=3，公比 q=2，则 a_4=____。',
      answer: '24',
      kp: '等比数列',
      analysis: 'a_n=a_1·q^{n-1} ⇒ a_4=3×2³=24。',
      commonError: '计算',
    },
  ],
  judge: [
    {
      stem: '偶函数的图像关于原点对称。',
      answer: '错误',
      kp: '函数奇偶性',
      analysis: '偶函数关于 y 轴对称，奇函数关于原点对称。',
      commonError: '概念',
    },
    {
      stem: '若 a>0,b>0，则 a+b ≥ 2√(ab) 恒成立。',
      answer: '正确',
      kp: '基本不等式',
      analysis: '基本不等式，当且仅当 a=b 时等号成立。',
      commonError: '概念',
    },
    {
      stem: '1 弧度等于 180°。',
      answer: '错误',
      kp: '任意角与弧度',
      analysis: 'π rad = 180°，1 rad ≈ 57.3°。',
      commonError: '概念',
    },
  ],
  essay: [
    {
      stem: '已知函数 f(x)=x²-2x-3。\n(1) 求 f(x) 的最小值；\n(2) 求不等式 f(x)≤0 的解集。',
      answer: '(1) 最小值 -4；(2) x∈[-1,3]',
      kp: '二次函数',
      analysis:
        '(1) f(x)=(x-1)²-4，最小值为 -4。\n(2) (x+1)(x-3)≤0 ⇒ x∈[-1,3]。',
      commonError: '方法',
      scoringPoints: ['配方/顶点求最值', '因式分解求根', '写出解集'],
    },
    {
      stem: '证明：对任意 a>0,b>0，有 (a+b)/2 ≥ √(ab)，并说明等号成立条件。',
      answer: '由 (√a-√b)²≥0 展开即得；等号当 a=b',
      kp: '基本不等式',
      analysis: '(√a-√b)²≥0 ⇒ a+b≥2√(ab)，两边除以 2。',
      commonError: '方法',
      scoringPoints: ['写出证明过程', '等号条件'],
    },
  ],
};

function fallbackByType(type, count, kpNames, startQno) {
  const bank = BANK[type] || BANK.choice;
  const kps = kpNames?.length ? kpNames : ['函数单调性'];
  const items = [];
  for (let i = 0; i < count; i++) {
    const base = bank[i % bank.length];
    const qno = String(startQno + i);
    const kp = kps[i % kps.length];
    const score = defaultScore(type);
    let options = [];
    if (type === 'choice') {
      options = (base.options || []).map((o) => ({ ...o }));
    } else if (type === 'judge') {
      options = [
        { key: '正确', text: '正确', errorType: base.answer === '正确' ? null : '概念' },
        { key: '错误', text: '错误', errorType: base.answer === '错误' ? null : '概念' },
      ];
    }
    items.push({
      id: `q${qno}`,
      qno,
      type,
      stem: base.stem.includes(kp) ? base.stem : `【${kp}】${base.stem}`,
      options,
      answer: String(base.answer ?? '').trim(),
      score,
      kp: base.kp || kp,
      analysis: base.analysis || '',
      commonError: base.commonError || '概念',
      scoringPoints: base.scoringPoints || undefined,
      autoGrade: type !== 'essay',
    });
  }
  return items;
}

function normalizeItem(it, index, kpNames, forcedType) {
  const qno = String(it.qno || index + 1);
  let type = forcedType || it.type || 'choice';
  if (type === 'true_false' || type === 'tf') type = 'judge';
  if (type === 'fill_blank' || type === 'blank') type = 'fill';
  if (type === 'solution' || type === 'subjective') type = 'essay';
  if (!['choice', 'fill', 'judge', 'essay'].includes(type)) type = 'choice';

  let options = Array.isArray(it.options) ? it.options : [];
  if (type === 'judge' && options.length < 2) {
    options = [
      { key: '正确', text: '正确', errorType: null },
      { key: '错误', text: '错误', errorType: '概念' },
    ];
  }
  if (type === 'choice' || type === 'judge') {
    options = options.map((o, j) => {
      const key = o.key || (type === 'judge' ? (j === 0 ? '正确' : '错误') : String.fromCharCode(65 + j));
      const isCorrect =
        normalizeAnswer(o.key || key) === normalizeAnswer(it.answer) ||
        normalizeAnswer(o.text) === normalizeAnswer(it.answer);
      return {
        key,
        text: o.text || String(key),
        errorType: isCorrect ? null : o.errorType || it.commonError || '概念',
      };
    });
  } else {
    options = [];
  }

  return {
    id: `q${qno}`,
    qno,
    type,
    stem: it.stem || '（题目生成不完整）',
    options,
    answer: String(it.answer ?? '').trim(),
    score: Number(it.score) || defaultScore(type),
    kp: it.kp || kpNames[0] || '综合',
    analysis: it.analysis || '',
    commonError: it.commonError || '概念',
    scoringPoints: Array.isArray(it.scoringPoints) ? it.scoringPoints : undefined,
    autoGrade: type !== 'essay',
  };
}

async function generateTypeChunk({
  title,
  kpNames,
  type,
  count,
  difficulty,
  classContext,
  startQno,
}) {
  const typeRules = {
    choice: `type 必须为 "choice"；每题 4 个选项 A/B/C/D；answer 为正确选项字母；错误选项 errorType 标明错因，正确项 errorType 为 null；score 建议 5`,
    fill: `type 必须为 "fill"；options 为 []；answer 为简短标准答案字符串（可含 π、√ 等符号）；commonError 为常见错因；score 建议 5`,
    judge: `type 必须为 "judge"；options 仅两项：[{"key":"正确","text":"正确","errorType":...},{"key":"错误","text":"错误","errorType":...}]；answer 为 "正确" 或 "错误"；score 建议 3`,
    essay: `type 必须为 "essay"；options 为 []；answer 为参考答案要点（文字）；scoringPoints 为字符串数组评分点；commonError 为常见错因；score 建议 10~15；题干可分 (1)(2) 小问`,
  };

  const system = `你是高中数学命题老师。本批只出【${typeLabel(type)}】，恰好 ${count} 道，便于在线测验。
严格输出 JSON（不要 markdown）：
{
  "title": string,
  "timeLimitMin": number,
  "items": [
    {
      "qno": "1",
      "type": "${type}",
      "stem": string,
      "options": [{"key":string,"text":string,"errorType":"概念|计算|审题|方法|表达"|null}],
      "answer": string,
      "score": number,
      "kp": string,
      "analysis": string,
      "commonError": "概念|计算|审题|方法|表达",
      "scoringPoints": string[]
    }
  ]
}
规则：
1. ${typeRules[type]}
2. 知识点从用户给定范围取材，题干具体可做，题目互不重复
3. 学科高中数学，不要超纲
4. items 数组长度必须恰好为 ${count}
5. 题号从 ${startQno} 起连续编号`;

  const user = `标题：${title || '课堂在线测验'}
知识点：${(kpNames || []).join('、')}
题型：${typeLabel(type)}
本批题量：${count}
难度：${difficulty}
班级：${classContext}
请生成本批 JSON。`;

  const { data } = await chatJson(system, user, { temperature: 0.45 });
  if (!data?.items?.length) throw new Error(`${typeLabel(type)} 无题目`);
  return {
    title: data.title,
    timeLimitMin: data.timeLimitMin,
    items: data.items.slice(0, count).map((it, i) =>
      normalizeItem({ ...it, qno: String(startQno + i), type }, startQno + i - 1, kpNames, type)
    ),
  };
}

/**
 * 按教师填写的四题型题量生成试卷
 * composition: { choice, fill, judge, essay }
 */
export async function generateQuizPaper({
  title,
  kpNames = ['函数单调性'],
  difficulty = '中等',
  classContext = '高一',
  composition: compositionIn,
  count, // 兼容旧字段
  choiceCount,
  fillCount,
  judgeCount,
  essayCount,
} = {}) {
  const { composition, total } = normalizeComposition({
    composition: compositionIn,
    count,
    choiceCount,
    fillCount,
    judgeCount,
    essayCount,
  });

  const order = ['choice', 'fill', 'judge', 'essay'];
  const allItems = [];
  let paperTitle = title || '课堂在线测验';
  let timeLimitMin = Math.max(20, Math.round(total * 3));
  let start = 1;
  const errors = [];
  let aiUnavailable = false;

  try {
    for (const type of order) {
      const need = composition[type] || 0;
      if (need <= 0) continue;
      // 大题量分批，每批最多 8 题
      let left = need;
      while (left > 0) {
        const batch = Math.min(8, left);
        if (aiUnavailable) {
          const fb = fallbackByType(type, left, kpNames, start);
          allItems.push(...fb);
          start += fb.length;
          left = 0;
          continue;
        }
        try {
          const chunk = await generateTypeChunk({
            title,
            kpNames,
            type,
            count: batch,
            difficulty,
            classContext,
            startQno: start,
          });
          if (chunk.title) paperTitle = chunk.title;
          if (chunk.timeLimitMin) timeLimitMin = chunk.timeLimitMin;
          allItems.push(...chunk.items);
          start += chunk.items.length;
          left -= chunk.items.length;
          if (!chunk.items.length) {
            // AI 返回空，用题库补本批
            const fb = fallbackByType(type, batch, kpNames, start);
            allItems.push(...fb);
            start += fb.length;
            left -= batch;
          }
        } catch (e) {
          errors.push(`${typeLabel(type)}: ${e.message}`);
          if (e.code === 'AI_TIMEOUT' || e.code === 'AI_NETWORK_ERROR') aiUnavailable = true;
          const fb = fallbackByType(type, left, kpNames, start);
          allItems.push(...fb);
          start += fb.length;
          left = 0;
        }
      }
    }

    const items = allItems.map((it, i) => ({
      ...it,
      qno: String(i + 1),
      id: `q${i + 1}`,
    }));

    return {
      title: paperTitle || title || '课堂在线测验',
      subject: '高中数学',
      timeLimitMin,
      totalScore: items.reduce((s, q) => s + (q.score || 0), 0),
      items,
      composition,
      source: errors.length >= order.filter((t) => composition[t] > 0).length ? 'template' : errors.length ? 'mixed' : 'ai',
      fallbackError: errors.length ? errors.join('；') : undefined,
    };
  } catch (e) {
    // 整卷失败：按 composition 用题库
    const items = [];
    let q = 1;
    for (const type of order) {
      const n = composition[type] || 0;
      if (!n) continue;
      items.push(...fallbackByType(type, n, kpNames, q));
      q += n;
    }
    const renumbered = items.map((it, i) => ({ ...it, qno: String(i + 1), id: `q${i + 1}` }));
    return {
      title: title || '课堂在线测验',
      subject: '高中数学',
      timeLimitMin: Math.max(20, Math.round(total * 3)),
      totalScore: renumbered.reduce((s, x) => s + x.score, 0),
      items: renumbered,
      composition,
      source: 'template',
      fallbackError: e.message,
    };
  }
}

export function createQuiz({ classId, paper, publish = false }) {
  if (!classId || !paper?.items?.length) {
    throw Object.assign(new Error('缺少班级或题目'), { status: 400 });
  }
  const id = uuid();
  const now = new Date().toISOString();
  const quiz = {
    id,
    class_id: classId,
    title: paper.title || '课堂在线测验',
    subject: paper.subject || '高中数学',
    time_limit_min: paper.timeLimitMin || 20,
    total_score: paper.totalScore || paper.items.reduce((s, q) => s + (q.score || 10), 0),
    items_json: JSON.stringify(paper.items),
    composition_json: JSON.stringify(paper.composition || null),
    source: paper.source || 'ai',
    status: publish ? 'published' : 'draft',
    created_at: now,
    published_at: publish ? now : null,
  };
  db.insert('quizzes', quiz);

  if (publish) {
    publishQuiz(id);
  }
  return sanitizeQuiz(quiz, { withAnswer: true });
}

export function publishQuiz(quizId) {
  const quiz = db.find('quizzes', (q) => q.id === quizId);
  if (!quiz) throw Object.assign(new Error('测验不存在'), { status: 404 });
  const now = new Date().toISOString();
  db.update(
    'quizzes',
    (q) => q.id === quizId,
    { status: 'published', published_at: now }
  );

  const students = getClassStudents(quiz.class_id);
  for (const s of students) {
    db.insert('notifications', {
      id: uuid(),
      audience: 'student',
      user_id: s.id,
      class_id: quiz.class_id,
      title: '新的在线测验',
      body: `「${quiz.title}」已发布，请及时完成。系统将自动评分并分析错因。`,
      link: '/student/quiz',
      is_read: 0,
      created_at: now,
    });
  }
  return sanitizeQuiz(db.find('quizzes', (q) => q.id === quizId), { withAnswer: true });
}

function parseItems(quiz) {
  return typeof quiz.items_json === 'string' ? JSON.parse(quiz.items_json) : quiz.items_json || [];
}

function parseComposition(quiz) {
  if (!quiz.composition_json) return null;
  try {
    return typeof quiz.composition_json === 'string'
      ? JSON.parse(quiz.composition_json)
      : quiz.composition_json;
  } catch {
    return null;
  }
}

export function sanitizeQuiz(quiz, { withAnswer = false } = {}) {
  if (!quiz) return null;
  const items = parseItems(quiz).map((it) => {
    if (withAnswer) return it;
    return {
      id: it.id,
      qno: it.qno,
      type: it.type,
      stem: it.stem,
      options: (it.options || []).map((o) => ({ key: o.key, text: o.text })),
      score: it.score,
      kp: it.kp,
      autoGrade: it.autoGrade !== false && it.type !== 'essay',
    };
  });
  return {
    id: quiz.id,
    class_id: quiz.class_id,
    title: quiz.title,
    subject: quiz.subject,
    timeLimitMin: quiz.time_limit_min,
    totalScore: quiz.total_score,
    status: quiz.status,
    source: quiz.source,
    composition: parseComposition(quiz),
    created_at: quiz.created_at,
    published_at: quiz.published_at,
    items,
  };
}

export function listQuizzes(classId) {
  return db
    .filter('quizzes', (q) => q.class_id === classId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((q) => {
      const attempts = db.filter('quiz_attempts', (a) => a.quiz_id === q.id && a.status === 'submitted');
      return {
        ...sanitizeQuiz(q, { withAnswer: true }),
        attemptCount: attempts.length,
        avgScore:
          attempts.length
            ? Math.round((attempts.reduce((s, a) => s + (a.score || 0), 0) / attempts.length) * 10) / 10
            : null,
      };
    });
}

export function listPublishedForStudent(studentId) {
  const stu = db.find('students', (s) => s.id === studentId);
  if (!stu) return [];
  const quizzes = db
    .filter('quizzes', (q) => q.class_id === stu.class_id && q.status === 'published')
    .sort((a, b) => String(b.published_at || b.created_at).localeCompare(String(a.published_at || a.created_at)));

  return quizzes.map((q) => {
    const attempt = db
      .filter('quiz_attempts', (a) => a.quiz_id === q.id && a.student_id === studentId)
      .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')))[0];
    return {
      ...sanitizeQuiz(q, { withAnswer: false }),
      myAttempt: attempt
        ? {
            id: attempt.id,
            status: attempt.status,
            score: attempt.score,
            maxScore: attempt.max_score,
            submitted_at: attempt.submitted_at,
          }
        : null,
    };
  });
}

export function getQuizForStudent(quizId, studentId) {
  const quiz = db.find('quizzes', (q) => q.id === quizId);
  if (!quiz || quiz.status !== 'published') {
    throw Object.assign(new Error('测验未发布或不存在'), { status: 404 });
  }
  const stu = db.find('students', (s) => s.id === studentId);
  if (!stu || stu.class_id !== quiz.class_id) {
    throw Object.assign(new Error('无权参加该测验'), { status: 403 });
  }
  const attempt = db.find(
    'quiz_attempts',
    (a) => a.quiz_id === quizId && a.student_id === studentId && a.status === 'submitted'
  );
  return {
    quiz: sanitizeQuiz(quiz, { withAnswer: Boolean(attempt) }),
    attempt: attempt
      ? {
          ...attempt,
          detail: typeof attempt.detail_json === 'string' ? JSON.parse(attempt.detail_json) : attempt.detail_json,
        }
      : null,
  };
}

/**
 * 自动评测：
 * - 选择/判断/填空：对照标准答案 + 选项 errorType
 * - 解答题：先按参考答案关键词粗判，并标记 pendingReview 供教师复核
 */
export function submitAttempt(quizId, studentId, answers = {}) {
  const quiz = db.find('quizzes', (q) => q.id === quizId);
  if (!quiz || quiz.status !== 'published') {
    throw Object.assign(new Error('测验未发布或不存在'), { status: 404 });
  }
  const stu = db.find('students', (s) => s.id === studentId);
  if (!stu || stu.class_id !== quiz.class_id) {
    throw Object.assign(new Error('无权提交'), { status: 403 });
  }

  const existing = db.find(
    'quiz_attempts',
    (a) => a.quiz_id === quizId && a.student_id === studentId && a.status === 'submitted'
  );
  if (existing) {
    throw Object.assign(new Error('已提交，不可重复作答'), { status: 400 });
  }

  const items = parseItems(quiz);
  let score = 0;
  let maxScore = 0;
  const detail = [];

  for (const it of items) {
    const qScore = Number(it.score) || 10;
    maxScore += qScore;
    const key = it.id || it.qno;
    const yours = answers[key] ?? answers[it.qno] ?? answers[String(it.qno)];
    let correct = false;
    let got = 0;
    let errorType = null;
    let pendingReview = false;

    if (it.type === 'essay') {
      pendingReview = true;
      const text = String(yours ?? '').trim();
      if (!text) {
        correct = false;
        errorType = '表达';
        got = 0;
      } else {
        // 粗匹配：参考答案关键词命中比例 → 预评分（教师可改）
        const ref = String(it.answer || '');
        const tokens = ref
          .split(/[\s,，；;。、：:（）()]+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 1);
        const hit = tokens.filter((t) => text.includes(t)).length;
        const ratio = tokens.length ? hit / tokens.length : 0.5;
        if (ratio >= 0.55) {
          correct = true;
          got = qScore;
        } else if (ratio >= 0.25) {
          correct = false;
          got = Math.round(qScore * 0.5 * 10) / 10;
          errorType = it.commonError || '方法';
        } else {
          correct = false;
          got = Math.round(qScore * 0.2 * 10) / 10;
          errorType = it.commonError || '方法';
        }
      }
    } else if (it.type === 'judge' || it.type === 'choice') {
      correct = answersEqual(yours, it.answer);
      if (!correct) {
        const opt = (it.options || []).find(
          (o) => answersEqual(o.key, yours) || answersEqual(o.text, yours)
        );
        errorType = opt?.errorType || it.commonError || '概念';
        if (!ERROR_TYPES.includes(errorType)) errorType = '概念';
      } else {
        got = qScore;
      }
    } else {
      // fill
      correct = answersEqual(yours, it.answer);
      if (!correct) {
        errorType = it.commonError || '计算';
        if (!ERROR_TYPES.includes(errorType)) errorType = '计算';
      } else {
        got = qScore;
      }
    }

    score += got;

    detail.push({
      qid: key,
      qno: it.qno,
      type: it.type,
      stem: it.stem,
      kp: it.kp,
      yours: yours ?? '',
      answer: it.answer,
      correct,
      score: got,
      maxScore: qScore,
      errorType: correct ? null : errorType,
      analysis: it.analysis || '',
      pendingReview,
    });
  }

  const now = new Date().toISOString();
  const attempt = {
    id: uuid(),
    quiz_id: quizId,
    student_id: studentId,
    class_id: quiz.class_id,
    answers_json: JSON.stringify(answers || {}),
    detail_json: JSON.stringify(detail),
    score: Math.round(score * 10) / 10,
    max_score: maxScore,
    status: 'submitted',
    submitted_at: now,
  };
  db.insert('quiz_attempts', attempt);

  // 错题本（与 grading 共用 error_records）
  for (const d of detail) {
    if (d.correct) continue;
    const exists = db.find(
      'error_records',
      (e) =>
        e.student_id === studentId &&
        e.source === `在线测验·${quiz.title}` &&
        e.question?.includes(`第${d.qno}题`)
    );
    if (exists) continue;
    db.insert('error_records', {
      id: uuid(),
      student_id: studentId,
      class_id: quiz.class_id,
      kp_name: d.kp,
      question: `第${d.qno}题 · ${d.kp || ''} · ${String(d.stem || '').slice(0, 80)}`,
      wrong_answer: String(d.yours ?? ''),
      correct_answer: String(d.answer ?? ''),
      error_type: d.errorType || '概念',
      source: `在线测验·${quiz.title}`,
      created_at: now,
    });
  }

  db.insert('notifications', {
    id: uuid(),
    audience: 'student',
    user_id: studentId,
    class_id: quiz.class_id,
    title: '测验已自动评分',
    body: `「${quiz.title}」得分 ${attempt.score}/${attempt.max_score}。含解答题时为预评分，教师可复核。`,
    link: '/student/quiz',
    is_read: 0,
    created_at: now,
  });

  return {
    id: attempt.id,
    score: attempt.score,
    maxScore: attempt.max_score,
    detail,
    hasEssayPending: detail.some((d) => d.pendingReview),
  };
}

/**
 * 从真实作答生成批改报告（summary 结构与 grading 页兼容）
 */
export function buildReportFromQuiz(quizId, { examName } = {}) {
  const quiz = db.find('quizzes', (q) => q.id === quizId);
  if (!quiz) throw Object.assign(new Error('测验不存在'), { status: 404 });
  const students = getClassStudents(quiz.class_id);
  const attempts = db.filter(
    'quiz_attempts',
    (a) => a.quiz_id === quizId && a.status === 'submitted'
  );
  const items = parseItems(quiz);

  const errorCount = Object.fromEntries(ERROR_TYPES.map((t) => [t, 0]));
  const wrongByQ = new Map(); // qno -> count
  const errorDistByQ = new Map(); // qno -> {type: n}
  const studentRows = [];

  for (const stu of students) {
    const att = attempts.find((a) => a.student_id === stu.id);
    if (!att) continue; // 未交不进名单（与导入批改一致可看提交的）
    const detail =
      typeof att.detail_json === 'string' ? JSON.parse(att.detail_json) : att.detail_json || [];
    const wrong = [];
    for (const d of detail) {
      if (d.correct) continue;
      const t = d.errorType || '概念';
      errorCount[t] = (errorCount[t] || 0) + 1;
      wrongByQ.set(String(d.qno), (wrongByQ.get(String(d.qno)) || 0) + 1);
      if (!errorDistByQ.has(String(d.qno))) errorDistByQ.set(String(d.qno), {});
      const dist = errorDistByQ.get(String(d.qno));
      dist[t] = (dist[t] || 0) + 1;
      wrong.push({
        qno: d.qno,
        kp: d.kp,
        type: d.type,
        errorType: t,
        yours: d.yours,
        answer: d.answer,
        score: d.score,
        maxScore: d.maxScore,
        pendingReview: d.pendingReview,
      });
    }
    const maxScore = att.max_score || quiz.total_score;
    studentRows.push({
      studentId: stu.id,
      name: stu.name,
      score: att.score,
      maxScore,
      rate: maxScore ? Math.round((att.score / maxScore) * 100) : null,
      wrong,
      comment: '',
    });
  }

  const totalStudents = students.length || 1;
  const submitted = attempts.length;
  const avgScore =
    submitted
      ? Math.round(
          (attempts.reduce((s, a) => s + (a.score || 0), 0) / submitted) * 10
        ) / 10
      : 0;
  const totalPossible = attempts.reduce((s, a) => s + (a.max_score || 0), 0) || 1;
  const totalGot = attempts.reduce((s, a) => s + (a.score || 0), 0);
  const accuracy = totalPossible ? totalGot / totalPossible : 0;

  const itemStats = items.map((it) => {
    const qno = String(it.qno);
    const wrongCount = wrongByQ.get(qno) || 0;
    const base = submitted || 1;
    return {
      qno: it.qno,
      type: it.type,
      stem: it.stem,
      kp: it.kp,
      wrongCount,
      correctRate: Math.round(((base - wrongCount) / base) * 100),
      errorDist: errorDistByQ.get(qno) || {},
    };
  });

  const typical = [...wrongByQ.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([qno, count]) => {
      const it = items.find((x) => String(x.qno) === String(qno));
      const dist = errorDistByQ.get(String(qno)) || {};
      const topErr = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];
      return {
        qno,
        kp: it?.kp || '',
        wrongCount: count,
        tip: it?.analysis
          ? String(it.analysis).slice(0, 80)
          : `本题错误 ${count} 人次，常见错因：${topErr?.[0] || it?.commonError || '概念'}`,
      };
    });

  const summary = {
    source: 'online_quiz',
    examName: examName || quiz.title,
    submitRate: totalStudents ? submitted / totalStudents : 0,
    submitted,
    totalStudents: students.length,
    avgScore,
    accuracy,
    errorTypes: ERROR_TYPES.map((type) => ({ type, count: errorCount[type] || 0 })),
    itemStats,
    typical,
    composition: parseComposition(quiz),
    students: studentRows,
  };

  const reportId = uuid();
  const now = new Date().toISOString();
  db.insert('grading_reports', {
    id: reportId,
    class_id: quiz.class_id,
    quiz_id: quizId,
    exam_id: null,
    title: `批改报告 · ${quiz.title}`,
    status: 'published',
    summary_json: JSON.stringify(summary),
    created_at: now,
  });

  return {
    id: reportId,
    class_id: quiz.class_id,
    quiz_id: quizId,
    title: `批改报告 · ${quiz.title}`,
    created_at: now,
    summary,
  };
}
