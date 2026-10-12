import type { PresenceUser } from '../lib/types';

interface Props {
  users: PresenceUser[];
  /** 当前用户邮箱（用来标出"我"）；免登录访客为 null */
  selfEmail: string | null;
}

const MAX_CHIPS = 4;

/** 头部右侧的"谁在看/谁在编辑"小标签 */
export function PresenceBar({ users, selfEmail }: Props) {
  if (users.length === 0) return null;
  const shown = users.slice(0, MAX_CHIPS);
  const rest = users.length - shown.length;

  return (
    <div className="sb-presence" title={users.map(describe).join('、')}>
      {shown.map((u) => {
        const isSelf = !!selfEmail && u.email === selfEmail;
        return (
          <span
            className={[
              'sb-presence__chip',
              u.editing ? 'sb-presence__chip--editing' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={u.email ?? `guest:${u.cid}`}
          >
            <span className="sb-presence__dot" aria-hidden="true" />
            {shortName(u)}
            {isSelf ? '（我）' : ''}
            {u.editing ? ' 正在编辑' : ''}
          </span>
        );
      })}
      {rest > 0 && <span className="sb-presence__chip">+{rest}</span>}
    </div>
  );
}

const shortName = (u: PresenceUser) => (u.email ? u.email.split('@')[0] : u.name);

const describe = (u: PresenceUser) =>
  `${shortName(u)}${u.editing ? '（正在编辑）' : ''}`;
