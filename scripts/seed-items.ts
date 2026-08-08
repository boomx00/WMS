import { config } from "dotenv";
config({ path: ".env.local" });
 
async function main() {
  const { db } = await import("../lib/db");
  const { items } = await import("../db/schema");
 
  const data = [
    { sku: "0201003000041", name: "MAKUKU Air Diapers - Comfort Fit Pants M28", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "0201003000047", name: "MAKUKU Air Diapers - COMFORT FIT Pants M42", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "0201003000048", name: "MAKUKU Air Diapers - Comfort Fit Pants M26", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "0201003000058", name: "MAKUKU Air Diapers Comfort Fit Pants M42+4", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "0201004000035", name: "MAKUKU Air Diapers - Comfort Fit Pants L26", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "0201004000040", name: "MAKUKU Air Diapers - COMFORT FIT Pants L40", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "0201004000052", name: "MAKUKU Air Diapers Comfort Fit Pants L40+4", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "0201005000036", name: "MAKUKU Air Diapers - Comfort Fit Pants XL24", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "0201005000042", name: "MAKUKU Air Diapers - COMFORT FIT Pants XL38", cartonBagQty: 6, palletCartonQty: 32 },
    { sku: "0201005000054", name: "MAKUKU Air Diapers Comfort Fit Pants XL38+4", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "0201006000026", name: "MAKUKU Air Diapers - Comfort Fit Pants XXL22", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "14012022502", name: "MAKUKU Dry Care 3.0 Pants S38", cartonBagQty: 8, palletCartonQty: 16 },
    { sku: "14012023502", name: "MAKUKU Dry Care 3.0 Pants M30+6", cartonBagQty: 8, palletCartonQty: 16 },
    { sku: "14012023550", name: "MAKUKU Diapers Dry Care Pants M30+6", cartonBagQty: 8, palletCartonQty: 16 },
    { sku: "14012023602", name: "MAKUKU Dry Care 3.0 Pants M48+10", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14012023650", name: "MAKUKU Diapers Dry Care Pants M48+10", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14012024502", name: "MAKUKU Dry Care 3.0 Pants L28+6", cartonBagQty: 8, palletCartonQty: 16 },
    { sku: "14012024550", name: "MAKUKU Diapers Dry Care Pants L28+6", cartonBagQty: 8, palletCartonQty: 16 },
    { sku: "14012024602", name: "MAKUKU Dry Care 3.0 Pants L44+10", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14012024650", name: "MAKUKU Diapers Dry Care Pants L44+10", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14012025502", name: "MAKUKU Dry Care 3.0 Pants XL24+4", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "14012025550", name: "MAKUKU Diapers Dry Care Pants XL24+4", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "14012025602", name: "MAKUKU Dry Care 3.0 Pants XL36+6", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14012025650", name: "MAKUKU Diapers Dry Care Pants XL36+6", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14012026502", name: "MAKUKU Dry Care 3.0 Pants XXL22+4", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "14012026550", name: "MAKUKU Diapers Dry Care Pants XXL22+4", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "14012026602", name: "MAKUKU Dry Care 3.0 Pants XXL34+6", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "14012026650", name: "MAKUKU Diapers Dry Care Pants XXL34+6", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14013022502", name: "MAKUKU Comfort Fit 3.0 Pants S38", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "14013023102", name: "MAKUKU Comfort Fit 3.0 Pants M3", cartonBagQty: 32, palletCartonQty: 40 },
    { sku: "14013023502", name: "MAKUKU Comfort Fit 3.0 Pants M30", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "14013023602", name: "MAKUKU Comfort Fit 3.0 Pants M42+4", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "14013023702", name: "MAKUKU Comfort Fit 3.0 Pants M62+4", cartonBagQty: 4, palletCartonQty: 24 },
    { sku: "14013023750", name: "MAKUKU Diapers Comfort Fit Pants M 60+6", cartonBagQty: 4, palletCartonQty: 24 },
    { sku: "14013023801", name: "MAKUKU Diapers Comfort Fit Pants M80+10", cartonBagQty: 4, palletCartonQty: 16 },
    { sku: "14013023802", name: "MAKUKU Comfort Fit 3.0 Pants M80+10", cartonBagQty: 4, palletCartonQty: 16 },
    { sku: "14013024101", name: "MAKUKU SAP Diapers Comfort Fit Pants L3", cartonBagQty: 32, palletCartonQty: 40 },
    { sku: "14013024102", name: "MAKUKU Comfort Fit 3.0 Pants L3", cartonBagQty: 32, palletCartonQty: 40 },
    { sku: "14013024502", name: "MAKUKU Comfort Fit 3.0 Pants L26", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "14013024602", name: "MAKUKU Comfort Fit 3.0 Pants L40+4", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "14013024702", name: "MAKUKU Comfort Fit 3.0 Pants L54+4", cartonBagQty: 4, palletCartonQty: 24 },
    { sku: "14013024750", name: "MAKUKU Diapers Comfort Fit Pants L 54+6", cartonBagQty: 4, palletCartonQty: 24 },
    { sku: "14013024801", name: "MAKUKU Diapers Comfort Fit Pants L74+10", cartonBagQty: 4, palletCartonQty: 16 },
    { sku: "14013024802", name: "MAKUKU Comfort Fit 3.0 Pants L74+10", cartonBagQty: 4, palletCartonQty: 16 },
    { sku: "14013025102", name: "MAKUKU Comfort Fit 3.0 Pants XL3", cartonBagQty: 32, palletCartonQty: 40 },
    { sku: "14013025502", name: "MAKUKU Comfort Fit 3.0 Pants XL24", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "14013025602", name: "MAKUKU Comfort Fit 3.0 Pants XL38+4", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "14013025702", name: "MAKUKU Comfort Fit 3.0 Pants XL44+4", cartonBagQty: 4, palletCartonQty: 32 },
    { sku: "14013025750", name: "MAKUKU Diapers Comfort Fit Pants XL 44+6", cartonBagQty: 4, palletCartonQty: 24 },
    { sku: "14013025801", name: "MAKUKU Diapers Comfort Fit Pants XL60+6", cartonBagQty: 4, palletCartonQty: 16 },
    { sku: "14013025802", name: "MAKUKU Comfort Fit 3.0 Pants XL60+6", cartonBagQty: 4, palletCartonQty: 16 },
    { sku: "14013026502", name: "MAKUKU Comfort Fit 3.0 Pants XXL22", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "14013026701", name: "MAKUKU Comfort Fit 3.0 Pants XXL38+4", cartonBagQty: 4, palletCartonQty: 24 },
    { sku: "14013063502", name: "MAKUKU Slim Care Skin Joy Pants M32", cartonBagQty: 8, palletCartonQty: 16 },
    { sku: "14013064502", name: "MAKUKU Slim Care Skin Joy Pants L30", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "14013065502", name: "MAKUKU Slim Care Skin Joy Pants XL28", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "14013066502", name: "MAKUKU Slim Care Skin Joy Pants XXL26", cartonBagQty: 8, palletCartonQty: 32 },
    { sku: "14013073701", name: "MAKUKU Diapers Skin Health Pants M60", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14013074701", name: "MAKUKU Diapers Skin Health Pants L54", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14013075701", name: "MAKUKU Diapers Skin Health Pants XL48", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "14013076501", name: "MAKUKU Diapers Skin Health Pants XXL22", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "14014032502", name: "MAKUKU Slim Luxury Silky Pants S40", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "14014033502", name: "MAKUKU Slim Luxury Silky Pants M36", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "14014033602", name: "MAKUKU Slim Luxury Silky Pants M52", cartonBagQty: 4, palletCartonQty: 24 },
    { sku: "14014034502", name: "MAKUKU Slim Luxury Silky Pants L34", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "14014034602", name: "MAKUKU Slim Luxury Silky Pants L50", cartonBagQty: 4, palletCartonQty: 24 },
    { sku: "14014035502", name: "MAKUKU Slim Luxury Silky Pants XL32", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "14014035602", name: "MAKUKU Slim Luxury Silky Pants XL48", cartonBagQty: 4, palletCartonQty: 24 },
    { sku: "14014036502", name: "MAKUKU Slim Luxury Silky Pants XXL28", cartonBagQty: 6, palletCartonQty: 24 },
    { sku: "14015023503", name: "MAKUKU Air Diapers Pro Care 2.0 Pants M36", cartonBagQty: 4, palletCartonQty: 32 },
    { sku: "14015024503", name: "MAKUKU Air Diapers Pro Care 2.0 Pants L34", cartonBagQty: 4, palletCartonQty: 32 },
    { sku: "14015025503", name: "MAKUKU Air Diapers Pro Care 2.0 Pants XL32", cartonBagQty: 4, palletCartonQty: 32 },
    { sku: "14015026503", name: "MAKUKU Air Diapers Pro Care 2.0 Pants XXL28", cartonBagQty: 4, palletCartonQty: 32 },
    { sku: "14022025501", name: "Parenty Adult Pants Soft XL8", cartonBagQty: 8, palletCartonQty: 40 },
    { sku: "14022043550", name: "Parenty Adult Pants Lembut & Pas di Badan M10+4", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "14022043650", name: "Parenty Adult Pants Lembut & Pas di Badan M20+10", cartonBagQty: 6, palletCartonQty: 40 },
    { sku: "14022044550", name: "Parenty Adult Pants Lembut & Pas di Badan L8+4", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "14022045550", name: "Parenty Adult Pants Lembut & Pas di Badan XL8+4", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "14022045650", name: "Parenty Adult Pants  Lembut & Pas di Badan XL14+8", cartonBagQty: 6, palletCartonQty: 40 },
    { sku: "14023014551", name: "Parenty Adult Pants Ekstra Serap L8+4", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "22076106", name: "MAKUKU Dry Care 3.0 Pants XL 36+4", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "22275106", name: "MAKUKU Dry Care 3.0 Pants M 48+8", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "22346106", name: "MAKUKU Dry Care 3.0 Pants XL 24+2", cartonBagQty: 8, palletCartonQty: 24 },
    { sku: "22645106", name: "MAKUKU Dry Care 3.0 Pants M 30+4", cartonBagQty: 8, palletCartonQty: 16 },
    { sku: "22674106", name: "MAKUKU Dry Care 3.0 Pants L 44+8", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "22777106", name: "MAKUKU Dry Care 3.0 Pants XXL 34+4", cartonBagQty: 6, palletCartonQty: 16 },
    { sku: "22844106", name: "MAKUKU Dry Care 3.0 Pants L 28+4", cartonBagQty: 8, palletCartonQty: 16 },
  ];
 
const dataWithDefaultCode = data.map((item) => ({
  ...item,
  defaultCode: `${item.sku}*default`,
}));

console.log(`Importing ${dataWithDefaultCode.length} items...`);

const result = await db
  .insert(items)
  .values(dataWithDefaultCode)
  .onConflictDoNothing({ target: items.sku })
  .returning();
 
  console.log(`Inserted ${result.length} new items (skipped ${data.length - result.length} that already existed).`);
  process.exit(0);
}
 
main().catch((err) => {
  console.error(err);
  process.exit(1);
});