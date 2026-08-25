'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, ContainerRecord } from '@/lib/supabaseClient';
import {
  QrCode,
  Printer,
  ShieldCheck,
  Search,
  Plus,
  ArrowRight,
  X,
  AlertTriangle,
} from 'lucide-react';

import AdminGuard from '@/components/AdminGuard';

export default function ContainersQRStationPage() {
  const [containers, setContainers] = useState<ContainerRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [origin, setOrigin] = useState('');
  const [printDate, setPrintDate] = useState('');

  // Add container modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContainerName, setNewContainerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchContainers = async () => {
    const { data } = await supabase
      .from('warehouse_containers')
      .select('*')
      .order('container_number', { ascending: true });
    if (data) setContainers(data);
  };

  useEffect(() => {
    const hydrate = () => {
      setOrigin(window.location.origin);
      setPrintDate(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
    };
    const t = setTimeout(hydrate, 0);

    let cancelled = false;
    supabase
      .from('warehouse_containers')
      .select('*')
      .order('container_number', { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setContainers(data);
      });

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const handleAddContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newContainerName.trim();
    if (!trimmed) { setSubmitError('Container number or name is required.'); return; }

    let formattedName = trimmed;
    if (!formattedName.toLowerCase().startsWith('container') && !formattedName.includes('-')) {
      const num = parseInt(formattedName, 10);
      if (!isNaN(num)) formattedName = `Container ${num < 10 ? '0' + num : num}`;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase
      .from('warehouse_containers')
      .insert({ container_number: formattedName });
    if (error) { setSubmitError(error.message); setIsSubmitting(false); }
    else { setNewContainerName(''); setShowAddModal(false); setIsSubmitting(false); fetchContainers(); }
  };

  const filteredContainers = containers.filter((c) =>
    c.container_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (ch) =>
      ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
    );

  const handlePrintStickers = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=760');
    if (!printWindow) return;

    const cards = filteredContainers
      .map((container) => {
        const scanUrl = `${origin}/log/${encodeURIComponent(container.container_number)}`;
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(scanUrl)}&margin=8&color=000000&bgcolor=ffffff`;
        const num = container.container_number.replace('Container ', '').padStart(2, '0');
        const name = escapeHtml(container.container_number);

        return `
          <div class="sticker-card">
            <div class="sticker-hazard-stripe"></div>
            <div class="sticker-red-band">⚠ RESTRICTED ZONE · AUTHORISED BIOMETRIC ACCESS ONLY ⚠</div>
            <div class="sticker-body">
              <div class="sticker-container-id">
                <div class="sticker-container-label">SYS-HUB™ BOX CONTAINER UNIT</div>
                ${name}
              </div>
              <div class="sticker-meta-row">
                <span>ISO-6346 · OSHA 1910 COMPLIANT</span>
                <span>UNIT ID: SS-${num} · VER: &lt;0.60</span>
              </div>
              <div class="sticker-qr-block">
                <img class="sticker-qr-image" src="${qrSrc}" alt="QR ${name}" />
                <div class="sticker-qr-info">
                  <div class="sticker-scan-label">SCAN TO LOG<br />SITE ACCESS</div>
                  <div class="sticker-scan-sub">
                    Point phone camera at QR code. The biometric facial recognition system will auto-identify personnel and log access. No manual input required.
                  </div>
                  <div class="sticker-compliance-badge">SYS-HUB™ · ISO-45001 · ZERO-INPUT TELEMETRY</div>
                </div>
              </div>
              <div class="sticker-meta-row sticker-meta-bordered">
                <span>ISSUED: ${printDate}</span>
                <span>LATENCY: &lt;100ms · VECTOR: &lt;0.60</span>
                <span>✓ OSHA APPROVED</span>
              </div>
            </div>
            <div class="sticker-footer">
              <span>SYS-HUB™ BIOMETRIC TELEMETRY SYSTEM · SS-${num}</span>
              <span class="sticker-footer-right">OSHA 1910 ✓ | ISO-45001 ✓</span>
            </div>
            <div class="sticker-hazard-stripe-bottom"></div>
          </div>`;
      })
      .join('');

    const sheetCount = Math.max(1, Math.ceil(filteredContainers.length / 2));

    printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>SYS-HUB™ — A4 Sticker Placards</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, sans-serif; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; background: #0f172a; color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }
  .toolbar button { cursor: pointer; border: 0; border-radius: 6px; padding: 8px 14px; font-size: 12px; font-weight: 700; margin-left: 8px; }
  .btn-print { background: #f59e0b; color: #000; }
  .btn-close { background: #1e293b; color: #fff; }
  .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; padding: 10mm; width: 210mm; max-width: 100%; margin: 0 auto; }
  .sticker-card { display: flex; flex-direction: column; border: 2pt solid #000; border-radius: 6pt; overflow: hidden; page-break-inside: avoid; background: #fff; font-family: Arial, sans-serif; outline: 1pt dashed #bbb; outline-offset: 3mm; box-shadow: 0 2px 14px rgba(0,0,0,0.18); }
  .sticker-hazard-stripe { height: 8pt; background: repeating-linear-gradient(-45deg, #f59e0b 0px, #f59e0b 6pt, #000 6pt, #000 12pt); flex-shrink: 0; }
  .sticker-red-band { background: #cc0000; color: #fff; text-align: center; font-size: 7pt; font-weight: 900; letter-spacing: 2pt; padding: 3pt 0; text-transform: uppercase; }
  .sticker-body { padding: 6pt 8pt; flex: 1; display: flex; flex-direction: column; gap: 5pt; }
  .sticker-container-id { font-size: 16pt; font-weight: 900; color: #000; line-height: 1; letter-spacing: 1pt; border-bottom: 1.5pt solid #000; padding-bottom: 4pt; margin-bottom: 2pt; text-transform: uppercase; }
  .sticker-container-label { font-size: 5.5pt; font-weight: 700; color: #666; letter-spacing: 2pt; margin-bottom: 2pt; text-transform: uppercase; }
  .sticker-meta-row { display: flex; justify-content: space-between; font-size: 6pt; color: #333; font-weight: 700; letter-spacing: 0.5pt; }
  .sticker-meta-bordered { border-top: 1pt solid #ddd; padding-top: 4pt; }
  .sticker-qr-block { display: flex; align-items: center; gap: 6pt; background: #f8f8f8; border: 1.5pt solid #000; border-radius: 4pt; padding: 5pt; margin-top: 2pt; }
  .sticker-qr-image { width: 68pt; height: 68pt; border: 1pt solid #ccc; flex-shrink: 0; }
  .sticker-qr-info { flex: 1; display: flex; flex-direction: column; gap: 4pt; }
  .sticker-scan-label { font-size: 9pt; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 0.5pt; line-height: 1.2; }
  .sticker-scan-sub { font-size: 5.5pt; color: #555; line-height: 1.4; }
  .sticker-compliance-badge { display: inline-block; align-self: flex-start; border: 1.5pt solid #000; padding: 2pt 4pt; font-size: 5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1pt; color: #000; }
  .sticker-footer { background: #111; color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 3pt 8pt; font-size: 5.5pt; font-weight: 700; letter-spacing: 0.5pt; flex-shrink: 0; }
  .sticker-footer-right { color: #f59e0b; }
  .sticker-hazard-stripe-bottom { height: 5pt; background: repeating-linear-gradient(-45deg, #f59e0b 0px, #f59e0b 4pt, #000 4pt, #000 8pt); flex-shrink: 0; }
  @media print {
    .no-print { display: none !important; }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .sticker-card { box-shadow: none !important; }
    .sheet { width: auto; max-width: none; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <strong>PRINT PREVIEW — ${filteredContainers.length} STICKERS · ${sheetCount} A4 SHEETS</strong>
    <div>
      <button class="btn-print" onclick="window.print()">PRINT NOW</button>
      <button class="btn-close" onclick="window.close()">CLOSE TAB</button>
    </div>
  </div>
  <div class="sheet">${cards}</div>
  <script>
    (function () {
      var printed = false;
      function doPrint() { if (printed) return; printed = true; window.print(); }
      window.addEventListener('load', function () {
        var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
        var pending = imgs.length;
        var done = function () { pending -= 1; if (pending <= 0) setTimeout(doPrint, 350); };
        if (pending === 0) { setTimeout(doPrint, 350); return; }
        imgs.forEach(function (img) {
          if (img.complete) done();
          else { img.addEventListener('load', done); img.addEventListener('error', done); }
        });
        setTimeout(doPrint, 6000);
      });
    })();
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <AdminGuard>
      {/* ======================================================== */}
      {/* =============== GLOBAL PRINT STYLESHEET ================ */}
      {/* ======================================================== */}
      <style>{`
        /* Screen styles — dark card with preview sticker inside */
        .sticker-card-preview {
          background: #0a0d16;
          border: 2px solid #1e293b;
          border-radius: 12px;
          overflow: hidden;
          transition: border-color 0.2s, transform 0.2s;
          display: flex;
          flex-direction: column;
        }
        .sticker-card-preview:hover {
          border-color: rgba(245,158,11,0.6);
          transform: translateY(-2px);
        }

        /* The visible sticker mockup inside dark card */
        .sticker-mockup {
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          overflow: hidden;
          font-family: 'Arial', sans-serif;
          margin: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
      `}</style>

      {/* ======================================================== */}
      {/* =================== SCREEN PAGE UI ==================== */}
      {/* ======================================================== */}
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-6 space-y-6 no-print">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 font-mono">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
              <QrCode className="w-4 h-4" />
              <span>BOX CONTAINER STICKER PRINT STATION</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight font-sans">
              A4 OSHA Adhesive Sticker Placards
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Professional-grade OSHA/ISO-6346 compliant stickers — 2 per A4 sheet with hazard bands, QR codes, and compliance badges.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>ADD BOX CONTAINER</span>
            </button>

            <button
              onClick={() => handlePrintStickers()}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>PRINT ALL A4 STICKERS ({filteredContainers.length} SHEETS)</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md font-mono">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter box containers..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#0a0d16] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Print-info banner */}
        <div className="px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs font-mono text-amber-300 flex items-start gap-2.5">
          <Printer className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="leading-relaxed">
            <strong className="text-amber-200">Print Instructions:</strong> Click <em>&ldquo;Print All A4 Stickers&rdquo;</em> → a print-ready tab opens and the print dialog launches automatically → select your printer → set paper size to A4 → enable background graphics. Each A4 sheet contains 2 stickers with dashed cut guides.
          </div>
        </div>

        {/* Screen preview grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filteredContainers.map((container) => {
            const scanUrl = `${origin}/log/${encodeURIComponent(container.container_number)}`;
            const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(scanUrl)}&margin=6&color=000000&bgcolor=ffffff`;
            const num = container.container_number.replace('Container ', '').padStart(2, '0');

            return (
              <div key={container.id} className="sticker-card-preview group font-mono">
                {/* Sticker mockup — white, print-like */}
                <div className="sticker-mockup">
                  {/* Top hazard stripe */}
                  <div style={{ height: 8, background: 'repeating-linear-gradient(-45deg, #f59e0b 0px, #f59e0b 6px, #111 6px, #111 12px)' }} />
                  {/* Red band */}
                  <div style={{ background: '#cc0000', color: 'white', textAlign: 'center', fontSize: 8, fontWeight: 900, letterSpacing: 3, padding: '3px 0', textTransform: 'uppercase' }}>
                    RESTRICTED ZONE · AUTHORISED ACCESS ONLY
                  </div>
                  {/* Body */}
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {/* Container ID */}
                    <div style={{ borderBottom: '2px solid #000', paddingBottom: 4 }}>
                      <div style={{ fontSize: 6, fontWeight: 700, color: '#666', letterSpacing: 2, textTransform: 'uppercase' }}>
                        BOX CONTAINER UNIT
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#000', lineHeight: 1.1, letterSpacing: 1, textTransform: 'uppercase' }}>
                        {container.container_number}
                      </div>
                    </div>
                    {/* Meta */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6, color: '#333', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <span>ISO-6346 · OSHA 1910</span>
                      <span>UNIT ID: SS-{num}</span>
                    </div>
                    {/* QR + info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8f8f8', border: '1.5px solid #000', borderRadius: 4, padding: 6 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrSrc} alt="QR" style={{ width: 62, height: 62, border: '1px solid #ccc', flexShrink: 0 }} loading="lazy" />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.2 }}>
                          SCAN TO LOG ACCESS
                        </div>
                        <div style={{ fontSize: 5.5, color: '#555', lineHeight: 1.4 }}>
                          Point phone camera at QR code. Biometric facial scan auto-identifies personnel. Zero-input required.
                        </div>
                        <div style={{ border: '1.5px solid #000', display: 'inline-block', padding: '2px 5px', fontSize: 5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>
                          SYS-HUB™ · ISO-45001
                        </div>
                      </div>
                    </div>
                    {/* Date/Compliance row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 5.5, color: '#333', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <span>ISSUED: {printDate}</span>
                      <span>VER DIST: &lt;0.60</span>
                    </div>
                  </div>
                  {/* Footer bar */}
                  <div style={{ background: '#111', color: 'white', display: 'flex', justifyContent: 'space-between', padding: '4px 10px', fontSize: 6, fontWeight: 700, letterSpacing: 0.5 }}>
                    <span>SYS-HUB™ BIOMETRIC TELEMETRY SYSTEM</span>
                    <span style={{ color: '#f59e0b' }}>OSHA 1910 ✓</span>
                  </div>
                  {/* Bottom hazard stripe */}
                  <div style={{ height: 5, background: 'repeating-linear-gradient(-45deg, #f59e0b 0px, #f59e0b 4px, #111 4px, #111 8px)' }} />
                </div>

                {/* Action button */}
                <div className="p-3 pt-2">
                  <Link
                    href={`/log/${encodeURIComponent(container.container_number)}`}
                    className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-[#07090e] hover:bg-amber-500 hover:text-black text-slate-300 border border-slate-800 hover:border-transparent flex items-center justify-between transition-all"
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Launch Scanner</span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* ============= ADD NEW BOX CONTAINER MODAL ============== */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-[#0a0d16] border-2 border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 font-mono relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase border-b border-slate-800 pb-3">
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>ADD NEW BOX CONTAINER UNIT</span>
            </div>

            <form onSubmit={handleAddContainer} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 font-bold uppercase mb-1">
                  Box Container Identifier
                </label>
                <input
                  type="text"
                  value={newContainerName}
                  onChange={(e) => setNewContainerName(e.target.value)}
                  placeholder="e.g. Container 35 or MSKU-849102-4"
                  autoFocus
                  className="w-full px-3 py-2 bg-[#07090e] border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Enter a number (e.g. 35) or full ISO container code.
                </span>
              </div>

              {submitError && (
                <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newContainerName.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg disabled:opacity-40"
                >
                  {isSubmitting ? 'Saving...' : 'Add Box Container'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
