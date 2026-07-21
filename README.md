# 智学伴 · AB 版（真实网站）

高中数学 **学情诊断 + 分层教学 + 批改反馈 + 学生闭环**。  
AI 能力读取本机 **Codex** 配置（`~/.codex/config.toml` + `auth.json`）。

## 技术栈

- **server**: Express + JSON 文件库 + OpenAI-compatible AI（本机 Codex）
- **web**: Vite + React + Recharts（蓝主色，对齐原型 v3）

> 接手说明（给其他 AI/开发）：见 **[docs/HANDOFF_MEMORY.md](docs/HANDOFF_MEMORY.md)**。

## 快速启动

```bat
cd /d G:\大赛项目\719gaoshu\zhixueban
cmd /c npm install
cmd /c npm run seed -w server
cmd /c npm run dev
```

- 前端: http://localhost:5173  
- API: http://localhost:8787  

演示：顶栏 **张老师 ⇄ 李明** 切换师生端。

## AI 配置

自动读取：

| 来源 | 字段 |
|------|------|
| `~/.codex/config.toml` | `model`, `[model_providers.OpenAICompat].base_url`, `experimental_bearer_token` |
| `~/.codex/auth.json` | `OPENAI_API_KEY` |

也可用环境变量覆盖：`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` / `CODEX_HOME`。

AI 用于：三档出题、页内微调、评语、单次诊断段落。失败自动 **模板兜底**。

## 主演示路径

1. 教师 · 学情诊断：热力 / Top5 / 分层  
2. Top5 → 分层教学：生成 A/B/C → 推送  
3. 学生 · 通知 / 分层作业  
4. **教师 · 智能批改（主路径）**：按题型填题量（选择/填空/判断/解答）→ Codex 出卷发布 → 学生「在线测验」作答 → 自动评分与真实错因 → 生成批改报告  
5. 学生 · 每日练 / 错题本 / 成长轨迹  

闭环冒烟：`node server/scripts/test-quiz-loop.js`

## 目录

```
zhixueban/
  server/   API + JSON DB + AI
  web/      React 前端
  docs/     需求/架构 + HANDOFF_MEMORY.md（接手记忆）
```
