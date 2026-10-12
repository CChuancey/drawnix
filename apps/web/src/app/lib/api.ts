import { API_BASE } from './config';
import { getClientId } from './realtime';
import type {
  Board,
  BoardMeta,
  Collaborator,
  Permission,
  ShareLink,
  SharedBoardMeta,
  User,
} from './types';

/** 后端返回的错误（含 HTTP 状态码与原始 body，409 冲突时需要读 body.board） */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 会话失效时广播，AuthProvider 监听后清空登录态 */
export const UNAUTHORIZED_EVENT = 'sb:unauthorized';

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, '网络异常，请检查网络后重试');
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const message =
      (body as { error?: string } | null)?.error ?? `请求失败（${res.status}）`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

/* ------------------------------- 认证 ------------------------------- */

export const requestLoginCode = (email: string, turnstileToken = '') =>
  apiFetch<{ sent: true }>('/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email, turnstileToken }),
  });

/** 首次登录：验证码 + 设置密码；忘记密码：验证码 + 新密码 */
export const verifyLoginCode = (email: string, code: string, password: string) =>
  apiFetch<{ user: User; password_set: boolean }>('/auth/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code, password }),
  });

/** 日常登录：邮箱 + 密码 */
export const loginWithPassword = (email: string, password: string) =>
  apiFetch<{ user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const fetchMe = () => apiFetch<{ user: User }>('/auth/me');

export const logout = () => apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' });

/* ------------------------------- 画板 ------------------------------- */

export const listBoards = () => apiFetch<{ boards: BoardMeta[] }>('/boards');

export const listSharedBoards = () =>
  apiFetch<{ boards: SharedBoardMeta[] }>('/boards/shared-with-me');

export const createBoard = (payload: { title?: string; content?: string } = {}) =>
  apiFetch<{ board: Board; permission: Permission }>('/boards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getBoard = (id: string) =>
  apiFetch<{ board: Board; permission: Permission }>(`/boards/${id}`);

export const saveBoard = (
  id: string,
  payload: { content?: string; title?: string; version?: number }
) =>
  apiFetch<{ board: Board }>(`/boards/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    // 后端广播变更时回传，用来让发起方忽略自己的消息
    headers: { 'X-Client-Id': getClientId() },
  });

export const deleteBoard = (id: string) =>
  apiFetch<{ ok: true }>(`/boards/${id}`, { method: 'DELETE' });

/* ------------------------------ 分享链接 ------------------------------ */

export const createShareLink = (
  id: string,
  payload: { permission: 'read' | 'write'; expiresInDays?: number }
) =>
  apiFetch<ShareLink>(`/boards/${id}/share`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const listShareLinks = (id: string) =>
  apiFetch<{ links: ShareLink[] }>(`/boards/${id}/share`);

export const revokeShareLink = (id: string, linkId: string) =>
  apiFetch<{ ok: true }>(`/boards/${id}/share/${linkId}`, { method: 'DELETE' });

/* ------------------------------- 协作者 ------------------------------- */

export const listCollaborators = (id: string) =>
  apiFetch<{ collaborators: Collaborator[] }>(`/boards/${id}/collaborators`);

export const addCollaborator = (
  id: string,
  payload: { email: string; permission: 'read' | 'write' }
) =>
  apiFetch<{ ok: true; user: { id: string; email: string }; permission: string }>(
    `/boards/${id}/collaborators`,
    { method: 'POST', body: JSON.stringify(payload) }
  );

export const removeCollaborator = (id: string, userId: string) =>
  apiFetch<{ ok: true }>(`/boards/${id}/collaborators/${userId}`, {
    method: 'DELETE',
  });

/* --------------------------- 免登录分享访问 --------------------------- */

export const getSharedBoard = (token: string) =>
  apiFetch<{ board: Board; permission: 'read' | 'write'; owner_email: string | null }>(
    `/share/${token}`
  );

export const saveSharedBoard = (
  token: string,
  payload: { content: string; version: number }
) =>
  apiFetch<{ board: Board }>(`/share/${token}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: { 'X-Client-Id': getClientId() },
  });
