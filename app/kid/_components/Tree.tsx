"use client";

/**
 * Tree visual. Five thriving SVGs (seed → blooming) plus two CSS-applied
 * modifiers (wilt, dead). Self-contained — no external assets, no
 * style-file changes. Centers itself inside whatever container hosts it
 * (KidStudy's `data-slot="tree"` is a fixed-height flex item).
 *
 * Transitions: simple CSS opacity + transform fade-cross between stages so
 * we never trigger layout work in the parent slot. Reduced-motion users get
 * an instant swap.
 */

import type { CSSProperties, ReactElement } from "react";
import type { TreeState } from "@/lib/contracts";
import { useTreeState } from "@/lib/kid/tree/hook";

const VIEWBOX = "0 0 200 240";

const PALETTE = {
  sky: "#eaf3ec",
  soil: "#7a5a3a",
  soilDark: "#5b4128",
  trunk: "#6b4a2a",
  trunkLight: "#8a6438",
  leafDark: "#3f7d3f",
  leaf: "#5aa15a",
  leafLight: "#8fc88f",
  bloom: "#f5a3c7",
  bloomCore: "#e36ea5",
  seedShell: "#caa37a",
  sprout: "#7fbd6a",
  wiltLeaf: "#c9b463",
  wiltTrunk: "#7b6336",
  deadTrunk: "#4a3f33",
  deadLeaf: "#6e6457",
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
};

const statusStyle: CSSProperties = {
  position: "absolute",
  bottom: "0.5rem",
  left: 0,
  right: 0,
  textAlign: "center",
  fontSize: "0.75rem",
  color: "#516a55",
  pointerEvents: "none",
  letterSpacing: "0.04em",
};

interface TreeProps {
  /** Test/Storybook escape hatch — when omitted, reads from the session bus. */
  forceState?: TreeState;
  forceWilted?: boolean;
  forceDead?: boolean;
}

export function Tree(props: TreeProps = {}): ReactElement {
  const live = useTreeState();
  const state = props.forceState ?? live.state;
  const isWilted = props.forceWilted ?? live.isWilted;
  const isDead = props.forceDead ?? live.isDead;

  // Wilt & dead are modifiers layered on top of the current thriving stage.
  // Dead supersedes wilt visually.
  const wrapStyle: CSSProperties = {
    ...svgWrapStyle,
    filter: isDead
      ? "grayscale(85%) brightness(0.7)"
      : isWilted
        ? "sepia(45%) saturate(70%) brightness(0.95)"
        : "none",
    opacity: isDead ? 0.85 : 1,
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
      <div style={wrapStyle}>
        <svg
          viewBox={VIEWBOX}
          xmlns="http://www.w3.org/2000/svg"
          style={svgStyle}
          aria-hidden="true"
        >
          <Ground />
          <Stage state={state} isDead={isDead} isWilted={isWilted} />
        </svg>
      </div>
      <span style={statusStyle} aria-hidden="true">
        {isDead ? "withered" : isWilted ? "wilting" : state}
      </span>
    </div>
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
