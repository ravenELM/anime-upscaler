import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 1. Add ChevronDown, ChevronUp imports
content = content.replace(
    'import { Upload, X, Play, Pause, Download, Image as ImageIcon, Video as VideoIcon, Settings } from \'lucide-react\';',
    'import { Upload, X, Play, Pause, Download, ChevronDown, ChevronUp, Image as ImageIcon, Video as VideoIcon, Settings } from \'lucide-react\';'
)

# 2. Add iterations state
content = content.replace(
    '  const [model, setModel] = useState<ModelMode>(\'anime4k-a-fast\');',
    '  const [model, setModel] = useState<ModelMode>(\'anime4k-a-fast\');\n  const [iterations, setIterations] = useState(1);\n  const [showSettings, setShowSettings] = useState(false);'
)

# 3. Update getPreset to handle iterations (though we do loops manually)
content = content.replace(
'''  const getPreset = () => {
    if (model === 'anime4k-a') return ANIME4K_HIGHEREND_MODE_A;
    if (model === 'anime4k-c') return ANIME4K_HIGHEREND_MODE_C;
    if (model === 'gan-restore') return [Anime4K_Restore_GAN_UUL, Anime4K_Upscale_GAN_x3_L];
    return ANIME4K_HIGHEREND_MODE_A_FAST;
  };''',
'''  const getPreset = () => {
    let p;
    if (model === 'anime4k-a') p = ANIME4K_HIGHEREND_MODE_A;
    else if (model === 'anime4k-c') p = ANIME4K_HIGHEREND_MODE_C;
    else if (model === 'gan-restore') p = [Anime4K_Restore_GAN_UUL, Anime4K_Upscale_GAN_x3_L];
    else p = ANIME4K_HIGHEREND_MODE_A_FAST;
    return p;
  };'''
)

# 4. Update the img.onload for iterations
old_onload = '''        img.onload = () => {
          if (isCancelled) return;
          if (canvasRefEnhanced.current) {
            const upscaler = new ImageUpscaler(preset);
            upscalerRef.current = upscaler;
            upscaler.attachSource(img, canvasRefEnhanced.current);
            upscaler.upscale();
            
            let p = 0;
            const interval = setInterval(() => {
              if (isCancelled) {
                clearInterval(interval);
                return;
              }
              p += 10;
              setProgress(p);
              if (p >= 100) {
                clearInterval(interval);
                setStatus('completed');
              }
            }, 50);
          }
        };'''

new_onload = '''        img.onload = () => {
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
        };'''

content = content.replace(old_onload, new_onload)

# 5. UI replacement for Settings/Models
# We find the block starting with `<div className="flex justify-center gap-3 mb-6 flex-wrap">` and ending at `</p>`
ui_regex = re.compile(r'<div className="flex justify-center gap-3 mb-6 flex-wrap">.*?</p>', re.DOTALL)

new_ui = '''<div className="w-full max-w-sm mx-auto mb-6 bg-[#1c1c1e] rounded-xl overflow-hidden border border-white/5 shadow-xl">
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
                   </div>'''

content = ui_regex.sub(new_ui, content)

with open('src/App.tsx', 'w') as f:
    f.write(content)

