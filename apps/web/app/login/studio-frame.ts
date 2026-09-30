import framing from "./studio-framing.json";

export type StudioFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// 계절 큐브 왼쪽 끝이 화면 왼쪽에서 최소 이만큼 떨어지게 한다 (login-scene.css의 16px과 같다).
const CUBE_MARGIN = 16;

/** PC 배경에서 큐브 왼쪽 끝의 가로 위치 (배경 폭 대비 비율). login-scene.css가 같은 값으로 배경을 자른다. */
export const CUBE_X =
  (framing.desktop.frame.x + framing.cube.left * framing.desktop.frame.width) /
  framing.desktop.width;

/** 렌더 이미지(로고 프레임)가 cover로 깔린 로그인 배경 위에서 차지하는 자리. 정지 화면과 3D가 같은 값을 쓴다. */
export function studioFrame(
  root: { width: number; height: number },
  mobile: boolean,
): StudioFrame {
  const layout = mobile ? framing.mobile : framing.desktop;
  const scale = Math.max(
    root.width / layout.width,
    root.height / layout.height,
  );
  const excess = layout.width * scale - root.width;
  // PC는 배경을 33% 지점에서 자르되, 세로로 긴 창(태블릿 등)에서도 큐브가 화면 밖으로 밀리지 않게 이동을 제한한다.
  const offsetX = mobile
    ? excess * 0.5
    : Math.min(
        excess * 0.33,
        Math.max(0, CUBE_X * layout.width * scale - CUBE_MARGIN),
      );
  const offsetY = (layout.height * scale - root.height) / 2;
  return {
    left: layout.frame.x * scale - offsetX,
    top: layout.frame.y * scale - offsetY,
    width: layout.frame.width * scale,
    height: layout.frame.height * scale,
  };
}
