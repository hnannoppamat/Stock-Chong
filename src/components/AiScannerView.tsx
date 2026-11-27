import { useRef, useState } from "react";
import { SAMPLE_ALTERNATE_INVOICES } from "../data/initialData";
import { RoleMode, ScannedBillItem, ScannedInvoice } from "../types";
import { readImageAsDataUrl } from "../utils/image";
import { ResilientImage } from "./ResilientImage";

interface AiScannerViewProps {
  role: RoleMode;
  invoice: ScannedInvoice;
  onUpdateInvoice: (invoice: ScannedInvoice) => void;
  exchangeRate: number;
  onExchangeRateChange: (rate: number) => void;
  freightCost: number;
  onFreightCostChange: (cost: number) => void;
  splitByQty: boolean;
  onSplitByQtyChange: (val: boolean) => void;
  autoSave: boolean;
  onAutoSaveChange: (val: boolean) => void;
  pendingCount: number;
  packingCount: number;
  readyToShipCount: number;
  shippedCount: number;
  onQuickCreateOrder: () => void;
  onGoToOrders: () => void;
  onOpenAddProduct: () => void;
  onSaveToInventory: (
    items: ScannedBillItem[],
    exchangeRate: number,
    freightPerUnit: number
  ) => void;
  onToggleRoleMode: () => void;
  onNotify: (msg: string, icon?: string) => void;
}

export function AiScannerView({
  role,
  invoice,
  onUpdateInvoice,
  exchangeRate,
  onExchangeRateChange,
  freightCost,
  onFreightCostChange,
  splitByQty,
  onSplitByQtyChange,
  autoSave,
  onAutoSaveChange,
  pendingCount,
  packingCount,
  readyToShipCount,
  shippedCount,
  onQuickCreateOrder,
  onGoToOrders,
  onOpenAddProduct,
  onSaveToInventory,
  onToggleRoleMode,
  onNotify,
}: AiScannerViewProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const itemCameraInputRef = useRef<HTMLInputElement>(null);
  const itemGalleryInputRef = useRef<HTMLInputElement>(null);
  const [targetImageItemId, setTargetImageItemId] = useState<string | null>(
    null
  );
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [sampleIndex, setSampleIndex] = useState(0);

  const totalQty = invoice.items.reduce((sum, item) => sum + item.quantity, 0);
  const freightPerUnit =
    splitByQty && totalQty > 0 ? freightCost / totalQty : 0;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError(null);
    setIsScanning(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/scan-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: file.type || "image/jpeg",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "ไม่สามารถสแกนบิลด้วย AI ได้");
      }

      const mappedItems: ScannedBillItem[] = Array.isArray(result.items)
        ? result.items.map(
            (
              item: {
                chineseName?: string;
                thaiName?: string;
                sku?: string;
                category?: string;
                quantity?: number;
                unitPriceCny?: number;
              },
              idx: number
            ) => ({
              id: `ai-${Date.now()}-${idx}`,
              chineseName: item.chineseName || "สินค้าจากบิล",
              thaiName: item.thaiName || item.chineseName || "สินค้าใหม่",
              sku: item.sku || `SKU-AI-${100 + idx}`,
              category: item.category || "กระเป๋าสะพายข้าง",
              quantity: Math.max(1, Number(item.quantity) || 1),
              unitPriceCny: Math.max(0, Number(item.unitPriceCny) || 0),
            })
          )
        : [];

      if (mappedItems.length === 0) {
        throw new Error("ไม่พบรายการสินค้าในบิลนี้ กรุณาลองภาพที่ชัดเจนขึ้น");
      }

      onUpdateInvoice({
        title: result.invoiceTitle || "ใบเสร็จรับสินค้าจีน",
        code: result.invoiceCode || `OCR #CN-${Math.floor(1000 + Math.random() * 9000)}`,
        confidence: Number(result.confidence) || 95,
        imageUrl: dataUrl,
        items: mappedItems,
      });
      onNotify(`AI สแกนบิลสำเร็จ (${mappedItems.length} รายการ)`, "document_scanner");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการสแกนบิล";
      setScanError(message);
      onNotify(message, "error");
    } finally {
      setIsScanning(false);
      if (cameraInputRef.current) {
        cameraInputRef.current.value = "";
      }
      if (galleryInputRef.current) {
        galleryInputRef.current.value = "";
      }
    }
  };

  const handleCycleSampleScan = () => {
    setScanError(null);
    setIsScanning(true);
    const nextIdx = (sampleIndex + 1) % SAMPLE_ALTERNATE_INVOICES.length;
    setTimeout(() => {
      setSampleIndex(nextIdx);
      onUpdateInvoice(SAMPLE_ALTERNATE_INVOICES[nextIdx]);
      setIsScanning(false);
      onNotify(
        `สแกนบิลตัวอย่าง ${SAMPLE_ALTERNATE_INVOICES[nextIdx].code} สำเร็จ`,
        "document_scanner"
      );
    }, 350);
  };

  const handleItemQtyDelta = (id: string, delta: number) => {
    const updated = invoice.items.map((item) =>
      item.id === id
        ? { ...item, quantity: Math.max(1, item.quantity + delta) }
        : item
    );
    onUpdateInvoice({ ...invoice, items: updated });
  };

  const handleTriggerItemImage = (
    itemId: string,
    source: "camera" | "gallery"
  ) => {
    setTargetImageItemId(itemId);
    if (source === "camera") {
      itemCameraInputRef.current?.click();
    } else {
      itemGalleryInputRef.current?.click();
    }
  };

  const handleItemImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !targetImageItemId) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      const updated = invoice.items.map((item) =>
        item.id === targetImageItemId ? { ...item, imageUrl: dataUrl } : item
      );
      onUpdateInvoice({ ...invoice, items: updated });
      onNotify("เพิ่มรูปภาพสินค้าเข้าใหม่เรียบร้อยแล้ว", "add_a_photo");
    } catch {
      onNotify("ไม่สามารถอ่านไฟล์รูปภาพได้", "error");
    } finally {
      setTargetImageItemId(null);
      if (itemCameraInputRef.current) itemCameraInputRef.current.value = "";
      if (itemGalleryInputRef.current) itemGalleryInputRef.current.value = "";
    }
  };

  const handleCommitInventory = () => {
    if (invoice.items.length === 0) return;
    onSaveToInventory(invoice.items, exchangeRate, freightPerUnit);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2200);
  };

  return (
    <div className="flex flex-col w-full gap-4 pb-6">
      {/* Top Quick Create Order CTA + Live Order Strip */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <button
          type="button"
          onClick={onQuickCreateOrder}
          className="w-full md:w-auto md:px-5 h-11 rounded-xl bg-surface-container-lowest text-primary font-semibold text-[14px] shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform shrink-0 cursor-pointer hover:bg-surface-container-low"
        >
          <span className="material-symbols-outlined text-[20px] text-primary">
            add_shopping_cart
          </span>
          <span className="whitespace-nowrap">+ สร้างออเดอร์ใหม่</span>
        </button>

        <button
          type="button"
          onClick={onGoToOrders}
          className="w-full flex-1 bg-surface-container-lowest rounded-xl p-2.5 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-2 hover:bg-surface-container-low/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-[16px] text-error shrink-0">
              notifications_active
            </span>
            <span className="text-[11px] font-medium text-on-surface truncate">
              ใหม่
            </span>
            <span className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container text-[11px] font-semibold tabular-nums shrink-0">
              +{pendingCount}
            </span>
          </div>
          <div className="flex items-center justify-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">
              package_2
            </span>
            <span className="text-[11px] font-medium text-on-surface truncate">
              กำลังแพ็ค
            </span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface text-[11px] font-medium tabular-nums shrink-0">
              {packingCount}
            </span>
          </div>
          <div className="flex items-center justify-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-[16px] text-primary shrink-0">
              outbox
            </span>
            <span className="text-[11px] font-medium text-on-surface truncate">
              รอจัดส่ง
            </span>
            <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-[11px] font-semibold tabular-nums shrink-0">
              {readyToShipCount}
            </span>
          </div>
          <div className="flex items-center justify-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-[16px] text-secondary shrink-0">
              local_shipping
            </span>
            <span className="text-[11px] font-medium text-on-surface truncate">
              ส่งแล้ว
            </span>
            <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-medium tabular-nums shrink-0">
              {shippedCount}
            </span>
          </div>
        </button>
      </div>

      {/* Main 2-column responsive layout (mobile stacked, desktop 12-col split) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Camera Viewfinder + Exchange Rate & Freight */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <section className="relative w-full rounded-xl bg-surface-container-lowest shadow-md overflow-hidden">
            <div className="relative w-full h-56 sm:h-64 bg-inverse-surface overflow-hidden">
              <ResilientImage
                src={invoice.imageUrl}
                alt={invoice.title}
                className="w-full h-full object-cover opacity-55"
                fallbackIcon="receipt_long"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface via-inverse-surface/40 to-transparent" />

              {/* Top Status Bar inside Viewfinder */}
              <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container shadow-sm min-w-0">
                  <span className="material-symbols-outlined material-symbols-filled text-[15px] shrink-0">
                    admin_panel_settings
                  </span>
                  <span className="text-[11px] font-medium truncate">
                    {role === "owner" ? "สิทธิ์เจ้าของร้าน (Owner)" : "โหมดพนักงาน"} • AI
                    สแกนจีน-ไทย ({invoice.confidence}%)
                  </span>
                </div>

                {role === "owner" && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={isScanning}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-on-primary shadow-sm active:scale-95 transition-transform text-[11px] font-medium cursor-pointer disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        photo_camera
                      </span>
                      <span className="whitespace-nowrap">ถ่ายรูปบิล</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={isScanning}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-lowest/95 text-primary backdrop-blur-md shadow-sm active:scale-95 transition-transform text-[11px] font-medium cursor-pointer disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        photo_library
                      </span>
                      <span className="whitespace-nowrap">คลังรูปภาพ</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCycleSampleScan}
                      disabled={isScanning}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-lowest/90 text-on-surface backdrop-blur-md shadow-sm active:scale-95 transition-transform text-[11px] font-medium cursor-pointer disabled:opacity-60"
                    >
                      <span
                        className={`material-symbols-outlined text-[15px] text-primary ${
                          isScanning ? "animate-spin" : ""
                        }`}
                      >
                        {isScanning ? "sync" : "document_scanner"}
                      </span>
                      <span className="whitespace-nowrap">
                        {isScanning ? "กำลังสแกน..." : "สแกนใหม่"}
                      </span>
                    </button>
                  </div>
                )}

                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <input
                  ref={itemCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleItemImageChange}
                />
                <input
                  ref={itemGalleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleItemImageChange}
                />
              </div>

              {/* AI OCR Bounding-Box Highlight Overlay */}
              <div className="absolute inset-x-3 bottom-3 rounded-lg bg-surface-container-lowest/95 backdrop-blur-md p-2.5 shadow-md">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[15px] text-secondary shrink-0">
                      document_scanner
                    </span>
                    <span className="text-[12px] font-semibold text-primary truncate">
                      {invoice.title}
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-on-surface-variant shrink-0 tabular-nums">
                    {invoice.code}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  {invoice.items.slice(0, 2).map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-2 py-1 rounded ${
                        idx === 0
                          ? "bg-primary-fixed/60 text-on-primary-fixed"
                          : "bg-secondary-container/50 text-on-secondary-fixed"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[12px] truncate">
                          {idx + 1}. {item.chineseName} ({item.thaiName})
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded bg-surface-container-lowest text-[10px] font-semibold shrink-0 tabular-nums ${
                            idx === 0 ? "text-primary" : "text-secondary"
                          }`}
                        >
                          x{item.quantity} ชิ้น
                        </span>
                      </div>
                      {role === "owner" && (
                        <span className="text-[12px] font-semibold tabular-nums shrink-0 ml-2">
                          ¥{item.unitPriceCny.toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {scanError && (
              <div className="px-3 py-2 bg-error-container/20 text-error text-[12px] flex items-center justify-between gap-2">
                <span>{scanError}</span>
                <button
                  type="button"
                  onClick={() => setScanError(null)}
                  className="text-[11px] font-semibold underline shrink-0 cursor-pointer"
                >
                  ปิด
                </button>
              </div>
            )}
          </section>

          {/* Exchange Rate & Freight Cost Panel (Owner Only) + Auto-save */}
          <section className="w-full rounded-xl bg-surface-container-lowest p-4 shadow-sm flex flex-col gap-4">
            {role === "owner" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed shrink-0">
                      <span className="material-symbols-outlined text-[18px]">
                        currency_exchange
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[15px] font-semibold text-on-surface block truncate">
                        เรทเงินและค่าขนส่งนำเข้า
                      </span>
                      <span className="text-[11px] text-on-surface-variant block truncate">
                        คำนวณต้นทุนรวมสุทธิ (Landed Cost per unit)
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container/60 text-on-secondary-container text-[11px] font-medium shrink-0">
                    อัปเดตอัตโนมัติ
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="exchange-rate"
                      className="text-[11px] text-on-surface-variant truncate"
                    >
                      เรทเงินสำหรับบิลนี้ (CNY → THB)
                    </label>
                    <div className="h-12 px-3 rounded-lg bg-surface-container-low flex items-center justify-between gap-1">
                      <span className="text-[12px] text-on-surface-variant shrink-0">
                        1 ¥ =
                      </span>
                      <input
                        id="exchange-rate"
                        type="number"
                        step="0.01"
                        min="0"
                        value={exchangeRate}
                        onChange={(e) =>
                          onExchangeRateChange(parseFloat(e.target.value) || 0)
                        }
                        className="w-full bg-transparent text-right text-[16px] font-semibold text-primary tabular-nums focus:outline-none min-w-0"
                      />
                      <span className="text-[12px] text-on-surface-variant shrink-0">
                        ฿
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="freight-cost"
                      className="text-[11px] text-on-surface-variant truncate"
                    >
                      ค่าขนส่งนำเข้าต่อบิล (Shipping Fee)
                    </label>
                    <div className="h-12 px-3 rounded-lg bg-surface-container-low flex items-center justify-between gap-1">
                      <input
                        id="freight-cost"
                        type="number"
                        step="10"
                        min="0"
                        value={freightCost}
                        onChange={(e) =>
                          onFreightCostChange(parseFloat(e.target.value) || 0)
                        }
                        className="w-full bg-transparent text-right text-[16px] font-semibold text-on-surface tabular-nums focus:outline-none min-w-0"
                      />
                      <span className="text-[12px] text-on-surface-variant shrink-0">
                        ฿
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-surface-container gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[20px] text-primary shrink-0">
                      local_shipping
                    </span>
                    <div className="min-w-0">
                      <span className="text-[13px] font-semibold text-on-surface block truncate">
                        เฉลี่ยค่าส่งตามจำนวนชิ้น (Landed Cost)
                      </span>
                      <span className="text-[11px] text-on-surface-variant block">
                        {splitByQty
                          ? `+฿${freightPerUnit.toFixed(2)}/ชิ้น คำนวณเข้าต้นทุนรวมบาท (฿) อัตโนมัติ`
                          : "ปิดการเฉลี่ยค่าส่ง — แสดงเฉพาะต้นทุนราคาสินค้า"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={splitByQty}
                    aria-label="เฉลี่ยค่าส่งตามจำนวนชิ้น"
                    onClick={() => onSplitByQtyChange(!splitByQty)}
                    className={`relative w-12 h-7 rounded-full transition-colors flex items-center px-1 shrink-0 cursor-pointer ${
                      splitByQty ? "bg-primary" : "bg-surface-container-highest"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-on-primary shadow-sm transition-transform ${
                        splitByQty ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </>
            )}

            <div className={role === "owner" ? "pt-2 border-t border-surface-container" : ""}>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[20px] text-primary shrink-0 mt-0.5">
                    bolt
                  </span>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12px] font-semibold text-on-surface">
                        บันทึกข้อมูลเข้าสต็อกอัตโนมัติ (Auto-save)
                      </span>
                      {autoSave && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-[10px] font-semibold">
                          <span className="material-symbols-outlined text-[12px]">
                            check_circle
                          </span>
                          <span>บันทึกข้อมูลอัตโนมัติแล้ว</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                      {role === "owner"
                        ? "เมื่อ AI สแกนและคำนวณเรทเงิน/ค่าส่งเสร็จสิ้น ระบบจะบันทึกข้อมูลและอัปเดตต้นทุนเข้าคลังสินค้าทันที"
                        : "เมื่อ AI สแกนบิลเสร็จสิ้น ระบบจะบันทึกรายการและจำนวนสินค้าเข้าคลังทันทีโดยอัตโนมัติ"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSave}
                  aria-label="เปิดหรือปิดการบันทึกข้อมูลอัตโนมัติ"
                  onClick={() => onAutoSaveChange(!autoSave)}
                  className={`relative w-12 h-7 rounded-full transition-colors flex items-center px-1 shrink-0 cursor-pointer ${
                    autoSave ? "bg-primary" : "bg-surface-container-highest"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-on-primary shadow-sm transition-transform ${
                      autoSave ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Parsed Items List & Primary Action */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex flex-col gap-2 px-0.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold text-on-surface">
                  รายการสินค้าที่ AI แยกได้
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-semibold tabular-nums">
                  {invoice.items.length} รายการ · {totalQty} ชิ้น
                </span>
              </div>
              <span className="text-[11px] text-secondary bg-secondary-container/50 px-2.5 py-0.5 rounded-full font-medium">
                {role === "owner" ? "สิทธิ์ Owner บันทึกต้นทุน" : "โหมดพนักงาน (ไม่แสดงต้นทุน)"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenAddProduct}
                className="flex-1 h-10 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-primary text-[12px] font-semibold flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-transform cursor-pointer hover:bg-surface-container-low"
              >
                <span className="material-symbols-outlined text-[16px]">
                  add_circle
                </span>
                <span>+ เพิ่มสินค้าใหม่</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {invoice.items.map((item) => {
              const landedCost = item.unitPriceCny * exchangeRate + freightPerUnit;
              return (
                <article
                  key={item.id}
                  className="w-full rounded-xl bg-surface-container-lowest p-4 shadow-sm flex items-center gap-3"
                >
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <ResilientImage
                      src={item.imageUrl}
                      alt={item.thaiName}
                      className="w-14 h-14 rounded-lg object-cover bg-surface-container shrink-0"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="ถ่ายรูปด้วยกล้อง"
                        onClick={() => handleTriggerItemImage(item.id, "camera")}
                        className="px-1.5 py-0.5 rounded-md bg-primary-fixed/80 hover:bg-primary-fixed text-on-primary-fixed text-[10px] font-semibold flex items-center gap-0.5 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-[12px]">
                          photo_camera
                        </span>
                        <span>กล้อง</span>
                      </button>
                      <button
                        type="button"
                        title="เลือกจากคลังรูปภาพ"
                        onClick={() => handleTriggerItemImage(item.id, "gallery")}
                        className="px-1.5 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface text-[10px] font-semibold flex items-center gap-0.5 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-[12px]">
                          photo_library
                        </span>
                        <span>คลัง</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[14px] font-semibold text-on-surface line-clamp-2">
                        {item.thaiName} ({item.chineseName})
                      </h3>
                      <span className="text-[11px] text-on-surface-variant shrink-0">
                        {item.sku}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-[11px] font-medium">
                          <button
                            type="button"
                            aria-label="ลดจำนวน"
                            onClick={() => handleItemQtyDelta(item.id, -1)}
                            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/40 cursor-pointer"
                          >
                            -
                          </button>
                          <span className="tabular-nums px-1">
                            จำนวน: {item.quantity} ชิ้น
                          </span>
                          <button
                            type="button"
                            aria-label="เพิ่มจำนวน"
                            onClick={() => handleItemQtyDelta(item.id, 1)}
                            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/40 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-[13px] text-on-surface-variant tabular-nums">
                          {role === "owner"
                            ? `ราคาจีน: ¥${item.unitPriceCny.toFixed(2)}`
                            : `หมวด: ${item.category}`}
                        </span>
                      </div>
                    </div>

                    {role === "owner" && (
                      <div className="flex items-center justify-between mt-0.5 bg-surface-container-low/80 rounded-lg px-3 py-1.5">
                        <span className="text-[11px] text-on-surface-variant">
                          ต้นทุนรวมค่าส่ง
                        </span>
                        <span className="text-[15px] font-semibold text-secondary tabular-nums">
                          ฿{landedCost.toFixed(2)}/ชิ้น
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Bottom Primary CTA */}
          <div className="w-full flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low text-on-surface-variant">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-secondary shrink-0">
                  shield_person
                </span>
                <span className="text-[12px] truncate">
                  โหมดสิทธิ์บันทึก:{" "}
                  <strong className="text-on-surface">
                    {role === "owner"
                      ? "เฉพาะเจ้าของร้าน (Owner)"
                      : "โหมดพนักงาน (Staff)"}
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={onToggleRoleMode}
                className="text-primary text-[12px] font-medium underline shrink-0 cursor-pointer"
              >
                {role === "owner" ? "สลับให้พนักงานบันทึก" : "ปลดล็อกเจ้าของร้าน"}
              </button>
            </div>

            <button
              type="button"
              onClick={handleCommitInventory}
              className={`w-full h-12 rounded-xl font-semibold text-[14px] shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer ${
                savedSuccess
                  ? "bg-secondary text-on-secondary"
                  : "bg-primary text-on-primary hover:bg-primary-dim"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {savedSuccess ? "check_circle" : "inventory_2"}
              </span>
              <span>
                {savedSuccess
                  ? `บันทึกเข้าคลังสำเร็จแล้ว (${totalQty} ชิ้น)`
                  : `บันทึกเข้าคลังสินค้า (นำเข้า ${totalQty} ชิ้น)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
