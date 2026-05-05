import { useState, useReducer, useEffect, useCallback, useRef, useMemo, memo } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────
const LABELS = ["bug", "urgent", "feature", "design", "backend", "frontend"];
const LABEL_COLORS = {
  bug: "#ef4444", urgent: "#f97316", feature: "#3b82f6",
  design: "#a855f7", backend: "#10b981", frontend: "#06b6d4",
};
const COLUMN_CONFIG = {
  todo:       { title: "To Do",       color: "#3b82f6", light: "#1d4ed820" },
  inprogress: { title: "In Progress", color: "#f59e0b", light: "#d9770620" },
  review:     { title: "Review",      color: "#a855f7", light: "#7c3aed20" },
  done:       { title: "Done",        color: "#10b981", light: "#05966920" },
};
const PRIORITY_COLORS = { low: "#6b7280", medium: "#f59e0b", high: "#ef4444" };
const AVATARS = ["Alice", "Bob", "Charlie", "Diana", "Evan", "Fiona"];

// ─── INITIAL DATA ────────────────────────────────────────────
function buildInitialData() {
  const titles = [
    ["Fix login redirect bug", ["bug", "urgent"], "high"],
    ["OAuth 2.0 integration", ["feature", "backend"], "high"],
    ["Design system docs", ["design", "frontend"], "medium"],
    ["API rate limiting", ["backend"], "medium"],
    ["Mobile responsive fixes", ["frontend", "bug"], "high"],
    ["Dark mode support", ["design", "feature"], "medium"],
    ["Performance audit", ["urgent"], "high"],
    ["DB migration script", ["backend"], "medium"],
    ["Unit tests auth module", ["backend"], "low"],
    ["CI/CD pipeline setup", ["feature"], "medium"],
    ["User onboarding flow", ["design", "feature"], "medium"],
    ["Payment gateway", ["feature", "backend"], "high"],
    ["Analytics dashboard", ["feature", "frontend"], "medium"],
    ["Notification system", ["feature", "backend"], "medium"],
    ["Search functionality", ["feature", "frontend"], "medium"],
    ["Export to CSV", ["feature"], "low"],
    ["Accessibility audit", ["urgent", "frontend"], "high"],
    ["Security vulnerability fix", ["bug", "urgent"], "high"],
    ["Code review guidelines", ["design"], "low"],
    ["Staging deployment", ["backend"], "medium"],
    ["Error boundary setup", ["frontend", "bug"], "medium"],
    ["Form validation refactor", ["frontend"], "low"],
    ["Caching layer implementation", ["backend", "feature"], "medium"],
    ["API documentation update", ["backend"], "low"],
  ];

  const cards = {};
  const columns = { todo: [], inprogress: [], review: [], done: [] };
  const colKeys = Object.keys(columns);

  titles.forEach(([title, labels, priority], i) => {
    const id = `card-${i + 1}`;
    const colKey = colKeys[i % 4];
    cards[id] = {
      id, title, labels, priority,
      description: `Detailed requirements for: ${title}. Review specs before starting.`,
      assignee: AVATARS[i % AVATARS.length],
    };
    columns[colKey].push(id);
  });

  return {
    cards,
    columns: Object.fromEntries(colKeys.map(k => [k, { id: k, cardIds: columns[k] }])),
    columnOrder: colKeys,
  };
}

const INITIAL_STATE = buildInitialData();

// ─── REDUCER ────────────────────────────────────────────────
function boardReducer(state, action) {
  switch (action.type) {
    case "MOVE_CARD": {
      const { cardId, fromCol, toCol, toIndex } = action;
      if (!state.columns[fromCol] || !state.columns[toCol]) return state;
      const fromIds = state.columns[fromCol].cardIds.filter(id => id !== cardId);
      const toIds   = fromCol === toCol ? [...fromIds] : [...state.columns[toCol].cardIds];
      toIds.splice(Math.max(0, toIndex), 0, cardId);
      return {
        ...state,
        columns: {
          ...state.columns,
          [fromCol]: { ...state.columns[fromCol], cardIds: fromIds },
          [toCol]:   { ...state.columns[toCol],   cardIds: toIds  },
        },
      };
    }
    default: return state;
  }
}

// ─── CUSTOM HOOKS ────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function useUndoRedo(reducer, initial) {
  const [hist, setHist] = useState({ history: [initial], index: 0 });
  const state = hist.history[hist.index];

  const dispatch = useCallback((action) => {
    setHist(prev => {
      const next = reducer(prev.history[prev.index], action);
      const newH = prev.history.slice(0, prev.index + 1).concat([next]);
      return { history: newH, index: prev.index + 1 };
    });
  }, [reducer]);

  const undo = useCallback(() =>
    setHist(p => ({ ...p, index: Math.max(0, p.index - 1) })), []);
  const redo = useCallback(() =>
    setHist(p => ({ ...p, index: Math.min(p.history.length - 1, p.index + 1) })), []);

  return {
    state, dispatch, undo, redo,
    canUndo: hist.index > 0,
    canRedo: hist.index < hist.history.length - 1,
  };
}

// ─── HIGHLIGHT COMPONENT ────────────────────────────────────
const Highlight = memo(({ text, query }) => {
  if (!query) return <span>{text}</span>;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safe})`, "gi"));
  return (
    <span>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} style={{ background: "#fbbf24", color: "#000", borderRadius: "2px", padding: "0 1px" }}>{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </span>
  );
});

// ─── TOAST ──────────────────────────────────────────────────
function Toast({ toasts, onClose }) {
  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === "conflict" ? "rgba(127,29,29,0.95)" : "rgba(6,78,59,0.95)",
          border: `1px solid ${t.type === "conflict" ? "#ef4444" : "#10b981"}`,
          borderRadius: "10px", padding: "12px 16px", color: "#fff",
          fontSize: "13px", maxWidth: "340px", backdropFilter: "blur(10px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "slideIn 0.25s ease",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{ fontSize: "16px" }}>{t.type === "conflict" ? "⚠️" : "✓"}</span>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
          <button onClick={() => onClose(t.id)} style={{
            background: "none", border: "none", color: "#9ca3af",
            cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "0 2px",
          }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ─── CARD COMPONENT ─────────────────────────────────────────
const KanbanCard = memo(({ card, columnId, onDragStart, onDragEnd, search, isConflict, isDragging, onKeyDown, colColor }) => {
  const initials = card.assignee[0];
  const hue = card.assignee.charCodeAt(0) * 37 % 360;

  return (
    <div
      className={`kcard${isDragging ? " dragging" : ""}${isConflict ? " conflict" : ""}`}
      draggable
      onDragStart={e => onDragStart(e, card.id, columnId)}
      onDragEnd={onDragEnd}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="listitem"
      aria-label={`${card.title}, ${card.priority} priority, in ${columnId}`}
      aria-grabbed={isDragging}
    >
      <div className="card-header">
        <span className="card-title"><Highlight text={card.title} query={search} /></span>
        <span className="priority-dot" style={{ background: PRIORITY_COLORS[card.priority] }} title={card.priority} />
      </div>

      {card.labels.length > 0 && (
        <div className="label-row">
          {card.labels.map(l => (
            <span key={l} className="label-chip" style={{ background: LABEL_COLORS[l] + "25", color: LABEL_COLORS[l], border: `1px solid ${LABEL_COLORS[l]}40` }}>{l}</span>
          ))}
        </div>
      )}

      <div className="card-footer">
        <span className="card-id">#{card.id.split("-")[1]}</span>
        <div className="avatar" style={{ background: `hsl(${hue},55%,42%)` }} title={card.assignee}>{initials}</div>
      </div>
    </div>
  );
});

// ─── COLUMN ─────────────────────────────────────────────────
const KanbanColumn = memo(({ column, cards, config, draggingId, search, conflictId, dispatch, columnOrder, allColumns }) => {
  const [over, setOver] = useState(false);
  const [dropIdx, setDropIdx] = useState(null);

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(true);
    setDropIdx(idx ?? cards.length);
  };
  const handleDragLeave = () => { setOver(false); setDropIdx(null); };
  const handleDrop = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false); setDropIdx(null);
    const cardId  = e.dataTransfer.getData("cardId");
    const fromCol = e.dataTransfer.getData("fromCol");
    if (!cardId) return;
    dispatch({ type: "MOVE_CARD", cardId, fromCol, toCol: column.id, toIndex: idx ?? cards.length });
  };

  const handleCardKey = (e, card, idx) => {
    const ci = columnOrder.indexOf(column.id);
    if (e.key === "ArrowRight" && ci < columnOrder.length - 1) {
      e.preventDefault();
      const toCol = columnOrder[ci + 1];
      dispatch({ type: "MOVE_CARD", cardId: card.id, fromCol: column.id, toCol, toIndex: 0 });
    }
    if (e.key === "ArrowLeft" && ci > 0) {
      e.preventDefault();
      const toCol = columnOrder[ci - 1];
      dispatch({ type: "MOVE_CARD", cardId: card.id, fromCol: column.id, toCol, toIndex: 0 });
    }
  };

  const handleDragStart = (e, cardId, colId) => {
    e.dataTransfer.setData("cardId", cardId);
    e.dataTransfer.setData("fromCol", colId);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      className={`kcolumn${over ? " col-over" : ""}`}
      style={{ "--col-accent": config.color, "--col-light": config.light }}
      onDragOver={e => handleDragOver(e, null)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, null)}
    >
      <div className="col-header">
        <span className="col-dot" style={{ background: config.color }} />
        <h2 className="col-title">{config.title}</h2>
        <span className="col-badge" style={{ background: config.color + "25", color: config.color }}>{cards.length}</span>
      </div>

      <div role="list" aria-label={`${config.title} column`} className="col-body">
        {cards.map((card, idx) => (
          <div
            key={card.id}
            className={`drop-zone${dropIdx === idx && over ? " drop-active" : ""}`}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={e => handleDrop(e, idx)}
          >
            <KanbanCard
              card={card}
              columnId={column.id}
              onDragStart={handleDragStart}
              onDragEnd={() => {}}
              search={search}
              isConflict={conflictId === card.id}
              isDragging={draggingId === card.id}
              onKeyDown={e => handleCardKey(e, card, idx)}
              colColor={config.color}
            />
          </div>
        ))}

        {cards.length === 0 && (
          <div className="empty-col">
            <div className="empty-icon">⊡</div>
            <span>Drop cards here</span>
          </div>
        )}
      </div>
    </div>
  );
});

// ─── CARD DETAIL MODAL ───────────────────────────────────────
function CardModal({ card, onClose }) {
  if (!card) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={card.title}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-id">#{card.id.split("-")[1]}</div>
            <h2 className="modal-title">{card.title}</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">×</button>
        </div>
        <div className="modal-body">
          <div className="modal-desc">{card.description}</div>
          <div className="modal-meta">
            <div className="meta-row"><span className="meta-label">Priority</span>
              <span style={{ color: PRIORITY_COLORS[card.priority], fontWeight: 700 }}>{card.priority}</span>
            </div>
            <div className="meta-row"><span className="meta-label">Assignee</span><span>{card.assignee}</span></div>
            <div className="meta-row"><span className="meta-label">Labels</span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {card.labels.length > 0 ? card.labels.map(l => (
                  <span key={l} className="label-chip" style={{ background: LABEL_COLORS[l] + "25", color: LABEL_COLORS[l], border: `1px solid ${LABEL_COLORS[l]}40` }}>{l}</span>
                )) : <span style={{ color: "var(--text-muted)" }}>None</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────
export default function KanbanBoard() {
  const savedState = useMemo(() => {
    try { const s = localStorage.getItem("kb-state"); return s ? JSON.parse(s) : null; } catch { return null; }
  }, []);
  const savedTheme = useMemo(() => localStorage.getItem("kb-theme") || "dark", []);

  const { state, dispatch, undo, redo, canUndo, canRedo } = useUndoRedo(boardReducer, savedState || INITIAL_STATE);
  const [theme, setTheme] = useState(savedTheme);
  const [search, setSearch] = useState("");
  const [selectedLabels, setSelectedLabels] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const l = p.get("labels"); return l ? l.split(",") : [];
  });
  const [draggingId, setDraggingId] = useState(null);
  const [conflictId, setConflictId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [activeCard, setActiveCard] = useState(null);
  const [simEnabled, setSimEnabled] = useState(true);
  const draggingRef = useRef(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const debouncedSearch = useDebounce(search, 300);

  // Persist state & theme
  useEffect(() => { localStorage.setItem("kb-state", JSON.stringify(state)); }, [state]);
  useEffect(() => { localStorage.setItem("kb-theme", theme); }, [theme]);

  // URL sync for labels
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    selectedLabels.length > 0 ? p.set("labels", selectedLabels.join(",")) : p.delete("labels");
    window.history.replaceState({}, "", "?" + p.toString());
  }, [selectedLabels]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key === "Escape") setActiveCard(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo, redo]);

  // Add toast helper
  const addToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // Real-time simulation
  useEffect(() => {
    if (!simEnabled) return;
    const interval = setInterval(() => {
      const s = stateRef.current;
      const colKeys = s.columnOrder;
      const fromCol = colKeys[Math.floor(Math.random() * colKeys.length)];
      const fromIds = s.columns[fromCol]?.cardIds || [];
      if (!fromIds.length) return;
      const cardId = fromIds[Math.floor(Math.random() * fromIds.length)];
      const toCol   = colKeys[Math.floor(Math.random() * colKeys.length)];
      const card    = s.cards[cardId];
      if (!card) return;

      if (draggingRef.current === cardId) {
        setConflictId(cardId);
        addToast(`⚠️ Conflict: "${card.title}" was moved by another user`, "conflict");
        draggingRef.current = null;
        setDraggingId(null);
        setTimeout(() => setConflictId(null), 3000);
        return;
      }

      dispatch({ type: "MOVE_CARD", cardId, fromCol, toCol, toIndex: s.columns[toCol]?.cardIds?.length || 0 });
    }, 10000);
    return () => clearInterval(interval);
  }, [simEnabled, dispatch, addToast]);

  // Filtered cards per column
  const filteredColumns = useMemo(() => {
    return state.columnOrder.map(colId => {
      const colCardIds = state.columns[colId]?.cardIds || [];
      const cards = colCardIds.map(id => state.cards[id]).filter(card => {
        if (!card) return false;
        const matchSearch = !debouncedSearch || card.title.toLowerCase().includes(debouncedSearch.toLowerCase());
        const matchLabel  = selectedLabels.length === 0 || selectedLabels.some(l => card.labels.includes(l));
        return matchSearch && matchLabel;
      });
      return { colId, cards };
    });
  }, [state, debouncedSearch, selectedLabels]);

  const totalCards = Object.keys(state.cards).length;

  // Override dispatch to track dragging
  const wrappedDispatch = useCallback((action) => {
    if (action.type === "MOVE_CARD") {
      dispatch(action);
    }
  }, [dispatch]);

  // Global drag tracking
  useEffect(() => {
    const start = e => { const id = e.dataTransfer?.getData?.("cardId"); if (id) { draggingRef.current = id; setDraggingId(id); }};
    const end   = () => { draggingRef.current = null; setDraggingId(null); };
    // track via body events as fallback
    return () => {};
  }, []);

  const isDark = theme === "dark";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:          ${isDark ? "#0b0c12" : "#eef0f5"};
          --surface:     ${isDark ? "#11121a" : "#ffffff"};
          --col-bg:      ${isDark ? "#14151f" : "#f3f4f8"};
          --card-bg:     ${isDark ? "#1c1d2a" : "#ffffff"};
          --card-border: ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)"};
          --card-hover:  ${isDark ? "#22233280" : "#00000010"};
          --text-1:      ${isDark ? "#e8e9f4" : "#111827"};
          --text-2:      ${isDark ? "#9294a8" : "#6b7280"};
          --input-bg:    ${isDark ? "#0b0c12" : "#f3f4f8"};
          --toolbar-bg:  ${isDark ? "rgba(17,18,26,0.9)" : "rgba(255,255,255,0.9)"};
          --separator:   ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"};
          --drag-line:   #3b82f6;
        }

        body { font-family: 'Syne', system-ui, sans-serif; }

        @keyframes slideIn   { from { transform: translateY(16px); opacity:0; } to { transform:none; opacity:1; } }
        @keyframes conflictShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)} 60%{transform:translateX(5px)} }
        @keyframes conflictGlow  { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} 50%{box-shadow:0 0 0 4px rgba(239,68,68,0.35)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes scaleIn   { from{transform:scale(0.94);opacity:0} to{transform:scale(1);opacity:1} }

        .kb-app { min-height:100vh; background:var(--bg); color:var(--text-1); display:flex; flex-direction:column; }

        /* TOOLBAR */
        .toolbar {
          position:sticky; top:0; z-index:200; background:var(--toolbar-bg);
          backdrop-filter:blur(16px); border-bottom:1px solid var(--separator);
          padding:10px 20px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;
        }
        .logo { display:flex; align-items:center; gap:10px; margin-right:4px; flex-shrink:0; }
        .logo-icon {
          width:30px;height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center;
          font-size:16px; background:linear-gradient(135deg,#3b82f6,#8b5cf6); flex-shrink:0;
        }
        .logo-name { font-size:16px; font-weight:800; letter-spacing:-0.5px; }

        .search-wrap { position:relative; flex:1 1 180px; max-width:280px; }
        .search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-2); font-size:14px; pointer-events:none; }
        .search-input {
          width:100%; padding:8px 12px 8px 32px; background:var(--input-bg);
          border:1px solid var(--separator); border-radius:8px; color:var(--text-1);
          font-size:13px; font-family:inherit; outline:none; transition:border-color 0.15s;
        }
        .search-input:focus { border-color:#3b82f680; }

        .filter-pills { display:flex; gap:5px; flex-wrap:wrap; }
        .filter-pill {
          padding:4px 9px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;
          text-transform:uppercase; letter-spacing:0.6px; border:1px solid transparent;
          transition:all 0.15s; font-family:inherit;
        }

        .toolbar-actions { margin-left:auto; display:flex; align-items:center; gap:6px; flex-shrink:0; }
        .icon-btn {
          background:none; border:none; cursor:pointer; color:var(--text-1); font-size:15px;
          padding:5px 8px; border-radius:6px; transition:background 0.15s; font-family:inherit;
          display:flex; align-items:center; gap:5px; font-size:13px;
        }
        .icon-btn:hover { background:var(--separator); }
        .icon-btn:disabled { opacity:0.3; cursor:not-allowed; }
        .theme-btn {
          background:var(--input-bg); border:1px solid var(--separator); border-radius:8px;
          padding:6px 12px; cursor:pointer; font-size:12px; color:var(--text-1);
          font-family:inherit; font-weight:600; transition:all 0.15s;
        }
        .theme-btn:hover { background:var(--col-bg); }
        .sim-btn {
          padding:5px 10px; border-radius:6px; font-size:11px; font-weight:700;
          border:1px solid; cursor:pointer; font-family:inherit; transition:all 0.15s;
        }

        /* BOARD */
        .board-scroll { flex:1; overflow-x:auto; padding:20px 20px 60px; display:flex; gap:14px; align-items:flex-start; }
        @media (max-width:640px) { .board-scroll { padding-bottom:90px; } }

        .kcolumn {
          background:var(--col-bg); border-radius:14px; padding:14px;
          min-width:252px; width:252px; flex-shrink:0;
          border:2px solid transparent; transition:border-color 0.15s, box-shadow 0.15s;
        }
        .kcolumn.col-over {
          border-color:var(--col-accent);
          box-shadow:0 0 24px color-mix(in srgb, var(--col-accent) 20%, transparent);
        }
        .col-header { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
        .col-dot    { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .col-title  {
          font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1.2px; flex:1;
          color:var(--col-accent);
          text-shadow: 0 0 18px color-mix(in srgb, var(--col-accent) 40%, transparent);
        }
        .col-badge  { font-size:11px; padding:2px 8px; border-radius:20px; font-weight:700; }

        .col-body { min-height:80px; }

        .drop-zone { position:relative; }
        .drop-zone.drop-active::before {
          content:''; display:block; height:3px; background:var(--drag-line);
          border-radius:2px; margin-bottom:6px; animation:fadeIn 0.1s ease;
        }

        .empty-col { display:flex; flex-direction:column; align-items:center; gap:6px; padding:28px 0; color:var(--text-2); font-size:12px; }
        .empty-icon { font-size:24px; opacity:0.4; }

        /* CARD */
        .kcard {
          background:var(--card-bg); border:1px solid var(--card-border); border-radius:10px;
          padding:12px 13px; margin-bottom:7px; cursor:grab; user-select:none;
          transition:transform 0.18s, box-shadow 0.18s, opacity 0.18s, border-color 0.2s;
        }
        .kcard:hover  { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.25); }
        .kcard:focus  { outline:2px solid #3b82f6; outline-offset:2px; }
        .kcard:active { cursor:grabbing; }
        .kcard.dragging { opacity:0.4; transform:scale(0.97); }
        .kcard.conflict { border-color:#ef4444 !important; animation:conflictShake 0.4s ease, conflictGlow 1.2s ease 3; }

        .card-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; gap:6px; }
        .card-title  { font-size:12.5px; font-weight:600; line-height:1.45; flex:1; color:var(--text-1); }
        .priority-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:4px; }

        .label-row { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }
        .label-chip { font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:4px; text-transform:uppercase; letter-spacing:0.5px; }

        .card-footer { display:flex; justify-content:space-between; align-items:center; }
        .card-id     { font-size:10px; color:var(--text-2); font-family:'JetBrains Mono', monospace; }
        .avatar      { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:800; color:#fff; }

        /* MODAL */
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); z-index:500; display:flex; align-items:center; justify-content:center; animation:fadeIn 0.2s ease; }
        .modal-box { background:var(--surface); border:1px solid var(--separator); border-radius:16px; width:480px; max-width:90vw; max-height:80vh; overflow:auto; box-shadow:0 24px 64px rgba(0,0,0,0.4); animation:scaleIn 0.2s ease; }
        .modal-header { display:flex; justify-content:space-between; align-items:flex-start; padding:20px 20px 0; gap:12px; }
        .modal-id    { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--text-2); margin-bottom:4px; }
        .modal-title { font-size:18px; font-weight:800; line-height:1.3; }
        .modal-close { background:none; border:none; color:var(--text-2); cursor:pointer; font-size:22px; line-height:1; padding:2px 6px; border-radius:6px; transition:background 0.15s; }
        .modal-close:hover { background:var(--separator); }
        .modal-body  { padding:16px 20px 20px; display:flex; flex-direction:column; gap:16px; }
        .modal-desc  { font-size:13px; color:var(--text-2); line-height:1.6; }
        .modal-meta  { display:flex; flex-direction:column; gap:10px; }
        .meta-row    { display:flex; align-items:center; gap:12px; font-size:13px; }
        .meta-label  { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-2); min-width:70px; }

        /* STATUS BAR */
        .statusbar {
          position:fixed; bottom:0; left:0; right:0; z-index:100;
          padding:6px 20px;
          background:var(--toolbar-bg); backdrop-filter:blur(10px);
          border-top:1px solid var(--separator);
          display:flex; gap:14px; font-size:11px; color:var(--text-2);
          font-family:'JetBrains Mono',monospace; align-items:center;
          white-space:nowrap; overflow:hidden;
        }
        .statusbar-sep { color:var(--separator); flex-shrink:0; }
        .status-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; animation:pulse 2s infinite; }
        .sb-hint { display:inline; }

        /* ── Mobile: 2×2 pill grid ── */
        @media (max-width: 640px) {
          .statusbar {
            padding:6px 12px 10px;
            gap:0;
            display:grid;
            grid-template-columns:1fr 1fr;
            grid-template-rows:auto auto;
            row-gap:4px;
            column-gap:8px;
            white-space:normal;
          }
          .statusbar-sep { display:none; }
          .sb-item {
            display:flex; align-items:center; gap:5px;
            background:var(--separator);
            border-radius:6px; padding:4px 8px;
            font-size:9.5px; line-height:1.35;
            overflow:hidden;
          }
          .sb-item span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          /* sim status spans full width on mobile */
          .sb-sim { grid-column:1 / -1; background:transparent; padding:3px 2px 0; font-size:10px; }
          .sb-hint { display:none; }
        }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:var(--separator); border-radius:3px; }
      `}</style>

      <div className="kb-app" data-theme={theme}>
        {/* TOOLBAR */}
        <header className="toolbar" role="banner">
          <div className="logo">
            <div className="logo-icon">⊞</div>
            <span className="logo-name">KanbanPro</span>
          </div>

          {/* Search */}
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search cards…"
              aria-label="Search cards"
            />
          </div>

          {/* Label Filters */}
          <div className="filter-pills" role="group" aria-label="Filter by label">
            {LABELS.map(l => {
              const active = selectedLabels.includes(l);
              return (
                <button key={l} className="filter-pill"
                  onClick={() => setSelectedLabels(p => p.includes(l) ? p.filter(x => x !== l) : [...p, l])}
                  aria-pressed={active}
                  style={{
                    background: active ? LABEL_COLORS[l] : LABEL_COLORS[l] + "20",
                    color: active ? "#fff" : LABEL_COLORS[l],
                    borderColor: LABEL_COLORS[l] + "50",
                  }}
                >{l}</button>
              );
            })}
          </div>

          <div className="toolbar-actions">
            <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↩ Undo</button>
            <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">↪ Redo</button>

            <button
              className="sim-btn"
              onClick={() => setSimEnabled(s => !s)}
              style={{
                background: simEnabled ? "#10b98120" : "#6b728020",
                color: simEnabled ? "#10b981" : "#9ca3af",
                borderColor: simEnabled ? "#10b98140" : "#6b728040",
              }}
            >{simEnabled ? "● Sim ON" : "○ Sim OFF"}</button>

            <button className="theme-btn" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
              {isDark ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </header>

        {/* BOARD */}
        <main className="board-scroll" role="main" aria-label="Kanban board">
          {filteredColumns.map(({ colId, cards }) => (
            <KanbanColumn
              key={colId}
              column={state.columns[colId]}
              cards={cards}
              config={COLUMN_CONFIG[colId]}
              draggingId={draggingId}
              search={debouncedSearch}
              conflictId={conflictId}
              dispatch={wrappedDispatch}
              columnOrder={state.columnOrder}
              allColumns={state.columns}
            />
          ))}
        </main>

        {/* TOASTS */}
        <Toast toasts={toasts} onClose={id => setToasts(p => p.filter(t => t.id !== id))} />

        {/* CARD MODAL */}
        {activeCard && <CardModal card={activeCard} onClose={() => setActiveCard(null)} />}

        {/* STATUS BAR — responsive: single row on desktop, 2×2 grid on mobile */}
        <div className="statusbar" role="status" aria-live="polite">

          {/* Sim status — full-width row on mobile */}
          <div className="sb-item sb-sim">
            <div className="status-dot" style={{ background: simEnabled ? "#10b981" : "#6b7280" }} />
            <span>{simEnabled ? "Sim user active — moves card every 10s" : "Simulation paused"}</span>
          </div>

          <span className="statusbar-sep">|</span>

          {/* Cards count */}
          <div className="sb-item">
            <span style={{ color: simEnabled ? "#10b981" : "#6b7280" }}>⊞</span>
            <span>{totalCards} cards total</span>
          </div>

          <span className="statusbar-sep">|</span>

          {/* Undo/redo hint */}
          <div className="sb-item">
            <span>↩↪</span>
            <span>Ctrl+Z / Ctrl+Y</span>
            <span className="sb-hint"> — undo/redo</span>
          </div>

          <span className="statusbar-sep">|</span>

          {/* Arrow keys hint */}
          <div className="sb-item">
            <span>⇄</span>
            <span>Arrow keys</span>
            <span className="sb-hint"> — move card between columns</span>
          </div>

        </div>
      </div>
    </>
  );
}
