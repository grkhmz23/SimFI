'use client';
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

interface GradientButtonProps extends HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  width?: string;
  height?: string;
  onClick?: () => void;
  disabled?: boolean;
}

const GradientButton = ({
  children,
  width = '200px',
  height = '50px',
  className = '',
  onClick,
  disabled = false,
  ...props
}: GradientButtonProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div className="text-center">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        className={cn(
          "relative rounded-[50px] cursor-pointer",
          "flex items-center justify-center",
          "rotating-gradient-button",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        style={{
          minWidth: width,
          height: height,
        }}
        onClick={disabled ? undefined : onClick}
        onKeyDown={handleKeyDown}
        aria-disabled={disabled}
        {...props}
      >
        <span className="relative z-10 text-foreground flex items-center justify-center gap-2 font-medium">
          {children}
        </span>
      </div>
    </div>
  );
};

export { GradientButton };
export default GradientButton;
