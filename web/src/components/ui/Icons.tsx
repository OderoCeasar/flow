// Inline SVG icons. Decorative by default (aria-hidden); the visible label
// next to an icon carries the meaning.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-9 9" />
  </Svg>
);
export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
);
export const IconCrosshair = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </Svg>
);
export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
);
export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
);
export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
  </Svg>
);
export const IconOffline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.9 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5-2.7M15.3 10.6A10 10 0 0 1 19 12.9M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />
  </Svg>
);
export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="2" width="12" height="20" rx="2" />
    <path d="M11 18h2" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Svg>
);
export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8z" />
  </Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);
export const IconWrench = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3-6-6 8-8z" />
  </Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Svg>
);
export const IconDrop = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c-3 4.3-6 7.7-6 11a6 6 0 0 0 12 0c0-3.3-3-6.7-6-11z" />
  </Svg>
);
export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5h.01" />
  </Svg>
);
export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);
export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);
export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);
export const IconKeyboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </Svg>
);

// --- Leak types: pictures people recognise, not technical words ---

export const IconBurstPipe = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 14h7M15 14h7M2 18h7M15 18h7" />
    <path d="M9 13v6M15 13v6" />
    <path d="M12 11V8M9 9.5 7.5 7M15 9.5 16.5 7M12 5v.01M6 5.5v.01M18 5.5v.01" />
  </Svg>
);
export const IconPooling = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="16" rx="9" ry="3.5" />
    <path d="M8 16c1.3-1 2.7-1 4 0s2.7 1 4 0" />
    <path d="M12 4c-1.5 2-2.5 3.6-2.5 5a2.5 2.5 0 0 0 5 0c0-1.4-1-3-2.5-5z" />
  </Svg>
);
export const IconDripping = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h9a3 3 0 0 1 3 3v2" />
    <path d="M8 4v3M5 4h6" />
    <path d="M14 12h4" />
    <path d="M16 16c-1 1.4-1.5 2.4-1.5 3.2a1.5 1.5 0 0 0 3 0c0-.8-.5-1.8-1.5-3.2z" />
  </Svg>
);
export const IconSewage = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="15" rx="8" ry="4" />
    <path d="M7 15h10M9 13.2v3.6M12 13v4M15 13.2v3.6" />
    <path d="M8 8c0-1.5 1-2 2-2M12 7c0-2 1-3 2.5-3M16 9c0-1 .5-1.5 1.5-1.5" />
  </Svg>
);
export const IconQuestion = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.3 2.1-2.3 3.6M12 17h.01" />
  </Svg>
);

// --- Severity: shape + label, never colour alone ---

export const IconSeverityLow = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5M9.5 11.5 12 14l2.5-2.5" />
  </Svg>
);
export const IconSeverityMedium = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 12h8" />
  </Svg>
);
export const IconSeverityHigh = (p: IconProps) => <IconWarning {...p} />;
export const IconSeverityCritical = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" />
    <path d="M12 8v5M12 16h.01" />
  </Svg>
);

export const leakTypeIcon = {
  burst_pipe: IconBurstPipe,
  pooling: IconPooling,
  dripping: IconDripping,
  sewage: IconSewage,
  other: IconQuestion,
  unsure: IconQuestion,
} as const;

export const severityIcon = {
  low: IconSeverityLow,
  medium: IconSeverityMedium,
  high: IconSeverityHigh,
  critical: IconSeverityCritical,
} as const;

export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);
export const IconNavigation = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 11 18-8-8 18-2-8z" />
  </Svg>
);
export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
  </Svg>
);
