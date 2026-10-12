/** 后端 API 基址：生产走 draw-api 子域，本地开发走 wrangler dev 的 8787 */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  (import.meta.env.PROD ? 'https://draw-api.214599.xyz' : 'http://localhost:8787');

/** 登录邮箱域名后缀（与后端 ALLOWED_EMAIL_DOMAIN 保持一致） */
export const EMAIL_DOMAIN = '@214599.xyz';

/** 收验证码的地方：214599.xyz 的邮箱系统（验证码会被投递到对应地址的收件箱） */
export const MAIL_INBOX_URL = 'https://tmp-mail.214599.xyz';

/** 密码长度下限（与后端 passwordProblem 保持一致） */
export const MIN_PASSWORD_LENGTH = 8;

/** Turnstile 官方测试 sitekey（本地开发恒通过）；生产构建时用 VITE_TURNSTILE_SITEKEY 注入正式值 */
const TURNSTILE_TEST_SITEKEY = '1x00000000000000000000AA';
export const TURNSTILE_SITEKEY =
  (import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined) ||
  TURNSTILE_TEST_SITEKEY;
/** 生产未配置正式 sitekey 前不渲染控件（后端此时也跳过校验），界面与今天一致 */
export const TURNSTILE_ENABLED =
  TURNSTILE_SITEKEY !== TURNSTILE_TEST_SITEKEY || !import.meta.env.PROD;

/** 编辑后多久自动保存（毫秒） */
export const SAVE_DEBOUNCE_MS = 1000;

/** localStorage 里保存的"当前登录用户"缓存键 */
export const LAST_BOARD_KEY = 'sb_last_board_id';
