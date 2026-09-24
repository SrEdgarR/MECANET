/**
 * @file Users.jsx
 * @description Gestión de usuarios del sistema (CRUD completo, solo admin/desarrollador)
 * 
 * Responsabilidades:
 * - Listar usuarios con búsqueda y filtro por rol
 * - Crear nuevo usuario (modal, solo admin/desarrollador)
 * - Editar usuario existente (modal, solo admin/desarrollador)
 * - Eliminar usuario (con confirmación, solo admin/desarrollador)
 * - Toggle de estado activo/inactivo
 * - Prevenir que admin se elimine a sí mismo
 * 
 * Estados:
 * - users: Array de usuarios desde backend
 * - filteredUsers: Array filtrado por searchTerm y filterRole
 * - searchTerm: Búsqueda por nombre, email
 * - filterRole: 'all', 'admin', 'desarrollador', 'cajero'
 * - showUserModal: Boolean para modal crear/editar
 * - editingUser: Usuario en edición o null para crear
 * - showPassword: Boolean para toggle de visibilidad de password
 * 
 * Form Data:
 * - name: Nombre completo (requerido)
 * - email: Email único (requerido)
 * - password: Solo requerido al crear, opcional al editar
 * - role: 'admin', 'desarrollador' o 'cajero' (requerido)
 * - isActive: Boolean (por defecto true)
 * 
 * APIs:
 * - GET /api/users (solo admin/desarrollador)
 * - POST /api/users (solo admin/desarrollador)
 * - PUT /api/users/:id (solo admin/desarrollador)
 * - DELETE /api/users/:id (solo admin/desarrollador)
 * 
 * Validaciones:
 * - Email único (backend valida)
 * - Contraseña mínima de 12 caracteres al crear
 * - No puede eliminar al usuario actual (currentUser._id)
 * 
 * UI Features:
 * - Tabla con skeleton loader
 * - Badge de rol (admin=rojo, cajero=azul)
 * - Badge de estado (activo=verde, inactivo=gris)
 * - Filtro por rol
 * - Modal con visibilidad y generador seguro de contraseña
 * - Confirmación antes de eliminar
 * - Prevención de auto-eliminación
 */

import React, { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser, getSectionPermissions, updateRoleSections, updateUserSections } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { UsersSkeleton } from '../components/SkeletonLoader';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  User,
  Mail,
  Shield,
  ShieldCheck,
  X,
  Check,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Users as UsersIcon,
  Info,
} from 'lucide-react';
import { createPortal } from 'react-dom';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [accessTarget, setAccessTarget] = useState(null);
  const [permissionCatalog, setPermissionCatalog] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [filterRole, setFilterRole] = useState('all');
  const [showTooltip, setShowTooltip] = useState(null);
  const { user: currentUser } = useAuthStore();
  const canManageDevelopers = currentUser?.role === 'desarrollador';

  const openPermissions = async (target) => {
    try {
      const { data } = await getSectionPermissions();
      setPermissionCatalog(data);
      setAccessTarget(target);
    } catch (error) {
      toast.error(error.response?.data?.message || 'No se pudieron cargar los permisos');
    }
  };

  const savePermissions = async (target, value) => {
    if (target.type === 'role') await updateRoleSections(target.role, value);
    else await updateUserSections(target.user._id, value);
    await fetchUsers();
    setAccessTarget(null);
    toast.success('Accesos actualizados');
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, filterRole]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const response = await getUsers();
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Error al cargar usuarios');
    } finally {
      setIsLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = [...users];

    // Filtrar por búsqueda
    if (searchTerm) {
      filtered = filtered.filter(
        (user) =>
          user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtrar por rol
    if (filterRole !== 'all') {
      filtered = filtered.filter((user) => user.role === filterRole);
    }

    setFilteredUsers(filtered);
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = (user) => {
    if (user.role === 'desarrollador' && !canManageDevelopers) {
      toast.error('Solo un desarrollador puede editar este usuario');
      return;
    }
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleDeleteUser = async (userId) => {
    if (userId === currentUser._id) {
      toast.error('No puedes eliminar tu propia cuenta');
      return;
    }

    const targetUser = users.find((u) => u._id === userId);
    if (targetUser?.role === 'desarrollador' && !canManageDevelopers) {
      toast.error('Solo un desarrollador puede eliminar a otro desarrollador');
      return;
    }

    if (!window.confirm('¿Está seguro de eliminar este usuario?')) {
      return;
    }

    try {
      await deleteUser(userId);
      toast.success('Usuario eliminado exitosamente');
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(error.response?.data?.message || 'Error al eliminar usuario');
    }
  };

  const handleSaveUser = async (userData) => {
    try {
      if (editingUser) {
        await updateUser(editingUser._id, userData);
        toast.success('Usuario actualizado exitosamente');
      } else {
        await createUser(userData);
        toast.success('Usuario creado exitosamente');
      }
      setShowUserModal(false);
      fetchUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      toast.error(error.response?.data?.message || 'Error al guardar usuario');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getRoleBadge = (role) => {
    if (role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
          <ShieldCheck className="w-3 h-3" />
          Administrador
        </span>
      );
    }

    if (role === 'desarrollador') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-300">
          <ShieldCheck className="w-3 h-3" />
          Desarrollador
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
        <Shield className="w-3 h-3" />
        Cajero
      </span>
    );
  };

  const getAdminCount = () => users.filter(u => u.role === 'admin').length;
  const getDeveloperCount = () => users.filter(u => u.role === 'desarrollador').length;
  const getCajeroCount = () => users.filter(u => u.role === 'cajero').length;

  // Mostrar skeleton mientras carga
  if (isLoading && users.length === 0) {
    return <UsersSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gestión de Usuarios</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Administra los usuarios del sistema
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageDevelopers && <button onClick={() => openPermissions({ type: 'role', role: 'admin' })} className="btn-secondary flex items-center gap-2">
            <Shield className="w-5 h-5" /> Accesos por rol
          </button>}
          <button onClick={handleAddUser} className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" /> Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Usuarios</p>
                <div className="relative">
                  <Info
                    className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                    onMouseEnter={() => setShowTooltip('totalUsuarios')}
                    onMouseLeave={() => setShowTooltip(null)}
                  />
                  {showTooltip === 'totalUsuarios' && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                      Cantidad total de usuarios registrados en el sistema
                    </div>
                  )}
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{users.length}</p>
            </div>
            <UsersIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
        </div>

        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">Administradores</p>
                <div className="relative">
                  <Info
                    className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                    onMouseEnter={() => setShowTooltip('administradores')}
                    onMouseLeave={() => setShowTooltip(null)}
                  />
                  {showTooltip === 'administradores' && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                      Acceso según los permisos configurados para administradores
                    </div>
                  )}
                </div>
              </div>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{getAdminCount()}</p>
            </div>
            <ShieldCheck className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
        </div>

        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">Desarrolladores</p>
                <div className="relative">
                  <Info
                    className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                    onMouseEnter={() => setShowTooltip('desarrolladores')}
                    onMouseLeave={() => setShowTooltip(null)}
                  />
                  {showTooltip === 'desarrolladores' && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                      Usuarios con acceso total y herramientas técnicas
                    </div>
                  )}
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{getDeveloperCount()}</p>
            </div>
            <ShieldCheck className="w-8 h-8 text-teal-500 dark:text-teal-300" />
          </div>
        </div>

        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">Cajeros</p>
                <div className="relative">
                  <Info
                    className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                    onMouseEnter={() => setShowTooltip('cajeros')}
                    onMouseLeave={() => setShowTooltip(null)}
                  />
                  {showTooltip === 'cajeros' && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                      Acceso según los permisos configurados para cajeros
                    </div>
                  )}
                </div>
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{getCajeroCount()}</p>
            </div>
            <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card-glass p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="input"
          >
            <option value="all">Todos los roles</option>
            <option value="admin">Administradores</option>
            <option value="desarrollador">Desarrolladores</option>
            <option value="cajero">Cajeros</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Fecha de Registro
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    {searchTerm || filterRole !== 'all' ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user._id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                          <span className="text-white font-semibold">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-3">
                          <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            {user.name}
                            {user._id === currentUser._id && (
                              <span className="text-xs text-primary-600 dark:text-primary-400">(Tú)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <Mail className="w-4 h-4 mr-1" />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {(() => {
                        const isDeveloperRow = user.role === 'desarrollador';
                        const canModifyRow = !isDeveloperRow || canManageDevelopers;
                        const isSelf = user._id === currentUser._id;

                        return (
                          <>
                            <button
                              onClick={() => handleEditUser(user)}
                              className={`text-primary-600 hover:text-primary-700 dark:text-primary-400 ${!canModifyRow ? 'opacity-30 cursor-not-allowed' : ''}`}
                              title={canModifyRow ? 'Editar' : 'Solo un desarrollador puede editar'}
                              disabled={!canModifyRow}
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            {canManageDevelopers && user.role !== 'desarrollador' && <button
                              onClick={() => openPermissions({ type: 'user', user })}
                              className="text-teal-600 hover:text-teal-700 dark:text-teal-400"
                              title={`Configurar accesos de ${user.name}`}
                              aria-label={`Configurar accesos de ${user.name}`}>
                              <Shield className="w-5 h-5" />
                            </button>}
                            <button
                              onClick={() => handleDeleteUser(user._id)}
                              className={`text-red-600 hover:text-red-700 dark:text-red-400 ${!canModifyRow || isSelf ? 'opacity-30 cursor-not-allowed' : ''}`}
                              title={canModifyRow ? 'Eliminar' : 'Solo un desarrollador puede eliminar'}
                              disabled={!canModifyRow || isSelf}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal */}
      {showUserModal && (
        <UserModal
          user={editingUser}
          onSave={handleSaveUser}
          onClose={() => setShowUserModal(false)}
          canManageDevelopers={canManageDevelopers}
        />
      )}
      {accessTarget && permissionCatalog && <SectionPermissionsModal
        target={accessTarget} catalog={permissionCatalog}
        onSave={savePermissions} onClose={() => setAccessTarget(null)} />}
    </div>
  );
};

const SectionPermissionsModal = ({ target, catalog, onSave, onClose }) => {
  const [role, setRole] = useState(target.role || 'admin');
  const [roleSections, setRoleSections] = useState({ admin: [...catalog.roles.admin], cajero: [...catalog.roles.cajero] });
  const [overrides, setOverrides] = useState({
    enabled: [...(target.user?.sectionOverrides?.enabled || [])],
    disabled: [...(target.user?.sectionOverrides?.disabled || [])]
  });
  const [saving, setSaving] = useState(false);
  const isRole = target.type === 'role';
  const currentRoleSections = catalog.roles[target.user?.role] || [];
  const changeUserSection = (key, choice) => setOverrides(previous => ({
    enabled: choice === 'allow' ? [...previous.enabled.filter(item => item !== key), key] : previous.enabled.filter(item => item !== key),
    disabled: choice === 'deny' ? [...previous.disabled.filter(item => item !== key), key] : previous.disabled.filter(item => item !== key)
  }));

  const submit = async () => {
    try {
      setSaving(true);
      await onSave(isRole ? { type: 'role', role } : target, isRole ? roleSections[role] : overrides);
    } catch (error) {
      toast.error(error.response?.data?.message || 'No se pudieron guardar los accesos');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Configurar accesos" className="glass-strong w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{isRole ? 'Accesos por rol' : `Accesos de ${target.user.name}`}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{isRole ? 'Estos permisos se aplican a todos los usuarios del rol.' : 'Las excepciones individuales prevalecen sobre el rol.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {isRole && <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Rol
            <select className="input mt-1" value={role} onChange={event => setRole(event.target.value)}>
              <option value="admin">Administrador</option><option value="cajero">Cajero</option>
            </select>
          </label>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {catalog.sections.map(section => {
              const choice = overrides.enabled.includes(section.key) ? 'allow' : overrides.disabled.includes(section.key) ? 'deny' : 'inherit';
              return <div key={section.key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <span className="text-sm text-gray-800 dark:text-gray-200">{section.label}</span>
                {isRole ? <input type="checkbox" aria-label={`Habilitar ${section.label}`} checked={roleSections[role].includes(section.key)}
                  onChange={event => setRoleSections(previous => ({ ...previous, [role]: event.target.checked
                    ? [...previous[role], section.key] : previous[role].filter(key => key !== section.key) }))} />
                  : <select className="input w-auto min-w-28 text-sm" aria-label={`Acceso a ${section.label}`} value={choice} onChange={event => changeUserSection(section.key, event.target.value)}>
                    <option value="inherit">Heredar ({currentRoleSections.includes(section.key) ? 'Sí' : 'No'})</option>
                    <option value="allow">Permitir</option><option value="deny">Denegar</option>
                  </select>}
              </div>;
            })}
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 p-5">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={submit} disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Guardar accesos'}</button>
        </div>
      </div>
    </div>, document.body
  );
};

// User Modal Component
const generateSecurePassword = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte & 63]).join('');
};

const UserModal = ({ user, onSave, onClose, canManageDevelopers }) => {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'cajero',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const roleDescriptions = {
    admin: 'Acceso según los permisos del rol administrador',
    desarrollador: 'Acceso total + herramientas técnicas',
    cajero: 'Acceso según los permisos del rol cajero',
  };

  // Cerrar modal con tecla ESC
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!canManageDevelopers && formData.role === 'desarrollador') {
      setFormData((prev) => ({ ...prev, role: 'cajero' }));
    }
  }, [canManageDevelopers, formData.role]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleGeneratePassword = () => {
    try {
      const password = generateSecurePassword();
      setFormData((prev) => ({ ...prev, password }));
      setErrors((prev) => ({ ...prev, password: '' }));
      setShowPassword(true);
    } catch {
      toast.error('No se pudo generar una contraseña segura en este navegador');
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    if (!user && !formData.password) {
      newErrors.password = 'La contraseña es requerida';
    }

    if (formData.password && (formData.password.length < 12 || new TextEncoder().encode(formData.password).length > 72)) {
      newErrors.password = 'La contraseña debe tener entre 12 caracteres y 72 bytes';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Por favor corrija los errores en el formulario');
      return;
    }

    setIsLoading(true);
    try {
      // Si estamos editando y no hay contraseña, no la enviamos
      const dataToSend = { ...formData };
      if (user && !dataToSend.password) {
        delete dataToSend.password;
      }
      
      await onSave(dataToSend);
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
            {user ? 'Editar Usuario' : 'Nuevo Usuario'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-4">
          <div>
            <label htmlFor="user-form-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nombre Completo *
            </label>
            <input
              id="user-form-name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              autoComplete="off"
              className={`input ${errors.name ? 'border-red-500' : ''}`}
              placeholder="Juan Pérez"
              autoFocus
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="user-form-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email *
            </label>
            <input
              id="user-form-email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              autoComplete="off"
              className={`input ${errors.email ? 'border-red-500' : ''}`}
              placeholder="usuario@ejemplo.com"
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="user-form-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Contraseña {user ? '(dejar vacío para no cambiar)' : '*'}
            </label>
            <div className="relative">
              <input
                id="user-form-password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                className={`input pr-10 ${errors.password ? 'border-red-500' : ''}`}
                placeholder={user ? '••••••••' : 'Mínimo 12 caracteres'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <button type="button" onClick={handleGeneratePassword} className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
              Generar contraseña segura
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              La contraseña generada tiene 24 caracteres. Cópiala antes de guardar; no se mostrará después.
            </p>
            {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rol *
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="input"
            >
              <option value="cajero">Cajero</option>
              <option value="admin">Administrador</option>
              <option value="desarrollador" disabled={!canManageDevelopers}>
                Desarrollador { !canManageDevelopers ? '(solo desarrolladores pueden asignar)' : '' }
              </option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {roleDescriptions[formData.role] || roleDescriptions.cajero}
            </p>
            {!canManageDevelopers && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Solo un usuario desarrollador puede crear o asignar este rol.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={isLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  {user ? 'Actualizar' : 'Crear'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default Users;
