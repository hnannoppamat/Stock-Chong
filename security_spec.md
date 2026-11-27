# Security Specification & Payload-First TDD (`DenewStock`)

## 1. Data Invariants
1. **Master Gate & Tenant Isolation**: Every `Product`, `Order`, `StockApproval`, `AppNotification`, `Customer`, `AccountingEntry`, and `DeviceSession` exists exclusively under `/users/{userId}/...` and MUST reference `ownerUid == userId == request.auth.uid`. Single-document subcollection operations verify parent workspace existence via `exists(/databases/$(database)/documents/users/$(userId))`.
2. **Verified Identity**: All reads and writes require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Immutable Ownership & Timestamps**: `uid` / `ownerUid` and `createdAt` can never be altered after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
4. **Strict Keys & Volumetric Bounds**: All documents enforce `hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on action-based updates, `.size()` checks on every string and array, and `isValidId()` on single-document path IDs.
5. **Order State Machine & Terminal Locking**:
   - `pending` -> `packing` -> `ready_to_ship` -> `shipped`.
   - Status skipping (e.g., `pending` -> `shipped`) is denied.
   - Once `status == "shipped"` and `deliveryConfirmedAt` is recorded, further mutations are denied for non-admins.
   - `deliveryNote` is strictly bounded (`string && size() <= 500`).
6. **Approval Terminal Locking**: `StockApproval` transitions only from `pending` -> `approved` or `rejected`, and is locked thereafter for non-admins.
7. **Accounting Integrity**: `AccountingEntry` strictly validates ISO `YYYY-MM-DD` dates, enum `type` (`income` | `expense`), positive bounded `amountThb`, allowlisted payment methods, bounded text fields, and optional `receiptImageUrl` (`<= 150000` chars).
8. **Multi-Device Presence**: `DeviceSession` enforces strict enum `deviceType` (`mobile` | `tablet` | `desktop`), `roleMode` (`owner` | `staff`), bounded `deviceName` (<= 80), regex `roomId` (<= 64), and server-enforced `lastActiveAt == request.time`.
9. **Admin Protection**: `/admins/{adminId}` denies all client writes; `isAdmin()` checks verified email (`hnan.noppamat@gmail.com`) or `/admins/$(request.auth.uid)`.

## 2. The "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. **Unverified Email Write**: Creating `/users/u1` with `email_verified: false`.
2. **Cross-Tenant Read**: User `u2` attempting `get` or `list` on `/users/u1/orders` or `/users/u1/accounting`.
3. **Identity Spoofing on Create**: User `u1` creating `/users/u1/products/p1` with `ownerUid: "u2"`.
4. **Shadow Field Injection**: Creating `/users/u1/orders/o1` with extra ghost field `isAdmin: true`.
5. **ID Poisoning**: Creating `/users/u1/products/bad$$id` or a 200-char document ID.
6. **Delivery Note Overflow (Resource Exhaustion)**: Confirming delivery on `/users/u1/orders/o1` with `deliveryNote` length `501` (> 500 max).
7. **Order Status Shortcutting**: Updating `/users/u1/orders/o1` directly from `status: "pending"` to `status: "shipped"`.
8. **Terminal State Tampering**: Modifying `/users/u1/orders/o1` after `status == "shipped"` and `deliveryConfirmedAt` is already set.
9. **Client Timestamp Forgery**: Creating `/users/u1/products/p1` with `createdAt` set to a client-chosen past timestamp instead of `serverTimestamp()`.
10. **Immutable Owner Mutation**: Updating `/users/u1/accounting/acc-1` to change `ownerUid` or `createdAt`.
11. **Approval Re-Opening**: Updating `/users/u1/approvals/a1` from `status: "approved"` back to `status: "pending"`.
12. **Admin Privilege Escalation**: Non-admin user writing `/admins/u1` to grant themselves admin rights.

## 3. Red Team Audit Matrix
- **Shadow Update Test**: Blocked by `data.keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on every update action.
- **Email Spoofing Test**: Blocked by `request.auth.token.email_verified == true` inside both `isSignedIn()` and `isAdmin()`.
- **PII Blanket Test**: No blanket `isSignedIn()` reads exist; every read restricts to `isVerifiedOwner(userId)` or `isAdmin()`.
- **Query Trust Test**: Every `allow list` evaluates `existing().ownerUid == request.auth.uid` without using `get()` or `exists()`.
- **Value Poisoning Test**: Every `allow update` begins with `isValid[Entity](incoming())` validating every field type and size.
