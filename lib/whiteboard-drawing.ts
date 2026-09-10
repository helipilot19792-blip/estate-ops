export type WhiteboardStroke = {
  color: string;
  width: number;
  points: Array<[number, number]>;
};

export const MAX_DRAWING_POINTS = 20000;
// Gallery previews retain stroke order (including eraser marks) and endpoints,
// but don't transfer all the editor's pointer samples for every saved drawing.
export function drawingPreview(strokes: WhiteboardStroke[]): WhiteboardStroke[] {
  const count = strokes.reduce((total, stroke) => total + stroke.points.length, 0);
  const stride = Math.max(1, Math.ceil(count / 2000));
  return strokes.map((stroke) => ({ ...stroke,
    points: stroke.points.filter((_, index) => index === 0 || index === stroke.points.length - 1 || index % stride === 0),
  }));
}
export function isValidDrawing(value: unknown): value is WhiteboardStroke[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  let count = 0;
  return value.every((stroke) => {
    if (!stroke || typeof stroke !== "object" || !/^#[0-9a-f]{6}$/i.test(stroke.color) ||
      !Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 40 ||
      !Array.isArray(stroke.points) || !stroke.points.length) return false;
    count += stroke.points.length;
    return count <= MAX_DRAWING_POINTS && stroke.points.every((point: unknown) =>
      Array.isArray(point) && point.length === 2 &&
      typeof point[0] === "number" && Number.isFinite(point[0]) && point[0] >= 0 && point[0] <= 1000 &&
      typeof point[1] === "number" && Number.isFinite(point[1]) && point[1] >= 0 && point[1] <= 500
    );
  });
}
