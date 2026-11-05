import type { IconProps } from '@/components/ui/icons';

/** Sidebar icon for Traces: lanes of turns on a time axis (Lucide "chart-gantt" shape). */
export function IconSidebarTraces({ size = 20, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      {...props}
    >
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 7h6" />
      <path d="M11 12h8" />
      <path d="M9 17h4" />
    </svg>
  );
}
