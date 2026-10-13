import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createSaasClient } from './client.js';
import { LoginForm } from './LoginForm.jsx';
import { Catalog } from './Catalog.jsx';
import { RetryAccess } from './RetryAccess.jsx';
import { Inventory } from './Inventory.jsx';

const route = () => /^\/app\/([0-9a-f-]+)\/(catalogo|inventario)\/?$/i.exec(window.location.pathname);
const defaultView = tenant => tenant.permissions?.includes('catalog.read') ? 'catalog' : 'inventory';
const pathFor = (tenant, view = defaultView(tenant)) => `/app/${tenant.id}/${view === 'inventory' ? 'inventario' : 'catalogo'}`;
const titles = {
  starting: 'Comprobando acceso', login: 'Iniciar sesión', tenants: 'Tus empresas',
  'loading-tenants': 'Cargando empresas', catalog: 'Catálogo', 'loading-catalog': 'Cargando catálogo',
  inventory: 'Inventario', 'loading-inventory': 'Cargando inventario',
  expired: 'Sesión terminada', denied: 'Acceso no disponible', limited: 'Límite temporal',
  unavailable: 'Servicio no disponible', 'logging-out': 'Cerrando sesión', 'logout-uncertain': 'Cierre sin confirmar',
};
const errors = new Set(['expired', 'denied', 'limited', 'unavailable', 'logout-uncertain']);
function replacePath(path) {
  if (window.location.pathname !== path) window.history.replaceState(null, '', path);
}

export function SaasApp({ client: suppliedClient }) {
  const [client] = useState(() => suppliedClient || createSaasClient());
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const heading = useRef(null);
  const loading = ['starting', 'loading-tenants', 'loading-catalog', 'loading-inventory', 'logging-out'].includes(state.phase);
  const title = titles[state.phase];

  useEffect(() => {
    const revalidate = () => { const match = route(); client.start(match?.[1], match?.[2] === 'inventario' ? 'inventory' : 'catalog'); };
    revalidate();
    window.addEventListener('popstate', revalidate);
    return () => { window.removeEventListener('popstate', revalidate); client.dispose(); };
  }, [client]);

  useEffect(() => {
    document.title = `${title} · Mecanet`;
    heading.current?.focus();
    if (state.phase === 'login' || state.phase === 'expired') replacePath('/login');
    if (state.phase === 'tenants') replacePath('/cuenta/empresas');
    if (state.phase === 'catalog') replacePath(`/app/${state.tenant.id}/catalogo`);
    if (state.phase === 'inventory') replacePath(pathFor(state.tenant, 'inventory'));
  }, [state.phase, state.tenant?.id, title]);

  function openCompany(event, tenant, view = defaultView(tenant)) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, '', pathFor(tenant, view));
    if (view === 'inventory') client.selectInventory(tenant.id); else client.selectTenant(tenant.id);
  }
  function companies() {
    window.history.pushState(null, '', '/cuenta/empresas');
    client.showTenants();
  }

  return <div className="saas-shell">
    <a className="skip-link" href="#main-content">Saltar al contenido</a>
    <header className="app-header">
      <div className="brand"><span className="brand-mark" aria-hidden="true">M</span><span>Mecanet</span></div>
      <div className="header-actions">
        <span className="environment-label">Acceso privado</span>
        {state.canLogout && state.phase !== 'logging-out' && <button type="button" className="quiet" onClick={() => client.logout()}>Cerrar sesión</button>}
      </div>
    </header>

    <main id="main-content" className={state.phase === 'login' ? 'content login-content' : 'content'}>
      <div className="page-heading">
        <p className="eyebrow">{state.phase === 'login' ? 'Bienvenido a Mecanet' : 'Espacio de trabajo'}</p>
        <h1 ref={heading} tabIndex={-1}>{title}</h1>
        {state.phase === 'login' && <p className="muted">Accede de forma segura a tu espacio de trabajo.</p>}
        {state.user && <p className="muted identity">{state.user.email}</p>}
      </div>

      {loading && <div className="loading-state" role="status" aria-busy="true"><span className="loading-line" aria-hidden="true" /><p>{title}…</p></div>}
      {state.phase === 'login' && <LoginForm busy={state.busy} message={state.message} onLogin={client.login} />}
      {state.phase === 'tenants' && <section aria-label="Empresas disponibles">
        <p className="section-intro">Selecciona una empresa para acceder a tu espacio de trabajo.</p>
        {state.tenants.length ? <ul className="tenant-list">{state.tenants.map(tenant => <li key={tenant.id}>
          <a href={pathFor(tenant)} onClick={event => openCompany(event, tenant)}>
            <span><span className="tenant-name">{tenant.name}</span><span className="muted small">{defaultView(tenant) === 'catalog' ? 'Consultar catálogo' : 'Abrir inventario'}</span></span><span aria-hidden="true">→</span>
          </a>
        </li>)}</ul> : <p className="empty" role="status">No tienes empresas disponibles.</p>}
      </section>}
      {state.phase === 'catalog' && <>
        {state.tenant.permissions.some(action => ['inventory.read', 'catalog.create', 'inventory.receive'].includes(action)) && <p><a href={pathFor(state.tenant, 'inventory')} onClick={event => openCompany(event, state.tenant, 'inventory')}>Abrir inventario</a></p>}
        <Catalog state={state} onNext={client.nextPage} onCompanies={companies} onRefresh={() => client.selectTenant(state.tenant.id)} />
      </>}
      {state.phase === 'inventory' && <Inventory key={`${state.user.id}:${state.tenant.id}:${state.tenant.dataEpoch}`} state={state}
        onCreate={client.createProduct} onReceive={client.receiveStock} onLookup={client.lookupOperation} onReplay={client.resendOperation}
        onNext={client.nextInventoryPage} onMovements={client.readMovements} onMovementNext={client.nextMovementPage}
        onOperationsNext={client.nextOperationsPage}
        onCompanies={companies} onRefresh={() => client.selectInventory(state.tenant.id)} />}
      {errors.has(state.phase) && <section className="error-state">
        <p className="notice notice-error" role="alert">{state.message}</p>
        {state.phase === 'expired' ? <button type="button" className="primary" onClick={() => client.start()}>Iniciar sesión</button>
          : state.phase === 'logout-uncertain' ? <button type="button" className="primary" onClick={client.logout}>Reintentar cierre</button>
            : <RetryAccess retryAt={state.retryAt} onRetry={() => client.start()} />}
      </section>}
    </main>
    <footer className="app-footer"><span>Mecanet</span><span>{['inventory', 'loading-inventory'].includes(state.phase) ? 'Inventario privado' : 'Catálogo de solo lectura'}</span></footer>
  </div>;
}
