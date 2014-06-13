!function(e){"object"==typeof exports?module.exports=e():"function"==typeof define&&define.amd?define(e):"undefined"!=typeof window?window.kami=e():"undefined"!=typeof global?global.kami=e():"undefined"!=typeof self&&(self.kami=e())}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = {
    'SpriteBatch':     require('kami-batch'),
    'WebGLContext':    require('kami-context'),
    'FrameBuffer':     require('kami-fbo'),
    'Mesh':            require('kami-mesh-buffer'),
    'ShaderProgram':   require('kami-shader'),
    'Texture':         require('kami-texture'),
    'TextureRegion':   require('kami-texture-region'),
    'Class':           require('klasse'),
    'NumberUtil':      require('number-util'),
    'Signal':          require('signals').Signal
};
},{"kami-batch":2,"kami-context":9,"kami-fbo":11,"kami-mesh-buffer":13,"kami-shader":14,"kami-texture":18,"kami-texture-region":17,"klasse":21,"number-util":22,"signals":23}],2:[function(require,module,exports){
/**
 * @module kami-batch
 */

// Requires....
var Class         = require('klasse');

var BaseBatch     = require('./lib/BaseBatch');
var Mesh          = require('kami-mesh-buffer');
var ShaderProgram = require('kami-shader');

/**
 * A basic implementation of a batcher which draws 2D sprites.
 * This uses two triangles (quads) with indexed and interleaved
 * vertex data. Each vertex holds 5 floats (Position.xy, Color, TexCoord0.xy).
 *
 * The color is packed into a single float to reduce vertex bandwidth, and
 * the data is interleaved for best performance. We use a static index buffer,
 * and a dynamic vertex buffer that is updated with bufferSubData. 
 * 
 * @example
 *      var SpriteBatch = require('kami').SpriteBatch;  
 *      
 *      //create a new batcher
 *      var batch = new SpriteBatch(context);
 *
 *      function render() {
 *          batch.begin();
 *          
 *          //draw some sprites in between begin and end...
 *          batch.draw( texture, 0, 0, 25, 32 );
 *          batch.draw( texture1, 0, 25, 42, 23 );
 * 
 *          batch.end();
 *      }
 * 
 * @class  SpriteBatch
 * @uses BaseBatch
 * @constructor
 * @param {WebGLContext} context the context for this batch
 * @param {Number} size the max number of sprites to fit in a single batch
 */
var SpriteBatch = new Class({

	//inherit some stuff onto this prototype
	Mixins: BaseBatch,

	//Constructor
	initialize: function SpriteBatch(context, size) {
		if (!(this instanceof SpriteBatch))
			return new SpriteBatch(context, size);
		BaseBatch.call(this, context, size);

		/**
		 * The projection Float32Array vec2 which is
		 * used to avoid some matrix calculations.
		 *
		 * @property projection
		 * @type {Float32Array}
		 */
		this.projection = new Float32Array(2);

		var ctxCanvas = this.context.gl.canvas;
		//Sets up a default projection vector so that the batch works without setProjection
		this.projection[0] = ctxCanvas.width/2;
		this.projection[1] = ctxCanvas.height/2;

		/**
		 * The currently bound texture. Do not modify.
		 * 
		 * @property {Texture} texture
		 * @readOnly
		 */
		this.texture = null;
	},

	/**
	 * This is a convenience function to set the batch's projection
	 * matrix to an orthographic 2D projection, based on the given screen
	 * size. This allows users to render in 2D without any need for a camera.
	 * 
	 * @param  {[type]} width  [description]
	 * @param  {[type]} height [description]
	 * @return {[type]}        [description]
	 */
	resize: function(width, height) {
		this.setProjection(width/2, height/2);
	},

	/**
	 * The number of floats per vertex for this batcher 
	 * (Position.xy + Color + TexCoord0.xy).
	 *
	 * @method  getVertexSize
	 * @return {Number} the number of floats per vertex
	 */
	getVertexSize: function() {
		return SpriteBatch.VERTEX_SIZE;
	},

	/**
	 * Used internally to return the Position, Color, and TexCoord0 attributes.
	 *
	 * @method  _createVertexAttribuets
	 * @protected
	 * @return {[type]} [description]
	 */
	_createVertexAttributes: function() {
		var gl = this.context.gl;

		return [ 
			new Mesh.Attrib(ShaderProgram.POSITION_ATTRIBUTE, 2),
			 //pack the color for smaller CPU -> GPU bandwidth 
			new Mesh.Attrib(ShaderProgram.COLOR_ATTRIBUTE, 4, null, gl.UNSIGNED_BYTE, true, 1),
			new Mesh.Attrib(ShaderProgram.TEXCOORD_ATTRIBUTE+"0", 2)
		];
	},


	/**
	 * Sets the projection vector, an x and y
	 * defining the middle points of your stage.
	 *
	 * @method setProjection
	 * @param {Number} x the x projection value
	 * @param {Number} y the y projection value
	 */
	setProjection: function(x, y) {
		var oldX = this.projection[0];
		var oldY = this.projection[1];
		this.projection[0] = x;
		this.projection[1] = y;

		//we need to flush the batch..
		if (this.drawing && (x != oldX || y != oldY)) {
			this.flush();
			this._updateMatrices();
		}
	},

	/**
	 * Creates a default shader for this batch.
	 *
	 * @method  _createShader
	 * @protected
	 * @return {ShaderProgram} a new instance of ShaderProgram
	 */
	_createShader: function() {
		var shader = new ShaderProgram(this.context,
				SpriteBatch.DEFAULT_VERT_SHADER, 
				SpriteBatch.DEFAULT_FRAG_SHADER);
		if (shader.log)
			console.warn("Shader Log:\n" + shader.log);
		return shader;
	},

	/**
	 * This is called during rendering to update projection/transform
	 * matrices and upload the new values to the shader. For example,
	 * if the user calls setProjection mid-draw, the batch will flush
	 * and this will be called before continuing to add items to the batch.
	 *
	 * You generally should not need to call this directly.
	 * 
	 * @method  updateMatrices
	 * @protected
	 */
	updateMatrices: function() {
		this.shader.setUniformfv("u_projection", this.projection);
	},

	/**
	 * Called before rendering, and binds the current texture.
	 * 
	 * @method _preRender
	 * @protected
	 */
	_preRender: function() {
		if (this.texture)
			this.texture.bind();
	},

	/**
	 * Binds the shader, disables depth writing, 
	 * enables blending, activates texture unit 0, and sends
	 * default matrices and sampler2D uniforms to the shader.
	 *
	 * @method  begin
	 */
	begin: function() {
		//sprite batch doesn't hold a reference to GL since it is volatile
		var gl = this.context.gl;
		
		//This binds the shader and mesh!
		BaseBatch.prototype.begin.call(this);

		this.updateMatrices(); //send projection/transform to shader

		//upload the sampler uniform. not necessary every flush so we just
		//do it here.
		this.shader.setUniformi("u_texture0", 0);

		//disable depth mask
		gl.depthMask(false);
	},

	/**
	 * Ends the sprite batcher and flushes any remaining data to the GPU.
	 * 
	 * @method end
	 */
	end: function() {
		//sprite batch doesn't hold a reference to GL since it is volatile
		var gl = this.context.gl;
		
		//just do direct parent call for speed here
		//This binds the shader and mesh!
		BaseBatch.prototype.end.call(this);

		gl.depthMask(true);
	},

	/**
	 * Flushes the batch to the GPU. This should be called when
	 * state changes, such as blend functions, depth or stencil states,
	 * shaders, and so forth.
	 * 
	 * @method flush
	 */
	flush: function() {
		//ignore flush if texture is null or our batch is empty
		if (!this.texture)
			return;
		if (this.idx === 0)
			return;
		BaseBatch.prototype.flush.call(this);
		SpriteBatch.totalRenderCalls++;
	},

	/**
	 * Adds a sprite to this batch. The sprite is drawn in 
	 * screen-space with the origin at the upper-left corner (y-down).
	 * 
	 * @method draw
	 * @param  {Texture} texture the Texture
	 * @param  {Number} x       the x position in pixels, defaults to zero
	 * @param  {Number} y       the y position in pixels, defaults to zero
	 * @param  {Number} width   the width in pixels, defaults to the texture width
	 * @param  {Number} height  the height in pixels, defaults to the texture height
	 * @param  {Number} u1      the first U coordinate, default zero
	 * @param  {Number} v1      the first V coordinate, default zero
	 * @param  {Number} u2      the second U coordinate, default one
	 * @param  {Number} v2      the second V coordinate, default one
	 */
	draw: function(texture, x, y, width, height, u1, v1, u2, v2) {
		if (!this.drawing)
			throw "Illegal State: trying to draw a batch before begin()";

		//don't draw anything if GL tex doesn't exist..
		if (!texture)
			return;

		if (this.texture === null || this.texture.id !== texture.id) {
			//new texture.. flush previous data
			this.flush();
			this.texture = texture;
		} else if (this.idx == this.vertices.length) {
			this.flush(); //we've reached our max, flush before pushing more data
		}

		width = (width===0) ? width : (width || texture.width);
		height = (height===0) ? height : (height || texture.height);
		x = x || 0;
		y = y || 0;

		var x1 = x;
		var x2 = x + width;
		var y1 = y;
		var y2 = y + height;

		u1 = u1 || 0;
		u2 = (u2===0) ? u2 : (u2 || 1);
		v1 = v1 || 0;
		v2 = (v2===0) ? v2 : (v2 || 1);

		var c = this.color;

		//xy
		this.vertices[this.idx++] = x1;
		this.vertices[this.idx++] = y1;
		//color
		this.vertices[this.idx++] = c;
		//uv
		this.vertices[this.idx++] = u1;
		this.vertices[this.idx++] = v1;
		
		//xy
		this.vertices[this.idx++] = x2;
		this.vertices[this.idx++] = y1;
		//color
		this.vertices[this.idx++] = c;
		//uv
		this.vertices[this.idx++] = u2;
		this.vertices[this.idx++] = v1;

		//xy
		this.vertices[this.idx++] = x2;
		this.vertices[this.idx++] = y2;
		//color
		this.vertices[this.idx++] = c;
		//uv
		this.vertices[this.idx++] = u2;
		this.vertices[this.idx++] = v2;

		//xy
		this.vertices[this.idx++] = x1;
		this.vertices[this.idx++] = y2;
		//color
		this.vertices[this.idx++] = c;
		//uv
		this.vertices[this.idx++] = u1;
		this.vertices[this.idx++] = v2;
	},

	/**
	 * Adds a single quad mesh to this sprite batch from the given
	 * array of vertices. The sprite is drawn in 
	 * screen-space with the origin at the upper-left corner (y-down).
	 *
	 * This reads 20 interleaved floats from the given offset index, in the format
	 *
	 *  { x, y, color, u, v,
	 *      ...  }
	 *
	 * @method  drawVertices
	 * @param {Texture} texture the Texture object
	 * @param {Float32Array} verts an array of vertices
	 * @param {Number} off the offset into the vertices array to read from
	 */
	drawVertices: function(texture, verts, off) {
		if (!this.drawing)
			throw "Illegal State: trying to draw a batch before begin()";
		
		//don't draw anything if GL tex doesn't exist..
		if (!texture)
			return;


		if (this.texture != texture) {
			//new texture.. flush previous data
			this.flush();
			this.texture = texture;
		} else if (this.idx == this.vertices.length) {
			this.flush(); //we've reached our max, flush before pushing more data
		}

		off = off || 0;
		//TODO: use a loop here?
		//xy
		this.vertices[this.idx++] = verts[off++];
		this.vertices[this.idx++] = verts[off++];
		//color
		this.vertices[this.idx++] = verts[off++];
		//uv
		this.vertices[this.idx++] = verts[off++];
		this.vertices[this.idx++] = verts[off++];
		
		//xy
		this.vertices[this.idx++] = verts[off++];
		this.vertices[this.idx++] = verts[off++];
		//color
		this.vertices[this.idx++] = verts[off++];
		//uv
		this.vertices[this.idx++] = verts[off++];
		this.vertices[this.idx++] = verts[off++];

		//xy
		this.vertices[this.idx++] = verts[off++];
		this.vertices[this.idx++] = verts[off++];
		//color
		this.vertices[this.idx++] = verts[off++];
		//uv
		this.vertices[this.idx++] = verts[off++];
		this.vertices[this.idx++] = verts[off++];

		//xy
		this.vertices[this.idx++] = verts[off++];
		this.vertices[this.idx++] = verts[off++];
		//color
		this.vertices[this.idx++] = verts[off++];
		//uv
		this.vertices[this.idx++] = verts[off++];
		this.vertices[this.idx++] = verts[off++];
	}
});

/**
 * The default vertex size, i.e. number of floats per vertex.
 * @attribute  VERTEX_SIZE
 * @static
 * @final
 * @type {Number}
 * @default  5
 */
SpriteBatch.VERTEX_SIZE = 5;

/**
 * Incremented after each draw call, can be used for debugging.
 *
 *     SpriteBatch.totalRenderCalls = 0;
 *
 *     ... draw your scene ...
 *
 *     console.log("Draw calls per frame:", SpriteBatch.totalRenderCalls);
 *
 * 
 * @attribute  totalRenderCalls
 * @static
 * @type {Number}
 * @default  0
 */
SpriteBatch.totalRenderCalls = 0;

SpriteBatch.DEFAULT_FRAG_SHADER = [
	"precision mediump float;",
	"varying vec2 vTexCoord0;",
	"varying vec4 vColor;",
	"uniform sampler2D u_texture0;",

	"void main(void) {",
	"   gl_FragColor = texture2D(u_texture0, vTexCoord0) * vColor;",
	"}"
].join('\n');

SpriteBatch.DEFAULT_VERT_SHADER = [
	"attribute vec2 "+ShaderProgram.POSITION_ATTRIBUTE+";",
	"attribute vec4 "+ShaderProgram.COLOR_ATTRIBUTE+";",
	"attribute vec2 "+ShaderProgram.TEXCOORD_ATTRIBUTE+"0;",

	"uniform vec2 u_projection;",
	"varying vec2 vTexCoord0;",
	"varying vec4 vColor;",

	"void main(void) {", ///TODO: use a projection and transform matrix
	"   gl_Position = vec4( "
		+ShaderProgram.POSITION_ATTRIBUTE
		+".x / u_projection.x - 1.0, "
		+ShaderProgram.POSITION_ATTRIBUTE
		+".y / -u_projection.y + 1.0 , 0.0, 1.0);",
	"   vTexCoord0 = "+ShaderProgram.TEXCOORD_ATTRIBUTE+"0;",
	"   vColor = "+ShaderProgram.COLOR_ATTRIBUTE+";",
	"   vColor.a = vColor.a * (256.0/255.0);", //this is so the alpha sits at 0.0 or 1.0
	"}"
].join('\n');

module.exports = SpriteBatch;
},{"./lib/BaseBatch":3,"kami-mesh-buffer":4,"kami-shader":5,"klasse":21}],3:[function(require,module,exports){
/**
 * The core kami module provides basic 2D sprite batching and 
 * asset management.
 * 
 * @module kami-batch
 */

var Class = require('klasse');
var Mesh = require('kami-mesh-buffer');
var wrapContext = require('kami-util').wrapContext;

var colorToFloat = require('number-util').colorToFloat;

/** 
 * A batcher mixin composed of quads (two tris, indexed). 
 *
 * This is used internally; users should look at 
 * {{#crossLink "SpriteBatch"}}{{/crossLink}} instead, which inherits from this
 * class.
 * 
 * The batcher itself is not managed by WebGLContext; however, it makes
 * use of Mesh and Texture which will be managed. For this reason, the batcher
 * does not hold a direct reference to the GL state.
 *
 * Subclasses must implement the following:  
 * {{#crossLink "BaseBatch/_createShader:method"}}{{/crossLink}}  
 * {{#crossLink "BaseBatch/_createVertexAttributes:method"}}{{/crossLink}}  
 * {{#crossLink "BaseBatch/getVertexSize:method"}}{{/crossLink}}  
 * 
 * @class  BaseBatch
 * @constructor
 * @param {WebGLContext} context the context this batcher belongs to
 * @param {Number} size the optional size of this batch, i.e. max number of quads
 * @default  500
 */
var BaseBatch = new Class({

	//Constructor
	initialize: function BaseBatch(context, size) {
		if (!context || typeof context !== "object")
			throw "valid GL context not specified to SpriteBatch";
		this.context = wrapContext(context);

		this.size = size || 500;
		
		// 65535 is max index, so 65535 / 6 = 10922.
		if (this.size > 10922)
			throw "Can't have more than 10922 sprites per batch: " + this.size;
		
		this._blendSrc = this.context.gl.ONE;
		this._blendDst = this.context.gl.ONE_MINUS_SRC_ALPHA
		this._blendingEnabled = true;
		this._shader = this._createShader();

		/**
		 * This shader will be used whenever "null" is passed
		 * as the batch's shader. 
		 *
		 * @property {ShaderProgram} shader
		 */
		this.defaultShader = this._shader;

		/**
		 * By default, a SpriteBatch is created with its own ShaderProgram,
		 * stored in `defaultShader`. If this flag is true, on deleting the SpriteBatch, its
		 * `defaultShader` will also be deleted. If this flag is false, no shaders
		 * will be deleted on destroy.
		 *
		 * Note that if you re-assign `defaultShader`, you will need to dispose the previous
		 * default shader yoursel. 
		 *
		 * @property ownsShader
		 * @type {Boolean}
		 */
		this.ownsShader = true;

		this.idx = 0;

		/**
		 * Whether we are currently drawing to the batch. Do not modify.
		 * 
		 * @property {Boolean} drawing
		 */
		this.drawing = false;

		this.mesh = this._createMesh(this.size);

		/**
		 * The ABGR packed color, as a single float. The default
		 * value is the color white (255, 255, 255, 255).
		 *
		 * @property {Number} color
		 * @readOnly 
		 */
		this.color = colorToFloat(255, 255, 255, 255);
		
		/**
		 * Whether to premultiply alpha on calls to setColor. 
		 * This is true by default, so that we can conveniently write:
		 *
		 *     batch.setColor(1, 0, 0, 0.25); //tints red with 25% opacity
		 *
		 * If false, you must premultiply the colors yourself to achieve
		 * the same tint, like so:
		 *
		 *     batch.setColor(0.25, 0, 0, 0.25);
		 * 
		 * @property premultiplied
		 * @type {Boolean}
		 * @default  true
		 */
		this.premultiplied = true;
	},

	/**
	 * A property to enable or disable blending for this sprite batch. If
	 * we are currently drawing, this will first flush the batch, and then
	 * update GL_BLEND state (enabled or disabled) with our new value.
	 * 
	 * @property {Boolean} blendingEnabled
	 */
	blendingEnabled: {
		set: function(val) {
			var old = this._blendingEnabled;
			if (this.drawing)
				this.flush();

			this._blendingEnabled = val;

			//if we have a new value, update it.
			//this is because blend is done in begin() / end() 
			if (this.drawing && old != val) {
				var gl = this.context.gl;
				if (val)
					gl.enable(gl.BLEND);
				else
					gl.disable(gl.BLEND);
			}

		},

		get: function() {
			return this._blendingEnabled;
		}
	},

	/**
	 * Sets the blend source parameters. 
	 * If we are currently drawing, this will flush the batch.
	 *
	 * Setting either src or dst to `null` or a falsy value tells the SpriteBatch
	 * to ignore gl.blendFunc. This is useful if you wish to use your
	 * own blendFunc or blendFuncSeparate. 
	 * 
	 * @property {GLenum} blendDst 
	 */
	blendSrc: {
		set: function(val) {
			if (this.drawing)
				this.flush();
			this._blendSrc = val;
		},

		get: function() {
			return this._blendSrc;
		}
	},

	/**
	 * Sets the blend destination parameters. 
	 * If we are currently drawing, this will flush the batch.
	 *
	 * Setting either src or dst to `null` or a falsy value tells the SpriteBatch
	 * to ignore gl.blendFunc. This is useful if you wish to use your
	 * own blendFunc or blendFuncSeparate. 
	 *
	 * @property {GLenum} blendSrc 
	 */
	blendDst: {
		set: function(val) {
			if (this.drawing)
				this.flush();
			this._blendDst = val;
		},

		get: function() {
			return this._blendDst;
		}
	},

	/**
	 * Sets the blend source and destination parameters. This is 
	 * a convenience function for the blendSrc and blendDst setters.
	 * If we are currently drawing, this will flush the batch.
	 *
	 * Setting either to `null` or a falsy value tells the SpriteBatch
	 * to ignore gl.blendFunc. This is useful if you wish to use your
	 * own blendFunc or blendFuncSeparate. 
	 *
	 * @method  setBlendFunction
	 * @param {GLenum} blendSrc the source blend parameter
	 * @param {GLenum} blendDst the destination blend parameter
	 */
	setBlendFunction: function(blendSrc, blendDst) {
		this.blendSrc = blendSrc;
		this.blendDst = blendDst;
	},

	/**
	 * This is a setter/getter for this batch's current ShaderProgram.
	 * If this is set when the batch is drawing, the state will be flushed
	 * to the GPU and the new shader will then be bound.
	 *
	 * If `null` or a falsy value is specified, the batch's `defaultShader` will be used. 
	 *
	 * Note that shaders are bound on batch.begin().
	 *
	 * @property shader
	 * @type {ShaderProgram}
	 */
	shader: {
		set: function(val) {
			var wasDrawing = this.drawing;

			if (wasDrawing) {
				this.end(); //unbinds the shader from the mesh
			}

			this._shader = val ? val : this.defaultShader;

			if (wasDrawing) {
				this.begin();
			}
		},

		get: function() {
			return this._shader;
		}
	},

	/**
	 * Sets the color of this sprite batcher, which is used in subsequent draw
	 * calls. This does not flush the batch.
	 *
	 * If r, g, b, are all numbers, this method assumes that RGB 
	 * or RGBA float values (0.0 to 1.0) are being passed. Alpha defaults to one
	 * if undefined.
	 * 
	 * If one or more of the (r, g, b) arguments are non-numbers, we only consider the first argument
	 * and assign it to all four components -- this is useful for setting transparency 
	 * in a premultiplied alpha stage.
	 * 
	 * If the first argument is invalid or not a number,
	 * the color defaults to (1, 1, 1, 1).
	 *
	 * @method  setColor
	 * @param {Number} r the red component, normalized
	 * @param {Number} g the green component, normalized
	 * @param {Number} b the blue component, normalized
	 * @param {Number} a the alpha component, normalized
	 */
	setColor: function(r, g, b, a) {
		"use strict";
		var rnum = typeof r === "number";
		if (rnum
				&& typeof g === "number"
				&& typeof b === "number") {
			//default alpha to one 
			a = (a || a === 0) ? a : 1.0;
		} else {
			r = g = b = a = rnum ? r : 1.0;
		}
		
		if (this.premultiplied) {
			r *= a;
			g *= a;
			b *= a;
		}
		
		this.color = colorToFloat(
			~~(r * 255),
			~~(g * 255),
			~~(b * 255),
			~~(a * 255)
		);
	},

	/**
	 * Called from the constructor to create a new Mesh 
	 * based on the expected batch size. Should set up
	 * verts & indices properly.
	 *
	 * Users should not call this directly; instead, it
	 * should only be implemented by subclasses.
	 * 
	 * @method _createMesh
	 * @param {Number} size the size passed through the constructor
	 */
	_createMesh: function(size) {
		//the total number of floats in our batch
		var numVerts = size * 4 * this.getVertexSize();
		//the total number of indices in our batch
		var numIndices = size * 6;
		var gl = this.context.gl;

		//vertex data
		this.vertices = new Float32Array(numVerts);
		//index data
		this.indices = new Uint16Array(numIndices); 
		
		for (var i=0, j=0; i < numIndices; i += 6, j += 4) 
		{
			this.indices[i + 0] = j + 0; 
			this.indices[i + 1] = j + 1;
			this.indices[i + 2] = j + 2;
			this.indices[i + 3] = j + 0;
			this.indices[i + 4] = j + 2;
			this.indices[i + 5] = j + 3;
		}

		var mesh = new Mesh(this.context, false, 
						numVerts, numIndices, this._createVertexAttributes());
		mesh.vertices = this.vertices;
		mesh.indices = this.indices;
		mesh.vertexUsage = gl.DYNAMIC_DRAW;
		mesh.indexUsage = gl.STATIC_DRAW;
		mesh.dirty = true;
		return mesh;
	},

	/**
	 * Returns a shader for this batch. If you plan to support
	 * multiple instances of your batch, it may or may not be wise
	 * to use a shared shader to save resources.
	 * 
	 * This method initially throws an error; so it must be overridden by
	 * subclasses of BaseBatch.
	 *
	 * @method  _createShader
	 * @return {Number} the size of a vertex, in # of floats
	 */
	_createShader: function() {
		throw "_createShader not implemented"
	},	

	/**
	 * Returns an array of vertex attributes for this mesh; 
	 * subclasses should implement this with the attributes 
	 * expected for their batch.
	 *
	 * This method initially throws an error; so it must be overridden by
	 * subclasses of BaseBatch.
	 *
	 * @method _createVertexAttributes
	 * @return {Array} an array of Mesh.VertexAttrib objects
	 */
	_createVertexAttributes: function() {
		throw "_createVertexAttributes not implemented";
	},


	/**
	 * Returns the number of floats per vertex for this batcher.
	 * 
	 * This method initially throws an error; so it must be overridden by
	 * subclasses of BaseBatch.
	 *
	 * @method  getVertexSize
	 * @return {Number} the size of a vertex, in # of floats
	 */
	getVertexSize: function() {
		throw "getVertexSize not implemented";
	},

	
	/** 
	 * Begins the sprite batch. This will bind the shader
	 * and mesh. Subclasses may want to disable depth or 
	 * set up blending.
	 *
	 * @method  begin
	 */
	begin: function()  {
		if (this.drawing) 
			throw "batch.end() must be called before begin";
		this.drawing = true;

		this.shader.bind();

		//bind the attributes now to avoid redundant calls
		this.mesh.bind(this.shader);

		if (this._blendingEnabled) {
			var gl = this.context.gl;
			gl.enable(gl.BLEND);
		}
	},

	/** 
	 * Ends the sprite batch. This will flush any remaining 
	 * data and set GL state back to normal.
	 * 
	 * @method  end
	 */
	end: function()  {
		if (!this.drawing)
			throw "batch.begin() must be called before end";
		if (this.idx > 0)
			this.flush();
		this.drawing = false;

		this.mesh.unbind(this.shader);

		if (this._blendingEnabled) {
			var gl = this.context.gl;
			gl.disable(gl.BLEND);
		}
	},

	/** 
	 * Called before rendering to bind new textures.
	 * This method does nothing by default.
	 *
	 * @method  _preRender
	 */
	_preRender: function()  {
	},

	/**
	 * Flushes the batch by pushing the current data
	 * to GL.
	 * 
	 * @method flush
	 */
	flush: function()  {
		if (this.idx===0)
			return;

		var gl = this.context.gl;

		//premultiplied alpha
		if (this._blendingEnabled) {
			//set either to null if you want to call your own 
			//blendFunc or blendFuncSeparate
			if (this._blendSrc && this._blendDst)
				gl.blendFunc(this._blendSrc, this._blendDst); 
		}

		this._preRender();

		//number of sprites in batch
		var numComponents = this.getVertexSize();
		var spriteCount = (this.idx / (numComponents * 4));
		
		//draw the sprites
		this.mesh.verticesDirty = true;
		this.mesh.draw(gl.TRIANGLES, spriteCount * 6, 0, this.idx);

		this.idx = 0;
	},

	/**
	 * Adds a sprite to this batch.
	 * The specifics depend on the sprite batch implementation.
	 *
	 * @method draw
	 * @param  {Texture} texture the texture for this sprite
	 * @param  {Number} x       the x position, defaults to zero
	 * @param  {Number} y       the y position, defaults to zero
	 * @param  {Number} width   the width, defaults to the texture width
	 * @param  {Number} height  the height, defaults to the texture height
	 * @param  {Number} u1      the first U coordinate, default zero
	 * @param  {Number} v1      the first V coordinate, default zero
	 * @param  {Number} u2      the second U coordinate, default one
	 * @param  {Number} v2      the second V coordinate, default one
	 */
	draw: function(texture, x, y, width, height, u1, v1, u2, v2) {
	},

	/**
	 * Adds a single quad mesh to this sprite batch from the given
	 * array of vertices.
	 * The specifics depend on the sprite batch implementation.
	 *
	 * @method  drawVertices
	 * @param {Texture} texture the texture we are drawing for this sprite
	 * @param {Float32Array} verts an array of vertices
	 * @param {Number} off the offset into the vertices array to read from
	 */
	drawVertices: function(texture, verts, off)  {
	},

	drawRegion: function(region, x, y, width, height) {
		this.draw(region.texture, x, y, width, height, region.u, region.v, region.u2, region.v2);
	},

	/**
	 * Destroys the batch, deleting its buffers and removing it from the
	 * WebGLContext management. Trying to use this
	 * batch after destroying it can lead to unpredictable behaviour.
	 *
	 * If `ownsShader` is true, this will also delete the `defaultShader` object.
	 * 
	 * @method destroy
	 */
	destroy: function() {
		this.vertices = null;
		this.indices = null;
		this.size = this.maxVertices = 0;

		if (this.ownsShader && this.defaultShader)
			this.defaultShader.destroy();
		this.defaultShader = null;
		this._shader = null; // remove reference to whatever shader is currently being used

		if (this.mesh) 
			this.mesh.destroy();
		this.mesh = null;
	}
});

module.exports = BaseBatch;

},{"kami-mesh-buffer":4,"kami-util":19,"klasse":21,"number-util":22}],4:[function(require,module,exports){
/**
 * @module kami-mesh-buffer
 */

var Class = require('klasse');
var wrapContext = require('kami-util').wrapContext;

//TODO: decouple into VBO + IBO utilities 
/**
 * A mesh class that wraps VBO and IBO. Mostly used internally.
 *
 * @class  Mesh
 */
var Mesh = new Class({


	/**
	 * A write-only property which sets both vertices and indices 
	 * flag to dirty or not. 
	 *
	 * @property dirty
	 * @type {Boolean}
	 * @writeOnly
	 */
	dirty: {
		set: function(val) {
			this.verticesDirty = val;
			this.indicesDirty = val;
		}
	},

	/**
	 * Creates a new Mesh with the provided parameters.
	 *
	 * If numIndices is 0 or falsy, no index buffer will be used
	 * and indices will be an empty ArrayBuffer and a null indexBuffer.
	 * 
	 * If isStatic is true, then vertexUsage and indexUsage will
	 * be set to gl.STATIC_DRAW. Otherwise they will use gl.DYNAMIC_DRAW.
	 * You may want to adjust these after initialization for further control.
	 * 
	 * @param  {WebGLContext}  context the context for management
	 * @param  {Boolean} isStatic      a hint as to whether this geometry is static
	 * @param  {[type]}  numVerts      [description]
	 * @param  {[type]}  numIndices    [description]
	 * @param  {[type]}  vertexAttribs [description]
	 * @return {[type]}                [description]
	 */
	initialize: function Mesh(context, isStatic, numVerts, numIndices, vertexAttribs) {
		if (!context || typeof context !== "object")
			throw "valid GL context not specified to mesh buffer";
		if (!numVerts)
			throw "numVerts not specified, must be > 0";

		this.context = wrapContext(context);
		this.gl = context.gl;
		
		this.numVerts = null;
		this.numIndices = null;
		
		this.vertices = null;
		this.indices = null;
		this.vertexBuffer = null;
		this.indexBuffer = null;

		this.verticesDirty = true;
		this.indicesDirty = true;
		this.indexUsage = null;
		this.vertexUsage = null;

		/** 
		 * @property
		 * @private
		 */
		this._vertexAttribs = null;

		/** 
		 * The stride for one vertex _in bytes_. 
		 * 
		 * @property {Number} vertexStride
		 */
		this.vertexStride = null;

		this.numVerts = numVerts;
		this.numIndices = numIndices || 0;
		this.vertexUsage = isStatic ? this.gl.STATIC_DRAW : this.gl.DYNAMIC_DRAW;
		this.indexUsage  = isStatic ? this.gl.STATIC_DRAW : this.gl.DYNAMIC_DRAW;
		this._vertexAttribs = vertexAttribs || [];
		
		this.indicesDirty = true;
		this.verticesDirty = true;

		//determine the vertex stride based on given attributes
		var totalNumComponents = 0;
		for (var i=0; i<this._vertexAttribs.length; i++)
			totalNumComponents += this._vertexAttribs[i].offsetCount;
		this.vertexStride = totalNumComponents * 4; // in bytes

		this.vertices = new Float32Array(this.numVerts);
		this.indices = new Uint16Array(this.numIndices);

		//add this VBO to the managed cache
		this.context.addManagedObject(this);

		this.create();
	},

	//recreates the buffers on context loss
	create: function() {
		this.gl = this.context.gl;
		var gl = this.gl;
		this.vertexBuffer = gl.createBuffer();

		//ignore index buffer if we haven't specified any
		this.indexBuffer = this.numIndices > 0
					? gl.createBuffer()
					: null;

		this.dirty = true;
	},

	destroy: function() {
		this.vertices = null;
		this.indices = null;
		if (this.vertexBuffer && this.gl)
			this.gl.deleteBuffer(this.vertexBuffer);
		if (this.indexBuffer && this.gl)
			this.gl.deleteBuffer(this.indexBuffer);
		this.vertexBuffer = null;
		this.indexBuffer = null;
		if (this.context)
			this.context.removeManagedObject(this);
		this.gl = null;
		this.context = null;
	},

	_updateBuffers: function(ignoreBind, subDataLength) {
		var gl = this.gl;

		//bind our index data, if we have any
		if (this.numIndices > 0) {
			if (!ignoreBind)
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

			//update the index data
			if (this.indicesDirty) {
				gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, this.indexUsage);
				this.indicesDirty = false;
			}
		}

		//bind our vertex data
		if (!ignoreBind)
			gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

		//update our vertex data
		if (this.verticesDirty) {
			if (subDataLength) {
				// TODO: When decoupling VBO/IBO be sure to give better subData support..
				var view = this.vertices.subarray(0, subDataLength);
				gl.bufferSubData(gl.ARRAY_BUFFER, 0, view);
			} else {
				gl.bufferData(gl.ARRAY_BUFFER, this.vertices, this.vertexUsage);	
			}

			
			this.verticesDirty = false;
		}
	},

	draw: function(primitiveType, count, offset, subDataLength) {
		if (count === 0)
			return;

		var gl = this.gl;
		
		offset = offset || 0;

		//binds and updates our buffers. pass ignoreBind as true
		//to avoid binding unnecessarily
		this._updateBuffers(true, subDataLength);

		if (this.numIndices > 0) { 
			gl.drawElements(primitiveType, count, 
						gl.UNSIGNED_SHORT, offset * 2); //* Uint16Array.BYTES_PER_ELEMENT
		} else
			gl.drawArrays(primitiveType, offset, count);
	},

	//binds this mesh's vertex attributes for the given shader
	bind: function(shader) {
		var gl = this.gl;

		var offset = 0;
		var stride = this.vertexStride;

		//bind and update our vertex data before binding attributes
		this._updateBuffers();

		//for each attribtue
		for (var i=0; i<this._vertexAttribs.length; i++) {
			var a = this._vertexAttribs[i];

			//location of the attribute
			var loc = a.location === null 
					? shader.getAttributeLocation(a.name)
					: a.location;

			//TODO: We may want to skip unfound attribs
			// if (loc!==0 && !loc)
			// 	console.warn("WARN:", a.name, "is not enabled");

			//first, enable the vertex array
			gl.enableVertexAttribArray(loc);

			//then specify our vertex format
			gl.vertexAttribPointer(loc, a.numComponents, a.type || gl.FLOAT, 
								   a.normalize, stride, offset);

			//and increase the offset...
			offset += a.offsetCount * 4; //in bytes
		}
	},

	unbind: function(shader) {
		var gl = this.gl;

		//for each attribtue
		for (var i=0; i<this._vertexAttribs.length; i++) {
			var a = this._vertexAttribs[i];

			//location of the attribute
			var loc = a.location === null 
					? shader.getAttributeLocation(a.name)
					: a.location;

			//first, enable the vertex array
			gl.disableVertexAttribArray(loc);
		}
	}
});

Mesh.Attrib = new Class({

	name: null,
	numComponents: null,
	location: null,
	type: null,

	/**
	 * Mesh vertex attribute holder.
	 * 
	 * Location is optional and for advanced users that
	 * want vertex arrays to match across shaders. Any non-numerical
	 * value will be converted to null, and ignored. If a numerical
	 * value is given, it will override the position of this attribute
	 * when given to a mesh.
	 *
	 * @class  Mesh.Attrib
	 * @constructor
	 * @param {String} name the name of the attribute
	 * @param {Number} numComponents the number of components, e.g. 2 for vec2
	 * @param {Number} location optional attribute index location
	 * @param {Number} type defaults to GL_FLOAT 
	 * @param {Number} normalize whether to normalize to 0-1, default false
	 */
	initialize: function(name, numComponents, location, type, normalize, offsetCount) {
		this.name = name;
		this.numComponents = numComponents;
		this.location = typeof location === "number" ? location : null;
		this.type = type;
		this.normalize = Boolean(normalize);
		this.offsetCount = typeof offsetCount === "number" ? offsetCount : this.numComponents;
	}
});


module.exports = Mesh;
},{"kami-util":19,"klasse":21}],5:[function(require,module,exports){
/**
 * Shader utilities for kami.
 * 
 * @module kami-shader
 */

var Class = require('klasse');
var compileShader = require('webgl-compile-shader');
var wrapContext = require('kami-util').wrapContext;

var ShaderProgram = new Class({
	
	/**
	 * Creates a new ShaderProgram from the given source, and an optional map of attribute
	 * locations as <name, index> pairs.
	 *
	 * _Note:_ Chrome version 31 was giving me issues with attribute locations -- you may
	 * want to omit this to let the browser pick the locations for you.	
	 *
	 * @class  ShaderProgram
	 * @constructor
	 * @param  {WebGLRenderingContext|WebGLContext} context      the context to manage this object
	 * @param  {String} vertSource         the vertex shader source
	 * @param  {String} fragSource         the fragment shader source
	 * @param  {Object} attributeLocations the attribute locations
	 */
	initialize: function ShaderProgram(context, vertSource, fragSource, attributeLocations) {
		if (!vertSource || !fragSource)
			throw "vertex and fragment shaders must be defined";
		if (!context || typeof context !== "object")
			throw "valid GL context not specified to ShaderProgram";

		this.context = wrapContext(context);

		this.vertShader = null;
		this.fragShader = null;
		this.program = null;
		this.log = "";

		this.uniformCache = null;
		this.attributeCache = null;

		this.attributeLocations = attributeLocations;

		//We trim so that the GLSL line numbers are
		//accurate on shader log
		this.vertSource = vertSource.trim();
		this.fragSource = fragSource.trim();

		//Adds this shader to the context, to be managed
		//This has no effect if the passed context is not a kami-context type
		this.context.addManagedObject(this);
		this.create();
	},

	/** 
	 * This is called during the ShaderProgram constructor,
	 * and may need to be called again after context loss and restore.
	 * 
	 * @method  create
	 */
	create: function() {
		this.gl = this.context.gl;
		this._compileShaders();
	},

	//Compiles the shaders, throwing an error if the program was invalid.
	_compileShaders: function() {
		var gl = this.gl; 
		
		var info = compileShader({
			gl: gl,
			vertex: this.vertSource,
			fragment: this.fragSource,
			verbose: ShaderProgram.VERBOSE_COMPILE,
			attributeLocations: this.attributeLocations
		});

		this.log = info.log;
		this.program = info.program;

		if (ShaderProgram.VERBOSE_COMPILE && this.log)
			console.warn(this.log);

		this._fetchUniforms();
		this._fetchAttributes();
	},

	_fetchUniforms: function() {
		var gl = this.gl;

		this.uniformCache = {};

		var len = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
		if (!len) //null or zero
			return;

		for (var i=0; i<len; i++) {
			var info = gl.getActiveUniform(this.program, i);
			if (info === null) 
				continue;
			var name = info.name;
			var location = gl.getUniformLocation(this.program, name);
			
			this.uniformCache[name] = {
				size: info.size,
				type: info.type,
				location: location
			};
		}
	},

	_fetchAttributes: function() { 
		var gl = this.gl; 

		this.attributeCache = {};

		var len = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
		if (!len) //null or zero
			return;	

		for (var i=0; i<len; i++) {
			var info = gl.getActiveAttrib(this.program, i);
			if (info === null) 
				continue;
			var name = info.name;

			//the attrib location is a simple index
			var location = gl.getAttribLocation(this.program, name);
			
			this.attributeCache[name] = {
				size: info.size,
				type: info.type,
				location: location
			};
		}
	},

	/**
	 * Called to bind this shader. Note that there is no "unbind" since
	 * technically such a thing is not possible in the programmable pipeline.
	 *
	 * You must bind a shader before settings its uniforms.
	 * 
	 * @method bind
	 */
	bind: function() {
		this.gl.useProgram(this.program);
	},


	/**
	 * Destroys this shader and its resources. You should not try to use this
	 * after destroying it.
	 * @method  destroy
	 */
	destroy: function() {
		if (this.context)
			this.context.removeManagedObject(this);

		if (this.gl && this.program) {
			var gl = this.gl;
			gl.deleteProgram(this.program);
		}
		this.attributeCache = null;
		this.uniformCache = null;
		this.vertShader = null;
		this.fragShader = null;
		this.program = null;
		this.gl = null;
		this.context = null;
	},

	/**
	 * Returns the cached uniform info (size, type, location).
	 * If the uniform is not found in the cache, it is assumed
	 * to not exist, and this method returns null.
	 *
	 * This may return null even if the uniform is defined in GLSL:
	 * if it is _inactive_ (i.e. not used in the program) then it may
	 * be optimized out.
	 *
	 * @method  getUniformInfo
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {Object} an object containing location, size, and type
	 */
	getUniformInfo: function(name) {
		return this.uniformCache[name] || null; 
	},

	/**
	 * Returns the cached attribute info (size, type, location).
	 * If the attribute is not found in the cache, it is assumed
	 * to not exist, and this method returns null.
	 *
	 * This may return null even if the attribute is defined in GLSL:
	 * if it is _inactive_ (i.e. not used in the program or disabled) 
	 * then it may be optimized out.
	 *
	 * @method  getAttributeInfo
	 * @param  {String} name the attribute name as defined in GLSL
	 * @return {object} an object containing location, size and type
	 */
	getAttributeInfo: function(name) {
		return this.attributeCache[name] || null; 
	},


	/**
	 * Returns the cached uniform location object.
	 * If the uniform is not found, this method returns null.
	 *
	 * @method  getAttributeLocation
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {GLint} the location object
	 */
	getAttributeLocation: function(name) { //TODO: make faster, don't cache
		var info = this.getAttributeInfo(name);
		return info ? info.location : null;
	},

	/**
	 * Returns the cached uniform location object, assuming it exists
	 * and is active. Note that uniforms may be inactive if 
	 * the GLSL compiler deemed them unused.
	 *
	 * @method  getUniformLocation
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {WebGLUniformLocation} the location object
	 */
	getUniformLocation: function(name) {
		var info = this.getUniformInfo(name);
		return info ? info.location : null;
	},

	/**
	 * Returns true if the uniform is active and found in this
	 * compiled program. Note that uniforms may be inactive if 
	 * the GLSL compiler deemed them unused.
	 *
	 * @method  hasUniform
	 * @param  {String}  name the uniform name
	 * @return {Boolean} true if the uniform is found and active
	 */
	hasUniform: function(name) {
		return this.getUniformInfo(name) !== null;
	},

	/**
	 * Returns true if the attribute is active and found in this
	 * compiled program.
	 *
	 * @method  hasAttribute
	 * @param  {String}  name the attribute name
	 * @return {Boolean} true if the attribute is found and active
	 */
	hasAttribute: function(name) {
		return this.getAttributeInfo(name) !== null;
	},

	/**
	 * Returns the uniform value by name.
	 *
	 * @method  getUniform
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {any} The value of the WebGL uniform
	 */
	getUniform: function(name) {
		return this.gl.getUniform(this.program, this.getUniformLocation(name));
	},

	/**
	 * Returns the uniform value at the specified WebGLUniformLocation.
	 *
	 * @method  getUniformAt
	 * @param  {WebGLUniformLocation} location the location object
	 * @return {any} The value of the WebGL uniform
	 */
	getUniformAt: function(location) {
		return this.gl.getUniform(this.program, location);
	},

	/**
	 * A convenience method to set uniformi from the given arguments.
	 * We determine which GL call to make based on the number of arguments
	 * passed. For example, `setUniformi("var", 0, 1)` maps to `gl.uniform2i`.
	 * 
	 * @method  setUniformi
	 * @param {String} name        		the name of the uniform
	 * @param {GLint} x  the x component for ints
	 * @param {GLint} y  the y component for ivec2
	 * @param {GLint} z  the z component for ivec3
	 * @param {GLint} w  the w component for ivec4
	 */
	setUniformi: function(name, x, y, z, w) {
		'use strict';
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (loc === null)
			return false;
		switch (arguments.length) {
			case 2: gl.uniform1i(loc, x); return true;
			case 3: gl.uniform2i(loc, x, y); return true;
			case 4: gl.uniform3i(loc, x, y, z); return true;
			case 5: gl.uniform4i(loc, x, y, z, w); return true;
			default:
				throw "invalid arguments to setUniformi"; 
		}
	},

	/**
	 * A convenience method to set uniformf from the given arguments.
	 * We determine which GL call to make based on the number of arguments
	 * passed. For example, `setUniformf("var", 0, 1)` maps to `gl.uniform2f`.
	 * 
	 * @method  setUniformf
	 * @param {String} name        		the name of the uniform
	 * @param {GLfloat} x  the x component for floats
	 * @param {GLfloat} y  the y component for vec2
	 * @param {GLfloat} z  the z component for vec3
	 * @param {GLfloat} w  the w component for vec4
	 */
	setUniformf: function(name, x, y, z, w) {
		'use strict';
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (loc === null)
			return false;
		switch (arguments.length) {
			case 2: gl.uniform1f(loc, x); return true;
			case 3: gl.uniform2f(loc, x, y); return true;
			case 4: gl.uniform3f(loc, x, y, z); return true;
			case 5: gl.uniform4f(loc, x, y, z, w); return true;
			default:
				throw "invalid arguments to setUniformf"; 
		}
	},

	//I guess we won't support sequence<GLfloat> .. whatever that is ??
	

	///// 
	
	/**
	 * A convenience method to set uniformNfv from the given ArrayBuffer.
	 * We determine which GL call to make based on the length of the array 
	 * buffer (for 1-4 component vectors stored in a Float32Array). To use
	 * this method to upload data to uniform arrays, you need to specify the
	 * 'count' parameter; i.e. the data type you are using for that array. If
	 * specified, this will dictate whether to call uniform1fv, uniform2fv, etc.
	 *
	 * @method  setUniformfv
	 * @param {String} name        		the name of the uniform
	 * @param {ArrayBuffer} arrayBuffer the array buffer
	 * @param {Number} count            optional, the explicit data type count, e.g. 2 for vec2
	 */
	setUniformfv: function(name, arrayBuffer, count) {
		'use strict';
		count = count || arrayBuffer.length;
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (loc === null)
			return false;
		switch (count) {
			case 1: gl.uniform1fv(loc, arrayBuffer); return true;
			case 2: gl.uniform2fv(loc, arrayBuffer); return true;
			case 3: gl.uniform3fv(loc, arrayBuffer); return true;
			case 4: gl.uniform4fv(loc, arrayBuffer); return true;
			default:
				throw "invalid arguments to setUniformf"; 
		}
	},

	/**
	 * A convenience method to set uniformNiv from the given ArrayBuffer.
	 * We determine which GL call to make based on the length of the array 
	 * buffer (for 1-4 component vectors stored in a int array). To use
	 * this method to upload data to uniform arrays, you need to specify the
	 * 'count' parameter; i.e. the data type you are using for that array. If
	 * specified, this will dictate whether to call uniform1fv, uniform2fv, etc.
	 *
	 * @method  setUniformiv
	 * @param {String} name        		the name of the uniform
	 * @param {ArrayBuffer} arrayBuffer the array buffer
	 * @param {Number} count            optional, the explicit data type count, e.g. 2 for ivec2
	 */
	setUniformiv: function(name, arrayBuffer, count) {
		'use strict';
		count = count || arrayBuffer.length;
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (loc === null)
			return false;
		switch (count) {
			case 1: gl.uniform1iv(loc, arrayBuffer); return true;
			case 2: gl.uniform2iv(loc, arrayBuffer); return true;
			case 3: gl.uniform3iv(loc, arrayBuffer); return true;
			case 4: gl.uniform4iv(loc, arrayBuffer); return true;
			default:
				throw "invalid arguments to setUniformf"; 
		}
	},

	/**
	 * This is a convenience function to pass a Matrix3 (from vecmath,
	 * kami's preferred math library) or a Float32Array (e.g. gl-matrix)
	 * to a shader. If mat is an object with "val", it is considered to be
	 * a Matrix3, otherwise assumed to be a typed array being passed directly
	 * to the shader.
	 * 
	 * @param {String} name the uniform name
	 * @param {Matrix3|Float32Array} mat a Matrix3 or Float32Array
	 * @param {Boolean} transpose whether to transpose the matrix, default false
	 */
	setUniformMatrix3: function(name, mat, transpose) {
		'use strict';
		var arr = typeof mat === "object" && mat.val ? mat.val : mat;
		transpose = !!transpose; //to boolean

		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (loc === null)
			return false;
		gl.uniformMatrix3fv(loc, transpose, arr)
	},

	/**
	 * This is a convenience function to pass a Matrix4 (from vecmath,
	 * kami's preferred math library) or a Float32Array (e.g. gl-matrix)
	 * to a shader. If mat is an object with "val", it is considered to be
	 * a Matrix4, otherwise assumed to be a typed array being passed directly
	 * to the shader.
	 * 
	 * @param {String} name the uniform name
	 * @param {Matrix4|Float32Array} mat a Matrix4 or Float32Array
	 * @param {Boolean} transpose whether to transpose the matrix, default false
	 */
	setUniformMatrix4: function(name, mat, transpose) {
		'use strict';
		var arr = typeof mat === "object" && mat.val ? mat.val : mat;
		transpose = !!transpose; //to boolean

		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (loc === null)
			return false;
		gl.uniformMatrix4fv(loc, transpose, arr)
	} 
 
});

//Some default attribute names that parts of kami will use
//when creating a standard shader.
ShaderProgram.POSITION_ATTRIBUTE = "Position";
ShaderProgram.NORMAL_ATTRIBUTE = "Normal";
ShaderProgram.COLOR_ATTRIBUTE = "Color";
ShaderProgram.TEXCOORD_ATTRIBUTE = "TexCoord";

/**
 * Whether to include verbose warnings during shader compilation.
 * This includes:
 *
 *   - Printing full shaders (with line numbers) when there is an error
 *   - Printing warnings even if the shader compiled successfully 
 *   
 * @property {Boolean} VERBOSE_COMPILE
 */
ShaderProgram.VERBOSE_COMPILE = true;

module.exports = ShaderProgram;
},{"kami-util":19,"klasse":6,"webgl-compile-shader":8}],6:[function(require,module,exports){
function hasGetterOrSetter(def) {
	return (!!def.get && typeof def.get === "function") || (!!def.set && typeof def.set === "function");
}

function getProperty(definition, k, isClassDescriptor) {
	//This may be a lightweight object, OR it might be a property
	//that was defined previously.
	
	//For simple class descriptors we can just assume its NOT previously defined.
	var def = isClassDescriptor 
				? definition[k] 
				: Object.getOwnPropertyDescriptor(definition, k);

	if (!isClassDescriptor && def.value && typeof def.value === "object") {
		def = def.value;
	}


	//This might be a regular property, or it may be a getter/setter the user defined in a class.
	if ( def && hasGetterOrSetter(def) ) {
		if (typeof def.enumerable === "undefined")
			def.enumerable = true;
		if (typeof def.configurable === "undefined")
			def.configurable = true;
		return def;
	} else {
		return false;
	}
}

function hasNonConfigurable(obj, k) {
	var prop = Object.getOwnPropertyDescriptor(obj, k);
	if (!prop)
		return false;

	if (prop.value && typeof prop.value === "object")
		prop = prop.value;

	if (prop.configurable === false) 
		return true;

	return false;
}

//TODO: On create, 
//		On mixin, 

function extend(ctor, definition, isClassDescriptor, extend) {
	for (var k in definition) {
		if (!definition.hasOwnProperty(k))
			continue;

		var def = getProperty(definition, k, isClassDescriptor);

		if (def !== false) {
			//If Extends is used, we will check its prototype to see if 
			//the final variable exists.
			
			var parent = extend || ctor;
			if (hasNonConfigurable(parent.prototype, k)) {

				//just skip the final property
				if (Class.ignoreFinals)
					continue;

				//We cannot re-define a property that is configurable=false.
				//So we will consider them final and throw an error. This is by
				//default so it is clear to the developer what is happening.
				//You can set ignoreFinals to true if you need to extend a class
				//which has configurable=false; it will simply not re-define final properties.
				throw new Error("cannot override final property '"+k
							+"', set Class.ignoreFinals = true to skip");
			}

			Object.defineProperty(ctor.prototype, k, def);
		} else {
			ctor.prototype[k] = definition[k];
		}

	}
}

/**
 */
function mixin(myClass, mixins) {
	if (!mixins)
		return;

	if (!Array.isArray(mixins))
		mixins = [mixins];

	for (var i=0; i<mixins.length; i++) {
		extend(myClass, mixins[i].prototype || mixins[i]);
	}
}

/**
 * Creates a new class with the given descriptor.
 * The constructor, defined by the name `initialize`,
 * is an optional function. If unspecified, an anonymous
 * function will be used which calls the parent class (if
 * one exists). 
 *
 * You can also use `Extends` and `Mixins` to provide subclassing
 * and inheritance.
 *
 * @class  Class
 * @constructor
 * @param {Object} definition a dictionary of functions for the class
 * @example
 *
 * 		var MyClass = new Class({
 * 		
 * 			initialize: function() {
 * 				this.foo = 2.0;
 * 			},
 *
 * 			bar: function() {
 * 				return this.foo + 5;
 * 			}
 * 		});
 */
function Class(definition) {
	if (!definition)
		definition = {};

	//The variable name here dictates what we see in Chrome debugger
	var initialize;
	var Extends;

	if (definition.initialize) {
		if (typeof definition.initialize !== "function")
			throw new Error("initialize must be a function");
		initialize = definition.initialize;

		//Usually we should avoid "delete" in V8 at all costs.
		//However, its unlikely to make any performance difference
		//here since we only call this on class creation (i.e. not object creation).
		delete definition.initialize;
	} else {
		if (definition.Extends) {
			var base = definition.Extends;
			initialize = function () {
				base.apply(this, arguments);
			}; 
		} else {
			initialize = function () {}; 
		}
	}

	if (definition.Extends) {
		initialize.prototype = Object.create(definition.Extends.prototype);
		initialize.prototype.constructor = initialize;
		//for getOwnPropertyDescriptor to work, we need to act
		//directly on the Extends (or Mixin)
		Extends = definition.Extends;
		delete definition.Extends;
	} else {
		initialize.prototype.constructor = initialize;
	}

	//Grab the mixins, if they are specified...
	var mixins = null;
	if (definition.Mixins) {
		mixins = definition.Mixins;
		delete definition.Mixins;
	}

	//First, mixin if we can.
	mixin(initialize, mixins);

	//Now we grab the actual definition which defines the overrides.
	extend(initialize, definition, true, Extends);

	return initialize;
};

Class.extend = extend;
Class.mixin = mixin;
Class.ignoreFinals = false;

module.exports = Class;
},{}],7:[function(require,module,exports){
//could be pulled out to webgl-context
module.exports = function(opts) {
    opts = opts||{};
    var canvas = opts.canvas || document.createElement("canvas");
    var attribs = opts.attribs || {};
    try {
        gl = (canvas.getContext('webgl', attribs) || canvas.getContext('experimental-webgl', attribs));
    } catch (e) {
        gl = null;
    }   
    if (!gl) {
        throw "WebGL Context Not Supported -- try enabling it or using a different browser";
    }
    return gl;
};
},{}],8:[function(require,module,exports){
var getGL = require('./getGL');

module.exports = function(opts) {
    if (!opts || (!opts.vertex || !opts.fragment))
        throw "must specify vertex and fragment source";
    var vertSource = (opts.vertex).trim();
    var fragSource = (opts.fragment).trim();


    var gl = opts.gl;
    if (!gl) {
        gl = getGL(opts);
    }
    return compile(gl, vertSource, fragSource);
};

//Compiles the shaders, throwing an error if the program was invalid.
function compile(gl, vertSource, fragSource) {
    var log = "";

    var vert = loadShader(gl, gl.VERTEX_SHADER, vertSource);
    var frag = loadShader(gl, gl.FRAGMENT_SHADER, fragSource);

    var vertShader = vert.shader;
    var fragShader = frag.shader;

    log += vert.log + "\n" + frag.log;

    var program = gl.createProgram();

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);

    gl.linkProgram(program); 

    log += gl.getProgramInfoLog(program) || "";
    
    gl.detachShader(program, vertShader);
    gl.detachShader(program, fragShader);
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Error linking the shader program:\n" + log+"\nVERTEX_SHADER:\n"
                +addLineNumbers(vertSource) +"\n\nFRAGMENT_SHADER:\n"
                +addLineNumbers(fragSource));
    }
    return {
        program: program,
        log: log.trim()
    };
}

function loadShader(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) //should not occur...
        return -1;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    //we do this so the user knows which shader has the error
    var typeStr = (type === gl.VERTEX_SHADER) ? "vertex" : "fragment";

    var logResult = gl.getShaderInfoLog(shader) || "";
    if (logResult) {
        logResult = "Error compiling "+ typeStr+ " shader:\n"+logResult+"\n"+addLineNumbers(source);
    }

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) ) {
        throw new Error(logResult);
    }
    if (!shader)
        throw new Error("gl.createShader returned 0 for "+typeStr+" shader.\n"+logResult);
    return {
        shader: shader,
        log: logResult
    };
}

function addLineNumbers( string ) {
    var lines = string.split( '\n' );
    for ( var i = 0; i < lines.length; i ++ ) {
        lines[ i ] = ( i + 1 ) + ': ' + lines[ i ];
    }
    return lines.join( '\n' );
}
},{"./getGL":7}],9:[function(require,module,exports){
/**
 * Creates a WebGL context which attempts to manage the 
 * state of kami objects that are created with this as a 
 * parameter. 
 * 
 * @module kami-context
 */

var Class = require('klasse');
var Signal = require('signals');
var getContext = require('webgl-context');

/**
 * A thin wrapper around WebGLRenderingContext which handles
 * context loss and restore with various rendering objects (textures,
 * shaders and buffers). This also handles general viewport management.
 *
 * If the `canvas` option isn't specified, a new canvas will be created.
 *
 * If `gl` is specified and is an instance of WebGLRenderingContext, the `canvas` 
 * and `attributes` options will be ignored and we will use `gl` without fetching another `getContext`.
 * Providing a canvas that has `getContext('webgl')` already called will not cause
 * errors, but in certain debuggers (e.g. Chrome WebGL Inspector), only the latest
 * context will be traced.
 *
 * If `handleContextLoss` is true (default), this will attempt to re-create the context
 * manually (i.e. no "Rats! WebGL hit a snag!" message), by iterating through all 'managed objects'
 * and calling create() on them. 
 * 
 * @class  WebGLContext
 * @constructor
 * @param {Object} options some options for creation
 * @param {Number} options.width the width of the GL canvas
 * @param {Number} options.height the height of the GL canvas
 * @param {HTMLCanvasElement} options.canvas the optional DOM canvas element
 * @param {Object} options.attributes an object containing context attribs which
 *                                   will be used during GL initialization
 * @param {WebGLRenderingContext} options.gl the already-initialized GL context to use
 * @param {Boolean} options.handleContextLoss whether to try and manage context loss, default true
 */
var WebGLContext = new Class({

    initialize: function WebGLContext(options) {
        if (!(this instanceof WebGLContext))
            return new WebGLContext(options);
        options = options||{};

        var width = options.width;
        var height = options.height;
        var view = options.canvas;
        var gl = options.gl;
        var contextAttributes = options.contextAttributes;
        this.handleContextLoss = typeof options.handleContextLoss === "boolean" ? options.handleContextLoss : true;

        /**
         * The list of rendering objects (shaders, VBOs, textures, etc) which are 
         * currently being managed. Any object with a "create" method can be added
         * to this list. Upon destroying the rendering object, it should be removed.
         * See addManagedObject and removeManagedObject.
         * 
         * @property {Array} managedObjects
         */
        this.managedObjects = [];

        /**
         * The actual GL context. You can use this for
         * raw GL calls or to access GLenum constants. This
         * will be updated on context restore. While the WebGLContext
         * is not `valid`, you should not try to access GL state.
         * 
         * @property gl
         * @type {WebGLRenderingContext}
         */
        this.gl = null;

        //if the user specified a GL context..
        if (gl && typeof window.WebGLRenderingContext !== "undefined"
               && gl instanceof window.WebGLRenderingContext) {
            view = gl.canvas;
            this.gl = gl;
            this.valid = true;
            contextAttributes = undefined; //just ignore new attribs...
        }

        /**
         * The canvas DOM element for this context.
         * @property {HTMLCanvasElement} canvas
         */
        this.canvas = view || document.createElement("canvas");

        /**
         * The width of this canvas.
         *
         * @property width
         * @type {Number}
         */
        if (typeof width==="number") 
            this.width = this.canvas.width = width;
        else //if no size is specified, use canvas size
            this.width = this.canvas.width;

        /**
         * The height of this canvas.
         * @property height
         * @type {Number}
         */
        if (typeof height==="number")
            this.height = this.canvas.height = height;
        else //if no size is specified, use canvas size
            this.height = this.canvas.height;

        /**
         * The context attributes for initializing the GL state. This might include
         * anti-aliasing, alpha settings, verison, and so forth.
         * 
         * @property {Object} contextAttributes 
         */
        this.contextAttributes = contextAttributes;
        
        /**
         * Whether this context is 'valid', i.e. renderable. A context that has been lost
         * (and not yet restored) or destroyed is invalid.
         * 
         * @property {Boolean} valid
         */
        this.valid = false;

        /**
         * A signal dispatched when GL context is lost. 
         * 
         * The first argument passed to the listener is the WebGLContext
         * managing the context loss.
         * 
         * @event {Signal} lost
         */
        this.lost = new Signal();

        /**
         * A signal dispatched when GL context is restored, after all the managed
         * objects have been recreated.
         *
         * The first argument passed to the listener is the WebGLContext
         * which managed the restoration.
         *
         * This does not gaurentee that all objects will be renderable.
         * For example, a Texture with an ImageProvider may still be loading
         * asynchronously.   
         * 
         * @event {Signal} restored
         */
        this.restored = new Signal();   
        
        //setup context lost and restore listeners
        this.canvas.addEventListener("webglcontextlost", function (ev) {
            if (this.handleContextLoss)
                ev.preventDefault();
            this._contextLost(ev);
        }.bind(this));
        this.canvas.addEventListener("webglcontextrestored", function (ev) {
            if (this.handleContextLoss)
                ev.preventDefault();
            this._contextRestored(ev);
        }.bind(this));
            
        if (!this.valid) //would only be valid if WebGLRenderingContext was passed 
            this._initContext();

        this.resize(this.width, this.height);
    },
    
    _initContext: function() {
        var err = "";
        this.valid = false;
        this.gl = getContext({
            canvas: this.canvas,
            attributes: this.contextAttributes
        });

        if (this.gl) {
            this.valid = true;
        } else {
            throw new Error("WebGL Context Not Supported -- try enabling it or using a different browser");
        }   
    },

    /**
     * Updates the width and height of this WebGL context, resizes
     * the canvas view, and calls gl.viewport() with the new size.
     * 
     * @method  resize
     * @param  {Number} width  the new width
     * @param  {Number} height the new height
     */
    resize: function(width, height) {
        this.width = width;
        this.height = height;

        this.canvas.width = width;
        this.canvas.height = height;

        var gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
    },

    /**
     * (internal use)
     * A managed object is anything with a "create" function, that will
     * restore GL state after context loss. 
     *
     * @private
     * @method  addManagedObject
     * @param {[type]} tex [description]
     */
    addManagedObject: function(obj) {
        this.managedObjects.push(obj);
    },

    /**
     * (internal use)
     * Removes a managed object from the cache. This is useful to destroy
     * a texture or shader, and have it no longer re-load on context restore.
     *
     * Returns the object that was removed, or null if it was not found in the cache.
     *
     * @private
     * @method  removeManagedObject
     * @param  {Object} obj the object to be managed
     * @return {Object}     the removed object, or null
     */
    removeManagedObject: function(obj) {
        var idx = this.managedObjects.indexOf(obj);
        if (idx > -1) {
            this.managedObjects.splice(idx, 1);
            return obj;
        } 
        return null;
    },

    /**
     * Calls destroy() on each managed object, then removes references to these objects
     * and the GL rendering context. This also removes references to the view and sets
     * the context's width and height to zero.
     *
     * Attempting to use this WebGLContext or the GL rendering context after destroying it
     * will lead to undefined behaviour.
     *
     * @method  destroy
     */
    destroy: function() {
        for (var i=0; i<this.managedObjects.length; i++) {
            var obj = this.managedObjects[i];
            if (obj && typeof obj.destroy === "function")
                obj.destroy();
        }
        this.managedObjects.length = 0;
        this.valid = false;
        this.gl = null;
        this.canvas = null;
        this.width = this.height = 0;
    },

    _contextLost: function(ev) {
        //all textures/shaders/buffers/FBOs have been deleted... 
        //we need to re-create them on restore
        this.valid = false;

        this.lost.dispatch(this);
    },

    _contextRestored: function(ev) {
        //first, initialize the GL context again
        this._initContext();

        //now we recreate our shaders and textures
        if (this.handleContextLoss) {
            for (var i=0; i<this.managedObjects.length; i++) {
                if (this.managedObjects[i] && typeof this.managedObjects[i].create === "function")
                    this.managedObjects[i].create();
            }
        }

        //update GL viewport
        this.resize(this.width, this.height);

        this.restored.dispatch(this);
    },

    /**
     * Backward-compatible view getter/setter.
     * Deprecated, may be removed in the future.
     * 
     * @deprecated use canvas instead
     * @property {HTMLCanvas} view 
     */
    view: {
        get: function() {
            return this.canvas;
        },
        set: function(canvas) {
            this.canvas = canvas;
        }
    }
});

module.exports = WebGLContext;
},{"klasse":21,"signals":23,"webgl-context":10}],10:[function(require,module,exports){
module.exports = function(opts) {
    opts = opts||{};
    var canvas = opts.canvas || document.createElement("canvas");
    if (typeof opts.width === "number")
        canvas.width = opts.width;
    if (typeof opts.height === "number")
        canvas.height = opts.height;
    
    var attribs = (opts.attributes || opts.attribs || {});
    try {
        gl = (canvas.getContext('webgl', attribs) || canvas.getContext('experimental-webgl', attribs));
    } catch (e) {
        gl = null;
    }
    return gl;
};
},{}],11:[function(require,module,exports){
/** 
 * @module  kami-fbo
 */

var Class = require('klasse');
var Texture = require('kami-texture');
var wrapContext = require('kami-util').wrapContext;

var FrameBuffer = new Class({

	/**
	 * Creates a new Frame Buffer Object with the given width and height.
	 *
	 * It's advised to use FrameBuffer.getMaxSize(gl) as a utility to ensure
	 * your texture is under the hardware limits. If it exceeds this size in
	 * either dimension, this constructor will throw an error.
	 *
	 * If `texture` is provided to the options, we will use that as the 
	 * color buffer texture and grab its width/height.
	 * 
	 * @class  FrameBuffer
	 * @param {WebGLRenderingContext|kami-context} context the gl/kami context
	 * @param {Object} options the options for initialization
	 *   @param {Number} options.width the width of the texture, must be >= 1
	 *   @param {Number} options.height the height of the texture, must be >= 1
	 *   @param {GLenum} options.format the format of the texture, default gl.RGBA
	 *   @param {Texture} options.texture a kami-texture to use instead of creating a new one
	 * @constructor
	 */
	initialize: function FrameBuffer(context, options) { //TODO: depth component
		if (!(this instanceof FrameBuffer))
			return new FrameBuffer(context, options);
		if (!context || typeof context !== "object")
			throw "valid GL context not specified to FrameBuffer";
		options = options||{};

		/**
		 * The underlying ID of the GL frame buffer object.
		 *
		 * @property {WebGLFramebuffer} id
		 */		
		this.id = null;

		/**
		 * The WebGLContext backed by this frame buffer.
		 *
		 * @property {WebGLContext} context
		 */
		this.context = wrapContext(context);

		//If a texture is passed, use that instead of creating a new one...
		if (options.texture) {
			options.width = options.texture.width;
			options.height = options.texture.height;	
		}

		if (typeof options.width !== "number" || typeof options.height !== "number")
			throw new Error("must specify width and height to frame buffer");

		var width = Math.max(1, options.width||0);
		var height = Math.max(1, options.height||0);
		var maxSize = FrameBuffer.getMaxSize(this.context.gl);
		if (width > maxSize || height > maxSize) {
			throw new Error("FrameBuffer is above available renderbuffer size ("+maxSize+")");
		}

		/**
		 * The Texture backed by this frame buffer.
		 *
		 * @property {Texture} Texture
		 */
		//this Texture is now managed.
		this.texture = options.texture || new Texture(context, {
			width: width,
			height: height,
			format: options.format
		});

		//This is maanged by WebGLContext
		this.context.addManagedObject(this);
		this.create();
	},

	/**
	 * A read-only property which returns the width of the backing texture. 
	 * 
	 * @readOnly
	 * @property width
	 * @type {Number}
	 */
	width: {
		get: function() {
			return this.texture.width;
		}
	},

	/**
	 * A read-only property which returns the height of the backing texture. 
	 * 
	 * @readOnly
	 * @property height
	 * @type {Number}
	 */
	height: {
		get: function() {
			return this.texture.height;
		}
	},


	/**
	 * Called during initialization to setup the frame buffer; also called on
	 * context restore. Users will not need to call this directly.
	 * 
	 * @method create
	 */
	create: function() {
		this.gl = this.context.gl; 
		var gl = this.gl;

		var tex = this.texture;

		//we assume the texture has already had create() called on it
		//since it was added as a managed object prior to this FrameBuffer
		tex.bind();
 
		this.id = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.id);

		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex.target, tex.id, 0);

		var result = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		if (result != gl.FRAMEBUFFER_COMPLETE) {
			this.destroy(); //destroy our resources before leaving this function..

			var err = "Framebuffer not complete";
			switch (result) {
				case gl.FRAMEBUFFER_UNSUPPORTED:
					throw new Error(err + ": unsupported");
				case gl.INCOMPLETE_DIMENSIONS:
					throw new Error(err + ": incomplete dimensions");
				case gl.INCOMPLETE_ATTACHMENT:
					throw new Error(err + ": incomplete attachment");
				case gl.INCOMPLETE_MISSING_ATTACHMENT:
					throw new Error(err + ": missing attachment");
				default:
					throw new Error(err);
			}
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	},


	/**
	 * Destroys this frame buffer. Using this object after destroying it will have
	 * undefined results. 
	 * @method destroy
	 */
	destroy: function() {
		var gl = this.gl;

		if (this.texture)
			this.texture.destroy();
		if (this.id && this.gl)
			this.gl.deleteFramebuffer(this.id);
		if (this.context)
			this.context.removeManagedObject(this);

		this.id = null;
		this.gl = null;
		this.texture = null;
		this.context = null;
	},

	/**
	 * Binds this framebuffer and sets the viewport to the expected size.
	 * @method begin
	 */
	begin: function() {
		var gl = this.gl;
		gl.viewport(0, 0, this.texture.width, this.texture.height);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.id);
	},

	/**
	 * Binds the default frame buffer (the screen) and sets the viewport back
	 * to the size of the WebGLContext.
	 * 
	 * @method end
	 */
	end: function() {
		var gl = this.gl;
		gl.viewport(0, 0, this.context.width, this.context.height);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}
});

FrameBuffer.getMaxSize = function(gl) {
	if (!gl)
		throw "no gl specified to FrameBuffer.getMaxSize";
	//TODO: cache this?
	return gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
};

module.exports = FrameBuffer;
},{"kami-texture":12,"kami-util":19,"klasse":21}],12:[function(require,module,exports){
/**
 * Texture utils for kami.
 * 
 * @module kami-texture
 */

var Class = require('klasse');
var nextPowerOfTwo = require('number-util').nextPowerOfTwo;
var isPowerOfTwo = require('number-util').isPowerOfTwo;
var wrapContext = require('kami-util').wrapContext;

var Texture = new Class({

	/**
	 * Creates a new texture with the optional width, height, and data.
	 *
	 * If the constructor is passed no parameters other than the context, then
	 * it will not be initialized and will be non-renderable. You will need to manually
	 * uploadData or uploadImage yourself.
	 *
	 * If the options passed includes 'src', it assumes an image is to be loaded, 
	 * and will use the width/height from that resulting image. Otherwise, it 
	 * will look for 'data', which may be a typed array or any valid "image" object. 
	 * A typed array will need its width/height passed explicitly. 
	 * 
	 * If the context is a kami-context, we will try to manage the Texture object by
	 * keeping the arguments in memory for future use. 
	 *
	 * Most users will want to use the AssetManager to create and manage their textures
	 * with asynchronous loading and context loss. 
	 *
	 * @class  Texture
	 * @constructor
	 * @param  {WebGLRenderingContext|kami-context} context the WebGL context
	 * @param  {Object} options the options to create this texture
	 *   @param {String} options.src the path to the image file, if ommitted we assume data will be given
	 *   @param {Function} options.onLoad called when the image is loaded (if src is provided)
	 *   @param {Function} options.onError called when there was an error loading the image (if src is provided)
	 *   @param {ArrayBuffer} options.data some typed array with texture data, ignored if 'src' is specified
	 *   @param {GLenum} options.format the texture format, default Texture.Format.RGBA (for when data is specified)
	 *   @param {GLenum} options.type the data type, default Texture.DataType.UNSIGNED_BYTE (for when data is specified)
	 *   @param {Number} options.width the width of the texture (if we are not specifying an image URL)
	 *   @param {Number} options.height the height of the texture (if we are not specifying an image URL)
	 *   @param {Boolean} options.genMipmaps whether to generate mipmaps after upload
	 */
	initialize: function Texture(context, options) {
		if (!(this instanceof Texture))
			return new Texture(context, options);
		if (!context || typeof context !== "object")
			throw "valid GL context not specified to Texture";

		this.context = wrapContext(context);

		/**
		 * When a texture is created, we keep track of the arguments provided to 
		 * its constructor. On context loss and restore, these arguments are re-supplied
		 * to the Texture, so as to re-create it in its correct form.
		 *
		 * This is mainly useful if you are procedurally creating textures and passing
		 * their data directly (e.g. for generic lookup tables in a shader). For image
		 * or media based textures, it would be better to use an AssetManager to manage
		 * the asynchronous texture upload.
		 *
		 * Upon destroying a texture, a reference to this is also lost.
		 *
		 * @property managedArgs
		 * @type {Object} the options given to the Texture constructor, or undefined
		 */
		this.managedArgs = options;

		/**
		 * The WebGLTexture which backs this Texture object. This
		 * can be used for low-level GL calls.
		 * 
		 * @type {WebGLTexture}
		 */
		this.id = null; //initialized in create()

		/**
		 * The target for this texture unit, i.e. TEXTURE_2D. Subclasses
		 * should override the create() method to change this, for correct
		 * usage with context restore.
		 * 
		 * @property target
		 * @type {GLenum}
		 * @default  gl.TEXTURE_2D
		 */
		this.target = this.context.gl.TEXTURE_2D;

		/**
		 * The width of this texture, in pixels.
		 * 
		 * @property width
		 * @readOnly
		 * @type {Number} the width
		 */
		this.width = 0; //initialized on texture upload

		/**
		 * The height of this texture, in pixels.
		 * 
		 * @property height
		 * @readOnly
		 * @type {Number} the height
		 */
		this.height = 0; //initialized on texture upload

		// e.g. --> new Texture(gl, 256, 256, gl.RGB, gl.UNSIGNED_BYTE, data);
		//		      creates a new empty texture, 256x256
		//		--> new Texture(gl);
		//			  creates a new texture but WITHOUT uploading any data. 

		/**
		 * The S wrap parameter.
		 * @property {GLenum} wrapS
		 */
		this.wrapS = Texture.DEFAULT_WRAP;
		/**
		 * The T wrap parameter.
		 * @property {GLenum} wrapT
		 */
		this.wrapT = Texture.DEFAULT_WRAP;
		/**
		 * The minifcation filter.
		 * @property {GLenum} minFilter 
		 */
		this.minFilter = Texture.DEFAULT_FILTER;
		
		/**
		 * The magnification filter.
		 * @property {GLenum} magFilter 
		 */
		this.magFilter = Texture.DEFAULT_FILTER;

		//manage if we're dealing with a kami-context
		this.context.addManagedObject(this);
		this.create();
	},

	/**
	 * This can be called after creating a Texture to load an Image object asynchronously,
	 * or upload image data directly. It takes the same options as the constructor.
	 *
	 * Users will generally not need to call this directly. 
	 * 
	 * @protected
	 * @method  setup
	 */
	setup: function(options) {
		var gl = this.gl;

		//If no options is provided... this method does nothing.
		if (!options)
			return;

		// width, height, format, dataType, data, genMipmaps

		//If 'src' is provided, try to load the image from a path...
		if (options.src && typeof options.src==="string") {
			var img = new Image();
			var path       = options.src;
			var successCB  = typeof options.onLoad === "function" ? options.onLoad : null;
			var failCB     = typeof options.onError === "function" ? options.onError : null;
			var genMipmaps = options.genMipmaps;

			var self = this;

			//If you try to render a texture that is not yet "renderable" (i.e. the 
			//async load hasn't completed yet, which is always the case in Chrome since requestAnimationFrame
			//fires before img.onload), WebGL will throw us errors. So instead we will just upload some
			//dummy data until the texture load is complete. Users can disable this with the global flag.
			if (Texture.USE_DUMMY_1x1_DATA) {
				self.uploadData(1, 1);
				this.width = this.height = 0;
			}

			img.onload = function(ev) {
				self.uploadImage(img, undefined, undefined, genMipmaps);
				if (successCB)
					successCB(ev);
			}
			img.onerror = function(ev) {
				if (genMipmaps) //we still need to gen mipmaps on the 1x1 dummy
					gl.generateMipmap(gl.TEXTURE_2D);
				if (failCB)
					failCB(ev);
			}
			img.onabort = function(ev) {
				if (genMipmaps) 
					gl.generateMipmap(gl.TEXTURE_2D);
				if (failCB)
					failCB(ev);
			}

			img.src = path;
		} 
		//otherwise assume our regular list of width/height arguments are passed
		else {
			this.uploadData(options.width, options.height, options.format, 
							options.dataType, options.data, options.genMipmaps);
		}
	},	

	/**
	 * Called in the Texture constructor, and after the GL context has been re-initialized. 
	 * Subclasses can override this to provide a custom data upload, e.g. cubemaps or compressed
	 * textures.
	 *
	 * @method  create
	 */
	create: function() {
		this.gl = this.context.gl; 
		var gl = this.gl;

		this.id = gl.createTexture(); //texture ID is recreated
		this.width = this.height = 0; //size is reset to zero until loaded
		this.target = gl.TEXTURE_2D;  //the provider can change this if necessary (e.g. cube maps)

		this.bind();

		//TODO: clean these up a little. 
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, Texture.UNPACK_PREMULTIPLY_ALPHA);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, Texture.UNPACK_ALIGNMENT);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, Texture.UNPACK_FLIP_Y);
		
		var colorspace = Texture.UNPACK_COLORSPACE_CONVERSION || gl.BROWSER_DEFAULT_WEBGL;
		gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, colorspace);

		//setup wrap modes without binding redundantly
		this.setWrap(this.wrapS, this.wrapT, false);
		this.setFilter(this.minFilter, this.magFilter, false);
		
		if (this.managedArgs) {
			this.setup(this.managedArgs);
		}
	},

	/**
	 * Destroys this texture by deleting the GL resource,
	 * removing it from the WebGLContext management stack,
	 * setting its size to zero, and id and managed arguments to null.
	 * 
	 * Trying to use this texture after may lead to undefined behaviour.
	 *
	 * @method  destroy
	 */
	destroy: function() {
		if (this.id && this.gl)
			this.gl.deleteTexture(this.id);
		if (this.context)
			this.context.removeManagedObject(this);
		this.width = this.height = 0;
		this.id = null;
		this.managedArgs = null;
		this.context = null;
		this.gl = null;
	},

	/**
	 * Sets the wrap mode for this texture; if the second argument
	 * is undefined or falsy, then both S and T wrap will use the first
	 * argument.
	 *
	 * You can use Texture.Wrap constants for convenience, to avoid needing 
	 * a GL reference.
	 *
	 * @method  setWrap
	 * @param {GLenum} s the S wrap mode
	 * @param {GLenum} t the T wrap mode
	 * @param {Boolean} ignoreBind (optional) if true, the bind will be ignored. 
	 */
	setWrap: function(s, t, ignoreBind) { //TODO: support R wrap mode
		if (s && t) {
			this.wrapS = s;
			this.wrapT = t;
		} else 
			this.wrapS = this.wrapT = s;
		
		//enforce POT rules..
		this._checkPOT();	

		if (!ignoreBind)
			this.bind();

		var gl = this.gl;
		gl.texParameteri(this.target, gl.TEXTURE_WRAP_S, this.wrapS);
		gl.texParameteri(this.target, gl.TEXTURE_WRAP_T, this.wrapT);
	},


	/**
	 * Sets the min and mag filter for this texture; 
	 * if mag is undefined or falsy, then both min and mag will use the
	 * filter specified for min.
	 *
	 * You can use Texture.Filter constants for convenience, to avoid needing 
	 * a GL reference.
	 *
	 * @method  setFilter
	 * @param {GLenum} min the minification filter
	 * @param {GLenum} mag the magnification filter
	 * @param {Boolean} ignoreBind if true, the bind will be ignored. 
	 */
	setFilter: function(min, mag, ignoreBind) { 
		if (min && mag) {
			this.minFilter = min;
			this.magFilter = mag;
		} else 
			this.minFilter = this.magFilter = min;
		
		//enforce POT rules..
		this._checkPOT();

		if (!ignoreBind)
			this.bind();

		var gl = this.gl;
		gl.texParameteri(this.target, gl.TEXTURE_MIN_FILTER, this.minFilter);
		gl.texParameteri(this.target, gl.TEXTURE_MAG_FILTER, this.magFilter);
	},

	/**
	 * A low-level method to upload the specified ArrayBufferView
	 * to this texture. This will cause the width and height of this
	 * texture to change.
	 *
	 * @method  uploadData
	 * @param  {Number} width          the new width of this texture,
	 *                                 defaults to the last used width (or zero)
	 * @param  {Number} height         the new height of this texture
	 *                                 defaults to the last used height (or zero)
	 * @param  {GLenum} format         the data format, default RGBA
	 * @param  {GLenum} type           the data type, default UNSIGNED_BYTE (Uint8Array)
	 * @param  {ArrayBufferView} data  the raw data for this texture, or null for an empty image
	 * @param  {Boolean} genMipmaps	   whether to generate mipmaps after uploading the data, default false
	 */
	uploadData: function(width, height, format, type, data, genMipmaps) {
		var gl = this.gl;

		format = format || gl.RGBA;
		type = type || gl.UNSIGNED_BYTE;
		data = data || null; //make sure falsey value is null for texImage2D

		this.width = (width || width==0) ? width : this.width;
		this.height = (height || height==0) ? height : this.height;

		this._checkPOT();

		this.bind();

		gl.texImage2D(this.target, 0, format, 
					  this.width, this.height, 0, format,
					  type, data);

		if (genMipmaps)
			gl.generateMipmap(this.target);
	},

	/**
	 * Uploads ImageData, HTMLImageElement, HTMLCanvasElement or 
	 * HTMLVideoElement.
	 *
	 * @method  uploadImage
	 * @param  {Object} domObject the DOM image container
	 * @param  {GLenum} format the format, default gl.RGBA
	 * @param  {GLenum} type the data type, default gl.UNSIGNED_BYTE
	 * @param  {Boolean} genMipmaps whether to generate mipmaps after uploading the data, default false
	 */
	uploadImage: function(domObject, format, type, genMipmaps) {
		var gl = this.gl;

		format = format || gl.RGBA;
		type = type || gl.UNSIGNED_BYTE;
		
		this.width = domObject.width;
		this.height = domObject.height;

		this._checkPOT();

		this.bind();

		gl.texImage2D(this.target, 0, format, format,
					  type, domObject);

		if (genMipmaps)
			gl.generateMipmap(this.target);
	},

	/**
	 * If FORCE_POT is false, we verify this texture to see if it is valid, 
	 * as per non-power-of-two rules. If it is non-power-of-two, it must have 
	 * a wrap mode of CLAMP_TO_EDGE, and the minification filter must be LINEAR
	 * or NEAREST. If we don't satisfy these needs, an error is thrown.
	 * 
	 * @method  _checkPOT
	 * @private
	 * @return {[type]} [description]
	 */
	_checkPOT: function() {
		if (!Texture.FORCE_POT) {
			//If minFilter is anything but LINEAR or NEAREST
			//or if wrapS or wrapT are not CLAMP_TO_EDGE...
			var wrongFilter = (this.minFilter !== Texture.Filter.LINEAR && this.minFilter !== Texture.Filter.NEAREST);
			var wrongWrap = (this.wrapS !== Texture.Wrap.CLAMP_TO_EDGE || this.wrapT !== Texture.Wrap.CLAMP_TO_EDGE);

			if ( wrongFilter || wrongWrap ) {
				if (!isPowerOfTwo(this.width) || !isPowerOfTwo(this.height))
					throw new Error(wrongFilter 
							? "Non-power-of-two textures cannot use mipmapping as filter"
							: "Non-power-of-two textures must use CLAMP_TO_EDGE as wrap");
			}
		}
	},

	/**
	 * Binds the texture. If unit is specified,
	 * it will bind the texture at the given slot
	 * (TEXTURE0, TEXTURE1, etc). If unit is not specified,
	 * it will simply bind the texture at whichever slot
	 * is currently active.
	 *
	 * @method  bind
	 * @param  {Number} unit the texture unit index, starting at 0
	 */
	bind: function(unit) {
		var gl = this.gl;
		if (unit || unit === 0)
			gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(this.target, this.id);
	},

	toString: function() {
		return this.id + ":" + this.width + "x" + this.height + "";
	}
});

/** 
 * A set of Filter constants that match their GL counterparts.
 * This is for convenience, to avoid the need for a GL rendering context.
 *
 * @example
 * ```
 *     Texture.Filter.NEAREST
 *     Texture.Filter.NEAREST_MIPMAP_LINEAR
 *     Texture.Filter.NEAREST_MIPMAP_NEAREST
 *     Texture.Filter.LINEAR
 *     Texture.Filter.LINEAR_MIPMAP_LINEAR
 *     Texture.Filter.LINEAR_MIPMAP_NEAREST
 * ```
 * @attribute Filter
 * @static
 * @type {Object}
 */
Texture.Filter = {
	NEAREST: 9728,
	NEAREST_MIPMAP_LINEAR: 9986,
	NEAREST_MIPMAP_NEAREST: 9984,
	LINEAR: 9729,
	LINEAR_MIPMAP_LINEAR: 9987,
	LINEAR_MIPMAP_NEAREST: 9985
};

/** 
 * A set of Wrap constants that match their GL counterparts.
 * This is for convenience, to avoid the need for a GL rendering context.
 *
 * @example
 * ```
 *     Texture.Wrap.CLAMP_TO_EDGE
 *     Texture.Wrap.MIRRORED_REPEAT
 *     Texture.Wrap.REPEAT
 * ```
 * @attribute Wrap
 * @static
 * @type {Object}
 */
Texture.Wrap = {
	CLAMP_TO_EDGE: 33071,
	MIRRORED_REPEAT: 33648,
	REPEAT: 10497
};

/** 
 * A set of Format constants that match their GL counterparts.
 * This is for convenience, to avoid the need for a GL rendering context.
 *
 * @example
 * ```
 *     Texture.Format.RGB
 *     Texture.Format.RGBA
 *     Texture.Format.LUMINANCE_ALPHA
 * ```
 * @attribute Format
 * @static
 * @type {Object}
 */
Texture.Format = {
	DEPTH_COMPONENT: 6402,
	ALPHA: 6406,
	RGBA: 6408,
	RGB: 6407,
	LUMINANCE: 6409,
	LUMINANCE_ALPHA: 6410
};

/** 
 * A set of DataType constants that match their GL counterparts.
 * This is for convenience, to avoid the need for a GL rendering context.
 *
 * @example
 * ```
 *     Texture.DataType.UNSIGNED_BYTE 
 *     Texture.DataType.FLOAT 
 * ```
 * @attribute DataType
 * @static
 * @type {Object}
 */
Texture.DataType = {
	BYTE: 5120,
	SHORT: 5122,
	INT: 5124,
	FLOAT: 5126,
	UNSIGNED_BYTE: 5121,
	UNSIGNED_INT: 5125,
	UNSIGNED_SHORT: 5123,
	UNSIGNED_SHORT_4_4_4_4: 32819,
	UNSIGNED_SHORT_5_5_5_1: 32820,
	UNSIGNED_SHORT_5_6_5: 33635
}

/**
 * The default wrap mode when creating new textures. If a custom 
 * provider was specified, it may choose to override this default mode.
 * 
 * @attribute {GLenum} DEFAULT_WRAP
 * @static 
 * @default  Texture.Wrap.CLAMP_TO_EDGE
 */
Texture.DEFAULT_WRAP = Texture.Wrap.CLAMP_TO_EDGE;


/**
 * The default filter mode when creating new textures. If a custom
 * provider was specified, it may choose to override this default mode.
 *
 * @attribute {GLenum} DEFAULT_FILTER
 * @static
 * @default  Texture.Filter.LINEAR
 */
Texture.DEFAULT_FILTER = Texture.Filter.NEAREST;

/**
 * By default, we do some error checking when creating textures
 * to ensure that they will be "renderable" by WebGL. Non-power-of-two
 * textures must use CLAMP_TO_EDGE as their wrap mode, and NEAREST or LINEAR
 * as their wrap mode. Further, trying to generate mipmaps for a NPOT image
 * will lead to errors. 
 *
 * However, you can disable this error checking by setting `FORCE_POT` to true.
 * This may be useful if you are running on specific hardware that supports POT 
 * textures, or in some future case where NPOT textures is added as a WebGL extension.
 * 
 * @attribute {Boolean} FORCE_POT
 * @static
 * @default  false
 */
Texture.FORCE_POT = false;

//default pixel store operations. Used in create()
Texture.UNPACK_FLIP_Y = false;
Texture.UNPACK_ALIGNMENT = 1;
Texture.UNPACK_PREMULTIPLY_ALPHA = true; 
Texture.UNPACK_COLORSPACE_CONVERSION = undefined;

//for the Image constructor we need to handle things a bit differently..
Texture.USE_DUMMY_1x1_DATA = true;

/**
 * Utility to get the number of components for the given GLenum, e.g. gl.RGBA returns 4.
 * Returns null if the specified format is not of type DEPTH_COMPONENT, ALPHA, LUMINANCE,
 * LUMINANCE_ALPHA, RGB, or RGBA.
 * 
 * @method getNumComponents
 * @static
 * @param  {GLenum} format a texture format, i.e. Texture.Format.RGBA
 * @return {Number} the number of components for this format
 */
Texture.getNumComponents = function(format) {
	switch (format) {
		case Texture.Format.DEPTH_COMPONENT:
		case Texture.Format.ALPHA:
		case Texture.Format.LUMINANCE:
			return 1;
		case Texture.Format.LUMINANCE_ALPHA:
			return 2;
		case Texture.Format.RGB:
			return 3;
		case Texture.Format.RGBA:
			return 4;
	}
	return null;
};

module.exports = Texture;
},{"kami-util":19,"klasse":21,"number-util":22}],13:[function(require,module,exports){
module.exports=require(4)
},{"kami-util":19,"klasse":21}],14:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"kami-util":19,"klasse":21,"webgl-compile-shader":16}],15:[function(require,module,exports){
module.exports=require(7)
},{}],16:[function(require,module,exports){
module.exports=require(8)
},{"./getGL":15}],17:[function(require,module,exports){
var Class = require('klasse');

//This is a GL-specific texture region, employing tangent space normalized coordinates U and V.
//A canvas-specific region would really just be a lightweight object with { x, y, width, height }
//in pixels.
var TextureRegion = new Class({

	initialize: function TextureRegion(texture, x, y, width, height) {
		this.texture = texture;
		this.setRegion(x, y, width, height);
	},

	setUVs: function(u, v, u2, v2) {
		this.regionWidth = Math.round(Math.abs(u2 - u) * this.texture.width);
        this.regionHeight = Math.round(Math.abs(v2 - v) * this.texture.height);

        // From LibGDX TextureRegion.java -- 
		// For a 1x1 region, adjust UVs toward pixel center to avoid filtering artifacts on AMD GPUs when drawing very stretched.
		if (this.regionWidth == 1 && this.regionHeight == 1) {
			var adjustX = 0.25 / this.texture.width;
			u += adjustX;
			u2 -= adjustX;
			var adjustY = 0.25 / this.texture.height;
			v += adjustY;
			v2 -= adjustY;
		}

		this.u = u;
		this.v = v;
		this.u2 = u2;
		this.v2 = v2;
	},

	setRegion: function(x, y, width, height) {
		x = x || 0;
		y = y || 0;
		width = (width===0 || width) ? width : this.texture.width;
		height = (height===0 || height) ? height : this.texture.height;

		var invTexWidth = 1 / this.texture.width;
		var invTexHeight = 1 / this.texture.height;
		this.setUVs(x * invTexWidth, y * invTexHeight, (x + width) * invTexWidth, (y + height) * invTexHeight);
		this.regionWidth = Math.abs(width);
		this.regionHeight = Math.abs(height);
	},

	/** Sets the texture to that of the specified region and sets the coordinates relative to the specified region. */
	setFromRegion: function(region, x, y, width, height) {
		this.texture = region.texture;
		this.set(region.getRegionX() + x, region.getRegionY() + y, width, height);
	},


	//TODO: add setters for regionX/Y and regionWidth/Height

	regionX: {
		get: function() {
			return Math.round(this.u * this.texture.width);
		} 
	},

	regionY: {
		get: function() {
			return Math.round(this.v * this.texture.height);
		}
	},

	flip: function(x, y) {
		var temp;
		if (x) {
			temp = this.u;
			this.u = this.u2;
			this.u2 = temp;
		}
		if (y) {
			temp = this.v;
			this.v = this.v2;
			this.v2 = temp;
		}
	}
});

module.exports = TextureRegion;
},{"klasse":21}],18:[function(require,module,exports){
module.exports=require(12)
},{"kami-util":19,"klasse":21,"number-util":22}],19:[function(require,module,exports){
var GLContextWrapper = require('./wrapper');

/**
 * Duck-types WebGLRenderingContext / kami.WebGLContext.
 *
 * If WebGLRenderingContext is passed, the object will not have its
 * state managed during context loss/restore. If a Kami WebGLContext
 * is passed, the object will try to maintain its state during lost/restore.
 * 
 * @param  {WebGLRenderingContext|kami.WebGLContext} gl the GL context
 * @return {Object|kami.WebGLContext} a wrapper that has a `gl` property
 */
module.exports.wrapContext = function(gl) {
    if (typeof window.WebGLRenderingContext !== "undefined" && gl instanceof window.WebGLRenderingContext) {
        return new GLContextWrapper(gl);
    } else
        return gl;
};
},{"./wrapper":20}],20:[function(require,module,exports){
var Class = require('klasse');

var GLContextWrapper = new Class({
    
    initialize: function GLContextWrapper(gl) {
        this.gl = gl;
    },

    addManagedObject: function(e) { },
    removeManagedObject: function(e) { },

    width: {
        get: function() {
            return this.gl.canvas.width;
        },
        set: function(width) {
            this.gl.canvas.width = width;
        }
    },

    height: {
        get: function() {
            return this.gl.canvas.height;
        },
        set: function(height) {
            this.gl.canvas.height = height;
        }
    }
});

module.exports = GLContextWrapper;
},{"klasse":21}],21:[function(require,module,exports){
module.exports=require(6)
},{}],22:[function(require,module,exports){
var int8 = new Int8Array(4);
var int32 = new Int32Array(int8.buffer, 0, 1);
var float32 = new Float32Array(int8.buffer, 0, 1);

/**
 * A singleton for number utilities. 
 * @class NumberUtil
 */
var NumberUtil = function() {

};


/**
 * Returns a float representation of the given int bits. ArrayBuffer
 * is used for the conversion.
 *
 * @method  intBitsToFloat
 * @static
 * @param  {Number} i the int to cast
 * @return {Number}   the float
 */
NumberUtil.intBitsToFloat = function(i) {
	int32[0] = i;
	return float32[0];
};

/**
 * Returns the int bits from the given float. ArrayBuffer is used
 * for the conversion.
 *
 * @method  floatToIntBits
 * @static
 * @param  {Number} f the float to cast
 * @return {Number}   the int bits
 */
NumberUtil.floatToIntBits = function(f) {
	float32[0] = f;
	return int32[0];
};

/**
 * Encodes ABGR int as a float, with slight precision loss.
 *
 * @method  intToFloatColor
 * @static
 * @param {Number} value an ABGR packed integer
 */
NumberUtil.intToFloatColor = function(value) {
	return NumberUtil.intBitsToFloat( value & 0xfeffffff );
};

/**
 * Returns a float encoded ABGR value from the given RGBA
 * bytes (0 - 255). Useful for saving bandwidth in vertex data.
 *
 * @method  colorToFloat
 * @static
 * @param {Number} r the Red byte (0 - 255)
 * @param {Number} g the Green byte (0 - 255)
 * @param {Number} b the Blue byte (0 - 255)
 * @param {Number} a the Alpha byte (0 - 255)
 * @return {Float32}  a Float32 of the RGBA color
 */
NumberUtil.colorToFloat = function(r, g, b, a) {
	var bits = (a << 24 | b << 16 | g << 8 | r);
	return NumberUtil.intToFloatColor(bits);
};

/**
 * Returns true if the number is a power-of-two.
 *
 * @method  isPowerOfTwo
 * @param  {Number}  n the number to test
 * @return {Boolean}   true if power-of-two
 */
NumberUtil.isPowerOfTwo = function(n) {
	return (n & (n - 1)) === 0;
};

/**
 * Returns the next highest power-of-two from the specified number. 
 * 
 * @param  {Number} n the number to test
 * @return {Number}   the next highest power of two
 */
NumberUtil.nextPowerOfTwo = function(n) {
	n--;
	n |= n >> 1;
	n |= n >> 2;
	n |= n >> 4;
	n |= n >> 8;
	n |= n >> 16;
	return n+1;
};

module.exports = NumberUtil;
},{}],23:[function(require,module,exports){
/*jslint onevar:true, undef:true, newcap:true, regexp:true, bitwise:true, maxerr:50, indent:4, white:false, nomen:false, plusplus:false */
/*global define:false, require:false, exports:false, module:false, signals:false */

/** @license
 * JS Signals <http://millermedeiros.github.com/js-signals/>
 * Released under the MIT license
 * Author: Miller Medeiros
 * Version: 1.0.0 - Build: 268 (2012/11/29 05:48 PM)
 */

(function(global){

    // SignalBinding -------------------------------------------------
    //================================================================

    /**
     * Object that represents a binding between a Signal and a listener function.
     * <br />- <strong>This is an internal constructor and shouldn't be called by regular users.</strong>
     * <br />- inspired by Joa Ebert AS3 SignalBinding and Robert Penner's Slot classes.
     * @author Miller Medeiros
     * @constructor
     * @internal
     * @name SignalBinding
     * @param {Signal} signal Reference to Signal object that listener is currently bound to.
     * @param {Function} listener Handler function bound to the signal.
     * @param {boolean} isOnce If binding should be executed just once.
     * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
     * @param {Number} [priority] The priority level of the event listener. (default = 0).
     */
    function SignalBinding(signal, listener, isOnce, listenerContext, priority) {

        /**
         * Handler function bound to the signal.
         * @type Function
         * @private
         */
        this._listener = listener;

        /**
         * If binding should be executed just once.
         * @type boolean
         * @private
         */
        this._isOnce = isOnce;

        /**
         * Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @memberOf SignalBinding.prototype
         * @name context
         * @type Object|undefined|null
         */
        this.context = listenerContext;

        /**
         * Reference to Signal object that listener is currently bound to.
         * @type Signal
         * @private
         */
        this._signal = signal;

        /**
         * Listener priority
         * @type Number
         * @private
         */
        this._priority = priority || 0;
    }

    SignalBinding.prototype = {

        /**
         * If binding is active and should be executed.
         * @type boolean
         */
        active : true,

        /**
         * Default parameters passed to listener during `Signal.dispatch` and `SignalBinding.execute`. (curried parameters)
         * @type Array|null
         */
        params : null,

        /**
         * Call listener passing arbitrary parameters.
         * <p>If binding was added using `Signal.addOnce()` it will be automatically removed from signal dispatch queue, this method is used internally for the signal dispatch.</p>
         * @param {Array} [paramsArr] Array of parameters that should be passed to the listener
         * @return {*} Value returned by the listener.
         */
        execute : function (paramsArr) {
            var handlerReturn, params;
            if (this.active && !!this._listener) {
                params = this.params? this.params.concat(paramsArr) : paramsArr;
                handlerReturn = this._listener.apply(this.context, params);
                if (this._isOnce) {
                    this.detach();
                }
            }
            return handlerReturn;
        },

        /**
         * Detach binding from signal.
         * - alias to: mySignal.remove(myBinding.getListener());
         * @return {Function|null} Handler function bound to the signal or `null` if binding was previously detached.
         */
        detach : function () {
            return this.isBound()? this._signal.remove(this._listener, this.context) : null;
        },

        /**
         * @return {Boolean} `true` if binding is still bound to the signal and have a listener.
         */
        isBound : function () {
            return (!!this._signal && !!this._listener);
        },

        /**
         * @return {boolean} If SignalBinding will only be executed once.
         */
        isOnce : function () {
            return this._isOnce;
        },

        /**
         * @return {Function} Handler function bound to the signal.
         */
        getListener : function () {
            return this._listener;
        },

        /**
         * @return {Signal} Signal that listener is currently bound to.
         */
        getSignal : function () {
            return this._signal;
        },

        /**
         * Delete instance properties
         * @private
         */
        _destroy : function () {
            delete this._signal;
            delete this._listener;
            delete this.context;
        },

        /**
         * @return {string} String representation of the object.
         */
        toString : function () {
            return '[SignalBinding isOnce:' + this._isOnce +', isBound:'+ this.isBound() +', active:' + this.active + ']';
        }

    };


/*global SignalBinding:false*/

    // Signal --------------------------------------------------------
    //================================================================

    function validateListener(listener, fnName) {
        if (typeof listener !== 'function') {
            throw new Error( 'listener is a required param of {fn}() and should be a Function.'.replace('{fn}', fnName) );
        }
    }

    /**
     * Custom event broadcaster
     * <br />- inspired by Robert Penner's AS3 Signals.
     * @name Signal
     * @author Miller Medeiros
     * @constructor
     */
    function Signal() {
        /**
         * @type Array.<SignalBinding>
         * @private
         */
        this._bindings = [];
        this._prevParams = null;

        // enforce dispatch to aways work on same context (#47)
        var self = this;
        this.dispatch = function(){
            Signal.prototype.dispatch.apply(self, arguments);
        };
    }

    Signal.prototype = {

        /**
         * Signals Version Number
         * @type String
         * @const
         */
        VERSION : '1.0.0',

        /**
         * If Signal should keep record of previously dispatched parameters and
         * automatically execute listener during `add()`/`addOnce()` if Signal was
         * already dispatched before.
         * @type boolean
         */
        memorize : false,

        /**
         * @type boolean
         * @private
         */
        _shouldPropagate : true,

        /**
         * If Signal is active and should broadcast events.
         * <p><strong>IMPORTANT:</strong> Setting this property during a dispatch will only affect the next dispatch, if you want to stop the propagation of a signal use `halt()` instead.</p>
         * @type boolean
         */
        active : true,

        /**
         * @param {Function} listener
         * @param {boolean} isOnce
         * @param {Object} [listenerContext]
         * @param {Number} [priority]
         * @return {SignalBinding}
         * @private
         */
        _registerListener : function (listener, isOnce, listenerContext, priority) {

            var prevIndex = this._indexOfListener(listener, listenerContext),
                binding;

            if (prevIndex !== -1) {
                binding = this._bindings[prevIndex];
                if (binding.isOnce() !== isOnce) {
                    throw new Error('You cannot add'+ (isOnce? '' : 'Once') +'() then add'+ (!isOnce? '' : 'Once') +'() the same listener without removing the relationship first.');
                }
            } else {
                binding = new SignalBinding(this, listener, isOnce, listenerContext, priority);
                this._addBinding(binding);
            }

            if(this.memorize && this._prevParams){
                binding.execute(this._prevParams);
            }

            return binding;
        },

        /**
         * @param {SignalBinding} binding
         * @private
         */
        _addBinding : function (binding) {
            //simplified insertion sort
            var n = this._bindings.length;
            do { --n; } while (this._bindings[n] && binding._priority <= this._bindings[n]._priority);
            this._bindings.splice(n + 1, 0, binding);
        },

        /**
         * @param {Function} listener
         * @return {number}
         * @private
         */
        _indexOfListener : function (listener, context) {
            var n = this._bindings.length,
                cur;
            while (n--) {
                cur = this._bindings[n];
                if (cur._listener === listener && cur.context === context) {
                    return n;
                }
            }
            return -1;
        },

        /**
         * Check if listener was attached to Signal.
         * @param {Function} listener
         * @param {Object} [context]
         * @return {boolean} if Signal has the specified listener.
         */
        has : function (listener, context) {
            return this._indexOfListener(listener, context) !== -1;
        },

        /**
         * Add a listener to the signal.
         * @param {Function} listener Signal handler function.
         * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
         * @return {SignalBinding} An Object representing the binding between the Signal and listener.
         */
        add : function (listener, listenerContext, priority) {
            validateListener(listener, 'add');
            return this._registerListener(listener, false, listenerContext, priority);
        },

        /**
         * Add listener to the signal that should be removed after first execution (will be executed only once).
         * @param {Function} listener Signal handler function.
         * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
         * @return {SignalBinding} An Object representing the binding between the Signal and listener.
         */
        addOnce : function (listener, listenerContext, priority) {
            validateListener(listener, 'addOnce');
            return this._registerListener(listener, true, listenerContext, priority);
        },

        /**
         * Remove a single listener from the dispatch queue.
         * @param {Function} listener Handler function that should be removed.
         * @param {Object} [context] Execution context (since you can add the same handler multiple times if executing in a different context).
         * @return {Function} Listener handler function.
         */
        remove : function (listener, context) {
            validateListener(listener, 'remove');

            var i = this._indexOfListener(listener, context);
            if (i !== -1) {
                this._bindings[i]._destroy(); //no reason to a SignalBinding exist if it isn't attached to a signal
                this._bindings.splice(i, 1);
            }
            return listener;
        },

        /**
         * Remove all listeners from the Signal.
         */
        removeAll : function () {
            var n = this._bindings.length;
            while (n--) {
                this._bindings[n]._destroy();
            }
            this._bindings.length = 0;
        },

        /**
         * @return {number} Number of listeners attached to the Signal.
         */
        getNumListeners : function () {
            return this._bindings.length;
        },

        /**
         * Stop propagation of the event, blocking the dispatch to next listeners on the queue.
         * <p><strong>IMPORTANT:</strong> should be called only during signal dispatch, calling it before/after dispatch won't affect signal broadcast.</p>
         * @see Signal.prototype.disable
         */
        halt : function () {
            this._shouldPropagate = false;
        },

        /**
         * Dispatch/Broadcast Signal to all listeners added to the queue.
         * @param {...*} [params] Parameters that should be passed to each handler.
         */
        dispatch : function (params) {
            if (! this.active) {
                return;
            }

            var paramsArr = Array.prototype.slice.call(arguments),
                n = this._bindings.length,
                bindings;

            if (this.memorize) {
                this._prevParams = paramsArr;
            }

            if (! n) {
                //should come after memorize
                return;
            }

            bindings = this._bindings.slice(); //clone array in case add/remove items during dispatch
            this._shouldPropagate = true; //in case `halt` was called before dispatch or during the previous dispatch.

            //execute all callbacks until end of the list or until a callback returns `false` or stops propagation
            //reverse loop since listeners with higher priority will be added at the end of the list
            do { n--; } while (bindings[n] && this._shouldPropagate && bindings[n].execute(paramsArr) !== false);
        },

        /**
         * Forget memorized arguments.
         * @see Signal.memorize
         */
        forget : function(){
            this._prevParams = null;
        },

        /**
         * Remove all bindings from signal and destroy any reference to external objects (destroy Signal object).
         * <p><strong>IMPORTANT:</strong> calling any method on the signal instance after calling dispose will throw errors.</p>
         */
        dispose : function () {
            this.removeAll();
            delete this._bindings;
            delete this._prevParams;
        },

        /**
         * @return {string} String representation of the object.
         */
        toString : function () {
            return '[Signal active:'+ this.active +' numListeners:'+ this.getNumListeners() +']';
        }

    };


    // Namespace -----------------------------------------------------
    //================================================================

    /**
     * Signals namespace
     * @namespace
     * @name signals
     */
    var signals = Signal;

    /**
     * Custom event broadcaster
     * @see Signal
     */
    // alias for backwards compatibility (see #gh-44)
    signals.Signal = Signal;



    //exports to multiple environments
    if(typeof define === 'function' && define.amd){ //AMD
        define(function () { return signals; });
    } else if (typeof module !== 'undefined' && module.exports){ //node
        module.exports = signals;
    } else { //browser
        //use string because of Google closure compiler ADVANCED_MODE
        /*jslint sub:true */
        global['signals'] = signals;
    }

}(this));

},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMvbnBtdXRpbHMva2FtaS1tb2R1bGVzL2thbWkvbGliL2luZGV4LXVtZC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pLW1vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMva2FtaS1iYXRjaC9pbmRleC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pLW1vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMva2FtaS1iYXRjaC9saWIvQmFzZUJhdGNoLmpzIiwiL3Byb2plY3RzL25wbXV0aWxzL2thbWktbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9rYW1pLWJhdGNoL25vZGVfbW9kdWxlcy9rYW1pLW1lc2gtYnVmZmVyL2luZGV4LmpzIiwiL3Byb2plY3RzL25wbXV0aWxzL2thbWktbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9rYW1pLWJhdGNoL25vZGVfbW9kdWxlcy9rYW1pLXNoYWRlci9pbmRleC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pLW1vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMva2FtaS1iYXRjaC9ub2RlX21vZHVsZXMva2FtaS1zaGFkZXIvbm9kZV9tb2R1bGVzL2tsYXNzZS9pbmRleC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pLW1vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMva2FtaS1iYXRjaC9ub2RlX21vZHVsZXMva2FtaS1zaGFkZXIvbm9kZV9tb2R1bGVzL3dlYmdsLWNvbXBpbGUtc2hhZGVyL2dldEdMLmpzIiwiL3Byb2plY3RzL25wbXV0aWxzL2thbWktbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9rYW1pLWJhdGNoL25vZGVfbW9kdWxlcy9rYW1pLXNoYWRlci9ub2RlX21vZHVsZXMvd2ViZ2wtY29tcGlsZS1zaGFkZXIvaW5kZXguanMiLCIvcHJvamVjdHMvbnBtdXRpbHMva2FtaS1tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL2thbWktY29udGV4dC9pbmRleC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pLW1vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMva2FtaS1jb250ZXh0L25vZGVfbW9kdWxlcy93ZWJnbC1jb250ZXh0L2luZGV4LmpzIiwiL3Byb2plY3RzL25wbXV0aWxzL2thbWktbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9rYW1pLWZiby9pbmRleC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pLW1vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMva2FtaS1mYm8vbm9kZV9tb2R1bGVzL2thbWktdGV4dHVyZS9pbmRleC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pLW1vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMva2FtaS1zaGFkZXIvaW5kZXguanMiLCIvcHJvamVjdHMvbnBtdXRpbHMva2FtaS1tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL2thbWktdGV4dHVyZS1yZWdpb24vaW5kZXguanMiLCIvcHJvamVjdHMvbnBtdXRpbHMva2FtaS1tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL2thbWktdXRpbC9pbmRleC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pLW1vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMva2FtaS11dGlsL3dyYXBwZXIuanMiLCIvcHJvamVjdHMvbnBtdXRpbHMva2FtaS1tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL251bWJlci11dGlsL2luZGV4LmpzIiwiL3Byb2plY3RzL25wbXV0aWxzL2thbWktbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9zaWduYWxzL2Rpc3Qvc2lnbmFscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Y0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMWdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzVsQkE7Ozs7OztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNsRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIm1vZHVsZS5leHBvcnRzID0ge1xuICAgICdTcHJpdGVCYXRjaCc6ICAgICByZXF1aXJlKCdrYW1pLWJhdGNoJyksXG4gICAgJ1dlYkdMQ29udGV4dCc6ICAgIHJlcXVpcmUoJ2thbWktY29udGV4dCcpLFxuICAgICdGcmFtZUJ1ZmZlcic6ICAgICByZXF1aXJlKCdrYW1pLWZibycpLFxuICAgICdNZXNoJzogICAgICAgICAgICByZXF1aXJlKCdrYW1pLW1lc2gtYnVmZmVyJyksXG4gICAgJ1NoYWRlclByb2dyYW0nOiAgIHJlcXVpcmUoJ2thbWktc2hhZGVyJyksXG4gICAgJ1RleHR1cmUnOiAgICAgICAgIHJlcXVpcmUoJ2thbWktdGV4dHVyZScpLFxuICAgICdUZXh0dXJlUmVnaW9uJzogICByZXF1aXJlKCdrYW1pLXRleHR1cmUtcmVnaW9uJyksXG4gICAgJ0NsYXNzJzogICAgICAgICAgIHJlcXVpcmUoJ2tsYXNzZScpLFxuICAgICdOdW1iZXJVdGlsJzogICAgICByZXF1aXJlKCdudW1iZXItdXRpbCcpLFxuICAgICdTaWduYWwnOiAgICAgICAgICByZXF1aXJlKCdzaWduYWxzJykuU2lnbmFsXG59OyIsIi8qKlxuICogQG1vZHVsZSBrYW1pLWJhdGNoXG4gKi9cblxuLy8gUmVxdWlyZXMuLi4uXG52YXIgQ2xhc3MgICAgICAgICA9IHJlcXVpcmUoJ2tsYXNzZScpO1xuXG52YXIgQmFzZUJhdGNoICAgICA9IHJlcXVpcmUoJy4vbGliL0Jhc2VCYXRjaCcpO1xudmFyIE1lc2ggICAgICAgICAgPSByZXF1aXJlKCdrYW1pLW1lc2gtYnVmZmVyJyk7XG52YXIgU2hhZGVyUHJvZ3JhbSA9IHJlcXVpcmUoJ2thbWktc2hhZGVyJyk7XG5cbi8qKlxuICogQSBiYXNpYyBpbXBsZW1lbnRhdGlvbiBvZiBhIGJhdGNoZXIgd2hpY2ggZHJhd3MgMkQgc3ByaXRlcy5cbiAqIFRoaXMgdXNlcyB0d28gdHJpYW5nbGVzIChxdWFkcykgd2l0aCBpbmRleGVkIGFuZCBpbnRlcmxlYXZlZFxuICogdmVydGV4IGRhdGEuIEVhY2ggdmVydGV4IGhvbGRzIDUgZmxvYXRzIChQb3NpdGlvbi54eSwgQ29sb3IsIFRleENvb3JkMC54eSkuXG4gKlxuICogVGhlIGNvbG9yIGlzIHBhY2tlZCBpbnRvIGEgc2luZ2xlIGZsb2F0IHRvIHJlZHVjZSB2ZXJ0ZXggYmFuZHdpZHRoLCBhbmRcbiAqIHRoZSBkYXRhIGlzIGludGVybGVhdmVkIGZvciBiZXN0IHBlcmZvcm1hbmNlLiBXZSB1c2UgYSBzdGF0aWMgaW5kZXggYnVmZmVyLFxuICogYW5kIGEgZHluYW1pYyB2ZXJ0ZXggYnVmZmVyIHRoYXQgaXMgdXBkYXRlZCB3aXRoIGJ1ZmZlclN1YkRhdGEuIFxuICogXG4gKiBAZXhhbXBsZVxuICogICAgICB2YXIgU3ByaXRlQmF0Y2ggPSByZXF1aXJlKCdrYW1pJykuU3ByaXRlQmF0Y2g7ICBcbiAqICAgICAgXG4gKiAgICAgIC8vY3JlYXRlIGEgbmV3IGJhdGNoZXJcbiAqICAgICAgdmFyIGJhdGNoID0gbmV3IFNwcml0ZUJhdGNoKGNvbnRleHQpO1xuICpcbiAqICAgICAgZnVuY3Rpb24gcmVuZGVyKCkge1xuICogICAgICAgICAgYmF0Y2guYmVnaW4oKTtcbiAqICAgICAgICAgIFxuICogICAgICAgICAgLy9kcmF3IHNvbWUgc3ByaXRlcyBpbiBiZXR3ZWVuIGJlZ2luIGFuZCBlbmQuLi5cbiAqICAgICAgICAgIGJhdGNoLmRyYXcoIHRleHR1cmUsIDAsIDAsIDI1LCAzMiApO1xuICogICAgICAgICAgYmF0Y2guZHJhdyggdGV4dHVyZTEsIDAsIDI1LCA0MiwgMjMgKTtcbiAqIFxuICogICAgICAgICAgYmF0Y2guZW5kKCk7XG4gKiAgICAgIH1cbiAqIFxuICogQGNsYXNzICBTcHJpdGVCYXRjaFxuICogQHVzZXMgQmFzZUJhdGNoXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7V2ViR0xDb250ZXh0fSBjb250ZXh0IHRoZSBjb250ZXh0IGZvciB0aGlzIGJhdGNoXG4gKiBAcGFyYW0ge051bWJlcn0gc2l6ZSB0aGUgbWF4IG51bWJlciBvZiBzcHJpdGVzIHRvIGZpdCBpbiBhIHNpbmdsZSBiYXRjaFxuICovXG52YXIgU3ByaXRlQmF0Y2ggPSBuZXcgQ2xhc3Moe1xuXG5cdC8vaW5oZXJpdCBzb21lIHN0dWZmIG9udG8gdGhpcyBwcm90b3R5cGVcblx0TWl4aW5zOiBCYXNlQmF0Y2gsXG5cblx0Ly9Db25zdHJ1Y3RvclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBTcHJpdGVCYXRjaChjb250ZXh0LCBzaXplKSB7XG5cdFx0aWYgKCEodGhpcyBpbnN0YW5jZW9mIFNwcml0ZUJhdGNoKSlcblx0XHRcdHJldHVybiBuZXcgU3ByaXRlQmF0Y2goY29udGV4dCwgc2l6ZSk7XG5cdFx0QmFzZUJhdGNoLmNhbGwodGhpcywgY29udGV4dCwgc2l6ZSk7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgcHJvamVjdGlvbiBGbG9hdDMyQXJyYXkgdmVjMiB3aGljaCBpc1xuXHRcdCAqIHVzZWQgdG8gYXZvaWQgc29tZSBtYXRyaXggY2FsY3VsYXRpb25zLlxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IHByb2plY3Rpb25cblx0XHQgKiBAdHlwZSB7RmxvYXQzMkFycmF5fVxuXHRcdCAqL1xuXHRcdHRoaXMucHJvamVjdGlvbiA9IG5ldyBGbG9hdDMyQXJyYXkoMik7XG5cblx0XHR2YXIgY3R4Q2FudmFzID0gdGhpcy5jb250ZXh0LmdsLmNhbnZhcztcblx0XHQvL1NldHMgdXAgYSBkZWZhdWx0IHByb2plY3Rpb24gdmVjdG9yIHNvIHRoYXQgdGhlIGJhdGNoIHdvcmtzIHdpdGhvdXQgc2V0UHJvamVjdGlvblxuXHRcdHRoaXMucHJvamVjdGlvblswXSA9IGN0eENhbnZhcy53aWR0aC8yO1xuXHRcdHRoaXMucHJvamVjdGlvblsxXSA9IGN0eENhbnZhcy5oZWlnaHQvMjtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBjdXJyZW50bHkgYm91bmQgdGV4dHVyZS4gRG8gbm90IG1vZGlmeS5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkge1RleHR1cmV9IHRleHR1cmVcblx0XHQgKiBAcmVhZE9ubHlcblx0XHQgKi9cblx0XHR0aGlzLnRleHR1cmUgPSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBUaGlzIGlzIGEgY29udmVuaWVuY2UgZnVuY3Rpb24gdG8gc2V0IHRoZSBiYXRjaCdzIHByb2plY3Rpb25cblx0ICogbWF0cml4IHRvIGFuIG9ydGhvZ3JhcGhpYyAyRCBwcm9qZWN0aW9uLCBiYXNlZCBvbiB0aGUgZ2l2ZW4gc2NyZWVuXG5cdCAqIHNpemUuIFRoaXMgYWxsb3dzIHVzZXJzIHRvIHJlbmRlciBpbiAyRCB3aXRob3V0IGFueSBuZWVkIGZvciBhIGNhbWVyYS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gd2lkdGggIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSBoZWlnaHQgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcmV0dXJuIHtbdHlwZV19ICAgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRyZXNpemU6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQpIHtcblx0XHR0aGlzLnNldFByb2plY3Rpb24od2lkdGgvMiwgaGVpZ2h0LzIpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBUaGUgbnVtYmVyIG9mIGZsb2F0cyBwZXIgdmVydGV4IGZvciB0aGlzIGJhdGNoZXIgXG5cdCAqIChQb3NpdGlvbi54eSArIENvbG9yICsgVGV4Q29vcmQwLnh5KS5cblx0ICpcblx0ICogQG1ldGhvZCAgZ2V0VmVydGV4U2l6ZVxuXHQgKiBAcmV0dXJuIHtOdW1iZXJ9IHRoZSBudW1iZXIgb2YgZmxvYXRzIHBlciB2ZXJ0ZXhcblx0ICovXG5cdGdldFZlcnRleFNpemU6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiBTcHJpdGVCYXRjaC5WRVJURVhfU0laRTtcblx0fSxcblxuXHQvKipcblx0ICogVXNlZCBpbnRlcm5hbGx5IHRvIHJldHVybiB0aGUgUG9zaXRpb24sIENvbG9yLCBhbmQgVGV4Q29vcmQwIGF0dHJpYnV0ZXMuXG5cdCAqXG5cdCAqIEBtZXRob2QgIF9jcmVhdGVWZXJ0ZXhBdHRyaWJ1ZXRzXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICogQHJldHVybiB7W3R5cGVdfSBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRfY3JlYXRlVmVydGV4QXR0cmlidXRlczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXG5cdFx0cmV0dXJuIFsgXG5cdFx0XHRuZXcgTWVzaC5BdHRyaWIoU2hhZGVyUHJvZ3JhbS5QT1NJVElPTl9BVFRSSUJVVEUsIDIpLFxuXHRcdFx0IC8vcGFjayB0aGUgY29sb3IgZm9yIHNtYWxsZXIgQ1BVIC0+IEdQVSBiYW5kd2lkdGggXG5cdFx0XHRuZXcgTWVzaC5BdHRyaWIoU2hhZGVyUHJvZ3JhbS5DT0xPUl9BVFRSSUJVVEUsIDQsIG51bGwsIGdsLlVOU0lHTkVEX0JZVEUsIHRydWUsIDEpLFxuXHRcdFx0bmV3IE1lc2guQXR0cmliKFNoYWRlclByb2dyYW0uVEVYQ09PUkRfQVRUUklCVVRFK1wiMFwiLCAyKVxuXHRcdF07XG5cdH0sXG5cblxuXHQvKipcblx0ICogU2V0cyB0aGUgcHJvamVjdGlvbiB2ZWN0b3IsIGFuIHggYW5kIHlcblx0ICogZGVmaW5pbmcgdGhlIG1pZGRsZSBwb2ludHMgb2YgeW91ciBzdGFnZS5cblx0ICpcblx0ICogQG1ldGhvZCBzZXRQcm9qZWN0aW9uXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSB4IHRoZSB4IHByb2plY3Rpb24gdmFsdWVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IHkgdGhlIHkgcHJvamVjdGlvbiB2YWx1ZVxuXHQgKi9cblx0c2V0UHJvamVjdGlvbjogZnVuY3Rpb24oeCwgeSkge1xuXHRcdHZhciBvbGRYID0gdGhpcy5wcm9qZWN0aW9uWzBdO1xuXHRcdHZhciBvbGRZID0gdGhpcy5wcm9qZWN0aW9uWzFdO1xuXHRcdHRoaXMucHJvamVjdGlvblswXSA9IHg7XG5cdFx0dGhpcy5wcm9qZWN0aW9uWzFdID0geTtcblxuXHRcdC8vd2UgbmVlZCB0byBmbHVzaCB0aGUgYmF0Y2guLlxuXHRcdGlmICh0aGlzLmRyYXdpbmcgJiYgKHggIT0gb2xkWCB8fCB5ICE9IG9sZFkpKSB7XG5cdFx0XHR0aGlzLmZsdXNoKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVNYXRyaWNlcygpO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIGRlZmF1bHQgc2hhZGVyIGZvciB0aGlzIGJhdGNoLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBfY3JlYXRlU2hhZGVyXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICogQHJldHVybiB7U2hhZGVyUHJvZ3JhbX0gYSBuZXcgaW5zdGFuY2Ugb2YgU2hhZGVyUHJvZ3JhbVxuXHQgKi9cblx0X2NyZWF0ZVNoYWRlcjogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHNoYWRlciA9IG5ldyBTaGFkZXJQcm9ncmFtKHRoaXMuY29udGV4dCxcblx0XHRcdFx0U3ByaXRlQmF0Y2guREVGQVVMVF9WRVJUX1NIQURFUiwgXG5cdFx0XHRcdFNwcml0ZUJhdGNoLkRFRkFVTFRfRlJBR19TSEFERVIpO1xuXHRcdGlmIChzaGFkZXIubG9nKVxuXHRcdFx0Y29uc29sZS53YXJuKFwiU2hhZGVyIExvZzpcXG5cIiArIHNoYWRlci5sb2cpO1xuXHRcdHJldHVybiBzaGFkZXI7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFRoaXMgaXMgY2FsbGVkIGR1cmluZyByZW5kZXJpbmcgdG8gdXBkYXRlIHByb2plY3Rpb24vdHJhbnNmb3JtXG5cdCAqIG1hdHJpY2VzIGFuZCB1cGxvYWQgdGhlIG5ldyB2YWx1ZXMgdG8gdGhlIHNoYWRlci4gRm9yIGV4YW1wbGUsXG5cdCAqIGlmIHRoZSB1c2VyIGNhbGxzIHNldFByb2plY3Rpb24gbWlkLWRyYXcsIHRoZSBiYXRjaCB3aWxsIGZsdXNoXG5cdCAqIGFuZCB0aGlzIHdpbGwgYmUgY2FsbGVkIGJlZm9yZSBjb250aW51aW5nIHRvIGFkZCBpdGVtcyB0byB0aGUgYmF0Y2guXG5cdCAqXG5cdCAqIFlvdSBnZW5lcmFsbHkgc2hvdWxkIG5vdCBuZWVkIHRvIGNhbGwgdGhpcyBkaXJlY3RseS5cblx0ICogXG5cdCAqIEBtZXRob2QgIHVwZGF0ZU1hdHJpY2VzXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICovXG5cdHVwZGF0ZU1hdHJpY2VzOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnNoYWRlci5zZXRVbmlmb3JtZnYoXCJ1X3Byb2plY3Rpb25cIiwgdGhpcy5wcm9qZWN0aW9uKTtcblx0fSxcblxuXHQvKipcblx0ICogQ2FsbGVkIGJlZm9yZSByZW5kZXJpbmcsIGFuZCBiaW5kcyB0aGUgY3VycmVudCB0ZXh0dXJlLlxuXHQgKiBcblx0ICogQG1ldGhvZCBfcHJlUmVuZGVyXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICovXG5cdF9wcmVSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLnRleHR1cmUpXG5cdFx0XHR0aGlzLnRleHR1cmUuYmluZCgpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBCaW5kcyB0aGUgc2hhZGVyLCBkaXNhYmxlcyBkZXB0aCB3cml0aW5nLCBcblx0ICogZW5hYmxlcyBibGVuZGluZywgYWN0aXZhdGVzIHRleHR1cmUgdW5pdCAwLCBhbmQgc2VuZHNcblx0ICogZGVmYXVsdCBtYXRyaWNlcyBhbmQgc2FtcGxlcjJEIHVuaWZvcm1zIHRvIHRoZSBzaGFkZXIuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGJlZ2luXG5cdCAqL1xuXHRiZWdpbjogZnVuY3Rpb24oKSB7XG5cdFx0Ly9zcHJpdGUgYmF0Y2ggZG9lc24ndCBob2xkIGEgcmVmZXJlbmNlIHRvIEdMIHNpbmNlIGl0IGlzIHZvbGF0aWxlXG5cdFx0dmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHRcdFxuXHRcdC8vVGhpcyBiaW5kcyB0aGUgc2hhZGVyIGFuZCBtZXNoIVxuXHRcdEJhc2VCYXRjaC5wcm90b3R5cGUuYmVnaW4uY2FsbCh0aGlzKTtcblxuXHRcdHRoaXMudXBkYXRlTWF0cmljZXMoKTsgLy9zZW5kIHByb2plY3Rpb24vdHJhbnNmb3JtIHRvIHNoYWRlclxuXG5cdFx0Ly91cGxvYWQgdGhlIHNhbXBsZXIgdW5pZm9ybS4gbm90IG5lY2Vzc2FyeSBldmVyeSBmbHVzaCBzbyB3ZSBqdXN0XG5cdFx0Ly9kbyBpdCBoZXJlLlxuXHRcdHRoaXMuc2hhZGVyLnNldFVuaWZvcm1pKFwidV90ZXh0dXJlMFwiLCAwKTtcblxuXHRcdC8vZGlzYWJsZSBkZXB0aCBtYXNrXG5cdFx0Z2wuZGVwdGhNYXNrKGZhbHNlKTtcblx0fSxcblxuXHQvKipcblx0ICogRW5kcyB0aGUgc3ByaXRlIGJhdGNoZXIgYW5kIGZsdXNoZXMgYW55IHJlbWFpbmluZyBkYXRhIHRvIHRoZSBHUFUuXG5cdCAqIFxuXHQgKiBAbWV0aG9kIGVuZFxuXHQgKi9cblx0ZW5kOiBmdW5jdGlvbigpIHtcblx0XHQvL3Nwcml0ZSBiYXRjaCBkb2Vzbid0IGhvbGQgYSByZWZlcmVuY2UgdG8gR0wgc2luY2UgaXQgaXMgdm9sYXRpbGVcblx0XHR2YXIgZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0XG5cdFx0Ly9qdXN0IGRvIGRpcmVjdCBwYXJlbnQgY2FsbCBmb3Igc3BlZWQgaGVyZVxuXHRcdC8vVGhpcyBiaW5kcyB0aGUgc2hhZGVyIGFuZCBtZXNoIVxuXHRcdEJhc2VCYXRjaC5wcm90b3R5cGUuZW5kLmNhbGwodGhpcyk7XG5cblx0XHRnbC5kZXB0aE1hc2sodHJ1ZSk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEZsdXNoZXMgdGhlIGJhdGNoIHRvIHRoZSBHUFUuIFRoaXMgc2hvdWxkIGJlIGNhbGxlZCB3aGVuXG5cdCAqIHN0YXRlIGNoYW5nZXMsIHN1Y2ggYXMgYmxlbmQgZnVuY3Rpb25zLCBkZXB0aCBvciBzdGVuY2lsIHN0YXRlcyxcblx0ICogc2hhZGVycywgYW5kIHNvIGZvcnRoLlxuXHQgKiBcblx0ICogQG1ldGhvZCBmbHVzaFxuXHQgKi9cblx0Zmx1c2g6IGZ1bmN0aW9uKCkge1xuXHRcdC8vaWdub3JlIGZsdXNoIGlmIHRleHR1cmUgaXMgbnVsbCBvciBvdXIgYmF0Y2ggaXMgZW1wdHlcblx0XHRpZiAoIXRoaXMudGV4dHVyZSlcblx0XHRcdHJldHVybjtcblx0XHRpZiAodGhpcy5pZHggPT09IDApXG5cdFx0XHRyZXR1cm47XG5cdFx0QmFzZUJhdGNoLnByb3RvdHlwZS5mbHVzaC5jYWxsKHRoaXMpO1xuXHRcdFNwcml0ZUJhdGNoLnRvdGFsUmVuZGVyQ2FsbHMrKztcblx0fSxcblxuXHQvKipcblx0ICogQWRkcyBhIHNwcml0ZSB0byB0aGlzIGJhdGNoLiBUaGUgc3ByaXRlIGlzIGRyYXduIGluIFxuXHQgKiBzY3JlZW4tc3BhY2Ugd2l0aCB0aGUgb3JpZ2luIGF0IHRoZSB1cHBlci1sZWZ0IGNvcm5lciAoeS1kb3duKS5cblx0ICogXG5cdCAqIEBtZXRob2QgZHJhd1xuXHQgKiBAcGFyYW0gIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSBUZXh0dXJlXG5cdCAqIEBwYXJhbSAge051bWJlcn0geCAgICAgICB0aGUgeCBwb3NpdGlvbiBpbiBwaXhlbHMsIGRlZmF1bHRzIHRvIHplcm9cblx0ICogQHBhcmFtICB7TnVtYmVyfSB5ICAgICAgIHRoZSB5IHBvc2l0aW9uIGluIHBpeGVscywgZGVmYXVsdHMgdG8gemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoICAgdGhlIHdpZHRoIGluIHBpeGVscywgZGVmYXVsdHMgdG8gdGhlIHRleHR1cmUgd2lkdGhcblx0ICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgIHRoZSBoZWlnaHQgaW4gcGl4ZWxzLCBkZWZhdWx0cyB0byB0aGUgdGV4dHVyZSBoZWlnaHRcblx0ICogQHBhcmFtICB7TnVtYmVyfSB1MSAgICAgIHRoZSBmaXJzdCBVIGNvb3JkaW5hdGUsIGRlZmF1bHQgemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHYxICAgICAgdGhlIGZpcnN0IFYgY29vcmRpbmF0ZSwgZGVmYXVsdCB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdTIgICAgICB0aGUgc2Vjb25kIFUgY29vcmRpbmF0ZSwgZGVmYXVsdCBvbmVcblx0ICogQHBhcmFtICB7TnVtYmVyfSB2MiAgICAgIHRoZSBzZWNvbmQgViBjb29yZGluYXRlLCBkZWZhdWx0IG9uZVxuXHQgKi9cblx0ZHJhdzogZnVuY3Rpb24odGV4dHVyZSwgeCwgeSwgd2lkdGgsIGhlaWdodCwgdTEsIHYxLCB1MiwgdjIpIHtcblx0XHRpZiAoIXRoaXMuZHJhd2luZylcblx0XHRcdHRocm93IFwiSWxsZWdhbCBTdGF0ZTogdHJ5aW5nIHRvIGRyYXcgYSBiYXRjaCBiZWZvcmUgYmVnaW4oKVwiO1xuXG5cdFx0Ly9kb24ndCBkcmF3IGFueXRoaW5nIGlmIEdMIHRleCBkb2Vzbid0IGV4aXN0Li5cblx0XHRpZiAoIXRleHR1cmUpXG5cdFx0XHRyZXR1cm47XG5cblx0XHRpZiAodGhpcy50ZXh0dXJlID09PSBudWxsIHx8IHRoaXMudGV4dHVyZS5pZCAhPT0gdGV4dHVyZS5pZCkge1xuXHRcdFx0Ly9uZXcgdGV4dHVyZS4uIGZsdXNoIHByZXZpb3VzIGRhdGFcblx0XHRcdHRoaXMuZmx1c2goKTtcblx0XHRcdHRoaXMudGV4dHVyZSA9IHRleHR1cmU7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmlkeCA9PSB0aGlzLnZlcnRpY2VzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5mbHVzaCgpOyAvL3dlJ3ZlIHJlYWNoZWQgb3VyIG1heCwgZmx1c2ggYmVmb3JlIHB1c2hpbmcgbW9yZSBkYXRhXG5cdFx0fVxuXG5cdFx0d2lkdGggPSAod2lkdGg9PT0wKSA/IHdpZHRoIDogKHdpZHRoIHx8IHRleHR1cmUud2lkdGgpO1xuXHRcdGhlaWdodCA9IChoZWlnaHQ9PT0wKSA/IGhlaWdodCA6IChoZWlnaHQgfHwgdGV4dHVyZS5oZWlnaHQpO1xuXHRcdHggPSB4IHx8IDA7XG5cdFx0eSA9IHkgfHwgMDtcblxuXHRcdHZhciB4MSA9IHg7XG5cdFx0dmFyIHgyID0geCArIHdpZHRoO1xuXHRcdHZhciB5MSA9IHk7XG5cdFx0dmFyIHkyID0geSArIGhlaWdodDtcblxuXHRcdHUxID0gdTEgfHwgMDtcblx0XHR1MiA9ICh1Mj09PTApID8gdTIgOiAodTIgfHwgMSk7XG5cdFx0djEgPSB2MSB8fCAwO1xuXHRcdHYyID0gKHYyPT09MCkgPyB2MiA6ICh2MiB8fCAxKTtcblxuXHRcdHZhciBjID0gdGhpcy5jb2xvcjtcblxuXHRcdC8veHlcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geDE7XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHkxO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gYztcblx0XHQvL3V2XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHUxO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2MTtcblx0XHRcblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHgyO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB5MTtcblx0XHQvL2NvbG9yXG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IGM7XG5cdFx0Ly91dlxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB1Mjtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdjE7XG5cblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHgyO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB5Mjtcblx0XHQvL2NvbG9yXG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IGM7XG5cdFx0Ly91dlxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB1Mjtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdjI7XG5cblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHgxO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB5Mjtcblx0XHQvL2NvbG9yXG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IGM7XG5cdFx0Ly91dlxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB1MTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdjI7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEFkZHMgYSBzaW5nbGUgcXVhZCBtZXNoIHRvIHRoaXMgc3ByaXRlIGJhdGNoIGZyb20gdGhlIGdpdmVuXG5cdCAqIGFycmF5IG9mIHZlcnRpY2VzLiBUaGUgc3ByaXRlIGlzIGRyYXduIGluIFxuXHQgKiBzY3JlZW4tc3BhY2Ugd2l0aCB0aGUgb3JpZ2luIGF0IHRoZSB1cHBlci1sZWZ0IGNvcm5lciAoeS1kb3duKS5cblx0ICpcblx0ICogVGhpcyByZWFkcyAyMCBpbnRlcmxlYXZlZCBmbG9hdHMgZnJvbSB0aGUgZ2l2ZW4gb2Zmc2V0IGluZGV4LCBpbiB0aGUgZm9ybWF0XG5cdCAqXG5cdCAqICB7IHgsIHksIGNvbG9yLCB1LCB2LFxuXHQgKiAgICAgIC4uLiAgfVxuXHQgKlxuXHQgKiBAbWV0aG9kICBkcmF3VmVydGljZXNcblx0ICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSBUZXh0dXJlIG9iamVjdFxuXHQgKiBAcGFyYW0ge0Zsb2F0MzJBcnJheX0gdmVydHMgYW4gYXJyYXkgb2YgdmVydGljZXNcblx0ICogQHBhcmFtIHtOdW1iZXJ9IG9mZiB0aGUgb2Zmc2V0IGludG8gdGhlIHZlcnRpY2VzIGFycmF5IHRvIHJlYWQgZnJvbVxuXHQgKi9cblx0ZHJhd1ZlcnRpY2VzOiBmdW5jdGlvbih0ZXh0dXJlLCB2ZXJ0cywgb2ZmKSB7XG5cdFx0aWYgKCF0aGlzLmRyYXdpbmcpXG5cdFx0XHR0aHJvdyBcIklsbGVnYWwgU3RhdGU6IHRyeWluZyB0byBkcmF3IGEgYmF0Y2ggYmVmb3JlIGJlZ2luKClcIjtcblx0XHRcblx0XHQvL2Rvbid0IGRyYXcgYW55dGhpbmcgaWYgR0wgdGV4IGRvZXNuJ3QgZXhpc3QuLlxuXHRcdGlmICghdGV4dHVyZSlcblx0XHRcdHJldHVybjtcblxuXG5cdFx0aWYgKHRoaXMudGV4dHVyZSAhPSB0ZXh0dXJlKSB7XG5cdFx0XHQvL25ldyB0ZXh0dXJlLi4gZmx1c2ggcHJldmlvdXMgZGF0YVxuXHRcdFx0dGhpcy5mbHVzaCgpO1xuXHRcdFx0dGhpcy50ZXh0dXJlID0gdGV4dHVyZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaWR4ID09IHRoaXMudmVydGljZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmZsdXNoKCk7IC8vd2UndmUgcmVhY2hlZCBvdXIgbWF4LCBmbHVzaCBiZWZvcmUgcHVzaGluZyBtb3JlIGRhdGFcblx0XHR9XG5cblx0XHRvZmYgPSBvZmYgfHwgMDtcblx0XHQvL1RPRE86IHVzZSBhIGxvb3AgaGVyZT9cblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vdXZcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0XG5cdFx0Ly94eVxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHQvL2NvbG9yXG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHQvL3V2XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXG5cdFx0Ly94eVxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHQvL2NvbG9yXG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHQvL3V2XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXG5cdFx0Ly94eVxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHQvL2NvbG9yXG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHQvL3V2XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHR9XG59KTtcblxuLyoqXG4gKiBUaGUgZGVmYXVsdCB2ZXJ0ZXggc2l6ZSwgaS5lLiBudW1iZXIgb2YgZmxvYXRzIHBlciB2ZXJ0ZXguXG4gKiBAYXR0cmlidXRlICBWRVJURVhfU0laRVxuICogQHN0YXRpY1xuICogQGZpbmFsXG4gKiBAdHlwZSB7TnVtYmVyfVxuICogQGRlZmF1bHQgIDVcbiAqL1xuU3ByaXRlQmF0Y2guVkVSVEVYX1NJWkUgPSA1O1xuXG4vKipcbiAqIEluY3JlbWVudGVkIGFmdGVyIGVhY2ggZHJhdyBjYWxsLCBjYW4gYmUgdXNlZCBmb3IgZGVidWdnaW5nLlxuICpcbiAqICAgICBTcHJpdGVCYXRjaC50b3RhbFJlbmRlckNhbGxzID0gMDtcbiAqXG4gKiAgICAgLi4uIGRyYXcgeW91ciBzY2VuZSAuLi5cbiAqXG4gKiAgICAgY29uc29sZS5sb2coXCJEcmF3IGNhbGxzIHBlciBmcmFtZTpcIiwgU3ByaXRlQmF0Y2gudG90YWxSZW5kZXJDYWxscyk7XG4gKlxuICogXG4gKiBAYXR0cmlidXRlICB0b3RhbFJlbmRlckNhbGxzXG4gKiBAc3RhdGljXG4gKiBAdHlwZSB7TnVtYmVyfVxuICogQGRlZmF1bHQgIDBcbiAqL1xuU3ByaXRlQmF0Y2gudG90YWxSZW5kZXJDYWxscyA9IDA7XG5cblNwcml0ZUJhdGNoLkRFRkFVTFRfRlJBR19TSEFERVIgPSBbXG5cdFwicHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XCIsXG5cdFwidmFyeWluZyB2ZWMyIHZUZXhDb29yZDA7XCIsXG5cdFwidmFyeWluZyB2ZWM0IHZDb2xvcjtcIixcblx0XCJ1bmlmb3JtIHNhbXBsZXIyRCB1X3RleHR1cmUwO1wiLFxuXG5cdFwidm9pZCBtYWluKHZvaWQpIHtcIixcblx0XCIgICBnbF9GcmFnQ29sb3IgPSB0ZXh0dXJlMkQodV90ZXh0dXJlMCwgdlRleENvb3JkMCkgKiB2Q29sb3I7XCIsXG5cdFwifVwiXG5dLmpvaW4oJ1xcbicpO1xuXG5TcHJpdGVCYXRjaC5ERUZBVUxUX1ZFUlRfU0hBREVSID0gW1xuXHRcImF0dHJpYnV0ZSB2ZWMyIFwiK1NoYWRlclByb2dyYW0uUE9TSVRJT05fQVRUUklCVVRFK1wiO1wiLFxuXHRcImF0dHJpYnV0ZSB2ZWM0IFwiK1NoYWRlclByb2dyYW0uQ09MT1JfQVRUUklCVVRFK1wiO1wiLFxuXHRcImF0dHJpYnV0ZSB2ZWMyIFwiK1NoYWRlclByb2dyYW0uVEVYQ09PUkRfQVRUUklCVVRFK1wiMDtcIixcblxuXHRcInVuaWZvcm0gdmVjMiB1X3Byb2plY3Rpb247XCIsXG5cdFwidmFyeWluZyB2ZWMyIHZUZXhDb29yZDA7XCIsXG5cdFwidmFyeWluZyB2ZWM0IHZDb2xvcjtcIixcblxuXHRcInZvaWQgbWFpbih2b2lkKSB7XCIsIC8vL1RPRE86IHVzZSBhIHByb2plY3Rpb24gYW5kIHRyYW5zZm9ybSBtYXRyaXhcblx0XCIgICBnbF9Qb3NpdGlvbiA9IHZlYzQoIFwiXG5cdFx0K1NoYWRlclByb2dyYW0uUE9TSVRJT05fQVRUUklCVVRFXG5cdFx0K1wiLnggLyB1X3Byb2plY3Rpb24ueCAtIDEuMCwgXCJcblx0XHQrU2hhZGVyUHJvZ3JhbS5QT1NJVElPTl9BVFRSSUJVVEVcblx0XHQrXCIueSAvIC11X3Byb2plY3Rpb24ueSArIDEuMCAsIDAuMCwgMS4wKTtcIixcblx0XCIgICB2VGV4Q29vcmQwID0gXCIrU2hhZGVyUHJvZ3JhbS5URVhDT09SRF9BVFRSSUJVVEUrXCIwO1wiLFxuXHRcIiAgIHZDb2xvciA9IFwiK1NoYWRlclByb2dyYW0uQ09MT1JfQVRUUklCVVRFK1wiO1wiLFxuXHRcIiAgIHZDb2xvci5hID0gdkNvbG9yLmEgKiAoMjU2LjAvMjU1LjApO1wiLCAvL3RoaXMgaXMgc28gdGhlIGFscGhhIHNpdHMgYXQgMC4wIG9yIDEuMFxuXHRcIn1cIlxuXS5qb2luKCdcXG4nKTtcblxubW9kdWxlLmV4cG9ydHMgPSBTcHJpdGVCYXRjaDsiLCIvKipcbiAqIFRoZSBjb3JlIGthbWkgbW9kdWxlIHByb3ZpZGVzIGJhc2ljIDJEIHNwcml0ZSBiYXRjaGluZyBhbmQgXG4gKiBhc3NldCBtYW5hZ2VtZW50LlxuICogXG4gKiBAbW9kdWxlIGthbWktYmF0Y2hcbiAqL1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcbnZhciBNZXNoID0gcmVxdWlyZSgna2FtaS1tZXNoLWJ1ZmZlcicpO1xudmFyIHdyYXBDb250ZXh0ID0gcmVxdWlyZSgna2FtaS11dGlsJykud3JhcENvbnRleHQ7XG5cbnZhciBjb2xvclRvRmxvYXQgPSByZXF1aXJlKCdudW1iZXItdXRpbCcpLmNvbG9yVG9GbG9hdDtcblxuLyoqIFxuICogQSBiYXRjaGVyIG1peGluIGNvbXBvc2VkIG9mIHF1YWRzICh0d28gdHJpcywgaW5kZXhlZCkuIFxuICpcbiAqIFRoaXMgaXMgdXNlZCBpbnRlcm5hbGx5OyB1c2VycyBzaG91bGQgbG9vayBhdCBcbiAqIHt7I2Nyb3NzTGluayBcIlNwcml0ZUJhdGNoXCJ9fXt7L2Nyb3NzTGlua319IGluc3RlYWQsIHdoaWNoIGluaGVyaXRzIGZyb20gdGhpc1xuICogY2xhc3MuXG4gKiBcbiAqIFRoZSBiYXRjaGVyIGl0c2VsZiBpcyBub3QgbWFuYWdlZCBieSBXZWJHTENvbnRleHQ7IGhvd2V2ZXIsIGl0IG1ha2VzXG4gKiB1c2Ugb2YgTWVzaCBhbmQgVGV4dHVyZSB3aGljaCB3aWxsIGJlIG1hbmFnZWQuIEZvciB0aGlzIHJlYXNvbiwgdGhlIGJhdGNoZXJcbiAqIGRvZXMgbm90IGhvbGQgYSBkaXJlY3QgcmVmZXJlbmNlIHRvIHRoZSBHTCBzdGF0ZS5cbiAqXG4gKiBTdWJjbGFzc2VzIG11c3QgaW1wbGVtZW50IHRoZSBmb2xsb3dpbmc6ICBcbiAqIHt7I2Nyb3NzTGluayBcIkJhc2VCYXRjaC9fY3JlYXRlU2hhZGVyOm1ldGhvZFwifX17ey9jcm9zc0xpbmt9fSAgXG4gKiB7eyNjcm9zc0xpbmsgXCJCYXNlQmF0Y2gvX2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXM6bWV0aG9kXCJ9fXt7L2Nyb3NzTGlua319ICBcbiAqIHt7I2Nyb3NzTGluayBcIkJhc2VCYXRjaC9nZXRWZXJ0ZXhTaXplOm1ldGhvZFwifX17ey9jcm9zc0xpbmt9fSAgXG4gKiBcbiAqIEBjbGFzcyAgQmFzZUJhdGNoXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7V2ViR0xDb250ZXh0fSBjb250ZXh0IHRoZSBjb250ZXh0IHRoaXMgYmF0Y2hlciBiZWxvbmdzIHRvXG4gKiBAcGFyYW0ge051bWJlcn0gc2l6ZSB0aGUgb3B0aW9uYWwgc2l6ZSBvZiB0aGlzIGJhdGNoLCBpLmUuIG1heCBudW1iZXIgb2YgcXVhZHNcbiAqIEBkZWZhdWx0ICA1MDBcbiAqL1xudmFyIEJhc2VCYXRjaCA9IG5ldyBDbGFzcyh7XG5cblx0Ly9Db25zdHJ1Y3RvclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBCYXNlQmF0Y2goY29udGV4dCwgc2l6ZSkge1xuXHRcdGlmICghY29udGV4dCB8fCB0eXBlb2YgY29udGV4dCAhPT0gXCJvYmplY3RcIilcblx0XHRcdHRocm93IFwidmFsaWQgR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkIHRvIFNwcml0ZUJhdGNoXCI7XG5cdFx0dGhpcy5jb250ZXh0ID0gd3JhcENvbnRleHQoY29udGV4dCk7XG5cblx0XHR0aGlzLnNpemUgPSBzaXplIHx8IDUwMDtcblx0XHRcblx0XHQvLyA2NTUzNSBpcyBtYXggaW5kZXgsIHNvIDY1NTM1IC8gNiA9IDEwOTIyLlxuXHRcdGlmICh0aGlzLnNpemUgPiAxMDkyMilcblx0XHRcdHRocm93IFwiQ2FuJ3QgaGF2ZSBtb3JlIHRoYW4gMTA5MjIgc3ByaXRlcyBwZXIgYmF0Y2g6IFwiICsgdGhpcy5zaXplO1xuXHRcdFxuXHRcdHRoaXMuX2JsZW5kU3JjID0gdGhpcy5jb250ZXh0LmdsLk9ORTtcblx0XHR0aGlzLl9ibGVuZERzdCA9IHRoaXMuY29udGV4dC5nbC5PTkVfTUlOVVNfU1JDX0FMUEhBXG5cdFx0dGhpcy5fYmxlbmRpbmdFbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLl9zaGFkZXIgPSB0aGlzLl9jcmVhdGVTaGFkZXIoKTtcblxuXHRcdC8qKlxuXHRcdCAqIFRoaXMgc2hhZGVyIHdpbGwgYmUgdXNlZCB3aGVuZXZlciBcIm51bGxcIiBpcyBwYXNzZWRcblx0XHQgKiBhcyB0aGUgYmF0Y2gncyBzaGFkZXIuIFxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IHtTaGFkZXJQcm9ncmFtfSBzaGFkZXJcblx0XHQgKi9cblx0XHR0aGlzLmRlZmF1bHRTaGFkZXIgPSB0aGlzLl9zaGFkZXI7XG5cblx0XHQvKipcblx0XHQgKiBCeSBkZWZhdWx0LCBhIFNwcml0ZUJhdGNoIGlzIGNyZWF0ZWQgd2l0aCBpdHMgb3duIFNoYWRlclByb2dyYW0sXG5cdFx0ICogc3RvcmVkIGluIGBkZWZhdWx0U2hhZGVyYC4gSWYgdGhpcyBmbGFnIGlzIHRydWUsIG9uIGRlbGV0aW5nIHRoZSBTcHJpdGVCYXRjaCwgaXRzXG5cdFx0ICogYGRlZmF1bHRTaGFkZXJgIHdpbGwgYWxzbyBiZSBkZWxldGVkLiBJZiB0aGlzIGZsYWcgaXMgZmFsc2UsIG5vIHNoYWRlcnNcblx0XHQgKiB3aWxsIGJlIGRlbGV0ZWQgb24gZGVzdHJveS5cblx0XHQgKlxuXHRcdCAqIE5vdGUgdGhhdCBpZiB5b3UgcmUtYXNzaWduIGBkZWZhdWx0U2hhZGVyYCwgeW91IHdpbGwgbmVlZCB0byBkaXNwb3NlIHRoZSBwcmV2aW91c1xuXHRcdCAqIGRlZmF1bHQgc2hhZGVyIHlvdXJzZWwuIFxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IG93bnNTaGFkZXJcblx0XHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0XHQgKi9cblx0XHR0aGlzLm93bnNTaGFkZXIgPSB0cnVlO1xuXG5cdFx0dGhpcy5pZHggPSAwO1xuXG5cdFx0LyoqXG5cdFx0ICogV2hldGhlciB3ZSBhcmUgY3VycmVudGx5IGRyYXdpbmcgdG8gdGhlIGJhdGNoLiBEbyBub3QgbW9kaWZ5LlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gZHJhd2luZ1xuXHRcdCAqL1xuXHRcdHRoaXMuZHJhd2luZyA9IGZhbHNlO1xuXG5cdFx0dGhpcy5tZXNoID0gdGhpcy5fY3JlYXRlTWVzaCh0aGlzLnNpemUpO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIEFCR1IgcGFja2VkIGNvbG9yLCBhcyBhIHNpbmdsZSBmbG9hdC4gVGhlIGRlZmF1bHRcblx0XHQgKiB2YWx1ZSBpcyB0aGUgY29sb3Igd2hpdGUgKDI1NSwgMjU1LCAyNTUsIDI1NSkuXG5cdFx0ICpcblx0XHQgKiBAcHJvcGVydHkge051bWJlcn0gY29sb3Jcblx0XHQgKiBAcmVhZE9ubHkgXG5cdFx0ICovXG5cdFx0dGhpcy5jb2xvciA9IGNvbG9yVG9GbG9hdCgyNTUsIDI1NSwgMjU1LCAyNTUpO1xuXHRcdFxuXHRcdC8qKlxuXHRcdCAqIFdoZXRoZXIgdG8gcHJlbXVsdGlwbHkgYWxwaGEgb24gY2FsbHMgdG8gc2V0Q29sb3IuIFxuXHRcdCAqIFRoaXMgaXMgdHJ1ZSBieSBkZWZhdWx0LCBzbyB0aGF0IHdlIGNhbiBjb252ZW5pZW50bHkgd3JpdGU6XG5cdFx0ICpcblx0XHQgKiAgICAgYmF0Y2guc2V0Q29sb3IoMSwgMCwgMCwgMC4yNSk7IC8vdGludHMgcmVkIHdpdGggMjUlIG9wYWNpdHlcblx0XHQgKlxuXHRcdCAqIElmIGZhbHNlLCB5b3UgbXVzdCBwcmVtdWx0aXBseSB0aGUgY29sb3JzIHlvdXJzZWxmIHRvIGFjaGlldmVcblx0XHQgKiB0aGUgc2FtZSB0aW50LCBsaWtlIHNvOlxuXHRcdCAqXG5cdFx0ICogICAgIGJhdGNoLnNldENvbG9yKDAuMjUsIDAsIDAsIDAuMjUpO1xuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSBwcmVtdWx0aXBsaWVkXG5cdFx0ICogQHR5cGUge0Jvb2xlYW59XG5cdFx0ICogQGRlZmF1bHQgIHRydWVcblx0XHQgKi9cblx0XHR0aGlzLnByZW11bHRpcGxpZWQgPSB0cnVlO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIHByb3BlcnR5IHRvIGVuYWJsZSBvciBkaXNhYmxlIGJsZW5kaW5nIGZvciB0aGlzIHNwcml0ZSBiYXRjaC4gSWZcblx0ICogd2UgYXJlIGN1cnJlbnRseSBkcmF3aW5nLCB0aGlzIHdpbGwgZmlyc3QgZmx1c2ggdGhlIGJhdGNoLCBhbmQgdGhlblxuXHQgKiB1cGRhdGUgR0xfQkxFTkQgc3RhdGUgKGVuYWJsZWQgb3IgZGlzYWJsZWQpIHdpdGggb3VyIG5ldyB2YWx1ZS5cblx0ICogXG5cdCAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gYmxlbmRpbmdFbmFibGVkXG5cdCAqL1xuXHRibGVuZGluZ0VuYWJsZWQ6IHtcblx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0dmFyIG9sZCA9IHRoaXMuX2JsZW5kaW5nRW5hYmxlZDtcblx0XHRcdGlmICh0aGlzLmRyYXdpbmcpXG5cdFx0XHRcdHRoaXMuZmx1c2goKTtcblxuXHRcdFx0dGhpcy5fYmxlbmRpbmdFbmFibGVkID0gdmFsO1xuXG5cdFx0XHQvL2lmIHdlIGhhdmUgYSBuZXcgdmFsdWUsIHVwZGF0ZSBpdC5cblx0XHRcdC8vdGhpcyBpcyBiZWNhdXNlIGJsZW5kIGlzIGRvbmUgaW4gYmVnaW4oKSAvIGVuZCgpIFxuXHRcdFx0aWYgKHRoaXMuZHJhd2luZyAmJiBvbGQgIT0gdmFsKSB7XG5cdFx0XHRcdHZhciBnbCA9IHRoaXMuY29udGV4dC5nbDtcblx0XHRcdFx0aWYgKHZhbClcblx0XHRcdFx0XHRnbC5lbmFibGUoZ2wuQkxFTkQpO1xuXHRcdFx0XHRlbHNlXG5cdFx0XHRcdFx0Z2wuZGlzYWJsZShnbC5CTEVORCk7XG5cdFx0XHR9XG5cblx0XHR9LFxuXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ibGVuZGluZ0VuYWJsZWQ7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBibGVuZCBzb3VyY2UgcGFyYW1ldGVycy4gXG5cdCAqIElmIHdlIGFyZSBjdXJyZW50bHkgZHJhd2luZywgdGhpcyB3aWxsIGZsdXNoIHRoZSBiYXRjaC5cblx0ICpcblx0ICogU2V0dGluZyBlaXRoZXIgc3JjIG9yIGRzdCB0byBgbnVsbGAgb3IgYSBmYWxzeSB2YWx1ZSB0ZWxscyB0aGUgU3ByaXRlQmF0Y2hcblx0ICogdG8gaWdub3JlIGdsLmJsZW5kRnVuYy4gVGhpcyBpcyB1c2VmdWwgaWYgeW91IHdpc2ggdG8gdXNlIHlvdXJcblx0ICogb3duIGJsZW5kRnVuYyBvciBibGVuZEZ1bmNTZXBhcmF0ZS4gXG5cdCAqIFxuXHQgKiBAcHJvcGVydHkge0dMZW51bX0gYmxlbmREc3QgXG5cdCAqL1xuXHRibGVuZFNyYzoge1xuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHRpZiAodGhpcy5kcmF3aW5nKVxuXHRcdFx0XHR0aGlzLmZsdXNoKCk7XG5cdFx0XHR0aGlzLl9ibGVuZFNyYyA9IHZhbDtcblx0XHR9LFxuXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ibGVuZFNyYztcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGJsZW5kIGRlc3RpbmF0aW9uIHBhcmFtZXRlcnMuIFxuXHQgKiBJZiB3ZSBhcmUgY3VycmVudGx5IGRyYXdpbmcsIHRoaXMgd2lsbCBmbHVzaCB0aGUgYmF0Y2guXG5cdCAqXG5cdCAqIFNldHRpbmcgZWl0aGVyIHNyYyBvciBkc3QgdG8gYG51bGxgIG9yIGEgZmFsc3kgdmFsdWUgdGVsbHMgdGhlIFNwcml0ZUJhdGNoXG5cdCAqIHRvIGlnbm9yZSBnbC5ibGVuZEZ1bmMuIFRoaXMgaXMgdXNlZnVsIGlmIHlvdSB3aXNoIHRvIHVzZSB5b3VyXG5cdCAqIG93biBibGVuZEZ1bmMgb3IgYmxlbmRGdW5jU2VwYXJhdGUuIFxuXHQgKlxuXHQgKiBAcHJvcGVydHkge0dMZW51bX0gYmxlbmRTcmMgXG5cdCAqL1xuXHRibGVuZERzdDoge1xuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHRpZiAodGhpcy5kcmF3aW5nKVxuXHRcdFx0XHR0aGlzLmZsdXNoKCk7XG5cdFx0XHR0aGlzLl9ibGVuZERzdCA9IHZhbDtcblx0XHR9LFxuXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ibGVuZERzdDtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGJsZW5kIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gcGFyYW1ldGVycy4gVGhpcyBpcyBcblx0ICogYSBjb252ZW5pZW5jZSBmdW5jdGlvbiBmb3IgdGhlIGJsZW5kU3JjIGFuZCBibGVuZERzdCBzZXR0ZXJzLlxuXHQgKiBJZiB3ZSBhcmUgY3VycmVudGx5IGRyYXdpbmcsIHRoaXMgd2lsbCBmbHVzaCB0aGUgYmF0Y2guXG5cdCAqXG5cdCAqIFNldHRpbmcgZWl0aGVyIHRvIGBudWxsYCBvciBhIGZhbHN5IHZhbHVlIHRlbGxzIHRoZSBTcHJpdGVCYXRjaFxuXHQgKiB0byBpZ25vcmUgZ2wuYmxlbmRGdW5jLiBUaGlzIGlzIHVzZWZ1bCBpZiB5b3Ugd2lzaCB0byB1c2UgeW91clxuXHQgKiBvd24gYmxlbmRGdW5jIG9yIGJsZW5kRnVuY1NlcGFyYXRlLiBcblx0ICpcblx0ICogQG1ldGhvZCAgc2V0QmxlbmRGdW5jdGlvblxuXHQgKiBAcGFyYW0ge0dMZW51bX0gYmxlbmRTcmMgdGhlIHNvdXJjZSBibGVuZCBwYXJhbWV0ZXJcblx0ICogQHBhcmFtIHtHTGVudW19IGJsZW5kRHN0IHRoZSBkZXN0aW5hdGlvbiBibGVuZCBwYXJhbWV0ZXJcblx0ICovXG5cdHNldEJsZW5kRnVuY3Rpb246IGZ1bmN0aW9uKGJsZW5kU3JjLCBibGVuZERzdCkge1xuXHRcdHRoaXMuYmxlbmRTcmMgPSBibGVuZFNyYztcblx0XHR0aGlzLmJsZW5kRHN0ID0gYmxlbmREc3Q7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFRoaXMgaXMgYSBzZXR0ZXIvZ2V0dGVyIGZvciB0aGlzIGJhdGNoJ3MgY3VycmVudCBTaGFkZXJQcm9ncmFtLlxuXHQgKiBJZiB0aGlzIGlzIHNldCB3aGVuIHRoZSBiYXRjaCBpcyBkcmF3aW5nLCB0aGUgc3RhdGUgd2lsbCBiZSBmbHVzaGVkXG5cdCAqIHRvIHRoZSBHUFUgYW5kIHRoZSBuZXcgc2hhZGVyIHdpbGwgdGhlbiBiZSBib3VuZC5cblx0ICpcblx0ICogSWYgYG51bGxgIG9yIGEgZmFsc3kgdmFsdWUgaXMgc3BlY2lmaWVkLCB0aGUgYmF0Y2gncyBgZGVmYXVsdFNoYWRlcmAgd2lsbCBiZSB1c2VkLiBcblx0ICpcblx0ICogTm90ZSB0aGF0IHNoYWRlcnMgYXJlIGJvdW5kIG9uIGJhdGNoLmJlZ2luKCkuXG5cdCAqXG5cdCAqIEBwcm9wZXJ0eSBzaGFkZXJcblx0ICogQHR5cGUge1NoYWRlclByb2dyYW19XG5cdCAqL1xuXHRzaGFkZXI6IHtcblx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0dmFyIHdhc0RyYXdpbmcgPSB0aGlzLmRyYXdpbmc7XG5cblx0XHRcdGlmICh3YXNEcmF3aW5nKSB7XG5cdFx0XHRcdHRoaXMuZW5kKCk7IC8vdW5iaW5kcyB0aGUgc2hhZGVyIGZyb20gdGhlIG1lc2hcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fc2hhZGVyID0gdmFsID8gdmFsIDogdGhpcy5kZWZhdWx0U2hhZGVyO1xuXG5cdFx0XHRpZiAod2FzRHJhd2luZykge1xuXHRcdFx0XHR0aGlzLmJlZ2luKCk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2hhZGVyO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogU2V0cyB0aGUgY29sb3Igb2YgdGhpcyBzcHJpdGUgYmF0Y2hlciwgd2hpY2ggaXMgdXNlZCBpbiBzdWJzZXF1ZW50IGRyYXdcblx0ICogY2FsbHMuIFRoaXMgZG9lcyBub3QgZmx1c2ggdGhlIGJhdGNoLlxuXHQgKlxuXHQgKiBJZiByLCBnLCBiLCBhcmUgYWxsIG51bWJlcnMsIHRoaXMgbWV0aG9kIGFzc3VtZXMgdGhhdCBSR0IgXG5cdCAqIG9yIFJHQkEgZmxvYXQgdmFsdWVzICgwLjAgdG8gMS4wKSBhcmUgYmVpbmcgcGFzc2VkLiBBbHBoYSBkZWZhdWx0cyB0byBvbmVcblx0ICogaWYgdW5kZWZpbmVkLlxuXHQgKiBcblx0ICogSWYgb25lIG9yIG1vcmUgb2YgdGhlIChyLCBnLCBiKSBhcmd1bWVudHMgYXJlIG5vbi1udW1iZXJzLCB3ZSBvbmx5IGNvbnNpZGVyIHRoZSBmaXJzdCBhcmd1bWVudFxuXHQgKiBhbmQgYXNzaWduIGl0IHRvIGFsbCBmb3VyIGNvbXBvbmVudHMgLS0gdGhpcyBpcyB1c2VmdWwgZm9yIHNldHRpbmcgdHJhbnNwYXJlbmN5IFxuXHQgKiBpbiBhIHByZW11bHRpcGxpZWQgYWxwaGEgc3RhZ2UuXG5cdCAqIFxuXHQgKiBJZiB0aGUgZmlyc3QgYXJndW1lbnQgaXMgaW52YWxpZCBvciBub3QgYSBudW1iZXIsXG5cdCAqIHRoZSBjb2xvciBkZWZhdWx0cyB0byAoMSwgMSwgMSwgMSkuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHNldENvbG9yXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSByIHRoZSByZWQgY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBnIHRoZSBncmVlbiBjb21wb25lbnQsIG5vcm1hbGl6ZWRcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGIgdGhlIGJsdWUgY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBhIHRoZSBhbHBoYSBjb21wb25lbnQsIG5vcm1hbGl6ZWRcblx0ICovXG5cdHNldENvbG9yOiBmdW5jdGlvbihyLCBnLCBiLCBhKSB7XG5cdFx0XCJ1c2Ugc3RyaWN0XCI7XG5cdFx0dmFyIHJudW0gPSB0eXBlb2YgciA9PT0gXCJudW1iZXJcIjtcblx0XHRpZiAocm51bVxuXHRcdFx0XHQmJiB0eXBlb2YgZyA9PT0gXCJudW1iZXJcIlxuXHRcdFx0XHQmJiB0eXBlb2YgYiA9PT0gXCJudW1iZXJcIikge1xuXHRcdFx0Ly9kZWZhdWx0IGFscGhhIHRvIG9uZSBcblx0XHRcdGEgPSAoYSB8fCBhID09PSAwKSA/IGEgOiAxLjA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHIgPSBnID0gYiA9IGEgPSBybnVtID8gciA6IDEuMDtcblx0XHR9XG5cdFx0XG5cdFx0aWYgKHRoaXMucHJlbXVsdGlwbGllZCkge1xuXHRcdFx0ciAqPSBhO1xuXHRcdFx0ZyAqPSBhO1xuXHRcdFx0YiAqPSBhO1xuXHRcdH1cblx0XHRcblx0XHR0aGlzLmNvbG9yID0gY29sb3JUb0Zsb2F0KFxuXHRcdFx0fn4ociAqIDI1NSksXG5cdFx0XHR+fihnICogMjU1KSxcblx0XHRcdH5+KGIgKiAyNTUpLFxuXHRcdFx0fn4oYSAqIDI1NSlcblx0XHQpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgZnJvbSB0aGUgY29uc3RydWN0b3IgdG8gY3JlYXRlIGEgbmV3IE1lc2ggXG5cdCAqIGJhc2VkIG9uIHRoZSBleHBlY3RlZCBiYXRjaCBzaXplLiBTaG91bGQgc2V0IHVwXG5cdCAqIHZlcnRzICYgaW5kaWNlcyBwcm9wZXJseS5cblx0ICpcblx0ICogVXNlcnMgc2hvdWxkIG5vdCBjYWxsIHRoaXMgZGlyZWN0bHk7IGluc3RlYWQsIGl0XG5cdCAqIHNob3VsZCBvbmx5IGJlIGltcGxlbWVudGVkIGJ5IHN1YmNsYXNzZXMuXG5cdCAqIFxuXHQgKiBAbWV0aG9kIF9jcmVhdGVNZXNoXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBzaXplIHRoZSBzaXplIHBhc3NlZCB0aHJvdWdoIHRoZSBjb25zdHJ1Y3RvclxuXHQgKi9cblx0X2NyZWF0ZU1lc2g6IGZ1bmN0aW9uKHNpemUpIHtcblx0XHQvL3RoZSB0b3RhbCBudW1iZXIgb2YgZmxvYXRzIGluIG91ciBiYXRjaFxuXHRcdHZhciBudW1WZXJ0cyA9IHNpemUgKiA0ICogdGhpcy5nZXRWZXJ0ZXhTaXplKCk7XG5cdFx0Ly90aGUgdG90YWwgbnVtYmVyIG9mIGluZGljZXMgaW4gb3VyIGJhdGNoXG5cdFx0dmFyIG51bUluZGljZXMgPSBzaXplICogNjtcblx0XHR2YXIgZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cblx0XHQvL3ZlcnRleCBkYXRhXG5cdFx0dGhpcy52ZXJ0aWNlcyA9IG5ldyBGbG9hdDMyQXJyYXkobnVtVmVydHMpO1xuXHRcdC8vaW5kZXggZGF0YVxuXHRcdHRoaXMuaW5kaWNlcyA9IG5ldyBVaW50MTZBcnJheShudW1JbmRpY2VzKTsgXG5cdFx0XG5cdFx0Zm9yICh2YXIgaT0wLCBqPTA7IGkgPCBudW1JbmRpY2VzOyBpICs9IDYsIGogKz0gNCkgXG5cdFx0e1xuXHRcdFx0dGhpcy5pbmRpY2VzW2kgKyAwXSA9IGogKyAwOyBcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgMV0gPSBqICsgMTtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgMl0gPSBqICsgMjtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgM10gPSBqICsgMDtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgNF0gPSBqICsgMjtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgNV0gPSBqICsgMztcblx0XHR9XG5cblx0XHR2YXIgbWVzaCA9IG5ldyBNZXNoKHRoaXMuY29udGV4dCwgZmFsc2UsIFxuXHRcdFx0XHRcdFx0bnVtVmVydHMsIG51bUluZGljZXMsIHRoaXMuX2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXMoKSk7XG5cdFx0bWVzaC52ZXJ0aWNlcyA9IHRoaXMudmVydGljZXM7XG5cdFx0bWVzaC5pbmRpY2VzID0gdGhpcy5pbmRpY2VzO1xuXHRcdG1lc2gudmVydGV4VXNhZ2UgPSBnbC5EWU5BTUlDX0RSQVc7XG5cdFx0bWVzaC5pbmRleFVzYWdlID0gZ2wuU1RBVElDX0RSQVc7XG5cdFx0bWVzaC5kaXJ0eSA9IHRydWU7XG5cdFx0cmV0dXJuIG1lc2g7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBzaGFkZXIgZm9yIHRoaXMgYmF0Y2guIElmIHlvdSBwbGFuIHRvIHN1cHBvcnRcblx0ICogbXVsdGlwbGUgaW5zdGFuY2VzIG9mIHlvdXIgYmF0Y2gsIGl0IG1heSBvciBtYXkgbm90IGJlIHdpc2Vcblx0ICogdG8gdXNlIGEgc2hhcmVkIHNoYWRlciB0byBzYXZlIHJlc291cmNlcy5cblx0ICogXG5cdCAqIFRoaXMgbWV0aG9kIGluaXRpYWxseSB0aHJvd3MgYW4gZXJyb3I7IHNvIGl0IG11c3QgYmUgb3ZlcnJpZGRlbiBieVxuXHQgKiBzdWJjbGFzc2VzIG9mIEJhc2VCYXRjaC5cblx0ICpcblx0ICogQG1ldGhvZCAgX2NyZWF0ZVNoYWRlclxuXHQgKiBAcmV0dXJuIHtOdW1iZXJ9IHRoZSBzaXplIG9mIGEgdmVydGV4LCBpbiAjIG9mIGZsb2F0c1xuXHQgKi9cblx0X2NyZWF0ZVNoYWRlcjogZnVuY3Rpb24oKSB7XG5cdFx0dGhyb3cgXCJfY3JlYXRlU2hhZGVyIG5vdCBpbXBsZW1lbnRlZFwiXG5cdH0sXHRcblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBhcnJheSBvZiB2ZXJ0ZXggYXR0cmlidXRlcyBmb3IgdGhpcyBtZXNoOyBcblx0ICogc3ViY2xhc3NlcyBzaG91bGQgaW1wbGVtZW50IHRoaXMgd2l0aCB0aGUgYXR0cmlidXRlcyBcblx0ICogZXhwZWN0ZWQgZm9yIHRoZWlyIGJhdGNoLlxuXHQgKlxuXHQgKiBUaGlzIG1ldGhvZCBpbml0aWFsbHkgdGhyb3dzIGFuIGVycm9yOyBzbyBpdCBtdXN0IGJlIG92ZXJyaWRkZW4gYnlcblx0ICogc3ViY2xhc3NlcyBvZiBCYXNlQmF0Y2guXG5cdCAqXG5cdCAqIEBtZXRob2QgX2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXNcblx0ICogQHJldHVybiB7QXJyYXl9IGFuIGFycmF5IG9mIE1lc2guVmVydGV4QXR0cmliIG9iamVjdHNcblx0ICovXG5cdF9jcmVhdGVWZXJ0ZXhBdHRyaWJ1dGVzOiBmdW5jdGlvbigpIHtcblx0XHR0aHJvdyBcIl9jcmVhdGVWZXJ0ZXhBdHRyaWJ1dGVzIG5vdCBpbXBsZW1lbnRlZFwiO1xuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG51bWJlciBvZiBmbG9hdHMgcGVyIHZlcnRleCBmb3IgdGhpcyBiYXRjaGVyLlxuXHQgKiBcblx0ICogVGhpcyBtZXRob2QgaW5pdGlhbGx5IHRocm93cyBhbiBlcnJvcjsgc28gaXQgbXVzdCBiZSBvdmVycmlkZGVuIGJ5XG5cdCAqIHN1YmNsYXNzZXMgb2YgQmFzZUJhdGNoLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBnZXRWZXJ0ZXhTaXplXG5cdCAqIEByZXR1cm4ge051bWJlcn0gdGhlIHNpemUgb2YgYSB2ZXJ0ZXgsIGluICMgb2YgZmxvYXRzXG5cdCAqL1xuXHRnZXRWZXJ0ZXhTaXplOiBmdW5jdGlvbigpIHtcblx0XHR0aHJvdyBcImdldFZlcnRleFNpemUgbm90IGltcGxlbWVudGVkXCI7XG5cdH0sXG5cblx0XG5cdC8qKiBcblx0ICogQmVnaW5zIHRoZSBzcHJpdGUgYmF0Y2guIFRoaXMgd2lsbCBiaW5kIHRoZSBzaGFkZXJcblx0ICogYW5kIG1lc2guIFN1YmNsYXNzZXMgbWF5IHdhbnQgdG8gZGlzYWJsZSBkZXB0aCBvciBcblx0ICogc2V0IHVwIGJsZW5kaW5nLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBiZWdpblxuXHQgKi9cblx0YmVnaW46IGZ1bmN0aW9uKCkgIHtcblx0XHRpZiAodGhpcy5kcmF3aW5nKSBcblx0XHRcdHRocm93IFwiYmF0Y2guZW5kKCkgbXVzdCBiZSBjYWxsZWQgYmVmb3JlIGJlZ2luXCI7XG5cdFx0dGhpcy5kcmF3aW5nID0gdHJ1ZTtcblxuXHRcdHRoaXMuc2hhZGVyLmJpbmQoKTtcblxuXHRcdC8vYmluZCB0aGUgYXR0cmlidXRlcyBub3cgdG8gYXZvaWQgcmVkdW5kYW50IGNhbGxzXG5cdFx0dGhpcy5tZXNoLmJpbmQodGhpcy5zaGFkZXIpO1xuXG5cdFx0aWYgKHRoaXMuX2JsZW5kaW5nRW5hYmxlZCkge1xuXHRcdFx0dmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHRcdFx0Z2wuZW5hYmxlKGdsLkJMRU5EKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqIFxuXHQgKiBFbmRzIHRoZSBzcHJpdGUgYmF0Y2guIFRoaXMgd2lsbCBmbHVzaCBhbnkgcmVtYWluaW5nIFxuXHQgKiBkYXRhIGFuZCBzZXQgR0wgc3RhdGUgYmFjayB0byBub3JtYWwuXG5cdCAqIFxuXHQgKiBAbWV0aG9kICBlbmRcblx0ICovXG5cdGVuZDogZnVuY3Rpb24oKSAge1xuXHRcdGlmICghdGhpcy5kcmF3aW5nKVxuXHRcdFx0dGhyb3cgXCJiYXRjaC5iZWdpbigpIG11c3QgYmUgY2FsbGVkIGJlZm9yZSBlbmRcIjtcblx0XHRpZiAodGhpcy5pZHggPiAwKVxuXHRcdFx0dGhpcy5mbHVzaCgpO1xuXHRcdHRoaXMuZHJhd2luZyA9IGZhbHNlO1xuXG5cdFx0dGhpcy5tZXNoLnVuYmluZCh0aGlzLnNoYWRlcik7XG5cblx0XHRpZiAodGhpcy5fYmxlbmRpbmdFbmFibGVkKSB7XG5cdFx0XHR2YXIgZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0XHRnbC5kaXNhYmxlKGdsLkJMRU5EKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqIFxuXHQgKiBDYWxsZWQgYmVmb3JlIHJlbmRlcmluZyB0byBiaW5kIG5ldyB0ZXh0dXJlcy5cblx0ICogVGhpcyBtZXRob2QgZG9lcyBub3RoaW5nIGJ5IGRlZmF1bHQuXG5cdCAqXG5cdCAqIEBtZXRob2QgIF9wcmVSZW5kZXJcblx0ICovXG5cdF9wcmVSZW5kZXI6IGZ1bmN0aW9uKCkgIHtcblx0fSxcblxuXHQvKipcblx0ICogRmx1c2hlcyB0aGUgYmF0Y2ggYnkgcHVzaGluZyB0aGUgY3VycmVudCBkYXRhXG5cdCAqIHRvIEdMLlxuXHQgKiBcblx0ICogQG1ldGhvZCBmbHVzaFxuXHQgKi9cblx0Zmx1c2g6IGZ1bmN0aW9uKCkgIHtcblx0XHRpZiAodGhpcy5pZHg9PT0wKVxuXHRcdFx0cmV0dXJuO1xuXG5cdFx0dmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXG5cdFx0Ly9wcmVtdWx0aXBsaWVkIGFscGhhXG5cdFx0aWYgKHRoaXMuX2JsZW5kaW5nRW5hYmxlZCkge1xuXHRcdFx0Ly9zZXQgZWl0aGVyIHRvIG51bGwgaWYgeW91IHdhbnQgdG8gY2FsbCB5b3VyIG93biBcblx0XHRcdC8vYmxlbmRGdW5jIG9yIGJsZW5kRnVuY1NlcGFyYXRlXG5cdFx0XHRpZiAodGhpcy5fYmxlbmRTcmMgJiYgdGhpcy5fYmxlbmREc3QpXG5cdFx0XHRcdGdsLmJsZW5kRnVuYyh0aGlzLl9ibGVuZFNyYywgdGhpcy5fYmxlbmREc3QpOyBcblx0XHR9XG5cblx0XHR0aGlzLl9wcmVSZW5kZXIoKTtcblxuXHRcdC8vbnVtYmVyIG9mIHNwcml0ZXMgaW4gYmF0Y2hcblx0XHR2YXIgbnVtQ29tcG9uZW50cyA9IHRoaXMuZ2V0VmVydGV4U2l6ZSgpO1xuXHRcdHZhciBzcHJpdGVDb3VudCA9ICh0aGlzLmlkeCAvIChudW1Db21wb25lbnRzICogNCkpO1xuXHRcdFxuXHRcdC8vZHJhdyB0aGUgc3ByaXRlc1xuXHRcdHRoaXMubWVzaC52ZXJ0aWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLm1lc2guZHJhdyhnbC5UUklBTkdMRVMsIHNwcml0ZUNvdW50ICogNiwgMCwgdGhpcy5pZHgpO1xuXG5cdFx0dGhpcy5pZHggPSAwO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBBZGRzIGEgc3ByaXRlIHRvIHRoaXMgYmF0Y2guXG5cdCAqIFRoZSBzcGVjaWZpY3MgZGVwZW5kIG9uIHRoZSBzcHJpdGUgYmF0Y2ggaW1wbGVtZW50YXRpb24uXG5cdCAqXG5cdCAqIEBtZXRob2QgZHJhd1xuXHQgKiBAcGFyYW0gIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIGZvciB0aGlzIHNwcml0ZVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHggICAgICAgdGhlIHggcG9zaXRpb24sIGRlZmF1bHRzIHRvIHplcm9cblx0ICogQHBhcmFtICB7TnVtYmVyfSB5ICAgICAgIHRoZSB5IHBvc2l0aW9uLCBkZWZhdWx0cyB0byB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICB0aGUgd2lkdGgsIGRlZmF1bHRzIHRvIHRoZSB0ZXh0dXJlIHdpZHRoXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0ICB0aGUgaGVpZ2h0LCBkZWZhdWx0cyB0byB0aGUgdGV4dHVyZSBoZWlnaHRcblx0ICogQHBhcmFtICB7TnVtYmVyfSB1MSAgICAgIHRoZSBmaXJzdCBVIGNvb3JkaW5hdGUsIGRlZmF1bHQgemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHYxICAgICAgdGhlIGZpcnN0IFYgY29vcmRpbmF0ZSwgZGVmYXVsdCB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdTIgICAgICB0aGUgc2Vjb25kIFUgY29vcmRpbmF0ZSwgZGVmYXVsdCBvbmVcblx0ICogQHBhcmFtICB7TnVtYmVyfSB2MiAgICAgIHRoZSBzZWNvbmQgViBjb29yZGluYXRlLCBkZWZhdWx0IG9uZVxuXHQgKi9cblx0ZHJhdzogZnVuY3Rpb24odGV4dHVyZSwgeCwgeSwgd2lkdGgsIGhlaWdodCwgdTEsIHYxLCB1MiwgdjIpIHtcblx0fSxcblxuXHQvKipcblx0ICogQWRkcyBhIHNpbmdsZSBxdWFkIG1lc2ggdG8gdGhpcyBzcHJpdGUgYmF0Y2ggZnJvbSB0aGUgZ2l2ZW5cblx0ICogYXJyYXkgb2YgdmVydGljZXMuXG5cdCAqIFRoZSBzcGVjaWZpY3MgZGVwZW5kIG9uIHRoZSBzcHJpdGUgYmF0Y2ggaW1wbGVtZW50YXRpb24uXG5cdCAqXG5cdCAqIEBtZXRob2QgIGRyYXdWZXJ0aWNlc1xuXHQgKiBAcGFyYW0ge1RleHR1cmV9IHRleHR1cmUgdGhlIHRleHR1cmUgd2UgYXJlIGRyYXdpbmcgZm9yIHRoaXMgc3ByaXRlXG5cdCAqIEBwYXJhbSB7RmxvYXQzMkFycmF5fSB2ZXJ0cyBhbiBhcnJheSBvZiB2ZXJ0aWNlc1xuXHQgKiBAcGFyYW0ge051bWJlcn0gb2ZmIHRoZSBvZmZzZXQgaW50byB0aGUgdmVydGljZXMgYXJyYXkgdG8gcmVhZCBmcm9tXG5cdCAqL1xuXHRkcmF3VmVydGljZXM6IGZ1bmN0aW9uKHRleHR1cmUsIHZlcnRzLCBvZmYpICB7XG5cdH0sXG5cblx0ZHJhd1JlZ2lvbjogZnVuY3Rpb24ocmVnaW9uLCB4LCB5LCB3aWR0aCwgaGVpZ2h0KSB7XG5cdFx0dGhpcy5kcmF3KHJlZ2lvbi50ZXh0dXJlLCB4LCB5LCB3aWR0aCwgaGVpZ2h0LCByZWdpb24udSwgcmVnaW9uLnYsIHJlZ2lvbi51MiwgcmVnaW9uLnYyKTtcblx0fSxcblxuXHQvKipcblx0ICogRGVzdHJveXMgdGhlIGJhdGNoLCBkZWxldGluZyBpdHMgYnVmZmVycyBhbmQgcmVtb3ZpbmcgaXQgZnJvbSB0aGVcblx0ICogV2ViR0xDb250ZXh0IG1hbmFnZW1lbnQuIFRyeWluZyB0byB1c2UgdGhpc1xuXHQgKiBiYXRjaCBhZnRlciBkZXN0cm95aW5nIGl0IGNhbiBsZWFkIHRvIHVucHJlZGljdGFibGUgYmVoYXZpb3VyLlxuXHQgKlxuXHQgKiBJZiBgb3duc1NoYWRlcmAgaXMgdHJ1ZSwgdGhpcyB3aWxsIGFsc28gZGVsZXRlIHRoZSBgZGVmYXVsdFNoYWRlcmAgb2JqZWN0LlxuXHQgKiBcblx0ICogQG1ldGhvZCBkZXN0cm95XG5cdCAqL1xuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnZlcnRpY2VzID0gbnVsbDtcblx0XHR0aGlzLmluZGljZXMgPSBudWxsO1xuXHRcdHRoaXMuc2l6ZSA9IHRoaXMubWF4VmVydGljZXMgPSAwO1xuXG5cdFx0aWYgKHRoaXMub3duc1NoYWRlciAmJiB0aGlzLmRlZmF1bHRTaGFkZXIpXG5cdFx0XHR0aGlzLmRlZmF1bHRTaGFkZXIuZGVzdHJveSgpO1xuXHRcdHRoaXMuZGVmYXVsdFNoYWRlciA9IG51bGw7XG5cdFx0dGhpcy5fc2hhZGVyID0gbnVsbDsgLy8gcmVtb3ZlIHJlZmVyZW5jZSB0byB3aGF0ZXZlciBzaGFkZXIgaXMgY3VycmVudGx5IGJlaW5nIHVzZWRcblxuXHRcdGlmICh0aGlzLm1lc2gpIFxuXHRcdFx0dGhpcy5tZXNoLmRlc3Ryb3koKTtcblx0XHR0aGlzLm1lc2ggPSBudWxsO1xuXHR9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYXNlQmF0Y2g7XG4iLCIvKipcbiAqIEBtb2R1bGUga2FtaS1tZXNoLWJ1ZmZlclxuICovXG5cbnZhciBDbGFzcyA9IHJlcXVpcmUoJ2tsYXNzZScpO1xudmFyIHdyYXBDb250ZXh0ID0gcmVxdWlyZSgna2FtaS11dGlsJykud3JhcENvbnRleHQ7XG5cbi8vVE9ETzogZGVjb3VwbGUgaW50byBWQk8gKyBJQk8gdXRpbGl0aWVzIFxuLyoqXG4gKiBBIG1lc2ggY2xhc3MgdGhhdCB3cmFwcyBWQk8gYW5kIElCTy4gTW9zdGx5IHVzZWQgaW50ZXJuYWxseS5cbiAqXG4gKiBAY2xhc3MgIE1lc2hcbiAqL1xudmFyIE1lc2ggPSBuZXcgQ2xhc3Moe1xuXG5cblx0LyoqXG5cdCAqIEEgd3JpdGUtb25seSBwcm9wZXJ0eSB3aGljaCBzZXRzIGJvdGggdmVydGljZXMgYW5kIGluZGljZXMgXG5cdCAqIGZsYWcgdG8gZGlydHkgb3Igbm90LiBcblx0ICpcblx0ICogQHByb3BlcnR5IGRpcnR5XG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKiBAd3JpdGVPbmx5XG5cdCAqL1xuXHRkaXJ0eToge1xuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSB2YWw7XG5cdFx0XHR0aGlzLmluZGljZXNEaXJ0eSA9IHZhbDtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgTWVzaCB3aXRoIHRoZSBwcm92aWRlZCBwYXJhbWV0ZXJzLlxuXHQgKlxuXHQgKiBJZiBudW1JbmRpY2VzIGlzIDAgb3IgZmFsc3ksIG5vIGluZGV4IGJ1ZmZlciB3aWxsIGJlIHVzZWRcblx0ICogYW5kIGluZGljZXMgd2lsbCBiZSBhbiBlbXB0eSBBcnJheUJ1ZmZlciBhbmQgYSBudWxsIGluZGV4QnVmZmVyLlxuXHQgKiBcblx0ICogSWYgaXNTdGF0aWMgaXMgdHJ1ZSwgdGhlbiB2ZXJ0ZXhVc2FnZSBhbmQgaW5kZXhVc2FnZSB3aWxsXG5cdCAqIGJlIHNldCB0byBnbC5TVEFUSUNfRFJBVy4gT3RoZXJ3aXNlIHRoZXkgd2lsbCB1c2UgZ2wuRFlOQU1JQ19EUkFXLlxuXHQgKiBZb3UgbWF5IHdhbnQgdG8gYWRqdXN0IHRoZXNlIGFmdGVyIGluaXRpYWxpemF0aW9uIGZvciBmdXJ0aGVyIGNvbnRyb2wuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtXZWJHTENvbnRleHR9ICBjb250ZXh0IHRoZSBjb250ZXh0IGZvciBtYW5hZ2VtZW50XG5cdCAqIEBwYXJhbSAge0Jvb2xlYW59IGlzU3RhdGljICAgICAgYSBoaW50IGFzIHRvIHdoZXRoZXIgdGhpcyBnZW9tZXRyeSBpcyBzdGF0aWNcblx0ICogQHBhcmFtICB7W3R5cGVdfSAgbnVtVmVydHMgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gIG51bUluZGljZXMgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19ICB2ZXJ0ZXhBdHRyaWJzIFtkZXNjcmlwdGlvbl1cblx0ICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgICAgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBNZXNoKGNvbnRleHQsIGlzU3RhdGljLCBudW1WZXJ0cywgbnVtSW5kaWNlcywgdmVydGV4QXR0cmlicykge1xuXHRcdGlmICghY29udGV4dCB8fCB0eXBlb2YgY29udGV4dCAhPT0gXCJvYmplY3RcIilcblx0XHRcdHRocm93IFwidmFsaWQgR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkIHRvIG1lc2ggYnVmZmVyXCI7XG5cdFx0aWYgKCFudW1WZXJ0cylcblx0XHRcdHRocm93IFwibnVtVmVydHMgbm90IHNwZWNpZmllZCwgbXVzdCBiZSA+IDBcIjtcblxuXHRcdHRoaXMuY29udGV4dCA9IHdyYXBDb250ZXh0KGNvbnRleHQpO1xuXHRcdHRoaXMuZ2wgPSBjb250ZXh0LmdsO1xuXHRcdFxuXHRcdHRoaXMubnVtVmVydHMgPSBudWxsO1xuXHRcdHRoaXMubnVtSW5kaWNlcyA9IG51bGw7XG5cdFx0XG5cdFx0dGhpcy52ZXJ0aWNlcyA9IG51bGw7XG5cdFx0dGhpcy5pbmRpY2VzID0gbnVsbDtcblx0XHR0aGlzLnZlcnRleEJ1ZmZlciA9IG51bGw7XG5cdFx0dGhpcy5pbmRleEJ1ZmZlciA9IG51bGw7XG5cblx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSB0cnVlO1xuXHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLmluZGV4VXNhZ2UgPSBudWxsO1xuXHRcdHRoaXMudmVydGV4VXNhZ2UgPSBudWxsO1xuXG5cdFx0LyoqIFxuXHRcdCAqIEBwcm9wZXJ0eVxuXHRcdCAqIEBwcml2YXRlXG5cdFx0ICovXG5cdFx0dGhpcy5fdmVydGV4QXR0cmlicyA9IG51bGw7XG5cblx0XHQvKiogXG5cdFx0ICogVGhlIHN0cmlkZSBmb3Igb25lIHZlcnRleCBfaW4gYnl0ZXNfLiBcblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkge051bWJlcn0gdmVydGV4U3RyaWRlXG5cdFx0ICovXG5cdFx0dGhpcy52ZXJ0ZXhTdHJpZGUgPSBudWxsO1xuXG5cdFx0dGhpcy5udW1WZXJ0cyA9IG51bVZlcnRzO1xuXHRcdHRoaXMubnVtSW5kaWNlcyA9IG51bUluZGljZXMgfHwgMDtcblx0XHR0aGlzLnZlcnRleFVzYWdlID0gaXNTdGF0aWMgPyB0aGlzLmdsLlNUQVRJQ19EUkFXIDogdGhpcy5nbC5EWU5BTUlDX0RSQVc7XG5cdFx0dGhpcy5pbmRleFVzYWdlICA9IGlzU3RhdGljID8gdGhpcy5nbC5TVEFUSUNfRFJBVyA6IHRoaXMuZ2wuRFlOQU1JQ19EUkFXO1xuXHRcdHRoaXMuX3ZlcnRleEF0dHJpYnMgPSB2ZXJ0ZXhBdHRyaWJzIHx8IFtdO1xuXHRcdFxuXHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSB0cnVlO1xuXG5cdFx0Ly9kZXRlcm1pbmUgdGhlIHZlcnRleCBzdHJpZGUgYmFzZWQgb24gZ2l2ZW4gYXR0cmlidXRlc1xuXHRcdHZhciB0b3RhbE51bUNvbXBvbmVudHMgPSAwO1xuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLl92ZXJ0ZXhBdHRyaWJzLmxlbmd0aDsgaSsrKVxuXHRcdFx0dG90YWxOdW1Db21wb25lbnRzICs9IHRoaXMuX3ZlcnRleEF0dHJpYnNbaV0ub2Zmc2V0Q291bnQ7XG5cdFx0dGhpcy52ZXJ0ZXhTdHJpZGUgPSB0b3RhbE51bUNvbXBvbmVudHMgKiA0OyAvLyBpbiBieXRlc1xuXG5cdFx0dGhpcy52ZXJ0aWNlcyA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5udW1WZXJ0cyk7XG5cdFx0dGhpcy5pbmRpY2VzID0gbmV3IFVpbnQxNkFycmF5KHRoaXMubnVtSW5kaWNlcyk7XG5cblx0XHQvL2FkZCB0aGlzIFZCTyB0byB0aGUgbWFuYWdlZCBjYWNoZVxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fSxcblxuXHQvL3JlY3JlYXRlcyB0aGUgYnVmZmVycyBvbiBjb250ZXh0IGxvc3Ncblx0Y3JlYXRlOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dGhpcy52ZXJ0ZXhCdWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKTtcblxuXHRcdC8vaWdub3JlIGluZGV4IGJ1ZmZlciBpZiB3ZSBoYXZlbid0IHNwZWNpZmllZCBhbnlcblx0XHR0aGlzLmluZGV4QnVmZmVyID0gdGhpcy5udW1JbmRpY2VzID4gMFxuXHRcdFx0XHRcdD8gZ2wuY3JlYXRlQnVmZmVyKClcblx0XHRcdFx0XHQ6IG51bGw7XG5cblx0XHR0aGlzLmRpcnR5ID0gdHJ1ZTtcblx0fSxcblxuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnZlcnRpY2VzID0gbnVsbDtcblx0XHR0aGlzLmluZGljZXMgPSBudWxsO1xuXHRcdGlmICh0aGlzLnZlcnRleEJ1ZmZlciAmJiB0aGlzLmdsKVxuXHRcdFx0dGhpcy5nbC5kZWxldGVCdWZmZXIodGhpcy52ZXJ0ZXhCdWZmZXIpO1xuXHRcdGlmICh0aGlzLmluZGV4QnVmZmVyICYmIHRoaXMuZ2wpXG5cdFx0XHR0aGlzLmdsLmRlbGV0ZUJ1ZmZlcih0aGlzLmluZGV4QnVmZmVyKTtcblx0XHR0aGlzLnZlcnRleEJ1ZmZlciA9IG51bGw7XG5cdFx0dGhpcy5pbmRleEJ1ZmZlciA9IG51bGw7XG5cdFx0aWYgKHRoaXMuY29udGV4dClcblx0XHRcdHRoaXMuY29udGV4dC5yZW1vdmVNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXHRcdHRoaXMuZ2wgPSBudWxsO1xuXHRcdHRoaXMuY29udGV4dCA9IG51bGw7XG5cdH0sXG5cblx0X3VwZGF0ZUJ1ZmZlcnM6IGZ1bmN0aW9uKGlnbm9yZUJpbmQsIHN1YkRhdGFMZW5ndGgpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0Ly9iaW5kIG91ciBpbmRleCBkYXRhLCBpZiB3ZSBoYXZlIGFueVxuXHRcdGlmICh0aGlzLm51bUluZGljZXMgPiAwKSB7XG5cdFx0XHRpZiAoIWlnbm9yZUJpbmQpXG5cdFx0XHRcdGdsLmJpbmRCdWZmZXIoZ2wuRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRoaXMuaW5kZXhCdWZmZXIpO1xuXG5cdFx0XHQvL3VwZGF0ZSB0aGUgaW5kZXggZGF0YVxuXHRcdFx0aWYgKHRoaXMuaW5kaWNlc0RpcnR5KSB7XG5cdFx0XHRcdGdsLmJ1ZmZlckRhdGEoZ2wuRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRoaXMuaW5kaWNlcywgdGhpcy5pbmRleFVzYWdlKTtcblx0XHRcdFx0dGhpcy5pbmRpY2VzRGlydHkgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvL2JpbmQgb3VyIHZlcnRleCBkYXRhXG5cdFx0aWYgKCFpZ25vcmVCaW5kKVxuXHRcdFx0Z2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHRoaXMudmVydGV4QnVmZmVyKTtcblxuXHRcdC8vdXBkYXRlIG91ciB2ZXJ0ZXggZGF0YVxuXHRcdGlmICh0aGlzLnZlcnRpY2VzRGlydHkpIHtcblx0XHRcdGlmIChzdWJEYXRhTGVuZ3RoKSB7XG5cdFx0XHRcdC8vIFRPRE86IFdoZW4gZGVjb3VwbGluZyBWQk8vSUJPIGJlIHN1cmUgdG8gZ2l2ZSBiZXR0ZXIgc3ViRGF0YSBzdXBwb3J0Li5cblx0XHRcdFx0dmFyIHZpZXcgPSB0aGlzLnZlcnRpY2VzLnN1YmFycmF5KDAsIHN1YkRhdGFMZW5ndGgpO1xuXHRcdFx0XHRnbC5idWZmZXJTdWJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgMCwgdmlldyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRnbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy52ZXJ0aWNlcywgdGhpcy52ZXJ0ZXhVc2FnZSk7XHRcblx0XHRcdH1cblxuXHRcdFx0XG5cdFx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSBmYWxzZTtcblx0XHR9XG5cdH0sXG5cblx0ZHJhdzogZnVuY3Rpb24ocHJpbWl0aXZlVHlwZSwgY291bnQsIG9mZnNldCwgc3ViRGF0YUxlbmd0aCkge1xuXHRcdGlmIChjb3VudCA9PT0gMClcblx0XHRcdHJldHVybjtcblxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0XG5cdFx0b2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cblx0XHQvL2JpbmRzIGFuZCB1cGRhdGVzIG91ciBidWZmZXJzLiBwYXNzIGlnbm9yZUJpbmQgYXMgdHJ1ZVxuXHRcdC8vdG8gYXZvaWQgYmluZGluZyB1bm5lY2Vzc2FyaWx5XG5cdFx0dGhpcy5fdXBkYXRlQnVmZmVycyh0cnVlLCBzdWJEYXRhTGVuZ3RoKTtcblxuXHRcdGlmICh0aGlzLm51bUluZGljZXMgPiAwKSB7IFxuXHRcdFx0Z2wuZHJhd0VsZW1lbnRzKHByaW1pdGl2ZVR5cGUsIGNvdW50LCBcblx0XHRcdFx0XHRcdGdsLlVOU0lHTkVEX1NIT1JULCBvZmZzZXQgKiAyKTsgLy8qIFVpbnQxNkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UXG5cdFx0fSBlbHNlXG5cdFx0XHRnbC5kcmF3QXJyYXlzKHByaW1pdGl2ZVR5cGUsIG9mZnNldCwgY291bnQpO1xuXHR9LFxuXG5cdC8vYmluZHMgdGhpcyBtZXNoJ3MgdmVydGV4IGF0dHJpYnV0ZXMgZm9yIHRoZSBnaXZlbiBzaGFkZXJcblx0YmluZDogZnVuY3Rpb24oc2hhZGVyKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHZhciBvZmZzZXQgPSAwO1xuXHRcdHZhciBzdHJpZGUgPSB0aGlzLnZlcnRleFN0cmlkZTtcblxuXHRcdC8vYmluZCBhbmQgdXBkYXRlIG91ciB2ZXJ0ZXggZGF0YSBiZWZvcmUgYmluZGluZyBhdHRyaWJ1dGVzXG5cdFx0dGhpcy5fdXBkYXRlQnVmZmVycygpO1xuXG5cdFx0Ly9mb3IgZWFjaCBhdHRyaWJ0dWVcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5fdmVydGV4QXR0cmlicy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dmFyIGEgPSB0aGlzLl92ZXJ0ZXhBdHRyaWJzW2ldO1xuXG5cdFx0XHQvL2xvY2F0aW9uIG9mIHRoZSBhdHRyaWJ1dGVcblx0XHRcdHZhciBsb2MgPSBhLmxvY2F0aW9uID09PSBudWxsIFxuXHRcdFx0XHRcdD8gc2hhZGVyLmdldEF0dHJpYnV0ZUxvY2F0aW9uKGEubmFtZSlcblx0XHRcdFx0XHQ6IGEubG9jYXRpb247XG5cblx0XHRcdC8vVE9ETzogV2UgbWF5IHdhbnQgdG8gc2tpcCB1bmZvdW5kIGF0dHJpYnNcblx0XHRcdC8vIGlmIChsb2MhPT0wICYmICFsb2MpXG5cdFx0XHQvLyBcdGNvbnNvbGUud2FybihcIldBUk46XCIsIGEubmFtZSwgXCJpcyBub3QgZW5hYmxlZFwiKTtcblxuXHRcdFx0Ly9maXJzdCwgZW5hYmxlIHRoZSB2ZXJ0ZXggYXJyYXlcblx0XHRcdGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KGxvYyk7XG5cblx0XHRcdC8vdGhlbiBzcGVjaWZ5IG91ciB2ZXJ0ZXggZm9ybWF0XG5cdFx0XHRnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKGxvYywgYS5udW1Db21wb25lbnRzLCBhLnR5cGUgfHwgZ2wuRkxPQVQsIFxuXHRcdFx0XHRcdFx0XHRcdCAgIGEubm9ybWFsaXplLCBzdHJpZGUsIG9mZnNldCk7XG5cblx0XHRcdC8vYW5kIGluY3JlYXNlIHRoZSBvZmZzZXQuLi5cblx0XHRcdG9mZnNldCArPSBhLm9mZnNldENvdW50ICogNDsgLy9pbiBieXRlc1xuXHRcdH1cblx0fSxcblxuXHR1bmJpbmQ6IGZ1bmN0aW9uKHNoYWRlcikge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHQvL2ZvciBlYWNoIGF0dHJpYnR1ZVxuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLl92ZXJ0ZXhBdHRyaWJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgYSA9IHRoaXMuX3ZlcnRleEF0dHJpYnNbaV07XG5cblx0XHRcdC8vbG9jYXRpb24gb2YgdGhlIGF0dHJpYnV0ZVxuXHRcdFx0dmFyIGxvYyA9IGEubG9jYXRpb24gPT09IG51bGwgXG5cdFx0XHRcdFx0PyBzaGFkZXIuZ2V0QXR0cmlidXRlTG9jYXRpb24oYS5uYW1lKVxuXHRcdFx0XHRcdDogYS5sb2NhdGlvbjtcblxuXHRcdFx0Ly9maXJzdCwgZW5hYmxlIHRoZSB2ZXJ0ZXggYXJyYXlcblx0XHRcdGdsLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheShsb2MpO1xuXHRcdH1cblx0fVxufSk7XG5cbk1lc2guQXR0cmliID0gbmV3IENsYXNzKHtcblxuXHRuYW1lOiBudWxsLFxuXHRudW1Db21wb25lbnRzOiBudWxsLFxuXHRsb2NhdGlvbjogbnVsbCxcblx0dHlwZTogbnVsbCxcblxuXHQvKipcblx0ICogTWVzaCB2ZXJ0ZXggYXR0cmlidXRlIGhvbGRlci5cblx0ICogXG5cdCAqIExvY2F0aW9uIGlzIG9wdGlvbmFsIGFuZCBmb3IgYWR2YW5jZWQgdXNlcnMgdGhhdFxuXHQgKiB3YW50IHZlcnRleCBhcnJheXMgdG8gbWF0Y2ggYWNyb3NzIHNoYWRlcnMuIEFueSBub24tbnVtZXJpY2FsXG5cdCAqIHZhbHVlIHdpbGwgYmUgY29udmVydGVkIHRvIG51bGwsIGFuZCBpZ25vcmVkLiBJZiBhIG51bWVyaWNhbFxuXHQgKiB2YWx1ZSBpcyBnaXZlbiwgaXQgd2lsbCBvdmVycmlkZSB0aGUgcG9zaXRpb24gb2YgdGhpcyBhdHRyaWJ1dGVcblx0ICogd2hlbiBnaXZlbiB0byBhIG1lc2guXG5cdCAqXG5cdCAqIEBjbGFzcyAgTWVzaC5BdHRyaWJcblx0ICogQGNvbnN0cnVjdG9yXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIHRoZSBuYW1lIG9mIHRoZSBhdHRyaWJ1dGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IG51bUNvbXBvbmVudHMgdGhlIG51bWJlciBvZiBjb21wb25lbnRzLCBlLmcuIDIgZm9yIHZlYzJcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGxvY2F0aW9uIG9wdGlvbmFsIGF0dHJpYnV0ZSBpbmRleCBsb2NhdGlvblxuXHQgKiBAcGFyYW0ge051bWJlcn0gdHlwZSBkZWZhdWx0cyB0byBHTF9GTE9BVCBcblx0ICogQHBhcmFtIHtOdW1iZXJ9IG5vcm1hbGl6ZSB3aGV0aGVyIHRvIG5vcm1hbGl6ZSB0byAwLTEsIGRlZmF1bHQgZmFsc2Vcblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKG5hbWUsIG51bUNvbXBvbmVudHMsIGxvY2F0aW9uLCB0eXBlLCBub3JtYWxpemUsIG9mZnNldENvdW50KSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLm51bUNvbXBvbmVudHMgPSBudW1Db21wb25lbnRzO1xuXHRcdHRoaXMubG9jYXRpb24gPSB0eXBlb2YgbG9jYXRpb24gPT09IFwibnVtYmVyXCIgPyBsb2NhdGlvbiA6IG51bGw7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHR0aGlzLm5vcm1hbGl6ZSA9IEJvb2xlYW4obm9ybWFsaXplKTtcblx0XHR0aGlzLm9mZnNldENvdW50ID0gdHlwZW9mIG9mZnNldENvdW50ID09PSBcIm51bWJlclwiID8gb2Zmc2V0Q291bnQgOiB0aGlzLm51bUNvbXBvbmVudHM7XG5cdH1cbn0pO1xuXG5cbm1vZHVsZS5leHBvcnRzID0gTWVzaDsiLCIvKipcbiAqIFNoYWRlciB1dGlsaXRpZXMgZm9yIGthbWkuXG4gKiBcbiAqIEBtb2R1bGUga2FtaS1zaGFkZXJcbiAqL1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcbnZhciBjb21waWxlU2hhZGVyID0gcmVxdWlyZSgnd2ViZ2wtY29tcGlsZS1zaGFkZXInKTtcbnZhciB3cmFwQ29udGV4dCA9IHJlcXVpcmUoJ2thbWktdXRpbCcpLndyYXBDb250ZXh0O1xuXG52YXIgU2hhZGVyUHJvZ3JhbSA9IG5ldyBDbGFzcyh7XG5cdFxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBTaGFkZXJQcm9ncmFtIGZyb20gdGhlIGdpdmVuIHNvdXJjZSwgYW5kIGFuIG9wdGlvbmFsIG1hcCBvZiBhdHRyaWJ1dGVcblx0ICogbG9jYXRpb25zIGFzIDxuYW1lLCBpbmRleD4gcGFpcnMuXG5cdCAqXG5cdCAqIF9Ob3RlOl8gQ2hyb21lIHZlcnNpb24gMzEgd2FzIGdpdmluZyBtZSBpc3N1ZXMgd2l0aCBhdHRyaWJ1dGUgbG9jYXRpb25zIC0tIHlvdSBtYXlcblx0ICogd2FudCB0byBvbWl0IHRoaXMgdG8gbGV0IHRoZSBicm93c2VyIHBpY2sgdGhlIGxvY2F0aW9ucyBmb3IgeW91Llx0XG5cdCAqXG5cdCAqIEBjbGFzcyAgU2hhZGVyUHJvZ3JhbVxuXHQgKiBAY29uc3RydWN0b3Jcblx0ICogQHBhcmFtICB7V2ViR0xSZW5kZXJpbmdDb250ZXh0fFdlYkdMQ29udGV4dH0gY29udGV4dCAgICAgIHRoZSBjb250ZXh0IHRvIG1hbmFnZSB0aGlzIG9iamVjdFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IHZlcnRTb3VyY2UgICAgICAgICB0aGUgdmVydGV4IHNoYWRlciBzb3VyY2Vcblx0ICogQHBhcmFtICB7U3RyaW5nfSBmcmFnU291cmNlICAgICAgICAgdGhlIGZyYWdtZW50IHNoYWRlciBzb3VyY2Vcblx0ICogQHBhcmFtICB7T2JqZWN0fSBhdHRyaWJ1dGVMb2NhdGlvbnMgdGhlIGF0dHJpYnV0ZSBsb2NhdGlvbnNcblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFNoYWRlclByb2dyYW0oY29udGV4dCwgdmVydFNvdXJjZSwgZnJhZ1NvdXJjZSwgYXR0cmlidXRlTG9jYXRpb25zKSB7XG5cdFx0aWYgKCF2ZXJ0U291cmNlIHx8ICFmcmFnU291cmNlKVxuXHRcdFx0dGhyb3cgXCJ2ZXJ0ZXggYW5kIGZyYWdtZW50IHNoYWRlcnMgbXVzdCBiZSBkZWZpbmVkXCI7XG5cdFx0aWYgKCFjb250ZXh0IHx8IHR5cGVvZiBjb250ZXh0ICE9PSBcIm9iamVjdFwiKVxuXHRcdFx0dGhyb3cgXCJ2YWxpZCBHTCBjb250ZXh0IG5vdCBzcGVjaWZpZWQgdG8gU2hhZGVyUHJvZ3JhbVwiO1xuXG5cdFx0dGhpcy5jb250ZXh0ID0gd3JhcENvbnRleHQoY29udGV4dCk7XG5cblx0XHR0aGlzLnZlcnRTaGFkZXIgPSBudWxsO1xuXHRcdHRoaXMuZnJhZ1NoYWRlciA9IG51bGw7XG5cdFx0dGhpcy5wcm9ncmFtID0gbnVsbDtcblx0XHR0aGlzLmxvZyA9IFwiXCI7XG5cblx0XHR0aGlzLnVuaWZvcm1DYWNoZSA9IG51bGw7XG5cdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZSA9IG51bGw7XG5cblx0XHR0aGlzLmF0dHJpYnV0ZUxvY2F0aW9ucyA9IGF0dHJpYnV0ZUxvY2F0aW9ucztcblxuXHRcdC8vV2UgdHJpbSBzbyB0aGF0IHRoZSBHTFNMIGxpbmUgbnVtYmVycyBhcmVcblx0XHQvL2FjY3VyYXRlIG9uIHNoYWRlciBsb2dcblx0XHR0aGlzLnZlcnRTb3VyY2UgPSB2ZXJ0U291cmNlLnRyaW0oKTtcblx0XHR0aGlzLmZyYWdTb3VyY2UgPSBmcmFnU291cmNlLnRyaW0oKTtcblxuXHRcdC8vQWRkcyB0aGlzIHNoYWRlciB0byB0aGUgY29udGV4dCwgdG8gYmUgbWFuYWdlZFxuXHRcdC8vVGhpcyBoYXMgbm8gZWZmZWN0IGlmIHRoZSBwYXNzZWQgY29udGV4dCBpcyBub3QgYSBrYW1pLWNvbnRleHQgdHlwZVxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH0sXG5cblx0LyoqIFxuXHQgKiBUaGlzIGlzIGNhbGxlZCBkdXJpbmcgdGhlIFNoYWRlclByb2dyYW0gY29uc3RydWN0b3IsXG5cdCAqIGFuZCBtYXkgbmVlZCB0byBiZSBjYWxsZWQgYWdhaW4gYWZ0ZXIgY29udGV4dCBsb3NzIGFuZCByZXN0b3JlLlxuXHQgKiBcblx0ICogQG1ldGhvZCAgY3JlYXRlXG5cdCAqL1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0dGhpcy5fY29tcGlsZVNoYWRlcnMoKTtcblx0fSxcblxuXHQvL0NvbXBpbGVzIHRoZSBzaGFkZXJzLCB0aHJvd2luZyBhbiBlcnJvciBpZiB0aGUgcHJvZ3JhbSB3YXMgaW52YWxpZC5cblx0X2NvbXBpbGVTaGFkZXJzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsOyBcblx0XHRcblx0XHR2YXIgaW5mbyA9IGNvbXBpbGVTaGFkZXIoe1xuXHRcdFx0Z2w6IGdsLFxuXHRcdFx0dmVydGV4OiB0aGlzLnZlcnRTb3VyY2UsXG5cdFx0XHRmcmFnbWVudDogdGhpcy5mcmFnU291cmNlLFxuXHRcdFx0dmVyYm9zZTogU2hhZGVyUHJvZ3JhbS5WRVJCT1NFX0NPTVBJTEUsXG5cdFx0XHRhdHRyaWJ1dGVMb2NhdGlvbnM6IHRoaXMuYXR0cmlidXRlTG9jYXRpb25zXG5cdFx0fSk7XG5cblx0XHR0aGlzLmxvZyA9IGluZm8ubG9nO1xuXHRcdHRoaXMucHJvZ3JhbSA9IGluZm8ucHJvZ3JhbTtcblxuXHRcdGlmIChTaGFkZXJQcm9ncmFtLlZFUkJPU0VfQ09NUElMRSAmJiB0aGlzLmxvZylcblx0XHRcdGNvbnNvbGUud2Fybih0aGlzLmxvZyk7XG5cblx0XHR0aGlzLl9mZXRjaFVuaWZvcm1zKCk7XG5cdFx0dGhpcy5fZmV0Y2hBdHRyaWJ1dGVzKCk7XG5cdH0sXG5cblx0X2ZldGNoVW5pZm9ybXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLnVuaWZvcm1DYWNoZSA9IHt9O1xuXG5cdFx0dmFyIGxlbiA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIodGhpcy5wcm9ncmFtLCBnbC5BQ1RJVkVfVU5JRk9STVMpO1xuXHRcdGlmICghbGVuKSAvL251bGwgb3IgemVyb1xuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Zm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSB7XG5cdFx0XHR2YXIgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0odGhpcy5wcm9ncmFtLCBpKTtcblx0XHRcdGlmIChpbmZvID09PSBudWxsKSBcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR2YXIgbmFtZSA9IGluZm8ubmFtZTtcblx0XHRcdHZhciBsb2NhdGlvbiA9IGdsLmdldFVuaWZvcm1Mb2NhdGlvbih0aGlzLnByb2dyYW0sIG5hbWUpO1xuXHRcdFx0XG5cdFx0XHR0aGlzLnVuaWZvcm1DYWNoZVtuYW1lXSA9IHtcblx0XHRcdFx0c2l6ZTogaW5mby5zaXplLFxuXHRcdFx0XHR0eXBlOiBpbmZvLnR5cGUsXG5cdFx0XHRcdGxvY2F0aW9uOiBsb2NhdGlvblxuXHRcdFx0fTtcblx0XHR9XG5cdH0sXG5cblx0X2ZldGNoQXR0cmlidXRlczogZnVuY3Rpb24oKSB7IFxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7IFxuXG5cdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZSA9IHt9O1xuXG5cdFx0dmFyIGxlbiA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIodGhpcy5wcm9ncmFtLCBnbC5BQ1RJVkVfQVRUUklCVVRFUyk7XG5cdFx0aWYgKCFsZW4pIC8vbnVsbCBvciB6ZXJvXG5cdFx0XHRyZXR1cm47XHRcblxuXHRcdGZvciAodmFyIGk9MDsgaTxsZW47IGkrKykge1xuXHRcdFx0dmFyIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIodGhpcy5wcm9ncmFtLCBpKTtcblx0XHRcdGlmIChpbmZvID09PSBudWxsKSBcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR2YXIgbmFtZSA9IGluZm8ubmFtZTtcblxuXHRcdFx0Ly90aGUgYXR0cmliIGxvY2F0aW9uIGlzIGEgc2ltcGxlIGluZGV4XG5cdFx0XHR2YXIgbG9jYXRpb24gPSBnbC5nZXRBdHRyaWJMb2NhdGlvbih0aGlzLnByb2dyYW0sIG5hbWUpO1xuXHRcdFx0XG5cdFx0XHR0aGlzLmF0dHJpYnV0ZUNhY2hlW25hbWVdID0ge1xuXHRcdFx0XHRzaXplOiBpbmZvLnNpemUsXG5cdFx0XHRcdHR5cGU6IGluZm8udHlwZSxcblx0XHRcdFx0bG9jYXRpb246IGxvY2F0aW9uXG5cdFx0XHR9O1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogQ2FsbGVkIHRvIGJpbmQgdGhpcyBzaGFkZXIuIE5vdGUgdGhhdCB0aGVyZSBpcyBubyBcInVuYmluZFwiIHNpbmNlXG5cdCAqIHRlY2huaWNhbGx5IHN1Y2ggYSB0aGluZyBpcyBub3QgcG9zc2libGUgaW4gdGhlIHByb2dyYW1tYWJsZSBwaXBlbGluZS5cblx0ICpcblx0ICogWW91IG11c3QgYmluZCBhIHNoYWRlciBiZWZvcmUgc2V0dGluZ3MgaXRzIHVuaWZvcm1zLlxuXHQgKiBcblx0ICogQG1ldGhvZCBiaW5kXG5cdCAqL1xuXHRiaW5kOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsLnVzZVByb2dyYW0odGhpcy5wcm9ncmFtKTtcblx0fSxcblxuXG5cdC8qKlxuXHQgKiBEZXN0cm95cyB0aGlzIHNoYWRlciBhbmQgaXRzIHJlc291cmNlcy4gWW91IHNob3VsZCBub3QgdHJ5IHRvIHVzZSB0aGlzXG5cdCAqIGFmdGVyIGRlc3Ryb3lpbmcgaXQuXG5cdCAqIEBtZXRob2QgIGRlc3Ryb3lcblx0ICovXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmNvbnRleHQpXG5cdFx0XHR0aGlzLmNvbnRleHQucmVtb3ZlTWFuYWdlZE9iamVjdCh0aGlzKTtcblxuXHRcdGlmICh0aGlzLmdsICYmIHRoaXMucHJvZ3JhbSkge1xuXHRcdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRcdGdsLmRlbGV0ZVByb2dyYW0odGhpcy5wcm9ncmFtKTtcblx0XHR9XG5cdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZSA9IG51bGw7XG5cdFx0dGhpcy51bmlmb3JtQ2FjaGUgPSBudWxsO1xuXHRcdHRoaXMudmVydFNoYWRlciA9IG51bGw7XG5cdFx0dGhpcy5mcmFnU2hhZGVyID0gbnVsbDtcblx0XHR0aGlzLnByb2dyYW0gPSBudWxsO1xuXHRcdHRoaXMuZ2wgPSBudWxsO1xuXHRcdHRoaXMuY29udGV4dCA9IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGluZm8gKHNpemUsIHR5cGUsIGxvY2F0aW9uKS5cblx0ICogSWYgdGhlIHVuaWZvcm0gaXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZSwgaXQgaXMgYXNzdW1lZFxuXHQgKiB0byBub3QgZXhpc3QsIGFuZCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqXG5cdCAqIFRoaXMgbWF5IHJldHVybiBudWxsIGV2ZW4gaWYgdGhlIHVuaWZvcm0gaXMgZGVmaW5lZCBpbiBHTFNMOlxuXHQgKiBpZiBpdCBpcyBfaW5hY3RpdmVfIChpLmUuIG5vdCB1c2VkIGluIHRoZSBwcm9ncmFtKSB0aGVuIGl0IG1heVxuXHQgKiBiZSBvcHRpbWl6ZWQgb3V0LlxuXHQgKlxuXHQgKiBAbWV0aG9kICBnZXRVbmlmb3JtSW5mb1xuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7T2JqZWN0fSBhbiBvYmplY3QgY29udGFpbmluZyBsb2NhdGlvbiwgc2l6ZSwgYW5kIHR5cGVcblx0ICovXG5cdGdldFVuaWZvcm1JbmZvOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMudW5pZm9ybUNhY2hlW25hbWVdIHx8IG51bGw7IFxuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgYXR0cmlidXRlIGluZm8gKHNpemUsIHR5cGUsIGxvY2F0aW9uKS5cblx0ICogSWYgdGhlIGF0dHJpYnV0ZSBpcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLCBpdCBpcyBhc3N1bWVkXG5cdCAqIHRvIG5vdCBleGlzdCwgYW5kIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICpcblx0ICogVGhpcyBtYXkgcmV0dXJuIG51bGwgZXZlbiBpZiB0aGUgYXR0cmlidXRlIGlzIGRlZmluZWQgaW4gR0xTTDpcblx0ICogaWYgaXQgaXMgX2luYWN0aXZlXyAoaS5lLiBub3QgdXNlZCBpbiB0aGUgcHJvZ3JhbSBvciBkaXNhYmxlZCkgXG5cdCAqIHRoZW4gaXQgbWF5IGJlIG9wdGltaXplZCBvdXQuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGdldEF0dHJpYnV0ZUluZm9cblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSBhdHRyaWJ1dGUgbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7b2JqZWN0fSBhbiBvYmplY3QgY29udGFpbmluZyBsb2NhdGlvbiwgc2l6ZSBhbmQgdHlwZVxuXHQgKi9cblx0Z2V0QXR0cmlidXRlSW5mbzogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmF0dHJpYnV0ZUNhY2hlW25hbWVdIHx8IG51bGw7IFxuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGxvY2F0aW9uIG9iamVjdC5cblx0ICogSWYgdGhlIHVuaWZvcm0gaXMgbm90IGZvdW5kLCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGdldEF0dHJpYnV0ZUxvY2F0aW9uXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtHTGludH0gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKi9cblx0Z2V0QXR0cmlidXRlTG9jYXRpb246IGZ1bmN0aW9uKG5hbWUpIHsgLy9UT0RPOiBtYWtlIGZhc3RlciwgZG9uJ3QgY2FjaGVcblx0XHR2YXIgaW5mbyA9IHRoaXMuZ2V0QXR0cmlidXRlSW5mbyhuYW1lKTtcblx0XHRyZXR1cm4gaW5mbyA/IGluZm8ubG9jYXRpb24gOiBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBsb2NhdGlvbiBvYmplY3QsIGFzc3VtaW5nIGl0IGV4aXN0c1xuXHQgKiBhbmQgaXMgYWN0aXZlLiBOb3RlIHRoYXQgdW5pZm9ybXMgbWF5IGJlIGluYWN0aXZlIGlmIFxuXHQgKiB0aGUgR0xTTCBjb21waWxlciBkZWVtZWQgdGhlbSB1bnVzZWQuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGdldFVuaWZvcm1Mb2NhdGlvblxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7V2ViR0xVbmlmb3JtTG9jYXRpb259IHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICovXG5cdGdldFVuaWZvcm1Mb2NhdGlvbjogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBpbmZvID0gdGhpcy5nZXRVbmlmb3JtSW5mbyhuYW1lKTtcblx0XHRyZXR1cm4gaW5mbyA/IGluZm8ubG9jYXRpb24gOiBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHVuaWZvcm0gaXMgYWN0aXZlIGFuZCBmb3VuZCBpbiB0aGlzXG5cdCAqIGNvbXBpbGVkIHByb2dyYW0uIE5vdGUgdGhhdCB1bmlmb3JtcyBtYXkgYmUgaW5hY3RpdmUgaWYgXG5cdCAqIHRoZSBHTFNMIGNvbXBpbGVyIGRlZW1lZCB0aGVtIHVudXNlZC5cblx0ICpcblx0ICogQG1ldGhvZCAgaGFzVW5pZm9ybVxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9ICBuYW1lIHRoZSB1bmlmb3JtIG5hbWVcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gdHJ1ZSBpZiB0aGUgdW5pZm9ybSBpcyBmb3VuZCBhbmQgYWN0aXZlXG5cdCAqL1xuXHRoYXNVbmlmb3JtOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VW5pZm9ybUluZm8obmFtZSkgIT09IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgYXR0cmlidXRlIGlzIGFjdGl2ZSBhbmQgZm91bmQgaW4gdGhpc1xuXHQgKiBjb21waWxlZCBwcm9ncmFtLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBoYXNBdHRyaWJ1dGVcblx0ICogQHBhcmFtICB7U3RyaW5nfSAgbmFtZSB0aGUgYXR0cmlidXRlIG5hbWVcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gdHJ1ZSBpZiB0aGUgYXR0cmlidXRlIGlzIGZvdW5kIGFuZCBhY3RpdmVcblx0ICovXG5cdGhhc0F0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdldEF0dHJpYnV0ZUluZm8obmFtZSkgIT09IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHVuaWZvcm0gdmFsdWUgYnkgbmFtZS5cblx0ICpcblx0ICogQG1ldGhvZCAgZ2V0VW5pZm9ybVxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7YW55fSBUaGUgdmFsdWUgb2YgdGhlIFdlYkdMIHVuaWZvcm1cblx0ICovXG5cdGdldFVuaWZvcm06IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nbC5nZXRVbmlmb3JtKHRoaXMucHJvZ3JhbSwgdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSkpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB1bmlmb3JtIHZhbHVlIGF0IHRoZSBzcGVjaWZpZWQgV2ViR0xVbmlmb3JtTG9jYXRpb24uXG5cdCAqXG5cdCAqIEBtZXRob2QgIGdldFVuaWZvcm1BdFxuXHQgKiBAcGFyYW0gIHtXZWJHTFVuaWZvcm1Mb2NhdGlvbn0gbG9jYXRpb24gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKiBAcmV0dXJuIHthbnl9IFRoZSB2YWx1ZSBvZiB0aGUgV2ViR0wgdW5pZm9ybVxuXHQgKi9cblx0Z2V0VW5pZm9ybUF0OiBmdW5jdGlvbihsb2NhdGlvbikge1xuXHRcdHJldHVybiB0aGlzLmdsLmdldFVuaWZvcm0odGhpcy5wcm9ncmFtLCBsb2NhdGlvbik7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEEgY29udmVuaWVuY2UgbWV0aG9kIHRvIHNldCB1bmlmb3JtaSBmcm9tIHRoZSBnaXZlbiBhcmd1bWVudHMuXG5cdCAqIFdlIGRldGVybWluZSB3aGljaCBHTCBjYWxsIHRvIG1ha2UgYmFzZWQgb24gdGhlIG51bWJlciBvZiBhcmd1bWVudHNcblx0ICogcGFzc2VkLiBGb3IgZXhhbXBsZSwgYHNldFVuaWZvcm1pKFwidmFyXCIsIDAsIDEpYCBtYXBzIHRvIGBnbC51bmlmb3JtMmlgLlxuXHQgKiBcblx0ICogQG1ldGhvZCAgc2V0VW5pZm9ybWlcblx0ICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgICAgICAgIFx0XHR0aGUgbmFtZSBvZiB0aGUgdW5pZm9ybVxuXHQgKiBAcGFyYW0ge0dMaW50fSB4ICB0aGUgeCBjb21wb25lbnQgZm9yIGludHNcblx0ICogQHBhcmFtIHtHTGludH0geSAgdGhlIHkgY29tcG9uZW50IGZvciBpdmVjMlxuXHQgKiBAcGFyYW0ge0dMaW50fSB6ICB0aGUgeiBjb21wb25lbnQgZm9yIGl2ZWMzXG5cdCAqIEBwYXJhbSB7R0xpbnR9IHcgIHRoZSB3IGNvbXBvbmVudCBmb3IgaXZlYzRcblx0ICovXG5cdHNldFVuaWZvcm1pOiBmdW5jdGlvbihuYW1lLCB4LCB5LCB6LCB3KSB7XG5cdFx0J3VzZSBzdHJpY3QnO1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dmFyIGxvYyA9IHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpO1xuXHRcdGlmIChsb2MgPT09IG51bGwpXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0c3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG5cdFx0XHRjYXNlIDI6IGdsLnVuaWZvcm0xaShsb2MsIHgpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMzogZ2wudW5pZm9ybTJpKGxvYywgeCwgeSk7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSA0OiBnbC51bmlmb3JtM2kobG9jLCB4LCB5LCB6KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDU6IGdsLnVuaWZvcm00aShsb2MsIHgsIHksIHosIHcpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IFwiaW52YWxpZCBhcmd1bWVudHMgdG8gc2V0VW5pZm9ybWlcIjsgXG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIGNvbnZlbmllbmNlIG1ldGhvZCB0byBzZXQgdW5pZm9ybWYgZnJvbSB0aGUgZ2l2ZW4gYXJndW1lbnRzLlxuXHQgKiBXZSBkZXRlcm1pbmUgd2hpY2ggR0wgY2FsbCB0byBtYWtlIGJhc2VkIG9uIHRoZSBudW1iZXIgb2YgYXJndW1lbnRzXG5cdCAqIHBhc3NlZC4gRm9yIGV4YW1wbGUsIGBzZXRVbmlmb3JtZihcInZhclwiLCAwLCAxKWAgbWFwcyB0byBgZ2wudW5pZm9ybTJmYC5cblx0ICogXG5cdCAqIEBtZXRob2QgIHNldFVuaWZvcm1mXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lICAgICAgICBcdFx0dGhlIG5hbWUgb2YgdGhlIHVuaWZvcm1cblx0ICogQHBhcmFtIHtHTGZsb2F0fSB4ICB0aGUgeCBjb21wb25lbnQgZm9yIGZsb2F0c1xuXHQgKiBAcGFyYW0ge0dMZmxvYXR9IHkgIHRoZSB5IGNvbXBvbmVudCBmb3IgdmVjMlxuXHQgKiBAcGFyYW0ge0dMZmxvYXR9IHogIHRoZSB6IGNvbXBvbmVudCBmb3IgdmVjM1xuXHQgKiBAcGFyYW0ge0dMZmxvYXR9IHcgIHRoZSB3IGNvbXBvbmVudCBmb3IgdmVjNFxuXHQgKi9cblx0c2V0VW5pZm9ybWY6IGZ1bmN0aW9uKG5hbWUsIHgsIHksIHosIHcpIHtcblx0XHQndXNlIHN0cmljdCc7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKGxvYyA9PT0gbnVsbClcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdGNhc2UgMjogZ2wudW5pZm9ybTFmKGxvYywgeCk7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAzOiBnbC51bmlmb3JtMmYobG9jLCB4LCB5KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDQ6IGdsLnVuaWZvcm0zZihsb2MsIHgsIHksIHopOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNTogZ2wudW5pZm9ybTRmKGxvYywgeCwgeSwgeiwgdyk7IHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIGFyZ3VtZW50cyB0byBzZXRVbmlmb3JtZlwiOyBcblx0XHR9XG5cdH0sXG5cblx0Ly9JIGd1ZXNzIHdlIHdvbid0IHN1cHBvcnQgc2VxdWVuY2U8R0xmbG9hdD4gLi4gd2hhdGV2ZXIgdGhhdCBpcyA/P1xuXHRcblxuXHQvLy8vLyBcblx0XG5cdC8qKlxuXHQgKiBBIGNvbnZlbmllbmNlIG1ldGhvZCB0byBzZXQgdW5pZm9ybU5mdiBmcm9tIHRoZSBnaXZlbiBBcnJheUJ1ZmZlci5cblx0ICogV2UgZGV0ZXJtaW5lIHdoaWNoIEdMIGNhbGwgdG8gbWFrZSBiYXNlZCBvbiB0aGUgbGVuZ3RoIG9mIHRoZSBhcnJheSBcblx0ICogYnVmZmVyIChmb3IgMS00IGNvbXBvbmVudCB2ZWN0b3JzIHN0b3JlZCBpbiBhIEZsb2F0MzJBcnJheSkuIFRvIHVzZVxuXHQgKiB0aGlzIG1ldGhvZCB0byB1cGxvYWQgZGF0YSB0byB1bmlmb3JtIGFycmF5cywgeW91IG5lZWQgdG8gc3BlY2lmeSB0aGVcblx0ICogJ2NvdW50JyBwYXJhbWV0ZXI7IGkuZS4gdGhlIGRhdGEgdHlwZSB5b3UgYXJlIHVzaW5nIGZvciB0aGF0IGFycmF5LiBJZlxuXHQgKiBzcGVjaWZpZWQsIHRoaXMgd2lsbCBkaWN0YXRlIHdoZXRoZXIgdG8gY2FsbCB1bmlmb3JtMWZ2LCB1bmlmb3JtMmZ2LCBldGMuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHNldFVuaWZvcm1mdlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAgICAgICAgXHRcdHRoZSBuYW1lIG9mIHRoZSB1bmlmb3JtXG5cdCAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGFycmF5QnVmZmVyIHRoZSBhcnJheSBidWZmZXJcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvdW50ICAgICAgICAgICAgb3B0aW9uYWwsIHRoZSBleHBsaWNpdCBkYXRhIHR5cGUgY291bnQsIGUuZy4gMiBmb3IgdmVjMlxuXHQgKi9cblx0c2V0VW5pZm9ybWZ2OiBmdW5jdGlvbihuYW1lLCBhcnJheUJ1ZmZlciwgY291bnQpIHtcblx0XHQndXNlIHN0cmljdCc7XG5cdFx0Y291bnQgPSBjb3VudCB8fCBhcnJheUJ1ZmZlci5sZW5ndGg7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKGxvYyA9PT0gbnVsbClcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRzd2l0Y2ggKGNvdW50KSB7XG5cdFx0XHRjYXNlIDE6IGdsLnVuaWZvcm0xZnYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAyOiBnbC51bmlmb3JtMmZ2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMzogZ2wudW5pZm9ybTNmdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDQ6IGdsLnVuaWZvcm00ZnYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIGFyZ3VtZW50cyB0byBzZXRVbmlmb3JtZlwiOyBcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIEEgY29udmVuaWVuY2UgbWV0aG9kIHRvIHNldCB1bmlmb3JtTml2IGZyb20gdGhlIGdpdmVuIEFycmF5QnVmZmVyLlxuXHQgKiBXZSBkZXRlcm1pbmUgd2hpY2ggR0wgY2FsbCB0byBtYWtlIGJhc2VkIG9uIHRoZSBsZW5ndGggb2YgdGhlIGFycmF5IFxuXHQgKiBidWZmZXIgKGZvciAxLTQgY29tcG9uZW50IHZlY3RvcnMgc3RvcmVkIGluIGEgaW50IGFycmF5KS4gVG8gdXNlXG5cdCAqIHRoaXMgbWV0aG9kIHRvIHVwbG9hZCBkYXRhIHRvIHVuaWZvcm0gYXJyYXlzLCB5b3UgbmVlZCB0byBzcGVjaWZ5IHRoZVxuXHQgKiAnY291bnQnIHBhcmFtZXRlcjsgaS5lLiB0aGUgZGF0YSB0eXBlIHlvdSBhcmUgdXNpbmcgZm9yIHRoYXQgYXJyYXkuIElmXG5cdCAqIHNwZWNpZmllZCwgdGhpcyB3aWxsIGRpY3RhdGUgd2hldGhlciB0byBjYWxsIHVuaWZvcm0xZnYsIHVuaWZvcm0yZnYsIGV0Yy5cblx0ICpcblx0ICogQG1ldGhvZCAgc2V0VW5pZm9ybWl2XG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lICAgICAgICBcdFx0dGhlIG5hbWUgb2YgdGhlIHVuaWZvcm1cblx0ICogQHBhcmFtIHtBcnJheUJ1ZmZlcn0gYXJyYXlCdWZmZXIgdGhlIGFycmF5IGJ1ZmZlclxuXHQgKiBAcGFyYW0ge051bWJlcn0gY291bnQgICAgICAgICAgICBvcHRpb25hbCwgdGhlIGV4cGxpY2l0IGRhdGEgdHlwZSBjb3VudCwgZS5nLiAyIGZvciBpdmVjMlxuXHQgKi9cblx0c2V0VW5pZm9ybWl2OiBmdW5jdGlvbihuYW1lLCBhcnJheUJ1ZmZlciwgY291bnQpIHtcblx0XHQndXNlIHN0cmljdCc7XG5cdFx0Y291bnQgPSBjb3VudCB8fCBhcnJheUJ1ZmZlci5sZW5ndGg7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKGxvYyA9PT0gbnVsbClcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRzd2l0Y2ggKGNvdW50KSB7XG5cdFx0XHRjYXNlIDE6IGdsLnVuaWZvcm0xaXYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAyOiBnbC51bmlmb3JtMml2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMzogZ2wudW5pZm9ybTNpdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDQ6IGdsLnVuaWZvcm00aXYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIGFyZ3VtZW50cyB0byBzZXRVbmlmb3JtZlwiOyBcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIFRoaXMgaXMgYSBjb252ZW5pZW5jZSBmdW5jdGlvbiB0byBwYXNzIGEgTWF0cml4MyAoZnJvbSB2ZWNtYXRoLFxuXHQgKiBrYW1pJ3MgcHJlZmVycmVkIG1hdGggbGlicmFyeSkgb3IgYSBGbG9hdDMyQXJyYXkgKGUuZy4gZ2wtbWF0cml4KVxuXHQgKiB0byBhIHNoYWRlci4gSWYgbWF0IGlzIGFuIG9iamVjdCB3aXRoIFwidmFsXCIsIGl0IGlzIGNvbnNpZGVyZWQgdG8gYmVcblx0ICogYSBNYXRyaXgzLCBvdGhlcndpc2UgYXNzdW1lZCB0byBiZSBhIHR5cGVkIGFycmF5IGJlaW5nIHBhc3NlZCBkaXJlY3RseVxuXHQgKiB0byB0aGUgc2hhZGVyLlxuXHQgKiBcblx0ICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZVxuXHQgKiBAcGFyYW0ge01hdHJpeDN8RmxvYXQzMkFycmF5fSBtYXQgYSBNYXRyaXgzIG9yIEZsb2F0MzJBcnJheVxuXHQgKiBAcGFyYW0ge0Jvb2xlYW59IHRyYW5zcG9zZSB3aGV0aGVyIHRvIHRyYW5zcG9zZSB0aGUgbWF0cml4LCBkZWZhdWx0IGZhbHNlXG5cdCAqL1xuXHRzZXRVbmlmb3JtTWF0cml4MzogZnVuY3Rpb24obmFtZSwgbWF0LCB0cmFuc3Bvc2UpIHtcblx0XHQndXNlIHN0cmljdCc7XG5cdFx0dmFyIGFyciA9IHR5cGVvZiBtYXQgPT09IFwib2JqZWN0XCIgJiYgbWF0LnZhbCA/IG1hdC52YWwgOiBtYXQ7XG5cdFx0dHJhbnNwb3NlID0gISF0cmFuc3Bvc2U7IC8vdG8gYm9vbGVhblxuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKGxvYyA9PT0gbnVsbClcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRnbC51bmlmb3JtTWF0cml4M2Z2KGxvYywgdHJhbnNwb3NlLCBhcnIpXG5cdH0sXG5cblx0LyoqXG5cdCAqIFRoaXMgaXMgYSBjb252ZW5pZW5jZSBmdW5jdGlvbiB0byBwYXNzIGEgTWF0cml4NCAoZnJvbSB2ZWNtYXRoLFxuXHQgKiBrYW1pJ3MgcHJlZmVycmVkIG1hdGggbGlicmFyeSkgb3IgYSBGbG9hdDMyQXJyYXkgKGUuZy4gZ2wtbWF0cml4KVxuXHQgKiB0byBhIHNoYWRlci4gSWYgbWF0IGlzIGFuIG9iamVjdCB3aXRoIFwidmFsXCIsIGl0IGlzIGNvbnNpZGVyZWQgdG8gYmVcblx0ICogYSBNYXRyaXg0LCBvdGhlcndpc2UgYXNzdW1lZCB0byBiZSBhIHR5cGVkIGFycmF5IGJlaW5nIHBhc3NlZCBkaXJlY3RseVxuXHQgKiB0byB0aGUgc2hhZGVyLlxuXHQgKiBcblx0ICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZVxuXHQgKiBAcGFyYW0ge01hdHJpeDR8RmxvYXQzMkFycmF5fSBtYXQgYSBNYXRyaXg0IG9yIEZsb2F0MzJBcnJheVxuXHQgKiBAcGFyYW0ge0Jvb2xlYW59IHRyYW5zcG9zZSB3aGV0aGVyIHRvIHRyYW5zcG9zZSB0aGUgbWF0cml4LCBkZWZhdWx0IGZhbHNlXG5cdCAqL1xuXHRzZXRVbmlmb3JtTWF0cml4NDogZnVuY3Rpb24obmFtZSwgbWF0LCB0cmFuc3Bvc2UpIHtcblx0XHQndXNlIHN0cmljdCc7XG5cdFx0dmFyIGFyciA9IHR5cGVvZiBtYXQgPT09IFwib2JqZWN0XCIgJiYgbWF0LnZhbCA/IG1hdC52YWwgOiBtYXQ7XG5cdFx0dHJhbnNwb3NlID0gISF0cmFuc3Bvc2U7IC8vdG8gYm9vbGVhblxuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKGxvYyA9PT0gbnVsbClcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRnbC51bmlmb3JtTWF0cml4NGZ2KGxvYywgdHJhbnNwb3NlLCBhcnIpXG5cdH0gXG4gXG59KTtcblxuLy9Tb21lIGRlZmF1bHQgYXR0cmlidXRlIG5hbWVzIHRoYXQgcGFydHMgb2Yga2FtaSB3aWxsIHVzZVxuLy93aGVuIGNyZWF0aW5nIGEgc3RhbmRhcmQgc2hhZGVyLlxuU2hhZGVyUHJvZ3JhbS5QT1NJVElPTl9BVFRSSUJVVEUgPSBcIlBvc2l0aW9uXCI7XG5TaGFkZXJQcm9ncmFtLk5PUk1BTF9BVFRSSUJVVEUgPSBcIk5vcm1hbFwiO1xuU2hhZGVyUHJvZ3JhbS5DT0xPUl9BVFRSSUJVVEUgPSBcIkNvbG9yXCI7XG5TaGFkZXJQcm9ncmFtLlRFWENPT1JEX0FUVFJJQlVURSA9IFwiVGV4Q29vcmRcIjtcblxuLyoqXG4gKiBXaGV0aGVyIHRvIGluY2x1ZGUgdmVyYm9zZSB3YXJuaW5ncyBkdXJpbmcgc2hhZGVyIGNvbXBpbGF0aW9uLlxuICogVGhpcyBpbmNsdWRlczpcbiAqXG4gKiAgIC0gUHJpbnRpbmcgZnVsbCBzaGFkZXJzICh3aXRoIGxpbmUgbnVtYmVycykgd2hlbiB0aGVyZSBpcyBhbiBlcnJvclxuICogICAtIFByaW50aW5nIHdhcm5pbmdzIGV2ZW4gaWYgdGhlIHNoYWRlciBjb21waWxlZCBzdWNjZXNzZnVsbHkgXG4gKiAgIFxuICogQHByb3BlcnR5IHtCb29sZWFufSBWRVJCT1NFX0NPTVBJTEVcbiAqL1xuU2hhZGVyUHJvZ3JhbS5WRVJCT1NFX0NPTVBJTEUgPSB0cnVlO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNoYWRlclByb2dyYW07IiwiZnVuY3Rpb24gaGFzR2V0dGVyT3JTZXR0ZXIoZGVmKSB7XG5cdHJldHVybiAoISFkZWYuZ2V0ICYmIHR5cGVvZiBkZWYuZ2V0ID09PSBcImZ1bmN0aW9uXCIpIHx8ICghIWRlZi5zZXQgJiYgdHlwZW9mIGRlZi5zZXQgPT09IFwiZnVuY3Rpb25cIik7XG59XG5cbmZ1bmN0aW9uIGdldFByb3BlcnR5KGRlZmluaXRpb24sIGssIGlzQ2xhc3NEZXNjcmlwdG9yKSB7XG5cdC8vVGhpcyBtYXkgYmUgYSBsaWdodHdlaWdodCBvYmplY3QsIE9SIGl0IG1pZ2h0IGJlIGEgcHJvcGVydHlcblx0Ly90aGF0IHdhcyBkZWZpbmVkIHByZXZpb3VzbHkuXG5cdFxuXHQvL0ZvciBzaW1wbGUgY2xhc3MgZGVzY3JpcHRvcnMgd2UgY2FuIGp1c3QgYXNzdW1lIGl0cyBOT1QgcHJldmlvdXNseSBkZWZpbmVkLlxuXHR2YXIgZGVmID0gaXNDbGFzc0Rlc2NyaXB0b3IgXG5cdFx0XHRcdD8gZGVmaW5pdGlvbltrXSBcblx0XHRcdFx0OiBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGRlZmluaXRpb24sIGspO1xuXG5cdGlmICghaXNDbGFzc0Rlc2NyaXB0b3IgJiYgZGVmLnZhbHVlICYmIHR5cGVvZiBkZWYudmFsdWUgPT09IFwib2JqZWN0XCIpIHtcblx0XHRkZWYgPSBkZWYudmFsdWU7XG5cdH1cblxuXG5cdC8vVGhpcyBtaWdodCBiZSBhIHJlZ3VsYXIgcHJvcGVydHksIG9yIGl0IG1heSBiZSBhIGdldHRlci9zZXR0ZXIgdGhlIHVzZXIgZGVmaW5lZCBpbiBhIGNsYXNzLlxuXHRpZiAoIGRlZiAmJiBoYXNHZXR0ZXJPclNldHRlcihkZWYpICkge1xuXHRcdGlmICh0eXBlb2YgZGVmLmVudW1lcmFibGUgPT09IFwidW5kZWZpbmVkXCIpXG5cdFx0XHRkZWYuZW51bWVyYWJsZSA9IHRydWU7XG5cdFx0aWYgKHR5cGVvZiBkZWYuY29uZmlndXJhYmxlID09PSBcInVuZGVmaW5lZFwiKVxuXHRcdFx0ZGVmLmNvbmZpZ3VyYWJsZSA9IHRydWU7XG5cdFx0cmV0dXJuIGRlZjtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gaGFzTm9uQ29uZmlndXJhYmxlKG9iaiwgaykge1xuXHR2YXIgcHJvcCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3Iob2JqLCBrKTtcblx0aWYgKCFwcm9wKVxuXHRcdHJldHVybiBmYWxzZTtcblxuXHRpZiAocHJvcC52YWx1ZSAmJiB0eXBlb2YgcHJvcC52YWx1ZSA9PT0gXCJvYmplY3RcIilcblx0XHRwcm9wID0gcHJvcC52YWx1ZTtcblxuXHRpZiAocHJvcC5jb25maWd1cmFibGUgPT09IGZhbHNlKSBcblx0XHRyZXR1cm4gdHJ1ZTtcblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8vVE9ETzogT24gY3JlYXRlLCBcbi8vXHRcdE9uIG1peGluLCBcblxuZnVuY3Rpb24gZXh0ZW5kKGN0b3IsIGRlZmluaXRpb24sIGlzQ2xhc3NEZXNjcmlwdG9yLCBleHRlbmQpIHtcblx0Zm9yICh2YXIgayBpbiBkZWZpbml0aW9uKSB7XG5cdFx0aWYgKCFkZWZpbml0aW9uLmhhc093blByb3BlcnR5KGspKVxuXHRcdFx0Y29udGludWU7XG5cblx0XHR2YXIgZGVmID0gZ2V0UHJvcGVydHkoZGVmaW5pdGlvbiwgaywgaXNDbGFzc0Rlc2NyaXB0b3IpO1xuXG5cdFx0aWYgKGRlZiAhPT0gZmFsc2UpIHtcblx0XHRcdC8vSWYgRXh0ZW5kcyBpcyB1c2VkLCB3ZSB3aWxsIGNoZWNrIGl0cyBwcm90b3R5cGUgdG8gc2VlIGlmIFxuXHRcdFx0Ly90aGUgZmluYWwgdmFyaWFibGUgZXhpc3RzLlxuXHRcdFx0XG5cdFx0XHR2YXIgcGFyZW50ID0gZXh0ZW5kIHx8IGN0b3I7XG5cdFx0XHRpZiAoaGFzTm9uQ29uZmlndXJhYmxlKHBhcmVudC5wcm90b3R5cGUsIGspKSB7XG5cblx0XHRcdFx0Ly9qdXN0IHNraXAgdGhlIGZpbmFsIHByb3BlcnR5XG5cdFx0XHRcdGlmIChDbGFzcy5pZ25vcmVGaW5hbHMpXG5cdFx0XHRcdFx0Y29udGludWU7XG5cblx0XHRcdFx0Ly9XZSBjYW5ub3QgcmUtZGVmaW5lIGEgcHJvcGVydHkgdGhhdCBpcyBjb25maWd1cmFibGU9ZmFsc2UuXG5cdFx0XHRcdC8vU28gd2Ugd2lsbCBjb25zaWRlciB0aGVtIGZpbmFsIGFuZCB0aHJvdyBhbiBlcnJvci4gVGhpcyBpcyBieVxuXHRcdFx0XHQvL2RlZmF1bHQgc28gaXQgaXMgY2xlYXIgdG8gdGhlIGRldmVsb3BlciB3aGF0IGlzIGhhcHBlbmluZy5cblx0XHRcdFx0Ly9Zb3UgY2FuIHNldCBpZ25vcmVGaW5hbHMgdG8gdHJ1ZSBpZiB5b3UgbmVlZCB0byBleHRlbmQgYSBjbGFzc1xuXHRcdFx0XHQvL3doaWNoIGhhcyBjb25maWd1cmFibGU9ZmFsc2U7IGl0IHdpbGwgc2ltcGx5IG5vdCByZS1kZWZpbmUgZmluYWwgcHJvcGVydGllcy5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiY2Fubm90IG92ZXJyaWRlIGZpbmFsIHByb3BlcnR5ICdcIitrXG5cdFx0XHRcdFx0XHRcdCtcIicsIHNldCBDbGFzcy5pZ25vcmVGaW5hbHMgPSB0cnVlIHRvIHNraXBcIik7XG5cdFx0XHR9XG5cblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjdG9yLnByb3RvdHlwZSwgaywgZGVmKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3Rvci5wcm90b3R5cGVba10gPSBkZWZpbml0aW9uW2tdO1xuXHRcdH1cblxuXHR9XG59XG5cbi8qKlxuICovXG5mdW5jdGlvbiBtaXhpbihteUNsYXNzLCBtaXhpbnMpIHtcblx0aWYgKCFtaXhpbnMpXG5cdFx0cmV0dXJuO1xuXG5cdGlmICghQXJyYXkuaXNBcnJheShtaXhpbnMpKVxuXHRcdG1peGlucyA9IFttaXhpbnNdO1xuXG5cdGZvciAodmFyIGk9MDsgaTxtaXhpbnMubGVuZ3RoOyBpKyspIHtcblx0XHRleHRlbmQobXlDbGFzcywgbWl4aW5zW2ldLnByb3RvdHlwZSB8fCBtaXhpbnNbaV0pO1xuXHR9XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBjbGFzcyB3aXRoIHRoZSBnaXZlbiBkZXNjcmlwdG9yLlxuICogVGhlIGNvbnN0cnVjdG9yLCBkZWZpbmVkIGJ5IHRoZSBuYW1lIGBpbml0aWFsaXplYCxcbiAqIGlzIGFuIG9wdGlvbmFsIGZ1bmN0aW9uLiBJZiB1bnNwZWNpZmllZCwgYW4gYW5vbnltb3VzXG4gKiBmdW5jdGlvbiB3aWxsIGJlIHVzZWQgd2hpY2ggY2FsbHMgdGhlIHBhcmVudCBjbGFzcyAoaWZcbiAqIG9uZSBleGlzdHMpLiBcbiAqXG4gKiBZb3UgY2FuIGFsc28gdXNlIGBFeHRlbmRzYCBhbmQgYE1peGluc2AgdG8gcHJvdmlkZSBzdWJjbGFzc2luZ1xuICogYW5kIGluaGVyaXRhbmNlLlxuICpcbiAqIEBjbGFzcyAgQ2xhc3NcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtPYmplY3R9IGRlZmluaXRpb24gYSBkaWN0aW9uYXJ5IG9mIGZ1bmN0aW9ucyBmb3IgdGhlIGNsYXNzXG4gKiBAZXhhbXBsZVxuICpcbiAqIFx0XHR2YXIgTXlDbGFzcyA9IG5ldyBDbGFzcyh7XG4gKiBcdFx0XG4gKiBcdFx0XHRpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcbiAqIFx0XHRcdFx0dGhpcy5mb28gPSAyLjA7XG4gKiBcdFx0XHR9LFxuICpcbiAqIFx0XHRcdGJhcjogZnVuY3Rpb24oKSB7XG4gKiBcdFx0XHRcdHJldHVybiB0aGlzLmZvbyArIDU7XG4gKiBcdFx0XHR9XG4gKiBcdFx0fSk7XG4gKi9cbmZ1bmN0aW9uIENsYXNzKGRlZmluaXRpb24pIHtcblx0aWYgKCFkZWZpbml0aW9uKVxuXHRcdGRlZmluaXRpb24gPSB7fTtcblxuXHQvL1RoZSB2YXJpYWJsZSBuYW1lIGhlcmUgZGljdGF0ZXMgd2hhdCB3ZSBzZWUgaW4gQ2hyb21lIGRlYnVnZ2VyXG5cdHZhciBpbml0aWFsaXplO1xuXHR2YXIgRXh0ZW5kcztcblxuXHRpZiAoZGVmaW5pdGlvbi5pbml0aWFsaXplKSB7XG5cdFx0aWYgKHR5cGVvZiBkZWZpbml0aW9uLmluaXRpYWxpemUgIT09IFwiZnVuY3Rpb25cIilcblx0XHRcdHRocm93IG5ldyBFcnJvcihcImluaXRpYWxpemUgbXVzdCBiZSBhIGZ1bmN0aW9uXCIpO1xuXHRcdGluaXRpYWxpemUgPSBkZWZpbml0aW9uLmluaXRpYWxpemU7XG5cblx0XHQvL1VzdWFsbHkgd2Ugc2hvdWxkIGF2b2lkIFwiZGVsZXRlXCIgaW4gVjggYXQgYWxsIGNvc3RzLlxuXHRcdC8vSG93ZXZlciwgaXRzIHVubGlrZWx5IHRvIG1ha2UgYW55IHBlcmZvcm1hbmNlIGRpZmZlcmVuY2Vcblx0XHQvL2hlcmUgc2luY2Ugd2Ugb25seSBjYWxsIHRoaXMgb24gY2xhc3MgY3JlYXRpb24gKGkuZS4gbm90IG9iamVjdCBjcmVhdGlvbikuXG5cdFx0ZGVsZXRlIGRlZmluaXRpb24uaW5pdGlhbGl6ZTtcblx0fSBlbHNlIHtcblx0XHRpZiAoZGVmaW5pdGlvbi5FeHRlbmRzKSB7XG5cdFx0XHR2YXIgYmFzZSA9IGRlZmluaXRpb24uRXh0ZW5kcztcblx0XHRcdGluaXRpYWxpemUgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGJhc2UuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRcdH07IFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbml0aWFsaXplID0gZnVuY3Rpb24gKCkge307IFxuXHRcdH1cblx0fVxuXG5cdGlmIChkZWZpbml0aW9uLkV4dGVuZHMpIHtcblx0XHRpbml0aWFsaXplLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoZGVmaW5pdGlvbi5FeHRlbmRzLnByb3RvdHlwZSk7XG5cdFx0aW5pdGlhbGl6ZS5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBpbml0aWFsaXplO1xuXHRcdC8vZm9yIGdldE93blByb3BlcnR5RGVzY3JpcHRvciB0byB3b3JrLCB3ZSBuZWVkIHRvIGFjdFxuXHRcdC8vZGlyZWN0bHkgb24gdGhlIEV4dGVuZHMgKG9yIE1peGluKVxuXHRcdEV4dGVuZHMgPSBkZWZpbml0aW9uLkV4dGVuZHM7XG5cdFx0ZGVsZXRlIGRlZmluaXRpb24uRXh0ZW5kcztcblx0fSBlbHNlIHtcblx0XHRpbml0aWFsaXplLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGluaXRpYWxpemU7XG5cdH1cblxuXHQvL0dyYWIgdGhlIG1peGlucywgaWYgdGhleSBhcmUgc3BlY2lmaWVkLi4uXG5cdHZhciBtaXhpbnMgPSBudWxsO1xuXHRpZiAoZGVmaW5pdGlvbi5NaXhpbnMpIHtcblx0XHRtaXhpbnMgPSBkZWZpbml0aW9uLk1peGlucztcblx0XHRkZWxldGUgZGVmaW5pdGlvbi5NaXhpbnM7XG5cdH1cblxuXHQvL0ZpcnN0LCBtaXhpbiBpZiB3ZSBjYW4uXG5cdG1peGluKGluaXRpYWxpemUsIG1peGlucyk7XG5cblx0Ly9Ob3cgd2UgZ3JhYiB0aGUgYWN0dWFsIGRlZmluaXRpb24gd2hpY2ggZGVmaW5lcyB0aGUgb3ZlcnJpZGVzLlxuXHRleHRlbmQoaW5pdGlhbGl6ZSwgZGVmaW5pdGlvbiwgdHJ1ZSwgRXh0ZW5kcyk7XG5cblx0cmV0dXJuIGluaXRpYWxpemU7XG59O1xuXG5DbGFzcy5leHRlbmQgPSBleHRlbmQ7XG5DbGFzcy5taXhpbiA9IG1peGluO1xuQ2xhc3MuaWdub3JlRmluYWxzID0gZmFsc2U7XG5cbm1vZHVsZS5leHBvcnRzID0gQ2xhc3M7IiwiLy9jb3VsZCBiZSBwdWxsZWQgb3V0IHRvIHdlYmdsLWNvbnRleHRcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0cykge1xuICAgIG9wdHMgPSBvcHRzfHx7fTtcbiAgICB2YXIgY2FudmFzID0gb3B0cy5jYW52YXMgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcbiAgICB2YXIgYXR0cmlicyA9IG9wdHMuYXR0cmlicyB8fCB7fTtcbiAgICB0cnkge1xuICAgICAgICBnbCA9IChjYW52YXMuZ2V0Q29udGV4dCgnd2ViZ2wnLCBhdHRyaWJzKSB8fCBjYW52YXMuZ2V0Q29udGV4dCgnZXhwZXJpbWVudGFsLXdlYmdsJywgYXR0cmlicykpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgZ2wgPSBudWxsO1xuICAgIH0gICBcbiAgICBpZiAoIWdsKSB7XG4gICAgICAgIHRocm93IFwiV2ViR0wgQ29udGV4dCBOb3QgU3VwcG9ydGVkIC0tIHRyeSBlbmFibGluZyBpdCBvciB1c2luZyBhIGRpZmZlcmVudCBicm93c2VyXCI7XG4gICAgfVxuICAgIHJldHVybiBnbDtcbn07IiwidmFyIGdldEdMID0gcmVxdWlyZSgnLi9nZXRHTCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICBpZiAoIW9wdHMgfHwgKCFvcHRzLnZlcnRleCB8fCAhb3B0cy5mcmFnbWVudCkpXG4gICAgICAgIHRocm93IFwibXVzdCBzcGVjaWZ5IHZlcnRleCBhbmQgZnJhZ21lbnQgc291cmNlXCI7XG4gICAgdmFyIHZlcnRTb3VyY2UgPSAob3B0cy52ZXJ0ZXgpLnRyaW0oKTtcbiAgICB2YXIgZnJhZ1NvdXJjZSA9IChvcHRzLmZyYWdtZW50KS50cmltKCk7XG5cblxuICAgIHZhciBnbCA9IG9wdHMuZ2w7XG4gICAgaWYgKCFnbCkge1xuICAgICAgICBnbCA9IGdldEdMKG9wdHMpO1xuICAgIH1cbiAgICByZXR1cm4gY29tcGlsZShnbCwgdmVydFNvdXJjZSwgZnJhZ1NvdXJjZSk7XG59O1xuXG4vL0NvbXBpbGVzIHRoZSBzaGFkZXJzLCB0aHJvd2luZyBhbiBlcnJvciBpZiB0aGUgcHJvZ3JhbSB3YXMgaW52YWxpZC5cbmZ1bmN0aW9uIGNvbXBpbGUoZ2wsIHZlcnRTb3VyY2UsIGZyYWdTb3VyY2UpIHtcbiAgICB2YXIgbG9nID0gXCJcIjtcblxuICAgIHZhciB2ZXJ0ID0gbG9hZFNoYWRlcihnbCwgZ2wuVkVSVEVYX1NIQURFUiwgdmVydFNvdXJjZSk7XG4gICAgdmFyIGZyYWcgPSBsb2FkU2hhZGVyKGdsLCBnbC5GUkFHTUVOVF9TSEFERVIsIGZyYWdTb3VyY2UpO1xuXG4gICAgdmFyIHZlcnRTaGFkZXIgPSB2ZXJ0LnNoYWRlcjtcbiAgICB2YXIgZnJhZ1NoYWRlciA9IGZyYWcuc2hhZGVyO1xuXG4gICAgbG9nICs9IHZlcnQubG9nICsgXCJcXG5cIiArIGZyYWcubG9nO1xuXG4gICAgdmFyIHByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKCk7XG5cbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydFNoYWRlcik7XG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdTaGFkZXIpO1xuXG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSk7IFxuXG4gICAgbG9nICs9IGdsLmdldFByb2dyYW1JbmZvTG9nKHByb2dyYW0pIHx8IFwiXCI7XG4gICAgXG4gICAgZ2wuZGV0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpO1xuICAgIGdsLmRldGFjaFNoYWRlcihwcm9ncmFtLCBmcmFnU2hhZGVyKTtcbiAgICBnbC5kZWxldGVTaGFkZXIodmVydFNoYWRlcik7XG4gICAgZ2wuZGVsZXRlU2hhZGVyKGZyYWdTaGFkZXIpO1xuXG4gICAgaWYgKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBsaW5raW5nIHRoZSBzaGFkZXIgcHJvZ3JhbTpcXG5cIiArIGxvZytcIlxcblZFUlRFWF9TSEFERVI6XFxuXCJcbiAgICAgICAgICAgICAgICArYWRkTGluZU51bWJlcnModmVydFNvdXJjZSkgK1wiXFxuXFxuRlJBR01FTlRfU0hBREVSOlxcblwiXG4gICAgICAgICAgICAgICAgK2FkZExpbmVOdW1iZXJzKGZyYWdTb3VyY2UpKTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcHJvZ3JhbTogcHJvZ3JhbSxcbiAgICAgICAgbG9nOiBsb2cudHJpbSgpXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gbG9hZFNoYWRlcihnbCwgdHlwZSwgc291cmNlKSB7XG4gICAgdmFyIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKTtcbiAgICBpZiAoIXNoYWRlcikgLy9zaG91bGQgbm90IG9jY3VyLi4uXG4gICAgICAgIHJldHVybiAtMTtcblxuICAgIGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSk7XG4gICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpO1xuXG4gICAgLy93ZSBkbyB0aGlzIHNvIHRoZSB1c2VyIGtub3dzIHdoaWNoIHNoYWRlciBoYXMgdGhlIGVycm9yXG4gICAgdmFyIHR5cGVTdHIgPSAodHlwZSA9PT0gZ2wuVkVSVEVYX1NIQURFUikgPyBcInZlcnRleFwiIDogXCJmcmFnbWVudFwiO1xuXG4gICAgdmFyIGxvZ1Jlc3VsdCA9IGdsLmdldFNoYWRlckluZm9Mb2coc2hhZGVyKSB8fCBcIlwiO1xuICAgIGlmIChsb2dSZXN1bHQpIHtcbiAgICAgICAgbG9nUmVzdWx0ID0gXCJFcnJvciBjb21waWxpbmcgXCIrIHR5cGVTdHIrIFwiIHNoYWRlcjpcXG5cIitsb2dSZXN1bHQrXCJcXG5cIithZGRMaW5lTnVtYmVycyhzb3VyY2UpO1xuICAgIH1cblxuICAgIGlmICghZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKHNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpICkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobG9nUmVzdWx0KTtcbiAgICB9XG4gICAgaWYgKCFzaGFkZXIpXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImdsLmNyZWF0ZVNoYWRlciByZXR1cm5lZCAwIGZvciBcIit0eXBlU3RyK1wiIHNoYWRlci5cXG5cIitsb2dSZXN1bHQpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHNoYWRlcjogc2hhZGVyLFxuICAgICAgICBsb2c6IGxvZ1Jlc3VsdFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGFkZExpbmVOdW1iZXJzKCBzdHJpbmcgKSB7XG4gICAgdmFyIGxpbmVzID0gc3RyaW5nLnNwbGl0KCAnXFxuJyApO1xuICAgIGZvciAoIHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSArKyApIHtcbiAgICAgICAgbGluZXNbIGkgXSA9ICggaSArIDEgKSArICc6ICcgKyBsaW5lc1sgaSBdO1xuICAgIH1cbiAgICByZXR1cm4gbGluZXMuam9pbiggJ1xcbicgKTtcbn0iLCIvKipcbiAqIENyZWF0ZXMgYSBXZWJHTCBjb250ZXh0IHdoaWNoIGF0dGVtcHRzIHRvIG1hbmFnZSB0aGUgXG4gKiBzdGF0ZSBvZiBrYW1pIG9iamVjdHMgdGhhdCBhcmUgY3JlYXRlZCB3aXRoIHRoaXMgYXMgYSBcbiAqIHBhcmFtZXRlci4gXG4gKiBcbiAqIEBtb2R1bGUga2FtaS1jb250ZXh0XG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgU2lnbmFsID0gcmVxdWlyZSgnc2lnbmFscycpO1xudmFyIGdldENvbnRleHQgPSByZXF1aXJlKCd3ZWJnbC1jb250ZXh0Jyk7XG5cbi8qKlxuICogQSB0aGluIHdyYXBwZXIgYXJvdW5kIFdlYkdMUmVuZGVyaW5nQ29udGV4dCB3aGljaCBoYW5kbGVzXG4gKiBjb250ZXh0IGxvc3MgYW5kIHJlc3RvcmUgd2l0aCB2YXJpb3VzIHJlbmRlcmluZyBvYmplY3RzICh0ZXh0dXJlcyxcbiAqIHNoYWRlcnMgYW5kIGJ1ZmZlcnMpLiBUaGlzIGFsc28gaGFuZGxlcyBnZW5lcmFsIHZpZXdwb3J0IG1hbmFnZW1lbnQuXG4gKlxuICogSWYgdGhlIGBjYW52YXNgIG9wdGlvbiBpc24ndCBzcGVjaWZpZWQsIGEgbmV3IGNhbnZhcyB3aWxsIGJlIGNyZWF0ZWQuXG4gKlxuICogSWYgYGdsYCBpcyBzcGVjaWZpZWQgYW5kIGlzIGFuIGluc3RhbmNlIG9mIFdlYkdMUmVuZGVyaW5nQ29udGV4dCwgdGhlIGBjYW52YXNgIFxuICogYW5kIGBhdHRyaWJ1dGVzYCBvcHRpb25zIHdpbGwgYmUgaWdub3JlZCBhbmQgd2Ugd2lsbCB1c2UgYGdsYCB3aXRob3V0IGZldGNoaW5nIGFub3RoZXIgYGdldENvbnRleHRgLlxuICogUHJvdmlkaW5nIGEgY2FudmFzIHRoYXQgaGFzIGBnZXRDb250ZXh0KCd3ZWJnbCcpYCBhbHJlYWR5IGNhbGxlZCB3aWxsIG5vdCBjYXVzZVxuICogZXJyb3JzLCBidXQgaW4gY2VydGFpbiBkZWJ1Z2dlcnMgKGUuZy4gQ2hyb21lIFdlYkdMIEluc3BlY3RvciksIG9ubHkgdGhlIGxhdGVzdFxuICogY29udGV4dCB3aWxsIGJlIHRyYWNlZC5cbiAqXG4gKiBJZiBgaGFuZGxlQ29udGV4dExvc3NgIGlzIHRydWUgKGRlZmF1bHQpLCB0aGlzIHdpbGwgYXR0ZW1wdCB0byByZS1jcmVhdGUgdGhlIGNvbnRleHRcbiAqIG1hbnVhbGx5IChpLmUuIG5vIFwiUmF0cyEgV2ViR0wgaGl0IGEgc25hZyFcIiBtZXNzYWdlKSwgYnkgaXRlcmF0aW5nIHRocm91Z2ggYWxsICdtYW5hZ2VkIG9iamVjdHMnXG4gKiBhbmQgY2FsbGluZyBjcmVhdGUoKSBvbiB0aGVtLiBcbiAqIFxuICogQGNsYXNzICBXZWJHTENvbnRleHRcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgc29tZSBvcHRpb25zIGZvciBjcmVhdGlvblxuICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMud2lkdGggdGhlIHdpZHRoIG9mIHRoZSBHTCBjYW52YXNcbiAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLmhlaWdodCB0aGUgaGVpZ2h0IG9mIHRoZSBHTCBjYW52YXNcbiAqIEBwYXJhbSB7SFRNTENhbnZhc0VsZW1lbnR9IG9wdGlvbnMuY2FudmFzIHRoZSBvcHRpb25hbCBET00gY2FudmFzIGVsZW1lbnRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zLmF0dHJpYnV0ZXMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgY29udGV4dCBhdHRyaWJzIHdoaWNoXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lsbCBiZSB1c2VkIGR1cmluZyBHTCBpbml0aWFsaXphdGlvblxuICogQHBhcmFtIHtXZWJHTFJlbmRlcmluZ0NvbnRleHR9IG9wdGlvbnMuZ2wgdGhlIGFscmVhZHktaW5pdGlhbGl6ZWQgR0wgY29udGV4dCB0byB1c2VcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5oYW5kbGVDb250ZXh0TG9zcyB3aGV0aGVyIHRvIHRyeSBhbmQgbWFuYWdlIGNvbnRleHQgbG9zcywgZGVmYXVsdCB0cnVlXG4gKi9cbnZhciBXZWJHTENvbnRleHQgPSBuZXcgQ2xhc3Moe1xuXG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gV2ViR0xDb250ZXh0KG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFdlYkdMQ29udGV4dCkpXG4gICAgICAgICAgICByZXR1cm4gbmV3IFdlYkdMQ29udGV4dChvcHRpb25zKTtcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnN8fHt9O1xuXG4gICAgICAgIHZhciB3aWR0aCA9IG9wdGlvbnMud2lkdGg7XG4gICAgICAgIHZhciBoZWlnaHQgPSBvcHRpb25zLmhlaWdodDtcbiAgICAgICAgdmFyIHZpZXcgPSBvcHRpb25zLmNhbnZhcztcbiAgICAgICAgdmFyIGdsID0gb3B0aW9ucy5nbDtcbiAgICAgICAgdmFyIGNvbnRleHRBdHRyaWJ1dGVzID0gb3B0aW9ucy5jb250ZXh0QXR0cmlidXRlcztcbiAgICAgICAgdGhpcy5oYW5kbGVDb250ZXh0TG9zcyA9IHR5cGVvZiBvcHRpb25zLmhhbmRsZUNvbnRleHRMb3NzID09PSBcImJvb2xlYW5cIiA/IG9wdGlvbnMuaGFuZGxlQ29udGV4dExvc3MgOiB0cnVlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgbGlzdCBvZiByZW5kZXJpbmcgb2JqZWN0cyAoc2hhZGVycywgVkJPcywgdGV4dHVyZXMsIGV0Yykgd2hpY2ggYXJlIFxuICAgICAgICAgKiBjdXJyZW50bHkgYmVpbmcgbWFuYWdlZC4gQW55IG9iamVjdCB3aXRoIGEgXCJjcmVhdGVcIiBtZXRob2QgY2FuIGJlIGFkZGVkXG4gICAgICAgICAqIHRvIHRoaXMgbGlzdC4gVXBvbiBkZXN0cm95aW5nIHRoZSByZW5kZXJpbmcgb2JqZWN0LCBpdCBzaG91bGQgYmUgcmVtb3ZlZC5cbiAgICAgICAgICogU2VlIGFkZE1hbmFnZWRPYmplY3QgYW5kIHJlbW92ZU1hbmFnZWRPYmplY3QuXG4gICAgICAgICAqIFxuICAgICAgICAgKiBAcHJvcGVydHkge0FycmF5fSBtYW5hZ2VkT2JqZWN0c1xuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5tYW5hZ2VkT2JqZWN0cyA9IFtdO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgYWN0dWFsIEdMIGNvbnRleHQuIFlvdSBjYW4gdXNlIHRoaXMgZm9yXG4gICAgICAgICAqIHJhdyBHTCBjYWxscyBvciB0byBhY2Nlc3MgR0xlbnVtIGNvbnN0YW50cy4gVGhpc1xuICAgICAgICAgKiB3aWxsIGJlIHVwZGF0ZWQgb24gY29udGV4dCByZXN0b3JlLiBXaGlsZSB0aGUgV2ViR0xDb250ZXh0XG4gICAgICAgICAqIGlzIG5vdCBgdmFsaWRgLCB5b3Ugc2hvdWxkIG5vdCB0cnkgdG8gYWNjZXNzIEdMIHN0YXRlLlxuICAgICAgICAgKiBcbiAgICAgICAgICogQHByb3BlcnR5IGdsXG4gICAgICAgICAqIEB0eXBlIHtXZWJHTFJlbmRlcmluZ0NvbnRleHR9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmdsID0gbnVsbDtcblxuICAgICAgICAvL2lmIHRoZSB1c2VyIHNwZWNpZmllZCBhIEdMIGNvbnRleHQuLlxuICAgICAgICBpZiAoZ2wgJiYgdHlwZW9mIHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgIT09IFwidW5kZWZpbmVkXCJcbiAgICAgICAgICAgICAgICYmIGdsIGluc3RhbmNlb2Ygd2luZG93LldlYkdMUmVuZGVyaW5nQ29udGV4dCkge1xuICAgICAgICAgICAgdmlldyA9IGdsLmNhbnZhcztcbiAgICAgICAgICAgIHRoaXMuZ2wgPSBnbDtcbiAgICAgICAgICAgIHRoaXMudmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgY29udGV4dEF0dHJpYnV0ZXMgPSB1bmRlZmluZWQ7IC8vanVzdCBpZ25vcmUgbmV3IGF0dHJpYnMuLi5cbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgY2FudmFzIERPTSBlbGVtZW50IGZvciB0aGlzIGNvbnRleHQuXG4gICAgICAgICAqIEBwcm9wZXJ0eSB7SFRNTENhbnZhc0VsZW1lbnR9IGNhbnZhc1xuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jYW52YXMgPSB2aWV3IHx8IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIik7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSB3aWR0aCBvZiB0aGlzIGNhbnZhcy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHByb3BlcnR5IHdpZHRoXG4gICAgICAgICAqIEB0eXBlIHtOdW1iZXJ9XG4gICAgICAgICAqL1xuICAgICAgICBpZiAodHlwZW9mIHdpZHRoPT09XCJudW1iZXJcIikgXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy5jYW52YXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgZWxzZSAvL2lmIG5vIHNpemUgaXMgc3BlY2lmaWVkLCB1c2UgY2FudmFzIHNpemVcbiAgICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGhlaWdodCBvZiB0aGlzIGNhbnZhcy5cbiAgICAgICAgICogQHByb3BlcnR5IGhlaWdodFxuICAgICAgICAgKiBAdHlwZSB7TnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgaWYgKHR5cGVvZiBoZWlnaHQ9PT1cIm51bWJlclwiKVxuICAgICAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmNhbnZhcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGVsc2UgLy9pZiBubyBzaXplIGlzIHNwZWNpZmllZCwgdXNlIGNhbnZhcyBzaXplXG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuY2FudmFzLmhlaWdodDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGNvbnRleHQgYXR0cmlidXRlcyBmb3IgaW5pdGlhbGl6aW5nIHRoZSBHTCBzdGF0ZS4gVGhpcyBtaWdodCBpbmNsdWRlXG4gICAgICAgICAqIGFudGktYWxpYXNpbmcsIGFscGhhIHNldHRpbmdzLCB2ZXJpc29uLCBhbmQgc28gZm9ydGguXG4gICAgICAgICAqIFxuICAgICAgICAgKiBAcHJvcGVydHkge09iamVjdH0gY29udGV4dEF0dHJpYnV0ZXMgXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmNvbnRleHRBdHRyaWJ1dGVzID0gY29udGV4dEF0dHJpYnV0ZXM7XG4gICAgICAgIFxuICAgICAgICAvKipcbiAgICAgICAgICogV2hldGhlciB0aGlzIGNvbnRleHQgaXMgJ3ZhbGlkJywgaS5lLiByZW5kZXJhYmxlLiBBIGNvbnRleHQgdGhhdCBoYXMgYmVlbiBsb3N0XG4gICAgICAgICAqIChhbmQgbm90IHlldCByZXN0b3JlZCkgb3IgZGVzdHJveWVkIGlzIGludmFsaWQuXG4gICAgICAgICAqIFxuICAgICAgICAgKiBAcHJvcGVydHkge0Jvb2xlYW59IHZhbGlkXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnZhbGlkID0gZmFsc2U7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEEgc2lnbmFsIGRpc3BhdGNoZWQgd2hlbiBHTCBjb250ZXh0IGlzIGxvc3QuIFxuICAgICAgICAgKiBcbiAgICAgICAgICogVGhlIGZpcnN0IGFyZ3VtZW50IHBhc3NlZCB0byB0aGUgbGlzdGVuZXIgaXMgdGhlIFdlYkdMQ29udGV4dFxuICAgICAgICAgKiBtYW5hZ2luZyB0aGUgY29udGV4dCBsb3NzLlxuICAgICAgICAgKiBcbiAgICAgICAgICogQGV2ZW50IHtTaWduYWx9IGxvc3RcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMubG9zdCA9IG5ldyBTaWduYWwoKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQSBzaWduYWwgZGlzcGF0Y2hlZCB3aGVuIEdMIGNvbnRleHQgaXMgcmVzdG9yZWQsIGFmdGVyIGFsbCB0aGUgbWFuYWdlZFxuICAgICAgICAgKiBvYmplY3RzIGhhdmUgYmVlbiByZWNyZWF0ZWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFRoZSBmaXJzdCBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIGxpc3RlbmVyIGlzIHRoZSBXZWJHTENvbnRleHRcbiAgICAgICAgICogd2hpY2ggbWFuYWdlZCB0aGUgcmVzdG9yYXRpb24uXG4gICAgICAgICAqXG4gICAgICAgICAqIFRoaXMgZG9lcyBub3QgZ2F1cmVudGVlIHRoYXQgYWxsIG9iamVjdHMgd2lsbCBiZSByZW5kZXJhYmxlLlxuICAgICAgICAgKiBGb3IgZXhhbXBsZSwgYSBUZXh0dXJlIHdpdGggYW4gSW1hZ2VQcm92aWRlciBtYXkgc3RpbGwgYmUgbG9hZGluZ1xuICAgICAgICAgKiBhc3luY2hyb25vdXNseS4gICBcbiAgICAgICAgICogXG4gICAgICAgICAqIEBldmVudCB7U2lnbmFsfSByZXN0b3JlZFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5yZXN0b3JlZCA9IG5ldyBTaWduYWwoKTsgICBcbiAgICAgICAgXG4gICAgICAgIC8vc2V0dXAgY29udGV4dCBsb3N0IGFuZCByZXN0b3JlIGxpc3RlbmVyc1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0bG9zdFwiLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmhhbmRsZUNvbnRleHRMb3NzKVxuICAgICAgICAgICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB0aGlzLl9jb250ZXh0TG9zdChldik7XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ3ZWJnbGNvbnRleHRyZXN0b3JlZFwiLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmhhbmRsZUNvbnRleHRMb3NzKVxuICAgICAgICAgICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB0aGlzLl9jb250ZXh0UmVzdG9yZWQoZXYpO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICAgICAgXG4gICAgICAgIGlmICghdGhpcy52YWxpZCkgLy93b3VsZCBvbmx5IGJlIHZhbGlkIGlmIFdlYkdMUmVuZGVyaW5nQ29udGV4dCB3YXMgcGFzc2VkIFxuICAgICAgICAgICAgdGhpcy5faW5pdENvbnRleHQoKTtcblxuICAgICAgICB0aGlzLnJlc2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgfSxcbiAgICBcbiAgICBfaW5pdENvbnRleHQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgZXJyID0gXCJcIjtcbiAgICAgICAgdGhpcy52YWxpZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmdsID0gZ2V0Q29udGV4dCh7XG4gICAgICAgICAgICBjYW52YXM6IHRoaXMuY2FudmFzLFxuICAgICAgICAgICAgYXR0cmlidXRlczogdGhpcy5jb250ZXh0QXR0cmlidXRlc1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAodGhpcy5nbCkge1xuICAgICAgICAgICAgdGhpcy52YWxpZCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJXZWJHTCBDb250ZXh0IE5vdCBTdXBwb3J0ZWQgLS0gdHJ5IGVuYWJsaW5nIGl0IG9yIHVzaW5nIGEgZGlmZmVyZW50IGJyb3dzZXJcIik7XG4gICAgICAgIH0gICBcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlcyB0aGUgd2lkdGggYW5kIGhlaWdodCBvZiB0aGlzIFdlYkdMIGNvbnRleHQsIHJlc2l6ZXNcbiAgICAgKiB0aGUgY2FudmFzIHZpZXcsIGFuZCBjYWxscyBnbC52aWV3cG9ydCgpIHdpdGggdGhlIG5ldyBzaXplLlxuICAgICAqIFxuICAgICAqIEBtZXRob2QgIHJlc2l6ZVxuICAgICAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggIHRoZSBuZXcgd2lkdGhcbiAgICAgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCB0aGUgbmV3IGhlaWdodFxuICAgICAqL1xuICAgIHJlc2l6ZTogZnVuY3Rpb24od2lkdGgsIGhlaWdodCkge1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICB2YXIgZ2wgPSB0aGlzLmdsO1xuICAgICAgICBnbC52aWV3cG9ydCgwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIChpbnRlcm5hbCB1c2UpXG4gICAgICogQSBtYW5hZ2VkIG9iamVjdCBpcyBhbnl0aGluZyB3aXRoIGEgXCJjcmVhdGVcIiBmdW5jdGlvbiwgdGhhdCB3aWxsXG4gICAgICogcmVzdG9yZSBHTCBzdGF0ZSBhZnRlciBjb250ZXh0IGxvc3MuIFxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAbWV0aG9kICBhZGRNYW5hZ2VkT2JqZWN0XG4gICAgICogQHBhcmFtIHtbdHlwZV19IHRleCBbZGVzY3JpcHRpb25dXG4gICAgICovXG4gICAgYWRkTWFuYWdlZE9iamVjdDogZnVuY3Rpb24ob2JqKSB7XG4gICAgICAgIHRoaXMubWFuYWdlZE9iamVjdHMucHVzaChvYmopO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiAoaW50ZXJuYWwgdXNlKVxuICAgICAqIFJlbW92ZXMgYSBtYW5hZ2VkIG9iamVjdCBmcm9tIHRoZSBjYWNoZS4gVGhpcyBpcyB1c2VmdWwgdG8gZGVzdHJveVxuICAgICAqIGEgdGV4dHVyZSBvciBzaGFkZXIsIGFuZCBoYXZlIGl0IG5vIGxvbmdlciByZS1sb2FkIG9uIGNvbnRleHQgcmVzdG9yZS5cbiAgICAgKlxuICAgICAqIFJldHVybnMgdGhlIG9iamVjdCB0aGF0IHdhcyByZW1vdmVkLCBvciBudWxsIGlmIGl0IHdhcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLlxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAbWV0aG9kICByZW1vdmVNYW5hZ2VkT2JqZWN0XG4gICAgICogQHBhcmFtICB7T2JqZWN0fSBvYmogdGhlIG9iamVjdCB0byBiZSBtYW5hZ2VkXG4gICAgICogQHJldHVybiB7T2JqZWN0fSAgICAgdGhlIHJlbW92ZWQgb2JqZWN0LCBvciBudWxsXG4gICAgICovXG4gICAgcmVtb3ZlTWFuYWdlZE9iamVjdDogZnVuY3Rpb24ob2JqKSB7XG4gICAgICAgIHZhciBpZHggPSB0aGlzLm1hbmFnZWRPYmplY3RzLmluZGV4T2Yob2JqKTtcbiAgICAgICAgaWYgKGlkeCA+IC0xKSB7XG4gICAgICAgICAgICB0aGlzLm1hbmFnZWRPYmplY3RzLnNwbGljZShpZHgsIDEpO1xuICAgICAgICAgICAgcmV0dXJuIG9iajtcbiAgICAgICAgfSBcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENhbGxzIGRlc3Ryb3koKSBvbiBlYWNoIG1hbmFnZWQgb2JqZWN0LCB0aGVuIHJlbW92ZXMgcmVmZXJlbmNlcyB0byB0aGVzZSBvYmplY3RzXG4gICAgICogYW5kIHRoZSBHTCByZW5kZXJpbmcgY29udGV4dC4gVGhpcyBhbHNvIHJlbW92ZXMgcmVmZXJlbmNlcyB0byB0aGUgdmlldyBhbmQgc2V0c1xuICAgICAqIHRoZSBjb250ZXh0J3Mgd2lkdGggYW5kIGhlaWdodCB0byB6ZXJvLlxuICAgICAqXG4gICAgICogQXR0ZW1wdGluZyB0byB1c2UgdGhpcyBXZWJHTENvbnRleHQgb3IgdGhlIEdMIHJlbmRlcmluZyBjb250ZXh0IGFmdGVyIGRlc3Ryb3lpbmcgaXRcbiAgICAgKiB3aWxsIGxlYWQgdG8gdW5kZWZpbmVkIGJlaGF2aW91ci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgIGRlc3Ryb3lcbiAgICAgKi9cbiAgICBkZXN0cm95OiBmdW5jdGlvbigpIHtcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPHRoaXMubWFuYWdlZE9iamVjdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBvYmogPSB0aGlzLm1hbmFnZWRPYmplY3RzW2ldO1xuICAgICAgICAgICAgaWYgKG9iaiAmJiB0eXBlb2Ygb2JqLmRlc3Ryb3kgPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgICAgICBvYmouZGVzdHJveSgpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFuYWdlZE9iamVjdHMubGVuZ3RoID0gMDtcbiAgICAgICAgdGhpcy52YWxpZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmdsID0gbnVsbDtcbiAgICAgICAgdGhpcy5jYW52YXMgPSBudWxsO1xuICAgICAgICB0aGlzLndpZHRoID0gdGhpcy5oZWlnaHQgPSAwO1xuICAgIH0sXG5cbiAgICBfY29udGV4dExvc3Q6IGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgIC8vYWxsIHRleHR1cmVzL3NoYWRlcnMvYnVmZmVycy9GQk9zIGhhdmUgYmVlbiBkZWxldGVkLi4uIFxuICAgICAgICAvL3dlIG5lZWQgdG8gcmUtY3JlYXRlIHRoZW0gb24gcmVzdG9yZVxuICAgICAgICB0aGlzLnZhbGlkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5sb3N0LmRpc3BhdGNoKHRoaXMpO1xuICAgIH0sXG5cbiAgICBfY29udGV4dFJlc3RvcmVkOiBmdW5jdGlvbihldikge1xuICAgICAgICAvL2ZpcnN0LCBpbml0aWFsaXplIHRoZSBHTCBjb250ZXh0IGFnYWluXG4gICAgICAgIHRoaXMuX2luaXRDb250ZXh0KCk7XG5cbiAgICAgICAgLy9ub3cgd2UgcmVjcmVhdGUgb3VyIHNoYWRlcnMgYW5kIHRleHR1cmVzXG4gICAgICAgIGlmICh0aGlzLmhhbmRsZUNvbnRleHRMb3NzKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8dGhpcy5tYW5hZ2VkT2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1hbmFnZWRPYmplY3RzW2ldICYmIHR5cGVvZiB0aGlzLm1hbmFnZWRPYmplY3RzW2ldLmNyZWF0ZSA9PT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLm1hbmFnZWRPYmplY3RzW2ldLmNyZWF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy91cGRhdGUgR0wgdmlld3BvcnRcbiAgICAgICAgdGhpcy5yZXNpemUodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuXG4gICAgICAgIHRoaXMucmVzdG9yZWQuZGlzcGF0Y2godGhpcyk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEJhY2t3YXJkLWNvbXBhdGlibGUgdmlldyBnZXR0ZXIvc2V0dGVyLlxuICAgICAqIERlcHJlY2F0ZWQsIG1heSBiZSByZW1vdmVkIGluIHRoZSBmdXR1cmUuXG4gICAgICogXG4gICAgICogQGRlcHJlY2F0ZWQgdXNlIGNhbnZhcyBpbnN0ZWFkXG4gICAgICogQHByb3BlcnR5IHtIVE1MQ2FudmFzfSB2aWV3IFxuICAgICAqL1xuICAgIHZpZXc6IHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNhbnZhcztcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbihjYW52YXMpIHtcbiAgICAgICAgICAgIHRoaXMuY2FudmFzID0gY2FudmFzO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gV2ViR0xDb250ZXh0OyIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0cykge1xuICAgIG9wdHMgPSBvcHRzfHx7fTtcbiAgICB2YXIgY2FudmFzID0gb3B0cy5jYW52YXMgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcbiAgICBpZiAodHlwZW9mIG9wdHMud2lkdGggPT09IFwibnVtYmVyXCIpXG4gICAgICAgIGNhbnZhcy53aWR0aCA9IG9wdHMud2lkdGg7XG4gICAgaWYgKHR5cGVvZiBvcHRzLmhlaWdodCA9PT0gXCJudW1iZXJcIilcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IG9wdHMuaGVpZ2h0O1xuICAgIFxuICAgIHZhciBhdHRyaWJzID0gKG9wdHMuYXR0cmlidXRlcyB8fCBvcHRzLmF0dHJpYnMgfHwge30pO1xuICAgIHRyeSB7XG4gICAgICAgIGdsID0gKGNhbnZhcy5nZXRDb250ZXh0KCd3ZWJnbCcsIGF0dHJpYnMpIHx8IGNhbnZhcy5nZXRDb250ZXh0KCdleHBlcmltZW50YWwtd2ViZ2wnLCBhdHRyaWJzKSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBnbCA9IG51bGw7XG4gICAgfVxuICAgIHJldHVybiBnbDtcbn07IiwiLyoqIFxuICogQG1vZHVsZSAga2FtaS1mYm9cbiAqL1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcbnZhciBUZXh0dXJlID0gcmVxdWlyZSgna2FtaS10ZXh0dXJlJyk7XG52YXIgd3JhcENvbnRleHQgPSByZXF1aXJlKCdrYW1pLXV0aWwnKS53cmFwQ29udGV4dDtcblxudmFyIEZyYW1lQnVmZmVyID0gbmV3IENsYXNzKHtcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBGcmFtZSBCdWZmZXIgT2JqZWN0IHdpdGggdGhlIGdpdmVuIHdpZHRoIGFuZCBoZWlnaHQuXG5cdCAqXG5cdCAqIEl0J3MgYWR2aXNlZCB0byB1c2UgRnJhbWVCdWZmZXIuZ2V0TWF4U2l6ZShnbCkgYXMgYSB1dGlsaXR5IHRvIGVuc3VyZVxuXHQgKiB5b3VyIHRleHR1cmUgaXMgdW5kZXIgdGhlIGhhcmR3YXJlIGxpbWl0cy4gSWYgaXQgZXhjZWVkcyB0aGlzIHNpemUgaW5cblx0ICogZWl0aGVyIGRpbWVuc2lvbiwgdGhpcyBjb25zdHJ1Y3RvciB3aWxsIHRocm93IGFuIGVycm9yLlxuXHQgKlxuXHQgKiBJZiBgdGV4dHVyZWAgaXMgcHJvdmlkZWQgdG8gdGhlIG9wdGlvbnMsIHdlIHdpbGwgdXNlIHRoYXQgYXMgdGhlIFxuXHQgKiBjb2xvciBidWZmZXIgdGV4dHVyZSBhbmQgZ3JhYiBpdHMgd2lkdGgvaGVpZ2h0LlxuXHQgKiBcblx0ICogQGNsYXNzICBGcmFtZUJ1ZmZlclxuXHQgKiBAcGFyYW0ge1dlYkdMUmVuZGVyaW5nQ29udGV4dHxrYW1pLWNvbnRleHR9IGNvbnRleHQgdGhlIGdsL2thbWkgY29udGV4dFxuXHQgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyB0aGUgb3B0aW9ucyBmb3IgaW5pdGlhbGl6YXRpb25cblx0ICogICBAcGFyYW0ge051bWJlcn0gb3B0aW9ucy53aWR0aCB0aGUgd2lkdGggb2YgdGhlIHRleHR1cmUsIG11c3QgYmUgPj0gMVxuXHQgKiAgIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLmhlaWdodCB0aGUgaGVpZ2h0IG9mIHRoZSB0ZXh0dXJlLCBtdXN0IGJlID49IDFcblx0ICogICBAcGFyYW0ge0dMZW51bX0gb3B0aW9ucy5mb3JtYXQgdGhlIGZvcm1hdCBvZiB0aGUgdGV4dHVyZSwgZGVmYXVsdCBnbC5SR0JBXG5cdCAqICAgQHBhcmFtIHtUZXh0dXJlfSBvcHRpb25zLnRleHR1cmUgYSBrYW1pLXRleHR1cmUgdG8gdXNlIGluc3RlYWQgb2YgY3JlYXRpbmcgYSBuZXcgb25lXG5cdCAqIEBjb25zdHJ1Y3RvclxuXHQgKi9cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gRnJhbWVCdWZmZXIoY29udGV4dCwgb3B0aW9ucykgeyAvL1RPRE86IGRlcHRoIGNvbXBvbmVudFxuXHRcdGlmICghKHRoaXMgaW5zdGFuY2VvZiBGcmFtZUJ1ZmZlcikpXG5cdFx0XHRyZXR1cm4gbmV3IEZyYW1lQnVmZmVyKGNvbnRleHQsIG9wdGlvbnMpO1xuXHRcdGlmICghY29udGV4dCB8fCB0eXBlb2YgY29udGV4dCAhPT0gXCJvYmplY3RcIilcblx0XHRcdHRocm93IFwidmFsaWQgR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkIHRvIEZyYW1lQnVmZmVyXCI7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnN8fHt9O1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIHVuZGVybHlpbmcgSUQgb2YgdGhlIEdMIGZyYW1lIGJ1ZmZlciBvYmplY3QuXG5cdFx0ICpcblx0XHQgKiBAcHJvcGVydHkge1dlYkdMRnJhbWVidWZmZXJ9IGlkXG5cdFx0ICovXHRcdFxuXHRcdHRoaXMuaWQgPSBudWxsO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIFdlYkdMQ29udGV4dCBiYWNrZWQgYnkgdGhpcyBmcmFtZSBidWZmZXIuXG5cdFx0ICpcblx0XHQgKiBAcHJvcGVydHkge1dlYkdMQ29udGV4dH0gY29udGV4dFxuXHRcdCAqL1xuXHRcdHRoaXMuY29udGV4dCA9IHdyYXBDb250ZXh0KGNvbnRleHQpO1xuXG5cdFx0Ly9JZiBhIHRleHR1cmUgaXMgcGFzc2VkLCB1c2UgdGhhdCBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgbmV3IG9uZS4uLlxuXHRcdGlmIChvcHRpb25zLnRleHR1cmUpIHtcblx0XHRcdG9wdGlvbnMud2lkdGggPSBvcHRpb25zLnRleHR1cmUud2lkdGg7XG5cdFx0XHRvcHRpb25zLmhlaWdodCA9IG9wdGlvbnMudGV4dHVyZS5oZWlnaHQ7XHRcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMud2lkdGggIT09IFwibnVtYmVyXCIgfHwgdHlwZW9mIG9wdGlvbnMuaGVpZ2h0ICE9PSBcIm51bWJlclwiKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwibXVzdCBzcGVjaWZ5IHdpZHRoIGFuZCBoZWlnaHQgdG8gZnJhbWUgYnVmZmVyXCIpO1xuXG5cdFx0dmFyIHdpZHRoID0gTWF0aC5tYXgoMSwgb3B0aW9ucy53aWR0aHx8MCk7XG5cdFx0dmFyIGhlaWdodCA9IE1hdGgubWF4KDEsIG9wdGlvbnMuaGVpZ2h0fHwwKTtcblx0XHR2YXIgbWF4U2l6ZSA9IEZyYW1lQnVmZmVyLmdldE1heFNpemUodGhpcy5jb250ZXh0LmdsKTtcblx0XHRpZiAod2lkdGggPiBtYXhTaXplIHx8IGhlaWdodCA+IG1heFNpemUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkZyYW1lQnVmZmVyIGlzIGFib3ZlIGF2YWlsYWJsZSByZW5kZXJidWZmZXIgc2l6ZSAoXCIrbWF4U2l6ZStcIilcIik7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogVGhlIFRleHR1cmUgYmFja2VkIGJ5IHRoaXMgZnJhbWUgYnVmZmVyLlxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IHtUZXh0dXJlfSBUZXh0dXJlXG5cdFx0ICovXG5cdFx0Ly90aGlzIFRleHR1cmUgaXMgbm93IG1hbmFnZWQuXG5cdFx0dGhpcy50ZXh0dXJlID0gb3B0aW9ucy50ZXh0dXJlIHx8IG5ldyBUZXh0dXJlKGNvbnRleHQsIHtcblx0XHRcdHdpZHRoOiB3aWR0aCxcblx0XHRcdGhlaWdodDogaGVpZ2h0LFxuXHRcdFx0Zm9ybWF0OiBvcHRpb25zLmZvcm1hdFxuXHRcdH0pO1xuXG5cdFx0Ly9UaGlzIGlzIG1hYW5nZWQgYnkgV2ViR0xDb250ZXh0XG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fSxcblxuXHQvKipcblx0ICogQSByZWFkLW9ubHkgcHJvcGVydHkgd2hpY2ggcmV0dXJucyB0aGUgd2lkdGggb2YgdGhlIGJhY2tpbmcgdGV4dHVyZS4gXG5cdCAqIFxuXHQgKiBAcmVhZE9ubHlcblx0ICogQHByb3BlcnR5IHdpZHRoXG5cdCAqIEB0eXBlIHtOdW1iZXJ9XG5cdCAqL1xuXHR3aWR0aDoge1xuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50ZXh0dXJlLndpZHRoO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogQSByZWFkLW9ubHkgcHJvcGVydHkgd2hpY2ggcmV0dXJucyB0aGUgaGVpZ2h0IG9mIHRoZSBiYWNraW5nIHRleHR1cmUuIFxuXHQgKiBcblx0ICogQHJlYWRPbmx5XG5cdCAqIEBwcm9wZXJ0eSBoZWlnaHRcblx0ICogQHR5cGUge051bWJlcn1cblx0ICovXG5cdGhlaWdodDoge1xuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50ZXh0dXJlLmhlaWdodDtcblx0XHR9XG5cdH0sXG5cblxuXHQvKipcblx0ICogQ2FsbGVkIGR1cmluZyBpbml0aWFsaXphdGlvbiB0byBzZXR1cCB0aGUgZnJhbWUgYnVmZmVyOyBhbHNvIGNhbGxlZCBvblxuXHQgKiBjb250ZXh0IHJlc3RvcmUuIFVzZXJzIHdpbGwgbm90IG5lZWQgdG8gY2FsbCB0aGlzIGRpcmVjdGx5LlxuXHQgKiBcblx0ICogQG1ldGhvZCBjcmVhdGVcblx0ICovXG5cdGNyZWF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbCA9IHRoaXMuY29udGV4dC5nbDsgXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHZhciB0ZXggPSB0aGlzLnRleHR1cmU7XG5cblx0XHQvL3dlIGFzc3VtZSB0aGUgdGV4dHVyZSBoYXMgYWxyZWFkeSBoYWQgY3JlYXRlKCkgY2FsbGVkIG9uIGl0XG5cdFx0Ly9zaW5jZSBpdCB3YXMgYWRkZWQgYXMgYSBtYW5hZ2VkIG9iamVjdCBwcmlvciB0byB0aGlzIEZyYW1lQnVmZmVyXG5cdFx0dGV4LmJpbmQoKTtcbiBcblx0XHR0aGlzLmlkID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcblx0XHRnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIHRoaXMuaWQpO1xuXG5cdFx0Z2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoZ2wuRlJBTUVCVUZGRVIsIGdsLkNPTE9SX0FUVEFDSE1FTlQwLCB0ZXgudGFyZ2V0LCB0ZXguaWQsIDApO1xuXG5cdFx0dmFyIHJlc3VsdCA9IGdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXMoZ2wuRlJBTUVCVUZGRVIpO1xuXHRcdGlmIChyZXN1bHQgIT0gZ2wuRlJBTUVCVUZGRVJfQ09NUExFVEUpIHtcblx0XHRcdHRoaXMuZGVzdHJveSgpOyAvL2Rlc3Ryb3kgb3VyIHJlc291cmNlcyBiZWZvcmUgbGVhdmluZyB0aGlzIGZ1bmN0aW9uLi5cblxuXHRcdFx0dmFyIGVyciA9IFwiRnJhbWVidWZmZXIgbm90IGNvbXBsZXRlXCI7XG5cdFx0XHRzd2l0Y2ggKHJlc3VsdCkge1xuXHRcdFx0XHRjYXNlIGdsLkZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEOlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihlcnIgKyBcIjogdW5zdXBwb3J0ZWRcIik7XG5cdFx0XHRcdGNhc2UgZ2wuSU5DT01QTEVURV9ESU1FTlNJT05TOlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihlcnIgKyBcIjogaW5jb21wbGV0ZSBkaW1lbnNpb25zXCIpO1xuXHRcdFx0XHRjYXNlIGdsLklOQ09NUExFVEVfQVRUQUNITUVOVDpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgXCI6IGluY29tcGxldGUgYXR0YWNobWVudFwiKTtcblx0XHRcdFx0Y2FzZSBnbC5JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVDpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgXCI6IG1pc3NpbmcgYXR0YWNobWVudFwiKTtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Z2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBudWxsKTtcblx0fSxcblxuXG5cdC8qKlxuXHQgKiBEZXN0cm95cyB0aGlzIGZyYW1lIGJ1ZmZlci4gVXNpbmcgdGhpcyBvYmplY3QgYWZ0ZXIgZGVzdHJveWluZyBpdCB3aWxsIGhhdmVcblx0ICogdW5kZWZpbmVkIHJlc3VsdHMuIFxuXHQgKiBAbWV0aG9kIGRlc3Ryb3lcblx0ICovXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHRpZiAodGhpcy50ZXh0dXJlKVxuXHRcdFx0dGhpcy50ZXh0dXJlLmRlc3Ryb3koKTtcblx0XHRpZiAodGhpcy5pZCAmJiB0aGlzLmdsKVxuXHRcdFx0dGhpcy5nbC5kZWxldGVGcmFtZWJ1ZmZlcih0aGlzLmlkKTtcblx0XHRpZiAodGhpcy5jb250ZXh0KVxuXHRcdFx0dGhpcy5jb250ZXh0LnJlbW92ZU1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHR0aGlzLmlkID0gbnVsbDtcblx0XHR0aGlzLmdsID0gbnVsbDtcblx0XHR0aGlzLnRleHR1cmUgPSBudWxsO1xuXHRcdHRoaXMuY29udGV4dCA9IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEJpbmRzIHRoaXMgZnJhbWVidWZmZXIgYW5kIHNldHMgdGhlIHZpZXdwb3J0IHRvIHRoZSBleHBlY3RlZCBzaXplLlxuXHQgKiBAbWV0aG9kIGJlZ2luXG5cdCAqL1xuXHRiZWdpbjogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC52aWV3cG9ydCgwLCAwLCB0aGlzLnRleHR1cmUud2lkdGgsIHRoaXMudGV4dHVyZS5oZWlnaHQpO1xuXHRcdGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgdGhpcy5pZCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEJpbmRzIHRoZSBkZWZhdWx0IGZyYW1lIGJ1ZmZlciAodGhlIHNjcmVlbikgYW5kIHNldHMgdGhlIHZpZXdwb3J0IGJhY2tcblx0ICogdG8gdGhlIHNpemUgb2YgdGhlIFdlYkdMQ29udGV4dC5cblx0ICogXG5cdCAqIEBtZXRob2QgZW5kXG5cdCAqL1xuXHRlbmQ6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0Z2wudmlld3BvcnQoMCwgMCwgdGhpcy5jb250ZXh0LndpZHRoLCB0aGlzLmNvbnRleHQuaGVpZ2h0KTtcblx0XHRnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIG51bGwpO1xuXHR9XG59KTtcblxuRnJhbWVCdWZmZXIuZ2V0TWF4U2l6ZSA9IGZ1bmN0aW9uKGdsKSB7XG5cdGlmICghZ2wpXG5cdFx0dGhyb3cgXCJubyBnbCBzcGVjaWZpZWQgdG8gRnJhbWVCdWZmZXIuZ2V0TWF4U2l6ZVwiO1xuXHQvL1RPRE86IGNhY2hlIHRoaXM/XG5cdHJldHVybiBnbC5nZXRQYXJhbWV0ZXIoZ2wuTUFYX1JFTkRFUkJVRkZFUl9TSVpFKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRnJhbWVCdWZmZXI7IiwiLyoqXG4gKiBUZXh0dXJlIHV0aWxzIGZvciBrYW1pLlxuICogXG4gKiBAbW9kdWxlIGthbWktdGV4dHVyZVxuICovXG5cbnZhciBDbGFzcyA9IHJlcXVpcmUoJ2tsYXNzZScpO1xudmFyIG5leHRQb3dlck9mVHdvID0gcmVxdWlyZSgnbnVtYmVyLXV0aWwnKS5uZXh0UG93ZXJPZlR3bztcbnZhciBpc1Bvd2VyT2ZUd28gPSByZXF1aXJlKCdudW1iZXItdXRpbCcpLmlzUG93ZXJPZlR3bztcbnZhciB3cmFwQ29udGV4dCA9IHJlcXVpcmUoJ2thbWktdXRpbCcpLndyYXBDb250ZXh0O1xuXG52YXIgVGV4dHVyZSA9IG5ldyBDbGFzcyh7XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgdGV4dHVyZSB3aXRoIHRoZSBvcHRpb25hbCB3aWR0aCwgaGVpZ2h0LCBhbmQgZGF0YS5cblx0ICpcblx0ICogSWYgdGhlIGNvbnN0cnVjdG9yIGlzIHBhc3NlZCBubyBwYXJhbWV0ZXJzIG90aGVyIHRoYW4gdGhlIGNvbnRleHQsIHRoZW5cblx0ICogaXQgd2lsbCBub3QgYmUgaW5pdGlhbGl6ZWQgYW5kIHdpbGwgYmUgbm9uLXJlbmRlcmFibGUuIFlvdSB3aWxsIG5lZWQgdG8gbWFudWFsbHlcblx0ICogdXBsb2FkRGF0YSBvciB1cGxvYWRJbWFnZSB5b3Vyc2VsZi5cblx0ICpcblx0ICogSWYgdGhlIG9wdGlvbnMgcGFzc2VkIGluY2x1ZGVzICdzcmMnLCBpdCBhc3N1bWVzIGFuIGltYWdlIGlzIHRvIGJlIGxvYWRlZCwgXG5cdCAqIGFuZCB3aWxsIHVzZSB0aGUgd2lkdGgvaGVpZ2h0IGZyb20gdGhhdCByZXN1bHRpbmcgaW1hZ2UuIE90aGVyd2lzZSwgaXQgXG5cdCAqIHdpbGwgbG9vayBmb3IgJ2RhdGEnLCB3aGljaCBtYXkgYmUgYSB0eXBlZCBhcnJheSBvciBhbnkgdmFsaWQgXCJpbWFnZVwiIG9iamVjdC4gXG5cdCAqIEEgdHlwZWQgYXJyYXkgd2lsbCBuZWVkIGl0cyB3aWR0aC9oZWlnaHQgcGFzc2VkIGV4cGxpY2l0bHkuIFxuXHQgKiBcblx0ICogSWYgdGhlIGNvbnRleHQgaXMgYSBrYW1pLWNvbnRleHQsIHdlIHdpbGwgdHJ5IHRvIG1hbmFnZSB0aGUgVGV4dHVyZSBvYmplY3QgYnlcblx0ICoga2VlcGluZyB0aGUgYXJndW1lbnRzIGluIG1lbW9yeSBmb3IgZnV0dXJlIHVzZS4gXG5cdCAqXG5cdCAqIE1vc3QgdXNlcnMgd2lsbCB3YW50IHRvIHVzZSB0aGUgQXNzZXRNYW5hZ2VyIHRvIGNyZWF0ZSBhbmQgbWFuYWdlIHRoZWlyIHRleHR1cmVzXG5cdCAqIHdpdGggYXN5bmNocm9ub3VzIGxvYWRpbmcgYW5kIGNvbnRleHQgbG9zcy4gXG5cdCAqXG5cdCAqIEBjbGFzcyAgVGV4dHVyZVxuXHQgKiBAY29uc3RydWN0b3Jcblx0ICogQHBhcmFtICB7V2ViR0xSZW5kZXJpbmdDb250ZXh0fGthbWktY29udGV4dH0gY29udGV4dCB0aGUgV2ViR0wgY29udGV4dFxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9wdGlvbnMgdGhlIG9wdGlvbnMgdG8gY3JlYXRlIHRoaXMgdGV4dHVyZVxuXHQgKiAgIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25zLnNyYyB0aGUgcGF0aCB0byB0aGUgaW1hZ2UgZmlsZSwgaWYgb21taXR0ZWQgd2UgYXNzdW1lIGRhdGEgd2lsbCBiZSBnaXZlblxuXHQgKiAgIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMub25Mb2FkIGNhbGxlZCB3aGVuIHRoZSBpbWFnZSBpcyBsb2FkZWQgKGlmIHNyYyBpcyBwcm92aWRlZClcblx0ICogICBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLm9uRXJyb3IgY2FsbGVkIHdoZW4gdGhlcmUgd2FzIGFuIGVycm9yIGxvYWRpbmcgdGhlIGltYWdlIChpZiBzcmMgaXMgcHJvdmlkZWQpXG5cdCAqICAgQHBhcmFtIHtBcnJheUJ1ZmZlcn0gb3B0aW9ucy5kYXRhIHNvbWUgdHlwZWQgYXJyYXkgd2l0aCB0ZXh0dXJlIGRhdGEsIGlnbm9yZWQgaWYgJ3NyYycgaXMgc3BlY2lmaWVkXG5cdCAqICAgQHBhcmFtIHtHTGVudW19IG9wdGlvbnMuZm9ybWF0IHRoZSB0ZXh0dXJlIGZvcm1hdCwgZGVmYXVsdCBUZXh0dXJlLkZvcm1hdC5SR0JBIChmb3Igd2hlbiBkYXRhIGlzIHNwZWNpZmllZClcblx0ICogICBAcGFyYW0ge0dMZW51bX0gb3B0aW9ucy50eXBlIHRoZSBkYXRhIHR5cGUsIGRlZmF1bHQgVGV4dHVyZS5EYXRhVHlwZS5VTlNJR05FRF9CWVRFIChmb3Igd2hlbiBkYXRhIGlzIHNwZWNpZmllZClcblx0ICogICBAcGFyYW0ge051bWJlcn0gb3B0aW9ucy53aWR0aCB0aGUgd2lkdGggb2YgdGhlIHRleHR1cmUgKGlmIHdlIGFyZSBub3Qgc3BlY2lmeWluZyBhbiBpbWFnZSBVUkwpXG5cdCAqICAgQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMuaGVpZ2h0IHRoZSBoZWlnaHQgb2YgdGhlIHRleHR1cmUgKGlmIHdlIGFyZSBub3Qgc3BlY2lmeWluZyBhbiBpbWFnZSBVUkwpXG5cdCAqICAgQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLmdlbk1pcG1hcHMgd2hldGhlciB0byBnZW5lcmF0ZSBtaXBtYXBzIGFmdGVyIHVwbG9hZFxuXHQgKi9cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gVGV4dHVyZShjb250ZXh0LCBvcHRpb25zKSB7XG5cdFx0aWYgKCEodGhpcyBpbnN0YW5jZW9mIFRleHR1cmUpKVxuXHRcdFx0cmV0dXJuIG5ldyBUZXh0dXJlKGNvbnRleHQsIG9wdGlvbnMpO1xuXHRcdGlmICghY29udGV4dCB8fCB0eXBlb2YgY29udGV4dCAhPT0gXCJvYmplY3RcIilcblx0XHRcdHRocm93IFwidmFsaWQgR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkIHRvIFRleHR1cmVcIjtcblxuXHRcdHRoaXMuY29udGV4dCA9IHdyYXBDb250ZXh0KGNvbnRleHQpO1xuXG5cdFx0LyoqXG5cdFx0ICogV2hlbiBhIHRleHR1cmUgaXMgY3JlYXRlZCwgd2Uga2VlcCB0cmFjayBvZiB0aGUgYXJndW1lbnRzIHByb3ZpZGVkIHRvIFxuXHRcdCAqIGl0cyBjb25zdHJ1Y3Rvci4gT24gY29udGV4dCBsb3NzIGFuZCByZXN0b3JlLCB0aGVzZSBhcmd1bWVudHMgYXJlIHJlLXN1cHBsaWVkXG5cdFx0ICogdG8gdGhlIFRleHR1cmUsIHNvIGFzIHRvIHJlLWNyZWF0ZSBpdCBpbiBpdHMgY29ycmVjdCBmb3JtLlxuXHRcdCAqXG5cdFx0ICogVGhpcyBpcyBtYWlubHkgdXNlZnVsIGlmIHlvdSBhcmUgcHJvY2VkdXJhbGx5IGNyZWF0aW5nIHRleHR1cmVzIGFuZCBwYXNzaW5nXG5cdFx0ICogdGhlaXIgZGF0YSBkaXJlY3RseSAoZS5nLiBmb3IgZ2VuZXJpYyBsb29rdXAgdGFibGVzIGluIGEgc2hhZGVyKS4gRm9yIGltYWdlXG5cdFx0ICogb3IgbWVkaWEgYmFzZWQgdGV4dHVyZXMsIGl0IHdvdWxkIGJlIGJldHRlciB0byB1c2UgYW4gQXNzZXRNYW5hZ2VyIHRvIG1hbmFnZVxuXHRcdCAqIHRoZSBhc3luY2hyb25vdXMgdGV4dHVyZSB1cGxvYWQuXG5cdFx0ICpcblx0XHQgKiBVcG9uIGRlc3Ryb3lpbmcgYSB0ZXh0dXJlLCBhIHJlZmVyZW5jZSB0byB0aGlzIGlzIGFsc28gbG9zdC5cblx0XHQgKlxuXHRcdCAqIEBwcm9wZXJ0eSBtYW5hZ2VkQXJnc1xuXHRcdCAqIEB0eXBlIHtPYmplY3R9IHRoZSBvcHRpb25zIGdpdmVuIHRvIHRoZSBUZXh0dXJlIGNvbnN0cnVjdG9yLCBvciB1bmRlZmluZWRcblx0XHQgKi9cblx0XHR0aGlzLm1hbmFnZWRBcmdzID0gb3B0aW9ucztcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBXZWJHTFRleHR1cmUgd2hpY2ggYmFja3MgdGhpcyBUZXh0dXJlIG9iamVjdC4gVGhpc1xuXHRcdCAqIGNhbiBiZSB1c2VkIGZvciBsb3ctbGV2ZWwgR0wgY2FsbHMuXG5cdFx0ICogXG5cdFx0ICogQHR5cGUge1dlYkdMVGV4dHVyZX1cblx0XHQgKi9cblx0XHR0aGlzLmlkID0gbnVsbDsgLy9pbml0aWFsaXplZCBpbiBjcmVhdGUoKVxuXG5cdFx0LyoqXG5cdFx0ICogVGhlIHRhcmdldCBmb3IgdGhpcyB0ZXh0dXJlIHVuaXQsIGkuZS4gVEVYVFVSRV8yRC4gU3ViY2xhc3Nlc1xuXHRcdCAqIHNob3VsZCBvdmVycmlkZSB0aGUgY3JlYXRlKCkgbWV0aG9kIHRvIGNoYW5nZSB0aGlzLCBmb3IgY29ycmVjdFxuXHRcdCAqIHVzYWdlIHdpdGggY29udGV4dCByZXN0b3JlLlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB0YXJnZXRcblx0XHQgKiBAdHlwZSB7R0xlbnVtfVxuXHRcdCAqIEBkZWZhdWx0ICBnbC5URVhUVVJFXzJEXG5cdFx0ICovXG5cdFx0dGhpcy50YXJnZXQgPSB0aGlzLmNvbnRleHQuZ2wuVEVYVFVSRV8yRDtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSB3aWR0aCBvZiB0aGlzIHRleHR1cmUsIGluIHBpeGVscy5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkgd2lkdGhcblx0XHQgKiBAcmVhZE9ubHlcblx0XHQgKiBAdHlwZSB7TnVtYmVyfSB0aGUgd2lkdGhcblx0XHQgKi9cblx0XHR0aGlzLndpZHRoID0gMDsgLy9pbml0aWFsaXplZCBvbiB0ZXh0dXJlIHVwbG9hZFxuXG5cdFx0LyoqXG5cdFx0ICogVGhlIGhlaWdodCBvZiB0aGlzIHRleHR1cmUsIGluIHBpeGVscy5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkgaGVpZ2h0XG5cdFx0ICogQHJlYWRPbmx5XG5cdFx0ICogQHR5cGUge051bWJlcn0gdGhlIGhlaWdodFxuXHRcdCAqL1xuXHRcdHRoaXMuaGVpZ2h0ID0gMDsgLy9pbml0aWFsaXplZCBvbiB0ZXh0dXJlIHVwbG9hZFxuXG5cdFx0Ly8gZS5nLiAtLT4gbmV3IFRleHR1cmUoZ2wsIDI1NiwgMjU2LCBnbC5SR0IsIGdsLlVOU0lHTkVEX0JZVEUsIGRhdGEpO1xuXHRcdC8vXHRcdCAgICAgIGNyZWF0ZXMgYSBuZXcgZW1wdHkgdGV4dHVyZSwgMjU2eDI1NlxuXHRcdC8vXHRcdC0tPiBuZXcgVGV4dHVyZShnbCk7XG5cdFx0Ly9cdFx0XHQgIGNyZWF0ZXMgYSBuZXcgdGV4dHVyZSBidXQgV0lUSE9VVCB1cGxvYWRpbmcgYW55IGRhdGEuIFxuXG5cdFx0LyoqXG5cdFx0ICogVGhlIFMgd3JhcCBwYXJhbWV0ZXIuXG5cdFx0ICogQHByb3BlcnR5IHtHTGVudW19IHdyYXBTXG5cdFx0ICovXG5cdFx0dGhpcy53cmFwUyA9IFRleHR1cmUuREVGQVVMVF9XUkFQO1xuXHRcdC8qKlxuXHRcdCAqIFRoZSBUIHdyYXAgcGFyYW1ldGVyLlxuXHRcdCAqIEBwcm9wZXJ0eSB7R0xlbnVtfSB3cmFwVFxuXHRcdCAqL1xuXHRcdHRoaXMud3JhcFQgPSBUZXh0dXJlLkRFRkFVTFRfV1JBUDtcblx0XHQvKipcblx0XHQgKiBUaGUgbWluaWZjYXRpb24gZmlsdGVyLlxuXHRcdCAqIEBwcm9wZXJ0eSB7R0xlbnVtfSBtaW5GaWx0ZXIgXG5cdFx0ICovXG5cdFx0dGhpcy5taW5GaWx0ZXIgPSBUZXh0dXJlLkRFRkFVTFRfRklMVEVSO1xuXHRcdFxuXHRcdC8qKlxuXHRcdCAqIFRoZSBtYWduaWZpY2F0aW9uIGZpbHRlci5cblx0XHQgKiBAcHJvcGVydHkge0dMZW51bX0gbWFnRmlsdGVyIFxuXHRcdCAqL1xuXHRcdHRoaXMubWFnRmlsdGVyID0gVGV4dHVyZS5ERUZBVUxUX0ZJTFRFUjtcblxuXHRcdC8vbWFuYWdlIGlmIHdlJ3JlIGRlYWxpbmcgd2l0aCBhIGthbWktY29udGV4dFxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFRoaXMgY2FuIGJlIGNhbGxlZCBhZnRlciBjcmVhdGluZyBhIFRleHR1cmUgdG8gbG9hZCBhbiBJbWFnZSBvYmplY3QgYXN5bmNocm9ub3VzbHksXG5cdCAqIG9yIHVwbG9hZCBpbWFnZSBkYXRhIGRpcmVjdGx5LiBJdCB0YWtlcyB0aGUgc2FtZSBvcHRpb25zIGFzIHRoZSBjb25zdHJ1Y3Rvci5cblx0ICpcblx0ICogVXNlcnMgd2lsbCBnZW5lcmFsbHkgbm90IG5lZWQgdG8gY2FsbCB0aGlzIGRpcmVjdGx5LiBcblx0ICogXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICogQG1ldGhvZCAgc2V0dXBcblx0ICovXG5cdHNldHVwOiBmdW5jdGlvbihvcHRpb25zKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdC8vSWYgbm8gb3B0aW9ucyBpcyBwcm92aWRlZC4uLiB0aGlzIG1ldGhvZCBkb2VzIG5vdGhpbmcuXG5cdFx0aWYgKCFvcHRpb25zKVxuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Ly8gd2lkdGgsIGhlaWdodCwgZm9ybWF0LCBkYXRhVHlwZSwgZGF0YSwgZ2VuTWlwbWFwc1xuXG5cdFx0Ly9JZiAnc3JjJyBpcyBwcm92aWRlZCwgdHJ5IHRvIGxvYWQgdGhlIGltYWdlIGZyb20gYSBwYXRoLi4uXG5cdFx0aWYgKG9wdGlvbnMuc3JjICYmIHR5cGVvZiBvcHRpb25zLnNyYz09PVwic3RyaW5nXCIpIHtcblx0XHRcdHZhciBpbWcgPSBuZXcgSW1hZ2UoKTtcblx0XHRcdHZhciBwYXRoICAgICAgID0gb3B0aW9ucy5zcmM7XG5cdFx0XHR2YXIgc3VjY2Vzc0NCICA9IHR5cGVvZiBvcHRpb25zLm9uTG9hZCA9PT0gXCJmdW5jdGlvblwiID8gb3B0aW9ucy5vbkxvYWQgOiBudWxsO1xuXHRcdFx0dmFyIGZhaWxDQiAgICAgPSB0eXBlb2Ygb3B0aW9ucy5vbkVycm9yID09PSBcImZ1bmN0aW9uXCIgPyBvcHRpb25zLm9uRXJyb3IgOiBudWxsO1xuXHRcdFx0dmFyIGdlbk1pcG1hcHMgPSBvcHRpb25zLmdlbk1pcG1hcHM7XG5cblx0XHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdFx0Ly9JZiB5b3UgdHJ5IHRvIHJlbmRlciBhIHRleHR1cmUgdGhhdCBpcyBub3QgeWV0IFwicmVuZGVyYWJsZVwiIChpLmUuIHRoZSBcblx0XHRcdC8vYXN5bmMgbG9hZCBoYXNuJ3QgY29tcGxldGVkIHlldCwgd2hpY2ggaXMgYWx3YXlzIHRoZSBjYXNlIGluIENocm9tZSBzaW5jZSByZXF1ZXN0QW5pbWF0aW9uRnJhbWVcblx0XHRcdC8vZmlyZXMgYmVmb3JlIGltZy5vbmxvYWQpLCBXZWJHTCB3aWxsIHRocm93IHVzIGVycm9ycy4gU28gaW5zdGVhZCB3ZSB3aWxsIGp1c3QgdXBsb2FkIHNvbWVcblx0XHRcdC8vZHVtbXkgZGF0YSB1bnRpbCB0aGUgdGV4dHVyZSBsb2FkIGlzIGNvbXBsZXRlLiBVc2VycyBjYW4gZGlzYWJsZSB0aGlzIHdpdGggdGhlIGdsb2JhbCBmbGFnLlxuXHRcdFx0aWYgKFRleHR1cmUuVVNFX0RVTU1ZXzF4MV9EQVRBKSB7XG5cdFx0XHRcdHNlbGYudXBsb2FkRGF0YSgxLCAxKTtcblx0XHRcdFx0dGhpcy53aWR0aCA9IHRoaXMuaGVpZ2h0ID0gMDtcblx0XHRcdH1cblxuXHRcdFx0aW1nLm9ubG9hZCA9IGZ1bmN0aW9uKGV2KSB7XG5cdFx0XHRcdHNlbGYudXBsb2FkSW1hZ2UoaW1nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZ2VuTWlwbWFwcyk7XG5cdFx0XHRcdGlmIChzdWNjZXNzQ0IpXG5cdFx0XHRcdFx0c3VjY2Vzc0NCKGV2KTtcblx0XHRcdH1cblx0XHRcdGltZy5vbmVycm9yID0gZnVuY3Rpb24oZXYpIHtcblx0XHRcdFx0aWYgKGdlbk1pcG1hcHMpIC8vd2Ugc3RpbGwgbmVlZCB0byBnZW4gbWlwbWFwcyBvbiB0aGUgMXgxIGR1bW15XG5cdFx0XHRcdFx0Z2wuZ2VuZXJhdGVNaXBtYXAoZ2wuVEVYVFVSRV8yRCk7XG5cdFx0XHRcdGlmIChmYWlsQ0IpXG5cdFx0XHRcdFx0ZmFpbENCKGV2KTtcblx0XHRcdH1cblx0XHRcdGltZy5vbmFib3J0ID0gZnVuY3Rpb24oZXYpIHtcblx0XHRcdFx0aWYgKGdlbk1pcG1hcHMpIFxuXHRcdFx0XHRcdGdsLmdlbmVyYXRlTWlwbWFwKGdsLlRFWFRVUkVfMkQpO1xuXHRcdFx0XHRpZiAoZmFpbENCKVxuXHRcdFx0XHRcdGZhaWxDQihldik7XG5cdFx0XHR9XG5cblx0XHRcdGltZy5zcmMgPSBwYXRoO1xuXHRcdH0gXG5cdFx0Ly9vdGhlcndpc2UgYXNzdW1lIG91ciByZWd1bGFyIGxpc3Qgb2Ygd2lkdGgvaGVpZ2h0IGFyZ3VtZW50cyBhcmUgcGFzc2VkXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLnVwbG9hZERhdGEob3B0aW9ucy53aWR0aCwgb3B0aW9ucy5oZWlnaHQsIG9wdGlvbnMuZm9ybWF0LCBcblx0XHRcdFx0XHRcdFx0b3B0aW9ucy5kYXRhVHlwZSwgb3B0aW9ucy5kYXRhLCBvcHRpb25zLmdlbk1pcG1hcHMpO1xuXHRcdH1cblx0fSxcdFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgaW4gdGhlIFRleHR1cmUgY29uc3RydWN0b3IsIGFuZCBhZnRlciB0aGUgR0wgY29udGV4dCBoYXMgYmVlbiByZS1pbml0aWFsaXplZC4gXG5cdCAqIFN1YmNsYXNzZXMgY2FuIG92ZXJyaWRlIHRoaXMgdG8gcHJvdmlkZSBhIGN1c3RvbSBkYXRhIHVwbG9hZCwgZS5nLiBjdWJlbWFwcyBvciBjb21wcmVzc2VkXG5cdCAqIHRleHR1cmVzLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBjcmVhdGVcblx0ICovXG5cdGNyZWF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbCA9IHRoaXMuY29udGV4dC5nbDsgXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHRoaXMuaWQgPSBnbC5jcmVhdGVUZXh0dXJlKCk7IC8vdGV4dHVyZSBJRCBpcyByZWNyZWF0ZWRcblx0XHR0aGlzLndpZHRoID0gdGhpcy5oZWlnaHQgPSAwOyAvL3NpemUgaXMgcmVzZXQgdG8gemVybyB1bnRpbCBsb2FkZWRcblx0XHR0aGlzLnRhcmdldCA9IGdsLlRFWFRVUkVfMkQ7ICAvL3RoZSBwcm92aWRlciBjYW4gY2hhbmdlIHRoaXMgaWYgbmVjZXNzYXJ5IChlLmcuIGN1YmUgbWFwcylcblxuXHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0Ly9UT0RPOiBjbGVhbiB0aGVzZSB1cCBhIGxpdHRsZS4gXG5cdFx0Z2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCBUZXh0dXJlLlVOUEFDS19QUkVNVUxUSVBMWV9BTFBIQSk7XG5cdFx0Z2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX0FMSUdOTUVOVCwgVGV4dHVyZS5VTlBBQ0tfQUxJR05NRU5UKTtcblx0XHRnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfRkxJUF9ZX1dFQkdMLCBUZXh0dXJlLlVOUEFDS19GTElQX1kpO1xuXHRcdFxuXHRcdHZhciBjb2xvcnNwYWNlID0gVGV4dHVyZS5VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OIHx8IGdsLkJST1dTRVJfREVGQVVMVF9XRUJHTDtcblx0XHRnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCBjb2xvcnNwYWNlKTtcblxuXHRcdC8vc2V0dXAgd3JhcCBtb2RlcyB3aXRob3V0IGJpbmRpbmcgcmVkdW5kYW50bHlcblx0XHR0aGlzLnNldFdyYXAodGhpcy53cmFwUywgdGhpcy53cmFwVCwgZmFsc2UpO1xuXHRcdHRoaXMuc2V0RmlsdGVyKHRoaXMubWluRmlsdGVyLCB0aGlzLm1hZ0ZpbHRlciwgZmFsc2UpO1xuXHRcdFxuXHRcdGlmICh0aGlzLm1hbmFnZWRBcmdzKSB7XG5cdFx0XHR0aGlzLnNldHVwKHRoaXMubWFuYWdlZEFyZ3MpO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogRGVzdHJveXMgdGhpcyB0ZXh0dXJlIGJ5IGRlbGV0aW5nIHRoZSBHTCByZXNvdXJjZSxcblx0ICogcmVtb3ZpbmcgaXQgZnJvbSB0aGUgV2ViR0xDb250ZXh0IG1hbmFnZW1lbnQgc3RhY2ssXG5cdCAqIHNldHRpbmcgaXRzIHNpemUgdG8gemVybywgYW5kIGlkIGFuZCBtYW5hZ2VkIGFyZ3VtZW50cyB0byBudWxsLlxuXHQgKiBcblx0ICogVHJ5aW5nIHRvIHVzZSB0aGlzIHRleHR1cmUgYWZ0ZXIgbWF5IGxlYWQgdG8gdW5kZWZpbmVkIGJlaGF2aW91ci5cblx0ICpcblx0ICogQG1ldGhvZCAgZGVzdHJveVxuXHQgKi9cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaWQgJiYgdGhpcy5nbClcblx0XHRcdHRoaXMuZ2wuZGVsZXRlVGV4dHVyZSh0aGlzLmlkKTtcblx0XHRpZiAodGhpcy5jb250ZXh0KVxuXHRcdFx0dGhpcy5jb250ZXh0LnJlbW92ZU1hbmFnZWRPYmplY3QodGhpcyk7XG5cdFx0dGhpcy53aWR0aCA9IHRoaXMuaGVpZ2h0ID0gMDtcblx0XHR0aGlzLmlkID0gbnVsbDtcblx0XHR0aGlzLm1hbmFnZWRBcmdzID0gbnVsbDtcblx0XHR0aGlzLmNvbnRleHQgPSBudWxsO1xuXHRcdHRoaXMuZ2wgPSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSB3cmFwIG1vZGUgZm9yIHRoaXMgdGV4dHVyZTsgaWYgdGhlIHNlY29uZCBhcmd1bWVudFxuXHQgKiBpcyB1bmRlZmluZWQgb3IgZmFsc3ksIHRoZW4gYm90aCBTIGFuZCBUIHdyYXAgd2lsbCB1c2UgdGhlIGZpcnN0XG5cdCAqIGFyZ3VtZW50LlxuXHQgKlxuXHQgKiBZb3UgY2FuIHVzZSBUZXh0dXJlLldyYXAgY29uc3RhbnRzIGZvciBjb252ZW5pZW5jZSwgdG8gYXZvaWQgbmVlZGluZyBcblx0ICogYSBHTCByZWZlcmVuY2UuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHNldFdyYXBcblx0ICogQHBhcmFtIHtHTGVudW19IHMgdGhlIFMgd3JhcCBtb2RlXG5cdCAqIEBwYXJhbSB7R0xlbnVtfSB0IHRoZSBUIHdyYXAgbW9kZVxuXHQgKiBAcGFyYW0ge0Jvb2xlYW59IGlnbm9yZUJpbmQgKG9wdGlvbmFsKSBpZiB0cnVlLCB0aGUgYmluZCB3aWxsIGJlIGlnbm9yZWQuIFxuXHQgKi9cblx0c2V0V3JhcDogZnVuY3Rpb24ocywgdCwgaWdub3JlQmluZCkgeyAvL1RPRE86IHN1cHBvcnQgUiB3cmFwIG1vZGVcblx0XHRpZiAocyAmJiB0KSB7XG5cdFx0XHR0aGlzLndyYXBTID0gcztcblx0XHRcdHRoaXMud3JhcFQgPSB0O1xuXHRcdH0gZWxzZSBcblx0XHRcdHRoaXMud3JhcFMgPSB0aGlzLndyYXBUID0gcztcblx0XHRcblx0XHQvL2VuZm9yY2UgUE9UIHJ1bGVzLi5cblx0XHR0aGlzLl9jaGVja1BPVCgpO1x0XG5cblx0XHRpZiAoIWlnbm9yZUJpbmQpXG5cdFx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0Z2wudGV4UGFyYW1ldGVyaSh0aGlzLnRhcmdldCwgZ2wuVEVYVFVSRV9XUkFQX1MsIHRoaXMud3JhcFMpO1xuXHRcdGdsLnRleFBhcmFtZXRlcmkodGhpcy50YXJnZXQsIGdsLlRFWFRVUkVfV1JBUF9ULCB0aGlzLndyYXBUKTtcblx0fSxcblxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBtaW4gYW5kIG1hZyBmaWx0ZXIgZm9yIHRoaXMgdGV4dHVyZTsgXG5cdCAqIGlmIG1hZyBpcyB1bmRlZmluZWQgb3IgZmFsc3ksIHRoZW4gYm90aCBtaW4gYW5kIG1hZyB3aWxsIHVzZSB0aGVcblx0ICogZmlsdGVyIHNwZWNpZmllZCBmb3IgbWluLlxuXHQgKlxuXHQgKiBZb3UgY2FuIHVzZSBUZXh0dXJlLkZpbHRlciBjb25zdGFudHMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCBuZWVkaW5nIFxuXHQgKiBhIEdMIHJlZmVyZW5jZS5cblx0ICpcblx0ICogQG1ldGhvZCAgc2V0RmlsdGVyXG5cdCAqIEBwYXJhbSB7R0xlbnVtfSBtaW4gdGhlIG1pbmlmaWNhdGlvbiBmaWx0ZXJcblx0ICogQHBhcmFtIHtHTGVudW19IG1hZyB0aGUgbWFnbmlmaWNhdGlvbiBmaWx0ZXJcblx0ICogQHBhcmFtIHtCb29sZWFufSBpZ25vcmVCaW5kIGlmIHRydWUsIHRoZSBiaW5kIHdpbGwgYmUgaWdub3JlZC4gXG5cdCAqL1xuXHRzZXRGaWx0ZXI6IGZ1bmN0aW9uKG1pbiwgbWFnLCBpZ25vcmVCaW5kKSB7IFxuXHRcdGlmIChtaW4gJiYgbWFnKSB7XG5cdFx0XHR0aGlzLm1pbkZpbHRlciA9IG1pbjtcblx0XHRcdHRoaXMubWFnRmlsdGVyID0gbWFnO1xuXHRcdH0gZWxzZSBcblx0XHRcdHRoaXMubWluRmlsdGVyID0gdGhpcy5tYWdGaWx0ZXIgPSBtaW47XG5cdFx0XG5cdFx0Ly9lbmZvcmNlIFBPVCBydWxlcy4uXG5cdFx0dGhpcy5fY2hlY2tQT1QoKTtcblxuXHRcdGlmICghaWdub3JlQmluZClcblx0XHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX01JTl9GSUxURVIsIHRoaXMubWluRmlsdGVyKTtcblx0XHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX01BR19GSUxURVIsIHRoaXMubWFnRmlsdGVyKTtcblx0fSxcblxuXHQvKipcblx0ICogQSBsb3ctbGV2ZWwgbWV0aG9kIHRvIHVwbG9hZCB0aGUgc3BlY2lmaWVkIEFycmF5QnVmZmVyVmlld1xuXHQgKiB0byB0aGlzIHRleHR1cmUuIFRoaXMgd2lsbCBjYXVzZSB0aGUgd2lkdGggYW5kIGhlaWdodCBvZiB0aGlzXG5cdCAqIHRleHR1cmUgdG8gY2hhbmdlLlxuXHQgKlxuXHQgKiBAbWV0aG9kICB1cGxvYWREYXRhXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICAgICAgICAgdGhlIG5ldyB3aWR0aCBvZiB0aGlzIHRleHR1cmUsXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHMgdG8gdGhlIGxhc3QgdXNlZCB3aWR0aCAob3IgemVybylcblx0ICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgICAgICAgICB0aGUgbmV3IGhlaWdodCBvZiB0aGlzIHRleHR1cmVcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0cyB0byB0aGUgbGFzdCB1c2VkIGhlaWdodCAob3IgemVybylcblx0ICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgICAgICAgICB0aGUgZGF0YSBmb3JtYXQsIGRlZmF1bHQgUkdCQVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IHR5cGUgICAgICAgICAgIHRoZSBkYXRhIHR5cGUsIGRlZmF1bHQgVU5TSUdORURfQllURSAoVWludDhBcnJheSlcblx0ICogQHBhcmFtICB7QXJyYXlCdWZmZXJWaWV3fSBkYXRhICB0aGUgcmF3IGRhdGEgZm9yIHRoaXMgdGV4dHVyZSwgb3IgbnVsbCBmb3IgYW4gZW1wdHkgaW1hZ2Vcblx0ICogQHBhcmFtICB7Qm9vbGVhbn0gZ2VuTWlwbWFwc1x0ICAgd2hldGhlciB0byBnZW5lcmF0ZSBtaXBtYXBzIGFmdGVyIHVwbG9hZGluZyB0aGUgZGF0YSwgZGVmYXVsdCBmYWxzZVxuXHQgKi9cblx0dXBsb2FkRGF0YTogZnVuY3Rpb24od2lkdGgsIGhlaWdodCwgZm9ybWF0LCB0eXBlLCBkYXRhLCBnZW5NaXBtYXBzKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdGZvcm1hdCA9IGZvcm1hdCB8fCBnbC5SR0JBO1xuXHRcdHR5cGUgPSB0eXBlIHx8IGdsLlVOU0lHTkVEX0JZVEU7XG5cdFx0ZGF0YSA9IGRhdGEgfHwgbnVsbDsgLy9tYWtlIHN1cmUgZmFsc2V5IHZhbHVlIGlzIG51bGwgZm9yIHRleEltYWdlMkRcblxuXHRcdHRoaXMud2lkdGggPSAod2lkdGggfHwgd2lkdGg9PTApID8gd2lkdGggOiB0aGlzLndpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gKGhlaWdodCB8fCBoZWlnaHQ9PTApID8gaGVpZ2h0IDogdGhpcy5oZWlnaHQ7XG5cblx0XHR0aGlzLl9jaGVja1BPVCgpO1xuXG5cdFx0dGhpcy5iaW5kKCk7XG5cblx0XHRnbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCBmb3JtYXQsIFxuXHRcdFx0XHRcdCAgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQsIDAsIGZvcm1hdCxcblx0XHRcdFx0XHQgIHR5cGUsIGRhdGEpO1xuXG5cdFx0aWYgKGdlbk1pcG1hcHMpXG5cdFx0XHRnbC5nZW5lcmF0ZU1pcG1hcCh0aGlzLnRhcmdldCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFVwbG9hZHMgSW1hZ2VEYXRhLCBIVE1MSW1hZ2VFbGVtZW50LCBIVE1MQ2FudmFzRWxlbWVudCBvciBcblx0ICogSFRNTFZpZGVvRWxlbWVudC5cblx0ICpcblx0ICogQG1ldGhvZCAgdXBsb2FkSW1hZ2Vcblx0ICogQHBhcmFtICB7T2JqZWN0fSBkb21PYmplY3QgdGhlIERPTSBpbWFnZSBjb250YWluZXJcblx0ICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgdGhlIGZvcm1hdCwgZGVmYXVsdCBnbC5SR0JBXG5cdCAqIEBwYXJhbSAge0dMZW51bX0gdHlwZSB0aGUgZGF0YSB0eXBlLCBkZWZhdWx0IGdsLlVOU0lHTkVEX0JZVEVcblx0ICogQHBhcmFtICB7Qm9vbGVhbn0gZ2VuTWlwbWFwcyB3aGV0aGVyIHRvIGdlbmVyYXRlIG1pcG1hcHMgYWZ0ZXIgdXBsb2FkaW5nIHRoZSBkYXRhLCBkZWZhdWx0IGZhbHNlXG5cdCAqL1xuXHR1cGxvYWRJbWFnZTogZnVuY3Rpb24oZG9tT2JqZWN0LCBmb3JtYXQsIHR5cGUsIGdlbk1pcG1hcHMpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0Zm9ybWF0ID0gZm9ybWF0IHx8IGdsLlJHQkE7XG5cdFx0dHlwZSA9IHR5cGUgfHwgZ2wuVU5TSUdORURfQllURTtcblx0XHRcblx0XHR0aGlzLndpZHRoID0gZG9tT2JqZWN0LndpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gZG9tT2JqZWN0LmhlaWdodDtcblxuXHRcdHRoaXMuX2NoZWNrUE9UKCk7XG5cblx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdGdsLnRleEltYWdlMkQodGhpcy50YXJnZXQsIDAsIGZvcm1hdCwgZm9ybWF0LFxuXHRcdFx0XHRcdCAgdHlwZSwgZG9tT2JqZWN0KTtcblxuXHRcdGlmIChnZW5NaXBtYXBzKVxuXHRcdFx0Z2wuZ2VuZXJhdGVNaXBtYXAodGhpcy50YXJnZXQpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBJZiBGT1JDRV9QT1QgaXMgZmFsc2UsIHdlIHZlcmlmeSB0aGlzIHRleHR1cmUgdG8gc2VlIGlmIGl0IGlzIHZhbGlkLCBcblx0ICogYXMgcGVyIG5vbi1wb3dlci1vZi10d28gcnVsZXMuIElmIGl0IGlzIG5vbi1wb3dlci1vZi10d28sIGl0IG11c3QgaGF2ZSBcblx0ICogYSB3cmFwIG1vZGUgb2YgQ0xBTVBfVE9fRURHRSwgYW5kIHRoZSBtaW5pZmljYXRpb24gZmlsdGVyIG11c3QgYmUgTElORUFSXG5cdCAqIG9yIE5FQVJFU1QuIElmIHdlIGRvbid0IHNhdGlzZnkgdGhlc2UgbmVlZHMsIGFuIGVycm9yIGlzIHRocm93bi5cblx0ICogXG5cdCAqIEBtZXRob2QgIF9jaGVja1BPVFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcmV0dXJuIHtbdHlwZV19IFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdF9jaGVja1BPVDogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCFUZXh0dXJlLkZPUkNFX1BPVCkge1xuXHRcdFx0Ly9JZiBtaW5GaWx0ZXIgaXMgYW55dGhpbmcgYnV0IExJTkVBUiBvciBORUFSRVNUXG5cdFx0XHQvL29yIGlmIHdyYXBTIG9yIHdyYXBUIGFyZSBub3QgQ0xBTVBfVE9fRURHRS4uLlxuXHRcdFx0dmFyIHdyb25nRmlsdGVyID0gKHRoaXMubWluRmlsdGVyICE9PSBUZXh0dXJlLkZpbHRlci5MSU5FQVIgJiYgdGhpcy5taW5GaWx0ZXIgIT09IFRleHR1cmUuRmlsdGVyLk5FQVJFU1QpO1xuXHRcdFx0dmFyIHdyb25nV3JhcCA9ICh0aGlzLndyYXBTICE9PSBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRSB8fCB0aGlzLndyYXBUICE9PSBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRSk7XG5cblx0XHRcdGlmICggd3JvbmdGaWx0ZXIgfHwgd3JvbmdXcmFwICkge1xuXHRcdFx0XHRpZiAoIWlzUG93ZXJPZlR3byh0aGlzLndpZHRoKSB8fCAhaXNQb3dlck9mVHdvKHRoaXMuaGVpZ2h0KSlcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3Iod3JvbmdGaWx0ZXIgXG5cdFx0XHRcdFx0XHRcdD8gXCJOb24tcG93ZXItb2YtdHdvIHRleHR1cmVzIGNhbm5vdCB1c2UgbWlwbWFwcGluZyBhcyBmaWx0ZXJcIlxuXHRcdFx0XHRcdFx0XHQ6IFwiTm9uLXBvd2VyLW9mLXR3byB0ZXh0dXJlcyBtdXN0IHVzZSBDTEFNUF9UT19FREdFIGFzIHdyYXBcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBCaW5kcyB0aGUgdGV4dHVyZS4gSWYgdW5pdCBpcyBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgYmluZCB0aGUgdGV4dHVyZSBhdCB0aGUgZ2l2ZW4gc2xvdFxuXHQgKiAoVEVYVFVSRTAsIFRFWFRVUkUxLCBldGMpLiBJZiB1bml0IGlzIG5vdCBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgc2ltcGx5IGJpbmQgdGhlIHRleHR1cmUgYXQgd2hpY2hldmVyIHNsb3Rcblx0ICogaXMgY3VycmVudGx5IGFjdGl2ZS5cblx0ICpcblx0ICogQG1ldGhvZCAgYmluZFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHVuaXQgdGhlIHRleHR1cmUgdW5pdCBpbmRleCwgc3RhcnRpbmcgYXQgMFxuXHQgKi9cblx0YmluZDogZnVuY3Rpb24odW5pdCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0aWYgKHVuaXQgfHwgdW5pdCA9PT0gMClcblx0XHRcdGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyB1bml0KTtcblx0XHRnbC5iaW5kVGV4dHVyZSh0aGlzLnRhcmdldCwgdGhpcy5pZCk7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmlkICsgXCI6XCIgKyB0aGlzLndpZHRoICsgXCJ4XCIgKyB0aGlzLmhlaWdodCArIFwiXCI7XG5cdH1cbn0pO1xuXG4vKiogXG4gKiBBIHNldCBvZiBGaWx0ZXIgY29uc3RhbnRzIHRoYXQgbWF0Y2ggdGhlaXIgR0wgY291bnRlcnBhcnRzLlxuICogVGhpcyBpcyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIHRoZSBuZWVkIGZvciBhIEdMIHJlbmRlcmluZyBjb250ZXh0LlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGBcbiAqICAgICBUZXh0dXJlLkZpbHRlci5ORUFSRVNUXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVF9NSVBNQVBfTElORUFSXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVF9NSVBNQVBfTkVBUkVTVFxuICogICAgIFRleHR1cmUuRmlsdGVyLkxJTkVBUlxuICogICAgIFRleHR1cmUuRmlsdGVyLkxJTkVBUl9NSVBNQVBfTElORUFSXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTElORUFSX01JUE1BUF9ORUFSRVNUXG4gKiBgYGBcbiAqIEBhdHRyaWJ1dGUgRmlsdGVyXG4gKiBAc3RhdGljXG4gKiBAdHlwZSB7T2JqZWN0fVxuICovXG5UZXh0dXJlLkZpbHRlciA9IHtcblx0TkVBUkVTVDogOTcyOCxcblx0TkVBUkVTVF9NSVBNQVBfTElORUFSOiA5OTg2LFxuXHRORUFSRVNUX01JUE1BUF9ORUFSRVNUOiA5OTg0LFxuXHRMSU5FQVI6IDk3MjksXG5cdExJTkVBUl9NSVBNQVBfTElORUFSOiA5OTg3LFxuXHRMSU5FQVJfTUlQTUFQX05FQVJFU1Q6IDk5ODVcbn07XG5cbi8qKiBcbiAqIEEgc2V0IG9mIFdyYXAgY29uc3RhbnRzIHRoYXQgbWF0Y2ggdGhlaXIgR0wgY291bnRlcnBhcnRzLlxuICogVGhpcyBpcyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIHRoZSBuZWVkIGZvciBhIEdMIHJlbmRlcmluZyBjb250ZXh0LlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGBcbiAqICAgICBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRVxuICogICAgIFRleHR1cmUuV3JhcC5NSVJST1JFRF9SRVBFQVRcbiAqICAgICBUZXh0dXJlLldyYXAuUkVQRUFUXG4gKiBgYGBcbiAqIEBhdHRyaWJ1dGUgV3JhcFxuICogQHN0YXRpY1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuVGV4dHVyZS5XcmFwID0ge1xuXHRDTEFNUF9UT19FREdFOiAzMzA3MSxcblx0TUlSUk9SRURfUkVQRUFUOiAzMzY0OCxcblx0UkVQRUFUOiAxMDQ5N1xufTtcblxuLyoqIFxuICogQSBzZXQgb2YgRm9ybWF0IGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5Gb3JtYXQuUkdCXG4gKiAgICAgVGV4dHVyZS5Gb3JtYXQuUkdCQVxuICogICAgIFRleHR1cmUuRm9ybWF0LkxVTUlOQU5DRV9BTFBIQVxuICogYGBgXG4gKiBAYXR0cmlidXRlIEZvcm1hdFxuICogQHN0YXRpY1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuVGV4dHVyZS5Gb3JtYXQgPSB7XG5cdERFUFRIX0NPTVBPTkVOVDogNjQwMixcblx0QUxQSEE6IDY0MDYsXG5cdFJHQkE6IDY0MDgsXG5cdFJHQjogNjQwNyxcblx0TFVNSU5BTkNFOiA2NDA5LFxuXHRMVU1JTkFOQ0VfQUxQSEE6IDY0MTBcbn07XG5cbi8qKiBcbiAqIEEgc2V0IG9mIERhdGFUeXBlIGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5EYXRhVHlwZS5VTlNJR05FRF9CWVRFIFxuICogICAgIFRleHR1cmUuRGF0YVR5cGUuRkxPQVQgXG4gKiBgYGBcbiAqIEBhdHRyaWJ1dGUgRGF0YVR5cGVcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblRleHR1cmUuRGF0YVR5cGUgPSB7XG5cdEJZVEU6IDUxMjAsXG5cdFNIT1JUOiA1MTIyLFxuXHRJTlQ6IDUxMjQsXG5cdEZMT0FUOiA1MTI2LFxuXHRVTlNJR05FRF9CWVRFOiA1MTIxLFxuXHRVTlNJR05FRF9JTlQ6IDUxMjUsXG5cdFVOU0lHTkVEX1NIT1JUOiA1MTIzLFxuXHRVTlNJR05FRF9TSE9SVF80XzRfNF80OiAzMjgxOSxcblx0VU5TSUdORURfU0hPUlRfNV81XzVfMTogMzI4MjAsXG5cdFVOU0lHTkVEX1NIT1JUXzVfNl81OiAzMzYzNVxufVxuXG4vKipcbiAqIFRoZSBkZWZhdWx0IHdyYXAgbW9kZSB3aGVuIGNyZWF0aW5nIG5ldyB0ZXh0dXJlcy4gSWYgYSBjdXN0b20gXG4gKiBwcm92aWRlciB3YXMgc3BlY2lmaWVkLCBpdCBtYXkgY2hvb3NlIHRvIG92ZXJyaWRlIHRoaXMgZGVmYXVsdCBtb2RlLlxuICogXG4gKiBAYXR0cmlidXRlIHtHTGVudW19IERFRkFVTFRfV1JBUFxuICogQHN0YXRpYyBcbiAqIEBkZWZhdWx0ICBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRVxuICovXG5UZXh0dXJlLkRFRkFVTFRfV1JBUCA9IFRleHR1cmUuV3JhcC5DTEFNUF9UT19FREdFO1xuXG5cbi8qKlxuICogVGhlIGRlZmF1bHQgZmlsdGVyIG1vZGUgd2hlbiBjcmVhdGluZyBuZXcgdGV4dHVyZXMuIElmIGEgY3VzdG9tXG4gKiBwcm92aWRlciB3YXMgc3BlY2lmaWVkLCBpdCBtYXkgY2hvb3NlIHRvIG92ZXJyaWRlIHRoaXMgZGVmYXVsdCBtb2RlLlxuICpcbiAqIEBhdHRyaWJ1dGUge0dMZW51bX0gREVGQVVMVF9GSUxURVJcbiAqIEBzdGF0aWNcbiAqIEBkZWZhdWx0ICBUZXh0dXJlLkZpbHRlci5MSU5FQVJcbiAqL1xuVGV4dHVyZS5ERUZBVUxUX0ZJTFRFUiA9IFRleHR1cmUuRmlsdGVyLk5FQVJFU1Q7XG5cbi8qKlxuICogQnkgZGVmYXVsdCwgd2UgZG8gc29tZSBlcnJvciBjaGVja2luZyB3aGVuIGNyZWF0aW5nIHRleHR1cmVzXG4gKiB0byBlbnN1cmUgdGhhdCB0aGV5IHdpbGwgYmUgXCJyZW5kZXJhYmxlXCIgYnkgV2ViR0wuIE5vbi1wb3dlci1vZi10d29cbiAqIHRleHR1cmVzIG11c3QgdXNlIENMQU1QX1RPX0VER0UgYXMgdGhlaXIgd3JhcCBtb2RlLCBhbmQgTkVBUkVTVCBvciBMSU5FQVJcbiAqIGFzIHRoZWlyIHdyYXAgbW9kZS4gRnVydGhlciwgdHJ5aW5nIHRvIGdlbmVyYXRlIG1pcG1hcHMgZm9yIGEgTlBPVCBpbWFnZVxuICogd2lsbCBsZWFkIHRvIGVycm9ycy4gXG4gKlxuICogSG93ZXZlciwgeW91IGNhbiBkaXNhYmxlIHRoaXMgZXJyb3IgY2hlY2tpbmcgYnkgc2V0dGluZyBgRk9SQ0VfUE9UYCB0byB0cnVlLlxuICogVGhpcyBtYXkgYmUgdXNlZnVsIGlmIHlvdSBhcmUgcnVubmluZyBvbiBzcGVjaWZpYyBoYXJkd2FyZSB0aGF0IHN1cHBvcnRzIFBPVCBcbiAqIHRleHR1cmVzLCBvciBpbiBzb21lIGZ1dHVyZSBjYXNlIHdoZXJlIE5QT1QgdGV4dHVyZXMgaXMgYWRkZWQgYXMgYSBXZWJHTCBleHRlbnNpb24uXG4gKiBcbiAqIEBhdHRyaWJ1dGUge0Jvb2xlYW59IEZPUkNFX1BPVFxuICogQHN0YXRpY1xuICogQGRlZmF1bHQgIGZhbHNlXG4gKi9cblRleHR1cmUuRk9SQ0VfUE9UID0gZmFsc2U7XG5cbi8vZGVmYXVsdCBwaXhlbCBzdG9yZSBvcGVyYXRpb25zLiBVc2VkIGluIGNyZWF0ZSgpXG5UZXh0dXJlLlVOUEFDS19GTElQX1kgPSBmYWxzZTtcblRleHR1cmUuVU5QQUNLX0FMSUdOTUVOVCA9IDE7XG5UZXh0dXJlLlVOUEFDS19QUkVNVUxUSVBMWV9BTFBIQSA9IHRydWU7IFxuVGV4dHVyZS5VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OID0gdW5kZWZpbmVkO1xuXG4vL2ZvciB0aGUgSW1hZ2UgY29uc3RydWN0b3Igd2UgbmVlZCB0byBoYW5kbGUgdGhpbmdzIGEgYml0IGRpZmZlcmVudGx5Li5cblRleHR1cmUuVVNFX0RVTU1ZXzF4MV9EQVRBID0gdHJ1ZTtcblxuLyoqXG4gKiBVdGlsaXR5IHRvIGdldCB0aGUgbnVtYmVyIG9mIGNvbXBvbmVudHMgZm9yIHRoZSBnaXZlbiBHTGVudW0sIGUuZy4gZ2wuUkdCQSByZXR1cm5zIDQuXG4gKiBSZXR1cm5zIG51bGwgaWYgdGhlIHNwZWNpZmllZCBmb3JtYXQgaXMgbm90IG9mIHR5cGUgREVQVEhfQ09NUE9ORU5ULCBBTFBIQSwgTFVNSU5BTkNFLFxuICogTFVNSU5BTkNFX0FMUEhBLCBSR0IsIG9yIFJHQkEuXG4gKiBcbiAqIEBtZXRob2QgZ2V0TnVtQ29tcG9uZW50c1xuICogQHN0YXRpY1xuICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgYSB0ZXh0dXJlIGZvcm1hdCwgaS5lLiBUZXh0dXJlLkZvcm1hdC5SR0JBXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IHRoZSBudW1iZXIgb2YgY29tcG9uZW50cyBmb3IgdGhpcyBmb3JtYXRcbiAqL1xuVGV4dHVyZS5nZXROdW1Db21wb25lbnRzID0gZnVuY3Rpb24oZm9ybWF0KSB7XG5cdHN3aXRjaCAoZm9ybWF0KSB7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5ERVBUSF9DT01QT05FTlQ6XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5BTFBIQTpcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkxVTUlOQU5DRTpcblx0XHRcdHJldHVybiAxO1xuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuTFVNSU5BTkNFX0FMUEhBOlxuXHRcdFx0cmV0dXJuIDI7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5SR0I6XG5cdFx0XHRyZXR1cm4gMztcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LlJHQkE6XG5cdFx0XHRyZXR1cm4gNDtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gVGV4dHVyZTsiLCJhcmd1bWVudHNbNF1bNV1bMF0uYXBwbHkoZXhwb3J0cyxhcmd1bWVudHMpIiwidmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG5cbi8vVGhpcyBpcyBhIEdMLXNwZWNpZmljIHRleHR1cmUgcmVnaW9uLCBlbXBsb3lpbmcgdGFuZ2VudCBzcGFjZSBub3JtYWxpemVkIGNvb3JkaW5hdGVzIFUgYW5kIFYuXG4vL0EgY2FudmFzLXNwZWNpZmljIHJlZ2lvbiB3b3VsZCByZWFsbHkganVzdCBiZSBhIGxpZ2h0d2VpZ2h0IG9iamVjdCB3aXRoIHsgeCwgeSwgd2lkdGgsIGhlaWdodCB9XG4vL2luIHBpeGVscy5cbnZhciBUZXh0dXJlUmVnaW9uID0gbmV3IENsYXNzKHtcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBUZXh0dXJlUmVnaW9uKHRleHR1cmUsIHgsIHksIHdpZHRoLCBoZWlnaHQpIHtcblx0XHR0aGlzLnRleHR1cmUgPSB0ZXh0dXJlO1xuXHRcdHRoaXMuc2V0UmVnaW9uKHgsIHksIHdpZHRoLCBoZWlnaHQpO1xuXHR9LFxuXG5cdHNldFVWczogZnVuY3Rpb24odSwgdiwgdTIsIHYyKSB7XG5cdFx0dGhpcy5yZWdpb25XaWR0aCA9IE1hdGgucm91bmQoTWF0aC5hYnModTIgLSB1KSAqIHRoaXMudGV4dHVyZS53aWR0aCk7XG4gICAgICAgIHRoaXMucmVnaW9uSGVpZ2h0ID0gTWF0aC5yb3VuZChNYXRoLmFicyh2MiAtIHYpICogdGhpcy50ZXh0dXJlLmhlaWdodCk7XG5cbiAgICAgICAgLy8gRnJvbSBMaWJHRFggVGV4dHVyZVJlZ2lvbi5qYXZhIC0tIFxuXHRcdC8vIEZvciBhIDF4MSByZWdpb24sIGFkanVzdCBVVnMgdG93YXJkIHBpeGVsIGNlbnRlciB0byBhdm9pZCBmaWx0ZXJpbmcgYXJ0aWZhY3RzIG9uIEFNRCBHUFVzIHdoZW4gZHJhd2luZyB2ZXJ5IHN0cmV0Y2hlZC5cblx0XHRpZiAodGhpcy5yZWdpb25XaWR0aCA9PSAxICYmIHRoaXMucmVnaW9uSGVpZ2h0ID09IDEpIHtcblx0XHRcdHZhciBhZGp1c3RYID0gMC4yNSAvIHRoaXMudGV4dHVyZS53aWR0aDtcblx0XHRcdHUgKz0gYWRqdXN0WDtcblx0XHRcdHUyIC09IGFkanVzdFg7XG5cdFx0XHR2YXIgYWRqdXN0WSA9IDAuMjUgLyB0aGlzLnRleHR1cmUuaGVpZ2h0O1xuXHRcdFx0diArPSBhZGp1c3RZO1xuXHRcdFx0djIgLT0gYWRqdXN0WTtcblx0XHR9XG5cblx0XHR0aGlzLnUgPSB1O1xuXHRcdHRoaXMudiA9IHY7XG5cdFx0dGhpcy51MiA9IHUyO1xuXHRcdHRoaXMudjIgPSB2Mjtcblx0fSxcblxuXHRzZXRSZWdpb246IGZ1bmN0aW9uKHgsIHksIHdpZHRoLCBoZWlnaHQpIHtcblx0XHR4ID0geCB8fCAwO1xuXHRcdHkgPSB5IHx8IDA7XG5cdFx0d2lkdGggPSAod2lkdGg9PT0wIHx8IHdpZHRoKSA/IHdpZHRoIDogdGhpcy50ZXh0dXJlLndpZHRoO1xuXHRcdGhlaWdodCA9IChoZWlnaHQ9PT0wIHx8IGhlaWdodCkgPyBoZWlnaHQgOiB0aGlzLnRleHR1cmUuaGVpZ2h0O1xuXG5cdFx0dmFyIGludlRleFdpZHRoID0gMSAvIHRoaXMudGV4dHVyZS53aWR0aDtcblx0XHR2YXIgaW52VGV4SGVpZ2h0ID0gMSAvIHRoaXMudGV4dHVyZS5oZWlnaHQ7XG5cdFx0dGhpcy5zZXRVVnMoeCAqIGludlRleFdpZHRoLCB5ICogaW52VGV4SGVpZ2h0LCAoeCArIHdpZHRoKSAqIGludlRleFdpZHRoLCAoeSArIGhlaWdodCkgKiBpbnZUZXhIZWlnaHQpO1xuXHRcdHRoaXMucmVnaW9uV2lkdGggPSBNYXRoLmFicyh3aWR0aCk7XG5cdFx0dGhpcy5yZWdpb25IZWlnaHQgPSBNYXRoLmFicyhoZWlnaHQpO1xuXHR9LFxuXG5cdC8qKiBTZXRzIHRoZSB0ZXh0dXJlIHRvIHRoYXQgb2YgdGhlIHNwZWNpZmllZCByZWdpb24gYW5kIHNldHMgdGhlIGNvb3JkaW5hdGVzIHJlbGF0aXZlIHRvIHRoZSBzcGVjaWZpZWQgcmVnaW9uLiAqL1xuXHRzZXRGcm9tUmVnaW9uOiBmdW5jdGlvbihyZWdpb24sIHgsIHksIHdpZHRoLCBoZWlnaHQpIHtcblx0XHR0aGlzLnRleHR1cmUgPSByZWdpb24udGV4dHVyZTtcblx0XHR0aGlzLnNldChyZWdpb24uZ2V0UmVnaW9uWCgpICsgeCwgcmVnaW9uLmdldFJlZ2lvblkoKSArIHksIHdpZHRoLCBoZWlnaHQpO1xuXHR9LFxuXG5cblx0Ly9UT0RPOiBhZGQgc2V0dGVycyBmb3IgcmVnaW9uWC9ZIGFuZCByZWdpb25XaWR0aC9IZWlnaHRcblxuXHRyZWdpb25YOiB7XG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBNYXRoLnJvdW5kKHRoaXMudSAqIHRoaXMudGV4dHVyZS53aWR0aCk7XG5cdFx0fSBcblx0fSxcblxuXHRyZWdpb25ZOiB7XG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBNYXRoLnJvdW5kKHRoaXMudiAqIHRoaXMudGV4dHVyZS5oZWlnaHQpO1xuXHRcdH1cblx0fSxcblxuXHRmbGlwOiBmdW5jdGlvbih4LCB5KSB7XG5cdFx0dmFyIHRlbXA7XG5cdFx0aWYgKHgpIHtcblx0XHRcdHRlbXAgPSB0aGlzLnU7XG5cdFx0XHR0aGlzLnUgPSB0aGlzLnUyO1xuXHRcdFx0dGhpcy51MiA9IHRlbXA7XG5cdFx0fVxuXHRcdGlmICh5KSB7XG5cdFx0XHR0ZW1wID0gdGhpcy52O1xuXHRcdFx0dGhpcy52ID0gdGhpcy52Mjtcblx0XHRcdHRoaXMudjIgPSB0ZW1wO1xuXHRcdH1cblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gVGV4dHVyZVJlZ2lvbjsiLCJ2YXIgR0xDb250ZXh0V3JhcHBlciA9IHJlcXVpcmUoJy4vd3JhcHBlcicpO1xuXG4vKipcbiAqIER1Y2stdHlwZXMgV2ViR0xSZW5kZXJpbmdDb250ZXh0IC8ga2FtaS5XZWJHTENvbnRleHQuXG4gKlxuICogSWYgV2ViR0xSZW5kZXJpbmdDb250ZXh0IGlzIHBhc3NlZCwgdGhlIG9iamVjdCB3aWxsIG5vdCBoYXZlIGl0c1xuICogc3RhdGUgbWFuYWdlZCBkdXJpbmcgY29udGV4dCBsb3NzL3Jlc3RvcmUuIElmIGEgS2FtaSBXZWJHTENvbnRleHRcbiAqIGlzIHBhc3NlZCwgdGhlIG9iamVjdCB3aWxsIHRyeSB0byBtYWludGFpbiBpdHMgc3RhdGUgZHVyaW5nIGxvc3QvcmVzdG9yZS5cbiAqIFxuICogQHBhcmFtICB7V2ViR0xSZW5kZXJpbmdDb250ZXh0fGthbWkuV2ViR0xDb250ZXh0fSBnbCB0aGUgR0wgY29udGV4dFxuICogQHJldHVybiB7T2JqZWN0fGthbWkuV2ViR0xDb250ZXh0fSBhIHdyYXBwZXIgdGhhdCBoYXMgYSBgZ2xgIHByb3BlcnR5XG4gKi9cbm1vZHVsZS5leHBvcnRzLndyYXBDb250ZXh0ID0gZnVuY3Rpb24oZ2wpIHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgIT09IFwidW5kZWZpbmVkXCIgJiYgZ2wgaW5zdGFuY2VvZiB3aW5kb3cuV2ViR0xSZW5kZXJpbmdDb250ZXh0KSB7XG4gICAgICAgIHJldHVybiBuZXcgR0xDb250ZXh0V3JhcHBlcihnbCk7XG4gICAgfSBlbHNlXG4gICAgICAgIHJldHVybiBnbDtcbn07IiwidmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG5cbnZhciBHTENvbnRleHRXcmFwcGVyID0gbmV3IENsYXNzKHtcbiAgICBcbiAgICBpbml0aWFsaXplOiBmdW5jdGlvbiBHTENvbnRleHRXcmFwcGVyKGdsKSB7XG4gICAgICAgIHRoaXMuZ2wgPSBnbDtcbiAgICB9LFxuXG4gICAgYWRkTWFuYWdlZE9iamVjdDogZnVuY3Rpb24oZSkgeyB9LFxuICAgIHJlbW92ZU1hbmFnZWRPYmplY3Q6IGZ1bmN0aW9uKGUpIHsgfSxcblxuICAgIHdpZHRoOiB7XG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nbC5jYW52YXMud2lkdGg7XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24od2lkdGgpIHtcbiAgICAgICAgICAgIHRoaXMuZ2wuY2FudmFzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgaGVpZ2h0OiB7XG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nbC5jYW52YXMuaGVpZ2h0O1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uKGhlaWdodCkge1xuICAgICAgICAgICAgdGhpcy5nbC5jYW52YXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gR0xDb250ZXh0V3JhcHBlcjsiLCJ2YXIgaW50OCA9IG5ldyBJbnQ4QXJyYXkoNCk7XG52YXIgaW50MzIgPSBuZXcgSW50MzJBcnJheShpbnQ4LmJ1ZmZlciwgMCwgMSk7XG52YXIgZmxvYXQzMiA9IG5ldyBGbG9hdDMyQXJyYXkoaW50OC5idWZmZXIsIDAsIDEpO1xuXG4vKipcbiAqIEEgc2luZ2xldG9uIGZvciBudW1iZXIgdXRpbGl0aWVzLiBcbiAqIEBjbGFzcyBOdW1iZXJVdGlsXG4gKi9cbnZhciBOdW1iZXJVdGlsID0gZnVuY3Rpb24oKSB7XG5cbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgZmxvYXQgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGludCBiaXRzLiBBcnJheUJ1ZmZlclxuICogaXMgdXNlZCBmb3IgdGhlIGNvbnZlcnNpb24uXG4gKlxuICogQG1ldGhvZCAgaW50Qml0c1RvRmxvYXRcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSAge051bWJlcn0gaSB0aGUgaW50IHRvIGNhc3RcbiAqIEByZXR1cm4ge051bWJlcn0gICB0aGUgZmxvYXRcbiAqL1xuTnVtYmVyVXRpbC5pbnRCaXRzVG9GbG9hdCA9IGZ1bmN0aW9uKGkpIHtcblx0aW50MzJbMF0gPSBpO1xuXHRyZXR1cm4gZmxvYXQzMlswXTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaW50IGJpdHMgZnJvbSB0aGUgZ2l2ZW4gZmxvYXQuIEFycmF5QnVmZmVyIGlzIHVzZWRcbiAqIGZvciB0aGUgY29udmVyc2lvbi5cbiAqXG4gKiBAbWV0aG9kICBmbG9hdFRvSW50Qml0c1xuICogQHN0YXRpY1xuICogQHBhcmFtICB7TnVtYmVyfSBmIHRoZSBmbG9hdCB0byBjYXN0XG4gKiBAcmV0dXJuIHtOdW1iZXJ9ICAgdGhlIGludCBiaXRzXG4gKi9cbk51bWJlclV0aWwuZmxvYXRUb0ludEJpdHMgPSBmdW5jdGlvbihmKSB7XG5cdGZsb2F0MzJbMF0gPSBmO1xuXHRyZXR1cm4gaW50MzJbMF07XG59O1xuXG4vKipcbiAqIEVuY29kZXMgQUJHUiBpbnQgYXMgYSBmbG9hdCwgd2l0aCBzbGlnaHQgcHJlY2lzaW9uIGxvc3MuXG4gKlxuICogQG1ldGhvZCAgaW50VG9GbG9hdENvbG9yXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0ge051bWJlcn0gdmFsdWUgYW4gQUJHUiBwYWNrZWQgaW50ZWdlclxuICovXG5OdW1iZXJVdGlsLmludFRvRmxvYXRDb2xvciA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdHJldHVybiBOdW1iZXJVdGlsLmludEJpdHNUb0Zsb2F0KCB2YWx1ZSAmIDB4ZmVmZmZmZmYgKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIGZsb2F0IGVuY29kZWQgQUJHUiB2YWx1ZSBmcm9tIHRoZSBnaXZlbiBSR0JBXG4gKiBieXRlcyAoMCAtIDI1NSkuIFVzZWZ1bCBmb3Igc2F2aW5nIGJhbmR3aWR0aCBpbiB2ZXJ0ZXggZGF0YS5cbiAqXG4gKiBAbWV0aG9kICBjb2xvclRvRmxvYXRcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7TnVtYmVyfSByIHRoZSBSZWQgYnl0ZSAoMCAtIDI1NSlcbiAqIEBwYXJhbSB7TnVtYmVyfSBnIHRoZSBHcmVlbiBieXRlICgwIC0gMjU1KVxuICogQHBhcmFtIHtOdW1iZXJ9IGIgdGhlIEJsdWUgYnl0ZSAoMCAtIDI1NSlcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIHRoZSBBbHBoYSBieXRlICgwIC0gMjU1KVxuICogQHJldHVybiB7RmxvYXQzMn0gIGEgRmxvYXQzMiBvZiB0aGUgUkdCQSBjb2xvclxuICovXG5OdW1iZXJVdGlsLmNvbG9yVG9GbG9hdCA9IGZ1bmN0aW9uKHIsIGcsIGIsIGEpIHtcblx0dmFyIGJpdHMgPSAoYSA8PCAyNCB8IGIgPDwgMTYgfCBnIDw8IDggfCByKTtcblx0cmV0dXJuIE51bWJlclV0aWwuaW50VG9GbG9hdENvbG9yKGJpdHMpO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIG51bWJlciBpcyBhIHBvd2VyLW9mLXR3by5cbiAqXG4gKiBAbWV0aG9kICBpc1Bvd2VyT2ZUd29cbiAqIEBwYXJhbSAge051bWJlcn0gIG4gdGhlIG51bWJlciB0byB0ZXN0XG4gKiBAcmV0dXJuIHtCb29sZWFufSAgIHRydWUgaWYgcG93ZXItb2YtdHdvXG4gKi9cbk51bWJlclV0aWwuaXNQb3dlck9mVHdvID0gZnVuY3Rpb24obikge1xuXHRyZXR1cm4gKG4gJiAobiAtIDEpKSA9PT0gMDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbmV4dCBoaWdoZXN0IHBvd2VyLW9mLXR3byBmcm9tIHRoZSBzcGVjaWZpZWQgbnVtYmVyLiBcbiAqIFxuICogQHBhcmFtICB7TnVtYmVyfSBuIHRoZSBudW1iZXIgdG8gdGVzdFxuICogQHJldHVybiB7TnVtYmVyfSAgIHRoZSBuZXh0IGhpZ2hlc3QgcG93ZXIgb2YgdHdvXG4gKi9cbk51bWJlclV0aWwubmV4dFBvd2VyT2ZUd28gPSBmdW5jdGlvbihuKSB7XG5cdG4tLTtcblx0biB8PSBuID4+IDE7XG5cdG4gfD0gbiA+PiAyO1xuXHRuIHw9IG4gPj4gNDtcblx0biB8PSBuID4+IDg7XG5cdG4gfD0gbiA+PiAxNjtcblx0cmV0dXJuIG4rMTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTnVtYmVyVXRpbDsiLCIvKmpzbGludCBvbmV2YXI6dHJ1ZSwgdW5kZWY6dHJ1ZSwgbmV3Y2FwOnRydWUsIHJlZ2V4cDp0cnVlLCBiaXR3aXNlOnRydWUsIG1heGVycjo1MCwgaW5kZW50OjQsIHdoaXRlOmZhbHNlLCBub21lbjpmYWxzZSwgcGx1c3BsdXM6ZmFsc2UgKi9cbi8qZ2xvYmFsIGRlZmluZTpmYWxzZSwgcmVxdWlyZTpmYWxzZSwgZXhwb3J0czpmYWxzZSwgbW9kdWxlOmZhbHNlLCBzaWduYWxzOmZhbHNlICovXG5cbi8qKiBAbGljZW5zZVxuICogSlMgU2lnbmFscyA8aHR0cDovL21pbGxlcm1lZGVpcm9zLmdpdGh1Yi5jb20vanMtc2lnbmFscy8+XG4gKiBSZWxlYXNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2VcbiAqIEF1dGhvcjogTWlsbGVyIE1lZGVpcm9zXG4gKiBWZXJzaW9uOiAxLjAuMCAtIEJ1aWxkOiAyNjggKDIwMTIvMTEvMjkgMDU6NDggUE0pXG4gKi9cblxuKGZ1bmN0aW9uKGdsb2JhbCl7XG5cbiAgICAvLyBTaWduYWxCaW5kaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8qKlxuICAgICAqIE9iamVjdCB0aGF0IHJlcHJlc2VudHMgYSBiaW5kaW5nIGJldHdlZW4gYSBTaWduYWwgYW5kIGEgbGlzdGVuZXIgZnVuY3Rpb24uXG4gICAgICogPGJyIC8+LSA8c3Ryb25nPlRoaXMgaXMgYW4gaW50ZXJuYWwgY29uc3RydWN0b3IgYW5kIHNob3VsZG4ndCBiZSBjYWxsZWQgYnkgcmVndWxhciB1c2Vycy48L3N0cm9uZz5cbiAgICAgKiA8YnIgLz4tIGluc3BpcmVkIGJ5IEpvYSBFYmVydCBBUzMgU2lnbmFsQmluZGluZyBhbmQgUm9iZXJ0IFBlbm5lcidzIFNsb3QgY2xhc3Nlcy5cbiAgICAgKiBAYXV0aG9yIE1pbGxlciBNZWRlaXJvc1xuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBpbnRlcm5hbFxuICAgICAqIEBuYW1lIFNpZ25hbEJpbmRpbmdcbiAgICAgKiBAcGFyYW0ge1NpZ25hbH0gc2lnbmFsIFJlZmVyZW5jZSB0byBTaWduYWwgb2JqZWN0IHRoYXQgbGlzdGVuZXIgaXMgY3VycmVudGx5IGJvdW5kIHRvLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbC5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzT25jZSBJZiBiaW5kaW5nIHNob3VsZCBiZSBleGVjdXRlZCBqdXN0IG9uY2UuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV0gVGhlIHByaW9yaXR5IGxldmVsIG9mIHRoZSBldmVudCBsaXN0ZW5lci4gKGRlZmF1bHQgPSAwKS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBTaWduYWxCaW5kaW5nKHNpZ25hbCwgbGlzdGVuZXIsIGlzT25jZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwuXG4gICAgICAgICAqIEB0eXBlIEZ1bmN0aW9uXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9saXN0ZW5lciA9IGxpc3RlbmVyO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBiaW5kaW5nIHNob3VsZCBiZSBleGVjdXRlZCBqdXN0IG9uY2UuXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX2lzT25jZSA9IGlzT25jZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgICAgICogQG1lbWJlck9mIFNpZ25hbEJpbmRpbmcucHJvdG90eXBlXG4gICAgICAgICAqIEBuYW1lIGNvbnRleHRcbiAgICAgICAgICogQHR5cGUgT2JqZWN0fHVuZGVmaW5lZHxudWxsXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmNvbnRleHQgPSBsaXN0ZW5lckNvbnRleHQ7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlZmVyZW5jZSB0byBTaWduYWwgb2JqZWN0IHRoYXQgbGlzdGVuZXIgaXMgY3VycmVudGx5IGJvdW5kIHRvLlxuICAgICAgICAgKiBAdHlwZSBTaWduYWxcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3NpZ25hbCA9IHNpZ25hbDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogTGlzdGVuZXIgcHJpb3JpdHlcbiAgICAgICAgICogQHR5cGUgTnVtYmVyXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9wcmlvcml0eSA9IHByaW9yaXR5IHx8IDA7XG4gICAgfVxuXG4gICAgU2lnbmFsQmluZGluZy5wcm90b3R5cGUgPSB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIGJpbmRpbmcgaXMgYWN0aXZlIGFuZCBzaG91bGQgYmUgZXhlY3V0ZWQuXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICovXG4gICAgICAgIGFjdGl2ZSA6IHRydWUsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERlZmF1bHQgcGFyYW1ldGVycyBwYXNzZWQgdG8gbGlzdGVuZXIgZHVyaW5nIGBTaWduYWwuZGlzcGF0Y2hgIGFuZCBgU2lnbmFsQmluZGluZy5leGVjdXRlYC4gKGN1cnJpZWQgcGFyYW1ldGVycylcbiAgICAgICAgICogQHR5cGUgQXJyYXl8bnVsbFxuICAgICAgICAgKi9cbiAgICAgICAgcGFyYW1zIDogbnVsbCxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ2FsbCBsaXN0ZW5lciBwYXNzaW5nIGFyYml0cmFyeSBwYXJhbWV0ZXJzLlxuICAgICAgICAgKiA8cD5JZiBiaW5kaW5nIHdhcyBhZGRlZCB1c2luZyBgU2lnbmFsLmFkZE9uY2UoKWAgaXQgd2lsbCBiZSBhdXRvbWF0aWNhbGx5IHJlbW92ZWQgZnJvbSBzaWduYWwgZGlzcGF0Y2ggcXVldWUsIHRoaXMgbWV0aG9kIGlzIHVzZWQgaW50ZXJuYWxseSBmb3IgdGhlIHNpZ25hbCBkaXNwYXRjaC48L3A+XG4gICAgICAgICAqIEBwYXJhbSB7QXJyYXl9IFtwYXJhbXNBcnJdIEFycmF5IG9mIHBhcmFtZXRlcnMgdGhhdCBzaG91bGQgYmUgcGFzc2VkIHRvIHRoZSBsaXN0ZW5lclxuICAgICAgICAgKiBAcmV0dXJuIHsqfSBWYWx1ZSByZXR1cm5lZCBieSB0aGUgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBleGVjdXRlIDogZnVuY3Rpb24gKHBhcmFtc0Fycikge1xuICAgICAgICAgICAgdmFyIGhhbmRsZXJSZXR1cm4sIHBhcmFtcztcbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZSAmJiAhIXRoaXMuX2xpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgcGFyYW1zID0gdGhpcy5wYXJhbXM/IHRoaXMucGFyYW1zLmNvbmNhdChwYXJhbXNBcnIpIDogcGFyYW1zQXJyO1xuICAgICAgICAgICAgICAgIGhhbmRsZXJSZXR1cm4gPSB0aGlzLl9saXN0ZW5lci5hcHBseSh0aGlzLmNvbnRleHQsIHBhcmFtcyk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2lzT25jZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVyUmV0dXJuO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEZXRhY2ggYmluZGluZyBmcm9tIHNpZ25hbC5cbiAgICAgICAgICogLSBhbGlhcyB0bzogbXlTaWduYWwucmVtb3ZlKG15QmluZGluZy5nZXRMaXN0ZW5lcigpKTtcbiAgICAgICAgICogQHJldHVybiB7RnVuY3Rpb258bnVsbH0gSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsIG9yIGBudWxsYCBpZiBiaW5kaW5nIHdhcyBwcmV2aW91c2x5IGRldGFjaGVkLlxuICAgICAgICAgKi9cbiAgICAgICAgZGV0YWNoIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNCb3VuZCgpPyB0aGlzLl9zaWduYWwucmVtb3ZlKHRoaXMuX2xpc3RlbmVyLCB0aGlzLmNvbnRleHQpIDogbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7Qm9vbGVhbn0gYHRydWVgIGlmIGJpbmRpbmcgaXMgc3RpbGwgYm91bmQgdG8gdGhlIHNpZ25hbCBhbmQgaGF2ZSBhIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgaXNCb3VuZCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAoISF0aGlzLl9zaWduYWwgJiYgISF0aGlzLl9saXN0ZW5lcik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IElmIFNpZ25hbEJpbmRpbmcgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIG9uY2UuXG4gICAgICAgICAqL1xuICAgICAgICBpc09uY2UgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faXNPbmNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0TGlzdGVuZXIgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fbGlzdGVuZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbH0gU2lnbmFsIHRoYXQgbGlzdGVuZXIgaXMgY3VycmVudGx5IGJvdW5kIHRvLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0U2lnbmFsIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NpZ25hbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGVsZXRlIGluc3RhbmNlIHByb3BlcnRpZXNcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9kZXN0cm95IDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX3NpZ25hbDtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9saXN0ZW5lcjtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbnRleHQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge3N0cmluZ30gU3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBvYmplY3QuXG4gICAgICAgICAqL1xuICAgICAgICB0b1N0cmluZyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAnW1NpZ25hbEJpbmRpbmcgaXNPbmNlOicgKyB0aGlzLl9pc09uY2UgKycsIGlzQm91bmQ6JysgdGhpcy5pc0JvdW5kKCkgKycsIGFjdGl2ZTonICsgdGhpcy5hY3RpdmUgKyAnXSc7XG4gICAgICAgIH1cblxuICAgIH07XG5cblxuLypnbG9iYWwgU2lnbmFsQmluZGluZzpmYWxzZSovXG5cbiAgICAvLyBTaWduYWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsIGZuTmFtZSkge1xuICAgICAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoICdsaXN0ZW5lciBpcyBhIHJlcXVpcmVkIHBhcmFtIG9mIHtmbn0oKSBhbmQgc2hvdWxkIGJlIGEgRnVuY3Rpb24uJy5yZXBsYWNlKCd7Zm59JywgZm5OYW1lKSApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3VzdG9tIGV2ZW50IGJyb2FkY2FzdGVyXG4gICAgICogPGJyIC8+LSBpbnNwaXJlZCBieSBSb2JlcnQgUGVubmVyJ3MgQVMzIFNpZ25hbHMuXG4gICAgICogQG5hbWUgU2lnbmFsXG4gICAgICogQGF1dGhvciBNaWxsZXIgTWVkZWlyb3NcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBTaWduYWwoKSB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSBBcnJheS48U2lnbmFsQmluZGluZz5cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX2JpbmRpbmdzID0gW107XG4gICAgICAgIHRoaXMuX3ByZXZQYXJhbXMgPSBudWxsO1xuXG4gICAgICAgIC8vIGVuZm9yY2UgZGlzcGF0Y2ggdG8gYXdheXMgd29yayBvbiBzYW1lIGNvbnRleHQgKCM0NylcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmRpc3BhdGNoID0gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIFNpZ25hbC5wcm90b3R5cGUuZGlzcGF0Y2guYXBwbHkoc2VsZiwgYXJndW1lbnRzKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBTaWduYWwucHJvdG90eXBlID0ge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTaWduYWxzIFZlcnNpb24gTnVtYmVyXG4gICAgICAgICAqIEB0eXBlIFN0cmluZ1xuICAgICAgICAgKiBAY29uc3RcbiAgICAgICAgICovXG4gICAgICAgIFZFUlNJT04gOiAnMS4wLjAnLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBTaWduYWwgc2hvdWxkIGtlZXAgcmVjb3JkIG9mIHByZXZpb3VzbHkgZGlzcGF0Y2hlZCBwYXJhbWV0ZXJzIGFuZFxuICAgICAgICAgKiBhdXRvbWF0aWNhbGx5IGV4ZWN1dGUgbGlzdGVuZXIgZHVyaW5nIGBhZGQoKWAvYGFkZE9uY2UoKWAgaWYgU2lnbmFsIHdhc1xuICAgICAgICAgKiBhbHJlYWR5IGRpc3BhdGNoZWQgYmVmb3JlLlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICBtZW1vcml6ZSA6IGZhbHNlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfc2hvdWxkUHJvcGFnYXRlIDogdHJ1ZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgU2lnbmFsIGlzIGFjdGl2ZSBhbmQgc2hvdWxkIGJyb2FkY2FzdCBldmVudHMuXG4gICAgICAgICAqIDxwPjxzdHJvbmc+SU1QT1JUQU5UOjwvc3Ryb25nPiBTZXR0aW5nIHRoaXMgcHJvcGVydHkgZHVyaW5nIGEgZGlzcGF0Y2ggd2lsbCBvbmx5IGFmZmVjdCB0aGUgbmV4dCBkaXNwYXRjaCwgaWYgeW91IHdhbnQgdG8gc3RvcCB0aGUgcHJvcGFnYXRpb24gb2YgYSBzaWduYWwgdXNlIGBoYWx0KClgIGluc3RlYWQuPC9wPlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICBhY3RpdmUgOiB0cnVlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lclxuICAgICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzT25jZVxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF1cbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV1cbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsQmluZGluZ31cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9yZWdpc3Rlckxpc3RlbmVyIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBpc09uY2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcblxuICAgICAgICAgICAgdmFyIHByZXZJbmRleCA9IHRoaXMuX2luZGV4T2ZMaXN0ZW5lcihsaXN0ZW5lciwgbGlzdGVuZXJDb250ZXh0KSxcbiAgICAgICAgICAgICAgICBiaW5kaW5nO1xuXG4gICAgICAgICAgICBpZiAocHJldkluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGJpbmRpbmcgPSB0aGlzLl9iaW5kaW5nc1twcmV2SW5kZXhdO1xuICAgICAgICAgICAgICAgIGlmIChiaW5kaW5nLmlzT25jZSgpICE9PSBpc09uY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgY2Fubm90IGFkZCcrIChpc09uY2U/ICcnIDogJ09uY2UnKSArJygpIHRoZW4gYWRkJysgKCFpc09uY2U/ICcnIDogJ09uY2UnKSArJygpIHRoZSBzYW1lIGxpc3RlbmVyIHdpdGhvdXQgcmVtb3ZpbmcgdGhlIHJlbGF0aW9uc2hpcCBmaXJzdC4nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJpbmRpbmcgPSBuZXcgU2lnbmFsQmluZGluZyh0aGlzLCBsaXN0ZW5lciwgaXNPbmNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGRCaW5kaW5nKGJpbmRpbmcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZih0aGlzLm1lbW9yaXplICYmIHRoaXMuX3ByZXZQYXJhbXMpe1xuICAgICAgICAgICAgICAgIGJpbmRpbmcuZXhlY3V0ZSh0aGlzLl9wcmV2UGFyYW1zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGJpbmRpbmc7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwYXJhbSB7U2lnbmFsQmluZGluZ30gYmluZGluZ1xuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX2FkZEJpbmRpbmcgOiBmdW5jdGlvbiAoYmluZGluZykge1xuICAgICAgICAgICAgLy9zaW1wbGlmaWVkIGluc2VydGlvbiBzb3J0XG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aDtcbiAgICAgICAgICAgIGRvIHsgLS1uOyB9IHdoaWxlICh0aGlzLl9iaW5kaW5nc1tuXSAmJiBiaW5kaW5nLl9wcmlvcml0eSA8PSB0aGlzLl9iaW5kaW5nc1tuXS5fcHJpb3JpdHkpO1xuICAgICAgICAgICAgdGhpcy5fYmluZGluZ3Muc3BsaWNlKG4gKyAxLCAwLCBiaW5kaW5nKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXJcbiAgICAgICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX2luZGV4T2ZMaXN0ZW5lciA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgY29udGV4dCkge1xuICAgICAgICAgICAgdmFyIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgY3VyO1xuICAgICAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgICAgIGN1ciA9IHRoaXMuX2JpbmRpbmdzW25dO1xuICAgICAgICAgICAgICAgIGlmIChjdXIuX2xpc3RlbmVyID09PSBsaXN0ZW5lciAmJiBjdXIuY29udGV4dCA9PT0gY29udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENoZWNrIGlmIGxpc3RlbmVyIHdhcyBhdHRhY2hlZCB0byBTaWduYWwuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY29udGV4dF1cbiAgICAgICAgICogQHJldHVybiB7Ym9vbGVhbn0gaWYgU2lnbmFsIGhhcyB0aGUgc3BlY2lmaWVkIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgaGFzIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBjb250ZXh0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faW5kZXhPZkxpc3RlbmVyKGxpc3RlbmVyLCBjb250ZXh0KSAhPT0gLTE7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEFkZCBhIGxpc3RlbmVyIHRvIHRoZSBzaWduYWwuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIFNpZ25hbCBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF0gQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV0gVGhlIHByaW9yaXR5IGxldmVsIG9mIHRoZSBldmVudCBsaXN0ZW5lci4gTGlzdGVuZXJzIHdpdGggaGlnaGVyIHByaW9yaXR5IHdpbGwgYmUgZXhlY3V0ZWQgYmVmb3JlIGxpc3RlbmVycyB3aXRoIGxvd2VyIHByaW9yaXR5LiBMaXN0ZW5lcnMgd2l0aCBzYW1lIHByaW9yaXR5IGxldmVsIHdpbGwgYmUgZXhlY3V0ZWQgYXQgdGhlIHNhbWUgb3JkZXIgYXMgdGhleSB3ZXJlIGFkZGVkLiAoZGVmYXVsdCA9IDApXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbEJpbmRpbmd9IEFuIE9iamVjdCByZXByZXNlbnRpbmcgdGhlIGJpbmRpbmcgYmV0d2VlbiB0aGUgU2lnbmFsIGFuZCBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGFkZCA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuICAgICAgICAgICAgdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgJ2FkZCcpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXIobGlzdGVuZXIsIGZhbHNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQWRkIGxpc3RlbmVyIHRvIHRoZSBzaWduYWwgdGhhdCBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBmaXJzdCBleGVjdXRpb24gKHdpbGwgYmUgZXhlY3V0ZWQgb25seSBvbmNlKS5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgU2lnbmFsIGhhbmRsZXIgZnVuY3Rpb24uXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XSBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gW3ByaW9yaXR5XSBUaGUgcHJpb3JpdHkgbGV2ZWwgb2YgdGhlIGV2ZW50IGxpc3RlbmVyLiBMaXN0ZW5lcnMgd2l0aCBoaWdoZXIgcHJpb3JpdHkgd2lsbCBiZSBleGVjdXRlZCBiZWZvcmUgbGlzdGVuZXJzIHdpdGggbG93ZXIgcHJpb3JpdHkuIExpc3RlbmVycyB3aXRoIHNhbWUgcHJpb3JpdHkgbGV2ZWwgd2lsbCBiZSBleGVjdXRlZCBhdCB0aGUgc2FtZSBvcmRlciBhcyB0aGV5IHdlcmUgYWRkZWQuIChkZWZhdWx0ID0gMClcbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsQmluZGluZ30gQW4gT2JqZWN0IHJlcHJlc2VudGluZyB0aGUgYmluZGluZyBiZXR3ZWVuIHRoZSBTaWduYWwgYW5kIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgYWRkT25jZSA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuICAgICAgICAgICAgdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgJ2FkZE9uY2UnKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9yZWdpc3Rlckxpc3RlbmVyKGxpc3RlbmVyLCB0cnVlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlIGEgc2luZ2xlIGxpc3RlbmVyIGZyb20gdGhlIGRpc3BhdGNoIHF1ZXVlLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBIYW5kbGVyIGZ1bmN0aW9uIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQuXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY29udGV4dF0gRXhlY3V0aW9uIGNvbnRleHQgKHNpbmNlIHlvdSBjYW4gYWRkIHRoZSBzYW1lIGhhbmRsZXIgbXVsdGlwbGUgdGltZXMgaWYgZXhlY3V0aW5nIGluIGEgZGlmZmVyZW50IGNvbnRleHQpLlxuICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gTGlzdGVuZXIgaGFuZGxlciBmdW5jdGlvbi5cbiAgICAgICAgICovXG4gICAgICAgIHJlbW92ZSA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgY29udGV4dCkge1xuICAgICAgICAgICAgdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgJ3JlbW92ZScpO1xuXG4gICAgICAgICAgICB2YXIgaSA9IHRoaXMuX2luZGV4T2ZMaXN0ZW5lcihsaXN0ZW5lciwgY29udGV4dCk7XG4gICAgICAgICAgICBpZiAoaSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kaW5nc1tpXS5fZGVzdHJveSgpOyAvL25vIHJlYXNvbiB0byBhIFNpZ25hbEJpbmRpbmcgZXhpc3QgaWYgaXQgaXNuJ3QgYXR0YWNoZWQgdG8gYSBzaWduYWxcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kaW5ncy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbGlzdGVuZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlbW92ZSBhbGwgbGlzdGVuZXJzIGZyb20gdGhlIFNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIHJlbW92ZUFsbCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoO1xuICAgICAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzW25dLl9kZXN0cm95KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9iaW5kaW5ncy5sZW5ndGggPSAwO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtudW1iZXJ9IE51bWJlciBvZiBsaXN0ZW5lcnMgYXR0YWNoZWQgdG8gdGhlIFNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIGdldE51bUxpc3RlbmVycyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9iaW5kaW5ncy5sZW5ndGg7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFN0b3AgcHJvcGFnYXRpb24gb2YgdGhlIGV2ZW50LCBibG9ja2luZyB0aGUgZGlzcGF0Y2ggdG8gbmV4dCBsaXN0ZW5lcnMgb24gdGhlIHF1ZXVlLlxuICAgICAgICAgKiA8cD48c3Ryb25nPklNUE9SVEFOVDo8L3N0cm9uZz4gc2hvdWxkIGJlIGNhbGxlZCBvbmx5IGR1cmluZyBzaWduYWwgZGlzcGF0Y2gsIGNhbGxpbmcgaXQgYmVmb3JlL2FmdGVyIGRpc3BhdGNoIHdvbid0IGFmZmVjdCBzaWduYWwgYnJvYWRjYXN0LjwvcD5cbiAgICAgICAgICogQHNlZSBTaWduYWwucHJvdG90eXBlLmRpc2FibGVcbiAgICAgICAgICovXG4gICAgICAgIGhhbHQgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLl9zaG91bGRQcm9wYWdhdGUgPSBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGlzcGF0Y2gvQnJvYWRjYXN0IFNpZ25hbCB0byBhbGwgbGlzdGVuZXJzIGFkZGVkIHRvIHRoZSBxdWV1ZS5cbiAgICAgICAgICogQHBhcmFtIHsuLi4qfSBbcGFyYW1zXSBQYXJhbWV0ZXJzIHRoYXQgc2hvdWxkIGJlIHBhc3NlZCB0byBlYWNoIGhhbmRsZXIuXG4gICAgICAgICAqL1xuICAgICAgICBkaXNwYXRjaCA6IGZ1bmN0aW9uIChwYXJhbXMpIHtcbiAgICAgICAgICAgIGlmICghIHRoaXMuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcGFyYW1zQXJyID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSxcbiAgICAgICAgICAgICAgICBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGJpbmRpbmdzO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5tZW1vcml6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3ByZXZQYXJhbXMgPSBwYXJhbXNBcnI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghIG4pIHtcbiAgICAgICAgICAgICAgICAvL3Nob3VsZCBjb21lIGFmdGVyIG1lbW9yaXplXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBiaW5kaW5ncyA9IHRoaXMuX2JpbmRpbmdzLnNsaWNlKCk7IC8vY2xvbmUgYXJyYXkgaW4gY2FzZSBhZGQvcmVtb3ZlIGl0ZW1zIGR1cmluZyBkaXNwYXRjaFxuICAgICAgICAgICAgdGhpcy5fc2hvdWxkUHJvcGFnYXRlID0gdHJ1ZTsgLy9pbiBjYXNlIGBoYWx0YCB3YXMgY2FsbGVkIGJlZm9yZSBkaXNwYXRjaCBvciBkdXJpbmcgdGhlIHByZXZpb3VzIGRpc3BhdGNoLlxuXG4gICAgICAgICAgICAvL2V4ZWN1dGUgYWxsIGNhbGxiYWNrcyB1bnRpbCBlbmQgb2YgdGhlIGxpc3Qgb3IgdW50aWwgYSBjYWxsYmFjayByZXR1cm5zIGBmYWxzZWAgb3Igc3RvcHMgcHJvcGFnYXRpb25cbiAgICAgICAgICAgIC8vcmV2ZXJzZSBsb29wIHNpbmNlIGxpc3RlbmVycyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIGFkZGVkIGF0IHRoZSBlbmQgb2YgdGhlIGxpc3RcbiAgICAgICAgICAgIGRvIHsgbi0tOyB9IHdoaWxlIChiaW5kaW5nc1tuXSAmJiB0aGlzLl9zaG91bGRQcm9wYWdhdGUgJiYgYmluZGluZ3Nbbl0uZXhlY3V0ZShwYXJhbXNBcnIpICE9PSBmYWxzZSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEZvcmdldCBtZW1vcml6ZWQgYXJndW1lbnRzLlxuICAgICAgICAgKiBAc2VlIFNpZ25hbC5tZW1vcml6ZVxuICAgICAgICAgKi9cbiAgICAgICAgZm9yZ2V0IDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMuX3ByZXZQYXJhbXMgPSBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZW1vdmUgYWxsIGJpbmRpbmdzIGZyb20gc2lnbmFsIGFuZCBkZXN0cm95IGFueSByZWZlcmVuY2UgdG8gZXh0ZXJuYWwgb2JqZWN0cyAoZGVzdHJveSBTaWduYWwgb2JqZWN0KS5cbiAgICAgICAgICogPHA+PHN0cm9uZz5JTVBPUlRBTlQ6PC9zdHJvbmc+IGNhbGxpbmcgYW55IG1ldGhvZCBvbiB0aGUgc2lnbmFsIGluc3RhbmNlIGFmdGVyIGNhbGxpbmcgZGlzcG9zZSB3aWxsIHRocm93IGVycm9ycy48L3A+XG4gICAgICAgICAqL1xuICAgICAgICBkaXNwb3NlIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVBbGwoKTtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9iaW5kaW5ncztcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9wcmV2UGFyYW1zO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgb2JqZWN0LlxuICAgICAgICAgKi9cbiAgICAgICAgdG9TdHJpbmcgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ1tTaWduYWwgYWN0aXZlOicrIHRoaXMuYWN0aXZlICsnIG51bUxpc3RlbmVyczonKyB0aGlzLmdldE51bUxpc3RlbmVycygpICsnXSc7XG4gICAgICAgIH1cblxuICAgIH07XG5cblxuICAgIC8vIE5hbWVzcGFjZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLyoqXG4gICAgICogU2lnbmFscyBuYW1lc3BhY2VcbiAgICAgKiBAbmFtZXNwYWNlXG4gICAgICogQG5hbWUgc2lnbmFsc1xuICAgICAqL1xuICAgIHZhciBzaWduYWxzID0gU2lnbmFsO1xuXG4gICAgLyoqXG4gICAgICogQ3VzdG9tIGV2ZW50IGJyb2FkY2FzdGVyXG4gICAgICogQHNlZSBTaWduYWxcbiAgICAgKi9cbiAgICAvLyBhbGlhcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgKHNlZSAjZ2gtNDQpXG4gICAgc2lnbmFscy5TaWduYWwgPSBTaWduYWw7XG5cblxuXG4gICAgLy9leHBvcnRzIHRvIG11bHRpcGxlIGVudmlyb25tZW50c1xuICAgIGlmKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCl7IC8vQU1EXG4gICAgICAgIGRlZmluZShmdW5jdGlvbiAoKSB7IHJldHVybiBzaWduYWxzOyB9KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKXsgLy9ub2RlXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gc2lnbmFscztcbiAgICB9IGVsc2UgeyAvL2Jyb3dzZXJcbiAgICAgICAgLy91c2Ugc3RyaW5nIGJlY2F1c2Ugb2YgR29vZ2xlIGNsb3N1cmUgY29tcGlsZXIgQURWQU5DRURfTU9ERVxuICAgICAgICAvKmpzbGludCBzdWI6dHJ1ZSAqL1xuICAgICAgICBnbG9iYWxbJ3NpZ25hbHMnXSA9IHNpZ25hbHM7XG4gICAgfVxuXG59KHRoaXMpKTtcbiJdfQ==
(1)
});
;