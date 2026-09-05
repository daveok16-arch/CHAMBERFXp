import { useState, useEffect } from "react";
// Subcomponents import
// @ts-ignore
import Dashboard from "./components/Dashboard";

export default function App() {
  const [utcTime, setUtcTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#04060c] text-slate-100 font-sans flex flex-col selection:bg-amber-500/20" id="applet-container">
      {/* Main Content Workspace Layout with Premium Container Padding */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 md:px-6 py-6 flex flex-col" id="applet-viewport">
        <Dashboard />
      </main>

      {/* Footer banner */}
      <footer className="border-t border-slate-800/70 bg-[#060a12] py-4 px-6 text-center" id="applet-footer">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2 text-[11px] md:text-xs text-slate-500 uppercase tracking-widest font-semibold font-mono">
          <span>CHAMBERFX <span className="text-slate-600">·</span> Private Institutional Terminal</span>
          <span className="text-amber-500/90 font-bold">Spot × Futures Quantitative Intelligence</span>
          <span className="hidden lg:block text-slate-600">Data latency ≤ 30s · Fallbacks active</span>
        </div>
      </footer>
    </div>
  );
}

