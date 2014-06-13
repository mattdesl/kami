console.warn("require('kami') is deprecated, use the kami-* modules instead");

module.exports = {
    'SpriteBatch':     require('kami-batch'),
    'WebGLContext':    require('kami-context'),
    'FrameBuffer':     require('kami-fbo'),
    'Mesh':            require('kami-mesh-buffer'),
    'ShaderProgram':   require('kami-shader'),
    'Texture':         require('kami-texture'),
    'TextureRegion':   require('kami-texture-region'),
};