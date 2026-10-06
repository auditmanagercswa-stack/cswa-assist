// Platform permission catalogue. Roles are mapped to permissions in the database (seeded),
// so access can be adjusted by a super admin without code changes.
export const PERMISSIONS = {
  "admin.access": "Access the admin panel",
  "dealers.view": "View dealer profiles and KYC",
  "dealers.manage": "Verify, approve, reject, suspend and block dealers",
  "vehicles.manage": "Approve, reject, edit, suspend, feature and remove vehicles",
  "auctions.manage": "Start, stop and cancel auctions",
  "bids.view": "View all bids including bidder identities",
  "bids.manage": "Cancel bids",
  "orders.manage": "Manage orders and override workflow",
  "payments.manage": "View payments and confirm bank transfers",
  "payments.refund": "Issue refunds",
  "reports.view": "View analytics and reports",
  "disputes.manage": "Investigate and resolve disputes",
  "content.manage": "Manage CMS pages, banners and FAQs",
  "fees.manage": "Manage fee rules and subscription plans",
  "settings.manage": "Change platform settings",
  "users.manage": "Manage users and roles",
  "audit.view": "View audit logs",
  "fraud.manage": "Review fraud flags",
  "inspections.manage": "Record vehicle inspections",
  // Marketplace (non-admin) permissions
  "marketplace.buy": "Bid, make offers and buy vehicles",
  "marketplace.sell": "List and sell vehicles",
} as const;

export type Permission = keyof typeof PERMISSIONS;

const ADMIN_PERMS: Permission[] = [
  "admin.access",
  "dealers.view",
  "dealers.manage",
  "vehicles.manage",
  "auctions.manage",
  "bids.view",
  "bids.manage",
  "orders.manage",
  "payments.manage",
  "payments.refund",
  "reports.view",
  "disputes.manage",
  "content.manage",
  "audit.view",
  "fraud.manage",
  "inspections.manage",
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: Object.keys(PERMISSIONS) as Permission[],
  ADMIN: ADMIN_PERMS,
  DEALER: ["marketplace.buy", "marketplace.sell"],
  INDIVIDUAL_BUYER: ["marketplace.buy"],
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  DEALER: "Dealer",
  INDIVIDUAL_BUYER: "Individual Buyer",
};
