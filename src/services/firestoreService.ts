import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  INITIAL_APPROVALS,
  INITIAL_CATEGORIES,
  INITIAL_CUSTOMERS,
  INITIAL_NOTIFICATIONS,
  INITIAL_ORDERS,
  INITIAL_PRODUCTS,
  LEGACY_DEFAULT_CATEGORIES,
} from "../data/initialData";
import { db, handleFirestoreError, OperationType } from "../firebase";
import {
  AppNotification,
  CourierName,
  Customer,
  DeliveryConfirmationMethod,
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
} as const;

const STANDARD_COURIERS: CourierName[] = [
  "Flash Express",
  "J&T Express",
  "Kerry Express",
  "ไปรษณีย์ไทย",
];

export interface WorkspaceDoc {
  uid: string;
  ownerName: string;
  roleMode: RoleMode;
  categories: string[];
  exchangeRate: number;
  freightCost: number;
  splitByQty: boolean;
  autoSave: boolean;
  seeded: boolean;
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

export async function ensureUserWorkspace(
  uid: string,
  defaultOwnerName: string
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

  // Step 1: Create parent workspace document first so workspaceExists(uid) passes for subcollections
  try {
    await setDoc(workspaceRef, {
      uid,
      ownerName: clampString(defaultOwnerName, LIMITS.OWNER_NAME_MAX, "คุณธนวัฒน์"),
      roleMode: "owner",
      categories: INITIAL_CATEGORIES.slice(0, LIMITS.CATEGORIES_COUNT_MAX),
      exchangeRate: 4.95,
      freightCost: 1250,
      splitByQty: true,
      autoSave: true,
      seeded: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, workspacePath);
  }

  // Step 2: Seed products and customers first so approval & order references satisfy exists() rules
  const productsBatch = writeBatch(db);
  for (const prod of INITIAL_PRODUCTS) {
    const id = sanitizeDocId(prod.id);
    const ref = doc(db, "users", uid, "products", id);
    productsBatch.set(ref, {
      ...buildProductPayload(uid, prod),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const cust of INITIAL_CUSTOMERS) {
    const id = sanitizeDocId(cust.id);
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

  // Step 3: Seed orders, approvals, and notifications
  const restBatch = writeBatch(db);
  for (const order of INITIAL_ORDERS) {
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

  for (const req of INITIAL_APPROVALS) {
    const id = sanitizeDocId(req.id);
    const ref = doc(db, "users", uid, "approvals", id);
    restBatch.set(ref, {
      ownerUid: uid,
      productId: sanitizeDocId(req.productId),
      productName: clampString(req.productName, LIMITS.PRODUCT_NAME_MAX),
      sku: clampString(req.sku, LIMITS.SKU_MAX),
      requestedBy: clampString(req.requestedBy, LIMITS.OWNER_NAME_MAX),
      currentStock: clampNumber(req.currentStock, 0, 1000000),
      requestedStock: clampNumber(req.requestedStock, 0, 1000000),
      reason: clampString(req.reason, LIMITS.REASON_MAX),
      createdAtLabel: clampString(req.createdAt, LIMITS.LABEL_MAX),
      status: req.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const noti of INITIAL_NOTIFICATIONS) {
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

// --- Write Operations ---

export async function updateWorkspaceSettings(
  uid: string,
  updates: Partial<{
    ownerName: string;
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

export async function createApprovalDoc(uid: string, req: StockApprovalRequest) {
  const id = sanitizeDocId(req.id);
  const path = `users/${uid}/approvals/${id}`;
  try {
    await setDoc(doc(db, "users", uid, "approvals", id), {
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
    });
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
