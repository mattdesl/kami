/**
  Auto-generated Kami index file.
  Dependencies are placed on the top-level namespace, for convenience.
  Created on 2013-11-25
*/
module.exports = {
    //core classes
    'AbstractBatch':   require('./AbstractBatch.js'),
    'AssetManager':    require('./AssetManager.js'),
    'SpriteBatch':     require('./SpriteBatch.js'),
    'Texture':         require('./Texture.js'),
    'WebGLContext':    require('./WebGLContext.js'),
    'Mesh':            require('./glutils/Mesh.js'),
    'ShaderProgram':   require('./glutils/ShaderProgram.js'),

    //signals dependencies
    'Signal':          require('signals').Signal,

    //klasse dependencies
    'Class':           require('klasse'),

    //number-util dependencies
    'NumberUtil':      require('number-util')
};