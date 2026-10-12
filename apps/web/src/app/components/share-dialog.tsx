import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addCollaborator,
  createShareLink,
  listCollaborators,
  listShareLinks,
  lookupUsers,
  removeCollaborator,
  revokeShareLink,
} from '../lib/api';
import { EMAIL_DOMAIN } from '../lib/config';
import type { Collaborator, ShareLink, UserSuggestion } from '../lib/types';

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
  /** 只填账号名部分，域名固定为 EMAIL_DOMAIN */
  const [inviteLocal, setInviteLocal] = useState('');
  const [invitePermission, setInvitePermission] = useState<LinkPermission>('read');
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inviteBoxRef = useRef<HTMLDivElement>(null);

  const inviteEmail = `${inviteLocal.trim().toLowerCase()}${EMAIL_DOMAIN}`;

  /** 输入账号名前缀 → 提示站内已注册的账号（"打出账号名就可以提示"） */
  useEffect(() => {
    const q = inviteLocal.trim().toLowerCase();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await lookupUsers(q);
        if (!cancelled) setSuggestions(res.users);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inviteLocal]);

  // 点击别处收起提示
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (inviteBoxRef.current && !inviteBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

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
    const local = inviteLocal.trim().toLowerCase();
    if (!local) {
      setError('请输入对方的账号名');
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(local)) {
      setError('账号名只能包含字母、数字、点、下划线和短横线');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addCollaborator(boardId, {
        email: `${local}${EMAIL_DOMAIN}`,
        permission: invitePermission,
      });
      setInviteLocal('');
      setSuggestions([]);
      setShowSuggestions(false);
      await reload();
      onToast(`已授权 ${local}${EMAIL_DOMAIN}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '授权失败');
    } finally {
      setBusy(false);
    }
  };

  /** 输入框只收账号名；粘贴完整邮箱时自动去掉域名，域名不对就提示 */
  const handleInviteInput = (raw: string) => {
    setError(null);
    setShowSuggestions(true);
    if (!raw.includes('@')) {
      setInviteLocal(raw);
      return;
    }
    const [local, domain = ''] = raw.split('@');
    const expected = EMAIL_DOMAIN.slice(1); // 214599.xyz
    if (domain && !expected.startsWith(domain.toLowerCase())) {
      setError(`只支持 ${EMAIL_DOMAIN} 邮箱，请只填账号名`);
      return;
    }
    setInviteLocal(local);
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
              只填账号名即可（域名固定为 {EMAIL_DOMAIN}），输入两个字就会提示站内已有的账号。
              对方需要先登录过一次本应用。
            </p>
            <div className="sb-row">
              <div className="sb-invite" ref={inviteBoxRef}>
                <div className="sb-input-group">
                  <input
                    className="sb-input"
                    placeholder="someone"
                    value={inviteLocal}
                    autoComplete="off"
                    onChange={(e) => handleInviteInput(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (suggestions.length > 0 && showSuggestions) {
                          setInviteLocal(suggestions[0].local_part);
                          setShowSuggestions(false);
                          return;
                        }
                        handleInvite();
                      }
                      if (e.key === 'Escape') setShowSuggestions(false);
                    }}
                  />
                  <span className="sb-input-suffix">{EMAIL_DOMAIN}</span>
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="sb-suggest">
                    {suggestions.map((s) => (
                      <button
                        className="sb-suggest__item"
                        key={s.id}
                        onClick={() => {
                          setInviteLocal(s.local_part);
                          setSuggestions([]);
                          setShowSuggestions(false);
                        }}
                      >
                        <span className="sb-suggest__name">{s.local_part}</span>
                        <span className="sb-suggest__mail">{EMAIL_DOMAIN}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showSuggestions &&
                  suggestions.length === 0 &&
                  inviteLocal.trim().length >= 2 && (
                    <div className="sb-suggest sb-suggest--empty">
                      没有匹配的账号。对方需要先用邮箱登录一次本应用，才能被授权。
                    </div>
                  )}
              </div>
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
            <p className="sb-dialog__section-desc sb-invite__preview">
              将要授权：{inviteLocal.trim() ? inviteEmail : '—'}
            </p>
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
