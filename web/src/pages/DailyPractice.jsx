import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { AppContext } from '../App.jsx';

export default function DailyPractice() {
  const { studentId, showToast } = useContext(AppContext);
  const [practice, setPractice] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    api
      .daily(studentId)
      .then((p) => {
        setPractice(p);
        setResult(p.status === 'done' ? { score: p.score } : null);
      })
      .catch((e) => showToast(e.message));
  }, [studentId]);

  if (!practice) return <div className="loading">准备每日练…</div>;

  return (
    <div>
      <div className="daily-hero">
        <div>
          <h2>每日练 · {practice.practice_date}</h2>
          <p>按薄弱点推荐 1–3 题，客观题提交即批；错题自动进入错题本。</p>
        </div>
        <div className="daily-streak">
          <div className="daily-streak-num">{result?.score ?? '—'}</div>
          <div className="daily-streak-label">{result ? '今日得分' : '待完成'}</div>
        </div>
      </div>

      {(practice.items || []).map((it, idx) => {
        const detail = result?.detail?.find((d) => d.id === it.id);
        return (
          <div className="daily-q-card" key={it.id}>
            <div className="daily-q-head">
              <span className="layer-pill b">第 {idx + 1} 题 · {it.kp}</span>
              {detail && (
                <span className={`layer-pill ${detail.ok ? 'c' : 'a'}`}>
                  {detail.ok ? '正确' : '错误'}
                </span>
              )}
            </div>
            <div className="daily-q-body">{it.stem}</div>
            <div className="daily-options">
              {(it.options || []).map((op) => {
                let cls = 'daily-opt';
                if (answers[it.id] === op) cls += ' selected';
                if (detail) {
                  if (op === it.answer) cls += ' correct';
                  else if (answers[it.id] === op && !detail.ok) cls += ' wrong';
                }
                return (
                  <div
                    key={op}
                    className={cls}
                    onClick={() => {
                      if (practice.status === 'done') return;
                      setAnswers((a) => ({ ...a, [it.id]: op }));
                    }}
                  >
                    {op}
                  </div>
                );
              })}
            </div>
            {detail && !detail.ok && (
              <div className="daily-result show bad">
                正确答案：{detail.answer}
              </div>
            )}
          </div>
        );
      })}

      {practice.status !== 'done' && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          style={{ padding: '10px 20px', fontSize: 14 }}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.submitDaily(studentId, answers);
              setResult(r);
              setPractice((p) => ({ ...p, status: 'done', score: r.score }));
              showToast(`提交完成，得分 ${r.score}`);
            } catch (e) {
              showToast(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          提交批改
        </button>
      )}
    </div>
  );
}
