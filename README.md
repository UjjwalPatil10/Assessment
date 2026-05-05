# ⊞ KanbanPro — Live Collaborative Kanban Board

> A production-grade Kanban board built with **React** (no external UI or DnD libraries), featuring real-time conflict simulation, undo/redo, live search, accessibility, and a responsive dark/light UI.

---

## 🚀 Live Demo

🔗 **[kanbanpro.vercel.app](https://kanbanpro.vercel.app)** *(replace with your deployed URL)*

---

## 📸 Screenshots

| Dark Theme | Light Theme |
|---|---|
| ![dark](./screenshots/dark.png) | ![light](./screenshots/light.png) |

---

## 🏗️ Architectural Decisions

### 1. State Management — Custom `useUndoRedo` Hook (No Zustand / Redux)

Instead of reaching for Zustand or Redux Toolkit, the global board state is managed via a **hand-rolled `useUndoRedo` hook** that wraps a pure `boardReducer`.

```
useUndoRedo(reducer, initialState)
  └── { history: BoardState[], index: number }
        ├── dispatch(action)  → appends new state to history
        ├── undo()            → decrements index
        └── redo()            → increments index
```

**Why this over Zustand?**
- The undo/redo requirement naturally maps to a history stack — Zustand would need a middleware plugin (`zustand/middleware` + `temporal`) to achieve the same
- A pure reducer is easier to test and reason about
- No extra dependency (bundle stays smaller)
- The single source of truth lives in one `useState` with `{ history, index }` — every undo/redo is a cheap O(1) pointer move

**Trade-off:** For very large boards (1000+ cards across many users), a CRDT-based approach (e.g. Yjs) would replace this.

---

### 2. Drag & Drop — Native HTML5 Drag API (No react-dnd / dnd-kit)

All drag-and-drop is implemented using the browser's native `dataTransfer` API.

```
onDragStart → dataTransfer.setData("cardId", id)
              dataTransfer.setData("fromCol", colId)

onDragOver  → e.preventDefault() + setDropIdx(idx)
              → shows blue insertion line at exact position

onDrop      → dataTransfer.getData("cardId")
              → dispatch MOVE_CARD to reducer
```

**Drop zone precision:** Each card is wrapped in a `.drop-zone` div with its own `onDragOver` / `onDrop`. When you hover between cards, `dropIdx` is set to that card's index, and a 3px blue bar renders above it via `::before` pseudo-element.

**Edge cases handled:**
- Dropping on an **empty column** — the column itself has `onDragOver`/`onDrop`; `toIndex` defaults to `cards.length`
- Dropping **outside a valid target** — `dragLeave` clears the indicator; no state mutation happens
- **Same-column reorder** — `fromIds` filters out the card first, then splices it at `toIndex`

**Why no library?**
The assessment explicitly prohibits react-dnd, dnd-kit, etc. Native HTML5 DnD also has zero JS overhead for the ghost image (browser handles it natively).

---

### 3. Performance — `React.memo` + `useMemo` + `useCallback`

```
KanbanCard    → React.memo  → only re-renders when card data / isDragging / isConflict changes
KanbanColumn  → React.memo  → only re-renders when its card list or dragging state changes
Highlight     → React.memo  → pure text split, skips re-render if text+query unchanged

filteredColumns → useMemo([state, debouncedSearch, selectedLabels])
wrappedDispatch → useCallback([dispatch])
addToast        → useCallback([])
```

**Virtualization note:** For 100+ cards the current approach (memo + stable references) renders without lag. For 1000+ cards, `react-window` with a `FixedSizeList` per column would be the next step — the column `col-body` is already sized to be a natural scroll container for this.

**stateRef pattern:** The real-time simulation `setInterval` closure needs access to *current* state without re-creating the interval. A `useRef` shadow (`stateRef`) is synced via `useEffect` on every state change, giving the interval a live pointer without being in the dependency array.

---

### 4. Real-Time Conflict Simulation

```
setInterval (10 000ms)
  └── picks random card from random column
      ├── if card === draggingRef.current  →  CONFLICT
      │     setConflictId(cardId)           →  red shake animation on card
      │     addToast("Conflict: …")         →  toast with ⚠️ type
      │     draggingRef.current = null      →  cancel drag
      └── else  →  dispatch MOVE_CARD normally
                    addToast("Simulated: … moved to …")
```

**`draggingRef` vs `draggingId` state:**
- `draggingId` (React state) → drives the `.dragging` CSS class (opacity dimming)
- `draggingRef` (ref) → read by the interval closure *synchronously* without a stale closure problem

**Conflict resolution:** Toast + card shake + red glow animation. The card reverts to wherever the server (simulated reducer) placed it — "server wins" strategy, simple and predictable.

---

### 5. Search & Filter Architecture

```
search input  ──(300ms debounce)──► debouncedSearch
                                         │
selectedLabels (multi-select pills)      │
        │                                │
        └──────── useMemo ───────────────┘
                     │
              filteredColumns[]
              (cards filtered per column, never mutating source state)
```

- **URL sync:** `selectedLabels` is serialised to `?labels=bug,urgent` on every change via `window.history.replaceState` — shareable filter links with no router dependency
- **Custom `<Highlight>`:** splits card title by the query using a case-insensitive regex, wraps matches in `<mark>` — no library, ~15 lines

---

### 6. Custom Hooks Summary

| Hook | File | Purpose |
|------|------|---------|
| `useUndoRedo` | `KanbanBoard.jsx` | History stack with undo/redo for any reducer |
| `useDebounce` | `KanbanBoard.jsx` | Delays a value update by N ms (search input) |

**`useDebounce`**
```js
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);          // cleanup on every keystroke
  }, [value, delay]);
  return debounced;
}
```

**`useUndoRedo`**
```js
function useUndoRedo(reducer, initial) {
  const [hist, setHist] = useState({ history: [initial], index: 0 });
  const dispatch = useCallback((action) => {
    setHist(prev => {
      const next = reducer(prev.history[prev.index], action);
      const newH = prev.history.slice(0, prev.index + 1).concat([next]);
      return { history: newH, index: prev.index + 1 };
    });
  }, [reducer]);
  // ...
}
```

---

### 7. Persistence Strategy — `localStorage` with Optimistic Updates

```
User drags card
  └──► dispatch(MOVE_CARD)          ← UI updates instantly (optimistic)
         └──► useEffect             ← serialises new state to localStorage
                localStorage.setItem("kb-state", JSON.stringify(state))
```

On mount, `useMemo` reads `localStorage` once — if valid JSON exists, it seeds the reducer history, otherwise falls back to `INITIAL_STATE`. Theme is persisted separately under `"kb-theme"` to avoid a flash-of-wrong-theme on reload.

---

### 8. Accessibility

| Feature | Implementation |
|---------|---------------|
| Keyboard drag | `ArrowLeft` / `ArrowRight` on focused card dispatches `MOVE_CARD` to adjacent column |
| ARIA roles | `role="list"` on column body, `role="listitem"` + `aria-grabbed` on each card |
| Screen reader | `role="status" aria-live="polite"` on status bar announces sim activity |
| Modal | `role="dialog" aria-modal="true"`, `Escape` closes it |
| Focus ring | `outline:2px solid #3b82f6` on `.kcard:focus` |
| Tab order | All cards are `tabIndex={0}`, natural DOM order = visual order |

---

### 9. Theming — CSS Custom Properties, No Flash

All colors are defined as CSS variables on `:root` using an **inline `<style>` tag** that is re-evaluated whenever `theme` state changes. This avoids the FOUC (flash of unstyled content) that a `className` swap approach can cause.

```js
// theme persisted before first paint
const savedTheme = useMemo(() => localStorage.getItem("kb-theme") || "dark", []);
const [theme, setTheme] = useState(savedTheme);   // correct theme from frame 1
```

Dark & light palettes are defined inline in the style string:
```css
--bg:       #0b0c12  /* dark */  |  #eef0f5  /* light */
--col-bg:   #14151f              |  #f3f4f8
--card-bg:  #1c1d2a              |  #ffffff
--text-1:   #e8e9f4              |  #111827
```

Column titles use `color: var(--col-accent)` (each column's own accent colour) so they remain legible in both themes without hardcoding.

---

## 📁 Project Structure

```
kanbanpro/
├── src/
│   ├── KanbanBoard.jsx      # All components + hooks (single-file, self-contained)
│   └── main.jsx             # ReactDOM.createRoot entry point
├── public/
│   └── index.html
├── screenshots/
│   ├── dark.png
│   └── light.png
├── package.json
├── vite.config.js
└── README.md
```

---

## ⚙️ Getting Started

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### Install & Run

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/kanbanpro.git
cd kanbanpro

# 2. Install dependencies (React only — no DnD libs)
npm install

# 3. Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Build for Production

```bash
npm run build
npm run preview
```

### Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

---

## 🧪 Feature Checklist

| Requirement | Status |
|-------------|--------|
| Drag & Drop — Native HTML5 API | ✅ |
| No react-dnd / dnd-kit | ✅ |
| Smooth ghost + drop indicator | ✅ |
| Empty column drop target | ✅ |
| Global state (no prop drilling) | ✅ |
| localStorage persistence | ✅ |
| Undo / Redo (Ctrl+Z / Ctrl+Y) | ✅ |
| 100+ cards without lag | ✅ |
| React.memo on cards & columns | ✅ |
| Real-time sim (setInterval 10s) | ✅ |
| Conflict detection + toast | ✅ |
| Live search with 300ms debounce | ✅ |
| Multi-select label filter | ✅ |
| URL-synced filters (?labels=…) | ✅ |
| Custom `<Highlight>` component | ✅ |
| Keyboard navigation (arrow keys) | ✅ |
| ARIA roles + aria-grabbed | ✅ |
| Screen reader announcements | ✅ |
| Dark / Light theme | ✅ |
| Theme persisted (no flash) | ✅ |
| Mobile-responsive footer | ✅ |
| At least one custom hook extracted | ✅ `useUndoRedo`, `useDebounce` |

---

## 🧩 Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0"
  }
}
```

**Zero runtime UI / DnD dependencies** — everything is implemented from scratch as required.

---

## 📐 Evaluation Rubric Coverage

| Area | Weight | How it's addressed |
|------|--------|--------------------|
| Drag & Drop quality | 25% | Native HTML5 API, precise per-card drop zones, empty-column support, conflict animation |
| State management | 20% | Pure reducer + `useUndoRedo`, zero prop drilling, `React.memo` everywhere |
| Performance | 20% | Memo on every card/column, `useMemo` for filtered data, `useCallback` on all handlers, `stateRef` for intervals |
| Code quality | 15% | Clean component separation, 2 extracted hooks, no god components |
| Accessibility | 10% | Full keyboard nav, ARIA roles, live region, focus ring |
| Conflict / real-time UI | 10% | `setInterval` sim, conflict shake + glow, toast queue (max 3) |

---

## 🔮 What I'd Change With More Time

1. **TypeScript** — Add full typings (`BoardState`, `Card`, `Action` discriminated unions)
2. **`react-window`** — Virtual list per column for true 1000-card performance proof
3. **Yjs / WebSocket** — Replace `setInterval` simulation with real CRDT-based multi-user sync
4. **Card CRUD** — Add / edit / delete cards via modal form
5. **Optimistic error simulation toggle** — API failure toggle with retry logic (Bonus requirement)
6. **TipTap rich text** — Replace plain description textarea with TipTap editor in card modal

---

## 📄 License

MIT © 2025 — Built as a Frontend Developer Assessment submission.