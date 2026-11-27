import { useEffect, useState } from "react";
import { RoleMode, StockApprovalRequest } from "../types";

interface OwnerAuthViewProps {
  role: RoleMode;
  ownerName: string;
  onUpdateOwnerName: (name: string) => void;
  ownerPin: string;
  onChangeOwnerPin: (newPin: string) => void;
  pendingCount: number;
  packingCount: number;
  readyToShipCount: number;
  shippedCount: number;
  approvalRequests: StockApprovalRequest[];
  onQuickCreateOrder: () => void;
  onGoToOrders: () => void;
  onAuthenticateOwner: () => void;
  onSwitchToStaff: () => void;
  onApproveStockRequest: (reqId: string, approve: boolean) => void;
  onNotify: (msg: string, icon?: string) => void;
}

export function OwnerAuthView({
  role,
  ownerName,
  onUpdateOwnerName,
  ownerPin,
  onChangeOwnerPin,
  pendingCount,
  packingCount,
  readyToShipCount,
  shippedCount,
  approvalRequests,
  onQuickCreateOrder,
  onGoToOrders,
  onAuthenticateOwner,
  onSwitchToStaff,
  onApproveStockRequest,
  onNotify,
}: OwnerAuthViewProps) {
  // Always open on the Owner tab so tapping "เข้าเจ้าของร้าน" shows the PIN keypad immediately
  const [selectedTab, setSelectedTab] = useState<RoleMode>("owner");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(ownerName);

  const [pinInput, setPinInput] = useState("");
  const [pinStatus, setPinStatus] = useState(
    ownerPin === "123456"
      ? "กรอกรหัสผ่าน 6 หลักเพื่อเข้าโหมดเจ้าของร้าน (รหัสเริ่มต้น: 123456)"
      : "กรอกรหัสผ่าน 6 หลักเพื่อเข้าโหมดเจ้าของร้าน"
  );
  const [pinStatusType, setPinStatusType] = useState<
    "neutral" | "success" | "error" | "info"
  >("neutral");

  // Change PIN form state (Owner only)
  const [showChangePin, setShowChangePin] = useState(false);
  const [currentPinDraft, setCurrentPinDraft] = useState("");
  const [newPinDraft, setNewPinDraft] = useState("");
  const [confirmPinDraft, setConfirmPinDraft] = useState("");
  const [changePinError, setChangePinError] = useState<string | null>(null);

  useEffect(() => {
    if (role === "staff") {
      setPinStatus(
        ownerPin === "123456"
          ? "กรอกรหัสผ่าน 6 หลักเพื่อเข้าโหมดเจ้าของร้าน (รหัสเริ่มต้น: 123456)"
          : "กรอกรหัสผ่าน 6 หลักเพื่อเข้าโหมดเจ้าของร้าน"
      );
      setPinStatusType("neutral");
    }
  }, [role, ownerPin]);

  const handleSaveOwnerName = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameDraft.trim();
    if (!cleaned) return;
    onUpdateOwnerName(cleaned);
    setIsEditingName(false);
  };

  const pendingApprovals = approvalRequests.filter(
    (r) => r.status === "pending"
  );

  const submitPinCandidate = (nextPin: string) => {
    setPinStatus("กำลังตรวจสอบรหัสผ่าน...");
    setPinStatusType("info");
    setTimeout(() => {
      if (nextPin === ownerPin) {
        setPinStatus("ปลดล็อกโหมดเจ้าของร้านสำเร็จ");
        setPinStatusType("success");
        onAuthenticateOwner();
        setTimeout(() => {
          setPinInput("");
          setPinStatus(
            "ยืนยันรหัสเจ้าของร้านแล้ว — เข้าถึงต้นทุนและอนุมัติสต็อกได้เต็มรูปแบบ"
          );
        }, 650);
      } else {
        setPinStatus(
          ownerPin === "123456"
            ? "รหัสผ่านไม่ถูกต้อง (รหัสเริ่มต้นคือ 123456)"
            : "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง"
        );
        setPinStatusType("error");
        onNotify("รหัสผ่านไม่ถูกต้อง", "error");
        setTimeout(() => {
          setPinInput("");
        }, 650);
      }
    }, 240);
  };

  const handleDigitPress = (digit: string) => {
    if (pinInput.length >= 6) return;
    const nextPin = pinInput + digit;
    setPinInput(nextPin);

    if (nextPin.length === 6) {
      submitPinCandidate(nextPin);
    }
  };

  const handleBackspace = () => {
    if (pinInput.length > 0) {
      setPinInput((prev) => prev.slice(0, -1));
    }
  };

  const handleClearPin = () => {
    setPinInput("");
    setPinStatus(
      ownerPin === "123456"
        ? "กรอกรหัสผ่าน 6 หลักเพื่อเข้าโหมดเจ้าของร้าน (รหัสเริ่มต้น: 123456)"
        : "กรอกรหัสผ่าน 6 หลักเพื่อเข้าโหมดเจ้าของร้าน"
    );
    setPinStatusType("neutral");
  };

  // Allow keyboard number entry when the Owner PIN keypad is displayed
  useEffect(() => {
    if (role !== "staff" || selectedTab !== "owner") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setPinInput((prev) => {
          if (prev.length >= 6) return prev;
          const next = prev + e.key;
          if (next.length === 6) {
            submitPinCandidate(next);
          }
          return next;
        });
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPinInput((prev) => prev.slice(0, -1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        setPinInput("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [role, selectedTab, ownerPin]);

  const handleForgotPin = () => {
    if (ownerPin === "123456") {
      setPinStatus("รหัสผ่านเริ่มต้นสำหรับเจ้าของร้านคือ 123456");
      setPinStatusType("info");
      onNotify("รหัสผ่านเริ่มต้น: 123456", "key");
    } else {
      setPinStatus("กรุณาติดต่อเจ้าของร้านเพื่อขอรหัสผ่าน 6 หลัก");
      setPinStatusType("info");
      onNotify("กรุณาติดต่อเจ้าของร้านเพื่อขอรหัสผ่าน", "key");
    }
  };

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    setChangePinError(null);
    if (currentPinDraft !== ownerPin) {
      setChangePinError("รหัสผ่านปัจจุบันไม่ถูกต้อง");
      return;
    }
    if (!/^\d{6}$/.test(newPinDraft)) {
      setChangePinError("กรุณากรอกรหัสผ่านใหม่เป็นตัวเลข 6 หลัก");
      return;
    }
    if (newPinDraft !== confirmPinDraft) {
      setChangePinError("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
      return;
    }
    onChangeOwnerPin(newPinDraft);
    setCurrentPinDraft("");
    setNewPinDraft("");
    setConfirmPinDraft("");
    setShowChangePin(false);
  };

  return (
    <div className="flex flex-col w-full gap-4 pb-6">
      {/* Top Active Mode Header Bar (Staff vs Owner Name) */}
      <div className="bg-surface-container-lowest rounded-xl px-4 py-3 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              role === "staff"
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-primary-fixed text-on-primary-fixed"
            }`}
          >
            <span className="material-symbols-outlined material-symbols-filled text-[22px]">
              {role === "staff" ? "badge" : "admin_panel_settings"}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-on-surface-variant">
              {role === "staff"
                ? "โหมดการใช้งานปัจจุบัน"
                : "เจ้าของร้านที่กำลังใช้งาน"}
            </p>
            {role === "owner" && isEditingName ? (
              <form
                onSubmit={handleSaveOwnerName}
                className="flex items-center gap-1.5 mt-0.5"
              >
                <input
                  type="text"
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="ระบุชื่อเจ้าของร้าน"
                  className="h-8 px-2.5 rounded-lg bg-surface-container-low border border-primary text-[13px] font-semibold text-on-surface focus:outline-none w-44"
                />
                <button
                  type="submit"
                  className="h-8 px-2.5 rounded-lg bg-primary text-on-primary text-[12px] font-semibold cursor-pointer"
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(ownerName);
                    setIsEditingName(false);
                  }}
                  className="h-8 px-2 rounded-lg bg-surface-container text-on-surface-variant text-[12px] cursor-pointer"
                >
                  ยกเลิก
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-[17px] font-bold text-on-surface truncate">
                  {role === "staff" ? "พนักงาน" : ownerName}
                </h1>
                {role === "owner" && (
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(ownerName);
                      setIsEditingName(true);
                    }}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-surface-container-low hover:bg-surface-container text-primary text-[11px] font-medium cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      edit
                    </span>
                    <span>แก้ไขชื่อ</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
              role === "staff"
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-primary-fixed text-on-primary-fixed"
            }`}
          >
            {role === "staff" ? "สิทธิ์พนักงาน" : "สิทธิ์เจ้าของร้าน"}
          </span>
        </div>
      </div>

      {/* Top Quick Buttons & Live Status Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onQuickCreateOrder}
            className="flex-1 h-12 bg-primary text-on-primary rounded-xl font-semibold text-[14px] flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform cursor-pointer hover:bg-primary-dim"
          >
            <span className="material-symbols-outlined text-[20px]">
              add_circle
            </span>
            <span>+ สร้างออเดอร์ใหม่</span>
          </button>
          <button
            type="button"
            onClick={onGoToOrders}
            className="h-12 px-4 bg-surface-container-lowest border border-outline-variant/30 text-on-surface rounded-xl font-medium text-[13px] flex items-center justify-center gap-1.5 shadow-sm active:bg-surface-container transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">
              receipt_long
            </span>
            <span>รายการ</span>
          </button>
        </div>

        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-3 shadow-sm flex flex-col gap-2 border border-outline-variant/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary">
                bolt
              </span>
              <span className="text-[12px] text-on-surface font-semibold">
                สถานะออเดอร์เรียลไทม์วันนี้
              </span>
            </div>
            <span className="text-[11px] text-secondary bg-secondary-container px-2 py-0.5 rounded-full font-medium">
              อัปเดตสด
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-surface-container-low rounded-lg p-2 flex flex-col items-center text-center">
              <span className="text-[11px] text-on-surface-variant truncate">
                ออเดอร์ใหม่เข้า
              </span>
              <span className="text-[18px] text-error font-bold tabular-nums">
                {pendingCount}
              </span>
              <span className="text-[10px] text-on-surface-variant">รายการ</span>
            </div>
            <div className="bg-surface-container-low rounded-lg p-2 flex flex-col items-center text-center">
              <span className="text-[11px] text-on-surface-variant truncate">
                กำลังแพ็คของ
              </span>
              <span className="text-[18px] text-tertiary font-bold tabular-nums">
                {packingCount}
              </span>
              <span className="text-[10px] text-on-surface-variant">รายการ</span>
            </div>
            <div className="bg-surface-container-low rounded-lg p-2 flex flex-col items-center text-center">
              <span className="text-[11px] text-on-surface-variant truncate">
                รอจัดส่ง
              </span>
              <span className="text-[18px] text-primary font-bold tabular-nums">
                {readyToShipCount}
              </span>
              <span className="text-[10px] text-on-surface-variant">รายการ</span>
            </div>
            <div className="bg-surface-container-low rounded-lg p-2 flex flex-col items-center text-center">
              <span className="text-[11px] text-on-surface-variant truncate">
                ส่งของแล้ว
              </span>
              <span className="text-[18px] text-secondary font-bold tabular-nums">
                {shippedCount}
              </span>
              <span className="text-[10px] text-on-surface-variant">รายการ</span>
            </div>
          </div>
        </div>
      </div>

      {/* Role Switcher Toggle: Staff (Left) & Owner (Right) */}
      <div
        aria-label="สลับโหมดผู้ใช้งาน"
        className="bg-surface-container p-1.5 rounded-xl flex items-center gap-1 shadow-sm"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedTab === "staff"}
          onClick={() => setSelectedTab("staff")}
          className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-[13px] transition-all duration-200 flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
            selectedTab === "staff"
              ? "bg-secondary text-on-secondary shadow-sm"
              : "bg-transparent text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span
            className={`material-symbols-outlined text-[18px] ${
              selectedTab === "staff" ? "material-symbols-filled" : ""
            }`}
          >
            badge
          </span>
          <span className="truncate">โหมดพนักงาน (Staff)</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedTab === "owner"}
          onClick={() => setSelectedTab("owner")}
          className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-[13px] transition-all duration-200 flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
            selectedTab === "owner"
              ? "bg-primary text-on-primary shadow-sm"
              : "bg-transparent text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span
            className={`material-symbols-outlined text-[18px] ${
              selectedTab === "owner" ? "material-symbols-filled" : ""
            }`}
          >
            admin_panel_settings
          </span>
          <span className="truncate">โหมดเจ้าของร้าน (Owner)</span>
        </button>
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-6">
          {selectedTab === "owner" ? (
            role === "owner" ? (
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col gap-4 border border-outline-variant/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined material-symbols-filled text-[24px]">
                        verified_user
                      </span>
                    </div>
                    <div>
                      <h2 className="text-[17px] font-semibold text-on-surface">
                        ปลดล็อกสิทธิ์เจ้าของร้านแล้ว
                      </h2>
                      <p className="text-[12px] text-on-surface-variant">
                        สามารถดูต้นทุนแลนดิ้ง ตั้งค่าเรทเงิน และแก้ไขสต็อกได้เต็มรูปแบบ
                      </p>
                    </div>
                  </div>
                </div>

                {/* Change Owner PIN Section */}
                <div className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[17px] text-primary">
                        pin
                      </span>
                      <span className="text-[13px] font-semibold text-on-surface">
                        รหัสผ่านเข้าโหมดเจ้าของร้าน (6 หลัก)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowChangePin((prev) => !prev);
                        setChangePinError(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-primary-fixed text-on-primary-fixed text-[11px] font-semibold hover:bg-primary hover:text-on-primary transition-colors cursor-pointer"
                    >
                      {showChangePin ? "ปิด" : "เปลี่ยนรหัส"}
                    </button>
                  </div>

                  {showChangePin && (
                    <form
                      onSubmit={handleSaveNewPin}
                      className="flex flex-col gap-2.5 pt-1 border-t border-outline-variant/25"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-on-surface-variant">
                            รหัสเดิม (6 หลัก)
                          </span>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={currentPinDraft}
                            onChange={(e) =>
                              setCurrentPinDraft(e.target.value.replace(/\D/g, ""))
                            }
                            placeholder="••••••"
                            className="h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-[13px] font-semibold tracking-widest text-on-surface focus:outline-none focus:border-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-on-surface-variant">
                            รหัสใหม่ (6 หลัก)
                          </span>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={newPinDraft}
                            onChange={(e) =>
                              setNewPinDraft(e.target.value.replace(/\D/g, ""))
                            }
                            placeholder="••••••"
                            className="h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-[13px] font-semibold tracking-widest text-on-surface focus:outline-none focus:border-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-on-surface-variant">
                            ยืนยันรหัสใหม่
                          </span>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={confirmPinDraft}
                            onChange={(e) =>
                              setConfirmPinDraft(e.target.value.replace(/\D/g, ""))
                            }
                            placeholder="••••••"
                            className="h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-[13px] font-semibold tracking-widest text-on-surface focus:outline-none focus:border-primary"
                          />
                        </label>
                      </div>
                      {changePinError && (
                        <p className="text-[12px] text-error font-medium">
                          {changePinError}
                        </p>
                      )}
                      <button
                        type="submit"
                        className="h-9 rounded-lg bg-primary text-on-primary text-[12px] font-semibold cursor-pointer hover:bg-primary-dim"
                      >
                        บันทึกรหัสผ่านใหม่
                      </button>
                    </form>
                  )}
                </div>

                {/* Pending Stock Approvals from Staff */}
                <div className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-on-surface">
                      คำขออนุมัติปรับสต็อกจากพนักงาน
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-[11px] font-semibold tabular-nums">
                      {pendingApprovals.length} รออนุมัติ
                    </span>
                  </div>

                  {pendingApprovals.length === 0 ? (
                    <p className="text-[12px] text-on-surface-variant py-3 text-center">
                      ไม่มีคำขออนุมัติที่รอดำเนินการ
                    </p>
                  ) : (
                    pendingApprovals.map((req) => (
                      <div
                        key={req.id}
                        className="bg-surface-container-lowest rounded-lg p-3 flex flex-col gap-2 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[13px] font-semibold text-on-surface">
                              {req.productName} ({req.sku})
                            </p>
                            <p className="text-[11px] text-on-surface-variant">
                              {req.requestedBy} · {req.createdAt}
                            </p>
                          </div>
                          <span className="text-[12px] font-semibold text-primary tabular-nums shrink-0">
                            {req.currentStock} → {req.requestedStock} ชิ้น
                          </span>
                        </div>
                        <p className="text-[12px] text-on-surface-variant">
                          เหตุผล: {req.reason}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onApproveStockRequest(req.id, false)}
                            className="flex-1 h-9 rounded-lg bg-surface-container text-on-surface text-[12px] font-medium cursor-pointer"
                          >
                            ปฏิเสธ
                          </button>
                          <button
                            type="button"
                            onClick={() => onApproveStockRequest(req.id, true)}
                            className="flex-1 h-9 rounded-lg bg-primary text-on-primary text-[12px] font-semibold cursor-pointer"
                          >
                            อนุมัติปรับสต็อก
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSwitchToStaff();
                    setSelectedTab("owner");
                  }}
                  className="w-full h-11 rounded-xl bg-secondary text-on-secondary font-semibold text-[13px] flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    lock
                  </span>
                  <span>ล็อกกลับเป็นโหมดพนักงาน</span>
                </button>
              </div>
            ) : (
              /* Owner PIN Keypad Section */
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm border border-outline-variant/30 flex flex-col items-center gap-4">
                <div className="flex flex-col items-center text-center gap-1">
                  <div className="w-12 h-12 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center mb-1">
                    <span className="material-symbols-outlined material-symbols-filled text-[24px]">
                      lock
                    </span>
                  </div>
                  <h2 className="text-[18px] font-semibold text-on-surface">
                    ใส่รหัสผ่านเจ้าของร้าน
                  </h2>
                  <p
                    className={`text-[13px] ${
                      pinStatusType === "success"
                        ? "text-secondary font-medium"
                        : pinStatusType === "error"
                          ? "text-error font-medium"
                          : pinStatusType === "info"
                            ? "text-primary font-medium"
                            : "text-on-surface-variant"
                    }`}
                  >
                    {pinStatus}
                  </p>
                </div>

                {/* 6-Digit PIN Dots */}
                <div
                  aria-label="รหัสผ่าน 6 หลัก"
                  className="flex items-center justify-center gap-3.5 py-2"
                >
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <span
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                        idx < pinInput.length
                          ? "bg-primary scale-110"
                          : "bg-surface-container-highest"
                      }`}
                    />
                  ))}
                </div>

                {/* Numeric Keypad */}
                <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] pt-1">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleDigitPress(digit)}
                      className="h-14 rounded-xl bg-surface-container-low text-on-surface text-[22px] font-semibold flex items-center justify-center active:scale-95 active:bg-primary-fixed active:text-on-primary-fixed transition-all duration-150 cursor-pointer hover:bg-surface-container"
                    >
                      {digit}
                    </button>
                  ))}

                  <button
                    type="button"
                    aria-label="ล้างรหัส"
                    onClick={handleClearPin}
                    className="h-14 rounded-xl bg-surface-container-low text-on-surface-variant text-[13px] font-semibold flex items-center justify-center active:scale-95 transition-all duration-150 cursor-pointer hover:bg-surface-container"
                  >
                    ล้าง
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDigitPress("0")}
                    className="h-14 rounded-xl bg-surface-container-low text-on-surface text-[22px] font-semibold flex items-center justify-center active:scale-95 active:bg-primary-fixed active:text-on-primary-fixed transition-all duration-150 cursor-pointer hover:bg-surface-container"
                  >
                    0
                  </button>

                  <button
                    type="button"
                    aria-label="ลบตัวเลข"
                    onClick={handleBackspace}
                    className="h-14 rounded-xl bg-surface-container-low text-on-surface-variant flex items-center justify-center active:scale-95 transition-all duration-150 cursor-pointer hover:bg-surface-container"
                  >
                    <span className="material-symbols-outlined text-[24px]">
                      backspace
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleForgotPin}
                  className="text-[12px] font-medium text-primary py-2 px-4 rounded-lg hover:bg-primary-fixed/30 transition-colors min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  ลืมรหัสผ่าน?
                </button>
              </div>
            )
          ) : (
            /* Staff Quick Switch Section */
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm border border-outline-variant/30 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                <span className="material-symbols-outlined material-symbols-filled text-[24px]">
                  storefront
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-[18px] font-semibold text-on-surface">
                  โหมดพนักงานหน้าร้าน
                </h2>
                <p className="text-[13px] text-on-surface-variant">
                  ไม่ต้องใช้รหัสผ่าน สามารถจัดการคลังสินค้าและออเดอร์หน้าร้านได้ทันที
                </p>
              </div>
              <button
                type="button"
                onClick={onSwitchToStaff}
                className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {role === "staff" ? "check_circle" : "badge"}
                </span>
                <span>
                  {role === "staff"
                    ? "กำลังใช้งานโหมดพนักงานอยู่"
                    : "สลับเป็นโหมดพนักงานทันที"}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Permission Summary Card */}
        <div className="lg:col-span-6 bg-surface-container-low rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">
              verified_user
            </span>
            <h3 className="text-[16px] font-semibold text-on-surface">
              สรุปสิทธิ์การใช้งาน
            </h3>
          </div>

          <div className="flex flex-col gap-2.5">
            <div
              className={`bg-surface-container-lowest rounded-lg p-3.5 flex items-start gap-3 shadow-sm border ${
                role === "staff" ? "border-secondary/40" : "border-transparent"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">
                  qr_code_scanner
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-on-surface">
                    สิทธิ์พนักงาน
                  </span>
                  {role === "staff" && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-semibold">
                      กำลังใช้งาน
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-on-surface-variant mt-0.5">
                  เปิดใช้งานได้ทันทีโดยไม่ต้องใส่รหัส: เพิ่มสินค้า, จัดการออเดอร์, ถ่ายรูปยืนยันจัดส่ง (ซ่อนต้นทุนและเรทเงิน)
                </p>
              </div>
            </div>

            <div
              className={`bg-surface-container-lowest rounded-lg p-3.5 flex items-start gap-3 shadow-sm border ${
                role === "owner" ? "border-primary/40" : "border-transparent"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">
                  key
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-on-surface">
                    สิทธิ์เจ้าของร้าน ({ownerName})
                  </span>
                  {role === "owner" && (
                    <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-[10px] font-semibold">
                      กำลังใช้งาน
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-on-surface-variant mt-0.5">
                  ปลดล็อกด้วยรหัสผ่าน 6 หลัก: อัปโหลดและสแกนบิล, ดูต้นทุนจริง, ตั้งค่าเรทเงิน, อนุมัติ/แก้ไขจำนวนสต็อกได้เต็มรูปแบบ
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
