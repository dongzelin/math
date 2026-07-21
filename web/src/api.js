const BASE = '/api';

async function req(path, options = {}) {
  const token = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('zhixueban_session') || 'null')?.token;
    } catch {
      return null;
    }
  })();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || '请求失败');
  return data;
}

export const api = {
  health: () => req('/health'),
  aiStatus: () => req('/ai/status'),
  demoMeta: () => req('/meta/demo'),
  login: (body) => req('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) => req('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  classes: () => req('/classes'),
  createClass: (body) => req('/classes', { method: 'POST', body: JSON.stringify(body) }),
  students: (classId) => req(`/classes/${classId}/students`),
  addStudent: (classId, body) =>
    req(`/classes/${classId}/students`, { method: 'POST', body: JSON.stringify(body) }),
  recomputeLayers: (classId) =>
    req(`/classes/${classId}/recompute-layers`, { method: 'POST', body: '{}' }),
  diagnosis: (classId) => req(`/classes/${classId}/diagnosis`),
  profile: (studentId) => req(`/students/${studentId}/profile`),
  setLayer: (studentId, layer) =>
    req(`/students/${studentId}/layer`, { method: 'PATCH', body: JSON.stringify({ layer }) }),
  genSheet: (body) => req('/ai/layered-sheet', { method: 'POST', body: JSON.stringify(body) }),
  refineSheet: (body) => req('/ai/refine-sheet', { method: 'POST', body: JSON.stringify(body) }),
  saveSheet: (body) => req('/resource-sheets', { method: 'POST', body: JSON.stringify(body) }),
  pushHomework: (body) => req('/homework/push', { method: 'POST', body: JSON.stringify(body) }),
  studentHomework: (studentId) => req(`/students/${studentId}/homework`),
  submitHomework: (id, answers) =>
    req(`/homework/submissions/${id}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }),

  // 在线测验闭环
  genQuizPaper: (body) => req('/ai/quiz-paper', { method: 'POST', body: JSON.stringify(body || {}) }),
  quizzes: (classId) => req(`/classes/${classId}/quizzes`),
  createQuiz: (classId, body) =>
    req(`/classes/${classId}/quizzes`, { method: 'POST', body: JSON.stringify(body || {}) }),
  publishQuiz: (quizId) => req(`/quizzes/${quizId}/publish`, { method: 'POST', body: '{}' }),
  quizReport: (quizId, body) =>
    req(`/quizzes/${quizId}/report`, { method: 'POST', body: JSON.stringify(body || {}) }),
  studentQuizzes: (studentId) => req(`/students/${studentId}/quizzes`),
  studentQuiz: (studentId, quizId) => req(`/students/${studentId}/quizzes/${quizId}`),
  submitQuiz: (studentId, quizId, answers) =>
    req(`/students/${studentId}/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  // 批改报告
  exams: (classId) => req(`/classes/${classId}/exams`),
  grading: (classId) => req(`/classes/${classId}/grading`),
  gradingReport: (reportId) => req(`/grading/${reportId}`),
  gradeFromExam: (classId, body) =>
    req(`/classes/${classId}/grading/from-exam`, { method: 'POST', body: JSON.stringify(body || {}) }),
  gradeImportCsv: (classId, body) =>
    req(`/classes/${classId}/grading/import-csv`, { method: 'POST', body: JSON.stringify(body) }),
  writeComment: (reportId, body) =>
    req(`/grading/${reportId}/comment`, { method: 'POST', body: JSON.stringify(body) }),
  batchComments: (reportId) =>
    req(`/grading/${reportId}/comments/batch`, { method: 'POST', body: '{}' }),

  comment: (body) => req('/ai/comment', { method: 'POST', body: JSON.stringify(body) }),
  diagnosisText: (body) =>
    req('/ai/diagnosis-text', { method: 'POST', body: JSON.stringify(body) }),
  errors: (studentId) => req(`/students/${studentId}/errors`),
  daily: (studentId) => req(`/students/${studentId}/daily`),
  submitDaily: (studentId, answers) =>
    req(`/students/${studentId}/daily/submit`, { method: 'POST', body: JSON.stringify({ answers }) }),
  notifications: (q) => {
    const qs = new URLSearchParams(q).toString();
    return req(`/notifications?${qs}`);
  },
  readNoti: (id) => req(`/notifications/${id}/read`, { method: 'POST', body: '{}' }),
};
