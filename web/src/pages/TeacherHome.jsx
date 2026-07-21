import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppContext } from '../App.jsx';

export default function TeacherHome() {
  const { classId, meta, showToast } = useContext(AppContext);
  const [data, setData] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!classId) return;
    Promise.all([api.diagnosis(classId), api.quizzes(classId)])
      .then(([diagnosis, quizList]) => {
        setData(diagnosis);
        setQuizzes(quizList);
      })
      .catch((error) => showToast(error.message));
  }, [classId]);

  const className = data?.class?.name || meta?.demo_class_name || '高一（3）班';
  const studentCount = data?.students?.length || 0;
  const weakCount = data?.topWeak?.length || 0;
  const publishedCount = quizzes.filter((quiz) => quiz.status === 'published').length;

  return (
    <div className="role-home teacher-home">
      <section className="role-home-banner">
        <div>
          <p className="role-home-eyebrow">教师工作台 · {className}</p>
          <h1>上午好，张老师</h1>
          <p>今天从班级的薄弱点开始，把教学安排落到每一位学生的真实作答上。</p>
        </div>
        <div className="role-home-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/teacher/diagnosis')}>查看学情</button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/teacher/grading')}>发布测验</button>
        </div>
      </section>

      <section className="home-metrics" aria-label="班级概览">
        <div className="home-metric"><span>班级学生</span><strong>{studentCount}</strong><small>当前班级</small></div>
        <div className="home-metric"><span>薄弱知识点</span><strong>{weakCount}</strong><small>优先安排巩固</small></div>
        <div className="home-metric"><span>已发布测验</span><strong>{publishedCount}</strong><small>等待学生作答</small></div>
        <div className="home-metric"><span>待处理通知</span><strong>{data?.topWeak?.filter((item) => item.rate < 60).length || 0}</strong><small>需要关注</small></div>
      </section>

      <section className="home-grid">
        <div className="card home-card">
          <div className="card-header"><h3>今天要做什么</h3></div>
          <div className="card-body home-task-list">
            <button type="button" className="home-task" onClick={() => navigate('/teacher/diagnosis')}><span className="task-index">01</span><span><b>查看班级学情</b><em>定位薄弱维度与重点学生</em></span><i>→</i></button>
            <button type="button" className="home-task" onClick={() => navigate('/teacher/layered')}><span className="task-index">02</span><span><b>安排分层练习</b><em>按 A / B / C 档推送练习</em></span><i>→</i></button>
            <button type="button" className="home-task" onClick={() => navigate('/teacher/grading')}><span className="task-index">03</span><span><b>创建在线测验</b><em>按题型发布并生成批改报告</em></span><i>→</i></button>
          </div>
        </div>
        <div className="card home-card">
          <div className="card-header"><h3>当前薄弱点</h3><button type="button" className="btn btn-sm btn-outline" onClick={() => navigate('/teacher/diagnosis')}>全部学情</button></div>
          <div className="card-body">
            <div className="home-weak-list">
              {(data?.topWeak || []).slice(0, 4).map((item, index) => <div className="home-weak" key={item.kpId || item.name}><span>{index + 1}</span><b>{item.name}</b><div><i><i style={{ width: `${item.rate}%` }} /></i><em>{item.rate}%</em></div></div>)}
              {!data && <div className="empty-state">加载班级数据中…</div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
