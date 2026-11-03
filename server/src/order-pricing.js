export const FREE_DELIVERY_THRESHOLD = 599;
export const DELIVERY_FEE = 39;
export const MAX_ORDER_LINES = 50;
export const MAX_ITEM_QUANTITY = 50;
const invalid = message => Object.assign(new Error(message), { status: 400 });

export function calculateTotals(subtotal) {
  const amount = Number(subtotal);
  if (!Number.isFinite(amount) || amount < 0) throw invalid('Order subtotal must be a valid non-negative amount.');
  const safeSubtotal = Math.round(amount * 100) / 100;
  const deliveryFee = safeSubtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  return { subtotal: safeSubtotal, deliveryFee, totalAmount: Math.round((safeSubtotal + deliveryFee) * 100) / 100 };
}

export function buildOrderDetails(lines, foods) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_ORDER_LINES) {
    throw invalid(`Choose between 1 and ${MAX_ORDER_LINES} menu items.`);
  }
  const foodById = new Map(foods.map(food => [String(food._id), food]));
  const normalizedByFood = new Map();
  let restaurantId = null;

  for (const line of lines) {
    const food = foodById.get(String(line.foodId));
    if (!food || food.available === false) throw invalid('A selected menu item is unavailable.');
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      throw invalid(`Each quantity must be a whole number between 1 and ${MAX_ITEM_QUANTITY}.`);
    }
    const currentRestaurantId = String(food.restaurantId?._id || food.restaurantId);
    if (restaurantId && restaurantId !== currentRestaurantId) throw invalid('An order can contain items from one restaurant.');
    restaurantId = currentRestaurantId;

    const current = normalizedByFood.get(String(food._id));
    const combinedQuantity = (current?.quantity || 0) + quantity;
    if (combinedQuantity > MAX_ITEM_QUANTITY) throw invalid(`A menu item cannot exceed ${MAX_ITEM_QUANTITY} per order.`);
    normalizedByFood.set(String(food._id), {
      food,
      quantity: combinedQuantity,
      foodId: food._id,
      name: food.name,
      image: food.image,
      price: Number(food.price)
    });
  }

  const items = [...normalizedByFood.values()].map(({ food, ...snapshot }) => snapshot);
  if (items.some(item => !Number.isFinite(item.price) || item.price < 0)) throw invalid('A menu item has an invalid price.');
  const subtotalPaise = items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
  if (!Number.isSafeInteger(subtotalPaise)) throw invalid('Order total is too large.');
  const totals = calculateTotals(subtotalPaise / 100);
  return { items, restaurantId, ...totals };
}
