import { countTokens, setMergeCacheSize } from "gpt-tokenizer/encoding/o200k_base";
import { SUPPORT_LIMITS } from "./limits";

// Never retain customer text in a process-wide tokenizer cache.
setMergeCacheSize(0);
const ordinaryText = { allowedSpecial: new Set<string>(), disallowedSpecial: new Set<string>() };
// The gateway may map a model alias to another tokenizer. This is a local
// o200k_base estimate, never provider usage or proof of model context capacity.
export function supportTextTokens(text: string): number {
  return countTokens(text, ordinaryText);
}
export function supportInputSize(body: unknown) {
  const serialized = JSON.stringify(body) || "null";
  const bytes = Buffer.byteLength(serialized, "utf8");
  // Check bytes before tokenizing unbounded input. Count the complete wire body,
  // including tools, reasoning and result envelopes, with framing headroom.
  const estimatedTokens = bytes > SUPPORT_LIMITS.inputBytes ? Infinity
    : Math.ceil(supportTextTokens(serialized) * 1.15) + 256;
  return { bytes, estimatedTokens };
}
export function supportInputFits(body: unknown, tokenLimit: number = SUPPORT_LIMITS.inputMaxTokens): boolean {
  const size = supportInputSize(body);
  return size.bytes <= SUPPORT_LIMITS.inputBytes && size.estimatedTokens <= tokenLimit;
}
