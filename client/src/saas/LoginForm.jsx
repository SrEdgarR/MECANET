import React, { useState } from 'react';

export function LoginForm({ busy, message, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  function submit(event) {
    event.preventDefault();
    if (busy) return;
    const submittedPassword = password;
    setPassword('');
    onLogin(email.trim(), submittedPassword);
  }
  return <form className="login-form" onSubmit={submit} aria-busy={busy}>
    {message && <p id="login-error" role="alert" className="notice notice-error">{message}</p>}
    <div className="field">
      <label htmlFor="login-email">Correo electrónico</label>
      <input id="login-email" type="email" autoComplete="username" maxLength={254} required
        value={email} onChange={event => setEmail(event.target.value)} disabled={busy}
        aria-describedby={message ? 'login-error' : undefined} spellCheck="false" autoCapitalize="none" />
    </div>
    <div className="field">
      <label htmlFor="login-password">Contraseña</label>
      <input id="login-password" type="password" autoComplete="current-password" maxLength={512} required
        value={password} onChange={event => setPassword(event.target.value)} disabled={busy}
        aria-describedby={message ? 'login-error' : undefined} />
    </div>
    <button className="primary" type="submit" disabled={busy}>{busy ? 'Verificando acceso…' : 'Iniciar sesión'}</button>
    <p className="muted small">Usa la cuenta asignada para acceder a tus empresas.</p>
  </form>;
}
