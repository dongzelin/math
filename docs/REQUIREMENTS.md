# 智学伴 · 需求清单（A+B · 用户故事 & 接口级）

> **版本**：v1.0 · 2026-07-20  
> **范围**：仅 A+B；以 `智学伴_功能大纲_AB版.md` 为准。  
> **验收对照**：`docs/ACCEPTANCE.md`  
> **UI**：沿用 `智学伴_原型v3.html` 蓝主色体系。

---

## 1. 产品边界（摘要）

**做**：学情诊断、规则分层、三档练习生成与推送、智能批改（演示/结构化）、班级与学生档案、站内通知、学生端（学情/每日练/作业/错题/成长轨迹）。

**不做**：全局 AI 聊天、学生 AI 学伴、OCR 深水、Neo4j、K-Means 展示、课件工厂、微信通知。

**AI 仅用于**：三档出题、工坊短指令微调、评语、单次诊断段落。  
**配置**：本机 Codex `~/.codex/config.toml` + `auth.json`；`base_url=https://passion8.cc/v1`；`model=gpt-5.5`。

---

## 2. 角色与权限（简化）

| 角色 | 能力 |
|------|------|
| 教师 | 全模块读写本班；推送作业；调档；批改；看档案 |
| 学生 | 仅本人学情/作业/每日练/错题/轨迹/通知 |
| 课代表 | 可选标记字段；**无**独立权限 API |

演示可用「角色切换」代替完整 OAuth，但 **API 须带 `role` + `userId` 上下文**，禁止串数据。

---

## 3. 用户故事（按模块）

### 3.1 全局

| ID | 故事 | 验收要点 |
|----|------|----------|
| US-G01 | 作为教师/学生，我希望顶栏导航符合我的角色，以便快速进入功能 | 师生导航分列；无 AI 学伴/知识管理主 Tab/悬浮球 |
| US-G02 | 作为演示用户，我希望一键切换师生身份 | 切换后数据与菜单一致 |
| US-G03 | 作为用户，我希望看到站内通知铃铛 | 未读角标、列表、已读、跳转 |

### 3.2 班级管理（A）

| ID | 故事 | 验收要点 |
|----|------|----------|
| US-C01 | 作为教师，我希望管理班级列表并新建班级 | 列表+新建最小字段 |
| US-C02 | 作为教师，我希望导入或添加学生 | 名单可见；可进档案 |
| US-C03 | 作为教师，我希望看到学生分层标签 | 与 LayerAssignment 一致 |

### 3.3 学情诊断（B）

| ID | 故事 | 验收要点 |
|----|------|----------|
| US-D01 | 作为教师，我希望导入/加载成绩后看到班级热力与 Top5 | 色块+Top5 可点 |
| US-D02 | 作为教师，我希望从 Top5 一键去分层教学 | 知识点预填 |
| US-D03 | 作为教师，我希望按规则分层并可手调 | 分位规则+手动改档落库 |
| US-D04 | 作为教师，我希望看学情趋势与分层概览名单 | 折线+展开名单→档案 |

### 3.4 分层教学（B）

| ID | 故事 | 验收要点 |
|----|------|----------|
| US-L01 | 作为教师，我希望按知识点/课型生成 A/B/C 三档**练习** | 三栏内容完整；AI 或模板兜底 |
| US-L02 | 作为教师，我希望编辑单题或短指令微调 | 工坊内；非全局聊天 |
| US-L03 | 作为教师，我希望推送练习给对应档学生 | 作业+学生通知 |
| US-L04 | 作为教师，我希望复制/导出练习示意 | 至少一种 |

### 3.5 智能批改（B · 降级）

| ID | 故事 | 验收要点 |
|----|------|----------|
| US-G01-T | 作为教师，我希望用演示数据或结构化表得到批改报告 | 总览+错因+个体 |
| US-G02-T | 作为教师，我希望生成/查看评语并入库错题 | 评语可读；ErrorRecord→学生错题本 |
| US-G03-T | 作为教师，我希望批完通知学生 | 站内通知 |

### 3.6 学生档案（B）

| ID | 故事 | 验收要点 |
|----|------|----------|
| US-P01 | 作为教师，我希望下钻查看个体学情全景 | ≥3 类图表/列表有数据 |
| US-P02 | 作为教师，我希望调档、推送练习、生成一段诊断 | 单次生成非多轮聊 |

### 3.7 学生端

| ID | 故事 | 验收要点 |
|----|------|----------|
| US-S01 | 作为学生，我希望查看我的学情（档次/薄弱/热力） | 与本人数据一致 |
| US-S02 | 作为学生，我希望每日练 1–3 道薄弱题并即时批改 | 客观题规则批；错入错题本 |
| US-S03 | 作为学生，我希望完成教师推送的分层作业 | 待办/已办；提交 |
| US-S04 | 作为学生，我希望管理错题本并可选变式/重做 | 列表+筛选 |
| US-S05 | 作为学生，我希望在成长轨迹看到事件与曲线 | 时间线+进步曲线+轻量徽章 |

### 3.8 通知闭环

| ID | 故事 | 验收要点 |
|----|------|----------|
| US-N01 | 推送作业 → 学生「新作业」 | 可跳 S3 |
| US-N02 | 学生提交 → 教师「作业提交」 | 可跳批改/名单 |
| US-N03 | 批改完成 → 学生「批改完成」 | 可跳结果 |
| US-N04 | （可选）每日练提醒 / 分层变动 / 学情预警 | 规则触发即可 |

---

## 4. 接口级功能清单（简短）

> 路径前缀建议 `/api`；字段名可在实现时微调，但**职责不可缺**。鉴权：演示态可用 header `X-User-Id` / `X-Role`。

### 4.1 认证与会话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/demo-login` | 演示登录：返回 teacher/student 档案 |
| GET | `/api/me` | 当前用户与角色 |

### 4.2 班级与学生

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/classes` | 教师班级列表 |
| POST | `/api/classes` | 新建班级 |
| GET | `/api/classes/:id/students` | 学生名单（含 layer） |
| POST | `/api/classes/:id/students` | 添加学生（单条） |
| POST | `/api/classes/:id/students/import` | 批量导入（CSV/JSON） |
| PATCH | `/api/students/:id` | 改学号/课代表标记等 |
| PATCH | `/api/students/:id/layer` | 手调分层 A/B/C |

### 4.3 学情诊断

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/classes/:id/scores/import` | 导入成绩 |
| POST | `/api/classes/:id/scores/demo` | 加载演示成绩 |
| GET | `/api/classes/:id/diagnosis` | 聚合：热力、Top5、趋势、分层概览 |
| GET/PUT | `/api/classes/:id/question-meta` | 题号-知识点-满分映射 |
| POST | `/api/classes/:id/layers/recompute` | 按分位规则重算分层 |

### 4.4 分层练习

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/resources/generate` | body: classId, knowledgePoint, lessonType → A/B/C JSON；调 LLM+校验+模板兜底 |
| GET | `/api/resources/:id` | 获取练习包 |
| PATCH | `/api/resources/:id` | 编辑题目 |
| POST | `/api/resources/:id/refine` | 短指令微调（工坊）；调 LLM |
| POST | `/api/resources/:id/push` | 按档推送 → HomeworkPush + Notification |

### 4.5 作业与提交

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/homeworks` | 角色过滤：教师看班级任务，学生看本人 |
| GET | `/api/homeworks/:id` | 详情（题目+本人提交状态） |
| POST | `/api/homeworks/:id/submit` | 学生提交作答 |
| GET | `/api/homeworks/:id/submissions` | 教师看提交列表 |

### 4.6 批改

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/gradings/demo` | 一键演示批改报告 |
| POST | `/api/gradings/import` | 结构化对错/分数导入 |
| POST | `/api/gradings/upload` | 文件上传（可仅存附件+关联演示/规则结果） |
| GET | `/api/gradings/:id` | 总览+错因+个体列表 |
| GET | `/api/gradings/:id/students/:studentId` | 个体详情 |
| POST | `/api/gradings/:id/comments` | 批量/单个生成评语（LLM 单次） |
| POST | `/api/gradings/:id/publish` | 发布结果 → 错题入库 + 通知学生 |

### 4.7 学生档案 / 学生端数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/students/:id/profile` | 档案聚合（雷达/热力/错因/趋势/时间线） |
| POST | `/api/students/:id/diagnosis-text` | 单次诊断段落（LLM） |
| GET | `/api/me/learning` | 学生：我的学情 |
| GET | `/api/me/daily-practice` | 今日 1–3 题（规则推荐） |
| POST | `/api/me/daily-practice/submit` | 客观题即批；错→ErrorRecord；对→GrowthEvent |
| GET | `/api/me/error-book` | 错题列表+筛选 |
| POST | `/api/me/error-book/:id/retry` | 重做/变式（规则或预置） |
| GET | `/api/me/growth` | 轨迹事件+曲线+徽章 |

### 4.8 通知

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notifications` | 当前用户最近 N 条 |
| POST | `/api/notifications/read` | 单条/全部已读 |
| （内部） | 业务触发创建 | 推送作业、提交、批改发布、调档等写 Notification |

### 4.9 AI 代理（内部模块，可非独立 REST）

| 能力 | 输入 | 输出 | 失败策略 |
|------|------|------|----------|
| 三档出题 | 知识点、课型、档位约束 | 结构化 JSON 练习 | 模板题库 |
| 工坊微调 | resourceId + 短指令 | 增量修改后的 JSON | 返回错误提示，保留原文 |
| 评语 | 学生错因/得分摘要 | 短评语文本 | 规则模板句 |
| 诊断段 | 档案摘要 | 一段结论 | 规则摘要句 |

**配置加载**：服务端启动或请求时读 `~/.codex/config.toml` 与 `auth.json`，请求 `base_url` + `model=gpt-5.5`；密钥不入仓库。

---

## 5. 页面 ↔ 接口映射（实现索引）

| 页面 | 主要接口 |
|------|----------|
| T1 学情诊断 | diagnosis, scores/import\|demo, layers/recompute, students |
| T2 分层教学 | resources/generate\|patch\|refine\|push |
| T3 智能批改 | gradings/*, homeworks submissions |
| T4 班级管理 | classes, students |
| T5 学生档案 | students/:id/profile, diagnosis-text, layer, push |
| 通知 | notifications |
| S1–S5 | me/learning, daily-practice, homeworks, error-book, growth |

---

## 6. 数据实体（与大纲一致）

```
Teacher, Class, Student
Exam, ExamScore, QuestionMeta
LayerAssignment
ResourceSheet
HomeworkPush, HomeworkSubmission
GradingReport, ErrorRecord
DailyPracticeItem, GrowthEvent
Notification
```

---

## 7. 风险与开放问题（需求侧）

| # | 风险/模糊点 | 默认裁决（开发按此执行） |
|---|-------------|--------------------------|
| R1 | PRD 含聊天/图谱/K-Means/课件工厂 | **一律按 AB 大纲删除**，不实现 |
| R2 | AI 不可用 | 全链路模板兜底，演示不中断 |
| R3 | 批改「智能」程度 | 演示报告+结构化导入为 P0；图片 OCR 不承诺 |
| R4 | 登录体系 | 演示账号+角色切换即可；不做多校租户 |
| R5 | 学科范围 | 仅高中数学示范知识点树 |
| R6 | 课代表 | 仅标记字段，无权限 API |
| R7 | 导出 PDF | 复制/下载文本或 JSON 即可，完整 PDF 为 P2 |
| R8 | Codex 路径 Windows | 实现需兼容用户主目录下 `.codex`（如 `C:\Users\…\.codex`） |

---

## 8. 交付物与下一阶段

| 交付 | 说明 |
|------|------|
| 本文 + `ACCEPTANCE.md` | 开发与测试唯一范围准绳 |
| 下一阶段 | 方案设计（架构/库表/目录）→ 前后端实现 → 按 ACCEPTANCE 回归 |

**不在本阶段**：写业务代码、改原型 HTML（除非实现需要对照）。
