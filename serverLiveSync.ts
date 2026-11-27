import crypto from "crypto";
import fs from "fs/promises";
import type { Server as HttpServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "data");
const DEFAULT_ROOM_ID = "denewstock-main";
const SAFE_ROOM_REGEX = /^[a-zA-Z0-9_-]{1,48}$/;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export interface RoomDeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: "mobile" | "tablet" | "desktop";
  roleMode: "owner" | "staff";
  roomId: string;
  connectedAt: string;
  lastActiveAt: number;
  source: "live";
}

export interface LiveActivityEvent {
  id: string;
  action: string;
  summary: string;
  category:
    | "order"
    | "stock"
    | "accounting"
    | "customer"
    | "approval"
    | "cloud"
    | "system";
  deviceName: string;
  timestamp: number;
  source: "live" | "cloud";
}

interface RoomState {
  initialized: boolean;
  version: number;
  ownerName: string;
  ownerPin: string;
  ownerLineId: string;
  promptPayId: string;
  promptPayName: string;
  categories: string[];
  products: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  accountingEntries: Record<string, unknown>[];
  recentEvents: LiveActivityEvent[];
}

interface LiveClient {
  ws: WebSocket;
  isAlive: boolean;
  roomId: string;
  device: RoomDeviceInfo;
}

interface RoomContext {
  roomId: string;
  state: RoomState;
  stateDigest: string;
  clients: Map<WebSocket, LiveClient>;
  saveTimer: NodeJS.Timeout | null;
  loadedFromDisk: boolean;
}

export function sanitizeRoomId(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_ROOM_ID;
  const cleaned = raw.trim();
  if (!SAFE_ROOM_REGEX.test(cleaned)) return DEFAULT_ROOM_ID;
  return cleaned;
}

function sanitizeShortString(raw: unknown, maxLen: number, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, maxLen) : fallback;
}

function createEmptyRoomState(): RoomState {
  return {
    initialized: false,
    version: 0,
    ownerName: "คุณธนวัฒน์",
    ownerPin: "4145",
    ownerLineId: "Hnan145",
    promptPayId: "",
    promptPayName: "",
    categories: [],
    products: [],
    orders: [],
    customers: [],
    approvals: [],
    notifications: [],
    accountingEntries: [],
    recentEvents: [],
  };
}

function computeStateDigest(state: RoomState): string {
  const core = {
    ownerName: state.ownerName,
    ownerPin: state.ownerPin,
    ownerLineId: state.ownerLineId,
    promptPayId: state.promptPayId,
    promptPayName: state.promptPayName,
    categories: state.categories,
    products: state.products,
    orders: state.orders,
    customers: state.customers,
    approvals: state.approvals,
    notifications: state.notifications,
    accountingEntries: state.accountingEntries,
  };
  return crypto.createHash("sha1").update(JSON.stringify(core)).digest("hex");
}

function resolveRoomFilePath(roomId: string): string | null {
  const safeRoom = sanitizeRoomId(roomId);
  const resolved = path.resolve(DATA_DIR, `room-${safeRoom}.json`);
  if (!resolved.startsWith(DATA_DIR + path.sep)) return null;
  return resolved;
}

function coerceArray(val: unknown, maxItems = 1000): Record<string, unknown>[] {
  if (!Array.isArray(val)) return [];
  return val
    .slice(0, maxItems)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
}

function coerceStringArray(val: unknown, maxItems = 40): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .slice(0, maxItems)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((s) => s.trim().slice(0, 80));
}

function coerceRecentEvents(val: unknown): LiveActivityEvent[] {
  if (!Array.isArray(val)) return [];
  return val
    .slice(0, 25)
    .filter(
      (item): item is LiveActivityEvent =>
        Boolean(item && typeof item === "object") &&
        typeof (item as LiveActivityEvent).id === "string" &&
        typeof (item as LiveActivityEvent).summary === "string" &&
        typeof (item as LiveActivityEvent).timestamp === "number"
    );
}

function applyHydrateState(target: RoomState, incoming: Record<string, unknown>): void {
  target.ownerName = sanitizeShortString(incoming.ownerName, 80, target.ownerName);
  if (typeof incoming.ownerPin === "string" && /^\d{4}$/.test(incoming.ownerPin)) {
    target.ownerPin = incoming.ownerPin;
  }
  target.ownerLineId = sanitizeShortString(incoming.ownerLineId, 64, target.ownerLineId);
  if (typeof incoming.promptPayId === "string") {
    target.promptPayId = incoming.promptPayId.trim().slice(0, 20);
  }
  if (typeof incoming.promptPayName === "string") {
    target.promptPayName = incoming.promptPayName.trim().slice(0, 80);
  }
  const cats = coerceStringArray(incoming.categories);
  if (cats.length > 0) target.categories = cats;
  target.products = coerceArray(incoming.products, 1000);
  target.orders = coerceArray(incoming.orders, 1000);
  target.customers = coerceArray(incoming.customers, 1000);
  target.approvals = coerceArray(incoming.approvals, 500);
  target.notifications = coerceArray(incoming.notifications, 100);
  target.accountingEntries = coerceArray(incoming.accountingEntries, 2000);
  if (Array.isArray(incoming.recentEvents) && target.recentEvents.length === 0) {
    target.recentEvents = coerceRecentEvents(incoming.recentEvents);
  }
  target.initialized = true;
  target.version = Math.max(target.version + 1, 1);
}

function snapshotPublicState(state: RoomState) {
  return {
    version: state.version,
    ownerName: state.ownerName,
    ownerPin: state.ownerPin,
    ownerLineId: state.ownerLineId,
    promptPayId: state.promptPayId,
    promptPayName: state.promptPayName,
    categories: state.categories,
    products: state.products,
    orders: state.orders,
    customers: state.customers,
    approvals: state.approvals,
    notifications: state.notifications,
    accountingEntries: state.accountingEntries,
    recentEvents: state.recentEvents.slice(0, 25),
  };
}

function describeActionActivity(
  action: string,
  payload: Record<string, unknown>,
  deviceName: string,
  source: "live" | "cloud" = "live"
): LiveActivityEvent | null {
  const mk = (
    category: LiveActivityEvent["category"],
    summary: string
  ): LiveActivityEvent => ({
    id: `act-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    action,
    summary,
    category,
    deviceName,
    timestamp: Date.now(),
    source,
  });

  switch (action) {
    case "product:create": {
      const p = payload.product as Record<string, unknown> | undefined;
      return mk("stock", `เพิ่มสินค้า "${String(p?.name || "ใหม่")}" เข้าคลัง`);
    }
    case "product:update": {
      const updates = payload.updates as Record<string, unknown> | undefined;
      const name = typeof updates?.name === "string" ? updates.name : "";
      const stock = typeof updates?.stock === "number" ? ` (คงเหลือ ${updates.stock} ชิ้น)` : "";
      return mk("stock", name ? `อัปเดตสินค้า "${name}"${stock}` : `ปรับปรุงข้อมูลสต็อกสินค้า${stock}`);
    }
    case "product:delete":
      return mk("stock", "ลบรายการสินค้าออกจากคลัง");
    case "category:add":
      return mk("stock", `เพิ่มหมวดหมู่ "${String(payload.categoryName || "")}"`);
    case "category:delete":
      return mk("stock", `ลบหมวดหมู่ "${String(payload.categoryName || "")}"`);
    case "order:create": {
      const o = payload.order as Record<string, unknown> | undefined;
      const cust = String(o?.customerName || "ลูกค้า");
      const total = Number(o?.totalThb || 0).toLocaleString();
      return mk("order", `สร้างออเดอร์ใหม่ให้ ${cust} (฿${total})`);
    }
    case "order:pack":
      return mk("order", `ยืนยันแพ็คและตัดสต็อกออเดอร์ #${String(payload.orderId || "")}`);
    case "order:ready":
      return mk("order", `เปลี่ยนออเดอร์ #${String(payload.orderId || "")} เป็นรอจัดส่ง`);
    case "order:ship":
      return mk("order", `บันทึกเลขพัสดุและจัดส่งออเดอร์ #${String(payload.orderId || "")}`);
    case "order:deliver":
      return mk("order", `ยืนยันส่งมอบออเดอร์ #${String(payload.orderId || "")} สำเร็จ`);
    case "order:update_items":
      return mk("order", `อัปเดตรายการหยิบสินค้าออเดอร์ #${String(payload.orderId || "")}`);
    case "order:delete":
      return mk("order", `ลบออเดอร์ #${String(payload.orderId || "")}`);
    case "customer:create": {
      const c = payload.customer as Record<string, unknown> | undefined;
      return mk("customer", `เพิ่มข้อมูลลูกค้า "${String(c?.name || "")}"`);
    }
    case "customer:update":
      return mk("customer", "อัปเดตข้อมูลลูกค้า");
    case "customer:delete":
      return mk("customer", "ลบข้อมูลลูกค้า");
    case "approval:create": {
      const req = payload.request as Record<string, unknown> | undefined;
      return mk("approval", `ส่งคำขอปรับสต็อก "${String(req?.productName || "")}"`);
    }
    case "approval:resolve":
      return mk(
        "approval",
        payload.approve ? "เจ้าของร้านอนุมัติการปรับสต็อกแล้ว" : "เจ้าของร้านปฏิเสธคำขอปรับสต็อก"
      );
    case "accounting:create": {
      const e = payload.entry as Record<string, unknown> | undefined;
      const isInc = e?.type === "income";
      const amt = Number(e?.amountThb || 0).toLocaleString();
      return mk(
        "accounting",
        `${isInc ? "บันทึกรายรับ" : "บันทึกรายจ่าย"} "${String(e?.title || "")}" ฿${amt}`
      );
    }
    case "accounting:update":
      return mk("accounting", "แก้ไขรายการบัญชี");
    case "accounting:delete":
      return mk("accounting", "ลบรายการบัญชี");
    case "accounting:sync_orders": {
      const entries = Array.isArray(payload.entries) ? payload.entries.length : 0;
      return mk("accounting", `ดึงยอดขายจากออเดอร์เข้าบัญชี ${entries} รายการ`);
    }
    case "settings:update":
      return mk("system", "อัปเดตการตั้งค่าร้านค้า");
    default:
      return null;
  }
}

export async function attachLiveSyncServer(httpServer: HttpServer) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const rooms = new Map<string, RoomContext>();

  async function getOrCreateRoom(rawRoomId: string): Promise<RoomContext> {
    const roomId = sanitizeRoomId(rawRoomId);
    const existing = rooms.get(roomId);
    if (existing) return existing;

    const ctx: RoomContext = {
      roomId,
      state: createEmptyRoomState(),
      stateDigest: "",
      clients: new Map(),
      saveTimer: null,
      loadedFromDisk: false,
    };
    rooms.set(roomId, ctx);

    const filePath = resolveRoomFilePath(roomId);
    if (filePath) {
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<RoomState>;
        if (parsed && parsed.initialized) {
          applyHydrateState(ctx.state, parsed as Record<string, unknown>);
          if (typeof parsed.version === "number" && Number.isFinite(parsed.version)) {
            ctx.state.version = Math.max(1, Math.floor(parsed.version));
          }
          ctx.stateDigest = computeStateDigest(ctx.state);
        }
      } catch {
        // Fresh room with no saved file yet
      }
    }
    ctx.loadedFromDisk = true;
    return ctx;
  }

  function scheduleSave(ctx: RoomContext) {
    if (ctx.saveTimer) {
      clearTimeout(ctx.saveTimer);
    }
    ctx.saveTimer = setTimeout(async () => {
      ctx.saveTimer = null;
      const filePath = resolveRoomFilePath(ctx.roomId);
      if (!filePath || !ctx.state.initialized) return;
      const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
      try {
        await fs.writeFile(tmpPath, JSON.stringify(ctx.state), "utf-8");
        await fs.rename(tmpPath, filePath);
      } catch (err) {
        console.error("Failed to persist live room state:", err);
        try {
          await fs.unlink(tmpPath);
        } catch {
          // ignore cleanup failure
        }
      }
    }, 350);
  }

  function getRoomDevices(ctx: RoomContext): RoomDeviceInfo[] {
    // Deduplicate by deviceId (latest socket wins if reconnecting)
    const byId = new Map<string, RoomDeviceInfo>();
    for (const client of ctx.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        byId.set(client.device.deviceId, client.device);
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  function sendJson(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function broadcast(ctx: RoomContext, payload: unknown, excludeWs?: WebSocket) {
    const serialized = JSON.stringify(payload);
    for (const client of ctx.clients.values()) {
      if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(serialized);
      }
    }
  }

  function broadcastPresence(ctx: RoomContext) {
    broadcast(ctx, {
      type: "presence:list",
      roomId: ctx.roomId,
      devices: getRoomDevices(ctx),
    });
  }

  function applyAtomicAction(
    ctx: RoomContext,
    action: string,
    payload: Record<string, unknown>
  ): { applied: boolean; broadcastPayload?: Record<string, unknown>; broadcastAll?: boolean } {
    const s = ctx.state;
    if (!s.initialized) {
      s.initialized = true;
    }

    switch (action) {
      case "product:create": {
        const product = payload.product as Record<string, unknown> | undefined;
        if (!product || typeof product.id !== "string") return { applied: false };
        if (s.products.some((p) => p.id === product.id)) return { applied: false };
        s.products.unshift(product);
        s.version += 1;
        return { applied: true, broadcastPayload: { product } };
      }

      case "product:update": {
        const productId = payload.productId;
        const updates = payload.updates as Record<string, unknown> | undefined;
        if (typeof productId !== "string" || !updates) return { applied: false };
        let found = false;
        s.products = s.products.map((p) => {
          if (p.id === productId) {
            found = true;
            return { ...p, ...updates };
          }
          return p;
        });
        if (!found) return { applied: false };
        s.version += 1;
        return { applied: true, broadcastPayload: { productId, updates } };
      }

      case "product:delete": {
        const productId = payload.productId;
        if (typeof productId !== "string") return { applied: false };
        s.products = s.products.filter((p) => p.id !== productId);
        s.approvals = s.approvals.filter((a) => a.productId !== productId);
        s.version += 1;
        return { applied: true, broadcastPayload: { productId } };
      }

      case "category:add": {
        const categoryName = sanitizeShortString(payload.categoryName, 80, "");
        if (!categoryName || s.categories.includes(categoryName)) return { applied: false };
        s.categories = [...s.categories, categoryName].slice(0, 40);
        s.version += 1;
        return { applied: true, broadcastPayload: { categoryName } };
      }

      case "category:delete": {
        const categoryName = typeof payload.categoryName === "string" ? payload.categoryName : "";
        if (!categoryName || s.categories.length <= 1) return { applied: false };
        const remaining = s.categories.filter((c) => c !== categoryName);
        if (remaining.length === s.categories.length) return { applied: false };
        s.categories = remaining;
        const fallback = remaining[0];
        if (fallback) {
          s.products = s.products.map((p) =>
            p.category === categoryName ? { ...p, category: fallback } : p
          );
        }
        s.version += 1;
        return { applied: true, broadcastPayload: { categoryName, fallbackCategory: fallback } };
      }

      case "order:create": {
        const order = payload.order as Record<string, unknown> | undefined;
        if (!order || typeof order.id !== "string") return { applied: false };
        if (s.orders.some((o) => o.id === order.id)) return { applied: false };
        s.orders.unshift(order);

        const accEntry = payload.accountingEntry as Record<string, unknown> | undefined;
        if (
          accEntry &&
          typeof accEntry.id === "string" &&
          !s.accountingEntries.some((e) => e.id === accEntry.id)
        ) {
          s.accountingEntries.unshift(accEntry);
        }

        const noti = payload.notification as Record<string, unknown> | undefined;
        if (
          noti &&
          typeof noti.id === "string" &&
          !s.notifications.some((n) => n.id === noti.id)
        ) {
          s.notifications = [noti, ...s.notifications].slice(0, 50);
        }

        s.version += 1;
        return {
          applied: true,
          broadcastPayload: { order, accountingEntry: accEntry, notification: noti },
        };
      }

      case "order:toggle_pick": {
        const orderId = payload.orderId;
        const itemIndex = payload.itemIndex;
        if (typeof orderId !== "string" || typeof itemIndex !== "number") {
          return { applied: false };
        }
        let changed = false;
        s.orders = s.orders.map((o) => {
          if (o.id !== orderId || o.status === "shipped" || !Array.isArray(o.items)) {
            return o;
          }
          const items = (o.items as Record<string, unknown>[]).map((item, idx) => {
            if (idx === itemIndex) {
              changed = true;
              return { ...item, picked: !item.picked };
            }
            return item;
          });
          return { ...o, items };
        });
        if (!changed) return { applied: false };
        s.version += 1;
        return { applied: true, broadcastPayload: { orderId, itemIndex } };
      }

      case "order:pack": {
        // Server-authoritative atomic stock deduction prevents concurrent double-deduction
        const orderId = payload.orderId;
        if (typeof orderId !== "string") return { applied: false };
        const order = s.orders.find((o) => o.id === orderId);
        if (!order || order.status !== "pending" || !Array.isArray(order.items)) {
          return { applied: false };
        }

        const deductionsByProduct = new Map<
          string,
          { totalQty: number; byColor: Map<string, number> }
        >();
        for (const rawItem of order.items as Record<string, unknown>[]) {
          const prod = s.products.find(
            (p) => p.id === rawItem.productId || p.sku === rawItem.sku
          );
          if (!prod || typeof prod.id !== "string") continue;
          const qty = typeof rawItem.quantity === "number" ? rawItem.quantity : 0;
          const entry = deductionsByProduct.get(prod.id) ?? {
            totalQty: 0,
            byColor: new Map<string, number>(),
          };
          entry.totalQty += qty;
          if (typeof rawItem.colorName === "string" && rawItem.colorName) {
            entry.byColor.set(
              rawItem.colorName,
              (entry.byColor.get(rawItem.colorName) ?? 0) + qty
            );
          }
          deductionsByProduct.set(prod.id, entry);
        }

        const updatedProducts: Record<string, unknown>[] = [];
        s.products = s.products.map((prod) => {
          if (typeof prod.id !== "string") return prod;
          const deduction = deductionsByProduct.get(prod.id);
          if (!deduction) return prod;
          const currStock = typeof prod.stock === "number" ? prod.stock : 0;
          const nextStock = Math.max(0, currStock - deduction.totalQty);
          const updatedColors = Array.isArray(prod.colors)
            ? (prod.colors as Record<string, unknown>[]).map((c) => {
                const cName = typeof c.name === "string" ? c.name : "";
                const colorDeduct = deduction.byColor.get(cName) ?? 0;
                if (colorDeduct > 0 && typeof c.stock === "number") {
                  return { ...c, stock: Math.max(0, c.stock - colorDeduct) };
                }
                return c;
              })
            : undefined;
          const nextProd: Record<string, unknown> = {
            ...prod,
            stock: nextStock,
            ...(updatedColors ? { colors: updatedColors } : {}),
            updatedAt: "ตัดสต็อกอัตโนมัติ",
          };
          updatedProducts.push(nextProd);
          return nextProd;
        });

        const pickedItems = (order.items as Record<string, unknown>[]).map((i) => ({
          ...i,
          picked: true,
        }));
        s.orders = s.orders.map((o) =>
          o.id === orderId ? { ...o, status: "packing", items: pickedItems } : o
        );

        s.version += 1;
        return {
          applied: true,
          broadcastAll: true,
          broadcastPayload: { orderId, updatedProducts, items: pickedItems },
        };
      }

      case "order:ready_to_ship": {
        const orderId = payload.orderId;
        if (typeof orderId !== "string") return { applied: false };
        let changed = false;
        s.orders = s.orders.map((o) => {
          if (o.id === orderId && o.status === "packing") {
            changed = true;
            return { ...o, status: "ready_to_ship" };
          }
          return o;
        });
        if (!changed) return { applied: false };
        s.version += 1;
        return { applied: true, broadcastPayload: { orderId } };
      }

      case "order:ship": {
        const orderId = payload.orderId;
        const updates = payload.updates as Record<string, unknown> | undefined;
        if (typeof orderId !== "string" || !updates) return { applied: false };
        let changed = false;
        s.orders = s.orders.map((o) => {
          if (o.id === orderId && o.status === "ready_to_ship") {
            changed = true;
            return { ...o, ...updates, status: "shipped" };
          }
          return o;
        });
        if (!changed) return { applied: false };
        s.version += 1;
        return { applied: true, broadcastPayload: { orderId, updates } };
      }

      case "order:confirm_delivery": {
        const orderId = payload.orderId;
        const updates = payload.updates as Record<string, unknown> | undefined;
        if (typeof orderId !== "string" || !updates) return { applied: false };
        let changed = false;
        s.orders = s.orders.map((o) => {
          if (o.id === orderId) {
            changed = true;
            return { ...o, ...updates };
          }
          return o;
        });
        if (!changed) return { applied: false };
        s.version += 1;
        return { applied: true, broadcastPayload: { orderId, updates } };
      }

      case "order:delete": {
        const orderId = payload.orderId;
        if (typeof orderId !== "string") return { applied: false };
        s.orders = s.orders.filter((o) => o.id !== orderId);
        s.version += 1;
        return { applied: true, broadcastPayload: { orderId } };
      }

      case "approval:create": {
        const approval = payload.approval as Record<string, unknown> | undefined;
        if (!approval || typeof approval.id !== "string") return { applied: false };
        if (s.approvals.some((a) => a.id === approval.id)) return { applied: false };
        s.approvals.unshift(approval);
        const noti = payload.notification as Record<string, unknown> | undefined;
        if (
          noti &&
          typeof noti.id === "string" &&
          !s.notifications.some((n) => n.id === noti.id)
        ) {
          s.notifications = [noti, ...s.notifications].slice(0, 50);
        }
        s.version += 1;
        return { applied: true, broadcastPayload: { approval, notification: noti } };
      }

      case "approval:resolve": {
        const reqId = payload.reqId;
        const approve = Boolean(payload.approve);
        if (typeof reqId !== "string") return { applied: false };
        const target = s.approvals.find((a) => a.id === reqId);
        if (!target || target.status !== "pending") return { applied: false };

        const nextStatus = approve ? "approved" : "rejected";
        s.approvals = s.approvals.map((a) =>
          a.id === reqId ? { ...a, status: nextStatus } : a
        );

        let updatedProduct: Record<string, unknown> | undefined;
        if (approve && typeof target.productId === "string") {
          s.products = s.products.map((p) => {
            if (p.id === target.productId) {
              updatedProduct = {
                ...p,
                stock: target.requestedStock,
                updatedAt: "เมื่อสักครู่",
              };
              return updatedProduct;
            }
            return p;
          });
        }

        s.version += 1;
        return {
          applied: true,
          broadcastPayload: { reqId, approve, updatedProduct },
        };
      }

      case "approval:delete": {
        const reqId = payload.reqId;
        if (typeof reqId !== "string") return { applied: false };
        s.approvals = s.approvals.filter((a) => a.id !== reqId);
        s.version += 1;
        return { applied: true, broadcastPayload: { reqId } };
      }

      case "approval:clear": {
        s.approvals = [];
        s.version += 1;
        return { applied: true, broadcastPayload: {} };
      }

      case "customer:create": {
        const customer = payload.customer as Record<string, unknown> | undefined;
        if (!customer || typeof customer.id !== "string") return { applied: false };
        if (s.customers.some((c) => c.id === customer.id)) return { applied: false };
        s.customers.unshift(customer);
        s.version += 1;
        return { applied: true, broadcastPayload: { customer } };
      }

      case "customer:update": {
        const customerId = payload.customerId;
        const updates = payload.updates as Record<string, unknown> | undefined;
        if (typeof customerId !== "string" || !updates) return { applied: false };
        let found = false;
        s.customers = s.customers.map((c) => {
          if (c.id === customerId) {
            found = true;
            return { ...c, ...updates };
          }
          return c;
        });
        if (!found) return { applied: false };
        s.version += 1;
        return { applied: true, broadcastPayload: { customerId, updates } };
      }

      case "customer:delete": {
        const customerId = payload.customerId;
        if (typeof customerId !== "string") return { applied: false };
        s.customers = s.customers.filter((c) => c.id !== customerId);
        s.version += 1;
        return { applied: true, broadcastPayload: { customerId } };
      }

      case "customer:import": {
        const incomingCustomers = coerceArray(payload.customers, 500);
        const existingIds = new Set(s.customers.map((c) => c.id));
        const toAdd = incomingCustomers.filter(
          (c) => typeof c.id === "string" && !existingIds.has(c.id)
        );
        if (toAdd.length === 0) return { applied: false };
        s.customers = [...toAdd, ...s.customers];
        s.version += 1;
        return { applied: true, broadcastPayload: { customers: toAdd } };
      }

      case "accounting:create": {
        const entry = payload.entry as Record<string, unknown> | undefined;
        if (!entry || typeof entry.id !== "string") return { applied: false };
        if (s.accountingEntries.some((e) => e.id === entry.id)) return { applied: false };
        s.accountingEntries.unshift(entry);
        s.version += 1;
        return { applied: true, broadcastPayload: { entry } };
      }

      case "accounting:update": {
        const entryId = payload.entryId;
        const updates = payload.updates as Record<string, unknown> | undefined;
        if (typeof entryId !== "string" || !updates) return { applied: false };
        let found = false;
        s.accountingEntries = s.accountingEntries.map((e) => {
          if (e.id === entryId) {
            found = true;
            return { id: entryId, ...updates };
          }
          return e;
        });
        if (!found) return { applied: false };
        s.version += 1;
        return { applied: true, broadcastPayload: { entryId, updates } };
      }

      case "accounting:delete": {
        const entryId = payload.entryId;
        if (typeof entryId !== "string") return { applied: false };
        s.accountingEntries = s.accountingEntries.filter((e) => e.id !== entryId);
        s.version += 1;
        return { applied: true, broadcastPayload: { entryId } };
      }

      case "accounting:clear": {
        s.accountingEntries = [];
        s.version += 1;
        return { applied: true, broadcastPayload: {} };
      }

      case "accounting:sync_orders": {
        const entries = coerceArray(payload.entries, 500);
        const existingIds = new Set(s.accountingEntries.map((e) => e.id));
        const existingOrderIds = new Set(
          s.accountingEntries
            .map((e) => e.sourceOrderId)
            .filter((id): id is string => typeof id === "string")
        );
        const toAdd = entries.filter(
          (e) =>
            typeof e.id === "string" &&
            !existingIds.has(e.id) &&
            (typeof e.sourceOrderId !== "string" || !existingOrderIds.has(e.sourceOrderId))
        );
        if (toAdd.length === 0) return { applied: false };
        s.accountingEntries = [...toAdd, ...s.accountingEntries];
        s.version += 1;
        return { applied: true, broadcastPayload: { entries: toAdd } };
      }

      case "notification:create": {
        const notification = payload.notification as Record<string, unknown> | undefined;
        if (!notification || typeof notification.id !== "string") return { applied: false };
        if (s.notifications.some((n) => n.id === notification.id)) return { applied: false };
        s.notifications = [notification, ...s.notifications].slice(0, 50);
        s.version += 1;
        return { applied: true, broadcastPayload: { notification } };
      }

      case "notification:read": {
        const notiId = payload.notiId;
        if (typeof notiId !== "string") return { applied: false };
        s.notifications = s.notifications.map((n) =>
          n.id === notiId ? { ...n, read: true } : n
        );
        s.version += 1;
        return { applied: true, broadcastPayload: { notiId } };
      }

      case "notification:read_all": {
        s.notifications = s.notifications.map((n) => ({ ...n, read: true }));
        s.version += 1;
        return { applied: true, broadcastPayload: {} };
      }

      case "notification:delete": {
        const notiId = payload.notiId;
        if (typeof notiId !== "string") return { applied: false };
        s.notifications = s.notifications.filter((n) => n.id !== notiId);
        s.version += 1;
        return { applied: true, broadcastPayload: { notiId } };
      }

      case "notification:clear": {
        s.notifications = [];
        s.version += 1;
        return { applied: true, broadcastPayload: {} };
      }

      case "settings:update": {
        const updates: Record<string, unknown> = {};
        if (typeof payload.ownerName === "string" && payload.ownerName.trim()) {
          s.ownerName = payload.ownerName.trim().slice(0, 80);
          updates.ownerName = s.ownerName;
        }
        if (typeof payload.ownerPin === "string" && /^\d{4}$/.test(payload.ownerPin)) {
          s.ownerPin = payload.ownerPin;
          updates.ownerPin = s.ownerPin;
        }
        if (typeof payload.ownerLineId === "string" && payload.ownerLineId.trim()) {
          s.ownerLineId = payload.ownerLineId.trim().slice(0, 64);
          updates.ownerLineId = s.ownerLineId;
        }
        if (typeof payload.promptPayId === "string") {
          s.promptPayId = payload.promptPayId.trim().slice(0, 20);
          updates.promptPayId = s.promptPayId;
        }
        if (typeof payload.promptPayName === "string") {
          s.promptPayName = payload.promptPayName.trim().slice(0, 80);
          updates.promptPayName = s.promptPayName;
        }
        if (Object.keys(updates).length === 0) return { applied: false };
        s.version += 1;
        return { applied: true, broadcastPayload: updates };
      }

      default:
        return { applied: false };
    }
  }

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws/sync",
    maxPayload: 4 * 1024 * 1024,
  });

  wss.on("connection", async (ws, req) => {
    const reqUrl = new URL(req.url || "/ws/sync", "http://localhost");
    const roomId = sanitizeRoomId(reqUrl.searchParams.get("room"));
    const ctx = await getOrCreateRoom(roomId);

    const fallbackDeviceId = `dev-${crypto.randomBytes(6).toString("hex")}`;
    const connectedAtLabel = new Date().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const client: LiveClient = {
      ws,
      isAlive: true,
      roomId: ctx.roomId,
      device: {
        deviceId: fallbackDeviceId,
        deviceName: "อุปกรณ์เชื่อมต่อใหม่",
        deviceType: "desktop",
        roleMode: "staff",
        roomId: ctx.roomId,
        connectedAt: connectedAtLabel,
        lastActiveAt: Date.now(),
        source: "live",
      },
    };

    ctx.clients.set(ws, client);

    ws.on("pong", () => {
      client.isAlive = true;
      client.device.lastActiveAt = Date.now();
    });

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      client.isAlive = true;
      client.device.lastActiveAt = Date.now();
      const type = msg.type;

      if (type === "ping") {
        sendJson(ws, {
          type: "pong",
          clientSentAt: typeof msg.clientSentAt === "number" ? msg.clientSentAt : Date.now(),
          serverTime: Date.now(),
        });
        return;
      }

      if (type === "room:resync") {
        sendJson(ws, {
          type: "room:init",
          roomId: ctx.roomId,
          initialized: ctx.state.initialized,
          state: ctx.state.initialized ? snapshotPublicState(ctx.state) : null,
          devices: getRoomDevices(ctx),
          serverTime: Date.now(),
        });
        return;
      }

      if (type === "presence:hello") {
        if (typeof msg.deviceId === "string" && SAFE_ID_REGEX.test(msg.deviceId)) {
          client.device.deviceId = msg.deviceId;
        }
        client.device.deviceName = sanitizeShortString(
          msg.deviceName,
          80,
          client.device.deviceName
        );
        if (
          msg.deviceType === "mobile" ||
          msg.deviceType === "tablet" ||
          msg.deviceType === "desktop"
        ) {
          client.device.deviceType = msg.deviceType;
        }
        client.device.roleMode = msg.roleMode === "owner" ? "owner" : "staff";

        sendJson(ws, {
          type: "room:init",
          roomId: ctx.roomId,
          initialized: ctx.state.initialized,
          state: ctx.state.initialized ? snapshotPublicState(ctx.state) : null,
          devices: getRoomDevices(ctx),
          serverTime: Date.now(),
        });
        broadcastPresence(ctx);
        return;
      }

      if (type === "presence:update") {
        if (typeof msg.deviceName === "string" && msg.deviceName.trim()) {
          client.device.deviceName = msg.deviceName.trim().slice(0, 80);
        }
        if (msg.roleMode === "owner" || msg.roleMode === "staff") {
          client.device.roleMode = msg.roleMode;
        }
        broadcastPresence(ctx);
        return;
      }

      if (type === "room:hydrate") {
        const incomingState = msg.state as Record<string, unknown> | undefined;
        if (!incomingState || typeof incomingState !== "object") return;
        const forceCloud = Boolean(msg.forceCloud);
        if (!ctx.state.initialized || (forceCloud && ctx.state.version <= 1)) {
          applyHydrateState(ctx.state, incomingState);
          ctx.stateDigest = computeStateDigest(ctx.state);
          scheduleSave(ctx);
          broadcast(ctx, {
            type: "room:init",
            roomId: ctx.roomId,
            initialized: true,
            state: snapshotPublicState(ctx.state),
            devices: getRoomDevices(ctx),
            serverTime: Date.now(),
          });
        } else {
          // Room already has authoritative state — send it back to sender
          sendJson(ws, {
            type: "room:init",
            roomId: ctx.roomId,
            initialized: true,
            state: snapshotPublicState(ctx.state),
            devices: getRoomDevices(ctx),
            serverTime: Date.now(),
          });
        }
        return;
      }

      // Authoritative real-time push from Google Cloud Firestore listener -> broadcast to all other devices in room
      if (type === "cloud:push") {
        const incomingState = msg.state as Record<string, unknown> | undefined;
        if (!incomingState || typeof incomingState !== "object") return;

        const nextCandidate = createEmptyRoomState();
        nextCandidate.ownerName = ctx.state.ownerName;
        nextCandidate.ownerPin = ctx.state.ownerPin;
        nextCandidate.ownerLineId = ctx.state.ownerLineId;
        nextCandidate.promptPayId = ctx.state.promptPayId;
        nextCandidate.promptPayName = ctx.state.promptPayName;
        nextCandidate.categories = [...ctx.state.categories];
        applyHydrateState(nextCandidate, incomingState);

        const nextDigest = computeStateDigest(nextCandidate);
        if (ctx.state.initialized && nextDigest === ctx.stateDigest) {
          // No effective data change — prevent echo loops
          return;
        }

        const prevEvents = ctx.state.recentEvents;
        applyHydrateState(ctx.state, incomingState);
        ctx.stateDigest = nextDigest;

        const cloudEvent: LiveActivityEvent = {
          id: `act-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
          action: "cloud:push",
          summary: "ซิงก์ข้อมูลสดจาก Google Cloud Firestore สำเร็จ",
          category: "cloud",
          deviceName: client.device.deviceName,
          timestamp: Date.now(),
          source: "cloud",
        };
        ctx.state.recentEvents = [cloudEvent, ...prevEvents].slice(0, 25);
        scheduleSave(ctx);

        // Broadcast fresh authoritative state to every other connected device
        broadcast(
          ctx,
          {
            type: "room:init",
            roomId: ctx.roomId,
            initialized: true,
            fromCloudPush: true,
            state: snapshotPublicState(ctx.state),
            devices: getRoomDevices(ctx),
            serverTime: Date.now(),
          },
          ws
        );
        // Push the new live cloud activity event to all clients including sender
        broadcast(ctx, {
          type: "activity:new",
          roomId: ctx.roomId,
          event: cloudEvent,
        });
        return;
      }

      if (type === "action") {
        const action = typeof msg.action === "string" ? msg.action : "";
        const payload =
          msg.payload && typeof msg.payload === "object"
            ? (msg.payload as Record<string, unknown>)
            : {};
        const eventId =
          typeof msg.eventId === "string"
            ? msg.eventId.slice(0, 64)
            : `evt-${Date.now()}`;
        const syncedToCloud = Boolean(msg.syncedToCloud);

        const result = applyAtomicAction(ctx, action, payload);
        if (!result.applied) {
          sendJson(ws, { type: "ack", eventId, version: ctx.state.version, applied: false });
          return;
        }

        ctx.stateDigest = computeStateDigest(ctx.state);
        const activityEvent = describeActionActivity(
          action,
          result.broadcastPayload ?? payload,
          client.device.deviceName,
          syncedToCloud ? "cloud" : "live"
        );
        if (activityEvent) {
          ctx.state.recentEvents = [activityEvent, ...ctx.state.recentEvents].slice(0, 25);
        }

        scheduleSave(ctx);
        sendJson(ws, { type: "ack", eventId, version: ctx.state.version, applied: true });

        const outbound = {
          type: "action",
          roomId: ctx.roomId,
          version: ctx.state.version,
          eventId,
          action,
          payload: result.broadcastPayload ?? payload,
          senderDeviceId: client.device.deviceId,
          senderDeviceName: client.device.deviceName,
          syncedToCloud,
          activityEvent,
        };

        if (result.broadcastAll) {
          broadcast(ctx, outbound);
        } else {
          broadcast(ctx, outbound, ws);
        }

        if (activityEvent) {
          broadcast(ctx, {
            type: "activity:new",
            roomId: ctx.roomId,
            event: activityEvent,
          });
        }
      }
    });

    ws.on("close", () => {
      ctx.clients.delete(ws);
      broadcastPresence(ctx);
    });

    ws.on("error", () => {
      ctx.clients.delete(ws);
      broadcastPresence(ctx);
    });
  });

  // Periodic WebSocket heartbeat to drop stale mobile sockets cleanly
  const heartbeat = setInterval(() => {
    for (const ctx of rooms.values()) {
      let dropped = false;
      for (const [ws, client] of ctx.clients.entries()) {
        if (!client.isAlive) {
          ctx.clients.delete(ws);
          ws.terminate();
          dropped = true;
          continue;
        }
        client.isAlive = false;
        try {
          ws.ping();
        } catch {
          ctx.clients.delete(ws);
          dropped = true;
        }
      }
      if (dropped) {
        broadcastPresence(ctx);
      }
    }
  }, 25000);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  return {
    getRoomStatus: async (rawRoomId?: string) => {
      const ctx = await getOrCreateRoom(rawRoomId || DEFAULT_ROOM_ID);
      const devices = getRoomDevices(ctx);
      return {
        ok: true,
        roomId: ctx.roomId,
        initialized: ctx.state.initialized,
        version: ctx.state.version,
        onlineCount: devices.length,
        devices,
        recentEventsCount: ctx.state.recentEvents.length,
        serverTime: Date.now(),
      };
    },
  };
}
