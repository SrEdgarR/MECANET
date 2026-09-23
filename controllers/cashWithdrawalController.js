import CashWithdrawal from '../models/CashWithdrawal.js';

// @desc    Crear nuevo retiro de caja
// @route   POST /api/cash-withdrawals
// @access  Private
export const createCashWithdrawal = async (req, res) => {
  try {
    const { amount, reason, category, notes, receiptAttached } = req.body;
    const isPrivileged = ['admin', 'desarrollador'].includes(req.user.role);

    // Validar datos
    if (!amount || !reason) {
      return res.status(400).json({ message: 'Monto y razón son requeridos' });
    }

    // Generar número de retiro
    const withdrawalNumber = await CashWithdrawal.generateWithdrawalNumber();

    // Crear retiro
    const withdrawal = await CashWithdrawal.create({
      withdrawalNumber,
      amount,
      reason,
      category: category || 'other',
      withdrawnBy: req.user._id,
      authorizedBy: isPrivileged ? req.user._id : null,
      status: isPrivileged ? 'approved' : 'pending',
      receiptAttached: receiptAttached || false,
      notes: notes || ''
    });

    // Poblar información del usuario
    await withdrawal.populate('withdrawnBy', 'fullName email');
    await withdrawal.populate('authorizedBy', 'fullName email');

    res.status(201).json(withdrawal);
  } catch (error) {
    console.error('Error al crear retiro:', error);
    res.status(500).json({ message: 'Error al crear retiro', error: error.message });
  }
};

// @desc    Obtener todos los retiros
// @route   GET /api/cash-withdrawals
// @access  Private
export const getCashWithdrawals = async (req, res) => {
  try {
    const { startDate, endDate, status, category } = req.query;

    let query = {};

    // Filtrar por fechas
    if (startDate || endDate) {
      query.withdrawalDate = {};
      if (startDate) {
        query.withdrawalDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.withdrawalDate.$lte = end;
      }
    }

    // Filtrar por estado
    if (status) {
      query.status = status;
    }

    // Filtrar por categoría
    if (category) {
      query.category = category;
    }

    const canManageWithdrawals = ['admin', 'desarrollador'].includes(req.user.role);

    // Si no es admin/desarrollador, solo ver sus propios retiros
    if (!canManageWithdrawals) {
      query.withdrawnBy = req.user._id;
    }

    const withdrawals = await CashWithdrawal.find(query)
      .populate('withdrawnBy', 'fullName email')
      .populate('authorizedBy', 'fullName email')
      .sort({ withdrawalDate: -1 });

    // Calcular totales
    const totalAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);
    const byStatus = {
      pending: withdrawals.filter(w => w.status === 'pending').length,
      approved: withdrawals.filter(w => w.status === 'approved').length,
      rejected: withdrawals.filter(w => w.status === 'rejected').length
    };

    res.json({
      withdrawals,
      summary: {
        total: withdrawals.length,
        totalAmount,
        byStatus
      }
    });
  } catch (error) {
    console.error('Error al obtener retiros:', error);
    res.status(500).json({ message: 'Error al obtener retiros', error: error.message });
  }
};

// @desc    Obtener retiro por ID
// @route   GET /api/cash-withdrawals/:id
// @access  Private
export const getCashWithdrawalById = async (req, res) => {
  try {
    const withdrawal = await CashWithdrawal.findById(req.params.id)
      .populate('withdrawnBy', 'fullName email')
      .populate('authorizedBy', 'fullName email');

    if (!withdrawal) {
      return res.status(404).json({ message: 'Retiro no encontrado' });
    }

    // Verificar permisos
    const canManageWithdrawals = ['admin', 'desarrollador'].includes(req.user.role);
    if (!canManageWithdrawals && withdrawal.withdrawnBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'No autorizado para ver este retiro' });
    }

    res.json(withdrawal);
  } catch (error) {
    console.error('Error al obtener retiro:', error);
    res.status(500).json({ message: 'Error al obtener retiro', error: error.message });
  }
};

// @desc    Actualizar estado de retiro (aprobar/rechazar)
// @route   PATCH /api/cash-withdrawals/:id
// @access  Private (Admin only)
export const updateCashWithdrawalStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    // Solo admin/desarrollador puede actualizar estados
    if (!['admin', 'desarrollador'].includes(req.user.role)) {
      return res.status(403).json({ message: 'No autorizado. Solo administradores pueden aprobar/rechazar retiros' });
    }

    const withdrawal = await CashWithdrawal.findById(req.params.id);

    if (!withdrawal) {
      return res.status(404).json({ message: 'Retiro no encontrado' });
    }

    // Actualizar estado
    withdrawal.status = status;
    if (status === 'approved') {
      withdrawal.authorizedBy = req.user._id;
    }
    if (notes) {
      withdrawal.notes = notes;
    }

    await withdrawal.save();

    await withdrawal.populate('withdrawnBy', 'fullName email');
    await withdrawal.populate('authorizedBy', 'fullName email');

    res.json(withdrawal);
  } catch (error) {
    console.error('Error al actualizar retiro:', error);
    res.status(500).json({ message: 'Error al actualizar retiro', error: error.message });
  }
};

// @desc    Eliminar retiro
// @route   DELETE /api/cash-withdrawals/:id
// @access  Private (Admin only)
export const deleteCashWithdrawal = async (req, res) => {
  try {
    // Solo admin/desarrollador puede eliminar
    if (!['admin', 'desarrollador'].includes(req.user.role)) {
      return res.status(403).json({ message: 'No autorizado. Solo administradores pueden eliminar retiros' });
    }

    const withdrawal = await CashWithdrawal.findById(req.params.id);

    if (!withdrawal) {
      return res.status(404).json({ message: 'Retiro no encontrado' });
    }

    await withdrawal.deleteOne();

    res.json({ message: 'Retiro eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar retiro:', error);
    res.status(500).json({ message: 'Error al eliminar retiro', error: error.message });
  }
};
