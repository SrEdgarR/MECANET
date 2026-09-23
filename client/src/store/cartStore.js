/**
 * @file cartStore.js
 * @description Store del carrito de compras (POS) con Zustand
 * 
 * Maneja el estado del carrito durante el proceso de facturación:
 * - items: Array de productos con cantidad y descuento personalizado
 * - selectedCustomer: Cliente seleccionado para la venta
 * 
 * Acciones:
 * - addItem(product, quantity): Agregar producto al carrito
 * - removeItem(productId): Eliminar producto del carrito
 * - updateQuantity(productId, quantity): Cambiar cantidad de producto
 * - updateDiscount(productId, discount): Aplicar descuento personalizado
 * - setCustomer(customer): Seleccionar cliente para la venta
 * - clearCart(): Limpiar carrito después de completar venta
 * 
 * Cálculos:
 * - getSubtotal(): Suma de precio * cantidad de todos los items
 * - getTotalDiscount(): Suma de descuentos (producto + personalizados)
 * - getTotal(): Subtotal - descuentos totales
 * 
 * Uso en Billing.jsx:
 * const { items, addItem, clearCart, getTotal } = useCartStore();
 */

import { create } from 'zustand';

export const useCartStore = create((set, get) => ({
  items: [],
  selectedCustomer: null,

  addItem: (product, quantity = 1) => {
    const { items } = get();
    const existingItem = items.find((item) => item.product._id === product._id);

    if (existingItem) {
      set({
        items: items.map((item) =>
          item.product._id === product._id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        ),
      });
    } else {
      set({
        items: [
          ...items,
          {
            product,
            quantity,
            customDiscount: 0,
          },
        ],
      });
    }
  },

  removeItem: (productId) => {
    set({
      items: get().items.filter((item) => item.product._id !== productId),
    });
  },

  updateQuantity: (productId, quantity) => {
    // Permitir strings vacíos temporalmente durante la edición
    if (quantity === '' || quantity === null || quantity === undefined) {
      set({
        items: get().items.map((item) =>
          item.product._id === productId ? { ...item, quantity: '' } : item
        ),
      });
      return;
    }

    const qty = typeof quantity === 'string' ? parseInt(quantity) : quantity;
    
    // Solo eliminar si es explícitamente 0 o menor
    if (qty <= 0) {
      get().removeItem(productId);
      return;
    }

    set({
      items: get().items.map((item) =>
        item.product._id === productId ? { ...item, quantity: qty } : item
      ),
    });
  },

  updateDiscount: (productId, discount) => {
    set({
      items: get().items.map((item) =>
        item.product._id === productId
          ? { ...item, customDiscount: discount }
          : item
      ),
    });
  },

  setCustomer: (customer) => {
    set({ selectedCustomer: customer });
  },

  clearCart: () => {
    set({ items: [], selectedCustomer: null });
  },

  getSubtotal: () => {
    return get().items.reduce((sum, item) => {
      return sum + item.product.sellingPrice * item.quantity;
    }, 0);
  },

  getTotalDiscount: () => {
    return get().items.reduce((sum, item) => {
      const productDiscount = item.product.discountPercentage || 0;
      const customDiscount = item.customDiscount || 0;
      const totalDiscount = productDiscount + customDiscount;
      const discountAmount =
        (item.product.sellingPrice * item.quantity * totalDiscount) / 100;
      return sum + discountAmount;
    }, 0);
  },

  getTotal: () => {
    return get().getSubtotal() - get().getTotalDiscount();
  },
}));
