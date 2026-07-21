import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppContext } from '../App.jsx';

function heatClass(rate) {
  if (rate >= 85) return 'green';
  if (rate >= 75) return 'lgreen';
  if (rate >= 60) return 'yellow';
  if (rate >= 45) return 'orange';
  return 'red';
}

export default function MyLearning() {
  const { studentId, showToast } = useContext(AppContext);
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!studentId) return;
    api.profile(studentId).then(setData).catch((e) => showToast(e.message));
  }, [studentId]);

  if (!data) return <div className="loading">加载我的学情…</div>;
  const s = data.student;

  return (
    <div>
      <div className="section-title">
        我的学情
        <span className={`layer-pill ${s.layer.toLowerCase()}`}>{s.layer} 档</span>
        <div style={{ marginLeft: 'auto' }}>
          <button type="button" className="btn btn-gradient" onClick={() => navigate('/student/daily')}>
            去做每日练
          </button>
        </div>
      </div>

      <div className="profile-header" style={{ marginBottom: 20 }}>
        <div className="profile-avatar">{s.name?.[0]}</div>
        <div className="profile-info">
          <div className="profile-name">{s.name}</div>
          <div className="profile-meta">
            <span>{data.class?.name}</span>
            <span>当前分层 {s.layer}</span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><h3>个人热力</h3></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
              {data.personalHeat.map((h) => (
                <div key={h.kpId} className={`heatmap-cell ${heatClass(h.rate)}`}>
                  <div style={{ fontSize: 11, marginBottom: 4 }}>{h.name}</div>
                  <div style={{ fontWeight: 700 }}>{h.rate}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>薄弱建议</h3></div>
          <div className="card-body">
            <ul className="weak-list">
              {data.weak.map((w, i) => (
                <li className="weak-item" key={w.kpId}>
                  <span className={`weak-rank r${Math.min(i + 1, 5)}`}>{i + 1}</span>
                  <span className="weak-name">{w.name}</span>
                  <span className={`weak-pct ${w.rate < 55 ? 'danger' : 'warning'}`}>{w.rate}%</span>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
              建议先复习概念再练变式，可从「每日练」开始。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
