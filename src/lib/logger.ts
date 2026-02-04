/**
 * 安全日志工具
 * 生产环境隐藏敏感错误详情，防止信息泄露
 */

const isDev = process.env.NODE_ENV === "development";

/**
 * 记录错误日志
 * - 开发环境：打印完整错误信息
 * - 生产环境：仅打印错误标识，隐藏堆栈和敏感信息
 */
export function logError(context: string, error: unknown): void {
  if (isDev) {
    // 开发环境：完整信息便于调试
    console.error(`[${context}]`, error);
  } else {
    // 生产环境：仅记录错误类型和消息，隐藏堆栈
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorType = error instanceof Error ? error.constructor.name : typeof error;
    console.error(`[${context}] ${errorType}: ${errorMessage}`);
  }
}

/**
 * 记录警告日志
 */
export function logWarn(context: string, message: string): void {
  console.warn(`[${context}] ${message}`);
}

/**
 * 记录信息日志（仅开发环境）
 */
export function logInfo(context: string, message: string): void {
  if (isDev) {
    console.log(`[${context}] ${message}`);
  }
}

/**
 * 记录调试日志（仅开发环境）
 */
export function logDebug(context: string, data: unknown): void {
  if (isDev) {
    console.log(`[${context}]`, data);
  }
}
