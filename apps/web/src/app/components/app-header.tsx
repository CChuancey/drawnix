import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  /** 中间区域：标题、保存状态等 */
  children?: ReactNode;
  /** 右侧操作区 */
  right?: ReactNode;
  /** 左上角品牌是否可点回列表页 */
  homeLink?: boolean;
}

export function AppHeader({ children, right, homeLink = true }: Props) {
  const brand = (
    <>
      <span className="sb-header__logo" aria-hidden="true">
        ✓
      </span>
      <span>共享白板</span>
    </>
  );
  return (
    <header className="sb-header">
      {homeLink ? (
        <Link to="/" className="sb-header__brand">
          {brand}
        </Link>
      ) : (
        <span className="sb-header__brand">{brand}</span>
      )}
      <div className="sb-header__center">{children}</div>
      <div className="sb-header__right">{right}</div>
    </header>
  );
}
