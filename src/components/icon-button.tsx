import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/utils";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  active?: boolean;
};

export function IconButton({
  label,
  children,
  className,
  active,
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-3 text-sm font-semibold text-[color:var(--planner-ink)] shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        active && "border-mint-500 bg-mint-500 text-white",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
