import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithPassword, requestLoginCode, verifyLoginCode } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  EMAIL_DOMAIN,
  MAIL_INBOX_URL,
  MIN_PASSWORD_LENGTH,
  TURNSTILE_ENABLED,
  TURNSTILE_SITEKEY,
} from '../lib/config';

const RESEND_COOLDOWN_SECONDS = 60;

/** window.turnstile 的最小类型（脚本按需加载，不进 package.json） */
interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

function getTurnstile(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

/**
 * 登录页两条路径：
 * - 密码登录（日常）：邮箱 + 密码
 * - 邮箱验证码（首次登录注册 / 忘记密码）：验证码会投递到已有的邮箱系统，看完顺手设一个密码
 */
export function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuth();
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [localPart, setLocalPart] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  /** Turnstile 人机验证（token 一次性，用过即 reset 换新） */
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileBoxRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);

  const email = `${localPart.trim().toLowerCase()}${EMAIL_DOMAIN}`;

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [loading, user, navigate]);

  // 验证码模式下按需加载 Turnstile 并渲染控件；随 step 变化重新挂到新容器
  useEffect(() => {
    if (mode !== 'code' || !TURNSTILE_ENABLED) return;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !turnstileBoxRef.current || turnstileWidgetRef.current) return;
      const api = getTurnstile();
      if (!api) return;
      turnstileWidgetRef.current = api.render(turnstileBoxRef.current, {
        sitekey: TURNSTILE_SITEKEY,
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(null),
        'error-callback': () => setTurnstileToken(null),
      });
    };
    const existing = getTurnstile();
    if (existing) {
      mount();
    } else {
      const ensureScript = document.querySelector<HTMLScriptElement>('script[data-sb-turnstile]');
      if (ensureScript) {
        ensureScript.addEventListener('load', mount, { once: true });
      } else {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.dataset.sbTurnstile = '1';
        s.addEventListener('load', mount, { once: true });
        document.head.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
      if (turnstileWidgetRef.current) {
        getTurnstile()?.remove(turnstileWidgetRef.current);
        turnstileWidgetRef.current = null;
      }
      setTurnstileToken(null);
    };
  }, [mode, step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const switchMode = (next: 'password' | 'code') => {
    setMode(next);
    setStep('email');
    setCode('');
    setError(null);
  };

  const sendCode = async () => {
    if (!localPart.trim()) {
      setError('请输入邮箱前缀');
      return;
    }
    if (TURNSTILE_ENABLED && !turnstileToken) {
      setError('人机验证还没完成，请稍候再试');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestLoginCode(email, turnstileToken ?? '');
      setStep('code');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请稍后重试');
    } finally {
      // token 一次性：无论成败都重置控件换新 token
      setTurnstileToken(null);
      if (turnstileWidgetRef.current) getTurnstile()?.reset(turnstileWidgetRef.current);
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    if (!localPart.trim()) {
      setError('请输入邮箱前缀');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loginWithPassword(email, password);
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setError('请输入 6 位数字验证码');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`请设置至少 ${MIN_PASSWORD_LENGTH} 位的登录密码`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyLoginCode(email, code.trim(), newPassword);
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
      setBusy(false);
    }
  };

  const emailField = (
    <div className="sb-field">
      <label className="sb-field__label" htmlFor="sb-email">
        邮箱
      </label>
      <div className="sb-input-group">
        <input
          id="sb-email"
          className="sb-input"
          placeholder="yourname"
          autoComplete="username"
          autoFocus
          value={localPart}
          onChange={(e) => setLocalPart(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (mode === 'password' ? submitPassword() : sendCode());
          }}
        />
        <span className="sb-input-suffix">{EMAIL_DOMAIN}</span>
      </div>
    </div>
  );

  return (
    <div className="sb-page">
      <div className="sb-login">
        <div className="sb-login__card">
          <h1 className="sb-login__title">共享白板</h1>
          <p className="sb-login__subtitle">
            使用 {EMAIL_DOMAIN} 邮箱登录，画板保存在云端，可随时分享给他人。
          </p>

          {error && <div className="sb-error">{error}</div>}

          {mode === 'password' ? (
            <>
              {emailField}
              <div className="sb-field">
                <label className="sb-field__label" htmlFor="sb-password">
                  密码
                </label>
                <input
                  id="sb-password"
                  className="sb-input"
                  type="password"
                  placeholder="你的登录密码"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitPassword();
                  }}
                />
              </div>
              <button
                className="sb-btn sb-btn--primary sb-btn--block"
                onClick={submitPassword}
                disabled={busy}
              >
                {busy ? '登录中…' : '登录'}
              </button>
              <div className="sb-login__foot">
                <button className="sb-link" onClick={() => switchMode('code')}>
                  首次登录 / 忘记密码？用邮箱验证码
                </button>
              </div>
            </>
          ) : step === 'email' ? (
            <>
              {emailField}
              <p className="sb-login__hint">
                验证码会投递到 <strong>临时邮箱</strong>
                （<a href={MAIL_INBOX_URL} target="_blank" rel="noreferrer">{MAIL_INBOX_URL.replace('https://', '')}</a>），
                打开对应地址的收件箱即可看到。
              </p>
              {TURNSTILE_ENABLED && (
                <div className="sb-turnstile" ref={turnstileBoxRef} />
              )}
              <button
                className="sb-btn sb-btn--primary sb-btn--block"
                onClick={sendCode}
                disabled={busy}
              >
                {busy ? '发送中…' : '发送验证码'}
              </button>
              <div className="sb-login__foot">
                <button className="sb-link" onClick={() => switchMode('password')}>
                  返回密码登录
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="sb-field">
                <label className="sb-field__label" htmlFor="sb-code">
                  验证码已投递到 {email}
                </label>
                <input
                  id="sb-code"
                  className="sb-input sb-input--code"
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitCode();
                  }}
                />
              </div>
              <p className="sb-login__hint">
                在{' '}
                <a href={MAIL_INBOX_URL} target="_blank" rel="noreferrer">
                  {MAIL_INBOX_URL.replace('https://', '')}
                </a>{' '}
                的收件箱里查看验证码。
              </p>
              <div className="sb-field">
                <label className="sb-field__label" htmlFor="sb-new-password">
                  设置登录密码（至少 {MIN_PASSWORD_LENGTH} 位）
                </label>
                <input
                  id="sb-new-password"
                  className="sb-input"
                  type="password"
                  placeholder="以后用它登录，忘了可以再发验证码"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitCode();
                  }}
                />
              </div>
              <button
                className="sb-btn sb-btn--primary sb-btn--block"
                onClick={submitCode}
                disabled={busy}
              >
                {busy ? '提交中…' : '完成，进入共享白板'}
              </button>
              {TURNSTILE_ENABLED && (
                <div className="sb-turnstile" ref={turnstileBoxRef} />
              )}
              <div className="sb-login__foot">
                <button className="sb-link" onClick={sendCode} disabled={busy || cooldown > 0}>
                  {cooldown > 0 ? `${cooldown} 秒后可重新发送` : '重新发送验证码'}
                </button>
                {' · '}
                <button
                  className="sb-link"
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setError(null);
                  }}
                >
                  换个邮箱
                </button>
                {' · '}
                <button className="sb-link" onClick={() => switchMode('password')}>
                  返回密码登录
                </button>
              </div>
            </>
          )}

          <div className="sb-login__foot">
            未登录也可以直接使用白板，内容仅保存在本机浏览器。
            <br />
            <button className="sb-link" onClick={() => navigate('/b/local')}>
              以本地模式继续 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
