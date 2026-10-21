// SignaturePad.jsx — the box where a parent or guardian (or an adult candidate) draws their
// signature on step 2 of the Black Belt family form (Form 5, 6, 9).
// Why it exists: contract 0016-B1 §4.4. This is a COPY of Color Belt's src/register/SignaturePad.jsx
// (same drawing code), kept separate on purpose so Black Belt work can never change Color Belt's
// form. Only its words (from ./text.js — the box is named "Signature, draw with finger or mouse")
// and its CSS class names (bbf-…, in form.css) differ.
//
// The drawing is turned into a PNG picture ("data URL" — the picture written out as text,
// starting "data:image/png;base64,") only when the family taps Send; it lives only in this
// canvas and in that one request (never stored or logged).
//
// Size limits: the canvas (the drawing surface) is at most 600×200 pixels, so the picture stays
// small; the page refuses to send a picture over 70 000 characters (FormApp asks to sign more
// simply).
//
// How drawing works: "pointer events" cover mouse, finger and pen alike. Each stroke is kept as
// a list of points (in CSS pixels), so the drawing can be redrawn if the box changes size
// (e.g. the phone is turned) — resizing a canvas wipes it.
//
// Not usable with a keyboard: a recorded exception — the hint says "Can't sign here? Please sign
// at the front desk."
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import * as T from './text.js';

const MAX_WIDTH = 600;
const MAX_HEIGHT = 200;

const SignaturePad = forwardRef(function SignaturePad({ invalid, onChange, describedBy }, ref) {
  const canvasRef = useRef(null);
  const strokes = useRef([]); // [[{x,y}, …], …] in CSS pixels
  const drawing = useRef(null); // the stroke being drawn right now
  const scale = useRef(1); // canvas pixels per CSS pixel

  // Draws every stored stroke again (after a resize or Clear).
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale.current, 0, 0, scale.current, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f1f1f';
    for (const stroke of strokes.current) {
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      // A single tap draws a dot: a line to (almost) the same point.
      if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }, []);

  // Fit the canvas to its box: sharp on phones (more pixels per CSS pixel), but never more
  // than 600×200 canvas pixels.
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    scale.current = Math.min(dpr, MAX_WIDTH / box.width, MAX_HEIGHT / box.height);
    canvas.width = Math.max(1, Math.floor(box.width * scale.current));
    canvas.height = Math.max(1, Math.floor(box.height * scale.current));
    redraw();
  }, [redraw]);

  useEffect(() => {
    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [fit]);

  // The point under the pointer, in CSS pixels inside the canvas.
  const pointOf = (event) => {
    const box = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return; // only the main button
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId); // keep getting moves outside the box
    drawing.current = [pointOf(event)];
    strokes.current.push(drawing.current);
    redraw();
  };
  const onPointerMove = (event) => {
    if (!drawing.current) return;
    event.preventDefault();
    drawing.current.push(pointOf(event));
    redraw();
  };
  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = null;
    onChange?.(strokes.current.length > 0);
  };

  const clear = () => {
    strokes.current = [];
    drawing.current = null;
    redraw();
    onChange?.(false);
  };

  // What FormApp can ask: is anything drawn? and the PNG picture as text.
  useImperativeHandle(ref, () => ({
    isEmpty: () => strokes.current.length === 0,
    toDataUrl: () => canvasRef.current.toDataURL('image/png'),
    clear,
  }));

  return (
    <div className={`bbf-sigpad${invalid ? ' is-invalid' : ''}`}>
      <canvas
        ref={canvasRef}
        className="bbf-sigpad__canvas"
        role="img"
        aria-label={T.SIGNATURE_BOX}
        aria-describedby={describedBy}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onLostPointerCapture={endStroke}
      />
      <div className="bbf-sigpad__line" aria-hidden="true" />
      <button type="button" className="bbf-link bbf-sigpad__clear" onClick={clear}>
        {T.CLEAR}
      </button>
    </div>
  );
});

export default SignaturePad;
