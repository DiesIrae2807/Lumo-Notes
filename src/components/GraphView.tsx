import { useMemo, useState } from "react";
import { useNotes } from "../store/notesStore";
import { formatRelativeTime } from "../utils/date";
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
};

type GraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
};

const center = { x: 500, y: 310 };
const radius = 215;

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

export function GraphView() {
  const { notes, selectedNote, selectNote } = useNotes();
  const [mode, setMode] = useState<GraphMode>(selectedNote ? "local" : "global");
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const graph = useMemo(() => {
    const visibleNotes = notes.filter((note) => !note.isDeleted && !note.isArchived);
    const noteMap = new Map(visibleNotes.map((note) => [note.id, note]));
    const edgeMap = new Map<string, GraphEdge>();

    for (const note of visibleNotes) {
      const links = resolveInternalLinks(parseInternalLinks(note.content, note.id), visibleNotes);

      for (const link of links) {
        if (!link.targetNote || !noteMap.has(link.targetNote.id)) continue;

        const edgeId = `${note.id}->${link.targetNote.id}`;
        if (!edgeMap.has(edgeId)) {
          edgeMap.set(edgeId, {
            id: edgeId,
            sourceId: note.id,
            targetId: link.targetNote.id,
          });
        }
      }
    }

    const allEdges = Array.from(edgeMap.values());
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

    const scopedNotes =
      mode === "local" && selectedId
        ? visibleNotes.filter((note) => localIds.has(note.id))
        : visibleNotes;
    const scopedIds = new Set(scopedNotes.map((note) => note.id));
    const scopedEdges = allEdges.filter(
      (edge) => scopedIds.has(edge.sourceId) && scopedIds.has(edge.targetId),
    );

    const arranged = scopedNotes.map((note, index) => {
      if (mode === "local" && selectedId && note.id === selectedId) {
        return { note, x: center.x, y: center.y };
      }

      const ringItems = mode === "local" && selectedId
        ? scopedNotes.filter((item) => item.id !== selectedId)
        : scopedNotes;
      const ringIndex = mode === "local" && selectedId
        ? ringItems.findIndex((item) => item.id === note.id)
        : index;
      const total = Math.max(ringItems.length, 1);
      const angle = -Math.PI / 2 + (2 * Math.PI * ringIndex) / total;
      const localRadius = mode === "local" && selectedId ? 205 : radius;

      return {
        note,
        x: center.x + Math.cos(angle) * localRadius,
        y: center.y + Math.sin(angle) * localRadius,
      };
    });

    const nodes: GraphNode[] = arranged.map(({ note, x, y }) => ({
      id: note.id,
      title: note.title || "Untitled Note",
      folderName: note.folderName,
      tags: note.tags,
      isPinned: note.isPinned,
      isFavorite: note.isFavorite,
      updatedAt: note.updatedAt,
      x,
      y,
    }));

    return {
      allEdges,
      allNotes: visibleNotes,
      edges: scopedEdges,
      nodes,
    };
  }, [mode, notes, selectedNote]);

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
          <div className="graph-canvas relative h-full min-h-[520px] overflow-hidden rounded-2xl border border-white/10 bg-night-950/35">
            <svg className="h-full w-full" viewBox="0 0 1000 620" role="img" aria-label="Linked notes graph">
              <defs>
                <radialGradient id="nodeGlow" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="rgba(89,213,202,0.34)" />
                  <stop offset="100%" stopColor="rgba(156,124,244,0.05)" />
                </radialGradient>
              </defs>
              {graph.edges.map((edge) => {
                const source = graph.nodes.find((node) => node.id === edge.sourceId);
                const target = graph.nodes.find((node) => node.id === edge.targetId);
                if (!source || !target) return null;

                const active = hoveredId
                  ? edge.sourceId === hoveredId || edge.targetId === hoveredId
                  : false;

                return (
                  <line
                    key={edge.id}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    className={active ? "graph-edge graph-edge-active" : "graph-edge"}
                  />
                );
              })}

              {graph.nodes.map((node) => {
                const selected = selectedNote?.id === node.id;
                const matched = matchingIds.has(node.id);
                const connected = hoveredId ? hoveredConnections.has(node.id) : true;
                const dimmed = hoveredId ? !connected : normalizedQuery ? !matched : false;

                return (
                  <g
                    key={node.id}
                    className={`graph-node ${selected ? "graph-node-selected" : ""} ${
                      dimmed ? "graph-node-dimmed" : ""
                    }`}
                    transform={`translate(${node.x} ${node.y})`}
                    onClick={() => selectNote(node.id)}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <circle r={selected ? 38 : 31} className="graph-node-halo" />
                    <circle r={selected ? 26 : 22} className="graph-node-core" />
                    {node.isPinned ? <circle cx="18" cy="-18" r="5" className="graph-node-pin" /> : null}
                    {node.isFavorite ? <circle cx="-18" cy="-18" r="5" className="graph-node-favorite" /> : null}
                    <text y={selected ? 48 : 42} textAnchor="middle" className="graph-node-label">
                      {node.title.length > 22 ? `${node.title.slice(0, 21)}...` : node.title}
                    </text>
                    <text y={selected ? 64 : 58} textAnchor="middle" className="graph-node-meta">
                      {node.folderName} · {formatRelativeTime(node.updatedAt)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </main>
  );
}
