import test from "node:test";
import assert from "node:assert/strict";
import { MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_REQUEST_BYTES, assertUploadRequestSize, boundedUploadRequest, validateUploadForm } from "../src/lib/upload-limits";
import { OrderRequestError } from "../src/lib/order-errors";

test("upload request size rejects invalid and oversized declared lengths", () => {
  assert.doesNotThrow(() => assertUploadRequestSize(new Request("http://localhost", { headers: { "content-length": String(MAX_UPLOAD_REQUEST_BYTES) } })));
  assert.throws(() => assertUploadRequestSize(new Request("http://localhost", { headers: { "content-length": String(MAX_UPLOAD_REQUEST_BYTES + 1) } })), (error: unknown) => error instanceof OrderRequestError && error.status === 413);
  assert.throws(() => assertUploadRequestSize(new Request("http://localhost", { headers: { "content-length": "invalid" } })), (error: unknown) => error instanceof OrderRequestError && error.status === 413);
});

test("chunked upload request is bounded while the parser reads it", async () => {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_UPLOAD_REQUEST_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  const request = boundedUploadRequest(new Request("http://localhost", { method: "POST", body: source, duplex: "half" } as RequestInit & { duplex: "half" }));
  await assert.rejects(request.arrayBuffer(), (error: unknown) => error instanceof OrderRequestError && error.status === 413);
});

test("upload form accepts one file and optional purpose only", () => {
  const form = new FormData();
  form.set("purpose", "support");
  form.set("file", new File([new Uint8Array(10)], "qr.png", { type: "image/png" }));
  const result = validateUploadForm(form);
  assert.equal(result.purpose, "support");
  assert.equal(result.file.size, 10);

  const oversized = new FormData();
  oversized.set("file", new File([new Uint8Array(MAX_UPLOAD_FILE_BYTES + 1)], "big.png", { type: "image/png" }));
  assert.throws(() => validateUploadForm(oversized), (error: unknown) => error instanceof OrderRequestError && error.status === 400);

  const duplicate = new FormData();
  duplicate.append("file", new File([new Uint8Array(1)], "a.png", { type: "image/png" }));
  duplicate.append("file", new File([new Uint8Array(1)], "b.png", { type: "image/png" }));
  assert.throws(() => validateUploadForm(duplicate), (error: unknown) => error instanceof OrderRequestError && error.status === 400);
});
