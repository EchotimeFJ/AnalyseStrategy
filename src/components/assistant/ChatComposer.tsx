import { useEffect, useRef } from 'react';
import { ArrowUp, Square } from 'lucide-react';

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  streaming,
  onStop,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  streaming: boolean;
  onStop: () => void;
  disabled: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(180, Math.max(48, textarea.scrollHeight))}px`;
  }, [value]);

  return (
    <div className="border-t border-slate-200 bg-white/90 px-3 pb-3 pt-2 backdrop-blur-xl sm:px-5 sm:pb-4">
      <form
        onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
        className="mx-auto max-w-4xl rounded-[22px] border border-slate-200 bg-white p-2 shadow-[0_12px_40px_rgba(15,23,42,0.08)] transition focus-within:border-blue-400 focus-within:shadow-[0_14px_44px_rgba(37,99,235,0.12)]"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!streaming && !disabled && value.trim()) onSubmit();
            }}
            rows={1}
            className="max-h-[180px] min-h-12 flex-1 resize-none bg-transparent px-2 py-3 text-[15px] leading-6 text-slate-800 outline-none"
            placeholder={disabled ? '请先配置 AI 服务' : '问问报告库中的公司、趋势、买入观点…'}
            disabled={disabled}
          />
          {streaming ? (
            <button type="button" onClick={onStop} className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md transition hover:scale-[1.03]" aria-label="停止生成">
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={disabled || !value.trim()} className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/20 transition hover:scale-[1.03] hover:bg-blue-700 disabled:scale-100 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none" aria-label="发送问题">
              <ArrowUp className="h-5 w-5" />
            </button>
          )}
        </div>
      </form>
      <p className="mt-2 text-center text-[10px] leading-4 text-slate-400">Enter 发送 · Shift+Enter 换行 · 结论请回到来源原文核对</p>
    </div>
  );
}
