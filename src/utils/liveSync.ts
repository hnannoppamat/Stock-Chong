import {
  ConnectedDevice,
  DeviceFormFactor,
  LiveActivityEvent,
  LiveStoreSnapshot,
  RoleMode,
} from "../types";

const DEVICE_ID_KEY = "denewstock_device_id_v1";
const DEVICE_NAME_KEY = "denewstock_device_name_v1";
const ROOM_ID_KEY = "denewstock_room_id_v1";
export const DEFAULT_LIVE_ROOM_ID = "denewstock-main";
const SAFE_ROOM_REGEX = /^[a-zA-Z0-9_-]{1,48}$/;

export type LiveConnectionStatus = "connected" | "connecting" | "reconnecting" | "offline";

export interface RemoteLiveAction {
  roomId: string;
  version: number;
  eventId: string;
  action: string;
  payload: Record<string, unknown>;
  senderDeviceId: string;
  senderDeviceName: string;
  syncedToCloud: boolean;
}

export function detectDeviceFormFactor(): DeviceFormFactor {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
    return "tablet";
  }
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

export function getDefaultDeviceName(type: DeviceFormFactor): string {
  if (typeof navigator === "undefined") return "อุปกรณ์ร้านค้า";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "มือถือ iPhone";
  if (/iPad/i.test(ua)) return "แท็บเล็ต iPad";
  if (/Android/i.test(ua)) {
    return type === "tablet" ? "แท็บเล็ต Android" : "มือถือ Android";
  }
  if (/Macintosh/i.test(ua)) return "คอมพิวเตอร์ Mac";
  if (/Windows/i.test(ua)) return "คอมพิวเตอร์ Windows";
  return type === "mobile"
    ? "มือถือพนักงาน"
    : type === "tablet"
      ? "แท็บเล็ตหน้าร้าน"
      : "คอมพิวเตอร์หน้าร้าน";
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]{6,64}$/.test(existing)) {
      return existing;
    }
    const created = `dev-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `dev-${Date.now().toString(36)}`;
  }
}

export function getSavedDeviceName(formFactor: DeviceFormFactor): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_NAME_KEY);
    if (existing && existing.trim()) {
      return existing.trim().slice(0, 80);
    }
  } catch {
    // ignore storage errors
  }
  return getDefaultDeviceName(formFactor);
}

export function saveDeviceName(name: string): string {
  const clean = name.trim().slice(0, 80) || "อุปกรณ์ร้านค้า";
  try {
    window.localStorage.setItem(DEVICE_NAME_KEY, clean);
  } catch {
    // ignore
  }
  return clean;
}

export function sanitizeLiveRoomId(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_LIVE_ROOM_ID;
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return SAFE_ROOM_REGEX.test(cleaned) ? cleaned : DEFAULT_LIVE_ROOM_ID;
}

export function resolveInitialRoomId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("room");
    if (fromUrl && SAFE_ROOM_REGEX.test(fromUrl.trim())) {
      const clean = fromUrl.trim();
      window.localStorage.setItem(ROOM_ID_KEY, clean);
      return clean;
    }
    const saved = window.localStorage.getItem(ROOM_ID_KEY);
    if (saved && SAFE_ROOM_REGEX.test(saved.trim())) {
      return saved.trim();
    }
  } catch {
    // ignore
  }
  return DEFAULT_LIVE_ROOM_ID;
}

export function persistRoomId(roomId: string): string {
  const clean = sanitizeLiveRoomId(roomId);
  try {
    window.localStorage.setItem(ROOM_ID_KEY, clean);
    const url = new URL(window.location.href);
    if (clean === DEFAULT_LIVE_ROOM_ID) {
      url.searchParams.delete("room");
    } else {
      url.searchParams.set("room", clean);
    }
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore
  }
  return clean;
}

export function buildAppShareUrl(): string {
  try {
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete("room");
    return url.toString();
  } catch {
    return "";
  }
}

export interface LiveSyncClientOptions {
  roomId: string;
  deviceId: string;
  deviceName: string;
  deviceType: DeviceFormFactor;
  roleMode: RoleMode;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  getHydrateSnapshot: () => Omit<LiveStoreSnapshot, "version">;
  onStatusChange: (status: LiveConnectionStatus) => void;
  onInitState: (state: LiveStoreSnapshot) => void;
  onRemoteAction: (event: RemoteLiveAction) => void;
  onPresenceChange: (devices: ConnectedDevice[]) => void;
  onActivityEvents?: (events: LiveActivityEvent[]) => void;
  onActivityEvent?: (event: LiveActivityEvent) => void;
  onLatencyChange?: (latencyMs: number | null) => void;
}

interface QueuedAction {
  type: "action";
  eventId: string;
  action: string;
  payload: Record<string, unknown>;
  syncedToCloud: boolean;
}

export class LiveSyncClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private authenticated = false;
  private forceTokenRefreshNext = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private pongTimeout: number | null = null;
  private pendingQueue: QueuedAction[] = [];
  private opts: LiveSyncClientOptions;

  constructor(opts: LiveSyncClientOptions) {
    this.opts = opts;
    this.attachLifecycleListeners();
    this.connect();
  }

  private handleOnline = () => {
    if (this.closed) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.reconnectAttempts = 0;
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.connect();
    } else {
      this.requestResync();
      this.sendPing();
    }
  };

  private handleVisibilityChange = () => {
    if (this.closed || document.visibilityState !== "visible") return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.reconnectAttempts = 0;
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.connect();
    } else {
      // Immediately resync & verify socket health when user returns to tab
      this.requestResync();
      this.sendPing();
    }
  };

  private attachLifecycleListeners() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private detachLifecycleListeners() {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange
      );
    }
  }

  private clearPingTimers() {
    if (this.pingInterval !== null) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout !== null) {
      window.clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private sendPing() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const sentAt = Date.now();
    try {
      this.ws.send(JSON.stringify({ type: "ping", clientSentAt: sentAt }));
    } catch {
      return;
    }
    if (this.pongTimeout !== null) {
      window.clearTimeout(this.pongTimeout);
    }
    this.pongTimeout = window.setTimeout(() => {
      // Stale half-open socket — force immediate reconnect
      this.pongTimeout = null;
      this.opts.onLatencyChange?.(null);
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          // ignore
        }
      }
    }, 5500);
  }

  private startPingLoop() {
    this.clearPingTimers();
    this.sendPing();
    this.pingInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        this.sendPing();
      }
    }, 15_000);
  }

  private buildWsUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/sync`;
  }

  private connect() {
    if (this.closed) return;
    this.clearPingTimers();
    this.authenticated = false;
    this.opts.onStatusChange(
      this.reconnectAttempts === 0 ? "connecting" : "reconnecting"
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.buildWsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.onopen = async () => {
      if (this.closed) {
        ws.close();
        return;
      }

      const forceRefresh = this.forceTokenRefreshNext;
      this.forceTokenRefreshNext = false;
      const idToken = await this.opts.getIdToken(forceRefresh).catch(() => null);
      if (this.closed || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      if (!idToken) {
        ws.close(4401, "No auth token");
        return;
      }

      ws.send(
        JSON.stringify({
          type: "presence:hello",
          idToken,
          deviceId: this.opts.deviceId,
          deviceName: this.opts.deviceName,
          deviceType: this.opts.deviceType,
          roleMode: this.opts.roleMode,
        })
      );
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }

      if (msg.type === "auth:error") {
        this.authenticated = false;
        this.forceTokenRefreshNext = true;
        return;
      }

      if (msg.type === "pong") {
        if (this.pongTimeout !== null) {
          window.clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }
        if (typeof msg.clientSentAt === "number") {
          const rtt = Math.max(1, Date.now() - msg.clientSentAt);
          this.opts.onLatencyChange?.(rtt);
        }
        return;
      }

      if (msg.type === "room:init") {
        if (!this.authenticated) {
          this.authenticated = true;
          this.reconnectAttempts = 0;
          this.opts.onStatusChange("connected");
          this.startPingLoop();
          if (this.pendingQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
            const queued = [...this.pendingQueue];
            this.pendingQueue = [];
            for (const item of queued) {
              ws.send(JSON.stringify(item));
            }
          }
        }
        if (Array.isArray(msg.devices)) {
          this.opts.onPresenceChange(msg.devices as ConnectedDevice[]);
        }
        if (msg.initialized && msg.state && typeof msg.state === "object") {
          const snapshot = msg.state as LiveStoreSnapshot;
          if (Array.isArray(snapshot.recentEvents)) {
            this.opts.onActivityEvents?.(snapshot.recentEvents);
          }
          this.opts.onInitState(snapshot);
        }
        return;
      }

      if (msg.type === "presence:list") {
        if (Array.isArray(msg.devices)) {
          this.opts.onPresenceChange(msg.devices as ConnectedDevice[]);
        }
        return;
      }

      if (msg.type === "activity:new") {
        if (msg.event && typeof msg.event === "object") {
          this.opts.onActivityEvent?.(msg.event as LiveActivityEvent);
        }
        return;
      }

      if (msg.type === "action") {
        this.opts.onRemoteAction({
          roomId: String(msg.roomId || this.opts.roomId),
          version: Number(msg.version || 0),
          eventId: String(msg.eventId || ""),
          action: String(msg.action || ""),
          payload:
            msg.payload && typeof msg.payload === "object"
              ? (msg.payload as Record<string, unknown>)
              : {},
          senderDeviceId: String(msg.senderDeviceId || ""),
          senderDeviceName: String(msg.senderDeviceName || "เครื่องอื่น"),
          syncedToCloud: Boolean(msg.syncedToCloud),
        });
      }
    };

    ws.onclose = (ev) => {
      if (this.closed) return;
      this.authenticated = false;
      this.clearPingTimers();
      this.opts.onLatencyChange?.(null);
      this.ws = null;
      if (ev.code === 4401) {
        this.forceTokenRefreshNext = true;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will trigger reconnect
    };
  }

  private scheduleReconnect() {
    if (this.closed) return;
    this.reconnectAttempts += 1;
    const delayMs = Math.min(10000, 1000 * Math.pow(1.7, this.reconnectAttempts - 1));
    this.opts.onStatusChange(
      this.reconnectAttempts > 4 ? "offline" : "reconnecting"
    );
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  public updatePresence(updates: { deviceName?: string; roleMode?: RoleMode }) {
    if (updates.deviceName !== undefined) {
      this.opts.deviceName = updates.deviceName;
    }
    if (updates.roleMode !== undefined) {
      this.opts.roleMode = updates.roleMode;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "presence:update",
          deviceName: this.opts.deviceName,
          roleMode: this.opts.roleMode,
        })
      );
    }
  }

  public hydrateRoom(
    snapshot: Omit<LiveStoreSnapshot, "version">,
    forceCloud = false
  ) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "room:hydrate",
          state: snapshot,
          forceCloud,
        })
      );
    }
  }

  public pushCloudSnapshot(snapshot: Omit<LiveStoreSnapshot, "version">) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "cloud:push",
          state: snapshot,
        })
      );
    }
  }

  public requestResync() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "room:resync" }));
    } else if (!this.closed) {
      this.reconnectAttempts = 0;
      this.connect();
    }
  }

  public sendAction(
    action: string,
    payload: Record<string, unknown>,
    syncedToCloud = false
  ): string {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const packet: QueuedAction = {
      type: "action",
      eventId,
      action,
      payload,
      syncedToCloud,
    };

    if (this.authenticated && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    } else {
      this.pendingQueue = [...this.pendingQueue.slice(-49), packet];
    }
    return eventId;
  }

  public destroy() {
    this.closed = true;
    this.detachLifecycleListeners();
    this.clearPingTimers();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
