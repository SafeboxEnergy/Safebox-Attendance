import type { AttendanceMode } from "@prisma/client";

/** What admins see for each attendance mode. */
export const ATTENDANCE_MODE_LABELS: Record<AttendanceMode, string> = {
  LOCATION_ONLY: "Location-only mode",
  NETWORK_ONLY: "Network mode",
  QR_ONLY: "QR + location mode",
};

export const ATTENDANCE_MODE_DESCRIPTIONS: Record<AttendanceMode, string> = {
  LOCATION_ONLY: "Staff enter their Attendance ID and share their location within their assigned office radius. No office Wi-Fi or QR scan required.",
  NETWORK_ONLY: "Staff clock in on the office Wi-Fi.",
  QR_ONLY:
    "For when the office network is down: staff scan the printed office QR code on mobile data, and their phone's location must be inside the office radius.",
};
