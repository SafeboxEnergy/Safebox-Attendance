"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkOfficeLocation,
  distanceMeters,
  type LocationReading,
} from "@/lib/attendance/location";
import { describeLocationError, readLocation } from "@/lib/attendance/readLocation";
import type { NetworkVerificationResult } from "@/lib/network/verifyOfficeNetwork";

const WATCH_DURATION_MS = 15_000;

function formatBoundaryDistance(distance: number, radius: number) {
  const offset = Math.round(distance) - radius;
  return offset === 0 ? "At boundary" : `${Math.abs(offset).toLocaleString()} m ${offset < 0 ? "inside" : "outside"}`;
}

function bearingRadians(office: Pick<LocationReading, "latitude" | "longitude">, device: LocationReading) {
  const fromLat = office.latitude * Math.PI / 180;
  const toLat = device.latitude * Math.PI / 180;
  const deltaLng = (device.longitude - office.longitude) * Math.PI / 180;
  return Math.atan2(
    Math.sin(deltaLng) * Math.cos(toLat),
    Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng),
  );
}

const outcomes = {
  LOCATION_INACCURATE: "Location is too uncertain",
  LOCATION_OUT_OF_RANGE: "Location is outside the office boundary",
  LOCATION_REQUIRED: "Device location needed",
  LOCATION_NOT_CONFIGURED: "Office coordinates needed",
};

interface OfficeBoundary {
  name: string;
  latitude: number | null;
  longitude: number | null;
  locationRadiusMeters: number;
}

type NetworkDenialReason = Extract<NetworkVerificationResult, { allowed: false }>["reason"];
type NetworkCheck = { sourceIp: string } & ({ allowed: true } | { allowed: false; reason: NetworkDenialReason });

const networkDenials: Record<NetworkDenialReason, string> = {
  NO_NETWORK_CONFIGURED: "This office has no active authorized network.",
  NETWORK_DISABLED: "This office’s authorized network is disabled.",
  STALE_FAIL_CLOSED: "The office network needs to be verified again.",
  IP_NOT_AUTHORIZED: "This connection does not match the verified office network.",
};

async function requestOfficeTest(payload: { attendanceId: string; checkNetwork?: true } | { officeId: string; checkNetwork: true }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/attendance/test-office", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: response.ok, data: await response.json() };
  } finally {
    clearTimeout(timeout);
  }
}

export function LocationVisualizer({
  offices,
  returnToOffices = false,
}: {
  offices?: (OfficeBoundary & { id: string })[];
  returnToOffices?: boolean;
}) {
  const [officeId, setOfficeId] = useState(offices?.[0]?.id ?? "");
  const [attendanceId, setAttendanceId] = useState("");
  const [assignedOffice, setAssignedOffice] = useState<OfficeBoundary | null>(null);
  const [loadingOffice, setLoadingOffice] = useState(false);
  const [officeError, setOfficeError] = useState("");
  const loadedAttendanceId = useRef("");
  const [checkingNetwork, setCheckingNetwork] = useState(false);
  const [network, setNetwork] = useState<NetworkCheck | null>(null);
  const [networkError, setNetworkError] = useState("");
  const [reading, setReading] = useState<LocationReading | null>(null);
  const [locating, setLocating] = useState(false);
  const [watching, setWatching] = useState(false);
  const [samples, setSamples] = useState<LocationReading[]>([]);
  const stopWatch = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => stopWatch.current?.(), []);

  const office = offices ? offices.find((entry) => entry.id === officeId) : assignedOffice;
  const pin = office?.latitude != null && office.longitude != null
    ? { latitude: office.latitude, longitude: office.longitude }
    : null;
  const officeRadius = office && pin ? office.locationRadiusMeters : 0;
  const distance = pin && reading ? distanceMeters(pin, reading) : null;
  const bearing = pin && reading ? bearingRadians(pin, reading) : 0;
  const scale = 43 / Math.max(officeRadius, (distance ?? 0) + (reading?.accuracy ?? 0), 1);
  const x = 50 + (distance ?? 0) * Math.sin(bearing) * scale;
  const y = 50 - (distance ?? 0) * Math.cos(bearing) * scale;
  const outcome = office ? checkOfficeLocation(office, reading) : null;

  async function loadOffice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingOffice(true);
    setAssignedOffice(null);
    loadedAttendanceId.current = "";
    setNetwork(null);
    setNetworkError("");
    setOfficeError("");
    setError("");
    setReading(null);
    setSamples([]);
    try {
      const { ok, data } = await requestOfficeTest({ attendanceId });
      if (!ok) {
        setOfficeError(data.message ?? "Couldn't load the office. Please try again.");
        return;
      }
      setAssignedOffice(data.office);
      loadedAttendanceId.current = attendanceId;
      setAttendanceId("");
    } catch {
      setOfficeError("Couldn't load the office. Check your connection and try again.");
    } finally {
      setLoadingOffice(false);
    }
  }

  async function checkOfficeNetwork() {
    if (!office || checkingNetwork) return;
    setCheckingNetwork(true);
    setNetwork(null);
    setNetworkError("");
    try {
      const { ok, data } = await requestOfficeTest(offices
        ? { officeId, checkNetwork: true }
        : { attendanceId: loadedAttendanceId.current, checkNetwork: true });
      if (ok) setNetwork(data.network);
      else setNetworkError(data.message ?? "Couldn't check the office network. Please try again.");
    } catch {
      setNetworkError("Couldn't check the office network. Check your connection and try again.");
    } finally {
      setCheckingNetwork(false);
    }
  }

  async function locate() {
    setLocating(true);
    setError("");
    setReading(null);
    setSamples([]);
    try {
      const result = await readLocation();
      if ("reading" in result) setReading(result.reading);
      else setError(result.error);
    } finally {
      setLocating(false);
    }
  }

  function watchLocation() {
    if (stopWatch.current || locating || !pin) return;
    setError("");
    setReading(null);
    setSamples([]);
    if (!window.isSecureContext || !navigator.geolocation) {
      setError("Watching location requires a secure connection and a browser that supports geolocation.");
      return;
    }

    const geolocation = navigator.geolocation;
    let active = true;
    let receivedReading = false;
    const watchId = geolocation.watchPosition(
      ({ coords: { latitude, longitude, accuracy } }) => {
        if (!active) return;
        const sample = { latitude, longitude, accuracy };
        receivedReading = true;
        setError("");
        setReading(sample);
        setSamples((previous) => [...previous, sample]);
      },
      (problem) => {
        if (!active) return;
        setError(describeLocationError(problem));
        if (problem.code === problem.PERMISSION_DENIED) finishWatch();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: WATCH_DURATION_MS },
    );

    const timer = setTimeout(() => {
      finishWatch();
      if (!receivedReading) setError((previous) => previous || "No location readings arrived in 15 seconds.");
    }, WATCH_DURATION_MS);
    stopWatch.current = () => {
      active = false;
      clearTimeout(timer);
      geolocation.clearWatch(watchId);
      stopWatch.current = null;
    };
    setWatching(true);
  }

  function finishWatch() {
    stopWatch.current?.();
    setWatching(false);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8 sm:py-12">
      <header>
        <Button asChild variant="outline" size="sm" className="mb-4">
          <Link href={returnToOffices ? "/admin/offices" : "/register"}>← Back</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Attendance location test</h1>
        <p className="mt-2 text-muted-foreground">Compare this device’s location with an office geofence.</p>
      </header>
      <div className="grid items-start gap-6 md:grid-cols-[1fr_1.5fr]">
        <section aria-label="Location controls" className="space-y-5 rounded-xl border bg-card p-5">
          <div className="space-y-3">
            <h2 className="font-semibold">Office boundary</h2>
            {!offices ? (
              <form onSubmit={loadOffice} className="space-y-2">
                <label className="block text-sm font-medium">
                  Attendance ID
                  <Input className="mt-1" value={attendanceId} onChange={(event) => setAttendanceId(event.target.value)}
                    autoComplete="off" autoCapitalize="characters" spellCheck={false} minLength={3} maxLength={40}
                    required disabled={loadingOffice || locating || watching || checkingNetwork} />
                </label>
                <Button type="submit" variant="outline" disabled={loadingOffice || locating || watching || checkingNetwork || attendanceId.trim().length < 3}>
                  {loadingOffice ? "Loading office…" : "Load assigned office"}
                </Button>
                {officeError && <p role="alert" className="text-sm text-destructive">{officeError}</p>}
                {assignedOffice && <p className="text-sm font-medium" role="status">{assignedOffice.name}</p>}
              </form>
            ) : offices.length > 0 ? (
              <label className="block text-sm font-medium">
                Saved office
                <select className="mt-1 block h-9 w-full rounded-md border bg-background px-3" value={officeId}
                  disabled={watching || checkingNetwork} onChange={(event) => {
                    setOfficeId(event.target.value);
                    setNetwork(null);
                    setNetworkError("");
                  }}>
                  {offices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </select>
              </label>
            ) : <p className="text-sm text-muted-foreground">No offices have been created.</p>}
            {pin && <p className="text-sm text-muted-foreground">{officeRadius} m radius · {pin.latitude}, {pin.longitude}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={locate} disabled={locating || watching || !pin}>{locating ? "Reading location…" : reading ? "Refresh device location" : "Get device location"}</Button>
            <Button variant="outline" onClick={watching ? finishWatch : watchLocation} disabled={locating || !pin}>
              {watching ? "Stop watching" : "Watch location"}
            </Button>
          </div>
          {watching && <p role="status" className="text-sm text-muted-foreground">Collecting readings for up to 15 seconds…</p>}
          {error && <p role="alert" className="whitespace-pre-line text-sm text-destructive">{error}</p>}
          <div aria-live="polite" className="space-y-2">
            {outcome && <p className="font-semibold">{outcome.ok ? "Location passes the office check" : outcomes[outcome.reason]}</p>}
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
              <dt>Distance from centre</dt><dd>{distance === null ? "—" : `${Math.round(distance).toLocaleString()} m`}</dd>
              <dt>Distance to boundary</dt><dd>{distance === null ? "—" : formatBoundaryDistance(distance, officeRadius)}</dd>
              <dt>Reported accuracy</dt><dd>{reading ? `±${Math.round(reading.accuracy).toLocaleString()} m` : "—"}</dd>
              <dt>Device coordinates</dt><dd>{reading ? `${reading.latitude.toFixed(5)}, ${reading.longitude.toFixed(5)}` : "—"}</dd>
            </dl>
          </div>
          {pin && samples.length > 0 && (
            <table className="w-full text-left text-sm">
              <caption className="pb-2 text-left font-semibold">Watch readings</caption>
              <thead className="text-muted-foreground">
                <tr><th scope="col">Reading</th><th scope="col">Accuracy</th><th scope="col">Boundary</th></tr>
              </thead>
              <tbody>
                {samples.map((sample, index) => (
                  <tr key={index} className="border-t">
                    <td className="py-1">{index + 1}</td>
                    <td>±{Math.round(sample.accuracy).toLocaleString()} m</td>
                    <td>{formatBoundaryDistance(distanceMeters(pin, sample), officeRadius)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="space-y-2 border-t pt-4">
            <Button variant="outline" onClick={checkOfficeNetwork} disabled={!office || checkingNetwork}>
              {checkingNetwork ? "Checking network…" : "Check office network"}
            </Button>
            <div aria-live="polite" className="text-sm">
              {network && (
                <>
                  <p className="font-medium">{network.allowed ? "Connected through the verified office network." : networkDenials[network.reason]}</p>
                  <p className="break-all text-muted-foreground">Connection address seen by the server · {network.sourceIp}</p>
                </>
              )}
              {networkError && <p role="alert" className="text-destructive">{networkError}</p>}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Device location readings stay in this browser. These checks don’t record attendance.</p>
        </section>
        <figure className="overflow-hidden rounded-xl border bg-card">
          <div
            role="img"
            aria-label="North-up plot with the office at the centre, the device at its measured distance and bearing, and a circle showing reported location uncertainty"
            className="relative aspect-square overflow-hidden bg-muted/40 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[size:18px_18px]"
          >
            <span className="absolute left-4 top-4 text-xs font-semibold">↑ N</span>
            {pin ? (
              <>
                <div className="absolute left-1/2 top-1/2 -translate-1/2 rounded-full border-2 border-blue-500 bg-blue-500/10" style={{ width: `${2 * officeRadius * scale}%`, aspectRatio: 1 }} />
                <div className="absolute left-1/2 top-1/2 size-2 -translate-1/2 rounded-full bg-blue-600 ring-2 ring-background" />
                {reading && (
                  <>
                    <div className="absolute -translate-1/2 rounded-full border border-dashed border-amber-600 bg-amber-500/10" style={{ left: `${x}%`, top: `${y}%`, width: `${2 * reading.accuracy * scale}%`, aspectRatio: 1 }} />
                    <div className="absolute size-3 -translate-1/2 rounded-full bg-amber-500 ring-2 ring-background" style={{ left: `${x}%`, top: `${y}%` }} />
                  </>
                )}
              </>
            ) : (
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
                {offices ? "Select an office with saved coordinates to plot its boundary." : "Enter your Attendance ID to plot your assigned office boundary."}
              </div>
            )}
          </div>
          <figcaption className="flex flex-wrap gap-x-5 gap-y-2 border-t px-4 py-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><span className="size-3 rounded-full border-2 border-blue-500" /> Office boundary</span>
            <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-amber-500" /> Device</span>
            <span className="flex items-center gap-2"><span className="size-3 rounded-full border border-dashed border-amber-600" /> Reported accuracy</span>
          </figcaption>
        </figure>
      </div>
    </main>
  );
}
