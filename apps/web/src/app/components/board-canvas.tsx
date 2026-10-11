import { Drawnix, type DrawnixProps } from '@drawnix/drawnix';
import type { BoardChangeData } from '@plait-board/react-board';
import type { BoardValue } from '../lib/types';

interface Props {
  value: BoardValue;
  readonly?: boolean;
  tutorial?: boolean;
  onChange?: (value: BoardValue) => void;
}

/** Drawnix 画布的最小封装：值进值出，不掺业务逻辑 */
export function BoardCanvas({ value, readonly = false, tutorial = false, onChange }: Props) {
  const handleChange: DrawnixProps['onChange'] = (data) => {
    if (readonly || !onChange) return;
    const changed = data as BoardChangeData;
    onChange({
      children: changed.children,
      viewport: changed.viewport,
      theme: changed.theme,
    });
  };

  return (
    <Drawnix
      value={value.children}
      viewport={value.viewport}
      theme={value.theme}
      readonly={readonly}
      tutorial={tutorial}
      onChange={handleChange}
    />
  );
}
