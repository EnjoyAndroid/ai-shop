export interface ContextTurn { userText: string; answerText: string | null; }
export const RECENT_TURNS = 12;
/** Extractive summary: preserve prior questions verbatim; old answers are NOT current facts. */
export function nextContextSummary(summary: string, descendingTurns: ContextTurn[]): string {
  const leaving = descendingTurns[RECENT_TURNS - 1];
  if (!leaving) return summary;
  const excerpt = `用户关注：${leaving.userText.slice(0, 500)}\n当时回答（可能过时）：${(leaving.answerText || "未完成").slice(0, 500)}`;
  const entries = [...summary.split("\n---\n").filter(Boolean), excerpt];
  while (entries.length > 1 && entries.join("\n---\n").length > 6000) entries.shift();
  return entries.join("\n---\n");
}
export function recentContext(descendingTurns: ContextTurn[]) {
  return descendingTurns.slice(0, RECENT_TURNS).reverse().flatMap(turn => turn.answerText ? [
    { role: "user" as const, content: turn.userText },
    { role: "assistant" as const, content: turn.answerText },
  ] : []);
}
