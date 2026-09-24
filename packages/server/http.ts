import { ZodError } from "zod";
import { ApiError, getRequestCorrelationId } from "./auth/context";
import { logger } from "./logger";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN ?? "http://host.docker.internal:3000";
  if (origin !== expected)
    throw new ApiError(403, "FORBIDDEN", "허용되지 않은 요청 출처입니다");
}

export function assertJson(request: Request): void {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new ApiError(422, "VALIDATION", "JSON 요청이 필요합니다");
  }
}

export async function boundedFormData(
  request: Request,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.startsWith("multipart/form-data;") || !request.body)
    throw new ApiError(422, "VALIDATION", "파일 요청 형식이 올바르지 않습니다");
  const length = Number(request.headers.get("content-length"));
  if (length > maxBytes)
    throw new ApiError(413, "FILE_TOO_LARGE", "파일은 5 MiB 이하여야 합니다");
  const chunks: BlobPart[] = [];
  const reader = request.body.getReader();
  const abortRead = () => {
    void reader.cancel(signal?.reason);
  };
  signal?.addEventListener("abort", abortRead, { once: true });
  let total = 0;
  try {
    if (signal?.aborted)
      throw new ApiError(503, "RETRY", "업로드 시간이 초과됐습니다");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes)
        throw new ApiError(
          413,
          "FILE_TOO_LARGE",
          "파일은 5 MiB 이하여야 합니다",
        );
      chunks.push(Uint8Array.from(value));
    }
    if (signal?.aborted)
      throw new ApiError(503, "RETRY", "업로드 시간이 초과됐습니다");
  } finally {
    signal?.removeEventListener("abort", abortRead);
    reader.releaseLock();
  }
  return new Response(new Blob(chunks), {
    headers: { "Content-Type": contentType },
  }).formData();
}

export function errorResponse(error: unknown, headers?: Headers): Response {
  const correlationId =
    (headers && getRequestCorrelationId(headers)) || crypto.randomUUID();
  if (error instanceof ApiError)
    return Response.json(
      { code: error.code, message: error.message, correlationId },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return Response.json(
      {
        code: "VALIDATION",
        message: "입력값을 확인하세요",
        details: error.flatten(),
        issues: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
        correlationId,
      },
      { status: 422 },
    );
  logger.error(
    {
      correlationId,
      errorType: error instanceof Error ? error.name : "unknown",
    },
    "request_failed",
  );
  return Response.json(
    { code: "INTERNAL", message: "요청을 처리하지 못했습니다", correlationId },
    { status: 500 },
  );
}
