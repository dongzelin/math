import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import Diagnosis from './pages/Diagnosis.jsx';
import Layered from './pages/Layered.jsx';
import Grading from './pages/Grading.jsx';
import Classes from './pages/Classes.jsx';
import StudentArchive from './pages/StudentArchive.jsx';
import MyLearning from './pages/MyLearning.jsx';
import DailyPractice from './pages/DailyPractice.jsx';
import Homework from './pages/Homework.jsx';
import ErrorBook from './pages/ErrorBook.jsx';
import Growth from './pages/Growth.jsx';
import StudentQuiz from './pages/StudentQuiz.jsx';
import Login from './pages/Login.jsx';
import TeacherHome from './pages/TeacherHome.jsx';
import StudentHome from './pages/StudentHome.jsx';

export const AppContext = React.createContext(null);

function getStoredSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem('zhixueban_session') || 'null');
    return session?.role ? session : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState(getStoredSession);
  const [role, setRole] = useState(() => getStoredSession()?.role || null);
  const [meta, setMeta] = useState(null);
  const [classId, setClassId] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [notices, setNotices] = useState([]);
  const [showNoti, setShowNoti] = useState(false);
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  const loadNotices = async (r, m, activeSession = session) => {
    if (!m || !activeSession) return;
    const q =
      r === 'teacher'
        ? { audience: 'teacher', userId: activeSession.teacherId, classId: activeSession.classId }
        : { audience: 'student', userId: activeSession.studentId, classId: activeSession.classId };
    try {
      setNotices(await api.notifications(q));
    } catch {
      setNotices([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const m = await api.demoMeta();
        setMeta(m);
        const storedSession = getStoredSession();
        setClassId(storedSession?.classId || m.demo_class_id);
        setStudentId(storedSession?.studentId || m.demo_student_id);
        const storedRole = storedSession?.role;
        if (storedRole) await loadNotices(storedRole, m, storedSession);
      } catch {
        showToast('后端未就绪：请先启动 server 并 seed');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (role && meta) loadNotices(role, meta);
  }, [role, meta]);

  const unread = notices.filter((n) => !n.is_read).length;

  const ctx = useMemo(
    () => ({
      role,
      classId,
      studentId,
      setStudentId,
      meta,
      showToast,
      user: session,
      refreshNotices: () => loadNotices(role, meta),
    }),
    [role, classId, studentId, meta, session]
  );

  const teacherNav = [
    ['主页', '/teacher/home'],
    ['📊 学情诊断', '/teacher/diagnosis'],
    ['📚 分层教学', '/teacher/layered'],
    ['✍️ 智能批改', '/teacher/grading'],
    ['👥 班级管理', '/teacher/classes'],
  ];
  const studentNav = [
    ['主页', '/student/home'],
    ['🎯 我的学情', '/student/profile'],
    ['📝 在线测验', '/student/quiz'],
    ['📅 每日练', '/student/daily'],
    ['📚 分层作业', '/student/homework'],
    ['❌ 错题本', '/student/errors'],
    ['📈 成长轨迹', '/student/growth'],
  ];
  const nav = role === 'teacher' ? teacherNav : studentNav;

  const enterWorkspace = (nextSession) => {
    sessionStorage.setItem('zhixueban_session', JSON.stringify(nextSession));
    setSession(nextSession);
    setRole(nextSession.role);
    setClassId(nextSession.classId || meta?.demo_class_id || null);
    if (nextSession.studentId) setStudentId(nextSession.studentId);
    navigate(nextSession.role === 'teacher' ? '/teacher/home' : '/student/home');
  };

  const logout = () => {
    sessionStorage.removeItem('zhixueban_session');
    setSession(null);
    setRole(null);
    setShowNoti(false);
    navigate('/login');
  };

  const teacherRoute = (page) =>
    role === 'teacher' ? page : <Navigate to="/student/home" replace />;
  const studentRoute = (page) =>
    role === 'student' ? page : <Navigate to="/teacher/home" replace />;

  if (!ready) return <div className="loading">加载中…</div>;

  if (!role) {
    return (
      <AppContext.Provider value={{ meta, showToast }}>
        <Routes>
          <Route path="/login" element={<Login onLogin={enterWorkspace} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        {toast && <div className="toast">{toast}</div>}
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="app-shell">
        <nav className="topnav">
          <div className="topnav-brand">
            <span>🎓</span> 智学伴
          </div>

          <div className="topnav-tabs">
            {nav.map(([label, to]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `topnav-tab${isActive ? ' active' : ''}`}
              >
                {label}
              </NavLink>
            ))}
          </div>

          <div className="topnav-right">
            <div className="notif-wrap">
              <button
                type="button"
                className="notif-bell"
                title="通知"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNoti((v) => !v);
                }}
              >
                🔔
                {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
              </button>
              <div className={`notif-panel${showNoti ? ' open' : ''}`}>
                <div className="notif-panel-header">
                  <span>通知中心</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={async () => {
                      await Promise.all(notices.filter((n) => !n.is_read).map((n) => api.readNoti(n.id)));
                      loadNotices(role, meta);
                    }}
                  >
                    全部已读
                  </button>
                </div>
                <div className="notif-list">
                  {notices.length === 0 && <div className="empty-state">暂无通知</div>}
                  {notices.map((n) => (
                    <div
                      key={n.id}
                      className={`notif-item${n.is_read ? '' : ' unread'}`}
                      onClick={async () => {
                        await api.readNoti(n.id);
                        loadNotices(role, meta);
                        if (n.link) navigate(n.link);
                        setShowNoti(false);
                      }}
                    >
                      <div className="notif-icon" style={{ background: '#DBEAFE' }}>
                        📩
                      </div>
                      <div className="notif-body">
                        <div className="notif-title">{n.title}</div>
                        <div className="notif-desc">{n.body}</div>
                        <div className="notif-time">{n.created_at}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="topnav-user">
              <span className="topnav-role">{role === 'teacher' ? '教师' : '学生'}</span>
              <div className="avatar">{session?.name?.[0] || (role === 'teacher' ? '教' : '学')}</div>
              <span>{session?.name || (role === 'teacher' ? '教师账号' : '学生账号')}</span>
              <button type="button" className="topnav-logout" onClick={logout}>退出</button>
            </div>
          </div>
        </nav>

        <div className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to={role === 'teacher' ? '/teacher/home' : '/student/home'} replace />} />
            <Route path="/teacher/home" element={teacherRoute(<TeacherHome />)} />
            <Route path="/teacher/diagnosis" element={teacherRoute(<Diagnosis />)} />
            <Route path="/teacher/layered" element={teacherRoute(<Layered />)} />
            <Route path="/teacher/grading" element={teacherRoute(<Grading />)} />
            <Route path="/teacher/classes" element={teacherRoute(<Classes />)} />
            <Route path="/teacher/student/:id" element={teacherRoute(<StudentArchive />)} />
            <Route path="/student/home" element={studentRoute(<StudentHome />)} />
            <Route path="/student/profile" element={studentRoute(<MyLearning />)} />
            <Route path="/student/quiz" element={studentRoute(<StudentQuiz />)} />
            <Route path="/student/daily" element={studentRoute(<DailyPractice />)} />
            <Route path="/student/homework" element={studentRoute(<Homework />)} />
            <Route path="/student/errors" element={studentRoute(<ErrorBook />)} />
            <Route path="/student/growth" element={studentRoute(<Growth />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    </AppContext.Provider>
  );
}
