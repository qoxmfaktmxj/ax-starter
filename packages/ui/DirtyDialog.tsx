"use client";

import { Dialog } from "@base-ui/react/dialog";

export function DirtyDialog({
  open,
  count,
  onContinue,
  onDiscard,
  onSave,
}: {
  open: boolean;
  count: number;
  onContinue: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onContinue();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="workspaceModalBackdrop" />
        <Dialog.Popup className="workspaceModalPopup">
          <Dialog.Title>저장하지 않은 변경 {count}건</Dialog.Title>
          <Dialog.Description>
            이동하면 현재 입력이 사라집니다.
          </Dialog.Description>
          <div className="workspaceModalActions">
            <Dialog.Close onClick={onContinue}>계속 편집</Dialog.Close>
            <button type="button" onClick={onDiscard}>
              버리고 이동
            </button>
            <button type="button" className="primary" onClick={onSave}>
              저장 후 이동
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
