import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Order, RoleMode } from "../types";
import {
  generatePromptPayPayload,
  normalizePromptPayDigits,
  parsePromptPayTarget,
} from "../utils/promptpay";

interface OrderPaymentQrModalProps {
  order: Order;
  role: RoleMode;
  ownerName: string;
  promptPayId: string;
  promptPayName: string;
  isAlreadyRecordedInAccounting: boolean;
  onSavePromptPayConfig: (config: {
    promptPayId: string;
    promptPayName: string;
  }) => void;
  onRecordPromptPayPayment?: (order: Order, paidAmountThb: number) => void;
  onNotify: (msg: string, icon?: string) => void;
  onClose: () => void;
}

export function OrderPaymentQrModal({
  order,
  role,
  ownerName,
  promptPayId,
  promptPayName,
  isAlreadyRecordedInAccounting,
  onSavePromptPayConfig,
  onRecordPromptPayPayment,
  onNotify,
  onClose,
}: OrderPaymentQrModalProps) {
  const [amountMode, setAmountMode] = useState<"exact" | "custom" | "open">(
    "exact"
  );
  const [customAmountInput, setCustomAmountInput] = useState(
    String(order.totalThb)
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrError, setQrError] = useState<string>("");
  const [isEditingAccount, setIsEditingAccount] = useState(
    () => !parsePromptPayTarget(promptPayId).valid
  );
  const [draftId, setDraftId] = useState(promptPayId);
  const [draftName, setDraftName] = useState(
    promptPayName || `DenewStock (${ownerName})`
  );
  const [accountError, setAccountError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const parsedTarget = useMemo(
    () => parsePromptPayTarget(promptPayId),
    [promptPayId]
  );

  const activeAmountThb = useMemo(() => {
    if (amountMode === "open") return undefined;
    if (amountMode === "custom") {
      const parsed = parseFloat(customAmountInput);
      return Number.isFinite(parsed) && parsed > 0
        ? Math.min(10000000, Number(parsed.toFixed(2)))
        : 0;
    }
    return Math.max(0, Number(order.totalThb.toFixed(2)));
  }, [amountMode, customAmountInput, order.totalThb]);

  const qrPayload = useMemo(() => {
    if (!parsedTarget.valid) return null;
    if (amountMode === "custom" && (!activeAmountThb || activeAmountThb <= 0)) {
      return null;
    }
    return generatePromptPayPayload(promptPayId, activeAmountThb);
  }, [parsedTarget.valid, promptPayId, activeAmountThb, amountMode]);

  useEffect(() => {
    let active = true;
    if (!qrPayload) {
      setQrDataUrl("");
      return;
    }
    setQrError("");
    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrError("ไม่สามารถสร้างภาพ QR Code ได้ในขณะนี้");
      });
    return () => {
      active = false;
    };
  }, [qrPayload]);

  const recipientDisplay =
    promptPayName.trim() || `DenewStock (${ownerName})`;

  const totalPieces = order.items.reduce((sum, i) => sum + i.quantity, 0);

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedDigits = normalizePromptPayDigits(draftId);
    const check = parsePromptPayTarget(cleanedDigits);
    if (!check.valid) {
      setAccountError(
        "กรุณากรอกเบอร์มือถือพร้อมเพย์ 10 หลัก (ขึ้นต้นด้วย 0), เลขบัตร/ผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก"
      );
      return;
    }
    const cleanName = draftName.trim().slice(0, 80) || `DenewStock (${ownerName})`;
    onSavePromptPayConfig({
      promptPayId: check.digits,
      promptPayName: cleanName,
    });
    setAccountError("");
    setIsEditingAccount(false);
  };

  const handleCopySummary = async () => {
    const amountLine =
      typeof activeAmountThb === "number" && activeAmountThb > 0
        ? `ยอดชำระ: ฿${activeAmountThb.toLocaleString("th-TH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : `ยอดออเดอร์: ฿${order.totalThb.toLocaleString("th-TH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;

    const text = [
      `ชำระเงินร้าน ${recipientDisplay}`,
      `ออเดอร์ #${order.id} (${order.customerName})`,
      amountLine,
      parsedTarget.valid
        ? `พร้อมเพย์ (${parsedTarget.labelTh}): ${parsedTarget.formattedDisplay}`
        : "",
      "กรุณาส่งสลิปหลังโอนเงิน ขอบคุณครับ/ค่ะ",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      onNotify("คัดลอกข้อมูลชำระเงินพร้อมส่งให้ลูกค้าแล้ว", "content_copy");
    } catch {
      onNotify("ไม่สามารถคัดลอกอัตโนมัติได้", "error");
    }
  };

  const handleDownloadSlipPng = async () => {
    if (!qrDataUrl || isDownloading) return;
    setIsDownloading(true);
    try {
      const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = qrDataUrl;
      });

      const canvas = document.createElement("canvas");
      const width = 720;
      const height = 980;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // White card background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // Top Thai QR Payment navy header band
      ctx.fillStyle = "#113566";
      ctx.fillRect(0, 0, width, 136);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("THAI QR PAYMENT", width / 2, 62);
      ctx.font = "600 22px sans-serif";
      ctx.fillStyle = "#cfe2ff";
      ctx.fillText("พร้อมเพย์ (PromptPay) · สแกนจ่ายได้ทุกธนาคาร", width / 2, 104);

      // Store & Order header
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText(recipientDisplay, width / 2, 198);

      ctx.fillStyle = "#475569";
      ctx.font = "22px sans-serif";
      ctx.fillText(
        `ออเดอร์ #${order.id} · ลูกค้า: ${order.customerName}`,
        width / 2,
        238
      );

      // QR frame
      const qrSize = 420;
      const qrX = (width - qrSize) / 2;
      const qrY = 270;
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 3;
      ctx.strokeRect(qrX - 14, qrY - 14, qrSize + 28, qrSize + 28);
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Amount box
      const boxY = 735;
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(64, boxY, width - 128, 120);

      ctx.fillStyle = "#475569";
      ctx.font = "600 22px sans-serif";
      ctx.fillText(
        amountMode === "open" ? "ระบุยอดโอนด้วยตนเอง" : "ยอดชำระสุทธิ (ล็อกยอดอัตโนมัติ)",
        width / 2,
        boxY + 40
      );

      ctx.fillStyle = "#113566";
      ctx.font = "bold 46px sans-serif";
      const displayAmt =
        typeof activeAmountThb === "number" && activeAmountThb > 0
          ? `฿${activeAmountThb.toLocaleString("th-TH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : `฿${order.totalThb.toLocaleString("th-TH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;
      ctx.fillText(displayAmt, width / 2, boxY + 96);

      // Footer promptpay ID
      ctx.fillStyle = "#64748b";
      ctx.font = "20px sans-serif";
      ctx.fillText(
        `PromptPay: ${parsedTarget.formattedDisplay}`,
        width / 2,
        910
      );
      ctx.font = "18px sans-serif";
      ctx.fillText("สแกนด้วยแอปธนาคารทุกธนาคารในประเทศไทย", width / 2, 944);

      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `QR-Order-${order.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onNotify(`บันทึกรูป QR ชำระเงินออเดอร์ #${order.id} แล้ว`, "download");
    } catch {
      onNotify("ไม่สามารถบันทึกรูป QR ได้", "error");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`QR ชำระเงินออเดอร์ ${order.id}`}
      className="fixed inset-0 z-50 bg-inverse-surface/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl shadow-2xl border border-outline-variant/50 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Thai QR Brand Header */}
        <div className="bg-[#113566] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px] text-white">
                qr_code_2
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="text-[16px] font-bold leading-tight truncate">
                QR ชำระเงินพร้อมเพย์ (Dynamic QR)
              </h3>
              <p className="text-[11px] text-blue-100 truncate mt-0.5">
                ออเดอร์ #{order.id} · {order.customerName} ({totalPieces} ชิ้น)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง QR ชำระเงิน"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* PromptPay Account Configuration / Inline Quick Editor */}
          {isEditingAccount ? (
            <form
              onSubmit={handleSaveAccount}
              className="rounded-xl bg-surface-container-low border border-primary/40 p-3.5 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-primary">
                    account_balance
                  </span>
                  <span>ตั้งค่าบัญชีรับเงินพร้อมเพย์ (PromptPay)</span>
                </span>
                {parsedTarget.valid && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftId(promptPayId);
                      setDraftName(promptPayName || `DenewStock (${ownerName})`);
                      setAccountError("");
                      setIsEditingAccount(false);
                    }}
                    className="text-[11px] font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                )}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-on-surface-variant">
                  เบอร์มือถือ / เลขผู้เสียภาษี 13 หลัก / e-Wallet 15 หลัก *
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={draftId}
                  onChange={(e) => {
                    setDraftId(e.target.value);
                    setAccountError("");
                  }}
                  placeholder="เช่น 0812345678 หรือ 1100500123456"
                  className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/60 text-[14px] font-mono font-semibold text-on-surface focus:outline-none focus:border-primary"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-on-surface-variant">
                  ชื่อบัญชี / ชื่อร้านค้าที่แสดงบนใบ QR
                </span>
                <input
                  type="text"
                  maxLength={80}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={`DenewStock (${ownerName})`}
                  className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/60 text-[13px] text-on-surface focus:outline-none focus:border-primary"
                />
              </label>

              {accountError && (
                <p className="text-[11.5px] font-medium text-error">
                  {accountError}
                </p>
              )}

              <button
                type="submit"
                className="h-10 rounded-lg bg-[#113566] hover:bg-[#0d2a52] text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">
                  check_circle
                </span>
                <span>บันทึกและสร้าง QR ทันที</span>
              </button>
            </form>
          ) : (
            <>
              {/* Amount Mode Switcher */}
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-container">
                  {(
                    [
                      { id: "exact", label: "ยอดออเดอร์" },
                      { id: "custom", label: "ปรับยอดเอง" },
                      { id: "open", label: "ไม่ล็อกยอด" },
                    ] as const
                  ).map((mode) => {
                    const active = amountMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setAmountMode(mode.id)}
                        className={`h-9 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                          active
                            ? "bg-surface-container-lowest text-primary shadow-xs"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>

                {amountMode === "custom" && (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/50 bg-surface-container-low px-3 h-11">
                    <span className="text-[13px] font-bold text-primary">฿</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={customAmountInput}
                      onChange={(e) => setCustomAmountInput(e.target.value)}
                      aria-label="ยอดเงินที่ต้องการให้ลูกค้าสแกนชำระ"
                      className="flex-1 bg-transparent text-[15px] font-bold text-on-surface tabular-nums focus:outline-none"
                      placeholder="ระบุจำนวนเงิน (บาท)"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomAmountInput(String(order.totalThb))}
                      className="text-[11px] font-semibold text-primary hover:underline cursor-pointer whitespace-nowrap"
                    >
                      รีเซ็ต ฿{order.totalThb.toLocaleString()}
                    </button>
                  </div>
                )}
              </div>

              {/* Scannable Thai QR Payment Card */}
              <div className="rounded-2xl border-2 border-[#113566]/20 bg-white p-4 shadow-sm flex flex-col items-center gap-3 text-slate-900">
                <div className="w-full flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[#113566] truncate">
                      {recipientDisplay}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      PromptPay · {parsedTarget.formattedDisplay}
                    </p>
                  </div>
                  {(role === "owner" || !parsedTarget.valid) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraftId(promptPayId);
                        setDraftName(recipientDisplay);
                        setIsEditingAccount(true);
                      }}
                      className="h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        edit
                      </span>
                      <span>เปลี่ยนบัญชี</span>
                    </button>
                  )}
                </div>

                {/* High-Contrast QR Code Image */}
                <div className="w-[232px] h-[232px] rounded-xl bg-white p-2 border border-slate-200 flex items-center justify-center">
                  {qrError ? (
                    <p className="text-[12px] text-error text-center px-3">
                      {qrError}
                    </p>
                  ) : qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`PromptPay QR สำหรับออเดอร์ ${order.id}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-400">
                      <span className="material-symbols-outlined text-[32px]">
                        qr_code_2
                      </span>
                      <span className="text-[11px]">
                        {amountMode === "custom"
                          ? "กรุณาระบุยอดเงินมากกว่า 0"
                          : "กำลังสร้าง QR..."}
                      </span>
                    </div>
                  )}
                </div>

                {/* Locked Dynamic Amount Display */}
                <div className="w-full rounded-xl bg-[#113566]/6 px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-600">
                      {amountMode === "open"
                        ? "QR แบบไม่ล็อกยอด (ลูกค้ากรอกเอง)"
                        : "ยอดชำระล็อกอัตโนมัติ"}
                    </p>
                    <p className="text-[10.5px] text-slate-500">
                      สแกนได้ทุกแอปธนาคารไทย · มาตรฐาน EMVCo
                    </p>
                  </div>
                  <p className="text-[22px] font-extrabold text-[#113566] tabular-nums shrink-0">
                    {amountMode === "open"
                      ? "ระบุเอง"
                      : `฿${(activeAmountThb ?? 0).toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`}
                  </p>
                </div>
              </div>

              {/* Quick Order Items Recap */}
              <div className="rounded-xl bg-surface-container-low p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-semibold">
                  <span>รายการในออเดอร์ #{order.id}</span>
                  <span className="tabular-nums">
                    รวม ฿{order.totalThb.toLocaleString()}
                  </span>
                </div>
                {order.items.slice(0, 4).map((item, idx) => (
                  <div
                    key={`${item.sku}-${item.colorName || idx}`}
                    className="flex items-center justify-between gap-2 text-[12px]"
                  >
                    <span className="text-on-surface truncate">
                      {item.name}
                      {item.colorName ? ` (${item.colorName})` : ""} x
                      {item.quantity}
                    </span>
                    <span className="text-on-surface-variant tabular-nums shrink-0">
                      ฿{(item.quantity * item.unitPriceThb).toLocaleString()}
                    </span>
                  </div>
                ))}
                {order.items.length > 4 && (
                  <p className="text-[11px] text-on-surface-variant">
                    + อีก {order.items.length - 4} รายการ
                  </p>
                )}
              </div>

              {/* Action Buttons: Save PNG + Copy Payment Text + Record into Accounting */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!qrDataUrl || isDownloading}
                  onClick={() => void handleDownloadSlipPng()}
                  className="h-11 px-3 rounded-xl bg-[#113566] hover:bg-[#0d2a52] text-white text-[12.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    download
                  </span>
                  <span className="truncate">
                    {isDownloading ? "กำลังสร้างรูป..." : "บันทึกรูป QR ส่งลูกค้า"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleCopySummary()}
                  className="h-11 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-[12.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    content_copy
                  </span>
                  <span className="truncate">คัดลอกข้อความโอน</span>
                </button>
              </div>

              {onRecordPromptPayPayment && (
                isAlreadyRecordedInAccounting ? (
                  <div className="rounded-xl bg-secondary-container/60 text-on-secondary-container px-3.5 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">
                      verified
                    </span>
                    <span>บันทึกรับเงินออเดอร์นี้ลงระบบบัญชีแล้ว</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const paid =
                        typeof activeAmountThb === "number" &&
                        activeAmountThb > 0
                          ? activeAmountThb
                          : order.totalThb;
                      onRecordPromptPayPayment(order, paid);
                    }}
                    className="w-full h-11 px-4 rounded-xl bg-secondary hover:bg-secondary-dim text-on-secondary text-[13px] font-semibold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      task_alt
                    </span>
                    <span>ยืนยันรับโอนพร้อมเพย์ &amp; บันทึกลงบัญชี</span>
                  </button>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
