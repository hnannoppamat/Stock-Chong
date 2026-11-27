import { useRef, useState } from "react";
import {
  Customer,
  DeliveryConfirmationMethod,
  Order,
  OrderFulfillmentType,
  OrderItem,
  ProductColorVariant,
  ProductItem,
  RoleMode,
} from "../types";
import { readImageAsDataUrl } from "../utils/image";
import { ResilientImage } from "./ResilientImage";

const PRESET_COLORS: { name: string; hex: string }[] = [
  { name: "ดำ", hex: "#1f2937" },
  { name: "ขาว", hex: "#f8fafc" },
  { name: "เทา/เงิน", hex: "#94a3b8" },
  { name: "ชมพู", hex: "#f472b6" },
  { name: "ฟ้า/น้ำเงิน", hex: "#3b82f6" },
  { name: "เขียว", hex: "#22c55e" },
  { name: "แดง", hex: "#ef4444" },
  { name: "เบจ/ทอง", hex: "#d6c3a5" },
  { name: "ม่วง", hex: "#a855f7" },
];

interface AddProductModalProps {
  role: RoleMode;
  categories: string[];
  onAddCategory: (categoryName: string) => void;
  onClose: () => void;
  onSave: (product: Omit<ProductItem, "id" | "updatedAt">) => void;
}

export function AddProductModal({
  role,
  categories,
  onAddCategory,
  onClose,
  onSave,
}: AddProductModalProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const colorCameraInputRef = useRef<HTMLInputElement>(null);
  const colorGalleryInputRef = useRef<HTMLInputElement>(null);
  const activeColorIndexRef = useRef<number | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState(categories[0] || "กระเป๋าสะพายข้าง");
  const [showInlineAddCat, setShowInlineAddCat] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState("");
  const [stock, setStock] = useState("20");
  const [cost, setCost] = useState("65");
  const [sellPrice, setSellPrice] = useState("159");
  const [lowThreshold, setLowThreshold] = useState("15");
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [selectedColors, setSelectedColors] = useState<ProductColorVariant[]>(
    []
  );
  const [customColorName, setCustomColorName] = useState("");
  const [customColorHex, setCustomColorHex] = useState("#e11d74");

  const hasColors = selectedColors.length > 0;
  const totalColorStock = selectedColors.reduce(
    (sum, c) => sum + Math.max(0, c.stock ?? 0),
    0
  );

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setImageUrl(dataUrl);
    } catch {
      // ignore invalid file
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const handleAddInlineCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setNewCategoryError("กรุณาระบุชื่อหมวดหมู่");
      return;
    }
    if (categories.includes(trimmed)) {
      setCategory(trimmed);
      setNewCategoryName("");
      setNewCategoryError("");
      setShowInlineAddCat(false);
      return;
    }
    onAddCategory(trimmed);
    setCategory(trimmed);
    setNewCategoryName("");
    setNewCategoryError("");
    setShowInlineAddCat(false);
  };

  const handleTogglePresetColor = (preset: { name: string; hex: string }) => {
    setSelectedColors((prev) => {
      const exists = prev.some((c) => c.name === preset.name);
      if (exists) {
        return prev.filter((c) => c.name !== preset.name);
      }
      if (prev.length >= 20) return prev;
      return [...prev, { name: preset.name, hex: preset.hex, stock: 10 }];
    });
  };

  const handleAddCustomColor = () => {
    const trimmed = customColorName.trim();
    if (!trimmed || selectedColors.length >= 20) return;
    if (selectedColors.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setCustomColorName("");
      return;
    }
    setSelectedColors((prev) => [
      ...prev,
      { name: trimmed.slice(0, 40), hex: customColorHex, stock: 10 },
    ]);
    setCustomColorName("");
  };

  const handleUpdateColorStock = (targetIdx: number, nextVal: number) => {
    const clamped = Math.max(0, Math.min(1000000, Math.round(nextVal) || 0));
    setSelectedColors((prev) =>
      prev.map((c, idx) => (idx === targetIdx ? { ...c, stock: clamped } : c))
    );
  };

  const handleColorImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    const targetIdx = activeColorIndexRef.current;
    if (!file || targetIdx === null) return;
    try {
      const dataUrl = await readImageAsDataUrl(file, 260, 40000);
      setSelectedColors((prev) =>
        prev.map((c, idx) =>
          idx === targetIdx ? { ...c, imageUrl: dataUrl } : c
        )
      );
    } catch {
      // ignore invalid file
    } finally {
      activeColorIndexRef.current = null;
      if (colorCameraInputRef.current) colorCameraInputRef.current.value = "";
      if (colorGalleryInputRef.current) colorGalleryInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const fallbackColorImg = selectedColors.find((c) => c.imageUrl)?.imageUrl;
    const finalStock = hasColors
      ? totalColorStock
      : Math.max(0, parseInt(stock, 10) || 0);
    onSave({
      name: name.trim(),
      sku:
        sku.trim() ||
        `SKU-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      origin: "cn",
      category,
      stock: finalStock,
      lowThreshold: Math.max(1, parseInt(lowThreshold, 10) || 10),
      landedCostThb:
        role === "owner" ? Math.max(0, parseFloat(cost) || 0) : 0,
      sellPriceThb: Math.max(0, parseFloat(sellPrice) || 0),
      imageUrl: imageUrl || fallbackColorImg,
      colors: hasColors ? selectedColors : undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-inverse-surface/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-outline-variant/50 rounded-full mx-auto mb-3 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">add_box</span>
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-on-surface">
                เพิ่มสินค้าใหม่เข้าคลัง
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                บันทึกข้อมูลสินค้าอัตโนมัติทันที
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Product Image Upload */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/40">
            <div className="w-16 h-16 rounded-lg bg-surface-container flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/30">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="ตัวอย่างรูปสินค้า"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-[28px] text-on-surface-variant">
                  image
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-on-surface">
                รูปภาพสินค้าเข้าใหม่
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="h-9 px-3 rounded-lg bg-primary text-on-primary hover:bg-primary-dim text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    photo_camera
                  </span>
                  <span>ถ่ายรูป</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="h-9 px-3 rounded-lg bg-primary-fixed text-on-primary-fixed hover:bg-primary-fixed-dim text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    photo_library
                  </span>
                  <span>คลังรูปภาพ</span>
                </button>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl(undefined)}
                    className="h-9 px-2.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-error text-[12px] font-medium cursor-pointer"
                  >
                    ลบรูป
                  </button>
                )}
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageChange}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
              ชื่อสินค้า *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น กระเป๋าสะพายข้างหนัง PU มินิมอล"
              className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                รหัส SKU
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="SKU-BAG-01"
                className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-[12px] font-medium text-on-surface-variant">
                  หมวดหมู่สินค้า
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowInlineAddCat((prev) => !prev);
                    setNewCategoryError("");
                  }}
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {showInlineAddCat ? "close" : "add"}
                  </span>
                  <span>
                    {showInlineAddCat ? "ปิด" : "เพิ่มหมวดหมู่สินค้า"}
                  </span>
                </button>
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface focus:outline-none focus:border-primary"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showInlineAddCat && (
            <div className="p-2.5 rounded-xl bg-primary-fixed/25 border border-primary/25 flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">
                  category
                </span>
                <span>เพิ่มหมวดหมู่สินค้าใหม่</span>
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    setNewCategoryError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddInlineCategory();
                    }
                  }}
                  placeholder="เช่น กระเป๋าคลัทช์, กระเป๋าคาดอก, กระเป๋าเครื่องสำอาง"
                  className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-[13px] text-on-surface focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleAddInlineCategory}
                  className="h-9 px-3 rounded-lg bg-primary text-on-primary text-[12px] font-semibold shrink-0 cursor-pointer"
                >
                  เพิ่ม
                </button>
              </div>
              {newCategoryError && (
                <p className="text-[11px] text-error">{newCategoryError}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                {hasColors
                  ? "จำนวนรวมจากทุกสี (ใบ/ชิ้น)"
                  : "จำนวนคงเหลือ (ใบ/ชิ้น)"}
              </label>
              <input
                type="number"
                min="0"
                readOnly={hasColors}
                value={hasColors ? String(totalColorStock) : stock}
                onChange={(e) => setStock(e.target.value)}
                className={`w-full h-11 px-3 rounded-lg border border-outline-variant/40 text-[14px] tabular-nums focus:outline-none focus:border-primary ${
                  hasColors
                    ? "bg-surface-container text-primary font-semibold"
                    : "bg-surface-container-low text-on-surface"
                }`}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                แจ้งเตือนใกล้หมด (ใบ/ชิ้น)
              </label>
              <input
                type="number"
                min="1"
                value={lowThreshold}
                onChange={(e) => setLowThreshold(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface tabular-nums focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className={`grid gap-3 ${role === "owner" ? "grid-cols-2" : "grid-cols-1"}`}>
            {role === "owner" && (
              <div>
                <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                  ต้นทุนต่อชิ้น (฿/ชิ้น)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface tabular-nums focus:outline-none focus:border-primary"
                />
              </div>
            )}
            <div>
              <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                ราคาขาย (฿/ชิ้น)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] text-primary font-semibold tabular-nums focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Color Variants & Per-Color Photos */}
          <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/40 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">
                  palette
                </span>
                <span>สีสินค้า &amp; รูปภาพแยกตามสี</span>
              </span>
              <span className="text-[11px] text-on-surface-variant tabular-nums">
                เลือกแล้ว {selectedColors.length} สี
              </span>
            </div>

            {/* Preset Color Swatch Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESET_COLORS.map((preset) => {
                const isSelected = selectedColors.some(
                  (c) => c.name === preset.name
                );
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleTogglePresetColor(preset)}
                    className={`h-8 px-2.5 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-primary-fixed text-on-primary-fixed border-primary font-semibold shadow-xs"
                        : "bg-surface-container-lowest text-on-surface border-outline-variant/50 hover:bg-surface-container"
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/15 shrink-0"
                      style={{ backgroundColor: preset.hex }}
                    />
                    <span>{preset.name}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-[14px]">
                        check
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom Color Adder */}
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                aria-label="เลือกโค้ดสีเพิ่มเติม"
                value={customColorHex}
                onChange={(e) => setCustomColorHex(e.target.value)}
                className="w-9 h-9 rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-0.5 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customColorName}
                onChange={(e) => setCustomColorName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomColor();
                  }
                }}
                placeholder="เพิ่มสีอื่น เช่น ชมพูพาสเทล, ทองแดง..."
                className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-[12px] text-on-surface focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleAddCustomColor}
                disabled={!customColorName.trim()}
                className="h-9 px-3 rounded-lg bg-surface-container text-primary font-semibold text-[12px] hover:bg-primary-fixed disabled:opacity-40 cursor-pointer shrink-0"
              >
                + เพิ่มสี
              </button>
            </div>

            {/* Selected Colors with Per-Color Stock Quantity & Image Upload */}
            {selectedColors.length > 0 && (
              <div className="flex flex-col gap-2 pt-1 border-t border-outline-variant/30">
                {selectedColors.map((color, idx) => (
                  <div
                    key={color.name}
                    className="flex flex-col gap-2 p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-surface-container border border-outline-variant/30 overflow-hidden flex items-center justify-center shrink-0">
                          {color.imageUrl ? (
                            <img
                              src={color.imageUrl}
                              alt={`สี${color.name}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span
                              className="w-5 h-5 rounded-full border border-black/15"
                              style={{ backgroundColor: color.hex }}
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-3 h-3 rounded-full border border-black/15 shrink-0"
                              style={{ backgroundColor: color.hex }}
                            />
                            <span className="text-[12px] font-semibold text-on-surface truncate">
                              สี{color.name}
                            </span>
                          </div>
                          <p className="text-[10px] text-on-surface-variant">
                            {color.imageUrl ? "แนบรูปสีแล้ว" : "ยังไม่มีรูปสี"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="ถ่ายรูปสีด้วยกล้อง"
                          onClick={() => {
                            activeColorIndexRef.current = idx;
                            colorCameraInputRef.current?.click();
                          }}
                          className="h-8 px-2 rounded-lg bg-primary text-on-primary hover:bg-primary-dim text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            photo_camera
                          </span>
                          <span>ถ่ายรูป</span>
                        </button>
                        <button
                          type="button"
                          title="เลือกรูปสีจากคลังรูปภาพ"
                          onClick={() => {
                            activeColorIndexRef.current = idx;
                            colorGalleryInputRef.current?.click();
                          }}
                          className="h-8 px-2 rounded-lg bg-primary-fixed text-on-primary-fixed hover:bg-primary-fixed-dim text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            photo_library
                          </span>
                          <span>คลังรูป</span>
                        </button>
                        {color.imageUrl && (
                          <button
                            type="button"
                            aria-label={`ลบรูปสี${color.name}`}
                            onClick={() =>
                              setSelectedColors((prev) =>
                                prev.map((c, i) =>
                                  i === idx ? { ...c, imageUrl: undefined } : c
                                )
                              )
                            }
                            className="w-8 h-8 rounded-lg bg-surface-container text-on-surface-variant hover:text-error flex items-center justify-center cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              hide_image
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`ลบสี${color.name}`}
                          onClick={() =>
                            setSelectedColors((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="w-8 h-8 rounded-lg bg-surface-container text-on-surface-variant hover:text-error flex items-center justify-center cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            close
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Per-color stock quantity row */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-outline-variant/20">
                      <span className="text-[11px] font-medium text-on-surface-variant">
                        จำนวนสี{color.name}ในคลัง
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateColorStock(idx, (color.stock ?? 0) - 1)
                          }
                          className="w-7 h-7 rounded-md bg-surface-container text-on-surface font-bold text-[14px] flex items-center justify-center cursor-pointer hover:bg-surface-container-high"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          aria-label={`จำนวนสี${color.name}`}
                          value={color.stock ?? 0}
                          onChange={(e) =>
                            handleUpdateColorStock(
                              idx,
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-16 h-7 px-1.5 text-center rounded-md bg-surface-container-low border border-outline-variant/40 text-[13px] font-semibold text-on-surface tabular-nums focus:outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateColorStock(idx, (color.stock ?? 0) + 1)
                          }
                          className="w-7 h-7 rounded-md bg-surface-container text-on-surface font-bold text-[14px] flex items-center justify-center cursor-pointer hover:bg-surface-container-high"
                        >
                          +
                        </button>
                        <span className="text-[11px] text-on-surface-variant">
                          ใบ/ชิ้น
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-1 pt-0.5 text-[11px]">
                  <span className="text-on-surface-variant">
                    รวมสต็อกทุกสีอัตโนมัติ
                  </span>
                  <span className="font-bold text-primary tabular-nums">
                    {totalColorStock.toLocaleString()} ใบ/ชิ้น
                  </span>
                </div>
              </div>
            )}

            <input
              ref={colorCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleColorImageChange}
            />
            <input
              ref={colorGalleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleColorImageChange}
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-surface-container text-on-surface font-semibold text-[14px] cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex-[1.5] h-11 rounded-xl bg-primary text-on-primary font-semibold text-[14px] shadow-md active:scale-[0.98] transition-transform cursor-pointer"
            >
              บันทึกสินค้าใหม่
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddCategoryModalProps {
  existingCategories: string[];
  onClose: () => void;
  onAdd: (categoryName: string) => void;
}

export function AddCategoryModal({
  existingCategories,
  onClose,
  onAdd,
}: AddCategoryModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("กรุณาระบุชื่อหมวดหมู่");
      return;
    }
    if (existingCategories.includes(trimmed)) {
      setError("หมวดหมู่นี้มีอยู่แล้ว");
      return;
    }
    onAdd(trimmed);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-inverse-surface/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-outline-variant/50 rounded-full mx-auto mb-3 sm:hidden" />
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[16px] font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">category</span>
            <span>เพิ่มหมวดหมู่สินค้า</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
              ชื่อหมวดหมู่ใหม่
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="เช่น กระเป๋าคลัทช์, กระเป๋าคาดอก, กระเป๋าเครื่องสำอาง"
              className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface focus:outline-none focus:border-primary"
            />
            {error && <p className="text-[12px] text-error mt-1">{error}</p>}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-surface-container text-on-surface font-semibold text-[14px] cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex-1 h-11 rounded-xl bg-primary text-on-primary font-semibold text-[14px] shadow-md cursor-pointer"
            >
              เพิ่มหมวดหมู่
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditProductModalProps {
  product: ProductItem;
  role: RoleMode;
  onClose: () => void;
  onUpdateOwner: (updated: ProductItem) => void;
  onRequestStockChange: (
    product: ProductItem,
    requestedStock: number,
    reason: string
  ) => void;
  onSwitchToOwnerAuth: () => void;
}

export function EditProductModal({
  product,
  role,
  onClose,
  onUpdateOwner,
  onRequestStockChange,
  onSwitchToOwnerAuth,
}: EditProductModalProps) {
  const [stock, setStock] = useState(String(product.stock));
  const [sellPrice, setSellPrice] = useState(String(product.sellPriceThb));
  const [landedCost, setLandedCost] = useState(String(product.landedCostThb));
  const [reason, setReason] = useState("ตรวจนับสต็อกจริงหน้าร้าน");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedStock = Math.max(0, parseInt(stock, 10) || 0);
    if (role === "owner") {
      onUpdateOwner({
        ...product,
        stock: parsedStock,
        sellPriceThb: Math.max(0, parseFloat(sellPrice) || 0),
        landedCostThb: Math.max(0, parseFloat(landedCost) || 0),
        updatedAt: "เมื่อสักครู่",
      });
    } else {
      onRequestStockChange(product, parsedStock, reason.trim() || "ขอปรับสต็อก");
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-inverse-surface/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-outline-variant/50 rounded-full mx-auto mb-3 sm:hidden" />
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="text-[16px] font-semibold text-on-surface">
              {product.name}
            </h3>
            <p className="text-[12px] text-on-surface-variant">
              {product.sku} · คงเหลือปัจจุบัน {product.stock} ชิ้น
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {role === "staff" && (
          <div className="mb-3 p-3 rounded-xl bg-tertiary-fixed/40 text-on-tertiary-fixed flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
              lock
            </span>
            <div className="text-[12px] leading-relaxed">
              <p className="font-semibold">
                โหมดพนักงาน: ไม่อนุญาตให้แก้ไขสต็อกโดยตรง
              </p>
              <p className="opacity-85">
                คุณสามารถส่งคำขอปรับยอดให้เจ้าของร้านอนุมัติ หรือ{" "}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToOwnerAuth();
                  }}
                  className="underline font-semibold cursor-pointer"
                >
                  ปลดล็อกโหมดเจ้าของร้าน
                </button>
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-[12px] font-medium text-on-surface-variant">
                {role === "owner"
                  ? "จำนวนสต็อกใหม่ (ชิ้น)"
                  : "จำนวนสต็อกที่ขอปรับ (ชิ้น)"}
              </label>
              <span className="text-[11px] text-on-surface-variant tabular-nums">
                เกณฑ์ขั้นต่ำ: {product.lowThreshold} ชิ้น
              </span>
            </div>
            <input
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[16px] font-semibold text-on-surface tabular-nums focus:outline-none focus:border-primary"
            />
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              {[-5, -1, 1, 5, 10].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => {
                    const current = Math.max(0, parseInt(stock, 10) || 0);
                    setStock(String(Math.max(0, current + delta)));
                  }}
                  className="h-8 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-outline-variant/40 text-[12px] font-semibold text-on-surface tabular-nums cursor-pointer active:scale-95 transition-transform"
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
              {product.stock < product.lowThreshold && (
                <button
                  type="button"
                  onClick={() => setStock(String(product.lowThreshold))}
                  className="h-8 px-2.5 rounded-lg bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary text-[11px] font-semibold tabular-nums cursor-pointer active:scale-95 transition-colors ml-auto"
                >
                  เติมครบเกณฑ์ ({product.lowThreshold})
                </button>
              )}
            </div>
          </div>

          {role === "owner" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                  ต้นทุนแลนดิ้ง (฿/ชิ้น)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={landedCost}
                  onChange={(e) => setLandedCost(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface tabular-nums focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                  ราคาขาย (฿/ชิ้น)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] font-semibold text-primary tabular-nums focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                เหตุผลในการขอปรับยอดสต็อก
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-surface-container text-on-surface font-semibold text-[14px] cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className={`flex-[1.5] h-11 rounded-xl font-semibold text-[14px] shadow-md cursor-pointer ${
                role === "owner"
                  ? "bg-primary text-on-primary"
                  : "bg-secondary text-on-secondary"
              }`}
            >
              {role === "owner" ? "บันทึกการแก้ไข" : "ส่งคำขออนุมัติ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface PrintLabelModalProps {
  order: Order;
  onClose: () => void;
  onPrinted: (orderId: string) => void;
}

export function PrintLabelModal({
  order,
  onClose,
  onPrinted,
}: PrintLabelModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-inverse-surface/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-surface-container-lowest rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-surface-container">
          <h3 className="text-[15px] font-semibold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[20px]">
              print
            </span>
            <span>ตัวอย่างใบปะหน้าพัสดุ</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="my-4 p-4 rounded-xl border-2 border-dashed border-outline-variant bg-white text-on-surface flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-surface-container pb-2">
            <div>
              <p className="text-[11px] text-on-surface-variant">ผู้ส่ง</p>
              <p className="text-[13px] font-bold">DenewStock Hub</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {(order.orderType || order.channel) && (
                <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-[11px] font-semibold">
                  {order.orderType === "walk_in"
                    ? "Walk-in"
                    : order.orderType === "delivery"
                      ? "ส่งของ"
                      : order.channel}
                </span>
              )}
              {(order.shippingOption || order.carrierName || order.courier) && (
                <span className="text-[10px] font-medium text-secondary">
                  {order.shippingOption === "store_delivery"
                    ? "ส่งถึงหน้าร้าน"
                    : order.shippingOption === "store_pickup"
                      ? "มารับหน้าร้าน"
                      : order.carrierName || order.courier || "ส่งขนส่ง"}
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-on-surface-variant">ผู้รับ</p>
            <p className="text-[15px] font-bold">{order.customerName}</p>
            <p className="text-[12px] text-on-surface-variant mt-0.5">
              เลขออเดอร์ #{order.id} · ยอดรวม ฿
              {order.totalThb.toLocaleString()}
            </p>
          </div>

          <div className="bg-surface-container-low rounded-lg p-2.5 text-[12px] flex flex-col gap-1">
            <p className="font-semibold text-on-surface-variant text-[11px]">
              รายการสินค้าในกล่อง
            </p>
            {order.items.map((item, idx) => (
              <div
                key={`${item.sku}-${item.colorName || idx}`}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  {item.name}
                  {item.colorName ? ` (สี${item.colorName})` : ""}
                </span>
                <span className="font-semibold tabular-nums shrink-0">
                  x{item.quantity}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-1 text-center">
            <div className="h-10 bg-[repeating-linear-gradient(90deg,#3d1428,#3d1428_2px,transparent_2px,transparent_5px,#3d1428_5px,#3d1428_8px,transparent_8px,transparent_10px)] rounded-sm opacity-85" />
            <p className="text-[11px] font-mono tracking-widest mt-1 text-on-surface-variant">
              {order.trackingCode || `TH-${order.id}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl bg-surface-container text-on-surface font-semibold text-[14px] cursor-pointer"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={() => {
              onPrinted(order.id);
              onClose();
            }}
            className="flex-[1.5] h-11 rounded-xl bg-primary text-on-primary font-semibold text-[14px] flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>สั่งพิมพ์ใบปะหน้า</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeliveryConfirmModalProps {
  order: Order;
  canEdit?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    orderId: string;
    method: DeliveryConfirmationMethod;
    proofImage?: string;
    cashReceivedThb?: number;
    note?: string;
  }) => void;
}

const DELIVERY_NOTE_PRESETS = [
  "ฝากไว้ที่นิติบุคคล / Left at reception",
  "รหัสประตู / Gate code: ",
  "วางพัสดุหน้าบ้านพร้อมถ่ายรูป",
  "ลูกค้ารับสินค้าเองแล้ว",
];

export function DeliveryConfirmModal({
  order,
  canEdit = true,
  onClose,
  onConfirm,
}: DeliveryConfirmModalProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const isLocked = Boolean(order.deliveryConfirmedAt) && !canEdit;
  const [method, setMethod] = useState<DeliveryConfirmationMethod>(
    order.deliveryMethod || "photo_proof"
  );
  const [proofImage, setProofImage] = useState<string | undefined>(
    order.deliveryProofImage
  );
  const [cashReceived, setCashReceived] = useState<string>(
    String(order.cashReceivedThb ?? order.totalThb)
  );
  const [note, setNote] = useState<string>(order.deliveryNote || "");
  const [error, setError] = useState<string>("");

  const parsedCash = parseFloat(cashReceived) || 0;
  const changeAmount = parsedCash - order.totalThb;

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setProofImage(dataUrl);
      setError("");
    } catch {
      setError("ไม่สามารถอ่านไฟล์รูปภาพได้ กรุณาลองใหม่");
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      onClose();
      return;
    }
    if (method === "photo_proof" && !proofImage) {
      setError("กรุณาถ่ายรูปหรืออัปโหลดรูปภาพเพื่อยืนยันการจัดส่งสินค้า");
      return;
    }
    if (method === "cash" && parsedCash < order.totalThb) {
      setError("จำนวนเงินสดที่รับน้อยกว่ายอดรวมออเดอร์");
      return;
    }
    onConfirm({
      orderId: order.id,
      method,
      proofImage,
      cashReceivedThb: method === "cash" ? parsedCash : undefined,
      note: note.trim().slice(0, 500) || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-inverse-surface/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-outline-variant/50 rounded-full mx-auto mb-3 sm:hidden" />

        <div className="flex items-start justify-between gap-2 pb-3 border-b border-surface-container">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">
                verified
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold text-on-surface truncate">
                ยืนยันการจัดส่ง / ชำระเงินสด
              </h3>
              <p className="text-[12px] text-on-surface-variant truncate">
                #{order.id} · {order.customerName} · ฿
                {order.totalThb.toLocaleString()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1.5 bg-surface-container p-1 rounded-xl mt-4">
          <button
            type="button"
            disabled={isLocked}
            onClick={() => {
              setMethod("photo_proof");
              setError("");
            }}
            className={`py-2.5 px-2 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-default ${
              method === "photo_proof"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              photo_camera
            </span>
            <span>ถ่ายรูปยืนยันจัดส่ง</span>
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => {
              setMethod("cash");
              setError("");
            }}
            className={`py-2.5 px-2 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-default ${
              method === "cash"
                ? "bg-surface-container-lowest text-secondary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              payments
            </span>
            <span>ชำระเงินสด</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 mt-4">
          {method === "cash" && (
            <div className="bg-secondary-container/25 border border-secondary/20 rounded-xl p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-on-surface-variant">
                  ยอดที่ต้องชำระ
                </span>
                <span className="text-[18px] font-bold text-primary tabular-nums">
                  ฿{order.totalThb.toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                  จำนวนเงินสดที่รับมา (฿)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={isLocked}
                  value={cashReceived}
                  onChange={(e) => {
                    setCashReceived(e.target.value);
                    setError("");
                  }}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-[16px] font-bold text-on-surface tabular-nums focus:outline-none focus:border-secondary disabled:opacity-75"
                />
                {!isLocked && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {[
                      { label: "พอดีเป๊ะ", val: order.totalThb },
                      { label: "฿500", val: 500 },
                      { label: "฿1,000", val: 1000 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setCashReceived(String(preset.val));
                          setError("");
                        }}
                        className="px-2.5 py-1 rounded-full bg-surface-container-lowest border border-outline-variant/40 text-[11px] font-medium text-on-surface hover:bg-secondary-container/50 cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-secondary/20">
                <span className="text-[12px] font-semibold text-on-surface">
                  เงินทอน
                </span>
                <span
                  className={`text-[16px] font-bold tabular-nums ${
                    changeAmount < 0 ? "text-error" : "text-secondary"
                  }`}
                >
                  {changeAmount < 0
                    ? `ขาดอีก ฿${Math.abs(changeAmount).toLocaleString()}`
                    : `฿${changeAmount.toLocaleString()}`}
                </span>
              </div>
            </div>
          )}

          {/* Camera / Proof Photo Box */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-on-surface-variant">
              {method === "photo_proof"
                ? "ถ่ายรูปพัสดุ / หลักฐานการจัดส่ง *"
                : "ถ่ายรูปหลักฐานรับเงินสด / มอบสินค้า (ไม่บังคับ)"}
            </label>

            {proofImage ? (
              <div className="relative rounded-xl overflow-hidden border border-outline-variant/40 bg-surface-container">
                <img
                  src={proofImage}
                  alt="หลักฐานการจัดส่งสินค้า"
                  className="w-full h-48 object-cover"
                />
                {!isLocked && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="h-9 px-2.5 rounded-lg bg-surface-container-lowest/95 text-primary text-[12px] font-semibold shadow-md flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        photo_camera
                      </span>
                      <span>ถ่ายใหม่</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="h-9 px-2.5 rounded-lg bg-surface-container-lowest/95 text-on-surface text-[12px] font-semibold shadow-md flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        photo_library
                      </span>
                      <span>คลังรูป</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProofImage(undefined)}
                      className="h-9 w-9 rounded-lg bg-surface-container-lowest/95 text-error shadow-md flex items-center justify-center cursor-pointer"
                      aria-label="ลบรูป"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        delete
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : !isLocked ? (
              <div className="w-full p-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary-fixed/20 flex flex-col items-center justify-center gap-3">
                <div className="grid grid-cols-2 gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="py-3.5 px-3 rounded-xl bg-primary text-on-primary hover:bg-primary-dim shadow-sm flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-[24px]">
                      photo_camera
                    </span>
                    <span className="text-[12px] font-semibold">
                      ถ่ายรูปด้วยกล้อง
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="py-3.5 px-3 rounded-xl bg-surface-container-lowest text-primary border border-outline-variant/60 hover:bg-surface-container-low shadow-sm flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-[24px]">
                      photo_library
                    </span>
                    <span className="text-[12px] font-semibold">
                      เลือกจากคลังรูปภาพ
                    </span>
                  </button>
                </div>
                <span className="text-[11px] text-on-surface-variant text-center">
                  อนุญาตให้ถ่ายจากกล้องมือถือ หรือเลือกภาพที่มีอยู่ในเครื่องได้ทันที
                </span>
              </div>
            ) : (
              <div className="py-4 px-3 rounded-xl bg-surface-container-low text-center text-[12px] text-on-surface-variant">
                ไม่ได้แนบรูปภาพเพิ่มเติม
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoPick}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoPick}
            />
          </div>

          {/* Dedicated Note Text Field */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="delivery-confirm-note"
                className="text-[12px] font-semibold text-on-surface flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">
                  sticky_note_2
                </span>
                <span>Note / หมายเหตุการจัดส่ง</span>
              </label>
              <span className="text-[11px] text-on-surface-variant tabular-nums">
                {note.length}/500
              </span>
            </div>
            <textarea
              id="delivery-confirm-note"
              rows={3}
              maxLength={500}
              disabled={isLocked}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="บันทึกรายละเอียดเพิ่มเติม เช่น รหัสประตู (Gate code), ฝากไว้ที่นิติบุคคล / Left at reception..."
              className="w-full p-3 rounded-xl bg-surface-container-low border border-outline-variant/50 text-[13px] text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary resize-none disabled:opacity-80"
            />
            {!isLocked && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {DELIVERY_NOTE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setNote((prev) => {
                        const base = prev.trim();
                        const next = base ? `${base} · ${preset}` : preset;
                        return next.slice(0, 500);
                      })
                    }
                    className="px-2.5 py-1 rounded-full bg-surface-container hover:bg-primary-fixed/40 text-on-surface-variant hover:text-primary text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-[12px] text-error font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">
                error
              </span>
              <span>{error}</span>
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-surface-container text-on-surface font-semibold text-[13px] cursor-pointer"
            >
              {isLocked ? "ปิด" : "ทำภายหลัง"}
            </button>
            {!isLocked && (
              <button
                type="submit"
                className={`flex-[1.6] h-11 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] transition-transform cursor-pointer ${
                  method === "cash"
                    ? "bg-secondary text-on-secondary"
                    : "bg-primary text-on-primary"
                }`}
              >
                <span className="material-symbols-outlined text-[19px]">
                  check_circle
                </span>
                <span>
                  {method === "cash"
                    ? "ยืนยันรับเงินสดแล้ว"
                    : "ยืนยันการจัดส่งสินค้า"}
                </span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

interface CreateOrderModalProps {
  products: ProductItem[];
  customers: Customer[];
  initialCustomer?: Customer | null;
  initialProduct?: ProductItem | null;
  onClose: () => void;
  onCreateOrder: (
    customerName: string,
    items: OrderItem[],
    orderType: OrderFulfillmentType,
    customerId?: string
  ) => void;
}

export function CreateOrderModal({
  products,
  customers,
  initialCustomer,
  initialProduct,
  onClose,
  onCreateOrder,
}: CreateOrderModalProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    initialCustomer?.id || null
  );
  const [customerName, setCustomerName] = useState(initialCustomer?.name || "");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [orderType, setOrderType] = useState<OrderFulfillmentType>("walk_in");
  const [searchQuery, setSearchQuery] = useState(initialProduct?.sku || "");
  const [previewColorByProduct, setPreviewColorByProduct] = useState<
    Record<string, ProductColorVariant>
  >({});
  const [draftItems, setDraftItems] = useState<OrderItem[]>(() => {
    if (!initialProduct || initialProduct.stock <= 0) return [];
    const colorOptions: ProductColorVariant[] =
      initialProduct.colors && initialProduct.colors.length > 0
        ? initialProduct.colors
        : PRESET_COLORS.slice(0, 5);
    const availableColor = colorOptions.find(
      (c) => typeof c.stock !== "number" || c.stock > 0
    );
    if (!availableColor) return [];
    return [
      {
        productId: initialProduct.id,
        name: initialProduct.name,
        sku: initialProduct.sku,
        quantity: 1,
        unitPriceThb: initialProduct.sellPriceThb,
        picked: false,
        imageUrl: availableColor.imageUrl || initialProduct.imageUrl,
        colorName: availableColor.name,
        colorHex: availableColor.hex,
      },
    ];
  });

  const selectedCustomer = selectedCustomerId
    ? customers.find((c) => c.id === selectedCustomerId) || null
    : null;

  const customerQuery = customerName.trim().toLowerCase();
  const matchingCustomers = customers.filter((c) => {
    if (!customerQuery || selectedCustomer?.id === c.id) return true;
    return (
      c.name.toLowerCase().includes(customerQuery) ||
      (c.phone && c.phone.toLowerCase().includes(customerQuery)) ||
      (c.lineId && c.lineId.toLowerCase().includes(customerQuery))
    );
  });

  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerSearchOpen(false);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProducts = products.filter((p) => {
    if (!normalizedQuery) return true;
    const matchesText =
      p.name.toLowerCase().includes(normalizedQuery) ||
      p.sku.toLowerCase().includes(normalizedQuery) ||
      p.category.toLowerCase().includes(normalizedQuery);
    const matchesColor = p.colors?.some((c) =>
      c.name.toLowerCase().includes(normalizedQuery)
    );
    return matchesText || Boolean(matchesColor);
  });

  const getProductColorOptions = (prod: ProductItem): ProductColorVariant[] => {
    if (prod.colors && prod.colors.length > 0) return prod.colors;
    return PRESET_COLORS.slice(0, 5);
  };

  const getCartQtyForProduct = (productId: string) =>
    draftItems
      .filter((i) => i.productId === productId)
      .reduce((sum, i) => sum + i.quantity, 0);

  const getCartQtyForColor = (productId: string, colorName: string) =>
    draftItems.find(
      (i) => i.productId === productId && (i.colorName || "") === colorName
    )?.quantity ?? 0;

  const setColorQuantity = (
    prod: ProductItem,
    color: ProductColorVariant,
    rawNextQty: number
  ) => {
    const colorStockLimit =
      typeof color.stock === "number"
        ? Math.max(0, color.stock)
        : Math.max(0, prod.stock);
    if (prod.stock <= 0 || colorStockLimit <= 0) return;

    setPreviewColorByProduct((prev) => ({ ...prev, [prod.id]: color }));
    const desired = Math.max(0, Math.round(rawNextQty) || 0);

    setDraftItems((prev) => {
      const otherColorsQty = prev
        .filter(
          (i) =>
            i.productId === prod.id && (i.colorName || "") !== color.name
        )
        .reduce((sum, i) => sum + i.quantity, 0);

      const maxByProductStock = Math.max(0, prod.stock - otherColorsQty);
      const maxByColorStock =
        typeof color.stock === "number"
          ? Math.max(0, color.stock)
          : maxByProductStock;
      const clampedQty = Math.min(desired, maxByProductStock, maxByColorStock);

      const existingIdx = prev.findIndex(
        (i) => i.productId === prod.id && (i.colorName || "") === color.name
      );

      if (clampedQty <= 0) {
        return existingIdx >= 0
          ? prev.filter((_, idx) => idx !== existingIdx)
          : prev;
      }

      if (existingIdx >= 0) {
        return prev.map((item, idx) =>
          idx === existingIdx ? { ...item, quantity: clampedQty } : item
        );
      }

      return [
        ...prev,
        {
          productId: prod.id,
          name: prod.name,
          sku: prod.sku,
          quantity: clampedQty,
          unitPriceThb: prod.sellPriceThb,
          picked: false,
          imageUrl: color.imageUrl || prod.imageUrl,
          colorName: color.name,
          colorHex: color.hex,
        },
      ];
    });
  };

  const draftTotal = draftItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceThb,
    0
  );
  const draftTotalPieces = draftItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftItems.length === 0) return;
    const cleanName =
      customerName.trim() ||
      (orderType === "walk_in" ? "ลูกค้า Walk-in" : "ลูกค้าจัดส่ง");
    const verifiedCustomerId =
      selectedCustomer &&
      selectedCustomer.name.trim().toLowerCase() === cleanName.toLowerCase()
        ? selectedCustomer.id
        : undefined;
    onCreateOrder(cleanName, draftItems, orderType, verifiedCustomerId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-inverse-surface/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-surface-container shrink-0">
          <div className="w-10 h-1.5 bg-outline-variant/50 rounded-full mx-auto mb-3 sm:hidden" />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">
                  add_shopping_cart
                </span>
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-on-surface">
                  สร้างออเดอร์ใหม่
                </h3>
                <p className="text-[11px] text-on-surface-variant">
                  ค้นหาสินค้าและระบุจำนวนแต่ละสี (กี่ใบ)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <form
          id="create-order-modal-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4"
        >
          {/* Order Type Selector: Walk-in vs ส่งของ */}
          <div>
            <span className="block text-[12px] font-semibold text-on-surface mb-1.5">
              ประเภทออเดอร์
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderType("walk_in")}
                className={`h-11 px-3 rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  orderType === "walk_in"
                    ? "bg-secondary text-on-secondary border-secondary shadow-sm"
                    : "bg-surface-container-low text-on-surface border-outline-variant/50 hover:bg-surface-container"
                }`}
              >
                <span className="material-symbols-outlined text-[19px]">
                  storefront
                </span>
                <span>Walk-in</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderType("delivery")}
                className={`h-11 px-3 rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  orderType === "delivery"
                    ? "bg-primary text-on-primary border-primary shadow-sm"
                    : "bg-surface-container-low text-on-surface border-outline-variant/50 hover:bg-surface-container"
                }`}
              >
                <span className="material-symbols-outlined text-[19px]">
                  local_shipping
                </span>
                <span>ส่งของ</span>
              </button>
            </div>
          </div>

          {/* Customer Name & Quick Existing Customer Picker */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="modal-customer-name"
                className="text-[12px] font-semibold text-on-surface flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">
                  person
                </span>
                <span>ลูกค้า</span>
              </label>
              {customers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCustomerSearchOpen((prev) => !prev)}
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {customerSearchOpen ? "expand_less" : "group"}
                  </span>
                  <span>
                    {customerSearchOpen
                      ? "ซ่อนรายชื่อลูกค้า"
                      : `เลือกลูกค้าเดิม (${customers.length})`}
                  </span>
                </button>
              )}
            </div>

            <div className="relative flex items-center">
              <input
                id="modal-customer-name"
                type="text"
                value={customerName}
                onFocus={() => {
                  if (customers.length > 0 && !selectedCustomer) {
                    setCustomerSearchOpen(true);
                  }
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerName(val);
                  if (
                    selectedCustomer &&
                    selectedCustomer.name.trim().toLowerCase() !==
                      val.trim().toLowerCase()
                  ) {
                    setSelectedCustomerId(null);
                  }
                  if (customers.length > 0 && val.trim()) {
                    setCustomerSearchOpen(true);
                  }
                }}
                placeholder={
                  orderType === "walk_in"
                    ? "พิมพ์ชื่อ หรือเลือกลูกค้าเดิมด้านล่าง (ว่างไว้ใช้ ลูกค้า Walk-in)"
                    : "พิมพ์ชื่อ/เบอร์โทร หรือเลือกลูกค้าเดิมด้านล่าง..."
                }
                className="w-full h-11 pl-3 pr-9 rounded-xl bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"
              />
              {customerName && (
                <button
                  type="button"
                  aria-label="ล้างชื่อลูกค้า"
                  onClick={() => {
                    setCustomerName("");
                    setSelectedCustomerId(null);
                  }}
                  className="absolute right-2 w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    close
                  </span>
                </button>
              )}
            </div>

            {/* Selected Existing Customer Contact Preview */}
            {selectedCustomer && (
              <div className="p-2.5 rounded-xl bg-secondary-container/55 border border-secondary/40 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-primary">
                      verified
                    </span>
                    <span className="text-[12px] font-bold text-on-surface truncate">
                      {selectedCustomer.name}
                    </span>
                    {selectedCustomer.phone && (
                      <span className="text-[11px] text-on-surface-variant tabular-nums shrink-0">
                        · {selectedCustomer.phone}
                      </span>
                    )}
                  </div>
                  {(selectedCustomer.address || selectedCustomer.lineId) && (
                    <p className="text-[10.5px] text-on-surface-variant truncate mt-0.5 pl-5">
                      {selectedCustomer.address ||
                        `LINE: ${selectedCustomer.lineId}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId(null);
                    setCustomerSearchOpen(true);
                  }}
                  className="px-2 py-1 rounded-lg bg-surface-container-lowest text-primary text-[11px] font-semibold border border-outline-variant/40 cursor-pointer shrink-0"
                >
                  เปลี่ยน
                </button>
              </div>
            )}

            {/* Quick-Select Chips for Existing Customers */}
            {customers.length > 0 && !selectedCustomer && !customerSearchOpen && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {customers.slice(0, 6).map((cust) => (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => handleSelectCustomer(cust)}
                    className="h-8 px-2.5 rounded-full bg-surface-container-low hover:bg-primary-fixed hover:text-on-primary-fixed border border-outline-variant/50 text-[11.5px] font-medium text-on-surface flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px] text-primary">
                      person
                    </span>
                    <span>{cust.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Expandable Searchable Customer Dropdown */}
            {customers.length > 0 && customerSearchOpen && (
              <div className="p-2 rounded-xl bg-surface-container-low border border-primary/35 flex flex-col gap-1 max-h-40 overflow-y-auto shadow-sm">
                {matchingCustomers.length === 0 ? (
                  <p className="text-[11.5px] text-on-surface-variant text-center py-2">
                    ไม่พบลูกค้าที่ตรงกัน — ระบบจะใช้ชื่อ "{customerName.trim()}" สร้างออเดอร์ให้ทันที
                  </p>
                ) : (
                  matchingCustomers.map((cust) => {
                    const isPicked = selectedCustomerId === cust.id;
                    return (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => handleSelectCustomer(cust)}
                        className={`text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isPicked
                            ? "bg-primary-fixed text-on-primary-fixed"
                            : "bg-surface-container-lowest hover:bg-primary-fixed/40 text-on-surface"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold truncate">
                            {cust.name}
                          </p>
                          <p className="text-[10.5px] text-on-surface-variant truncate">
                            {[
                              cust.phone,
                              cust.lineId ? `LINE: ${cust.lineId}` : undefined,
                              cust.address,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "ลูกค้าในระบบ"}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold text-primary shrink-0">
                          {isPicked ? "เลือกแล้ว" : "เลือก"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Product Search */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold text-on-surface flex items-center justify-between">
              <span>ค้นหาสินค้าและระบุจำนวนแต่ละสี</span>
              <span className="text-[11px] font-normal text-on-surface-variant tabular-nums">
                พบ {filteredProducts.length} รายการ
              </span>
            </label>
            <div className="relative flex items-center bg-surface-container-low rounded-xl border border-outline-variant/40 px-3 h-11 focus-within:border-primary">
              <span className="material-symbols-outlined text-[19px] text-on-surface-variant mr-2">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า, SKU, หมวดหมู่ หรือสี..."
                className="w-full bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="ล้างคำค้นหา"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    close
                  </span>
                </button>
              )}
            </div>

            {/* Product List with Per-Color Quantity Inputs */}
            <div className="flex flex-col gap-2.5 max-h-72 overflow-y-auto pr-0.5">
              {filteredProducts.length === 0 ? (
                <div className="py-6 text-center rounded-xl bg-surface-container-low text-[12px] text-on-surface-variant">
                  ไม่พบสินค้าที่ตรงกับคำค้นหา
                </div>
              ) : (
                filteredProducts.map((prod) => {
                  const colorOptions = getProductColorOptions(prod);
                  const usedQty = getCartQtyForProduct(prod.id);
                  const remainingStock = Math.max(0, prod.stock - usedQty);
                  const previewColor = previewColorByProduct[prod.id];
                  const previewImg = previewColor?.imageUrl || prod.imageUrl;
                  const isProductOutOfStock = prod.stock <= 0;

                  return (
                    <div
                      key={prod.id}
                      className={`p-3 rounded-xl border flex flex-col gap-2 transition-colors ${
                        isProductOutOfStock
                          ? "bg-surface-container/60 border-outline-variant/30 opacity-75"
                          : usedQty > 0
                            ? "bg-primary-fixed/15 border-primary/40"
                            : "bg-surface-container-low border-outline-variant/30"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ResilientImage
                          src={previewImg}
                          alt={prod.name}
                          className={`w-12 h-12 rounded-lg object-cover bg-surface-container shrink-0 ${
                            isProductOutOfStock ? "grayscale opacity-70" : ""
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-on-surface truncate">
                            {prod.name}
                          </p>
                          <p className="text-[11px] text-on-surface-variant truncate">
                            {prod.sku} ·{" "}
                            {isProductOutOfStock ? (
                              <span className="text-error font-semibold">
                                หมดสต็อก
                              </span>
                            ) : (
                              <span>คงเหลือ {remainingStock} ใบ</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[13px] font-bold text-primary tabular-nums block">
                            ฿{prod.sellPriceThb.toLocaleString()}
                          </span>
                          {usedQty > 0 && (
                            <span className="text-[10px] font-semibold text-secondary tabular-nums">
                              เลือกแล้ว {usedQty} ใบ
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Per-Color Quantity Controls */}
                      <div className="flex flex-col gap-1.5 pt-1.5 border-t border-outline-variant/25">
                        <span className="text-[10px] font-semibold text-on-surface-variant">
                          ระบุจำนวนแต่ละสี (ใบ):
                        </span>
                        {colorOptions.map((c) => {
                          const qty = getCartQtyForColor(prod.id, c.name);
                          const colorStockLimit =
                            typeof c.stock === "number"
                              ? Math.max(0, c.stock)
                              : Math.max(0, prod.stock);
                          const isColorOutOfStock =
                            isProductOutOfStock || colorStockLimit <= 0;
                          const isQuotaFull =
                            !isColorOutOfStock &&
                            remainingStock <= 0 &&
                            qty === 0;
                          const isInputDisabled =
                            isColorOutOfStock || isQuotaFull;
                          const canIncrement =
                            !isInputDisabled &&
                            remainingStock > 0 &&
                            qty < colorStockLimit;

                          return (
                            <div
                              key={c.name}
                              aria-disabled={isColorOutOfStock}
                              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                                isColorOutOfStock
                                  ? "bg-surface-container/60 border-outline-variant/25 opacity-60 cursor-not-allowed select-none"
                                  : qty > 0
                                    ? "bg-surface-container-lowest border-primary/45 shadow-xs"
                                    : "bg-surface-container-lowest/70 border-outline-variant/30"
                              }`}
                            >
                              <button
                                type="button"
                                disabled={isColorOutOfStock}
                                onClick={() => {
                                  if (isColorOutOfStock) return;
                                  setPreviewColorByProduct((prev) => ({
                                    ...prev,
                                    [prod.id]: c,
                                  }));
                                }}
                                className={`flex items-center gap-2 min-w-0 text-left ${
                                  isColorOutOfStock
                                    ? "cursor-not-allowed"
                                    : "cursor-pointer"
                                }`}
                              >
                                {c.imageUrl ? (
                                  <img
                                    src={c.imageUrl}
                                    alt={c.name}
                                    className={`w-6 h-6 rounded-md object-cover border border-black/10 shrink-0 ${
                                      isColorOutOfStock
                                        ? "grayscale opacity-60"
                                        : ""
                                    }`}
                                  />
                                ) : (
                                  <span
                                    className={`w-4 h-4 rounded-full border border-black/15 shrink-0 ${
                                      isColorOutOfStock ? "opacity-50" : ""
                                    }`}
                                    style={{ backgroundColor: c.hex }}
                                  />
                                )}
                                <div className="min-w-0">
                                  <span
                                    className={`text-[12px] font-medium block truncate ${
                                      isColorOutOfStock
                                        ? "text-on-surface-variant line-through"
                                        : "text-on-surface"
                                    }`}
                                  >
                                    สี{c.name}
                                  </span>
                                  {isColorOutOfStock ? (
                                    <span className="text-[10px] font-semibold text-error tabular-nums">
                                      หมดสต็อก (0 ใบ)
                                    </span>
                                  ) : (
                                    typeof c.stock === "number" && (
                                      <span className="text-[10px] text-on-surface-variant tabular-nums">
                                        คลัง {Math.max(0, c.stock - qty)} ใบ
                                      </span>
                                    )
                                  )}
                                </div>
                              </button>

                              {isColorOutOfStock ? (
                                <span className="h-7 px-2.5 rounded-md bg-error-container/85 text-on-error-container border border-error/25 text-[11px] font-semibold flex items-center gap-1 shrink-0">
                                  <span className="material-symbols-outlined text-[14px]">
                                    block
                                  </span>
                                  <span>สีนี้หมด</span>
                                </span>
                              ) : (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={qty <= 0}
                                    onClick={() =>
                                      setColorQuantity(prod, c, qty - 1)
                                    }
                                    className="w-7 h-7 rounded-md bg-surface-container text-on-surface font-bold text-[14px] flex items-center justify-center disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed hover:bg-surface-container-high"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    max={colorStockLimit}
                                    disabled={isInputDisabled}
                                    aria-label={`จำนวน ${prod.name} สี${c.name}`}
                                    value={qty}
                                    onChange={(e) =>
                                      setColorQuantity(
                                        prod,
                                        c,
                                        parseInt(e.target.value, 10) || 0
                                      )
                                    }
                                    className={`w-12 h-7 px-1 text-center rounded-md border text-[12px] font-semibold tabular-nums focus:outline-none focus:border-primary disabled:opacity-40 disabled:cursor-not-allowed ${
                                      qty > 0
                                        ? "bg-primary-fixed/40 border-primary/50 text-primary"
                                        : "bg-surface-container-low border-outline-variant/40 text-on-surface"
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    disabled={!canIncrement}
                                    onClick={() =>
                                      setColorQuantity(prod, c, qty + 1)
                                    }
                                    className="w-7 h-7 rounded-md bg-primary text-on-primary font-bold text-[14px] flex items-center justify-center disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                                  >
                                    +
                                  </button>
                                  <span className="text-[11px] text-on-surface-variant ml-0.5">
                                    ใบ
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected Cart Summary */}
          {draftItems.length > 0 && (
            <div className="bg-surface-container-low rounded-xl p-3 border border-primary/25 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-on-surface flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-primary">
                    shopping_basket
                  </span>
                  <span>
                    สรุปรายการ ({draftItems.length} สี · {draftTotalPieces} ใบ)
                  </span>
                </span>
                <span className="text-[13px] font-bold text-primary tabular-nums">
                  รวม ฿{draftTotal.toLocaleString()}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {draftItems.map((item, idx) => (
                  <div
                    key={`${item.productId}-${item.colorName || idx}`}
                    className="flex items-center justify-between gap-2 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ResilientImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-9 h-9 rounded-md object-cover bg-surface-container shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-on-surface truncate">
                          {item.name}
                        </p>
                        {item.colorName && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-on-surface-variant">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-black/15"
                              style={{
                                backgroundColor: item.colorHex || "#94a3b8",
                              }}
                            />
                            <span>สี{item.colorName}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-md bg-primary-fixed text-on-primary-fixed text-[11px] font-semibold tabular-nums">
                        {item.quantity} ใบ
                      </span>
                      <span className="tabular-nums font-semibold text-[12px] text-primary w-14 text-right">
                        ฿{(item.unitPriceThb * item.quantity).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        aria-label={`ลบ ${item.name} สี${item.colorName || ""}`}
                        onClick={() =>
                          setDraftItems((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-surface-container cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          close
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-surface-container bg-surface-container-lowest flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl bg-surface-container text-on-surface font-semibold text-[14px] cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            form="create-order-modal-form"
            disabled={draftItems.length === 0}
            className="flex-[1.6] h-11 rounded-xl bg-primary text-on-primary font-semibold text-[14px] flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] transition-transform disabled:opacity-45 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">check</span>
            <span>
              {draftItems.length > 0
                ? `สร้างออเดอร์ (${draftTotalPieces} ใบ · ฿${draftTotal.toLocaleString()})`
                : "ระบุจำนวนสีที่ต้องการสั่ง"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
