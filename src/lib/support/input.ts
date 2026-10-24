export interface SupportKeyEvent {
  key: string;
  keyCode?: number;
  shiftKey: boolean;
  nativeEvent?: { isComposing?: boolean };
}

/** IME candidate confirmation must not submit the support form. */
export function shouldSubmitSupportOnEnter(event: SupportKeyEvent): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing && event.keyCode !== 229;
}
