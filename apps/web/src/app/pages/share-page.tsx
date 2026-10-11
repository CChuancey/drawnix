import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppHeader } from '../components/app-header';
import { BoardCanvas } from '../components/board-canvas';
import { ConflictBanner, SaveHint } from '../components/save-status';
import { getSharedBoard, saveSharedBoard } from '../lib/api';
import { parseSnapshot, serialize } from '../lib/storage';
import type { Board, BoardValue } from '../lib/types';
import { useAutoSave } from '../lib/use-auto-save';

/** 凭分享链接打开画板（无需登录）：read 只读，write 可编辑并保存回原画板 */
export function SharePage() {
  const { token = '' } = useParams();
  const [value, setValue] = useState<BoardValue>({ children: [] });
  const [title, setTitle] = useState('');
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const conflictRef = useRef<Board | null>(null);

  const readOnly = permission === 'read';

  const saveFn = useCallback(
    async (content: string, version: number) => {
      const { board } = await saveSharedBoard(token, { content, version });
      return board;
    },
    [token]
  );

  const {
    state,
    error: saveError,
    conflictBoard,
    schedule,
    flushNow,
    acceptServerVersion,
    overwrite,
    syncVersion,
  } = useAutoSave({ initialVersion: 0, save: saveFn });

  conflictRef.current = conflictBoard;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getSharedBoard(token);
        if (cancelled) return;
        const parsed = parseSnapshot(res.board.content) ?? { children: [] };
        setValue(parsed);
        setTitle(res.board.title);
        setPermission(res.permission);
        setOwnerEmail(res.owner_email);
        syncVersion(res.board.content_version);
        setTutorial(parsed.children.length === 0);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '链接无效');
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, syncVersion]);

  useEffect(() => {
    return () => {
      flushNow();
    };
  }, [flushNow]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleCanvasChange = useCallback(
    (next: BoardValue) => {
      setValue(next);
      if (next.children.length > 0) setTutorial(false);
      if (!readOnly) schedule(serialize(next));
    },
    [readOnly, schedule]
  );

  const handleLoadLatest = () => {
    const latest = conflictRef.current;
    if (!latest) return;
    setValue(parseSnapshot(latest.content) ?? { children: [] });
    acceptServerVersion(latest);
    setToast('已加载最新内容');
  };

  const handleOverwrite = async () => {
    const latest = conflictRef.current;
    if (!latest) return;
    await overwrite(latest);
    setToast('已用本地内容覆盖');
  };

  if (!loaded) {
    return (
      <div className="sb-page">
        <div className="sb-center-state">正在打开分享的画板…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="sb-page">
        <AppHeader homeLink={false} />
        <div className="sb-center-state">
          <div style={{ fontSize: 16, fontWeight: 600 }}>无法打开这个分享链接</div>
          <div>{loadError}</div>
          <Link className="sb-btn" to="/">
            去共享白板首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sb-page">
      <AppHeader
        homeLink={false}
        right={
          <>
            <SaveHint state={state} error={saveError} />
            <span className="sb-tag sb-tag--muted">
              {readOnly ? '仅可查看' : '可编辑'}
            </span>
          </>
        }
      >
        <span className="sb-title">{title || '共享画板'}</span>
      </AppHeader>

      {ownerEmail && (
        <div className="sb-banner sb-banner--info">
          <span>
            由 <strong>{ownerEmail}</strong> 分享
            {readOnly ? '（仅可查看）' : '（可编辑，改动会保存到对方的画板）'}
          </span>
          <div className="sb-banner__actions">
            <Link className="sb-btn sb-btn--sm" to="/login">
              登录共享白板
            </Link>
          </div>
        </div>
      )}

      {conflictBoard && (
        <ConflictBanner
          board={conflictBoard}
          busy={false}
          onLoadLatest={handleLoadLatest}
          onOverwrite={handleOverwrite}
        />
      )}

      <div className="sb-canvas-slot">
        <BoardCanvas
          value={value}
          readonly={readOnly}
          tutorial={tutorial}
          onChange={handleCanvasChange}
        />
      </div>

      {toast && <div className="sb-toast">{toast}</div>}
    </div>
  );
}
