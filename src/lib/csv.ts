import Papa from "papaparse";

export type CsvStallRow = {
  stallName: string;
  address: string;
  postalCode: string;
  lat?: number;
  lng?: number;
};

function normalizeHeader(raw: string) {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const HEADER_FIRST_CELLS = new Set([
  "postalcode",
  "postal",
  "postcode",
  "zip",
  "zipcode",
  "address",
  "stallname",
  "name",
  "stalladdress",
]);

/** Singapore postals are 6 digits; Excel often drops a leading zero (048618 → 48618). */
export function extractPostal(text: string) {
  const value = String(text ?? "");
  const six = value.match(/\b(\d{6})\b/);
  if (six) return six[1];
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4 && digits.length <= 6) return digits.padStart(6, "0");
  return "";
}

function parseCoord(value: string | undefined) {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isHeaderRow(cells: string[]) {
  return HEADER_FIRST_CELLS.has(normalizeHeader(cells[0] || ""));
}

/** Column 1 = postcode. Remaining = address, or stall name + stall address. */
export function rowFromPostalFirst(cells: string[]): CsvStallRow {
  const postal = extractPostal(cells[0] || "");
  const rest = cells.slice(1).map((c) => c.trim()).filter(Boolean);

  let lat: number | undefined;
  let lng: number | undefined;
  if (rest.length >= 2) {
    const maybeLat = parseCoord(rest[rest.length - 2]);
    const maybeLng = parseCoord(rest[rest.length - 1]);
    if (
      maybeLat != null &&
      maybeLng != null &&
      maybeLat >= 1 &&
      maybeLat <= 2 &&
      maybeLng >= 103 &&
      maybeLng <= 105
    ) {
      lat = maybeLat;
      lng = maybeLng;
      rest.splice(-2);
    }
  }

  let stallName = "";
  let address = "";
  if (rest.length >= 2) {
    stallName = rest[0];
    address = rest.slice(1).join(", ");
  } else {
    address = rest[0] || "";
    stallName = address;
  }

  return { stallName, address, postalCode: postal, lat, lng };
}

export function parseCampaignCsv(text: string): { locations: CsvStallRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    header: false,
    skipEmptyLines: "greedy",
  });
  const rows = parsed.data
    .map((row) => (Array.isArray(row) ? row : []))
    .map((row) => row.map((cell) => String(cell ?? "").replace(/^\uFEFF/, "").trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (!rows.length) {
    return { locations: [], warnings: ["CSV is empty."] };
  }

  const hasHeader = isHeaderRow(rows[0]);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const locations: CsvStallRow[] = [];
  dataRows.forEach((cells, index) => {
    const row = rowFromPostalFirst(cells);
    if (!row.address && !row.postalCode && !row.stallName) {
      warnings.push(`Row ${index + (hasHeader ? 2 : 1)} is empty.`);
      return;
    }
    if (!row.postalCode) {
      warnings.push(
        `Row ${index + (hasHeader ? 2 : 1)} has no postcode in the first column.`,
      );
    }
    locations.push(row);
  });

  return { locations, warnings };
}
