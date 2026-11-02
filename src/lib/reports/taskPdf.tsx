import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { fetchAsDataUrl } from "./pdf";
import type { TaskReportDetail } from "./query";

const COLS = { name: 2, dept: 1.6, in: 1, out: 1, tasks: 4.4 };

const BADGE: Record<string, { bg: string; fg: string }> = {
  COMPLETED: { bg: "#d5ecf2", fg: "#1f5f73" },
  PARTIALLY_COMPLETED: { bg: "#fbe0de", fg: "#a3362d" },
  CARRIED_OVER: { bg: "#ececec", fg: "#3f3f3f" },
};

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 9, color: "#1f2937" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 12 },
  logo: { width: 40, height: 40, objectFit: "contain" },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  reportTitle: { fontSize: 11, color: "#444444", marginTop: 2 },
  meta: { fontSize: 8, color: "#666666", marginTop: 2 },
  summary: { marginBottom: 12, padding: 8, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4 },
  summaryLine: { fontSize: 8, color: "#333333", marginTop: 2 },
  dateHeading: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 6, color: "#374151" },
  table: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 4 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#d1d5db", backgroundColor: "#ffffff" },
  headCell: { paddingVertical: 8, paddingHorizontal: 8, fontSize: 8.5, color: "#374151" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#d1d5db" },
  cell: { paddingVertical: 10, paddingHorizontal: 8 },
  name: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  task: { paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: "#e5e7eb" },
  taskLast: { paddingVertical: 8, paddingHorizontal: 8 },
  badge: { marginTop: 4, alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, fontSize: 7.5 },
  muted: { color: "#6b7280", fontStyle: "italic" },
});

function ReportRow({ r }: { r: TaskReportDetail }) {
  return (
    <View style={styles.row} wrap={false}>
      <View style={[styles.cell, { flex: COLS.name }]}>
        <Text style={styles.name}>{r.employee}</Text>
      </View>
      <View style={[styles.cell, { flex: COLS.dept }]}>
        <Text>{r.department}</Text>
      </View>
      <View style={[styles.cell, { flex: COLS.in }]}>
        <Text>{r.clockIn}</Text>
      </View>
      <View style={[styles.cell, { flex: COLS.out }]}>
        <Text>{r.clockOut}</Text>
      </View>
      <View style={{ flex: COLS.tasks }}>
        {r.noTasksReason !== null ? (
          <View style={styles.taskLast}>
            <Text style={styles.muted}>No tasks to report: {r.noTasksReason}</Text>
          </View>
        ) : (
          r.tasks.map((t, i) => {
            const c = BADGE[t.status] ?? BADGE.CARRIED_OVER!;
            return (
              <View key={i} style={i === r.tasks.length - 1 ? styles.taskLast : styles.task}>
                <Text>
                  {i + 1}. {t.description}
                </Text>
                <Text style={[styles.badge, { backgroundColor: c.bg, color: c.fg }]}>{t.label}</Text>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function TableHead() {
  return (
    <View style={styles.headRow} fixed>
      <Text style={[styles.headCell, { flex: COLS.name }]}>Employee Name</Text>
      <Text style={[styles.headCell, { flex: COLS.dept }]}>Department</Text>
      <Text style={[styles.headCell, { flex: COLS.in }]}>Clock In</Text>
      <Text style={[styles.headCell, { flex: COLS.out }]}>Clock Out</Text>
      <Text style={[styles.headCell, { flex: COLS.tasks }]}>Tasks and Status</Text>
    </View>
  );
}

export interface GenerateTaskReportPdfParams {
  companyName: string;
  logoUrl?: string | null;
  title: string;
  subtitle: string;
  generatedBy: string;
  summaryLines?: string[];
  reports: TaskReportDetail[];
}

export async function generateTaskReportPdf(p: GenerateTaskReportPdfParams): Promise<Buffer> {
  const logoDataUrl = p.logoUrl ? await fetchAsDataUrl(p.logoUrl) : null;

  // Group by date (reports already arrive newest-first).
  const groups: { date: string; reports: TaskReportDetail[] }[] = [];
  for (const r of p.reports) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.date) last.reports.push(r);
    else groups.push({ date: r.date, reports: [r] });
  }
  const showDates = groups.length > 1;

  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is a PDF node */}
          {logoDataUrl ? <Image src={logoDataUrl} style={styles.logo} /> : null}
          <View>
            <Text style={styles.companyName}>{p.companyName}</Text>
            <Text style={styles.reportTitle}>{p.title}</Text>
            <Text style={styles.meta}>
              {p.subtitle} · Generated by {p.generatedBy} on {new Date().toLocaleString()}
            </Text>
          </View>
        </View>

        {p.summaryLines?.length ? (
          <View style={styles.summary}>
            {p.summaryLines.map((line, i) => (
              <Text key={i} style={styles.summaryLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        {groups.length === 0 ? <Text style={styles.muted}>No task reports for this period.</Text> : null}

        {groups.map((g) => (
          <View key={g.date}>
            {showDates ? <Text style={styles.dateHeading}>{g.date}</Text> : null}
            <View style={styles.table}>
              <TableHead />
              {g.reports.map((r, i) => (
                <ReportRow key={i} r={r} />
              ))}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
