import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function Diagnosis() {
  const { classId, showToast } = useContext(AppContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    if (!classId) return;
    setLoading(true);
    try {
      setData(await api.diagnosis(classId));
    } catch (e) {
      showToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [classId]);

  if (loading) return <div className="loading">加载学情…</div>;
  if (!data) return <div className="empty-state">暂无数据，请先 seed</div>;

  const matrix = data.heatmapMatrix || {
    columns: ['概念理解', '方法运用', '计算操作', '迁移应用', '综合创新'],
    rows: [],
  };

  return (
    <div>
      <div className="section-title">
        学情总览
        <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          {data.class?.name || '班级'}
        </span>
        {data.exam && (
          <span className="badge" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
            {data.exam.name}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={async () => {
            await api.recomputeLayers(classId);
            showToast('已按最近考试分位重算 A/B/C');
            load();
          }}
          >
            重算分层
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={load}>刷新</button>
        </div>
      </div>

      <div className="grid-2-1" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <h3>📊 知识掌握热力图</h3>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="btn btn-sm btn-outline">班级视图</button>
              <button type="button" className="btn btn-sm btn-outline">对比视图</button>
            </div>
          </div>
          <div className="card-body">
            {/* 固定 1 列章节标签 + 5 列能力维度，对齐原型 */}
            <div className="heatmap-grid heatmap-matrix">
              <div className="heatmap-header heatmap-corner" />
              {matrix.columns.map((col) => (
                <div className="heatmap-header" key={col}>{col}</div>
              ))}
              {matrix.rows.map((row) => (
                <React.Fragment key={row.chapter}>
                  <div className="heatmap-label" title={`章节均分约 ${row.base}%`}>
                    {row.chapter}
                  </div>
                  {row.cells.map((cell) => (
                    <div
                      key={`${row.chapter}-${cell.dim}`}
                      className={`heatmap-cell ${heatClass(cell.rate)}`}
                      title={`${row.chapter} · ${cell.dim}：${cell.rate}%\n关联：${cell.kpName}\n点击去分层出练`}
                      onClick={() =>
                        navigate(`/teacher/layered?kp=${encodeURIComponent(cell.kpName)}`)
                      }
                    >
                      {cell.rate}%
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
            {!matrix.rows.length && <div className="empty-state">无热力数据</div>}
            <div className="heatmap-footer">
              <div className="heatmap-legend">
                <span className="heatmap-legend-item"><i className="lg green" />优秀 ≥85%</span>
                <span className="heatmap-legend-item"><i className="lg lgreen" />良好 75–84%</span>
                <span className="heatmap-legend-item"><i className="lg yellow" />一般 60–74%</span>
                <span className="heatmap-legend-item"><i className="lg orange" />偏弱 45–59%</span>
                <span className="heatmap-legend-item"><i className="lg red" />薄弱 &lt;45%</span>
              </div>
              <div className="heatmap-hint">行=知识模块 · 列=能力维度 · 点击色块进入分层出练</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>⚠️ 薄弱 Top5</h3>
          </div>
          <div className="card-body">
            <ul className="weak-list">
              {data.topWeak.map((w, i) => (
                <li className="weak-item" key={w.kpId}>
                  <span className={`weak-rank r${Math.min(i + 1, 5)}`}>{i + 1}</span>
                  <span className="weak-name">{w.name}</span>
                  <span className={`weak-pct ${w.rate < 55 ? 'danger' : 'warning'}`}>{w.rate}%</span>
                  <div className="weak-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => navigate(`/teacher/layered?kp=${encodeURIComponent(w.name)}`)}
                    >
                      出题
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => navigate(`/teacher/layered?kp=${encodeURIComponent(w.name)}`)}
                    >
                      分层
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <h3>📈 学情趋势</h3>
          </div>
          <div className="card-body">
            <div className="trend-container" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avg" name="班均分" stroke="#2563EB" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>👥 分层概览</h3>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate('/teacher/classes')}>
              管理班级 →
            </button>
          </div>
          <div className="card-body">
            <div className="grid-3" style={{ marginBottom: 16 }}>
              {['A', 'B', 'C'].map((L) => (
                <div key={L} className={`layer-card ${L.toLowerCase()}`}>
                  <div className="layer-card-header">{L} 档 · {data.layerCount[L] || 0} 人</div>
                  <div className="layer-card-body">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {data.students
                        .filter((s) => s.layer === L)
                        .slice(0, 6)
                        .map((s) => (
                          <span
                            key={s.id}
                            className="name-chip"
                            onClick={() => navigate(`/teacher/student/${s.id}`)}
                          >
                            {s.name}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="table-wrap">
              <table className="student-table">
                <thead>
                  <tr>
                    <th>学号</th>
                    <th>姓名</th>
                    <th>分层</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.id}>
                      <td>{s.student_no}</td>
                      <td>
                        <span className="name-link" onClick={() => navigate(`/teacher/student/${s.id}`)}>
                          {s.name}
                        </span>
                      </td>
                      <td>
                        <span className={`layer-pill ${s.layer.toLowerCase()}`}>{s.layer}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => navigate(`/teacher/student/${s.id}`)}
                        >
                          档案
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
