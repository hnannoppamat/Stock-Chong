import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  INITIAL_CATEGORIES,
  LEGACY_DEFAULT_CATEGORIES,
} from "../data/initialData";
import { db, handleFirestoreError, OperationType } from "../firebase";
import {
  AccountingEntry,
  AccountingEntryType,
  AccountingPaymentMethod,
  AppNotification,
  ConnectedDevice,
  CourierName,
  Customer,
  DeliveryConfirmationMethod,
  DeviceFormFactor,
  Order,
  OrderFulfillmentType,
  OrderItem,
  ProductColorVariant,
  ProductItem,
  RoleMode,
  ShippingOption,
  StockApprovalRequest,
} from "../types";

// Constants synchronized verbatim with firebase-blueprint.json & firestore.rules
export const LIMITS = {
  OWNER_NAME_MAX: 80,
  OWNER_LINE_ID_MAX: 64,
  PROMPTPAY_ID_MAX: 20,
  PROMPTPAY_NAME_MAX: 80,
  PRODUCT_NAME_MAX: 160,
  SKU_MAX: 64,
  CATEGORY_MAX: 80,
  CATEGORIES_COUNT_MAX: 40,
  CUSTOMER_NAME_MAX: 120,
  CUSTOMER_PHONE_MAX: 40,
  CUSTOMER_LINE_MAX: 80,
  CUSTOMER_EMAIL_MAX: 120,
  CUSTOMER_ADDRESS_MAX: 400,
  CUSTOMER_NOTE_MAX: 500,
  CHANNEL_MAX: 60,
  CARRIER_NAME_MAX: 80,
  TRACKING_CODE_MAX: 64,
  DELIVERY_NOTE_MAX: 500,
  IMAGE_URL_MAX: 150000,
  LABEL_MAX: 60,
  REASON_MAX: 300,
  NOTI_TITLE_MAX: 120,
  NOTI_DETAIL_MAX: 300,
  ORDER_ITEMS_MAX: 50,
  ACC_TITLE_MAX: 200,
  ACC_REF_MAX: 64,
  ACC_NOTE_MAX: 500,
} as const;

const STANDARD_COURIERS: CourierName[] = [
  "Flash Express",
  "J&T Express",
  "Kerry Express",
  "ไปรษณีย์ไทย",
];

const ALLOWED_PAYMENT_METHODS: AccountingPaymentMethod[] = [
  "เงินสด",
  "โอนธนาคาร",
  "พร้อมเพย์",
  "บัตรเครดิต",
  "แพลตฟอร์ม (Shopee/TikTok)",
];

export interface WorkspaceDoc {
  uid: string;
  ownerName: string;
  ownerPin?: string;
  ownerLineId?: string;
  promptPayId?: string;
  promptPayName?: string;
  roleMode: RoleMode;
  categories: string[];
  exchangeRate: number;
  freightCost: number;
  splitByQty: boolean;
  autoSave: boolean;
  seeded: boolean;
}

export interface LocalSeedSnapshot {
  ownerName?: string;
  ownerPin?: string;
  ownerLineId?: string;
  promptPayId?: string;
  promptPayName?: string;
  categories?: string[];
  products?: ProductItem[];
  orders?: Order[];
  customers?: Customer[];
  approvals?: StockApprovalRequest[];
  notifications?: AppNotification[];
  accountingEntries?: AccountingEntry[];
}

function clampString(value: string, maxLen: number, fallback = "-"): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function clampNumber(value: number, minVal: number, maxVal: number): number {
  if (!Number.isFinite(value)) return minVal;
  return Math.min(maxVal, Math.max(minVal, value));
}

export function sanitizeDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  return cleaned || `id-${Date.now()}`;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as Partial<T>;
}

function sanitizeColors(colors?: ProductColorVariant[]): ProductColorVariant[] | undefined {
  if (!Array.isArray(colors) || colors.length === 0) return undefined;
  return colors.slice(0, 20).map((c) => {
    const clean: ProductColorVariant = {
      name: clampString(c.name, 40, "สีทั่วไป"),
      hex: clampString(c.hex, 16, "#18181b"),
    };
    if (typeof c.stock === "number" && Number.isFinite(c.stock)) {
      clean.stock = clampNumber(Math.round(c.stock), 0, 1000000);
    }
    if (typeof c.imageUrl === "string" && c.imageUrl.length > 0 && c.imageUrl.length <= 45000) {
      clean.imageUrl = c.imageUrl;
    }
    return clean;
  });
}

function buildProductPayload(uid: string, prod: Omit<ProductItem, "id" | "updatedAt"> & { updatedAt?: string }) {
  const payload: Record<string, unknown> = {
    ownerUid: uid,
    name: clampString(prod.name, LIMITS.PRODUCT_NAME_MAX, "สินค้าใหม่"),
    sku: clampString(prod.sku, LIMITS.SKU_MAX, `SKU-${Date.now().toString().slice(-4)}`),
    origin: prod.origin === "th" ? "th" : "cn",
    category: clampString(prod.category, LIMITS.CATEGORY_MAX, "ทั่วไป"),
    stock: clampNumber(prod.stock, 0, 1000000),
    lowThreshold: clampNumber(prod.lowThreshold, 0, 100000),
    landedCostThb: clampNumber(prod.landedCostThb, 0, 10000000),
    sellPriceThb: clampNumber(prod.sellPriceThb, 0, 10000000),
    updatedAtLabel: clampString(prod.updatedAt || "เมื่อสักครู่", LIMITS.LABEL_MAX, "เมื่อสักครู่"),
  };
  if (typeof prod.cnyUnitPrice === "number") {
    payload.cnyUnitPrice = clampNumber(prod.cnyUnitPrice, 0, 1000000);
  }
  if (typeof prod.freightPerUnitThb === "number") {
    payload.freightPerUnitThb = clampNumber(prod.freightPerUnitThb, 0, 1000000);
  }
  if (typeof prod.imageUrl === "string" && prod.imageUrl.length <= LIMITS.IMAGE_URL_MAX) {
    payload.imageUrl = prod.imageUrl;
  }
  const cleanColors = sanitizeColors(prod.colors);
  if (cleanColors && cleanColors.length > 0) {
    payload.colors = cleanColors;
  }
  return payload;
}

function sanitizeOrderItems(items: OrderItem[]): OrderItem[] {
  return items.slice(0, LIMITS.ORDER_ITEMS_MAX).map((item) => {
    const clean: OrderItem = {
      productId: sanitizeDocId(item.productId),
      name: clampString(item.name, LIMITS.PRODUCT_NAME_MAX),
      sku: clampString(item.sku, LIMITS.SKU_MAX),
      quantity: clampNumber(item.quantity, 1, 100000),
      unitPriceThb: clampNumber(item.unitPriceThb, 0, 10000000),
      picked: Boolean(item.picked),
    };
    if (typeof item.imageUrl === "string" && item.imageUrl.length <= LIMITS.IMAGE_URL_MAX) {
      clean.imageUrl = item.imageUrl;
    }
    if (typeof item.colorName === "string" && item.colorName.trim()) {
      clean.colorName = item.colorName.trim().slice(0, 40);
    }
    if (typeof item.colorHex === "string" && item.colorHex.trim()) {
      clean.colorHex = item.colorHex.trim().slice(0, 16);
    }
    return clean;
  });
}

function normalizeIsoDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildAccountingPayload(
  uid: string,
  entry: Omit<AccountingEntry, "id">
): Record<string, unknown> {
  const paymentMethod: AccountingPaymentMethod = ALLOWED_PAYMENT_METHODS.includes(
    entry.paymentMethod
  )
    ? entry.paymentMethod
    : "โอนธนาคาร";

  return stripUndefined({
    ownerUid: uid,
    date: normalizeIsoDate(entry.date),
    type: entry.type === "expense" ? "expense" : "income",
    category: clampString(entry.category, LIMITS.CATEGORY_MAX, "รายรับอื่นๆ"),
    title: clampString(entry.title, LIMITS.ACC_TITLE_MAX, "รายการบัญชี"),
    amountThb: clampNumber(entry.amountThb, 0.01, 100000000),
    paymentMethod,
    referenceCode:
      typeof entry.referenceCode === "string" && entry.referenceCode.trim()
        ? entry.referenceCode.trim().slice(0, LIMITS.ACC_REF_MAX)
        : undefined,
    note:
      typeof entry.note === "string" && entry.note.trim()
        ? entry.note.trim().slice(0, LIMITS.ACC_NOTE_MAX)
        : undefined,
    sourceOrderId:
      typeof entry.sourceOrderId === "string" && entry.sourceOrderId.trim()
        ? sanitizeDocId(entry.sourceOrderId)
        : undefined,
    receiptImageUrl:
      typeof entry.receiptImageUrl === "string" &&
      entry.receiptImageUrl.trim().length > 0 &&
      entry.receiptImageUrl.trim().length <= LIMITS.IMAGE_URL_MAX
        ? entry.receiptImageUrl.trim()
        : undefined,
  });
}

export async function ensureUserWorkspace(
  uid: string,
  defaultOwnerName: string,
  seedSnapshot?: LocalSeedSnapshot
): Promise<void> {
  const workspacePath = `users/${uid}`;
  const workspaceRef = doc(db, "users", uid);

  let snap;
  try {
    snap = await getDoc(workspaceRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, workspacePath);
  }

  if (snap.exists()) {
    const data = snap.data();
    const existingCats: string[] = Array.isArray(data?.categories)
      ? data.categories.filter((c: unknown): c is string => typeof c === "string")
      : [];
    const hasLegacyDefault = existingCats.some((c) =>
      LEGACY_DEFAULT_CATEGORIES.includes(c)
    );
    if (hasLegacyDefault || existingCats.length === 0) {
      const customCats = existingCats.filter(
        (c) =>
          !LEGACY_DEFAULT_CATEGORIES.includes(c) &&
          !INITIAL_CATEGORIES.includes(c)
      );
      const migratedCategories = [...INITIAL_CATEGORIES, ...customCats].slice(
        0,
        LIMITS.CATEGORIES_COUNT_MAX
      );
      try {
        await updateDoc(workspaceRef, {
          categories: migratedCategories,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, workspacePath);
      }
    }
    return;
  }

  const seedOwnerName = clampString(
    seedSnapshot?.ownerName || defaultOwnerName,
    LIMITS.OWNER_NAME_MAX,
    "คุณธนวัฒน์"
  );
  const seedOwnerPin =
    seedSnapshot?.ownerPin && /^\d{4}$/.test(seedSnapshot.ownerPin)
      ? seedSnapshot.ownerPin
      : "4145";
  const seedCategories =
    seedSnapshot?.categories && seedSnapshot.categories.length > 0
      ? seedSnapshot.categories
          .slice(0, LIMITS.CATEGORIES_COUNT_MAX)
          .map((c) => clampString(c, LIMITS.CATEGORY_MAX))
      : INITIAL_CATEGORIES.slice(0, LIMITS.CATEGORIES_COUNT_MAX);

  const seedPromptPayId =
    typeof seedSnapshot?.promptPayId === "string" &&
    seedSnapshot.promptPayId.trim().length > 0
      ? seedSnapshot.promptPayId.trim().slice(0, LIMITS.PROMPTPAY_ID_MAX)
      : undefined;
  const seedPromptPayName =
    typeof seedSnapshot?.promptPayName === "string" &&
    seedSnapshot.promptPayName.trim().length > 0
      ? seedSnapshot.promptPayName.trim().slice(0, LIMITS.PROMPTPAY_NAME_MAX)
      : undefined;

  // Step 1: Create parent workspace document first so workspaceExists(uid) passes for subcollections
  try {
    await setDoc(
      workspaceRef,
      stripUndefined({
        uid,
        ownerName: seedOwnerName,
        ownerPin: seedOwnerPin,
        promptPayId: seedPromptPayId,
        promptPayName: seedPromptPayName,
        roleMode: "staff",
        categories: seedCategories,
        exchangeRate: 4.95,
        freightCost: 1250,
        splitByQty: true,
        autoSave: true,
        seeded: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, workspacePath);
  }

  // Brand-new accounts start with empty store collections unless explicitly provided for this account
  const seedProducts = seedSnapshot?.products ?? [];
  const seedCustomers = seedSnapshot?.customers ?? [];
  const seedOrders = seedSnapshot?.orders ?? [];
  const seedApprovals = seedSnapshot?.approvals ?? [];
  const seedNotifications = seedSnapshot?.notifications ?? [];
  const seedAccounting = seedSnapshot?.accountingEntries ?? [];

  const seededProductIds = new Set<string>();
  const seededCustomerIds = new Set<string>();

  // Step 2: Seed products and customers first so approval & order references satisfy exists() rules
  const productsBatch = writeBatch(db);
  for (const prod of seedProducts) {
    const id = sanitizeDocId(prod.id);
    seededProductIds.add(id);
    const ref = doc(db, "users", uid, "products", id);
    productsBatch.set(ref, {
      ...buildProductPayload(uid, prod),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const cust of seedCustomers) {
    const id = sanitizeDocId(cust.id);
    seededCustomerIds.add(id);
    const ref = doc(db, "users", uid, "customers", id);
    productsBatch.set(
      ref,
      stripUndefined({
        ownerUid: uid,
        name: clampString(cust.name, LIMITS.CUSTOMER_NAME_MAX, "ลูกค้า"),
        phone: cust.phone
          ? cust.phone.trim().slice(0, LIMITS.CUSTOMER_PHONE_MAX)
          : undefined,
        lineId: cust.lineId
          ? cust.lineId.trim().slice(0, LIMITS.CUSTOMER_LINE_MAX)
          : undefined,
        email: cust.email
          ? cust.email.trim().slice(0, LIMITS.CUSTOMER_EMAIL_MAX)
          : undefined,
        address: cust.address
          ? cust.address.trim().slice(0, LIMITS.CUSTOMER_ADDRESS_MAX)
          : undefined,
        note: cust.note
          ? cust.note.trim().slice(0, LIMITS.CUSTOMER_NOTE_MAX)
          : undefined,
        createdAtLabel: clampString(cust.createdAt, LIMITS.LABEL_MAX, "วันนี้"),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  }
  try {
    await productsBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/products`);
  }

  // Step 3: Seed orders, approvals, notifications, and accounting entries
  const restBatch = writeBatch(db);
  for (const order of seedOrders) {
    const id = sanitizeDocId(order.id);
    const ref = doc(db, "users", uid, "orders", id);
    const orderDoc: Record<string, unknown> = {
      ownerUid: uid,
      customerName: clampString(order.customerName, LIMITS.CUSTOMER_NAME_MAX),
      status: order.status,
      totalThb: clampNumber(order.totalThb, 0, 10000000),
      createdAtLabel: clampString(order.createdAt, LIMITS.LABEL_MAX),
      items: sanitizeOrderItems(order.items),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (order.customerId) {
      const cleanCustId = sanitizeDocId(order.customerId);
      if (seededCustomerIds.has(cleanCustId)) {
        orderDoc.customerId = cleanCustId;
      }
    }
    if (order.channel) {
      orderDoc.channel = clampString(order.channel, LIMITS.CHANNEL_MAX);
    }
    if (order.orderType === "walk_in" || order.orderType === "delivery") {
      orderDoc.orderType = order.orderType;
    }
    if (
      order.shippingOption === "store_delivery" ||
      order.shippingOption === "carrier" ||
      order.shippingOption === "store_pickup"
    ) {
      orderDoc.shippingOption = order.shippingOption;
    }
    if (order.carrierName) {
      orderDoc.carrierName = clampString(order.carrierName, LIMITS.CARRIER_NAME_MAX);
    }
    if (order.courier) orderDoc.courier = order.courier;
    if (order.trackingCode) {
      orderDoc.trackingCode = clampString(order.trackingCode, LIMITS.TRACKING_CODE_MAX);
    }
    restBatch.set(ref, orderDoc);
  }

  for (const req of seedApprovals) {
    const cleanProdId = sanitizeDocId(req.productId);
    if (!seededProductIds.has(cleanProdId)) continue;
    const id = sanitizeDocId(req.id);
    const ref = doc(db, "users", uid, "approvals", id);
    restBatch.set(
      ref,
      stripUndefined({
        ownerUid: uid,
        productId: cleanProdId,
        productName: clampString(req.productName, LIMITS.PRODUCT_NAME_MAX),
        sku: clampString(req.sku, LIMITS.SKU_MAX),
        requestedBy: clampString(req.requestedBy, LIMITS.OWNER_NAME_MAX),
        currentStock: clampNumber(req.currentStock, 0, 1000000),
        requestedStock: clampNumber(req.requestedStock, 0, 1000000),
        reason: clampString(req.reason, LIMITS.REASON_MAX),
        createdAtLabel: clampString(req.createdAt, LIMITS.LABEL_MAX),
        status: req.status === "pending" ? "pending" : "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  }

  for (const noti of seedNotifications) {
    const id = sanitizeDocId(noti.id);
    const ref = doc(db, "users", uid, "notifications", id);
    restBatch.set(ref, {
      ownerUid: uid,
      title: clampString(noti.title, LIMITS.NOTI_TITLE_MAX),
      detail: clampString(noti.detail, LIMITS.NOTI_DETAIL_MAX),
      timeLabel: clampString(noti.time, LIMITS.LABEL_MAX),
      type: noti.type,
      read: Boolean(noti.read),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const entry of seedAccounting) {
    const id = sanitizeDocId(entry.id);
    const ref = doc(db, "users", uid, "accounting", id);
    restBatch.set(ref, {
      ...buildAccountingPayload(uid, entry),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await restBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/orders`);
  }
}

export function subscribeWorkspace(
  uid: string,
  onData: (ws: WorkspaceDoc) => void,
  onError: (err: unknown) => void
) {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as WorkspaceDoc);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

export function subscribeProducts(
  uid: string,
  onData: (products: ProductItem[]) => void,
  onError: (err: unknown) => void
) {
  const path = `users/${uid}/products`;
  const q = query(collection(db, "users", uid, "products"), where("ownerUid", "==", uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ProductItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || ""),
          sku: String(data.sku || ""),
          origin: data.origin === "th" ? "th" : "cn",
          category: String(data.category || "ทั่วไป"),
          stock: Number(data.stock || 0),
          lowThreshold: Number(data.lowThreshold || 10),
          landedCostThb: Number(data.landedCostThb || 0),
          cnyUnitPrice: typeof data.cnyUnitPrice === "number" ? data.cnyUnitPrice : undefined,
          freightPerUnitThb:
            typeof data.freightPerUnitThb === "number" ? data.freightPerUnitThb : undefined,
          sellPriceThb: Number(data.sellPriceThb || 0),
          imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
          colors: Array.isArray(data.colors)
            ? (data.colors as ProductColorVariant[])
            : undefined,
          updatedAt: String(data.updatedAtLabel || "เมื่อสักครู่"),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

export function subscribeOrders(
  uid: string,
  onData: (orders: Order[]) => void,
  onError: (err: unknown) => void
) {
  const path = `users/${uid}/orders`;
  const q = query(collection(db, "users", uid, "orders"), where("ownerUid", "==", uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Order[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const createdMillis =
            data.createdAt && typeof data.createdAt.toMillis === "function"
              ? data.createdAt.toMillis()
              : 0;
          return {
            _sort: createdMillis,
            order: {
              id: d.id,
              customerId:
                typeof data.customerId === "string" ? data.customerId : undefined,
              customerName: String(data.customerName || ""),
              channel: typeof data.channel === "string" ? data.channel : undefined,
              orderType:
                data.orderType === "walk_in" || data.orderType === "delivery"
                  ? (data.orderType as OrderFulfillmentType)
                  : undefined,
              status: data.status || "pending",
              totalThb: Number(data.totalThb || 0),
              createdAt: String(data.createdAtLabel || ""),
              createdAtMillis: createdMillis > 0 ? createdMillis : undefined,
              shippingOption:
                data.shippingOption === "store_delivery" ||
                data.shippingOption === "carrier" ||
                data.shippingOption === "store_pickup"
                  ? (data.shippingOption as ShippingOption)
                  : undefined,
              carrierName:
                typeof data.carrierName === "string" ? data.carrierName : undefined,
              courier: data.courier as CourierName | undefined,
              trackingCode: typeof data.trackingCode === "string" ? data.trackingCode : undefined,
              deliveryMethod: data.deliveryMethod as DeliveryConfirmationMethod | undefined,
              deliveryProofImage:
                typeof data.deliveryProofImage === "string" ? data.deliveryProofImage : undefined,
              cashReceivedThb:
                typeof data.cashReceivedThb === "number" ? data.cashReceivedThb : undefined,
              deliveryNote: typeof data.deliveryNote === "string" ? data.deliveryNote : undefined,
              deliveryConfirmedAt:
                typeof data.deliveryConfirmedAt === "string"
                  ? data.deliveryConfirmedAt
                  : undefined,
              items: Array.isArray(data.items) ? (data.items as OrderItem[]) : [],
            } as Order,
          };
        })
        .sort((a, b) => b._sort - a._sort)
        .map((entry) => entry.order);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

export function subscribeApprovals(
  uid: string,
  onData: (approvals: StockApprovalRequest[]) => void,
  onError: (err: unknown) => void
) {
  const path = `users/${uid}/approvals`;
  const q = query(collection(db, "users", uid, "approvals"), where("ownerUid", "==", uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: StockApprovalRequest[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          productId: String(data.productId || ""),
          productName: String(data.productName || ""),
          sku: String(data.sku || ""),
          requestedBy: String(data.requestedBy || "พนักงานหน้าร้าน"),
          currentStock: Number(data.currentStock || 0),
          requestedStock: Number(data.requestedStock || 0),
          reason: String(data.reason || ""),
          createdAt: String(data.createdAtLabel || ""),
          status: data.status || "pending",
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

export function subscribeNotifications(
  uid: string,
  onData: (notis: AppNotification[]) => void,
  onError: (err: unknown) => void
) {
  const path = `users/${uid}/notifications`;
  const q = query(collection(db, "users", uid, "notifications"), where("ownerUid", "==", uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AppNotification[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const createdMillis =
            data.createdAt && typeof data.createdAt.toMillis === "function"
              ? data.createdAt.toMillis()
              : 0;
          return {
            _sort: createdMillis,
            noti: {
              id: d.id,
              title: String(data.title || ""),
              detail: String(data.detail || ""),
              time: String(data.timeLabel || ""),
              type: data.type || "system",
              read: Boolean(data.read),
            } as AppNotification,
          };
        })
        .sort((a, b) => b._sort - a._sort)
        .map((entry) => entry.noti);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

export function subscribeCustomers(
  uid: string,
  onData: (customers: Customer[]) => void,
  onError: (err: unknown) => void
) {
  const path = `users/${uid}/customers`;
  const q = query(
    collection(db, "users", uid, "customers"),
    where("ownerUid", "==", uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Customer[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const createdMillis =
            data.createdAt && typeof data.createdAt.toMillis === "function"
              ? data.createdAt.toMillis()
              : 0;
          return {
            _sort: createdMillis,
            customer: {
              id: d.id,
              name: String(data.name || ""),
              phone:
                typeof data.phone === "string" && data.phone.trim()
                  ? data.phone
                  : undefined,
              lineId:
                typeof data.lineId === "string" && data.lineId.trim()
                  ? data.lineId
                  : undefined,
              email:
                typeof data.email === "string" && data.email.trim()
                  ? data.email
                  : undefined,
              address:
                typeof data.address === "string" && data.address.trim()
                  ? data.address
                  : undefined,
              note:
                typeof data.note === "string" && data.note.trim()
                  ? data.note
                  : undefined,
              createdAt: String(data.createdAtLabel || "วันนี้"),
            } as Customer,
          };
        })
        .sort((a, b) => b._sort - a._sort)
        .map((entry) => entry.customer);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

export function subscribeAccounting(
  uid: string,
  onData: (entries: AccountingEntry[]) => void,
  onError: (err: unknown) => void
) {
  const path = `users/${uid}/accounting`;
  const q = query(
    collection(db, "users", uid, "accounting"),
    where("ownerUid", "==", uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AccountingEntry[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const createdMillis =
            data.createdAt && typeof data.createdAt.toMillis === "function"
              ? data.createdAt.toMillis()
              : 0;
          return {
            _sort: createdMillis,
            entry: {
              id: d.id,
              date: String(data.date || normalizeIsoDate("")),
              type: (data.type === "expense"
                ? "expense"
                : "income") as AccountingEntryType,
              category: String(data.category || "รายรับอื่นๆ"),
              title: String(data.title || ""),
              amountThb: Number(data.amountThb || 0),
              paymentMethod: (ALLOWED_PAYMENT_METHODS.includes(
                data.paymentMethod as AccountingPaymentMethod
              )
                ? data.paymentMethod
                : "โอนธนาคาร") as AccountingPaymentMethod,
              referenceCode:
                typeof data.referenceCode === "string"
                  ? data.referenceCode
                  : undefined,
              note: typeof data.note === "string" ? data.note : undefined,
              sourceOrderId:
                typeof data.sourceOrderId === "string"
                  ? data.sourceOrderId
                  : undefined,
              receiptImageUrl:
                typeof data.receiptImageUrl === "string" &&
                data.receiptImageUrl.trim().length > 0
                  ? data.receiptImageUrl
                  : undefined,
            } as AccountingEntry,
          };
        })
        .sort((a, b) => b._sort - a._sort)
        .map((item) => item.entry);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

// --- Write Operations ---

export async function updateWorkspaceSettings(
  uid: string,
  updates: Partial<{
    ownerName: string;
    ownerPin: string;
    promptPayId: string;
    promptPayName: string;
    roleMode: RoleMode;
    categories: string[];
    exchangeRate: number;
    freightCost: number;
    splitByQty: boolean;
    autoSave: boolean;
  }>
) {
  const path = `users/${uid}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.ownerName !== undefined) {
    clean.ownerName = clampString(updates.ownerName, LIMITS.OWNER_NAME_MAX, "คุณธนวัฒน์");
  }
  if (updates.ownerPin !== undefined && /^\d{4}$/.test(updates.ownerPin)) {
    clean.ownerPin = updates.ownerPin;
  }
  if (updates.promptPayId !== undefined) {
    clean.promptPayId = updates.promptPayId.trim().slice(0, LIMITS.PROMPTPAY_ID_MAX);
  }
  if (updates.promptPayName !== undefined) {
    clean.promptPayName = updates.promptPayName.trim().slice(0, LIMITS.PROMPTPAY_NAME_MAX);
  }
  if (updates.roleMode !== undefined) {
    clean.roleMode = updates.roleMode === "staff" ? "staff" : "owner";
  }
  if (updates.categories !== undefined) {
    clean.categories = updates.categories
      .slice(0, LIMITS.CATEGORIES_COUNT_MAX)
      .map((c) => clampString(c, LIMITS.CATEGORY_MAX));
  }
  if (updates.exchangeRate !== undefined) {
    clean.exchangeRate = clampNumber(updates.exchangeRate, 0, 1000);
  }
  if (updates.freightCost !== undefined) {
    clean.freightCost = clampNumber(updates.freightCost, 0, 1000000);
  }
  if (updates.splitByQty !== undefined) {
    clean.splitByQty = Boolean(updates.splitByQty);
  }
  if (updates.autoSave !== undefined) {
    clean.autoSave = Boolean(updates.autoSave);
  }

  try {
    await updateDoc(doc(db, "users", uid), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createProductDoc(
  uid: string,
  productId: string,
  product: Omit<ProductItem, "id" | "updatedAt">
) {
  const id = sanitizeDocId(productId);
  const path = `users/${uid}/products/${id}`;
  try {
    await setDoc(doc(db, "users", uid, "products", id), {
      ...buildProductPayload(uid, product),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProductDoc(
  uid: string,
  productId: string,
  updates: Partial<{
    name: string;
    sku: string;
    category: string;
    stock: number;
    lowThreshold: number;
    landedCostThb: number;
    cnyUnitPrice: number;
    freightPerUnitThb: number;
    sellPriceThb: number;
    imageUrl: string;
    colors: ProductColorVariant[];
    updatedAtLabel: string;
  }>
) {
  const id = sanitizeDocId(productId);
  const path = `users/${uid}/products/${id}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) clean.name = clampString(updates.name, LIMITS.PRODUCT_NAME_MAX);
  if (updates.sku !== undefined) clean.sku = clampString(updates.sku, LIMITS.SKU_MAX);
  if (updates.category !== undefined) clean.category = clampString(updates.category, LIMITS.CATEGORY_MAX);
  if (updates.stock !== undefined) clean.stock = clampNumber(updates.stock, 0, 1000000);
  if (updates.lowThreshold !== undefined) clean.lowThreshold = clampNumber(updates.lowThreshold, 0, 100000);
  if (updates.landedCostThb !== undefined) clean.landedCostThb = clampNumber(updates.landedCostThb, 0, 10000000);
  if (updates.cnyUnitPrice !== undefined) clean.cnyUnitPrice = clampNumber(updates.cnyUnitPrice, 0, 1000000);
  if (updates.freightPerUnitThb !== undefined) clean.freightPerUnitThb = clampNumber(updates.freightPerUnitThb, 0, 1000000);
  if (updates.sellPriceThb !== undefined) clean.sellPriceThb = clampNumber(updates.sellPriceThb, 0, 10000000);
  if (updates.imageUrl !== undefined && updates.imageUrl.length <= LIMITS.IMAGE_URL_MAX) {
    clean.imageUrl = updates.imageUrl;
  }
  if (updates.colors !== undefined) {
    const cleanColors = sanitizeColors(updates.colors);
    if (cleanColors) clean.colors = cleanColors;
  }
  if (updates.updatedAtLabel !== undefined) {
    clean.updatedAtLabel = clampString(updates.updatedAtLabel, LIMITS.LABEL_MAX);
  }

  try {
    await updateDoc(doc(db, "users", uid, "products", id), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProductDoc(uid: string, productId: string) {
  const id = sanitizeDocId(productId);
  const path = `users/${uid}/products/${id}`;
  try {
    await deleteDoc(doc(db, "users", uid, "products", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createOrderDoc(uid: string, order: Order) {
  const id = sanitizeDocId(order.id);
  const path = `users/${uid}/orders/${id}`;
  const payload = stripUndefined({
    ownerUid: uid,
    customerId: order.customerId ? sanitizeDocId(order.customerId) : undefined,
    customerName: clampString(order.customerName, LIMITS.CUSTOMER_NAME_MAX),
    channel: order.channel
      ? clampString(order.channel, LIMITS.CHANNEL_MAX)
      : undefined,
    orderType:
      order.orderType === "walk_in" || order.orderType === "delivery"
        ? order.orderType
        : undefined,
    status: order.status,
    totalThb: clampNumber(order.totalThb, 0, 10000000),
    createdAtLabel: clampString(order.createdAt, LIMITS.LABEL_MAX),
    items: sanitizeOrderItems(order.items),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    await setDoc(doc(db, "users", uid, "orders", id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateOrderItemsDoc(
  uid: string,
  orderId: string,
  items: OrderItem[]
) {
  const id = sanitizeDocId(orderId);
  const path = `users/${uid}/orders/${id}`;
  try {
    await updateDoc(doc(db, "users", uid, "orders", id), {
      items: sanitizeOrderItems(items),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function packOrderDoc(
  uid: string,
  orderId: string,
  items: OrderItem[]
) {
  const id = sanitizeDocId(orderId);
  const path = `users/${uid}/orders/${id}`;
  try {
    await updateDoc(doc(db, "users", uid, "orders", id), {
      status: "packing",
      items: sanitizeOrderItems(items),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markOrderReadyToShipDoc(uid: string, orderId: string) {
  const id = sanitizeDocId(orderId);
  const path = `users/${uid}/orders/${id}`;
  try {
    await updateDoc(doc(db, "users", uid, "orders", id), {
      status: "ready_to_ship",
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function confirmOrderShipDoc(
  uid: string,
  orderId: string,
  options: {
    shippingOption: ShippingOption;
    carrierName?: string;
    courier?: CourierName;
    trackingCode?: string;
  }
) {
  const id = sanitizeDocId(orderId);
  const path = `users/${uid}/orders/${id}`;
  const payload: Record<string, unknown> = {
    status: "shipped",
    shippingOption: options.shippingOption,
    updatedAt: serverTimestamp(),
  };

  if (options.shippingOption === "carrier") {
    const cleanCarrier = clampString(
      options.carrierName || options.courier || "Flash Express",
      LIMITS.CARRIER_NAME_MAX,
      "Flash Express"
    );
    payload.carrierName = cleanCarrier;
    if (STANDARD_COURIERS.includes(cleanCarrier as CourierName)) {
      payload.courier = cleanCarrier as CourierName;
    } else if (options.courier && STANDARD_COURIERS.includes(options.courier)) {
      payload.courier = options.courier;
    }
    if (options.trackingCode && options.trackingCode.trim()) {
      payload.trackingCode = clampString(
        options.trackingCode,
        LIMITS.TRACKING_CODE_MAX
      );
    }
  } else if (options.trackingCode && options.trackingCode.trim()) {
    payload.trackingCode = clampString(
      options.trackingCode,
      LIMITS.TRACKING_CODE_MAX
    );
  }

  try {
    await updateDoc(doc(db, "users", uid, "orders", id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function confirmOrderDeliveryDoc(
  uid: string,
  payload: {
    orderId: string;
    method: DeliveryConfirmationMethod;
    proofImage?: string;
    cashReceivedThb?: number;
    note?: string;
    confirmedAt: string;
  }
) {
  const id = sanitizeDocId(payload.orderId);
  const path = `users/${uid}/orders/${id}`;
  const updatePayload: Record<string, unknown> = {
    deliveryMethod: payload.method,
    deliveryConfirmedAt: clampString(payload.confirmedAt, LIMITS.LABEL_MAX),
    updatedAt: serverTimestamp(),
  };
  if (
    typeof payload.proofImage === "string" &&
    payload.proofImage.length > 0 &&
    payload.proofImage.length <= LIMITS.IMAGE_URL_MAX
  ) {
    updatePayload.deliveryProofImage = payload.proofImage;
  }
  if (typeof payload.cashReceivedThb === "number") {
    updatePayload.cashReceivedThb = clampNumber(payload.cashReceivedThb, 0, 10000000);
  }
  if (typeof payload.note === "string" && payload.note.trim().length > 0) {
    updatePayload.deliveryNote = payload.note.trim().slice(0, LIMITS.DELIVERY_NOTE_MAX);
  }

  try {
    await updateDoc(doc(db, "users", uid, "orders", id), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteOrderDoc(uid: string, orderId: string) {
  const id = sanitizeDocId(orderId);
  const path = `users/${uid}/orders/${id}`;
  try {
    await deleteDoc(doc(db, "users", uid, "orders", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createApprovalDoc(uid: string, req: StockApprovalRequest) {
  const id = sanitizeDocId(req.id);
  const path = `users/${uid}/approvals/${id}`;
  try {
    await setDoc(
      doc(db, "users", uid, "approvals", id),
      stripUndefined({
        ownerUid: uid,
        productId: sanitizeDocId(req.productId),
        productName: clampString(req.productName, LIMITS.PRODUCT_NAME_MAX),
        sku: clampString(req.sku, LIMITS.SKU_MAX),
        requestedBy: clampString(req.requestedBy, LIMITS.OWNER_NAME_MAX),
        currentStock: clampNumber(req.currentStock, 0, 1000000),
        requestedStock: clampNumber(req.requestedStock, 0, 1000000),
        reason: clampString(req.reason, LIMITS.REASON_MAX),
        createdAtLabel: clampString(req.createdAt, LIMITS.LABEL_MAX),
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function resolveApprovalDoc(
  uid: string,
  approvalId: string,
  status: "approved" | "rejected"
) {
  const id = sanitizeDocId(approvalId);
  const path = `users/${uid}/approvals/${id}`;
  try {
    await updateDoc(doc(db, "users", uid, "approvals", id), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteApprovalDoc(uid: string, approvalId: string) {
  const id = sanitizeDocId(approvalId);
  const path = `users/${uid}/approvals/${id}`;
  try {
    await deleteDoc(doc(db, "users", uid, "approvals", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createNotificationDoc(uid: string, noti: AppNotification) {
  const id = sanitizeDocId(noti.id);
  const path = `users/${uid}/notifications/${id}`;
  try {
    await setDoc(doc(db, "users", uid, "notifications", id), {
      ownerUid: uid,
      title: clampString(noti.title, LIMITS.NOTI_TITLE_MAX),
      detail: clampString(noti.detail, LIMITS.NOTI_DETAIL_MAX),
      timeLabel: clampString(noti.time, LIMITS.LABEL_MAX),
      type: noti.type,
      read: Boolean(noti.read),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markNotificationReadDoc(uid: string, notiId: string) {
  const id = sanitizeDocId(notiId);
  const path = `users/${uid}/notifications/${id}`;
  try {
    await updateDoc(doc(db, "users", uid, "notifications", id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteNotificationDoc(uid: string, notiId: string) {
  const id = sanitizeDocId(notiId);
  const path = `users/${uid}/notifications/${id}`;
  try {
    await deleteDoc(doc(db, "users", uid, "notifications", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createCustomerDoc(
  uid: string,
  customerId: string,
  customer: Omit<Customer, "id" | "createdAt"> & { createdAt?: string }
) {
  const id = sanitizeDocId(customerId);
  const path = `users/${uid}/customers/${id}`;
  const todayLabel =
    customer.createdAt ||
    new Date().toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  const payload = stripUndefined({
    ownerUid: uid,
    name: clampString(customer.name, LIMITS.CUSTOMER_NAME_MAX, "ลูกค้าใหม่"),
    phone:
      typeof customer.phone === "string" && customer.phone.trim()
        ? customer.phone.trim().slice(0, LIMITS.CUSTOMER_PHONE_MAX)
        : undefined,
    lineId:
      typeof customer.lineId === "string" && customer.lineId.trim()
        ? customer.lineId.trim().slice(0, LIMITS.CUSTOMER_LINE_MAX)
        : undefined,
    email:
      typeof customer.email === "string" && customer.email.trim()
        ? customer.email.trim().slice(0, LIMITS.CUSTOMER_EMAIL_MAX)
        : undefined,
    address:
      typeof customer.address === "string" && customer.address.trim()
        ? customer.address.trim().slice(0, LIMITS.CUSTOMER_ADDRESS_MAX)
        : undefined,
    note:
      typeof customer.note === "string" && customer.note.trim()
        ? customer.note.trim().slice(0, LIMITS.CUSTOMER_NOTE_MAX)
        : undefined,
    createdAtLabel: clampString(todayLabel, LIMITS.LABEL_MAX, "วันนี้"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    await setDoc(doc(db, "users", uid, "customers", id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCustomerDoc(
  uid: string,
  customerId: string,
  updates: Partial<{
    name: string;
    phone: string;
    lineId: string;
    email: string;
    address: string;
    note: string;
  }>
) {
  const id = sanitizeDocId(customerId);
  const path = `users/${uid}/customers/${id}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) {
    clean.name = clampString(updates.name, LIMITS.CUSTOMER_NAME_MAX, "ลูกค้า");
  }
  if (updates.phone !== undefined) {
    clean.phone = updates.phone.trim().slice(0, LIMITS.CUSTOMER_PHONE_MAX);
  }
  if (updates.lineId !== undefined) {
    clean.lineId = updates.lineId.trim().slice(0, LIMITS.CUSTOMER_LINE_MAX);
  }
  if (updates.email !== undefined) {
    clean.email = updates.email.trim().slice(0, LIMITS.CUSTOMER_EMAIL_MAX);
  }
  if (updates.address !== undefined) {
    clean.address = updates.address.trim().slice(0, LIMITS.CUSTOMER_ADDRESS_MAX);
  }
  if (updates.note !== undefined) {
    clean.note = updates.note.trim().slice(0, LIMITS.CUSTOMER_NOTE_MAX);
  }
  try {
    await updateDoc(doc(db, "users", uid, "customers", id), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCustomerDoc(uid: string, customerId: string) {
  const id = sanitizeDocId(customerId);
  const path = `users/${uid}/customers/${id}`;
  try {
    await deleteDoc(doc(db, "users", uid, "customers", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createAccountingDoc(
  uid: string,
  entryId: string,
  entry: Omit<AccountingEntry, "id">
) {
  const id = sanitizeDocId(entryId);
  const path = `users/${uid}/accounting/${id}`;
  try {
    await setDoc(doc(db, "users", uid, "accounting", id), {
      ...buildAccountingPayload(uid, entry),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAccountingDoc(
  uid: string,
  entryId: string,
  updates: Omit<AccountingEntry, "id">
) {
  const id = sanitizeDocId(entryId);
  const path = `users/${uid}/accounting/${id}`;
  const fullPayload = buildAccountingPayload(uid, updates);
  delete fullPayload.ownerUid;
  try {
    await updateDoc(doc(db, "users", uid, "accounting", id), {
      ...fullPayload,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAccountingDoc(uid: string, entryId: string) {
  const id = sanitizeDocId(entryId);
  const path = `users/${uid}/accounting/${id}`;
  try {
    await deleteDoc(doc(db, "users", uid, "accounting", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteDocsBatch(
  uid: string,
  subcollection: "accounting" | "approvals" | "notifications",
  ids: string[]
) {
  if (ids.length === 0) return;
  const path = `users/${uid}/${subcollection}`;
  const batch = writeBatch(db);
  ids.slice(0, 400).forEach((rawId) => {
    const id = sanitizeDocId(rawId);
    batch.delete(doc(db, "users", uid, subcollection, id));
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Multi-Device Presence (Firestore) ---

export function subscribeDevices(
  uid: string,
  onData: (devices: ConnectedDevice[]) => void,
  onError: (err: unknown) => void
) {
  const path = `users/${uid}/devices`;
  const q = query(
    collection(db, "users", uid, "devices"),
    where("ownerUid", "==", uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const STALE_MS = 5 * 60 * 1000;
      const list: ConnectedDevice[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const lastActiveMs =
            data.lastActiveAt && typeof data.lastActiveAt.toMillis === "function"
              ? data.lastActiveAt.toMillis()
              : now;
          const deviceType: DeviceFormFactor =
            data.deviceType === "mobile" ||
            data.deviceType === "tablet" ||
            data.deviceType === "desktop"
              ? data.deviceType
              : "desktop";
          return {
            deviceId: d.id,
            deviceName: String(data.deviceName || "อุปกรณ์ออนไลน์"),
            deviceType,
            roleMode: (data.roleMode === "owner" ? "owner" : "staff") as RoleMode,
            roomId: typeof data.roomId === "string" ? data.roomId : "denewstock-main",
            lastActiveAt: lastActiveMs,
            source: "cloud" as const,
          };
        })
        .filter((d) => now - d.lastActiveAt <= STALE_MS)
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

const deviceUpsertQueues = new Map<string, Promise<void>>();

export async function upsertDeviceSessionDoc(
  uid: string,
  deviceId: string,
  session: {
    deviceName: string;
    deviceType: DeviceFormFactor;
    roleMode: RoleMode;
    roomId: string;
  }
) {
  const id = sanitizeDocId(deviceId);
  const queueKey = `${uid}:${id}`;
  const previous = deviceUpsertQueues.get(queueKey) ?? Promise.resolve();

  const run = previous.catch(() => undefined).then(async () => {
    const path = `users/${uid}/devices/${id}`;
    const ref = doc(db, "users", uid, "devices", id);
    const cleanName = clampString(session.deviceName, 80, "อุปกรณ์ออนไลน์");
    const cleanType: DeviceFormFactor =
      session.deviceType === "mobile" ||
      session.deviceType === "tablet" ||
      session.deviceType === "desktop"
        ? session.deviceType
        : "desktop";
    const cleanRole: RoleMode = session.roleMode === "owner" ? "owner" : "staff";
    const cleanRoom =
      sanitizeDocId(session.roomId).slice(0, 64) || "denewstock-main";

    const updateFields = {
      deviceName: cleanName,
      deviceType: cleanType,
      roleMode: cleanRole,
      roomId: cleanRoom,
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        await updateDoc(ref, updateFields);
      } else {
        try {
          await setDoc(ref, {
            ownerUid: uid,
            ...updateFields,
            createdAt: serverTimestamp(),
          });
        } catch (createErr) {
          // If another tab/session created this device doc concurrently, retry as updateDoc
          const code = (createErr as { code?: string })?.code;
          if (code === "permission-denied") {
            await updateDoc(ref, updateFields);
          } else {
            throw createErr;
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });

  deviceUpsertQueues.set(queueKey, run);
  try {
    await run;
  } finally {
    if (deviceUpsertQueues.get(queueKey) === run) {
      deviceUpsertQueues.delete(queueKey);
    }
  }
}

export async function deleteDeviceSessionDoc(uid: string, deviceId: string) {
  const id = sanitizeDocId(deviceId);
  const path = `users/${uid}/devices/${id}`;
  try {
    await deleteDoc(doc(db, "users", uid, "devices", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface FullCloudSyncSummary {
  products: number;
  customers: number;
  orders: number;
  approvals: number;
  notifications: number;
  accounting: number;
  totalSynced: number;
}

/**
 * Safely saves and synchronizes ALL local/live-room store data into Google Cloud Firestore
 * without violating immutable `createdAt`, foreign-key `exists()`, or terminal lock rules.
 */
export async function syncFullWorkspaceToCloud(
  uid: string,
  snapshot: LocalSeedSnapshot
): Promise<FullCloudSyncSummary> {
  // 1. Ensure parent workspace document exists and sync settings + categories
  await ensureUserWorkspace(
    uid,
    snapshot.ownerName || "คุณธนวัฒน์",
    snapshot
  );

  const settingsPatch: Parameters<typeof updateWorkspaceSettings>[1] = {};
  if (snapshot.ownerName && snapshot.ownerName.trim()) {
    settingsPatch.ownerName = snapshot.ownerName.trim();
  }
  if (snapshot.ownerPin && /^\d{4}$/.test(snapshot.ownerPin)) {
    settingsPatch.ownerPin = snapshot.ownerPin;
  }
  if (typeof snapshot.promptPayId === "string" && snapshot.promptPayId.trim()) {
    settingsPatch.promptPayId = snapshot.promptPayId.trim();
  }
  if (typeof snapshot.promptPayName === "string" && snapshot.promptPayName.trim()) {
    settingsPatch.promptPayName = snapshot.promptPayName.trim();
  }
  if (Array.isArray(snapshot.categories) && snapshot.categories.length > 0) {
    settingsPatch.categories = snapshot.categories;
  }
  if (Object.keys(settingsPatch).length > 0) {
    await updateWorkspaceSettings(uid, settingsPatch);
  }

  // Helper to commit batched operations cleanly in chunks of <= 350 writes
  type BatchOp = (batch: ReturnType<typeof writeBatch>) => void;
  const commitOps = async (ops: BatchOp[], pathLabel: string) => {
    const CHUNK = 350;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const batch = writeBatch(db);
      ops.slice(i, i + CHUNK).forEach((fn) => fn(batch));
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, pathLabel);
      }
    }
  };

  // 2. Read existing IDs across all subcollections so we use updateDoc for existing docs and setDoc for missing docs
  const [
    existingProductsSnap,
    existingCustomersSnap,
    existingOrdersSnap,
    existingApprovalsSnap,
    existingNotisSnap,
    existingAccountingSnap,
  ] = await Promise.all([
    getDocs(query(collection(db, "users", uid, "products"), where("ownerUid", "==", uid))),
    getDocs(query(collection(db, "users", uid, "customers"), where("ownerUid", "==", uid))),
    getDocs(query(collection(db, "users", uid, "orders"), where("ownerUid", "==", uid))),
    getDocs(query(collection(db, "users", uid, "approvals"), where("ownerUid", "==", uid))),
    getDocs(query(collection(db, "users", uid, "notifications"), where("ownerUid", "==", uid))),
    getDocs(query(collection(db, "users", uid, "accounting"), where("ownerUid", "==", uid))),
  ]);

  const existingProductIds = new Set(existingProductsSnap.docs.map((d) => d.id));
  const existingCustomerIds = new Set(existingCustomersSnap.docs.map((d) => d.id));
  const existingOrderIds = new Set(existingOrdersSnap.docs.map((d) => d.id));
  const existingApprovalStatus = new Map(
    existingApprovalsSnap.docs.map((d) => [d.id, String(d.data().status || "pending")])
  );
  const existingNotiRead = new Map(
    existingNotisSnap.docs.map((d) => [d.id, Boolean(d.data().read)])
  );
  const existingAccountingIds = new Set(existingAccountingSnap.docs.map((d) => d.id));

  const summary: FullCloudSyncSummary = {
    products: 0,
    customers: 0,
    orders: 0,
    approvals: 0,
    notifications: 0,
    accounting: 0,
    totalSynced: 0,
  };

  // 3. Stage 1: Upsert Products and Customers FIRST (required by exists() rules on orders & approvals)
  const stage1Ops: BatchOp[] = [];
  const allCloudProductIds = new Set(existingProductIds);
  const allCloudCustomerIds = new Set(existingCustomerIds);

  for (const prod of snapshot.products ?? []) {
    const id = sanitizeDocId(prod.id);
    allCloudProductIds.add(id);
    const ref = doc(db, "users", uid, "products", id);
    const fullPayload = buildProductPayload(uid, prod);
    if (existingProductIds.has(id)) {
      const updatePayload: Record<string, unknown> = { ...fullPayload };
      delete updatePayload.ownerUid;
      delete updatePayload.origin; // origin is immutable in product update allowlist
      updatePayload.updatedAt = serverTimestamp();
      stage1Ops.push((batch) => batch.update(ref, updatePayload));
    } else {
      stage1Ops.push((batch) =>
        batch.set(ref, {
          ...fullPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
    summary.products += 1;
  }

  for (const cust of snapshot.customers ?? []) {
    const id = sanitizeDocId(cust.id);
    allCloudCustomerIds.add(id);
    const ref = doc(db, "users", uid, "customers", id);
    const baseFields = stripUndefined({
      name: clampString(cust.name, LIMITS.CUSTOMER_NAME_MAX, "ลูกค้า"),
      phone:
        typeof cust.phone === "string" && cust.phone.trim()
          ? cust.phone.trim().slice(0, LIMITS.CUSTOMER_PHONE_MAX)
          : undefined,
      lineId:
        typeof cust.lineId === "string" && cust.lineId.trim()
          ? cust.lineId.trim().slice(0, LIMITS.CUSTOMER_LINE_MAX)
          : undefined,
      email:
        typeof cust.email === "string" && cust.email.trim()
          ? cust.email.trim().slice(0, LIMITS.CUSTOMER_EMAIL_MAX)
          : undefined,
      address:
        typeof cust.address === "string" && cust.address.trim()
          ? cust.address.trim().slice(0, LIMITS.CUSTOMER_ADDRESS_MAX)
          : undefined,
      note:
        typeof cust.note === "string" && cust.note.trim()
          ? cust.note.trim().slice(0, LIMITS.CUSTOMER_NOTE_MAX)
          : undefined,
    });

    if (existingCustomerIds.has(id)) {
      stage1Ops.push((batch) =>
        batch.update(ref, {
          ...baseFields,
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      stage1Ops.push((batch) =>
        batch.set(ref, {
          ownerUid: uid,
          ...baseFields,
          createdAtLabel: clampString(cust.createdAt || "วันนี้", LIMITS.LABEL_MAX, "วันนี้"),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
    summary.customers += 1;
  }

  if (stage1Ops.length > 0) {
    await commitOps(stage1Ops, `users/${uid}/products`);
  }

  // 4. Stage 2: Sync Orders, Approvals, Notifications, and Accounting Entries
  const stage2Ops: BatchOp[] = [];

  for (const order of snapshot.orders ?? []) {
    const id = sanitizeDocId(order.id);
    if (existingOrderIds.has(id)) {
      // Existing orders are kept intact to respect strict order state-machine & terminal delivery locks
      summary.orders += 1;
      continue;
    }
    if (!Array.isArray(order.items) || order.items.length === 0) continue;

    const ref = doc(db, "users", uid, "orders", id);
    const orderDoc: Record<string, unknown> = {
      ownerUid: uid,
      customerName: clampString(order.customerName, LIMITS.CUSTOMER_NAME_MAX),
      status: order.status,
      totalThb: clampNumber(order.totalThb, 0, 10000000),
      createdAtLabel: clampString(order.createdAt || "วันนี้", LIMITS.LABEL_MAX),
      items: sanitizeOrderItems(order.items),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (order.customerId) {
      const cleanCustId = sanitizeDocId(order.customerId);
      if (allCloudCustomerIds.has(cleanCustId)) {
        orderDoc.customerId = cleanCustId;
      }
    }
    if (order.channel) orderDoc.channel = clampString(order.channel, LIMITS.CHANNEL_MAX);
    if (order.orderType === "walk_in" || order.orderType === "delivery") {
      orderDoc.orderType = order.orderType;
    }
    if (
      order.shippingOption === "store_delivery" ||
      order.shippingOption === "carrier" ||
      order.shippingOption === "store_pickup"
    ) {
      orderDoc.shippingOption = order.shippingOption;
    }
    if (order.carrierName) {
      orderDoc.carrierName = clampString(order.carrierName, LIMITS.CARRIER_NAME_MAX);
    }
    if (order.courier && STANDARD_COURIERS.includes(order.courier)) {
      orderDoc.courier = order.courier;
    }
    if (order.trackingCode) {
      orderDoc.trackingCode = clampString(order.trackingCode, LIMITS.TRACKING_CODE_MAX);
    }
    if (order.deliveryMethod === "photo_proof" || order.deliveryMethod === "cash") {
      orderDoc.deliveryMethod = order.deliveryMethod;
    }
    if (
      typeof order.deliveryProofImage === "string" &&
      order.deliveryProofImage.length > 0 &&
      order.deliveryProofImage.length <= LIMITS.IMAGE_URL_MAX
    ) {
      orderDoc.deliveryProofImage = order.deliveryProofImage;
    }
    if (typeof order.cashReceivedThb === "number") {
      orderDoc.cashReceivedThb = clampNumber(order.cashReceivedThb, 0, 10000000);
    }
    if (typeof order.deliveryNote === "string" && order.deliveryNote.trim()) {
      orderDoc.deliveryNote = order.deliveryNote.trim().slice(0, LIMITS.DELIVERY_NOTE_MAX);
    }
    if (typeof order.deliveryConfirmedAt === "string" && order.deliveryConfirmedAt.trim()) {
      orderDoc.deliveryConfirmedAt = clampString(order.deliveryConfirmedAt, LIMITS.LABEL_MAX);
    }
    stage2Ops.push((batch) => batch.set(ref, orderDoc));
    summary.orders += 1;
  }

  for (const req of snapshot.approvals ?? []) {
    const id = sanitizeDocId(req.id);
    const cleanProdId = sanitizeDocId(req.productId);
    const ref = doc(db, "users", uid, "approvals", id);
    const prevStatus = existingApprovalStatus.get(id);
    if (prevStatus) {
      if (prevStatus === "pending" && (req.status === "approved" || req.status === "rejected")) {
        stage2Ops.push((batch) =>
          batch.update(ref, {
            status: req.status,
            updatedAt: serverTimestamp(),
          })
        );
      }
      summary.approvals += 1;
    } else if (req.status === "pending" && allCloudProductIds.has(cleanProdId)) {
      stage2Ops.push((batch) =>
        batch.set(
          ref,
          stripUndefined({
            ownerUid: uid,
            productId: cleanProdId,
            productName: clampString(req.productName, LIMITS.PRODUCT_NAME_MAX),
            sku: clampString(req.sku, LIMITS.SKU_MAX),
            requestedBy: clampString(req.requestedBy, LIMITS.OWNER_NAME_MAX),
            currentStock: clampNumber(req.currentStock, 0, 1000000),
            requestedStock: clampNumber(req.requestedStock, 0, 1000000),
            reason: clampString(req.reason, LIMITS.REASON_MAX),
            createdAtLabel: clampString(req.createdAt || "เมื่อสักครู่", LIMITS.LABEL_MAX),
            status: "pending",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );
      summary.approvals += 1;
    }
  }

  for (const noti of snapshot.notifications ?? []) {
    const id = sanitizeDocId(noti.id);
    const ref = doc(db, "users", uid, "notifications", id);
    if (existingNotiRead.has(id)) {
      if (!existingNotiRead.get(id) && noti.read) {
        stage2Ops.push((batch) =>
          batch.update(ref, {
            read: true,
            updatedAt: serverTimestamp(),
          })
        );
      }
      summary.notifications += 1;
    } else {
      stage2Ops.push((batch) =>
        batch.set(ref, {
          ownerUid: uid,
          title: clampString(noti.title, LIMITS.NOTI_TITLE_MAX),
          detail: clampString(noti.detail, LIMITS.NOTI_DETAIL_MAX),
          timeLabel: clampString(noti.time || "เมื่อสักครู่", LIMITS.LABEL_MAX),
          type: noti.type,
          read: Boolean(noti.read),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      summary.notifications += 1;
    }
  }

  for (const entry of snapshot.accountingEntries ?? []) {
    if (!Number.isFinite(entry.amountThb) || entry.amountThb <= 0) continue;
    const id = sanitizeDocId(entry.id);
    const ref = doc(db, "users", uid, "accounting", id);
    const payload = buildAccountingPayload(uid, entry);
    if (existingAccountingIds.has(id)) {
      const updatePayload: Record<string, unknown> = { ...payload };
      delete updatePayload.ownerUid;
      updatePayload.updatedAt = serverTimestamp();
      stage2Ops.push((batch) => batch.update(ref, updatePayload));
    } else {
      stage2Ops.push((batch) =>
        batch.set(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
    summary.accounting += 1;
  }

  if (stage2Ops.length > 0) {
    await commitOps(stage2Ops, `users/${uid}/accounting`);
  }

  summary.totalSynced =
    summary.products +
    summary.customers +
    summary.orders +
    summary.approvals +
    summary.notifications +
    summary.accounting;

  return summary;
}
