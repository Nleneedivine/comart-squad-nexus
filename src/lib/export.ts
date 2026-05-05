export function downloadCSV(filename: string, headers: string[], rows: any[][]) {
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(filename: string, headers: string[], rows: any[][]) {
  // Simple XLS via HTML table — opens in Excel
  const html = `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c == null ? "" : String(c).replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename + ".xls"; a.click();
  URL.revokeObjectURL(url);
}

export function downloadPDF(title: string, headers: string[], rows: any[][]) {
  const html = `<!doctype html><html><head><title>${title}</title><style>
    body{font-family:system-ui,Arial;padding:24px} h1{font-size:18px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:11px} th,td{border:1px solid #ddd;padding:6px;text-align:left}
    th{background:#f3f4f6}
  </style></head><body><h1>${title}</h1><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c == null ? "" : String(c).replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.print();</script></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}
