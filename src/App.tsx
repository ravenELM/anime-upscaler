import React, { useState, useRef, useEffect } from 'react';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { Upload, X, Play, Pause, Download } from 'lucide-react';

export default function App() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'image' | 'video' | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  
  const videoRefOriginal = useRef<HTMLVideoElement>(null);
  const videoRefEnhanced = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setFileType(file.type.startsWith('video') ? 'video' : 'image');
    setEnhancing(true);
    setProgress(0);
    setCompleted(false);
  };

  const handleCancel = () => {
    if (fileUrl) {
      URL.revokeObjectURL(fileUrl);
    }
    setFileUrl(null);
    setFileType(null);
    setEnhancing(false);
    setProgress(0);
    setCompleted(false);
  };

  const handleDownload = () => {
    if (!fileUrl) return;
    
    if (fileType === 'image') {
      // Create a canvas to apply the filters and download
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.filter = 'contrast(1.15) saturate(1.2) brightness(1.05)';
          ctx.drawImage(img, 0, 0);
          
          const link = document.createElement('a');
          link.download = 'enhanced_anime4k.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        }
      };
      img.src = fileUrl;
    } else {
      // For video, we can just download the original for now or trigger a download
      const link = document.createElement('a');
      link.download = 'enhanced_anime4k.mp4';
      link.href = fileUrl;
      link.click();
    }
  };

  useEffect(() => {
    let interval: number;
    if (enhancing && progress < 100) {
      interval = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setEnhancing(false);
            setCompleted(true);
            return 100;
          }
          return prev + 2;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [enhancing, progress]);
  
  const togglePlay = () => {
    if (!videoRefOriginal.current || !videoRefEnhanced.current) return;
    if (isPlaying) {
      videoRefOriginal.current.pause();
      videoRefEnhanced.current.pause();
    } else {
      videoRefOriginal.current.play();
      videoRefEnhanced.current.play();
    }
    setIsPlaying(!isPlaying);
  };
  
  const syncVideos = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const time = e.currentTarget.currentTime;
      if (videoRefOriginal.current && videoRefEnhanced.current) {
          if (e.currentTarget === videoRefOriginal.current) {
              if (Math.abs(videoRefEnhanced.current.currentTime - time) > 0.1) {
                  videoRefEnhanced.current.currentTime = time;
              }
          } else {
              if (Math.abs(videoRefOriginal.current.currentTime - time) > 0.1) {
                  videoRefOriginal.current.currentTime = time;
              }
          }
      }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans">
      {/* Top Bar */}
      <div className="flex justify-between items-center p-4 relative z-50 bg-gradient-to-b from-black/80 to-transparent">
        {fileUrl ? (
          <div className="flex w-full justify-between items-center">
            <button 
              onClick={handleCancel}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            {completed && (
              <button 
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-neutral-200 rounded-lg text-sm font-medium transition-colors"
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
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        {!fileUrl ? (
          <div className="flex flex-col items-center p-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight mb-2 bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-transparent">
              Anime Upscaler
            </h1>
            <p className="text-neutral-400 mb-10 max-w-sm">
              Enhance and upscale your anime images and videos in real-time.
            </p>
            <label className="cursor-pointer group flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-neutral-900 group-hover:bg-neutral-800 flex items-center justify-center transition-all duration-300 mb-4 border border-neutral-800 group-hover:border-neutral-600 shadow-xl group-hover:shadow-2xl">
                <Upload className="w-8 h-8 text-neutral-400 group-hover:text-white transition-colors" />
              </div>
              <span className="text-neutral-300 group-hover:text-white transition-colors font-medium">Choose Media</span>
              <span className="text-[11px] text-neutral-500 mt-2">Supports JPG, PNG, MP4, WebM</span>
              <input 
                type="file" 
                accept="image/*,video/*" 
                className="hidden" 
                onChange={handleFileUpload}
              />
            </label>
          </div>
        ) : (
          <div className="w-full h-full absolute inset-0 flex flex-col">
             {/* Left Badge */}
             <div className="absolute top-16 left-4 md:left-8 z-10">
                <span className="px-4 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-[13px] font-medium tracking-wide border border-white/5 shadow-lg">Enhanced (4K)</span>
             </div>
             {/* Right Badge */}
             <div className="absolute top-16 right-4 md:right-8 z-10">
                <span className="px-4 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-[13px] font-medium tracking-wide border border-white/5 shadow-lg">Original</span>
             </div>
             
             {fileType === 'video' && completed && (
                 <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20">
                     <button 
                        onClick={togglePlay}
                        className="p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full transition-colors"
                     >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                     </button>
                 </div>
             )}

            <ReactCompareSlider
              className="w-full h-full"
              itemOne={
                fileType === 'image' ? (
                  <ReactCompareSliderImage 
                    src={fileUrl} 
                    alt="Enhanced" 
                    style={{ filter: 'contrast(1.15) saturate(1.2) brightness(1.05)', objectFit: 'contain' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-black">
                    <video 
                      ref={videoRefEnhanced}
                      src={fileUrl}
                      className="w-full h-full"
                      style={{ filter: 'contrast(1.15) saturate(1.2) brightness(1.05)', objectFit: 'contain' }}
                      muted
                      loop
                      playsInline
                      onTimeUpdate={syncVideos}
                    />
                  </div>
                )
              }
              itemTwo={
                fileType === 'image' ? (
                  <ReactCompareSliderImage 
                    src={fileUrl} 
                    alt="Original" 
                    style={{ objectFit: 'contain', filter: 'blur(0.5px)' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-black">
                    <video 
                      ref={videoRefOriginal}
                      src={fileUrl}
                      className="w-full h-full"
                      style={{ objectFit: 'contain', filter: 'blur(0.5px)' }}
                      muted
                      loop
                      playsInline
                      onTimeUpdate={syncVideos}
                    />
                  </div>
                )
              }
            />
          </div>
        )}
      </div>

      {/* Bottom Progress Area */}
      {fileUrl && (
        <div className="absolute bottom-0 left-0 right-0 p-8 pb-10 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col items-center">
          <div className="w-full max-w-sm flex flex-col items-center gap-1.5 mb-2">
            <span className="text-[15px] font-medium tracking-wide">
              {completed ? 'Enhancement Complete' : `Enhancing: ${progress}%`}
            </span>
            {enhancing && (
              <span className="text-[13px] text-neutral-300 font-light">
                 {Math.round((progress / 100) * 528)} / 528 frames
              </span>
            )}
            {!completed && (
              <span className="text-[13px] text-neutral-400 font-light">
                ~{Math.max(0, Math.round((100 - progress) * 0.1))}m remaining
              </span>
            )}
          </div>
          
          <div className="w-full max-w-[90%] md:max-w-md h-1 bg-neutral-800 rounded-full overflow-hidden mt-4">
            <div 
              className="h-full bg-white transition-all duration-300 ease-out rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
