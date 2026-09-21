import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEventCallback } from '../src/hooks/useEventCallback';

describe('commands with explicit triggers', () => {
  it('keeps an existing timer callback stable while using the current filters', () => {
    const execute = vi.fn();
    const { result, rerender } = renderHook(({ filter }) =>
      useEventCallback((page: number) => execute(filter, page)), { initialProps: { filter: 'old' } });
    const command = result.current;
    rerender({ filter: 'new' });
    expect(result.current).toBe(command);
    expect(execute).not.toHaveBeenCalled();
    act(() => { command(2); });
    expect(execute).toHaveBeenCalledWith('new', 2);
  });
});
