import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppHeader } from '../components/app-header';
import { BoardCanvas } from '../components/board-canvas';
import { PresenceBar } from '../components/presence-bar';
import { ConflictBanner, SaveHint } from '../components/save-status';
import { getSharedBoard, saveSharedBoard } from '../lib/api';
import {
  connectBoardRoom,
  type BoardRoomConnection,
  type RealtimeStatus,
} from '../lib/realtime';
import { parseSnapshot, serialize } from '../lib/storage';
import type { Board, BoardValue, PresenceUser } from '../lib/types';
import { useAutoSave } from '../lib/use-auto-save';

/** 凭分享链接打开画板（无需登录）：read 只读，write 可编辑并保存回原画板 */
export function SharePage() {
  const { token = '' } = useParams();
  const [value, setValue] = useState<BoardValue>({ children: [] });
  /** 订阅实时更新需要画板 id（由 token 换取） */
  const [boardId, setBoardId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [remotePending, setRemotePending] = useState<number | null>(null);
  const [rtStatus, setRtStatus] = useState<RealtimeStatus>('connecting');
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [editing, setEditing] = useState(false);
  const conflictRef = useRef<Board | null>(null);
  const roomRef = useRef<BoardRoomConnection | null>(null);

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
    currentVersion,
    hasPending,
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
        setBoardId(res.board.id);
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

  /** 从服务端重新拉取并整块替换画布 */
  const loadFromServer = useCallback(async () => {
    const res = await getSharedBoard(token);
    const parsed = parseSnapshot(res.board.content) ?? { children: [] };
    setValue(parsed);
    setTitle(res.board.title);
    setPermission(res.permission);
    syncVersion(res.board.content_version);
    setRemotePending(null);
    setTutorial(parsed.children.length === 0);
  }, [token, syncVersion]);

  // 实时同步：朋友改了画板，这里秒级能看到
  const remoteHandlerRef = useRef<(version: number, byName?: string | null) => void>(
    () => undefined
  );
  remoteHandlerRef.current = (version: number, byName?: string | null) => {
    if (hasPending()) {
      setRemotePending(version);
      return;
    }
    const who = byName ? `${byName} ` : '对方';
    loadFromServer()
      .then(() => setToast(`已同步${who}的最新改动`))
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!loaded || !boardId) return;
    const conn = connectBoardRoom({
      boardId,
      shareToken: token,
      getCurrentVersion: currentVersion,
      hasPending,
      onUpdate: (version, byName) => remoteHandlerRef.current(version, byName),
      onPresence: setPresence,
      onStatus: setRtStatus,
    });
    roomRef.current = conn;
    return () => {
      conn.disconnect();
      roomRef.current = null;
    };
  }, [loaded, boardId, token, currentVersion, hasPending]);

  // 我在这个画板上编辑时也告诉别人
  useEffect(() => {
    roomRef.current?.setEditing(editing && !readOnly);
  }, [editing, readOnly, loaded]);

  useEffect(() => {
    if (state === 'saved' || state === 'error' || state === 'conflict') setEditing(false);
  }, [state]);

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
      if (!readOnly) {
        setEditing(true);
        schedule(serialize(next));
      }
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
        <AppHeader />
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
        right={
          <>
            <PresenceBar users={presence} selfEmail={null} />
            <SaveHint state={state} error={saveError} />
            <span className="sb-tag sb-tag--muted">
              {readOnly ? '仅可查看' : '可编辑'}
            </span>
            {rtStatus === 'polling' && <span className="sb-save-hint">轮询同步中</span>}
          </>
        }
      >
        <Link className="sb-btn sb-btn--ghost sb-btn--sm" to="/">
          ← 共享白板首页
        </Link>
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

      {remotePending !== null && !conflictBoard && (
        <div className="sb-banner sb-banner--info">
          <span>画板刚被更新，而你本地还有未保存的改动。</span>
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
                  .then(() => setToast('已加载最新版本'))
                  .catch(() => setToast('加载失败'));
              }}
            >
              加载最新版本
            </button>
          </div>
        </div>
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
