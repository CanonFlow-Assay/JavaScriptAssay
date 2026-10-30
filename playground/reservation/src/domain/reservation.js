// Requirement RES-001: reserve a positive safe-integer quantity without mutating stock.
export const reserve = (stock, quantity) => {
  if (!Number.isSafeInteger(stock) || stock < 0) return Object.freeze({ kind: 'InvalidStock' });
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    return Object.freeze({ kind: 'InvalidQuantity' });
  if (quantity > stock) return Object.freeze({ kind: 'InsufficientStock', available: stock });
  return Object.freeze({
    kind: 'Reserved',
    quantity,
    remaining: stock - quantity
  });
};
