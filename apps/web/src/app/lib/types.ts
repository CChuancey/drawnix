import type { PlaitElement, PlaitTheme, Viewport } from '@plait/core';

export type Permission = 'owner' | 'write' | 'read';

export interface User {
  id: string;
  email: string;
  display_name: string | null;
}

export interface BoardMeta {
  id: string;
  title: string;
  content_version: number;
  created_at: string;
  updated_at: string;
}

export interface Board extends BoardMeta {
  owner_id: string;
  content: string | null;
}

export interface SharedBoardMeta extends BoardMeta {
  permission: Permission;
  owner_email: string;
}

export interface Collaborator {
  user_id: string;
  email: string;
  display_name: string | null;
  permission: Exclude<Permission, 'owner'>;
  created_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  permission: Exclude<Permission, 'owner'>;
  expires_at: string | null;
  created_at: string;
  url: string;
}

/** Drawnix 画布值（与 @plait/react-board 的 BoardChangeData 对齐） */
export interface BoardValue {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
}

/** 云端快照结构（与 packages/drawnix 的 DrawnixExportedData 对齐） */
export interface Snapshot {
  type: 'drawnix';
  version: number;
  source: 'web';
  elements: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
}
