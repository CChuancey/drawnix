import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { SAVE_DEBOUNCE_MS } from './config';
import type { Board } from './types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

interface Options {
  /** 服务端当前版本号（首屏加载后传入） */
  initialVersion: number;
  /** 返回保存后的画板（含新 version）；版本冲突时抛 ApiError(409) */
  save: (content: string, version: number) => Promise<Board>;
}

/**
 * 画板自动保存：编辑停止 SAVE_DEBOUNCE_MS 后提交一次。
 * 409 冲突时不覆盖服务端，等调用方决定「加载最新」还是「覆盖保存」。
 */
export function useAutoSave({ initialVersion, save }: Options) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  /** 冲突时服务端返回的最新画板 */
  const [conflictBoard, setConflictBoard] = useState<Board | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const versionRef = useRef(initialVersion);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 保存串行化：同一时刻只允许一个请求在飞 */
  const flushingRef = useRef(false);
  const conflictRef = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async (): Promise<void> => {
    if (flushingRef.current || conflictRef.current) return;
    if (pendingRef.current === null) return;
    flushingRef.current = true;
    let saved = false;
    let failed = false;
    try {
      // 保存期间产生的改动会重新写入 pendingRef，这里循环排空
      while (pendingRef.current !== null && !conflictRef.current && !failed) {
        const content: string = pendingRef.current;
        pendingRef.current = null;
        setState('saving');
        try {
          const board = await saveRef.current(content, versionRef.current);
          versionRef.current = board.content_version;
          setSavedAt(Date.now());
          setError(null);
          saved = true;
        } catch (err) {
          failed = true;
          if (err instanceof ApiError && err.status === 409) {
            // 放回本地改动，交给「覆盖保存」使用
            pendingRef.current = content;
            conflictRef.current = true;
            setConflictBoard((err.body as { board?: Board } | null)?.board ?? null);
            setState('conflict');
          } else {
            pendingRef.current = content;
            setError(err instanceof Error ? err.message : '保存失败');
            setState('error');
          }
        }
      }
      if (saved && !conflictRef.current && !failed && pendingRef.current === null) {
        setState('saved');
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  /** 编辑后调用：重置防抖计时；冲突状态下不再自动提交 */
  const schedule = useCallback((content: string) => {
    pendingRef.current = content;
    if (conflictRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  /** 立刻保存（切换画板/关闭页面前调用） */
  const flushNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await flush();
  }, [flush]);

  /** 冲突：采用服务端最新内容，仅对齐版本号 */
  const acceptServerVersion = useCallback((board: Board) => {
    versionRef.current = board.content_version;
    pendingRef.current = null;
    conflictRef.current = false;
    setConflictBoard(null);
    setState('idle');
  }, []);

  /** 冲突：以本地内容覆盖服务端（先把版本号对齐到最新） */
  const overwrite = useCallback(
    async (board: Board) => {
      versionRef.current = board.content_version;
      conflictRef.current = false;
      setConflictBoard(null);
      setState('idle');
      await flush();
    },
    [flush]
  );

  /** 外部已更新内容（如实时广播），仅对齐版本号 */
  const syncVersion = useCallback((version: number) => {
    versionRef.current = version;
  }, []);

  // 稳定引用：供实时同步的连接副作用作依赖
  const currentVersion = useCallback(() => versionRef.current, []);
  const hasPending = useCallback(
    () => pendingRef.current !== null || flushingRef.current,
    []
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    state,
    error,
    savedAt,
    conflictBoard,
    schedule,
    flushNow,
    acceptServerVersion,
    overwrite,
    syncVersion,
    /** 当前已知的服务端版本号（实时同步用来比较新旧） */
    currentVersion,
    /** 是否有尚未落库的本地改动 */
    hasPending,
  };
}
