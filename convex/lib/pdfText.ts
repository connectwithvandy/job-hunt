import type { getDocumentProxy } from "unpdf";

type Pdf = Awaited<ReturnType<typeof getDocumentProxy>>;
type Piece = { str: string; x: number; y: number; w: number; h: number };

/**
 * A PDF's text in reading order. Canva and similar tools store lines out of order and put a
 * sidebar beside the main column, so plain extraction mixes the two. This sorts lines by where
 * they sit on the page and reads the main column across every page first, then the sidebar, so
 * a role that runs onto page 2 stays in one piece.
 */
export async function pdfText(pdf: Pdf) {
  const main: string[] = [];
  const side: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const width = page.getViewport({ scale: 1 }).width;
    const pieces: Piece[] = [];
    for (const it of (await page.getTextContent()).items) {
      if (!("str" in it) || !it.str.trim()) continue;
      pieces.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) || 10 });
    }
    const split = columnSplit(pieces, width);
    if (split === null) {
      main.push(lines(pieces));
      continue;
    }
    // The wider column is the main one, whether the sidebar sits left or right.
    const left = pieces.filter((p) => p.x < split);
    const right = pieces.filter((p) => p.x >= split);
    const [wide, narrow] = split > width / 2 ? [left, right] : [right, left];
    main.push(lines(wide));
    side.push(lines(narrow));
  }
  return [...main, ...side].join("\n\n");
}

/** Where a sidebar starts: the x that the fewest lines run across, if a real column of text sits right of it. */
function columnSplit(pieces: Piece[], width: number): number | null {
  const total = pieces.reduce((n, p) => n + p.str.length, 0);
  let best: { x: number; crossing: number } | null = null;
  for (let x = Math.round(width * 0.25); x <= width * 0.8; x++) {
    const right = pieces.filter((p) => p.x >= x);
    // Short right-aligned bits like dates aren't a column; a sidebar holds a good share of the page's text.
    if (right.reduce((n, p) => n + p.str.length, 0) < total * 0.15) continue;
    const crossing = pieces.filter((p) => p.x < x && p.x + p.w > x).length;
    // Leftmost wins a tie, so a gap inside the sidebar (like before a year) isn't picked.
    if (!best || crossing < best.crossing) best = { x, crossing };
  }
  if (!best) return null;
  const rows = new Set(pieces.map((p) => Math.round(p.y))).size;
  // A single-column page has most of its lines running across any x.
  return best.crossing <= rows * 0.05 ? best.x : null;
}

/** Pieces as lines, top to bottom; pieces on the same line join left to right. */
function lines(pieces: Piece[]) {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Piece[][] = [];
  for (const p of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - p.y) < Math.min(row[0].h, p.h) * 0.5) row.push(p);
    else rows.push([p]);
  }
  return rows
    .map((row) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str.trim())
        .join(" "),
    )
    .join("\n");
}
