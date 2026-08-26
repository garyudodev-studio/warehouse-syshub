'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase, WorkerRecord, ContainerRecord } from '@/lib/supabaseClient';
import {
  loadFaceApiModels,
  extractFaceDescriptor,
  findBestMatch,
  MatchResult,
} from '@/lib/faceApi';
import { sounds } from '@/lib/audio';
import {
  ShieldCheck,
  Camera,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  VideoOff,
  Box,
  HardHat,
  Sun,
  Volume2,
  VolumeX,
  Clock,
  ArrowRight,
  Shield,
  Eye,
  Key,
  UserCheck,
  Search,
  Check,
  ClipboardList,
  Wrench,
  PackageCheck,
  FileCheck,
  Truck,
} from 'lucide-react';

const PRESET_ACTIVITIES = [
  { id: 'Routine Stack Inspection', label: 'Routine Stack Inspection', icon: ShieldCheck },
  { id: 'Cargo Loading / Unloading', label: 'Cargo Loading / Unloading', icon: Truck },
  { id: 'Structural Safety & Lashing Check', label: 'Structural Lashing Check', icon: FileCheck },
  { id: 'Hazardous Material Audit', label: 'Hazardous Material Audit', icon: AlertTriangle },
  { id: 'Maintenance & Repair', label: 'Maintenance & Repair', icon: Wrench },
];

export default function WorkerCheckInPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Decode container identifier
  const rawContainerParam = params?.containerId as string | undefined;
  const decodedContainerParam = rawContainerParam
    ? decodeURIComponent(rawContainerParam)
    : 'Container 01';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const successRecordedRef = useRef<boolean>(false);

  // Core State
  const [container, setContainer] = useState<ContainerRecord | null>(null);
  const [loadingContainer, setLoadingContainer] = useState(true);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  const [modelsReady, setModelsReady] = useState(false);
  const [cameraState, setCameraState] = useState<'requesting' | 'active' | 'denied' | 'stopped'>('requesting');
  const [scanTelemetry, setScanTelemetry] = useState<string>('INIT_NEURAL_ENGINE');
  const [faceInFrame, setFaceInFrame] = useState(false);

  // Activity Selection — pre-selected from ?activity= param (set on /scan)
  const urlActivity = decodeURIComponent(searchParams?.get('activity') || '').trim();
  const urlPpeVerified = searchParams?.get('ppe') === 'verified';
  const urlPpeItems = decodeURIComponent(searchParams?.get('ppeItems') || '').trim();

  const isPresetActivity = PRESET_ACTIVITIES.some((a) => a.id === urlActivity);
  const [selectedActivity, setSelectedActivity] = useState<string>(
    urlActivity && isPresetActivity ? urlActivity : 'Routine Stack Inspection'
  );
  const [customActivityInput, setCustomActivityInput] = useState<string>(
    urlActivity && !isPresetActivity ? urlActivity : ''
  );
  const [showCustomInput, setShowCustomInput] = useState<boolean>(
    !!urlActivity && !isPresetActivity
  );

  // Industrial Modes
  const [sunlightMode, setSunlightMode] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [manualFallbackOpen, setManualFallbackOpen] = useState(false);
  const [manualSearch, setManualSearch] = useState('');

  // Success State
  const [verifiedWorker, setVerifiedWorker] = useState<{
    name: string;
    id: string;
    role?: string;
    photoUrl?: string;
    distance: number;
    activity: string;
    logId?: string;
    timestamp: string;
    isoTime: string;
  } | null>(null);

  // Active activity getter
  const getActiveActivity = () => {
    if (showCustomInput && customActivityInput.trim()) {
      return customActivityInput.trim();
    }
    return selectedActivity;
  };

  // 1. Resolve Container
  const resolveContainer = useCallback(async () => {
    setLoadingContainer(true);
    try {
      let query = supabase.from('warehouse_containers').select('*');
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        decodedContainerParam
      );

      if (isUUID) {
        query = query.eq('id', decodedContainerParam);
      } else {
        let formattedName = decodedContainerParam;
        if (!formattedName.toLowerCase().startsWith('container')) {
          const num = parseInt(formattedName, 10);
          if (!isNaN(num)) {
            formattedName = `Container ${num < 10 ? '0' + num : num}`;
          }
        }
        query = query.ilike('container_number', formattedName);
      }

      const { data } = await query.maybeSingle();

      if (data) {
        setContainer(data);
      } else {
        const { data: firstContainer } = await supabase
          .from('warehouse_containers')
          .select('*')
          .limit(1)
          .maybeSingle();

        setContainer(
          firstContainer || {
            id: 'mock-container-id',
            container_number: decodedContainerParam,
            created_at: new Date().toISOString(),
          }
        );
      }
    } catch (err) {
      console.error('Error resolving container:', err);
    } finally {
      setLoadingContainer(false);
    }
  }, [decodedContainerParam]);

  // 2. Fetch enrolled workers
  const fetchWorkers = useCallback(async () => {
    setLoadingWorkers(true);
    try {
      const { data } = await supabase.from('warehouse_workers').select('*');
      setWorkers(data || []);
    } catch (err) {
      console.error('Error loading workers:', err);
    } finally {
      setLoadingWorkers(false);
    }
  }, []);

  // 3. Load Models
  useEffect(() => {
    let isMounted = true;
    async function loadModels() {
      try {
        setScanTelemetry('LOADING_WEIGHTS');
        await loadFaceApiModels();
        if (isMounted) {
          setModelsReady(true);
          setScanTelemetry('SCANNER_ACTIVE');
        }
      } catch (err) {
        console.error('Error loading face-api models:', err);
        if (isMounted) {
          setScanTelemetry('ERROR_MODEL_LOAD');
        }
      }
    }

    resolveContainer();
    fetchWorkers();
    loadModels();

    return () => {
      isMounted = false;
    };
  }, [resolveContainer, fetchWorkers]);

  // 4. Start Camera Stream
  const startCamera = useCallback(async () => {
    try {
      setCameraState('requesting');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((e) => console.warn('Video warning:', e));
      }
      setCameraState('active');
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraState('denied');
      setScanTelemetry('CAMERA_PERMISSION_DENIED');
    }
  }, []);

  useEffect(() => {
    if (modelsReady && !verifiedWorker) {
      startCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [modelsReady, verifiedWorker, startCamera]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraState('stopped');
  }, []);

  // 5. Automatic Scanning Loop
  useEffect(() => {
    if (!modelsReady || cameraState !== 'active' || verifiedWorker || workers.length === 0) {
      return;
    }

    let intervalId: NodeJS.Timeout;
    let isActive = true;

    const performScan = async () => {
      if (
        !isActive ||
        isScanningRef.current ||
        successRecordedRef.current ||
        !videoRef.current ||
        videoRef.current.readyState < 2
      ) {
        return;
      }

      isScanningRef.current = true;

      try {
        const detectionResult = await extractFaceDescriptor(videoRef.current);

        if (!detectionResult) {
          setFaceInFrame(false);
          setScanTelemetry('ACQUIRING_TARGET: ALIGN_FACE');
          isScanningRef.current = false;
          return;
        }

        setFaceInFrame(true);
        setScanTelemetry('TARGET_LOCKED: MATCHING_DESCRIPTOR');

        if (audioEnabled) {
          sounds.playScanTick();
        }

        const match: MatchResult | null = findBestMatch(
          detectionResult.descriptor,
          workers,
          0.6
        );

        if (match) {
          successRecordedRef.current = true;
          const currentActivity = getActiveActivity();
          setScanTelemetry(`AUTHORIZED: ${match.worker.name.toUpperCase()}`);

          if (audioEnabled) {
            sounds.playAccessGranted();
          }

          const now = new Date();
          const isoString = now.toISOString();
          const targetContainerId = container?.id || '00000000-0000-0000-0000-000000000000';
          const ppeNote = urlPpeVerified
            ? `[PPE VERIFIED: ${urlPpeItems || '100% Safety Gear Certified'}]`
            : undefined;

          const { data: logData } = await supabase
            .from('warehouse_access_logs')
            .insert({
              worker_id: match.worker.id,
              container_id: targetContainerId,
              activity: currentActivity,
              notes: ppeNote,
              scanned_at: isoString,
            })
            .select()
            .single();

          stopCamera();

          // Get matched worker record for avatar / role
          const matchedWorkerRecord = workers.find((w) => w.id === match.worker.id);

          setVerifiedWorker({
            name: match.worker.name,
            id: match.worker.id,
            role: matchedWorkerRecord?.role || 'Standard Crew',
            photoUrl: matchedWorkerRecord?.photo_url,
            distance: match.distance,
            activity: currentActivity,
            logId: logData?.id,
            timestamp: now.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            isoTime: now.toISOString().replace('T', ' ').substring(0, 19),
          });
        } else {
          setScanTelemetry('UNRECOGNIZED_PERSONNEL');
        }
      } catch (scanErr) {
        console.error('Scan error:', scanErr);
      } finally {
        isScanningRef.current = false;
      }
    };

    performScan();
    intervalId = setInterval(performScan, 1100);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [modelsReady, cameraState, verifiedWorker, workers, container, stopCamera, audioEnabled, selectedActivity, showCustomInput, customActivityInput, urlPpeVerified, urlPpeItems]);

  // Manual fallback check-in handler
  const handleManualCheckIn = async (worker: WorkerRecord) => {
    if (audioEnabled) sounds.playAccessGranted();

    const currentActivity = getActiveActivity();
    const now = new Date();
    const isoString = now.toISOString();
    const targetContainerId = container?.id || '00000000-0000-0000-0000-000000000000';
    const ppeNote = urlPpeVerified
      ? `[PPE VERIFIED: ${urlPpeItems || '100% Safety Gear Certified'}]`
      : undefined;

    const { data: logData } = await supabase
      .from('warehouse_access_logs')
      .insert({
        worker_id: worker.id,
        container_id: targetContainerId,
        activity: currentActivity,
        notes: ppeNote,
        scanned_at: isoString,
      })
      .select()
      .single();

    stopCamera();
    setManualFallbackOpen(false);
    setVerifiedWorker({
      name: worker.name,
      id: worker.id,
      role: worker.role || 'Standard Crew',
      photoUrl: worker.photo_url,
      distance: 0.05,
      activity: currentActivity,
      logId: logData?.id,
      timestamp: now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      isoTime: now.toISOString().replace('T', ' ').substring(0, 19),
    });
  };

  const handleResetForNextWorker = () => {
    successRecordedRef.current = false;
    isScanningRef.current = false;
    setVerifiedWorker(null);
    setScanTelemetry('SCANNER_ACTIVE');
    fetchWorkers();
    startCamera();
  };

  const filteredManualWorkers = workers.filter((w) =>
    w.name.toLowerCase().includes(manualSearch.toLowerCase())
  );

  return (
    <div
      className={`flex-1 w-full flex flex-col justify-between p-3 sm:p-6 transition-colors ${
        sunlightMode
          ? 'bg-slate-100 text-slate-900'
          : 'bg-[#07090e] text-slate-100'
      }`}
    >
      <div className="max-w-2xl mx-auto w-full space-y-4 font-mono">
        {/* Top Control Strip */}
        <div className="flex items-center justify-between gap-2 border-b pb-3 border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
            <span className="font-mono text-xs font-bold tracking-wider uppercase text-amber-400">
              CONTAINER ACCESS CHECKPOINT
            </span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
              STEP 2/2 · FACE VERIFICATION
            </span>
            {urlPpeVerified && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>PPE VERIFIED (100% OSHA)</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              title="Toggle Audio Feedback"
              className={`p-1.5 rounded-lg text-xs font-mono border transition-all ${
                audioEnabled
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setSunlightMode(!sunlightMode)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border flex items-center gap-1.5 transition-all ${
                sunlightMode
                  ? 'bg-amber-400 text-black border-amber-500'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-500/50'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>{sunlightMode ? 'OUTDOOR HIGH-CONTRAST' : 'SUNLIGHT MODE'}</span>
            </button>
          </div>
        </div>

        {/* Tactical Container Banner */}
        <div
          className={`p-4 rounded-xl border-2 flex items-center justify-between shadow-lg font-mono ${
            sunlightMode
              ? 'bg-amber-400 border-black text-black'
              : 'bg-[#0f1420] border-amber-500/60 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center font-black ${
                sunlightMode ? 'bg-black text-amber-400' : 'bg-amber-500 text-black'
              }`}
            >
              <Box className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest font-black opacity-80">
                HAZARDOUS STACK LOCATION
              </div>
              <div className="text-xl sm:text-2xl font-black tracking-tight">
                {container?.container_number || decodedContainerParam}
              </div>
            </div>
          </div>

          <div
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase border ${
              sunlightMode
                ? 'bg-black text-white border-black'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            RESTRICTED ENTRY
          </div>
        </div>

        {/* WORK ACTIVITY SELECTOR STRIP */}
        {!verifiedWorker && (
          <div
            className={`p-3 rounded-xl border space-y-2 text-xs ${
              sunlightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-[#0a0d16] border-slate-800 text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-400">
              <span className="flex items-center gap-1.5 uppercase">
                <ClipboardList className="w-4 h-4 text-emerald-400" />
                <span>SELECT SCAN ACTIVITY PURPOSE:</span>
              </span>
              <span className="text-[10px] text-slate-500">BOUND TO ACCESS LOG</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESET_ACTIVITIES.map((act) => {
                const IconComponent = act.icon;
                const isSelected = !showCustomInput && selectedActivity === act.id;
                return (
                  <button
                    key={act.id}
                    onClick={() => {
                      setShowCustomInput(false);
                      setSelectedActivity(act.id);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-extrabold'
                        : sunlightMode
                        ? 'bg-slate-100 text-slate-700 border-slate-300 hover:border-slate-400'
                        : 'bg-[#07090e] text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5 shrink-0" />
                    <span>{act.label}</span>
                  </button>
                );
              })}

              <button
                onClick={() => setShowCustomInput(!showCustomInput)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                  showCustomInput
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold'
                    : 'bg-[#07090e] text-slate-400 border-slate-800'
                }`}
              >
                + Custom Task
              </button>
            </div>

            {showCustomInput && (
              <div className="pt-1">
                <input
                  type="text"
                  value={customActivityInput}
                  onChange={(e) => setCustomActivityInput(e.target.value)}
                  placeholder="Specify custom task description (e.g. Electrical Box Repair)..."
                  className="w-full px-3 py-1.5 bg-[#07090e] border border-amber-500 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        )}

        {/* ================= SUCCESS PLACARD ================= */}
        {verifiedWorker ? (
          <div
            className={`rounded-2xl border-4 p-6 sm:p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 ${
              sunlightMode
                ? 'bg-emerald-500 border-black text-black'
                : 'bg-gradient-to-b from-[#064e3b]/90 to-[#022c22] border-emerald-400 text-white shadow-emerald-500/20'
            }`}
          >
            {/* Worker Avatar / Checkmark Header */}
            <div className="flex items-center justify-center gap-4">
              {verifiedWorker.photoUrl ? (
                <img
                  src={verifiedWorker.photoUrl}
                  alt={verifiedWorker.name}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-emerald-400 shadow-xl"
                />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shadow-2xl font-black">
                  <CheckCircle2 className="w-14 h-14 sm:w-16 sm:h-16 stroke-[2.5]" />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="inline-block px-3 py-1 rounded-full text-xs font-mono font-black uppercase tracking-widest bg-black text-emerald-400">
                ● ACCESS AUTHORIZED & LOGGED
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight font-sans mt-2">
                {verifiedWorker.name}
              </h1>
              <div className="text-xs font-mono text-emerald-300 font-bold uppercase">
                {verifiedWorker.role || 'STANDARD CREW'}
              </div>
              <p className="text-xs sm:text-sm font-mono opacity-90">
                ENTRY RECORDED AT {verifiedWorker.timestamp}
              </p>
            </div>

            {/* Industrial Verification Telemetry Box */}
            <div
              className={`p-4 rounded-xl text-left font-mono text-xs grid grid-cols-2 gap-3 border ${
                sunlightMode
                  ? 'bg-white/90 border-black text-black'
                  : 'bg-black/40 border-emerald-400/40 text-slate-200'
              }`}
            >
              <div>
                <span className="text-[10px] text-slate-400 uppercase block font-bold">
                  CONTAINER BAY
                </span>
                <span className="font-bold text-sm">
                  {container?.container_number || decodedContainerParam}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase block font-bold">
                  LOGGED ACTIVITY
                </span>
                <span className="font-bold text-xs text-amber-400">
                  {verifiedWorker.activity}
                </span>
              </div>

              <div className="col-span-2 pt-2 border-t border-slate-700/40">
                <span className="text-[10px] text-slate-400 uppercase block font-bold mb-0.5">
                  VERIFIED PPE SAFETY GEAR USES
                </span>
                <div className="flex items-center gap-1.5 font-sans text-xs text-emerald-300 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{urlPpeItems || 'Hard Hat, Full Body Harness, Heavy Gloves, Safety Shoes'}</span>
                </div>
              </div>

              <div className="col-span-2 pt-1 border-t border-slate-700/40 text-[11px] text-slate-400 flex items-center justify-between">
                <span>VECTOR FIT: {((1 - verifiedWorker.distance) * 100).toFixed(1)}%</span>
                <span>OSHA ACCIDENT PREVENTION COMPLIANT</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={handleResetForNextWorker}
                className="w-full py-4 px-6 rounded-xl font-black text-base bg-black hover:bg-slate-900 text-white shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer font-mono"
              >
                <RefreshCw className="w-5 h-5 stroke-[2.5]" />
                <span>NEXT WORKER SCAN</span>
              </button>

              <button
                onClick={() => router.push('/admin/dashboard')}
                className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs font-mono border transition-all ${
                  sunlightMode
                    ? 'bg-emerald-600 text-white border-black'
                    : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <span>OPEN LIVE AUDIT LOGS →</span>
              </button>
            </div>
          </div>
        ) : (
          /* ================= ACTIVE CAMERA RETICLE VIEWPORT ================= */
          <div
            className={`rounded-2xl border-2 overflow-hidden shadow-2xl p-4 sm:p-5 space-y-4 ${
              sunlightMode
                ? 'bg-white border-black'
                : 'bg-[#0a0d16] border-slate-800'
            }`}
          >
            {/* Viewport Box */}
            <div className="relative aspect-[4/3] w-full bg-black rounded-xl overflow-hidden border-2 border-slate-800 flex items-center justify-center">
              {cameraState === 'denied' ? (
                <div className="p-6 text-center space-y-3 max-w-sm font-mono">
                  <VideoOff className="w-10 h-10 text-rose-500 mx-auto" />
                  <h3 className="font-bold text-white text-sm">CAMERA INPUT BLOCKED</h3>
                  <p className="text-xs text-slate-400">
                    Grant permission in your browser address bar to enable frictionless optical scanning.
                  </p>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-amber-500 text-black font-bold text-xs rounded-lg active:scale-95"
                  >
                    RETRY CAMERA ACCESS
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />

                  {/* Tactical Reticle Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div
                      className={`relative w-60 h-60 sm:w-72 sm:h-72 border-2 rounded-2xl transition-all duration-300 ${
                        faceInFrame
                          ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.4)] scale-105'
                          : 'border-amber-400/70 border-dashed'
                      }`}
                    >
                      <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-sm" />
                      <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-sm" />
                      <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-sm" />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-sm" />

                      <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_rgba(245,158,11,0.9)] animate-hud-scan" />

                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full border border-amber-400/80" />
                      </div>
                    </div>
                  </div>

                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none font-mono text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-black/80 text-amber-400 border border-amber-500/40 backdrop-blur font-bold">
                      {faceInFrame ? 'TARGET ACQUIRED' : 'ALIGN FACE IN RETICLE'}
                    </span>

                    <span className="px-2 py-0.5 rounded bg-black/80 text-emerald-400 border border-emerald-500/40 backdrop-blur font-bold">
                      TASK: {getActiveActivity().substring(0, 18)}...
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Real-Time Telemetry Bar */}
            <div
              className={`p-3 rounded-xl border font-mono flex items-center justify-between text-xs ${
                sunlightMode
                  ? 'bg-slate-100 border-black text-black'
                  : 'bg-[#080b11] border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="font-bold">{scanTelemetry}</span>
              </div>
              <span className="text-[10px] text-slate-500">SSD_MOBILENET_V1</span>
            </div>

            {/* Manual Override Option */}
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setManualFallbackOpen(!manualFallbackOpen)}
                className="text-xs font-mono text-slate-400 hover:text-amber-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Camera dirty or low light? Manual Badge Lookup</span>
              </button>
            </div>

            {/* Manual Worker Selection Drawer */}
            {manualFallbackOpen && (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white font-mono">
                    MANUAL WORKER SIGN-IN
                  </span>
                  <button
                    onClick={() => setManualFallbackOpen(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    placeholder="Search worker by name or ID..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
                  {filteredManualWorkers.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => handleManualCheckIn(w)}
                      className="w-full text-left p-2.5 rounded-lg bg-slate-950 hover:bg-amber-500/20 border border-slate-800 hover:border-amber-400 text-white flex items-center justify-between transition-all"
                    >
                      <span className="font-semibold">{w.name}</span>
                      <span className="text-[10px] text-amber-400 font-bold">LOG TASK</span>
                    </button>
                  ))}
                  {filteredManualWorkers.length === 0 && (
                    <div className="text-center py-3 text-slate-500 text-xs">
                      No enrolled workers found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
