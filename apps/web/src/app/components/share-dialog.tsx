import { useCallback, useEffect, useState } from 'react';
import {
  addCollaborator,
  createShareLink,
  listCollaborators,
  listShareLinks,
  removeCollaborator,
  revokeShareLink,
} from '../lib/api';
import { EMAIL_DOMAIN } from '../lib/config';
import type { Collaborator, ShareLink } from '../lib/types';

interface Props {
  boardId: string;
  onClose: () => void;
  /** 复制结果提示 */
  onToast: (message: string) => void;
}

type LinkPermission = 'read' | 'write';

/** 分享弹窗：生成/管理分享链接 + 按邮箱授权指定用户（仅画板创建者可操作） */
export function ShareDialog({ boardId, onClose, onToast }: Props) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [linkPermission, setLinkPermission] = useState<LinkPermission>('read');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<LinkPermission>('read');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [linkRes, collabRes] = await Promise.all([
        listShareLinks(boardId),
        listCollaborators(boardId),
      ]);
      setLinks(linkRes.links);
      setCollaborators(collabRes.collaborators);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载分享信息失败');
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

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onToast('链接已复制');
    } catch {
      onToast(`复制失败，请手动复制：${url}`);
    }
  };

  const handleCreateLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await createShareLink(boardId, { permission: linkPermission });
      setLinks((prev) => [link, ...prev]);
      await copy(link.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成链接失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    setBusy(true);
    setError(null);
    try {
      await revokeShareLink(boardId, linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      onToast('链接已失效');
    } catch (err) {
      setError(err instanceof Error ? err.message : '吊销失败');
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (!email.endsWith(EMAIL_DOMAIN)) {
      setError(`仅支持 ${EMAIL_DOMAIN} 邮箱`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addCollaborator(boardId, { email, permission: invitePermission });
      setInviteEmail('');
      await reload();
      onToast(`已授权 ${email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '授权失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveCollaborator = async (userId: string, email: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeCollaborator(boardId, userId);
      setCollaborators((prev) => prev.filter((c) => c.user_id !== userId));
      onToast(`已取消 ${email} 的权限`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消授权失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sb-dialog-mask" onMouseDown={onClose}>
      <div className="sb-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sb-dialog__header">
          <span>分享画板</span>
          <button className="sb-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="sb-dialog__body">
          {error && <div className="sb-error">{error}</div>}

          <section className="sb-dialog__section">
            <h3 className="sb-dialog__section-title">分享链接</h3>
            <p className="sb-dialog__section-desc">
              拿到链接的人无需登录即可打开；「可编辑」链接的改动会保存到本画板。
            </p>
            <div className="sb-row">
              <select
                className="sb-select"
                value={linkPermission}
                onChange={(e) => setLinkPermission(e.target.value as LinkPermission)}
              >
                <option value="read">仅可查看</option>
                <option value="write">可编辑</option>
              </select>
              <button
                className="sb-btn sb-btn--primary"
                onClick={handleCreateLink}
                disabled={busy}
              >
                生成链接并复制
              </button>
            </div>
            {links.length > 0 && (
              <div className="sb-list">
                {links.map((link) => (
                  <div className="sb-list__item" key={link.id}>
                    <span className="sb-tag">
                      {link.permission === 'write' ? '可编辑' : '仅查看'}
                    </span>
                    <code title={link.url}>{link.url}</code>
                    <button
                      className="sb-btn sb-btn--sm"
                      onClick={() => copy(link.url)}
                      disabled={busy}
                    >
                      复制
                    </button>
                    <button
                      className="sb-btn sb-btn--sm sb-btn--danger"
                      onClick={() => handleRevokeLink(link.id)}
                      disabled={busy}
                    >
                      失效
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="sb-dialog__section">
            <h3 className="sb-dialog__section-title">授权指定用户</h3>
            <p className="sb-dialog__section-desc">
              仅支持 {EMAIL_DOMAIN} 邮箱，且对方需要先登录过一次本应用。
            </p>
            <div className="sb-row">
              <input
                className="sb-input"
                placeholder={`someone${EMAIL_DOMAIN}`}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInvite();
                }}
              />
              <select
                className="sb-select"
                value={invitePermission}
                onChange={(e) => setInvitePermission(e.target.value as LinkPermission)}
              >
                <option value="read">仅可查看</option>
                <option value="write">可编辑</option>
              </select>
              <button className="sb-btn" onClick={handleInvite} disabled={busy}>
                授权
              </button>
            </div>
            {collaborators.length > 0 && (
              <div className="sb-list">
                {collaborators.map((c) => (
                  <div className="sb-list__item" key={c.user_id}>
                    <span className="sb-tag">
                      {c.permission === 'write' ? '可编辑' : '仅查看'}
                    </span>
                    <code title={c.email}>{c.email}</code>
                    <button
                      className="sb-btn sb-btn--sm sb-btn--danger"
                      onClick={() => handleRemoveCollaborator(c.user_id, c.email)}
                      disabled={busy}
                    >
                      移除
                    </button>
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
