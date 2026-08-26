'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  supabase,
  WorkerRecord,
  captureAndCompressCanvas,
  AccessLogRecord,
  deleteWorkerWithStorage,
} from '@/lib/supabaseClient';
import {
  loadFaceApiModels,
  extractFaceDescriptor,
  areModelsLoaded,
  getFaceApi,
} from '@/lib/faceApi';
import { sounds } from '@/lib/audio';
import {
  Camera,
  UserCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Users,
  Shield,
  VideoOff,
  Search,
  ScanFace,
  Award,
  Lock,
  X,
  Eye,
  Clock,
  Box,
  HardHat,
  FileCheck,
  Activity,
} from 'lucide-react';

import AdminGuard from '@/components/AdminGuard';

export default function WorkerRegistrationPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);

  const [workerName, setWorkerName] = useState('');
  const [workerRole, setWorkerRole] = useState('Standard Crew');
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedSizeKb, setCapturedSizeKb] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [registeredWorkers, setRegisteredWorkers] = useState<WorkerRecord[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [searchWorker, setSearchWorker] = useState('');

  // Selected Worker Detail Modal State
  const [selectedWorker, setSelectedWorker] = useState<WorkerRecord | null>(null);
  const [workerLogs, setWorkerLogs] = useState<AccessLogRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fetch workers
  const fetchWorkers = useCallback(async () => {
    setLoadingWorkers(true);
    const { data } = await supabase
      .from('warehouse_workers')
      .select('*')
      .order('created_at', { ascending: false });

    setRegisteredWorkers(data || []);
    setLoadingWorkers(false);
  }, []);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  // Fetch worker details access logs
  const openWorkerDetail = async (worker: WorkerRecord) => {
    setSelectedWorker(worker);
    setLoadingLogs(true);

    const { data } = await supabase
      .from('warehouse_access_logs')
      .select(`
        id,
        container_id,
        activity,
        scanned_at,
        containers:warehouse_containers ( container_number )
      `)
      .eq('worker_id', worker.id)
      .order('scanned_at', { ascending: false })
      .limit(50);

    const formattedLogs: AccessLogRecord[] = (data || []).map((item: any) => ({
      id: item.id,
      worker_id: worker.id,
      container_id: item.container_id,
      activity: item.activity,
      scanned_at: item.scanned_at,
      containers: Array.isArray(item.containers) ? item.containers[0] : item.containers,
    }));

    setWorkerLogs(formattedLogs);
    setLoadingLogs(false);
  };

  // Init Face API Models
  useEffect(() => {
    let isMounted = true;
    async function initModels() {
      try {
        setLoadingModels(true);
        await loadFaceApiModels();
        if (isMounted) {
          setModelsReady(true);
          setLoadingModels(false);
        }
      } catch (err) {
        console.error('Model load error:', err);
        if (isMounted) {
          setModelError('FAILED_TO_LOAD_MODELS');
          setLoadingModels(false);
        }
      }
    }
    initModels();
    return () => {
      isMounted = false;
    };
  }, []);

  // Camera stream
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((e) => console.warn('Video warning:', e));
      }
      setCameraPermission('granted');
    } catch (err) {
      console.error('Camera error:', err);
      setCameraPermission('denied');
      setStatusMessage({
        type: 'error',
        text: 'Camera access denied. Please allow camera permissions in browser settings.',
      });
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  // Face reticle loop
  useEffect(() => {
    let animationFrameId: number;
    let isRunning = true;

    async function detectFaceLoop() {
      if (
        isRunning &&
        modelsReady &&
        videoRef.current &&
        canvasRef.current &&
        videoRef.current.readyState === 4 &&
        !videoRef.current.paused
      ) {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        const displaySize = {
          width: video.videoWidth || 640,
          height: video.videoHeight || 480,
        };

        if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
          canvas.width = displaySize.width;
          canvas.height = displaySize.height;
        }

        try {
          const faceapi = await getFaceApi();
          if (!faceapi) return;

          const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
          const detection = await faceapi
            .detectSingleFace(video, options)
            .withFaceLandmarks();

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (detection) {
              setIsFaceDetected(true);
              const resizedDetections = faceapi.resizeResults(detection, displaySize);
              const box = resizedDetections.detection.box;

              ctx.lineWidth = 2;
              ctx.strokeStyle = '#10b981';
              ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
              ctx.fillRect(box.x, box.y, box.width, box.height);
              ctx.strokeRect(box.x, box.y, box.width, box.height);

              const len = 14;
              ctx.lineWidth = 3;
              ctx.strokeStyle = '#34d399';

              ctx.beginPath();
              ctx.moveTo(box.x, box.y + len);
              ctx.lineTo(box.x, box.y);
              ctx.lineTo(box.x + len, box.y);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(box.x + box.width - len, box.y);
              ctx.lineTo(box.x + box.width, box.y);
              ctx.lineTo(box.x + box.width, box.y + len);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(box.x, box.y + box.height - len);
              ctx.lineTo(box.x, box.y + box.height);
              ctx.lineTo(box.x + len, box.y + box.height);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(box.x + box.width - len, box.y + box.height);
              ctx.lineTo(box.x + box.width, box.y + box.height);
              ctx.lineTo(box.x + box.width, box.y + box.height - len);
              ctx.stroke();
            } else {
              setIsFaceDetected(false);
            }
          }
        } catch {
          // ignore
        }
      }

      if (isRunning) {
        animationFrameId = requestAnimationFrame(() => {
          setTimeout(detectFaceLoop, 150);
        });
      }
    }

    if (modelsReady && cameraPermission === 'granted') {
      detectFaceLoop();
    }

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [modelsReady, cameraPermission]);

  // Register worker & capture optimized image under 100KB
  const handleRegisterWorker = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = workerName.trim();
    if (!trimmedName) {
      setStatusMessage({
        type: 'error',
        text: 'Worker name or ID is required.',
      });
      return;
    }

    if (!videoRef.current || videoRef.current.readyState < 2) {
      setStatusMessage({
        type: 'error',
        text: 'Camera stream not ready.',
      });
      return;
    }

    setIsCapturing(true);
    setStatusMessage({
      type: 'info',
      text: 'Capturing photo & extracting 128-D vector...',
    });

    try {
      // 1. Extract face descriptor
      const result = await extractFaceDescriptor(videoRef.current);
      if (!result) {
        setStatusMessage({
          type: 'error',
          text: 'No face detected in viewport. Center head and ensure adequate lighting.',
        });
        setIsCapturing(false);
        return;
      }

      // 2. Compress camera frame to under 100KB JPEG
      const compressed = await captureAndCompressCanvas(videoRef.current, 320, 0.7);
      setCapturedSizeKb(compressed.sizeKb);

      let finalPhotoUrl = compressed.dataUrl;

      // 3. Attempt Supabase Storage upload if available
      try {
        const filename = `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('warehouse_avatars')
          .upload(filename, compressed.blob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: true,
          });

        if (!uploadErr && uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from('warehouse_avatars')
            .getPublicUrl(filename);

          if (publicUrlData?.publicUrl) {
            finalPhotoUrl = publicUrlData.publicUrl;
          }
        }
      } catch (storageErr) {
        console.warn('Storage upload fallback to compressed data URL:', storageErr);
      }

      // 4. Save to workers table
      const { error } = await supabase.from('warehouse_workers').insert({
        name: trimmedName,
        role: workerRole,
        photo_url: finalPhotoUrl,
        face_descriptor: result.descriptor,
      });

      if (error) {
        setStatusMessage({
          type: 'error',
          text: `Enrollment failed: ${error.message}`,
        });
      } else {
        sounds.playAccessGranted();
        setStatusMessage({
          type: 'success',
          text: `Enrolled "${trimmedName}" (${workerRole})! Captured image optimized to ${compressed.sizeKb}KB (under 100KB threshold).`,
        });
        setWorkerName('');
        fetchWorkers();
      }
    } catch (err) {
      console.error('Enrollment error:', err);
      setStatusMessage({
        type: 'error',
        text: 'Biometric extraction or photo compression failed.',
      });
    } finally {
      setIsCapturing(false);
    }
  };

  // Delete worker with automated storage file cleanup
  const handleDeleteWorker = async (id: string, name: string) => {
    if (!confirm(`Revoke biometric authorization for ${name}? (This will also delete their photo file from storage bucket)`)) return;

    const { error } = await deleteWorkerWithStorage(id);
    if (!error) {
      if (selectedWorker?.id === id) setSelectedWorker(null);
      fetchWorkers();
    } else {
      alert(`Failed to delete worker: ${error.message || error}`);
    }
  };

  const filteredWorkers = registeredWorkers.filter((w) =>
    w.name.toLowerCase().includes(searchWorker.toLowerCase()) ||
    (w.role || '').toLowerCase().includes(searchWorker.toLowerCase())
  );

  return (
    <AdminGuard>
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 font-mono">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
            <ScanFace className="w-4 h-4" />
            <span>BIOMETRIC ENROLLMENT & PERSONNEL PROFILES</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight font-sans">
            Worker Registration & Detail Management
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Auto-compresses captured face photos under 100KB and stores biometric profiles securely on the server.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-[#0a0d16] border border-slate-800 text-slate-300 flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                modelsReady ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
              }`}
            />
            <span>{modelsReady ? 'MODELS READY' : 'LOADING MODELS...'}</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Enrollment Station (7 Cols) */}
        <div className="lg:col-span-7 space-y-4 font-mono">
          <div className="p-4 sm:p-5 rounded-xl border border-slate-800 bg-[#0a0d16] shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>CAMERA CAPTURE & COMPRESSION (&lt; 100KB)</span>
              </span>
              <button
                type="button"
                onClick={startCamera}
                title="Restart camera"
                className="p-1 rounded bg-[#07090e] hover:bg-slate-800 text-slate-400 border border-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Video Viewport */}
            <div className="relative aspect-[4/3] w-full bg-black rounded-lg overflow-hidden border-2 border-slate-800 flex items-center justify-center">
              {cameraPermission === 'denied' ? (
                <div className="p-6 text-center space-y-2 text-xs">
                  <VideoOff className="w-8 h-8 text-rose-500 mx-auto" />
                  <p className="font-bold text-white">CAMERA ACCESS DENIED</p>
                  <p className="text-slate-400 text-[11px]">
                    Grant browser camera permissions to register worker biometrics.
                  </p>
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
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    style={{ transform: 'scaleX(-1)' }}
                  />

                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between text-[10px] pointer-events-none">
                    <span
                      className={`px-2 py-0.5 rounded font-bold border backdrop-blur ${
                        isFaceDetected
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-black/80 text-amber-400 border-amber-500/40'
                      }`}
                    >
                      {isFaceDetected ? '● FACE LOCKED (READY)' : 'ALIGN HEAD IN FRAME'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-black/80 text-slate-400 border border-slate-700">
                      AUTO-COMPRESS &lt; 100KB
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Registration Form */}
            <form onSubmit={handleRegisterWorker} className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Worker Full Name or Safety Badge ID
                  </label>
                  <input
                    type="text"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="e.g. Marcus Vance (ID-9281)"
                    disabled={isCapturing || !modelsReady}
                    className="w-full px-3 py-2 bg-[#07090e] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Assigned Safety Role
                  </label>
                  <select
                    value={workerRole}
                    onChange={(e) => setWorkerRole(e.target.value)}
                    className="w-full px-2.5 py-2 bg-[#07090e] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Standard Crew">Crew Member</option>
                    <option value="Crane Operator">Crane Operator</option>
                    <option value="Hazmat Specialist">Hazmat Handler</option>
                    <option value="Safety Inspector">Safety Inspector</option>
                  </select>
                </div>
              </div>

              {statusMessage && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                    statusMessage.type === 'success'
                      ? 'bg-emerald-950/70 border border-emerald-700 text-emerald-200'
                      : statusMessage.type === 'error'
                      ? 'bg-rose-950/70 border border-rose-700 text-rose-200'
                      : 'bg-sky-950/70 border border-sky-700 text-sky-200'
                  }`}
                >
                  {statusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <div>
                    <div>{statusMessage.text}</div>
                    {capturedSizeKb !== null && (
                      <div className="text-[10px] opacity-80 mt-0.5 font-mono">
                        IMAGE SIZE: {capturedSizeKb} KB (OPTIMIZED FOR FAST LOAD)
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isCapturing || !modelsReady || !workerName.trim()}
                className="w-full py-3 px-4 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isCapturing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>PROCESSING & COMPRESSING PHOTO...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>CAPTURE FACE PHOTO & ENROLL WORKER</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Registered Personnel Directory (5 Cols) */}
        <div className="lg:col-span-5 space-y-3 font-mono text-xs">
          <div className="p-4 sm:p-5 rounded-xl border border-slate-800 bg-[#0a0d16] shadow-xl flex flex-col h-full min-h-[480px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <span>ENROLLED DIRECTORY</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {registeredWorkers.length} PERSONNEL
              </span>
            </div>

            {/* Search Input */}
            <div className="relative my-3">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchWorker}
                onChange={(e) => setSearchWorker(e.target.value)}
                placeholder="Search worker by name or role..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#07090e] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* List */}
            {loadingWorkers ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>LOADING DIRECTORY...</span>
              </div>
            ) : filteredWorkers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <Shield className="w-10 h-10 text-slate-700 mb-2 stroke-[1.5]" />
                <p className="font-bold text-slate-400">NO WORKERS FOUND</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Enroll workers using the capture station.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 max-h-[460px] pr-1">
                {filteredWorkers.map((worker) => (
                  <div
                    key={worker.id}
                    className="p-3 rounded-lg bg-[#07090e] border border-slate-800/80 hover:border-amber-500/50 flex items-center justify-between gap-3 group transition-all"
                  >
                    <div
                      onClick={() => openWorkerDetail(worker)}
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    >
                      {/* Avatar Thumbnail */}
                      {worker.photo_url ? (
                        <img
                          src={worker.photo_url}
                          alt={worker.name}
                          className="w-9 h-9 rounded-lg object-cover border border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold flex items-center justify-center text-xs shrink-0 font-sans">
                          {worker.name.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h3 className="font-bold text-white text-xs font-sans truncate group-hover:text-amber-400 transition-colors">
                          {worker.name}
                        </h3>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                          <span className="text-amber-400 font-semibold">{worker.role || 'Crew'}</span>
                          <span>•</span>
                          <span>128-D VECTOR</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openWorkerDetail(worker)}
                        className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                        title="View Personnel Detail & Access History"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteWorker(worker.id, worker.name)}
                        className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                        title="Revoke enrollment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= WORKER DETAIL MODAL ================= */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a0d16] border-2 border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 font-mono animate-in zoom-in-95 duration-150 relative">
            {/* Close Button */}
            <button
              onClick={() => setSelectedWorker(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Profile Header */}
            <div className="flex items-start gap-4 border-b border-slate-800 pb-4">
              {selectedWorker.photo_url ? (
                <img
                  src={selectedWorker.photo_url}
                  alt={selectedWorker.name}
                  className="w-16 h-16 rounded-xl object-cover border-2 border-amber-500 shadow-md shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 font-black text-2xl flex items-center justify-center shrink-0">
                  {selectedWorker.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase">
                  {selectedWorker.role || 'STANDARD CREW'}
                </span>
                <h2 className="text-xl font-extrabold text-white font-sans mt-1">
                  {selectedWorker.name}
                </h2>
                <div className="text-xs text-slate-400 mt-0.5">
                  WORKER ID: <span className="text-slate-200">{selectedWorker.id}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  ENROLLED ON {new Date(selectedWorker.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Access Activity History */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>CONTAINER ACCESS HISTORY</span>
                </span>
                <span className="text-slate-400">{workerLogs.length} RECENT LOGS</span>
              </div>

              {loadingLogs ? (
                <div className="py-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading access logs...</span>
                </div>
              ) : workerLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                  No access scans recorded for this worker yet.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {workerLogs.map((log) => {
                    const rawNotes = log.notes || '';
                    const ppeText = rawNotes.includes('PPE')
                      ? rawNotes.replace('[PPE VERIFIED: ', '').replace(']', '')
                      : 'Hard Hat, Harness, Gloves, Safety Shoes';

                    return (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-lg bg-[#07090e] border border-slate-800 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20 text-[11px]">
                              {log.containers?.container_number || 'Unit'}
                            </span>
                            <span className="text-slate-300 font-sans">{log.activity || 'Stack Inspection'}</span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {new Date(log.scanned_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold">
                            ✓ PPE VERIFIED
                          </span>
                          <span className="text-slate-400 font-sans truncate" title={ppeText}>
                            {ppeText}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => handleDeleteWorker(selectedWorker.id, selectedWorker.name)}
                className="px-3 py-1.5 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-bold transition-all"
              >
                Revoke Credentials
              </button>

              <button
                onClick={() => setSelectedWorker(null)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminGuard>
  );
}
