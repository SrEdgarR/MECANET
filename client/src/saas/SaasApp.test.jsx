import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createSaasClient } from './client.js';
import { SaasApp } from './SaasApp.jsx';

const tenant = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Taller de prueba', dataEpoch: '1' };
const session = { authenticated: true, csrfToken: 'csrf', purpose: 'company', contextVersion: '1', user: { id: 'user-a', email: 'a@example.test' } };
const context = { identityId: session.user.id, purpose: session.purpose, contextVersion: session.contextVersion };
const reply = (data, status = 200) => ({ status, ok: status < 400, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => data });
function makeClient({ authenticated = true, items = [], catalogStatus = 200 } = {}) {
  let signedIn = authenticated;
  const fetch = vi.fn(async url => {
    if (url === '/api/auth/session') return reply(signedIn ? session : { authenticated: false, csrfToken: 'pre' });
    if (url === '/api/auth/login') { signedIn = true; return reply(session); }
    if (url === '/api/auth/logout') { signedIn = false; return reply({ ok: true }); }
    if (url === '/api/auth/activity') return reply({ ok: true });
    if (url === '/api/tenants') return reply({ context, tenants: [tenant] });
    if (url.startsWith('/api/tenants/')) return reply({ context, tenantId: tenant.id, dataEpoch: '1', items, nextCursor: null }, catalogStatus);
    throw new Error('Unexpected request');
  });
  return { client: createSaasClient(fetch), fetch };
}

describe('private React journey', () => {
  it('supports keyboard login, labeled inputs, selected company and empty catalog', async () => {
    window.history.replaceState(null, '', '/login');
    const user = userEvent.setup();
    const { client } = makeClient({ authenticated: false });
    render(<SaasApp client={client} />);
    const email = await screen.findByLabelText('Correo electrónico');
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    await user.click(email);
    await user.type(email, 'a@example.test');
    await user.tab();
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
    await user.keyboard('temporary-password{Enter}');
    const company = await screen.findByRole('link', { name: /Taller de prueba/ });
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    await user.click(company);
    expect(await screen.findByText('Este catálogo todavía no tiene productos.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Catálogo' })).toHaveFocus();
    expect(window.location.pathname).toBe(`/app/${tenant.id}/catalogo`);
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.queryByText('Taller de prueba')).not.toBeInTheDocument();
    client.dispose();
  });

  it('renders only SKU and name, and exposes no price, stock or controls to write', async () => {
    window.history.replaceState(null, '', `/app/${tenant.id}/catalogo`);
    const { client } = makeClient({ items: [{ id: 'same', sku: 'A-001', name: '<script>no execution</script>', price: 120, stock: 80 }] });
    render(<SaasApp client={client} />);
    expect(await screen.findByText('<script>no execution</script>')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map(node => node.textContent)).toEqual(['Código', 'Nombre']);
    expect(screen.queryByText('120')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /crear|editar|eliminar/i })).not.toBeInTheDocument();
    client.dispose();
  });

  it('503 shows a retry state with no protected company content and no false logout', async () => {
    window.history.replaceState(null, '', `/app/${tenant.id}/catalogo`);
    const { client } = makeClient({ catalogStatus: 503 });
    render(<SaasApp client={client} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No podemos comprobar el acceso');
    expect(screen.queryByText('Taller de prueba')).not.toBeInTheDocument();
    expect(screen.queryByText('a@example.test')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tu sesión terminó/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar acceso' })).toBeEnabled();
    client.dispose();
  });

  it('uses browser back to revalidate the directory without renewing session activity', async () => {
    window.history.replaceState(null, '', '/cuenta/empresas');
    const { client, fetch } = makeClient();
    render(<SaasApp client={client} />);
    await screen.findByRole('link', { name: /Taller de prueba/ });
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path === '/api/auth/session')).toHaveLength(2));
    expect(fetch.mock.calls.some(([path]) => path === '/api/auth/activity')).toBe(false);
    client.dispose();
  });
});
