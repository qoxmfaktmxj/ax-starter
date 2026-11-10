// 브라우저에서 실제 텍스트와 불투명 배경색을 sRGB로 환산한다.
export function textContrast(element: Element) {
  const context = document.createElement("canvas").getContext("2d")!;
  function luminance(color: string) {
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const rgb = Array.from(context.getImageData(0, 0, 1, 1).data)
      .slice(0, 3)
      .map((channel) => {
        const v = channel / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }
  const style = getComputedStyle(element);
  const a = luminance(style.color);
  const b = luminance(style.backgroundColor);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
