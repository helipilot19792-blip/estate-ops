"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import styles from "./whiteboard.module.css";
import { MAX_DRAWING_POINTS, type WhiteboardStroke } from "@/lib/whiteboard-drawing";

type Drawing = { strokes: WhiteboardStroke[]; revision: number; updated_at: string | null };
type RequestBoard = (method?: string, body?: object, resource?: string) => Promise<{ drawing: Drawing }>;

export default function WhiteboardCanvas({ request, onDirtyChange }: { request: RequestBoard; onDirtyChange: (dirty: boolean) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const active = useRef<{ pointer: number; stroke: WhiteboardStroke } | null>(null);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [preview, setPreview] = useState<WhiteboardStroke | null>(null);
  const [history, setHistory] = useState<WhiteboardStroke[][]>([]);
  const [revision, setRevision] = useState(0);
  const [color, setColor] = useState("#241c15");
  const [width, setWidth] = useState(4);
  const [eraser, setEraser] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const finishStroke = useCallback(() => {
    const current = active.current;
    if (!current) return;
    // Clear first: pointerup and lostpointercapture can both arrive for a stroke.
    active.current = null;
    setHistory((items) => [...items.slice(-19), strokes]);
    setStrokes([...strokes, current.stroke]); setDirty(true); setPreview(null);
  }, [strokes]);

  useEffect(() => {
    const release = (event: globalThis.PointerEvent) => {
      if (active.current?.pointer === event.pointerId) finishStroke();
    };
    const hidden = () => { if (document.visibilityState !== "visible") finishStroke(); };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", finishStroke);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", finishStroke);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [finishStroke]);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    request("GET", undefined, "drawing").then(({ drawing }) => {
      if (cancelled) return;
      setStrokes(drawing.strokes); setRevision(drawing.revision); setLoaded(true);
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load drawing."); });
    return () => { cancelled = true; };
  }, [request]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function position(event: PointerEvent<SVGSVGElement>): [number, number] {
    const box = event.currentTarget.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(1000, (event.clientX - box.left) / box.width * 1000))),
      Math.round(Math.max(0, Math.min(500, (event.clientY - box.top) / box.height * 500)))];
  }
  function begin(event: PointerEvent<SVGSVGElement>) {
    event.preventDefault();
    if (!loaded || busy || active.current || event.button !== 0) return;
    const count = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
    if (count >= MAX_DRAWING_POINTS || strokes.length >= 1000) { setError("This board is full. Download it before clearing space."); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke = { color: eraser ? "#ffffff" : color, width: eraser ? 24 : width, points: [position(event)] };
    active.current = { pointer: event.pointerId, stroke };
    setPreview(stroke); setMessage("");
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (active.current?.pointer !== event.pointerId) return;
    event.preventDefault();
    // Recover if the browser lost the release event outside the window.
    if (event.buttons === 0) { finishStroke(); return; }
    const stroke = active.current.stroke;
    const point = position(event);
    const previous = stroke.points.at(-1)!;
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 2) return;
    if (strokes.reduce((sum, item) => sum + item.points.length, stroke.points.length) >= MAX_DRAWING_POINTS) return;
    active.current.stroke = { ...stroke, points: [...stroke.points, point] };
    setPreview(active.current.stroke);
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (active.current?.pointer !== event.pointerId) return;
    finishStroke();
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const { drawing } = await request("PUT", { strokes, revision }, "drawing");
      setRevision(drawing.revision); setDirty(false); setMessage("Drawing saved for this organization’s admins.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save drawing."); }
    finally { setBusy(false); }
  }
  async function reload() {
    if (dirty && !window.confirm("Discard your unsaved drawing changes and load the latest saved board?")) return;
    setBusy(true); setError("");
    try {
      const { drawing } = await request("GET", undefined, "drawing");
      setStrokes(drawing.strokes); setRevision(drawing.revision); setHistory([]); setDirty(false); setLoaded(true); setMessage("Latest drawing loaded.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load drawing."); }
    finally { setBusy(false); }
  }
  function download() {
    if (!svg.current) return;
    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "1000"); clone.setAttribute("height", "500");
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    const link = document.createElement("a"); link.href = url; link.download = "whiteboard.svg"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const button = "rounded-full border border-[#d8c7ab] bg-white px-3 py-1.5 text-sm disabled:opacity-40";
  const disabled = busy || !loaded || !!preview;
  function strokeElement(stroke: WhiteboardStroke, index: number) {
    return stroke.points.length === 1
      ? <circle key={index} cx={stroke.points[0][0]} cy={stroke.points[0][1]} r={stroke.width / 2} fill={stroke.color} />
      : <polyline key={index} points={stroke.points.map((point) => point.join(",")).join(" ")} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />;
  }
  return <div className={styles.drawing}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className={styles.sectionTitle}>Room to think</h3><p className="text-xs text-[#756656]">Draw with your mouse, finger, or pen. Save before leaving this section.</p></div>
      <span role="status" className="text-xs">{busy ? "Working…" : dirty ? "Unsaved changes" : loaded ? "Saved board" : "Drawing not loaded"}</span></div>
    <div className={`${styles.tools} mb-3 flex flex-wrap items-center gap-2`}>
      <button type="button" className={`${button} ${!eraser ? "ring-2 ring-[#2f7d4f]" : ""}`} aria-pressed={!eraser} onClick={() => setEraser(false)}>Pen</button>
      <button type="button" className={`${button} ${eraser ? "ring-2 ring-[#2f7d4f]" : ""}`} aria-pressed={eraser} onClick={() => setEraser(true)}>Eraser</button>
      <label className="flex items-center gap-1 text-sm">Color<input type="color" aria-label="Pen color" value={color} onChange={(event) => { setColor(event.target.value); setEraser(false); }} className="h-8 w-9" /></label>
      <label className="text-sm">Size <select aria-label="Pen size" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="rounded border bg-white p-1"><option value={2}>Fine</option><option value={4}>Medium</option><option value={8}>Thick</option></select></label>
      <button type="button" className={button} disabled={disabled || !history.length} onClick={() => { setStrokes(history.at(-1)!); setHistory(history.slice(0, -1)); setDirty(true); }}>Undo</button>
      <button type="button" className={button} disabled={disabled || !strokes.length} onClick={() => { if (window.confirm("Clear the drawing? You can undo this before leaving.")) { setHistory([...history.slice(-19), strokes]); setStrokes([]); setDirty(true); } }}>Clear</button>
      <button type="button" className={button} disabled={disabled} onClick={download}>Download</button>
      <button type="button" className={button} disabled={busy || !!preview} onClick={() => void reload()}>Load latest</button>
      <button type="button" className="rounded-full bg-[#241c15] px-4 py-2 text-sm text-white disabled:opacity-40" disabled={disabled || !dirty} onClick={() => void save()}>Save drawing</button>
    </div>
    {error ? <p role="alert" className="mb-3 text-sm text-red-800">{error}</p> : null}
    {message ? <p role="status" className="mb-3 text-sm text-green-800">{message}</p> : null}
    <svg ref={svg} viewBox="0 0 1000 500" role="img" aria-label="Shared freehand drawing board" className={`${styles.surface} block aspect-[2/1] w-full touch-none rounded-xl border border-[#ded3c4] bg-white`} style={{ cursor: eraser ? "cell" : "crosshair" }}
      onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}
      onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <rect width="1000" height="500" fill="#ffffff" />
      {strokes.map(strokeElement)}{preview ? strokeElement(preview, strokes.length) : null}
    </svg>
  </div>;
}
