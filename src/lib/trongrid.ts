export const USDT_CONTRACT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export interface TRC20Transfer {
  transaction_id: string;
  token_info: { symbol: string; address: string; decimals: number; name: string };
  block_timestamp: number;
  from: string; to: string; type: string; value: string;
}

export async function getTRC20Transfers(address: string, options: { minTimestamp: number; maxTimestamp: number }): Promise<TRC20Transfer[]> {
  const params = new URLSearchParams({ limit: "200", contract_address: USDT_CONTRACT_ADDRESS, only_to: "true", only_confirmed: "true", min_timestamp: String(options.minTimestamp), max_timestamp: String(options.maxTimestamp), order_by: "block_timestamp,asc" });
  const result: TRC20Transfer[] = [];
  // fingerprint 是服务端给出的分页游标，不跟随任意 next URL。
  for (let page = 0; page < 5; page++) {
    const response = await fetch(`https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?${params}`, { headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY || "" }, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) throw new Error("链上查询暂不可用");
    const data = await response.json();
    if (!data.success || !Array.isArray(data.data)) throw new Error("链上查询结果无效");
    result.push(...data.data);
    const fingerprint = data.meta?.fingerprint;
    if (!fingerprint || !data.data.length) break;
    params.set("fingerprint", String(fingerprint));
  }
  return result;
}

export function isMatchingTransfer(tx: TRC20Transfer, quote: { address: string; amountMicros: bigint; createdAt: Date; expiresAt: Date }): boolean {
  return /^[a-fA-F0-9]{64}$/.test(tx.transaction_id || "") && tx.type === "Transfer" && tx.to === quote.address &&
    tx.token_info?.address === USDT_CONTRACT_ADDRESS && Number(tx.token_info.decimals) === 6 &&
    /^\d+$/.test(tx.value || "") && BigInt(tx.value) === quote.amountMicros &&
    tx.block_timestamp >= quote.createdAt.getTime() && tx.block_timestamp <= quote.expiresAt.getTime();
}
