import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../../pages/Login';
import { useAuthStore } from '../../store/authStore';
import * as apiModule from '../../services/api';

// Mock the API module
vi.mock('../../services/api', () => ({
  login: vi.fn(),
}));

const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Login Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset auth store
    const { logout } = useAuthStore.getState();
    logout();
  });

  it('should render login form', () => {
    renderWithRouter(<Login />);
    
    expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('should handle successful login', async () => {
    const mockResponse = {
      data: {
        token: 'test-token-123',
        id: '1',
        name: 'Admin User',
        email: 'admin@autoparts.com',
        role: 'admin',
      },
    };

    apiModule.login.mockResolvedValueOnce(mockResponse);

    renderWithRouter(<Login />);

    const emailInput = screen.getByLabelText(/correo electrónico/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

    fireEvent.change(emailInput, { target: { value: 'admin@autoparts.com' } });
    fireEvent.change(passwordInput, { target: { value: 'admin123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const { isAuthenticated, user } = useAuthStore.getState();
      expect(isAuthenticated).toBe(true);
      expect(user?.email).toBe('admin@autoparts.com');
    });
  });

  it('should show error on invalid credentials', async () => {
    apiModule.login.mockRejectedValueOnce({
      response: {
        data: { message: 'Credenciales inválidas' },
      },
    });

    renderWithRouter(<Login />);

    const emailInput = screen.getByLabelText(/correo electrónico/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

    fireEvent.change(emailInput, { target: { value: 'wrong@email.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const { isAuthenticated } = useAuthStore.getState();
      expect(isAuthenticated).toBe(false);
    });
  });

  it('should validate empty fields', async () => {
    renderWithRouter(<Login />);

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    fireEvent.click(submitButton);

    // Should not make API call with empty fields
    expect(apiModule.login).not.toHaveBeenCalled();
  });

  it('should toggle password visibility', () => {
    renderWithRouter(<Login />);

    const passwordInput = screen.getByLabelText(/contraseña/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Find toggle button by its position relative to password input
    const toggleButton = passwordInput.parentElement.querySelector('button[type="button"]');
    expect(toggleButton).toBeInTheDocument();
    fireEvent.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
  });
});
