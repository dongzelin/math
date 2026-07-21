import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppContext } from '../App.jsx';

export default function Classes() {
  const { classId, showToast } = useContext(AppContext);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [name, setName] = useState('');
  const [stuName, setStuName] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setClasses(await api.classes());
    if (classId) setStudents(await api.students(classId));
  };

  useEffect(() => {
    load().catch((e) => showToast(e.message));
  }, [classId]);

  return (
    <div>
      <div className="section-title">
        班级管理
        <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          {classes.length} 个班级
        </span>
      </div>

      <div className="class-grid" style={{ marginBottom: 24 }}>
        {classes.map((c) => (
          <div className="class-card" key={c.id}>
            <div className="class-card-title">{c.name}</div>
            <div className="class-card-meta">
              <span>{c.grade}</span>
              <span>{c.subject}</span>
              {c.id === classId && <span style={{ color: 'var(--primary)' }}>当前演示班</span>}
            </div>
            <div className="class-card-stats">
              <div className="class-stat">
                <div className="class-stat-num">{c.id === classId ? students.length : '—'}</div>
                <div className="class-stat-label">学生</div>
              </div>
              <div className="class-stat">
                <div className="class-stat-num">3</div>
                <div className="class-stat-label">考试</div>
              </div>
            </div>
            <div className="class-card-actions">
              <button type="button" className="btn btn-sm btn-primary">进入</button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate('/teacher/diagnosis')}>
                学情
              </button>
            </div>
          </div>
        ))}
        <div className="class-card" style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="新班级名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (!name.trim()) return;
                await api.createClass({ name: name.trim() });
                setName('');
                showToast('已创建班级');
                load();
              }}
            >
              新建
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>学生名单</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="姓名"
              value={stuName}
              onChange={(e) => setStuName(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={async () => {
                if (!stuName.trim() || !classId) return;
                await api.addStudent(classId, { name: stuName.trim() });
                setStuName('');
                showToast('已添加学生');
                load();
              }}
            >
              添加
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={async () => {
                await api.recomputeLayers(classId);
                showToast('已重算分层');
                load();
              }}
            >
              重算分层
            </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="student-table">
            <thead>
              <tr>
                <th>学号</th>
                <th>姓名</th>
                <th>分层</th>
                <th>课代表</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.student_no}</td>
                  <td>
                    <span className="name-link" onClick={() => navigate(`/teacher/student/${s.id}`)}>
                      {s.name}
                    </span>
                  </td>
                  <td><span className={`layer-pill ${s.layer.toLowerCase()}`}>{s.layer}</span></td>
                  <td>{s.is_monitor ? '是' : '—'}</td>
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
  );
}
