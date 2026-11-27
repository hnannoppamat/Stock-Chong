import { useState } from "react";
import { signInWithGoogle } from "../firebase";

interface AuthGateProps {
  loading: boolean;
}

export function AuthGate({ loading }: AuthGateProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "ไม่สามารถเข้าสู่ระบบด้วย Google ได้";
      if (msg.includes("popup-closed-by-user")) {
        setError("ยกเลิกการเข้าสู่ระบบ กรุณากดปุ่มอีกครั้ง");
      } else {
        setError("ไม่สามารถเข้าสู่ระบบด้วย Google ได้ กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-[26px] animate-spin">
              sync
            </span>
          </div>
          <p className="text-[14px] font-medium text-on-surface-variant">
            กำลังเชื่อมต่อบัญชีและข้อมูลร้านค้า...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-xl border border-outline-variant/30 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary text-on-primary flex items-center justify-center shadow-md">
            <span className="material-symbols-outlined text-[34px]">
              inventory_2
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-bold tracking-tight text-on-surface">
              DenewStock
            </h1>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">
              ระบบจัดการสต็อก ออเดอร์ และยืนยันการจัดส่งสินค้า เชื่อมต่อฐานข้อมูลคลาวด์แบบเรียลไทม์
            </p>
          </div>
        </div>

        <div className="bg-surface-container-low rounded-xl p-4 flex flex-col gap-2.5 text-[12px] text-on-surface-variant">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
              cloud_done
            </span>
            <span>บันทึกสต็อก ออเดอร์ และหลักฐานจัดส่งลงฐานข้อมูลคลาวด์อัตโนมัติ</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-secondary shrink-0">
              verified_user
            </span>
            <span>แยกสิทธิ์โหมดพนักงานและเจ้าของร้านอย่างปลอดภัยด้วยบัญชี Google</span>
          </div>
        </div>

        {error && (
          <div className="px-3.5 py-2.5 rounded-xl bg-error-container/40 text-error text-[12px] font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0">
              error
            </span>
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={signingIn}
          className="w-full h-12 px-4 rounded-xl bg-primary text-on-primary hover:bg-primary-dim font-semibold text-[14px] shadow-md flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[20px]">
            {signingIn ? "sync" : "login"}
          </span>
          <span>
            {signingIn
              ? "กำลังเข้าสู่ระบบ..."
              : "เข้าสู่ระบบด้วย Google (Sign in with Google)"}
          </span>
        </button>

        <p className="text-[11px] text-center text-on-surface-variant">
          ข้อมูลร้านค้าของคุณจะถูกจัดเก็บแยกเป็นส่วนตัวภายใต้บัญชี Google ของคุณ
        </p>
      </div>
    </div>
  );
}
