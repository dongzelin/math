import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { AppContext } from '../App.jsx';
import MathAnswerInput from '../components/MathAnswerInput.jsx';

const TYPE_LABEL = {
  choice: '选择',
  fill: '填空',
  judge: '判断',
  essay: '解答',
};

export default function StudentQuiz() {
  const { studentId, showToast, refreshNotices } = useContext(AppContext);
  const [list, setList] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [paper, setPaper] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadList = async () => {
    if (!studentId) return;
    setList(await api.studentQuizzes(studentId));
  };

  useEffect(() => {
    loadList().catch((e) => showToast(e.message));
  }, [studentId]);

  const openQuiz = async (quizId) => {
    setBusy(true);
    setResult(null);
    try {
      const data = await api.studentQuiz(studentId, quizId);
      setActiveId(quizId);
      setPaper(data.quiz);
      setAttempt(data.attempt);
      setAnswers({});
      if (data.attempt?.detail) {
        setResult({
          score: data.attempt.score,
          maxScore: data.attempt.max_score || data.attempt.maxScore,
          detail: data.attempt.detail,
          hasEssayPending: (data.attempt.detail || []).some((d) => d.pendingReview),
        });
      }
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setAns = (key, val) => setAnswers((a) => ({ ...a, [key]: val }));

  const submit = async () => {
    if (!paper) return;
    const unanswered = (paper.items || []).filter((it) => {
      const key = it.id || it.qno;
      return answers[key] == null || String(answers[key]).trim() === '';
    });
    if (unanswered.length) {
      showToast(`还有 ${unanswered.length} 题未作答`);
      return;
    }
    setBusy(true);
    try {
      const r = await api.submitQuiz(studentId, paper.id, answers);
      setResult(r);
      setAttempt({ status: 'submitted', score: r.score });
      showToast(
        r.hasEssayPending
          ? `已评分：${r.score}/${r.maxScore}（含解答题预评分）`
          : `已自动评分：${r.score}/${r.maxScore}`
      );
      refreshNotices?.();
      await loadList();
      const data = await api.studentQuiz(studentId, paper.id);
      setPaper(data.quiz);
      setAttempt(data.attempt);
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!activeId) {
    return (
      <div>
        <div className="section-title">
          在线测验
          <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            作答后自动评分
          </span>
        </div>
        {list.length === 0 && (
          <div className="card">
            <div className="card-body empty-state">
              暂无已发布测验。请教师在「智能批改」中按题型设置题量并 AI 出卷发布。
            </div>
          </div>
        )}
        {list.map((q) => (
          <div className="card" key={q.id} style={{ marginBottom: 12 }}>
            <div className="card-header">
              <h3>{q.title}</h3>
              {q.myAttempt?.status === 'submitted' ? (
                <span className="layer-pill c">已交 · {q.myAttempt.score} 分</span>
              ) : (
                <span className="layer-pill a">待完成</span>
              )}
            </div>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {q.items?.length || 0} 题 · 建议用时 {q.timeLimitMin || 20} 分钟 · 满分 {q.totalScore}
                {q.composition && (
                  <span style={{ marginLeft: 8 }}>
                    （选{q.composition.choice || 0}/填{q.composition.fill || 0}/判
                    {q.composition.judge || 0}/解{q.composition.essay || 0}）
                  </span>
                )}
              </div>
              <button type="button" className="btn btn-primary" onClick={() => openQuiz(q.id)}>
                {q.myAttempt?.status === 'submitted' ? '查看结果' : '开始答题'}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const submitted = attempt?.status === 'submitted' || result?.detail;

  return (
    <div>
      <div className="section-title">
        {paper?.title || '测验'}
        <button
          type="button"
          className="btn btn-sm btn-outline"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            setActiveId(null);
            setPaper(null);
            setResult(null);
          }}
        >
          返回列表
        </button>
      </div>

      {result && (
        <div className="daily-hero" style={{ marginBottom: 16 }}>
          <div>
            <h2>自动评分完成</h2>
            <p>
              选择 / 填空 / 判断已对照标准答案判分；解答题为参考答案预评分
              {result.hasEssayPending ? '（教师可复核）' : ''}。错题已进错题本。
            </p>
          </div>
          <div className="daily-streak">
            <div className="daily-streak-num">{result.score}</div>
            <div className="daily-streak-label">/ {result.maxScore} 分</div>
          </div>
        </div>
      )}

      {(paper?.items || []).map((it, idx) => {
        const key = it.id || it.qno;
        const detail = result?.detail?.find((d) => d.qid === key || d.qno === it.qno);
        const isChoiceLike = it.type === 'choice' || it.type === 'judge' || ((it.options || []).length > 0 && it.type !== 'fill' && it.type !== 'essay');
        const isEssay = it.type === 'essay';
        const isFill = it.type === 'fill' || (!isChoiceLike && !isEssay);

        return (
          <div className="daily-q-card" key={key}>
            <div className="daily-q-head">
              <span className="layer-pill b">
                第 {it.qno || idx + 1} 题 · {TYPE_LABEL[it.type] || it.type || '题'} · {it.kp} · {it.score}分
              </span>
              {detail && (
                <span className={`layer-pill ${detail.correct ? 'c' : 'a'}`}>
                  {detail.correct ? '正确' : `错误 · ${detail.errorType || ''}`}
                  {detail.pendingReview ? ' · 预评' : ''}
                </span>
              )}
            </div>
            <div className="daily-q-body" style={{ whiteSpace: 'pre-wrap' }}>{it.stem}</div>

            {isChoiceLike ? (
              <div className="daily-options">
                {(it.options || []).map((op) => {
                  let cls = 'daily-opt';
                  const selected = answers[key] === op.key || answers[key] === op.text;
                  if (selected) cls += ' selected';
                  if (detail) {
                    if (op.key === detail.answer || op.text === detail.answer) cls += ' correct';
                    else if (selected && !detail.correct) cls += ' wrong';
                  }
                  return (
                    <div
                      key={op.key}
                      className={cls}
                      onClick={() => {
                        if (submitted) return;
                        setAns(key, op.key);
                      }}
                    >
                      <strong style={{ marginRight: 8 }}>{op.key}.</strong> {op.text}
                    </div>
                  );
                })}
              </div>
            ) : (
              <MathAnswerInput
                multiline={isEssay}
                disabled={!!submitted}
                value={answers[key] || ''}
                onChange={(v) => setAns(key, v)}
                placeholder={
                  isEssay
                    ? '书写解题过程与最终答案；可点上方符号插入 √ π ≤ 等…'
                    : '填写答案；可点符号插入 √ π ² 等'
                }
                rows={isEssay ? 6 : 2}
                minHeight={isEssay ? 140 : 40}
              />
            )}

            {detail && !detail.correct && (
              <div className="daily-result show bad">
                你的答案：{detail.yours || '未作答'} · 参考答案：{detail.answer}
                {detail.errorType && ` · 错因：${detail.errorType}`}
                {detail.score != null && detail.maxScore != null && detail.score > 0 && !detail.correct && (
                  <span> · 得分 {detail.score}/{detail.maxScore}</span>
                )}
                {detail.analysis && (
                  <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>解析：{detail.analysis}</div>
                )}
              </div>
            )}
            {detail?.correct && detail.analysis && (
              <div className="daily-result show ok" style={{ whiteSpace: 'pre-wrap' }}>
                解析：{detail.analysis}
              </div>
            )}
          </div>
        );
      })}

      {!submitted && (
        <button type="button" className="btn btn-primary" disabled={busy} style={{ padding: '10px 22px' }} onClick={submit}>
          {busy ? '提交中…' : '提交并自动评分'}
        </button>
      )}
    </div>
  );
}
