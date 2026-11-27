import { useState } from "react";
import { Order, OrderStatus, ProductItem, RoleMode } from "../types";
import { DashboardOverviewWidgets } from "./DashboardOverviewWidgets";
import { ResilientImage } from "./ResilientImage";

interface DashboardViewProps {
  role: RoleMode;
  products: ProductItem[];
  orders: Order[];
  categories: string[];
  ownerLineId: string;
  lastSyncedLabel: string;
  onSyncNow: () => void;
  onQuickCreateOrder: () => void;
  onQuickCreateOrderForProduct: (product: ProductItem) => void;
  onNavigateInventory: (filter?: "all" | "low") => void;
  onNavigateOrdersWithTab: (tab: OrderStatus) => void;
  onNavigateScanner: () => void;
  onOpenAddProduct: () => void;
  onSelectProductForEdit: (product: ProductItem) => void;
  onConfirmPack: (orderId: string) => void;
  onMarkReadyToShip: (orderId: string) => void;
  onNotifyLowStockLine: (items: ProductItem[]) => void;
  onDeleteOrder: (orderId: string) => void;
  onDeleteProduct: (productId: string) => void;
}

export function DashboardView({
  role,
  products,
  orders,
  categories,
  ownerLineId,
  lastSyncedLabel,
  onSyncNow,
  onQuickCreateOrder,
  onQuickCreateOrderForProduct,
  onNavigateInventory,
  onNavigateOrdersWithTab,
  onNavigateScanner,
  onOpenAddProduct,
  onSelectProductForEdit,
  onConfirmPack,
  onMarkReadyToShip,
  onNotifyLowStockLine,
  onDeleteOrder,
  onDeleteProduct,
}: DashboardViewProps) {
  const [syncing, setSyncing] = useState(false);

  const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);
  const lowStockItems = products
    .filter((p) => p.stock < p.lowThreshold)
    .sort((a, b) => {
      const ratioA = a.lowThreshold > 0 ? a.stock / a.lowThreshold : 0;
      const ratioB = b.lowThreshold > 0 ? b.stock / b.lowThreshold : 0;
      return ratioA - ratioB;
    });

  // Show priority items (low stock first, then top inventory items) as a quick snapshot
  const previewProducts = [
    ...lowStockItems,
    ...products.filter((p) => p.stock >= p.lowThreshold),
  ].slice(0, 4);

  const handleSyncClick = () => {
    setSyncing(true);
    onSyncNow();
    setTimeout(() => setSyncing(false), 600);
  };

  return (
    <div className="flex flex-col w-full gap-5 pb-24">
      {/* Top Dashboard Quick Actions & Store Snapshot Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-4 flex items-stretch gap-2">
          <button
            type="button"
            onClick={onQuickCreateOrder}
            className="flex-1 h-12 px-4 rounded-xl bg-primary text-on-primary shadow-sm flex items-center justify-center gap-1.5 font-semibold text-[14px] transition-transform active:scale-95 hover:bg-primary-dim cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[20px]">
              add_shopping_cart
            </span>
            <span>+ สร้างออเดอร์ใหม่</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateInventory("all")}
            className="h-12 px-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/50 text-primary hover:bg-surface-container-low shadow-xs flex items-center justify-center gap-1.5 font-semibold text-[13px] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span className="material-symbols-outlined text-[19px]">
              inventory_2
            </span>
            <span>คลังสินค้า</span>
          </button>
        </div>

        <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <p className="text-[11px] text-on-surface-variant">
                สต็อกรวมทั้งร้าน
              </p>
              <p className="text-[15px] font-bold text-on-surface tabular-nums">
                {totalUnits.toLocaleString()} ชิ้น · {products.length} รายการ ·{" "}
                {categories.length} หมวด
              </p>
            </div>
            <div className="h-7 w-px bg-surface-container hidden sm:block" />
            <div className="min-w-0 hidden sm:block">
              <p className="text-[11px] text-on-surface-variant">
                บันทึกข้อมูลอัตโนมัติ
              </p>
              <p className="text-[12px] font-semibold text-primary tabular-nums truncate">
                ล่าสุด {lastSyncedLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSyncClick}
            className="shrink-0 h-9 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                syncing ? "animate-spin" : ""
              }`}
            >
              sync
            </span>
            <span>บันทึกทันที</span>
          </button>
        </div>
      </div>

      {/* Interactive Order Status Summary & Stock Alert Widgets */}
      <DashboardOverviewWidgets
        role={role}
        orders={orders}
        products={products}
        ownerLineId={ownerLineId}
        onNotifyLowStockLine={onNotifyLowStockLine}
        onNavigateOrdersWithTab={onNavigateOrdersWithTab}
        onSelectProductForEdit={onSelectProductForEdit}
        onQuickCreateOrderForProduct={onQuickCreateOrderForProduct}
        onConfirmPack={onConfirmPack}
        onMarkReadyToShip={onMarkReadyToShip}
        onNavigateScanner={onNavigateScanner}
        onQuickCreateOrder={onQuickCreateOrder}
        onFilterLowStockInInventory={() => onNavigateInventory("low")}
        onDeleteOrder={onDeleteOrder}
        onDeleteProduct={onDeleteProduct}
      />

      {/* Quick Warehouse Preview Section with Direct Link to Dedicated Inventory Page */}
      <section className="flex flex-col gap-3 pt-2 border-t border-outline-variant/35">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-[16px] font-bold text-on-surface tracking-tight">
              ภาพรวมสินค้าในคลังล่าสุด
            </h2>
            <p className="text-[12px] text-on-surface-variant tabular-nums">
              ทั้งหมด {products.length} รายการ ({totalUnits.toLocaleString()}{" "}
              ชิ้น)
              {lowStockItems.length > 0
                ? ` · ต้องสั่งเติม ${lowStockItems.length} รายการ`
                : " · สต็อกทุกรายการอยู่ในเกณฑ์ปกติ"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-on-surface hover:bg-surface-container-low text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">
                add
              </span>
              <span>เพิ่มสินค้า</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateInventory("all")}
              className="h-9 px-3.5 rounded-lg bg-primary text-on-primary hover:bg-primary-dim text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>ไปหน้าคลังสินค้าทั้งหมด</span>
              <span className="material-symbols-outlined text-[16px]">
                arrow_forward
              </span>
            </button>
          </div>
        </div>

        {previewProducts.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-8 text-center flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[32px] text-on-surface-variant">
              inventory_2
            </span>
            <p className="text-[14px] font-semibold text-on-surface">
              ยังไม่มีสินค้าในคลัง
            </p>
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="mt-1 h-9 px-4 rounded-lg bg-primary text-on-primary text-[12px] font-semibold cursor-pointer"
            >
              + เพิ่มสินค้าชิ้นแรก
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {previewProducts.map((product) => {
              const isLow = product.stock < product.lowThreshold;
              const isOut = product.stock <= 0;
              return (
                <article
                  key={product.id}
                  onClick={() => onSelectProductForEdit(product)}
                  className={`bg-surface-container-lowest rounded-xl p-3.5 flex items-center gap-3 transition-all cursor-pointer ${
                    isLow
                      ? "border border-primary/60 hover:shadow-md"
                      : "border border-outline-variant/40 hover:shadow-sm"
                  }`}
                >
                  <ResilientImage
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-14 h-14 rounded-lg object-cover bg-surface-container shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-on-surface truncate">
                      {product.name}
                    </p>
                    <p className="text-[11px] text-on-surface-variant tabular-nums truncate mt-0.5">
                      {product.sku} · {product.category}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[12px] tabular-nums">
                      <span
                        className={`font-bold ${
                          isOut
                            ? "text-error"
                            : isLow
                              ? "text-primary"
                              : "text-secondary"
                        }`}
                      >
                        คงเหลือ {product.stock} ชิ้น
                      </span>
                      <span className="text-on-surface-variant text-[11px]">
                        / ขั้นต่ำ {product.lowThreshold}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-bold text-primary tabular-nums">
                      ฿{product.sellPriceThb.toLocaleString()}
                    </p>
                    <span className="text-[11px] text-on-surface-variant">
                      แตะแก้ไข
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Floating Quick Action Buttons */}
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onNavigateInventory("all")}
          className="h-11 px-3.5 rounded-full bg-surface-container-lowest text-primary border border-outline-variant shadow-lg flex items-center gap-1 text-[12px] font-semibold transition-transform active:scale-95 hover:bg-surface-container-low cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">
            inventory_2
          </span>
          <span>คลังสินค้า</span>
        </button>

        {role === "owner" && (
          <button
            type="button"
            onClick={onNavigateScanner}
            className="h-11 px-4 rounded-full bg-primary text-on-primary shadow-xl flex items-center gap-1.5 text-[12px] font-semibold transition-transform active:scale-95 hover:bg-primary-dim cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              document_scanner
            </span>
            <span>สแกนบิล AI</span>
          </button>
        )}
      </div>
    </div>
  );
}
