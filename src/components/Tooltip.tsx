import { useState, type ReactNode } from "react";

interface TooltipProps {
  children: ReactNode;
  content?: ReactNode;
  label?: string;
}

export function Tooltip({ children, content, label }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="tooltip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {(content || label) && (
        <div className={`tooltip-balloon ${visible ? "visible" : ""}`} role="tooltip">
          <div className="tooltip-content">{content || label}</div>
          <div className="tooltip-arrow" />
        </div>
      )}
    </div>
  );
}

export default Tooltip;
