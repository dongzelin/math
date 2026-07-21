import React, { useRef, useCallback } from 'react';

/**
 * 参考 chuzhong_shuxue FormulaToolbar：
 * 点选插入可见 Unicode 数学符号（所见即所得），用于填空/解答题作答。
 */
export const FORMULA_CHIPS = [
  { label: '分数', insert: 'a/b', title: '分数 a/b' },
  { label: '根号', insert: '√', title: '平方根' },
  { label: '立方根', insert: '∛', title: '立方根' },
  { label: '²', insert: '²', title: '上标 ²' },
  { label: '³', insert: '³', title: '上标 ³' },
  { label: '₁', insert: '₁', title: '下标 ₁' },
  { label: '₂', insert: '₂', title: '下标 ₂' },
  { label: '|x|', insert: '|x|', title: '绝对值' },
  { label: '±', insert: '±' },
  { label: '≠', insert: '≠' },
  { label: '≤', insert: '≤' },
  { label: '≥', insert: '≥' },
  { label: '≈', insert: '≈' },
  { label: '×', insert: '×' },
  { label: '÷', insert: '÷' },
  { label: '∠', insert: '∠' },
  { label: '°', insert: '°' },
  { label: 'π', insert: 'π' },
  { label: '△', insert: '△' },
  { label: '⊥', insert: '⊥' },
  { label: '∥', insert: '∥' },
  { label: '∞', insert: '∞' },
  { label: '∈', insert: '∈' },
  { label: '∪', insert: '∪' },
  { label: '∩', insert: '∩' },
  { label: '空集', insert: '∅' },
  { label: 'α', insert: 'α' },
  { label: 'β', insert: 'β' },
  { label: 'θ', insert: 'θ' },
  { label: 'Δ', insert: 'Δ' },
  { label: 'sin', insert: 'sin' },
  { label: 'cos', insert: 'cos' },
  { label: 'tan', insert: 'tan' },
  { label: 'log', insert: 'log' },
  { label: 'ln', insert: 'ln' },
  { label: '∴', insert: '∴' },
  { label: '∵', insert: '∵' },
  { label: '→', insert: '→' },
  { label: '二次', insert: 'y=ax²+bx+c' },
  { label: '判别式', insert: 'Δ=b²-4ac' },
];

export function FormulaToolbar({ onInsert, className = '' }) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: 8,
        alignItems: 'center',
      }}
    >
      {FORMULA_CHIPS.map((chip) => (
        <button
          key={chip.label}
          type="button"
          title={chip.title || `插入 ${chip.insert}`}
          className="btn btn-sm btn-outline"
          style={{
            padding: '2px 8px',
            fontSize: 11,
            lineHeight: 1.4,
            borderColor: '#DDD6FE',
            background: '#F5F3FF',
            color: '#5B21B6',
          }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(chip.insert)}
        >
          {chip.label}
        </button>
      ))}
      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
        点选插入符号（所见即所得）
      </span>
    </div>
  );
}

/**
 * 填空 / 解答题输入：工具栏 + textarea（解答）或 input（填空）
 */
export default function MathAnswerInput({
  value = '',
  onChange,
  disabled = false,
  multiline = true,
  placeholder = '输入你的解答…',
  rows = 5,
  minHeight,
}) {
  const ref = useRef(null);

  const insertAtCursor = useCallback(
    (snippet) => {
      if (disabled) return;
      const el = ref.current;
      if (!el) {
        onChange(`${value || ''}${snippet}`);
        return;
      }
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + snippet.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      });
    },
    [disabled, onChange, value]
  );

  const commonStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: 'inherit',
    resize: multiline ? 'vertical' : undefined,
    minHeight: minHeight || (multiline ? 120 : undefined),
    background: disabled ? '#F8FAFC' : '#fff',
  };

  return (
    <div style={{ marginTop: 8 }}>
      {!disabled && <FormulaToolbar onInsert={insertAtCursor} />}
      {multiline ? (
        <textarea
          ref={ref}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          style={commonStyle}
        />
      ) : (
        <input
          ref={ref}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={commonStyle}
        />
      )}
    </div>
  );
}
