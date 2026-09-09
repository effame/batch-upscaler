"use client";

import { useState, useCallback, useRef } from "react";
import { 
  UploadCloud, 
  Sparkles, 
  Download, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Archive
} from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface BatchItem {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
  status: "idle" | "uploading" | "processing" | "completed" | "error";
  error?: string;
  progress: number;
  upscaledBase64?: string;
  originalWidth?: number;
  originalHeight?: number;
  upscaledWidth?: number;
  upscaledHeight?: number;
}

export default function Home() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [scale, setScale] = useState<number>(4);
  const [faceEnhance, setFaceEnhance] = useState<boolean>(false);
  const [removeBg, setRemoveBg] = useState<boolean>(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (newFiles.length === 0) return;

    const newItems: BatchItem[] = newFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      const item: BatchItem = {
        id: Math.random().toString(36).substring(2, 11),
        file,
        name: file.name,
        previewUrl,
        status: "idle",
        progress: 0,
      };

      const img = new Image();
      img.src = previewUrl;
      img.onload = () => {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, originalWidth: img.naturalWidth, originalHeight: img.naturalHeight }
              : it
          )
        );
      };

      return item;
    });

    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleProcessItem = async (item: BatchItem) => {
    try {
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "processing", progress: 20 } : it))
      );

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(item.file);
      const base64 = await base64Promise;

      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, progress: 40 } : it))
      );

      const res = await fetch("/api/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64,
          scale,
          face_enhance: faceEnhance,
          remove_bg: removeBg,
          model: scale === 2 ? "x2plus" : "x4plus",
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Upscale failed");
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: "completed",
                progress: 100,
                upscaledBase64: data.image,
                upscaledWidth: data.width,
                upscaledHeight: data.height,
              }
            : it
        )
      );
    } catch (err: any) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "error", error: err.message || "Failed" } : it
        )
      );
    }
  };

  const handleStartBatch = async () => {
    const queue = items.filter((it) => it.status === "idle" || it.status === "error");
    if (queue.length === 0) return;

    setIsBatchProcessing(true);

    const CONCURRENCY = 5;
    const running = [...queue];

    const worker = async () => {
      while (running.length > 0) {
        const item = running.shift();
        if (item) {
          await handleProcessItem(item);
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }).map(() => worker()));
    setIsBatchProcessing(false);
  };

  const handleDownloadAllZip = async () => {
    const completed = items.filter((it) => it.status === "completed" && it.upscaledBase64);
    if (completed.length === 0) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();

      completed.forEach((it) => {
        const base64Data = it.upscaledBase64!.split(",")[1] || it.upscaledBase64!;
        const ext = removeBg ? "png" : "jpg";
        const dotIdx = it.name.lastIndexOf(".");
        const rawName = dotIdx !== -1 ? it.name.substring(0, dotIdx) : it.name;
        zip.file(`${rawName}_${scale}x.${ext}`, base64Data, { base64: true });
      });

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `batch_upscaled_${Date.now()}.zip`);
    } catch (e) {
      console.error("ZIP Error:", e);
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadSingle = (item: BatchItem) => {
    if (!item.upscaledBase64) return;
    const ext = removeBg ? "png" : "jpg";
    const dotIdx = item.name.lastIndexOf(".");
    const rawName = dotIdx !== -1 ? item.name.substring(0, dotIdx) : item.name;
    saveAs(item.upscaledBase64, `${rawName}_${scale}x.${ext}`);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleClearAll = () => {
    setItems([]);
  };

  const completedCount = items.filter((it) => it.status === "completed").length;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      <header className="h-16 border-b border-neutral-800 px-6 flex items-center justify-between bg-neutral-900/50 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Batch Upscaler AI</h1>
            <p className="text-xs text-neutral-400">RunPod Serverless 4K GPU Turbo</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setScale(2)}
              className={
                scale === 2
                  ? "px-3 py-1.5 rounded-lg font-medium transition bg-neutral-800 text-cyan-400 shadow-sm"
                  : "px-3 py-1.5 rounded-lg font-medium transition text-neutral-400 hover:text-white"
              }
            >
              2x (2K)
            </button>
            <button
              onClick={() => setScale(4)}
              className={
                scale === 4
                  ? "px-3 py-1.5 rounded-lg font-medium transition bg-neutral-800 text-cyan-400 shadow-sm"
                  : "px-3 py-1.5 rounded-lg font-medium transition text-neutral-400 hover:text-white"
              }
            >
              4x (4K UHD)
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-xl hover:bg-neutral-800 transition">
            <input
              type="checkbox"
              checked={faceEnhance}
              onChange={(e) => setFaceEnhance(e.target.checked)}
              className="rounded accent-cyan-500"
            />
            Face Fix
          </label>

          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-xl hover:bg-neutral-800 transition">
            <input
              type="checkbox"
              checked={removeBg}
              onChange={(e) => setRemoveBg(e.target.checked)}
              className="rounded accent-cyan-500"
            />
            Remove BG
          </label>

          {items.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs text-neutral-400 hover:text-rose-400 px-2 py-1.5 transition"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 flex flex-col gap-6">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-neutral-800 hover:border-cyan-500/50 bg-neutral-900/30 hover:bg-neutral-900/60 transition-all rounded-3xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer group shadow-xl"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && addFiles(e.target.files)}
            multiple
            accept="image/*"
            className="hidden"
          />
          <div className="w-14 h-14 rounded-2xl bg-neutral-800 group-hover:bg-cyan-500/10 group-hover:text-cyan-400 flex items-center justify-center transition text-neutral-400">
            <UploadCloud className="w-7 h-7" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-neutral-200">
              ลากรูปภาพมาวางที่นี่ หรือ <span className="text-cyan-400 underline">คลิกเพื่อเลือกไฟล์</span>
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              รองรับไฟล์ JPG, PNG, WebP — ส่งพร้อมกันทีละ 10 ถึง 50 ภาพได้สบายๆ
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-300">
                ทั้งหมด {items.length} ภาพ
              </span>
              <span className="text-xs text-neutral-500">|</span>
              <span className="text-xs text-emerald-400 font-medium">
                เสร็จสิ้นแล้ว {completedCount}/{items.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {completedCount > 0 && (
                <button
                  onClick={handleDownloadAllZip}
                  disabled={isZipping}
                  className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition shadow"
                >
                  {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4 text-cyan-400" />}
                  Download All as ZIP ({completedCount})
                </button>
              )}

              <button
                onClick={handleStartBatch}
                disabled={isBatchProcessing || items.every((it) => it.status === "completed")}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-lg shadow-cyan-500/20"
              >
                {isBatchProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังประมวลผลบน GPU...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    เริ่ม Upscale ทั้งหมด ({items.filter((it) => it.status !== "completed").length})
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 flex gap-3 relative overflow-hidden group shadow-md"
            >
              <div className="w-24 h-24 rounded-xl bg-neutral-950 shrink-0 overflow-hidden relative border border-neutral-800">
                <img
                  src={item.upscaledBase64 || item.previewUrl}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
                {item.status === "processing" && (
                  <div className="absolute inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div>
                  <h4 className="text-xs font-semibold text-neutral-200 truncate" title={item.name}>
                    {item.name}
                  </h4>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    {item.originalWidth ? `${item.originalWidth}×${item.originalHeight}` : "—"}
                    {item.upscaledWidth && (
                      <span className="text-cyan-400 font-medium ml-1">
                        → {item.upscaledWidth}×{item.upscaledHeight} ({scale}x)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div>
                    {item.status === "idle" && (
                      <span className="text-[11px] text-neutral-500 font-medium">รอคิว</span>
                    )}
                    {item.status === "processing" && (
                      <span className="text-[11px] text-cyan-400 font-medium flex items-center gap-1">
                        กำลังรัน GPU ({item.progress}%)
                      </span>
                    )}
                    {item.status === "completed" && (
                      <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        เสร็จสิ้น
                      </span>
                    )}
                    {item.status === "error" && (
                      <span className="text-[11px] text-rose-400 font-medium flex items-center gap-1" title={item.error}>
                        <AlertCircle className="w-3.5 h-3.5" />
                        เกิดข้อผิดพลาด
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {item.status === "completed" && item.upscaledBase64 && (
                      <button
                        onClick={() => handleDownloadSingle(item)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition"
                        title="ดาวน์โหลด"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-neutral-500 hover:text-rose-400 transition"
                      title="ลบ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
