const PATHS = {
  today: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z",
  explore: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  studio: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 5l-7 7 7 7",
  send: "M4 12 20 4l-6 16-3-7z",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 1 0 0-.01",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  check: "M5 12.5 10 17 19 7",
  comment: "M4 5h16v11H9l-5 4z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  replay: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m3-8.5c-.6-.9-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.3 0 3.2 6 1.7 6 5 0 1.3-1.3 2.2-3 2.2-1.4 0-2.5-.6-3.1-1.5",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  chevron: "M9 6l6 6-6 6",
  up: "M12 19V5m-6 6 6-6 6 6",
  down: "M12 5v14m6-6-6 6-6-6",
  play: "M7 4.5v15l12-7.5z",
  pause: "M8 5v14m8-14v14",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  shield: "M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z",
  chart: "M4 20V4m0 16h16M8 16v-5m4 5V8m4 8v-3",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0m1-9a3 3 0 1 0 0-6m2.5 15a5.5 5.5 0 0 0-3-4.9",
  flow: "M5 3h6v5H5zM13 16h6v5h-6zM8 8v4h8v4",
  rules: "M4 6h10M4 12h7M4 18h10M17 4l3 3-3 3m0 4 3 3-3 3",
  log: "M8 4h8v3H8zM6 6H5v15h14V6h-1M8 11h8M8 15h5",
  bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
  download: "M12 4v11m-5-5 5 5 5-5M5 20h14",
  eyeOff: "M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6C3.7 8.4 2 12 2 12s4 7 10 7c1.7 0 3.2-.5 4.5-1.2M10 10a3 3 0 0 0 4 4",
  alert: "M12 3 2 20h20zM12 10v4m0 3v.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v5m0-8v.01",
  menu: "M4 7h16M4 12h16M4 17h16",
  copy: "M8 8h11v12H8zM5 16V4h11",
  spark: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4",
  filter: "M4 6h16M7 12h10m-7 6h4",
  columns: "M4 5h16v14H4zM10 5v14m4.5-14v14",
  sort: "M8 9l4-4 4 4M8 15l4 4 4-4",
  prev: "M15 6l-6 6 6 6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 24,
  label,
  className,
}: {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
}) {
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
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
