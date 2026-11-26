import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Base({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      {children}
    </svg>
  );
}

export const Back = (p: P) => (
  <Base {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Base>
);
export const Plus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
export const UploadIcon = (p: P) => (
  <Base {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </Base>
);
export const Camera = (p: P) => (
  <Base {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Base>
);
export const SearchIcon = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Base>
);
export const More = (p: P) => (
  <Base {...p}>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" />
  </Base>
);
export const Download = (p: P) => (
  <Base {...p}>
    <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
  </Base>
);
export const External = (p: P) => (
  <Base {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
  </Base>
);
export const Trash = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Base>
);
export const Pencil = (p: P) => (
  <Base {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Base>
);
export const Move = (p: P) => (
  <Base {...p}>
    <path d="M3 7h6l2 2h10v10H3z" />
    <path d="M12 13h5M15 11l2 2-2 2" />
  </Base>
);
export const Draw = (p: P) => (
  <Base {...p}>
    <path d="M3 17c3-4 5 2 8-2s4-8 7-6-1 6 3 7" />
  </Base>
);
export const Close = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);
export const Check = (p: P) => (
  <Base {...p}>
    <path d="M5 12l5 5L20 7" />
  </Base>
);
export const Folder = (p: P) => (
  <Base {...p}>
    <path d="M3 6h6l2 2h10v11H3z" />
  </Base>
);
export const Offline = (p: P) => (
  <Base {...p}>
    <path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18z" />
    <path d="M12 10.5v5M9.5 13.5l2.5 2.5 2.5-2.5" />
  </Base>
);
export const Share = (p: P) => (
  <Base {...p}>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
  </Base>
);
export const Logout = (p: P) => (
  <Base {...p}>
    <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
  </Base>
);
export const Calendar = (p: P) => (
  <Base {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Base>
);
export const HomeIcon = (p: P) => (
  <Base {...p}>
    <path d="M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4z" />
  </Base>
);
export const UserIcon = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Base>
);
export const ChevronRight = (p: P) => (
  <Base {...p}>
    <path d="M9 6l6 6-6 6" />
  </Base>
);
export const ChevronLeft = (p: P) => (
  <Base {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Base>
);
export const Note = (p: P) => (
  <Base {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 12h6M9 16h4" />
  </Base>
);
export const Sun = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Base>
);
export const ChevronUp = (p: P) => (
  <Base {...p}>
    <path d="M6 15l6-6 6 6" />
  </Base>
);
export const ChevronDown = (p: P) => (
  <Base {...p}>
    <path d="M6 9l6 6 6-6" />
  </Base>
);
