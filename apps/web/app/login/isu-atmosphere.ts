// 단일 산란 대기(레일리, 미, 오존 흡수, 행성 그림자). 거리 단위는 km다.
// CPU 조명 계산(skyRadiance, sunTransmittance)과 하늘 LUT 셰이더(ATMOSPHERE_GLSL)가 같은 상수와 식을 쓴다.
// 한쪽 식을 바꾸면 다른 쪽도 같이 바꾼다.
export type Rgb = [number, number, number];
type Direction = { x: number; y: number; z: number };
type Point = [number, number, number];

const PLANET_RADIUS = 6360;
const ATMOSPHERE_RADIUS = 6420;
const VIEW_HEIGHT = 0.2;
const RAYLEIGH: Rgb = [5.802e-3, 13.558e-3, 33.1e-3];
const RAYLEIGH_HEIGHT = 8;
// 맑은 바다 공기. 미 산란을 표준값의 절반으로 둬 해 쪽 하늘이 하얗게 뿌옇지 않게 한다.
const MIE_SCATTERING = 1.4e-3;
const MIE_EXTINCTION = 1.6e-3;
const MIE_HEIGHT = 1.2;
const MIE_G = 0.9;
const OZONE: Rgb = [0.65e-3, 1.881e-3, 0.085e-3];
export const SUN_INTENSITY = 20;
// 단일 산란만으로는 해가 진 뒤 하늘이 너무 빨리 검어진다. 짙은 청색 밤하늘 바닥값을 더하고,
// 수평선 쪽을 대기광처럼 조금 밝혀 밤에도 수평선이 보이게 한다.
export const NIGHT_SKY: Rgb = [0.0018, 0.005, 0.013];

const VIEWER: Point = [0, PLANET_RADIUS + VIEW_HEIGHT, 0];
const airglow = (up: number) => 1 + 2 * Math.pow(1 - Math.max(up, 0), 6);

function unit(direction: Direction): Point {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return [direction.x / length, direction.y / length, direction.z / length];
}

function raySphere(origin: Point, direction: Point, radius: number) {
  const b =
    origin[0] * direction[0] +
    origin[1] * direction[1] +
    origin[2] * direction[2];
  const c = origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2 - radius * radius;
  const h = b * b - c;
  if (h < 0) return null;
  const root = Math.sqrt(h);
  return [-b - root, -b + root] as const;
}

const along = (origin: Point, direction: Point, distance: number): Point => [
  origin[0] + direction[0] * distance,
  origin[1] + direction[1] * distance,
  origin[2] + direction[2] * distance,
];
const heightOf = (point: Point) => Math.hypot(...point) - PLANET_RADIUS;

function extinction(height: number): Rgb {
  const rayleigh = Math.exp(-height / RAYLEIGH_HEIGHT);
  const mie = MIE_EXTINCTION * Math.exp(-height / MIE_HEIGHT);
  const ozone = Math.max(0, 1 - Math.abs(height - 25) / 15);
  return [0, 1, 2].map(
    (channel) => RAYLEIGH[channel] * rayleigh + mie + OZONE[channel] * ozone,
  ) as Rgb;
}

function transmittance(origin: Point, direction: Point, steps: number): Rgb {
  const ground = raySphere(origin, direction, PLANET_RADIUS);
  if (ground && ground[0] > 0) return [0, 0, 0];
  const top = raySphere(origin, direction, ATMOSPHERE_RADIUS);
  if (!top) return [1, 1, 1];
  const span = top[1] / steps;
  const depth: Rgb = [0, 0, 0];
  for (let step = 0; step < steps; step++) {
    const e = extinction(
      heightOf(along(origin, direction, span * (step + 0.5))),
    );
    for (let channel = 0; channel < 3; channel++)
      depth[channel] += e[channel] * span;
  }
  return depth.map((value) => Math.exp(-value)) as Rgb;
}

export function sunTransmittance(sun: Direction) {
  return transmittance(VIEWER, unit(sun), 16);
}

export function skyRadiance(
  direction: Direction,
  sun: Direction,
  steps = 8,
): Rgb {
  const view = unit(direction);
  const light = unit(sun);
  let far = raySphere(VIEWER, view, ATMOSPHERE_RADIUS)![1];
  const ground = raySphere(VIEWER, view, PLANET_RADIUS);
  if (ground && ground[0] > 0) far = ground[0];
  const span = far / steps;
  const mu = view[0] * light[0] + view[1] * light[1] + view[2] * light[2];
  const rayleighPhase = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const g2 = MIE_G * MIE_G;
  const miePhase =
    ((3 / (8 * Math.PI)) * (1 - g2) * (1 + mu * mu)) /
    ((2 + g2) * Math.pow(1 + g2 - 2 * MIE_G * mu, 1.5));
  const through: Rgb = [1, 1, 1];
  const radiance: Rgb = [0, 0, 0];
  for (let step = 0; step < steps; step++) {
    const point = along(VIEWER, view, span * (step + 0.5));
    const height = heightOf(point);
    const e = extinction(height);
    const sunlight = transmittance(point, light, 4);
    const rayleigh = Math.exp(-height / RAYLEIGH_HEIGHT) * rayleighPhase;
    const mie = MIE_SCATTERING * Math.exp(-height / MIE_HEIGHT) * miePhase;
    for (let channel = 0; channel < 3; channel++) {
      const scattered =
        sunlight[channel] * (RAYLEIGH[channel] * rayleigh + mie);
      const stepThrough = Math.exp(-e[channel] * span);
      radiance[channel] +=
        (through[channel] * (scattered - scattered * stepThrough)) /
        Math.max(e[channel], 1e-7);
      through[channel] *= stepThrough;
    }
  }
  return radiance.map(
    (value, channel) =>
      value * SUN_INTENSITY + NIGHT_SKY[channel] * airglow(view[1]),
  ) as Rgb;
}

export const luminance = (color: Rgb) =>
  0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];

const glslFloat = (value: number) =>
  Number.isInteger(value) ? value.toFixed(1) : String(value);
const glslVec3 = (value: Rgb) => `vec3(${value.map(glslFloat).join(", ")})`;

// 하늘 LUT 전용. 시야 16단계, 햇빛 6단계로 CPU(8, 4단계)보다 촘촘하다.
export const ATMOSPHERE_GLSL = `
const float PLANET_RADIUS = ${glslFloat(PLANET_RADIUS)};
const float ATMOSPHERE_RADIUS = ${glslFloat(ATMOSPHERE_RADIUS)};
const float VIEW_HEIGHT = ${glslFloat(VIEW_HEIGHT)};
const vec3 RAYLEIGH = ${glslVec3(RAYLEIGH)};
const float RAYLEIGH_HEIGHT = ${glslFloat(RAYLEIGH_HEIGHT)};
const float MIE_SCATTERING = ${glslFloat(MIE_SCATTERING)};
const float MIE_EXTINCTION = ${glslFloat(MIE_EXTINCTION)};
const float MIE_HEIGHT = ${glslFloat(MIE_HEIGHT)};
const float MIE_G = ${glslFloat(MIE_G)};
const vec3 OZONE = ${glslVec3(OZONE)};
const float SUN_INTENSITY = ${glslFloat(SUN_INTENSITY)};
const vec3 NIGHT_SKY = ${glslVec3(NIGHT_SKY)};
vec2 atmosphereRaySphere(vec3 origin, vec3 direction, float radius) {
  float b = dot(origin, direction);
  float c = dot(origin, origin) - radius * radius;
  float h = b * b - c;
  if (h < 0.) return vec2(-1.);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
vec3 atmosphereExtinction(float height) {
  return RAYLEIGH * exp(-height / RAYLEIGH_HEIGHT)
    + MIE_EXTINCTION * exp(-height / MIE_HEIGHT)
    + OZONE * max(0., 1. - abs(height - 25.) / 15.);
}
vec3 atmosphereTransmittance(vec3 point, vec3 direction) {
  if (atmosphereRaySphere(point, direction, PLANET_RADIUS).x > 0.) return vec3(0.);
  float span = atmosphereRaySphere(point, direction, ATMOSPHERE_RADIUS).y / 6.;
  vec3 depth = vec3(0.);
  for (int i = 0; i < 6; i++)
    depth += atmosphereExtinction(length(point + direction * span * (float(i) + .5)) - PLANET_RADIUS) * span;
  return exp(-depth);
}
vec3 atmosphereRadiance(vec3 direction, vec3 sun) {
  vec3 origin = vec3(0., PLANET_RADIUS + VIEW_HEIGHT, 0.);
  float far = atmosphereRaySphere(origin, direction, ATMOSPHERE_RADIUS).y;
  float ground = atmosphereRaySphere(origin, direction, PLANET_RADIUS).x;
  if (ground > 0.) far = ground;
  float span = far / 16.;
  float mu = dot(direction, sun);
  float rayleighPhase = .0596831 * (1. + mu * mu);
  float g2 = MIE_G * MIE_G;
  float miePhase = .1193662 * (1. - g2) * (1. + mu * mu) / ((2. + g2) * pow(1. + g2 - 2. * MIE_G * mu, 1.5));
  vec3 through = vec3(1.);
  vec3 light = vec3(0.);
  for (int i = 0; i < 16; i++) {
    vec3 point = origin + direction * span * (float(i) + .5);
    float height = length(point) - PLANET_RADIUS;
    vec3 extinction = atmosphereExtinction(height);
    vec3 scattered = atmosphereTransmittance(point, sun) * (RAYLEIGH * exp(-height / RAYLEIGH_HEIGHT) * rayleighPhase
      + MIE_SCATTERING * exp(-height / MIE_HEIGHT) * miePhase);
    vec3 stepThrough = exp(-extinction * span);
    light += through * (scattered - scattered * stepThrough) / max(extinction, vec3(1e-7));
    through *= stepThrough;
  }
  return light * SUN_INTENSITY + NIGHT_SKY * (1. + 2. * pow(1. - max(direction.y, 0.), 6.));
}
`;
