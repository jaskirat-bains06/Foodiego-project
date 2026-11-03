export const ORDER_STATUSES = ['Pending','Confirmed','Preparing','Out for Delivery','Delivered','Cancelled'];

export function statusChangeEvents(currentStatus, history, nextStatus, currentAt, changedAt = new Date()) {
  if (!ORDER_STATUSES.includes(nextStatus)) {
    throw Object.assign(new Error('Invalid order status.'), { status: 400 });
  }
  if (currentStatus === nextStatus) return [];

  const events = [];
  if (!Array.isArray(history) || history.length === 0) {
    events.push({ status: currentStatus, changedAt: currentAt || changedAt });
  }
  events.push({ status: nextStatus, changedAt });
  return events;
}
