import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppHeader } from '../components/app-header';
import { BoardCanvas } from '../components/board-canvas';
import { ConflictBanner, SaveHint } from '../components/save-status';
import { ShareDialog } from '../components/share-dialog';
import { getBoard, saveBoard } from '../lib/api';
import { useAuth } from '../lib/auth';
import { LAST_BOARD_KEY } from '../lib/config';
import { connectBoardRoom, type RealtimeStatus } from '../lib/realtime';
import {
  LOCAL_BOARD_ID,
  loadLocalBoard,
  parseSnapshot,
  saveLocalBoard,
  serialize,
} from '../lib/storage';
import type { Board, BoardValue, Permission } from '../lib/types';
import { useAutoSave } from '../lib/use-auto-save';

export function BoardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const isLocal = id === LOCAL_BOARD_ID;

  const [value, setValue] = useState<BoardValue>({ children: [] });
  const [permission, setPermission] = useState<Permission>('owner');
  const [title, setTitle] = useState(isLocal ? '本地画板' : '');
  const [loaded, setLoaded] = useState(isLocal);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** 对方有新版本、但本地还有未保存改动时暂存，等用户决定 */
  const [remotePending, setRemotePending] = useState<number | null>(null);
  const [rtStatus, setRtStatus] = useState<RealtimeStatus>('connecting');
  /** 服务端当前版本，加载完成后初始化 useAutoSave */
  const [serverVersion, setServerVersion] = useState(0);
  const conflictRef = useRef<Board | null>(null);

  const readOnly = !isLocal && permission === 'read';

  const saveFn = useCallback(
    async (content: string, version: number) => {
      if (isLocal) {
        await saveLocalBoard(LOCAL_BOARD_ID, parseSnapshot(content) ?? { children: [] });
        return { content_version: version } as Board;
      }
      const { board } = await saveBoard(id, { content, version });
      return board;
    },
    [id, isLocal]
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
    currentVersion,
    hasPending,
  } = useAutoSave({ initialVersion: serverVersion, save: saveFn });

  conflictRef.current = conflictBoard;

  // 已登录且访问云端画板：拉取服务端数据
  useEffect(() => {
    if (isLocal || loading) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getBoard(id);
        if (cancelled) return;
        const parsed = parseSnapshot(res.board.content) ?? { children: [] };
        setValue(parsed);
        setPermission(res.permission);
        setTitle(res.board.title);
        setServerVersion(res.board.content_version);
        // useAutoSave 的 versionRef 只在首次渲染取值，加载完成后必须对齐
        syncVersion(res.board.content_version);
        setTutorial(parsed.children.length === 0);
        setLoaded(true);
        localStorage.setItem(LAST_BOARD_KEY, id);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '加载失败');
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isLocal, loading, user, navigate, syncVersion]);

  // 本地模式：从浏览器读取草稿
  useEffect(() => {
    if (!isLocal) return;
    let cancelled = false;
    (async () => {
      const local = await loadLocalBoard(LOCAL_BOARD_ID);
      if (cancelled) return;
      if (local) {
        setValue(local);
        setTutorial(local.children.length === 0);
      } else {
        setTutorial(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLocal]);

  /** 从服务端重新拉取并整块替换画布 */
  const loadFromServer = useCallback(async () => {
    const res = await getBoard(id);
    const parsed = parseSnapshot(res.board.content) ?? { children: [] };
    setValue(parsed);
    setTitle(res.board.title);
    setPermission(res.permission);
    syncVersion(res.board.content_version);
    setRemotePending(null);
    setTutorial(parsed.children.length === 0);
    setCanvasKey((n) => n + 1);
  }, [id, syncVersion]);

  // 实时同步：WebSocket 优先，断开自动退回 2 秒轮询
  const remoteHandlerRef = useRef<(version: number) => void>(() => undefined);
  remoteHandlerRef.current = (version: number) => {
    if (hasPending()) {
      setRemotePending(version);
      return;
    }
    loadFromServer()
      .then(() => setToast('已同步对方的最新改动'))
      .catch(() => undefined);
  };

  useEffect(() => {
    if (isLocal || !loaded || !user) return;
    const disconnect = connectBoardRoom({
      boardId: id,
      getCurrentVersion: currentVersion,
      hasPending,
      onUpdate: (version) => remoteHandlerRef.current(version),
      onStatus: setRtStatus,
    });
    return disconnect;
  }, [id, isLocal, loaded, user, currentVersion, hasPending]);

  // 离开页面前把待保存内容提交掉
  useEffect(() => {
    const onBeforeUnload = () => {
      flushNow();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
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

  const handleTitleBlur = async () => {
    if (isLocal || readOnly || !title.trim()) return;
    try {
      await saveBoard(id, { title: title.trim() });
    } catch (err) {
      setToast(err instanceof Error ? err.message : '标题保存失败');
    }
  };

  const handleLoadLatest = () => {
    const latest = conflictRef.current;
    if (!latest) return;
    const parsed = parseSnapshot(latest.content) ?? { children: [] };
    setValue(parsed);
    acceptServerVersion(latest);
    setCanvasKey((n) => n + 1);
    setToast('已加载服务端最新内容');
  };

  const handleOverwrite = async () => {
    const latest = conflictRef.current;
    if (!latest) return;
    await overwrite(latest);
    setToast('已用本地内容覆盖');
  };

  const headerRight = useMemo(
    () => (
      <>
        <SaveHint state={state} error={saveError} />
        {!isLocal && rtStatus === 'polling' && (
          <span className="sb-save-hint">轮询同步中</span>
        )}
        {!isLocal && permission === 'owner' && (
          <button className="sb-btn" onClick={() => setShareOpen(true)}>
            分享
          </button>
        )}
        {!isLocal && permission !== 'owner' && (
          <span className="sb-tag sb-tag--muted">
            {permission === 'write' ? '协作可编辑' : '仅可查看'}
          </span>
        )}
        {isLocal && (
          <Link className="sb-btn" to="/login">
            登录以云端保存
          </Link>
        )}
      </>
    ),
    [state, saveError, isLocal, permission, rtStatus]
  );

  if (!isLocal && (loading || !user || !loaded)) {
    return (
      <div className="sb-page">
        <div className="sb-center-state">
          {loadError ?? '正在打开画板…'}
          {loadError && (
            <Link className="sb-btn" to="/">
              返回画板列表
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sb-page" style={readOnly ? { height: '100%' } : undefined}>
      <AppHeader right={headerRight}>
        {isLocal || readOnly ? (
          <span className="sb-title">{isLocal ? '本地画板（未登录）' : title || '共享画板'}</span>
        ) : (
          <input
            className="sb-title-input"
            value={title}
            placeholder="未命名画板"
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        )}
      </AppHeader>

      {isLocal && (
        <div className="sb-banner sb-banner--info">
          <span>当前未登录，内容只保存在这台设备的浏览器里。登录后可保存到云端并分享。</span>
        </div>
      )}

      {readOnly && (
        <div className="sb-banner sb-banner--info">
          <span>你对该画板只有查看权限，改动不会被保存。</span>
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

      {remotePending !== null && !conflictBoard && (
        <div className="sb-banner sb-banner--info">
          <span>对方刚更新了这个画板，而你本地还有未保存的改动。</span>
          <div className="sb-banner__actions">
            <button
              className="sb-btn sb-btn--sm"
              onClick={() => setRemotePending(null)}
            >
              稍后
            </button>
            <button
              className="sb-btn sb-btn--sm sb-btn--primary"
              onClick={() => {
                loadFromServer()
                  .then(() => setToast('已加载对方的最新版本'))
                  .catch(() => setToast('加载失败'));
              }}
            >
              加载对方版本
            </button>
          </div>
        </div>
      )}

      <div className="sb-canvas-slot">
        <BoardCanvas
          key={`${id}-${canvasKey}`}
          value={value}
          readonly={readOnly}
          tutorial={tutorial}
          onChange={handleCanvasChange}
        />
      </div>

      {shareOpen && (
        <ShareDialog
          boardId={id}
          onClose={() => setShareOpen(false)}
          onToast={setToast}
        />
      )}

      {toast && <div className="sb-toast">{toast}</div>}
    </div>
  );
}
