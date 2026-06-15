// The combined invoice amount is a derived display value now, never a column —
// the contract migration dropped `total`. numeric maps to string at the Drizzle
// runtime, so the add runs in integer cents and formats back to the
// numeric(12,2) shape with no float drift.
export const combinedAmount = (money: {
  subtotal: string;
  tax: string;
}): string => {
  const cents =
    Math.round(Number(money.subtotal) * 100) +
    Math.round(Number(money.tax) * 100);
  return (cents / 100).toFixed(2);
};
