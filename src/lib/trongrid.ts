/**
 * TronGrid API 客户端
 * 用于查询 TRON 区块链上的 USDT TRC20 交易
 */

const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || "";
const TRONGRID_BASE_URL = "https://api.trongrid.io";

// USDT TRC20 合约地址 (主网)
const USDT_CONTRACT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export interface TRC20Transfer {
  transaction_id: string;
  token_info: {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
  };
  block_timestamp: number;
  from: string;
  to: string;
  type: string;
  value: string;
}

export interface TRC20TransferResponse {
  data: TRC20Transfer[];
  success: boolean;
  meta: {
    at: number;
    page_size: number;
  };
}

/**
 * 获取地址的 TRC20 转账记录
 */
export async function getTRC20Transfers(
  address: string,
  options: {
    limit?: number;
    minTimestamp?: number;
    onlyTo?: boolean;
  } = {}
): Promise<TRC20Transfer[]> {
  const { limit = 50, minTimestamp, onlyTo = true } = options;

  const params = new URLSearchParams({
    limit: limit.toString(),
    contract_address: USDT_CONTRACT_ADDRESS,
  });

  if (minTimestamp) {
    params.set("min_timestamp", minTimestamp.toString());
  }

  if (onlyTo) {
    params.set("only_to", "true");
  }

  const url = `${TRONGRID_BASE_URL}/v1/accounts/${address}/transactions/trc20?${params}`;

  const response = await fetch(url, {
    headers: {
      "TRON-PRO-API-KEY": TRONGRID_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`TronGrid API error: ${response.status}`);
  }

  const data: TRC20TransferResponse = await response.json();

  if (!data.success) {
    throw new Error("TronGrid API returned unsuccessful response");
  }

  // 只返回 USDT 转账
  return data.data.filter(
    (tx) => tx.token_info.symbol === "USDT" && tx.type === "Transfer"
  );
}

/**
 * 查找特定金额的 USDT 转账
 * @param address 收款地址
 * @param expectedAmount 预期金额 (USDT, 如 10.00)
 * @param sinceTimestamp 从什么时间开始查找 (毫秒)
 * @param tolerance 金额容差 (默认 0.01 USDT)
 */
export async function findUSDTPayment(
  address: string,
  expectedAmount: number,
  sinceTimestamp: number,
  tolerance: number = 0.01
): Promise<TRC20Transfer | null> {
  const transfers = await getTRC20Transfers(address, {
    minTimestamp: sinceTimestamp,
    onlyTo: true,
    limit: 100,
  });

  // USDT TRC20 有 6 位小数
  const expectedValue = expectedAmount * 1_000_000;
  const toleranceValue = tolerance * 1_000_000;

  for (const tx of transfers) {
    const txValue = parseFloat(tx.value);
    if (Math.abs(txValue - expectedValue) <= toleranceValue) {
      return tx;
    }
  }

  return null;
}

/**
 * 根据交易哈希查询交易详情
 */
export async function getTransactionInfo(txHash: string): Promise<any> {
  const url = `${TRONGRID_BASE_URL}/v1/transactions/${txHash}`;

  const response = await fetch(url, {
    headers: {
      "TRON-PRO-API-KEY": TRONGRID_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`TronGrid API error: ${response.status}`);
  }

  return response.json();
}

/**
 * 验证交易是否已确认
 */
export async function isTransactionConfirmed(txHash: string): Promise<boolean> {
  try {
    const info = await getTransactionInfo(txHash);
    return info.data?.[0]?.ret?.[0]?.contractRet === "SUCCESS";
  } catch {
    return false;
  }
}
