import { OrderRequestError } from "./order-errors";

// Content-Length alone is not sufficient: chunked bodies need the same bound.
export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new OrderRequestError("请求内容过大", 413);
  if (!request.body) throw new SyntaxError("Empty request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new OrderRequestError("请求内容过大", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  return JSON.parse(await readBoundedText(request, maxBytes));
}
