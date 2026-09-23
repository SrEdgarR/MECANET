import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import ClockWidget from '../../components/ClockWidget';

describe('ClockWidget - Unit Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render the clock widget', () => {
    render(<ClockWidget />);
    expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it('should display current time', () => {
    const mockDate = new Date('2025-10-04T14:30:00');
    vi.setSystemTime(mockDate);
    
    render(<ClockWidget />);
    
    // Check if time is displayed
    const timeElement = screen.getByText(/02:30:00/i);
    expect(timeElement).toBeInTheDocument();
  });

  it('should update time every second', () => {
    const mockDate = new Date('2025-10-04T14:30:00');
    vi.setSystemTime(mockDate);
    
    const { rerender } = render(<ClockWidget />);
    
    // Initial time
    expect(screen.getByText(/02:30:00/i)).toBeInTheDocument();
    
    // Advance time by 1 second inside act() to avoid React warnings
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender(<ClockWidget />);
    
    // Time should have updated
    expect(screen.getByText(/02:30:01/i)).toBeInTheDocument();
  });

  it('should display formatted date', () => {
    const mockDate = new Date('2025-10-04T14:30:00');
    vi.setSystemTime(mockDate);
    
    render(<ClockWidget />);
    
    // Check if date is displayed
    expect(screen.getByText(/octubre/i)).toBeInTheDocument();
  });

  it('should have correct CSS classes', () => {
    const { container } = render(<ClockWidget />);
    const widget = container.firstChild;
    
    expect(widget).toHaveClass('flex', 'items-center', 'gap-3');
  });
});
