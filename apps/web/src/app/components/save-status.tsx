import type { SaveState } from '../lib/use-auto-save';
import type { Board } from '../lib/types';

/** 头部右侧的保存状态提示 */
export function SaveHint({ state, error }: { state: SaveState; error: string | null }) {
  let text = '';
  if (state === 'saving') text = '保存中…';
  else if (state === 'saved') text = '已保存';
  else if (state === 'conflict') text = '内容有冲突';
  else if (state === 'error') text = error ?? '保存失败';

  if (!text) return null;
  return (
    <span
      className={[
        'sb-save-hint',
        state === 'saved' ? 'sb-save-hint--saved' : '',
        state === 'error' ? 'sb-save-hint--error' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {text}
    </span>
  );
}

interface ConflictProps {
  board: Board | null;
  busy: boolean;
  onLoadLatest: () => void;
  onOverwrite: () => void;
}

/** 乐观并发冲突提示：让用户选择保留哪一边 */
export function ConflictBanner({ board, busy, onLoadLatest, onOverwrite }: ConflictProps) {
  return (
    <div className="sb-banner">
      <span>
        这个画板刚刚被其他人改过了（服务端版本 v{board?.content_version ?? '?'}）。
        你可以加载对方的最新内容，或用本地内容覆盖。
      </span>
      <div className="sb-banner__actions">
        <button className="sb-btn sb-btn--sm" onClick={onLoadLatest} disabled={busy}>
          加载最新
        </button>
        <button
          className="sb-btn sb-btn--sm sb-btn--primary"
          onClick={onOverwrite}
          disabled={busy}
        >
          用本地覆盖
        </button>
      </div>
    </div>
  );
}
