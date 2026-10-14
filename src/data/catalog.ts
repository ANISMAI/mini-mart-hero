// Master product catalog: the one source for every SKU. The 3D shelves, the 2D organizer and,
// later, the cashier scanner and restock tasks all look items up here by SKU id.
// Items are everyday Malaysian kedai runcit goods under generic names. Prices are invented for
// gameplay and kept in integer sen (150 = RM1.50). Packaging is fictional: no real brands or logos.

export type Category = "fridge" | "personal" | "household" | "grocery" | "snacks";

/** Placeholder 3D shape used until a real model exists for the item's `modelKey`. */
export type Shape =
  | "bottle"
  | "bigBottle"
  | "can"
  | "carton"
  | "smallCarton"
  | "cup"
  | "slab"
  | "brick"
  | "tubeBox"
  | "card"
  | "pump"
  | "flatBottle"
  | "spray"
  | "pack"
  | "jug"
  | "sponge"
  | "rollBox"
  | "tissueRolls"
  | "loaf"
  | "noodles"
  | "sack"
  | "bag"
  | "jar"
  | "eggs"
  | "tin"
  | "beans"
  | "chipBag"
  | "bar"
  | "biscuitBox"
  | "canister"
  | "pouch"
  | "crackers";

export type UnlockLevel = 1 | 3 | 5 | 8;

export interface CatalogItem {
  /** SKU id, e.g. "01-001". */
  id: string;
  name: string;
  category: Category;
  priceCents: number;
  unlockLevel: UnlockLevel;
  /** Display location (see SECTIONS). */
  shelfId: string;
  stock: number;
  shelfCapacity: number;
  /** Image / model keys: public/products/<section folder>/<iconKey>.webp is used when present. */
  modelKey: string;
  iconKey: string;
  /** Scanner string for the cashier phase (EAN-13 style, fictional). */
  barcode: string;
  /** Emoji used as the 2D icon until real icon art is added. */
  icon: string;
  shape: Shape;
  /** Packaging colours for the placeholder model and label. */
  color: number;
  accent: number;
}

export interface SectionInfo {
  label: string;
  /** Picture folder: public/products/<folder>/. */
  folder: string;
  icon: string;
  color: number;
  shelfId: string;
  /** Where it is in the 3D store. */
  place: string;
}

export const SECTIONS: Record<Category, SectionInfo> = {
  fridge: { label: "Minuman & Tenusu", folder: "minuman-tenusu", icon: "🧃", color: 0x3b8ff0, shelfId: "FRIDGE_A", place: "Drink coolers, left wall" },
  personal: { label: "Penjagaan Diri", folder: "penjagaan-diri", icon: "🧴", color: 0x9b6ad6, shelfId: "PERSONAL_A", place: "Purple shelf, cooler side" },
  household: { label: "Kelengkapan Rumah", folder: "kelengkapan-rumah", icon: "🧽", color: 0x7a55d6, shelfId: "HOUSEHOLD_A", place: "Purple shelf, grocery side" },
  grocery: { label: "Barang Dapur", folder: "barang-dapur", icon: "🍚", color: 0x2fb38a, shelfId: "GROCERY_A", place: "Green shelf" },
  snacks: { label: "Snek", folder: "snek", icon: "🍪", color: 0xe85f8a, shelfId: "SNACKS_A", place: "Pink shelf" },
};

export const LEVELS: { level: UnlockLevel; name: string; goal: string }[] = [
  { level: 1, name: "Starter", goal: "All five sections usable with 2 basic products each." },
  { level: 3, name: "Growing Store", goal: "Expand shelf assortment; slightly longer customer orders." },
  { level: 5, name: "Busy Market", goal: "Add category variety for inventory and restock tasks." },
  { level: 8, name: "Fully Stocked", goal: "Full initial catalog available across all sections." },
];

type Row = [id: string, name: string, priceCents: number, unlock: UnlockLevel, key: string, icon: string, shape: Shape, color: number, accent: number];

const ROWS: Record<Category, Row[]> = {
  fridge: [
    ["01-001", "Air Mineral 500ml", 150, 1, "air-mineral-500ml", "💧", "bottle", 0x8fd0f5, 0x1f6fd1],
    ["01-002", "Susu Segar 1L", 750, 1, "susu-segar-1l", "🥛", "carton", 0xffffff, 0x2f80ed],
    ["01-003", "Teh Tarik Tin", 250, 3, "teh-tarik-tin", "☕", "can", 0xc98a4b, 0xe8333f],
    ["01-004", "Minuman Coklat Malt", 320, 3, "minuman-coklat-malt", "🍫", "smallCarton", 0x2e8f57, 0xf9c833],
    ["01-005", "Air Soya", 250, 5, "air-soya", "🫘", "bottle", 0xf3e6c4, 0x2e8f57],
    ["01-006", "Kopi Tin", 250, 5, "kopi-tin", "☕", "can", 0x5a3a26, 0xf2a51e],
    ["01-007", "Air Mineral 1.5L", 280, 5, "air-mineral-1-5l", "💧", "bigBottle", 0x8fd0f5, 0x1f6fd1],
    ["01-008", "Yogurt Strawberi", 280, 8, "yogurt-strawberi", "🍓", "cup", 0xf7b6c8, 0xe0457b],
    ["01-009", "Mentega 250g", 950, 8, "mentega-250g", "🧈", "brick", 0xfff1a8, 0x2f80ed],
    ["01-010", "Minuman Isotonik", 280, 8, "minuman-isotonik", "⚡", "bottle", 0x5fd3f3, 0x1a4fa0],
  ],
  personal: [
    ["02-001", "Ubat Gigi", 650, 1, "ubat-gigi", "🦷", "tubeBox", 0xffffff, 0xe8333f],
    ["02-002", "Sabun Mandi Batang", 350, 1, "sabun-mandi-batang", "🧼", "brick", 0x8ad97a, 0x2e8f57],
    ["02-003", "Syampu", 1290, 3, "syampu", "🧴", "flatBottle", 0x7ec8e3, 0x1f6fd1],
    ["02-004", "Berus Gigi", 450, 3, "berus-gigi", "🪥", "card", 0x2fb38a, 0xffffff],
    ["02-005", "Sabun Mandi Cecair", 1090, 5, "sabun-mandi-cecair", "🫧", "pump", 0xbba8e5, 0x7a55d6],
    ["02-006", "Tisu Muka", 350, 5, "tisu-muka", "🤧", "pack", 0xffffff, 0x3b8ff0],
    ["02-007", "Minyak Angin", 590, 8, "minyak-angin", "🌿", "jar", 0x2e8f57, 0xf9c833],
    ["02-008", "Tuala Wanita", 990, 8, "tuala-wanita", "🌸", "pack", 0xf7b6c8, 0x9b6ad6],
  ],
  household: [
    ["03-001", "Sabun Pencuci Pinggan", 690, 1, "sabun-pencuci-pinggan", "🍽️", "flatBottle", 0xc6f07a, 0x2e8f57],
    ["03-002", "Span Dapur", 250, 1, "span-dapur", "🧽", "sponge", 0xf9c833, 0x2e8f57],
    ["03-003", "Serbuk Pencuci", 1590, 3, "serbuk-pencuci", "🧺", "sack", 0x3b8ff0, 0xf9c833],
    ["03-004", "Plastik Sampah", 550, 3, "plastik-sampah", "🗑️", "rollBox", 0x3a4252, 0x2fb38a],
    ["03-005", "Pelembut Fabrik", 1090, 5, "pelembut-fabrik", "🌷", "jug", 0xf7b6c8, 0x9b6ad6],
    ["03-006", "Tisu Tandas", 890, 5, "tisu-tandas", "🧻", "tissueRolls", 0xffffff, 0x3b8ff0],
    ["03-007", "Ubat Nyamuk Lingkar", 450, 8, "ubat-nyamuk-lingkar", "🦟", "pack", 0x2e8f57, 0xe8333f],
    ["03-008", "Pencuci Lantai", 890, 8, "pencuci-lantai", "🧹", "bigBottle", 0x7ad37a, 0x1f7a4a],
  ],
  grocery: [
    ["04-001", "Roti Putih", 450, 1, "roti-putih", "🍞", "loaf", 0xf3d9a4, 0xe07b39],
    ["04-002", "Mi Segera", 590, 1, "mi-segera", "🍜", "noodles", 0xf9c833, 0xe8333f],
    ["04-003", "Beras 5kg", 1890, 3, "beras-5kg", "🍚", "sack", 0xf4efe4, 0x2fb38a],
    ["04-004", "Gula 1kg", 350, 3, "gula-1kg", "🍬", "bag", 0xffffff, 0x3b8ff0],
    ["04-005", "Minyak Masak 1kg", 750, 5, "minyak-masak-1kg", "🫒", "bigBottle", 0xf2c94c, 0x2e8f57],
    ["04-006", "Tepung Gandum 1kg", 320, 5, "tepung-gandum-1kg", "🌾", "bag", 0xf4efe4, 0xe07b39],
    ["04-007", "Telur Gred A (10)", 600, 5, "telur-gred-a", "🥚", "eggs", 0xc9a77c, 0xf6e3c4],
    ["04-008", "Garam", 150, 8, "garam", "🧂", "jar", 0xffffff, 0x1f6fd1],
    ["04-009", "Sardin Tin", 650, 8, "sardin-tin", "🐟", "tin", 0xe8333f, 0xf9c833],
    ["04-010", "Kicap Manis", 550, 8, "kicap-manis", "🍶", "bottle", 0x3a2418, 0xe8333f],
  ],
  snacks: [
    ["05-001", "Kerepek Ubi", 450, 1, "kerepek-ubi", "🥔", "chipBag", 0xf9c833, 0xe8333f],
    ["05-002", "Coklat Bar", 350, 1, "coklat-bar", "🍫", "bar", 0x6b3e26, 0xf9c833],
    ["05-003", "Biskut Krim", 390, 3, "biskut-krim", "🍪", "biscuitBox", 0x3b8ff0, 0xffffff],
    ["05-004", "Wafer", 250, 3, "wafer", "🧇", "canister", 0xe85f8a, 0xf3d9a4],
    ["05-005", "Gula-gula", 280, 5, "gula-gula", "🍬", "pouch", 0xa66bf0, 0xf9c833],
    ["05-006", "Keropok Ikan", 490, 5, "keropok-ikan", "🐠", "chipBag", 0xe8333f, 0xffffff],
    ["05-007", "Biskut Kering", 650, 8, "biskut-kering", "🍘", "crackers", 0xc98a4b, 0x6b3e26],
    ["05-008", "Kacang Putih", 320, 8, "kacang-putih", "🥜", "pouch", 0xf4efe4, 0xe07b39],
  ],
};

export const CATALOG: CatalogItem[] = (Object.keys(ROWS) as Category[]).flatMap((category) =>
  ROWS[category].map(([id, name, priceCents, unlockLevel, key, icon, shape, color, accent]) => ({
    id,
    name,
    category,
    priceCents,
    unlockLevel,
    shelfId: SECTIONS[category].shelfId,
    stock: 12,
    shelfCapacity: 12,
    modelKey: key,
    iconKey: key,
    barcode: `955${id.replace("-", "").padStart(10, "0")}`,
    icon,
    shape,
    color,
    accent,
  }))
);

export const getItem = (id: string) => CATALOG.find((p) => p.id === id);
export const itemsIn = (category: Category) => CATALOG.filter((p) => p.category === category);
export const isUnlocked = (p: CatalogItem, level: number) => p.unlockLevel <= level;
export const unlockedIn = (category: Category, level: number) => itemsIn(category).filter((p) => isUnlocked(p, level));

/** Product picture (512×512, transparent): used as the 2D icon and as the shelf cut-out when present. */
export const imageUrl = (p: CatalogItem) => `${import.meta.env.BASE_URL}products/${SECTIONS[p.category].folder}/${p.iconKey}.webp`;

/** "RM3.50" */
export const rm = (sen: number) => `RM${(sen / 100).toFixed(2)}`;
