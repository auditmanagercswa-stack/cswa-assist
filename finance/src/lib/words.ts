/** Rupees in Indian words: 125000.5 → "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only". */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`);
const three = (n: number) => (n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? " " + two(n % 100) : ""}` : two(n));

export function rupeesInWords(paise: number): string {
  const r = Math.floor(Math.abs(paise) / 100), p = Math.abs(paise) % 100;
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7), lakh = Math.floor((r % 1e7) / 1e5), thousand = Math.floor((r % 1e5) / 1e3), rest = r % 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  const words = parts.join(" ") || "Zero";
  return `Rupees ${words}${p ? ` and ${two(p)} Paise` : ""} Only`;
}
