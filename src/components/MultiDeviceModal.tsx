import { useState } from "react";
import { ConnectedDevice } from "../types";
import {
  buildShareableRoomUrl,
  DEFAULT_LIVE_ROOM_ID,
  LiveConnectionStatus,
  sanitizeLiveRoomId,
} from "../utils/liveSync";

interface MultiDeviceModalProps {
  liveStatus: LiveConnectionStatus;
  roomId: string;
  currentDeviceId: string;
  currentDeviceName: string;
  devices: ConnectedDevice[];
  cloudStatus: "connected" | "connecting" | "local";
  cloudUserEmail?: string | null;
  isSyncingCloudAll?: boolean;
  cloudRecordCounts?: {
    products: number;
    orders: number;
    customers: number;
    accounting: number;
  };
  onRenameDevice: (nextName: string) => void;
  onChangeRoom: (nextRoomId: string) => void;
  onConnectCloud: () => void;
  onDisconnectCloud: () => void;
  onSyncAllToCloud?: () => void;
  onNotify: (msg: string, icon?: string) => void;
  onClose: () => void;
}

export function MultiDeviceModal({
  liveStatus,
  roomId,
  currentDeviceId,
  currentDeviceName,
  devices,
  cloudStatus,
  cloudUserEmail,
  isSyncingCloudAll = false,
  cloudRecordCounts,
  onRenameDevice,
  onChangeRoom,
  onConnectCloud,
  onDisconnectCloud,
  onSyncAllToCloud,
  onNotify,
  onClose,
}: MultiDeviceModalProps) {
  const [nameInput, setNameInput] = useState(currentDeviceName);
  const [roomInput, setRoomInput] = useState(roomId);
  const [copiedLink, setCopiedLink] = useState(false);

  const shareUrl = buildShareableRoomUrl(roomId);

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      onNotify("คัดลอกลิงก์ใช้งานร่วมกันแล้ว ส่งให้เครื่องอื่นเปิดได้เลย", "link");
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      onNotify("กรุณาคัดลอกลิงก์จากช่องด้านล่าง", "info");
    }
  };

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    onRenameDevice(trimmed);
  };

  const handleSwitchRoom = () => {
    const clean = sanitizeLiveRoomId(roomInput);
    setRoomInput(clean);
    if (clean === roomId) {
      onNotify(`เชื่อมต่อห้อง "${clean}" อยู่แล้ว`, "check_circle");
      return;
    }
    onChangeRoom(clean);
  };

  const deviceIcon = (type: ConnectedDevice["deviceType"]) => {
    if (type === "mobile") return "smartphone";
    if (type === "tablet") return "tablet_mac";
    return "laptop_mac";
  };

  const statusBadge = () => {
    if (liveStatus === "connected") {
      return {
        label: `ออนไลน์สด · ${Math.max(1, devices.length)} เครื่องกำลังใช้งานพร้อมกัน`,
        cls: "bg-secondary-container/70 text-on-secondary-container border-secondary/20",
        dot: "bg-secondary",
      };
    }
    if (liveStatus === "connecting" || liveStatus === "reconnecting") {
      return {
        label: "กำลังเชื่อมต่อซิงก์เรียลไทม์หลายเครื่อง...",
        cls: "bg-amber-50 text-amber-800 border-amber-200",
        dot: "bg-amber-500 animate-pulse",
      };
    }
    return {
      label: "กำลังพยายามเชื่อมต่อเซิร์ฟเวอร์ซิงก์...",
      cls: "bg-surface-container-high text-on-surface-variant border-outline-variant/40",
      dot: "bg-outline",
    };
  };

  const statusInfo = statusBadge();

  return (
    <div
      className="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-[2px] flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface-container-lowest rounded-t-3xl md:rounded-2xl shadow-2xl border border-outline-variant/30 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/25 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary-container text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">
                devices
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-on-surface truncate">
                ใช้งานพร้อมกันหลายเครื่อง (Real-Time)
              </h2>
              <p className="text-[12px] text-on-surface-variant truncate">
                สต็อก ออเดอร์ การแพ็ค และคำขออนุมัติซิงก์ตรงกันทันทีทุกเครื่อง
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors shrink-0"
            aria-label="ปิดหน้าต่าง"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Live Status Banner */}
          <div
            className={`px-3.5 py-2.5 rounded-xl border flex items-center gap-2.5 text-[12.5px] font-semibold ${statusInfo.cls}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusInfo.dot}`} />
            <span className="flex-1">{statusInfo.label}</span>
          </div>

          {/* Share Link Card */}
          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  share
                </span>
                ลิงก์เปิดใช้งานร่วมกันบนเครื่องอื่น
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant">
                ห้อง: {roomId}
              </span>
            </div>
            <p className="text-[12px] text-on-surface-variant leading-relaxed">
              ส่งลิงก์นี้ให้มือถือพนักงาน แท็บเล็ตโต๊ะแพ็ค หรือคอมพิวเตอร์หน้าร้านเปิดได้เลย ไม่ต้องล็อกอินก็ทำงานร่วมกันแบบเรียลไทม์ทันที
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-[12px] font-mono text-on-surface-variant"
              />
              <button
                type="button"
                onClick={() => void handleCopyShareLink()}
                className="px-3.5 py-2 rounded-lg bg-primary text-on-primary text-[12.5px] font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {copiedLink ? "check" : "content_copy"}
                </span>
                {copiedLink ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
              </button>
            </div>
          </div>

          {/* Active Devices List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-on-surface">
                อุปกรณ์ที่กำลังออนไลน์ ({Math.max(1, devices.length)} เครื่อง)
              </h3>
              <span className="text-[11px] text-on-surface-variant">
                อัปเดตสถานะอัตโนมัติ
              </span>
            </div>

            <div className="space-y-2">
              {devices.map((dev) => {
                const isSelf = dev.deviceId === currentDeviceId;
                return (
                  <div
                    key={dev.deviceId}
                    className={`p-3 rounded-xl border flex items-center gap-3 ${
                      isSelf
                        ? "bg-primary-container/25 border-primary/30"
                        : "bg-surface-container-lowest border-outline-variant/30"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        dev.roleMode === "owner"
                          ? "bg-primary/15 text-primary"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {deviceIcon(dev.deviceType)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-bold text-on-surface truncate">
                          {dev.deviceName}
                        </span>
                        {isSelf && (
                          <span className="px-1.5 py-0.5 rounded bg-primary text-on-primary text-[10px] font-bold">
                            เครื่องนี้
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11.5px] text-on-surface-variant mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                          {dev.roleMode === "owner" ? "โหมดเจ้าของร้าน" : "โหมดพนักงาน"}
                        </span>
                        {dev.connectedAt && <span>· เข้าเมื่อ {dev.connectedAt}</span>}
                        {dev.source === "cloud" && <span>· คลาวด์</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rename This Device */}
          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2">
            <label className="text-[12.5px] font-bold text-on-surface block">
              ชื่อเครื่องนี้ (แสดงให้เครื่องอื่นเห็น)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                }}
                placeholder="เช่น เคาน์เตอร์หน้าร้าน, โต๊ะแพ็ค 1"
                maxLength={80}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-[13px] text-on-surface focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="px-3.5 py-2 rounded-lg bg-surface-container-highest hover:bg-primary hover:text-on-primary text-on-surface text-[12.5px] font-semibold transition-colors shrink-0"
              >
                บันทึกชื่อ
              </button>
            </div>
          </div>

          {/* Room Switcher (Optional Multi-Branch) */}
          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[12.5px] font-bold text-on-surface">
                รหัสห้องร้านค้า (Room Code)
              </label>
              {roomId !== DEFAULT_LIVE_ROOM_ID && (
                <button
                  type="button"
                  onClick={() => {
                    setRoomInput(DEFAULT_LIVE_ROOM_ID);
                    onChangeRoom(DEFAULT_LIVE_ROOM_ID);
                  }}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  กลับห้องหลัก
                </button>
              )}
            </div>
            <p className="text-[11.5px] text-on-surface-variant">
              ทุกเครื่องที่ใส่รหัสห้องเดียวกันจะซิงก์ข้อมูลชุดเดียวกันแบบสดทันที
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSwitchRoom();
                }}
                placeholder="denewstock-main"
                maxLength={48}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-[13px] font-mono text-on-surface focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleSwitchRoom}
                className="px-3.5 py-2 rounded-lg bg-surface-container-highest hover:bg-primary hover:text-on-primary text-on-surface text-[12.5px] font-semibold transition-colors shrink-0"
              >
                เปลี่ยนห้อง
              </button>
            </div>
          </div>

          {/* Permanent Google Cloud Backup (Firebase Firestore) */}
          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[17px] text-secondary">
                    {cloudStatus === "connected" ? "cloud_done" : "cloud_upload"}
                  </span>
                  ฐานข้อมูล Google Cloud (Firebase Firestore)
                </p>
                <p className="text-[11.5px] text-on-surface-variant truncate mt-0.5">
                  {cloudStatus === "connected"
                    ? `เชื่อมและบันทึกอัตโนมัติที่ ${cloudUserEmail || "Google Cloud"}`
                    : "เชื่อมบัญชี Google เพื่อบันทึกและเชื่อมข้อมูลร้านทั้งหมดขึ้น Google Cloud ถาวร"}
                </p>
              </div>
              {cloudStatus === "connected" ? (
                <button
                  type="button"
                  onClick={onDisconnectCloud}
                  className="px-3 py-1.5 rounded-lg border border-outline-variant/60 text-[12px] font-semibold text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors shrink-0 cursor-pointer"
                >
                  ตัดคลาวด์
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConnectCloud}
                  disabled={cloudStatus === "connecting"}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary text-[12px] font-semibold hover:opacity-90 transition-opacity shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  {cloudStatus === "connecting" ? "กำลังเชื่อม..." : "เชื่อม Google Cloud"}
                </button>
              )}
            </div>

            {cloudRecordCounts && (
              <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                <div className="rounded-lg bg-surface-container-lowest py-1.5 px-1 border border-outline-variant/25">
                  <p className="font-bold text-on-surface tabular-nums">
                    {cloudRecordCounts.products}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">สินค้า</p>
                </div>
                <div className="rounded-lg bg-surface-container-lowest py-1.5 px-1 border border-outline-variant/25">
                  <p className="font-bold text-on-surface tabular-nums">
                    {cloudRecordCounts.orders}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">ออเดอร์</p>
                </div>
                <div className="rounded-lg bg-surface-container-lowest py-1.5 px-1 border border-outline-variant/25">
                  <p className="font-bold text-on-surface tabular-nums">
                    {cloudRecordCounts.customers}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">ลูกค้า</p>
                </div>
                <div className="rounded-lg bg-surface-container-lowest py-1.5 px-1 border border-outline-variant/25">
                  <p className="font-bold text-on-surface tabular-nums">
                    {cloudRecordCounts.accounting}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">บัญชี</p>
                </div>
              </div>
            )}

            {onSyncAllToCloud && (
              <button
                type="button"
                disabled={isSyncingCloudAll || cloudStatus === "connecting"}
                onClick={onSyncAllToCloud}
                className="w-full h-9 rounded-lg bg-primary text-on-primary hover:bg-primary-dim text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    isSyncingCloudAll ? "animate-spin" : ""
                  }`}
                >
                  {isSyncingCloudAll ? "progress_activity" : "cloud_sync"}
                </span>
                <span>
                  {isSyncingCloudAll
                    ? "กำลังบันทึกข้อมูลทุกอย่างขึ้น Google Cloud..."
                    : "บันทึกและซิงก์ข้อมูลทุกอย่างขึ้น Google Cloud"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
