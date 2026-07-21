import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api } from '../api';
import { AppContext } from '../App.jsx';

function heatClass(rate) {
  if (rate >= 85) return 'green';
  if (rate >= 75) return 'lgreen';
  if (rate >= 60) return 'yellow';
  if (rate >= 45) return 'orange';
  return 'red';
}

export default function StudentArchive() {
  const { id } = useParams();
  const { showToast } = useContext(AppContext);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [diag, setDiag] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setError('');
    setData(await api.profile(id));
  };

  useEffect(() => {
    setData(null);
    load().catch((e) => {
      setError(e.message);
      showToast(e.message);
    });
  }, [id]);

  if (error) {
    return <div className="empty-state">学生档案不存在或无权访问</div>;
  }
  if (!data) return <div className="loading">加载档案…</div>;
  const s = data.student;

  return (
    <div>
      <div className="profile-header">
        <div className="profile-avatar">{s.name?.[0] || '?'}</div>
        <div className="profile-info">
          <div className="profile-name">
            {s.name}{' '}
            <span className={`layer-pill ${s.layer.toLowerCase()}`}>{s.layer} 档</span>
          </div>
          <div className="profile-meta">
            <span>{data.class?.name}</span>
            <span>学号 {s.student_no}</span>
          </div>
        </div>
        <div className="profile-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>返回</button>
          {['A', 'B', 'C'].map((L) => (
            <button
              key={L}
              type="button"
              className={`btn btn-sm ${s.layer === L ? 'btn-primary' : 'btn-outline'}`}
              onClick={async () => {
                await api.setLayer(s.id, L);
                showToast(`已调至 ${L} 档`);
                load();
              }}
            >
              调至 {L}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              navigate(`/teacher/layered?kp=${encodeURIComponent(data.weak[0]?.name || '函数单调性')}`)
            }
          >
            推送练习
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><h3>个人掌握热力</h3></div>
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
          <div className="card-header"><h3>成绩趋势</h3></div>
          <div className="card-body">
            <div style={{ width: '100%', height: 220 }}>
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
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>诊断结论</h3>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api.diagnosisText({
                    studentName: s.name,
                    layer: s.layer,
                    weak: data.weak,
                    trendNote: '近几次成绩略有波动',
                  });
                  setDiag(r.text);
                  showToast('诊断已生成');
                } finally {
                  setBusy(false);
                }
              }}
            >
              生成
            </button>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>
              {diag || '点击「生成」输出一段诊断建议（非连续对话）。'}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>近期错题</h3></div>
          <div className="card-body">
            {data.errors.length === 0 && <div className="empty-state">暂无错题</div>}
            {data.errors.map((e) => (
              <div
                key={e.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 10,
                  padding: '10px 0', borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <strong style={{ fontSize: 13 }}>{e.kp_name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.question}</div>
                </div>
                <span className="layer-pill b">{e.error_type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
