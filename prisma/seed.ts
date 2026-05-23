// prisma/seed.ts
// Seed data designed to test real-world scenarios:
// - Bangalore Tech Park has 1-unit stock on 2 products — for race condition demos
// - Delhi North Hub has low stock (3 units) on AirPods — for 409 testing
// Run: npm run db:seed
import { PrismaClient, Decimal } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Wipe existing data in correct dependency order
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // --- Warehouses ---
  const [wh1, wh2, wh3] = await Promise.all([
    prisma.warehouse.create({
      data: { name: "Mumbai Central", location: "Mumbai, MH" },
    }),
    prisma.warehouse.create({
      data: { name: "Delhi North Hub", location: "Delhi, DL" },
    }),
    prisma.warehouse.create({
      data: { name: "Bangalore Tech Park", location: "Bengaluru, KA" },
    }),
  ]);

  console.log(`✅ Created 3 warehouses`);

  // --- Products ---
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Sony WH-1000XM5 Headphones",
        sku: "SNY-WH1000XM5",
        description: "Industry-leading noise canceling wireless headphones",
        price: new Decimal("24999.00"),
        imageUrl:
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Apple AirPods Pro (2nd Gen)",
        sku: "APL-APP-2ND",
        description: "Active Noise Cancellation, Adaptive Transparency",
        price: new Decimal("19900.00"),
        imageUrl:
          "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Samsung Galaxy Tab S9",
        sku: "SAM-TABS9",
        description: "11-inch Dynamic AMOLED 2X display, Snapdragon 8 Gen 2",
        price: new Decimal("72999.00"),
        imageUrl:
          "https://images.unsplash.com/photo-1561154464-82e9adf32764?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Logitech MX Master 3S",
        sku: "LGT-MXM3S",
        description: "Advanced Wireless Mouse with 8K DPI Sensor",
        price: new Decimal("8995.00"),
        imageUrl:
          "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "SteelSeries Apex Pro TKL",
        sku: "STL-APXTKLWL",
        description: "Wireless Mechanical Gaming Keyboard, OmniPoint 2.0",
        price: new Decimal("17999.00"),
        imageUrl:
          "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400",
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} products`);

  // --- Inventory ---
  // Intentionally create some scarcity scenarios to test concurrency
  const inventoryData = [
    // Headphones
    { product: products[0], warehouse: wh1, total: 15 },
    { product: products[0], warehouse: wh2, total: 8 },
    { product: products[0], warehouse: wh3, total: 1 }, // <-- scarcity: 1 unit
    // AirPods
    { product: products[1], warehouse: wh1, total: 20 },
    { product: products[1], warehouse: wh2, total: 3 }, // <-- low stock
    { product: products[1], warehouse: wh3, total: 12 },
    // Galaxy Tab
    { product: products[2], warehouse: wh1, total: 5 },
    { product: products[2], warehouse: wh3, total: 2 }, // <-- low stock
    // Mouse
    { product: products[3], warehouse: wh1, total: 50 },
    { product: products[3], warehouse: wh2, total: 35 },
    { product: products[3], warehouse: wh3, total: 20 },
    // Keyboard
    { product: products[4], warehouse: wh2, total: 7 },
    { product: products[4], warehouse: wh3, total: 1 }, // <-- scarcity: 1 unit
  ];

  await prisma.inventory.createMany({
    data: inventoryData.map(({ product, warehouse, total }) => ({
      productId: product.id,
      warehouseId: warehouse.id,
      totalStock: total,
      reservedStock: 0,
    })),
  });

  console.log(`✅ Created ${inventoryData.length} inventory records`);
  console.log("\n🎉 Seed complete!");
  console.log(
    "\n💡 Tip: Products at Bangalore Tech Park have 1-unit stock — great for testing race conditions."
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
