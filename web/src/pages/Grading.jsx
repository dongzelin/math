import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppContext } from '../App.jsx';

const KP_OPTIONS = [
  '函数的概念', '函数单调性', '函数奇偶性', '二次函数',
  '任意角与弧度', '三角函数图像', '三角恒等变换',
  '等差数列', '等比数列', '基本不等式',
];

const QUIZ_TOTAL_MAX = 60;

/**
 * 智能批改主路径：
 * AI 出卷 → 发布 → 学生作答 → 自动评测 → 错因报告
 * （不再用「只导分数猜错因」当主叙事）
 */
export default function Grading() {
  const { classId, showToast, refreshNotices } = useContext(AppContext);
  const [quizzes, setQuizzes] = useState([]);
  const [reports, setReports] = useState([]);
  const [report, setReport] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('课堂在线测验');
  /** 四种题型题量，由教师分别填写 */
  const [typeCounts, setTypeCounts] = useState({
    choice: 4,
    fill: 2,
    judge: 2,
    essay: 1,
  });
  const [difficulty, setDifficulty] = useState('中等');
  const [selectedKps, setSelectedKps] = useState(['函数单调性', '三角恒等变换']);

  const TYPE_FIELDS = [
    { key: 'choice', label: '选择题', hint: '单选 A/B/C/D' },
    { key: 'fill', label: '填空题', hint: '短答案' },
    { key: 'judge', label: '判断题', hint: '正确 / 错误' },
    { key: 'essay', label: '解答题', hint: '过程书写' },
  ];

  const clampType = (v) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(30, n);
  };

  const totalCount =
    (Number(typeCounts.choice) || 0) +
    (Number(typeCounts.fill) || 0) +
    (Number(typeCounts.judge) || 0) +
    (Number(typeCounts.essay) || 0);

  const setTypeCount = (key, val) => {
    const requested = clampType(val);
    setTypeCounts((prev) => {
      const otherTotal = Object.entries(prev).reduce(
        (sum, [type, count]) => sum + (type === key ? 0 : Number(count) || 0),
        0
      );
      return { ...prev, [key]: Math.min(requested, Math.max(0, QUIZ_TOTAL_MAX - otherTotal)) };
    });
  };

  const typeLabel = (t) =>
    ({ choice: '选择', fill: '填空', judge: '判断', essay: '解答' }[t] || t || '');

  const navigate = useNavigate();

  const reload = async () => {
    if (!classId) return;
    const [qs, rs] = await Promise.all([api.quizzes(classId), api.grading(classId)]);
    setQuizzes(qs);
    setReports(rs);
    if (!report && rs[0]) setReport(rs[0]);
  };

  useEffect(() => {
    reload().catch((e) => showToast(e.message));
  }, [classId]);

  const toggleKp = (kp) => {
    setSelectedKps((prev) =>
      prev.includes(kp) ? prev.filter((x) => x !== kp) : [...prev, kp]
    );
  };

  const genAndPublish = async (publish) => {
    if (!selectedKps.length) {
      showToast('请至少选择一个知识点');
      return;
    }
    const composition = {
      choice: clampType(typeCounts.choice),
      fill: clampType(typeCounts.fill),
      judge: clampType(typeCounts.judge),
      essay: clampType(typeCounts.essay),
    };
    const total =
      composition.choice + composition.fill + composition.judge + composition.essay;
    if (total <= 0) {
      showToast('请至少填写一种题型的题量（大于 0）');
      return;
    }
    setBusy(true);
    try {
      const quiz = await api.createQuiz(classId, {
        generate: true,
        publish,
        title,
        kpNames: selectedKps,
        composition,
        difficulty,
      });
      setPreview(quiz);
      const c = quiz.composition || composition;
      showToast(
        publish
          ? `已生成并发布「${quiz.title}」（选${c.choice || 0}/填${c.fill || 0}/判${c.judge || 0}/解${c.essay || 0}）`
          : `已生成草稿「${quiz.title}」，可预览后发布`
      );
      refreshNotices?.();
      await reload();
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doPublish = async (id) => {
    setBusy(true);
    try {
      await api.publishQuiz(id);
      showToast('已发布，学生端可见');
      refreshNotices?.();
      await reload();
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const makeReport = async (quizId) => {
    setBusy(true);
    try {
      const r = await api.quizReport(quizId, {});
      setReport(r);
      showToast('已根据学生真实作答生成批改报告');
      refreshNotices?.();
      await reload();
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const genAllComments = async () => {
    if (!report?.id) return;
    setBusy(true);
    try {
      const r = await api.batchComments(report.id);
      setReport(r);
      showToast('评语已生成');
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const genOneComment = async (stu) => {
    if (!report?.id) return;
    setBusy(true);
    try {
      const r = await api.writeComment(report.id, { studentId: stu.studentId, autoAi: true });
      setReport(r.report);
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const s = report?.summary;
  const maxErr = Math.max(1, ...(s?.errorTypes || []).map((e) => e.count || 0));

  return (
    <div>
      <div className="section-title">
        智能批改
        <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          出卷 · 作答 · 自动评测
        </span>
      </div>

      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg,#EFF6FF,#F8FAFC)' }}>
        <div className="card-body" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text)' }}>正确流程：</strong>
          老师分别填写 <strong>选择 / 填空 / 判断 / 解答</strong> 各几道 → 本地 <strong>Codex</strong> 按题型出卷 →
          发布 → 学生作答（解答题支持数学符号）→ 自动判分与<strong>真实错因</strong>。
          解答题为参考答案预评分，可再复核。
        </div>
      </div>

      {/* ① AI 出卷 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>① AI 智能出卷</h3>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, alignItems: 'center' }}>
            <label style={{ fontSize: 13 }}>
              试卷标题{' '}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ marginLeft: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', width: 200 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              难度{' '}
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                style={{ marginLeft: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                <option>基础</option>
                <option>中等</option>
                <option>拔高</option>
              </select>
            </label>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              合计 <strong style={{ color: 'var(--primary)' }}>{totalCount}</strong> 题
            </span>
          </div>

          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            各题型题量（老师自行输入，可为 0）
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}
          >
            {TYPE_FIELDS.map((f) => (
              <div
                key={f.key}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: '#F8FAFC',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{f.hint}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={typeCounts[f.key]}
                    onChange={(e) => setTypeCount(f.key, e.target.value)}
                    onBlur={() => setTypeCount(f.key, clampType(typeCounts[f.key]))}
                    style={{
                      width: 72,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      textAlign: 'center',
                      fontSize: 16,
                      fontWeight: 600,
                    }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>道</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>知识点（可多选）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {KP_OPTIONS.map((kp) => (
              <button
                key={kp}
                type="button"
                className={`btn btn-sm ${selectedKps.includes(kp) ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => toggleKp(kp)}
              >
                {kp}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" disabled={busy || totalCount <= 0} onClick={() => genAndPublish(false)}>
              {busy ? '生成中…' : '仅生成预览'}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || totalCount <= 0} onClick={() => genAndPublish(true)}>
              {busy ? '处理中…' : '生成并发布给学生'}
            </button>
          </div>
        </div>
      </div>

      {/* 预览 */}
      {preview && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3>试卷预览 · {preview.title}</h3>
            <span className="layer-pill b">
              {preview.source === 'ai' ? 'AI 命题' : preview.source === 'mixed' ? 'AI+题库' : '题库命题'}
              {' · '}
              {preview.items?.length} 题 · 满分 {preview.totalScore}
              {preview.composition && (
                <>
                  {' · '}
                  选{preview.composition.choice || 0}/填{preview.composition.fill || 0}/判
                  {preview.composition.judge || 0}/解{preview.composition.essay || 0}
                </>
              )}
            </span>
          </div>
          <div className="card-body">
            {(preview.items || []).map((it) => (
              <div
                key={it.id || it.qno}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 12,
                  background: '#F8FAFC',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  第{it.qno}题 · <strong>{typeLabel(it.type)}</strong> · {it.kp} · {it.score}分 · 参考答案{' '}
                  <strong style={{ color: 'var(--primary)' }}>{it.answer}</strong>
                  {it.commonError && <> · 常见错因 {it.commonError}</>}
                  {it.type === 'essay' && (
                    <span style={{ marginLeft: 6, color: 'var(--warning, #B45309)' }}>（预评分）</span>
                  )}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{it.stem}</div>
                {(it.options || []).map((o) => (
                  <div key={o.key} style={{ fontSize: 13, padding: '4px 0', color: 'var(--text-secondary)' }}>
                    {o.key}. {o.text}
                    {o.errorType && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--danger)' }}>
                        （误选→{o.errorType}）
                      </span>
                    )}
                  </div>
                ))}
                {it.scoringPoints?.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    评分点：{it.scoringPoints.join('；')}
                  </div>
                )}
                {it.analysis && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    解析：{it.analysis}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ② 测验列表 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>② 班级测验 · 回收与报告</h3>
        </div>
        <div className="card-body" style={{ paddingTop: 4 }}>
          {quizzes.length === 0 && (
            <div className="empty-state">还没有测验。请先在上方生成并发布。</div>
          )}
          {quizzes.map((q) => (
            <div
              key={q.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 0',
                borderBottom: '1px solid var(--border)',
                alignItems: 'center',
              }}
            >
              <div>
                <strong style={{ fontSize: 14 }}>{q.title}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span className={`layer-pill ${q.status === 'published' ? 'b' : 'a'}`}>
                    {q.status === 'published' ? '已发布' : '草稿'}
                  </span>
                  {' · '}
                  {q.items?.length || 0} 题 · 已交 {q.attemptCount || 0} 人
                  {q.avgScore != null && ` · 均分 ${q.avgScore}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {q.status !== 'published' && (
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => doPublish(q.id)}>
                    发布
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={busy || !q.attemptCount}
                  onClick={() => makeReport(q.id)}
                  title={!q.attemptCount ? '需有学生提交后才能生成' : ''}
                >
                  生成批改报告
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 报告列表 */}
      {reports.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>批改报告</h3></div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            {reports.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <strong style={{ fontSize: 13 }}>{r.title}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {r.created_at}
                    {r.summary?.source === 'online_quiz' && ' · 在线测验自动评测'}
                    {r.summary?.avgScore != null && ` · 均分 ${r.summary.avgScore}`}
                    {r.summary?.submitted != null && ` · 提交 ${r.summary.submitted}/${r.summary.totalStudents}`}
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${report?.id === r.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setReport(r)}
                >
                  查看
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {s && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{report.title}</strong>
              <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                {s.examName} · 提交 {s.submitted}/{s.totalStudents}
                {s.source === 'online_quiz' && ' · 错因来自真实作答'}
              </span>
            </div>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={genAllComments}>
              批量生成评语
            </button>
          </div>

          <div className="grid-3" style={{ marginBottom: 20 }}>
            {[
              ['提交率', `${Math.round((s.submitRate || 0) * 100)}%`],
              ['班均分', s.avgScore],
              ['正确率', `${Math.round((s.accuracy || 0) * 100)}%`],
            ].map(([label, val]) => (
              <div className="card" key={label}>
                <div className="card-body" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{val}</div>
                </div>
              </div>
            ))}
          </div>

          {s.itemStats?.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header"><h3>逐题正确率（真实作答）</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="student-table">
                  <thead>
                    <tr>
                      <th>题号</th>
                      <th>知识点</th>
                      <th>正确率</th>
                      <th>错因分布</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.itemStats.map((it) => (
                      <tr key={it.qno}>
                        <td>第{it.qno}题</td>
                        <td>
                          <div style={{ fontSize: 12 }}>{it.kp}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 280 }}>{it.stem}</div>
                        </td>
                        <td>
                          <strong style={{ color: (it.correctRate ?? 100) < 60 ? 'var(--danger)' : 'var(--success)' }}>
                            {it.correctRate ?? '—'}%
                          </strong>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                            错 {it.wrongCount}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {Object.entries(it.errorDist || {}).map(([k, v]) => `${k}${v}`).join('、') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="card-header"><h3>错因分布</h3></div>
              <div className="card-body">
                <ul className="error-bars">
                  {(s.errorTypes || []).map((e, i) => (
                    <li className="error-bar-item" key={e.type}>
                      <span className="error-bar-label">{e.type}</span>
                      <div className="error-bar-track">
                        <div
                          className={`error-bar-fill c${(i % 5) + 1}`}
                          style={{ width: `${Math.round(((e.count || 0) / maxErr) * 100)}%` }}
                        >
                          {e.count}
                        </div>
                      </div>
                      <span className="error-bar-pct">{e.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>典型错误</h3></div>
              <div className="card-body">
                {(s.typical || []).map((t, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 0',
                      borderBottom: i < (s.typical.length - 1) ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>
                      第{t.qno}题 · {t.kp}
                      {t.wrongCount != null && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                          {t.wrongCount} 人次
                        </span>
                      )}
                    </strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{t.tip}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>个体详情 · 评语</h3></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="student-table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>得分</th>
                    <th>得分率</th>
                    <th>错题与错因</th>
                    <th>评语</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(s.students || []).map((stu) => (
                    <tr key={stu.studentId}>
                      <td>
                        <span className="name-link" onClick={() => navigate(`/teacher/student/${stu.studentId}`)}>
                          {stu.name}
                        </span>
                      </td>
                      <td>{stu.score}{stu.maxScore != null ? `/${stu.maxScore}` : ''}</td>
                      <td>{stu.rate != null ? `${stu.rate}%` : '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 240 }}>
                        {(stu.wrong || []).length
                          ? (stu.wrong || [])
                              .map((w) => `${w.qno}(${w.errorType}${w.yours != null && w.yours !== '' ? `:选${w.yours}` : ''})`)
                              .join('、')
                          : '全对'}
                      </td>
                      <td style={{ maxWidth: 260, fontSize: 12 }}>{stu.comment || '—'}</td>
                      <td>
                        <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => genOneComment(stu)}>
                          {stu.comment ? '重写' : '评语'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
