import { OrderRequestError } from "./order-errors";

export const MAX_UPLOAD_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_FILE_BYTES + 64 * 1024;

export function assertUploadRequestSize(request: Request): void {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_UPLOAD_REQUEST_BYTES)) {
    throw new OrderRequestError("请求内容过大", 413);
  }
}

export function boundedUploadRequest(request: Request): Request {
  assertUploadRequestSize(request);
  if (!request.body) return request;
  const reader = request.body.getReader();
  let total = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > MAX_UPLOAD_REQUEST_BYTES) {
          await reader.cancel();
          controller.error(new OrderRequestError("请求内容过大", 413));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

export function validateUploadForm(formData: FormData): { purpose: string | null; file: File } {
  let purpose: string | null = null;
  let file: File | null = null;
  for (const [key, value] of formData.entries()) {
    if (key === "purpose" && typeof value === "string" && purpose === null) {
      purpose = value;
      continue;
    }
    if (key === "file" && value instanceof File && file === null) {
      file = value;
      continue;
    }
    throw new OrderRequestError("上传字段无效", 400);
  }
  if (!file) throw new OrderRequestError("请选择文件", 400);
  if (file.size > MAX_UPLOAD_FILE_BYTES) throw new OrderRequestError("文件大小不能超过 2MB", 400);
  return { purpose, file };
}
