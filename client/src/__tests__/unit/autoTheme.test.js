/**
 * @file autoTheme.test.js
 * @description Tests para funcionalidad de tema automático
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemeStore } from '../../store/themeStore';

describe('Auto Theme - Unit Tests', () => {
  beforeEach(() => {
    // Reset store antes de cada test
    const { getState } = useThemeStore;
    act(() => {
      useThemeStore.setState({
        isDarkMode: false,
        autoThemeEnabled: true
      });
    });
  });

  it('should enable auto theme by default', () => {
    const { result } = renderHook(() => useThemeStore());
    expect(result.current.autoThemeEnabled).toBe(true);
  });

  it('should activate dark mode at 5 PM (17:00)', () => {
    // Mock date to 17:00 (5 PM)
    const mockDate = new Date();
    mockDate.setHours(17, 0, 0, 0);
    vi.setSystemTime(mockDate);

    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.checkAutoTheme();
    });

    expect(result.current.isDarkMode).toBe(true);
  });

  it('should activate light mode at 7 AM', () => {
    // Mock date to 07:00 (7 AM)
    const mockDate = new Date();
    mockDate.setHours(7, 0, 0, 0);
    vi.setSystemTime(mockDate);

    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.checkAutoTheme();
    });

    expect(result.current.isDarkMode).toBe(false);
  });

  it('should keep dark mode between 17:00 and 06:59', () => {
    const testHours = [17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];
    
    testHours.forEach(hour => {
      const mockDate = new Date();
      mockDate.setHours(hour, 0, 0, 0);
      vi.setSystemTime(mockDate);

      const { result } = renderHook(() => useThemeStore());
      
      act(() => {
        result.current.checkAutoTheme();
      });

      expect(result.current.isDarkMode).toBe(true);
    });
  });

  it('should keep light mode between 07:00 and 16:59', () => {
    const testHours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    
    testHours.forEach(hour => {
      const mockDate = new Date();
      mockDate.setHours(hour, 0, 0, 0);
      vi.setSystemTime(mockDate);

      const { result } = renderHook(() => useThemeStore());
      
      act(() => {
        result.current.checkAutoTheme();
      });

      expect(result.current.isDarkMode).toBe(false);
    });
  });

  it('should disable auto theme when user toggles manually', () => {
    const { result } = renderHook(() => useThemeStore());
    
    expect(result.current.autoThemeEnabled).toBe(true);
    
    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.autoThemeEnabled).toBe(false);
  });

  it('should not change theme when auto theme is disabled', () => {
    const mockDate = new Date();
    mockDate.setHours(17, 0, 0, 0);
    vi.setSystemTime(mockDate);

    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.enableAutoTheme(false);
      result.current.setDarkMode(false);
    });

    expect(result.current.autoThemeEnabled).toBe(false);
    expect(result.current.isDarkMode).toBe(false);
    
    act(() => {
      result.current.checkAutoTheme();
    });

    // Should remain light even though it's 17:00
    expect(result.current.isDarkMode).toBe(false);
  });

  it('should apply theme immediately when enabling auto theme', () => {
    const mockDate = new Date();
    mockDate.setHours(20, 0, 0, 0); // 8 PM
    vi.setSystemTime(mockDate);

    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.enableAutoTheme(false);
      result.current.setDarkMode(false);
    });

    expect(result.current.isDarkMode).toBe(false);
    
    act(() => {
      result.current.enableAutoTheme(true);
    });

    // Should change to dark immediately
    expect(result.current.isDarkMode).toBe(true);
  });

  it('should handle setDarkMode and disable auto theme', () => {
    const { result } = renderHook(() => useThemeStore());
    
    expect(result.current.autoThemeEnabled).toBe(true);
    
    act(() => {
      result.current.setDarkMode(true);
    });

    expect(result.current.isDarkMode).toBe(true);
    expect(result.current.autoThemeEnabled).toBe(false);
  });
});
