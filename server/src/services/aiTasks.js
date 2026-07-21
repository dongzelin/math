import { chatJson, chatCompletion } from '../ai/client.js';

const FALLBACK_SHEET = (kpName, lessonType) => ({
  kpName,
  lessonType: lessonType || '巩固练',
  goal: `围绕「${kpName}」分层巩固：A 拔高、B 达标、C 补基。`,
  layers: {
    A: {
      label: 'A 档 · 拔高',
      items: [
        {
          stem: `【A1】已知与「${kpName}」相关的综合题：请写出关键步骤与结论。`,
          answer: '（模板）先明确定义与条件，再分类讨论或构造函数求解。',
          difficulty: '难',
          kp: kpName,
        },
        {
          stem: `【A2】拓展：将「${kpName}」与已学模块综合应用一题。`,
          answer: '（模板）建立模型 → 转化 → 求解 → 检验。',
          difficulty: '难',
          kp: kpName,
        },
      ],
    },
    B: {
      label: 'B 档 · 达标',
      items: [
        {
          stem: `【B1】关于「${kpName}」的基础巩固题（选择/填空）。`,
          answer: '（模板）对照定义与基本性质作答。',
          difficulty: '中',
          kp: kpName,
        },
        {
          stem: `【B2】「${kpName}」常见题型变式一题。`,
          answer: '（模板）注意边界条件与常见陷阱。',
          difficulty: '中',
          kp: kpName,
        },
        {
          stem: `【B3】小结：用自己的话说明「${kpName}」的核心要点。`,
          answer: '（模板）定义 + 判定 + 典型应用。',
          difficulty: '中',
          kp: kpName,
        },
      ],
    },
    C: {
      label: 'C 档 · 补基',
      items: [
        {
          stem: `【C1】「${kpName}」概念填空/判断题。`,
          answer: '（模板）回顾课本定义。',
          difficulty: '易',
          kp: kpName,
        },
        {
          stem: `【C2】「${kpName}」模仿例题完成计算。`,
          answer: '（模板）逐步对照例题格式。',
          difficulty: '易',
          kp: kpName,
        },
      ],
    },
  },
  source: 'fallback',
});

export async function generateLayeredSheet({ kpName, lessonType, classContext }) {
  const system = `你是高中数学备课助手。请严格输出 JSON，不要 markdown。
结构：
{
  "kpName": string,
  "lessonType": string,
  "goal": string,
  "layers": {
    "A": { "label": string, "items": [ {"stem":string,"answer":string,"difficulty":"难|中|易","kp":string} ] },
    "B": { "label": string, "items": [ ... ] },
    "C": { "label": string, "items": [ ... ] }
  }
}
要求：A 档 2 题偏综合，B 档 3 题达标，C 档 2 题补基；题干具体可做，答案给要点；学科=高中数学。`;

  const user = `知识点：${kpName}
课型：${lessonType || '巩固练'}
班级背景：${classContext || '高一普通班，月考后补弱'}
请生成三档练习。`;

  try {
    const { data } = await chatJson(system, user, { temperature: 0.55 });
    if (!data?.layers?.A?.items?.length) throw new Error('结构不完整');
    data.source = 'ai';
    data.kpName = data.kpName || kpName;
    return { ok: true, sheet: data, fallback: false };
  } catch (e) {
    return {
      ok: true,
      sheet: FALLBACK_SHEET(kpName, lessonType),
      fallback: true,
      error: e.message,
    };
  }
}

export async function refineSheet({ sheet, instruction }) {
  const system = `你是高中数学分层练习编辑器。根据教师短指令修改 JSON 练习卷，保持原结构，只改需要改的部分。输出完整 JSON（同原结构）。`;
  const user = `原练习：\n${JSON.stringify(sheet)}\n\n教师指令：${instruction}\n请返回修改后的完整 JSON。`;
  try {
    const { data } = await chatJson(system, user, { temperature: 0.4 });
    data.source = 'ai-refine';
    return { ok: true, sheet: data, fallback: false };
  } catch (e) {
    // 简单规则微调
    const next = JSON.parse(JSON.stringify(sheet));
    if (/加\s*2|再加.*2|多两道/.test(instruction) && next.layers?.C) {
      next.layers.C.items.push({
        stem: `【C补】补充基础题：${next.kpName || ''} 概念再练一题。`,
        answer: '略',
        difficulty: '易',
        kp: next.kpName,
      });
      next.layers.C.items.push({
        stem: `【C补2】补充计算题：按例题格式完成。`,
        answer: '略',
        difficulty: '易',
        kp: next.kpName,
      });
    }
    next.source = 'rule-refine';
    return { ok: true, sheet: next, fallback: true, error: e.message };
  }
}

export async function generateComment({ studentName, weakPoints, wrongSummary }) {
  const system = `你是高中数学教师。用 80-120 字写一段中文评语：先肯定，再指出 1-2 个薄弱点，给可执行建议。不要列表，不要 markdown。`;
  const user = `学生：${studentName}\n薄弱：${(weakPoints || []).join('、') || '综合'}\n错题摘要：${wrongSummary || '略'}`;
  try {
    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.5,
    });
    return { ok: true, comment: content.trim(), fallback: false };
  } catch (e) {
    const w = (weakPoints || []).slice(0, 2).join('、') || '部分知识点';
    return {
      ok: true,
      comment: `${studentName}同学近期学习态度认真。目前在「${w}」上仍有提升空间，建议每天用 15 分钟回顾错题并做 1–2 道变式，逐步巩固方法。继续加油！`,
      fallback: true,
      error: e.message,
    };
  }
}

export async function generateDiagnosisText({ studentName, layer, weak, trendNote }) {
  const system = `你是高中数学学情分析助手。输出 100-150 字中文诊断结论（单段，非对话）。含：当前档位解读、主要薄弱、下一周行动建议。`;
  const user = `学生：${studentName}；分层：${layer}；薄弱：${JSON.stringify(weak || [])}；趋势：${trendNote || '平稳'}`;
  try {
    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.45,
    });
    return { ok: true, text: content.trim(), fallback: false };
  } catch (e) {
    const top = (weak || []).slice(0, 2).map((x) => x.name || x).join('、') || '若干模块';
    return {
      ok: true,
      text: `${studentName}当前处于 ${layer} 档。近期主要薄弱集中在「${top}」。建议先过概念再练中档题，配合每日练打卡；教师可优先推送对应知识点的 B/C 档巩固练习。${trendNote || ''}`,
      fallback: true,
      error: e.message,
    };
  }
}

export function buildDailyItems(weakList) {
  const picks = (weakList || []).slice(0, 3);
  if (!picks.length) {
    return [
      {
        id: 'd1',
        stem: '若 f(x)=x² 在 [0,2] 上，则 f(x) 的最小值是？',
        type: 'choice',
        options: ['0', '1', '2', '4'],
        answer: '0',
        kp: '函数',
      },
    ];
  }
  return picks.map((w, i) => {
    const name = w.name || w.kp || '函数';
    return {
      id: `d${i + 1}`,
      stem: `【每日练】与「${name}」相关：下列说法正确的是？`,
      type: 'choice',
      options: [
        `${name}只需记忆结论无需条件`,
        `${name}要先明确定义域/适用条件再讨论`,
        `${name}与图像无关`,
        `${name}不需要检验特殊值`,
      ],
      answer: `${name}要先明确定义域/适用条件再讨论`,
      kp: name,
    };
  });
}
