// SignaturePad.jsx — the box a parent signs in (Waiver block; mockup screen 8).
// Why it exists: the waiver needs a drawn signature. Written by hand with a <canvas> and
// "pointer events" (one set of browser events for mouse, finger and pen), so the app needs no
// extra package. The picture is sent as a small PNG "data URL" (text that IS the picture);
// the database accepts 200 to 70 000 characters, so it is saved at normal size (not the
// sharper screen copy) to stay small.
//
// Props:
//   value     the current PNG data URL, or null (nothing signed)
//   onChange  (dataUrl | null) => void — after each stroke, and null after Clear
//   disabled  true while sending
//   labelId   id of the visible label (the canvas is named by it)
import { useEffect, useRef } from 'react';
import * as T from './text.js';

const HEIGHT = 120; // px on screen
const MAX_EXPORT_WIDTH = 480; // px in the saved picture

export default function SignaturePad({ value, onChange, disabled = false, labelId, hintId }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(null); // { x, y } of the last point while a stroke is on
  const strokesRef = useRef([]); // every stroke as a list of points (to redraw after a resize)

  // Draws every stroke again (after a resize or Clear).
  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f1f1f';
    for (const stroke of strokesRef.current) {
      ctx.beginPath();
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y);
      ctx.stroke();
    }
  }

  // The canvas matches its box (sharp on high-density screens); redraw when the box changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(HEIGHT * ratio);
      redraw();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // A value from outside that is null (e.g. "Fill in another") clears the pad.
  useEffect(() => {
    if (value === null && strokesRef.current.length > 0) {
      strokesRef.current = [];
      redraw();
    }
  }, [value]);

  const point = (e) => {
    const box = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  function exportPicture() {
    const canvas = canvasRef.current;
    const width = Math.min(canvas.clientWidth, MAX_EXPORT_WIDTH);
    const scale = width / canvas.clientWidth;
    const out = document.createElement('canvas');
    out.width = Math.round(width);
    out.height = Math.round(HEIGHT * scale);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  function down(e) {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    const p = point(e);
    drawingRef.current = p;
    strokesRef.current.push([p]);
    redraw();
  }
  function move(e) {
    if (!drawingRef.current) return;
    const p = point(e);
    strokesRef.current[strokesRef.current.length - 1].push(p);
    drawingRef.current = p;
    redraw();
  }
  function up() {
    if (!drawingRef.current) return;
    drawingRef.current = null;
    onChange(exportPicture());
  }
  function clear() {
    strokesRef.current = [];
    redraw();
    onChange(null);
  }

  return (
    <div className="fsig">
      <canvas
        ref={canvasRef}
        className="fsig-canvas"
        role="img"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        style={{ height: HEIGHT }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <button type="button" className="link-button fsig-clear" disabled={disabled || !value} onClick={clear}>
        {T.CLEAR}
      </button>
    </div>
  );
}
