import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  linkWithCredential,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  User,
} from "firebase/auth";
import { doc, getDocFromServer, getFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const USERNAME_EMAIL_DOMAIN = "denewstock.app";
export const FIREBASE_AUTH_PROVIDERS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const BASIC_EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

// Keep session signed in across mobile browser & installed PWA restarts
void setPersistence(auth, browserLocalPersistence).catch(() => {});

export function resolveUsernameToAuthEmail(
  rawInput: string
): { email: string; displayUsername: string } | { error: string } {
  const normalized = rawInput.trim().toLowerCase();
  if (!normalized) {
    return { error: "กรุณากรอกชื่อผู้ใช้ (Username)" };
  }
  if (normalized.includes("@")) {
    if (!BASIC_EMAIL_REGEX.test(normalized) || normalized.length > 120) {
      return { error: "รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง" };
    }
    return { email: normalized, displayUsername: normalized };
  }
  if (!USERNAME_REGEX.test(normalized)) {
    return {
      error:
        "ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษพิมพ์เล็ก ตัวเลข หรือ . _ - ความยาว 3–32 ตัวอักษร (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข)",
    };
  }
  return {
    email: `${normalized}@${USERNAME_EMAIL_DOMAIN}`,
    displayUsername: normalized,
  };
}

export function formatAccountIdentifier(user: User | null | undefined): string | null {
  if (!user) return null;
  const email = user.email?.trim() || "";
  if (!email) return user.displayName?.trim() || null;
  const suffix = `@${USERNAME_EMAIL_DOMAIN}`;
  if (email.toLowerCase().endsWith(suffix)) {
    return email.slice(0, -suffix.length);
  }
  return email;
}

export function isPasswordAuthUser(user: User | null | undefined): boolean {
  if (!user) return false;
  return Boolean(
    user.providerData?.some((provider) => provider.providerId === "password")
  );
}

export async function signInWithUsernamePassword(
  usernameOrEmail: string,
  password: string
) {
  const resolved = resolveUsernameToAuthEmail(usernameOrEmail);
  if ("error" in resolved) {
    throw new Error(resolved.error);
  }
  if (!password || password.length < 6 || password.length > 128) {
    throw new Error("กรุณากรอกรหัสผ่านความยาวอย่างน้อย 6 ตัวอักษร");
  }
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  return signInWithEmailAndPassword(auth, resolved.email, password);
}

export async function registerWithUsernamePassword(
  usernameOrEmail: string,
  password: string,
  storeDisplayName?: string
) {
  const resolved = resolveUsernameToAuthEmail(usernameOrEmail);
  if ("error" in resolved) {
    throw new Error(resolved.error);
  }
  if (!password || password.length < 6 || password.length > 128) {
    throw new Error("รหัสผ่านต้องมีความยาว 6–128 ตัวอักษร");
  }
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  const cred = await createUserWithEmailAndPassword(
    auth,
    resolved.email,
    password
  );
  const cleanName = (storeDisplayName?.trim() || resolved.displayUsername).slice(
    0,
    80
  );
  if (cleanName) {
    await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
  }
  return cred;
}

export async function linkPasswordToCurrentAccount(newPassword: string) {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("ไม่พบข้อมูลบัญชีที่เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
  }
  if (!newPassword || newPassword.length < 6 || newPassword.length > 128) {
    throw new Error("รหัสผ่านต้องมีความยาว 6–128 ตัวอักษร");
  }
  const credential = EmailAuthProvider.credential(user.email, newPassword);
  await linkWithCredential(user, credential);
  await user.reload().catch(() => {});
  return user;
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string
) {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("ไม่พบข้อมูลบัญชีที่เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
  }
  if (!currentPassword || currentPassword.length < 6) {
    throw new Error("กรุณากรอกรหัสผ่านเดิมให้ถูกต้อง");
  }
  if (!newPassword || newPassword.length < 6 || newPassword.length > 128) {
    throw new Error("รหัสผ่านใหม่ต้องมีความยาว 6–128 ตัวอักษร");
  }
  if (currentPassword === newPassword) {
    throw new Error("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
  return user;
}

export async function signOutUser() {
  return signOut(auth);
}

export function formatPasswordAuthError(err: unknown): {
  message: string;
  isProviderDisabled?: boolean;
} {
  const code = (err as { code?: string })?.code || "";
  if (
    code === "auth/operation-not-allowed" ||
    code === "auth/configuration-not-found"
  ) {
    return {
      isProviderDisabled: true,
      message:
        "ยังไม่ได้เปิดใช้งานระบบ Email/Password ใน Firebase Console — กรุณาเปิดสวิตช์ Email/Password ก่อนใช้งานครั้งแรก",
    };
  }
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  ) {
    return {
      message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
    };
  }
  if (code === "auth/email-already-in-use") {
    return {
      message:
        "ชื่อผู้ใช้นี้มีอยู่แล้วในระบบ กรุณาสลับไปที่แถบ 'เข้าสู่ระบบ' หรือใช้ชื่อผู้ใช้อื่น",
    };
  }
  if (code === "auth/weak-password") {
    return {
      message: "รหัสผ่านสั้นเกินไป กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร",
    };
  }
  if (code === "auth/invalid-email") {
    return {
      message: "รูปแบบชื่อผู้ใช้หรืออีเมลไม่ถูกต้อง กรุณาใช้ตัวอักษรภาษาอังกฤษหรือตัวเลข",
    };
  }
  if (code === "auth/provider-already-linked") {
    return {
      message: "บัญชีนี้ตั้งค่ารหัสผ่านไว้แล้ว สามารถใช้เมนูเปลี่ยนรหัสผ่านได้เลย",
    };
  }
  if (code === "auth/requires-recent-login") {
    return {
      message: "เพื่อความปลอดภัย กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่ก่อนเปลี่ยนรหัสผ่าน",
    };
  }
  if (code === "auth/too-many-requests") {
    return {
      message: "พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
    };
  }
  if (code === "auth/network-request-failed") {
    return {
      message: "ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบสัญญาณแล้วลองใหม่",
    };
  }
  if (err instanceof Error && err.message && !code) {
    return { message: err.message };
  }
  return {
    message: "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง",
  };
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();
