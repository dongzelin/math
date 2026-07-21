import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppContext } from '../App.jsx';

export default function StudentHome() {
  const { studentId, showToast } = useContext(AppContext);
  const [profile, setProfile] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [homework, setHomework] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!studentId) return;
    Promise.all([api.profile(studentId), api.studentQuizzes(studentId), api.studentHomework(studentId)])
      .then(([profileData, quizList, homeworkList]) => {
        setProfile(profileData);
        setQuizzes(quizList);
        setHomework(homeworkList);
      })
      .catch((error) => showToast(error.message));
  }, [studentId]);

  const student = profile?.student;
  const weak = profile?.weak || [];
  const pendingQuizzes = quizzes.filter((quiz) => !quiz.submitted).length;
  const pendingHomework = homework.filter((item) => !item.submitted_at).length;

  return (
    <div className="role-home student-home">
      <section className="role-home-banner student-banner">
        <div>
          <p className="role-home-eyebrow">学生学习空间 · {profile?.class?.name || '高一（3）班'}</p>
          <h1>{student ? `${student.name}，继续加油` : '继续你的学习'}</h1>
          <p>完成一小步练习，及时看见自己的掌握情况。</p>
        </div>
        <div className="role-home-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/student/profile')}>我的学情</button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/student/daily')}>开始每日练</button>
        </div>
      </section>

      <section className="home-metrics" aria-label="学习概览">
        <div className="home-metric"><span>当前分层</span><strong>{student?.layer || '-'}</strong><small>按最近作答更新</small></div>
        <div className="home-metric"><span>待完成测验</span><strong>{pendingQuizzes}</strong><small>进入在线测验</small></div>
        <div className="home-metric"><span>待完成作业</span><strong>{pendingHomework}</strong><small>分层练习任务</small></div>
        <div className="home-metric"><span>优先巩固</span><strong>{weak.length}</strong><small>个知识点</small></div>
      </section>

      <section className="home-grid">
        <div className="card home-card">
          <div className="card-header"><h3>接下来做什么</h3></div>
          <div className="card-body home-task-list">
            <button type="button" className="home-task" onClick={() => navigate('/student/quiz')}><span className="task-index">01</span><span><b>完成在线测验</b><em>{pendingQuizzes ? `还有 ${pendingQuizzes} 份测验等待作答` : '查看已发布测验与作答结果'}</em></span><i>→</i></button>
            <button type="button" className="home-task" onClick={() => navigate('/student/daily')}><span className="task-index">02</span><span><b>做一组每日练</b><em>围绕薄弱知识点安排巩固</em></span><i>→</i></button>
            <button type="button" className="home-task" onClick={() => navigate('/student/errors')}><span className="task-index">03</span><span><b>回顾错题本</b><em>根据真实错因整理复习重点</em></span><i>→</i></button>
          </div>
        </div>
        <div className="card home-card">
          <div className="card-header"><h3>优先巩固</h3><button type="button" className="btn btn-sm btn-outline" onClick={() => navigate('/student/profile')}>查看学情</button></div>
          <div className="card-body">
            <div className="home-weak-list">
              {weak.slice(0, 4).map((item, index) => <div className="home-weak" key={item.kpId || item.name}><span>{index + 1}</span><b>{item.name}</b><div><i><i style={{ width: `${item.rate}%` }} /></i><em>{item.rate}%</em></div></div>)}
              {!profile && <div className="empty-state">加载学习数据中…</div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
