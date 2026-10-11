import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestLoginCode, verifyLoginCode } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EMAIL_DOMAIN } from '../lib/config';

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [localPart, setLocalPart] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const email = `${localPart.trim().toLowerCase()}${EMAIL_DOMAIN}`;

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async () => {
    if (!localPart.trim()) {
      setError('请输入邮箱前缀');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestLoginCode(email);
      setStep('code');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setError('请输入 6 位数字验证码');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyLoginCode(email, code.trim());
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
      setBusy(false);
    }
  };

  return (
    <div className="sb-page">
      <div className="sb-login">
        <div className="sb-login__card">
          <h1 className="sb-login__title">共享白板</h1>
          <p className="sb-login__subtitle">
            使用 {EMAIL_DOMAIN} 邮箱登录，画板保存在云端，可随时分享给他人。
          </p>

          {error && <div className="sb-error">{error}</div>}

          {step === 'email' ? (
            <>
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
                      if (e.key === 'Enter') sendCode();
                    }}
                  />
                  <span className="sb-input-suffix">{EMAIL_DOMAIN}</span>
                </div>
              </div>
              <button
                className="sb-btn sb-btn--primary sb-btn--block"
                onClick={sendCode}
                disabled={busy}
              >
                {busy ? '发送中…' : '发送验证码'}
              </button>
            </>
          ) : (
            <>
              <div className="sb-field">
                <label className="sb-field__label" htmlFor="sb-code">
                  已发送到 {email}
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
              <button
                className="sb-btn sb-btn--primary sb-btn--block"
                onClick={submitCode}
                disabled={busy}
              >
                {busy ? '登录中…' : '登录'}
              </button>
              <div className="sb-login__foot">
                <button
                  className="sb-link"
                  onClick={sendCode}
                  disabled={busy || cooldown > 0}
                >
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
