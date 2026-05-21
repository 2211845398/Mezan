export type ReceiveLineProgress = {
  /** PO line qty (المتوقع). */
  ordered: number;
  /** Already posted on prior receipts. */
  alreadyReceived: number;
  /** Qty in the current form (not yet posted). */
  thisSession: number;
  /** Posted + current form (المستلم in the UI). */
  receivedDisplay: number;
  /** Still open after posted + form (المتبقي in the UI). */
  remainingDisplay: number;
  /** Open qty before this session (validation only). */
  openBeforeSession: number;
  exceeds: boolean;
};

export function computeReceiveLineProgress(
  ordered: number,
  alreadyReceived: number,
  thisSessionQty: number,
): ReceiveLineProgress {
  const openBeforeSession = Math.max(0, ordered - alreadyReceived);
  const thisSession = Math.max(0, thisSessionQty);
  const receivedDisplay = alreadyReceived + thisSession;
  const remainingDisplay = Math.max(0, ordered - receivedDisplay);
  return {
    ordered,
    alreadyReceived,
    thisSession,
    receivedDisplay,
    remainingDisplay,
    openBeforeSession,
    exceeds: thisSession > openBeforeSession,
  };
}
