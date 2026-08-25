'use client';

import React, { useState, useEffect } from 'react';
import { isAdminAuthenticated, verifyAdminPasscodeWithSupabase } from '@/lib/adminAuth';
import { Lock, ShieldAlert, KeyRound, ArrowRight, RefreshCw, Database } from 'lucide-react';

interface AdminGuardProps {
  children: React.ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setAuthenticated(isAdminAuthenticated());

    const handleAuthChange = () => {
      setAuthenticated(isAdminAuthenticated());
    };

    window.addEventListener('safestack_auth_change', handleAuthChange);
    return () => {
      window.removeEventListener('safestack_auth_change', handleAuthChange);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || isVerifying) return;

    setIsVerifying(true);
    setErrorMessage(null);

    const result = await verifyAdminPasscodeWithSupabase(passcode);
    setIsVerifying(false);

    if (result.success) {
      setAuthenticated(true);
    } else {
      setErrorMessage(result.error || 'Invalid passcode.');
    }
  };

  if (!mounted) return null;

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex-1 min-h-[70vh] flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-md bg-[#0a0d16] border-2 border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Top Safety Hazard Stripe */}
        <div className="absolute top-0 left-0 right-0 h-2 hazard-stripes" />

        <div className="text-center space-y-3 pt-2">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-bold uppercase tracking-wider bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
              <Database className="w-3 h-3 text-emerald-400" />
              <span>SUPABASE VERIFIED ACCESS</span>
            </span>
            <h2 className="text-xl font-black text-white font-sans mt-2">
              Administrator Authentication
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Passcode verified securely against Supabase encrypted database table.
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 font-bold uppercase mb-1.5 flex items-center justify-between">
              <span>ADMIN SECURITY PASSCODE</span>
              <span className="text-[10px] text-slate-500 font-normal">SUPABASE CHECKED</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Enter admin passcode..."
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 bg-[#07090e] border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans tracking-widest"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying || !passcode.trim()}
            className="w-full py-3 px-4 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-98 uppercase tracking-wider disabled:opacity-40"
          >
            {isVerifying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>QUERYING SUPABASE DB...</span>
              </>
            ) : (
              <>
                <span>VERIFY WITH SUPABASE</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800/80 text-[10px] text-slate-500 text-center space-y-1">
          <p>SAFESTACK::SYS SUPABASE DYNAMIC AUTH</p>
          <p className="text-slate-600">PREVENTS JS REVERSE-ENGINEERING HACKS</p>
        </div>
      </div>
    </div>
  );
}
