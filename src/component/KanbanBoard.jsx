import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────
const LABELS = ["bug", "urgent", "feature", "design", "backend", "frontend"];
const LABEL_COLORS = {
  bug: "#ef4444", urgent: "#f97316", feature: "#3b82f6",
  design: "#a855f7", backend: "#10b981", frontend: "#06b6d4",
};
const COLUMN_CONFIG = {
  todo:       { title: "To Do",       color: "#3b82f6" },
  inprogress: { title: "In Progress", color: "#f59e0b" },
  review:     { title: "Review",      color: "#a855f7" },
  done:       { title: "Done",        color: "#10b981" },
};
const PRIORITY_COLORS = { low: "#6b7280", medium: "#f59e0b", high: "#ef4444" };
const AVATARS = ["Alice", "Bob", "Charlie", "Diana", "Evan", "Fiona"];

// ─── INITIAL DATA ────────────────────────────────────────────
function buildInitialData() {
  const titles = [
    ["Fix login redirect bug",       ["bug","urgent"],       "high"],
    ["OAuth 2.0 integration",        ["feature","backend"],  "high"],
    ["Design system docs",           ["design","frontend"],  "medium"],
    ["API rate limiting",            ["backend"],            "medium"],
    ["Mobile responsive fixes",      ["frontend","bug"],     "high"],
    ["Dark mode support",            ["design","feature"],   "medium"],
    ["Performance audit",            ["urgent"],             "high"],
    ["DB migration script",          ["backend"],            "medium"],
    ["Unit tests auth module",       ["backend"],            "low"],
    ["CI/CD pipeline setup",         ["feature"],            "medium"],
    ["User onboarding flow",         ["design","feature"],   "medium"],
    ["Payment gateway",              ["feature","backend"],  "high"],
    ["Analytics dashboard",          ["feature","frontend"], "medium"],
    ["Notification system",          ["feature","backend"],  "medium"],
    ["Search functionality",         ["feature","frontend"], "medium"],
    ["Export to CSV",                ["feature"],            "low"],
    ["Accessibility audit",          ["urgent","frontend"],  "high"],
    ["Security vulnerability fix",   ["bug","urgent"],       "high"],
    ["Code review guidelines",       ["design"],             "low"],
    ["Staging deployment",           ["backend"],            "medium"],
    ["Error boundary setup",         ["frontend","bug"],     "medium"],
    ["Form validation refactor",     ["frontend"],           "low"],
    ["Caching layer implementation", ["backend","feature"],  "medium"],
    ["API documentation update",     ["backend"],            "low"],
  ];
  const cards = {};
  const cols  = { todo: [], inprogress: [], review: [], done: [] };
  const keys  = Object.keys(cols);
  titles.forEach(([title, labels, priority], i) => {
    const id = `card-${i + 1}`;
    cards[id] = { id, title, labels, priority, assignee: AVATARS[i % AVATARS.length],
      description: `Detailed requirements for: ${title}. Review specs before starting.` };
    cols[keys[i % 4]].push(id);
  });
  return { cards, columns: Object.fromEntries(keys.map(k => [k, { id: k, cardIds: cols[k] }])), columnOrder: keys };
}
const INITIAL_STATE = buildInitialData();

// ─── REDUCER ─────────────────────────────────────────────────
function boardReducer(state, action) {
  if (action.type === "MOVE_CARD") {
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
  return state;
}

// ─── HOOKS ───────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}

function useUndoRedo(reducer, initial) {
  const [hist, setHist] = useState({ history: [initial], index: 0 });
  const state    = hist.history[hist.index];
  const dispatch = useCallback((action) => {
    setHist(p => {
      const next = reducer(p.history[p.index], action);
      return { history: p.history.slice(0, p.index + 1).concat([next]), index: p.index + 1 };
    });
  }, [reducer]);
  const undo = useCallback(() => setHist(p => ({ ...p, index: Math.max(0, p.index - 1) })), []);
  const redo = useCallback(() => setHist(p => ({ ...p, index: Math.min(p.history.length - 1, p.index + 1) })), []);
  return { state, dispatch, undo, redo, canUndo: hist.index > 0, canRedo: hist.index < hist.history.length - 1 };
}

// ─── HIGHLIGHT ───────────────────────────────────────────────
const Highlight = memo(({ text, query }) => {
  if (!query) return <span>{text}</span>;
  const safe  = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safe})`, "gi"));
  return (
    <span>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} style={{ background:"#fbbf24", color:"#000", borderRadius:"2px", padding:"0 1px" }}>{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </span>
  );
});

// ─── TOAST ───────────────────────────────────────────────────
function Toast({ toasts, onClose }) {
  return (
    <div style={{ position:"fixed", bottom:"52px", right:"16px", zIndex:9999, display:"flex", flexDirection:"column", gap:"8px", maxWidth:"320px" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === "conflict" ? "rgba(127,29,29,0.97)" : "rgba(6,78,59,0.97)",
          border:`1px solid ${t.type==="conflict"?"#ef4444":"#10b981"}`,
          borderRadius:"10px", padding:"11px 14px", color:"#fff", fontSize:"13px",
          backdropFilter:"blur(10px)", boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
          animation:"slideIn 0.25s ease", display:"flex", alignItems:"center", gap:"10px",
        }}>
          <span style={{ fontSize:"16px" }}>{t.type==="conflict"?"⚠️":"✓"}</span>
          <span style={{ flex:1, lineHeight:1.4 }}>{t.message}</span>
          <button onClick={() => onClose(t.id)} style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:"18px", lineHeight:1 }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ─── CARD ────────────────────────────────────────────────────
const KanbanCard = memo(({
  card, columnId, cardIdx, totalInCol,
  search, isConflict, isDragging, isKeySelected,
  onMouseDragStart, onTouchStart,
  onKeyDown, onOpen,
}) => {
  const hue = card.assignee.charCodeAt(0) * 37 % 360;
  return (
    <div
      id={`kcard-${card.id}`}
      className={[
        "kcard",
        isDragging   ? "dragging"    : "",
        isConflict   ? "conflict"    : "",
        isKeySelected? "key-sel"     : "",
      ].join(" ").trim()}
      draggable
      onDragStart={e => onMouseDragStart(e, card.id, columnId)}
      onTouchStart={e => onTouchStart(e, card.id, columnId)}
      tabIndex={0}
      role="listitem"
      aria-label={`${card.title}, ${card.priority} priority, ${cardIdx+1} of ${totalInCol} in ${COLUMN_CONFIG[columnId]?.title}. Enter to open, Space to pick up.`}
      aria-grabbed={isDragging || isKeySelected}
      aria-selected={isKeySelected}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onOpen(card)}
    >
      <div className="card-header">
        <span className="card-title"><Highlight text={card.title} query={search} /></span>
        <span className="prio-dot" style={{ background: PRIORITY_COLORS[card.priority] }} title={`Priority: ${card.priority}`} />
      </div>
      {card.labels.length > 0 && (
        <div className="label-row">
          {card.labels.map(l => (
            <span key={l} className="label-chip" style={{ background: LABEL_COLORS[l]+"25", color: LABEL_COLORS[l], border:`1px solid ${LABEL_COLORS[l]}40` }}>{l}</span>
          ))}
        </div>
      )}
      <div className="card-footer">
        <span className="card-id">#{card.id.split("-")[1]}</span>
        <div className="avatar" style={{ background:`hsl(${hue},55%,42%)` }} title={card.assignee}>{card.assignee[0]}</div>
      </div>
      {/* Keyboard pick-up hint banner */}
      {isKeySelected && (
        <div className="key-hint">↑↓ reorder · ←→ column · Space drop · Esc cancel</div>
      )}
    </div>
  );
});

// ─── COLUMN ──────────────────────────────────────────────────
const KanbanColumn = memo(({
  column, cards, config, colIdx,
  draggingId, touchDraggingId, touchDropColId, touchDropIdx,
  search, conflictId, dispatch, columnOrder,
  keySelected, setKeySelected,
  onOpen, announce,
  onMouseDragStart, onTouchStart,
}) => {
  const [over,    setOver]    = useState(false);
  const [dropIdx, setDropIdx] = useState(null);

  // ── Mouse DnD ──────────────────────────────────────────
  const onDragOver = (e, idx) => {
    e.preventDefault(); e.stopPropagation();
    setOver(true); setDropIdx(idx ?? cards.length);
  };
  const onDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) { setOver(false); setDropIdx(null); }
  };
  const onDrop = (e, idx) => {
    e.preventDefault(); e.stopPropagation();
    setOver(false); setDropIdx(null);
    const cardId  = e.dataTransfer.getData("cardId");
    const fromCol = e.dataTransfer.getData("fromCol");
    if (!cardId) return;
    dispatch({ type:"MOVE_CARD", cardId, fromCol, toCol:column.id, toIndex:idx ?? cards.length });
  };

  // ── Keyboard nav ───────────────────────────────────────
  const handleKey = useCallback((e, card, idx) => {
    const ci        = columnOrder.indexOf(column.id);
    const isPicked  = keySelected?.cardId === card.id;

    // Enter → open modal
    if (e.key === "Enter") {
      e.preventDefault(); onOpen(card); return;
    }

    // Space → pick up / drop
    if (e.key === " ") {
      e.preventDefault();
      if (isPicked) {
        setKeySelected(null);
        announce(`${card.title} placed in ${config.title}, position ${idx + 1}`);
      } else {
        setKeySelected({ cardId: card.id, fromCol: column.id });
        announce(`${card.title} picked up from ${config.title}. Use arrow keys to move, Space to drop, Escape to cancel.`);
      }
      return;
    }

    // Escape → cancel
    if (e.key === "Escape") {
      e.preventDefault();
      if (isPicked) { setKeySelected(null); announce(`Cancelled. ${card.title} stays in ${config.title}.`); }
      return;
    }

    // ↑ — move focus up, or reorder if picked up
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isPicked && idx > 0) {
        dispatch({ type:"MOVE_CARD", cardId:card.id, fromCol:column.id, toCol:column.id, toIndex:idx - 1 });
        announce(`${card.title} moved up to position ${idx} in ${config.title}`);
        setTimeout(() => document.getElementById(`kcard-${card.id}`)?.focus(), 40);
      } else if (!isPicked && idx > 0) {
        document.getElementById(`kcard-${cards[idx - 1].id}`)?.focus();
      }
      return;
    }

    // ↓ — move focus down, or reorder if picked up
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (isPicked && idx < cards.length - 1) {
        dispatch({ type:"MOVE_CARD", cardId:card.id, fromCol:column.id, toCol:column.id, toIndex:idx + 1 });
        announce(`${card.title} moved down to position ${idx + 2} in ${config.title}`);
        setTimeout(() => document.getElementById(`kcard-${card.id}`)?.focus(), 40);
      } else if (!isPicked && idx < cards.length - 1) {
        document.getElementById(`kcard-${cards[idx + 1].id}`)?.focus();
      }
      return;
    }

    // ← — move card to previous column
    if (e.key === "ArrowLeft" && ci > 0) {
      e.preventDefault();
      const toCol = columnOrder[ci - 1];
      dispatch({ type:"MOVE_CARD", cardId:card.id, fromCol:column.id, toCol, toIndex:0 });
      if (isPicked) setKeySelected(null);
      announce(`${card.title} moved to ${COLUMN_CONFIG[toCol].title}`);
      setTimeout(() => document.getElementById(`kcard-${card.id}`)?.focus(), 40);
      return;
    }

    // → — move card to next column
    if (e.key === "ArrowRight" && ci < columnOrder.length - 1) {
      e.preventDefault();
      const toCol = columnOrder[ci + 1];
      dispatch({ type:"MOVE_CARD", cardId:card.id, fromCol:column.id, toCol, toIndex:0 });
      if (isPicked) setKeySelected(null);
      announce(`${card.title} moved to ${COLUMN_CONFIG[toCol].title}`);
      setTimeout(() => document.getElementById(`kcard-${card.id}`)?.focus(), 40);
      return;
    }
  }, [column.id, columnOrder, cards, dispatch, keySelected, setKeySelected, onOpen, announce, config.title]);

  const isTouchTarget = touchDropColId === column.id;

  return (
    <div
      className={`kcolumn${over?" col-over":""}${isTouchTarget?" touch-over":""}`}
      style={{ "--col-accent": config.color }}
      data-col-id={column.id}
      onDragOver={e => onDragOver(e, null)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop(e, null)}
      role="region"
      aria-label={`${config.title}, ${cards.length} cards`}
    >
      <div className="col-header">
        <span className="col-dot" style={{ background: config.color }} />
        <h2 className="col-title">{config.title}</h2>
        <span className="col-badge" style={{ background: config.color+"25", color: config.color }}>{cards.length}</span>
      </div>

      <div role="list" aria-label={`${config.title} cards`} className="col-body">
        {cards.map((card, idx) => (
          <div
            key={card.id}
            className={[
              "drop-zone",
              dropIdx === idx && over            ? "drop-active"     : "",
              isTouchTarget && touchDropIdx===idx ? "touch-drop-line" : "",
            ].join(" ").trim()}
            data-drop-idx={idx}
            data-col-id={column.id}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={e => onDrop(e, idx)}
          >
            <KanbanCard
              card={card}
              columnId={column.id}
              cardIdx={idx}
              totalInCol={cards.length}
              search={search}
              isConflict={conflictId === card.id}
              isDragging={draggingId === card.id || touchDraggingId === card.id}
              isKeySelected={keySelected?.cardId === card.id}
              onMouseDragStart={onMouseDragStart}
              onTouchStart={onTouchStart}
              onKeyDown={e => handleKey(e, card, idx)}
              onOpen={onOpen}
            />
          </div>
        ))}
        {cards.length === 0 && (
          <div className="empty-col" data-col-id={column.id} data-drop-idx={0}>
            <div className="empty-icon">⊡</div>
            <span>Drop cards here</span>
          </div>
        )}
      </div>
    </div>
  );
});

// ─── MODAL ───────────────────────────────────────────────────
function CardModal({ card, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!card) return null;
  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Card: ${card.title}`}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-top">
          <div>
            <div className="modal-id">#{card.id.split("-")[1]}</div>
            <h2 className="modal-title">{card.title}</h2>
          </div>
          <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close modal">×</button>
        </div>
        <div className="modal-body">
          <p className="modal-desc">{card.description}</p>
          <div className="modal-meta">
            {[
              ["Priority", <span style={{ color:PRIORITY_COLORS[card.priority], fontWeight:700 }}>{card.priority}</span>],
              ["Assignee", <span>{card.assignee}</span>],
              ["Labels",
                <div style={{ display:"flex", gap:"5px", flexWrap:"wrap" }}>
                  {card.labels.map(l => (
                    <span key={l} className="label-chip" style={{ background:LABEL_COLORS[l]+"25", color:LABEL_COLORS[l], border:`1px solid ${LABEL_COLORS[l]}40` }}>{l}</span>
                  ))}
                </div>
              ],
            ].map(([label, val]) => (
              <div key={label} className="meta-row">
                <span className="meta-label">{label}</span>
                {val}
              </div>
            ))}
          </div>
          <div className="modal-hint">Press Escape to close</div>
        </div>
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────
export default function KanbanBoard() {
  const savedState = useMemo(() => { try { const s = localStorage.getItem("kb-state"); return s ? JSON.parse(s) : null; } catch { return null; } }, []);
  const savedTheme = useMemo(() => localStorage.getItem("kb-theme") || "dark", []);

  const { state, dispatch, undo, redo, canUndo, canRedo } = useUndoRedo(boardReducer, savedState || INITIAL_STATE);
  const [theme, setTheme]   = useState(savedTheme);
  const [search, setSearch] = useState("");
  const [selectedLabels, setSelectedLabels] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const l = p.get("labels"); return l ? l.split(",") : [];
  });

  // Drag state
  const [draggingId,      setDraggingId]      = useState(null);
  const [touchDraggingId, setTouchDraggingId] = useState(null);
  const [touchDropColId,  setTouchDropColId]  = useState(null);
  const [touchDropIdx,    setTouchDropIdx]    = useState(null);
  const [keySelected,     setKeySelected]     = useState(null); // { cardId, fromCol }

  // Other
  const [conflictId, setConflictId] = useState(null);
  const [toasts,     setToasts]     = useState([]);
  const [activeCard, setActiveCard] = useState(null);
  const [simEnabled, setSimEnabled] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  const announce = useCallback((msg) => { setAnnouncement(""); setTimeout(() => setAnnouncement(msg), 10); }, []);

  const stateRef     = useRef(state);
  const draggingRef  = useRef(null);
  const touchDragRef = useRef(null); // { cardId, fromCol, ghost, offsetX, offsetY }
  useEffect(() => { stateRef.current = state; }, [state]);

  const debouncedSearch = useDebounce(search, 300);

  // Persist
  useEffect(() => { localStorage.setItem("kb-state", JSON.stringify(state)); }, [state]);
  useEffect(() => { localStorage.setItem("kb-theme", theme); }, [theme]);

  // URL sync
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    selectedLabels.length > 0 ? p.set("labels", selectedLabels.join(",")) : p.delete("labels");
    window.history.replaceState({}, "", "?" + p.toString());
  }, [selectedLabels]);

  // Global keyboard shortcuts
  useEffect(() => {
    const h = e => {
      if ((e.ctrlKey||e.metaKey) && e.key==="z" && !e.shiftKey) { e.preventDefault(); undo(); announce("Undone"); }
      if ((e.ctrlKey||e.metaKey) && (e.key==="y"||(e.key==="z"&&e.shiftKey))) { e.preventDefault(); redo(); announce("Redone"); }
      if (e.key==="Escape" && !keySelected) setActiveCard(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo, redo, announce, keySelected]);

  // Toast helper
  const addToast = useCallback((msg, type="success") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-2), { id, msg, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Simulation ────────────────────────────────────────────
  useEffect(() => {
    if (!simEnabled) return;
    const iv = setInterval(() => {
      const s       = stateRef.current;
      const colKeys = s.columnOrder;
      const fromCol = colKeys[Math.floor(Math.random() * colKeys.length)];
      const fromIds = s.columns[fromCol]?.cardIds || [];
      if (!fromIds.length) return;
      const cardId = fromIds[Math.floor(Math.random() * fromIds.length)];
      const toCol  = colKeys[Math.floor(Math.random() * colKeys.length)];
      const card   = s.cards[cardId];
      if (!card) return;

      const isBeingDragged = draggingRef.current === cardId || touchDragRef.current?.cardId === cardId || keySelected?.cardId === cardId;
      if (isBeingDragged) {
        setConflictId(cardId);
        addToast(`⚠️ Conflict: "${card.title.slice(0,22)}…" was moved by another user`, "conflict");
        draggingRef.current = null; setDraggingId(null);
        if (touchDragRef.current?.ghost) { touchDragRef.current.ghost.remove(); document.body.style.overflow = ""; }
        touchDragRef.current = null; setTouchDraggingId(null); setTouchDropColId(null); setTouchDropIdx(null);
        setKeySelected(null);
        setTimeout(() => setConflictId(null), 3000);
        return;
      }
      dispatch({ type:"MOVE_CARD", cardId, fromCol, toCol, toIndex: s.columns[toCol]?.cardIds?.length || 0 });
    }, 10000);
    return () => clearInterval(iv);
  }, [simEnabled, dispatch, addToast, keySelected]);

  // ── Mouse DnD ─────────────────────────────────────────────
  const handleMouseDragStart = useCallback((e, cardId, fromCol) => {
    e.dataTransfer.setData("cardId", cardId);
    e.dataTransfer.setData("fromCol", fromCol);
    e.dataTransfer.effectAllowed = "move";
    draggingRef.current = cardId;
    setDraggingId(cardId);
  }, []);

  useEffect(() => {
    const end = () => { draggingRef.current = null; setDraggingId(null); };
    window.addEventListener("dragend", end);
    return () => window.removeEventListener("dragend", end);
  }, []);

  // ── Touch DnD — Pointer Events (works on all mobile browsers) ──
  const handleTouchStart = useCallback((e, cardId, fromCol) => {
    // Only handle if not already dragging
    if (touchDragRef.current) return;
    e.stopPropagation();
    const touch  = e.touches[0];
    const srcEl  = document.getElementById(`kcard-${cardId}`);
    if (!srcEl) return;
    const rect = srcEl.getBoundingClientRect();

    // Build ghost element
    const ghost = srcEl.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.style.cssText = `
      position:fixed;
      left:${rect.left}px;
      top:${rect.top}px;
      width:${rect.width}px;
      pointer-events:none;
      z-index:8888;
      opacity:0.88;
      border-radius:10px;
      transform:scale(1.05) rotate(2deg);
      box-shadow:0 20px 48px rgba(0,0,0,0.55);
      transition:transform 0.08s ease;
      background:var(--card-bg,#1c1d2a);
    `;
    document.body.appendChild(ghost);

    touchDragRef.current = {
      cardId, fromCol, ghost,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
    };
    setTouchDraggingId(cardId);
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
  }, []);

  // Global touch move / end
  useEffect(() => {
    const onMove = (e) => {
      if (!touchDragRef.current) return;
      e.preventDefault(); // prevent scroll while dragging
      const touch = e.touches[0];
      const { ghost, offsetX, offsetY } = touchDragRef.current;

      // Move ghost
      ghost.style.left = `${touch.clientX - offsetX}px`;
      ghost.style.top  = `${touch.clientY - offsetY}px`;

      // Hit-test under finger (hide ghost temporarily)
      ghost.style.visibility = "hidden";
      const under = document.elementFromPoint(touch.clientX, touch.clientY);
      ghost.style.visibility = "";

      if (!under) { setTouchDropColId(null); setTouchDropIdx(null); return; }

      // Find column
      const colEl = under.closest("[data-col-id]");
      if (colEl) {
        setTouchDropColId(colEl.dataset.colId);
        const dz = under.closest("[data-drop-idx]");
        setTouchDropIdx(dz ? parseInt(dz.dataset.dropIdx, 10) : null);
      } else {
        setTouchDropColId(null); setTouchDropIdx(null);
      }
    };

    const onEnd = () => {
      if (!touchDragRef.current) return;
      const { cardId, fromCol, ghost } = touchDragRef.current;
      ghost.remove();
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
      document.body.style.overflow = "";

      // Capture drop targets from state (refs updated before onEnd fires)
      setTouchDropColId(toColSnap => {
        setTouchDropIdx(toIdxSnap => {
          if (toColSnap) {
            const s = stateRef.current;
            const targetLen = s.columns[toColSnap]?.cardIds?.length || 0;
            const toIndex   = toIdxSnap !== null ? toIdxSnap : targetLen;
            dispatch({ type:"MOVE_CARD", cardId, fromCol, toCol:toColSnap, toIndex });
            const card = s.cards[cardId];
            if (card) announce(`${card.title} moved to ${COLUMN_CONFIG[toColSnap]?.title}`);
          }
          return null; // reset touchDropIdx
        });
        return null; // reset touchDropColId
      });

      touchDragRef.current = null;
      setTouchDraggingId(null);
    };

    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend",  onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend",  onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [dispatch, announce]);

  // ── Filtered columns ──────────────────────────────────────
  const filteredColumns = useMemo(() => {
    return state.columnOrder.map(colId => ({
      colId,
      cards: (state.columns[colId]?.cardIds || [])
        .map(id => state.cards[id])
        .filter(card => {
          if (!card) return false;
          const ms = !debouncedSearch || card.title.toLowerCase().includes(debouncedSearch.toLowerCase());
          const ml = selectedLabels.length === 0 || selectedLabels.some(l => card.labels.includes(l));
          return ms && ml;
        }),
    }));
  }, [state, debouncedSearch, selectedLabels]);

  const totalCards    = Object.keys(state.cards).length;
  const wrappedDispatch = useCallback((a) => { if (a.type==="MOVE_CARD") dispatch(a); }, [dispatch]);
  const handleOpen    = useCallback((card) => setActiveCard(card), []);
  const isDark        = theme === "dark";

  // ── CSS (injected inline so it reacts to theme state) ─────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

    :root{
      --bg:        ${isDark?"#0b0c12":"#eef0f5"};
      --surface:   ${isDark?"#11121a":"#fff"};
      --col-bg:    ${isDark?"#14151f":"#f3f4f8"};
      --card-bg:   ${isDark?"#1c1d2a":"#fff"};
      --cborder:   ${isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.09)"};
      --text-1:    ${isDark?"#e8e9f4":"#111827"};
      --text-2:    ${isDark?"#9294a8":"#6b7280"};
      --input-bg:  ${isDark?"#0b0c12":"#f3f4f8"};
      --tb-bg:     ${isDark?"rgba(17,18,26,0.96)":"rgba(255,255,255,0.96)"};
      --sep:       ${isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.07)"};
    }
    body{font-family:'Syne',system-ui,sans-serif;}

    @keyframes slideIn      {from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
    @keyframes cShake       {0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}60%{transform:translateX(5px)}}
    @keyframes cGlow        {0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}50%{box-shadow:0 0 0 4px rgba(239,68,68,0.35)}}
    @keyframes fadeIn       {from{opacity:0}to{opacity:1}}
    @keyframes scaleIn      {from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}
    @keyframes keyPulse     {0%,100%{box-shadow:0 0 0 2px rgba(59,130,246,0.5)}50%{box-shadow:0 0 0 6px rgba(59,130,246,0.15)}}
    @keyframes pulse        {0%,100%{opacity:1}50%{opacity:0.4}}

    .kb-app{min-height:100vh;background:var(--bg);color:var(--text-1);display:flex;flex-direction:column;}

    /* TOOLBAR */
    .toolbar{position:sticky;top:0;z-index:200;background:var(--tb-bg);backdrop-filter:blur(16px);
      border-bottom:1px solid var(--sep);padding:10px 20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .logo{display:flex;align-items:center;gap:10px;flex-shrink:0;}
    .logo-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;
      font-size:16px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);}
    .logo-name{font-size:16px;font-weight:800;letter-spacing:-0.5px;}
    .search-wrap{position:relative;flex:1 1 180px;max-width:280px;}
    .search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-2);font-size:14px;pointer-events:none;}
    .search-input{width:100%;padding:8px 12px 8px 32px;background:var(--input-bg);border:1px solid var(--sep);
      border-radius:8px;color:var(--text-1);font-size:13px;font-family:inherit;outline:none;transition:border-color 0.15s;}
    .search-input:focus{border-color:#3b82f680;}
    .filter-pills{display:flex;gap:5px;flex-wrap:wrap;}
    .filter-pill{padding:4px 9px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;
      text-transform:uppercase;letter-spacing:0.6px;border:1px solid transparent;transition:all 0.15s;font-family:inherit;}
    .toolbar-actions{margin-left:auto;display:flex;align-items:center;gap:6px;flex-shrink:0;}
    .icon-btn{background:none;border:none;cursor:pointer;color:var(--text-1);padding:5px 8px;border-radius:6px;
      transition:background 0.15s;font-family:inherit;display:flex;align-items:center;gap:5px;font-size:13px;}
    .icon-btn:hover{background:var(--sep);}
    .icon-btn:disabled{opacity:0.3;cursor:not-allowed;}
    .icon-btn:focus-visible{outline:2px solid #3b82f6;outline-offset:2px;}
    .theme-btn{background:var(--input-bg);border:1px solid var(--sep);border-radius:8px;
      padding:6px 12px;cursor:pointer;font-size:12px;color:var(--text-1);font-family:inherit;font-weight:600;transition:all 0.15s;}
    .theme-btn:hover{background:var(--col-bg);}
    .theme-btn:focus-visible{outline:2px solid #3b82f6;outline-offset:2px;}
    .sim-btn{padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid;cursor:pointer;font-family:inherit;}

    /* BOARD */
    .board-scroll{flex:1;overflow-x:auto;padding:20px 20px 64px;display:flex;gap:14px;align-items:flex-start;}
    @media(max-width:640px){.board-scroll{padding-bottom:92px;}}

    /* COLUMN */
    .kcolumn{background:var(--col-bg);border-radius:14px;padding:14px;min-width:252px;width:252px;flex-shrink:0;
      border:2px solid transparent;transition:border-color 0.15s,box-shadow 0.15s;}
    .kcolumn.col-over{border-color:var(--col-accent);
      box-shadow:0 0 24px color-mix(in srgb,var(--col-accent) 20%,transparent);}
    .kcolumn.touch-over{border-color:var(--col-accent);
      box-shadow:0 0 32px color-mix(in srgb,var(--col-accent) 30%,transparent);}
    .col-header{display:flex;align-items:center;gap:8px;margin-bottom:12px;}
    .col-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
    .col-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;flex:1;
      color:var(--col-accent);text-shadow:0 0 18px color-mix(in srgb,var(--col-accent) 40%,transparent);}
    .col-badge{font-size:11px;padding:2px 8px;border-radius:20px;font-weight:700;}
    .col-body{min-height:80px;}
    .empty-col{display:flex;flex-direction:column;align-items:center;gap:6px;padding:28px 0;color:var(--text-2);font-size:12px;}
    .empty-icon{font-size:24px;opacity:0.4;}

    /* DROP ZONES */
    .drop-zone{position:relative;}
    .drop-zone.drop-active::before{content:'';display:block;height:3px;background:#3b82f6;
      border-radius:2px;margin-bottom:6px;animation:fadeIn 0.1s ease;}
    .drop-zone.touch-drop-line::before{content:'';display:block;height:3px;background:#f59e0b;
      border-radius:2px;margin-bottom:6px;}

    /* CARD */
    .kcard{background:var(--card-bg);border:1px solid var(--cborder);border-radius:10px;
      padding:12px 13px;margin-bottom:7px;cursor:grab;user-select:none;touch-action:none;position:relative;
      transition:transform 0.18s,box-shadow 0.18s,opacity 0.18s,border-color 0.2s;}
    .kcard:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.25);}
    .kcard:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.25);}
    .kcard:focus-visible{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.3);}
    .kcard:active{cursor:grabbing;}
    .kcard.dragging{opacity:0.35;transform:scale(0.97);}
    .kcard.conflict{border-color:#ef4444!important;animation:cShake 0.4s ease,cGlow 1.2s ease 3;}
    .kcard.key-sel{
      border-color:#3b82f6!important;
      box-shadow:0 0 0 3px rgba(59,130,246,0.35)!important;
      transform:translateY(-3px) scale(1.01);
      animation:keyPulse 1.5s ease infinite;
      cursor:move;
      margin-bottom:28px; /* space for hint banner */
    }

    /* Keyboard pick-up hint */
    .key-hint{
      position:absolute;bottom:-22px;left:0;right:0;
      text-align:center;font-size:9px;color:#3b82f6;
      font-family:'JetBrains Mono',monospace;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      pointer-events:none;letter-spacing:0.2px;
    }

    /* Card internals */
    .card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:6px;}
    .card-title{font-size:12.5px;font-weight:600;line-height:1.45;flex:1;color:var(--text-1);}
    .prio-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:4px;}
    .label-row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;}
    .label-chip{font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;}
    .card-footer{display:flex;justify-content:space-between;align-items:center;}
    .card-id{font-size:10px;color:var(--text-2);font-family:'JetBrains Mono',monospace;}
    .avatar{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;font-size:9px;font-weight:800;color:#fff;}

    /* MODAL */
    .modal-back{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);
      z-index:500;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;}
    .modal-box{background:var(--surface);border:1px solid var(--sep);border-radius:16px;
      width:480px;max-width:90vw;max-height:80vh;overflow:auto;
      box-shadow:0 24px 64px rgba(0,0,0,0.4);animation:scaleIn 0.2s ease;}
    .modal-top{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 20px 0;gap:12px;}
    .modal-id{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-2);margin-bottom:4px;}
    .modal-title{font-size:18px;font-weight:800;line-height:1.3;}
    .modal-close{background:none;border:none;color:var(--text-2);cursor:pointer;font-size:22px;
      line-height:1;padding:2px 6px;border-radius:6px;transition:background 0.15s;}
    .modal-close:hover{background:var(--sep);}
    .modal-close:focus-visible{outline:2px solid #3b82f6;outline-offset:2px;}
    .modal-body{padding:16px 20px 20px;display:flex;flex-direction:column;gap:14px;}
    .modal-desc{font-size:13px;color:var(--text-2);line-height:1.6;}
    .modal-meta{display:flex;flex-direction:column;gap:10px;}
    .meta-row{display:flex;align-items:center;gap:12px;font-size:13px;}
    .meta-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-2);min-width:70px;}
    .modal-hint{font-size:11px;color:var(--text-2);font-family:'JetBrains Mono',monospace;
      padding-top:10px;border-top:1px solid var(--sep);}

    /* STATUS BAR */
    .statusbar{position:fixed;bottom:0;left:0;right:0;z-index:100;padding:6px 20px;
      background:var(--tb-bg);backdrop-filter:blur(10px);border-top:1px solid var(--sep);
      display:flex;gap:14px;font-size:11px;color:var(--text-2);font-family:'JetBrains Mono',monospace;
      align-items:center;white-space:nowrap;overflow:hidden;}
    .sb-sep{color:var(--sep);flex-shrink:0;}
    .sdot{width:6px;height:6px;border-radius:50%;flex-shrink:0;animation:pulse 2s infinite;}

    @media(max-width:640px){
      .statusbar{padding:6px 12px 10px;gap:0;display:grid;grid-template-columns:1fr 1fr;
        row-gap:4px;column-gap:8px;white-space:normal;}
      .sb-sep{display:none;}
      .sb-item{display:flex;align-items:center;gap:5px;background:var(--sep);border-radius:6px;
        padding:4px 8px;font-size:9.5px;line-height:1.35;overflow:hidden;}
      .sb-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .sb-sim{grid-column:1/-1;background:transparent;padding:3px 2px 0;font-size:10px;}
      .sb-long{display:none;}
    }

    ::-webkit-scrollbar{width:5px;height:5px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:var(--sep);border-radius:3px;}
  `;

  return (
    <>
      <style>{css}</style>

      {/* ── Screen-reader live region (visually hidden) ── */}
      <div
        role="status" aria-live="assertive" aria-atomic="true"
        style={{ position:"absolute", width:1, height:1, overflow:"hidden", clip:"rect(0,0,0,0)", whiteSpace:"nowrap" }}
      >
        {announcement}
      </div>

      <div className="kb-app" data-theme={theme}>

        {/* ── TOOLBAR ── */}
        <header className="toolbar" role="banner">
          <div className="logo">
            <div className="logo-icon">⊞</div>
            <span className="logo-name">KanbanPro</span>
          </div>

          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              className="search-input" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search cards…" aria-label="Search cards"
            />
          </div>

          <div className="filter-pills" role="group" aria-label="Filter by label">
            {LABELS.map(l => {
              const active = selectedLabels.includes(l);
              return (
                <button key={l} className="filter-pill"
                  onClick={() => setSelectedLabels(p => p.includes(l) ? p.filter(x=>x!==l) : [...p, l])}
                  aria-pressed={active}
                  style={{ background: active ? LABEL_COLORS[l] : LABEL_COLORS[l]+"20", color: active?"#fff":LABEL_COLORS[l], borderColor: LABEL_COLORS[l]+"50" }}
                >{l}</button>
              );
            })}
          </div>

          <div className="toolbar-actions">
            <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo (Ctrl+Z)">↩ Undo</button>
            <button className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="Redo (Ctrl+Y)">↪ Redo</button>
            <button className="sim-btn" onClick={() => setSimEnabled(s=>!s)}
              style={{ background: simEnabled?"#10b98120":"#6b728020", color: simEnabled?"#10b981":"#9ca3af", borderColor: simEnabled?"#10b98140":"#6b728040" }}
              aria-pressed={simEnabled}
            >{simEnabled?"● Sim ON":"○ Sim OFF"}</button>
            <button className="theme-btn" onClick={() => setTheme(t=>t==="dark"?"light":"dark")}>
              {isDark?"☀️ Light":"🌙 Dark"}
            </button>
          </div>
        </header>

        {/* ── BOARD ── */}
        <main
          className="board-scroll" role="main"
          aria-label="Kanban board — Tab to cards, Enter opens, Space picks up, ↑↓ reorder, ←→ move column, Esc cancel"
        >
          {filteredColumns.map(({ colId, cards }, colIdx) => (
            <KanbanColumn
              key={colId}
              column={state.columns[colId]}
              cards={cards}
              config={COLUMN_CONFIG[colId]}
              colIdx={colIdx}
              draggingId={draggingId}
              touchDraggingId={touchDraggingId}
              touchDropColId={touchDropColId}
              touchDropIdx={touchDropIdx}
              search={debouncedSearch}
              conflictId={conflictId}
              dispatch={wrappedDispatch}
              columnOrder={state.columnOrder}
              keySelected={keySelected}
              setKeySelected={setKeySelected}
              onOpen={handleOpen}
              announce={announce}
              onMouseDragStart={handleMouseDragStart}
              onTouchStart={handleTouchStart}
            />
          ))}
        </main>

        {/* ── TOASTS ── */}
        <Toast toasts={toasts} onClose={id => setToasts(p => p.filter(t=>t.id!==id))} />

        {/* ── MODAL ── */}
        {activeCard && <CardModal card={activeCard} onClose={() => setActiveCard(null)} />}

        {/* ── STATUS BAR ── */}
        <div className="statusbar" aria-hidden="true">
          <div className="sb-item sb-sim">
            <div className="sdot" style={{ background: simEnabled?"#10b981":"#6b7280" }} />
            <span>{simEnabled?"Sim active — moves card every 10s":"Simulation paused"}</span>
          </div>
          <span className="sb-sep">|</span>
          <div className="sb-item"><span>⊞</span><span>{totalCards} cards</span></div>
          <span className="sb-sep">|</span>
          <div className="sb-item"><span>↩↪</span><span>Ctrl+Z/Y</span></div>
          <span className="sb-sep">|</span>
          <div className="sb-item">
            <span>Space</span>
            <span className="sb-long"> pick up ·</span>
            <span> ↑↓</span>
            <span className="sb-long"> reorder ·</span>
            <span> ←→</span>
            <span className="sb-long"> column ·</span>
            <span> Enter</span>
            <span className="sb-long"> open</span>
          </div>
        </div>

      </div>
    </>
  );
}
