// src/app/page.tsx
import { prisma } from "@/lib/prisma";
import ReserveButton from "@/components/ReserveButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getProducts() {
  const products = await prisma.product.findMany({
    include: {
      inventory: {
        include: { warehouse: true },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
    ...p,
    price: p.price.toString(),
    inventory: p.inventory.map((inv) => ({
      ...inv,
      availableStock: inv.totalStock - inv.reservedStock,
    })),
  }));
}

function StockBar({ available, total }: { available: number; total: number }) {
  const pct = total === 0 ? 0 : Math.min(100, (available / total) * 100);
  const color =
    pct === 0 ? "#4b5563" : pct <= 20 ? "#ef4444" : pct <= 50 ? "#f59e0b" : "#10b981";

  return (
    <div className="flex items-center gap-2 mt-1">
      <div
        className="flex-1 h-1 rounded-full overflow-hidden"
        style={{ background: "var(--border)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="mono text-xs tabular-nums"
        style={{ color: available === 0 ? "#4b5563" : color }}
      >
        {available}
      </span>
    </div>
  );
}

export default async function HomePage() {
  const products = await getProducts();

  const totalAvailable = products.reduce(
    (sum, p) =>
      sum + p.inventory.reduce((s, inv) => s + inv.availableStock, 0),
    0
  );

  return (
    <div
      className="grid-bg min-h-full"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="mono text-xs px-2 py-0.5 rounded"
                  style={{
                    background: "var(--amber-glow)",
                    color: "var(--amber)",
                    border: "1px solid rgba(245,158,11,0.25)",
                  }}
                >
                  LIVE INVENTORY
                </span>
              </div>
              <h1
                className="text-2xl font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Product Catalog
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {products.length} products across{" "}
                {new Set(
                  products.flatMap((p) => p.inventory.map((i) => i.warehouseId))
                ).size}{" "}
                warehouses
              </p>
            </div>
            <div className="text-right">
              <div
                className="mono text-2xl font-medium"
                style={{ color: "var(--amber)" }}
              >
                {totalAvailable}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                total units available
              </div>
            </div>
          </div>
        </div>

        {/* Products grid */}
        {products.length === 0 ? (
          <div
            className="text-center py-20 rounded-xl"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <p
              className="text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              No products found. Run{" "}
              <code
                className="mono px-1.5 py-0.5 rounded"
                style={{ background: "var(--bg-elevated)" }}
              >
                npm run db:seed
              </code>{" "}
              to populate the database.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => {
              const totalAvail = product.inventory.reduce(
                (s, inv) => s + inv.availableStock,
                0
              );
              const warehouseList = product.inventory.map((inv) => ({
                id: inv.warehouseId,
                name: inv.warehouse.name,
                location: inv.warehouse.location,
                availableStock: inv.availableStock,
              }));

              return (
                <div key={product.id} className="card rounded-xl overflow-hidden">
                  {/* Product image */}
                  {product.imageUrl && (
                    <div className="h-40 overflow-hidden">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        style={{ filter: "brightness(0.85)" }}
                      />
                    </div>
                  )}

                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 pr-2">
                        <h2
                          className="font-semibold text-sm leading-snug"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {product.name}
                        </h2>
                        <div
                          className="mono text-xs mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {product.sku}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="mono font-semibold text-sm"
                          style={{ color: "var(--amber)" }}
                        >
                          ₹{Number(product.price).toLocaleString("en-IN")}
                        </div>
                        <div
                          className={`text-xs mono font-medium ${
                            totalAvail === 0 ? "" : ""
                          }`}
                          style={{
                            color:
                              totalAvail === 0
                                ? "#4b5563"
                                : totalAvail <= 3
                                ? "#ef4444"
                                : "var(--text-muted)",
                          }}
                        >
                          {totalAvail === 0
                            ? "OUT OF STOCK"
                            : `${totalAvail} total`}
                        </div>
                      </div>
                    </div>

                    {/* Warehouse breakdown */}
                    <div
                      className="rounded-lg p-3 mb-4 space-y-2"
                      style={{ background: "var(--bg-base)" }}
                    >
                      <div
                        className="text-xs font-medium uppercase tracking-wider mb-2"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Warehouse Stock
                      </div>
                      {product.inventory.map((inv) => (
                        <div key={inv.id}>
                          <div className="flex justify-between items-center">
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {inv.warehouse.name}
                            </span>
                            {inv.reservedStock > 0 && (
                              <span
                                className="mono text-xs"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {inv.reservedStock} reserved
                              </span>
                            )}
                          </div>
                          <StockBar
                            available={inv.availableStock}
                            total={inv.totalStock}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Reserve button */}
                    <ReserveButton
                      productId={product.id}
                      productName={product.name}
                      warehouses={warehouseList}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Concurrency note */}
        <div
          className="mt-8 p-4 rounded-xl"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-start gap-3">
            <span style={{ color: "var(--amber)" }}>⚡</span>
            <div>
              <div
                className="text-xs font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                Race-Condition Safety
              </div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                All reservation requests use PostgreSQL{" "}
                <code
                  className="mono px-1 rounded"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  SELECT ... FOR UPDATE
                </code>{" "}
                row-level locking inside an atomic transaction. Simultaneous
                requests for the same last unit will serialise — exactly one
                succeeds and the other receives a 409 Conflict.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
