import { createHash, randomBytes, randomUUID as uuid, scryptSync, timingSafeEqual } from 'crypto';
import { db } from '../db.js';

function normalizeAccount(value) {
  return String(value || '').trim().toLowerCase();
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function matchesPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(String(password), salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicAccount(account) {
  return {
    id: account.id,
    role: account.role,
    name: account.name,
    account: account.account,
    studentId: account.student_id || null,
    teacherId: account.teacher_id || null,
    classId: account.class_id || null,
  };
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createSession(account) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  db.remove('auth_sessions', (session) => new Date(session.expires_at).getTime() <= Date.now());
  db.insert('auth_sessions', {
    id: uuid(),
    token_hash: hashToken(token),
    account_id: account.id,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  });
  return { token, expiresAt };
}

function authPayload(account) {
  return { ...publicAccount(account), ...createSession(account) };
}

export function registerAccount({ role, name, account, password } = {}) {
  if (!['teacher', 'student'].includes(role)) fail('请选择教师或学生身份');
  const cleanName = String(name || '').trim();
  const cleanAccount = normalizeAccount(account);
  if (!cleanName) fail('请填写姓名');
  if (!cleanAccount) fail(role === 'teacher' ? '请填写教工号' : '请填写学号');
  if (String(password || '').length < 6) fail('密码至少需要 6 位');
  if (db.find('accounts', (item) => item.account === cleanAccount)) {
    fail('该账号已注册，请直接登录', 409);
  }

  const id = uuid();
  const now = new Date().toISOString();
  const row = {
    id,
    role,
    name: cleanName,
    account: cleanAccount,
    password_hash: hashPassword(password),
    created_at: now,
  };

  if (role === 'student') {
    const classId = db.getMeta('demo_class_id');
    if (!classId) fail('系统班级尚未初始化，请先运行 seed', 500);
    const studentId = uuid();
    row.student_id = studentId;
    row.class_id = classId;
    db.insert('students', {
      id: studentId,
      class_id: classId,
      student_no: cleanAccount,
      name: cleanName,
      layer: 'B',
      is_monitor: 0,
    });
  } else {
    const teacherId = uuid();
    const classId = uuid();
    row.teacher_id = teacherId;
    row.class_id = classId;
    db.insert('teachers', { id: teacherId, name: cleanName, account: cleanAccount });
    db.insert('classes', {
      id: classId,
      teacher_id: teacherId,
      name: `${cleanName}的数学班`,
      grade: '高一',
      subject: '高中数学',
      created_at: now,
    });
  }

  db.insert('accounts', row);
  return authPayload(row);
}

export function loginAccount({ role, account, password } = {}) {
  if (!['teacher', 'student'].includes(role)) fail('请选择教师或学生身份');
  const cleanAccount = normalizeAccount(account);
  const row = db.find(
    'accounts',
    (item) => item.role === role && item.account === cleanAccount
  );
  if (!row || !matchesPassword(password, row.password_hash)) {
    fail('账号或密码不正确', 401);
  }
  return authPayload(row);
}

export function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: '未登录或会话已失效' });
  const session = db.find(
    'auth_sessions',
    (item) => item.token_hash === hashToken(token) && new Date(item.expires_at).getTime() > Date.now()
  );
  const account = session && db.find('accounts', (item) => item.id === session.account_id);
  if (!account) return res.status(401).json({ error: '未登录或会话已失效' });
  req.auth = publicAccount(account);
  next();
}
