/** GST & TDS reference tables. Rates change by notification — keep this file current. */

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40] as const;

/** GST state codes (first two digits of a GSTIN). */
export const STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

export interface TdsSection { section: string; label: string; rate: number; rateNoPan: number; thresholdRupees: number; keywords: string[] }

/** Common TDS sections for SME payments (rates for resident payees with PAN; non-individual where it differs). */
export const TDS_SECTIONS: TdsSection[] = [
  { section: "194C", label: "Contractors (non-individual)", rate: 2, rateNoPan: 20, thresholdRupees: 30000, keywords: ["contract", "labour", "transport", "freight", "printing", "catering", "job work"] },
  { section: "194J", label: "Professional fees", rate: 10, rateNoPan: 20, thresholdRupees: 50000, keywords: ["professional", "consult", "legal", "ca fees", "audit fees", "architect", "doctor"] },
  { section: "194J(b)", label: "Technical services / royalty", rate: 2, rateNoPan: 20, thresholdRupees: 50000, keywords: ["technical", "royalty", "software development"] },
  { section: "194I(b)", label: "Rent — land, building, furniture", rate: 10, rateNoPan: 20, thresholdRupees: 600000, keywords: ["rent", "lease"] },
  { section: "194I(a)", label: "Rent — plant & machinery", rate: 2, rateNoPan: 20, thresholdRupees: 600000, keywords: ["machine hire", "equipment rent"] },
  { section: "194H", label: "Commission / brokerage", rate: 2, rateNoPan: 20, thresholdRupees: 20000, keywords: ["commission", "brokerage"] },
  { section: "194A", label: "Interest (other than securities)", rate: 10, rateNoPan: 20, thresholdRupees: 10000, keywords: ["interest"] },
  { section: "194Q", label: "Purchase of goods (turnover > ₹10 Cr)", rate: 0.1, rateNoPan: 5, thresholdRupees: 5000000, keywords: [] },
];

export const findTds = (section: string | null | undefined) => TDS_SECTIONS.find((t) => t.section === section) ?? null;
