// Everything the mini mart sells. Prices in Malaysian ringgit (sen as integers to avoid
// floating-point rounding: 350 = RM3.50).

export type Weight = "heavy" | "normal" | "fragile";

export interface Product {
  id: string;
  name: string;
  icon: string;
  /** Price in sen. */
  price: number;
  /** Bagging rule: heavy items go in first, fragile items last (on top). */
  weight: Weight;
  shelf: ShelfId;
}

export type ShelfId = "bakery" | "dairy" | "drinks" | "snacks" | "fruit";

export const PRODUCTS: Product[] = [
  { id: "bread", name: "Bread", icon: "🍞", price: 350, weight: "fragile", shelf: "bakery" },
  { id: "bun", name: "Kaya bun", icon: "🥐", price: 180, weight: "fragile", shelf: "bakery" },
  { id: "cake", name: "Cupcake", icon: "🧁", price: 250, weight: "fragile", shelf: "bakery" },
  { id: "milk", name: "Milk 1L", icon: "🥛", price: 690, weight: "heavy", shelf: "dairy" },
  { id: "eggs", name: "Eggs (10)", icon: "🥚", price: 520, weight: "fragile", shelf: "dairy" },
  { id: "cheese", name: "Cheese", icon: "🧀", price: 890, weight: "normal", shelf: "dairy" },
  { id: "water", name: "Mineral water", icon: "💧", price: 120, weight: "heavy", shelf: "drinks" },
  { id: "juice", name: "Orange juice", icon: "🧃", price: 280, weight: "normal", shelf: "drinks" },
  { id: "tea", name: "Teh botol", icon: "🍵", price: 230, weight: "normal", shelf: "drinks" },
  { id: "chips", name: "Potato chips", icon: "🥔", price: 390, weight: "fragile", shelf: "snacks" },
  { id: "biscuit", name: "Biscuits", icon: "🍪", price: 450, weight: "normal", shelf: "snacks" },
  { id: "candy", name: "Sweets", icon: "🍬", price: 150, weight: "normal", shelf: "snacks" },
  { id: "apple", name: "Apple", icon: "🍎", price: 200, weight: "normal", shelf: "fruit" },
  { id: "banana", name: "Banana", icon: "🍌", price: 350, weight: "normal", shelf: "fruit" },
  { id: "watermelon", name: "Watermelon", icon: "🍉", price: 990, weight: "heavy", shelf: "fruit" },
];

export const SHELF_INFO: Record<ShelfId, { label: string; icon: string; color: number }> = {
  bakery: { label: "Bakery", icon: "🍞", color: 0xe8a25a },
  dairy: { label: "Dairy", icon: "🥛", color: 0x5fa8e8 },
  drinks: { label: "Drinks", icon: "🧃", color: 0x3ec0a0 },
  snacks: { label: "Snacks", icon: "🍪", color: 0xe85f8a },
  fruit: { label: "Fruit", icon: "🍎", color: 0x7cc456 },
};

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id)!;

/** "RM3.50" */
export const rm = (sen: number) => `RM${(sen / 100).toFixed(2)}`;

/** Notes and coins the cashier can hand back as change (sen). */
export const CHANGE_UNITS = [5000, 2000, 1000, 500, 100, 50, 20, 10, 5];

/** Note the customer pays with: the smallest of these that covers the total. */
export const PAY_NOTES = [500, 1000, 2000, 5000, 10000];
