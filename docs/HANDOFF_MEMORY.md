# 智学伴 · 接手记忆文档（AI / 人工）

> **更新日期**：2026-07-20  
> **项目路径**：`G:\大赛项目\719gaoshu\zhixueban`  
> **用途**：把当前已落地的产品主路径、架构、关键代码与「为什么这样改」写清楚，方便其他 AI / 开发直接续作，避免再走「只录成绩猜错因」的弯路。

---

## 1. 项目一句话

高中数学 **学情诊断 + 分层教学 + 在线测验（AI 出卷 → 作答 → 自动评测 → 真实错因）+ 学生闭环**。  
AI 走本机 **Codex** 配置（OpenAI-compatible），失败则 **本地题库兜底**，演示不断链。

---

## 2. 用户/产品决策（必须遵守）

| 决策 | 说明 |
|------|------|
| **不要**「只导入总分做错因分析」 | 用户明确反对；那是假闭环。 |
| **要**完整测验链路 | AI 出卷 → 发布 → 学生做 → 自动评分 → 按真实作答做错因 → 报告/错题本。 |
| **题量不是一个总数** | 老师分别填：**选择题几道 / 填空几道 / 判断几道 / 解答题几道**。 |
| **解答题输入参考初中项目** | `G:\大赛项目\chuzhong_shuxue` 的 `FormulaToolbar`：点选插入 Unicode 数学符号（所见即所得）。 |
| UI | 对齐原型 v3 蓝主色；**不要**在界面上挂「AI 徽章」当卖点。 |
| 热力图 | 章节 × 五维能力矩阵（见诊断模块），不是随便一张图。 |

---

## 3. 技术栈与运行

| 层 | 技术 |
|----|------|
| 后端 | Express（`server/`），**JSON 文件库**（`server/src/db.js` → `server/data/zhixueban.json`） |
| 前端 | Vite + React + Recharts（`web/`） |
| AI | `server/src/ai/client.js` + `codexConfig.js`，读 `~/.codex/config.toml` + `auth.json` |
| 当前实测 AI | `model=gpt-5.5`，`base=https://passion8.cc/v1`（以本机 Codex 为准） |

> **注意**：README 仍写 better-sqlite3，**实际已不用原生 SQLite**（Windows 无 VS C++ 时装不上）。持久化是 JSON。以本文件与 `db.js` 为准。

### 启动

```bat
cd /d G:\大赛项目\719gaoshu\zhixueban
npm install
npm run seed -w server
npm run dev
```

- 前端：http://localhost:5173（也可能是 `localhost` IPv6 / `127.0.0.1`）  
- API：http://localhost:8787  
- 演示账号切换：顶栏 **教师 张老师 ⇄ 学生 李明**

### 冒烟脚本（测验闭环）

```bat
node server/scripts/test-quiz-loop.js
```

成功末行应出现：`QUIZ LOOP OK`。  
请求体会带 `composition: { choice, fill, judge, essay }`。

---

## 4. 主演示路径（当前正确叙事）

```
教师 · 智能批改
  → 填标题/难度
  → 四种题型各填「几道」
  → 勾选知识点
  → 「生成并发布给学生」（Codex 按题型出卷）
学生 · 在线测验
  → 作答（选择点选；填空/解答用数学符号栏）
  → 提交 → 自动评分
教师 · 智能批改
  → 测验列表「生成批改报告」
  → 错因分布 / 逐题正确率 / 个体评语
学生 · 错题本 / 通知
```

辅助能力（仍在）：学情热力、分层 A/B/C、作业推送、每日练、成长轨迹、历史考试导入批改（**不是**主叙事）。

---

## 5. 目录地图

```
zhixueban/
  package.json                 # workspaces: server + web，concurrently dev
  docs/
    HANDOFF_MEMORY.md          # ← 本文件
    REQUIREMENTS.md / ARCHITECTURE.md / ACCEPTANCE.md
  server/
    data/zhixueban.json        # 运行时数据（seed 后生成）
    scripts/
      test-quiz-loop.js        # 四题型闭环冒烟
      smoke.js / test-grading.js / check-ai.js / check-heatmap.js
    src/
      index.js                 # 监听 8787
      db.js                    # JSON store
      seed.js
      ai/client.js + codexConfig.js
      routes/api.js            # 全部 REST
      services/
        quiz.js                # ★ 在线测验主逻辑（出卷/提交/报告）
        grading.js             # 考试导入批改 + listReports/getReport/评语
        diagnosis.js           # 学情/热力/分层
        aiTasks.js             # 分层卷/评语/每日练等 AI 任务
  web/
    src/
      App.jsx                  # 师生路由、AppContext
      api.js                   # fetch 封装
      styles.css
      components/
        MathAnswerInput.jsx    # ★ 符号工具栏 + 填空/解答输入
      pages/
        Grading.jsx            # ★ 教师：四题型出卷 + 报告
        StudentQuiz.jsx        # ★ 学生：在线测验
        Diagnosis.jsx / Layered.jsx / ErrorBook.jsx / ...
```

参考项目（解答题 UX）：

- `G:\大赛项目\chuzhong_shuxue\frontend\src\components\MathText.tsx`  
  - `FORMULA_CHIPS` / `FormulaToolbar`（点选插入 Unicode，非强制 LaTeX 源码）

---

## 6. 在线测验数据模型

### 表（JSON 数组，`db.js` empty()）

| 表 | 用途 |
|----|------|
| `quizzes` | 试卷：`items_json`、`composition_json`、`status` draft/published |
| `quiz_attempts` | 作答：`answers_json`、`detail_json`、`score`、`max_score` |
| `grading_reports` | 批改报告：`summary_json`（学生明细嵌在 summary.students） |
| `error_records` | 错题本（与 grading 共用） |
| `notifications` | 师生通知 |

### 题目 item 结构

```json
{
  "id": "q1",
  "qno": "1",
  "type": "choice|fill|judge|essay",
  "stem": "题干",
  "options": [{ "key": "A", "text": "...", "errorType": "概念|null" }],
  "answer": "标准/参考答案",
  "score": 5,
  "kp": "知识点",
  "analysis": "解析",
  "commonError": "概念",
  "scoringPoints": ["解答题评分点"],
  "autoGrade": true
}
```

- **choice**：4 选项；正确项 `errorType=null`，错误项标错因。  
- **judge**：选项「正确/错误」。  
- **fill**：无 options；答案字符串比对（normalize 去空白/全半角等）。  
- **essay**：无 options；提交时 **关键词粗匹配预评分**，`pendingReview=true`。

### composition（教师出卷）

```json
{ "choice": 4, "fill": 2, "judge": 2, "essay": 1 }
```

- 单题型上限 30，总题量上限 60（`quiz.js`：`QUIZ_TYPE_MAX` / `QUIZ_TOTAL_MAX`）。  
- 全 0 时默认 `4/2/2/1`。  
- 兼容旧字段：`count` 会变成「全是选择题」。

---

## 7. 核心 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/classes/:id/quizzes` | body: `generate, publish, title, kpNames, difficulty, composition` |
| POST | `/api/ai/quiz-paper` | 只生成 paper 不入库 |
| POST | `/api/quizzes/:id/publish` | 发布 + 学生通知 |
| GET | `/api/students/:id/quizzes` | 已发布列表 |
| GET | `/api/students/:studentId/quizzes/:quizId` | 取卷（未交无答案；已交带答案） |
| POST | `/api/students/:studentId/quizzes/:quizId/submit` | 自动评测 |
| POST | `/api/quizzes/:id/report` | 从 attempts 生成 `grading_reports`，`summary.source=online_quiz` |
| GET | `/api/classes/:id/grading` | 报告列表（`grading.listReports`） |
| GET | `/api/ai/status` | Codex 是否配置成功 |

创建出卷关键代码**：`server/src/services/quiz.js`

- `normalizeComposition`  
- `generateQuizPaper`：按题型顺序 `choice→fill→judge→essay` 调 `generateTypeChunk`（每批最多 8 题）  
- 失败：`fallbackByType` 本地题库  
- `submitAttempt`：客观题精确比；解答题预评；写 `error_records`  
- `buildReportFromQuiz`：summary 需兼容 `Grading.jsx`（`submitRate/avgScore/accuracy/errorTypes/itemStats/typical/students`）

---

## 8. 前端要点

### 教师 `Grading.jsx`

- 状态 `typeCounts = { choice, fill, judge, essay }`，四个 number 输入。  
- `api.createQuiz(classId, { generate, publish, title, kpNames, composition, difficulty })`。  
- 预览展示题型标签、composition 汇总、解答题「预评分」提示。  
- 报告区识别 `summary.source === 'online_quiz'`。

### 学生 `StudentQuiz.jsx`

- choice/judge：选项点击。  
- fill/essay：`MathAnswerInput`（`web/src/components/MathAnswerInput.jsx`）。  
- 提交后展示对错、错因、解析；解答题可显示预评分。

### 路由（`App.jsx`）

- 教师：`/teacher/grading` 等  
- 学生：`/student/quiz` →「在线测验」

---

## 9. AI 调用约定

1. 读配置：`loadCodexAiConfig()`（`~/.codex` 或 env 覆盖）。  
2. `chatJson(system, user)` → 强制 JSON。  
3. 出卷 prompt **强制题型与题量**，错误选项必须带 `errorType`。  
4. 任一批失败 → 该题型用题库补齐，保证 composition 数量；`source` 可能是 `ai` / `mixed` / `template`。  
5. 大题量按类型分批，避免单次 JSON 截断。

环境变量（可选）：`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` / `CODEX_HOME` / `DB_PATH`。

---

## 10. 已知坑与边界

1. **PowerShell**：`npm.ps1` 可能被 ExecutionPolicy 拦住；用 `cmd /c npm run dev` 更稳。  
2. **路径中文**：`G:\大赛项目\...` 在部分 shell 编码下会乱，优先 `cmd /c` 或已 cd 进目录再跑。  
3. **端口占用**：8787 可能有多个监听；5173 有时只绑 `::1`，用 `http://localhost:5173`。  
4. **报告结构双轨**：  
   - 在线测验报告：`buildReportFromQuiz` 写的 `summary.students`  
   - 旧考试导入：`grading.js` 也可能把 students 放在 summary 里  
   - 评语 API 用 `grading.writeComment` / `batchComments`，依赖 `summary.students[].wrong`  
5. **解答题不是精批**：只有关键词粗匹配；产品上要写清「预评分，可复核」。后续可接 Codex 精批。  
6. **重复提交**：同一学生同一 quiz 已 submitted 会 400。  
7. **README 过时**：SQLite 描述、主路径「批改演示」需以本文件为准。

---

## 11. 本次会话完成清单（2026-07-20）

- [x] 否定「只录分猜错因」，落地 AI 出卷→作答→评分→错因全链路  
- [x] 题型 composition：选择/填空/判断/解答 分别填题量  
- [x] Codex 按题型分批出题 + 题库兜底  
- [x] 教师端 UI 四题型输入与预览  
- [x] 学生端四题型作答  
- [x] `MathAnswerInput` + Formula 芯片（参考 chuzhong_shuxue）  
- [x] 报告 `online_quiz` + 错题本 `error_records`  
- [x] `test-quiz-loop.js` 冒烟通过（例：2 选 +1 填 +1 判 +1 解）

---

## 12. 建议后续（未做，按优先级）

1. 解答题：教师复核改分 / 或 Codex 精批步骤分。  
2. 删除或折叠「CSV/考试纯分数导入」入口，避免演示误导。  
3. 题干渲染：可选 KaTeX（初中项目 `MathText`），当前以 Unicode 为主。  
4. 修正 README（JSON DB、主路径、composition）。  
5. 发布卷后禁止改 composition；支持复制卷再出。  
6. 多班级/真实登录（现演示切换师生）。

---

## 13. 给接手 AI 的最短操作手册

```
1. 读本文件 + server/src/services/quiz.js + web/src/pages/Grading.jsx + StudentQuiz.jsx
2. npm run dev；确认 GET /api/health 与 /api/ai/status
3. 改需求时保持 composition 四字段与 type 枚举：choice|fill|judge|essay
4. 报告字段改动必须同步 Grading.jsx 读的 summary.*
5. 任何新 AI 能力：chatJson + 失败模板兜底
6. 改完跑：node server/scripts/test-quiz-loop.js
```

### 演示话术（给老师/评委）

> 老师按题型填题量，系统用 Codex 出带标准答案和错因标签的卷；学生在线做，填空解答可点数学符号；交卷后机器自动判分，错因来自真实选项与标签，不是只录一个总分瞎猜。

---

## 14. 相关文件速查

| 需求 | 文件 |
|------|------|
| 出卷/评分/报告 | `server/src/services/quiz.js` |
| 路由 | `server/src/routes/api.js` |
| AI 客户端 | `server/src/ai/client.js` |
| 教师出卷 UI | `web/src/pages/Grading.jsx` |
| 学生测验 UI | `web/src/pages/StudentQuiz.jsx` |
| 数学符号输入 | `web/src/components/MathAnswerInput.jsx` |
| 前端 API | `web/src/api.js` |
| 闭环测试 | `server/scripts/test-quiz-loop.js` |
| 数据文件 | `server/data/zhixueban.json` |
| 参考符号栏 | `G:\大赛项目\chuzhong_shuxue\frontend\src\components\MathText.tsx` |

---

*本文档描述的是仓库当前真实状态；若代码与文档冲突，以代码为准，并请回写本文件。*
