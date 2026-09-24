import express from 'express';
import User from '../models/User.js';
import RoleSectionAccess from '../models/RoleSectionAccess.js';
import AuditLogService from '../services/auditLogService.js';
import { protect } from '../middleware/authMiddleware.js';
import { developerOnly } from '../middleware/sectionAccessMiddleware.js';
import { SECTIONS, SECTION_KEYS, DEFAULT_ROLE_SECTIONS, getRoleSections, validSections } from '../services/sectionAccess.js';

const router = express.Router();
const sectionNames = Object.fromEntries(SECTIONS);
const named = keys => keys.map(key => sectionNames[key] || key);
router.use(protect, developerOnly);

router.get('/', async (req, res, next) => {
  try {
    res.json({
      sections: SECTIONS.map(([key, label]) => ({ key, label })),
      roles: {
        admin: await getRoleSections('admin'),
        cajero: await getRoleSections('cajero')
      },
      defaults: DEFAULT_ROLE_SECTIONS
    });
  } catch (error) { next(error); }
});

router.put('/roles/:role', async (req, res, next) => {
  try {
    const { role } = req.params;
    if (!['admin', 'cajero'].includes(role) || !validSections(req.body.sections)) {
      return res.status(400).json({ message: 'Permisos de rol inválidos' });
    }
    const sections = SECTION_KEYS.filter(key => req.body.sections.includes(key));
    const previous = await getRoleSections(role);
    const saved = await RoleSectionAccess.findOneAndUpdate(
      { role }, { $set: { sections } }, { upsert: true, new: true, runValidators: true }
    );
    if (JSON.stringify(previous) !== JSON.stringify(saved.sections)) {
      await AuditLogService.log({
        user: req.user, module: 'usuarios', action: 'Cambio de Permisos',
        entity: { type: 'Configuración', id: saved._id, name: `Permisos del rol ${role}` },
        description: `Se modificaron los accesos del rol ${role}`,
        changes: [{ field: 'sections', fieldLabel: 'Secciones habilitadas', oldValue: named(previous), newValue: named(saved.sections) }], req
      });
    }
    res.json({ role, sections: saved.sections });
  } catch (error) { next(error); }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const { enabled, disabled } = req.body;
    if (!validSections(enabled) || !validSections(disabled) || enabled.some(key => disabled.includes(key))) {
      return res.status(400).json({ message: 'Excepciones individuales inválidas' });
    }
    const orderedEnabled = SECTION_KEYS.filter(key => enabled.includes(key));
    const orderedDisabled = SECTION_KEYS.filter(key => disabled.includes(key));
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (user.role === 'desarrollador') return res.status(400).json({ message: 'El desarrollador conserva acceso total' });
    const previous = user.sectionOverrides?.toObject?.() || { enabled: [], disabled: [] };
    user.sectionOverrides = { enabled: orderedEnabled, disabled: orderedDisabled };
    await user.save();
    if (JSON.stringify(previous) !== JSON.stringify({ enabled: orderedEnabled, disabled: orderedDisabled })) {
      await AuditLogService.logUser({
        user: req.user, action: 'Cambio de Permisos', targetUserId: user._id,
        targetUserName: user.name, description: `Se modificaron los accesos de ${user.name}`,
        changes: [
          { field: 'enabled', fieldLabel: 'Accesos concedidos', oldValue: named(previous.enabled || []), newValue: named(orderedEnabled) },
          { field: 'disabled', fieldLabel: 'Accesos denegados', oldValue: named(previous.disabled || []), newValue: named(orderedDisabled) }
        ], req
      });
    }
    res.json({ _id: user._id, sectionOverrides: user.sectionOverrides });
  } catch (error) { next(error); }
});

export default router;
