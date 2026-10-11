import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/app-header';
import { useAuth } from '../lib/auth';
import {
  createBoard,
  deleteBoard,
  listBoards,
  listSharedBoards,
} from '../lib/api';
import type { BoardMeta, SharedBoardMeta } from '../lib/types';
import {
  clearLegacyData,
  hasLegacyData,
  readLegacySnapshot,
} from '../lib/storage';

/** 将 SQLite 的 "YYYY-MM-DD HH:MM:SS"（UTC）格式化为相对时间 */
function formatTime(raw: string): string {
  const ts = Date.parse(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(ts)) return raw;
  const diff = Date.now() - ts;
  const minute = 60_000;
  if (diff < minute) return '刚刚';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`;
  if (diff < 30 * 24 * 60 * minute) {
    return `${Math.floor(diff / (24 * 60 * minute))} 天前`;
  }
  return new Date(ts).toLocaleDateString();
}

export function BoardListPage() {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [shared, setShared] = useState<SharedBoardMeta[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [loading, user, navigate]);

  const reload = useCallback(async () => {
    setFetching(true);
    try {
      const [mine, others] = await Promise.all([listBoards(), listSharedBoards()]);
      setBoards(mine.boards);
      setShared(others.boards);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      reload();
      hasLegacyData().then(setLegacy);
    }
  }, [user, reload]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const { board } = await createBoard();
      navigate(`/b/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (board: BoardMeta) => {
    if (!window.confirm(`确定删除「${board.title}」吗？此操作不可撤销。`)) return;
    setBusy(true);
    try {
      await deleteBoard(board.id);
      setBoards((prev) => prev.filter((b) => b.id !== board.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  /** 把改造前存在浏览器里的单文档内容导入成云端画板 */
  const handleImportLegacy = async () => {
    setBusy(true);
    try {
      const snapshot = await readLegacySnapshot();
      if (!snapshot) {
        setError('本机没有可导入的旧数据');
        setLegacy(false);
        return;
      }
      const { board } = await createBoard({ title: '导入的本地画板', content: snapshot });
      await clearLegacyData();
      setLegacy(false);
      navigate(`/b/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="sb-page">
        <div className="sb-center-state">正在检查登录状态…</div>
      </div>
    );
  }

  return (
    <div className="sb-page">
      <AppHeader
        right={
          <>
            <span className="sb-header__user" title={user.email}>
              {user.email}
            </span>
            <button
              className="sb-btn sb-btn--ghost"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              退出
            </button>
          </>
        }
      >
        <span className="sb-title">我的画板</span>
      </AppHeader>

      {legacy && (
        <div className="sb-banner">
          <span>检测到改造前保存在本机的白板内容，可以导入到云端。</span>
          <div className="sb-banner__actions">
            <button className="sb-btn sb-btn--sm" onClick={() => setLegacy(false)}>
              忽略
            </button>
            <button
              className="sb-btn sb-btn--sm sb-btn--primary"
              onClick={handleImportLegacy}
              disabled={busy}
            >
              导入到云端
            </button>
          </div>
        </div>
      )}

      <div className="sb-main">
        <div className="sb-content">
          {error && <div className="sb-error">{error}</div>}

          <section className="sb-section">
            <h2 className="sb-section__title">
              我的画板
              <span className="sb-count">{boards.length}</span>
              <button
                className="sb-btn sb-btn--sm sb-btn--primary"
                style={{ marginLeft: 'auto' }}
                onClick={handleCreate}
                disabled={busy}
              >
                + 新建画板
              </button>
            </h2>
            {fetching && boards.length === 0 ? (
              <div className="sb-empty">加载中…</div>
            ) : boards.length === 0 ? (
              <div className="sb-empty">还没有画板，点右上角「新建画板」开始。</div>
            ) : (
              <div className="sb-grid">
                {boards.map((board) => (
                  <div
                    key={board.id}
                    className="sb-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/b/${board.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/b/${board.id}`);
                    }}
                  >
                    <div className="sb-card__title" title={board.title}>
                      {board.title}
                    </div>
                    <div className="sb-card__meta">
                      <span>{formatTime(board.updated_at)}更新</span>
                    </div>
                    <div className="sb-card__actions">
                      <button
                        className="sb-btn sb-btn--sm sb-btn--danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(board);
                        }}
                        disabled={busy}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="sb-section">
            <h2 className="sb-section__title">
              共享给我的
              <span className="sb-count">{shared.length}</span>
            </h2>
            {shared.length === 0 ? (
              <div className="sb-empty">还没有人把画板共享给你。</div>
            ) : (
              <div className="sb-grid">
                {shared.map((board) => (
                  <div
                    key={board.id}
                    className="sb-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/b/${board.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/b/${board.id}`);
                    }}
                  >
                    <div className="sb-card__title" title={board.title}>
                      {board.title}
                    </div>
                    <div className="sb-card__meta">
                      <span className="sb-tag">
                        {board.permission === 'write' ? '可编辑' : '仅查看'}
                      </span>
                      <span className="sb-header__user" title={board.owner_email}>
                        {board.owner_email}
                      </span>
                    </div>
                    <div className="sb-card__meta">
                      <span>{formatTime(board.updated_at)}更新</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
