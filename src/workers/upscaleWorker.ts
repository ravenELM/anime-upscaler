import * as Anime4K from 'anime4k.js';
import '../utils/webglPolyfill';

const unwrap = (item: any) => (item && item.default ? item.default : item);

let upscaler: any = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let isCanvasTransferred = false;

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === 'init') {
    const { canvas, presetName, width, height, denoise, deband } = e.data;
    
    if (canvas) {
      offscreenCanvas = canvas;
      isCanvasTransferred = true;
    } else {
      offscreenCanvas = new OffscreenCanvas(width || 1280, height || 720);
      isCanvasTransferred = false;
    }

    try {
      const rawPreset = (Anime4K as any)[presetName] || Anime4K.ANIME4K_HIGHEREND_MODE_A_FAST;
      let presetShaders: any[] = [];
      if (Array.isArray(rawPreset)) {
        presetShaders = rawPreset.map(unwrap);
      } else {
        presetShaders = [unwrap(rawPreset)];
      }

      if (denoise && (Anime4K as any).Anime4K_Denoise_Bilateral_Median) {
        presetShaders.unshift(unwrap((Anime4K as any).Anime4K_Denoise_Bilateral_Median));
      }
      if (deband && (Anime4K as any).Anime4K_Deblur_DoG) {
        presetShaders.unshift(unwrap((Anime4K as any).Anime4K_Deblur_DoG));
      }

      const ImageUpscalerClass = unwrap((Anime4K as any).ImageUpscaler);
      if (ImageUpscalerClass) {
        upscaler = new ImageUpscalerClass(presetShaders);
      }
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      console.error('Worker init error:', err);
      self.postMessage({ type: 'error', error: err?.message || 'Failed to initialize worker' });
    }
  } else if (type === 'processFrame') {
    const { imageBitmap, targetWidth, targetHeight } = e.data;
    if (!imageBitmap) return;

    try {
      if (offscreenCanvas && upscaler) {
        const outW = targetWidth || imageBitmap.width * 2;
        const outH = targetHeight || imageBitmap.height * 2;

        if (offscreenCanvas.width !== outW || offscreenCanvas.height !== outH) {
          offscreenCanvas.width = outW;
          offscreenCanvas.height = outH;
        }

        upscaler.attachSource(imageBitmap, offscreenCanvas);
        upscaler.upscale();

        if (!isCanvasTransferred) {
          const renderedBitmap = offscreenCanvas.transferToImageBitmap();
          self.postMessage({ type: 'frameRendered', bitmap: renderedBitmap }, [renderedBitmap]);
        } else {
          self.postMessage({ type: 'frameRendered' });
        }
      }
    } catch (err: any) {
      console.error('Worker frame processing error:', err);
      self.postMessage({ type: 'frameError', error: err?.message });
    } finally {
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }
    }
  } else if (type === 'destroy') {
    if (upscaler && typeof upscaler.detachSource === 'function') {
      try {
        upscaler.detachSource();
      } catch {
        // ignore
      }
    }
    upscaler = null;
    offscreenCanvas = null;
  }
};
