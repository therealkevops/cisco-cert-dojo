import type { DeviceKind } from "@/lib/net/types";

// Cert Dojo's own device icons: small 2.5D objects with one accent colour per
// type, so a busy topology still reads at a glance. Drawn centred on (0,0).

export const KIND_COLOR: Record<DeviceKind, string> = {
  router: "#2fa39c",
  switch: "#5a83cf",
  l3switch: "#8b6fd6",
  pc: "#7a8594",
  server: "#c29a5b",
};

export function DeviceIcon({ kind, size = 1, off = false }: { kind: DeviceKind; size?: number; off?: boolean }) {
  const c = off ? "#8a8f98" : KIND_COLOR[kind];
  const s = { transform: `scale(${size})` };
  switch (kind) {
    case "router":
      return (
        <g style={s}>
          <path d="M-26 -4v12c0 7 11.6 12 26 12s26-5 26-12v-12" fill={c} />
          <path d="M-26 -4v12c0 7 11.6 12 26 12s26-5 26-12v-12" fill="#000" opacity={0.18} />
          <ellipse cx={0} cy={-4} rx={26} ry={11} fill={c} />
          <ellipse cx={0} cy={-4} rx={26} ry={11} fill="#fff" opacity={0.18} />
          <g stroke="#fff" strokeWidth={2.2} strokeLinecap="round" fill="none" transform="translate(0 -4) scale(1 0.42)">
            <path d="M-6 -6l-9 -9m0 0v6m0-6h6" />
            <path d="M6 6l9 9m0 0v-6m0 6h-6" />
            <path d="M6 -6l9 -9m0 0h-6m6 0v6" transform="rotate(90 0 0)" />
            <path d="M-6 6l-9 9m0 0h6m-6 0v-6" transform="rotate(90 0 0)" />
          </g>
        </g>
      );
    case "switch":
    case "l3switch": {
      const h = kind === "l3switch" ? 16 : 11;
      return (
        <g style={s}>
          <path d={`M-28 -6 L0 -18 L28 -6 L0 6 Z`} fill={c} />
          <path d={`M-28 -6 L0 -18 L28 -6 L0 6 Z`} fill="#fff" opacity={0.2} />
          <path d={`M-28 -6 v${h} L0 ${6 + h} V6 Z`} fill={c} />
          <path d={`M-28 -6 v${h} L0 ${6 + h} V6 Z`} fill="#000" opacity={0.12} />
          <path d={`M28 -6 v${h} L0 ${6 + h} V6 Z`} fill={c} />
          <path d={`M28 -6 v${h} L0 ${6 + h} V6 Z`} fill="#000" opacity={0.28} />
          <g stroke="#fff" strokeWidth={1.8} strokeLinecap="round" fill="none" transform="translate(0 -6) scale(1 0.45)">
            <path d="M-12 -7h22m0 0l-5 -5m5 5l-5 5" />
            <path d="M12 7h-22m0 0l5 -5m-5 5l5 5" />
          </g>
          {kind === "l3switch" && (
            <text x={-14} y={11} fontSize={8} fontWeight={700} fill="#fff" transform="skewY(23)" style={{ fontFamily: "var(--mono)" }}>
              L3
            </text>
          )}
        </g>
      );
    }
    case "pc":
      return (
        <g style={s}>
          <rect x={-22} y={-20} width={44} height={30} rx={3} fill="#2a2d33" />
          <rect x={-19} y={-17} width={38} height={22} rx={1.5} fill={c} />
          <rect x={-19} y={-17} width={38} height={9} fill="#fff" opacity={0.15} />
          <path d="M-5 10h10l2 6h-14z" fill="#3a3e46" />
          <rect x={-12} y={15} width={24} height={3} rx={1.5} fill="#3a3e46" />
        </g>
      );
    case "server":
      return (
        <g style={s}>
          <path d="M-14 -22 L4 -26 L18 -22 L0 -18 Z" fill={c} />
          <path d="M-14 -22 L4 -26 L18 -22 L0 -18 Z" fill="#fff" opacity={0.25} />
          <path d="M-14 -22 V18 L0 22 V-18 Z" fill={c} />
          <path d="M18 -22 V18 L0 22 V-18 Z" fill={c} />
          <path d="M18 -22 V18 L0 22 V-18 Z" fill="#000" opacity={0.25} />
          {[-12, -4, 4].map((y) => (
            <path key={y} d={`M-11 ${y} L-3 ${y + 2}`} stroke="#fff" strokeWidth={1.6} opacity={0.7} />
          ))}
          <circle cx={-7} cy={12} r={1.6} fill={off ? "#666" : "#7ee08a"} />
        </g>
      );
  }
}

/** Compact toolbar glyph: the same icon, scaled down. */
export function ToolIcon({ kind }: { kind: DeviceKind }) {
  return (
    <svg width={34} height={30} viewBox="-30 -28 60 52" aria-hidden>
      <DeviceIcon kind={kind} />
    </svg>
  );
}
