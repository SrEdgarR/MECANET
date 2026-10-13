import React, { useEffect, useRef, useState } from 'react';
import { validInventoryText } from './inventory-client.js';

const labels = { PENDING: 'Comprobando operación', UNKNOWN: 'Resultado incierto', CONFIRMED: 'Operación confirmada', REJECTED: 'Operación rechazada' };
function ProductForm({ busy, onCreate }) {
  const [sku, setSku] = useState(''); const [name, setName] = useState(''); const [errors, setErrors] = useState({});
  const codeInput = useRef(null); const nameInput = useRef(null);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const invalid = {};
    if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku.trim().toUpperCase())) invalid.sku = 'Usa un código de hasta 64 letras, números, puntos, guiones o guiones bajos.';
    if (!validInventoryText(name, 200)) invalid.name = 'Escribe un nombre válido de hasta 200 caracteres.';
    setErrors(invalid);
    if (Object.keys(invalid).length) { (invalid.sku ? codeInput : nameInput).current?.focus(); return; }
    await onCreate({ sku, name }); setSku(''); setName(''); codeInput.current?.focus();
  }
  return <section className="inventory-panel" aria-labelledby="create-heading"><h2 id="create-heading">Nuevo producto</h2>
    <p className="muted small">El producto se crea con existencia cero.</p>
    <form onSubmit={submit} noValidate aria-busy={busy} className="inventory-form">
      <div className="field"><label htmlFor="product-sku">Código del producto</label>
        <input ref={codeInput} id="product-sku" value={sku} onChange={event => setSku(event.target.value)} maxLength={128} disabled={busy}
          autoComplete="off" spellCheck="false" aria-invalid={Boolean(errors.sku)} aria-describedby={errors.sku ? 'product-sku-error' : undefined} />
        {errors.sku && <p className="field-error" id="product-sku-error">{errors.sku}</p>}</div>
      <div className="field"><label htmlFor="product-name">Nombre del producto</label>
        <input ref={nameInput} id="product-name" value={name} onChange={event => setName(event.target.value)} maxLength={400} disabled={busy}
          autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'product-name-error' : undefined} />
        {errors.name && <p className="field-error" id="product-name-error">{errors.name}</p>}</div>
      <button type="submit" className="primary" disabled={busy}>Crear producto</button>
    </form>
  </section>;
}

function ReceiptForm({ product, busy, onReceive, onCancel, readless }) {
  const [quantity, setQuantity] = useState(''); const [reason, setReason] = useState(''); const [reference, setReference] = useState(''); const [errors, setErrors] = useState({});
  const quantityInput = useRef(null); const reasonInput = useRef(null); const referenceInput = useRef(null);
  useEffect(() => { (readless ? referenceInput : quantityInput).current?.focus(); }, [product?.id, readless]);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const invalid = {}; const id = product?.id ?? reference.toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) invalid.reference = 'Introduce la referencia completa del producto.';
    if (!/^[1-9][0-9]{0,6}$/.test(quantity) || Number(quantity) > 1000000) invalid.quantity = 'Usa una cantidad entera de 1 a 1000000, sin ceros iniciales.';
    if (!validInventoryText(reason, 160)) invalid.reason = 'Escribe un motivo válido de hasta 160 caracteres.';
    setErrors(invalid);
    if (Object.keys(invalid).length) { (invalid.reference ? referenceInput : invalid.quantity ? quantityInput : reasonInput).current?.focus(); return; }
    await onReceive(id, { quantity, reason }); setQuantity(''); setReason(''); quantityInput.current?.focus();
  }
  return <section className="inventory-panel" aria-labelledby="receipt-heading"><h2 id="receipt-heading">{product ? `Recibir unidades de ${product.name}` : 'Recibir unidades'}</h2>
    <form onSubmit={submit} noValidate aria-busy={busy} className="inventory-form">
      {readless && <div className="field"><label htmlFor="receipt-reference">Referencia del producto</label><input ref={referenceInput} id="receipt-reference" value={reference} onChange={event => setReference(event.target.value)} maxLength={36} disabled={busy} aria-invalid={Boolean(errors.reference)} aria-describedby={errors.reference ? 'receipt-reference-error' : undefined} />
        {errors.reference && <p id="receipt-reference-error" className="field-error">{errors.reference}</p>}</div>}
      <div className="field"><label htmlFor="receipt-quantity">Unidades recibidas</label>
        <input ref={quantityInput} id="receipt-quantity" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} maxLength={7} disabled={busy}
          aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? 'receipt-quantity-error' : undefined} />
        {errors.quantity && <p id="receipt-quantity-error" className="field-error">{errors.quantity}</p>}</div>
      <div className="field"><label htmlFor="receipt-reason">Motivo de la recepción</label>
        <input ref={reasonInput} id="receipt-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={320} disabled={busy}
          aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? 'receipt-reason-error' : undefined} />
        {errors.reason && <p id="receipt-reason-error" className="field-error">{errors.reason}</p>}</div>
      <div className="button-row"><button className="primary" disabled={busy} type="submit">Registrar recepción</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy}>Volver a productos</button>}</div>
    </form>
  </section>;
}

function OperationStatus({ operation, message, busy, onLookup, onReplay }) {
  if (!operation) return message ? <p className="notice notice-error" role="alert">{message}</p> : null;
  const pending = operation.state === 'UNKNOWN' || operation.state === 'PENDING';
  return <section className="operation-state" role="status" aria-live="polite" aria-atomic="true">
    <h2>{labels[operation.state]}</h2><p className="operation-reference">Referencia: <span>{operation.operationId}</span></p>
    {message && <p>{message}</p>}
    {operation.state === 'CONFIRMED' && <p>El resultado está confirmado. Actualiza la lista para consultar la existencia.</p>}
    {pending && <><p>Consulta esta referencia antes de iniciar otra operación. No se reenviará automáticamente.</p><div className="button-row">
      <button type="button" disabled={busy} onClick={() => onLookup(operation.operationId)}>Consultar resultado</button>
      {operation.canReplay && <button type="button" disabled={busy} onClick={() => onReplay(operation.operationId)}>Reenviar la misma operación</button>}
    </div></>}
  </section>;
}

export function Inventory({ state, onCreate, onReceive, onCompanies, onRefresh, onNext, onMovements, onMovementNext, onOperationsNext, onLookup, onReplay }) {
  const [selected, setSelected] = useState(null); const trigger = useRef(null);
  const permits = action => state.tenant.permissions.includes(action);
  const unresolved = state.operation && ['PENDING', 'UNKNOWN'].includes(state.operation.state);
  const busy = state.writeBusy || Boolean(unresolved);
  function receive(product, event) { trigger.current = event.currentTarget; setSelected(product); }
  function cancel() { setSelected(null); queueMicrotask(() => trigger.current?.focus()); }
  return <>
    <div className="catalog-tools"><div><p className="eyebrow">Empresa seleccionada</p><p className="company-name">{state.tenant.name}</p></div>
      <div className="button-row"><button type="button" onClick={onCompanies}>Cambiar empresa</button><button type="button" onClick={onRefresh} disabled={state.writeBusy}>Actualizar inventario</button></div>
    </div>
    <OperationStatus operation={state.operation} message={state.operationMessage} busy={state.writeBusy} onLookup={onLookup} onReplay={onReplay} />
    {state.operations.filter(item => item.operationId !== state.operation?.operationId && ['PENDING', 'UNKNOWN'].includes(item.state)).length > 0
      && <section className="inventory-panel" aria-labelledby="pending-heading"><h2 id="pending-heading">Operaciones por comprobar</h2><ul className="operation-list">
        {state.operations.filter(item => item.operationId !== state.operation?.operationId && ['PENDING', 'UNKNOWN'].includes(item.state)).map(item => <li key={item.operationId}><span>{labels[item.state]}</span><span className="operation-reference">{item.operationId}</span><button type="button" disabled={state.writeBusy} onClick={() => onLookup(item.operationId)}>Consultar esta operación</button></li>)}
      </ul><button type="button" disabled={!state.operationsCursor || state.writeBusy} onClick={onOperationsNext}>Más operaciones por comprobar</button></section>}
    {permits('catalog.create') && <ProductForm busy={busy} onCreate={onCreate} />}
    {permits('inventory.receive') && (selected || !permits('inventory.read')) && <ReceiptForm key={selected?.id ?? 'reference'} product={selected} busy={busy} onReceive={onReceive} onCancel={selected ? cancel : undefined} readless={!permits('inventory.read')} />}
    {permits('inventory.read') && <section className="inventory-section" aria-labelledby="stock-heading"><h2 id="stock-heading">Existencias</h2>
      {state.items.length ? <div className="table-region" role="region" aria-label="Existencias de productos" tabIndex={0}><table><caption className="sr-only">Existencias de {state.tenant.name}</caption>
        <thead><tr><th scope="col">Código</th><th scope="col">Producto</th><th scope="col">Unidades</th><th scope="col">Acciones</th></tr></thead>
        <tbody>{state.items.map(product => <tr key={product.id}><td className="sku">{product.sku}</td><td>{product.name}</td><td className="stock-number">{product.onHand}</td><td><div className="button-row">
          {permits('inventory.receive') && <button type="button" aria-label={`Recibir unidades de ${product.name}`} disabled={state.writeBusy} onClick={event => receive(product, event)}>Recibir unidades</button>}
          <button type="button" aria-label={`Movimientos de ${product.name}`} onClick={() => onMovements(product.id)}>Movimientos</button>
        </div></td></tr>)}</tbody></table></div> : <p className="empty">Este inventario todavía no tiene productos.</p>}
      <div className="pagination"><p className="muted small">{state.items.length} productos en esta página</p><button type="button" disabled={!state.nextCursor || state.writeBusy} onClick={onNext}>Página siguiente</button></div>
    </section>}
    {permits('inventory.read') && state.movementProduct && <section className="inventory-panel" aria-labelledby="movements-heading"><h2 id="movements-heading">Movimientos de {state.movementProduct.name}</h2>
      {state.movementsLoading ? <p role="status">Cargando movimientos…</p> : state.movements.length ? <ol className="movement-list">{state.movements.map(item => <li key={item.id}>
        <span>{item.quantity} unidades recibidas</span><time dateTime={item.recordedAt}>{new Date(item.recordedAt).toLocaleString('es-DO')}</time><span className="operation-reference">Referencia: {item.operationId}</span>
      </li>)}</ol> : <p className="muted">Este producto no tiene recepciones registradas.</p>}
      <button type="button" disabled={!state.movementCursor || state.movementsLoading} onClick={onMovementNext}>Más movimientos</button>
    </section>}
  </>;
}
