/**
 * 轻量 JSON 文件数据库（无原生编译依赖，适合 Windows 演示）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'zhixueban.json');

const empty = () => ({
  classes: [],
  students: [],
  teachers: [],
  accounts: [],
  auth_sessions: [],
  knowledge_points: [],
  exams: [],
  exam_questions: [],
  exam_scores: [],
  resource_sheets: [],
  homework_pushes: [],
  homework_submissions: [],
  grading_reports: [],
  error_records: [],
  daily_practices: [],
  growth_events: [],
  notifications: [],
  // 在线测验闭环：出卷 → 作答 → 自动评测 → 错因
  quizzes: [],
  quiz_attempts: [],
  meta: [],
});

function load() {
  if (!fs.existsSync(dbPath)) return empty();
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(dbPath, 'utf8')) };
  } catch {
    return empty();
  }
}

function save(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

let store = load();

export const db = {
  path: dbPath,
  raw() {
    return store;
  },
  reload() {
    store = load();
    return store;
  },
  persist() {
    save(store);
  },
  reset() {
    store = empty();
    save(store);
  },
  table(name) {
    if (!store[name]) store[name] = [];
    return store[name];
  },
  find(name, pred) {
    return this.table(name).find(pred);
  },
  filter(name, pred) {
    return this.table(name).filter(pred);
  },
  insert(name, row) {
    this.table(name).push(row);
    this.persist();
    return row;
  },
  insertMany(name, rows) {
    this.table(name).push(...rows);
    this.persist();
  },
  update(name, pred, patch) {
    const rows = this.table(name);
    let n = 0;
    for (let i = 0; i < rows.length; i++) {
      if (pred(rows[i])) {
        rows[i] = { ...rows[i], ...patch };
        n++;
      }
    }
    if (n) this.persist();
    return n;
  },
  remove(name, pred) {
    const before = this.table(name).length;
    store[name] = this.table(name).filter((r) => !pred(r));
    if (store[name].length !== before) this.persist();
  },
  clearAll() {
    this.reset();
  },
  setMeta(key, value) {
    const rows = this.table('meta');
    const i = rows.findIndex((r) => r.key === key);
    if (i >= 0) rows[i].value = value;
    else rows.push({ key, value });
    this.persist();
  },
  getMeta(key) {
    return this.table('meta').find((r) => r.key === key)?.value;
  },
  allMeta() {
    return Object.fromEntries(this.table('meta').map((r) => [r.key, r.value]));
  },
};

export function initSchema() {
  // JSON 库无需建表；确保文件存在
  if (!fs.existsSync(dbPath)) save(empty());
  store = load();
}
