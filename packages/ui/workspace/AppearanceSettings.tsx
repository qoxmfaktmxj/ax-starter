"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import {
  appearanceCookie,
  readAppearance,
  type Appearance,
} from "../appearance";
import { WorkspaceIcon } from "./WorkspaceIcon";

export function AppearanceSettings() {
  const [choice, setChoice] = useState<Appearance>(() => readAppearance());
  const [temporary, setTemporary] = useState(false);

  function apply(next: Appearance) {
    const root = document.documentElement;
    root.dataset.theme = next.theme;
    root.dataset.mode = next.mode;
    root.dataset.agThemeMode = next.mode;
    setChoice(next);
    const pair = `${appearanceCookie}=${next.theme}.${next.mode}`;
    try {
      document.cookie =
        pair +
        "; Path=/; Max-Age=31536000; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
      setTemporary(!document.cookie.split("; ").includes(pair));
    } catch {
      setTemporary(true);
    }
  }

  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (open) {
          const { theme, mode } = document.documentElement.dataset;
          setChoice(readAppearance(`${theme}.${mode}`));
        }
      }}
    >
      <Dialog.Trigger aria-label="화면 설정" title="화면 설정">
        <WorkspaceIcon name="appearance" />
        <span>화면 설정</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="workspaceModalBackdrop" />
        <Dialog.Popup className="workspaceModalPopup appearanceSettings">
          <Dialog.Title>화면 설정</Dialog.Title>
          <Dialog.Description>
            선택한 설정은 이 브라우저에 저장됩니다.
          </Dialog.Description>
          <fieldset>
            <legend>브랜드 색상</legend>
            {(["cobalt", "isu"] as const).map((theme) => (
              <label key={theme}>
                <input
                  type="radio"
                  name="brand"
                  checked={choice.theme === theme}
                  onChange={() => apply({ ...choice, theme })}
                />
                {theme === "cobalt" ? "코발트" : "ISU"}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>화면 모드</legend>
            {(["light", "dark"] as const).map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name="mode"
                  checked={choice.mode === mode}
                  onChange={() => apply({ ...choice, mode })}
                />
                {mode === "light" ? "라이트" : "다크"}
              </label>
            ))}
          </fieldset>
          {temporary && (
            <p role="status">
              쿠키를 저장할 수 없어 현재 화면에만 적용했습니다.
            </p>
          )}
          <div className="workspaceModalActions">
            <Dialog.Close>닫기</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
