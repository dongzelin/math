import React, { useContext, useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api } from '../api';
import { AppContext } from '../App.jsx';

export default function Growth() {
  const { studentId, showToast } = useContext(AppContext);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!studentId) return;
    api.profile(studentId).then(setData).catch((e) => showToast(e.message));
  }, [studentId]);

  if (!data) return <div className="loading">加载成长轨迹…</div>;

  const badges = data.growth.filter((g) => g.event_type === 'badge');

  return (
    <div>
      <div className="section-title">
        成长轨迹
        <span className="badge" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
          持续进步
        </span>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><h3>成绩曲线</h3></div>
          <div className="card-body">
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={data.scoreTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" name="总分" stroke="#2563EB" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>徽章墙</h3></div>
          <div className="card-body">
            <div className="badge-wall">
              {badges.length === 0 && (
                <div className="growth-badge">
                  <div className="growth-badge-icon">🌱</div>
                  <div className="growth-badge-name">起步之星</div>
                  <div className="growth-badge-date">继续打卡解锁</div>
                </div>
              )}
              {badges.map((b) => (
                <div className="growth-badge" key={b.id}>
                  <div className="growth-badge-icon">🏅</div>
                  <div className="growth-badge-name">{b.title}</div>
                  <div className="growth-badge-date">{b.created_at}</div>
                </div>
              ))}
              <div className="growth-badge">
                <div className="growth-badge-icon">🔥</div>
                <div className="growth-badge-name">每日练</div>
                <div className="growth-badge-date">坚持就有</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>事件时间线</h3></div>
        <div className="card-body">
          <div className="timeline">
            {data.growth.length === 0 && <div className="empty-state">暂无事件</div>}
            {data.growth.map((g) => (
              <div className="timeline-item" key={g.id}>
                <div
                  className={`timeline-dot ${
                    g.event_type === 'badge' ? 'purple' : g.event_type === 'practice' ? 'success' : ''
                  }`}
                />
                <div className="timeline-card">
                  <div className="timeline-card-title">{g.title}</div>
                  <div className="timeline-card-desc">{g.detail}</div>
                  <div className="timeline-card-time">{g.created_at}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
