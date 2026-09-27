"use client";

import { type PointerEvent } from "react";

const LINES = [
  { text: "Challenge the Future", className: "loginSloganChallenge" },
  { text: "Share the Future", className: "loginSloganShare" },
] as const;

function positionSheen(event: PointerEvent<HTMLSpanElement>) {
  const line = event.currentTarget;
  const rect = line.getBoundingClientRect();
  line.style.setProperty("--slogan-sheen-x", `${event.clientX - rect.left}px`);
  line.style.setProperty("--slogan-sheen-y", `${event.clientY - rect.top}px`);
}

export default function LoginSlogan() {
  return (
    <section className="loginBrand" aria-label="ISU 슬로건">
      <p className="loginSlogan">
        {LINES.map((line) => (
          <span className={line.className} key={line.text}>
            <span className="loginSloganAccessible">{line.text}</span>
            <span
              className="loginSloganLetters"
              aria-hidden="true"
              data-text={line.text}
              onPointerMove={positionSheen}
            >
              {line.text}
            </span>
          </span>
        ))}
      </p>
    </section>
  );
}
