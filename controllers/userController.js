import User from '../models/User.js';
import AuditLogService from '../services/auditLogService.js';
import { auditChanges } from '../services/auditChanges.js';

const userLabels = { name: 'Nombre', email: 'Email', role: 'Rol', isActive: 'Estado activo' };

// @desc    Obtener todos los usuarios
// @route   GET /api/users
// @access  Private/Admin
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
};

// @desc    Obtener un usuario por ID
// @route   GET /api/users/:id
// @access  Private/Admin
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ message: 'Error al obtener usuario', error: error.message });
  }
};

// @desc    Crear nuevo usuario
// @route   POST /api/users
// @access  Private/Admin
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (role === 'desarrollador' && req.user?.role !== 'desarrollador') {
      return res.status(403).json({ message: 'Solo un desarrollador puede crear usuarios desarrolladores' });
    }
    if (req.user.role === 'cajero' && role !== 'cajero') {
      return res.status(403).json({ message: 'No puedes asignar un rol superior al tuyo' });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: 'El email ya está registrado' });
    }

    // Crear usuario
    const user = await User.create({
      name,
      email,
      password,
      role
    });
    await AuditLogService.logUser({
      user: req.user, action: 'Creación de Usuario', targetUserId: user._id,
      targetUserName: user.name, description: `Se creó el usuario ${user.name}`,
      changes: auditChanges(null, user, userLabels), req
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      shortcutsEnabled: user.shortcutsEnabled
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ message: 'Error al crear usuario', error: error.message });
  }
};

// @desc    Actualizar usuario
// @route   PUT /api/users/:id
// @access  Private/Admin
export const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const targetIsDeveloper = user.role === 'desarrollador';
    const requesterIsDeveloper = req.user.role === 'desarrollador';
    if (req.user.role === 'cajero' && (user.role !== 'cajero' || (req.body.role && req.body.role !== 'cajero'))) {
      return res.status(403).json({ message: 'No puedes modificar usuarios con un rol superior al tuyo' });
    }

    if ((targetIsDeveloper || req.body.role === 'desarrollador') && !requesterIsDeveloper) {
      return res.status(403).json({ message: 'No puedes modificar a un desarrollador' });
    }

    // No permitir que el usuario se quite el rol de admin a sí mismo
    const isSelfUpdate = req.user._id.toString() === user._id.toString();
    if (
      isSelfUpdate &&
      req.body.role &&
      user.role === 'admin' &&
      req.body.role !== 'admin'
    ) {
      return res.status(400).json({ message: 'No puedes cambiar tu propio rol de administrador' });
    }

    const previous = user.toObject();
    // Actualizar campos
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.role = req.body.role || user.role;
    user.isActive = req.body.isActive !== undefined ? req.body.isActive : user.isActive;

    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();
    const changes = auditChanges(previous, updatedUser, userLabels);
    if (changes.length) {
      await AuditLogService.logUser({ user: req.user, action: 'Modificación de Usuario',
        targetUserId: user._id, targetUserName: user.name,
        description: `Se modificó el usuario ${user.name}`, changes, req });
    }
    if (req.body.password) {
      await AuditLogService.logUser({ user: req.user, action: 'Cambio de Contraseña',
        targetUserId: user._id, targetUserName: user.name,
        description: `Se cambió la contraseña de ${user.name}`,
        changes: [{ field: 'password', fieldLabel: 'Contraseña', oldValue: 'Protegida', newValue: 'Actualizada' }], req });
    }

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      isActive: updatedUser.isActive,
      shortcutsEnabled: updatedUser.shortcutsEnabled
    });
  } catch (error) {
    if (error.name === 'VersionError') return res.status(409).json({ message: 'Otro cambio modificó este usuario. Recarga e inténtalo nuevamente.' });
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ message: 'Error al actualizar usuario', error: error.message });
  }
};

// @desc    Eliminar usuario
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // No permitir que el usuario se elimine a sí mismo
    if (req.user._id.toString() === user._id.toString()) {
      return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta' });
    }

    if (user.role === 'desarrollador' && req.user.role !== 'desarrollador') {
      return res.status(403).json({ message: 'No puedes eliminar a un desarrollador' });
    }
    if (req.user.role === 'cajero' && user.role !== 'cajero') {
      return res.status(403).json({ message: 'No puedes eliminar usuarios con un rol superior al tuyo' });
    }

    const deleted = await User.findOneAndDelete({ _id: req.params.id,
      ...(req.user.role !== 'desarrollador' ? { role: { $ne: 'desarrollador' } } : {}) });
    if (!deleted) return res.status(409).json({ message: 'El usuario cambió. Recarga la lista antes de eliminarlo.' });

    await AuditLogService.logUser({ user: req.user, action: 'Eliminación de Usuario',
      targetUserId: deleted._id, targetUserName: deleted.name,
      description: `Se eliminó el usuario ${deleted.name}`,
      changes: auditChanges(deleted, null, userLabels), req });

    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ message: 'Error al eliminar usuario', error: error.message });
  }
};
