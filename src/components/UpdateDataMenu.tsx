import { useReducer, useState } from 'react';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { apiPost } from '@/lib/api';
import type { IndexStatus, ReportChangeSet, StrategyUpdateResult } from '@/types';

export type UpdateMode = 'github' | 'reindex';
export type UpdateCounts = { added: number; modified: number; removed: number };
export type UpdateDataState = {
  status: 'idle' | 'confirming' | 'updating' | 'success' | 'error';
  mode: UpdateMode | null;
  result: UpdateCounts | null;
  error: string;
};
export type UpdateDataAction =
  | { type: 'choose'; mode: UpdateMode }
  | { type: 'start' }
  | { type: 'success'; result: UpdateCounts }
  | { type: 'error'; error: string }
  | { type: 'reset' };

const initialState: UpdateDataState = { status: 'idle', mode: null, result: null, error: '' };

export function updateDataReducer(state: UpdateDataState, action: UpdateDataAction): UpdateDataState {
  switch (action.type) {
    case 'choose':
      return state.status === 'updating' ? state : { status: 'confirming', mode: action.mode, result: null, error: '' };
    case 'start':
      return state.status === 'updating' ? state : { ...state, status: 'updating', error: '' };
    case 'success':
      return { ...state, status: 'success', result: action.result, error: '' };
    case 'error':
      return { ...state, status: 'error', error: action.error };
    case 'reset':
      return initialState;
  }
}

export function UpdateDataMenu({ onUpdated }: { onUpdated?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useReducer(updateDataReducer, initialState);

  async function update() {
    if (!state.mode || state.status === 'updating') return;
    dispatch({ type: 'start' });
    try {
      const index = state.mode === 'github'
        ? (await apiPost<StrategyUpdateResult>('/api/update-strategy')).index
        : await apiPost<IndexStatus>('/api/reindex');
      dispatch({ type: 'success', result: changeCounts(index.reportChanges) });
      await onUpdated?.();
    } catch (reason) {
      dispatch({ type: 'error', error: reason instanceof Error ? reason.message : String(reason) });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open && state.status !== 'updating') dispatch({ type: 'reset' });
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
      >
        <RefreshCw className={`h-4 w-4 ${state.status === 'updating' ? 'animate-spin' : ''}`} />
        {state.status === 'updating' ? '更新中' : '更新数据'}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-30 w-[min(90vw,340px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
          {state.status === 'idle' ? (
            <div className="space-y-2">
              <UpdateChoice title="从 GitHub 更新并重建" hint="拉取最新 Strategy 报告后重新索引" onClick={() => dispatch({ type: 'choose', mode: 'github' })} />
              <UpdateChoice title="仅重新扫描报告" hint="不访问 GitHub，重新读取服务器现有报告" onClick={() => dispatch({ type: 'choose', mode: 'reindex' })} />
            </div>
          ) : null}
          {state.status === 'confirming' ? (
            <div>
              <div className="font-semibold text-slate-950">确认{state.mode === 'github' ? '更新报告并重建索引' : '重新扫描报告'}？</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">更新期间仍会展示现有索引，完成后自动刷新首页。</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => dispatch({ type: 'reset' })} className="min-h-10 flex-1 rounded-xl border border-slate-200 text-sm">返回</button>
                <button onClick={() => void update()} className="min-h-10 flex-1 rounded-xl bg-blue-600 text-sm font-semibold text-white">开始更新</button>
              </div>
            </div>
          ) : null}
          {state.status === 'updating' ? <p className="p-3 text-sm text-slate-600">正在安全更新，页面可以继续使用…</p> : null}
          {state.status === 'success' ? (
            <div className="p-2">
              <div className="flex items-center gap-2 font-semibold text-emerald-700"><Check className="h-4 w-4" />更新完成</div>
              <p className="mt-2 text-sm text-slate-600">新增 {state.result?.added ?? 0}，修改 {state.result?.modified ?? 0}，删除 {state.result?.removed ?? 0}</p>
            </div>
          ) : null}
          {state.status === 'error' ? (
            <div className="p-2">
              <div className="font-semibold text-rose-700">更新失败</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{state.error}</p>
              <button onClick={() => dispatch({ type: 'choose', mode: state.mode ?? 'reindex' })} className="mt-3 min-h-10 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white">重试</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function UpdateChoice({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block min-h-16 w-full rounded-xl p-3 text-left transition hover:bg-slate-50">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{hint}</div>
    </button>
  );
}

function changeCounts(changes?: ReportChangeSet): UpdateCounts {
  return {
    added: changes?.added.length ?? 0,
    modified: changes?.modified.length ?? 0,
    removed: changes?.removed.length ?? 0,
  };
}
