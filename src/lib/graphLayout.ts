// Deterministic radial layout for a kanji neighborhood (hub-and-spoke).
//
// The focal kanji sits at the origin. Leaf kanji are distributed around the full
// circle, grouped by connector, with a guaranteed minimum spacing — the rings
// grow with the neighborhood size so a busy kanji (e.g. 陽) never overlaps. No
// physics → no settle jank, identical every render, instant to recompute.

import type { ConnectorKind, Neighborhood } from "./kanjiGraph";

export const R_CENTER = 30;
export const R_CONNECTOR = 19;
export const R_KANJI = 23;

const BASE_KANJI = 250; // minimum leaf-ring radius (sparse graphs)
const BASE_CONNECTOR = 130;
const GAP = 16; // minimum px between adjacent leaf nodes
const GAP_WEIGHT = 1.5; // inter-group gap measured in leaf-slots
const FILL = 0.82;
const PADDING = 16;

export type GraphNodeKind = "center" | "connector" | "kanji";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  x: number;
  y: number;
  connectorKind?: ConnectorKind;
  clickable: boolean;
};

export type GraphEdge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: ConnectorKind;
};

export type GraphLayout = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewBox: string;
};

const polar = (r: number, a: number) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });

export function layoutNeighborhood(n: Neighborhood): GraphLayout {
  const nodes: GraphNode[] = [
    { id: "center", kind: "center", label: n.center, x: 0, y: 0, clickable: false },
  ];
  const edges: GraphEdge[] = [];

  const connectors = n.connectors;
  const leafCount = connectors.reduce((s, c) => s + c.kanji.length, 0);

  if (connectors.length > 0 && leafCount > 0) {
    const C = connectors.length;
    // Split the full circle into one slot per leaf plus a gap per connector...
    const totalUnits = leafCount + C * GAP_WEIGHT;
    const leafAngle = (2 * Math.PI) / totalUnits;
    const gapAngle = GAP_WEIGHT * leafAngle;
    // ...then grow the leaf ring if that angular spacing would pack the discs
    // closer than GAP allows (keeps dense graphs from overlapping).
    const leafChord = 2 * R_KANJI + GAP;
    const ringKanji = Math.max(BASE_KANJI, leafChord / leafAngle / FILL);
    const ringConnector = Math.max(BASE_CONNECTOR, ringKanji * 0.5);

    let cursor = -Math.PI / 2; // start at the top

    connectors.forEach((conn, ci) => {
      const span = conn.kanji.length * leafAngle;
      const mid = cursor + span / 2;

      const cPos = polar(ringConnector, mid);
      const cId = `c-${conn.el}-${ci}`;
      nodes.push({
        id: cId,
        kind: "connector",
        label: conn.el,
        x: cPos.x,
        y: cPos.y,
        connectorKind: conn.kind,
        clickable: conn.clickable,
      });
      edges.push({ id: `e-center-${cId}`, x1: 0, y1: 0, x2: cPos.x, y2: cPos.y, kind: conn.kind });

      conn.kanji.forEach((char, ki) => {
        const ang = cursor + (ki + 0.5) * leafAngle;
        const kPos = polar(ringKanji, ang);
        const kId = `k-${char}`;
        nodes.push({
          id: kId,
          kind: "kanji",
          label: char,
          x: kPos.x,
          y: kPos.y,
          connectorKind: conn.kind,
          clickable: true,
        });
        edges.push({
          id: `e-${cId}-${kId}`,
          x1: cPos.x,
          y1: cPos.y,
          x2: kPos.x,
          y2: kPos.y,
          kind: conn.kind,
        });
      });

      cursor += span + gapAngle;
    });
  }

  // Fit the viewBox to the laid-out nodes (+ their radii + padding).
  let minX = -R_CENTER;
  let minY = -R_CENTER;
  let maxX = R_CENTER;
  let maxY = R_CENTER;
  for (const node of nodes) {
    const r = node.kind === "kanji" ? R_KANJI : node.kind === "connector" ? R_CONNECTOR : R_CENTER;
    minX = Math.min(minX, node.x - r);
    minY = Math.min(minY, node.y - r);
    maxX = Math.max(maxX, node.x + r);
    maxY = Math.max(maxY, node.y + r);
  }
  minX -= PADDING;
  minY -= PADDING;
  maxX += PADDING;
  maxY += PADDING;

  return {
    nodes,
    edges,
    viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
  };
}
