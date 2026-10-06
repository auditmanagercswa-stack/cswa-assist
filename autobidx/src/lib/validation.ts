import { z } from "zod";

// Shared (client + server) validation schemas. The server always re-validates.

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const PINCODE_RE = /^[1-9]\d{5}$/;
export const PHONE_RE = /^[6-9]\d{9}$/;
export const REG_NO_RE = /^[A-Z]{2}\s?-?\d{1,2}\s?-?[A-Z]{0,3}\s?-?\d{1,4}$/;

const trimmed = (max = 200) => z.string().trim().max(max);
const upper = (re: RegExp, msg: string) =>
  z
    .string()
    .trim()
    .transform((s) => s.toUpperCase().replace(/\s+/g, ""))
    .refine((s) => re.test(s), msg);

export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
  .refine((s) => PHONE_RE.test(s), "Enter a valid 10-digit Indian mobile number");

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128)
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), "Use letters and numbers");

export const loginSchema = z.object({
  identifier: trimmed(120).min(3, "Enter your email or mobile"),
  password: z.string().min(1, "Enter your password").max(128),
});

export const registerAccountSchema = z.object({
  name: trimmed(80).min(2, "Enter your full name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(120),
  phone: phoneSchema,
  password: passwordSchema,
});

export const BUSINESS_TYPES = ["PROPRIETORSHIP", "PARTNERSHIP", "LLP", "PRIVATE_LIMITED", "PUBLIC_LIMITED", "OTHER"] as const;

export const registerBusinessSchema = z.object({
  dealershipName: trimmed(120).min(2, "Enter the dealership name"),
  businessType: z.enum(BUSINESS_TYPES),
  gstin: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .refine((s) => s === "" || GSTIN_RE.test(s), "Enter a valid 15-character GSTIN")
    .optional()
    .default(""),
  pan: upper(PAN_RE, "Enter a valid PAN (e.g. ABCDE1234F)"),
  addressLine: trimmed(250).min(5, "Enter the business address"),
  stateId: z.string().min(1, "Select a state"),
  districtId: z.string().min(1, "Select a district"),
  cityId: z.string().optional().nullable(),
  pincode: z.string().trim().regex(PINCODE_RE, "Enter a valid 6-digit pincode"),
});

export const registerDealerSchema = registerAccountSchema.merge(registerBusinessSchema).extend({
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the Dealer Agreement and Terms" }) }),
});

export const registerIndividualSchema = registerAccountSchema.extend({
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the Terms" }) }),
});

export const KYC_DOC_TYPES = ["PAN_CARD", "GST_CERTIFICATE", "REGISTRATION_CERTIFICATE", "ADDRESS_PROOF", "CANCELLED_CHEQUE", "AUTHORIZED_ID"] as const;

export const kycSchema = z.object({
  bankAccountName: trimmed(120).min(2, "Enter the account holder name"),
  bankAccountNumber: z.string().trim().regex(/^\d{9,18}$/, "Enter a valid account number (9–18 digits)"),
  bankIfsc: upper(IFSC_RE, "Enter a valid IFSC (e.g. FDRL0001234)"),
  bankName: trimmed(80).min(2, "Enter the bank name"),
  authorizedName: trimmed(80).min(2, "Enter the authorised person's name"),
  authorizedDesignation: trimmed(80).min(2, "Enter the designation"),
  authorizedPan: upper(PAN_RE, "Enter a valid PAN"),
  authorizedPhone: phoneSchema,
  documents: z.array(z.object({ type: z.enum(KYC_DOC_TYPES), fileId: z.string().min(1) })).max(10),
  submit: z.boolean().default(false),
});

export const FUELS = ["PETROL", "DIESEL", "CNG", "LPG", "ELECTRIC", "HYBRID"] as const;
export const TRANSMISSIONS = ["MANUAL", "AUTOMATIC", "AMT", "CVT", "DCT"] as const;
export const BODY_TYPES = ["HATCHBACK", "SEDAN", "SUV", "MUV", "COUPE", "CONVERTIBLE", "PICKUP", "COMMERCIAL"] as const;
export const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR"] as const;
export const INSURANCE = ["COMPREHENSIVE", "ZERO_DEP", "THIRD_PARTY", "EXPIRED", "NONE"] as const;
export const RC_STATUS = ["ORIGINAL", "DUPLICATE", "HYPOTHECATED", "TRANSFER_PENDING"] as const;
export const SERVICE_HISTORY = ["FULL", "PARTIAL", "NONE"] as const;

const money = (label: string) => z.coerce.number({ invalid_type_error: `Enter ${label}` }).int(`${label} must be in whole rupees`).min(1000, `${label} must be at least ₹1,000`).max(500_000_000);
const optMoney = (label: string) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), money(label).nullable());
const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable());

const currentYear = new Date().getFullYear();

export const vehicleSchema = z
  .object({
    // Basic
    makeId: z.string().min(1, "Select a make"),
    modelId: z.string().min(1, "Select a model"),
    variantId: z.string().optional().nullable(),
    variantName: trimmed(80).optional().nullable(),
    year: z.coerce.number().int().min(1990, "Year looks too old").max(currentYear + 1),
    registrationYear: z.coerce.number().int().min(1990).max(currentYear + 1),
    registrationNumber: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase().replace(/\s+/g, ""))
      .refine((s) => s === "" || /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(s) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(s), "Enter a valid registration number (e.g. KL07CX1234)")
      .optional()
      .default(""),
    vin: z.string().trim().toUpperCase().max(17).refine((s) => s === "" || /^[A-HJ-NPR-Z0-9]{11,17}$/.test(s), "Enter a valid VIN/chassis number").optional().default(""),
    engineNumber: trimmed(30).optional().default(""),
    fuel: z.enum(FUELS),
    transmission: z.enum(TRANSMISSIONS),
    kmDriven: z.coerce.number().int().min(0).max(2_000_000),
    color: trimmed(40).min(2, "Enter the colour"),
    owners: z.coerce.number().int().min(1).max(10),
    insuranceStatus: z.enum(INSURANCE),
    insuranceExpiry: optDate,
    rcStatus: z.enum(RC_STATUS),
    description: trimmed(4000).optional().default(""),
    // Location
    stateId: z.string().min(1, "Select a state"),
    districtId: z.string().min(1, "Select a district"),
    cityId: z.string().optional().nullable(),
    cityName: trimmed(80).optional().nullable(),
    pincode: z.string().trim().regex(PINCODE_RE, "Enter a valid pincode"),
    // Condition
    overallCondition: z.enum(CONDITIONS),
    accidentHistory: z.coerce.boolean(),
    floodDamage: z.coerce.boolean(),
    engineCondition: z.enum(CONDITIONS),
    gearboxCondition: z.enum(CONDITIONS),
    tyreCondition: z.enum(CONDITIONS),
    batteryCondition: z.enum(CONDITIONS),
    serviceHistory: z.enum(SERVICE_HISTORY),
    // Pricing
    expectedPrice: money("Expected price"),
    reservePrice: optMoney("Reserve price"),
    minimumBid: optMoney("Minimum bid"),
    buyNowPrice: optMoney("Buy-now price"),
    sellerMargin: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).nullable()),
    buyNowEnabled: z.coerce.boolean(),
    offersEnabled: z.coerce.boolean(),
    // Auction
    auctionEnabled: z.coerce.boolean(),
    auctionStartAt: optDate,
    auctionEndAt: optDate,
    bidIncrement: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(500).max(1_000_000).nullable()),
    autoExtendSeconds: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(1800).nullable()),
    reserveVisible: z.coerce.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.registrationYear < v.year) ctx.addIssue({ code: "custom", path: ["registrationYear"], message: "Registration year can't be before manufacture year" });
    if (v.buyNowEnabled && !v.buyNowPrice) ctx.addIssue({ code: "custom", path: ["buyNowPrice"], message: "Set a Buy Now price or disable Buy Now" });
    if (v.buyNowPrice && v.buyNowPrice < v.expectedPrice * 0.5) ctx.addIssue({ code: "custom", path: ["buyNowPrice"], message: "Buy Now price looks too low" });
    if (v.auctionEnabled) {
      if (v.minimumBid && v.reservePrice && v.minimumBid > v.reservePrice) ctx.addIssue({ code: "custom", path: ["minimumBid"], message: "Minimum bid should not exceed the reserve price" });
      if (v.buyNowPrice && v.reservePrice && v.buyNowPrice <= v.reservePrice) ctx.addIssue({ code: "custom", path: ["buyNowPrice"], message: "Buy Now price should be above the reserve price" });
      if (v.auctionStartAt && v.auctionEndAt && v.auctionEndAt <= v.auctionStartAt) ctx.addIssue({ code: "custom", path: ["auctionEndAt"], message: "End time must be after start time" });
      if (v.auctionEndAt && v.auctionEndAt.getTime() < Date.now() + 30 * 60_000) ctx.addIssue({ code: "custom", path: ["auctionEndAt"], message: "Auction must end at least 30 minutes from now" });
    }
  });

export type VehicleInput = z.infer<typeof vehicleSchema>;

export const SORTS = ["newest", "price_asc", "price_desc", "km_asc", "ending_soon", "most_bids", "popular"] as const;

const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    const arr = Array.isArray(v) ? v : String(v).split(",");
    return arr.map((s) => String(s).trim()).filter((s) => (values as readonly string[]).includes(s));
  }, z.array(z.enum(values)).optional());

const optInt = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).optional());
const optBool = z.preprocess((v) => (v === "true" || v === "1" || v === true ? true : undefined), z.boolean().optional());

export const vehicleSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  variant: z.string().trim().max(80).optional(),
  priceMin: optInt,
  priceMax: optInt,
  yearMin: optInt,
  yearMax: optInt,
  kmMax: optInt,
  fuel: csv(FUELS),
  transmission: csv(TRANSMISSIONS),
  body: csv(BODY_TYPES),
  condition: csv(CONDITIONS),
  state: z.string().trim().max(60).optional(),
  district: z.string().trim().max(60).optional(),
  dealer: z.string().trim().max(80).optional(),
  auction: z.enum(["live", "upcoming", "none"]).optional(),
  buyNow: optBool,
  inspected: optBool,
  luxury: optBool,
  sort: z.enum(SORTS).optional().default("newest"),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  perPage: z.coerce.number().int().min(6).max(48).optional().default(24),
});

export type VehicleSearch = z.infer<typeof vehicleSearchSchema>;
