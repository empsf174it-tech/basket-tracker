import { toPx, visible } from './geometry';
import { SKELETON_EDGES, sideIndices } from './landmarks';
import type { JointAngles, Pose, Side } from './types';

const DIM = 'rgba(255,255,255,0.55)';
const ACCENT = '#ff8a1f';

/** Draws the skeleton and angle labels. The canvas is assumed to match the video's pixel size. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  pose: Pose | null,
  side: Side,
  angles: JointAngles,
  mirrored: boolean,
): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!pose) return;

  const s = sideIndices(side);
  const active = new Set([s.shoulder, s.elbow, s.wrist, s.hip, s.knee, s.ankle]);
  const lw = Math.max(2, w / 180);

  ctx.lineCap = 'round';
  for (const [a, b] of SKELETON_EDGES) {
    const la = pose[a];
    const lb = pose[b];
    if (!visible(la) || !visible(lb)) continue;
    const pa = toPx(la, w, h);
    const pb = toPx(lb, w, h);
    const hot = active.has(a) && active.has(b);
    ctx.strokeStyle = hot ? ACCENT : DIM;
    ctx.lineWidth = hot ? lw * 1.6 : lw;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  for (let i = 11; i < pose.length; i++) {
    const lm = pose[i];
    if (!visible(lm)) continue;
    const p = toPx(lm, w, h);
    ctx.fillStyle = active.has(i) ? ACCENT : '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, lw * (active.has(i) ? 1.8 : 1.2), 0, Math.PI * 2);
    ctx.fill();
  }

  const fontPx = Math.round(w / 22);
  const label = (idx: number, value: number | null, toRight: boolean) => {
    const lm = pose[idx];
    if (value === null || !visible(lm)) return;
    const p = toPx(lm, w, h);
    const text = `${Math.round(value)}°`;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (mirrored) ctx.scale(-1, 1); // keep text readable when the canvas is CSS-mirrored
    ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const x = toRight ? fontPx * 0.6 : -tw - fontPx * 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 4, -fontPx * 0.6, tw + 8, fontPx * 1.2);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, 0);
    ctx.restore();
  };
  label(s.elbow, angles.elbow, true);
  label(s.knee, angles.knee, true);
  label(s.hip, angles.hip, false);
}
