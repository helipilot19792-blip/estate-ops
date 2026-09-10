"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import styles from "./whiteboard.module.css";
import { isValidDrawing, MAX_DRAWING_POINTS, type WhiteboardStroke } from "@/lib/whiteboard-drawing";

type GalleryItem = { preview?: WhiteboardStroke[]; id: string; title: string; revision: number; updated_at: string | null };
type Drawing = { id?: string; title?: string; strokes: WhiteboardStroke[]; revision: number; updated_at: string | null };
type RequestBoard = (method?: string, body?: object, resource?: string) => Promise<{ drawing?: Drawing; drawings?: GalleryItem[]; deletedId?: string }>;

function DrawingThumbnail({ item }: { item: GalleryItem }) {
  return <div className="mb-3 aspect-[2/1] w-full overflow-hidden rounded-md border border-[#d8e0de] bg-white">
    <svg viewBox="0 0 1000 500" role="img" aria-label={`Preview of ${item.title}`} className="block h-full w-full">
      <rect width="1000" height="500" fill="#ffffff" />
      {(item.preview ?? []).map((stroke, index) => stroke.points.length === 1
        ? <circle key={index} cx={stroke.points[0][0]} cy={stroke.points[0][1]} r={stroke.width / 2} fill={stroke.color} />
        : <polyline key={index} points={stroke.points.map((point) => point.join(",")).join(" ")} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  </div>;
}
export default function WhiteboardCanvas({ request, storageKey, onDirtyChange }: { request: RequestBoard; storageKey?: string; onDirtyChange: (dirty: boolean) => void }) {
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
  const [mode, setMode] = useState<"shared" | "new" | "saved">("shared");
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [name, setName] = useState("Shared board");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryError, setGalleryError] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const refreshGallery = useCallback(async () => {
    try {
      const result = await request("GET", undefined, "gallery");
      setGallery(result.drawings ?? []); setGalleryError("");
    } catch (err) { setGalleryError(err instanceof Error ? err.message : "Could not load saved drawings."); }
  }, [request]);
  useEffect(() => { void refreshGallery(); }, [refreshGallery]);

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
    let last: { strokes: WhiteboardStroke[]; revision: number; mode: "shared" | "new" | "saved"; drawingId: string | null; name: string; dirty: boolean } | null = null;
    try {
      const saved = storageKey ? JSON.parse(window.sessionStorage.getItem(storageKey) || "null") : null;
      if (saved && isValidDrawing(saved.strokes) && Number.isSafeInteger(saved.revision) && saved.revision >= 0 &&
        ["shared", "new", "saved"].includes(saved.mode) && typeof saved.name === "string" && typeof saved.dirty === "boolean" &&
        (saved.drawingId === null || typeof saved.drawingId === "string")) last = saved;
    } catch { /* Storage may be disabled or contain an outdated draft. */ }
    if (last && (last.dirty || last.mode === "new")) {
      setStrokes(last.strokes); setRevision(last.revision); setMode(last.mode); setDrawingId(last.drawingId);
      setName(last.name); setDirty(last.dirty); setLoaded(true);
      setMessage(last.dirty ? "Restored your unsaved drawing from this tab. Save to share it with your organization." : "Restored your blank canvas.");
      return () => { cancelled = true; };
    }
    const id = last?.mode === "saved" ? last.drawingId : null;
    request("GET", undefined, id ? `gallery/${id}` : "drawing").then(({ drawing }) => {
      if (cancelled) return;
      if (!drawing) throw new Error("Could not load drawing.");
      setStrokes(drawing.strokes); setRevision(drawing.revision); setLoaded(true);
      setDrawingId(id); setMode(id ? "saved" : "shared"); setName(drawing.title || "Shared board");
    }).catch((err) => {
      if (cancelled) return;
      // Keep the last canvas if its saved version was removed or is temporarily
      // unavailable. Saving as new remains possible without changing other work.
      if (last) {
        setStrokes(last.strokes); setRevision(0); setMode("new"); setDrawingId(null); setName(last.name); setDirty(true); setLoaded(true);
      }
      setError(err instanceof Error ? err.message : "Could not load drawing.");
    });
    return () => { cancelled = true; };
  }, [request, storageKey]);

  useEffect(() => {
    if (!loaded || !storageKey) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ strokes, revision, mode, drawingId, name, dirty }));
    } catch { setError("This browser could not keep a refresh recovery copy. Save your drawing before refreshing."); }
  }, [loaded, storageKey, strokes, revision, mode, drawingId, name, dirty]);

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
  async function save(asNew = false) {
    setBusy(true); setError("");
    try {
      const creating = asNew || mode === "new";
      const resource = creating || mode === "saved" ? "gallery" : "drawing";
      const { drawing } = await request(creating ? "POST" : "PUT", {
        strokes, revision, title: name.trim(), ...(drawingId ? { id: drawingId } : {}),
      }, resource);
      if (!drawing) throw new Error("Could not save drawing.");
      if (drawing.id) { setDrawingId(drawing.id); setMode("saved"); setName(drawing.title || name); }
      setRevision(drawing.revision); setDirty(false); setMessage("Drawing saved for this organization’s admins.");
      void refreshGallery();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save drawing."); }
    finally { setBusy(false); }
  }
  async function openDrawing(id: string | null) {
    if (dirty && !window.confirm("Discard your unsaved changes and open this drawing? Save your work first to keep it.")) return;
    setBusy(true); setError("");
    try {
      const { drawing } = await request("GET", undefined, id ? `gallery/${id}` : "drawing");
      if (!drawing) throw new Error("Could not load drawing.");
      setStrokes(drawing.strokes); setRevision(drawing.revision); setHistory([]); setDirty(false); setLoaded(true);
      setDrawingId(id); setMode(id ? "saved" : "shared"); setName(drawing.title || "Shared board");
      setMessage("Drawing opened.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load drawing."); }
    finally { setBusy(false); }
  }
  function newDrawing() {
    if (dirty && !window.confirm("Start a new drawing and discard unsaved changes? Saved drawings will stay in the gallery.")) return;
    setStrokes([]); setHistory([]); setRevision(0); setDrawingId(null); setMode("new"); setName("");
    setDirty(false); setLoaded(true); setMessage("Blank canvas ready. Give it a name and save when you’re ready."); setError("");
  }
  async function deleteDrawing(item: GalleryItem) {
    const discard = item.id === drawingId && dirty ? " Your unsaved changes to this drawing will also be discarded." : "";
    if (!window.confirm(`Permanently delete “${item.title}” for all admins in this organization? This cannot be undone.${discard}`)) return;
    setBusy(true); setError("");
    try {
      await request("DELETE", { id: item.id, revision: item.revision }, "gallery");
      setGallery((items) => items.filter((entry) => entry.id !== item.id));
      if (item.id === drawingId) {
        setStrokes([]); setHistory([]); setRevision(0); setDrawingId(null); setMode("new"); setName(""); setDirty(false);
      }
      setMessage("Saved drawing deleted.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete drawing."); void refreshGallery(); }
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
      <div className="flex items-center gap-3">
        <span role="status" className="text-xs">{busy ? "Working…" : dirty ? "Unsaved changes" : loaded ? "Saved board" : "Drawing not loaded"}</span>
        <button type="button" className={button} aria-expanded={!minimized} aria-controls="whiteboard-drawing-space"
          onClick={() => { finishStroke(); setMinimized((value) => !value); }}>{minimized ? "Expand drawing" : "Minimize drawing"}</button>
      </div></div>
    <div id="whiteboard-drawing-space" hidden={minimized}>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm">Drawing name
        <input value={name} maxLength={120} disabled={busy || !!preview} placeholder="e.g. Cabin garden plan"
          onChange={(event) => { setName(event.target.value); setDirty(true); }} className="mt-1 block w-full rounded-lg border border-[#cbd5d0] bg-white px-3 py-2" />
      </label>
      <button type="button" className={button} disabled={busy || !!preview} onClick={newDrawing}>New drawing</button>
      <button type="button" className={button} disabled={disabled || !name.trim()} onClick={() => void save(true)}>{mode === "saved" ? "Save a copy" : "Save as new"}</button>
    </div>
    <div className={`${styles.tools} mb-3 flex flex-wrap items-center gap-2`}>
      <button type="button" className={`${button} ${!eraser ? "ring-2 ring-[#2f7d4f]" : ""}`} aria-pressed={!eraser} onClick={() => setEraser(false)}>Pen</button>
      <button type="button" className={`${button} ${eraser ? "ring-2 ring-[#2f7d4f]" : ""}`} aria-pressed={eraser} onClick={() => setEraser(true)}>Eraser</button>
      <label className="flex items-center gap-1 text-sm">Color<input type="color" aria-label="Pen color" value={color} onChange={(event) => { setColor(event.target.value); setEraser(false); }} className="h-8 w-9" /></label>
      <label className="text-sm">Size <select aria-label="Pen size" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="rounded border bg-white p-1"><option value={2}>Fine</option><option value={4}>Medium</option><option value={8}>Thick</option></select></label>
      <button type="button" className={button} disabled={disabled || !history.length} onClick={() => { setStrokes(history.at(-1)!); setHistory(history.slice(0, -1)); setDirty(true); }}>Undo</button>
      <button type="button" className={button} disabled={disabled || !strokes.length} onClick={() => { if (window.confirm("Clear the drawing? You can undo this before leaving.")) { setHistory([...history.slice(-19), strokes]); setStrokes([]); setDirty(true); } }}>Clear</button>
      <button type="button" className={button} disabled={disabled} onClick={download}>Download</button>
      <button type="button" className={button} disabled={busy || !!preview || mode === "new"} onClick={() => void openDrawing(drawingId)}>Load latest</button>
      <button type="button" className="rounded-full bg-[#241c15] px-4 py-2 text-sm text-white disabled:opacity-40" disabled={disabled || !dirty || (mode !== "shared" && !name.trim())} onClick={() => void save()}>{mode === "saved" ? "Save changes" : mode === "new" ? "Save drawing" : "Save shared board"}</button>
    </div>
    {error ? <p role="alert" className="mb-3 text-sm text-red-800">{error}</p> : null}
    {message ? <p role="status" className="mb-3 text-sm text-green-800">{message}</p> : null}
    <svg ref={svg} viewBox="0 0 1000 500" role="img" aria-label="Shared freehand drawing board" className={`${styles.surface} block aspect-[2/1] w-full touch-none rounded-xl border border-[#ded3c4] bg-white`} style={{ cursor: eraser ? "cell" : "crosshair" }}
      onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}
      onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <rect width="1000" height="500" fill="#ffffff" />
      {strokes.map(strokeElement)}{preview ? strokeElement(preview, strokes.length) : null}
    </svg>
    <details onToggle={(event) => setGalleryOpen(event.currentTarget.open)} className="mt-5 rounded-xl border border-[#d8e0de] bg-[#f8faf8] p-4">
      <summary className="cursor-pointer font-semibold">Saved drawings ({gallery.length})</summary>
      <div className="my-3 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy || !!preview} onClick={() => void refreshGallery()}>Refresh gallery</button>
        <button type="button" className={button} disabled={busy || !!preview} onClick={() => void openDrawing(null)}>Open shared board</button>
      </div>
      {galleryError ? <p role="alert" className="mb-3 text-sm text-red-800">{galleryError}</p> : null}
      {!gallery.length && !galleryError ? <p className="text-sm text-[#63716c]">Use Save as new to keep a named drawing here, then start a new one.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {gallery.map((item) => <li key={item.id} className="rounded-lg border border-[#d8e0de] bg-white p-3">
          {galleryOpen ? <DrawingThumbnail key={`${item.id}:${item.revision}`} item={item} /> : null}
          <div className="break-words font-semibold">{item.title}{drawingId === item.id ? " · Open" : ""}</div>
          {item.updated_at ? <p className="mt-1 text-xs text-[#63716c]">Saved {new Date(item.updated_at).toLocaleString()}</p> : null}
          <div className="mt-3 flex gap-2"><button type="button" className={button} disabled={busy || !!preview} onClick={() => void openDrawing(item.id)}>Open</button>
            <button type="button" className={`${button} text-red-800`} disabled={busy || !!preview} onClick={() => void deleteDrawing(item)}>Delete</button></div>
        </li>)}
      </ul>
    </details>
    </div>
  </div>;
}
