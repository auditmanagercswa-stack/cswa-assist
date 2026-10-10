import { Font } from "@react-pdf/renderer";
import fs from "node:fs";

/**
 * PDFs use Book Antiqua for headings when you provide the font file (it is a licensed Monotype face,
 * so it isn't bundled): set PDF_HEADING_FONT=/path/to/BKANT.TTF. Otherwise Times-Roman, the closest
 * built-in serif, is used. Body text is Helvetica.
 */
let registered = false;
export function headingFont(): string {
  const p = process.env.PDF_HEADING_FONT;
  if (p && fs.existsSync(p)) {
    if (!registered) { Font.register({ family: "Book Antiqua", src: p }); registered = true; }
    return "Book Antiqua";
  }
  return "Times-Roman";
}
