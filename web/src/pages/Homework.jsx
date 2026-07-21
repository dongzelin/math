import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { AppContext } from '../App.jsx';

export default function Homework() {
  const { studentId, showToast } = useContext(AppContext);
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null);

  const load = () =>
    api.studentHomework(studentId).then(setList).catch((e) => showToast(e.message));

  useEffect(() => {
    if (studentId) load();
  }, [studentId]);

  return (
    <div>
      <div className="section-title">
        分层作业
        <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          {list.length} 份
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <button type="button" className="btn btn-outline" onClick={load}>刷新</button>
        </div>
      </div>

      {list.length === 0 && (
        <div className="card">
          <div className="card-body empty-state">暂无作业。请教师在「分层教学」生成并推送。</div>
        </div>
      )}

      {list.map((hw) => (
        <div className="card" key={hw.id} style={{ marginBottom: 12 }}>
          <div className="card-header">
            <h3>
              {hw.title}{' '}
              <span className={`layer-pill ${String(hw.layer).toLowerCase()}`}>{hw.layer} 档</span>
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {hw.status === 'submitted' ? '已完成' : '待完成'} · {hw.push_at}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setActive(active?.id === hw.id ? null : hw)}
              >
                {active?.id === hw.id ? '收起' : '查看'}
              </button>
            </div>
          </div>
          {active?.id === hw.id && (
            <div className="card-body">
              {(hw.items || []).map((it, i) => (
                <div
                  key={i}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 10,
                    fontSize: 13,
                  }}
                >
                  <div style={{ marginBottom: 6, lineHeight: 1.5 }}>{it.stem}</div>
                  {hw.status === 'submitted' && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>参考：{it.answer}</div>
                  )}
                </div>
              ))}
              {hw.status === 'pending' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    await api.submitHomework(hw.id, { done: true });
                    showToast('已提交');
                    load();
                    setActive(null);
                  }}
                >
                  标记完成并提交
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
