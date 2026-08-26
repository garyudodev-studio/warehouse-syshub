'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, ContainerRecord } from '@/lib/supabaseClient';
import jsQR from 'jsqr';
import { sounds } from '@/lib/audio';
import {
  ScanLine,
  Box,
  ClipboardList,
  ShieldCheck,
  ArrowRight,
  HardHat,
  Radio,
  Search,
  Check,
  Camera,
  QrCode,
  X,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

const PRESET_ACTIVITIES = [
  'Routine Stack Inspection',
  'Cargo Loading / Unloading',
  'Structural Safety & Lashing Check',
  'Hazardous Material Audit',
  'Maintenance & Repair',
];

interface PpeItem {
  id: string;
  label: string;
  spec: string;
}

const STANDARD_PPE_ITEMS: PpeItem[] = [
  { id: 'helmet', label: 'Hard Hat / Safety Helmet', spec: 'OSHA Z89.1 Approved' },
  { id: 'harness', label: 'Full Body Fall Protection Harness', spec: 'OSHA 1926.502 Lashing' },
  { id: 'gloves', label: 'Heavy-Duty Protective Gloves', spec: 'ANSI Cut Level 3+' },
  { id: 'shoes', label: 'Safety Shoes', spec: 'ASTM F2413 Certified' },
];

const getRequiredPpeForActivity = (_activity: string): PpeItem[] => {
  return STANDARD_PPE_ITEMS;
};

export default function PersonnelScanSelectorPage() {
  const router = useRouter();
  const [containers, setContainers] = useState<ContainerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContainer, setSelectedContainer] = useState<string>('Container 01');
  const [selectedActivity, setSelectedActivity] = useState<string>('Routine Stack Inspection');
  const [showCustomActivity, setShowCustomActivity] = useState<boolean>(false);
  const [customActivity, setCustomActivity] = useState<string>('');

  // PPE Verification State
  const [checkedPpe, setCheckedPpe] = useState<Record<string, boolean>>({});

  // Camera QR Scanner Modal State
  const [showQrModal, setShowQrModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeActivityName =
    showCustomActivity && customActivity.trim() ? customActivity.trim() : selectedActivity;
  const currentRequiredPpe = getRequiredPpeForActivity(activeActivityName);

  const checkedCount = currentRequiredPpe.filter((item) => checkedPpe[item.id]).length;
  const isPpeVerified = checkedCount === currentRequiredPpe.length && currentRequiredPpe.length > 0;
  const ppePercentage = Math.round((checkedCount / (currentRequiredPpe.length || 1)) * 100);

  const togglePpe = (id: string) => {
    setCheckedPpe((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const verifyAllPpe = () => {
    const all: Record<string, boolean> = {};
    currentRequiredPpe.forEach((item) => {
      all[item.id] = true;
    });
    setCheckedPpe(all);
    sounds.playAccessGranted();
  };

  // Fetch Box Containers
  useEffect(() => {
    async function fetchContainers() {
      try {
        const { data } = await supabase
          .from('warehouse_containers')
          .select('*')
          .order('container_number', { ascending: true });
        if (data && data.length > 0) {
          setContainers(data);
          setSelectedContainer(data[0].container_number);
        }
      } catch (err) {
        console.error('Error fetching containers:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchContainers();
  }, []);

  // Parse QR content (URL or string) into Container Name
  const parseContainerFromQr = useCallback((qrData: string): string | null => {
    try {
      let raw = qrData.trim();
      if (raw.includes('/log/')) {
        const parts = raw.split('/log/');
        if (parts[1]) {
          const decoded = decodeURIComponent(parts[1].split('?')[0].split('#')[0]);
          return decoded;
        }
      }

      const matched = containers.find(
        (c) => c.container_number.toLowerCase() === raw.toLowerCase()
      );
      if (matched) return matched.container_number;

      if (raw.length > 0) return raw;
    } catch {
      // ignore
    }
    return null;
  }, [containers]);

  // QR Code Camera Scanning Loop
  useEffect(() => {
    let stream: MediaStream | null = null;
    let animFrameId: number;
    let isScanning = true;

    async function startCameraScanner() {
      if (!showQrModal) return;

      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scanFrame = () => {
          if (!isScanning) return;

          if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            const video = videoRef.current;
            const canvas = canvasRef.current || document.createElement('canvas');
            canvasRef.current = canvas;
            const ctx = canvas.getContext('2d');

            if (ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });

              if (code && code.data) {
                const detectedContainer = parseContainerFromQr(code.data);
                if (detectedContainer) {
                  isScanning = false;
                  sounds.playAccessGranted();
                  setSelectedContainer(detectedContainer);
                  setScannedResult(detectedContainer);

                  setTimeout(() => {
                    setShowQrModal(false);
                    setScannedResult(null);
                  }, 1200);
                  return;
                }
              }
            }
          }

          if (isScanning) {
            animFrameId = requestAnimationFrame(scanFrame);
          }
        };

        animFrameId = requestAnimationFrame(scanFrame);

      } catch (err: any) {
        console.error('Camera access error:', err);
        setCameraError(err.message || 'Unable to access camera for QR scanning.');
      }
    }

    if (showQrModal) {
      startCameraScanner();
    }

    return () => {
      isScanning = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [showQrModal, parseContainerFromQr]);

  const handleStartScan = () => {
    if (!isPpeVerified) {
      alert('Safety Warning: Personnel must verify 100% of required PPE items before starting biometric scan.');
      return;
    }
    const finalActivity = activeActivityName;
    const verifiedPpeNames = currentRequiredPpe
      .filter((item) => checkedPpe[item.id])
      .map((item) => item.label)
      .join(', ');

    const encodedContainer = encodeURIComponent(selectedContainer);
    const encodedActivity = encodeURIComponent(finalActivity);
    const encodedPpeItems = encodeURIComponent(verifiedPpeNames);

    router.push(`/log/${encodedContainer}?activity=${encodedActivity}&ppe=verified&ppeItems=${encodedPpeItems}`);
  };


  const filteredContainers = containers.filter((c) =>
    c.container_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto w-full px-3 sm:px-6 py-8 space-y-6 font-mono">
      {/* Tactical Header */}
      <div className="border border-slate-800 rounded-2xl bg-[#0a0d16] p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
          <ScanLine className="w-4 h-4 stroke-[2.5]" />
          <span>STAFF WORKER SCAN STATION</span>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-sans">
            Personnel Biometric Scan Station
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Select your assigned Box Container unit manually or scan physical sticker QR code to launch the scanner.
          </p>
        </div>
      </div>

      {/* Selector Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1: Container Selection */}
        <div className="p-5 rounded-2xl bg-[#0a0d16] border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-white uppercase flex items-center gap-2">
                <Box className="w-4 h-4 text-amber-400" />
                <span>1. SELECT BOX CONTAINER</span>
              </span>
              <span className="text-[10px] text-amber-400 font-bold">{containers.length} UNITS</span>
            </div>

            {/* Search Input & Sticker QR Scanner Camera Trigger */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search container unit..."
                  className="w-full pl-8 pr-3 py-2 bg-[#07090e] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                />
              </div>

              {/* CAMERA STICKER QR SCANNER BUTTON */}
              <button
                onClick={() => setShowQrModal(true)}
                title="Scan container sticker QR with camera"
                className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <Camera className="w-4 h-4 stroke-[2.5]" />
                <span className="hidden sm:inline">SCAN STICKER QR</span>
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto pr-1 space-y-1.5">
              {filteredContainers.map((c) => {
                const isSelected = selectedContainer === c.container_number;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedContainer(c.container_number)}
                    className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-md'
                        : 'bg-[#07090e] text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-sans font-bold">{c.container_number}</span>
                    {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-800/80">
            <span>SELECTED UNIT: <strong className="text-white">{selectedContainer}</strong></span>
            <button
              onClick={() => setShowQrModal(true)}
              className="text-amber-400 hover:underline flex items-center gap-1 text-[10px]"
            >
              <QrCode className="w-3 h-3" />
              <span>Camera QR</span>
            </button>
          </div>
        </div>

        {/* Step 2: Task Activity Selection & Launch */}
        <div className="p-5 rounded-2xl bg-[#0a0d16] border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-white uppercase flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-emerald-400" />
                <span>2. SELECT TASK ACTIVITY</span>
              </span>
            </div>

            <div className="space-y-1.5">
              {PRESET_ACTIVITIES.map((act) => {
                const isSelected = !showCustomActivity && selectedActivity === act;
                return (
                  <button
                    key={act}
                    onClick={() => {
                      setShowCustomActivity(false);
                      setSelectedActivity(act);
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-md'
                        : 'bg-[#07090e] text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-sans">{act}</span>
                    {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                  </button>
                );
              })}

              {/* Manual / Custom Activity Entry */}
              <button
                onClick={() => setShowCustomActivity(!showCustomActivity)}
                className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between cursor-pointer ${
                  showCustomActivity
                    ? 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-md'
                    : 'bg-[#07090e] text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span className="font-sans">+ Custom Task (type manually)</span>
                {showCustomActivity && <Check className="w-4 h-4 stroke-[3]" />}
              </button>

              {showCustomActivity && (
                <input
                  type="text"
                  value={customActivity}
                  onChange={(e) => setCustomActivity(e.target.value)}
                  autoFocus
                  maxLength={80}
                  placeholder="Type manual activity… e.g. Electrical Box Repair, Crane Escort"
                  className="w-full px-3 py-2 bg-[#07090e] border border-emerald-500/60 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 font-sans"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* = Step 3: MANDATORY PPE SAFETY VERIFICATION & LAUNCH == */}
      {/* ======================================================== */}
      <div className="p-6 rounded-2xl bg-[#0a0d16] border-2 border-slate-800 space-y-5 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <HardHat className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  3. MANDATORY PPE SAFETY VERIFICATION
                </span>
                <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono uppercase">
                  OSHA 1910 COMPLIANT
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Personnel must verify mandatory safety gear required for <strong className="text-amber-300">{activeActivityName}</strong> before launching biometric scanner.
              </p>
            </div>
          </div>

          <button
            onClick={verifyAllPpe}
            className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>VERIFY ALL REQUIRED PPE</span>
          </button>
        </div>

        {/* PPE Requirements Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentRequiredPpe.map((item) => {
            const isChecked = !!checkedPpe[item.id];
            return (
              <button
                key={item.id}
                onClick={() => togglePpe(item.id)}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                  isChecked
                    ? 'bg-emerald-950/40 border-emerald-500/80 text-white shadow-md'
                    : 'bg-[#07090e] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold font-sans flex items-center gap-2">
                    <span className={isChecked ? 'text-emerald-300 font-bold' : 'text-slate-300'}>
                      {item.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">{item.spec}</div>
                </div>

                <div
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                    isChecked
                      ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                      : 'bg-slate-900 border-slate-700 text-transparent'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              </button>
            );
          })}
        </div>

        {/* PPE Progress Bar & Launch Control */}
        <div className="pt-3 border-t border-slate-800/80 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 font-bold flex items-center gap-2">
                {isPpeVerified ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>PPE COMPLIANCE STATUS: 100% VERIFIED</span>
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>PPE COMPLIANCE STATUS: {checkedCount} / {currentRequiredPpe.length} ITEMS VERIFIED</span>
                  </span>
                )}
              </span>
              <span className={`font-black ${isPpeVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                {ppePercentage}%
              </span>
            </div>

            {/* Progress bar background */}
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  isPpeVerified ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-amber-500'
                }`}
                style={{ width: `${ppePercentage}%` }}
              />
            </div>
          </div>

          {/* Launch Button */}
          <div className="space-y-2">
            <button
              onClick={handleStartScan}
              disabled={!isPpeVerified}
              className={`w-full py-4 px-5 rounded-xl text-sm font-black flex items-center justify-center gap-2.5 transition-all uppercase tracking-wider cursor-pointer ${
                isPpeVerified
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xl shadow-amber-500/20 active:scale-98'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              <ScanLine className="w-5 h-5 stroke-[2.5]" />
              <span>
                {isPpeVerified
                  ? `LAUNCH BIOMETRIC SCANNER (${selectedContainer})`
                  : 'COMPLETE PPE VERIFICATION TO UNLOCK SCANNER'}
              </span>
              <ArrowRight className="w-5 h-5" />
            </button>

            {!isPpeVerified && (
              <div className="text-[11px] text-amber-400/90 text-center font-mono flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Personnel safety protocol requires checking off all PPE items above before proceeding.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* =========== CAMERA STICKER QR SCANNER MODAL ============ */}
      {/* ======================================================== */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0a0d16] border-2 border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 font-mono relative">
            <button
              onClick={() => {
                setShowQrModal(false);
                setScannedResult(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase border-b border-slate-800 pb-3">
              <Camera className="w-4 h-4 stroke-[2.5]" />
              <span>SCAN STICKER QR CODE WITH CAMERA</span>
            </div>

            {/* Video Feed & QR Target Scanner Reticle */}
            <div className="relative rounded-xl overflow-hidden bg-black border-2 border-slate-800 aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* HUD Reticle Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-amber-400/80 rounded-xl relative shadow-2xl">
                  {/* Corner marks */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-amber-400" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-amber-400" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-amber-400" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-amber-400" />

                  {/* Scanning Bar */}
                  <div className="w-full h-0.5 bg-amber-400 shadow-[0_0_12px_#f59e0b] animate-hud-scan" />
                </div>
              </div>

              {/* Scanned Result Banner Overlay */}
              {scannedResult && (
                <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center space-y-2 animate-in zoom-in-95">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
                  <div className="text-sm font-black text-white font-sans">
                    STICKER QR DETECTED!
                  </div>
                  <div className="px-3 py-1 bg-emerald-500 text-black font-bold text-xs rounded-lg font-mono">
                    {scannedResult}
                  </div>
                </div>
              )}
            </div>

            {cameraError ? (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{cameraError}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center">
                Point camera at printed A4 container sticker QR code. Container unit will be selected automatically.
              </p>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-500">
              <span>SCANNER STATUS: LIVE CAMERA</span>
              <button
                onClick={() => setShowQrModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
              >
                Close Camera
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
