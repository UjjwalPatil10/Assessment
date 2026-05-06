import {
  useState, useEffect, useCallback, useRef, useMemo, memo, useLayoutEffect
} from "react";

// ═══════════════════════════════════════════════════════════════════════
// § 1  PUB/SUB DATA BUS  (hand-rolled — no RxJS)
// ═══════════════════════════════════════════════════════════════════════ ========================
const MetricBus = (() => {
  const subs    = {};
  const buffers = {};
  const MAX     = 3600; // 1 hr @ 1 s

  return {
    subscribe(id, cb) {
      if (!subs[id]) subs[id] = new Set();
      subs[id].add(cb);
      if (buffers[id]?.length) cb([...buffers[id]]);
      return () => subs[id]?.delete(cb);
    },
    publish(id, pt) {
      if (!buffers[id]) buffers[id] = [];
      buffers[id].push(pt);
      if (buffers[id].length > MAX) buffers[id].shift();
      subs[id]?.forEach(cb => cb([...buffers[id]]));
    },
    getBuffer(id) { return buffers[id] ? [...buffers[id]] : []; },
  };
})();

// ═══════════════════════════════════════════════════════════════════════
// § 2  METRIC DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════
const METRICS = {
  cpu:     { label: "CPU Usage",     unit: "%",     min: 0,   max: 100,  color: "#00e5ff", base: 45,  noise: 22, type: "line" },
  memory:  { label: "Memory",        unit: "%",     min: 0,   max: 100,  color: "#ff6b9d", base: 62,  noise: 10, type: "area" },
  rps:     { label: "Request Rate",  unit: "req/s", min: 0,   max: 500,  color: "#a78bfa", base: 220, noise: 75, type: "bar"  },
  errors:  { label: "Error Rate",    unit: "%",     min: 0,   max: 10,   color: "#ff4d4d", base: 1.5, noise: 2,  type: "line" },
  latency: { label: "Response Time", unit: "ms",    min: 0,   max: 1000, color: "#fbbf24", base: 180, noise: 110,type: "area" },
  network: { label: "Network I/O",   unit: "MB/s",  min: 0,   max: 100,  color: "#34d399", base: 32,  noise: 18, type: "bar"  },
};
const MID = Object.keys(METRICS);

// ═══════════════════════════════════════════════════════════════════════
// § 3  GLOBAL DATA ENGINE — 1 s interval, mock WebSocket
// ═══════════════════════════════════════════════════════════════════════
let _engineOn = false;
function startEngine() {
  if (_engineOn) return;
  _engineOn = true;
  setInterval(() => {
    const now = Date.now();
    MID.forEach(id => {
      const m    = METRICS[id];
      const prev = MetricBus.getBuffer(id).slice(-1)[0]?.v ?? m.base;
      const walk = (Math.random() - 0.48) * m.noise * 0.35;
      const base = Math.max(m.min, Math.min(m.max, prev + walk));
      const spike= Math.random() < 0.04 ? Math.random() * m.noise * 1.9 : 0;
      MetricBus.publish(id, { ts: now, v: +(Math.min(m.max, base + spike)).toFixed(2) });
    });
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════════════
// § 4  TIME RANGES
// ═══════════════════════════════════════════════════════════════════════
const RANGES = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 };

// ═══════════════════════════════════════════════════════════════════════
// § 5  HOOKS
// ═══════════════════════════════════════════════════════════════════════
function useMetrics(metricId, paused, range = "5m") {
  const limit   = RANGES[range] || 300;
  const [data, setData] = useState(() => MetricBus.getBuffer(metricId).slice(-limit));
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const unsub = MetricBus.subscribe(metricId, all => {
      if (!pausedRef.current) setData(all.slice(-limit));
    });
    return unsub;
  }, [metricId, limit]);

  useEffect(() => {
    if (!paused) setData(MetricBus.getBuffer(metricId).slice(-limit));
  }, [paused, metricId, limit]);

  return data;
}

function useResize(ref) {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSz({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return sz;
}

// ═══════════════════════════════════════════════════════════════════════
// § 6  SVG MATH
// ═══════════════════════════════════════════════════════════════════════
const P = 8; // chart padding

function pts(data, W, H, min, max) {
  const range = max - min || 1;
  return data.map((d, i) => ({
    x: P + (i / Math.max(data.length - 1, 1)) * (W - P * 2),
    y: P + (1 - (d.v - min) / range) * (H - P * 2),
    v: d.v, ts: d.ts,
  }));
}

function catmull(points) {
  if (points.length < 2) return "";
  const d = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
  }
  return d.join(" ");
}

function rollingStats(data, win = 20) {
  if (data.length < 3) return { mean: 0, std: 0 };
  const s    = data.slice(-win);
  const mean = s.reduce((a, b) => a + b.v, 0) / s.length;
  const std  = Math.sqrt(s.reduce((a, b) => a + (b.v - mean) ** 2, 0) / s.length);
  return { mean, std };
}

// ═══════════════════════════════════════════════════════════════════════
// § 7  SVG CHARTS
// ═══════════════════════════════════════════════════════════════════════
const GridLines = ({ W, H }) => (
  <g>
    {[0.25, 0.5, 0.75].map(f => (
      <line key={f} x1={P} y1={P + f*(H-P*2)} x2={W-P} y2={P + f*(H-P*2)}
        stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
    ))}
  </g>
);

const ThreshLine = ({ W, H, min, max, threshold, unit }) => {
  if (threshold == null) return null;
  const y = P + (1 - (threshold - min) / (max - min)) * (H - P * 2);
  return (
    <g>
      <line x1={P} y1={y} x2={W-P} y2={y} stroke="#ff4d4d" strokeWidth="1.5" strokeDasharray="6 3" opacity={0.85}/>
      <rect x={W-P-36} y={y-14} width={34} height={13} rx={3} fill="rgba(255,77,77,0.2)"/>
      <text x={W-P-3} y={y-4} fill="#ff4d4d" fontSize="8" textAnchor="end">{threshold}{unit}</text>
    </g>
  );
};

const HoverLine = ({ ptArr, hoverTs, data, color, unit }) => {
  if (hoverTs == null || !ptArr.length) return null;
  const idx = data.findIndex(d => d.ts >= hoverTs);
  if (idx < 0 || !ptArr[idx]) return null;
  const { x, y, v } = ptArr[idx];
  return (
    <g>
      <line x1={x} y1={P} x2={x} y2={ptArr[0]?.y ?? 0}
        stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="3 3"/>
      <circle cx={x} cy={y} r={4.5} fill={color} stroke="#0d1626" strokeWidth="1.5"/>
      <rect x={x+6} y={y-15} width={52} height={15} rx={3} fill="rgba(0,0,0,0.8)"/>
      <text x={x+10} y={y-4} fill="#fff" fontSize="9">{v.toFixed(1)}{unit}</text>
    </g>
  );
};

const AnomalyDots = ({ ptArr, mean, std }) => (
  <g>
    {ptArr.filter(p => std > 0 && Math.abs(p.v - mean) > 2 * std).map((p, i) => (
      <g key={i}>
        <circle cx={p.x} cy={p.y} r={5} fill="rgba(255,77,77,0.25)"/>
        <circle cx={p.x} cy={p.y} r={3} fill="#ff4d4d"/>
      </g>
    ))}
  </g>
);

const LineChart = memo(({ data, color, threshold, metricId, hoverTs, onHover }) => {
  const ref = useRef(null);
  const { w: W, h: H } = useResize(ref);
  const m    = METRICS[metricId];
  const p    = useMemo(() => pts(data, W, H, m.min, m.max), [data, W, H, m]);
  const path = useMemo(() => catmull(p), [p]);
  const { mean, std } = useMemo(() => rollingStats(data), [data]);
  const latest = data[data.length-1]?.v ?? 0;
  const alert  = threshold != null && latest > threshold;

  return (
    <div ref={ref} style={{ width:"100%", height:"100%" }}>
      {W > 0 && H > 0 && (
        <svg width={W} height={H} style={{ display:"block", overflow:"visible" }}
          onMouseMove={e => {
            if (!onHover) return;
            const r   = e.currentTarget.getBoundingClientRect();
            const idx = Math.round(((e.clientX - r.left - P) / (W - P*2)) * (data.length-1));
            const pt  = data[Math.max(0, Math.min(data.length-1, idx))];
            if (pt) onHover(pt.ts);
          }}
          onMouseLeave={() => onHover?.(null)}
        >
          <defs>
            {alert && (
              <filter id={`gl-${metricId}`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            )}
          </defs>
          <GridLines W={W} H={H}/>
          <ThreshLine W={W} H={H} min={m.min} max={m.max} threshold={threshold} unit={m.unit}/>
          <path d={path} fill="none" stroke={color} strokeWidth="2"
            filter={alert ? `url(#gl-${metricId})` : undefined}
            style={{ transition:"d 0.45s cubic-bezier(.4,0,.2,1)" }}/>
          <AnomalyDots ptArr={p} mean={mean} std={std}/>
          <HoverLine ptArr={p} hoverTs={hoverTs} data={data} color={color} unit={m.unit}/>
          {p.length > 0 && (
            <circle cx={p[p.length-1].x} cy={p[p.length-1].y} r={3.5}
              fill={color} stroke="#0d1626" strokeWidth="2"/>
          )}
        </svg>
      )}
    </div>
  );
});

const AreaChart = memo(({ data, color, threshold, metricId, hoverTs, onHover }) => {
  const ref = useRef(null);
  const { w: W, h: H } = useResize(ref);
  const m    = METRICS[metricId];
  const p    = useMemo(() => pts(data, W, H, m.min, m.max), [data, W, H, m]);
  const line = useMemo(() => catmull(p), [p]);
  const area = useMemo(() => {
    if (!p.length) return "";
    const last = p[p.length-1], first = p[0];
    return `${line} L ${last.x.toFixed(1)} ${H-P} L ${first.x.toFixed(1)} ${H-P} Z`;
  }, [line, p, H]);
  const { mean, std } = useMemo(() => rollingStats(data), [data]);
  const latest = data[data.length-1]?.v ?? 0;
  const alert  = threshold != null && latest > threshold;

  return (
    <div ref={ref} style={{ width:"100%", height:"100%" }}>
      {W > 0 && H > 0 && (
        <svg width={W} height={H} style={{ display:"block", overflow:"visible" }}
          onMouseMove={e => {
            if (!onHover) return;
            const r   = e.currentTarget.getBoundingClientRect();
            const idx = Math.round(((e.clientX - r.left - P) / (W - P*2)) * (data.length-1));
            const pt  = data[Math.max(0, Math.min(data.length-1, idx))];
            if (pt) onHover(pt.ts);
          }}
          onMouseLeave={() => onHover?.(null)}
        >
          <defs>
            <linearGradient id={`ag-${metricId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4"/>
              <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
            </linearGradient>
          </defs>
          <GridLines W={W} H={H}/>
          <ThreshLine W={W} H={H} min={m.min} max={m.max} threshold={threshold} unit={m.unit}/>
          <path d={area} fill={`url(#ag-${metricId})`} style={{ transition:"d 0.45s cubic-bezier(.4,0,.2,1)" }}/>
          <path d={line} fill="none" stroke={color} strokeWidth="2"
            style={{ transition:"d 0.45s cubic-bezier(.4,0,.2,1)" }}/>
          <AnomalyDots ptArr={p} mean={mean} std={std}/>
          <HoverLine ptArr={p} hoverTs={hoverTs} data={data} color={color} unit={m.unit}/>
          {p.length > 0 && (
            <circle cx={p[p.length-1].x} cy={p[p.length-1].y} r={3.5}
              fill={color} stroke="#0d1626" strokeWidth="2"/>
          )}
        </svg>
      )}
    </div>
  );
});

const BarChart = memo(({ data, color, threshold, metricId, hoverTs, onHover }) => {
  const ref = useRef(null);
  const { w: W, h: H } = useResize(ref);
  const m      = METRICS[metricId];
  const SHOW   = Math.min(data.length, 60);
  const sliced = data.slice(-SHOW);
  const range  = m.max - m.min || 1;
  const bW     = Math.max(2, (W - P*2) / SHOW - 1);
  const { mean, std } = useMemo(() => rollingStats(data), [data]);
  const latest = sliced[sliced.length-1]?.v ?? 0;
  const alert  = threshold != null && latest > threshold;

  return (
    <div ref={ref} style={{ width:"100%", height:"100%" }}>
      {W > 0 && H > 0 && (
        <svg width={W} height={H} style={{ display:"block", overflow:"visible" }}
          onMouseMove={e => {
            if (!onHover) return;
            const r  = e.currentTarget.getBoundingClientRect();
            const idx= Math.floor(((e.clientX - r.left - P) / (W - P*2)) * sliced.length);
            const pt = sliced[Math.max(0, Math.min(sliced.length-1, idx))];
            if (pt) onHover(pt.ts);
          }}
          onMouseLeave={() => onHover?.(null)}
        >
          <GridLines W={W} H={H}/>
          <ThreshLine W={W} H={H} min={m.min} max={m.max} threshold={threshold} unit={m.unit}/>
          {sliced.map((d, i) => {
            const barH = Math.max(1, ((d.v - m.min) / range) * (H - P*2));
            const x    = P + i * ((W - P*2) / SHOW);
            const isAnom = std > 0 && Math.abs(d.v - mean) > 2 * std;
            const isOver = threshold != null && d.v > threshold;
            const fill   = isAnom || isOver ? "#ff4d4d" : color;
            const isH    = hoverTs && Math.abs(d.ts - hoverTs) < 1500;
            return (
              <rect key={i} x={x} y={H-P-barH} width={bW} height={barH} rx={1.5}
                fill={fill} opacity={isH ? 1 : 0.72}
                style={{ transition:"height 0.4s ease, y 0.4s ease" }}/>
            );
          })}
          {hoverTs && (() => {
            const i  = sliced.findIndex(d => Math.abs(d.ts - hoverTs) < 1500);
            if (i < 0) return null;
            const x  = P + i * ((W - P*2) / SHOW) + bW/2;
            const d  = sliced[i];
            const barH = Math.max(1, ((d.v - m.min) / range) * (H - P*2));
            return (
              <g>
                <line x1={x} y1={P} x2={x} y2={H-P-barH}
                  stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 3"/>
                <rect x={x+6} y={H-P-barH-20} width={52} height={15} rx={3} fill="rgba(0,0,0,0.8)"/>
                <text x={x+10} y={H-P-barH-9} fill="#fff" fontSize="9">{d.v.toFixed(1)}{m.unit}</text>
              </g>
            );
          })()}
        </svg>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// § 8  TOAST QUEUE  (max 3 visible)
// ═══════════════════════════════════════════════════════════════════════
function ToastQueue({ toasts, onDismiss }) {
  const visible = toasts.slice(-3);
  return (
    <div style={{ position:"fixed", top:16, right:16, zIndex:9999, display:"flex", flexDirection:"column", gap:8, width:300 }}>
      {visible.map((t, i) => (
        <div key={t.id} style={{
          background: t.critical ? "rgba(255,40,40,0.15)" : "rgba(13,22,38,0.95)",
          border: `1px solid ${t.critical ? "#ff4d4d" : "rgba(255,255,255,0.1)"}`,
          borderLeft: `3px solid ${t.critical ? "#ff4d4d" : t.color}`,
          borderRadius:8, padding:"10px 14px", color:"#c8d8f0", fontSize:12,
          backdropFilter:"blur(12px)", boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
          animation:"tSlide 0.25s ease",
          display:"flex", alignItems:"center", gap:10,
        }}>
          <span style={{ fontSize:14 }}>{t.critical ? "🚨" : "ℹ"}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, marginBottom:2 }}>{t.title}</div>
            <div style={{ opacity:0.7, fontSize:11 }}>{t.msg}</div>
          </div>
          <button onClick={() => onDismiss(t.id)}
            style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:16 }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// § 9  WIDGET
// ═══════════════════════════════════════════════════════════════════════
const SIZES = ["sm","md","lg"]; // maps to grid col spans: 4, 6, 12

const Widget = memo(({
  id, metricId, chartType, size, threshold, paused, range,
  hoverTs, onHover,
  onRemove, onTogglePause, onThreshChange, onTypeChange, onSizeChange,
  onExportSVG, onExportPNG, isDragging, isOver,
  onDragStart, onDragEnd, onDragOver, onDrop,
  alerting,
}) => {
  const m      = METRICS[metricId];
  const data   = useMetrics(metricId, paused, range);
  const latest = data[data.length-1]?.v ?? 0;
  const prev   = data[data.length-2]?.v ?? latest;
  const delta  = latest - prev;
  const svgRef = useRef(null);
  const [showCfg, setShowCfg] = useState(false);

  const Chart = chartType === "bar" ? BarChart : chartType === "area" ? AreaChart : LineChart;

  return (
    <div
      className={`widget sz-${size}${isDragging?" w-drag":""}${isOver?" w-over":""}${alerting?" w-alert":""}`}
      draggable
      onDragStart={e => onDragStart(e, id)}
      onDragEnd={onDragEnd}
      onDragOver={e => { e.preventDefault(); onDragOver(id); }}
      onDrop={e => { e.preventDefault(); onDrop(id); }}
    >
      {/* ── Header ── */}
      <div className="w-head">
        <div className="drag-handle" title="Drag to reorder">⠿</div>
        <span className="metric-dot" style={{ background: m.color }}/>
        <span className="w-label">{m.label}</span>
        <span className="w-val" style={{ color: m.color }}>
          {latest.toFixed(1)}<span className="w-unit">{m.unit}</span>
        </span>
        <span className={`w-delta ${delta >= 0 ? "up" : "dn"}`}>
          {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}
        </span>
        {alerting && <span className="alert-badge">● ALERT</span>}
        <div className="w-actions">
          <button className="wa" onClick={() => onTogglePause(id)} title={paused?"Resume":"Pause"}>
            {paused ? "▶" : "⏸"}
          </button>
          <button className="wa" onClick={() => setShowCfg(c => !c)} title="Configure">⚙</button>
          <button className="wa" onClick={() => onExportSVG(id, svgRef)} title="Export SVG">SVG</button>
          <button className="wa" onClick={() => onExportPNG(id, svgRef)} title="Export PNG">PNG</button>
          <button className="wa danger" onClick={() => onRemove(id)} title="Remove">✕</button>
        </div>
      </div>

      {/* ── Config Panel ── */}
      {showCfg && (
        <div className="w-cfg">
          <label>Chart<select value={chartType} onChange={e => onTypeChange(id, e.target.value)}>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
          </select></label>
          <label>Size<select value={size} onChange={e => onSizeChange(id, e.target.value)}>
            <option value="sm">Small (4col)</option>
            <option value="md">Medium (6col)</option>
            <option value="lg">Large (12col)</option>
          </select></label>
          <label>Threshold
            <input type="number" min={m.min} max={m.max} step={0.1}
              value={threshold ?? ""} placeholder="None"
              onChange={e => onThreshChange(id, e.target.value === "" ? null : +e.target.value)}/>
            <span className="cfg-unit">{m.unit}</span>
          </label>
        </div>
      )}

      {/* ── Chart ── */}
      <div className="w-chart" ref={svgRef} style={{ opacity: paused ? 0.6 : 1 }}>
        {paused && <div className="paused-badge">⏸ PAUSED</div>}
        <Chart
          data={data}
          color={m.color}
          threshold={threshold}
          metricId={metricId}
          hoverTs={hoverTs}
          onHover={onHover}
        />
      </div>

      {/* ── Footer ── */}
      <div className="w-foot">
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"rgba(200,216,240,0.3)" }}>
          {data.length} pts
        </span>
        {threshold != null && (
          <span style={{ fontSize:10, color: alerting ? "#ff4d4d" : "rgba(200,216,240,0.4)" }}>
            {alerting ? "⚠ OVER THRESHOLD" : `thresh ${threshold}${m.unit}`}
          </span>
        )}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// § 10  ALERT HISTORY PANEL
// ═══════════════════════════════════════════════════════════════════════
function AlertHistory({ alerts, onClear }) {
  const [sort, setSort]   = useState("ts_desc");
  const [filter, setFilter] = useState("");

  const sorted = useMemo(() => {
    let a = [...alerts];
    if (filter) a = a.filter(x => x.metric.toLowerCase().includes(filter.toLowerCase()));
    if (sort === "ts_desc")  a.sort((x,y) => y.ts - x.ts);
    if (sort === "ts_asc")   a.sort((x,y) => x.ts - y.ts);
    if (sort === "metric")   a.sort((x,y) => x.metric.localeCompare(y.metric));
    if (sort === "val_desc") a.sort((x,y) => y.val - x.val);
    return a;
  }, [alerts, sort, filter]);

  return (
    <div className="ah-panel">
      <div className="ah-head">
        <span className="ah-title">🚨 Alert History <span className="ah-cnt">{alerts.length}</span></span>
        <input className="ah-filter" placeholder="Filter metric…" value={filter}
          onChange={e => setFilter(e.target.value)}/>
        <select className="ah-sort" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="ts_desc">Newest first</option>
          <option value="ts_asc">Oldest first</option>
          <option value="metric">By metric</option>
          <option value="val_desc">By value</option>
        </select>
        <button className="ah-clear" onClick={onClear}>Clear</button>
      </div>
      <div className="ah-list">
        {sorted.length === 0
          ? <div className="ah-empty">No alerts yet</div>
          : sorted.map(a => (
            <div key={a.id} className="ah-row">
              <span className="ah-dot" style={{ background: METRICS[a.metricId]?.color }}/>
              <span className="ah-metric">{a.metric}</span>
              <span className="ah-val">{a.val.toFixed(1)}{a.unit}</span>
              <span className="ah-thresh">› {a.threshold}{a.unit}</span>
              <span className="ah-ts">{new Date(a.ts).toLocaleTimeString()}</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// § 11  EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════════════
function exportSVG(svgEl) {
  const el  = svgEl?.querySelector("svg");
  if (!el) return;
  const xml = new XMLSerializer().serializeToString(el);
  const blob= new Blob([xml], { type:"image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement("a"), { href:url, download:"chart.svg" });
  a.click(); URL.revokeObjectURL(url);
}

function exportPNG(svgEl) {
  const el = svgEl?.querySelector("svg");
  if (!el) return;
  const { width:w, height:h } = el.getBoundingClientRect();
  const xml  = new XMLSerializer().serializeToString(el);
  const img  = new Image();
  const url  = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  img.onload = () => {
    const c = Object.assign(document.createElement("canvas"), { width:w*2, height:h*2 });
    const ctx = c.getContext("2d");
    ctx.scale(2, 2);
    ctx.fillStyle = "#0d1626";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    c.toBlob(blob => {
      const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(blob), download:"chart.png" });
      a.click();
    });
  };
  img.src = url;
}

// ═══════════════════════════════════════════════════════════════════════
// § 12  MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
const DEFAULT_WIDGETS = [
  { id:"w1", metricId:"cpu",     chartType:"line", size:"md", threshold:80,  paused:false },
  { id:"w2", metricId:"memory",  chartType:"area", size:"md", threshold:90,  paused:false },
  { id:"w3", metricId:"rps",     chartType:"bar",  size:"md", threshold:400, paused:false },
  { id:"w4", metricId:"errors",  chartType:"line", size:"md", threshold:5,   paused:false },
  { id:"w5", metricId:"latency", chartType:"area", size:"md", threshold:800, paused:false },
  { id:"w6", metricId:"network", chartType:"bar",  size:"md", threshold:80,  paused:false },
];

export default function DataDashboard() {
  startEngine();

  // ── State ──────────────────────────────────────────────────────────
  const [theme,   setTheme]   = useState(() => localStorage.getItem("db-theme") || "dark");
  const [range,   setRange]   = useState("5m");
  const [widgets, setWidgets] = useState(() => {
    try { const s = localStorage.getItem("db-widgets"); return s ? JSON.parse(s) : DEFAULT_WIDGETS; }
    catch { return DEFAULT_WIDGETS; }
  });
  const [toasts,     setToasts]     = useState([]);
  const [alerts,     setAlerts]     = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [hoverTs,    setHoverTs]    = useState(null);
  const [dragId,     setDragId]     = useState(null);
  const [overIdx,    setOverIdx]    = useState(null);
  const [alertingIds,setAlertingIds]= useState({});
  const [newMetric,  setNewMetric]  = useState("cpu");
  const latestRef = useRef({});
  const alertCooldown = useRef({});

  // Persist
  useEffect(() => { localStorage.setItem("db-theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("db-widgets", JSON.stringify(widgets)); }, [widgets]);

  // ── Alerting engine — poll latest values every 2 s ─────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      widgets.forEach(w => {
        if (!w.threshold || w.paused) return;
        const buf = MetricBus.getBuffer(w.metricId);
        if (!buf.length) return;
        const latest = buf[buf.length-1];
        const m = METRICS[w.metricId];
        const over = latest.v > w.threshold;

        setAlertingIds(prev => ({ ...prev, [w.id]: over }));

        if (over && (!alertCooldown.current[w.id] || now - alertCooldown.current[w.id] > 15000)) {
          alertCooldown.current[w.id] = now;
          const id = now + Math.random();
          const entry = { id, ts: now, metricId: w.metricId, metric: m.label,
            val: latest.v, threshold: w.threshold, unit: m.unit };

          setAlerts(prev => [entry, ...prev].slice(0, 200));
          setToasts(prev => {
            const next = [...prev, { id, critical:true, color: m.color,
              title:`${m.label} Alert`, msg:`${latest.v.toFixed(1)}${m.unit} › ${w.threshold}${m.unit}` }];
            return next.slice(-6); // keep last 6 (max 3 shown)
          });
          setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
        }
      });
    }, 2000);
    return () => clearInterval(iv);
  }, [widgets]);

  // ── Widget helpers ─────────────────────────────────────────────────
  const updateWidget = useCallback((id, patch) =>
    setWidgets(prev => prev.map(w => w.id === id ? {...w,...patch} : w)), []);

  const removeWidget    = useCallback(id => setWidgets(prev => prev.filter(w => w.id !== id)), []);
  const togglePause     = useCallback(id => updateWidget(id, { paused: !widgets.find(w=>w.id===id)?.paused }), [widgets, updateWidget]);
  const changeType      = useCallback((id, chartType) => updateWidget(id, { chartType }), [updateWidget]);
  const changeSize      = useCallback((id, size) => updateWidget(id, { size }), [updateWidget]);
  const changeThreshold = useCallback((id, threshold) => updateWidget(id, { threshold }), [updateWidget]);

  const addWidget = () => {
    const used = widgets.map(w=>w.metricId);
    const id   = `w${Date.now()}`;
    const m    = METRICS[newMetric];
    setWidgets(prev => [...prev, { id, metricId:newMetric, chartType:m.type, size:"md", threshold:null, paused:false }]);
  };

  // ── Drag reorder ────────────────────────────────────────────────────
  const dragOver = useCallback((toId) => {
    if (!dragId || dragId === toId) return;
    setOverIdx(toId);
  }, [dragId]);

  const drop = useCallback((toId) => {
    if (!dragId || dragId === toId) return;
    setWidgets(prev => {
      const arr   = [...prev];
      const fromI = arr.findIndex(w => w.id === dragId);
      const toI   = arr.findIndex(w => w.id === toId);
      const [item]= arr.splice(fromI, 1);
      arr.splice(toI, 0, item);
      return arr;
    });
    setDragId(null); setOverIdx(null);
  }, [dragId]);

  // ── Export dashboard JSON ────────────────────────────────────────────
  const exportJSON = () => {
    const cfg  = { version:1, theme, range, widgets };
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type:"application/json" });
    const a    = Object.assign(document.createElement("a"), { href:URL.createObjectURL(blob), download:"dashboard.json" });
    a.click();
  };
  const importJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const cfg = JSON.parse(ev.target.result);
        if (cfg.widgets) setWidgets(cfg.widgets);
        if (cfg.theme)  setTheme(cfg.theme);
        if (cfg.range)  setRange(cfg.range);
      } catch { alert("Invalid JSON config"); }
    };
    r.readAsText(file);
  };

  // ── Widget refs for export ───────────────────────────────────────────
  const widgetRefs = useRef({});

  // ── CSS ─────────────────────────────────────────────────────────────
  const THEME_VARS = {
    dark: `
      --bg:      #060d1a;
      --surface: #0a1422;
      --card:    #0d1626;
      --card2:   #111f35;
      --border:  rgba(255,255,255,0.07);
      --text:    #c8d8f0;
      --text2:   #5a7a9a;
      --tb:      rgba(6,13,26,0.96);
    `,
    light: `
      --bg:      #f0f4fa;
      --surface: #ffffff;
      --card:    #f8fafd;
      --card2:   #eef3fb;
      --border:  rgba(0,0,0,0.08);
      --text:    #1a2a3a;
      --text2:   #607080;
      --tb:      rgba(240,244,250,0.97);
    `,
    hc: `
      --bg:      #000000;
      --surface: #0a0a0a;
      --card:    #111111;
      --card2:   #1a1a1a;
      --border:  rgba(255,255,255,0.25);
      --text:    #ffffff;
      --text2:   #aaaaaa;
      --tb:      rgba(0,0,0,0.98);
    `,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :root { ${THEME_VARS[theme]} }
        body { font-family:'Outfit',system-ui,sans-serif; background:var(--bg); color:var(--text); }

        @keyframes tSlide  { from{transform:translateX(100%);opacity:0} to{transform:none;opacity:1} }
        @keyframes alertPulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,77,77,0)} 50%{box-shadow:0 0 0 6px rgba(255,77,77,0.3)} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes spin    { to{transform:rotate(360deg)} }

        /* ── TOOLBAR ── */
        .toolbar {
          position:sticky; top:0; z-index:200;
          background:var(--tb); backdrop-filter:blur(20px);
          border-bottom:1px solid var(--border);
          padding:10px 20px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;
        }
        .logo-wrap { display:flex; align-items:center; gap:10px; }
        .logo-icon {
          width:32px; height:32px; border-radius:8px;
          background:linear-gradient(135deg,#00e5ff22,#a78bfa22);
          border:1px solid rgba(0,229,255,0.3);
          display:flex; align-items:center; justify-content:center; font-size:16px;
        }
        .logo-text { font-size:16px; font-weight:800; letter-spacing:-0.5px; }
        .logo-sub  { font-size:10px; color:var(--text2); font-family:'JetBrains Mono',monospace; }
        .tb-sep  { width:1px; height:24px; background:var(--border); flex-shrink:0; }
        .tb-grp  { display:flex; align-items:center; gap:6px; }
        .tb-lbl  { font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; letter-spacing:0.8px; }
        .tb-btn  {
          padding:5px 12px; border-radius:6px; font-size:12px; font-weight:600;
          border:1px solid var(--border); background:var(--card2); color:var(--text);
          cursor:pointer; transition:all 0.15s; font-family:inherit;
        }
        .tb-btn:hover { border-color:rgba(255,255,255,0.2); background:var(--card); }
        .tb-btn.active { background:rgba(0,229,255,0.1); border-color:rgba(0,229,255,0.4); color:#00e5ff; }
        .tb-btn.danger:hover { border-color:#ff4d4d; color:#ff4d4d; }
        .tb-sel  {
          padding:5px 10px; border-radius:6px; font-size:12px; background:var(--card2);
          border:1px solid var(--border); color:var(--text); cursor:pointer; font-family:inherit;
        }
        .tb-right { margin-left:auto; display:flex; align-items:center; gap:8px; }
        .live-dot {
          width:7px; height:7px; border-radius:50%; background:#34d399;
          animation:spin 2s linear infinite;
          box-shadow:0 0 6px #34d399;
        }
        .live-txt { font-size:11px; color:#34d399; font-family:'JetBrains Mono',monospace; }

        /* ── GRID ── */
        .board { padding:16px 20px 80px; }
        .grid  {
          display:grid;
          grid-template-columns:repeat(12,1fr);
          gap:14px;
          align-items:start;
        }

        /* ── WIDGET ── */
        .widget {
          background:var(--card);
          border:1px solid var(--border);
          border-radius:12px;
          display:flex; flex-direction:column;
          overflow:hidden;
          transition:border-color 0.2s, box-shadow 0.2s, opacity 0.2s;
          animation:fadeIn 0.3s ease;
          min-height:220px;
        }
        .widget.sz-sm { grid-column:span 4; }
        .widget.sz-md { grid-column:span 6; }
        .widget.sz-lg { grid-column:span 12; }
        @media(max-width:900px) { .widget.sz-sm,.widget.sz-md { grid-column:span 12; } }
        .widget.w-drag  { opacity:0.4; transform:scale(0.97); }
        .widget.w-over  { border-color:rgba(0,229,255,0.5); box-shadow:0 0 20px rgba(0,229,255,0.15); }
        .widget.w-alert { border-color:#ff4d4d; animation:alertPulse 1.5s ease infinite; }

        /* Widget header */
        .w-head {
          display:flex; align-items:center; gap:8px;
          padding:10px 12px 8px;
          border-bottom:1px solid var(--border);
          flex-wrap:wrap;
        }
        .drag-handle { color:var(--text2); cursor:grab; font-size:14px; flex-shrink:0; opacity:0.5; }
        .drag-handle:hover { opacity:1; }
        .metric-dot  { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
        .w-label     { font-size:12px; font-weight:700; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .w-val       { font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; }
        .w-unit      { font-size:10px; opacity:0.6; margin-left:1px; }
        .w-delta     { font-size:10px; font-family:'JetBrains Mono',monospace; font-weight:700; }
        .w-delta.up  { color:#ff4d4d; }
        .w-delta.dn  { color:#34d399; }
        .alert-badge { font-size:9px; font-weight:800; color:#ff4d4d; letter-spacing:0.5px; animation:alertPulse 1s ease infinite; }
        .w-actions   { display:flex; gap:4px; margin-left:auto; flex-shrink:0; }
        .wa {
          padding:3px 7px; border-radius:5px; font-size:11px; font-weight:700;
          border:1px solid var(--border); background:var(--card2); color:var(--text2);
          cursor:pointer; transition:all 0.12s; font-family:inherit;
        }
        .wa:hover { color:var(--text); border-color:rgba(255,255,255,0.2); }
        .wa.danger:hover { color:#ff4d4d; border-color:#ff4d4d44; }

        /* Widget config */
        .w-cfg {
          display:flex; align-items:center; gap:10px; flex-wrap:wrap;
          padding:8px 12px; background:var(--card2);
          border-bottom:1px solid var(--border);
          font-size:12px;
        }
        .w-cfg label { display:flex; align-items:center; gap:6px; color:var(--text2); }
        .w-cfg select, .w-cfg input {
          padding:3px 7px; border-radius:5px; border:1px solid var(--border);
          background:var(--card); color:var(--text); font-size:11px; font-family:inherit;
        }
        .w-cfg input { width:70px; }
        .cfg-unit { font-size:10px; color:var(--text2); }

        /* Widget chart area */
        .w-chart {
          flex:1; padding:8px 12px; min-height:130px; position:relative;
        }
        .paused-badge {
          position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
          background:rgba(0,0,0,0.7); border:1px solid var(--border);
          border-radius:6px; padding:4px 10px; font-size:11px; font-weight:700;
          color:var(--text2); z-index:5; pointer-events:none;
        }

        /* Widget footer */
        .w-foot {
          display:flex; justify-content:space-between; align-items:center;
          padding:5px 12px; border-top:1px solid var(--border);
          font-size:10px; color:var(--text2);
        }

        /* ── ADD WIDGET BAR ── */
        .add-bar {
          display:flex; align-items:center; gap:10px; flex-wrap:wrap;
          padding:12px 20px; background:var(--surface);
          border-top:1px solid var(--border);
          position:fixed; bottom:0; left:0; right:0; z-index:100;
        }
        .add-lbl { font-size:11px; font-weight:700; color:var(--text2); text-transform:uppercase; letter-spacing:0.8px; }
        .add-btn {
          padding:6px 16px; border-radius:7px; font-size:12px; font-weight:700;
          background:linear-gradient(135deg,rgba(0,229,255,0.15),rgba(167,139,250,0.15));
          border:1px solid rgba(0,229,255,0.3); color:#00e5ff; cursor:pointer;
          font-family:inherit; transition:all 0.15s;
        }
        .add-btn:hover { background:rgba(0,229,255,0.2); }

        /* ── ALERT HISTORY PANEL ── */
        .ah-panel {
          position:fixed; top:0; right:0; bottom:0; width:360px; z-index:300;
          background:var(--surface); border-left:1px solid var(--border);
          display:flex; flex-direction:column;
          animation:fadeIn 0.2s ease;
        }
        .ah-head  { padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .ah-title { font-size:13px; font-weight:800; flex:1; }
        .ah-cnt   { background:rgba(255,77,77,0.2); color:#ff4d4d; border-radius:10px; padding:1px 7px; font-size:11px; }
        .ah-filter,.ah-sort {
          padding:4px 8px; border-radius:5px; border:1px solid var(--border);
          background:var(--card); color:var(--text); font-size:11px; font-family:inherit;
        }
        .ah-filter { flex:1; min-width:80px; }
        .ah-clear {
          padding:4px 10px; border-radius:5px; border:1px solid rgba(255,77,77,0.3);
          background:rgba(255,77,77,0.1); color:#ff4d4d; cursor:pointer; font-size:11px; font-family:inherit;
        }
        .ah-list  { flex:1; overflow-y:auto; padding:8px; }
        .ah-empty { text-align:center; padding:32px; color:var(--text2); font-size:13px; }
        .ah-row   { display:flex; align-items:center; gap:8px; padding:7px 8px; border-radius:6px; font-size:11px; border:1px solid var(--border); margin-bottom:6px; background:var(--card); }
        .ah-dot   { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
        .ah-metric{ font-weight:700; flex:1; }
        .ah-val   { font-family:'JetBrains Mono',monospace; font-weight:700; color:#ff4d4d; }
        .ah-thresh{ color:var(--text2); }
        .ah-ts    { color:var(--text2); font-family:'JetBrains Mono',monospace; font-size:10px; }

        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }
      `}</style>

      <div data-theme={theme} style={{ minHeight:"100vh", background:"var(--bg)" }}>

        {/* ── TOOLBAR ── */}
        <header className="toolbar" role="banner">
          <div className="logo-wrap">
            <div className="logo-icon">📡</div>
            <div>
              <div className="logo-text">Pulse</div>
              <div className="logo-sub">live · monitoring</div>
            </div>
          </div>

          <div className="tb-sep"/>

          {/* Time range */}
          <div className="tb-grp">
            <span className="tb-lbl">Range</span>
            {Object.keys(RANGES).map(r => (
              <button key={r} className={`tb-btn${range===r?" active":""}`}
                onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>

          <div className="tb-sep"/>

          {/* Theme */}
          <div className="tb-grp">
            <span className="tb-lbl">Theme</span>
            {[["dark","🌙"],["light","☀️"],["hc","⬤"]].map(([t,l]) => (
              <button key={t} className={`tb-btn${theme===t?" active":""}`}
                onClick={() => setTheme(t)}>{l} {t}</button>
            ))}
          </div>

          <div className="tb-right">
            {/* Alert history toggle */}
            <button className={`tb-btn${showAlerts?" active":""}`}
              onClick={() => setShowAlerts(s=>!s)} style={{ position:"relative" }}>
              🚨 Alerts
              {alerts.length > 0 && (
                <span style={{ position:"absolute", top:-4, right:-4, background:"#ff4d4d",
                  color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:9,
                  display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800 }}>
                  {Math.min(alerts.length, 99)}
                </span>
              )}
            </button>

            {/* Export / Import */}
            <button className="tb-btn" onClick={exportJSON}>⬇ Export</button>
            <label className="tb-btn" style={{ cursor:"pointer" }}>
              ⬆ Import
              <input type="file" accept=".json" onChange={importJSON} style={{ display:"none" }}/>
            </label>

            {/* Live indicator */}
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div className="live-dot"/>
              <span className="live-txt">LIVE</span>
            </div>
          </div>
        </header>

        {/* ── BOARD ── */}
        <main className="board">
          <div className="grid">
            {widgets.map(w => (
              <Widget
                key={w.id}
                {...w}
                range={range}
                hoverTs={hoverTs}
                onHover={setHoverTs}
                alerting={!!alertingIds[w.id]}
                onRemove={removeWidget}
                onTogglePause={togglePause}
                onThreshChange={changeThreshold}
                onTypeChange={changeType}
                onSizeChange={changeSize}
                isDragging={dragId === w.id}
                isOver={overIdx === w.id}
                onDragStart={(e, id) => { e.dataTransfer.effectAllowed="move"; setDragId(id); }}
                onDragEnd={() => { setDragId(null); setOverIdx(null); }}
                onDragOver={dragOver}
                onDrop={drop}
                onExportSVG={(id, ref) => exportSVG(ref.current)}
                onExportPNG={(id, ref) => exportPNG(ref.current)}
              />
            ))}
          </div>
        </main>

        {/* ── TOAST QUEUE ── */}
        <ToastQueue toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t=>t.id!==id))}/>

        {/* ── ALERT HISTORY ── */}
        {showAlerts && (
          <AlertHistory
            alerts={alerts}
            onClear={() => setAlerts([])}
          />
        )}

        {/* ── ADD WIDGET BAR ── */}
        <div className="add-bar">
          <span className="add-lbl">Add Widget</span>
          <select className="tb-sel" value={newMetric} onChange={e => setNewMetric(e.target.value)}>
            {MID.map(id => <option key={id} value={id}>{METRICS[id].label}</option>)}
          </select>
          <button className="add-btn" onClick={addWidget}>＋ Add</button>

          <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:11, color:"var(--text2)", fontFamily:"'JetBrains Mono',monospace" }}>
              {widgets.length} widget{widgets.length!==1?"s":""} · hover chart to sync crosshair
            </span>
          </div>
        </div>

      </div>
    </>
  );
}