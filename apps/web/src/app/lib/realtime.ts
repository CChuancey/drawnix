import { API_BASE } from './config';
import type { PresenceUser } from './types';

export type RealtimeStatus = 'connecting' | 'online' | 'polling' | 'offline';

const CLIENT_ID_KEY = 'sb_client_id';

/** 本次浏览器标签页的标识：保存时带给后端，广播时用来排除自己 */
export function getClientId(): string {
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `c${Date.now()}${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

const POLL_INTERVAL_MS = 2000;
const PING_INTERVAL_MS = 25_000;

interface Options {
  boardId: string;
  /** 免登录访问分享链接时携带 */
  shareToken?: string;
  /** 当前本地已知的版本号 */
  getCurrentVersion: () => number;
  /** 本地是否有还没保存的改动 */
  hasPending: () => boolean;
  /** 收到他人的更新（version 大于本地时触发）；byName 是对方的昵称 */
  onUpdate: (version: number, byName?: string | null) => void;
  /** 在线成员变化（含"谁正在编辑"）；退回轮询时给空数组 */
  onPresence?: (users: PresenceUser[]) => void;
  onStatus?: (status: RealtimeStatus) => void;
}

export interface BoardRoomConnection {
  /** 断开订阅 */
  disconnect: () => void;
  /** 告诉房间里其他人"我正在编辑/我停了"（用于显示谁在编辑） */
  setEditing: (editing: boolean) => void;
}

/**
 * 订阅画板变更与在线成员：
 * 1. 优先用 WebSocket（服务端保存成功后主动广播新版本号，并同步在线名单）
 * 2. 连不上或断开时自动退回 2 秒轮询，功能不失效（此时看不到在线名单）
 */
export function connectBoardRoom({
  boardId,
  shareToken,
  getCurrentVersion,
  hasPending,
  onUpdate,
  onPresence,
  onStatus,
}: Options): BoardRoomConnection {
  const wsBase = API_BASE.replace(/^http/, 'ws');
  const params = new URLSearchParams({ cid: getClientId() });
  if (shareToken) params.set('token', shareToken);
  const wsUrl = `${wsBase}/api/ws/${boardId}?${params.toString()}`;

  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let attempt = 0;
  let closed = false;
  let polling = false;
  /** 最近一次"我在编辑"的意图，重连后补发 */
  let editing = false;

  const emit = (version: number, byName?: string | null) => {
    if (version > getCurrentVersion()) onUpdate(version, byName);
  };

  /** 分享链接用 /api/share/:token，登录态用 /api/boards/:id */
  const fetchVersion = async (): Promise<number> => {
    const path = shareToken
      ? `/api/share/${shareToken}`
      : `/api/boards/${boardId}`;
    const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
    if (!res.ok) return 0;
    const body = await res.json();
    return body?.board?.content_version ?? 0;
  };

  const startPolling = () => {
    if (polling || closed) return;
    polling = true;
    onStatus?.('polling');
    onPresence?.([]);
    pollTimer = setInterval(async () => {
      // 本地有未保存改动时先不拉取，避免覆盖用户正在编辑的内容
      if (hasPending()) return;
      try {
        const version = await fetchVersion();
        if (version > 0) emit(version);
      } catch {
        // 网络抖动，下一轮再试
      }
    }, POLL_INTERVAL_MS);
  };

  const stopPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    polling = false;
  };

  const send = (payload: unknown) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  const connect = () => {
    if (closed) return;
    onStatus?.('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      stopPolling();
      onStatus?.('online');
      // 重连后补报"我在编辑"，否则名单里会丢掉这个状态
      if (editing) send({ type: 'editing', editing: true });
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data === 'pong') return;
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === 'presence') {
          onPresence?.(Array.isArray(msg.users) ? msg.users : []);
          return;
        }
        if (msg?.type !== 'board-updated') return;
        if (msg.by && msg.by === getClientId()) return; // 自己触发的
        if (typeof msg.version === 'number') emit(msg.version, msg.byName ?? null);
      } catch {
        // 忽略无法解析的消息
      }
    };

    ws.onclose = () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      socket = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose 会跟着触发，统一在那里重连
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    attempt += 1;
    // 连续失败即启用轮询兜底，同时继续尝试恢复 WebSocket
    if (attempt >= 2) startPolling();
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000);
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return {
    setEditing: (next: boolean) => {
      if (editing === next) return;
      editing = next;
      send({ type: 'editing', editing: next });
    },
    disconnect: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      stopPolling();
      socket?.close();
      onStatus?.('offline');
      onPresence?.([]);
    },
  };
}
