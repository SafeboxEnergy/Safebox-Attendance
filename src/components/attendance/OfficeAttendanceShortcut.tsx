"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

const MAX_GAP_MS = 5_000;
const REQUIRED_CLICKS = 8;

export function OfficeAttendanceShortcut() {
  const router = useRouter();
  const sequence = useRef({ count: 0, lastClick: 0 });

  function openLocationTest() {
    const now = performance.now();
    const previous = sequence.current;
    const count = now - previous.lastClick >= MAX_GAP_MS ? 1 : previous.count + 1;
    sequence.current = { count, lastClick: now };

    if (count === REQUIRED_CLICKS) {
      sequence.current = { count: 0, lastClick: 0 };
      router.push("/test");
    }
  }

  return (
    <button
      type="button"
      onClick={openLocationTest}
      onKeyDown={(event) => {
        if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
      }}
      className="mt-1 touch-manipulation select-none text-sm font-medium tracking-wide text-muted-foreground"
    >
      OFFICE ATTENDANCE
    </button>
  );
}
