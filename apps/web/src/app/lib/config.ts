/** 后端 API 基址：生产走 draw-api 子域，本地开发走 wrangler dev 的 8787 */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  (import.meta.env.PROD ? 'https://draw-api.214599.xyz' : 'http://localhost:8787');

/** 登录邮箱域名后缀（与后端 ALLOWED_EMAIL_DOMAIN 保持一致） */
export const EMAIL_DOMAIN = '@214599.xyz';

/** 编辑后多久自动保存（毫秒） */
export const SAVE_DEBOUNCE_MS = 1000;

/** localStorage 里保存的"当前登录用户"缓存键 */
export const LAST_BOARD_KEY = 'sb_last_board_id';
