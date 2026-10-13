import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Inventory } from './Inventory.jsx';

const tenant = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Taller sintético A', permissions: ['inventory.read', 'catalog.create', 'inventory.receive'] };
const product = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sku: 'ABC', name: 'Filtro sintético', onHand: '0', version: '1' };
const base = { tenant, items: [product], nextCursor: null, inventoryLoading: false, operations: [], operation: null, operationMessage: '', writeBusy: false, movementProduct: null, movements: [], movementCursor: null, movementsLoading: false };
function ui(state = {}, props = {}) {
  const actions = { onCreate: vi.fn(), onReceive: vi.fn(), onCompanies: vi.fn(), onRefresh: vi.fn(), onNext: vi.fn(), onMovements: vi.fn(), onMovementNext: vi.fn(), onLookup: vi.fn(), onReplay: vi.fn(), ...props };
  render(<Inventory state={{ ...base, ...state }} {...actions} />); return actions;
}

describe('square private inventory screen', () => {
  it('shows the company, stock and separately labeled create/receive forms with keyboard submission', async () => {
    const actions = ui(); const user = userEvent.setup();
    expect(screen.getByText('Taller sintético A')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Código del producto'), 'ABC-2');
    await user.tab(); expect(screen.getByLabelText('Nombre del producto')).toHaveFocus();
    await user.keyboard('Producto ficticio{Enter}'); expect(actions.onCreate).toHaveBeenCalledWith({ sku: 'ABC-2', name: 'Producto ficticio' });
    await user.click(screen.getByRole('button', { name: 'Recibir unidades de Filtro sintético' }));
    expect(screen.getByLabelText('Unidades recibidas')).toHaveFocus();
    await user.type(screen.getByLabelText('Unidades recibidas'), '2'); await user.type(screen.getByLabelText('Motivo de la recepción'), 'Prueba');
    await user.click(screen.getByRole('button', { name: 'Registrar recepción' }));
    expect(actions.onReceive).toHaveBeenCalledWith(product.id, { quantity: '2', reason: 'Prueba' });
  });
  it('omits forbidden reads/actions without inferring permissions from an owner role', () => {
    ui({ tenant: { ...tenant, permissions: ['catalog.create'], role: 'owner' }, items: [] });
    expect(screen.getByLabelText('Código del producto')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument(); expect(screen.queryByText('Filtro sintético')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recibir unidades/ })).not.toBeInTheDocument();
  });
  it('announces an uncertain result with its known reference and no success or rollback claim', () => {
    ui({ operation: { operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', state: 'UNKNOWN', canReplay: false }, operationMessage: 'El resultado está pendiente de comprobar.' });
    expect(screen.getByRole('status')).toHaveTextContent('Resultado incierto');
    expect(screen.getByRole('button', { name: 'Consultar resultado' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Reenviar/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/recepción confirmada|revertida/i)).not.toBeInTheDocument();
  });
  it('shows the explicit same-intent replay only when its original in-memory guard exists', async () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; const actions = ui({ operation: { operationId: id, state: 'UNKNOWN', canReplay: true } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reenviar la misma operación' })); expect(actions.onReplay).toHaveBeenCalledWith(id);
  });
  it('associates validation errors with inputs and moves focus to the first invalid field', async () => {
    const actions = ui(); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(screen.getByLabelText('Código del producto')).toHaveFocus(); expect(actions.onCreate).not.toHaveBeenCalled();
  });
  it('renders bounded movement history without actor emails or prices', async () => {
    ui({ movementProduct: product, movements: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', quantity: '2', recordedAt: '2026-10-13T12:00:00.000Z', operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', actorEmail: 'PRIVATE@example.test', price: '99' }] });
    expect(screen.getByRole('heading', { name: 'Movimientos de Filtro sintético' })).toBeInTheDocument();
    expect(screen.queryByText('PRIVATE@example.test')).not.toBeInTheDocument(); expect(screen.queryByText('99')).not.toBeInTheDocument();
  });
});
