/**
 * Official VIT On-Duty (OD) time slots and aggregations matching the college OD format.
 * Reference: "OD FORMAT - Final.xlsx" and university scheduling guidelines.
 */

export type VitOdSlot = {
  id: string;
  code: string;
  header: string;
  label: string;
};

export const VIT_OD_SLOTS: readonly VitOdSlot[] = [
  {
    id: "slot_1",
    code: "8:00 AM - 9:40 AM",
    header: "8:00 PM TO 9:40 AM", // Exactly matches header text in OD FORMAT - Final.xlsx
    label: "Slot 1 (8:00 AM – 9:40 AM)",
  },
  {
    id: "slot_2",
    code: "9:50 AM - 11:30 AM",
    header: "09:50  AM TO 11:30 AM", // Double space matches OD FORMAT - Final.xlsx
    label: "Slot 2 (9:50 AM – 11:30 AM)",
  },
  {
    id: "slot_3",
    code: "11:40 AM - 1:30 PM",
    header: "11:40 AM TO 1:30 PM",
    label: "Slot 3 (11:40 AM – 1:30 PM)",
  },
  {
    id: "slot_4",
    code: "2:00 PM - 3:40 PM",
    header: "2:00 PM TO 3:40 PM",
    label: "Slot 4 (2:00 PM – 3:40 PM)",
  },
  {
    id: "slot_5",
    code: "3:55 PM - 5:30 PM",
    header: "3:55 PM TO 5:30 PM",
    label: "Slot 5 (3:55 PM – 5:30 PM)",
  },
  {
    id: "slot_6",
    code: "5:30 PM - 7:30 PM",
    header: "5:30 PM TO 7:30 PM",
    label: "Slot 6 (5:30 PM – 7:30 PM)",
  },
] as const;

export const OD_AGGREGATES = {
  HALF_DAY_1: {
    key: "HALF_DAY_1",
    header: "HALF DAY\r\n8:00 AM TO 1:30 PM",
    label: "Half Day Morning (8:00 AM – 1:30 PM)",
    slots: ["slot_1", "slot_2", "slot_3"],
  },
  HALF_DAY_2: {
    key: "HALF_DAY_2",
    header: "HALF DAY\r\n2:00 AM TO 7:30 PM", // Exact typo match from template
    label: "Half Day Afternoon (2:00 PM – 7:30 PM)",
    slots: ["slot_4", "slot_5", "slot_6"],
  },
  FULL_DAY: {
    key: "FULL_DAY",
    header: "FULL DAY\r\n8:00 AM TO 7:30 PM",
    label: "Full Day (8:00 AM – 7:30 PM)",
    slots: ["slot_1", "slot_2", "slot_3", "slot_4", "slot_5", "slot_6"],
  },
} as const;

/**
 * Strict VIT registration number regex: 2 digits, 3 letters, 4 digits (e.g. 24BCE1078).
 */
export const VIT_REG_NO_REGEX = /^\d{2}[A-Za-z]{3}\d{4}$/;

/**
 * Normalizes any slot identifier (id like "slot_1", code like "8:00 AM - 9:40 AM",
 * or header like "8:00 PM TO 9:40 AM") into canonical "slot_1" .. "slot_6".
 */
export function normalizeSlotId(slot?: string | null): string | null {
  if (!slot) return null;
  const s = slot.trim();
  if (/^slot_[1-6]$/i.test(s)) return s.toLowerCase();

  for (const v of VIT_OD_SLOTS) {
    if (v.code.toLowerCase() === s.toLowerCase() || v.header.toLowerCase() === s.toLowerCase()) {
      return v.id;
    }
  }

  // Fallback pattern matching
  if (s.includes("8:00") && s.includes("9:40")) return "slot_1";
  if (s.includes("9:50") && s.includes("11:30")) return "slot_2";
  if (s.includes("11:40") && s.includes("1:30")) return "slot_3";
  if (s.includes("2:00") && s.includes("3:40")) return "slot_4";
  if (s.includes("3:55") && s.includes("5:30")) return "slot_5";
  if (s.includes("5:30") && s.includes("7:30")) return "slot_6";

  return null;
}


