import { Readable } from "node:stream";
import { resolveRequestContext } from "@/packages/server/auth/context";
import { authorizeExportDownload } from "@/packages/server/exports/service";
import { writeAudit } from "@/packages/server/employees/service";
import { fileStorage } from "@/packages/server/storage/fs";
import { errorResponse } from "@/packages/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    const file = await authorizeExportDownload(ctx, (await params).id);
    const body = await fileStorage.get(file.objectKey, request.signal);
    try {
      await writeAudit(ctx, "export.download", "STARTED", file.subjectIds);
    } catch (error) {
      body.destroy();
      throw error;
    }
    return new Response(Readable.toWeb(body) as ReadableStream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="employee-list.${file.contentType === "application/pdf" ? "pdf" : "xlsx"}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
