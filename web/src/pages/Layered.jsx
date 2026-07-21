import React, { useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { AppContext } from '../App.jsx';

const KP_OPTIONS = [
  '函数的概念', '函数单调性', '函数奇偶性', '二次函数',
  '任意角与弧度', '三角函数图像', '三角恒等变换',
  '等差数列', '等比数列', '基本不等式',
];

export default function Layered() {
  const { classId, showToast, refreshNotices } = useContext(AppContext);
  const [params] = useSearchParams();
  const [kpName, setKpName] = useState(params.get('kp') || '函数单调性');
  const [lessonType, setLessonType] = useState('巩固练');
  const [sheet, setSheet] = useState(null);
  const [instruction, setInstruction] = useState('C 档再加 2 道基础题');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const k = params.get('kp');
    if (k) setKpName(k);
  }, [params]);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.genSheet({ kpName, lessonType, classContext: '高一(3)班月考后补弱' });
      setSheet(r.sheet);
      showToast(r.fallback ? '已生成（模板兜底）' : '三档练习已生成');
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const refine = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      const r = await api.refineSheet({ sheet, instruction });
      setSheet(r.sheet);
      showToast('已按指令微调');
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const push = async () => {
    if (!sheet?.layers) return;
    setBusy(true);
    try {
      const saved = await api.saveSheet({
        classId,
        kpName: sheet.kpName || kpName,
        lessonType,
        content: sheet,
      });
      const r = await api.pushHomework({
        classId,
        sheetId: saved.id,
        title: `${sheet.kpName || kpName} · 分层练习`,
        layers: sheet.layers,
      });
      showToast(`已推送 ${r.created?.length || 0} 档作业`);
      refreshNotices?.();
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    if (!sheet) return;
    const text = ['A', 'B', 'C']
      .map((L) => {
        const layer = sheet.layers?.[L];
        if (!layer) return '';
        const items = (layer.items || [])
          .map((it, i) => `${i + 1}. ${it.stem}\n答案要点：${it.answer}`)
          .join('\n\n');
        return `【${layer.label || L}】\n${items}`;
      })
      .join('\n\n----\n\n');
    await navigator.clipboard.writeText(text);
    showToast('已复制到剪贴板');
  };

  const updateLayerItem = (layerKey, itemIndex, field, value) => {
    setSheet((current) => {
      if (!current?.layers?.[layerKey]) return current;
      const items = [...(current.layers[layerKey].items || [])];
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      return {
        ...current,
        layers: {
          ...current.layers,
          [layerKey]: { ...current.layers[layerKey], items },
        },
      };
    });
  };

  return (
    <div>
      <div className="section-title">
        分层教学工坊
        <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          三档练习
        </span>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              知识点{' '}
              <select
                value={kpName}
                onChange={(e) => setKpName(e.target.value)}
                style={{ marginLeft: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                {KP_OPTIONS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              课型{' '}
              <select
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value)}
                style={{ marginLeft: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                <option>巩固练</option>
                <option>新授课配套</option>
                <option>考前复习</option>
              </select>
            </label>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={generate}>
              {busy ? '生成中…' : '✨ 生成三档练习'}
            </button>
            {sheet && (
              <>
                <button type="button" className="btn btn-outline" disabled={busy} onClick={copyAll}>复制</button>
                <button type="button" className="btn btn-success" disabled={busy} onClick={push}>推送学生</button>
              </>
            )}
          </div>
        </div>
      </div>

      {sheet && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h3>练习目标</h3>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{sheet.goal}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  style={{
                    flex: 1, minWidth: 200, padding: '8px 12px',
                    border: '1px solid var(--border)', borderRadius: 8,
                  }}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="页内短指令，如：C 档再加 2 道题"
                />
                <button type="button" className="btn btn-outline" disabled={busy} onClick={refine}>
                  微调
                </button>
              </div>
            </div>
          </div>

          <div className="grid-3">
            {['A', 'B', 'C'].map((L) => {
              const layer = sheet.layers?.[L];
              if (!layer) return null;
              return (
                <div className={`layer-card ${L.toLowerCase()}`} key={L}>
                  <div className="layer-card-header">
                    {layer.label || `${L} 档`}
                  </div>
                  <div className="layer-card-body">
                    {(layer.items || []).map((it, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#F8FAFC',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '10px 12px',
                          marginBottom: 10,
                          fontSize: 13,
                        }}
                      >
                        <textarea
                          aria-label={`${L} 档第 ${idx + 1} 题题干`}
                          value={it.stem || ''}
                          disabled={busy}
                          onChange={(e) => updateLayerItem(L, idx, 'stem', e.target.value)}
                          style={{
                            width: '100%', minHeight: 54, resize: 'vertical', marginBottom: 8,
                            padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 6,
                            font: 'inherit', lineHeight: 1.5, background: '#FFFFFF',
                          }}
                        />
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>
                          难度 {it.difficulty || '-'} · 答案要点
                          <input
                            aria-label={`${L} 档第 ${idx + 1} 题答案要点`}
                            value={it.answer || ''}
                            disabled={busy}
                            onChange={(e) => updateLayerItem(L, idx, 'answer', e.target.value)}
                            style={{
                              width: '100%', marginTop: 5, padding: '6px 8px',
                              border: '1px solid var(--border)', borderRadius: 6, font: 'inherit',
                              background: '#FFFFFF',
                            }}
                          />
                        </label>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 7 }}>
                          可直接修改后再复制或推送
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!sheet && (
        <div className="card">
          <div className="card-body empty-state">
            选择知识点后点击「生成三档练习」
          </div>
        </div>
      )}
    </div>
  );
}
