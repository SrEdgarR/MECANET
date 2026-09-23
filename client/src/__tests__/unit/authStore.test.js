import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useAuthStore } from '../../store/authStore';

describe('AuthStore - Unit Tests', () => {
  beforeEach(() => {
    // Reset store before each test
    act(() => {
      useAuthStore.getState().logout();
    });
    localStorage.clear();
  });

  it('should have initial state', () => {
    const state = useAuthStore.getState();
    
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should login user successfully', () => {
    const mockUser = {
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'admin',
    };
    const mockToken = 'test-token-123';

    act(() => {
      useAuthStore.getState().login(mockUser, mockToken);
    });

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.token).toBe(mockToken);
    expect(state.isAuthenticated).toBe(true);
  });

  it('should logout user successfully', () => {
    // Login first
    act(() => {
      useAuthStore.getState().login(
        { id: '1', name: 'Test User', email: 'test@example.com', role: 'admin' },
        'test-token'
      );
    });

    // Then logout
    act(() => {
      useAuthStore.getState().logout();
    });

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should persist token in localStorage', () => {
    const mockToken = 'test-token-123';

    act(() => {
      useAuthStore.getState().login(
        { id: '1', name: 'Test User', email: 'test@example.com', role: 'admin' },
        mockToken
      );
    });

    expect(localStorage.getItem('token')).toBe(mockToken);
  });

  it('should remove token from localStorage on logout', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: '1', name: 'Test User', email: 'test@example.com', role: 'admin' },
        'test-token'
      );
    });

    act(() => {
      useAuthStore.getState().logout();
    });

    expect(localStorage.getItem('token')).toBeNull();
  });
});
