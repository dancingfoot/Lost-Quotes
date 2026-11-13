import React from 'react';
import { X, Download, CircleDot } from 'lucide-react';

interface RecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioUrl: string | null;
  audioBlob: Blob | null;
}

export const RecordingModal: React.FC<RecordingModalProps> = ({
  isOpen,
  onClose,
  audioUrl,
  audioBlob,
}) => {
  if (!isOpen || !audioUrl) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `lost-quotes-session-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13161e] w-full max-w-md rounded-xl border border-zinc-800 p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <CircleDot className="w-4 h-4 text-red-500" />
            <div>
              <h3 className="text-sm font-semibold text-white">Recorded Tape Session</h3>
              <p className="text-xs text-zinc-400">Captured loops, scratches, and effects</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[#0c0e13] p-3.5 rounded-lg border border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>Session Audio</span>
            <span className="text-zinc-200">
              {audioBlob ? `${(audioBlob.size / 1024).toFixed(1)} KB` : ''}
            </span>
          </div>
          <audio controls src={audioUrl} className="w-full h-9 accent-amber-500" />
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleDownload}
            className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Audio</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg bg-[#1a1e29] hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-700/70 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
