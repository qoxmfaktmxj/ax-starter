// 포인터 근처 블록에 번호와 연결선을 그리는 HUD. 장면 위 2D 캔버스에 그린다.
export type HudPoint = { id: number; x: number; y: number; distance: number };

export function pickHudPoints(points: HudPoint[], limit = 6, reach = 2.6) {
  return points
    .filter((point) => point.distance < reach)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

export function hudLabel(id: number) {
  return String(((id * 37) % 90) + 10);
}

export function drawHud(
  context: CanvasRenderingContext2D,
  points: HudPoint[],
  alpha: number,
  scale: number,
) {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (alpha < 0.01 || points.length === 0) return;
  context.save();
  context.scale(scale, scale);
  context.lineWidth = 1;
  context.shadowBlur = 0;
  context.strokeStyle = `rgba(230, 240, 255, ${0.75 * alpha})`;
  context.font = "700 13px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.beginPath();
  points.forEach((point, index) =>
    index === 0
      ? context.moveTo(point.x, point.y)
      : context.lineTo(point.x, point.y),
  );
  context.stroke();
  for (const point of points) {
    context.beginPath();
    context.moveTo(point.x - 7, point.y);
    context.lineTo(point.x + 7, point.y);
    context.moveTo(point.x, point.y - 7);
    context.lineTo(point.x, point.y + 7);
    context.stroke();
    // 숫자 뒤에 작은 배경을 깔아 밝은 bloom 위에서도 묻히지 않게 한다.
    const label = hudLabel(point.id);
    const width = context.measureText(label).width;
    context.fillStyle = `rgba(0, 10, 30, ${0.55 * alpha})`;
    context.beginPath();
    context.roundRect(point.x - 21, point.y - 17, width + 6, 15, 2);
    context.fill();
    context.fillStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
    context.fillText(label, point.x - 18, point.y - 6);
  }
  context.restore();
}
