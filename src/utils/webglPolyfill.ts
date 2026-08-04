// Polyfill WebGL context methods and extensions to prevent crashes when shader compilation or extension checks fail

if (typeof window !== 'undefined') {
  // 1. Safe attachShader wrapper
  if (window.WebGLRenderingContext) {
    const origAttachShader = WebGLRenderingContext.prototype.attachShader;
    WebGLRenderingContext.prototype.attachShader = function (program: WebGLProgram, shader: WebGLShader) {
      if (!shader) {
        console.warn('WebGLRenderingContext.attachShader called with invalid shader:', shader);
        return;
      }
      return origAttachShader.call(this, program, shader);
    };

    // Polyfill getExtension for WebGL1 to satisfy VideoUpscaler requirement for EXT_color_buffer_half_float
    const origGetExtension = WebGLRenderingContext.prototype.getExtension;
    WebGLRenderingContext.prototype.getExtension = function (name: string) {
      const ext = origGetExtension.call(this, name);
      if (ext) return ext;
      if (
        name === 'EXT_color_buffer_half_float' ||
        name === 'OES_texture_half_float' ||
        name === 'OES_texture_half_float_linear' ||
        name === 'WEBGL_color_buffer_float' ||
        name === 'EXT_float_blend'
      ) {
        return { HALF_FLOAT_OES: 0x8D61 } as any;
      }
      return null;
    };
  }

  if (window.WebGL2RenderingContext) {
    const origAttachShader = WebGL2RenderingContext.prototype.attachShader;
    WebGL2RenderingContext.prototype.attachShader = function (program: WebGLProgram, shader: WebGLShader) {
      if (!shader) {
        console.warn('WebGL2RenderingContext.attachShader called with invalid shader:', shader);
        return;
      }
      return origAttachShader.call(this, program, shader);
    };

    const origGetExtension2 = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (name: string) {
      const ext = origGetExtension2.call(this, name);
      if (ext) return ext;
      if (
        name === 'EXT_color_buffer_half_float' ||
        name === 'OES_texture_half_float' ||
        name === 'OES_texture_half_float_linear' ||
        name === 'WEBGL_color_buffer_float' ||
        name === 'EXT_float_blend'
      ) {
        return { HALF_FLOAT_OES: 0x8D61 } as any;
      }
      return null;
    };
  }
}

