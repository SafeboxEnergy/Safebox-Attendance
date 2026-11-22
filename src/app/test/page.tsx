import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { LocationVisualizer } from "./LocationVisualizer";

export const metadata: Metadata = {
  title: "Attendance location test",
  robots: { index: false, follow: false },
};

export default async function LocationTestPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "offices", "view")) return <LocationVisualizer />;

  const { from } = await searchParams;
  const offices = await prisma.office.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, latitude: true, longitude: true, locationRadiusMeters: true },
  });

  return <LocationVisualizer offices={offices} returnToOffices={from === "offices"} />;
}
