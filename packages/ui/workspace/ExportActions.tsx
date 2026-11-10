import { ActionButton } from "./Workspace";
import { WorkspaceIcon } from "./WorkspaceIcon";

export type OutputFormat = "xlsx" | "pdf";
const formats: Record<OutputFormat, string> = { xlsx: "Excel", pdf: "PDF" };
const statuses: Record<string, string> = {
  PENDING: "대기",
  RUNNING: "생성 중",
  SUCCEEDED: "완료",
  DENIED: "권한 회수",
  FAILED: "실패",
};

export function ExportActions({
  onRequest,
  disabled,
  pending,
  selected = false,
}: {
  onRequest: (format: OutputFormat) => void;
  disabled?: boolean;
  pending?: OutputFormat | null;
  selected?: boolean;
}) {
  return (
    <div
      className="registerExport"
      role="group"
      aria-label={selected ? "선택 행 내보내기" : "목록 내보내기"}
    >
      {(["xlsx", "pdf"] as const).map((format) => (
        <ActionButton
          key={format}
          onClick={() => onRequest(format)}
          disabled={disabled}
          pending={pending === format}
          pendingLabel="요청 중"
        >
          {!selected && format === "xlsx" && <WorkspaceIcon name="download" />}
          {selected ? "선택 " : ""}
          {formats[format]}
        </ActionButton>
      ))}
    </div>
  );
}
export function ExportResult({
  format,
  status,
  snapshotAt,
  downloadHref,
}: {
  format: OutputFormat;
  status: string;
  snapshotAt?: string | null;
  downloadHref: string;
}) {
  return (
    <div role="status">
      <p>
        {formats[format]} {statuses[status] ?? "상태 확인 필요"}
      </p>
      {snapshotAt && (
        <small>기준 시각 {new Date(snapshotAt).toLocaleString("ko-KR")}</small>
      )}
      {status === "SUCCEEDED" && <a href={downloadHref}>출력물 다운로드</a>}
    </div>
  );
}
