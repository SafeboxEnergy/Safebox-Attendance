import type { LocationReading } from "./location";

const LOCATION_ERRORS = {
  denied:
    "Location access is blocked, so we can't confirm you're at the office.\niPhone: Settings › Privacy & Security › Location Services › Safari Websites › While Using the App.\nAndroid: tap the icon left of the web address › Permissions › Location › Allow.\nThen try again.",
  unavailable: "Your device couldn't work out where you are.\nMake sure Location/GPS is turned on, then try again.",
  timeout: "Finding your location took too long.\nMake sure Location/GPS is on, move near a window, and try again.",
  unsupported: "This browser can't share your location.\nPlease open this attendance page in Chrome or Safari and try again.",
  // Browsers only hand out location on https pages — no setting on the phone fixes this.
  insecure:
    "Your location can't be checked because this attendance page isn't on a secure (https) connection.\nPlease let your admin know.",
};

export function describeLocationError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return LOCATION_ERRORS.denied;
  if (error.code === error.TIMEOUT) return LOCATION_ERRORS.timeout;
  return LOCATION_ERRORS.unavailable;
}

/** The phone's position, or why we couldn't get it. The server makes the actual decision. */
export function readLocation(timeout = 15_000): Promise<{ reading: LocationReading } | { error: string }> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return Promise.resolve({ error: LOCATION_ERRORS.insecure });
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ error: LOCATION_ERRORS.unsupported });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ reading: { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy } }),
      (err) => resolve({ error: describeLocationError(err) }),
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}
