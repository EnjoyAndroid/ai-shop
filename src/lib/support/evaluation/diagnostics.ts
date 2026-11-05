import type { EvalResult } from './types';

/** Interpret the saved call error without exposing raw provider responses or keys.
 * Also supports sessions recorded before this diagnostic UI existed. */
export function evaluationFailure(result: Pick<EvalResult, 'status' | 'calls'>): { label: string; message: string } | null {
  if (['COMPLETED', 'GREETING', 'OUT_OF_SCOPE', 'SCOPE_CLARIFY'].includes(result.status)) return null;
  const code = result.calls.findLast(call => !call.success && call.errorCode)?.errorCode || result.status;
  const phase = result.calls.at(-1)?.phase === 'scope' ? '规划' : '回答';
  if (code === 'NETWORK') return { label: '模型连接失败', message: `${phase}阶段无法连接模型网关，本侧尚未完成回答。这不是问题超出服务范围；请检查开发网关地址和服务连接。` };
  if (code === 'TIMEOUT') return { label: '模型请求超时', message: `${phase}阶段模型请求超时，本侧未完成。可稍后新建对照，避免把超时当作提示词质量结果。` };
  if (code === 'INVALID_PLAN') return { label: '规划格式无效', message: '模型未返回可校验的查询计划，尚未执行商品查询。该问题没有被判定为越界；请检查模型输出或协议兼容性。' };
  if (code === 'INCOMPLETE') return { label: '模型输出未完成', message: `${phase}阶段输出未完成，可能达到输出上限或被上游中止；这不是范围拒答。` };
  if (code.startsWith('UPSTREAM_')) {
    const status = code.slice('UPSTREAM_'.length);
    return { label: '模型网关请求失败', message: `${phase}阶段网关返回HTTP ${/^\d{3}$/.test(status) ? status : '错误'}。请检查模型权限、可用性或网关配置；本侧没有形成有效回答。` };
  }
  if (code === 'SCOPE_UNAVAILABLE') return { label: '规划不可用', message: '规划阶段未完成，尚未执行查询；当前没有足够错误信息确定原因，不能据此判断问题越界。' };
  return null;
}
