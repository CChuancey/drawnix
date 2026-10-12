import { useCallback, useEffect, useState } from 'react';
import { getVersion, listVersions, restoreVersion } from '../lib/api';
import type { BoardVersion, VersionDetail } from '../lib/types';

interface Props {
  boardId: string;
  /** 有编辑权限才能恢复 */
  canEdit: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
  /** 只读预览某个历史版本（主画布切换过去） */
  onPreview: (version: VersionDetail) => void;
  /** 恢复成功：把主画布刷新到服务端最新内容 */
  onRestored: (restoredFrom: number) => void;
}

/** D1 里的时间戳是 UTC 的 "YYYY-MM-DD HH:MM:SS" */
const fmtTime = (sql: string) => {
  const date = new Date(`${sql.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime())
    ? sql
    : date.toLocaleString('zh-CN', { hour12: false });
};

const fmtSize = (size: number) => `${Math.max(1, Math.round(size / 1024))} KB`;

/** 历史版本：查看（只读预览）与恢复 */
export function HistoryDialog({
  boardId,
  canEdit,
  onClose,
  onToast,
  onPreview,
  onRestored,
}: Props) {
  const [versions, setVersions] = useState<BoardVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 恢复是破坏性操作，点第一次先问一次 */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listVersions(boardId);
      setVersions(res.versions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载历史版本失败');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePreview = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const { version } = await getVersion(boardId, id);
      onPreview(version);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开历史版本失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await restoreVersion(boardId, id);
      onRestored(res.restored_from);
      await reload();
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sb-dialog-mask" onMouseDown={onClose}>
      <div className="sb-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sb-dialog__header">
          <span>历史版本</span>
          <button className="sb-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="sb-dialog__body">
          {error && <div className="sb-error">{error}</div>}
          <p className="sb-dialog__section-desc">
            编辑过程中每 10 分钟最多留一份快照，每个画板最多保留 50 份；越早的版本会自动淘汰。
            可以只读预览，也可以恢复到某个版本（恢复本身也会留底，随时能再退回来）。
          </p>

          {loading ? (
            <div className="sb-empty">正在读取历史版本…</div>
          ) : versions.length === 0 ? (
            <div className="sb-empty">
              还没有历史版本。第一次改动落库后（或 10 分钟后继续编辑）就会出现。
            </div>
          ) : (
            <div className="sb-list">
              {versions.map((v) => (
                <div className="sb-list__item" key={v.id}>
                  <span className="sb-tag">v{v.content_version}</span>
                  <span className="sb-history__meta">
                    <span className="sb-history__time">{fmtTime(v.created_at)}</span>
                    <span className="sb-history__by">
                      {v.editor_label ?? '未知'} · {fmtSize(v.size)}
                    </span>
                  </span>
                  <button
                    className="sb-btn sb-btn--sm"
                    onClick={() => handlePreview(v.id)}
                    disabled={busy}
                  >
                    预览
                  </button>
                  {canEdit &&
                    (confirmId === v.id ? (
                      <>
                        <button
                          className="sb-btn sb-btn--sm sb-btn--danger"
                          onClick={() => handleRestore(v.id)}
                          disabled={busy}
                        >
                          确认恢复
                        </button>
                        <button
                          className="sb-btn sb-btn--sm sb-btn--ghost"
                          onClick={() => setConfirmId(null)}
                          disabled={busy}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        className="sb-btn sb-btn--sm"
                        onClick={() => {
                          setConfirmId(v.id);
                          onToast('再点一次「确认恢复」即可覆盖当前内容');
                        }}
                        disabled={busy}
                      >
                        恢复
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
