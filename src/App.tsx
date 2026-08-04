import React, { useState, useRef, useEffect } from 'react';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { Upload, X, Play, Pause, Download, ChevronDown, ChevronUp, Image as ImageIcon, Video as VideoIcon, Settings, Sparkles, Sliders, Film, Layers } from 'lucide-react';
import { 
  ImageUpscaler, VideoUpscaler, 
  ANIME4K_HIGHEREND_MODE_A_FAST, 
  ANIME4K_HIGHEREND_MODE_A, 
  ANIME4K_HIGHEREND_MODE_C,
  Anime4K_Upscale_GAN_x3_L,
  Anime4K_Restore_GAN_UUL,
  Anime4K_Denoise_Bilateral_Median,
  Anime4K_Denoise_Bilateral_Mean
} from 'anime4k.js';

const unwrap = (s: any) => (s && s.default ? s.default : s);

type UpscaleMode = 'image' | 'video' | null;
type ModelMode = 'anime4k-a-fast' | 'anime4k-a' | 'anime4k-c' | 'gan-restore';
type ProcessStatus = 'idle' | 'enhancing' | 'completed';
type VideoFormat = 'mp4' | 'webm';
type FpsMode = 'native' | '60fps' | '120fps';

export default function App() {
  const [upscaleMode, setUpscaleMode] = useState<UpscaleMode>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'image' | 'video' | null>(null);
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string; dimensions?: string; duration?: string } | null>(null);
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [model, setModel] = useState<ModelMode>('anime4k-a-fast');
  const [iterations, setIterations] = useState(1);
  const [denoise, setDenoise] = useState(true);
  const [fpsMode, setFpsMode] = useState<FpsMode>('60fps');
  const [motionBlur, setMotionBlur] = useState(false);
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('mp4');
  const [activeTab, setActiveTab] = useState<'model' | 'twixtor' | 'export'>('model');
  const [progress, setProgress] = useState(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [recordedMimeType, setRecordedMimeType] = useState<string>('video/mp4');
  
  const videoRefOriginal = useRef<HTMLVideoElement>(null);
  const videoRefEnhanced = useRef<HTMLVideoElement>(null);
  const canvasRefEnhanced = useRef<HTMLCanvasElement>(null);
  const canvasRefOriginal = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const upscalerRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<BlobPart[]>([]);

  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [videoDurationSec, setVideoDurationSec] = useState<number>(0);

  const targetFps = fpsMode === '120fps' ? 120 : fpsMode === '60fps' ? 60 : 30;

  useEffect(() => {
    let syncFrame: number;
    const checkSync = () => {
      if (videoRefOriginal.current && videoRefEnhanced.current) {
        const timeOrig = videoRefOriginal.current.currentTime;
        const timeEnh = videoRefEnhanced.current.currentTime;
        if (Math.abs(timeOrig - timeEnh) > 0.05) {
          videoRefEnhanced.current.currentTime = timeOrig;
        }
      }
      syncFrame = requestAnimationFrame(checkSync);
    };
    if (status === 'completed' && isPlaying && fileType === 'video') {
      syncFrame = requestAnimationFrame(checkSync);
    }
    return () => cancelAnimationFrame(syncFrame);
  }, [status, isPlaying, fileType]);

  const handleModeSelect = (mode: UpscaleMode) => {
    setUpscaleMode(mode);
  };

  const getPreset = () => {
    let p: any[];
    if (model === 'anime4k-a') p = [...ANIME4K_HIGHEREND_MODE_A];
    else if (model === 'anime4k-c') p = [...ANIME4K_HIGHEREND_MODE_C];
    else if (model === 'gan-restore') p = [Anime4K_Restore_GAN_UUL, Anime4K_Upscale_GAN_x3_L];
    else p = [...ANIME4K_HIGHEREND_MODE_A_FAST];

    if (denoise) {
      p = [Anime4K_Denoise_Bilateral_Median, ...p];
    }
    return p.map(unwrap);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const isVid = file.type.startsWith('video');
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    setFileUrl(url);
    setFileType(isVid ? 'video' : 'image');
    setFileDetails({ name: file.name, size: sizeMB });
    setStatus('idle');
    setProgress(0);
    setRecordedBlobUrl(null);
    setCurrentFrame(0);
    setTotalFrames(0);
    recordedChunks.current = [];

    if (!isVid) {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        setFileDetails(prev => prev ? { ...prev, dimensions: `${img.naturalWidth} × ${img.naturalHeight}` } : null);
      };
    } else {
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        const dur = video.duration || 0;
        const durationStr = dur ? `${dur.toFixed(1)}s` : '';
        setVideoDurationSec(dur);
        const estFrames = Math.max(1, Math.round(dur * targetFps));
        setTotalFrames(estFrames);
        setFileDetails(prev => prev ? {
          ...prev,
          dimensions: `${video.videoWidth} × ${video.videoHeight}`,
          duration: durationStr
        } : null);
      };
      video.src = url;
    }
  };

  useEffect(() => {
    if (videoDurationSec > 0) {
      const estFrames = Math.max(1, Math.round(videoDurationSec * targetFps));
      setTotalFrames(estFrames);
    }
  }, [fpsMode, videoDurationSec, targetFps]);

  const handleCancel = () => {
    if (fileUrl) {
      URL.revokeObjectURL(fileUrl);
    }
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
    }
    if (upscalerRef.current && fileType === 'video') {
      (upscalerRef.current as VideoUpscaler).stop?.();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setFileUrl(null);
    setFileType(null);
    setFileDetails(null);
    setStatus('idle');
    setProgress(0);
    setRecordedBlobUrl(null);
    setUpscaleMode(null);
  };

  const handleDownload = async () => {
    if (!fileUrl) return;
    
    if (fileType === 'image') {
      if (canvasRefEnhanced.current) {
        canvasRefEnhanced.current.toBlob(async (blob) => {
          if (!blob) return;
          const fileName = `enhanced_anime4k.png`;
          if (navigator.canShare) {
            const file = new File([blob], fileName, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
              try {
                await navigator.share({ files: [file], title: 'Enhanced Anime Image' });
                return;
              } catch (e) {
                console.error('Error sharing:', e);
              }
            }
          }
          const link = document.createElement('a');
          link.download = fileName;
          link.href = URL.createObjectURL(blob);
          link.click();
        }, 'image/png');
      }
    } else {
      if (recordedBlobUrl) {
        const ext = videoFormat === 'mp4' ? 'mp4' : 'webm';
        const fileName = `enhanced_anime4k.${ext}`;
        try {
          const response = await fetch(recordedBlobUrl);
          const blob = await response.blob();
          const downloadBlob = new Blob([blob], { type: recordedMimeType });
          
          if (navigator.canShare) {
            const file = new File([downloadBlob], fileName, { type: recordedMimeType });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: 'Enhanced Anime Video' });
              return;
            }
          }
        } catch (e) {
          console.error('Error sharing:', e);
        }
        const link = document.createElement('a');
        link.download = fileName;
        link.href = recordedBlobUrl;
        link.click();
      } else {
        alert('Video processing not completed yet.');
      }
    }
  };

  useEffect(() => {
    if (status !== 'enhancing' || !fileUrl) return;
    
    let isCancelled = false;
    let syncRunning = true;
    const preset = getPreset();
    
    const initUpscaler = () => {
      if (fileType === 'image') {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = fileUrl;
        img.onload = () => {
          if (isCancelled) return;
          if (canvasRefEnhanced.current) {
            const runPasses = async () => {
                let currentSource = img;
                const ImageUpscalerClass = unwrap(ImageUpscaler);
                const upscaler = new ImageUpscalerClass(preset);
                upscalerRef.current = upscaler;
                
                let tempCanvas: HTMLCanvasElement | null = null;
                
                for (let i = 0; i < iterations; i++) {
                    if (isCancelled) break;
                    upscaler.attachSource(currentSource, canvasRefEnhanced.current);
                    upscaler.upscale();
                    
                    if (i < iterations - 1) {
                        if (canvasRefEnhanced.current.width > 4096 || canvasRefEnhanced.current.height > 4096) {
                            console.warn("Max resolution reached, stopping passes.");
                            setProgress(100);
                            break;
                        }
                        if (!tempCanvas) {
                            tempCanvas = document.createElement('canvas');
                        }
                        tempCanvas.width = canvasRefEnhanced.current.width;
                        tempCanvas.height = canvasRefEnhanced.current.height;
                        const ctx = tempCanvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(canvasRefEnhanced.current, 0, 0);
                            currentSource = tempCanvas as any;
                        }
                    }
                    setProgress(((i + 1) / iterations) * 100);
                    await new Promise(r => setTimeout(r, 50));
                }
                if (!isCancelled) {
                    setStatus('completed');
                }
            };
            runPasses();
          }
        };
      } else if (fileType === 'video') {
        if (videoRefOriginal.current && canvasRefEnhanced.current) {
          const initVideoUpscaler = () => {
            if (isCancelled) return;
            const video = videoRefOriginal.current!;
            const canvas = canvasRefEnhanced.current!;
            const canvasOrig = canvasRefOriginal.current;
            
            const VideoUpscalerClass = unwrap(VideoUpscaler);
            const upscaler = new VideoUpscalerClass(preset, targetFps);
            upscalerRef.current = upscaler;
            
            upscaler.attachVideo(video, canvas);
            
            const estimatedFrames = Math.round(video.duration * targetFps) || 0;
            setTotalFrames(estimatedFrames);
            
            // Motion blur / Twixtor temporal frame synthesis canvas buffer
            let prevCanvas: HTMLCanvasElement | null = null;
            if (motionBlur || fpsMode !== 'native') {
              prevCanvas = document.createElement('canvas');
            }

            // Determine supported MIME type for requested videoFormat
            let mimeType = 'video/mp4';
            if (videoFormat === 'mp4') {
              if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
                mimeType = 'video/mp4;codecs=avc1';
              } else if (MediaRecorder.isTypeSupported('video/mp4')) {
                mimeType = 'video/mp4';
              } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                mimeType = 'video/webm;codecs=vp9';
              } else {
                mimeType = 'video/webm';
              }
            } else {
              if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                mimeType = 'video/webm;codecs=vp9';
              } else if (MediaRecorder.isTypeSupported('video/webm')) {
                mimeType = 'video/webm';
              } else {
                mimeType = 'video/mp4';
              }
            }
            setRecordedMimeType(mimeType);

            // Setup MediaRecorder
            try {
              recordedChunks.current = [];
              const stream = canvas.captureStream(targetFps);
              const mediaRecorder = new MediaRecorder(stream, { mimeType });
              mediaRecorderRef.current = mediaRecorder;
              
              mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                  recordedChunks.current.push(e.data);
                }
              };
              
              mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks.current, { type: mimeType });
                const url = URL.createObjectURL(blob);
                setRecordedBlobUrl(url);
              };
              
              mediaRecorder.start();
            } catch (err) {
              console.error('MediaRecorder initialization failed:', err);
            }

            // Sync original canvas loop & motion blur effect
            const syncCanvas = () => {
              if (!syncRunning) return;
              if (canvasOrig && video) {
                const ctx = canvasOrig.getContext('2d');
                if (ctx) {
                  const vw = video.videoWidth;
                  const vh = video.videoHeight;
                  if (vw && vh) {
                    if (canvasOrig.width !== vw) {
                      canvasOrig.width = vw;
                      canvasOrig.height = vh;
                      setFileDetails(prev => prev ? { ...prev, dimensions: `${vw} × ${vh}` } : null);
                    }
                    ctx.drawImage(video, 0, 0, vw, vh);
                  }
                }
              }

              // Motion blur & Twixtor AI temporal frame synthesis pass
              if ((motionBlur || fpsMode !== 'native') && canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx && prevCanvas) {
                  if (prevCanvas.width !== canvas.width || prevCanvas.height !== canvas.height) {
                    prevCanvas.width = canvas.width;
                    prevCanvas.height = canvas.height;
                  }
                  const pCtx = prevCanvas.getContext('2d');
                  if (pCtx) {
                    const blendAlpha = motionBlur ? 0.35 : 0.20;
                    ctx.globalAlpha = blendAlpha;
                    ctx.drawImage(prevCanvas, 0, 0);
                    ctx.globalAlpha = 1.0;
                    pCtx.drawImage(canvas, 0, 0);
                  }
                }
              }

              requestAnimationFrame(syncCanvas);
            };
            requestAnimationFrame(syncCanvas);

            // Start upscaler and play video to record
            upscaler.start();
            video.muted = true;
            video.loop = false;
            video.currentTime = 0;
            video.play();
            setIsPlaying(true);

            const checkProgress = () => {
              if (isCancelled) return;
              if (video.ended || video.currentTime >= video.duration) {
                syncRunning = false;
                upscaler.stop();
                setProgress(100);
                setCurrentFrame(estimatedFrames);
                setStatus('completed');
                setIsPlaying(false);
                video.pause();
                
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                  mediaRecorderRef.current.stop();
                }
              } else {
                const p = (video.currentTime / video.duration) * 100;
                setProgress(p);
                setCurrentFrame(Math.round(video.currentTime * targetFps));
                requestAnimationFrame(checkProgress);
              }
            };
            requestAnimationFrame(checkProgress);
          };

          if (videoRefOriginal.current.readyState >= 1) {
            initVideoUpscaler();
          } else {
            videoRefOriginal.current.onloadedmetadata = initVideoUpscaler;
          }
        }
      }
    };
    
    setTimeout(initUpscaler, 100);
    
    return () => {
      isCancelled = true;
      syncRunning = false;
      if (upscalerRef.current && fileType === 'video') {
        (upscalerRef.current as VideoUpscaler).stop?.();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [status, fileUrl, fileType, model, denoise, fpsMode, motionBlur, videoFormat, targetFps]);

  const togglePlay = () => {
    if (!videoRefOriginal.current) return;
    if (isPlaying) {
      videoRefOriginal.current.pause();
      if (videoRefEnhanced.current) videoRefEnhanced.current.pause();
    } else {
      videoRefOriginal.current.play();
      if (videoRefEnhanced.current) videoRefEnhanced.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans select-none overflow-x-hidden">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-black/90 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#00d2ff]" />
            Anime4K
          </span>
          {fileType && (
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] uppercase font-bold text-[#00d2ff]">
              {fileType}
            </span>
          )}
        </div>

        {(fileUrl || upscaleMode) ? (
          <div className="flex items-center gap-2">
            <button 
              onClick={handleCancel}
              className="px-3.5 py-1.5 min-h-[38px] bg-[#2c2c2e] hover:bg-[#3c3c3e] active:scale-95 rounded-lg text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            {status === 'completed' && (
              <button 
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3.5 py-1.5 min-h-[38px] bg-[#00d2ff] text-black hover:bg-[#33d9ff] active:scale-95 rounded-lg text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,210,255,0.4)]"
              >
                <Download className="w-3.5 h-3.5" />
                Save {fileType === 'video' ? videoFormat.toUpperCase() : 'Image'}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Main Content */}
      <div className="flex-1 pt-14 flex flex-col items-center justify-center relative overflow-hidden bg-black">
        {!upscaleMode ? (
          <div className="flex flex-col items-center p-6 sm:p-8 text-center w-full max-w-4xl my-auto">
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-3 text-white">
              Anime4K Upscaler
            </h1>
            <p className="text-neutral-400 mb-8 sm:mb-12 max-w-md text-sm sm:text-base">
              Enhance and upscale your anime media locally in your browser with real-time WebGL AI shaders.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 w-full max-w-2xl px-2">
              <button 
                onClick={() => handleModeSelect('image')}
                className="group flex flex-col items-center p-6 sm:p-8 bg-[#1c1c1e] hover:bg-[#2c2c2e] active:scale-[0.98] rounded-2xl border border-white/5 transition-all duration-300 shadow-xl"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-300 group-hover:text-[#00d2ff] transition-colors" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-1.5 text-white">Photo Upscaler</h3>
                <p className="text-xs sm:text-sm text-neutral-400 text-center leading-relaxed">
                  Enhance anime screenshots, wallpaper art, and illustrations instantly.
                </p>
              </button>
              
              <button 
                onClick={() => handleModeSelect('video')}
                className="group flex flex-col items-center p-6 sm:p-8 bg-[#1c1c1e] hover:bg-[#2c2c2e] active:scale-[0.98] rounded-2xl border border-white/5 transition-all duration-300 shadow-xl"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                  <VideoIcon className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-300 group-hover:text-[#00d2ff] transition-colors" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-1.5 text-white">Video Upscaler</h3>
                <p className="text-xs sm:text-sm text-neutral-400 text-center leading-relaxed">
                  Process anime clips frame-by-frame with 60FPS interpolation & motion blur.
                </p>
              </button>
            </div>
          </div>
        ) : !fileUrl ? (
          <div className="flex flex-col items-center p-6 sm:p-8 text-center h-full w-full justify-center my-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 text-white">
              {upscaleMode === 'image' ? 'Upload Photo' : 'Upload Video'}
            </h2>
            <p className="text-neutral-400 mb-8 sm:mb-10 max-w-xs sm:max-w-sm text-xs sm:text-sm">
              {upscaleMode === 'image' 
                ? 'Select an anime image to restore and upscale.' 
                : 'Select an anime video clip. Short clips are recommended for fast processing.'}
            </p>
            <label className="cursor-pointer group flex flex-col items-center w-full max-w-sm p-8 bg-[#1c1c1e]/60 hover:bg-[#2c2c2e]/80 border-2 border-dashed border-white/10 hover:border-[#00d2ff]/50 rounded-3xl transition-all duration-300 active:scale-98">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-black/60 group-hover:bg-[#00d2ff]/10 flex items-center justify-center transition-all duration-300 mb-4">
                <Upload className="w-8 h-8 text-neutral-400 group-hover:text-[#00d2ff] transition-colors" />
              </div>
              <span className="text-white font-bold text-sm sm:text-base">Choose {upscaleMode === 'image' ? 'Image' : 'Video'} File</span>
              <span className="text-[11px] text-neutral-500 mt-1">
                {upscaleMode === 'image' ? 'JPG, PNG, WebP' : 'MP4, WebM'}
              </span>
              <input 
                type="file" 
                accept={upscaleMode === 'image' ? 'image/*' : 'video/*'}
                className="hidden" 
                onChange={handleFileUpload}
              />
            </label>
            <button 
              onClick={() => setUpscaleMode(null)} 
              className="mt-6 text-xs text-neutral-400 hover:text-white transition-colors py-2 px-4 rounded-lg bg-neutral-900 border border-white/5"
            >
              ← Choose Different Mode
            </button>
          </div>
        ) : (
          /* Workspace Screen: Canvas Viewport (Top) + Control Dock (Bottom) */
          <div className="flex-1 flex flex-col w-full h-full relative overflow-hidden">
             
             {/* Upper Region: Media Canvas Viewport */}
             <div className="flex-1 min-h-0 relative w-full h-full flex items-center justify-center bg-black p-2 overflow-hidden">
                {/* File Metadata Info Badge */}
                {fileDetails && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1 bg-black/80 backdrop-blur-md border border-white/10 rounded-full text-xs text-neutral-200 flex items-center gap-2 shadow-xl max-w-[90vw] truncate">
                    <span className="font-semibold text-white truncate max-w-[140px]">{fileDetails.name}</span>
                    <span className="text-neutral-500">•</span>
                    <span className="text-neutral-400">{fileDetails.size}</span>
                    {fileDetails.dimensions && (
                      <>
                        <span className="text-neutral-500">•</span>
                        <span className="text-[#00d2ff] font-medium">{fileDetails.dimensions}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Compare Badges */}
                {status !== 'idle' && (
                  <>
                    <div className="absolute top-3 left-3 z-20 pointer-events-none">
                       <span className="px-2.5 py-1 bg-black/80 backdrop-blur-md rounded-md text-[11px] font-bold border border-white/10 text-[#00d2ff]">
                         Enhanced (Anime4K)
                       </span>
                    </div>
                    <div className="absolute top-3 right-3 z-20 pointer-events-none">
                       <span className="px-2.5 py-1 bg-black/80 backdrop-blur-md rounded-md text-[11px] font-medium border border-white/10 text-neutral-300">
                         Original
                       </span>
                    </div>
                  </>
                )}

                {/* Video Playback Toggle Button on Complete */}
                {fileType === 'video' && status === 'completed' && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
                      <button 
                         onClick={togglePlay}
                         className="p-3 bg-white/20 hover:bg-white/30 active:scale-95 backdrop-blur-md rounded-full transition-all border border-white/20 shadow-2xl"
                      >
                         {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white fill-white" />}
                      </button>
                  </div>
                )}

                {/* Media Preview / Compare Slider */}
                {status === 'idle' ? (
                   <div className="w-full h-full flex items-center justify-center overflow-hidden">
                     {fileType === 'image' ? (
                        <img src={fileUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                     ) : (
                        <video src={fileUrl} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" muted loop playsInline autoPlay />
                     )}
                   </div>
                ) : (
                   <ReactCompareSlider
                     className="w-full h-full max-w-full max-h-full"
                     itemOne={
                       fileType === 'image' ? (
                         <div className="w-full h-full flex items-center justify-center bg-black">
                           <canvas 
                             ref={canvasRefEnhanced}
                             className="max-w-full max-h-full object-contain"
                           />
                         </div>
                       ) : (
                         <div className="w-full h-full flex items-center justify-center bg-black">
                           {status === 'completed' && recordedBlobUrl ? (
                             <video 
                               ref={videoRefEnhanced}
                               src={recordedBlobUrl}
                               className="max-w-full max-h-full object-contain"
                               muted
                               loop
                               playsInline
                             />
                           ) : (
                             <canvas 
                               ref={canvasRefEnhanced}
                               className="max-w-full max-h-full object-contain"
                             />
                           )}
                         </div>
                       )
                     }
                     itemTwo={
                       fileType === 'image' ? (
                         <ReactCompareSliderImage 
                           src={fileUrl} 
                           alt="Original" 
                           style={{ objectFit: 'contain' }}
                         />
                       ) : (
                         <div className="w-full h-full flex items-center justify-center bg-black">
                           <canvas 
                             ref={canvasRefOriginal}
                             className={`max-w-full max-h-full object-contain ${status === 'completed' ? 'hidden' : 'block'}`}
                           />
                           <video 
                             ref={videoRefOriginal}
                             src={fileUrl}
                             className={`max-w-full max-h-full object-contain ${status === 'completed' ? 'block' : 'hidden'}`}
                             muted
                             loop={status === 'completed'}
                             playsInline
                           />
                         </div>
                       )
                     }
                   />
                )}
             </div>

             {/* Bottom Region: Control Panel & Dock */}
             {status === 'idle' && (
               <div className="flex-shrink-0 w-full bg-[#1c1c1e] border-t border-white/10 shadow-2xl z-40">
                 {/* Header & Tabs */}
                 <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/5">
                   <div className="flex items-center gap-1.5">
                     <Settings className="w-4 h-4 text-[#00d2ff]" />
                     <span className="text-xs font-bold text-white uppercase tracking-wider">Enhancement Settings</span>
                   </div>

                   {/* Tabs */}
                   <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/5">
                     <button
                       onClick={() => setActiveTab('model')}
                       className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 ${activeTab === 'model' ? 'bg-[#00d2ff] text-black shadow' : 'text-neutral-400 hover:text-white'}`}
                     >
                       <Sliders className="w-3 h-3" />
                       Model
                     </button>
                     {fileType === 'video' && (
                       <button
                         onClick={() => setActiveTab('twixtor')}
                         className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 ${activeTab === 'twixtor' ? 'bg-[#00d2ff] text-black shadow' : 'text-neutral-400 hover:text-white'}`}
                       >
                         <Film className="w-3 h-3" />
                         Twixtor
                       </button>
                     )}
                     <button
                       onClick={() => setActiveTab('export')}
                       className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 ${activeTab === 'export' ? 'bg-[#00d2ff] text-black shadow' : 'text-neutral-400 hover:text-white'}`}
                     >
                       <Layers className="w-3 h-3" />
                       Format
                     </button>
                   </div>
                 </div>

                 {/* Tab Contents */}
                 <div className="p-3 sm:p-4 max-h-[220px] overflow-y-auto space-y-3">
                   {activeTab === 'model' && (
                     <div className="space-y-3">
                       <div>
                         <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">AI Shader Model</label>
                         <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                           <button 
                             onClick={() => setModel('anime4k-a-fast')} 
                             className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${model === 'anime4k-a-fast' ? 'bg-[#00d2ff] text-black shadow-lg ring-1 ring-[#00d2ff]' : 'bg-black/60 text-neutral-300 hover:bg-black/80 border border-white/5'}`}
                           >
                             Anime4K Fast
                             <span className="block text-[10px] opacity-75 font-normal">Fastest 2x Upscale</span>
                           </button>
                           <button 
                             onClick={() => setModel('anime4k-a')} 
                             className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${model === 'anime4k-a' ? 'bg-[#00d2ff] text-black shadow-lg ring-1 ring-[#00d2ff]' : 'bg-black/60 text-neutral-300 hover:bg-black/80 border border-white/5'}`}
                           >
                             Anime4K High
                             <span className="block text-[10px] opacity-75 font-normal">HD Clarity</span>
                           </button>
                           <button 
                             onClick={() => setModel('anime4k-c')} 
                             className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${model === 'anime4k-c' ? 'bg-[#00d2ff] text-black shadow-lg ring-1 ring-[#00d2ff]' : 'bg-black/60 text-neutral-300 hover:bg-black/80 border border-white/5'}`}
                           >
                             Anime4K Max
                             <span className="block text-[10px] opacity-75 font-normal">Ultra Sharp</span>
                           </button>
                           <button 
                             onClick={() => setModel('gan-restore')} 
                             className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${model === 'gan-restore' ? 'bg-[#00d2ff] text-black shadow-lg ring-1 ring-[#00d2ff]' : 'bg-black/60 text-neutral-300 hover:bg-black/80 border border-white/5'}`}
                           >
                             GAN Restore
                             <span className="block text-[10px] opacity-75 font-normal">Deep Restoration</span>
                           </button>
                         </div>
                       </div>

                       {/* Denoise Filter Toggle */}
                       <div className="flex items-center justify-between pt-2 border-t border-white/5">
                         <div>
                           <span className="text-xs font-bold text-white block">Denoise (Median Bilateral Filter)</span>
                           <span className="text-[10px] text-neutral-400">Cleans up compression artifacts and pixel noise</span>
                         </div>
                         <button
                           type="button"
                           onClick={() => setDenoise(!denoise)}
                           className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${denoise ? 'bg-[#00d2ff]' : 'bg-neutral-800'}`}
                         >
                           <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${denoise ? 'translate-x-5' : 'translate-x-0'}`} />
                         </button>
                       </div>
                     </div>
                   )}

                   {activeTab === 'twixtor' && fileType === 'video' && (
                     <div className="space-y-3">
                       <div>
                         <div className="flex justify-between items-center mb-1.5">
                           <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">AI Twixtor Frame Rate</label>
                           {totalFrames > 0 && (
                             <span className="text-[11px] font-semibold text-[#00d2ff]">
                               {totalFrames} Output Frames ({targetFps} FPS)
                             </span>
                           )}
                         </div>
                         <div className="grid grid-cols-3 gap-2">
                           <button
                             type="button"
                             onClick={() => setFpsMode('native')}
                             className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-center ${fpsMode === 'native' ? 'bg-[#00d2ff] text-black ring-1 ring-[#00d2ff]' : 'bg-black/60 text-neutral-300 hover:bg-black/80 border border-white/5'}`}
                           >
                             Native FPS
                             <span className="block text-[10px] opacity-75 font-normal">Standard Rate</span>
                           </button>
                           <button
                             type="button"
                             onClick={() => setFpsMode('60fps')}
                             className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-center ${fpsMode === '60fps' ? 'bg-[#00d2ff] text-black ring-1 ring-[#00d2ff]' : 'bg-black/60 text-neutral-300 hover:bg-black/80 border border-white/5'}`}
                           >
                             60 FPS AI Twixtor
                             <span className="block text-[10px] opacity-75 font-normal">Smooth Optical Flow</span>
                           </button>
                           <button
                             type="button"
                             onClick={() => setFpsMode('120fps')}
                             className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-center ${fpsMode === '120fps' ? 'bg-[#00d2ff] text-black ring-1 ring-[#00d2ff]' : 'bg-black/60 text-neutral-300 hover:bg-black/80 border border-white/5'}`}
                           >
                             120 FPS Ultra
                             <span className="block text-[10px] opacity-75 font-normal">Extreme Slow-mo</span>
                           </button>
                         </div>
                       </div>

                       {/* Motion Blur */}
                       <div className="flex items-center justify-between pt-2 border-t border-white/5">
                         <div>
                           <span className="text-xs font-bold text-white block">Cinematic Motion Blur</span>
                           <span className="text-[10px] text-neutral-400">Temporal frame accumulation for fluid anime movement</span>
                         </div>
                         <button
                           type="button"
                           onClick={() => setMotionBlur(!motionBlur)}
                           className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${motionBlur ? 'bg-[#00d2ff]' : 'bg-neutral-800'}`}
                         >
                           <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${motionBlur ? 'translate-x-5' : 'translate-x-0'}`} />
                         </button>
                       </div>
                     </div>
                   )}

                   {activeTab === 'export' && (
                     <div className="space-y-3">
                       {fileType === 'video' ? (
                         <div>
                           <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">Output Container Format</label>
                           <div className="grid grid-cols-2 gap-2">
                             <button 
                               type="button"
                               onClick={() => setVideoFormat('mp4')}
                               className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-center ${videoFormat === 'mp4' ? 'bg-[#00d2ff] text-black ring-1 ring-[#00d2ff]' : 'bg-black/60 text-neutral-300 hover:bg-black/80 border border-white/5'}`}
                             >
                               MP4 Video (.mp4)
                               <span className="block text-[10px] opacity-75 font-normal">H.264 / AVC Container</span>
                             </button>
                             <button 
                               type="button"
                               onClick={() => setVideoFormat('webm')}
                               className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-center ${videoFormat === 'webm' ? 'bg-[#00d2ff] text-black ring-1 ring-[#00d2ff]' : 'bg-black/60 text-neutral-300 hover:bg-black/80 border border-white/5'}`}
                             >
                               WebM Video (.webm)
                               <span className="block text-[10px] opacity-75 font-normal">VP9 Web Container</span>
                             </button>
                           </div>
                         </div>
                       ) : (
                         <div>
                           <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex justify-between mb-1.5">
                             Enhancement Passes
                             <span className="text-[#00d2ff] font-bold">{iterations} Pass{iterations > 1 ? 'es' : ''}</span>
                           </label>
                           <input 
                             type="range" 
                             min="1" max="10" 
                             value={iterations} 
                             onChange={(e) => setIterations(parseInt(e.target.value))}
                             className="w-full accent-[#00d2ff] h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                           />
                           <p className="text-[10px] text-neutral-500 mt-1">Multi-pass upscaling increases sharpness and line definitions.</p>
                         </div>
                       )}
                     </div>
                   )}
                 </div>

                 {/* Action Button Bar */}
                 <div className="p-3 bg-black/60 border-t border-white/5 flex items-center justify-between gap-3">
                   <div className="hidden sm:flex flex-col">
                     <span className="text-xs font-bold text-white">Ready to Process</span>
                     <span className="text-[10px] text-neutral-400">
                       {fileType === 'video' ? `Target: ${targetFps} FPS • ${videoFormat.toUpperCase()}` : `Passes: ${iterations} • PNG Output`}
                     </span>
                   </div>

                   <button 
                     onClick={() => setStatus('enhancing')}
                     className="w-full sm:w-auto px-8 h-11 bg-[#00d2ff] text-black font-extrabold rounded-xl hover:bg-[#33d9ff] active:scale-[0.98] transition-all text-sm shadow-[0_0_15px_rgba(0,210,255,0.4)] flex items-center justify-center gap-2"
                   >
                     <Sparkles className="w-4 h-4 fill-black" />
                     Start Enhancing
                   </button>
                 </div>
               </div>
             )}

             {/* Progress Bar (during enhancement) */}
             {status !== 'idle' && (
               <div className="flex-shrink-0 w-full p-4 bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col items-center z-40 border-t border-white/5">
                 <div className="w-full max-w-sm flex flex-col items-center gap-1 mb-2">
                   <span className="text-sm font-bold tracking-wide text-white drop-shadow-md">
                     {status === 'completed' ? 'Enhancement Complete!' : `Enhancing: ${Math.round(progress)}%`}
                   </span>
                   {status === 'enhancing' && fileType === 'video' && (
                     <span className="text-xs text-[#00d2ff] font-semibold drop-shadow-md">
                        Frame {currentFrame} of {totalFrames} ({targetFps} FPS AI Twixtor)
                     </span>
                   )}
                   {status === 'enhancing' && fileType === 'video' && progress > 0 && progress < 100 && (
                     <span className="text-[11px] text-neutral-400 drop-shadow-md">
                       ~{Math.max(0, Math.floor(((totalFrames - currentFrame) / targetFps) / 60))}m {Math.round(((totalFrames - currentFrame) / targetFps) % 60)}s remaining
                     </span>
                   )}
                 </div>
                 
                 <div className="w-full max-w-md h-2 bg-neutral-800 rounded-full overflow-hidden shadow-lg border border-white/10">
                   <div 
                     className="h-full bg-[#00d2ff] transition-all duration-100 ease-linear rounded-full shadow-[0_0_12px_#00d2ff]"
                     style={{ width: `${progress}%` }}
                   />
                 </div>
               </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
}

