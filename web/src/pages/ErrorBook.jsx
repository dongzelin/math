import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { AppContext } from '../App.jsx';

export default function ErrorBook() {
  const { studentId, showToast } = useContext(AppContext);
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('全部');

  useEffect(() => {
    if (!studentId) return;
    api.errors(studentId).then(setList).catch((e) => showToast(e.message));
  }, [studentId]);

  const types = ['全部', ...Array.from(new Set(list.map((x) => x.error_type).filter(Boolean)))];
  const shown = filter === '全部' ? list : list.filter((x) => x.error_type === filter);

  return (
    <div>
      <div className="section-title">
        错题本
        <span className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
          {shown.length} 题
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
          >
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {shown.length === 0 && (
        <div className="card">
          <div className="card-body empty-state">暂无错题，去做每日练或等批改入库</div>
        </div>
      )}

      {shown.map((e) => (
        <div className="card" key={e.id} style={{ marginBottom: 12 }}>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>{e.kp_name || '知识点'}</strong>
              <span className="layer-pill a">{e.error_type}</span>
              <span className="layer-pill b">{e.source}</span>
            </div>
            <p style={{ fontSize: 14, margin: '0 0 8px', lineHeight: 1.6 }}>{e.question}</p>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              我的作答：{e.wrong_answer || '—'} · 正解：{e.correct_answer || '—'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
