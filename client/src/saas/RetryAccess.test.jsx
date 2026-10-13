import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RetryAccess } from './RetryAccess.jsx';

it('waits for the server retry time and does not retry until the user activates it', async () => {
  vi.useFakeTimers();
  try {
    const onRetry = vi.fn();
    render(<RetryAccess retryAt={Date.now() + 2000} onRetry={onRetry} />);
    const button = screen.getByRole('button', { name: 'Reintentar acceso' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(button).toBeEnabled();
    expect(onRetry).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
