import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "../store/notesStore";
import {
  normalizeInternalLinkTitle,
  parseInternalLinks,
  resolveInternalLinks,
} from "../utils/links";

type GraphMode = "local" | "global";

type GraphNode = {
  id: string;
  title: string;
  folderName: string;
  tags: string[];
  isPinned: boolean;
  isFavorite: boolean;
  updatedAt: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
};

type GraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
};

/* ── force simulation params ── */
const SIM_ITERATIONS = 120;
const REPULSION = 4200;
const SPRING_LENGTH = 140;
const SPRING_STRENGTH = 0.012;
const DAMPING = 0.92;
const CENTER_GRAVITY = 0.008;
const MIN_DISTANCE = 55;

/* ── Deterministic seeded PRNG (mulberry32) ── */
function createSeededRng(seed: number) {
  let t = seed | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function runForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
) {
  const cx = width / 2;
  const cy = height / 2;

  // Create a deterministic seed from sorted node IDs so layout is stable
  const seedString = nodes.map((n) => n.id).sort().join(",");
  const rng = createSeededRng(hashString(seedString));

  // Seed positions in a jittered circle using deterministic RNG
  const count = nodes.length;
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(count, 1) - Math.PI / 2;
    const r = 80 + rng() * Math.min(width, height) * 0.3;
    n.x = cx + Math.cos(angle) * r + (rng() - 0.5) * 30;
    n.y = cy + Math.sin(angle) * r + (rng() - 0.5) * 30;
    n.vx = 0;
    n.vy = 0;
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
    const cooling = 1 - iter / SIM_ITERATIONS;

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_DISTANCE) dist = MIN_DISTANCE;
        const force = (REPULSION * cooling) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Spring attraction along edges
    for (const edge of edges) {
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const displacement = dist - SPRING_LENGTH;
      const force = displacement * SPRING_STRENGTH * cooling;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    // Center gravity
    for (const node of nodes) {
      node.vx += (cx - node.x) * CENTER_GRAVITY * cooling;
      node.vy += (cy - node.y) * CENTER_GRAVITY * cooling;
    }

    // Apply velocities
    for (const node of nodes) {
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
    }
  }
}

/* ── helpers ── */

function nodeRadius(connections: number): number {
  return 5 + Math.min(connections, 10) * 1.5;
}

function haloRadius(connections: number): number {
  return nodeRadius(connections) + 6;
}

function EmptyGraphState({ title }: { title: string }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-sm rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-8">
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Create links by typing [[Note Title]] inside a note.
        </p>
      </div>
    </div>
  );
}

/* ── Zoom controls ── */
function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="graph-zoom-controls">
      <button onClick={onZoomIn} title="Zoom in">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <button onClick={onReset} title="Reset view" className="graph-zoom-label">
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={onZoomOut} title="Zoom out">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* ── Main component ── */
export function GraphView() {
  const { notes, selectedNote, selectNote } = useNotes();
  const [mode, setMode] = useState<GraphMode>(selectedNote ? "local" : "global");
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Step 1: Compute the full graph layout — only re-runs when notes change,
  // NOT when selectedNote or mode changes. This keeps positions stable.
  const fullGraph = useMemo(() => {
    const visibleNotes = notes.filter((note) => !note.isDeleted && !note.isArchived);
    const noteMap = new Map(visibleNotes.map((note) => [note.id, note]));
    const edgeMap = new Map<string, GraphEdge>();
    const connectionCount = new Map<string, number>();

    for (const note of visibleNotes) {
      const links = resolveInternalLinks(parseInternalLinks(note.content, note.id), visibleNotes);

      for (const link of links) {
        if (!link.targetNote || !noteMap.has(link.targetNote.id)) continue;

        const edgeId = `${note.id}->${link.targetNote.id}`;
        const reverseEdgeId = `${link.targetNote.id}->${note.id}`;
        if (!edgeMap.has(edgeId) && !edgeMap.has(reverseEdgeId)) {
          edgeMap.set(edgeId, {
            id: edgeId,
            sourceId: note.id,
            targetId: link.targetNote.id,
          });
        }
        connectionCount.set(note.id, (connectionCount.get(note.id) || 0) + 1);
        connectionCount.set(
          link.targetNote.id,
          (connectionCount.get(link.targetNote.id) || 0) + 1,
        );
      }
    }

    const allEdges = Array.from(edgeMap.values());
    const WIDTH = 1000;
    const HEIGHT = 620;

    const allNodes: GraphNode[] = visibleNotes.map((note) => ({
      id: note.id,
      title: note.title || "Untitled Note",
      folderName: note.folderName,
      tags: note.tags,
      isPinned: note.isPinned,
      isFavorite: note.isFavorite,
      updatedAt: note.updatedAt,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      connections: connectionCount.get(note.id) || 0,
    }));

    runForceSimulation(allNodes, allEdges, WIDTH, HEIGHT);

    return { allNodes, allEdges, allNotes: visibleNotes };
  }, [notes]);

  // Step 2: Scope/filter the pre-computed layout based on mode + selectedNote.
  // This is cheap — no simulation re-run, positions are preserved.
  const graph = useMemo(() => {
    const { allNodes, allEdges, allNotes } = fullGraph;
    const positionMap = new Map(allNodes.map((n) => [n.id, { x: n.x, y: n.y }]));

    const selectedId =
      selectedNote && !selectedNote.isDeleted && !selectedNote.isArchived ? selectedNote.id : null;
    const localIds = new Set<string>();

    if (selectedId) {
      localIds.add(selectedId);
      for (const edge of allEdges) {
        if (edge.sourceId === selectedId) localIds.add(edge.targetId);
        if (edge.targetId === selectedId) localIds.add(edge.sourceId);
      }
    }

    const scopedNodes =
      mode === "local" && selectedId
        ? allNodes.filter((node) => localIds.has(node.id))
        : allNodes;
    const scopedIds = new Set(scopedNodes.map((node) => node.id));
    const scopedEdges = allEdges.filter(
      (edge) => scopedIds.has(edge.sourceId) && scopedIds.has(edge.targetId),
    );

    // Preserve positions from the full layout
    const nodes = scopedNodes.map((node) => {
      const pos = positionMap.get(node.id);
      return { ...node, x: pos?.x ?? node.x, y: pos?.y ?? node.y };
    });

    return {
      allEdges,
      allNotes,
      edges: scopedEdges,
      nodes,
    };
  }, [fullGraph, mode, selectedNote]);

  // Reset pan/zoom only when switching modes (not on node click)
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [mode]);

  const normalizedQuery = normalizeInternalLinkTitle(query);
  const matchingIds = new Set(
    graph.nodes
      .filter((node) => {
        if (!normalizedQuery) return false;
        return normalizeInternalLinkTitle(
          [node.title, node.folderName, ...node.tags].join(" "),
        ).includes(normalizedQuery);
      })
      .map((node) => node.id),
  );
  const hoveredConnections = new Set<string>();

  if (hoveredId) {
    hoveredConnections.add(hoveredId);
    for (const edge of graph.edges) {
      if (edge.sourceId === hoveredId) hoveredConnections.add(edge.targetId);
      if (edge.targetId === hoveredId) hoveredConnections.add(edge.sourceId);
    }
  }

  const hasMatches = !normalizedQuery || matchingIds.size > 0;
  const selectedIsInGraph = selectedNote
    ? graph.nodes.some((node) => node.id === selectedNote.id)
    : false;

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      // only start pan if we didn't click a node
      const target = e.target as SVGElement;
      if (target.closest(".graph-node")) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      setZoom((prev) => Math.max(0.2, Math.min(5, prev * delta)));
    },
    [],
  );

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(5, z * 1.25)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(0.2, z * 0.8)), []);
  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Compute the viewBox based on pan/zoom
  const vbWidth = 1000 / zoom;
  const vbHeight = 620 / zoom;
  const vbX = (1000 - vbWidth) / 2 - pan.x / zoom;
  const vbY = (620 - vbHeight) / 2 - pan.y / zoom;

  // Should we show labels? Show all labels if few nodes, otherwise only hovered/selected
  const showAllLabels = graph.nodes.length <= 12;

  return (
    <main className="column-panel editor-glow col-span-1 flex min-h-0 flex-col overflow-hidden xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Linked Notes
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">Graph</h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="h-9 w-52 rounded-xl border border-white/10 bg-night-950/55 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-lumo-teal/40"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Highlight notes..."
          />
          <div className="inline-flex rounded-xl border border-white/10 bg-night-950/35 p-1 text-xs text-slate-400">
            {(["local", "global"] as const).map((item) => (
              <button
                key={item}
                className={`rounded-lg px-3 py-1.5 capitalize transition active:scale-95 ${
                  mode === item
                    ? "bg-lumo-violet/20 text-white shadow-[inset_0_0_0_1px_rgba(156,124,244,0.28)]"
                    : "hover:bg-white/[0.05] hover:text-slate-200"
                }`}
                onClick={() => setMode(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300 transition hover:border-lumo-teal/30 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!selectedNote}
            onClick={() => setMode("local")}
          >
            Focus selected
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        {graph.allNotes.length === 0 ? (
          <EmptyGraphState title="No notes to graph yet" />
        ) : graph.allEdges.length === 0 ? (
          <EmptyGraphState title="No note links yet" />
        ) : mode === "local" && selectedNote && !selectedIsInGraph ? (
          <EmptyGraphState title="Selected note has no graph links" />
        ) : !hasMatches ? (
          <EmptyGraphState title={`No graph matches for "${query.trim()}"`} />
        ) : (
          <div
            ref={containerRef}
            className="graph-canvas relative h-full min-h-[520px] overflow-hidden rounded-2xl border border-white/10 bg-night-950/35"
            style={{ cursor: isPanning ? "grabbing" : "grab" }}
          >
            <svg
              className="h-full w-full"
              viewBox={`${vbX} ${vbY} ${vbWidth} ${vbHeight}`}
              role="img"
              aria-label="Linked notes graph"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              <defs>
                <radialGradient id="nodeGlow" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="rgba(89,213,202,0.34)" />
                  <stop offset="100%" stopColor="rgba(156,124,244,0.05)" />
                </radialGradient>
                <radialGradient id="nodeGlowSelected" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="rgba(89,213,202,0.6)" />
                  <stop offset="100%" stopColor="rgba(156,124,244,0.15)" />
                </radialGradient>
              </defs>

              {/* Edges */}
              {graph.edges.map((edge) => {
                const source = graph.nodes.find((node) => node.id === edge.sourceId);
                const target = graph.nodes.find((node) => node.id === edge.targetId);
                if (!source || !target) return null;

                const active = hoveredId
                  ? edge.sourceId === hoveredId || edge.targetId === hoveredId
                  : false;
                const dimmedEdge = hoveredId && !active;

                return (
                  <line
                    key={edge.id}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    className={
                      active
                        ? "graph-edge graph-edge-active"
                        : dimmedEdge
                          ? "graph-edge graph-edge-dimmed"
                          : "graph-edge"
                    }
                  />
                );
              })}

              {/* Nodes */}
              {graph.nodes.map((node) => {
                const selected = selectedNote?.id === node.id;
                const matched = matchingIds.has(node.id);
                const connected = hoveredId ? hoveredConnections.has(node.id) : true;
                const dimmed = hoveredId ? !connected : normalizedQuery ? !matched : false;
                const isHovered = hoveredId === node.id;
                const showLabel = showAllLabels || isHovered || selected || (hoveredId !== null && connected);
                const r = nodeRadius(node.connections);
                const hr = haloRadius(node.connections);
                const selectedR = r * 1.3;
                const selectedHr = hr * 1.3;

                return (
                  <g
                    key={node.id}
                    className={`graph-node ${selected ? "graph-node-selected" : ""} ${
                      dimmed ? "graph-node-dimmed" : ""
                    }`}
                    transform={`translate(${node.x} ${node.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectNote(node.id);
                    }}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Halo */}
                    <circle
                      r={selected ? selectedHr : hr}
                      className="graph-node-halo"
                      fill={selected ? "url(#nodeGlowSelected)" : "url(#nodeGlow)"}
                    />
                    {/* Core */}
                    <circle r={selected ? selectedR : r} className="graph-node-core" />
                    {/* Pin indicator */}
                    {node.isPinned && (
                      <circle
                        cx={r * 0.7}
                        cy={-r * 0.7}
                        r={2.5}
                        className="graph-node-pin"
                      />
                    )}
                    {/* Favorite indicator */}
                    {node.isFavorite && (
                      <circle
                        cx={-r * 0.7}
                        cy={-r * 0.7}
                        r={2.5}
                        className="graph-node-favorite"
                      />
                    )}
                    {/* Label – only on hover/select/few nodes */}
                    {showLabel && (
                      <text
                        y={selected ? selectedR + 14 : r + 14}
                        textAnchor="middle"
                        className={`graph-node-label ${isHovered || selected ? "graph-node-label-visible" : "graph-node-label-fade"}`}
                      >
                        {node.title.length > 20
                          ? `${node.title.slice(0, 19)}…`
                          : node.title}
                      </text>
                    )}
                    {/* Meta – only on hover or selected */}
                    {(isHovered || selected) && (
                      <text
                        y={selected ? selectedR + 27 : r + 27}
                        textAnchor="middle"
                        className="graph-node-meta"
                      >
                        {node.folderName} · {node.connections} link{node.connections !== 1 ? "s" : ""}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Zoom controls */}
            <ZoomControls
              zoom={zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onReset={handleZoomReset}
            />

            {/* Node count badge */}
            <div className="graph-info-badge">
              {graph.nodes.length} note{graph.nodes.length !== 1 ? "s" : ""} · {graph.edges.length} link{graph.edges.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
