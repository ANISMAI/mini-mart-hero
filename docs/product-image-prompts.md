# Product image prompts (Mini Market Hero)

One picture per product. Save as `public/products/<folder>/<file>.webp`, 512 × 512, transparent background.
The folder for each section is shown under its heading.

## How to use

Take the **style prompt** and replace `[ITEM]` with the item's description from the tables below.
Add the **negative prompt** if your generator supports one.

**Style prompt**

```
Cute stylized 3D game asset of [ITEM], single product only, front view, upright, centered,
filling the frame, soft clay / vinyl toy look, rounded edges, soft studio lighting,
vibrant friendly colours, simple fictional packaging with a generic label, Malaysian
kedai runcit product, isolated on a fully transparent background, no floor, no ground
shadow, square 1:1, game inventory icon
```

**Negative prompt**

```
real brand names, logos, trademarks, readable brand text, watermark, background, scene,
table, hands, people, multiple products, tilted angle, top-down view, blurry, photo-realistic
```

Tip: generate every item in the same chat or session so the style stays consistent. If the tool
can't export a transparent background, use a plain white background and remove it afterwards
(for example with remove.bg), then convert to .webp.

## Minuman & Tenusu (cooler)

Folder: `public/products/minuman-tenusu/`

| File | [ITEM] |
|---|---|
| `air-mineral-500ml` | a small clear plastic 500ml mineral water bottle with light blue water, blue cap and a blue water-drop label |
| `susu-segar-1l` | a 1 litre white gable-top fresh milk carton with a blue band and a cute milk splash on the label |
| `teh-tarik-tin` | a drink can of Malaysian teh tarik, caramel brown can with a red stripe and a cup of frothy pulled tea on the label |
| `minuman-coklat-malt` | a small green drink carton of chocolate malt drink with a straw, yellow accents and a mug of chocolate drink on the label |
| `air-soya` | a plastic bottle of soya bean milk, cream coloured drink, green cap and soybeans on the label |
| `kopi-tin` | a dark brown drink can of iced coffee with an orange stripe and coffee beans on the label |
| `air-mineral-1-5l` | a large clear 1.5 litre mineral water bottle with blue cap and blue label |
| `yogurt-strawberi` | a small pink strawberry yogurt cup with a silver foil lid and strawberries on the label |
| `mentega-250g` | a 250g block of butter in pale yellow foil wrapper with a blue label |
| `minuman-isotonik` | a plastic bottle of light blue isotonic sports drink with a dark blue cap and a lightning bolt on the label |

## Penjagaan Diri (purple shelf, cooler side)

Folder: `public/products/penjagaan-diri/`

| File | [ITEM] |
|---|---|
| `ubat-gigi` | a toothpaste box, white with a red stripe and a smiling tooth on the front |
| `sabun-mandi-batang` | a wrapped bar of bath soap in a green paper box with leaf decorations |
| `syampu` | a light blue shampoo bottle with a dark blue flip cap and bubbles on the label |
| `berus-gigi` | a toothbrush in a clear plastic blister pack on a green card |
| `sabun-mandi-cecair` | a lavender purple pump bottle of liquid body wash with a white pump and bubbles on the label |
| `tisu-muka` | a soft pack of facial tissues, white with a blue pattern, one tissue sticking out of the top |
| `minyak-angin` | a tiny green glass bottle of Malaysian medicated oil (minyak angin) with a yellow cap |
| `tuala-wanita` | a soft pink plastic pack of sanitary pads with a purple flower design |

## Kelengkapan Rumah (purple shelf, grocery side)

Folder: `public/products/kelengkapan-rumah/`

| File | [ITEM] |
|---|---|
| `sabun-pencuci-pinggan` | a lime green dishwashing liquid bottle with a green cap and a shiny plate with bubbles on the label |
| `span-dapur` | a yellow kitchen sponge with a green scrubber top |
| `serbuk-pencuci` | a blue bag of laundry detergent powder with yellow accents and clean clothes on the label |
| `plastik-sampah` | a dark grey box of garbage bags with a green label and a rubbish bin icon |
| `pelembut-fabrik` | a pink fabric softener bottle with a handle, purple cap and a flower on the label |
| `tisu-tandas` | a pack of 4 white toilet paper rolls in clear plastic wrap with a blue label band |
| `ubat-nyamuk-lingkar` | a flat green box of mosquito coils with a red stripe and a cartoon mosquito on the front |
| `pencuci-lantai` | a large green floor cleaner bottle with a dark green cap and a sparkling floor on the label |

## Barang Dapur (green shelf)

Folder: `public/products/barang-dapur/`

| File | [ITEM] |
|---|---|
| `roti-putih` | a loaf of soft white bread in a clear plastic bag with an orange label |
| `mi-segera` | a yellow pack of instant noodles with a red stripe and a bowl of noodles on the front |
| `beras-5kg` | a 5kg sack of rice, off-white woven bag with a green label and rice grains on the front |
| `gula-1kg` | a 1kg white plastic packet of sugar with a blue label |
| `minyak-masak-1kg` | a 1kg plastic bottle of golden cooking oil with a green cap and label |
| `tepung-gandum-1kg` | a 1kg paper bag of wheat flour, off-white with an orange label and wheat on the front |
| `telur-gred-a` | a brown paper tray of 10 grade A eggs, eggs visible on top |
| `garam` | a small white salt shaker jar with a blue cap |
| `sardin-tin` | a red tin can of sardines in tomato sauce with a yellow label and a cute fish |
| `kicap-manis` | a dark glass bottle of Malaysian sweet soy sauce (kicap manis) with a red cap and label |

## Snek (pink shelf)

Folder: `public/products/snek/`

| File | [ITEM] |
|---|---|
| `kerepek-ubi` | a puffy yellow snack bag of cassava chips (kerepek ubi) with a red stripe |
| `coklat-bar` | a chocolate bar in a brown wrapper with a yellow stripe |
| `biskut-krim` | a blue box of cream sandwich biscuits with a biscuit on the front |
| `wafer` | a pink tube canister of wafer sticks with a cream coloured lid |
| `gula-gula` | a purple pouch of colourful gummy candies with a yellow top seal |
| `keropok-ikan` | a puffy red snack bag of fish crackers (keropok ikan) with a white stripe and a cute fish |
| `biskut-kering` | a brown pack of plain crackers / Marie style biscuits |
| `kacang-putih` | a cone-shaped paper pack of Malaysian kacang putih (roasted chickpeas and nuts) |

## Convert to .webp

Most generators export PNG. Convert with any tool, for example:

- Online: squoosh.app (drag in the PNG, choose WebP, keep transparency, resize to 512 × 512)
- Command line: `cwebp -q 85 -resize 512 512 in.png -o teh-tarik-tin.webp`
