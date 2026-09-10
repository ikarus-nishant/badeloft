import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";

interface TooltipProps {
  children: ReactNode;
  content?: ReactNode;
  label?: string;
  className?: string;
  triggerOnClick?: boolean;
}

export function Tooltip({
  children,
  content,
  label,
  className = "",
  triggerOnClick = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [shake, setShake] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!content && !label) {
      setVisible(false);
      setShake(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    }
  }, [content, label]);

  const triggerClickFeedback = useCallback(() => {
    if (!content && !label) return;
    setVisible(true);

    // Trigger shake animation
    setShake(false);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setShake(true);
      shakeTimerRef.current = setTimeout(() => setShake(false), 450);
    }, 10);

    // Keep visible for 3.5 seconds
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, 3500);
  }, [content, label]);

  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(true);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      return;
    }
    setVisible(false);
  };

  const handleClick = () => {
    if (triggerOnClick) {
      triggerClickFeedback();
    }
  };

  const balloonClasses = [
    "tooltip-balloon",
    visible ? "visible" : "",
    shake ? "shake" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={`tooltip-wrapper ${className}`.trim()}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setVisible(true)}
      onBlur={() => {
        if (!timerRef.current) setVisible(false);
      }}
    >
      {children}
      {(content || label) && (
        <div className={balloonClasses} role="tooltip">
          <div className="tooltip-content">{content || label}</div>
          <div className="tooltip-arrow" />
        </div>
      )}
    </div>
  );
}

export default Tooltip;
