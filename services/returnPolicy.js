const productId = value => String(value?._id ?? value ?? '');
const invalid = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };

// Allocate the amount actually paid, including both item and invoice discounts.
// Keeping cents as integers prevents several partial refunds exceeding that amount.
export function getReturnBalances(sale, previous = []) {
  const sold = new Map();
  let netSubtotal = 0;
  for (const item of sale.items) {
    const id = productId(item.product);
    if (!id || !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
        !Number.isFinite(item.subtotal) || item.subtotal < 0) invalid('La venta contiene datos inválidos');
    const group = sold.get(id) || { quantity: 0, net: 0, returned: 0, refunded: 0 };
    group.quantity += item.quantity;
    group.net += item.subtotal;
    netSubtotal += item.subtotal;
    sold.set(id, group);
  }
  if (!Number.isFinite(sale.total) || sale.total < 0 || sale.total > netSubtotal + 0.01) {
    invalid('El total de la venta no es válido');
  }
  const paidCents = Math.round(sale.total * 100);
  if (!Number.isSafeInteger(paidCents)) invalid('El importe excede el límite permitido');
  let cumulative = 0;
  let allocated = 0;
  for (const group of sold.values()) {
    cumulative += group.net;
    const allocation = netSubtotal ? Math.round(paidCents * cumulative / netSubtotal) : 0;
    group.paid = allocation - allocated;
    allocated = allocation;
  }
  for (const record of previous) {
    for (const item of record.items) {
      const group = sold.get(productId(item.product));
      if (!group) invalid('Una devolución anterior no coincide con la venta');
      group.returned += item.quantity;
      group.refunded += Math.round(item.returnAmount * 100);
    }
  }
  return sold;
}

export function calculateReturn(sale, requested, previous = [], defective = false) {
  if (sale.status !== 'Completada') invalid('La venta ya está cancelada o devuelta');
  if (!Array.isArray(requested) || !requested.length) invalid('Debe indicar productos para devolver');
  const sold = getReturnBalances(sale, previous);
  const seen = new Set();
  let totalCents = 0;
  const items = requested.map(item => {
    const id = productId(item.productId ?? item.product);
    const quantity = Number(item.quantity);
    const group = sold.get(id);
    if (!group || seen.has(id) || !Number.isSafeInteger(quantity) || quantity < 1) {
      invalid('Producto duplicado o cantidad de devolución inválida');
    }
    seen.add(id);
    if (!Number.isSafeInteger(group.returned) || !Number.isSafeInteger(group.refunded) ||
        group.returned < 0 || group.refunded < 0 || group.refunded > group.paid ||
        quantity > group.quantity - group.returned) invalid('La cantidad o el importe ya fueron devueltos');
    const remaining = group.paid - group.refunded;
    const cents = quantity === group.quantity - group.returned
      ? remaining : Math.min(remaining, Math.floor(group.paid * quantity / group.quantity));
    totalCents += cents;
    return { product: id, quantity, originalPrice: group.paid / 100 / group.quantity,
      returnAmount: cents / 100, isDefective: defective };
  });
  return { items, totalAmount: totalCents / 100 };
}

export function exchangePrice(product, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || product.stock < quantity) {
    invalid('Cantidad o stock de cambio insuficiente');
  }
  const price = product.sellingPrice * (1 - (product.discountPercentage || 0) / 100);
  if (!Number.isFinite(price) || price < 0) invalid('Precio de cambio inválido');
  return Math.round(price * 100) / 100;
}
