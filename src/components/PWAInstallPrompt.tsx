import { PWAInstallState } from "../hooks/usePWAInstall";

interface PWAInstallGuideModalProps {
  open: boolean;
  onClose: () => void;
  isIOS: boolean;
  isAndroid: boolean;
}

export function PWAInstallGuideModal({
  open,
  onClose,
  isIOS,
  isAndroid,
}: PWAInstallGuideModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="วิธีติดตั้งแอพ DenewStock ลงหน้าจอมือถือ"
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-inverse-surface/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl shadow-2xl border border-outline-variant/60 overflow-hidden pb-safe"
      >
        <div className="px-5 pt-4 pb-3 border-b border-outline-variant/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/icon.svg"
              alt="ไอคอน DenewStock"
              className="w-11 h-11 rounded-xl shadow-sm border border-outline-variant/40 shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-on-surface leading-tight">
                ติดตั้งแอพลงหน้าจอมือถือ
              </h2>
              <p className="text-[12px] text-on-surface-variant truncate">
                เปิดเต็มจอเหมือนแอพจริง ไม่ต้องพิมพ์ลิงก์ใหม่
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="ปิดหน้าต่าง"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant flex items-center justify-center shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isIOS ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[13px] font-bold text-primary">
                <span className="material-symbols-outlined text-[18px]">
                  phone_iphone
                </span>
                <span>สำหรับ iPhone / iPad (Safari)</span>
              </div>
              <ol className="space-y-2.5 text-[13px] text-on-surface">
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-low">
                  <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-[12px] font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    แตะปุ่ม{" "}
                    <strong className="font-semibold text-primary">
                      แชร์ (Share)
                    </strong>{" "}
                    ไอคอนสี่เหลี่ยมมีลูกศรชี้ขึ้นด้านล่างจอ Safari
                  </span>
                </li>
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-low">
                  <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-[12px] font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    เลื่อนลงแล้วเลือก{" "}
                    <strong className="font-semibold text-primary">
                      เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)
                    </strong>
                  </span>
                </li>
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-low">
                  <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-[12px] font-bold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <span>
                    แตะ{" "}
                    <strong className="font-semibold text-primary">
                      เพิ่ม (Add)
                    </strong>{" "}
                    มุมขวาบน เพื่อสร้างไอคอน DenewStock บนหน้าจอหลัก
                  </span>
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[13px] font-bold text-primary">
                <span className="material-symbols-outlined text-[18px]">
                  {isAndroid ? "smartphone" : "install_mobile"}
                </span>
                <span>
                  {isAndroid
                    ? "สำหรับมือถือ Android (Chrome)"
                    : "วิธีติดตั้งลงหน้าจอโฮม"}
                </span>
              </div>
              <ol className="space-y-2.5 text-[13px] text-on-surface">
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-low">
                  <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-[12px] font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    แตะปุ่มเมนู{" "}
                    <strong className="font-semibold text-primary">
                      จุดสามจุด (⋮)
                    </strong>{" "}
                    ที่มุมขวาบนของเบราว์เซอร์ Chrome
                  </span>
                </li>
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-low">
                  <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-[12px] font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    เลือก{" "}
                    <strong className="font-semibold text-primary">
                      ติดตั้งแอป (Install app)
                    </strong>{" "}
                    หรือ{" "}
                    <strong className="font-semibold text-primary">
                      เพิ่มลงในหน้าจอหลัก
                    </strong>
                  </span>
                </li>
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-low">
                  <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-[12px] font-bold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <span>
                    กด{" "}
                    <strong className="font-semibold text-primary">
                      ติดตั้ง (Install)
                    </strong>{" "}
                    แล้วเปิดใช้งานเต็มจอจากหน้าจอหลักได้ทันที
                  </span>
                </li>
              </ol>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-xl bg-primary text-on-primary font-semibold text-[14px] hover:bg-primary-dim active:scale-[0.98] transition-all cursor-pointer"
          >
            เข้าใจแล้ว
          </button>
        </div>
      </div>
    </div>
  );
}

interface PWAInstallBannerProps {
  pwa: PWAInstallState;
  onTriggerInstall: () => void;
}

export function PWAInstallBanner({
  pwa,
  onTriggerInstall,
}: PWAInstallBannerProps) {
  if (pwa.isStandalone || pwa.bannerDismissed) return null;

  // Show on mobile (or whenever native prompt is ready)
  const shouldShowOnDesktop = pwa.hasNativePrompt;

  return (
    <div
      className={`${
        shouldShowOnDesktop ? "block" : "md:hidden"
      } mb-3 rounded-2xl bg-gradient-to-r from-primary-fixed/80 via-surface-container-lowest to-secondary-container/60 border border-primary/25 p-3 shadow-xs`}
    >
      <div className="flex items-center gap-3">
        <img
          src="/icon.svg"
          alt="DenewStock"
          className="w-10 h-10 rounded-xl shadow-xs border border-outline-variant/40 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-on-surface leading-tight truncate">
            ติดตั้ง DenewStock เป็นแอพมือถือ
          </p>
          <p className="text-[11px] text-on-surface-variant leading-snug mt-0.5 truncate">
            เปิดเต็มจอลื่นกว่าเดิม เข้าหน้าร้านไวในแตะเดียว
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onTriggerInstall}
            className="h-9 px-3 rounded-xl bg-primary text-on-primary text-[12px] font-bold hover:bg-primary-dim active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            ติดตั้งแอพ
          </button>
          <button
            type="button"
            aria-label="ซ่อนแถบติดตั้งแอพ"
            onClick={pwa.dismissBanner}
            className="w-8 h-8 rounded-lg text-on-surface-variant hover:bg-surface-container flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
