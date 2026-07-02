import {
  prepareRichInline,
  walkRichInlineLineRanges,
  materializeRichInlineLineRange,
  type RichInlineItem,
  type RichInlineLineRange,
} from '@chenglou/pretext/rich-inline';

/**
 * Variable-typographic text on canvas, via @chenglou/pretext. Every glyph is its own rich-inline
 * item with an independent font (size + weight), and pretext lays them out with accurate
 * proportional widths — so a "breathing" size/weight wave across the characters stays perfectly
 * kerned instead of jittering. This is the sculptural typographic aesthetic (chenglou's
 * variable-typographic-ascii), applied here to real market language.
 */

export interface WaveTextOpts {
  size: number; // base font size (px)
  family?: string;
  t: number; // time (ms) driving the wave
  color: string;
  speed?: number; // wave temporal speed
  wave?: number; // phase advance per glyph
  sizeAmp?: number; // fractional size amplitude (0..1)
  baseWeight?: number;
  weightAmp?: number;
  maxWidth?: number;
  lineHeight?: number;
  align?: 'left' | 'center';
  alpha?: number;
}

const WEIGHTS = [300, 400, 500, 600, 700, 900];
const nearestWeight = (w: number) => WEIGHTS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));

export function drawWaveText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  o: WaveTextOpts
): { width: number; height: number } {
  const family = o.family ?? 'Georgia, "Times New Roman", serif';
  const speed = o.speed ?? 0.0016;
  const wave = o.wave ?? 0.5;
  const sizeAmp = o.sizeAmp ?? 0.16;
  const baseWeight = o.baseWeight ?? 500;
  const weightAmp = o.weightAmp ?? 320;

  const chars = [...text];
  const items: RichInlineItem[] = chars.map((ch, i) => {
    const phase = o.t * speed + i * wave;
    const size = o.size * (1 + sizeAmp * Math.sin(phase));
    const weight = nearestWeight(baseWeight + weightAmp * Math.sin(phase + 0.7));
    return { text: ch, font: `${weight} ${size.toFixed(1)}px ${family}` };
  });

  const prepared = prepareRichInline(items);
  const maxWidth = o.maxWidth ?? 1e6;
  const lineHeight = o.lineHeight ?? o.size * 1.4;
  const ranges: RichInlineLineRange[] = [];
  walkRichInlineLineRanges(prepared, maxWidth, (lr) => ranges.push(lr));

  const prevAlpha = ctx.globalAlpha;
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = o.color;

  let maxW = 0;
  let ly = y;
  for (const lr of ranges) {
    const line = materializeRichInlineLineRange(prepared, lr);
    let lx = x - (o.align === 'center' ? line.width / 2 : 0);
    for (const frag of line.fragments) {
      lx += frag.gapBefore;
      ctx.font = items[frag.itemIndex].font;
      ctx.fillText(frag.text, lx, ly);
      lx += frag.occupiedWidth;
    }
    maxW = Math.max(maxW, line.width);
    ly += lineHeight;
  }
  ctx.globalAlpha = prevAlpha;
  return { width: maxW, height: ly - y };
}
