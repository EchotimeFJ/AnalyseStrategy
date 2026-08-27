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

export const initialUpdateDataState: UpdateDataState = { status: 'idle', mode: null, result: null, error: '' };

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
      return initialUpdateDataState;
  }
}
