"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import Image from "next/image";
import type { createStudioScene } from "./studio-scene";
import type { LoginSeason } from "./login-season";
import { CUBE_X, studioFrame } from "./studio-frame";
import framing from "./studio-framing.json";

type StudioScene = Awaited<ReturnType<typeof createStudioScene>>;

export default function LoginScene({
  season,
  phrase,
}: {
  season: LoginSeason;
  phrase: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!root || !frame || !canvas) return;
    let scene: StudioScene | null = null;
    // 로고 프레임(그림자, 문구, 3D 카메라)을 정지 화면과 같은 자리에 둔다.
    const place = () => {
      const rect = root.getBoundingClientRect();
      const box = studioFrame(rect, window.innerWidth < 768);
      Object.assign(frame.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
      scene?.resize(rect, box);
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(root);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      canvas.dataset.ready = "static";
      return () => resize.disconnect();
    }
    const initialization = new AbortController();
    let touchRelease = 0;
    const pointer = (event: PointerEvent) => {
      if (!event.isPrimary || !scene) return;
      const target = event.target as Element | null;
      if (target?.closest(".loginPanel, a, button, input, label")) {
        scene.leave();
        return;
      }
      window.clearTimeout(touchRelease);
      scene.pointer(event.clientX, event.clientY, event.type === "pointerdown");
      if (event.pointerType !== "mouse")
        touchRelease = window.setTimeout(() => scene?.leave(), 900);
    };
    const leave = (event: PointerEvent) => {
      if (!event.relatedTarget) scene?.leave();
    };
    const onReducedChange = () => {
      if (!reduced.matches) return;
      initialization.abort();
      scene?.dispose();
      scene = null;
      canvas.dataset.ready = "static";
    };
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("pointerdown", pointer, { passive: true });
    window.addEventListener("pointerout", leave);
    reduced.addEventListener("change", onReducedChange);
    import("./studio-scene")
      .then((module) =>
        module.createStudioScene(canvas, initialization.signal, season),
      )
      .then((loaded) => {
        if (initialization.signal.aborted) {
          loaded.dispose();
          return;
        }
        scene = loaded;
        place();
      })
      .catch(() => {
        if (!initialization.signal.aborted) canvas.dataset.ready = "static";
      });
    return () => {
      initialization.abort();
      scene?.dispose();
      window.clearTimeout(touchRelease);
      resize.disconnect();
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("pointerdown", pointer);
      window.removeEventListener("pointerout", leave);
      reduced.removeEventListener("change", onReducedChange);
    };
  }, [season]);

  const stills = {
    "--login-bg-ratio": framing.desktop.width / framing.desktop.height,
    "--login-cube-x": CUBE_X,
    "--login-still-desktop": `url("/login-scene/studio/still-${season}-desktop.webp")`,
    "--login-still-mobile": `url("/login-scene/studio/still-${season}-mobile.webp")`,
  } as CSSProperties;
  const cube = {
    "--cube-left": framing.cube.left,
    "--cube-top": framing.cube.top,
    "--cube-width": framing.cube.width,
  } as CSSProperties;

  return (
    <div ref={rootRef} className="loginScene" style={stills} aria-hidden="true">
      <div ref={frameRef} className="studioModelFrame">
        <Image
          className="studioShadow"
          src="/login-scene/studio/shadow.webp"
          alt=""
          width={1800}
          height={1200}
          unoptimized
        />
        {phrase && (
          <span className="studioPhrase" style={cube}>
            {phrase}
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="loginSceneCanvas"
        data-ready="loading"
      />
    </div>
  );
}
