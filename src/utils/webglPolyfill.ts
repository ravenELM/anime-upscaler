// Polyfill WebGL context methods and extensions to prevent crashes when shader compilation or extension checks fail

const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : (self as any);

function patchContext(WebGLCtx: any) {
  if (!WebGLCtx || !WebGLCtx.prototype) return;
  const proto = WebGLCtx.prototype;

  // 1. Guard getAttribLocation
  const origGetAttribLocation = proto.getAttribLocation;
  if (origGetAttribLocation) {
    proto.getAttribLocation = function (program: any, name: string) {
      if (!program || (typeof WebGLProgram !== 'undefined' && !(program instanceof WebGLProgram))) {
        console.warn('WebGLRenderingContext.getAttribLocation safely guarded invalid program:', program);
        return -1;
      }
      try {
        return origGetAttribLocation.call(this, program, name);
      } catch (err) {
        console.warn('WebGLRenderingContext.getAttribLocation error caught:', err);
        return -1;
      }
    };
  }

  // 2. Guard getUniformLocation
  const origGetUniformLocation = proto.getUniformLocation;
  if (origGetUniformLocation) {
    proto.getUniformLocation = function (program: any, name: string) {
      if (!program || (typeof WebGLProgram !== 'undefined' && !(program instanceof WebGLProgram))) {
        console.warn('WebGLRenderingContext.getUniformLocation safely guarded invalid program:', program);
        return null;
      }
      try {
        return origGetUniformLocation.call(this, program, name);
      } catch (err) {
        console.warn('WebGLRenderingContext.getUniformLocation error caught:', err);
        return null;
      }
    };
  }

  // 3. Guard useProgram
  const origUseProgram = proto.useProgram;
  if (origUseProgram) {
    proto.useProgram = function (program: any) {
      if (program && typeof WebGLProgram !== 'undefined' && !(program instanceof WebGLProgram)) {
        console.warn('WebGLRenderingContext.useProgram safely guarded invalid program:', program);
        return;
      }
      try {
        return origUseProgram.call(this, program);
      } catch (err) {
        console.warn('WebGLRenderingContext.useProgram error caught:', err);
      }
    };
  }

  // 4. Guard attachShader
  const origAttachShader = proto.attachShader;
  if (origAttachShader) {
    proto.attachShader = function (program: any, shader: any) {
      if (!program || !shader || (typeof WebGLProgram !== 'undefined' && !(program instanceof WebGLProgram)) || (typeof WebGLShader !== 'undefined' && !(shader instanceof WebGLShader))) {
        console.warn('WebGLRenderingContext.attachShader safely guarded invalid program or shader:', program, shader);
        return;
      }
      try {
        return origAttachShader.call(this, program, shader);
      } catch (err) {
        console.warn('WebGLRenderingContext.attachShader error caught:', err);
      }
    };
  }

  // 5. Guard detachShader
  const origDetachShader = proto.detachShader;
  if (origDetachShader) {
    proto.detachShader = function (program: any, shader: any) {
      if (!program || !shader || (typeof WebGLProgram !== 'undefined' && !(program instanceof WebGLProgram)) || (typeof WebGLShader !== 'undefined' && !(shader instanceof WebGLShader))) {
        return;
      }
      try {
        return origDetachShader.call(this, program, shader);
      } catch (err) {
        // ignore
      }
    };
  }

  // 6. Guard linkProgram
  const origLinkProgram = proto.linkProgram;
  if (origLinkProgram) {
    proto.linkProgram = function (program: any) {
      if (!program || (typeof WebGLProgram !== 'undefined' && !(program instanceof WebGLProgram))) {
        return;
      }
      try {
        return origLinkProgram.call(this, program);
      } catch (err) {
        console.warn('WebGLRenderingContext.linkProgram error caught:', err);
      }
    };
  }

  // 7. Guard getProgramParameter
  const origGetProgramParameter = proto.getProgramParameter;
  if (origGetProgramParameter) {
    proto.getProgramParameter = function (program: any, pname: number) {
      if (!program || (typeof WebGLProgram !== 'undefined' && !(program instanceof WebGLProgram))) {
        return pname === 0x8b82 /* LINK_STATUS */ ? true : null;
      }
      try {
        return origGetProgramParameter.call(this, program, pname);
      } catch (err) {
        return pname === 0x8b82 ? true : null;
      }
    };
  }

  // 8. Polyfill getExtension for WebGL1/WebGL2 to satisfy VideoUpscaler requirement for EXT_color_buffer_half_float
  const origGetExtension = proto.getExtension;
  if (origGetExtension) {
    proto.getExtension = function (name: string) {
      try {
        const ext = origGetExtension.call(this, name);
        if (ext) return ext;
      } catch {
        // ignore
      }
      if (
        name === 'EXT_color_buffer_half_float' ||
        name === 'OES_texture_half_float' ||
        name === 'OES_texture_half_float_linear' ||
        name === 'WEBGL_color_buffer_float' ||
        name === 'EXT_float_blend'
      ) {
        return { HALF_FLOAT_OES: 0x8d61 } as any;
      }
      return null;
    };
  }
}

if (g.WebGLRenderingContext) {
  patchContext(g.WebGLRenderingContext);
}

if (g.WebGL2RenderingContext) {
  patchContext(g.WebGL2RenderingContext);
}
