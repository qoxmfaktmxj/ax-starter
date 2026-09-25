// 로그인 폼과 3D 장면을 잇는 움직임 상태. 렌더러와 분리해 경과 시간만으로 계산한다.
export const SHAKE_SECONDS = 0.3;
export const SHARE_SECONDS = 1.2;
const CALM_RATE = 4;
const SHAKE_FREQUENCY = 14;

export type MotionFrame = { calm: number; shake: number; share: number };

export function createLoginMotion() {
  let calmTarget = 0;
  let calm = 0;
  let shakeLeft = 0;
  let shareTime = -1;
  return {
    calm(on: boolean) {
      calmTarget = on ? 1 : 0;
    },
    shake() {
      shakeLeft = SHAKE_SECONDS;
    },
    share() {
      if (shareTime < 0) shareTime = 0;
    },
    update(delta: number): MotionFrame {
      calm += (calmTarget - calm) * (1 - Math.exp(-delta * CALM_RATE));
      shakeLeft = Math.max(0, shakeLeft - delta);
      if (shareTime >= 0) shareTime += delta;
      const elapsed = SHAKE_SECONDS - shakeLeft;
      const shake =
        shakeLeft > 0
          ? Math.sin(elapsed * Math.PI * 2 * SHAKE_FREQUENCY) *
            (shakeLeft / SHAKE_SECONDS)
          : 0;
      return {
        calm,
        shake,
        share: shareTime < 0 ? 0 : Math.min(1, shareTime / SHARE_SECONDS),
      };
    },
  };
}

export type LoginMotion = ReturnType<typeof createLoginMotion>;

// 점 블록에서 퍼지는 빛의 세기. 빛이 지나간 블록은 켜진 채로 남는다.
export function shareIntensity(
  progress: number,
  distance: number,
  maxDistance: number,
) {
  const front = progress * (maxDistance + 1);
  return Math.min(1, Math.max(0, front - distance));
}

// 맨 아래 단 블록은 바닥에 붙어 있으므로 절반만 움직인다.
export function courseFactor(course: number) {
  return course === 0 ? 0.5 : 1;
}

// 등장 때 블록 하나가 날아와 앉는 곡선. delay 뒤 LANDING_SPAN 동안 0에서 1로 가며 끝에서 살짝 튄다.
export const LANDING_SPAN = 0.45;

export function landing(progress: number, delay: number) {
  const t = Math.min(1, Math.max(0, (progress - delay) / LANDING_SPAN));
  if (t === 0) return 0;
  const overshoot = 1.70158;
  return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}
