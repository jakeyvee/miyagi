"use client";

/**
 * Tree visual. Five thriving SVGs (seed → blooming) plus two CSS-applied
 * modifiers (wilt, dead). Self-contained — no external assets, no
 * style-file changes. Centers itself inside whatever container hosts it
 * (KidStudy's `data-slot="tree"` is a fixed-height flex item).
 *
 * Transitions: simple CSS opacity + transform fade-cross between stages so
 * we never trigger layout work in the parent slot. When the thriving stage
 * advances (assistive completion), a brief grow-burst animation plays —
 * scale-pulse plus a golden glow plus floating sparkles — so the demo
 * audience can see the reward land. Stage shrinks (e.g. "give me answer
 * now") trigger a shrink-pulse with a red flash. Reduced-motion users get
 * an instant swap.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { TreeState } from "@/lib/contracts";
import { useTreeState } from "@/lib/kid/tree/hook";

const VIEWBOX = "0 0 200 240";

const STAGE_ORDER: TreeState[] = [
  "seed",
  "sprout",
  "sapling",
  "tree",
  "blooming",
];

/**
 * Aura-anchored tree palette.
 * Primary forest = #2C3B31 (trunks + deep canopy)
 * Accent sage   = #7A9E7E (live leaves)
 * Soft sage     = #B3CDB5 (lit canopy highlights)
 * Soil          = warm taupe so the dark trunk still reads against the
 *                 cream feature-card background.
 */
const PALETTE = {
  sky: "transparent",
  soil: "#9c8268",
  soilDark: "#76624c",
  trunk: "#2c3b31",
  trunkLight: "#4f6452",
  leafDark: "#3f5e43",
  leaf: "#7a9e7e",
  leafLight: "#b3cdb5",
  bloom: "#f6c8cc",
  bloomCore: "#e89aa1",
  seedShell: "#b3947a",
  sprout: "#7a9e7e",
  wiltLeaf: "#c9b463",
  wiltTrunk: "#76624c",
  deadTrunk: "#3a3a36",
  deadLeaf: "#7a7a72",
};

const containerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  overflow: "hidden",
  borderRadius: "1rem",
};

const svgWrapStyle: CSSProperties = {
  width: "min(85%, 18rem)",
  height: "100%",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  transition: "filter 400ms ease, opacity 400ms ease",
};

const svgStyle: CSSProperties = {
  width: "100%",
  height: "auto",
  maxHeight: "100%",
  display: "block",
  transition: "transform 400ms ease, opacity 400ms ease",
  transformOrigin: "50% 95%",
};

const statusStyle: CSSProperties = {
  position: "absolute",
  bottom: "0.625rem",
  left: 0,
  right: 0,
  textAlign: "center",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--color-text-secondary)",
  pointerEvents: "none",
};

const burstLabelStyle: CSSProperties = {
  position: "absolute",
  top: "10%",
  left: 0,
  right: 0,
  textAlign: "center",
  fontFamily: "var(--font-display)",
  fontStyle: "italic",
  fontSize: "2rem",
  fontWeight: 600,
  color: "var(--color-accent)",
  textShadow: "0 1px 8px rgba(255,255,255,0.9)",
  pointerEvents: "none",
  animation: "kidQuestGrowFloat 1000ms ease-out forwards",
};

const shrinkLabelStyle: CSSProperties = {
  ...burstLabelStyle,
  color: "var(--color-danger)",
};

const sparkleContainerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

interface TreeProps {
  /** Test/Storybook escape hatch — when omitted, reads from the session bus. */
  forceState?: TreeState;
  forceWilted?: boolean;
  forceDead?: boolean;
}

type BurstKind = "grow" | "shrink" | null;

const BURST_DURATION_MS = 1000;

function stageIndex(state: TreeState): number {
  const idx = STAGE_ORDER.indexOf(state);
  return idx < 0 ? 0 : idx;
}

export function Tree(props: TreeProps = {}): ReactElement {
  const live = useTreeState();
  const state = props.forceState ?? live.state;
  const isWilted = props.forceWilted ?? live.isWilted;
  const isDead = props.forceDead ?? live.isDead;

  const [burst, setBurst] = useState<BurstKind>(null);
  const burstKeyRef = useRef(0);
  const [burstKey, setBurstKey] = useState(0);
  const prevStateRef = useRef<TreeState>(state);

  useEffect(() => {
    const prev = prevStateRef.current;
    if (state !== prev) {
      const nextIdx = stageIndex(state);
      const prevIdx = stageIndex(prev);
      if (!isDead && !isWilted && nextIdx > prevIdx) {
        burstKeyRef.current += 1;
        setBurstKey(burstKeyRef.current);
        setBurst("grow");
      } else if (nextIdx < prevIdx || isWilted || isDead) {
        burstKeyRef.current += 1;
        setBurstKey(burstKeyRef.current);
        setBurst("shrink");
      }
      prevStateRef.current = state;
    }
    if (burst === null) return;
    const timer = window.setTimeout(() => setBurst(null), BURST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [state, isDead, isWilted, burst]);

  // Wilt & dead are modifiers layered on top of the current thriving stage.
  // Dead supersedes wilt visually.
  const baseFilter = isDead
    ? "grayscale(85%) brightness(0.7)"
    : isWilted
      ? "sepia(45%) saturate(70%) brightness(0.95)"
      : "none";
  const burstFilter =
    burst === "grow"
      ? "drop-shadow(0 0 18px rgba(250, 204, 21, 0.9)) drop-shadow(0 0 36px rgba(110, 231, 110, 0.55))"
      : burst === "shrink"
        ? "drop-shadow(0 0 14px rgba(220, 60, 60, 0.75))"
        : "none";

  const wrapStyle: CSSProperties = {
    ...svgWrapStyle,
    filter:
      burst === null
        ? baseFilter
        : baseFilter === "none"
          ? burstFilter
          : `${baseFilter} ${burstFilter}`,
    opacity: isDead ? 0.85 : 1,
    transition:
      burst === null
        ? svgWrapStyle.transition
        : "filter 200ms ease-out, opacity 400ms ease",
  };

  const stageSvgStyle: CSSProperties = {
    ...svgStyle,
    animation:
      burst === "grow"
        ? `kidQuestGrowPulse ${BURST_DURATION_MS}ms cubic-bezier(.2,1.4,.4,1) both`
        : burst === "shrink"
          ? `kidQuestShrinkPulse ${BURST_DURATION_MS}ms ease-out both`
          : undefined,
  };

  const label = describe(state, isWilted, isDead);

  return (
    <div
      style={containerStyle}
      role="img"
      aria-label={label}
      data-tree-state={state}
      data-tree-wilted={isWilted ? "1" : "0"}
      data-tree-dead={isDead ? "1" : "0"}
    >
      <TreeKeyframes />
      <div style={wrapStyle}>
        <svg
          key={`${state}-${burstKey}`}
          viewBox={VIEWBOX}
          xmlns="http://www.w3.org/2000/svg"
          style={stageSvgStyle}
          aria-hidden="true"
        >
          <Ground />
          <Stage state={state} isDead={isDead} isWilted={isWilted} />
        </svg>
      </div>
      {burst === "grow" ? (
        <>
          <span key={`grow-${burstKey}`} style={burstLabelStyle} aria-hidden>
            +1 ✨
          </span>
          <div
            key={`sparkles-${burstKey}`}
            style={sparkleContainerStyle}
            aria-hidden
          >
            {SPARKLE_OFFSETS.map((offset, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  fontSize: "1rem",
                  left: `calc(50% + ${offset.x}px)`,
                  top: `calc(50% + ${offset.y}px)`,
                  animation: `kidQuestSparkle ${BURST_DURATION_MS}ms ease-out forwards`,
                  animationDelay: `${i * 40}ms`,
                  opacity: 0,
                }}
              >
                ✦
              </span>
            ))}
          </div>
        </>
      ) : null}
      {burst === "shrink" ? (
        <span key={`shrink-${burstKey}`} style={shrinkLabelStyle} aria-hidden>
          −1
        </span>
      ) : null}
      <span style={statusStyle} aria-hidden="true">
        {isDead ? "withered" : isWilted ? "wilting" : state}
      </span>
    </div>
  );
}

const SPARKLE_OFFSETS = [
  { x: -60, y: -30 },
  { x: 60, y: -30 },
  { x: -40, y: -60 },
  { x: 40, y: -60 },
  { x: 0, y: -80 },
  { x: -80, y: 10 },
  { x: 80, y: 10 },
];

/**
 * Injects @keyframes once per page. Inline styles can't carry keyframes,
 * and the project intentionally avoids global CSS / styled-jsx, so a small
 * `<style>` tag rendered alongside the tree is the lightest option.
 */
function TreeKeyframes(): ReactElement {
  return (
    <style>
      {`
@keyframes kidQuestGrowPulse {
  0%   { transform: scale(1)   translateY(0);    }
  35%  { transform: scale(1.18) translateY(-6px); }
  60%  { transform: scale(1.08) translateY(-2px); }
  100% { transform: scale(1)   translateY(0);    }
}
@keyframes kidQuestShrinkPulse {
  0%   { transform: scale(1) translateY(0);    }
  25%  { transform: scale(0.92) translateY(4px); }
  100% { transform: scale(1) translateY(0);    }
}
@keyframes kidQuestGrowFloat {
  0%   { transform: translateY(8px); opacity: 0; }
  20%  { opacity: 1; }
  100% { transform: translateY(-44px); opacity: 0; }
}
@keyframes kidQuestSparkle {
  0%   { transform: scale(0.4); opacity: 0; }
  30%  { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1.4) translateY(-24px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; }
}
      `}
    </style>
  );
}

function describe(
  state: TreeState,
  isWilted: boolean,
  isDead: boolean,
): string {
  if (isDead) return "Your tree has withered.";
  if (isWilted) return `Your ${state} is wilting.`;
  if (state === "seed") return "A tiny seed sits in the soil.";
  if (state === "sprout") return "A small green sprout.";
  if (state === "sapling") return "A young sapling with a few leaves.";
  if (state === "tree") return "A leafy tree.";
  return "A blooming tree with flowers.";
}

function Ground(): ReactElement {
  return (
    <>
      <rect x="0" y="0" width="200" height="240" fill={PALETTE.sky} />
      <ellipse cx="100" cy="220" rx="90" ry="14" fill={PALETTE.soilDark} />
      <ellipse cx="100" cy="216" rx="80" ry="10" fill={PALETTE.soil} />
    </>
  );
}

interface StageProps {
  state: TreeState;
  isWilted: boolean;
  isDead: boolean;
}

function Stage({ state, isWilted, isDead }: StageProps): ReactElement {
  // Pick the palette per modifier. Dead -> mono brown silhouette. Wilted ->
  // washed-out yellow-brown variants. The CSS filter on the wrapper also
  // contributes, but per-shape fills keep the wilt/dead readable even on
  // displays that ignore filters.
  const trunk = isDead
    ? PALETTE.deadTrunk
    : isWilted
      ? PALETTE.wiltTrunk
      : PALETTE.trunk;
  const trunkLight = isDead
    ? PALETTE.deadTrunk
    : isWilted
      ? PALETTE.wiltTrunk
      : PALETTE.trunkLight;
  const leaf = isDead
    ? PALETTE.deadLeaf
    : isWilted
      ? PALETTE.wiltLeaf
      : PALETTE.leaf;
  const leafDark = isDead
    ? PALETTE.deadLeaf
    : isWilted
      ? PALETTE.wiltTrunk
      : PALETTE.leafDark;
  const leafLight = isDead
    ? PALETTE.deadLeaf
    : isWilted
      ? PALETTE.wiltLeaf
      : PALETTE.leafLight;

  switch (state) {
    case "seed":
      return (
        <g>
          {/* Seed nestled in the soil with a faint hint of life. */}
          <ellipse
            cx="100"
            cy="212"
            rx="14"
            ry="9"
            fill={isDead ? PALETTE.deadTrunk : PALETTE.seedShell}
          />
          <path
            d="M100 205 Q104 198 100 192 Q96 198 100 205 Z"
            fill={isDead ? PALETTE.deadLeaf : PALETTE.sprout}
            opacity={isDead ? 0.6 : 1}
          />
        </g>
      );

    case "sprout":
      return (
        <g>
          <path
            d="M100 210 Q100 188 100 178"
            stroke={isDead ? PALETTE.deadTrunk : PALETTE.sprout}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M100 188 Q88 182 82 176 Q92 180 100 188"
            fill={isDead ? PALETTE.deadLeaf : PALETTE.sprout}
          />
          <path
            d="M100 184 Q112 180 118 174 Q108 178 100 184"
            fill={isDead ? PALETTE.deadLeaf : PALETTE.sprout}
          />
        </g>
      );

    case "sapling":
      return (
        <g>
          {/* Slim trunk + two-tier crown. */}
          <rect x="96" y="150" width="8" height="62" rx="3" fill={trunk} />
          <ellipse cx="100" cy="148" rx="32" ry="22" fill={leafDark} />
          <ellipse cx="92" cy="142" rx="22" ry="16" fill={leaf} />
          <ellipse cx="112" cy="144" rx="18" ry="14" fill={leafLight} />
        </g>
      );

    case "tree":
      return (
        <g>
          {/* Wider trunk with branches + lush canopy. */}
          <path
            d="M94 212 L94 150 Q94 132 100 122 Q106 132 106 150 L106 212 Z"
            fill={trunk}
          />
          <path
            d="M100 150 L80 130"
            stroke={trunkLight}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M100 150 L122 128"
            stroke={trunkLight}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <ellipse cx="100" cy="118" rx="46" ry="34" fill={leafDark} />
          <ellipse cx="76" cy="124" rx="24" ry="20" fill={leaf} />
          <ellipse cx="126" cy="120" rx="26" ry="22" fill={leaf} />
          <ellipse cx="100" cy="100" rx="34" ry="22" fill={leafLight} />
        </g>
      );

    case "blooming":
    default:
      return (
        <g>
          {/* Same silhouette as `tree` plus blossoms. */}
          <path
            d="M94 212 L94 150 Q94 132 100 122 Q106 132 106 150 L106 212 Z"
            fill={trunk}
          />
          <path
            d="M100 150 L78 128"
            stroke={trunkLight}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M100 150 L124 126"
            stroke={trunkLight}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <ellipse cx="100" cy="116" rx="48" ry="36" fill={leafDark} />
          <ellipse cx="74" cy="124" rx="26" ry="22" fill={leaf} />
          <ellipse cx="128" cy="120" rx="28" ry="22" fill={leaf} />
          <ellipse cx="100" cy="98" rx="36" ry="24" fill={leafLight} />
          {/* Blooms — hidden when wilted/dead to read as a loss of vibrancy. */}
          {isDead || isWilted ? null : (
            <g>
              <Blossom cx={78} cy={110} />
              <Blossom cx={122} cy={104} />
              <Blossom cx={100} cy={88} />
              <Blossom cx={90} cy={130} />
              <Blossom cx={116} cy={132} />
            </g>
          )}
        </g>
      );
  }
}

function Blossom({ cx, cy }: { cx: number; cy: number }): ReactElement {
  const r = 4;
  return (
    <g>
      <circle cx={cx - r} cy={cy} r={r} fill={PALETTE.bloom} />
      <circle cx={cx + r} cy={cy} r={r} fill={PALETTE.bloom} />
      <circle cx={cx} cy={cy - r} r={r} fill={PALETTE.bloom} />
      <circle cx={cx} cy={cy + r} r={r} fill={PALETTE.bloom} />
      <circle cx={cx} cy={cy} r={r - 1} fill={PALETTE.bloomCore} />
    </g>
  );
}
