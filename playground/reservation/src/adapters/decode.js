// Accept own data properties only; accessors are not transport JSON fields.
export const decode = (raw) => {
  try {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
      return Object.freeze({ kind: 'InvalidInput' });
    const skuField = Object.getOwnPropertyDescriptor(raw, 'sku'),
      stockField = Object.getOwnPropertyDescriptor(raw, 'stock'),
      quantityField = Object.getOwnPropertyDescriptor(raw, 'quantity');
    if (
      !skuField ||
      !stockField ||
      !quantityField ||
      !('value' in skuField) ||
      !('value' in stockField) ||
      !('value' in quantityField)
    )
      return Object.freeze({ kind: 'InvalidInput' });
    const sku = skuField.value,
      stock = stockField.value,
      quantity = quantityField.value;
    if (
      typeof sku !== 'string' ||
      sku.trim().length === 0 ||
      !Number.isSafeInteger(stock) ||
      !Number.isSafeInteger(quantity)
    )
      return Object.freeze({ kind: 'InvalidInput' });
    return Object.freeze({
      kind: 'Decoded',
      value: Object.freeze({ sku: sku.trim(), stock, quantity })
    });
  } catch {
    return Object.freeze({ kind: 'InvalidInput' });
  }
};
