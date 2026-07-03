// Thin wrapper over @chenglou/pretext — fast, reflow-free text measurement & layout.
// Powers the Lab's narrative text choreography (exact glyph/line geometry for strike/annotate/
// rewrite animation) and the virtualized survivor "evidence wall". Runs in the browser
// (needs Canvas2D + Intl.Segmenter); never call these during SSR/build.
import { prepare, prepareWithSegments, layout, measureNaturalWidth, type LayoutResult } from '@chenglou/pretext';

/** Lay `text` into lines at `maxWidth`px — returns exact per-line/glyph geometry. */
export function layoutText(text: string, font: string, maxWidth: number, lineHeight: number): LayoutResult {
  return layout(prepare(text, font), maxWidth, lineHeight);
}

/** Tightest single-line width (px) the text wants — for shrink-wrap cards. */
export function naturalWidth(text: string, font: string): number {
  return measureNaturalWidth(prepareWithSegments(text, font));
}
