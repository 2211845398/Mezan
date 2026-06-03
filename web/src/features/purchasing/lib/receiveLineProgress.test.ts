import { describe, expect, it } from 'vitest';

import { computeReceiveLineProgress } from './receiveLineProgress';

describe('computeReceiveLineProgress', () => {
  it('updates received and remaining as user enters qty', () => {
    const p = computeReceiveLineProgress(100, 0, 70);
    expect(p.ordered).toBe(100);
    expect(p.receivedDisplay).toBe(70);
    expect(p.remainingDisplay).toBe(30);
    expect(p.exceeds).toBe(false);
  });

  it('full receive in one session', () => {
    const p = computeReceiveLineProgress(100, 0, 100);
    expect(p.receivedDisplay).toBe(100);
    expect(p.remainingDisplay).toBe(0);
    expect(p.exceeds).toBe(false);
  });

  it('flags exceed when session qty is above open remaining', () => {
    const p = computeReceiveLineProgress(100, 60, 50);
    expect(p.openBeforeSession).toBe(40);
    expect(p.receivedDisplay).toBe(110);
    expect(p.remainingDisplay).toBe(0);
    expect(p.exceeds).toBe(true);
  });
});
