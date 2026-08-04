import React, { useState, useRef, useEffect } from 'react';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { Upload, X, Play, Pause, Download, ChevronDown, ChevronUp, Image as ImageIcon, Video as VideoIcon, Settings } from 'lucide-react';
import { 
  ImageUpscaler, VideoUpscaler, 
  ANIME4K_HIGHEREND_MODE_A_FAST, 
  ANIME4K_HIGHEREND_MODE_A, 
  ANIME4K_HIGHEREND_MODE_C,
  Anime4K_Upscale_GAN_x3_L,
  Anime4K_Restore_GAN_UUL
} from 'anime4k.js';

type UpscaleMode = 'image' | 'video' | null;
type ModelMode = 'anime4k-a-fast' | 'anime4k-a' | 'anime4k-c' | 'gan-restore';
type ProcessStatus = 'idle' | 'enhancing' | 'completed';

export default function App() {
  const [upscaleMode, setUpscaleMode] = useState<UpscaleMode>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'image' | 'video' | null>(null);
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [model, setModel] = useState<ModelMode>('anime4k-a-fast');
  const [iterations, setIterations] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  
  const videoRefOriginal = useRef<HTMLVideoElement>(null);
  const videoRefEnhanced = useRef<HTMLVideoElement>(null);
  const canvasRefEnhanced = useRef<HTMLCanvasElement>(null);
  const canvasRefOriginal = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const upscalerRef = useRef<ImageUpscaler | VideoUpscaler | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<BlobPart[]>([]);

  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const fps = 30;

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
    let p;
    if (model === 'anime4k-a') p = ANIME4K_HIGHEREND_MODE_A;
    else if (model === 'anime4k-c') p = ANIME4K_HIGHEREND_MODE_C;
    else if (model === 'gan-restore') p = [Anime4K_Restore_GAN_UUL, Anime4K_Upscale_GAN_x3_L];
    else p = ANIME4K_HIGHEREND_MODE_A_FAST;
    return p;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setFileType(file.type.startsWith('video') ? 'video' : 'image');
    setStatus('idle');
    setProgress(0);
    setRecordedBlobUrl(null);
    setCurrentFrame(0);
    setTotalFrames(0);
    recordedChunks.current = [];
  };

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
          const fileName = `enhanced_${model}.png`;
          if (navigator.canShare) {
            const file = new File([blob], fileName, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
              try {
                await navigator.share({ files: [file], title: 'Enhanced Image' });
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
        const fileName = `enhanced_${model}.webm`;
        try {
          const response = await fetch(recordedBlobUrl);
          const blob = await response.blob();
          if (navigator.canShare) {
            const file = new File([blob], fileName, { type: blob.type });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: 'Enhanced Video' });
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
        alert('Video recording failed or is not ready yet.');
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
                for (let i = 0; i < iterations; i++) {
                    if (isCancelled) break;
                    
                    const upscaler = new ImageUpscaler(preset);
                    upscalerRef.current = upscaler;
                    upscaler.attachSource(currentSource, canvasRefEnhanced.current);
                    upscaler.upscale();
                    
                    if (i < iterations - 1) {
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = canvasRefEnhanced.current.width;
                        tempCanvas.height = canvasRefEnhanced.current.height;
                        const ctx = tempCanvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(canvasRefEnhanced.current, 0, 0);
                            currentSource = tempCanvas as any;
                        }
                    }
                    setProgress(((i + 1) / iterations) * 100);
                    await new Promise(r => setTimeout(r, 100));
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
            
            const upscaler = new VideoUpscaler(preset);
            upscalerRef.current = upscaler;
            
            upscaler.attachVideo(video, canvas);
            
            const estimatedFrames = Math.round(video.duration * fps) || 0;
            setTotalFrames(estimatedFrames);
            
            // Setup MediaRecorder
            try {
              const stream = canvas.captureStream(fps);
              const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
              mediaRecorderRef.current = mediaRecorder;
              
              mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                  recordedChunks.current.push(e.data);
                }
              };
              
              mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setRecordedBlobUrl(url);
              };
              
              mediaRecorder.start();
            } catch (err) {
              console.error('MediaRecorder initialization failed:', err);
            }

            // Sync original canvas loop
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
                    }
                    ctx.drawImage(video, 0, 0, vw, vh);
                  }
                }
              }
              requestAnimationFrame(syncCanvas);
            };
            requestAnimationFrame(syncCanvas);

            // Start upscaler and play video to record
            upscaler.start();
            video.muted = true;
            video.currentTime = 0;
            video.play();
            setIsPlaying(true);

            const checkProgress = () => {
              if (isCancelled) return;
              if (video.ended || video.currentTime >= video.duration) {
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
                setCurrentFrame(Math.round(video.currentTime * fps));
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
  }, [status, fileUrl, fileType, model]);

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
    <div className="min-h-screen bg-black text-white flex flex-col font-sans">
      {/* Top Bar */}
      <div className="flex justify-between items-center p-4 relative z-50 bg-gradient-to-b from-black/80 to-transparent">
        {(fileUrl || upscaleMode) ? (
          <div className="flex w-full justify-between items-center">
            <button 
              onClick={handleCancel}
              className="px-4 py-2 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            {status === 'completed' && (
              <button 
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-neutral-200 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(255,255,255,0.3)]"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 py-2"></div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-black">
        {!upscaleMode ? (
          <div className="flex flex-col items-center p-8 text-center w-full max-w-4xl">
            <h1 className="text-4xl font-bold tracking-tight mb-3 text-white">
              Anime4K Upscaler
            </h1>
            <p className="text-neutral-400 mb-12 max-w-md">
              Select a mode to enhance and upscale your anime media locally in your browser.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-4">
              <button 
                onClick={() => handleModeSelect('image')}
                className="group flex flex-col items-center p-8 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl transition-all duration-300"
              >
                <div className="w-20 h-20 rounded-full bg-black flex items-center justify-center mb-6 transition-colors">
                  <ImageIcon className="w-10 h-10 text-neutral-300 group-hover:text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">Photo Upscaler</h3>
                <p className="text-sm text-neutral-500 text-center">
                  Enhance anime screenshots and illustrations instantly.
                </p>
              </button>
              
              <button 
                onClick={() => handleModeSelect('video')}
                className="group flex flex-col items-center p-8 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl transition-all duration-300"
              >
                <div className="w-20 h-20 rounded-full bg-black flex items-center justify-center mb-6 transition-colors">
                  <VideoIcon className="w-10 h-10 text-neutral-300 group-hover:text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">Video Upscaler</h3>
                <p className="text-sm text-neutral-500 text-center">
                  Process anime clips frame-by-frame for stunning clarity.
                </p>
              </button>
            </div>
          </div>
        ) : !fileUrl ? (
          <div className="flex flex-col items-center p-8 text-center h-full w-full justify-center">
            <h2 className="text-2xl font-semibold tracking-tight mb-2 text-white">
              {upscaleMode === 'image' ? 'Upload Photo' : 'Upload Video'}
            </h2>
            <p className="text-neutral-400 mb-10 max-w-sm text-sm">
              {upscaleMode === 'image' 
                ? 'Select a high-quality anime image to enhance.' 
                : 'Select an anime video clip. Shorter clips are recommended for fast processing.'}
            </p>
            <label className="cursor-pointer group flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-[#1c1c1e] group-hover:bg-[#2c2c2e] flex items-center justify-center transition-all duration-300 mb-4">
                <Upload className="w-8 h-8 text-neutral-400 group-hover:text-white transition-colors" />
              </div>
              <span className="text-neutral-300 group-hover:text-white transition-colors font-medium">Choose File</span>
              <span className="text-[11px] text-neutral-500 mt-2">
                {upscaleMode === 'image' ? 'Supports JPG, PNG, WebP' : 'Supports MP4, WebM'}
              </span>
              <input 
                type="file" 
                accept={upscaleMode === 'image' ? 'image/*' : 'video/*'}
                className="hidden" 
                onChange={handleFileUpload}
              />
            </label>
            <button onClick={() => setUpscaleMode(null)} className="mt-8 text-neutral-500 hover:text-white transition-colors">Back</button>
          </div>
        ) : (
          <div className="w-full h-full absolute inset-0 flex flex-col">
             {status === 'idle' && fileUrl && (
                <div className="absolute inset-0 z-50 flex flex-col justify-end p-6 bg-gradient-to-t from-black via-black/80 to-transparent pb-12 pointer-events-auto">
                   
                   <div className="w-full max-w-sm mx-auto mb-6 bg-[#1c1c1e] rounded-xl overflow-hidden border border-white/5 shadow-xl">
                      <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className="w-full flex items-center justify-between p-4 bg-[#1c1c1e] hover:bg-[#2c2c2e] transition-colors"
                      >
                        <span className="font-semibold text-white">AI Model & Settings</span>
                        {showSettings ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
                      </button>
                      
                      {showSettings && (
                        <div className="p-4 pt-0 border-t border-white/5 space-y-4">
                           <div className="flex flex-col gap-2">
                             <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Select Model</label>
                             <div className="flex flex-col gap-2">
                                <button onClick={() => setModel('anime4k-a-fast')} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${model === 'anime4k-a-fast' ? 'bg-[#00d2ff] text-black' : 'bg-black/40 text-neutral-300 hover:bg-black/60'}`}>Anime4K Fast (Recommended)</button>
                                <button onClick={() => setModel('anime4k-a')} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${model === 'anime4k-a' ? 'bg-[#00d2ff] text-black' : 'bg-black/40 text-neutral-300 hover:bg-black/60'}`}>Anime4K High</button>
                                <button onClick={() => setModel('anime4k-c')} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${model === 'anime4k-c' ? 'bg-[#00d2ff] text-black' : 'bg-black/40 text-neutral-300 hover:bg-black/60'}`}>Anime4K Max (Slow)</button>
                                <button onClick={() => setModel('gan-restore')} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${model === 'gan-restore' ? 'bg-[#00d2ff] text-black' : 'bg-black/40 text-neutral-300 hover:bg-black/60'}`}>GAN Restore (Advanced)</button>
                             </div>
                           </div>
                           
                           {fileType === 'image' && (
                             <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                               <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider flex justify-between">
                                 Enhancement Passes
                                 <span className="text-[#00d2ff] font-bold">{iterations}</span>
                               </label>
                               <input 
                                 type="range" 
                                 min="1" max="10" 
                                 value={iterations} 
                                 onChange={(e) => setIterations(parseInt(e.target.value))}
                                 className="w-full accent-[#00d2ff]"
                               />
                               <p className="text-[11px] text-neutral-500">Run the upscaler multiple times for intense sharpness.</p>
                             </div>
                           )}
                        </div>
                      )}
                   </div>
                   
                   <button 
                     onClick={() => setStatus('enhancing')}
                     className="w-full max-w-sm mx-auto py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors text-lg shadow-xl"
                   >
                     Start Enhancing
                   </button>
                </div>
             )}
             
             {/* Left Badge */}
             {status !== 'idle' && (
               <div className="absolute top-16 left-4 md:left-8 z-10 pointer-events-none">
                  <span className="px-4 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-[13px] font-medium tracking-wide border border-white/5 shadow-lg">Enhanced (4K)</span>
               </div>
             )}
             {/* Right Badge */}
             {status !== 'idle' && (
               <div className="absolute top-16 right-4 md:right-8 z-10 pointer-events-none">
                  <span className="px-4 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-[13px] font-medium tracking-wide border border-white/5 shadow-lg">Original</span>
               </div>
             )}
             
             {fileType === 'video' && status === 'completed' && (
                 <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20">
                     <button 
                        onClick={togglePlay}
                        className="p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full transition-colors backdrop-filter"
                     >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                     </button>
                 </div>
             )}

             {status === 'idle' ? (
                <div className="w-full h-full absolute inset-0 z-0">
                  {fileType === 'image' ? (
                     <img src={fileUrl} alt="Original" className="w-full h-full object-contain" />
                  ) : (
                     <video src={fileUrl} className="w-full h-full object-contain" muted loop playsInline autoPlay />
                  )}
                </div>
             ) : (
                <ReactCompareSlider
                  className="w-full h-full z-0"
                  itemOne={
                    fileType === 'image' ? (
                      <div className="w-full h-full flex items-center justify-center bg-black">
                        <canvas 
                          ref={canvasRefEnhanced}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-black">
                        {status === 'completed' && recordedBlobUrl ? (
                          <video 
                            ref={videoRefEnhanced}
                            src={recordedBlobUrl}
                            className="w-full h-full object-contain"
                            muted
                            loop
                            playsInline
                          />
                        ) : (
                          <canvas 
                            ref={canvasRefEnhanced}
                            className="w-full h-full object-contain"
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
                          className={`w-full h-full object-contain ${status === 'completed' ? 'hidden' : 'block'}`}
                        />
                        <video 
                          ref={videoRefOriginal}
                          src={fileUrl}
                          className={`w-full h-full object-contain ${status === 'completed' ? 'block' : 'hidden'}`}
                          muted
                          loop
                          playsInline
                        />
                      </div>
                    )
                  }
                />
             )}
          </div>
        )}
      </div>

      {/* Bottom Progress Area */}
      {fileUrl && status !== 'idle' && (
        <div className="absolute bottom-0 left-0 right-0 p-8 pb-10 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col items-center pointer-events-none z-40">
          <div className="w-full max-w-sm flex flex-col items-center gap-1.5 mb-2 pointer-events-auto">
            <span className="text-[15px] font-medium tracking-wide drop-shadow-md">
              {status === 'completed' ? 'Enhancement Complete' : `Enhancing: ${Math.round(progress)}%`}
            </span>
            {status === 'enhancing' && fileType === 'video' && (
              <span className="text-[13px] text-neutral-300 font-light drop-shadow-md">
                 {currentFrame} / {totalFrames} frames
              </span>
            )}
            {status === 'enhancing' && fileType === 'video' && progress > 0 && progress < 100 && (
              <span className="text-[13px] text-neutral-400 font-light drop-shadow-md">
                ~{Math.max(0, Math.floor(((totalFrames - currentFrame) / fps) / 60))}m {Math.round(((totalFrames - currentFrame) / fps) % 60)}s remaining
              </span>
            )}
          </div>
          
          <div className="w-full max-w-[90%] md:max-w-md h-1 bg-neutral-800 rounded-full overflow-hidden mt-4 shadow-lg pointer-events-auto">
            <div 
              className="h-full bg-white transition-all duration-100 ease-linear rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
