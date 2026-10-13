import React from 'react';

export function Catalog({ state, onNext, onRefresh, onCompanies }) {
  return <>
    <div className="catalog-tools">
      <div><p className="eyebrow">Empresa seleccionada</p><p className="company-name">{state.tenant.name}</p></div>
      <div className="button-row">
        <button type="button" onClick={onCompanies}>Cambiar empresa</button>
        <button type="button" onClick={onRefresh}>Actualizar catálogo</button>
      </div>
    </div>
    {state.items.length === 0 ? <p className="empty" role="status">Este catálogo todavía no tiene productos.</p>
      : <div className="table-region" role="region" aria-label="Productos del catálogo" tabIndex={0}>
        <table><caption className="sr-only">Catálogo de {state.tenant.name}. Solo lectura.</caption>
          <thead><tr><th scope="col">Código</th><th scope="col">Nombre</th></tr></thead>
          <tbody>{state.items.map(product => <tr key={product.id}><td className="sku">{product.sku}</td><td>{product.name}</td></tr>)}</tbody>
        </table>
      </div>}
    <div className="pagination">
      <p className="muted small">{state.items.length} {state.items.length === 1 ? 'producto en esta página' : 'productos en esta página'}</p>
      <button type="button" onClick={onNext} disabled={!state.nextCursor}>Página siguiente <span aria-hidden="true">→</span></button>
    </div>
  </>;
}
