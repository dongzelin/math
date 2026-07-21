# 智学伴 AB 版 · 技术架构

> **版本**：v1.0 · 2026-07-20  
> **依据**：`智学伴_功能大纲_AB版.md` + `智学伴_原型v3.html`  
> **目标**：一天内跑通主演示路径；务实可扩展，不做 C 类与全局 AI 聊天  

---

## 0. 目标与约束

| 项 | 决策 |
|----|------|
| 产品范围 | A+B：诊断 → 分层练习 → 推送 → 批改 → 档案/错题/每日练/通知闭环 |
| 不做 | 全局 AI 对话、学生 AI 学伴、OCR 深水区、图谱/K-Means、微信通知、多校 SaaS |
| 演示身份 | **角色切换**（教师 张老师 / 学生 李明），无 JWT/OAuth |
| 学科 | 钉死高中数学（示范班数据） |
| UI | 蓝主色，贴近 v3 卡片/顶栏/师生切换 |

---

## 1. 技术选型

```
zhixueban/                 # monorepo（无 workspace 工具亦可，两包并行）
├── server/                # Express + better-sqlite3
├── web/                   # Vite + React + 原生 CSS（变量对齐 v3）
└── docs/
```

| 层 | 选型 | 理由 |
|----|------|------|
| API | Express (Node 20+) | 轻、一天可出 REST |
| 持久化 | **better-sqlite3** | 单文件、同步易写、适合演示；JSON 作 seed 导入 |
| 前端 | Vite + React 18 | 组件化对照 v3 页；原生 CSS 不引入 UI 库 |
| AI | OpenAI-compatible `POST /v1/chat/completions` | 读本机 Codex 配置；失败模板降级 |
| 部署演示 | 本地双进程：API `:3001` + Vite `:5173`（proxy `/api`） | 零运维 |

**权衡**

- **SQLite vs JSON 文件**：选 SQLite——作业/批改/通知有关系查询；JSON 仅作 `seed` 初始数据。
- **SSR vs SPA**：选 SPA——角色切换与多页状态更顺；首屏可接受。
- **不引入 ORM**：手写 SQL + 薄 repository，控制体积与调试成本。
- **扩展位**：表结构预留 `class_id`；日后可换 Postgres 而不改 REST 契约。

---

## 2. 目录结构

```
zhixueban/
├── docs/
│   └── ARCHITECTURE.md
├── package.json                 # 可选：scripts 聚合 dev
├── .env.example                 # 根或 server/.env.example
├── server/
│   ├── package.json
│   ├── .env                     # 本地（不入库）
│   ├── data/
│   │   ├── zhixueban.db         # 运行时 SQLite（gitignore）
│   │   └── seed/                # 演示 JSON / SQL
│   └── src/
│       ├── index.js             # 启动、中间件、挂载路由
│       ├── config.js            # 环境变量 + AI 配置合并结果
│       ├── db/
│       │   ├── index.js         # better-sqlite3 连接
│       │   ├── schema.sql
│       │   └── seed.js
│       ├── middleware/
│       │   └── demoUser.js      # 读 Header X-Demo-Role / X-Demo-User-Id
│       ├── routes/
│       │   ├── classes.js
│       │   ├── students.js
│       │   ├── exams.js
│       │   ├── diagnosis.js     # 热力/Top5/趋势/分层概览
│       │   ├── layers.js
│       │   ├── homework.js
│       │   ├── grading.js
│       │   ├── errorbook.js
│       │   ├── daily.js
│       │   ├── notifications.js
│       │   ├── growth.js
│       │   └── ai.js            # 出题/评语/诊断/微调（非聊天）
│       ├── services/
│       │   ├── diagnosisService.js
│       │   ├── layerService.js
│       │   ├── homeworkService.js
│       │   ├── gradingService.js
│       │   ├── notificationService.js
│       │   └── dailyService.js
│       ├── ai/
│       │   ├── codexConfig.js   # 读 ~/.codex/config.toml + auth.json
│       │   ├── client.js        # chatCompletions + 超时/重试
│       │   ├── prompts.js       # 出题/评语/诊断/微调 prompt
│       │   └── fallbacks.js     # 本地题库/模板
│       └── utils/
│           └── respond.js
└── web/
    ├── package.json
    ├── vite.config.js           # proxy /api → :3001
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── styles/
        │   ├── tokens.css       # :root 对齐 v3 蓝主色
        │   └── app.css
        ├── api/
        │   └── client.js        # fetch 封装，附带 demo headers
        ├── context/
        │   └── SessionContext.jsx  # role + currentUser
        ├── components/
        │   ├── TopNav.jsx
        │   ├── NotifBell.jsx
        │   └── ...
        └── pages/
            ├── teacher/
            │   ├── Diagnosis.jsx      # T1
            │   ├── LayerWorkshop.jsx  # T2
            │   ├── Grading.jsx        # T3
            │   ├── ClassManage.jsx    # T4
            │   └── StudentProfile.jsx # T5
            └── student/
                ├── MyStatus.jsx       # S1
                ├── DailyPractice.jsx  # S2
                ├── HomeworkList.jsx   # S3
                ├── ErrorBook.jsx      # S4
                └── Growth.jsx         # S5
```

---

## 3. 模块划分

```
┌─────────────────────────────────────────────────────────────┐
│  web (React SPA)                                            │
│  SessionContext · TopNav · Teacher pages · Student pages    │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST /api/*
┌──────────────────────────▼──────────────────────────────────┐
│  server (Express)                                           │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ routes     │→ │ services     │→ │ db (SQLite)         │  │
│  └─────┬──────┘  └──────┬───────┘  └─────────────────────┘  │
│        │                │                                   │
│        │         ┌──────▼───────┐                           │
│        └────────►│ ai/ client   │→ OpenAI-compat API        │
│                  │ + fallbacks  │   (Codex 配置 / .env)     │
│                  └──────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

| 模块 | 职责 | 端 |
|------|------|-----|
| 会话/角色 | 演示用户切换，请求头携带身份 | 全局 |
| 班级管理 | 班级 CRUD、学生导入/名单 | 教师 |
| 学情诊断 | 成绩→热力/Top5/趋势/分层概览 | 教师 |
| 分层 | 分位规则 + 手调档位 | 教师 |
| 分层教学 | AI/模板三档练习、编辑、推送 | 教师 |
| 智能批改 | 演示批改/导入、错因、评语、入错题本 | 教师 |
| 学生档案 | 聚合展示 + 调档/推送/单次诊断文案 | 教师 |
| 通知 | 站内铃铛读写 | 双端 |
| 学生学情/作业/每日练/错题/轨迹 | 展示与提交 | 学生 |
| AI 适配 | 配置读取、调用、降级 | 服务端内部 |

---

## 4. 数据模型

### 4.1 ER 关系（逻辑）

```
Class 1──* Student
Student 1──* ExamScore          (→ Exam, QuestionMeta)
Student 1──1 LayerAssignment    (A/B/C)
Class 1──* Homework             (含 layers JSON)
Homework 1──* HomeworkSubmission
Homework 1──* Grading           (可班级级报告 + 学生级明细)
Student 1──* ErrorBook
Student 1──* DailyPractice
Student|Teacher 1──* Notification
Student 1──* GrowthEvent
```

### 4.2 表结构（SQLite）

> 主键均为 `TEXT` UUID 或固定演示 id（如 `stu_liming`），便于 seed 与演示脚本。

#### `classes`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| name | TEXT | 如「高一(3)班」 |
| grade | TEXT | 高一 |
| subject | TEXT | 数学 |
| teacher_id | TEXT | 演示教师 id |
| student_count | INTEGER | 冗余，便于列表 |
| created_at | TEXT ISO | |

#### `students`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| class_id | TEXT FK | |
| student_no | TEXT | 学号 |
| name | TEXT | |
| is_monitor | INTEGER 0/1 | 课代表标记，无独立权限 |
| avatar_label | TEXT | 展示用 |

#### `exams`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| class_id | TEXT FK | |
| name | TEXT | 如「3月月考」 |
| exam_date | TEXT | |
| total_score | REAL | |

#### `question_meta`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| exam_id | TEXT FK | |
| q_no | TEXT | 题号 |
| knowledge | TEXT | 知识点，如「函数单调性」 |
| full_score | REAL | |
| chapter | TEXT | 章节，热力用 |

#### `exam_scores`  → **ExamScore**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| exam_id | TEXT FK | |
| student_id | TEXT FK | |
| q_no | TEXT | 与 question_meta 对齐 |
| score | REAL | |
| is_correct | INTEGER | 可选，批改/导入衍生 |

#### `layer_assignments` → **Layer**
| 字段 | 类型 | 说明 |
|------|------|------|
| student_id | TEXT PK | |
| class_id | TEXT | |
| layer | TEXT | `A` \| `B` \| `C`（A 拔高 / B 巩固 / C 夯基，与 UI 色一致） |
| source | TEXT | `rule` \| `manual` |
| updated_at | TEXT | |

#### `homeworks` → **Homework**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| class_id | TEXT FK | |
| knowledge | TEXT | |
| lesson_type | TEXT | 新授/复习/讲评… |
| title | TEXT | |
| sheets_json | TEXT | `{ A:[questions], B:[], C:[] }` |
| status | TEXT | `draft` \| `pushed` |
| created_by | TEXT | |
| pushed_at | TEXT | |
| created_at | TEXT | |

`question` 元素约定：

```json
{
  "id": "q1",
  "stem": "题干…",
  "type": "choice|fill|short",
  "options": ["A.…"],
  "answer": "…",
  "answer_key": "要点…",
  "difficulty": "A|B|C",
  "knowledge": "函数单调性"
}
```

#### `homework_submissions`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| homework_id | TEXT FK | |
| student_id | TEXT FK | |
| layer | TEXT | 提交时档位 |
| answers_json | TEXT | |
| status | TEXT | `pending` \| `submitted` \| `graded` |
| score | REAL | |
| submitted_at | TEXT | |

#### `gradings` → **Grading**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| homework_id | TEXT FK | 可空（演示独立批改） |
| class_id | TEXT | |
| overview_json | TEXT | 提交率、均分、正确率 |
| error_dist_json | TEXT | 五类错因计数 |
| details_json | TEXT | 按学生：逐题、评语、错因 |
| source | TEXT | `demo` \| `import` \| `ai` |
| created_at | TEXT | |

#### `error_book` → **ErrorBook**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| student_id | TEXT FK | |
| knowledge | TEXT | |
| stem | TEXT | |
| wrong_answer | TEXT | |
| correct_answer | TEXT | |
| error_type | TEXT | 概念/计算/审题/方法/表达 |
| source | TEXT | `homework` \| `daily` \| `grading` |
| source_id | TEXT | |
| mastered | INTEGER 0/1 | |
| created_at | TEXT | |

#### `notifications` → **Notification**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| user_id | TEXT | 教师或学生 id |
| role | TEXT | `teacher` \| `student` |
| type | TEXT | `new_homework` \| `graded` \| `daily_remind` \| `layer_change` \| `submit` \| `all_submitted` \| `warning` |
| title | TEXT | |
| body | TEXT | |
| link | TEXT | 前端路由 hint，如 `/student/homework` |
| read | INTEGER 0/1 | |
| created_at | TEXT | |

#### `daily_practices` → **DailyPractice**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| student_id | TEXT FK | |
| practice_date | TEXT | YYYY-MM-DD |
| items_json | TEXT | 1–3 题 |
| answers_json | TEXT | |
| result_json | TEXT | 对错、得分 |
| status | TEXT | `open` \| `done` |
| created_at | TEXT | |

#### `growth_events`（成长轨迹辅助，非必须对外独立模型名）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| student_id | TEXT | |
| type | TEXT | `practice` \| `homework` \| `badge` \| `layer` |
| title | TEXT | |
| payload_json | TEXT | |
| created_at | TEXT | |

#### `teachers`（演示最小）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `teacher_zhang` |
| name | TEXT | 张老师 |

---

## 5. 身份与请求约定

演示无登录态，前端 `SessionContext` 维护：

```js
{ role: 'teacher' | 'student', userId: 'teacher_zhang' | 'stu_liming', displayName }
```

每个 API 请求带：

```
X-Demo-Role: teacher|student
X-Demo-User-Id: teacher_zhang|stu_liming
```

服务端 `demoUser` 中间件解析为 `req.demoUser`；写操作校验角色是否匹配路由域。  
**非安全模型**，仅防页面误操作。

统一响应：

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "…" } }
```

---

## 6. REST API 列表

前缀：`/api`。若无特别说明，GET 可读，POST/PATCH 写。

### 6.1 会话 / 元数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/demo/users` | 可切换演示账号列表 |
| GET | `/api/meta/knowledges` | 预置知识点列表 |

### 6.2 班级 · Class / Student

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/classes` | 班级列表 |
| POST | `/api/classes` | 新建班级 `{ name, grade }` |
| GET | `/api/classes/:classId` | 班级详情 |
| GET | `/api/classes/:classId/students` | 学生名单（含 layer） |
| POST | `/api/classes/:classId/students` | 添加学生 |
| POST | `/api/classes/:classId/students/import` | 批量导入 `[{student_no,name}]` |
| PATCH | `/api/students/:id` | 更新（含 is_monitor） |
| GET | `/api/students/:id/profile` | 个体档案聚合 |

### 6.3 考试成绩 · ExamScore

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/classes/:classId/exams` | 考试列表 |
| POST | `/api/classes/:classId/exams/import` | 导入成绩（JSON/表格解析后结构） |
| POST | `/api/classes/:classId/exams/load-demo` | 一键加载演示月考 |

### 6.4 学情诊断

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/classes/:classId/diagnosis` | 仪表盘：热力、Top5、趋势、分层概览 |
| GET | `/api/classes/:classId/diagnosis/heatmap` | 可选拆分 |
| GET | `/api/students/:id/diagnosis` | 学生视角学情 |

**诊断计算（规则，非 AI）**

- 得分率 = sum(score)/sum(full_score)，按 knowledge / chapter 聚合  
- Top5：得分率最低 5 个知识点  
- 趋势：近 N 次 exam 班级均分  
- 分层规则默认：按最近一次总分分位 前 20%→A，中 60%→B，后 20%→C  

### 6.5 分层 · Layer

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/classes/:classId/layers/recompute` | 按规则重算全班 |
| PATCH | `/api/students/:id/layer` | 手调 `{ layer }` → 通知学生 |

### 6.6 分层作业 · Homework

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/classes/:classId/homeworks` | 教师作业列表 |
| POST | `/api/homeworks/generate` | AI/模板生成三档 `{ classId, knowledge, lessonType }` |
| GET | `/api/homeworks/:id` | 详情含 sheets |
| PATCH | `/api/homeworks/:id` | 编辑题干/删题/换题结果回写 |
| POST | `/api/homeworks/:id/refine` | 页内短指令微调 `{ instruction }` |
| POST | `/api/homeworks/:id/push` | 推送：写 submission 槽位 + 通知 |
| GET | `/api/student/homeworks` | 当前学生作业列表 |
| GET | `/api/student/homeworks/:id` | 学生可见本档题目 |
| POST | `/api/student/homeworks/:id/submit` | 提交答案 |

### 6.7 批改 · Grading

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/gradings/demo` | 一键演示批改报告 `{ classId, homeworkId? }` |
| POST | `/api/gradings/import` | 结构化对错导入 |
| GET | `/api/classes/:classId/gradings` | 批改列表 |
| GET | `/api/gradings/:id` | 总览 + 错因 + 详情 |
| POST | `/api/gradings/:id/comments` | AI/模板生成评语（可选） |
| POST | `/api/gradings/:id/notify` | 通知学生批改完成 + 错题入库 |

### 6.8 错题本 · ErrorBook

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/student/errorbook` | 列表 `?knowledge=&error_type=` |
| POST | `/api/student/errorbook/:id/variant` | 变式题（规则/模板） |
| PATCH | `/api/student/errorbook/:id` | 标记掌握 |

### 6.9 每日练 · DailyPractice

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/student/daily` | 今日练习（无则按薄弱生成） |
| POST | `/api/student/daily/generate` | 强制生成 1–3 题 |
| POST | `/api/student/daily/:id/submit` | 客观题规则批改；错题入库；写 growth |

### 6.10 通知 · Notification

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notifications` | 当前用户通知 |
| PATCH | `/api/notifications/:id/read` | 已读 |
| POST | `/api/notifications/read-all` | 全部已读 |

### 6.11 成长轨迹

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/student/growth` | 事件 + 简易分数序列 + 徽章 |

### 6.12 AI（内部能力对外薄封装，非聊天）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/generate-sheets` | 同 homework generate 可复用 |
| POST | `/api/ai/student-diagnosis` | 档案单次诊断段落 `{ studentId }` |
| POST | `/api/ai/comment` | 单次评语 `{ studentId, context }` |

所有 AI 接口返回：

```json
{
  "ok": true,
  "data": { "...": "业务结构" },
  "meta": { "source": "llm" | "fallback", "model": "gpt-5.5" }
}
```

---

## 7. AI 模块设计

### 7.1 配置优先级

```
环境变量 (.env)
  > codexConfig 解析结果 (~/.codex)
  > 内置默认
```

| 项 | 来源 |
|----|------|
| base_url | `OPENAI_BASE_URL` 或 config `[model_providers.OpenAICompat].base_url` |
| model | `OPENAI_MODEL` 或顶层 `model` |
| api_key | `OPENAI_API_KEY` 或 `auth.json` 的 `OPENAI_API_KEY` 或 provider `experimental_bearer_token` |
| timeout | `OPENAI_TIMEOUT_MS` 默认 45000 |

**路径（Windows）**

- config：`%USERPROFILE%\.codex\config.toml`（可用 `CODEX_HOME` 覆盖）
- auth：`%USERPROFILE%\.codex\auth.json`

### 7.2 `server/src/ai/codexConfig.js`

职责：

1. 定位 `CODEX_HOME`（默认 `path.join(os.homedir(), '.codex')`）
2. 解析 `config.toml`（轻量 TOML 解析或 `smol-toml`/`@iarna/toml`）
3. 读取 `model`、`model_provider`、对应 `[model_providers.<name>]` 的 `base_url`、`env_key`、`experimental_bearer_token`
4. 读取 `auth.json` 中 `env_key` 对应字段
5. 返回归一化对象：

```js
{
  baseUrl: 'https://passion8.cc/v1',
  model: 'gpt-5.5',
  apiKey: '***',          // 永不打日志全文
  providerName: 'OpenAICompat',
  source: 'codex' | 'env' | 'mixed'
}
```

注意：Codex 中 `wire_api = "responses"` 可能与 chat 协议不同；**本项目统一走 OpenAI Chat Completions 兼容路径** `POST {baseUrl}/chat/completions`。若网关仅支持 responses，再在 client 内做适配开关 `OPENAI_API_STYLE=chat|responses`（默认 `chat`）。

### 7.3 `server/src/ai/client.js`

```
chatCompletions({ messages, temperature, responseFormat })
  → fetch(`${baseUrl}/chat/completions`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: { model, messages, temperature, response_format? }
    })
  → 解析 choices[0].message.content
  → 尝试 JSON.parse（允许 ```json 包裹剥离）
  → 失败抛 AiError
```

策略：

| 情况 | 行为 |
|------|------|
| 无 apiKey / 无 baseUrl | 直接 fallback，不发起网络 |
| 网络/4xx/5xx/超时 | 记 warn，fallback |
| 返回非 JSON / 校验失败 | fallback 或局部修补 |
| 成功 | `meta.source = 'llm'` |

对外业务只依赖 `generateSheets` / `generateComment` / `generateDiagnosis` / `refineSheets` 四个函数；内部统一 `client.chatCompletions`。

### 7.4 使用场景与 Prompt 边界

| 场景 | 输出 | 校验 |
|------|------|------|
| 三档练习 | sheets JSON | 每档 ≥1 题，字段齐全 |
| 工坊短指令 | 修改后的 sheets | 同结构 |
| 评语 | 80–150 字中文 | 非空 |
| 档案诊断 | 一段结论 | 非空 |

**禁止**：多轮会话存储、全局 assistant 路由、学生端自由对话。

### 7.5 `fallbacks.js`

- 按知识点 key 的本地题库（函数单调性、导数、三角等 5–8 个）
- 评语模板：`{name} 在 {knowledge} 上…` 插值
- 诊断模板：薄弱 Top3 + 建议练题

保证 **断网演示** 主路径完整。

---

## 8. 主演示路径数据流

### 路径 1 · 月考后闭环（3–5 min）

```
[前端 教师] POST /exams/load-demo
       → seed 写入 exams + question_meta + exam_scores
       → layerService.recompute 写 layer_assignments

[前端 T1] GET /diagnosis
       → 热力/Top5/趋势/分层人数
       → 用户点 Top5「函数单调性」→ 路由 T2 ?knowledge=

[前端 T2] POST /homeworks/generate
       → ai.generateSheets | fallback
       → INSERT homeworks (draft)

       POST /homeworks/:id/push
       → 按 layer 为学生创建 homework_submissions(pending)
       → INSERT notifications (type=new_homework, 各学生)
       → homeworks.status=pushed

[前端 切换学生] GET /notifications
       → 点进 S3 GET /student/homeworks
       → POST submit → submission=submitted；可选通知教师

[前端 教师 T3] POST /gradings/demo
       → 写 gradings；可批量更新 submission=graded
       → POST notify → 学生通知 graded；INSERT error_book
       → growth_events

[前端 T1/T4] 点李明 → GET /students/stu_liming/profile
       → 可选 POST /ai/student-diagnosis
```

### 路径 2 · 学生补弱

```
GET /student/diagnosis → 薄弱点
POST /student/daily/generate → 1–3 题（薄弱 knowledge）
POST submit → 规则比对 → error_book + growth
GET /student/errorbook · /student/growth
```

### 路径 3 · 开班

```
POST /classes → POST students/import → GET diagnosis（空态引导 load-demo）
```

---

## 9. 前端信息架构

| 角色 | 路由 | 页 |
|------|------|-----|
| 教师 | `/t/diagnosis` | T1 |
| 教师 | `/t/layers` | T2 |
| 教师 | `/t/grading` | T3 |
| 教师 | `/t/classes` | T4 |
| 教师 | `/t/students/:id` | T5 |
| 学生 | `/s/status` | S1 |
| 学生 | `/s/daily` | S2 |
| 学生 | `/s/homework` | S3 |
| 学生 | `/s/errors` | S4 |
| 学生 | `/s/growth` | S5 |

顶栏：品牌 | 角色 Tab | 通知 | **教师⇄学生** 切换 | 用户名。  
样式：`tokens.css` 复制 v3 CSS 变量（`--primary: #2563EB` 等）。

---

## 10. 环境变量 · `.env.example`

路径建议：`server/.env.example`（运行时 `server/.env`）。

```bash
# Server
PORT=3001
HOST=127.0.0.1
NODE_ENV=development
DATABASE_PATH=./data/zhixueban.db
SEED_ON_BOOT=true

# CORS / 前端（生产可收紧）
CORS_ORIGIN=http://localhost:5173

# AI — 可覆盖本机 Codex 读取结果
# 留空则尝试 %USERPROFILE%\.codex\config.toml + auth.json
CODEX_HOME=
OPENAI_BASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_TIMEOUT_MS=45000
OPENAI_API_STYLE=chat
# true 时强制只用本地模板（答辩无网保险）
AI_FORCE_FALLBACK=false

# Demo
DEFAULT_CLASS_ID=class_demo_1
DEFAULT_TEACHER_ID=teacher_zhang
DEFAULT_STUDENT_ID=stu_liming
```

根目录可选：

```bash
# web/.env.example
VITE_API_BASE=/api
```

Vite `server.proxy`：

```js
proxy: { '/api': 'http://127.0.0.1:3001' }
```

---

## 11. 种子数据（演示最低集）

| 实体 | 内容 |
|------|------|
| 教师 | 张老师 |
| 班级 | 高一(3)班，约 12–15 人 |
| 学生 | 含 **李明**（默认学生视角） |
| 考试 | 2–3 次，最近为「3月月考」 |
| 知识点 | 函数单调性、导数应用、三角恒等… |
| 分层 | 规则算完即有 A/B/C 分布 |
| 通知 | 2–3 条样例可读 |

`SEED_ON_BOOT=true` 且库不存在时建表 + seed。

---

## 12. 实施顺序（一天主路径）

| 序 | 交付 | 验收 |
|----|------|------|
| 1 | monorepo 脚手架、DB schema、seed | 健康检查 + 班级学生有数据 |
| 2 | 角色切换 + TopNav + 空页壳 | 师生 UI 切换 |
| 3 | 诊断 API + T1 仪表盘 | 热力/Top5 可见 |
| 4 | 分层重算/手调 + T2 生成/推送（可先 fallback） | 学生 S3 见作业 |
| 5 | 学生提交 + T3 demo 批改 + 通知 + 错题 | 闭环可点 |
| 6 | 档案/每日练/成长 薄实现 | 路径 2 可演示 |
| 7 | 接通 AI client；失败仍 fallback | meta.source 可观察 |

---

## 13. 可行性 · 扩展性 · 关键风险

### 可行性

- 无登录、无 OCR、无图数据库 → 范围可控  
- SQLite + 规则诊断 + 模板降级 → 离线可讲故事  
- AI 仅 4 个生成点 → 对接 Codex 配置成本低  

### 扩展性（预留，不实现）

- 多班级：已有 `class_id`  
- 真登录：中间件换 JWT，表加 password_hash  
- 存储：repository 接口可换 Postgres  
- AI：`client.js` 可换 provider 而不改 service  

### 关键风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Codex `wire_api=responses` 与 chat 不兼容 | 出题失败 | 默认 chat；`AI_FORCE_FALLBACK`；模板题库 |
| 密钥/TOML 路径在演示机不一致 | AI 不可用 | `.env` 覆盖；启动日志打印 `source`（无密钥） |
| better-sqlite3 原生编译失败 | 装不上 | 备选 `sql.js` 或 JSON store 开关（实现期评估） |
| Windows npm execution policy | 装依赖失败 | `cmd /c npm` 或 `node …/npm-cli.js` |
| 生成 JSON 不稳定 | 工坊空白 | schema 校验 + fallback 整包替换 |
| 演示数据过少 | 仪表盘空 | 强制 seed 12+ 人、2 次考试 |
| 范围蔓延（聊天/OCR） | 一天跑不通 | 严格 AB 大纲，本文件为契约 |

---

## 14. 接口契约原则（给前后端）

1. 所有列表返回数组在 `data.items` 或 `data` 数组二选一，**统一 `data` 为对象时带 `items`**。  
2. 时间一律 ISO 8601 字符串。  
3. 分层枚举仅 `A|B|C`。  
4. 错因枚举：`concept|calc|read|method|express`（展示层映射中文）。  
5. AI 与业务解耦：service 先落库再返回 id，前端不直接存大段 prompt。  
6. 推送/批改/调档 **必须** 写通知，保证闭环可感知。  

---

## 15. 一句话架构

> **Express + SQLite 规则引擎做学情与闭环，Vite/React 复刻 v3 双端壳，OpenAI 兼容接口按 Codex 配置增强出题/评语并模板降级——一天跑通「诊断→分层练→推送→批改→档案/错题」主路径。**
