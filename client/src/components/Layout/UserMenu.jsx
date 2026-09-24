import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { updateProfile } from '../../services/api';

const UserMenu = () => {
  const navigate = useNavigate();
  const { user, logout, setAuth } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [updatingShortcuts, setUpdatingShortcuts] = useState(false);
  const shortcutsActive = user?.shortcutsEnabled !== false;

  const toggleShortcuts = async () => {
    try {
      setUpdatingShortcuts(true);
      const { data } = await updateProfile({ shortcutsEnabled: !shortcutsActive });
      const { token, ...profile } = data;
      setAuth(profile, token || useAuthStore.getState().token);
      toast.success(shortcutsActive ? 'Atajos desactivados' : 'Atajos activados');
    } catch (error) {
      toast.error(error.response?.data?.message || 'No se pudo actualizar la preferencia');
    } finally {
      setUpdatingShortcuts(false);
    }
  };

  return (
    <div className="relative border-t border-gray-200 dark:border-gray-700 p-3">
      {open && <button type="button" aria-label="Cerrar menú de usuario" className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
      {open && (
        <div className="absolute bottom-full left-2 right-2 z-50 mb-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl p-2">
          <div className="px-2 py-2 border-b border-gray-200 dark:border-gray-700">
            <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
          </div>
          <label className="flex items-center justify-between gap-3 px-2 py-3 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
            <span>Atajos de teclado</span>
            <input type="checkbox" checked={shortcutsActive} onChange={toggleShortcuts} disabled={updatingShortcuts} aria-label="Atajos de teclado" />
          </label>
          <button type="button" onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
            <LogOut className="w-4 h-4" />Cerrar sesión
          </button>
        </div>
      )}
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
        className="w-full flex items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800">
        <div className="w-9 h-9 shrink-0 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-semibold">
          {user?.name?.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">{user?.role}</p>
        </div>
        <ChevronUp className="w-4 h-4 text-gray-500" />
      </button>
    </div>
  );
};

export default UserMenu;
