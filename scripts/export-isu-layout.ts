import { mkdir, writeFile } from "node:fs/promises";
import { buildIsuLayout } from "../apps/web/app/login/isu-layout";

// 블렌더 블록 스크립트의 입력. 배치를 바꾸면 이 스크립트와 블렌더 스크립트를 다시 실행한다.
await mkdir("tools/blender", { recursive: true });
await writeFile(
  "tools/blender/isu-layout.json",
  `${JSON.stringify(buildIsuLayout(), null, 2)}\n`,
);
console.log("tools/blender/isu-layout.json written");
