import React, { useState } from 'react';
import { api } from '../api';

const roles = {
  teacher: {
    title: '教师工作台登录',
    subtitle: '进入班级教学与学情管理空间',
    accountLabel: '教工号',
    accountPlaceholder: '请输入教工号',
    entry: '班级学情、分层教学、在线测验',
    mark: '教',
  },
  student: {
    title: '学生学习空间登录',
    subtitle: '进入个人学习与作答空间',
    accountLabel: '学号',
    accountPlaceholder: '请输入学号',
    entry: '个人学情、每日练、错题整理',
    mark: '学',
  },
};

export default function Login({ onLogin }) {
  const [role, setRole] = useState('teacher');
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const current = roles[role];

  const submit = async (event) => {
    event.preventDefault();
    if (mode === 'register' && !name.trim()) {
      setError('请填写姓名');
      return;
    }
    if (!account.trim() || !password.trim()) {
      setError('请填写账号和密码');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const user = mode === 'login'
        ? await api.login({ role, account, password })
        : await api.register({ role, name, account, password });
      onLogin(user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const changeRole = (nextRole) => {
    setRole(nextRole);
    setError('');
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setConfirmPassword('');
  };

  return (
    <main className="login-page">
      <header className="login-topbar">
        <div className="topnav-brand"><span>🎓</span>智学伴</div>
        <span className="login-topbar-meta">高中数学学习支持平台</span>
      </header>

      <section className="login-main" aria-label="登录">
        <div className="login-page-title">
          <h1>登录智学伴</h1>
          <p>选择身份后进入对应的学习或教学工作台</p>
        </div>

        <div className="login-layout">
          <section className="login-role-panel" aria-label="身份选择">
            <div className="login-panel-title">
              <span>选择身份</span>
              <small>选择适用的工作空间</small>
            </div>
            <div className="login-role-options" role="tablist" aria-label="身份选择">
              {Object.entries(roles).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={role === key}
                  className={role === key ? 'active' : ''}
                  onClick={() => changeRole(key)}
                >
                  <span className="login-role-mark">{item.mark}</span>
                  <span className="login-role-copy"><b>{key === 'teacher' ? '教师' : '学生'}</b><em>{item.entry}</em></span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <section className="card login-card">
            <div className="card-header login-card-header">
              <div>
                <h2>{mode === 'login' ? current.title : `${role === 'teacher' ? '教师' : '学生'}账号注册`}</h2>
                <p>{mode === 'login' ? current.subtitle : '填写信息后创建新账号'}</p>
              </div>
            </div>
            <div className="card-body">
              <div className="login-mode-tabs" role="tablist" aria-label="登录或注册">
                <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>登录</button>
                <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>注册</button>
              </div>
              <form className="login-form" onSubmit={submit}>
                {mode === 'register' && <label>
                  <span>姓名</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入姓名" autoComplete="name" />
                </label>}
                <label>
                  <span>{current.accountLabel}</span>
                  <input value={account} onChange={(event) => setAccount(event.target.value)} placeholder={current.accountPlaceholder} autoComplete="username" />
                </label>
                <label>
                  <span>密码</span>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" autoComplete="current-password" />
                </label>
                {mode === 'register' && <label>
                  <span>确认密码</span>
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="请再次输入密码" autoComplete="new-password" />
                </label>}
                {error && <div className="login-error">{error}</div>}
                <button className="login-submit" type="submit" disabled={submitting}>{submitting ? '处理中…' : mode === 'login' ? '登录并进入工作台' : '注册并进入工作台'}</button>
              </form>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
