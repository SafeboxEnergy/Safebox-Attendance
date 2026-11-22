import type { AttendanceMode } from "@prisma/client";

/** What admins see for each attendance mode. */
export const ATTENDANCE_MODE_LABELS: Record<AttendanceMode, string> = {
  LOCATION_ONLY: "Location-only mode",
  NETWORK_ONLY: "Network mode",
  QR_ONLY: "QR + location mode",
};

export const ATTENDANCE_MODE_DESCRIPTIONS: Record<AttendanceMode, string> = {
  LOCATION_ONLY: "Staff enter their Attendance ID and share their location. The verified office network can confirm attendance when the location check fails.",
  NETWORK_ONLY: "Staff clock in on the office Wi-Fi.",
  QR_ONLY:
    "Staff scan the office QR and share their location. If the location check fails, the scanned office's verified network can confirm attendance.",
};
