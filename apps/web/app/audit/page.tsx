"use client";

import { useCallback, useEffect, useState } from "react";
import "./audit.css";

interface AuditEvent {
  id: string;
  actorId: string | null;
  occurredAt: string;
  action: string;
  outcome: string;
  source: string;
  changedFields: string[] | null;
}

type AuditState = "loading" | "loaded" | "forbidden" | "error";

export default function AuditPage() {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [state, setState] = useState<AuditState>("loading");

  const loadAudit = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const response = await fetch("/api/audit?limit=100", {
        signal,
        cache: "no-store",
      });
      if (response.status === 403) {
        setRows([]);
        setState("forbidden");
        return;
      }
      if (!response.ok) throw new Error("audit_request_failed");
      const result = (await response.json()) as { rows: AuditEvent[] };
      setRows(result.rows.slice(0, 100));
      setState("loaded");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRows([]);
      setState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAudit(controller.signal);
    return () => controller.abort();
  }, [loadAudit]);

  return (
    <main className="auditPage">
      <header className="auditHeader">
        <div>
          <p className="auditEyebrow">ADMINISTRATION</p>
          <h1>감사 기록</h1>
          <p className="auditDescription">
            최근 업무 변경과 접근 결과를 확인합니다.
          </p>
        </div>
        <button
          className="auditRefresh"
          type="button"
          onClick={() => void loadAudit()}
          disabled={state === "loading"}
        >
          {state === "loading" ? "불러오는 중..." : "새로고침"}
        </button>
      </header>

      <section
        className="auditTableRegion"
        aria-label="감사 기록 목록"
        aria-busy={state === "loading"}
      >
        {state === "loading" && (
          <p className="auditMessage" role="status">
            감사 기록을 불러오고 있습니다.
          </p>
        )}
        {state === "forbidden" && (
          <p className="auditMessage" role="status">
            감사 기록을 조회할 권한이 없습니다.
          </p>
        )}
        {state === "error" && (
          <div className="auditMessage" role="alert">
            <p>감사 기록을 불러오지 못했습니다.</p>
            <button
              className="auditInlineButton"
              type="button"
              onClick={() => void loadAudit()}
            >
              다시 조회
            </button>
          </div>
        )}
        {state === "loaded" && rows.length === 0 && (
          <p className="auditMessage" role="status">
            표시할 감사 기록이 없습니다.
          </p>
        )}
        {state === "loaded" && rows.length > 0 && (
          <div
            className="auditTableScroll"
            role="region"
            aria-label="감사 기록 표, 가로 스크롤 가능"
            tabIndex={0}
          >
            <table className="auditTable">
              <caption className="auditVisuallyHidden">
                최근 감사 기록 최대 100건
              </caption>
              <thead>
                <tr>
                  <th scope="col">발생 시각</th>
                  <th scope="col">작업</th>
                  <th scope="col">결과</th>
                  <th scope="col">변경 항목</th>
                  <th scope="col">처리 주체</th>
                  <th scope="col">출처</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <time dateTime={row.occurredAt}>
                        {new Date(row.occurredAt).toLocaleString("ko-KR")}
                      </time>
                    </td>
                    <td>{row.action}</td>
                    <td>{row.outcome}</td>
                    <td>{row.changedFields?.join(", ") || "없음"}</td>
                    <td>{row.actorId ?? "시스템"}</td>
                    <td>{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="auditLimit">최근 기록 최대 100건을 표시합니다.</p>
    </main>
  );
}
