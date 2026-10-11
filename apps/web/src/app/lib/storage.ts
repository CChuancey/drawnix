import localforage from 'localforage';
import type { BoardValue, Snapshot } from './types';

/** 旧版单文档键（未改造前所有内容都存在这里） */
export const LEGACY_KEY = 'main_board_content';

/** 未登录时的本地草稿画板 id */
export const LOCAL_BOARD_ID = 'local';

const localKey = (boardId: string) => `board_${boardId}`;

// 与旧版保持同一 localforage 配置，才能读到历史数据
localforage.config({
  name: 'Drawnix',
  storeName: 'drawnix_store',
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
});

/** 与 packages/drawnix 的 serializeAsJSON 输出结构一致（version 固定为 1） */
export function serialize(value: BoardValue): string {
  const snapshot: Snapshot = {
    type: 'drawnix',
    version: 1,
    source: 'web',
    elements: value.children ?? [],
    viewport: value.viewport,
    theme: value.theme,
  };
  return JSON.stringify(snapshot);
}

/** 解析快照；同时兼容旧版 { children, viewport, theme } 结构。失败返回 null */
export function parseSnapshot(raw: string | null | undefined): BoardValue | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const children = Array.isArray(data?.elements)
      ? data.elements
      : Array.isArray(data?.children)
        ? data.children
        : null;
    if (!children) return null;
    return { children, viewport: data.viewport, theme: data.theme };
  } catch {
    return null;
  }
}

export async function loadLocalBoard(boardId: string): Promise<BoardValue | null> {
  const raw = (await localforage.getItem<string>(localKey(boardId))) ?? null;
  return parseSnapshot(raw);
}

export async function saveLocalBoard(
  boardId: string,
  value: BoardValue
): Promise<void> {
  await localforage.setItem(localKey(boardId), serialize(value));
}

/* --------------------------- 旧数据迁移（一次性） --------------------------- */

/** 旧版是否残留单文档数据 */
export async function hasLegacyData(): Promise<boolean> {
  const raw = await localforage.getItem<unknown>(LEGACY_KEY);
  return !!raw;
}

/**
 * 读取旧数据并返回可直接提交给后端的快照字符串。
 * 旧结构 { children, viewport, theme } 直接迁移；新结构原样返回。
 */
export async function readLegacySnapshot(): Promise<string | null> {
  const raw = await localforage.getItem<string | BoardValue>(LEGACY_KEY);
  if (!raw) return null;
  if (typeof raw === 'string') {
    return parseSnapshot(raw) ? raw : null;
  }
  const value = parseSnapshot(JSON.stringify(raw));
  return value ? serialize(value) : null;
}

export async function clearLegacyData(): Promise<void> {
  await localforage.removeItem(LEGACY_KEY);
}
