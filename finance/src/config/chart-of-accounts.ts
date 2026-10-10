/**
 * Default Indian chart of accounts, grouped like Tally Prime's primary groups.
 * `schedule3` drives the Schedule III Balance Sheet / P&L layout for companies.
 * Edit freely — the seed and the "new company" flow both read this file.
 */
import type { LedgerKind, Nature } from "@prisma/client";

export interface GroupDef { name: string; nature: Nature; parent?: string; schedule3?: string; isDirect?: boolean }
export interface LedgerDef { name: string; group: string; kind?: LedgerKind; taxHead?: string; aliases?: string[] }

export const DEFAULT_GROUPS: GroupDef[] = [
  // Liabilities & equity
  { name: "Capital Account", nature: "LIABILITY", schedule3: "Share capital / Owners' capital" },
  { name: "Reserves & Surplus", nature: "LIABILITY", schedule3: "Reserves and surplus" },
  { name: "Loans (Liability)", nature: "LIABILITY", schedule3: "Borrowings" },
  { name: "Secured Loans", nature: "LIABILITY", parent: "Loans (Liability)", schedule3: "Long-term borrowings" },
  { name: "Unsecured Loans", nature: "LIABILITY", parent: "Loans (Liability)", schedule3: "Short-term borrowings" },
  { name: "Current Liabilities", nature: "LIABILITY", schedule3: "Other current liabilities" },
  { name: "Sundry Creditors", nature: "LIABILITY", parent: "Current Liabilities", schedule3: "Trade payables" },
  { name: "Duties & Taxes", nature: "LIABILITY", parent: "Current Liabilities", schedule3: "Other current liabilities" },
  { name: "Provisions", nature: "LIABILITY", parent: "Current Liabilities", schedule3: "Short-term provisions" },
  { name: "Suspense A/c", nature: "LIABILITY", schedule3: "Other current liabilities" },
  // Assets
  { name: "Fixed Assets", nature: "ASSET", schedule3: "Property, plant and equipment" },
  { name: "Investments", nature: "ASSET", schedule3: "Investments" },
  { name: "Current Assets", nature: "ASSET", schedule3: "Other current assets" },
  { name: "Sundry Debtors", nature: "ASSET", parent: "Current Assets", schedule3: "Trade receivables" },
  { name: "Cash-in-Hand", nature: "ASSET", parent: "Current Assets", schedule3: "Cash and cash equivalents" },
  { name: "Bank Accounts", nature: "ASSET", parent: "Current Assets", schedule3: "Cash and cash equivalents" },
  { name: "Loans & Advances (Asset)", nature: "ASSET", parent: "Current Assets", schedule3: "Short-term loans and advances" },
  { name: "Deposits (Asset)", nature: "ASSET", parent: "Current Assets", schedule3: "Other current assets" },
  { name: "Stock-in-Hand", nature: "ASSET", parent: "Current Assets", schedule3: "Inventories" },
  // Income
  { name: "Sales Accounts", nature: "INCOME", isDirect: true, schedule3: "Revenue from operations" },
  { name: "Direct Incomes", nature: "INCOME", isDirect: true, schedule3: "Revenue from operations" },
  { name: "Indirect Incomes", nature: "INCOME", schedule3: "Other income" },
  // Expenses
  { name: "Purchase Accounts", nature: "EXPENSE", isDirect: true, schedule3: "Purchases of stock-in-trade" },
  { name: "Direct Expenses", nature: "EXPENSE", isDirect: true, schedule3: "Other expenses" },
  { name: "Indirect Expenses", nature: "EXPENSE", schedule3: "Other expenses" },
  { name: "Employee Costs", nature: "EXPENSE", parent: "Indirect Expenses", schedule3: "Employee benefits expense" },
  { name: "Finance Costs", nature: "EXPENSE", parent: "Indirect Expenses", schedule3: "Finance costs" },
  { name: "Depreciation", nature: "EXPENSE", parent: "Indirect Expenses", schedule3: "Depreciation and amortisation expense" },
];

export const DEFAULT_LEDGERS: LedgerDef[] = [
  { name: "Capital Account", group: "Capital Account", aliases: ["capital", "owner's capital"] },
  { name: "Drawings", group: "Capital Account", aliases: ["drawings", "personal use"] },
  { name: "Cash", group: "Cash-in-Hand", kind: "CASH", aliases: ["cash", "petty cash"] },
  { name: "Sales", group: "Sales Accounts", aliases: ["sales", "sold", "goods sold"] },
  { name: "Sales - Services", group: "Sales Accounts", aliases: ["service income", "consulting income", "fees received"] },
  { name: "Purchases", group: "Purchase Accounts", aliases: ["purchase", "bought goods", "stock", "raw material"] },
  { name: "Freight Inward", group: "Direct Expenses", aliases: ["freight", "transport", "cartage"] },
  { name: "Salaries & Wages", group: "Employee Costs", aliases: ["salary", "salaries", "wages", "payroll"] },
  { name: "Staff Welfare", group: "Employee Costs", aliases: ["staff welfare", "tea", "snacks"] },
  { name: "Rent", group: "Indirect Expenses", aliases: ["rent", "office rent", "lease"] },
  { name: "Electricity", group: "Indirect Expenses", aliases: ["electricity", "power", "light bill", "msedcl"] },
  { name: "Telephone & Internet", group: "Indirect Expenses", aliases: ["phone", "mobile", "internet", "broadband", "jio", "airtel"] },
  { name: "Printing & Stationery", group: "Indirect Expenses", aliases: ["stationery", "printing", "paper", "toner"] },
  { name: "Office Expenses", group: "Indirect Expenses", aliases: ["office expenses", "housekeeping", "cleaning"] },
  { name: "Travelling & Conveyance", group: "Indirect Expenses", aliases: ["travel", "uber", "ola", "taxi", "fuel", "petrol", "conveyance", "flight"] },
  { name: "Professional Fees", group: "Indirect Expenses", aliases: ["professional fees", "ca fees", "legal fees", "consultant"] },
  { name: "Repairs & Maintenance", group: "Indirect Expenses", aliases: ["repair", "maintenance", "amc"] },
  { name: "Advertisement", group: "Indirect Expenses", aliases: ["advertisement", "ads", "marketing", "google ads", "facebook ads"] },
  { name: "Software Subscriptions", group: "Indirect Expenses", aliases: ["software", "subscription", "saas"] },
  { name: "Bank Charges", group: "Finance Costs", aliases: ["bank charges", "charges"] },
  { name: "Interest Paid", group: "Finance Costs", aliases: ["interest paid", "loan interest", "emi interest"] },
  { name: "Depreciation", group: "Depreciation" },
  { name: "Interest Received", group: "Indirect Incomes", aliases: ["interest received", "fd interest"] },
  { name: "Discount Received", group: "Indirect Incomes", aliases: ["discount received"] },
  { name: "Computers & Laptops", group: "Fixed Assets", aliases: ["laptop", "computer", "printer"] },
  { name: "Furniture & Fixtures", group: "Fixed Assets", aliases: ["furniture", "chair", "table"] },
  { name: "Security Deposits", group: "Deposits (Asset)", aliases: ["deposit"] },
  { name: "Unsecured Loan - Directors", group: "Unsecured Loans", aliases: ["director loan", "loan from director"] },
  { name: "Salary Payable", group: "Provisions" },
  { name: "Input CGST", group: "Duties & Taxes", kind: "TAX", taxHead: "CGST_IN" },
  { name: "Input SGST", group: "Duties & Taxes", kind: "TAX", taxHead: "SGST_IN" },
  { name: "Input IGST", group: "Duties & Taxes", kind: "TAX", taxHead: "IGST_IN" },
  { name: "Output CGST", group: "Duties & Taxes", kind: "TAX", taxHead: "CGST_OUT" },
  { name: "Output SGST", group: "Duties & Taxes", kind: "TAX", taxHead: "SGST_OUT" },
  { name: "Output IGST", group: "Duties & Taxes", kind: "TAX", taxHead: "IGST_OUT" },
  { name: "GST RCM Payable", group: "Duties & Taxes", kind: "TAX", taxHead: "RCM_PAYABLE" },
  { name: "TDS Payable", group: "Duties & Taxes", kind: "TAX", taxHead: "TDS_PAYABLE", aliases: ["tds payable"] },
  { name: "TDS Receivable", group: "Loans & Advances (Asset)", kind: "TAX", taxHead: "TDS_RECEIVABLE" },
  { name: "Professional Tax Payable", group: "Duties & Taxes", kind: "TAX", taxHead: "PT_PAYABLE" },
  { name: "PF Payable", group: "Duties & Taxes", kind: "TAX", taxHead: "PF_PAYABLE" },
  { name: "Round Off", group: "Indirect Expenses", kind: "ROUND_OFF" },
  { name: "Suspense", group: "Suspense A/c", kind: "SUSPENSE" },
];
