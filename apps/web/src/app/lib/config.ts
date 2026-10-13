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

/** Turnstile 官方测试 sitekey：对任意域名恒通过，只给本地开发用（正式 sitekey 不认 localhost） */
const TURNSTILE_TEST_SITEKEY = '1x00000000000000000000AA';
/** 正式 widget 的 sitekey。sitekey 是公开值（会打进前端包），密钥只在后端 wrangler secret 里 */
const TURNSTILE_PROD_SITEKEY = '0x4AAAAAAFVrPwlye7Q3Gzv1';

/**
 * 生产构建固定用正式 sitekey：漏配 VITE_TURNSTILE_SITEKEY 也不会静默退回测试 sitekey——
 * 那样前端渲染的是恒通过的假控件、后端却在严格校验，会把所有人挡在登录之外。
 * 本地开发用测试 sitekey（VITE_TURNSTILE_SITEKEY 可覆盖）。
 */
const envSitekey = import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined;
export const TURNSTILE_SITEKEY = import.meta.env.PROD
  ? envSitekey && envSitekey !== TURNSTILE_TEST_SITEKEY
    ? envSitekey
    : TURNSTILE_PROD_SITEKEY
  : envSitekey || TURNSTILE_TEST_SITEKEY;

/** 编辑后多久自动保存（毫秒） */
export const SAVE_DEBOUNCE_MS = 1000;

/** localStorage 里保存的"当前登录用户"缓存键 */
export const LAST_BOARD_KEY = 'sb_last_board_id';
