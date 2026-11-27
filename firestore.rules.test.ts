/**
 * Payload-First Security Rules Test Suite for StockFlow TH-CN.
 * Verifies all 12 "Dirty Dozen" adversarial payloads return PERMISSION_DENIED
 * and valid store workflows succeed under Firestore Rules Emulator.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  operation: "create" | "update" | "get" | "list" | "delete";
  path: string;
  actor: { uid: string; email: string; email_verified: boolean };
  payload?: Record<string, unknown>;
  expected: "PERMISSION_DENIED";
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: "Unverified Email Write",
    operation: "create",
    path: "/users/userA",
    actor: { uid: "userA", email: "a@example.com", email_verified: false },
    payload: {
      uid: "userA",
      ownerName: "Test Owner",
      roleMode: "owner",
      categories: ["อุปกรณ์เสริมมือถือ"],
      exchangeRate: 4.95,
      freightCost: 1250,
      splitByQty: true,
      autoSave: true,
      seeded: true,
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 2,
    name: "Cross-Tenant Order Read",
    operation: "list",
    path: "/users/userA/orders",
    actor: { uid: "userB", email: "b@example.com", email_verified: true },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 3,
    name: "Identity Spoofing on Product Create",
    operation: "create",
    path: "/users/userA/products/prod-1",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      ownerUid: "userB",
      name: "Spoofed Product",
      sku: "SKU-1",
      origin: "cn",
      category: "อุปกรณ์เสริมมือถือ",
      stock: 10,
      lowThreshold: 5,
      landedCostThb: 50,
      sellPriceThb: 120,
      updatedAtLabel: "now",
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 4,
    name: "Shadow Field Injection on Order Create",
    operation: "create",
    path: "/users/userA/orders/ORD-999",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      ownerUid: "userA",
      customerName: "Somchai",
      channel: "Shopee",
      status: "pending",
      totalThb: 299,
      createdAtLabel: "10:00",
      items: [{ productId: "p1", name: "Item", sku: "S1", quantity: 1, unitPriceThb: 299, picked: false }],
      ghostAdminFlag: true,
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 5,
    name: "Document ID Poisoning",
    operation: "create",
    path: "/users/userA/products/bad$$id$$with$$chars",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      ownerUid: "userA",
      name: "Item",
      sku: "SKU-BAD",
      origin: "cn",
      category: "Cat",
      stock: 1,
      lowThreshold: 1,
      landedCostThb: 10,
      sellPriceThb: 20,
      updatedAtLabel: "now",
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 6,
    name: "Delivery Note Volumetric Overflow (> 500 chars)",
    operation: "update",
    path: "/users/userA/orders/ORD-100",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      deliveryMethod: "photo_proof",
      deliveryNote: "A".repeat(501),
      deliveryConfirmedAt: "14:00",
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 7,
    name: "Order Status Shortcutting (pending -> shipped)",
    operation: "update",
    path: "/users/userA/orders/ORD-101",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      status: "shipped",
      courier: "Flash Express",
      trackingCode: "TH123456789A",
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 8,
    name: "Terminal State Tampering After Delivery Confirmed",
    operation: "update",
    path: "/users/userA/orders/ORD-CONFIRMED",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      status: "pending",
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 9,
    name: "Client Timestamp Forgery",
    operation: "create",
    path: "/users/userA/products/prod-2",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      ownerUid: "userA",
      name: "Backdated",
      sku: "SKU-2",
      origin: "cn",
      category: "Cat",
      stock: 5,
      lowThreshold: 2,
      landedCostThb: 20,
      sellPriceThb: 50,
      updatedAtLabel: "now",
      createdAt: "2020-01-01T00:00:00Z",
      updatedAt: "2020-01-01T00:00:00Z",
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 10,
    name: "Immutable ownerUid Mutation",
    operation: "update",
    path: "/users/userA/products/prod-1",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      ownerUid: "userB",
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 11,
    name: "Approval Terminal State Re-Opening",
    operation: "update",
    path: "/users/userA/approvals/REQ-100",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      status: "pending",
    },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 12,
    name: "Admin Privilege Escalation",
    operation: "create",
    path: "/admins/userA",
    actor: { uid: "userA", email: "a@example.com", email_verified: true },
    payload: {
      uid: "userA",
    },
    expected: "PERMISSION_DENIED",
  },
];
