/**
 * Standards-compliant EMVCo / Bank of Thailand PromptPay Dynamic QR Payload Generator
 * Supports:
 * - Thai Mobile Number (10 digits starting with 0 -> 0066xxxxxxxxx, sub-tag 01)
 * - Thai National ID / Tax ID (13 digits, sub-tag 02)
 * - e-Wallet ID (15 digits, sub-tag 03)
 * - Exact dynamic amount in THB (Tag 54) + Dynamic Point of Initiation (Tag 01 = 12)
 * - CRC-16/CCITT-FALSE checksum (Tag 63, poly 0x1021, init 0xFFFF)
 */

export type PromptPayTargetType = "mobile" | "national_id" | "ewallet" | "invalid";

export interface ParsedPromptPayTarget {
  valid: boolean;
  type: PromptPayTargetType;
  digits: string;
  formattedDisplay: string;
  labelTh: string;
  subTag: "01" | "02" | "03" | "";
  emvTargetValue: string;
}

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${tag}${len}${value}`;
}

/**
 * CRC-16/CCITT-FALSE (Polynomial 0x1021, Initial 0xFFFF)
 */
export function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function normalizePromptPayDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 15);
}

export function parsePromptPayTarget(raw: string): ParsedPromptPayTarget {
  const digits = normalizePromptPayDigits(raw);

  // 15-digit e-Wallet ID
  if (digits.length === 15) {
    return {
      valid: true,
      type: "ewallet",
      digits,
      formattedDisplay: `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}-${digits.slice(11)}`,
      labelTh: "e-Wallet ID (15 หลัก)",
      subTag: "03",
      emvTargetValue: digits,
    };
  }

  // 13-digit National ID / Tax ID (or 0066xxxxxxxxx mobile)
  if (digits.length === 13) {
    if (digits.startsWith("0066") && digits.length === 13) {
      const localMobile = `0${digits.slice(4)}`;
      return {
        valid: true,
        type: "mobile",
        digits: localMobile,
        formattedDisplay: `${localMobile.slice(0, 3)}-${localMobile.slice(3, 6)}-${localMobile.slice(6)}`,
        labelTh: "เบอร์มือถือพร้อมเพย์",
        subTag: "01",
        emvTargetValue: digits,
      };
    }
    return {
      valid: true,
      type: "national_id",
      digits,
      formattedDisplay: `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`,
      labelTh: "เลขประจำตัวผู้เสียภาษี / บัตรประชาชน",
      subTag: "02",
      emvTargetValue: digits,
    };
  }

  // 10-digit Thai mobile number (e.g., 0812345678)
  if (digits.length === 10 && digits.startsWith("0")) {
    return {
      valid: true,
      type: "mobile",
      digits,
      formattedDisplay: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`,
      labelTh: "เบอร์มือถือพร้อมเพย์",
      subTag: "01",
      emvTargetValue: `0066${digits.slice(1)}`,
    };
  }

  // 11-digit international format starting with 66 (e.g., 66812345678)
  if (digits.length === 11 && digits.startsWith("66")) {
    const localMobile = `0${digits.slice(2)}`;
    return {
      valid: true,
      type: "mobile",
      digits: localMobile,
      formattedDisplay: `${localMobile.slice(0, 3)}-${localMobile.slice(3, 6)}-${localMobile.slice(6)}`,
      labelTh: "เบอร์มือถือพร้อมเพย์",
      subTag: "01",
      emvTargetValue: `00${digits}`,
    };
  }

  return {
    valid: false,
    type: "invalid",
    digits,
    formattedDisplay: raw.trim(),
    labelTh: "ยังไม่ถูกต้อง",
    subTag: "",
    emvTargetValue: "",
  };
}

/**
 * Generates an EMVCo PromptPay QR payload string.
 * Returns null if target is invalid.
 */
export function generatePromptPayPayload(
  rawTarget: string,
  amountThb?: number
): string | null {
  const target = parsePromptPayTarget(rawTarget);
  if (!target.valid || !target.subTag) return null;

  const hasAmount =
    typeof amountThb === "number" &&
    Number.isFinite(amountThb) &&
    amountThb > 0;

  const merchantAccountInfo = [
    tlv("00", "A000000677010111"),
    tlv(target.subTag, target.emvTargetValue),
  ].join("");

  const parts: string[] = [
    tlv("00", "01"), // Payload Format Indicator
    tlv("01", hasAmount ? "12" : "11"), // 12 = Dynamic (locked amount), 11 = Static
    tlv("29", merchantAccountInfo), // PromptPay Merchant Account Info
    tlv("53", "764"), // THB Currency Code (ISO 4217)
  ];

  if (hasAmount) {
    parts.push(tlv("54", amountThb.toFixed(2)));
  }

  parts.push(tlv("58", "TH")); // Country Code

  const payloadWithoutCrc = `${parts.join("")}6304`;
  const crc = computeCrc16Ccitt(payloadWithoutCrc);
  return `${payloadWithoutCrc}${crc}`;
}
