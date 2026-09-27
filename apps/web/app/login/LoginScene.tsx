"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { createIsuWaterScene } from "./isu-water-scene";

type IsuScene = Awaited<ReturnType<typeof createIsuWaterScene>>;
type ReadyState = "loading" | "false" | "static";

export type LoginSceneHandle = {
  calm(on: boolean): void;
  shake(): void;
  share(): Promise<void>;
};

// 랜딩 HeroScene.tsx의 수명 주기를 가져왔다. 모션 감소 설정이면 WebGL을 시작하지 않고 정지 이미지를 쓴다.
export default function LoginScene({ ref }: { ref?: Ref<LoginSceneHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<IsuScene | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      calm: (on) => sceneRef.current?.calm(on),
      shake: () => sceneRef.current?.shake(),
      share: () => sceneRef.current?.share() ?? Promise.resolve(),
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setState = (ready: ReadyState) => {
      canvas.dataset.ready = ready;
      canvas.dataset.preview = "false";
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      setState("static");
      return;
    }
    setState("loading");
    const initialization = new AbortController();
    let disposed = false;
    let lost = false;
    let frame = 0;
    let time = 0;
    let previous = 0;
    let assetsReady = false;
    let touchRelease = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const release = (ready: "false" | "static") => {
      stop();
      window.clearTimeout(touchRelease);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setState(ready);
    };
    const draw = (delta: number, wallDelta = delta) => {
      const scene = sceneRef.current;
      if (!scene) return false;
      try {
        scene.render(time, delta, assetsReady, wallDelta);
        return true;
      } catch {
        release("false");
        return false;
      }
    };
    const tick = (now: number) => {
      frame = 0;
      if (!sceneRef.current || !assetsReady || lost || document.hidden) return;
      const wallDelta = previous
        ? Math.max(0, (now - previous) / 1000)
        : 1 / 60;
      const delta = Math.min(wallDelta, 0.06);
      previous = now;
      time += delta;
      if (draw(delta, wallDelta)) frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      stop();
      previous = 0;
      if (!sceneRef.current || lost || document.hidden) return;
      if (draw(0) && assetsReady) frame = requestAnimationFrame(tick);
    };
    const onPointer = (event: PointerEvent) => {
      const scene = sceneRef.current;
      if (!event.isPrimary || !scene || !assetsReady || lost) return;
      window.clearTimeout(touchRelease);
      const target = event.target as Element | null;
      if (target?.closest?.(".loginPanel, a, button, input")) {
        scene.pointerLeave();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      scene.pointer(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
      if (event.type === "pointerdown" && event.pointerType !== "mouse")
        draw(0.06, 0);
    };
    const leave = (event: PointerEvent) => {
      if (
        event.type === "pointerout" &&
        (event.relatedTarget || event.pointerType !== "mouse")
      )
        return;
      if (event.type === "pointerup" && event.pointerType === "mouse") return;
      window.clearTimeout(touchRelease);
      if (event.pointerType === "mouse") sceneRef.current?.pointerLeave();
      else
        touchRelease = window.setTimeout(
          () => sceneRef.current?.pointerLeave(),
          900,
        );
    };
    const onReducedChange = () => {
      if (reduced.matches) release("static");
    };
    const lostContext = (event: Event) => {
      event.preventDefault();
      lost = true;
      stop();
      sceneRef.current?.pointerLeave();
      setState("false");
    };
    const restoredContext = () => {
      lost = false;
      sync();
    };
    const resizeObserver = new ResizeObserver(() => {
      sceneRef.current?.resize();
      sync();
    });
    resizeObserver.observe(canvas);
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerout", leave, { passive: true });
    window.addEventListener("pointerup", leave, { passive: true });
    window.addEventListener("pointercancel", leave, { passive: true });
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", onReducedChange);
    canvas.addEventListener("webglcontextlost", lostContext);
    canvas.addEventListener("webglcontextrestored", restoredContext);
    import("./isu-water-scene")
      .then((module) =>
        module.createIsuWaterScene(canvas, initialization.signal),
      )
      .then((result) => {
        if (disposed) {
          result.dispose();
          return;
        }
        sceneRef.current = result;
        result.texturesReady
          .then((loaded) => {
            if (disposed || sceneRef.current !== result) return;
            if (!loaded) {
              release("false");
              return;
            }
            assetsReady = true;
            sync();
          })
          .catch(() => {
            if (!disposed && sceneRef.current === result) release("false");
          });
        sync();
      })
      .catch(() => {
        if (!disposed) setState("false");
      });
    return () => {
      disposed = true;
      initialization.abort();
      stop();
      window.clearTimeout(touchRelease);
      resizeObserver.disconnect();
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerout", leave);
      window.removeEventListener("pointerup", leave);
      window.removeEventListener("pointercancel", leave);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", onReducedChange);
      canvas.removeEventListener("webglcontextlost", lostContext);
      canvas.removeEventListener("webglcontextrestored", restoredContext);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setState("false");
    };
  }, []);

  return (
    <div className="loginScene" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="loginSceneCanvas"
        data-ready="loading"
        data-preview="false"
      />
    </div>
  );
}
