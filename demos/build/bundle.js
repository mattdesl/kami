require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * The core kami module provides basic 2D sprite batching and 
 * asset management.
 * 
 * @module kami
 */

var Class = require('klasse');
var Mesh = require('./glutils/Mesh');

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
		if (typeof context !== "object")
			throw "GL context not specified to SpriteBatch";
		this.context = context;

		this.size = size || 500;
		
		// 65535 is max index, so 65535 / 6 = 10922.
		if (this.size > 10922)  //(you'd have to be insane to try and batch this much with WebGL)
			throw "Can't have more than 10922 sprites per batch: " + this.size;
				
		
		//TODO: make these public
		this._blendSrc = this.context.gl.ONE;
		this._blendDst = this.context.gl.ONE_MINUS_SRC_ALPHA
		this._blendEnabled = true;
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
	 * If three or more arguments are specified, this method assumes that RGB 
	 * or RGBA float values (0.0 to 1.0) are being passed. 
	 * 
	 * If less than three arguments are specified, we only consider the first 
	 * and assign it to all four components -- this is useful for setting transparency 
	 * in a premultiplied alpha stage.
	 *
	 * @method  setColor
	 * @param {Number} r the red component, normalized
	 * @param {Number} g the green component, normalized
	 * @param {Number} b the blue component, normalized
	 * @param {Number} a the alpha component, normalized
	 */
	setColor: function(r, g, b, a) {
		if (arguments.length >= 3) {
			//default alpha to one 
			a = (a || a === 0) ? a : 1.0;
		} else {
			r = g = b = a = (arguments[0] || 0);
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
	 * Called after flushing the batch. This method
	 * does nothing by default.
	 *
	 * @method  _postRender
	 */
	_postRender: function() {
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

		var gl = this.gl;
		
		this._preRender();

		//number of sprites in batch
		var numComponents = this.getVertexSize();
		var spriteCount = (this.idx / (numComponents * 4));
		
		//draw the sprites
		var gl = this.context.gl;
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
		this.vertices = [];
		this.indices = [];
		this.size = this.maxVertices = 0;

		if (this.defaultShader)
			this.defaultShader.destroy();
		this.defaultShader = null;
		this._shader = null; // remove reference to whatever shader is currently being used

		if (this.mesh) 
			this.mesh.destroy();
		this.mesh = null;
	}
});

module.exports = BaseBatch;

},{"./glutils/Mesh":7,"klasse":11,"number-util":"2TLsQN"}],2:[function(require,module,exports){
/**
 * @module kami
 */

// Requires....
var Class         = require('klasse');

var BaseBatch = require('./BaseBatch');

var Mesh          = require('./glutils/Mesh');
var ShaderProgram = require('./glutils/ShaderProgram');

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
		BaseBatch.call(this, context, size);

		/**
		 * The projection Float32Array vec2 which is
		 * used to avoid some matrix calculations.
		 *
		 * @property projection
		 * @type {Float32Array}
		 */
		this.projection = new Float32Array(2);

		//Sets up a default projection vector so that the batch works without setProjection
		this.projection[0] = this.context.width/2;
		this.projection[1] = this.context.height/2;

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
			new Mesh.Attrib("Position", 2),
			 //pack the color using some crazy wizardry 
			new Mesh.Attrib("Color", 4, null, gl.UNSIGNED_BYTE, true, 1),
			new Mesh.Attrib("TexCoord0", 2)
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

		//premultiplied alpha
		if (this._blendEnabled) {
			gl.enable(gl.BLEND);

			//set either to -1 if you want to call your own 
			//blendFunc or blendFuncSeparate
			if (this._blendSrc !== -1 && this._blendDst !== -1)
				gl.blendFunc(this._blendSrc, this._blendDst); 
		}
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

		if (this._blendEnabled)
			gl.disable(gl.BLEND);
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
	"attribute vec2 Position;",
	"attribute vec4 Color;",
	"attribute vec2 TexCoord0;",

	"uniform vec2 u_projection;",
	"varying vec2 vTexCoord0;",
	"varying vec4 vColor;",

	"void main(void) {",
	"   gl_Position = vec4( Position.x / u_projection.x - 1.0, Position.y / -u_projection.y + 1.0 , 0.0, 1.0);",
	"   vTexCoord0 = TexCoord0;",
	"   vColor = Color;",
	"}"
].join('\n');

module.exports = SpriteBatch;

},{"./BaseBatch":1,"./glutils/Mesh":7,"./glutils/ShaderProgram":8,"klasse":11}],3:[function(require,module,exports){
/**
 * @module kami
 */

var Class = require('klasse');
var Signal = require('signals');
var nextPowerOfTwo = require('number-util').nextPowerOfTwo;
var isPowerOfTwo = require('number-util').isPowerOfTwo;

var Texture = new Class({


	/**
	 * Creates a new texture with the optional width, height, and data.
	 *
	 * If the constructor is passed no parameters other than WebGLContext, then
	 * it will not be initialized and will be non-renderable. You will need to manually
	 * uploadData or uploadImage yourself.
	 *
	 * If you pass a width and height after context, the texture will be initialized with that size
	 * and null data (e.g. transparent black). If you also pass the format and data, 
	 * it will be uploaded to the texture. 
	 *
	 * If you pass a String or Data URI as the second parameter,
	 * this Texture will load an Image object asynchronously. The optional third
	 * and fourth parameters are callback functions for success and failure, respectively. 
	 * The optional fifrth parameter for this version of the constructor is genMipmaps, which defaults to false. 
	 * 
	 * _Note:_ To avoid WebGL errors with the Image URL constructor,
	 * we upload a dummy 1x1 transparent texture until the async Image load has been completed. So
	 * the width and height will not be accurate until the onComplete callback is fired.
	 * 
	 * The arguments are kept in memory for future context restoration events. If
	 * this is undesirable (e.g. huge buffers which need to be GC'd), you should not
	 * pass the data in the constructor, but instead upload it after creating an uninitialized 
	 * texture. You will need to manage it yourself, either by extending the create() method, 
	 * or listening to restored events in WebGLContext.
	 *
	 * Most users will want to use the AssetManager to create and manage their textures
	 * with asynchronous loading and context loss. 
	 *
	 * @example
	 * 		new Texture(context, 256, 256); //empty 256x256 texture
	 * 		new Texture(context, 1, 1, Texture.Format.RGBA, Texture.DataType.UNSIGNED_BYTE, 
	 * 					new Uint8Array([255,0,0,255])); //1x1 red texture
	 * 		new Texture(context, "test.png"); //loads image asynchronously
	 * 		new Texture(context, "test.png", successFunc, failFunc, useMipmaps); //extra params for image laoder 
	 *
	 * @class  Texture
	 * @constructor
	 * @param  {WebGLContext} context the WebGL context
	 * @param  {Number} width the width of this texture
	 * @param  {Number} height the height of this texture
	 * @param  {GLenum} format e.g. Texture.Format.RGBA
	 * @param  {GLenum} dataType e.g. Texture.DataType.UNSIGNED_BYTE (Uint8Array)
	 * @param  {GLenum} data the array buffer, e.g. a Uint8Array view
	 * @param  {Boolean} genMipmaps whether to generate mipmaps after uploading the data
	 */
	initialize: function Texture(context, width, height, format, dataType, data, genMipmaps) {
		if (typeof context !== "object")
			throw "GL context not specified to Texture";
		this.context = context;

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
		this.target = null; //initialized in create()

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
		 * @property {GLenum} wrapS the wrap S
		 */
		this.wrapS = Texture.DEFAULT_WRAP;
		/**
		 * @property {GLenum} wrapT the wrap T
		 */
		this.wrapT = Texture.DEFAULT_WRAP;
		/**
		 * @property {GLenum} minFilter the minifcation filter
		 */
		this.minFilter = Texture.DEFAULT_FILTER;
		
		/**
		 * @property {GLenum} magFilter the magnification filter
		 */
		this.magFilter = Texture.DEFAULT_FILTER;

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
		 * @type {Array} the array of arguments, shifted to exclude the WebGLContext parameter
		 */
		this.managedArgs = Array.prototype.slice.call(arguments, 1);

		//This is maanged by WebGLContext
		this.context.addManagedObject(this);
		this.create();
	},

	/**
	 * On instantiation and subsequent context restore, this function is called
	 * to parse the constructor's arguments.
	 * 
	 * @protected
	 */
	_handleCreate: function(width, height, format, dataType, data, genMipmaps) {
		var gl = this.gl;

		//If the first argument is a string, assume it's an Image loader
		//second argument will then be genMipmaps, third and fourth the success/fail callbacks
		if (typeof width === "string") {
			var img = new Image();
			var path      = arguments[0];   //first argument, the path
			var successCB = typeof arguments[1] === "function" ? arguments[1] : null;
			var failCB    = typeof arguments[2] === "function" ? arguments[2] : null;
			genMipmaps    = !!arguments[3];

			var self = this;

			//Unfortunately, requestAnimationFrame fires before img.onload events in Chrome, even
			//if the image is already 'complete' (from cache). So we need to upload 1x1
			//transparent dummy data to ensure that the user isn't trying to render 
			//a Texture that hasn't been created yet.
			self.uploadData(1, 1);

			img.onload = function() {
				self.uploadImage(img, undefined, undefined, genMipmaps);
				if (successCB)
					successCB();
			}
			img.onerror = function() {
				// console.warn("Error loading image: "+path);
				if (genMipmaps) //we gen mipmaps on the 1x1 dummy
					gl.generateMipmap(gl.TEXTURE_2D);
				if (failCB)
					failCB();
			}
			img.onabort = function() {
				// console.warn("Image load aborted: "+path);
				if (genMipmaps) //we gen mipmaps on the 1x1 dummy
					gl.generateMipmap(gl.TEXTURE_2D);
				if (failCB)
					failCB();
			}

			img.src = path;
		} 
		//otherwise assume our regular list of width/height arguments are passed
		else {
			this.uploadData(width, height, format, dataType, data, genMipmaps);
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
		
		if (this.managedArgs.length !== 0) {
			this._handleCreate.apply(this, this.managedArgs);
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

		this.format = format || gl.RGBA;
		type = type || gl.UNSIGNED_BYTE;
		data = data || null; //make sure falsey value is null for texImage2D

		this.width = (width || width==0) ? width : this.width;
		this.height = (height || height==0) ? height : this.height;

		this._checkPOT();

		this.bind();

		gl.texImage2D(this.target, 0, this.format, 
					  this.width, this.height, 0, this.format,
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

		this.format = format || gl.RGBA;
		type = type || gl.UNSIGNED_BYTE;
		
		this.width = domObject.width;
		this.height = domObject.height;

		this._checkPOT();

		this.bind();

		gl.texImage2D(this.target, 0, this.format, this.format,
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

//Unmanaged textures:
//	HTML elements like Image, Video, Canvas
//	pixels buffer from Canvas
//	pixels array

//Need special handling:
//  context.onContextLost.add(function() {
//  	createDynamicTexture();
//  }.bind(this));

//Managed textures:
//	images specified with a path
//	this will use Image under the hood


module.exports = Texture;
},{"klasse":11,"number-util":"2TLsQN","signals":"ggj4Dz"}],4:[function(require,module,exports){
var Class = require('klasse');
var Texture = require('./Texture');

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
},{"./Texture":3,"klasse":11}],5:[function(require,module,exports){
/**
 * @module kami
 */

var Class = require('klasse');
var Signal = require('signals');

/**
 * A thin wrapper around WebGLRenderingContext which handles
 * context loss and restore with various rendering objects (textures,
 * shaders and buffers). This also handles general viewport management.
 *
 * If the view is not specified, a canvas will be created.
 * 
 * @class  WebGLContext
 * @constructor
 * @param {Number} width the width of the GL canvas
 * @param {Number} height the height of the GL canvas
 * @param {HTMLCanvasElement} view the optional DOM canvas element
 * @param {Object} contextAttribuets an object containing context attribs which
 *                                   will be used during GL initialization
 */
var WebGLContext = new Class({
	
	initialize: function WebGLContext(width, height, view, contextAttributes) {
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

		/**
		 * The canvas DOM element for this context.
		 * @property {Number} view
		 */
		this.view = view || document.createElement("canvas");

		//default size as per spec:
		//http://www.w3.org/TR/2012/WD-html5-author-20120329/the-canvas-element.html#the-canvas-element
		
		/**
		 * The width of this canvas.
		 *
		 * @property width
		 * @type {Number}
		 */
		this.width = this.view.width = width || 300;

		/**
		 * The height of this canvas.
		 * @property height
		 * @type {Number}
		 */
		this.height = this.view.height = height || 150;


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
		this.view.addEventListener("webglcontextlost", function (ev) {
			ev.preventDefault();
			this._contextLost(ev);
		}.bind(this));
		this.view.addEventListener("webglcontextrestored", function (ev) {
			ev.preventDefault();
			this._contextRestored(ev);
		}.bind(this));
			
		this._initContext();

		this.resize(this.width, this.height);
	},
	
	_initContext: function() {
		var err = "";
		this.valid = false;

		try {
			this.gl = (this.view.getContext('webgl', this.contextAttributes) 
						|| this.view.getContext('experimental-webgl', this.contextAttributes));
		} catch (e) {
			this.gl = null;
		}

		if (this.gl) {
			this.valid = true;
		} else {
			throw "WebGL Context Not Supported -- try enabling it or using a different browser";
		}	
	},

	/**
	 * Updates the width and height of this WebGL context, resizes
	 * the canvas view, and calls gl.viewport() with the new size.
	 * 
	 * @param  {Number} width  the new width
	 * @param  {Number} height the new height
	 */
	resize: function(width, height) {
		this.width = width;
		this.height = height;

		this.view.width = width;
		this.view.height = height;

		var gl = this.gl;
		gl.viewport(0, 0, this.width, this.height);
	},

	/**
	 * (internal use)
	 * A managed object is anything with a "create" function, that will
	 * restore GL state after context loss. 
	 * 
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
	 */
	destroy: function() {
		for (var i=0; i<this.managedObjects.length; i++) {
			var obj = this.managedObjects[i];
			if (obj && typeof obj.destroy)
				obj.destroy();
		}
		this.managedObjects.length = 0;
		this.valid = false;
		this.gl = null;
		this.view = null;
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
		for (var i=0; i<this.managedObjects.length; i++) {
			this.managedObjects[i].create();
		}

		//update GL viewport
		this.resize(this.width, this.height);

		this.restored.dispatch(this);
	}
});

module.exports = WebGLContext;
},{"klasse":11,"signals":"ggj4Dz"}],6:[function(require,module,exports){
var Class = require('klasse');
var Texture = require('../Texture');


var FrameBuffer = new Class({

	/**
	 * Creates a new Frame Buffer Object with the given width and height.
	 *
	 * If width and height are non-numbers, this method expects the
	 * first parameter to be a Texture object which should be acted upon. 
	 * In this case, the FrameBuffer does not "own" the texture, and so it
	 * won't dispose of it upon destruction. This is an advanced version of the
	 * constructor that assumes the user is giving us a valid Texture that can be bound (i.e.
	 * no async Image textures).
	 *
	 * @class  FrameBuffer
	 * @constructor
	 * @param  {[type]} width  [description]
	 * @param  {[type]} height [description]
	 * @param  {[type]} filter [description]
	 * @return {[type]}        [description]
	 */
	initialize: function FrameBuffer(context, width, height, format) { //TODO: depth component
		if (typeof context !== "object")
			throw "GL context not specified to FrameBuffer";
	

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
		this.context = context;

		/**
		 * The Texture backed by this frame buffer.
		 *
		 * @property {Texture} Texture
		 */
		//this Texture is now managed.
		this.texture = new Texture(context, width, height, format);

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
			return this.texture.width
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
		this.texture = null;
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

module.exports = FrameBuffer;
},{"../Texture":3,"klasse":11}],7:[function(require,module,exports){
/**
 * @module kami
 */

var Class = require('klasse');

//TODO: decouple into VBO + IBO utilities 
/**
 * A mesh class that wraps VBO and IBO.
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
		if (typeof context !== "object")
			throw "GL context not specified to Mesh";
		if (!numVerts)
			throw "numVerts not specified, must be > 0";

		this.context = context;
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
		 * @property
		 * @private
		 */
		this._vertexStride = null;

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
		this._vertexStride = totalNumComponents * 4; // in bytes

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
		this.vertices = [];
		this.indices = [];
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
		var stride = this._vertexStride;

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
	 * Location is optional and for advanced users that
	 * want vertex arrays to match across shaders. Any non-numerical
	 * value will be converted to null, and ignored. If a numerical
	 * value is given, it will override the position of this attribute
	 * when given to a mesh.
	 * 
	 * @param  {[type]} name          [description]
	 * @param  {[type]} numComponents [description]
	 * @param  {[type]} location      [description]
	 * @return {[type]}               [description]
	 */
	initialize: function(name, numComponents, location, type, normalize, offsetCount) {
		this.name = name;
		this.numComponents = numComponents;
		this.location = typeof location === "number" ? location : null;
		this.type = type;
		this.normalize = Boolean(normalize);
		this.offsetCount = typeof offsetCount === "number" ? offsetCount : this.numComponents;
	}
})


module.exports = Mesh;
},{"klasse":11}],8:[function(require,module,exports){
/**
 * @module kami
 */

var Class = require('klasse');


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
	 * @param  {WebGLContext} context      the context to manage this object
	 * @param  {String} vertSource         the vertex shader source
	 * @param  {String} fragSource         the fragment shader source
	 * @param  {Object} attributeLocations the attribute locations
	 */
	initialize: function ShaderProgram(context, vertSource, fragSource, attributeLocations) {
		if (!vertSource || !fragSource)
			throw "vertex and fragment shaders must be defined";
		if (typeof context !== "object")
			throw "GL context not specified to ShaderProgram";
		this.context = context;

		this.vertShader = null;
		this.fragShader = null;
		this.program = null;
		this.log = "";

		this.uniformCache = null;
		this.attributeCache = null;

		this.attributeLocations = attributeLocations;

		//We trim (ECMAScript5) so that the GLSL line numbers are
		//accurate on shader log
		this.vertSource = vertSource.trim();
		this.fragSource = fragSource.trim();

		//Adds this shader to the context, to be managed
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
		
		this.log = "";

		this.vertShader = this._loadShader(gl.VERTEX_SHADER, this.vertSource);
		this.fragShader = this._loadShader(gl.FRAGMENT_SHADER, this.fragSource);

		if (!this.vertShader || !this.fragShader)
			throw "Error returned when calling createShader";

		this.program = gl.createProgram();

		gl.attachShader(this.program, this.vertShader);
		gl.attachShader(this.program, this.fragShader);
	
		//TODO: This seems not to be working on my OSX -- maybe a driver bug?
		if (this.attributeLocations) {
			for (var key in this.attributeLocations) {
				if (this.attributeLocations.hasOwnProperty(key)) {
					gl.bindAttribLocation(this.program, Math.floor(this.attributeLocations[key]), key);
				}
			}
		}

		gl.linkProgram(this.program); 

		this.log += gl.getProgramInfoLog(this.program) || "";

		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
			throw "Error linking the shader program:\n"
				+ this.log;
		}

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

	_loadShader: function(type, source) {
		var gl = this.gl;

		var shader = gl.createShader(type);
		if (!shader) //should not occur...
			return -1;

		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		
		var logResult = gl.getShaderInfoLog(shader) || "";
		if (logResult) {
			//we do this so the user knows which shader has the error
			var typeStr = (type === gl.VERTEX_SHADER) ? "vertex" : "fragment";
			logResult = "Error compiling "+ typeStr+ " shader:\n"+logResult;
		}

		this.log += logResult;

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) ) {
			throw this.log;
		}
		return shader;
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

		if (this.gl) {
			var gl = this.gl;
			gl.detachShader(this.vertShader);
			gl.detachShader(this.fragShader);

			gl.deleteShader(this.vertShader);
			gl.deleteShader(this.fragShader);
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
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (!loc) 
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
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (!loc) 
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
		count = count || arrayBuffer.length;
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (!loc) 
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
		count = count || arrayBuffer.length;
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (!loc) 
			return false;
		switch (count) {
			case 1: gl.uniform1iv(loc, arrayBuffer); return true;
			case 2: gl.uniform2iv(loc, arrayBuffer); return true;
			case 3: gl.uniform3iv(loc, arrayBuffer); return true;
			case 4: gl.uniform4iv(loc, arrayBuffer); return true;
			default:
				throw "invalid arguments to setUniformf"; 
		}
	}
});

module.exports = ShaderProgram;
},{"klasse":11}],"kami":[function(require,module,exports){
module.exports=require('mfBMhV');
},{}],"mfBMhV":[function(require,module,exports){
/**
  Auto-generated Kami index file.
  Created on 2013-12-23.
*/
module.exports = {
    //core classes
    'BaseBatch':       require('./BaseBatch.js'),
    'SpriteBatch':     require('./SpriteBatch.js'),
    'Texture':         require('./Texture.js'),
    'TextureRegion':   require('./TextureRegion.js'),
    'WebGLContext':    require('./WebGLContext.js'),
    'FrameBuffer':     require('./glutils/FrameBuffer.js'),
    'Mesh':            require('./glutils/Mesh.js'),
    'ShaderProgram':   require('./glutils/ShaderProgram.js')
};
},{"./BaseBatch.js":1,"./SpriteBatch.js":2,"./Texture.js":3,"./TextureRegion.js":4,"./WebGLContext.js":5,"./glutils/FrameBuffer.js":6,"./glutils/Mesh.js":7,"./glutils/ShaderProgram.js":8}],11:[function(require,module,exports){
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
 * 
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
},{}],"number-util":[function(require,module,exports){
module.exports=require('2TLsQN');
},{}],"2TLsQN":[function(require,module,exports){
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
	return (n & (n - 1)) == 0;
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
},{}],"signals":[function(require,module,exports){
module.exports=require('ggj4Dz');
},{}],"ggj4Dz":[function(require,module,exports){
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

},{}]},{},["mfBMhV"])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMvbnBtdXRpbHMva2FtaS9saWIvQmFzZUJhdGNoLmpzIiwiL3Byb2plY3RzL25wbXV0aWxzL2thbWkvbGliL1Nwcml0ZUJhdGNoLmpzIiwiL3Byb2plY3RzL25wbXV0aWxzL2thbWkvbGliL1RleHR1cmUuanMiLCIvcHJvamVjdHMvbnBtdXRpbHMva2FtaS9saWIvVGV4dHVyZVJlZ2lvbi5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pL2xpYi9XZWJHTENvbnRleHQuanMiLCIvcHJvamVjdHMvbnBtdXRpbHMva2FtaS9saWIvZ2x1dGlscy9GcmFtZUJ1ZmZlci5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pL2xpYi9nbHV0aWxzL01lc2guanMiLCIvcHJvamVjdHMvbnBtdXRpbHMva2FtaS9saWIvZ2x1dGlscy9TaGFkZXJQcm9ncmFtLmpzIiwiL3Byb2plY3RzL25wbXV0aWxzL2thbWkvbGliL2luZGV4LmpzIiwiL3Byb2plY3RzL25wbXV0aWxzL2thbWkvbm9kZV9tb2R1bGVzL2tsYXNzZS9pbmRleC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pL25vZGVfbW9kdWxlcy9udW1iZXItdXRpbC9pbmRleC5qcyIsIi9wcm9qZWN0cy9ucG11dGlscy9rYW1pL25vZGVfbW9kdWxlcy9zaWduYWxzL2Rpc3Qvc2lnbmFscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzljQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JtQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzViQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDOUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDaEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFRoZSBjb3JlIGthbWkgbW9kdWxlIHByb3ZpZGVzIGJhc2ljIDJEIHNwcml0ZSBiYXRjaGluZyBhbmQgXG4gKiBhc3NldCBtYW5hZ2VtZW50LlxuICogXG4gKiBAbW9kdWxlIGthbWlcbiAqL1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcbnZhciBNZXNoID0gcmVxdWlyZSgnLi9nbHV0aWxzL01lc2gnKTtcblxudmFyIGNvbG9yVG9GbG9hdCA9IHJlcXVpcmUoJ251bWJlci11dGlsJykuY29sb3JUb0Zsb2F0O1xuXG4vKiogXG4gKiBBIGJhdGNoZXIgbWl4aW4gY29tcG9zZWQgb2YgcXVhZHMgKHR3byB0cmlzLCBpbmRleGVkKS4gXG4gKlxuICogVGhpcyBpcyB1c2VkIGludGVybmFsbHk7IHVzZXJzIHNob3VsZCBsb29rIGF0IFxuICoge3sjY3Jvc3NMaW5rIFwiU3ByaXRlQmF0Y2hcIn19e3svY3Jvc3NMaW5rfX0gaW5zdGVhZCwgd2hpY2ggaW5oZXJpdHMgZnJvbSB0aGlzXG4gKiBjbGFzcy5cbiAqIFxuICogVGhlIGJhdGNoZXIgaXRzZWxmIGlzIG5vdCBtYW5hZ2VkIGJ5IFdlYkdMQ29udGV4dDsgaG93ZXZlciwgaXQgbWFrZXNcbiAqIHVzZSBvZiBNZXNoIGFuZCBUZXh0dXJlIHdoaWNoIHdpbGwgYmUgbWFuYWdlZC4gRm9yIHRoaXMgcmVhc29uLCB0aGUgYmF0Y2hlclxuICogZG9lcyBub3QgaG9sZCBhIGRpcmVjdCByZWZlcmVuY2UgdG8gdGhlIEdMIHN0YXRlLlxuICpcbiAqIFN1YmNsYXNzZXMgbXVzdCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZzogIFxuICoge3sjY3Jvc3NMaW5rIFwiQmFzZUJhdGNoL19jcmVhdGVTaGFkZXI6bWV0aG9kXCJ9fXt7L2Nyb3NzTGlua319ICBcbiAqIHt7I2Nyb3NzTGluayBcIkJhc2VCYXRjaC9fY3JlYXRlVmVydGV4QXR0cmlidXRlczptZXRob2RcIn19e3svY3Jvc3NMaW5rfX0gIFxuICoge3sjY3Jvc3NMaW5rIFwiQmFzZUJhdGNoL2dldFZlcnRleFNpemU6bWV0aG9kXCJ9fXt7L2Nyb3NzTGlua319ICBcbiAqIFxuICogQGNsYXNzICBCYXNlQmF0Y2hcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtXZWJHTENvbnRleHR9IGNvbnRleHQgdGhlIGNvbnRleHQgdGhpcyBiYXRjaGVyIGJlbG9uZ3MgdG9cbiAqIEBwYXJhbSB7TnVtYmVyfSBzaXplIHRoZSBvcHRpb25hbCBzaXplIG9mIHRoaXMgYmF0Y2gsIGkuZS4gbWF4IG51bWJlciBvZiBxdWFkc1xuICogQGRlZmF1bHQgIDUwMFxuICovXG52YXIgQmFzZUJhdGNoID0gbmV3IENsYXNzKHtcblxuXHQvL0NvbnN0cnVjdG9yXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIEJhc2VCYXRjaChjb250ZXh0LCBzaXplKSB7XG5cdFx0aWYgKHR5cGVvZiBjb250ZXh0ICE9PSBcIm9iamVjdFwiKVxuXHRcdFx0dGhyb3cgXCJHTCBjb250ZXh0IG5vdCBzcGVjaWZpZWQgdG8gU3ByaXRlQmF0Y2hcIjtcblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXG5cdFx0dGhpcy5zaXplID0gc2l6ZSB8fCA1MDA7XG5cdFx0XG5cdFx0Ly8gNjU1MzUgaXMgbWF4IGluZGV4LCBzbyA2NTUzNSAvIDYgPSAxMDkyMi5cblx0XHRpZiAodGhpcy5zaXplID4gMTA5MjIpICAvLyh5b3UnZCBoYXZlIHRvIGJlIGluc2FuZSB0byB0cnkgYW5kIGJhdGNoIHRoaXMgbXVjaCB3aXRoIFdlYkdMKVxuXHRcdFx0dGhyb3cgXCJDYW4ndCBoYXZlIG1vcmUgdGhhbiAxMDkyMiBzcHJpdGVzIHBlciBiYXRjaDogXCIgKyB0aGlzLnNpemU7XG5cdFx0XHRcdFxuXHRcdFxuXHRcdC8vVE9ETzogbWFrZSB0aGVzZSBwdWJsaWNcblx0XHR0aGlzLl9ibGVuZFNyYyA9IHRoaXMuY29udGV4dC5nbC5PTkU7XG5cdFx0dGhpcy5fYmxlbmREc3QgPSB0aGlzLmNvbnRleHQuZ2wuT05FX01JTlVTX1NSQ19BTFBIQVxuXHRcdHRoaXMuX2JsZW5kRW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5fc2hhZGVyID0gdGhpcy5fY3JlYXRlU2hhZGVyKCk7XG5cblx0XHQvKipcblx0XHQgKiBUaGlzIHNoYWRlciB3aWxsIGJlIHVzZWQgd2hlbmV2ZXIgXCJudWxsXCIgaXMgcGFzc2VkXG5cdFx0ICogYXMgdGhlIGJhdGNoJ3Mgc2hhZGVyLiBcblx0XHQgKlxuXHRcdCAqIEBwcm9wZXJ0eSB7U2hhZGVyUHJvZ3JhbX0gc2hhZGVyXG5cdFx0ICovXG5cdFx0dGhpcy5kZWZhdWx0U2hhZGVyID0gdGhpcy5fc2hhZGVyO1xuXG5cdFx0LyoqXG5cdFx0ICogQnkgZGVmYXVsdCwgYSBTcHJpdGVCYXRjaCBpcyBjcmVhdGVkIHdpdGggaXRzIG93biBTaGFkZXJQcm9ncmFtLFxuXHRcdCAqIHN0b3JlZCBpbiBgZGVmYXVsdFNoYWRlcmAuIElmIHRoaXMgZmxhZyBpcyB0cnVlLCBvbiBkZWxldGluZyB0aGUgU3ByaXRlQmF0Y2gsIGl0c1xuXHRcdCAqIGBkZWZhdWx0U2hhZGVyYCB3aWxsIGFsc28gYmUgZGVsZXRlZC4gSWYgdGhpcyBmbGFnIGlzIGZhbHNlLCBubyBzaGFkZXJzXG5cdFx0ICogd2lsbCBiZSBkZWxldGVkIG9uIGRlc3Ryb3kuXG5cdFx0ICpcblx0XHQgKiBOb3RlIHRoYXQgaWYgeW91IHJlLWFzc2lnbiBgZGVmYXVsdFNoYWRlcmAsIHlvdSB3aWxsIG5lZWQgdG8gZGlzcG9zZSB0aGUgcHJldmlvdXNcblx0XHQgKiBkZWZhdWx0IHNoYWRlciB5b3Vyc2VsLiBcblx0XHQgKlxuXHRcdCAqIEBwcm9wZXJ0eSBvd25zU2hhZGVyXG5cdFx0ICogQHR5cGUge0Jvb2xlYW59XG5cdFx0ICovXG5cdFx0dGhpcy5vd25zU2hhZGVyID0gdHJ1ZTtcblxuXHRcdHRoaXMuaWR4ID0gMDtcblx0XHR0aGlzLmRyYXdpbmcgPSBmYWxzZTtcblxuXHRcdHRoaXMubWVzaCA9IHRoaXMuX2NyZWF0ZU1lc2godGhpcy5zaXplKTtcblxuXG5cdFx0LyoqXG5cdFx0ICogVGhlIEFCR1IgcGFja2VkIGNvbG9yLCBhcyBhIHNpbmdsZSBmbG9hdC4gVGhlIGRlZmF1bHRcblx0XHQgKiB2YWx1ZSBpcyB0aGUgY29sb3Igd2hpdGUgKDI1NSwgMjU1LCAyNTUsIDI1NSkuXG5cdFx0ICpcblx0XHQgKiBAcHJvcGVydHkge051bWJlcn0gY29sb3Jcblx0XHQgKiBAcmVhZE9ubHkgXG5cdFx0ICovXG5cdFx0dGhpcy5jb2xvciA9IGNvbG9yVG9GbG9hdCgyNTUsIDI1NSwgMjU1LCAyNTUpO1xuXHRcdFxuXHRcdC8qKlxuXHRcdCAqIFdoZXRoZXIgdG8gcHJlbXVsdGlwbHkgYWxwaGEgb24gY2FsbHMgdG8gc2V0Q29sb3IuIFxuXHRcdCAqIFRoaXMgaXMgdHJ1ZSBieSBkZWZhdWx0LCBzbyB0aGF0IHdlIGNhbiBjb252ZW5pZW50bHkgd3JpdGU6XG5cdFx0ICpcblx0XHQgKiAgICAgYmF0Y2guc2V0Q29sb3IoMSwgMCwgMCwgMC4yNSk7IC8vdGludHMgcmVkIHdpdGggMjUlIG9wYWNpdHlcblx0XHQgKlxuXHRcdCAqIElmIGZhbHNlLCB5b3UgbXVzdCBwcmVtdWx0aXBseSB0aGUgY29sb3JzIHlvdXJzZWxmIHRvIGFjaGlldmVcblx0XHQgKiB0aGUgc2FtZSB0aW50LCBsaWtlIHNvOlxuXHRcdCAqXG5cdFx0ICogICAgIGJhdGNoLnNldENvbG9yKDAuMjUsIDAsIDAsIDAuMjUpO1xuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSBwcmVtdWx0aXBsaWVkXG5cdFx0ICogQHR5cGUge0Jvb2xlYW59XG5cdFx0ICogQGRlZmF1bHQgIHRydWVcblx0XHQgKi9cblx0XHR0aGlzLnByZW11bHRpcGxpZWQgPSB0cnVlO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBUaGlzIGlzIGEgc2V0dGVyL2dldHRlciBmb3IgdGhpcyBiYXRjaCdzIGN1cnJlbnQgU2hhZGVyUHJvZ3JhbS5cblx0ICogSWYgdGhpcyBpcyBzZXQgd2hlbiB0aGUgYmF0Y2ggaXMgZHJhd2luZywgdGhlIHN0YXRlIHdpbGwgYmUgZmx1c2hlZFxuXHQgKiB0byB0aGUgR1BVIGFuZCB0aGUgbmV3IHNoYWRlciB3aWxsIHRoZW4gYmUgYm91bmQuXG5cdCAqXG5cdCAqIElmIGBudWxsYCBvciBhIGZhbHN5IHZhbHVlIGlzIHNwZWNpZmllZCwgdGhlIGJhdGNoJ3MgYGRlZmF1bHRTaGFkZXJgIHdpbGwgYmUgdXNlZC4gXG5cdCAqXG5cdCAqIE5vdGUgdGhhdCBzaGFkZXJzIGFyZSBib3VuZCBvbiBiYXRjaC5iZWdpbigpLlxuXHQgKlxuXHQgKiBAcHJvcGVydHkgc2hhZGVyXG5cdCAqIEB0eXBlIHtTaGFkZXJQcm9ncmFtfVxuXHQgKi9cblx0c2hhZGVyOiB7XG5cdFx0c2V0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRcdHZhciB3YXNEcmF3aW5nID0gdGhpcy5kcmF3aW5nO1xuXG5cdFx0XHRpZiAod2FzRHJhd2luZykge1xuXHRcdFx0XHR0aGlzLmVuZCgpOyAvL3VuYmluZHMgdGhlIHNoYWRlciBmcm9tIHRoZSBtZXNoXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3NoYWRlciA9IHZhbCA/IHZhbCA6IHRoaXMuZGVmYXVsdFNoYWRlcjtcblxuXHRcdFx0aWYgKHdhc0RyYXdpbmcpIHtcblx0XHRcdFx0dGhpcy5iZWdpbigpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NoYWRlcjtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGNvbG9yIG9mIHRoaXMgc3ByaXRlIGJhdGNoZXIsIHdoaWNoIGlzIHVzZWQgaW4gc3Vic2VxdWVudCBkcmF3XG5cdCAqIGNhbGxzLiBUaGlzIGRvZXMgbm90IGZsdXNoIHRoZSBiYXRjaC5cblx0ICpcblx0ICogSWYgdGhyZWUgb3IgbW9yZSBhcmd1bWVudHMgYXJlIHNwZWNpZmllZCwgdGhpcyBtZXRob2QgYXNzdW1lcyB0aGF0IFJHQiBcblx0ICogb3IgUkdCQSBmbG9hdCB2YWx1ZXMgKDAuMCB0byAxLjApIGFyZSBiZWluZyBwYXNzZWQuIFxuXHQgKiBcblx0ICogSWYgbGVzcyB0aGFuIHRocmVlIGFyZ3VtZW50cyBhcmUgc3BlY2lmaWVkLCB3ZSBvbmx5IGNvbnNpZGVyIHRoZSBmaXJzdCBcblx0ICogYW5kIGFzc2lnbiBpdCB0byBhbGwgZm91ciBjb21wb25lbnRzIC0tIHRoaXMgaXMgdXNlZnVsIGZvciBzZXR0aW5nIHRyYW5zcGFyZW5jeSBcblx0ICogaW4gYSBwcmVtdWx0aXBsaWVkIGFscGhhIHN0YWdlLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBzZXRDb2xvclxuXHQgKiBAcGFyYW0ge051bWJlcn0gciB0aGUgcmVkIGNvbXBvbmVudCwgbm9ybWFsaXplZFxuXHQgKiBAcGFyYW0ge051bWJlcn0gZyB0aGUgZ3JlZW4gY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBiIHRoZSBibHVlIGNvbXBvbmVudCwgbm9ybWFsaXplZFxuXHQgKiBAcGFyYW0ge051bWJlcn0gYSB0aGUgYWxwaGEgY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqL1xuXHRzZXRDb2xvcjogZnVuY3Rpb24ociwgZywgYiwgYSkge1xuXHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIHtcblx0XHRcdC8vZGVmYXVsdCBhbHBoYSB0byBvbmUgXG5cdFx0XHRhID0gKGEgfHwgYSA9PT0gMCkgPyBhIDogMS4wO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyID0gZyA9IGIgPSBhID0gKGFyZ3VtZW50c1swXSB8fCAwKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5wcmVtdWx0aXBsaWVkKSB7XG5cdFx0XHRyICo9IGE7XG5cdFx0XHRnICo9IGE7XG5cdFx0XHRiICo9IGE7XG5cdFx0fVxuXHRcdFxuXHRcdHRoaXMuY29sb3IgPSBjb2xvclRvRmxvYXQoXG5cdFx0XHR+fihyICogMjU1KSxcblx0XHRcdH5+KGcgKiAyNTUpLFxuXHRcdFx0fn4oYiAqIDI1NSksXG5cdFx0XHR+fihhICogMjU1KVxuXHRcdCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIENhbGxlZCBmcm9tIHRoZSBjb25zdHJ1Y3RvciB0byBjcmVhdGUgYSBuZXcgTWVzaCBcblx0ICogYmFzZWQgb24gdGhlIGV4cGVjdGVkIGJhdGNoIHNpemUuIFNob3VsZCBzZXQgdXBcblx0ICogdmVydHMgJiBpbmRpY2VzIHByb3Blcmx5LlxuXHQgKlxuXHQgKiBVc2VycyBzaG91bGQgbm90IGNhbGwgdGhpcyBkaXJlY3RseTsgaW5zdGVhZCwgaXRcblx0ICogc2hvdWxkIG9ubHkgYmUgaW1wbGVtZW50ZWQgYnkgc3ViY2xhc3Nlcy5cblx0ICogXG5cdCAqIEBtZXRob2QgX2NyZWF0ZU1lc2hcblx0ICogQHBhcmFtIHtOdW1iZXJ9IHNpemUgdGhlIHNpemUgcGFzc2VkIHRocm91Z2ggdGhlIGNvbnN0cnVjdG9yXG5cdCAqL1xuXHRfY3JlYXRlTWVzaDogZnVuY3Rpb24oc2l6ZSkge1xuXHRcdC8vdGhlIHRvdGFsIG51bWJlciBvZiBmbG9hdHMgaW4gb3VyIGJhdGNoXG5cdFx0dmFyIG51bVZlcnRzID0gc2l6ZSAqIDQgKiB0aGlzLmdldFZlcnRleFNpemUoKTtcblx0XHQvL3RoZSB0b3RhbCBudW1iZXIgb2YgaW5kaWNlcyBpbiBvdXIgYmF0Y2hcblx0XHR2YXIgbnVtSW5kaWNlcyA9IHNpemUgKiA2O1xuXHRcdHZhciBnbCA9IHRoaXMuY29udGV4dC5nbDtcblxuXHRcdC8vdmVydGV4IGRhdGFcblx0XHR0aGlzLnZlcnRpY2VzID0gbmV3IEZsb2F0MzJBcnJheShudW1WZXJ0cyk7XG5cdFx0Ly9pbmRleCBkYXRhXG5cdFx0dGhpcy5pbmRpY2VzID0gbmV3IFVpbnQxNkFycmF5KG51bUluZGljZXMpOyBcblx0XHRcblx0XHRmb3IgKHZhciBpPTAsIGo9MDsgaSA8IG51bUluZGljZXM7IGkgKz0gNiwgaiArPSA0KSBcblx0XHR7XG5cdFx0XHR0aGlzLmluZGljZXNbaSArIDBdID0gaiArIDA7IFxuXHRcdFx0dGhpcy5pbmRpY2VzW2kgKyAxXSA9IGogKyAxO1xuXHRcdFx0dGhpcy5pbmRpY2VzW2kgKyAyXSA9IGogKyAyO1xuXHRcdFx0dGhpcy5pbmRpY2VzW2kgKyAzXSA9IGogKyAwO1xuXHRcdFx0dGhpcy5pbmRpY2VzW2kgKyA0XSA9IGogKyAyO1xuXHRcdFx0dGhpcy5pbmRpY2VzW2kgKyA1XSA9IGogKyAzO1xuXHRcdH1cblxuXHRcdHZhciBtZXNoID0gbmV3IE1lc2godGhpcy5jb250ZXh0LCBmYWxzZSwgXG5cdFx0XHRcdFx0XHRudW1WZXJ0cywgbnVtSW5kaWNlcywgdGhpcy5fY3JlYXRlVmVydGV4QXR0cmlidXRlcygpKTtcblx0XHRtZXNoLnZlcnRpY2VzID0gdGhpcy52ZXJ0aWNlcztcblx0XHRtZXNoLmluZGljZXMgPSB0aGlzLmluZGljZXM7XG5cdFx0bWVzaC52ZXJ0ZXhVc2FnZSA9IGdsLkRZTkFNSUNfRFJBVztcblx0XHRtZXNoLmluZGV4VXNhZ2UgPSBnbC5TVEFUSUNfRFJBVztcblx0XHRtZXNoLmRpcnR5ID0gdHJ1ZTtcblx0XHRyZXR1cm4gbWVzaDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyBhIHNoYWRlciBmb3IgdGhpcyBiYXRjaC4gSWYgeW91IHBsYW4gdG8gc3VwcG9ydFxuXHQgKiBtdWx0aXBsZSBpbnN0YW5jZXMgb2YgeW91ciBiYXRjaCwgaXQgbWF5IG9yIG1heSBub3QgYmUgd2lzZVxuXHQgKiB0byB1c2UgYSBzaGFyZWQgc2hhZGVyIHRvIHNhdmUgcmVzb3VyY2VzLlxuXHQgKiBcblx0ICogVGhpcyBtZXRob2QgaW5pdGlhbGx5IHRocm93cyBhbiBlcnJvcjsgc28gaXQgbXVzdCBiZSBvdmVycmlkZGVuIGJ5XG5cdCAqIHN1YmNsYXNzZXMgb2YgQmFzZUJhdGNoLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBfY3JlYXRlU2hhZGVyXG5cdCAqIEByZXR1cm4ge051bWJlcn0gdGhlIHNpemUgb2YgYSB2ZXJ0ZXgsIGluICMgb2YgZmxvYXRzXG5cdCAqL1xuXHRfY3JlYXRlU2hhZGVyOiBmdW5jdGlvbigpIHtcblx0XHR0aHJvdyBcIl9jcmVhdGVTaGFkZXIgbm90IGltcGxlbWVudGVkXCJcblx0fSxcdFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFuIGFycmF5IG9mIHZlcnRleCBhdHRyaWJ1dGVzIGZvciB0aGlzIG1lc2g7IFxuXHQgKiBzdWJjbGFzc2VzIHNob3VsZCBpbXBsZW1lbnQgdGhpcyB3aXRoIHRoZSBhdHRyaWJ1dGVzIFxuXHQgKiBleHBlY3RlZCBmb3IgdGhlaXIgYmF0Y2guXG5cdCAqXG5cdCAqIFRoaXMgbWV0aG9kIGluaXRpYWxseSB0aHJvd3MgYW4gZXJyb3I7IHNvIGl0IG11c3QgYmUgb3ZlcnJpZGRlbiBieVxuXHQgKiBzdWJjbGFzc2VzIG9mIEJhc2VCYXRjaC5cblx0ICpcblx0ICogQG1ldGhvZCBfY3JlYXRlVmVydGV4QXR0cmlidXRlc1xuXHQgKiBAcmV0dXJuIHtBcnJheX0gYW4gYXJyYXkgb2YgTWVzaC5WZXJ0ZXhBdHRyaWIgb2JqZWN0c1xuXHQgKi9cblx0X2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IFwiX2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXMgbm90IGltcGxlbWVudGVkXCI7XG5cdH0sXG5cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIGZsb2F0cyBwZXIgdmVydGV4IGZvciB0aGlzIGJhdGNoZXIuXG5cdCAqIFxuXHQgKiBUaGlzIG1ldGhvZCBpbml0aWFsbHkgdGhyb3dzIGFuIGVycm9yOyBzbyBpdCBtdXN0IGJlIG92ZXJyaWRkZW4gYnlcblx0ICogc3ViY2xhc3NlcyBvZiBCYXNlQmF0Y2guXG5cdCAqXG5cdCAqIEBtZXRob2QgIGdldFZlcnRleFNpemVcblx0ICogQHJldHVybiB7TnVtYmVyfSB0aGUgc2l6ZSBvZiBhIHZlcnRleCwgaW4gIyBvZiBmbG9hdHNcblx0ICovXG5cdGdldFZlcnRleFNpemU6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IFwiZ2V0VmVydGV4U2l6ZSBub3QgaW1wbGVtZW50ZWRcIjtcblx0fSxcblxuXHRcblx0LyoqIFxuXHQgKiBCZWdpbnMgdGhlIHNwcml0ZSBiYXRjaC4gVGhpcyB3aWxsIGJpbmQgdGhlIHNoYWRlclxuXHQgKiBhbmQgbWVzaC4gU3ViY2xhc3NlcyBtYXkgd2FudCB0byBkaXNhYmxlIGRlcHRoIG9yIFxuXHQgKiBzZXQgdXAgYmxlbmRpbmcuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGJlZ2luXG5cdCAqL1xuXHRiZWdpbjogZnVuY3Rpb24oKSAge1xuXHRcdGlmICh0aGlzLmRyYXdpbmcpIFxuXHRcdFx0dGhyb3cgXCJiYXRjaC5lbmQoKSBtdXN0IGJlIGNhbGxlZCBiZWZvcmUgYmVnaW5cIjtcblx0XHR0aGlzLmRyYXdpbmcgPSB0cnVlO1xuXG5cdFx0dGhpcy5zaGFkZXIuYmluZCgpO1xuXG5cdFx0Ly9iaW5kIHRoZSBhdHRyaWJ1dGVzIG5vdyB0byBhdm9pZCByZWR1bmRhbnQgY2FsbHNcblx0XHR0aGlzLm1lc2guYmluZCh0aGlzLnNoYWRlcik7XG5cdH0sXG5cblx0LyoqIFxuXHQgKiBFbmRzIHRoZSBzcHJpdGUgYmF0Y2guIFRoaXMgd2lsbCBmbHVzaCBhbnkgcmVtYWluaW5nIFxuXHQgKiBkYXRhIGFuZCBzZXQgR0wgc3RhdGUgYmFjayB0byBub3JtYWwuXG5cdCAqIFxuXHQgKiBAbWV0aG9kICBlbmRcblx0ICovXG5cdGVuZDogZnVuY3Rpb24oKSAge1xuXHRcdGlmICghdGhpcy5kcmF3aW5nKVxuXHRcdFx0dGhyb3cgXCJiYXRjaC5iZWdpbigpIG11c3QgYmUgY2FsbGVkIGJlZm9yZSBlbmRcIjtcblx0XHRpZiAodGhpcy5pZHggPiAwKVxuXHRcdFx0dGhpcy5mbHVzaCgpO1xuXHRcdHRoaXMuZHJhd2luZyA9IGZhbHNlO1xuXG5cdFx0dGhpcy5tZXNoLnVuYmluZCh0aGlzLnNoYWRlcik7XG5cdH0sXG5cblx0LyoqIFxuXHQgKiBDYWxsZWQgYmVmb3JlIHJlbmRlcmluZyB0byBiaW5kIG5ldyB0ZXh0dXJlcy5cblx0ICogVGhpcyBtZXRob2QgZG9lcyBub3RoaW5nIGJ5IGRlZmF1bHQuXG5cdCAqXG5cdCAqIEBtZXRob2QgIF9wcmVSZW5kZXJcblx0ICovXG5cdF9wcmVSZW5kZXI6IGZ1bmN0aW9uKCkgIHtcblx0fSxcblxuXHQvKiogXG5cdCAqIENhbGxlZCBhZnRlciBmbHVzaGluZyB0aGUgYmF0Y2guIFRoaXMgbWV0aG9kXG5cdCAqIGRvZXMgbm90aGluZyBieSBkZWZhdWx0LlxuXHQgKlxuXHQgKiBAbWV0aG9kICBfcG9zdFJlbmRlclxuXHQgKi9cblx0X3Bvc3RSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBGbHVzaGVzIHRoZSBiYXRjaCBieSBwdXNoaW5nIHRoZSBjdXJyZW50IGRhdGFcblx0ICogdG8gR0wuXG5cdCAqIFxuXHQgKiBAbWV0aG9kIGZsdXNoXG5cdCAqL1xuXHRmbHVzaDogZnVuY3Rpb24oKSAge1xuXHRcdGlmICh0aGlzLmlkeD09PTApXG5cdFx0XHRyZXR1cm47XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdFxuXHRcdHRoaXMuX3ByZVJlbmRlcigpO1xuXG5cdFx0Ly9udW1iZXIgb2Ygc3ByaXRlcyBpbiBiYXRjaFxuXHRcdHZhciBudW1Db21wb25lbnRzID0gdGhpcy5nZXRWZXJ0ZXhTaXplKCk7XG5cdFx0dmFyIHNwcml0ZUNvdW50ID0gKHRoaXMuaWR4IC8gKG51bUNvbXBvbmVudHMgKiA0KSk7XG5cdFx0XG5cdFx0Ly9kcmF3IHRoZSBzcHJpdGVzXG5cdFx0dmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHRcdHRoaXMubWVzaC52ZXJ0aWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLm1lc2guZHJhdyhnbC5UUklBTkdMRVMsIHNwcml0ZUNvdW50ICogNiwgMCwgdGhpcy5pZHgpO1xuXG5cdFx0dGhpcy5pZHggPSAwO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBBZGRzIGEgc3ByaXRlIHRvIHRoaXMgYmF0Y2guXG5cdCAqIFRoZSBzcGVjaWZpY3MgZGVwZW5kIG9uIHRoZSBzcHJpdGUgYmF0Y2ggaW1wbGVtZW50YXRpb24uXG5cdCAqXG5cdCAqIEBtZXRob2QgZHJhd1xuXHQgKiBAcGFyYW0gIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIGZvciB0aGlzIHNwcml0ZVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHggICAgICAgdGhlIHggcG9zaXRpb24sIGRlZmF1bHRzIHRvIHplcm9cblx0ICogQHBhcmFtICB7TnVtYmVyfSB5ICAgICAgIHRoZSB5IHBvc2l0aW9uLCBkZWZhdWx0cyB0byB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICB0aGUgd2lkdGgsIGRlZmF1bHRzIHRvIHRoZSB0ZXh0dXJlIHdpZHRoXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0ICB0aGUgaGVpZ2h0LCBkZWZhdWx0cyB0byB0aGUgdGV4dHVyZSBoZWlnaHRcblx0ICogQHBhcmFtICB7TnVtYmVyfSB1MSAgICAgIHRoZSBmaXJzdCBVIGNvb3JkaW5hdGUsIGRlZmF1bHQgemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHYxICAgICAgdGhlIGZpcnN0IFYgY29vcmRpbmF0ZSwgZGVmYXVsdCB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdTIgICAgICB0aGUgc2Vjb25kIFUgY29vcmRpbmF0ZSwgZGVmYXVsdCBvbmVcblx0ICogQHBhcmFtICB7TnVtYmVyfSB2MiAgICAgIHRoZSBzZWNvbmQgViBjb29yZGluYXRlLCBkZWZhdWx0IG9uZVxuXHQgKi9cblx0ZHJhdzogZnVuY3Rpb24odGV4dHVyZSwgeCwgeSwgd2lkdGgsIGhlaWdodCwgdTEsIHYxLCB1MiwgdjIpIHtcblx0fSxcblxuXHQvKipcblx0ICogQWRkcyBhIHNpbmdsZSBxdWFkIG1lc2ggdG8gdGhpcyBzcHJpdGUgYmF0Y2ggZnJvbSB0aGUgZ2l2ZW5cblx0ICogYXJyYXkgb2YgdmVydGljZXMuXG5cdCAqIFRoZSBzcGVjaWZpY3MgZGVwZW5kIG9uIHRoZSBzcHJpdGUgYmF0Y2ggaW1wbGVtZW50YXRpb24uXG5cdCAqXG5cdCAqIEBtZXRob2QgIGRyYXdWZXJ0aWNlc1xuXHQgKiBAcGFyYW0ge1RleHR1cmV9IHRleHR1cmUgdGhlIHRleHR1cmUgd2UgYXJlIGRyYXdpbmcgZm9yIHRoaXMgc3ByaXRlXG5cdCAqIEBwYXJhbSB7RmxvYXQzMkFycmF5fSB2ZXJ0cyBhbiBhcnJheSBvZiB2ZXJ0aWNlc1xuXHQgKiBAcGFyYW0ge051bWJlcn0gb2ZmIHRoZSBvZmZzZXQgaW50byB0aGUgdmVydGljZXMgYXJyYXkgdG8gcmVhZCBmcm9tXG5cdCAqL1xuXHRkcmF3VmVydGljZXM6IGZ1bmN0aW9uKHRleHR1cmUsIHZlcnRzLCBvZmYpICB7XG5cdH0sXG5cblx0ZHJhd1JlZ2lvbjogZnVuY3Rpb24ocmVnaW9uLCB4LCB5LCB3aWR0aCwgaGVpZ2h0KSB7XG5cdFx0dGhpcy5kcmF3KHJlZ2lvbi50ZXh0dXJlLCB4LCB5LCB3aWR0aCwgaGVpZ2h0LCByZWdpb24udSwgcmVnaW9uLnYsIHJlZ2lvbi51MiwgcmVnaW9uLnYyKTtcblx0fSxcblxuXHQvKipcblx0ICogRGVzdHJveXMgdGhlIGJhdGNoLCBkZWxldGluZyBpdHMgYnVmZmVycyBhbmQgcmVtb3ZpbmcgaXQgZnJvbSB0aGVcblx0ICogV2ViR0xDb250ZXh0IG1hbmFnZW1lbnQuIFRyeWluZyB0byB1c2UgdGhpc1xuXHQgKiBiYXRjaCBhZnRlciBkZXN0cm95aW5nIGl0IGNhbiBsZWFkIHRvIHVucHJlZGljdGFibGUgYmVoYXZpb3VyLlxuXHQgKlxuXHQgKiBJZiBgb3duc1NoYWRlcmAgaXMgdHJ1ZSwgdGhpcyB3aWxsIGFsc28gZGVsZXRlIHRoZSBgZGVmYXVsdFNoYWRlcmAgb2JqZWN0LlxuXHQgKiBcblx0ICogQG1ldGhvZCBkZXN0cm95XG5cdCAqL1xuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnZlcnRpY2VzID0gW107XG5cdFx0dGhpcy5pbmRpY2VzID0gW107XG5cdFx0dGhpcy5zaXplID0gdGhpcy5tYXhWZXJ0aWNlcyA9IDA7XG5cblx0XHRpZiAodGhpcy5kZWZhdWx0U2hhZGVyKVxuXHRcdFx0dGhpcy5kZWZhdWx0U2hhZGVyLmRlc3Ryb3koKTtcblx0XHR0aGlzLmRlZmF1bHRTaGFkZXIgPSBudWxsO1xuXHRcdHRoaXMuX3NoYWRlciA9IG51bGw7IC8vIHJlbW92ZSByZWZlcmVuY2UgdG8gd2hhdGV2ZXIgc2hhZGVyIGlzIGN1cnJlbnRseSBiZWluZyB1c2VkXG5cblx0XHRpZiAodGhpcy5tZXNoKSBcblx0XHRcdHRoaXMubWVzaC5kZXN0cm95KCk7XG5cdFx0dGhpcy5tZXNoID0gbnVsbDtcblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQmFzZUJhdGNoO1xuIiwiLyoqXG4gKiBAbW9kdWxlIGthbWlcbiAqL1xuXG4vLyBSZXF1aXJlcy4uLi5cbnZhciBDbGFzcyAgICAgICAgID0gcmVxdWlyZSgna2xhc3NlJyk7XG5cbnZhciBCYXNlQmF0Y2ggPSByZXF1aXJlKCcuL0Jhc2VCYXRjaCcpO1xuXG52YXIgTWVzaCAgICAgICAgICA9IHJlcXVpcmUoJy4vZ2x1dGlscy9NZXNoJyk7XG52YXIgU2hhZGVyUHJvZ3JhbSA9IHJlcXVpcmUoJy4vZ2x1dGlscy9TaGFkZXJQcm9ncmFtJyk7XG5cbi8qKlxuICogQSBiYXNpYyBpbXBsZW1lbnRhdGlvbiBvZiBhIGJhdGNoZXIgd2hpY2ggZHJhd3MgMkQgc3ByaXRlcy5cbiAqIFRoaXMgdXNlcyB0d28gdHJpYW5nbGVzIChxdWFkcykgd2l0aCBpbmRleGVkIGFuZCBpbnRlcmxlYXZlZFxuICogdmVydGV4IGRhdGEuIEVhY2ggdmVydGV4IGhvbGRzIDUgZmxvYXRzIChQb3NpdGlvbi54eSwgQ29sb3IsIFRleENvb3JkMC54eSkuXG4gKlxuICogVGhlIGNvbG9yIGlzIHBhY2tlZCBpbnRvIGEgc2luZ2xlIGZsb2F0IHRvIHJlZHVjZSB2ZXJ0ZXggYmFuZHdpZHRoLCBhbmRcbiAqIHRoZSBkYXRhIGlzIGludGVybGVhdmVkIGZvciBiZXN0IHBlcmZvcm1hbmNlLiBXZSB1c2UgYSBzdGF0aWMgaW5kZXggYnVmZmVyLFxuICogYW5kIGEgZHluYW1pYyB2ZXJ0ZXggYnVmZmVyIHRoYXQgaXMgdXBkYXRlZCB3aXRoIGJ1ZmZlclN1YkRhdGEuIFxuICogXG4gKiBAZXhhbXBsZVxuICogICAgICB2YXIgU3ByaXRlQmF0Y2ggPSByZXF1aXJlKCdrYW1pJykuU3ByaXRlQmF0Y2g7ICBcbiAqICAgICAgXG4gKiAgICAgIC8vY3JlYXRlIGEgbmV3IGJhdGNoZXJcbiAqICAgICAgdmFyIGJhdGNoID0gbmV3IFNwcml0ZUJhdGNoKGNvbnRleHQpO1xuICpcbiAqICAgICAgZnVuY3Rpb24gcmVuZGVyKCkge1xuICogICAgICAgICAgYmF0Y2guYmVnaW4oKTtcbiAqICAgICAgICAgIFxuICogICAgICAgICAgLy9kcmF3IHNvbWUgc3ByaXRlcyBpbiBiZXR3ZWVuIGJlZ2luIGFuZCBlbmQuLi5cbiAqICAgICAgICAgIGJhdGNoLmRyYXcoIHRleHR1cmUsIDAsIDAsIDI1LCAzMiApO1xuICogICAgICAgICAgYmF0Y2guZHJhdyggdGV4dHVyZTEsIDAsIDI1LCA0MiwgMjMgKTtcbiAqIFxuICogICAgICAgICAgYmF0Y2guZW5kKCk7XG4gKiAgICAgIH1cbiAqIFxuICogQGNsYXNzICBTcHJpdGVCYXRjaFxuICogQHVzZXMgQmFzZUJhdGNoXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7V2ViR0xDb250ZXh0fSBjb250ZXh0IHRoZSBjb250ZXh0IGZvciB0aGlzIGJhdGNoXG4gKiBAcGFyYW0ge051bWJlcn0gc2l6ZSB0aGUgbWF4IG51bWJlciBvZiBzcHJpdGVzIHRvIGZpdCBpbiBhIHNpbmdsZSBiYXRjaFxuICovXG52YXIgU3ByaXRlQmF0Y2ggPSBuZXcgQ2xhc3Moe1xuXG5cdC8vaW5oZXJpdCBzb21lIHN0dWZmIG9udG8gdGhpcyBwcm90b3R5cGVcblx0TWl4aW5zOiBCYXNlQmF0Y2gsXG5cblx0Ly9Db25zdHJ1Y3RvclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBTcHJpdGVCYXRjaChjb250ZXh0LCBzaXplKSB7XG5cdFx0QmFzZUJhdGNoLmNhbGwodGhpcywgY29udGV4dCwgc2l6ZSk7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgcHJvamVjdGlvbiBGbG9hdDMyQXJyYXkgdmVjMiB3aGljaCBpc1xuXHRcdCAqIHVzZWQgdG8gYXZvaWQgc29tZSBtYXRyaXggY2FsY3VsYXRpb25zLlxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IHByb2plY3Rpb25cblx0XHQgKiBAdHlwZSB7RmxvYXQzMkFycmF5fVxuXHRcdCAqL1xuXHRcdHRoaXMucHJvamVjdGlvbiA9IG5ldyBGbG9hdDMyQXJyYXkoMik7XG5cblx0XHQvL1NldHMgdXAgYSBkZWZhdWx0IHByb2plY3Rpb24gdmVjdG9yIHNvIHRoYXQgdGhlIGJhdGNoIHdvcmtzIHdpdGhvdXQgc2V0UHJvamVjdGlvblxuXHRcdHRoaXMucHJvamVjdGlvblswXSA9IHRoaXMuY29udGV4dC53aWR0aC8yO1xuXHRcdHRoaXMucHJvamVjdGlvblsxXSA9IHRoaXMuY29udGV4dC5oZWlnaHQvMjtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBjdXJyZW50bHkgYm91bmQgdGV4dHVyZS4gRG8gbm90IG1vZGlmeS5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkge1RleHR1cmV9IHRleHR1cmVcblx0XHQgKiBAcmVhZE9ubHlcblx0XHQgKi9cblx0XHR0aGlzLnRleHR1cmUgPSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBUaGlzIGlzIGEgY29udmVuaWVuY2UgZnVuY3Rpb24gdG8gc2V0IHRoZSBiYXRjaCdzIHByb2plY3Rpb25cblx0ICogbWF0cml4IHRvIGFuIG9ydGhvZ3JhcGhpYyAyRCBwcm9qZWN0aW9uLCBiYXNlZCBvbiB0aGUgZ2l2ZW4gc2NyZWVuXG5cdCAqIHNpemUuIFRoaXMgYWxsb3dzIHVzZXJzIHRvIHJlbmRlciBpbiAyRCB3aXRob3V0IGFueSBuZWVkIGZvciBhIGNhbWVyYS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gd2lkdGggIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSBoZWlnaHQgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcmV0dXJuIHtbdHlwZV19ICAgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRyZXNpemU6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQpIHtcblx0XHR0aGlzLnNldFByb2plY3Rpb24od2lkdGgvMiwgaGVpZ2h0LzIpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBUaGUgbnVtYmVyIG9mIGZsb2F0cyBwZXIgdmVydGV4IGZvciB0aGlzIGJhdGNoZXIgXG5cdCAqIChQb3NpdGlvbi54eSArIENvbG9yICsgVGV4Q29vcmQwLnh5KS5cblx0ICpcblx0ICogQG1ldGhvZCAgZ2V0VmVydGV4U2l6ZVxuXHQgKiBAcmV0dXJuIHtOdW1iZXJ9IHRoZSBudW1iZXIgb2YgZmxvYXRzIHBlciB2ZXJ0ZXhcblx0ICovXG5cdGdldFZlcnRleFNpemU6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiBTcHJpdGVCYXRjaC5WRVJURVhfU0laRTtcblx0fSxcblxuXHQvKipcblx0ICogVXNlZCBpbnRlcm5hbGx5IHRvIHJldHVybiB0aGUgUG9zaXRpb24sIENvbG9yLCBhbmQgVGV4Q29vcmQwIGF0dHJpYnV0ZXMuXG5cdCAqXG5cdCAqIEBtZXRob2QgIF9jcmVhdGVWZXJ0ZXhBdHRyaWJ1ZXRzXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICogQHJldHVybiB7W3R5cGVdfSBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRfY3JlYXRlVmVydGV4QXR0cmlidXRlczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXG5cdFx0cmV0dXJuIFsgXG5cdFx0XHRuZXcgTWVzaC5BdHRyaWIoXCJQb3NpdGlvblwiLCAyKSxcblx0XHRcdCAvL3BhY2sgdGhlIGNvbG9yIHVzaW5nIHNvbWUgY3Jhenkgd2l6YXJkcnkgXG5cdFx0XHRuZXcgTWVzaC5BdHRyaWIoXCJDb2xvclwiLCA0LCBudWxsLCBnbC5VTlNJR05FRF9CWVRFLCB0cnVlLCAxKSxcblx0XHRcdG5ldyBNZXNoLkF0dHJpYihcIlRleENvb3JkMFwiLCAyKVxuXHRcdF07XG5cdH0sXG5cblxuXHQvKipcblx0ICogU2V0cyB0aGUgcHJvamVjdGlvbiB2ZWN0b3IsIGFuIHggYW5kIHlcblx0ICogZGVmaW5pbmcgdGhlIG1pZGRsZSBwb2ludHMgb2YgeW91ciBzdGFnZS5cblx0ICpcblx0ICogQG1ldGhvZCBzZXRQcm9qZWN0aW9uXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSB4IHRoZSB4IHByb2plY3Rpb24gdmFsdWVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IHkgdGhlIHkgcHJvamVjdGlvbiB2YWx1ZVxuXHQgKi9cblx0c2V0UHJvamVjdGlvbjogZnVuY3Rpb24oeCwgeSkge1xuXHRcdHZhciBvbGRYID0gdGhpcy5wcm9qZWN0aW9uWzBdO1xuXHRcdHZhciBvbGRZID0gdGhpcy5wcm9qZWN0aW9uWzFdO1xuXHRcdHRoaXMucHJvamVjdGlvblswXSA9IHg7XG5cdFx0dGhpcy5wcm9qZWN0aW9uWzFdID0geTtcblxuXHRcdC8vd2UgbmVlZCB0byBmbHVzaCB0aGUgYmF0Y2guLlxuXHRcdGlmICh0aGlzLmRyYXdpbmcgJiYgKHggIT0gb2xkWCB8fCB5ICE9IG9sZFkpKSB7XG5cdFx0XHR0aGlzLmZsdXNoKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVNYXRyaWNlcygpO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIGRlZmF1bHQgc2hhZGVyIGZvciB0aGlzIGJhdGNoLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBfY3JlYXRlU2hhZGVyXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICogQHJldHVybiB7U2hhZGVyUHJvZ3JhbX0gYSBuZXcgaW5zdGFuY2Ugb2YgU2hhZGVyUHJvZ3JhbVxuXHQgKi9cblx0X2NyZWF0ZVNoYWRlcjogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHNoYWRlciA9IG5ldyBTaGFkZXJQcm9ncmFtKHRoaXMuY29udGV4dCxcblx0XHRcdFx0U3ByaXRlQmF0Y2guREVGQVVMVF9WRVJUX1NIQURFUiwgXG5cdFx0XHRcdFNwcml0ZUJhdGNoLkRFRkFVTFRfRlJBR19TSEFERVIpO1xuXHRcdGlmIChzaGFkZXIubG9nKVxuXHRcdFx0Y29uc29sZS53YXJuKFwiU2hhZGVyIExvZzpcXG5cIiArIHNoYWRlci5sb2cpO1xuXHRcdHJldHVybiBzaGFkZXI7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFRoaXMgaXMgY2FsbGVkIGR1cmluZyByZW5kZXJpbmcgdG8gdXBkYXRlIHByb2plY3Rpb24vdHJhbnNmb3JtXG5cdCAqIG1hdHJpY2VzIGFuZCB1cGxvYWQgdGhlIG5ldyB2YWx1ZXMgdG8gdGhlIHNoYWRlci4gRm9yIGV4YW1wbGUsXG5cdCAqIGlmIHRoZSB1c2VyIGNhbGxzIHNldFByb2plY3Rpb24gbWlkLWRyYXcsIHRoZSBiYXRjaCB3aWxsIGZsdXNoXG5cdCAqIGFuZCB0aGlzIHdpbGwgYmUgY2FsbGVkIGJlZm9yZSBjb250aW51aW5nIHRvIGFkZCBpdGVtcyB0byB0aGUgYmF0Y2guXG5cdCAqXG5cdCAqIFlvdSBnZW5lcmFsbHkgc2hvdWxkIG5vdCBuZWVkIHRvIGNhbGwgdGhpcyBkaXJlY3RseS5cblx0ICogXG5cdCAqIEBtZXRob2QgIHVwZGF0ZU1hdHJpY2VzXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICovXG5cdHVwZGF0ZU1hdHJpY2VzOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnNoYWRlci5zZXRVbmlmb3JtZnYoXCJ1X3Byb2plY3Rpb25cIiwgdGhpcy5wcm9qZWN0aW9uKTtcblx0fSxcblxuXHQvKipcblx0ICogQ2FsbGVkIGJlZm9yZSByZW5kZXJpbmcsIGFuZCBiaW5kcyB0aGUgY3VycmVudCB0ZXh0dXJlLlxuXHQgKiBcblx0ICogQG1ldGhvZCBfcHJlUmVuZGVyXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICovXG5cdF9wcmVSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLnRleHR1cmUpXG5cdFx0XHR0aGlzLnRleHR1cmUuYmluZCgpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBCaW5kcyB0aGUgc2hhZGVyLCBkaXNhYmxlcyBkZXB0aCB3cml0aW5nLCBcblx0ICogZW5hYmxlcyBibGVuZGluZywgYWN0aXZhdGVzIHRleHR1cmUgdW5pdCAwLCBhbmQgc2VuZHNcblx0ICogZGVmYXVsdCBtYXRyaWNlcyBhbmQgc2FtcGxlcjJEIHVuaWZvcm1zIHRvIHRoZSBzaGFkZXIuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGJlZ2luXG5cdCAqL1xuXHRiZWdpbjogZnVuY3Rpb24oKSB7XG5cdFx0Ly9zcHJpdGUgYmF0Y2ggZG9lc24ndCBob2xkIGEgcmVmZXJlbmNlIHRvIEdMIHNpbmNlIGl0IGlzIHZvbGF0aWxlXG5cdFx0dmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHRcdFxuXHRcdC8vVGhpcyBiaW5kcyB0aGUgc2hhZGVyIGFuZCBtZXNoIVxuXHRcdEJhc2VCYXRjaC5wcm90b3R5cGUuYmVnaW4uY2FsbCh0aGlzKTtcblxuXHRcdHRoaXMudXBkYXRlTWF0cmljZXMoKTsgLy9zZW5kIHByb2plY3Rpb24vdHJhbnNmb3JtIHRvIHNoYWRlclxuXG5cdFx0Ly91cGxvYWQgdGhlIHNhbXBsZXIgdW5pZm9ybS4gbm90IG5lY2Vzc2FyeSBldmVyeSBmbHVzaCBzbyB3ZSBqdXN0XG5cdFx0Ly9kbyBpdCBoZXJlLlxuXHRcdHRoaXMuc2hhZGVyLnNldFVuaWZvcm1pKFwidV90ZXh0dXJlMFwiLCAwKTtcblxuXHRcdC8vZGlzYWJsZSBkZXB0aCBtYXNrXG5cdFx0Z2wuZGVwdGhNYXNrKGZhbHNlKTtcblxuXHRcdC8vcHJlbXVsdGlwbGllZCBhbHBoYVxuXHRcdGlmICh0aGlzLl9ibGVuZEVuYWJsZWQpIHtcblx0XHRcdGdsLmVuYWJsZShnbC5CTEVORCk7XG5cblx0XHRcdC8vc2V0IGVpdGhlciB0byAtMSBpZiB5b3Ugd2FudCB0byBjYWxsIHlvdXIgb3duIFxuXHRcdFx0Ly9ibGVuZEZ1bmMgb3IgYmxlbmRGdW5jU2VwYXJhdGVcblx0XHRcdGlmICh0aGlzLl9ibGVuZFNyYyAhPT0gLTEgJiYgdGhpcy5fYmxlbmREc3QgIT09IC0xKVxuXHRcdFx0XHRnbC5ibGVuZEZ1bmModGhpcy5fYmxlbmRTcmMsIHRoaXMuX2JsZW5kRHN0KTsgXG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBFbmRzIHRoZSBzcHJpdGUgYmF0Y2hlciBhbmQgZmx1c2hlcyBhbnkgcmVtYWluaW5nIGRhdGEgdG8gdGhlIEdQVS5cblx0ICogXG5cdCAqIEBtZXRob2QgZW5kXG5cdCAqL1xuXHRlbmQ6IGZ1bmN0aW9uKCkge1xuXHRcdC8vc3ByaXRlIGJhdGNoIGRvZXNuJ3QgaG9sZCBhIHJlZmVyZW5jZSB0byBHTCBzaW5jZSBpdCBpcyB2b2xhdGlsZVxuXHRcdHZhciBnbCA9IHRoaXMuY29udGV4dC5nbDtcblx0XHRcblx0XHQvL2p1c3QgZG8gZGlyZWN0IHBhcmVudCBjYWxsIGZvciBzcGVlZCBoZXJlXG5cdFx0Ly9UaGlzIGJpbmRzIHRoZSBzaGFkZXIgYW5kIG1lc2ghXG5cdFx0QmFzZUJhdGNoLnByb3RvdHlwZS5lbmQuY2FsbCh0aGlzKTtcblxuXHRcdGdsLmRlcHRoTWFzayh0cnVlKTtcblxuXHRcdGlmICh0aGlzLl9ibGVuZEVuYWJsZWQpXG5cdFx0XHRnbC5kaXNhYmxlKGdsLkJMRU5EKTtcblx0fSxcblxuXHQvKipcblx0ICogRmx1c2hlcyB0aGUgYmF0Y2ggdG8gdGhlIEdQVS4gVGhpcyBzaG91bGQgYmUgY2FsbGVkIHdoZW5cblx0ICogc3RhdGUgY2hhbmdlcywgc3VjaCBhcyBibGVuZCBmdW5jdGlvbnMsIGRlcHRoIG9yIHN0ZW5jaWwgc3RhdGVzLFxuXHQgKiBzaGFkZXJzLCBhbmQgc28gZm9ydGguXG5cdCAqIFxuXHQgKiBAbWV0aG9kIGZsdXNoXG5cdCAqL1xuXHRmbHVzaDogZnVuY3Rpb24oKSB7XG5cdFx0Ly9pZ25vcmUgZmx1c2ggaWYgdGV4dHVyZSBpcyBudWxsIG9yIG91ciBiYXRjaCBpcyBlbXB0eVxuXHRcdGlmICghdGhpcy50ZXh0dXJlKVxuXHRcdFx0cmV0dXJuO1xuXHRcdGlmICh0aGlzLmlkeCA9PT0gMClcblx0XHRcdHJldHVybjtcblx0XHRCYXNlQmF0Y2gucHJvdG90eXBlLmZsdXNoLmNhbGwodGhpcyk7XG5cdFx0U3ByaXRlQmF0Y2gudG90YWxSZW5kZXJDYWxscysrO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBBZGRzIGEgc3ByaXRlIHRvIHRoaXMgYmF0Y2guIFRoZSBzcHJpdGUgaXMgZHJhd24gaW4gXG5cdCAqIHNjcmVlbi1zcGFjZSB3aXRoIHRoZSBvcmlnaW4gYXQgdGhlIHVwcGVyLWxlZnQgY29ybmVyICh5LWRvd24pLlxuXHQgKiBcblx0ICogQG1ldGhvZCBkcmF3XG5cdCAqIEBwYXJhbSAge1RleHR1cmV9IHRleHR1cmUgdGhlIFRleHR1cmVcblx0ICogQHBhcmFtICB7TnVtYmVyfSB4ICAgICAgIHRoZSB4IHBvc2l0aW9uIGluIHBpeGVscywgZGVmYXVsdHMgdG8gemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHkgICAgICAgdGhlIHkgcG9zaXRpb24gaW4gcGl4ZWxzLCBkZWZhdWx0cyB0byB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICB0aGUgd2lkdGggaW4gcGl4ZWxzLCBkZWZhdWx0cyB0byB0aGUgdGV4dHVyZSB3aWR0aFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCAgdGhlIGhlaWdodCBpbiBwaXhlbHMsIGRlZmF1bHRzIHRvIHRoZSB0ZXh0dXJlIGhlaWdodFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHUxICAgICAgdGhlIGZpcnN0IFUgY29vcmRpbmF0ZSwgZGVmYXVsdCB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdjEgICAgICB0aGUgZmlyc3QgViBjb29yZGluYXRlLCBkZWZhdWx0IHplcm9cblx0ICogQHBhcmFtICB7TnVtYmVyfSB1MiAgICAgIHRoZSBzZWNvbmQgVSBjb29yZGluYXRlLCBkZWZhdWx0IG9uZVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHYyICAgICAgdGhlIHNlY29uZCBWIGNvb3JkaW5hdGUsIGRlZmF1bHQgb25lXG5cdCAqL1xuXHRkcmF3OiBmdW5jdGlvbih0ZXh0dXJlLCB4LCB5LCB3aWR0aCwgaGVpZ2h0LCB1MSwgdjEsIHUyLCB2Mikge1xuXHRcdGlmICghdGhpcy5kcmF3aW5nKVxuXHRcdFx0dGhyb3cgXCJJbGxlZ2FsIFN0YXRlOiB0cnlpbmcgdG8gZHJhdyBhIGJhdGNoIGJlZm9yZSBiZWdpbigpXCI7XG5cblx0XHQvL2Rvbid0IGRyYXcgYW55dGhpbmcgaWYgR0wgdGV4IGRvZXNuJ3QgZXhpc3QuLlxuXHRcdGlmICghdGV4dHVyZSlcblx0XHRcdHJldHVybjtcblxuXHRcdGlmICh0aGlzLnRleHR1cmUgPT09IG51bGwgfHwgdGhpcy50ZXh0dXJlLmlkICE9PSB0ZXh0dXJlLmlkKSB7XG5cdFx0XHQvL25ldyB0ZXh0dXJlLi4gZmx1c2ggcHJldmlvdXMgZGF0YVxuXHRcdFx0dGhpcy5mbHVzaCgpO1xuXHRcdFx0dGhpcy50ZXh0dXJlID0gdGV4dHVyZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaWR4ID09IHRoaXMudmVydGljZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmZsdXNoKCk7IC8vd2UndmUgcmVhY2hlZCBvdXIgbWF4LCBmbHVzaCBiZWZvcmUgcHVzaGluZyBtb3JlIGRhdGFcblx0XHR9XG5cblx0XHR3aWR0aCA9ICh3aWR0aD09PTApID8gd2lkdGggOiAod2lkdGggfHwgdGV4dHVyZS53aWR0aCk7XG5cdFx0aGVpZ2h0ID0gKGhlaWdodD09PTApID8gaGVpZ2h0IDogKGhlaWdodCB8fCB0ZXh0dXJlLmhlaWdodCk7XG5cdFx0eCA9IHggfHwgMDtcblx0XHR5ID0geSB8fCAwO1xuXG5cdFx0dmFyIHgxID0geDtcblx0XHR2YXIgeDIgPSB4ICsgd2lkdGg7XG5cdFx0dmFyIHkxID0geTtcblx0XHR2YXIgeTIgPSB5ICsgaGVpZ2h0O1xuXG5cdFx0dTEgPSB1MSB8fCAwO1xuXHRcdHUyID0gKHUyPT09MCkgPyB1MiA6ICh1MiB8fCAxKTtcblx0XHR2MSA9IHYxIHx8IDA7XG5cdFx0djIgPSAodjI9PT0wKSA/IHYyIDogKHYyIHx8IDEpO1xuXG5cdFx0dmFyIGMgPSB0aGlzLmNvbG9yO1xuXG5cdFx0Ly94eVxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB4MTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geTE7XG5cdFx0Ly9jb2xvclxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSBjO1xuXHRcdC8vdXZcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdTE7XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHYxO1xuXHRcdFxuXHRcdC8veHlcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geDI7XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHkxO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gYztcblx0XHQvL3V2XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHUyO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2MTtcblxuXHRcdC8veHlcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geDI7XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHkyO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gYztcblx0XHQvL3V2XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHUyO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2MjtcblxuXHRcdC8veHlcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geDE7XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHkyO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gYztcblx0XHQvL3V2XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHUxO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2Mjtcblx0fSxcblxuXHQvKipcblx0ICogQWRkcyBhIHNpbmdsZSBxdWFkIG1lc2ggdG8gdGhpcyBzcHJpdGUgYmF0Y2ggZnJvbSB0aGUgZ2l2ZW5cblx0ICogYXJyYXkgb2YgdmVydGljZXMuIFRoZSBzcHJpdGUgaXMgZHJhd24gaW4gXG5cdCAqIHNjcmVlbi1zcGFjZSB3aXRoIHRoZSBvcmlnaW4gYXQgdGhlIHVwcGVyLWxlZnQgY29ybmVyICh5LWRvd24pLlxuXHQgKlxuXHQgKiBUaGlzIHJlYWRzIDIwIGludGVybGVhdmVkIGZsb2F0cyBmcm9tIHRoZSBnaXZlbiBvZmZzZXQgaW5kZXgsIGluIHRoZSBmb3JtYXRcblx0ICpcblx0ICogIHsgeCwgeSwgY29sb3IsIHUsIHYsXG5cdCAqICAgICAgLi4uICB9XG5cdCAqXG5cdCAqIEBtZXRob2QgIGRyYXdWZXJ0aWNlc1xuXHQgKiBAcGFyYW0ge1RleHR1cmV9IHRleHR1cmUgdGhlIFRleHR1cmUgb2JqZWN0XG5cdCAqIEBwYXJhbSB7RmxvYXQzMkFycmF5fSB2ZXJ0cyBhbiBhcnJheSBvZiB2ZXJ0aWNlc1xuXHQgKiBAcGFyYW0ge051bWJlcn0gb2ZmIHRoZSBvZmZzZXQgaW50byB0aGUgdmVydGljZXMgYXJyYXkgdG8gcmVhZCBmcm9tXG5cdCAqL1xuXHRkcmF3VmVydGljZXM6IGZ1bmN0aW9uKHRleHR1cmUsIHZlcnRzLCBvZmYpIHtcblx0XHRpZiAoIXRoaXMuZHJhd2luZylcblx0XHRcdHRocm93IFwiSWxsZWdhbCBTdGF0ZTogdHJ5aW5nIHRvIGRyYXcgYSBiYXRjaCBiZWZvcmUgYmVnaW4oKVwiO1xuXHRcdFxuXHRcdC8vZG9uJ3QgZHJhdyBhbnl0aGluZyBpZiBHTCB0ZXggZG9lc24ndCBleGlzdC4uXG5cdFx0aWYgKCF0ZXh0dXJlKVxuXHRcdFx0cmV0dXJuO1xuXG5cblx0XHRpZiAodGhpcy50ZXh0dXJlICE9IHRleHR1cmUpIHtcblx0XHRcdC8vbmV3IHRleHR1cmUuLiBmbHVzaCBwcmV2aW91cyBkYXRhXG5cdFx0XHR0aGlzLmZsdXNoKCk7XG5cdFx0XHR0aGlzLnRleHR1cmUgPSB0ZXh0dXJlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5pZHggPT0gdGhpcy52ZXJ0aWNlcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuZmx1c2goKTsgLy93ZSd2ZSByZWFjaGVkIG91ciBtYXgsIGZsdXNoIGJlZm9yZSBwdXNoaW5nIG1vcmUgZGF0YVxuXHRcdH1cblxuXHRcdG9mZiA9IG9mZiB8fCAwO1xuXHRcdC8vVE9ETzogdXNlIGEgbG9vcCBoZXJlP1xuXHRcdC8veHlcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0Ly9jb2xvclxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0Ly91dlxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHRcblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vdXZcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vdXZcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vdXZcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdH1cbn0pO1xuXG4vKipcbiAqIFRoZSBkZWZhdWx0IHZlcnRleCBzaXplLCBpLmUuIG51bWJlciBvZiBmbG9hdHMgcGVyIHZlcnRleC5cbiAqIEBhdHRyaWJ1dGUgIFZFUlRFWF9TSVpFXG4gKiBAc3RhdGljXG4gKiBAZmluYWxcbiAqIEB0eXBlIHtOdW1iZXJ9XG4gKiBAZGVmYXVsdCAgNVxuICovXG5TcHJpdGVCYXRjaC5WRVJURVhfU0laRSA9IDU7XG5cbi8qKlxuICogSW5jcmVtZW50ZWQgYWZ0ZXIgZWFjaCBkcmF3IGNhbGwsIGNhbiBiZSB1c2VkIGZvciBkZWJ1Z2dpbmcuXG4gKlxuICogICAgIFNwcml0ZUJhdGNoLnRvdGFsUmVuZGVyQ2FsbHMgPSAwO1xuICpcbiAqICAgICAuLi4gZHJhdyB5b3VyIHNjZW5lIC4uLlxuICpcbiAqICAgICBjb25zb2xlLmxvZyhcIkRyYXcgY2FsbHMgcGVyIGZyYW1lOlwiLCBTcHJpdGVCYXRjaC50b3RhbFJlbmRlckNhbGxzKTtcbiAqXG4gKiBcbiAqIEBhdHRyaWJ1dGUgIHRvdGFsUmVuZGVyQ2FsbHNcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtOdW1iZXJ9XG4gKiBAZGVmYXVsdCAgMFxuICovXG5TcHJpdGVCYXRjaC50b3RhbFJlbmRlckNhbGxzID0gMDtcblxuU3ByaXRlQmF0Y2guREVGQVVMVF9GUkFHX1NIQURFUiA9IFtcblx0XCJwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcIixcblx0XCJ2YXJ5aW5nIHZlYzIgdlRleENvb3JkMDtcIixcblx0XCJ2YXJ5aW5nIHZlYzQgdkNvbG9yO1wiLFxuXHRcInVuaWZvcm0gc2FtcGxlcjJEIHVfdGV4dHVyZTA7XCIsXG5cblx0XCJ2b2lkIG1haW4odm9pZCkge1wiLFxuXHRcIiAgIGdsX0ZyYWdDb2xvciA9IHRleHR1cmUyRCh1X3RleHR1cmUwLCB2VGV4Q29vcmQwKSAqIHZDb2xvcjtcIixcblx0XCJ9XCJcbl0uam9pbignXFxuJyk7XG5cblNwcml0ZUJhdGNoLkRFRkFVTFRfVkVSVF9TSEFERVIgPSBbXG5cdFwiYXR0cmlidXRlIHZlYzIgUG9zaXRpb247XCIsXG5cdFwiYXR0cmlidXRlIHZlYzQgQ29sb3I7XCIsXG5cdFwiYXR0cmlidXRlIHZlYzIgVGV4Q29vcmQwO1wiLFxuXG5cdFwidW5pZm9ybSB2ZWMyIHVfcHJvamVjdGlvbjtcIixcblx0XCJ2YXJ5aW5nIHZlYzIgdlRleENvb3JkMDtcIixcblx0XCJ2YXJ5aW5nIHZlYzQgdkNvbG9yO1wiLFxuXG5cdFwidm9pZCBtYWluKHZvaWQpIHtcIixcblx0XCIgICBnbF9Qb3NpdGlvbiA9IHZlYzQoIFBvc2l0aW9uLnggLyB1X3Byb2plY3Rpb24ueCAtIDEuMCwgUG9zaXRpb24ueSAvIC11X3Byb2plY3Rpb24ueSArIDEuMCAsIDAuMCwgMS4wKTtcIixcblx0XCIgICB2VGV4Q29vcmQwID0gVGV4Q29vcmQwO1wiLFxuXHRcIiAgIHZDb2xvciA9IENvbG9yO1wiLFxuXHRcIn1cIlxuXS5qb2luKCdcXG4nKTtcblxubW9kdWxlLmV4cG9ydHMgPSBTcHJpdGVCYXRjaDtcbiIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgU2lnbmFsID0gcmVxdWlyZSgnc2lnbmFscycpO1xudmFyIG5leHRQb3dlck9mVHdvID0gcmVxdWlyZSgnbnVtYmVyLXV0aWwnKS5uZXh0UG93ZXJPZlR3bztcbnZhciBpc1Bvd2VyT2ZUd28gPSByZXF1aXJlKCdudW1iZXItdXRpbCcpLmlzUG93ZXJPZlR3bztcblxudmFyIFRleHR1cmUgPSBuZXcgQ2xhc3Moe1xuXG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgdGV4dHVyZSB3aXRoIHRoZSBvcHRpb25hbCB3aWR0aCwgaGVpZ2h0LCBhbmQgZGF0YS5cblx0ICpcblx0ICogSWYgdGhlIGNvbnN0cnVjdG9yIGlzIHBhc3NlZCBubyBwYXJhbWV0ZXJzIG90aGVyIHRoYW4gV2ViR0xDb250ZXh0LCB0aGVuXG5cdCAqIGl0IHdpbGwgbm90IGJlIGluaXRpYWxpemVkIGFuZCB3aWxsIGJlIG5vbi1yZW5kZXJhYmxlLiBZb3Ugd2lsbCBuZWVkIHRvIG1hbnVhbGx5XG5cdCAqIHVwbG9hZERhdGEgb3IgdXBsb2FkSW1hZ2UgeW91cnNlbGYuXG5cdCAqXG5cdCAqIElmIHlvdSBwYXNzIGEgd2lkdGggYW5kIGhlaWdodCBhZnRlciBjb250ZXh0LCB0aGUgdGV4dHVyZSB3aWxsIGJlIGluaXRpYWxpemVkIHdpdGggdGhhdCBzaXplXG5cdCAqIGFuZCBudWxsIGRhdGEgKGUuZy4gdHJhbnNwYXJlbnQgYmxhY2spLiBJZiB5b3UgYWxzbyBwYXNzIHRoZSBmb3JtYXQgYW5kIGRhdGEsIFxuXHQgKiBpdCB3aWxsIGJlIHVwbG9hZGVkIHRvIHRoZSB0ZXh0dXJlLiBcblx0ICpcblx0ICogSWYgeW91IHBhc3MgYSBTdHJpbmcgb3IgRGF0YSBVUkkgYXMgdGhlIHNlY29uZCBwYXJhbWV0ZXIsXG5cdCAqIHRoaXMgVGV4dHVyZSB3aWxsIGxvYWQgYW4gSW1hZ2Ugb2JqZWN0IGFzeW5jaHJvbm91c2x5LiBUaGUgb3B0aW9uYWwgdGhpcmRcblx0ICogYW5kIGZvdXJ0aCBwYXJhbWV0ZXJzIGFyZSBjYWxsYmFjayBmdW5jdGlvbnMgZm9yIHN1Y2Nlc3MgYW5kIGZhaWx1cmUsIHJlc3BlY3RpdmVseS4gXG5cdCAqIFRoZSBvcHRpb25hbCBmaWZydGggcGFyYW1ldGVyIGZvciB0aGlzIHZlcnNpb24gb2YgdGhlIGNvbnN0cnVjdG9yIGlzIGdlbk1pcG1hcHMsIHdoaWNoIGRlZmF1bHRzIHRvIGZhbHNlLiBcblx0ICogXG5cdCAqIF9Ob3RlOl8gVG8gYXZvaWQgV2ViR0wgZXJyb3JzIHdpdGggdGhlIEltYWdlIFVSTCBjb25zdHJ1Y3Rvcixcblx0ICogd2UgdXBsb2FkIGEgZHVtbXkgMXgxIHRyYW5zcGFyZW50IHRleHR1cmUgdW50aWwgdGhlIGFzeW5jIEltYWdlIGxvYWQgaGFzIGJlZW4gY29tcGxldGVkLiBTb1xuXHQgKiB0aGUgd2lkdGggYW5kIGhlaWdodCB3aWxsIG5vdCBiZSBhY2N1cmF0ZSB1bnRpbCB0aGUgb25Db21wbGV0ZSBjYWxsYmFjayBpcyBmaXJlZC5cblx0ICogXG5cdCAqIFRoZSBhcmd1bWVudHMgYXJlIGtlcHQgaW4gbWVtb3J5IGZvciBmdXR1cmUgY29udGV4dCByZXN0b3JhdGlvbiBldmVudHMuIElmXG5cdCAqIHRoaXMgaXMgdW5kZXNpcmFibGUgKGUuZy4gaHVnZSBidWZmZXJzIHdoaWNoIG5lZWQgdG8gYmUgR0MnZCksIHlvdSBzaG91bGQgbm90XG5cdCAqIHBhc3MgdGhlIGRhdGEgaW4gdGhlIGNvbnN0cnVjdG9yLCBidXQgaW5zdGVhZCB1cGxvYWQgaXQgYWZ0ZXIgY3JlYXRpbmcgYW4gdW5pbml0aWFsaXplZCBcblx0ICogdGV4dHVyZS4gWW91IHdpbGwgbmVlZCB0byBtYW5hZ2UgaXQgeW91cnNlbGYsIGVpdGhlciBieSBleHRlbmRpbmcgdGhlIGNyZWF0ZSgpIG1ldGhvZCwgXG5cdCAqIG9yIGxpc3RlbmluZyB0byByZXN0b3JlZCBldmVudHMgaW4gV2ViR0xDb250ZXh0LlxuXHQgKlxuXHQgKiBNb3N0IHVzZXJzIHdpbGwgd2FudCB0byB1c2UgdGhlIEFzc2V0TWFuYWdlciB0byBjcmVhdGUgYW5kIG1hbmFnZSB0aGVpciB0ZXh0dXJlc1xuXHQgKiB3aXRoIGFzeW5jaHJvbm91cyBsb2FkaW5nIGFuZCBjb250ZXh0IGxvc3MuIFxuXHQgKlxuXHQgKiBAZXhhbXBsZVxuXHQgKiBcdFx0bmV3IFRleHR1cmUoY29udGV4dCwgMjU2LCAyNTYpOyAvL2VtcHR5IDI1NngyNTYgdGV4dHVyZVxuXHQgKiBcdFx0bmV3IFRleHR1cmUoY29udGV4dCwgMSwgMSwgVGV4dHVyZS5Gb3JtYXQuUkdCQSwgVGV4dHVyZS5EYXRhVHlwZS5VTlNJR05FRF9CWVRFLCBcblx0ICogXHRcdFx0XHRcdG5ldyBVaW50OEFycmF5KFsyNTUsMCwwLDI1NV0pKTsgLy8xeDEgcmVkIHRleHR1cmVcblx0ICogXHRcdG5ldyBUZXh0dXJlKGNvbnRleHQsIFwidGVzdC5wbmdcIik7IC8vbG9hZHMgaW1hZ2UgYXN5bmNocm9ub3VzbHlcblx0ICogXHRcdG5ldyBUZXh0dXJlKGNvbnRleHQsIFwidGVzdC5wbmdcIiwgc3VjY2Vzc0Z1bmMsIGZhaWxGdW5jLCB1c2VNaXBtYXBzKTsgLy9leHRyYSBwYXJhbXMgZm9yIGltYWdlIGxhb2RlciBcblx0ICpcblx0ICogQGNsYXNzICBUZXh0dXJlXG5cdCAqIEBjb25zdHJ1Y3RvclxuXHQgKiBAcGFyYW0gIHtXZWJHTENvbnRleHR9IGNvbnRleHQgdGhlIFdlYkdMIGNvbnRleHRcblx0ICogQHBhcmFtICB7TnVtYmVyfSB3aWR0aCB0aGUgd2lkdGggb2YgdGhpcyB0ZXh0dXJlXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0IHRoZSBoZWlnaHQgb2YgdGhpcyB0ZXh0dXJlXG5cdCAqIEBwYXJhbSAge0dMZW51bX0gZm9ybWF0IGUuZy4gVGV4dHVyZS5Gb3JtYXQuUkdCQVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IGRhdGFUeXBlIGUuZy4gVGV4dHVyZS5EYXRhVHlwZS5VTlNJR05FRF9CWVRFIChVaW50OEFycmF5KVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IGRhdGEgdGhlIGFycmF5IGJ1ZmZlciwgZS5nLiBhIFVpbnQ4QXJyYXkgdmlld1xuXHQgKiBAcGFyYW0gIHtCb29sZWFufSBnZW5NaXBtYXBzIHdoZXRoZXIgdG8gZ2VuZXJhdGUgbWlwbWFwcyBhZnRlciB1cGxvYWRpbmcgdGhlIGRhdGFcblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFRleHR1cmUoY29udGV4dCwgd2lkdGgsIGhlaWdodCwgZm9ybWF0LCBkYXRhVHlwZSwgZGF0YSwgZ2VuTWlwbWFwcykge1xuXHRcdGlmICh0eXBlb2YgY29udGV4dCAhPT0gXCJvYmplY3RcIilcblx0XHRcdHRocm93IFwiR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkIHRvIFRleHR1cmVcIjtcblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIFdlYkdMVGV4dHVyZSB3aGljaCBiYWNrcyB0aGlzIFRleHR1cmUgb2JqZWN0LiBUaGlzXG5cdFx0ICogY2FuIGJlIHVzZWQgZm9yIGxvdy1sZXZlbCBHTCBjYWxscy5cblx0XHQgKiBcblx0XHQgKiBAdHlwZSB7V2ViR0xUZXh0dXJlfVxuXHRcdCAqL1xuXHRcdHRoaXMuaWQgPSBudWxsOyAvL2luaXRpYWxpemVkIGluIGNyZWF0ZSgpXG5cblx0XHQvKipcblx0XHQgKiBUaGUgdGFyZ2V0IGZvciB0aGlzIHRleHR1cmUgdW5pdCwgaS5lLiBURVhUVVJFXzJELiBTdWJjbGFzc2VzXG5cdFx0ICogc2hvdWxkIG92ZXJyaWRlIHRoZSBjcmVhdGUoKSBtZXRob2QgdG8gY2hhbmdlIHRoaXMsIGZvciBjb3JyZWN0XG5cdFx0ICogdXNhZ2Ugd2l0aCBjb250ZXh0IHJlc3RvcmUuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IHRhcmdldFxuXHRcdCAqIEB0eXBlIHtHTGVudW19XG5cdFx0ICogQGRlZmF1bHQgIGdsLlRFWFRVUkVfMkRcblx0XHQgKi9cblx0XHR0aGlzLnRhcmdldCA9IG51bGw7IC8vaW5pdGlhbGl6ZWQgaW4gY3JlYXRlKClcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSB3aWR0aCBvZiB0aGlzIHRleHR1cmUsIGluIHBpeGVscy5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkgd2lkdGhcblx0XHQgKiBAcmVhZE9ubHlcblx0XHQgKiBAdHlwZSB7TnVtYmVyfSB0aGUgd2lkdGhcblx0XHQgKi9cblx0XHR0aGlzLndpZHRoID0gMDsgLy9pbml0aWFsaXplZCBvbiB0ZXh0dXJlIHVwbG9hZFxuXG5cdFx0LyoqXG5cdFx0ICogVGhlIGhlaWdodCBvZiB0aGlzIHRleHR1cmUsIGluIHBpeGVscy5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkgaGVpZ2h0XG5cdFx0ICogQHJlYWRPbmx5XG5cdFx0ICogQHR5cGUge051bWJlcn0gdGhlIGhlaWdodFxuXHRcdCAqL1xuXHRcdHRoaXMuaGVpZ2h0ID0gMDsgLy9pbml0aWFsaXplZCBvbiB0ZXh0dXJlIHVwbG9hZFxuXG5cdFx0Ly8gZS5nLiAtLT4gbmV3IFRleHR1cmUoZ2wsIDI1NiwgMjU2LCBnbC5SR0IsIGdsLlVOU0lHTkVEX0JZVEUsIGRhdGEpO1xuXHRcdC8vXHRcdCAgICAgIGNyZWF0ZXMgYSBuZXcgZW1wdHkgdGV4dHVyZSwgMjU2eDI1NlxuXHRcdC8vXHRcdC0tPiBuZXcgVGV4dHVyZShnbCk7XG5cdFx0Ly9cdFx0XHQgIGNyZWF0ZXMgYSBuZXcgdGV4dHVyZSBidXQgV0lUSE9VVCB1cGxvYWRpbmcgYW55IGRhdGEuIFxuXG5cdFx0LyoqXG5cdFx0ICogQHByb3BlcnR5IHtHTGVudW19IHdyYXBTIHRoZSB3cmFwIFNcblx0XHQgKi9cblx0XHR0aGlzLndyYXBTID0gVGV4dHVyZS5ERUZBVUxUX1dSQVA7XG5cdFx0LyoqXG5cdFx0ICogQHByb3BlcnR5IHtHTGVudW19IHdyYXBUIHRoZSB3cmFwIFRcblx0XHQgKi9cblx0XHR0aGlzLndyYXBUID0gVGV4dHVyZS5ERUZBVUxUX1dSQVA7XG5cdFx0LyoqXG5cdFx0ICogQHByb3BlcnR5IHtHTGVudW19IG1pbkZpbHRlciB0aGUgbWluaWZjYXRpb24gZmlsdGVyXG5cdFx0ICovXG5cdFx0dGhpcy5taW5GaWx0ZXIgPSBUZXh0dXJlLkRFRkFVTFRfRklMVEVSO1xuXHRcdFxuXHRcdC8qKlxuXHRcdCAqIEBwcm9wZXJ0eSB7R0xlbnVtfSBtYWdGaWx0ZXIgdGhlIG1hZ25pZmljYXRpb24gZmlsdGVyXG5cdFx0ICovXG5cdFx0dGhpcy5tYWdGaWx0ZXIgPSBUZXh0dXJlLkRFRkFVTFRfRklMVEVSO1xuXG5cdFx0LyoqXG5cdFx0ICogV2hlbiBhIHRleHR1cmUgaXMgY3JlYXRlZCwgd2Uga2VlcCB0cmFjayBvZiB0aGUgYXJndW1lbnRzIHByb3ZpZGVkIHRvIFxuXHRcdCAqIGl0cyBjb25zdHJ1Y3Rvci4gT24gY29udGV4dCBsb3NzIGFuZCByZXN0b3JlLCB0aGVzZSBhcmd1bWVudHMgYXJlIHJlLXN1cHBsaWVkXG5cdFx0ICogdG8gdGhlIFRleHR1cmUsIHNvIGFzIHRvIHJlLWNyZWF0ZSBpdCBpbiBpdHMgY29ycmVjdCBmb3JtLlxuXHRcdCAqXG5cdFx0ICogVGhpcyBpcyBtYWlubHkgdXNlZnVsIGlmIHlvdSBhcmUgcHJvY2VkdXJhbGx5IGNyZWF0aW5nIHRleHR1cmVzIGFuZCBwYXNzaW5nXG5cdFx0ICogdGhlaXIgZGF0YSBkaXJlY3RseSAoZS5nLiBmb3IgZ2VuZXJpYyBsb29rdXAgdGFibGVzIGluIGEgc2hhZGVyKS4gRm9yIGltYWdlXG5cdFx0ICogb3IgbWVkaWEgYmFzZWQgdGV4dHVyZXMsIGl0IHdvdWxkIGJlIGJldHRlciB0byB1c2UgYW4gQXNzZXRNYW5hZ2VyIHRvIG1hbmFnZVxuXHRcdCAqIHRoZSBhc3luY2hyb25vdXMgdGV4dHVyZSB1cGxvYWQuXG5cdFx0ICpcblx0XHQgKiBVcG9uIGRlc3Ryb3lpbmcgYSB0ZXh0dXJlLCBhIHJlZmVyZW5jZSB0byB0aGlzIGlzIGFsc28gbG9zdC5cblx0XHQgKlxuXHRcdCAqIEBwcm9wZXJ0eSBtYW5hZ2VkQXJnc1xuXHRcdCAqIEB0eXBlIHtBcnJheX0gdGhlIGFycmF5IG9mIGFyZ3VtZW50cywgc2hpZnRlZCB0byBleGNsdWRlIHRoZSBXZWJHTENvbnRleHQgcGFyYW1ldGVyXG5cdFx0ICovXG5cdFx0dGhpcy5tYW5hZ2VkQXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cblx0XHQvL1RoaXMgaXMgbWFhbmdlZCBieSBXZWJHTENvbnRleHRcblx0XHR0aGlzLmNvbnRleHQuYWRkTWFuYWdlZE9iamVjdCh0aGlzKTtcblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBPbiBpbnN0YW50aWF0aW9uIGFuZCBzdWJzZXF1ZW50IGNvbnRleHQgcmVzdG9yZSwgdGhpcyBmdW5jdGlvbiBpcyBjYWxsZWRcblx0ICogdG8gcGFyc2UgdGhlIGNvbnN0cnVjdG9yJ3MgYXJndW1lbnRzLlxuXHQgKiBcblx0ICogQHByb3RlY3RlZFxuXHQgKi9cblx0X2hhbmRsZUNyZWF0ZTogZnVuY3Rpb24od2lkdGgsIGhlaWdodCwgZm9ybWF0LCBkYXRhVHlwZSwgZGF0YSwgZ2VuTWlwbWFwcykge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHQvL0lmIHRoZSBmaXJzdCBhcmd1bWVudCBpcyBhIHN0cmluZywgYXNzdW1lIGl0J3MgYW4gSW1hZ2UgbG9hZGVyXG5cdFx0Ly9zZWNvbmQgYXJndW1lbnQgd2lsbCB0aGVuIGJlIGdlbk1pcG1hcHMsIHRoaXJkIGFuZCBmb3VydGggdGhlIHN1Y2Nlc3MvZmFpbCBjYWxsYmFja3Ncblx0XHRpZiAodHlwZW9mIHdpZHRoID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHR2YXIgaW1nID0gbmV3IEltYWdlKCk7XG5cdFx0XHR2YXIgcGF0aCAgICAgID0gYXJndW1lbnRzWzBdOyAgIC8vZmlyc3QgYXJndW1lbnQsIHRoZSBwYXRoXG5cdFx0XHR2YXIgc3VjY2Vzc0NCID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJmdW5jdGlvblwiID8gYXJndW1lbnRzWzFdIDogbnVsbDtcblx0XHRcdHZhciBmYWlsQ0IgICAgPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcImZ1bmN0aW9uXCIgPyBhcmd1bWVudHNbMl0gOiBudWxsO1xuXHRcdFx0Z2VuTWlwbWFwcyAgICA9ICEhYXJndW1lbnRzWzNdO1xuXG5cdFx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRcdC8vVW5mb3J0dW5hdGVseSwgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGZpcmVzIGJlZm9yZSBpbWcub25sb2FkIGV2ZW50cyBpbiBDaHJvbWUsIGV2ZW5cblx0XHRcdC8vaWYgdGhlIGltYWdlIGlzIGFscmVhZHkgJ2NvbXBsZXRlJyAoZnJvbSBjYWNoZSkuIFNvIHdlIG5lZWQgdG8gdXBsb2FkIDF4MVxuXHRcdFx0Ly90cmFuc3BhcmVudCBkdW1teSBkYXRhIHRvIGVuc3VyZSB0aGF0IHRoZSB1c2VyIGlzbid0IHRyeWluZyB0byByZW5kZXIgXG5cdFx0XHQvL2EgVGV4dHVyZSB0aGF0IGhhc24ndCBiZWVuIGNyZWF0ZWQgeWV0LlxuXHRcdFx0c2VsZi51cGxvYWREYXRhKDEsIDEpO1xuXG5cdFx0XHRpbWcub25sb2FkID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHNlbGYudXBsb2FkSW1hZ2UoaW1nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZ2VuTWlwbWFwcyk7XG5cdFx0XHRcdGlmIChzdWNjZXNzQ0IpXG5cdFx0XHRcdFx0c3VjY2Vzc0NCKCk7XG5cdFx0XHR9XG5cdFx0XHRpbWcub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQvLyBjb25zb2xlLndhcm4oXCJFcnJvciBsb2FkaW5nIGltYWdlOiBcIitwYXRoKTtcblx0XHRcdFx0aWYgKGdlbk1pcG1hcHMpIC8vd2UgZ2VuIG1pcG1hcHMgb24gdGhlIDF4MSBkdW1teVxuXHRcdFx0XHRcdGdsLmdlbmVyYXRlTWlwbWFwKGdsLlRFWFRVUkVfMkQpO1xuXHRcdFx0XHRpZiAoZmFpbENCKVxuXHRcdFx0XHRcdGZhaWxDQigpO1xuXHRcdFx0fVxuXHRcdFx0aW1nLm9uYWJvcnQgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0Ly8gY29uc29sZS53YXJuKFwiSW1hZ2UgbG9hZCBhYm9ydGVkOiBcIitwYXRoKTtcblx0XHRcdFx0aWYgKGdlbk1pcG1hcHMpIC8vd2UgZ2VuIG1pcG1hcHMgb24gdGhlIDF4MSBkdW1teVxuXHRcdFx0XHRcdGdsLmdlbmVyYXRlTWlwbWFwKGdsLlRFWFRVUkVfMkQpO1xuXHRcdFx0XHRpZiAoZmFpbENCKVxuXHRcdFx0XHRcdGZhaWxDQigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpbWcuc3JjID0gcGF0aDtcblx0XHR9IFxuXHRcdC8vb3RoZXJ3aXNlIGFzc3VtZSBvdXIgcmVndWxhciBsaXN0IG9mIHdpZHRoL2hlaWdodCBhcmd1bWVudHMgYXJlIHBhc3NlZFxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy51cGxvYWREYXRhKHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgZGF0YVR5cGUsIGRhdGEsIGdlbk1pcG1hcHMpO1xuXHRcdH1cblx0fSxcdFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgaW4gdGhlIFRleHR1cmUgY29uc3RydWN0b3IsIGFuZCBhZnRlciB0aGUgR0wgY29udGV4dCBoYXMgYmVlbiByZS1pbml0aWFsaXplZC4gXG5cdCAqIFN1YmNsYXNzZXMgY2FuIG92ZXJyaWRlIHRoaXMgdG8gcHJvdmlkZSBhIGN1c3RvbSBkYXRhIHVwbG9hZCwgZS5nLiBjdWJlbWFwcyBvciBjb21wcmVzc2VkXG5cdCAqIHRleHR1cmVzLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBjcmVhdGVcblx0ICovXG5cdGNyZWF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbCA9IHRoaXMuY29udGV4dC5nbDsgXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHRoaXMuaWQgPSBnbC5jcmVhdGVUZXh0dXJlKCk7IC8vdGV4dHVyZSBJRCBpcyByZWNyZWF0ZWRcblx0XHR0aGlzLndpZHRoID0gdGhpcy5oZWlnaHQgPSAwOyAvL3NpemUgaXMgcmVzZXQgdG8gemVybyB1bnRpbCBsb2FkZWRcblx0XHR0aGlzLnRhcmdldCA9IGdsLlRFWFRVUkVfMkQ7ICAvL3RoZSBwcm92aWRlciBjYW4gY2hhbmdlIHRoaXMgaWYgbmVjZXNzYXJ5IChlLmcuIGN1YmUgbWFwcylcblxuXHRcdHRoaXMuYmluZCgpO1xuXG5cblx0XHQvL1RPRE86IGNsZWFuIHRoZXNlIHVwIGEgbGl0dGxlLiBcblx0XHRnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wsIFRleHR1cmUuVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBKTtcblx0XHRnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfQUxJR05NRU5ULCBUZXh0dXJlLlVOUEFDS19BTElHTk1FTlQpO1xuXHRcdGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19GTElQX1lfV0VCR0wsIFRleHR1cmUuVU5QQUNLX0ZMSVBfWSk7XG5cdFx0XG5cdFx0dmFyIGNvbG9yc3BhY2UgPSBUZXh0dXJlLlVOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT04gfHwgZ2wuQlJPV1NFUl9ERUZBVUxUX1dFQkdMO1xuXHRcdGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wsIGNvbG9yc3BhY2UpO1xuXG5cdFx0Ly9zZXR1cCB3cmFwIG1vZGVzIHdpdGhvdXQgYmluZGluZyByZWR1bmRhbnRseVxuXHRcdHRoaXMuc2V0V3JhcCh0aGlzLndyYXBTLCB0aGlzLndyYXBULCBmYWxzZSk7XG5cdFx0dGhpcy5zZXRGaWx0ZXIodGhpcy5taW5GaWx0ZXIsIHRoaXMubWFnRmlsdGVyLCBmYWxzZSk7XG5cdFx0XG5cdFx0aWYgKHRoaXMubWFuYWdlZEFyZ3MubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVDcmVhdGUuYXBwbHkodGhpcywgdGhpcy5tYW5hZ2VkQXJncyk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBEZXN0cm95cyB0aGlzIHRleHR1cmUgYnkgZGVsZXRpbmcgdGhlIEdMIHJlc291cmNlLFxuXHQgKiByZW1vdmluZyBpdCBmcm9tIHRoZSBXZWJHTENvbnRleHQgbWFuYWdlbWVudCBzdGFjayxcblx0ICogc2V0dGluZyBpdHMgc2l6ZSB0byB6ZXJvLCBhbmQgaWQgYW5kIG1hbmFnZWQgYXJndW1lbnRzIHRvIG51bGwuXG5cdCAqIFxuXHQgKiBUcnlpbmcgdG8gdXNlIHRoaXMgdGV4dHVyZSBhZnRlciBtYXkgbGVhZCB0byB1bmRlZmluZWQgYmVoYXZpb3VyLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBkZXN0cm95XG5cdCAqL1xuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pZCAmJiB0aGlzLmdsKVxuXHRcdFx0dGhpcy5nbC5kZWxldGVUZXh0dXJlKHRoaXMuaWQpO1xuXHRcdGlmICh0aGlzLmNvbnRleHQpXG5cdFx0XHR0aGlzLmNvbnRleHQucmVtb3ZlTWFuYWdlZE9iamVjdCh0aGlzKTtcblx0XHR0aGlzLndpZHRoID0gdGhpcy5oZWlnaHQgPSAwO1xuXHRcdHRoaXMuaWQgPSBudWxsO1xuXHRcdHRoaXMubWFuYWdlZEFyZ3MgPSBudWxsO1xuXHRcdHRoaXMuY29udGV4dCA9IG51bGw7XG5cdFx0dGhpcy5nbCA9IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIHdyYXAgbW9kZSBmb3IgdGhpcyB0ZXh0dXJlOyBpZiB0aGUgc2Vjb25kIGFyZ3VtZW50XG5cdCAqIGlzIHVuZGVmaW5lZCBvciBmYWxzeSwgdGhlbiBib3RoIFMgYW5kIFQgd3JhcCB3aWxsIHVzZSB0aGUgZmlyc3Rcblx0ICogYXJndW1lbnQuXG5cdCAqXG5cdCAqIFlvdSBjYW4gdXNlIFRleHR1cmUuV3JhcCBjb25zdGFudHMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCBuZWVkaW5nIFxuXHQgKiBhIEdMIHJlZmVyZW5jZS5cblx0ICpcblx0ICogQG1ldGhvZCAgc2V0V3JhcFxuXHQgKiBAcGFyYW0ge0dMZW51bX0gcyB0aGUgUyB3cmFwIG1vZGVcblx0ICogQHBhcmFtIHtHTGVudW19IHQgdGhlIFQgd3JhcCBtb2RlXG5cdCAqIEBwYXJhbSB7Qm9vbGVhbn0gaWdub3JlQmluZCAob3B0aW9uYWwpIGlmIHRydWUsIHRoZSBiaW5kIHdpbGwgYmUgaWdub3JlZC4gXG5cdCAqL1xuXHRzZXRXcmFwOiBmdW5jdGlvbihzLCB0LCBpZ25vcmVCaW5kKSB7IC8vVE9ETzogc3VwcG9ydCBSIHdyYXAgbW9kZVxuXHRcdGlmIChzICYmIHQpIHtcblx0XHRcdHRoaXMud3JhcFMgPSBzO1xuXHRcdFx0dGhpcy53cmFwVCA9IHQ7XG5cdFx0fSBlbHNlIFxuXHRcdFx0dGhpcy53cmFwUyA9IHRoaXMud3JhcFQgPSBzO1xuXHRcdFxuXHRcdC8vZW5mb3JjZSBQT1QgcnVsZXMuLlxuXHRcdHRoaXMuX2NoZWNrUE9UKCk7XHRcblxuXHRcdGlmICghaWdub3JlQmluZClcblx0XHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX1dSQVBfUywgdGhpcy53cmFwUyk7XG5cdFx0Z2wudGV4UGFyYW1ldGVyaSh0aGlzLnRhcmdldCwgZ2wuVEVYVFVSRV9XUkFQX1QsIHRoaXMud3JhcFQpO1xuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIG1pbiBhbmQgbWFnIGZpbHRlciBmb3IgdGhpcyB0ZXh0dXJlOyBcblx0ICogaWYgbWFnIGlzIHVuZGVmaW5lZCBvciBmYWxzeSwgdGhlbiBib3RoIG1pbiBhbmQgbWFnIHdpbGwgdXNlIHRoZVxuXHQgKiBmaWx0ZXIgc3BlY2lmaWVkIGZvciBtaW4uXG5cdCAqXG5cdCAqIFlvdSBjYW4gdXNlIFRleHR1cmUuRmlsdGVyIGNvbnN0YW50cyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIG5lZWRpbmcgXG5cdCAqIGEgR0wgcmVmZXJlbmNlLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBzZXRGaWx0ZXJcblx0ICogQHBhcmFtIHtHTGVudW19IG1pbiB0aGUgbWluaWZpY2F0aW9uIGZpbHRlclxuXHQgKiBAcGFyYW0ge0dMZW51bX0gbWFnIHRoZSBtYWduaWZpY2F0aW9uIGZpbHRlclxuXHQgKiBAcGFyYW0ge0Jvb2xlYW59IGlnbm9yZUJpbmQgaWYgdHJ1ZSwgdGhlIGJpbmQgd2lsbCBiZSBpZ25vcmVkLiBcblx0ICovXG5cdHNldEZpbHRlcjogZnVuY3Rpb24obWluLCBtYWcsIGlnbm9yZUJpbmQpIHsgXG5cdFx0aWYgKG1pbiAmJiBtYWcpIHtcblx0XHRcdHRoaXMubWluRmlsdGVyID0gbWluO1xuXHRcdFx0dGhpcy5tYWdGaWx0ZXIgPSBtYWc7XG5cdFx0fSBlbHNlIFxuXHRcdFx0dGhpcy5taW5GaWx0ZXIgPSB0aGlzLm1hZ0ZpbHRlciA9IG1pbjtcblx0XHRcblx0XHQvL2VuZm9yY2UgUE9UIHJ1bGVzLi5cblx0XHR0aGlzLl9jaGVja1BPVCgpO1xuXG5cdFx0aWYgKCFpZ25vcmVCaW5kKVxuXHRcdFx0dGhpcy5iaW5kKCk7XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLnRleFBhcmFtZXRlcmkodGhpcy50YXJnZXQsIGdsLlRFWFRVUkVfTUlOX0ZJTFRFUiwgdGhpcy5taW5GaWx0ZXIpO1xuXHRcdGdsLnRleFBhcmFtZXRlcmkodGhpcy50YXJnZXQsIGdsLlRFWFRVUkVfTUFHX0ZJTFRFUiwgdGhpcy5tYWdGaWx0ZXIpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIGxvdy1sZXZlbCBtZXRob2QgdG8gdXBsb2FkIHRoZSBzcGVjaWZpZWQgQXJyYXlCdWZmZXJWaWV3XG5cdCAqIHRvIHRoaXMgdGV4dHVyZS4gVGhpcyB3aWxsIGNhdXNlIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IG9mIHRoaXNcblx0ICogdGV4dHVyZSB0byBjaGFuZ2UuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHVwbG9hZERhdGFcblx0ICogQHBhcmFtICB7TnVtYmVyfSB3aWR0aCAgICAgICAgICB0aGUgbmV3IHdpZHRoIG9mIHRoaXMgdGV4dHVyZSxcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0cyB0byB0aGUgbGFzdCB1c2VkIHdpZHRoIChvciB6ZXJvKVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCAgICAgICAgIHRoZSBuZXcgaGVpZ2h0IG9mIHRoaXMgdGV4dHVyZVxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRzIHRvIHRoZSBsYXN0IHVzZWQgaGVpZ2h0IChvciB6ZXJvKVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IGZvcm1hdCAgICAgICAgIHRoZSBkYXRhIGZvcm1hdCwgZGVmYXVsdCBSR0JBXG5cdCAqIEBwYXJhbSAge0dMZW51bX0gdHlwZSAgICAgICAgICAgdGhlIGRhdGEgdHlwZSwgZGVmYXVsdCBVTlNJR05FRF9CWVRFIChVaW50OEFycmF5KVxuXHQgKiBAcGFyYW0gIHtBcnJheUJ1ZmZlclZpZXd9IGRhdGEgIHRoZSByYXcgZGF0YSBmb3IgdGhpcyB0ZXh0dXJlLCBvciBudWxsIGZvciBhbiBlbXB0eSBpbWFnZVxuXHQgKiBAcGFyYW0gIHtCb29sZWFufSBnZW5NaXBtYXBzXHQgICB3aGV0aGVyIHRvIGdlbmVyYXRlIG1pcG1hcHMgYWZ0ZXIgdXBsb2FkaW5nIHRoZSBkYXRhLCBkZWZhdWx0IGZhbHNlXG5cdCAqL1xuXHR1cGxvYWREYXRhOiBmdW5jdGlvbih3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUsIGRhdGEsIGdlbk1pcG1hcHMpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy5mb3JtYXQgPSBmb3JtYXQgfHwgZ2wuUkdCQTtcblx0XHR0eXBlID0gdHlwZSB8fCBnbC5VTlNJR05FRF9CWVRFO1xuXHRcdGRhdGEgPSBkYXRhIHx8IG51bGw7IC8vbWFrZSBzdXJlIGZhbHNleSB2YWx1ZSBpcyBudWxsIGZvciB0ZXhJbWFnZTJEXG5cblx0XHR0aGlzLndpZHRoID0gKHdpZHRoIHx8IHdpZHRoPT0wKSA/IHdpZHRoIDogdGhpcy53aWR0aDtcblx0XHR0aGlzLmhlaWdodCA9IChoZWlnaHQgfHwgaGVpZ2h0PT0wKSA/IGhlaWdodCA6IHRoaXMuaGVpZ2h0O1xuXG5cdFx0dGhpcy5fY2hlY2tQT1QoKTtcblxuXHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0Z2wudGV4SW1hZ2UyRCh0aGlzLnRhcmdldCwgMCwgdGhpcy5mb3JtYXQsIFxuXHRcdFx0XHRcdCAgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQsIDAsIHRoaXMuZm9ybWF0LFxuXHRcdFx0XHRcdCAgdHlwZSwgZGF0YSk7XG5cblx0XHRpZiAoZ2VuTWlwbWFwcylcblx0XHRcdGdsLmdlbmVyYXRlTWlwbWFwKHRoaXMudGFyZ2V0KTtcblx0fSxcblxuXHQvKipcblx0ICogVXBsb2FkcyBJbWFnZURhdGEsIEhUTUxJbWFnZUVsZW1lbnQsIEhUTUxDYW52YXNFbGVtZW50IG9yIFxuXHQgKiBIVE1MVmlkZW9FbGVtZW50LlxuXHQgKlxuXHQgKiBAbWV0aG9kICB1cGxvYWRJbWFnZVxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IGRvbU9iamVjdCB0aGUgRE9NIGltYWdlIGNvbnRhaW5lclxuXHQgKiBAcGFyYW0gIHtHTGVudW19IGZvcm1hdCB0aGUgZm9ybWF0LCBkZWZhdWx0IGdsLlJHQkFcblx0ICogQHBhcmFtICB7R0xlbnVtfSB0eXBlIHRoZSBkYXRhIHR5cGUsIGRlZmF1bHQgZ2wuVU5TSUdORURfQllURVxuXHQgKiBAcGFyYW0gIHtCb29sZWFufSBnZW5NaXBtYXBzIHdoZXRoZXIgdG8gZ2VuZXJhdGUgbWlwbWFwcyBhZnRlciB1cGxvYWRpbmcgdGhlIGRhdGEsIGRlZmF1bHQgZmFsc2Vcblx0ICovXG5cdHVwbG9hZEltYWdlOiBmdW5jdGlvbihkb21PYmplY3QsIGZvcm1hdCwgdHlwZSwgZ2VuTWlwbWFwcykge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLmZvcm1hdCA9IGZvcm1hdCB8fCBnbC5SR0JBO1xuXHRcdHR5cGUgPSB0eXBlIHx8IGdsLlVOU0lHTkVEX0JZVEU7XG5cdFx0XG5cdFx0dGhpcy53aWR0aCA9IGRvbU9iamVjdC53aWR0aDtcblx0XHR0aGlzLmhlaWdodCA9IGRvbU9iamVjdC5oZWlnaHQ7XG5cblx0XHR0aGlzLl9jaGVja1BPVCgpO1xuXG5cdFx0dGhpcy5iaW5kKCk7XG5cblx0XHRnbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCB0aGlzLmZvcm1hdCwgdGhpcy5mb3JtYXQsXG5cdFx0XHRcdFx0ICB0eXBlLCBkb21PYmplY3QpO1xuXG5cdFx0aWYgKGdlbk1pcG1hcHMpXG5cdFx0XHRnbC5nZW5lcmF0ZU1pcG1hcCh0aGlzLnRhcmdldCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIElmIEZPUkNFX1BPVCBpcyBmYWxzZSwgd2UgdmVyaWZ5IHRoaXMgdGV4dHVyZSB0byBzZWUgaWYgaXQgaXMgdmFsaWQsIFxuXHQgKiBhcyBwZXIgbm9uLXBvd2VyLW9mLXR3byBydWxlcy4gSWYgaXQgaXMgbm9uLXBvd2VyLW9mLXR3bywgaXQgbXVzdCBoYXZlIFxuXHQgKiBhIHdyYXAgbW9kZSBvZiBDTEFNUF9UT19FREdFLCBhbmQgdGhlIG1pbmlmaWNhdGlvbiBmaWx0ZXIgbXVzdCBiZSBMSU5FQVJcblx0ICogb3IgTkVBUkVTVC4gSWYgd2UgZG9uJ3Qgc2F0aXNmeSB0aGVzZSBuZWVkcywgYW4gZXJyb3IgaXMgdGhyb3duLlxuXHQgKiBcblx0ICogQG1ldGhvZCAgX2NoZWNrUE9UXG5cdCAqIEBwcml2YXRlXG5cdCAqIEByZXR1cm4ge1t0eXBlXX0gW2Rlc2NyaXB0aW9uXVxuXHQgKi9cblx0X2NoZWNrUE9UOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIVRleHR1cmUuRk9SQ0VfUE9UKSB7XG5cdFx0XHQvL0lmIG1pbkZpbHRlciBpcyBhbnl0aGluZyBidXQgTElORUFSIG9yIE5FQVJFU1Rcblx0XHRcdC8vb3IgaWYgd3JhcFMgb3Igd3JhcFQgYXJlIG5vdCBDTEFNUF9UT19FREdFLi4uXG5cdFx0XHR2YXIgd3JvbmdGaWx0ZXIgPSAodGhpcy5taW5GaWx0ZXIgIT09IFRleHR1cmUuRmlsdGVyLkxJTkVBUiAmJiB0aGlzLm1pbkZpbHRlciAhPT0gVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVCk7XG5cdFx0XHR2YXIgd3JvbmdXcmFwID0gKHRoaXMud3JhcFMgIT09IFRleHR1cmUuV3JhcC5DTEFNUF9UT19FREdFIHx8IHRoaXMud3JhcFQgIT09IFRleHR1cmUuV3JhcC5DTEFNUF9UT19FREdFKTtcblxuXHRcdFx0aWYgKCB3cm9uZ0ZpbHRlciB8fCB3cm9uZ1dyYXAgKSB7XG5cdFx0XHRcdGlmICghaXNQb3dlck9mVHdvKHRoaXMud2lkdGgpIHx8ICFpc1Bvd2VyT2ZUd28odGhpcy5oZWlnaHQpKVxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcih3cm9uZ0ZpbHRlciBcblx0XHRcdFx0XHRcdFx0PyBcIk5vbi1wb3dlci1vZi10d28gdGV4dHVyZXMgY2Fubm90IHVzZSBtaXBtYXBwaW5nIGFzIGZpbHRlclwiXG5cdFx0XHRcdFx0XHRcdDogXCJOb24tcG93ZXItb2YtdHdvIHRleHR1cmVzIG11c3QgdXNlIENMQU1QX1RPX0VER0UgYXMgd3JhcFwiKTtcblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIEJpbmRzIHRoZSB0ZXh0dXJlLiBJZiB1bml0IGlzIHNwZWNpZmllZCxcblx0ICogaXQgd2lsbCBiaW5kIHRoZSB0ZXh0dXJlIGF0IHRoZSBnaXZlbiBzbG90XG5cdCAqIChURVhUVVJFMCwgVEVYVFVSRTEsIGV0YykuIElmIHVuaXQgaXMgbm90IHNwZWNpZmllZCxcblx0ICogaXQgd2lsbCBzaW1wbHkgYmluZCB0aGUgdGV4dHVyZSBhdCB3aGljaGV2ZXIgc2xvdFxuXHQgKiBpcyBjdXJyZW50bHkgYWN0aXZlLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBiaW5kXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdW5pdCB0aGUgdGV4dHVyZSB1bml0IGluZGV4LCBzdGFydGluZyBhdCAwXG5cdCAqL1xuXHRiaW5kOiBmdW5jdGlvbih1bml0KSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRpZiAodW5pdCB8fCB1bml0ID09PSAwKVxuXHRcdFx0Z2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMCArIHVuaXQpO1xuXHRcdGdsLmJpbmRUZXh0dXJlKHRoaXMudGFyZ2V0LCB0aGlzLmlkKTtcblx0fSxcblx0XG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5pZCArIFwiOlwiICsgdGhpcy53aWR0aCArIFwieFwiICsgdGhpcy5oZWlnaHQgKyBcIlwiO1xuXHR9XG59KTtcblxuLyoqIFxuICogQSBzZXQgb2YgRmlsdGVyIGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVFxuICogICAgIFRleHR1cmUuRmlsdGVyLk5FQVJFU1RfTUlQTUFQX0xJTkVBUlxuICogICAgIFRleHR1cmUuRmlsdGVyLk5FQVJFU1RfTUlQTUFQX05FQVJFU1RcbiAqICAgICBUZXh0dXJlLkZpbHRlci5MSU5FQVJcbiAqICAgICBUZXh0dXJlLkZpbHRlci5MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICogICAgIFRleHR1cmUuRmlsdGVyLkxJTkVBUl9NSVBNQVBfTkVBUkVTVFxuICogYGBgXG4gKiBAYXR0cmlidXRlIEZpbHRlclxuICogQHN0YXRpY1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuVGV4dHVyZS5GaWx0ZXIgPSB7XG5cdE5FQVJFU1Q6IDk3MjgsXG5cdE5FQVJFU1RfTUlQTUFQX0xJTkVBUjogOTk4Nixcblx0TkVBUkVTVF9NSVBNQVBfTkVBUkVTVDogOTk4NCxcblx0TElORUFSOiA5NzI5LFxuXHRMSU5FQVJfTUlQTUFQX0xJTkVBUjogOTk4Nyxcblx0TElORUFSX01JUE1BUF9ORUFSRVNUOiA5OTg1XG59O1xuXG4vKiogXG4gKiBBIHNldCBvZiBXcmFwIGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5XcmFwLkNMQU1QX1RPX0VER0VcbiAqICAgICBUZXh0dXJlLldyYXAuTUlSUk9SRURfUkVQRUFUXG4gKiAgICAgVGV4dHVyZS5XcmFwLlJFUEVBVFxuICogYGBgXG4gKiBAYXR0cmlidXRlIFdyYXBcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblRleHR1cmUuV3JhcCA9IHtcblx0Q0xBTVBfVE9fRURHRTogMzMwNzEsXG5cdE1JUlJPUkVEX1JFUEVBVDogMzM2NDgsXG5cdFJFUEVBVDogMTA0OTdcbn07XG5cbi8qKiBcbiAqIEEgc2V0IG9mIEZvcm1hdCBjb25zdGFudHMgdGhhdCBtYXRjaCB0aGVpciBHTCBjb3VudGVycGFydHMuXG4gKiBUaGlzIGlzIGZvciBjb252ZW5pZW5jZSwgdG8gYXZvaWQgdGhlIG5lZWQgZm9yIGEgR0wgcmVuZGVyaW5nIGNvbnRleHQuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYFxuICogICAgIFRleHR1cmUuRm9ybWF0LlJHQlxuICogICAgIFRleHR1cmUuRm9ybWF0LlJHQkFcbiAqICAgICBUZXh0dXJlLkZvcm1hdC5MVU1JTkFOQ0VfQUxQSEFcbiAqIGBgYFxuICogQGF0dHJpYnV0ZSBGb3JtYXRcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblRleHR1cmUuRm9ybWF0ID0ge1xuXHRERVBUSF9DT01QT05FTlQ6IDY0MDIsXG5cdEFMUEhBOiA2NDA2LFxuXHRSR0JBOiA2NDA4LFxuXHRSR0I6IDY0MDcsXG5cdExVTUlOQU5DRTogNjQwOSxcblx0TFVNSU5BTkNFX0FMUEhBOiA2NDEwXG59O1xuXG4vKiogXG4gKiBBIHNldCBvZiBEYXRhVHlwZSBjb25zdGFudHMgdGhhdCBtYXRjaCB0aGVpciBHTCBjb3VudGVycGFydHMuXG4gKiBUaGlzIGlzIGZvciBjb252ZW5pZW5jZSwgdG8gYXZvaWQgdGhlIG5lZWQgZm9yIGEgR0wgcmVuZGVyaW5nIGNvbnRleHQuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYFxuICogICAgIFRleHR1cmUuRGF0YVR5cGUuVU5TSUdORURfQllURSBcbiAqICAgICBUZXh0dXJlLkRhdGFUeXBlLkZMT0FUIFxuICogYGBgXG4gKiBAYXR0cmlidXRlIERhdGFUeXBlXG4gKiBAc3RhdGljXG4gKiBAdHlwZSB7T2JqZWN0fVxuICovXG5UZXh0dXJlLkRhdGFUeXBlID0ge1xuXHRCWVRFOiA1MTIwLFxuXHRTSE9SVDogNTEyMixcblx0SU5UOiA1MTI0LFxuXHRGTE9BVDogNTEyNixcblx0VU5TSUdORURfQllURTogNTEyMSxcblx0VU5TSUdORURfSU5UOiA1MTI1LFxuXHRVTlNJR05FRF9TSE9SVDogNTEyMyxcblx0VU5TSUdORURfU0hPUlRfNF80XzRfNDogMzI4MTksXG5cdFVOU0lHTkVEX1NIT1JUXzVfNV81XzE6IDMyODIwLFxuXHRVTlNJR05FRF9TSE9SVF81XzZfNTogMzM2MzVcbn1cblxuLyoqXG4gKiBUaGUgZGVmYXVsdCB3cmFwIG1vZGUgd2hlbiBjcmVhdGluZyBuZXcgdGV4dHVyZXMuIElmIGEgY3VzdG9tIFxuICogcHJvdmlkZXIgd2FzIHNwZWNpZmllZCwgaXQgbWF5IGNob29zZSB0byBvdmVycmlkZSB0aGlzIGRlZmF1bHQgbW9kZS5cbiAqIFxuICogQGF0dHJpYnV0ZSB7R0xlbnVtfSBERUZBVUxUX1dSQVBcbiAqIEBzdGF0aWMgXG4gKiBAZGVmYXVsdCAgVGV4dHVyZS5XcmFwLkNMQU1QX1RPX0VER0VcbiAqL1xuVGV4dHVyZS5ERUZBVUxUX1dSQVAgPSBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRTtcblxuXG4vKipcbiAqIFRoZSBkZWZhdWx0IGZpbHRlciBtb2RlIHdoZW4gY3JlYXRpbmcgbmV3IHRleHR1cmVzLiBJZiBhIGN1c3RvbVxuICogcHJvdmlkZXIgd2FzIHNwZWNpZmllZCwgaXQgbWF5IGNob29zZSB0byBvdmVycmlkZSB0aGlzIGRlZmF1bHQgbW9kZS5cbiAqXG4gKiBAYXR0cmlidXRlIHtHTGVudW19IERFRkFVTFRfRklMVEVSXG4gKiBAc3RhdGljXG4gKiBAZGVmYXVsdCAgVGV4dHVyZS5GaWx0ZXIuTElORUFSXG4gKi9cblRleHR1cmUuREVGQVVMVF9GSUxURVIgPSBUZXh0dXJlLkZpbHRlci5ORUFSRVNUO1xuXG4vKipcbiAqIEJ5IGRlZmF1bHQsIHdlIGRvIHNvbWUgZXJyb3IgY2hlY2tpbmcgd2hlbiBjcmVhdGluZyB0ZXh0dXJlc1xuICogdG8gZW5zdXJlIHRoYXQgdGhleSB3aWxsIGJlIFwicmVuZGVyYWJsZVwiIGJ5IFdlYkdMLiBOb24tcG93ZXItb2YtdHdvXG4gKiB0ZXh0dXJlcyBtdXN0IHVzZSBDTEFNUF9UT19FREdFIGFzIHRoZWlyIHdyYXAgbW9kZSwgYW5kIE5FQVJFU1Qgb3IgTElORUFSXG4gKiBhcyB0aGVpciB3cmFwIG1vZGUuIEZ1cnRoZXIsIHRyeWluZyB0byBnZW5lcmF0ZSBtaXBtYXBzIGZvciBhIE5QT1QgaW1hZ2VcbiAqIHdpbGwgbGVhZCB0byBlcnJvcnMuIFxuICpcbiAqIEhvd2V2ZXIsIHlvdSBjYW4gZGlzYWJsZSB0aGlzIGVycm9yIGNoZWNraW5nIGJ5IHNldHRpbmcgYEZPUkNFX1BPVGAgdG8gdHJ1ZS5cbiAqIFRoaXMgbWF5IGJlIHVzZWZ1bCBpZiB5b3UgYXJlIHJ1bm5pbmcgb24gc3BlY2lmaWMgaGFyZHdhcmUgdGhhdCBzdXBwb3J0cyBQT1QgXG4gKiB0ZXh0dXJlcywgb3IgaW4gc29tZSBmdXR1cmUgY2FzZSB3aGVyZSBOUE9UIHRleHR1cmVzIGlzIGFkZGVkIGFzIGEgV2ViR0wgZXh0ZW5zaW9uLlxuICogXG4gKiBAYXR0cmlidXRlIHtCb29sZWFufSBGT1JDRV9QT1RcbiAqIEBzdGF0aWNcbiAqIEBkZWZhdWx0ICBmYWxzZVxuICovXG5UZXh0dXJlLkZPUkNFX1BPVCA9IGZhbHNlO1xuXG4vL2RlZmF1bHQgcGl4ZWwgc3RvcmUgb3BlcmF0aW9ucy4gVXNlZCBpbiBjcmVhdGUoKVxuVGV4dHVyZS5VTlBBQ0tfRkxJUF9ZID0gZmFsc2U7XG5UZXh0dXJlLlVOUEFDS19BTElHTk1FTlQgPSAxO1xuVGV4dHVyZS5VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEEgPSB0cnVlOyBcblRleHR1cmUuVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTiA9IHVuZGVmaW5lZDtcblxuLyoqXG4gKiBVdGlsaXR5IHRvIGdldCB0aGUgbnVtYmVyIG9mIGNvbXBvbmVudHMgZm9yIHRoZSBnaXZlbiBHTGVudW0sIGUuZy4gZ2wuUkdCQSByZXR1cm5zIDQuXG4gKiBSZXR1cm5zIG51bGwgaWYgdGhlIHNwZWNpZmllZCBmb3JtYXQgaXMgbm90IG9mIHR5cGUgREVQVEhfQ09NUE9ORU5ULCBBTFBIQSwgTFVNSU5BTkNFLFxuICogTFVNSU5BTkNFX0FMUEhBLCBSR0IsIG9yIFJHQkEuXG4gKiBcbiAqIEBtZXRob2QgZ2V0TnVtQ29tcG9uZW50c1xuICogQHN0YXRpY1xuICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgYSB0ZXh0dXJlIGZvcm1hdCwgaS5lLiBUZXh0dXJlLkZvcm1hdC5SR0JBXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IHRoZSBudW1iZXIgb2YgY29tcG9uZW50cyBmb3IgdGhpcyBmb3JtYXRcbiAqL1xuVGV4dHVyZS5nZXROdW1Db21wb25lbnRzID0gZnVuY3Rpb24oZm9ybWF0KSB7XG5cdHN3aXRjaCAoZm9ybWF0KSB7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5ERVBUSF9DT01QT05FTlQ6XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5BTFBIQTpcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkxVTUlOQU5DRTpcblx0XHRcdHJldHVybiAxO1xuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuTFVNSU5BTkNFX0FMUEhBOlxuXHRcdFx0cmV0dXJuIDI7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5SR0I6XG5cdFx0XHRyZXR1cm4gMztcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LlJHQkE6XG5cdFx0XHRyZXR1cm4gNDtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn07XG5cbi8vVW5tYW5hZ2VkIHRleHR1cmVzOlxuLy9cdEhUTUwgZWxlbWVudHMgbGlrZSBJbWFnZSwgVmlkZW8sIENhbnZhc1xuLy9cdHBpeGVscyBidWZmZXIgZnJvbSBDYW52YXNcbi8vXHRwaXhlbHMgYXJyYXlcblxuLy9OZWVkIHNwZWNpYWwgaGFuZGxpbmc6XG4vLyAgY29udGV4dC5vbkNvbnRleHRMb3N0LmFkZChmdW5jdGlvbigpIHtcbi8vICBcdGNyZWF0ZUR5bmFtaWNUZXh0dXJlKCk7XG4vLyAgfS5iaW5kKHRoaXMpKTtcblxuLy9NYW5hZ2VkIHRleHR1cmVzOlxuLy9cdGltYWdlcyBzcGVjaWZpZWQgd2l0aCBhIHBhdGhcbi8vXHR0aGlzIHdpbGwgdXNlIEltYWdlIHVuZGVyIHRoZSBob29kXG5cblxubW9kdWxlLmV4cG9ydHMgPSBUZXh0dXJlOyIsInZhciBDbGFzcyA9IHJlcXVpcmUoJ2tsYXNzZScpO1xudmFyIFRleHR1cmUgPSByZXF1aXJlKCcuL1RleHR1cmUnKTtcblxuLy9UaGlzIGlzIGEgR0wtc3BlY2lmaWMgdGV4dHVyZSByZWdpb24sIGVtcGxveWluZyB0YW5nZW50IHNwYWNlIG5vcm1hbGl6ZWQgY29vcmRpbmF0ZXMgVSBhbmQgVi5cbi8vQSBjYW52YXMtc3BlY2lmaWMgcmVnaW9uIHdvdWxkIHJlYWxseSBqdXN0IGJlIGEgbGlnaHR3ZWlnaHQgb2JqZWN0IHdpdGggeyB4LCB5LCB3aWR0aCwgaGVpZ2h0IH1cbi8vaW4gcGl4ZWxzLlxudmFyIFRleHR1cmVSZWdpb24gPSBuZXcgQ2xhc3Moe1xuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFRleHR1cmVSZWdpb24odGV4dHVyZSwgeCwgeSwgd2lkdGgsIGhlaWdodCkge1xuXHRcdHRoaXMudGV4dHVyZSA9IHRleHR1cmU7XG5cdFx0dGhpcy5zZXRSZWdpb24oeCwgeSwgd2lkdGgsIGhlaWdodCk7XG5cdH0sXG5cblx0c2V0VVZzOiBmdW5jdGlvbih1LCB2LCB1MiwgdjIpIHtcblx0XHR0aGlzLnJlZ2lvbldpZHRoID0gTWF0aC5yb3VuZChNYXRoLmFicyh1MiAtIHUpICogdGhpcy50ZXh0dXJlLndpZHRoKTtcbiAgICAgICAgdGhpcy5yZWdpb25IZWlnaHQgPSBNYXRoLnJvdW5kKE1hdGguYWJzKHYyIC0gdikgKiB0aGlzLnRleHR1cmUuaGVpZ2h0KTtcblxuICAgICAgICAvLyBGcm9tIExpYkdEWCBUZXh0dXJlUmVnaW9uLmphdmEgLS0gXG5cdFx0Ly8gRm9yIGEgMXgxIHJlZ2lvbiwgYWRqdXN0IFVWcyB0b3dhcmQgcGl4ZWwgY2VudGVyIHRvIGF2b2lkIGZpbHRlcmluZyBhcnRpZmFjdHMgb24gQU1EIEdQVXMgd2hlbiBkcmF3aW5nIHZlcnkgc3RyZXRjaGVkLlxuXHRcdGlmICh0aGlzLnJlZ2lvbldpZHRoID09IDEgJiYgdGhpcy5yZWdpb25IZWlnaHQgPT0gMSkge1xuXHRcdFx0dmFyIGFkanVzdFggPSAwLjI1IC8gdGhpcy50ZXh0dXJlLndpZHRoO1xuXHRcdFx0dSArPSBhZGp1c3RYO1xuXHRcdFx0dTIgLT0gYWRqdXN0WDtcblx0XHRcdHZhciBhZGp1c3RZID0gMC4yNSAvIHRoaXMudGV4dHVyZS5oZWlnaHQ7XG5cdFx0XHR2ICs9IGFkanVzdFk7XG5cdFx0XHR2MiAtPSBhZGp1c3RZO1xuXHRcdH1cblxuXHRcdHRoaXMudSA9IHU7XG5cdFx0dGhpcy52ID0gdjtcblx0XHR0aGlzLnUyID0gdTI7XG5cdFx0dGhpcy52MiA9IHYyO1xuXHR9LFxuXG5cdHNldFJlZ2lvbjogZnVuY3Rpb24oeCwgeSwgd2lkdGgsIGhlaWdodCkge1xuXHRcdHggPSB4IHx8IDA7XG5cdFx0eSA9IHkgfHwgMDtcblx0XHR3aWR0aCA9ICh3aWR0aD09PTAgfHwgd2lkdGgpID8gd2lkdGggOiB0aGlzLnRleHR1cmUud2lkdGg7XG5cdFx0aGVpZ2h0ID0gKGhlaWdodD09PTAgfHwgaGVpZ2h0KSA/IGhlaWdodCA6IHRoaXMudGV4dHVyZS5oZWlnaHQ7XG5cblx0XHR2YXIgaW52VGV4V2lkdGggPSAxIC8gdGhpcy50ZXh0dXJlLndpZHRoO1xuXHRcdHZhciBpbnZUZXhIZWlnaHQgPSAxIC8gdGhpcy50ZXh0dXJlLmhlaWdodDtcblx0XHR0aGlzLnNldFVWcyh4ICogaW52VGV4V2lkdGgsIHkgKiBpbnZUZXhIZWlnaHQsICh4ICsgd2lkdGgpICogaW52VGV4V2lkdGgsICh5ICsgaGVpZ2h0KSAqIGludlRleEhlaWdodCk7XG5cdFx0dGhpcy5yZWdpb25XaWR0aCA9IE1hdGguYWJzKHdpZHRoKTtcblx0XHR0aGlzLnJlZ2lvbkhlaWdodCA9IE1hdGguYWJzKGhlaWdodCk7XG5cdH0sXG5cblx0LyoqIFNldHMgdGhlIHRleHR1cmUgdG8gdGhhdCBvZiB0aGUgc3BlY2lmaWVkIHJlZ2lvbiBhbmQgc2V0cyB0aGUgY29vcmRpbmF0ZXMgcmVsYXRpdmUgdG8gdGhlIHNwZWNpZmllZCByZWdpb24uICovXG5cdHNldEZyb21SZWdpb246IGZ1bmN0aW9uKHJlZ2lvbiwgeCwgeSwgd2lkdGgsIGhlaWdodCkge1xuXHRcdHRoaXMudGV4dHVyZSA9IHJlZ2lvbi50ZXh0dXJlO1xuXHRcdHRoaXMuc2V0KHJlZ2lvbi5nZXRSZWdpb25YKCkgKyB4LCByZWdpb24uZ2V0UmVnaW9uWSgpICsgeSwgd2lkdGgsIGhlaWdodCk7XG5cdH0sXG5cblxuXHQvL1RPRE86IGFkZCBzZXR0ZXJzIGZvciByZWdpb25YL1kgYW5kIHJlZ2lvbldpZHRoL0hlaWdodFxuXG5cdHJlZ2lvblg6IHtcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy51ICogdGhpcy50ZXh0dXJlLndpZHRoKTtcblx0XHR9IFxuXHR9LFxuXG5cdHJlZ2lvblk6IHtcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy52ICogdGhpcy50ZXh0dXJlLmhlaWdodCk7XG5cdFx0fVxuXHR9LFxuXG5cdGZsaXA6IGZ1bmN0aW9uKHgsIHkpIHtcblx0XHR2YXIgdGVtcDtcblx0XHRpZiAoeCkge1xuXHRcdFx0dGVtcCA9IHRoaXMudTtcblx0XHRcdHRoaXMudSA9IHRoaXMudTI7XG5cdFx0XHR0aGlzLnUyID0gdGVtcDtcblx0XHR9XG5cdFx0aWYgKHkpIHtcblx0XHRcdHRlbXAgPSB0aGlzLnY7XG5cdFx0XHR0aGlzLnYgPSB0aGlzLnYyO1xuXHRcdFx0dGhpcy52MiA9IHRlbXA7XG5cdFx0fVxuXHR9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBUZXh0dXJlUmVnaW9uOyIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgU2lnbmFsID0gcmVxdWlyZSgnc2lnbmFscycpO1xuXG4vKipcbiAqIEEgdGhpbiB3cmFwcGVyIGFyb3VuZCBXZWJHTFJlbmRlcmluZ0NvbnRleHQgd2hpY2ggaGFuZGxlc1xuICogY29udGV4dCBsb3NzIGFuZCByZXN0b3JlIHdpdGggdmFyaW91cyByZW5kZXJpbmcgb2JqZWN0cyAodGV4dHVyZXMsXG4gKiBzaGFkZXJzIGFuZCBidWZmZXJzKS4gVGhpcyBhbHNvIGhhbmRsZXMgZ2VuZXJhbCB2aWV3cG9ydCBtYW5hZ2VtZW50LlxuICpcbiAqIElmIHRoZSB2aWV3IGlzIG5vdCBzcGVjaWZpZWQsIGEgY2FudmFzIHdpbGwgYmUgY3JlYXRlZC5cbiAqIFxuICogQGNsYXNzICBXZWJHTENvbnRleHRcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtOdW1iZXJ9IHdpZHRoIHRoZSB3aWR0aCBvZiB0aGUgR0wgY2FudmFzXG4gKiBAcGFyYW0ge051bWJlcn0gaGVpZ2h0IHRoZSBoZWlnaHQgb2YgdGhlIEdMIGNhbnZhc1xuICogQHBhcmFtIHtIVE1MQ2FudmFzRWxlbWVudH0gdmlldyB0aGUgb3B0aW9uYWwgRE9NIGNhbnZhcyBlbGVtZW50XG4gKiBAcGFyYW0ge09iamVjdH0gY29udGV4dEF0dHJpYnVldHMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgY29udGV4dCBhdHRyaWJzIHdoaWNoXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lsbCBiZSB1c2VkIGR1cmluZyBHTCBpbml0aWFsaXphdGlvblxuICovXG52YXIgV2ViR0xDb250ZXh0ID0gbmV3IENsYXNzKHtcblx0XG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFdlYkdMQ29udGV4dCh3aWR0aCwgaGVpZ2h0LCB2aWV3LCBjb250ZXh0QXR0cmlidXRlcykge1xuXHRcdC8qKlxuXHRcdCAqIFRoZSBsaXN0IG9mIHJlbmRlcmluZyBvYmplY3RzIChzaGFkZXJzLCBWQk9zLCB0ZXh0dXJlcywgZXRjKSB3aGljaCBhcmUgXG5cdFx0ICogY3VycmVudGx5IGJlaW5nIG1hbmFnZWQuIEFueSBvYmplY3Qgd2l0aCBhIFwiY3JlYXRlXCIgbWV0aG9kIGNhbiBiZSBhZGRlZFxuXHRcdCAqIHRvIHRoaXMgbGlzdC4gVXBvbiBkZXN0cm95aW5nIHRoZSByZW5kZXJpbmcgb2JqZWN0LCBpdCBzaG91bGQgYmUgcmVtb3ZlZC5cblx0XHQgKiBTZWUgYWRkTWFuYWdlZE9iamVjdCBhbmQgcmVtb3ZlTWFuYWdlZE9iamVjdC5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkge0FycmF5fSBtYW5hZ2VkT2JqZWN0c1xuXHRcdCAqL1xuXHRcdHRoaXMubWFuYWdlZE9iamVjdHMgPSBbXTtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBhY3R1YWwgR0wgY29udGV4dC4gWW91IGNhbiB1c2UgdGhpcyBmb3Jcblx0XHQgKiByYXcgR0wgY2FsbHMgb3IgdG8gYWNjZXNzIEdMZW51bSBjb25zdGFudHMuIFRoaXNcblx0XHQgKiB3aWxsIGJlIHVwZGF0ZWQgb24gY29udGV4dCByZXN0b3JlLiBXaGlsZSB0aGUgV2ViR0xDb250ZXh0XG5cdFx0ICogaXMgbm90IGB2YWxpZGAsIHlvdSBzaG91bGQgbm90IHRyeSB0byBhY2Nlc3MgR0wgc3RhdGUuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IGdsXG5cdFx0ICogQHR5cGUge1dlYkdMUmVuZGVyaW5nQ29udGV4dH1cblx0XHQgKi9cblx0XHR0aGlzLmdsID0gbnVsbDtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBjYW52YXMgRE9NIGVsZW1lbnQgZm9yIHRoaXMgY29udGV4dC5cblx0XHQgKiBAcHJvcGVydHkge051bWJlcn0gdmlld1xuXHRcdCAqL1xuXHRcdHRoaXMudmlldyA9IHZpZXcgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcblxuXHRcdC8vZGVmYXVsdCBzaXplIGFzIHBlciBzcGVjOlxuXHRcdC8vaHR0cDovL3d3dy53My5vcmcvVFIvMjAxMi9XRC1odG1sNS1hdXRob3ItMjAxMjAzMjkvdGhlLWNhbnZhcy1lbGVtZW50Lmh0bWwjdGhlLWNhbnZhcy1lbGVtZW50XG5cdFx0XG5cdFx0LyoqXG5cdFx0ICogVGhlIHdpZHRoIG9mIHRoaXMgY2FudmFzLlxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IHdpZHRoXG5cdFx0ICogQHR5cGUge051bWJlcn1cblx0XHQgKi9cblx0XHR0aGlzLndpZHRoID0gdGhpcy52aWV3LndpZHRoID0gd2lkdGggfHwgMzAwO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIGhlaWdodCBvZiB0aGlzIGNhbnZhcy5cblx0XHQgKiBAcHJvcGVydHkgaGVpZ2h0XG5cdFx0ICogQHR5cGUge051bWJlcn1cblx0XHQgKi9cblx0XHR0aGlzLmhlaWdodCA9IHRoaXMudmlldy5oZWlnaHQgPSBoZWlnaHQgfHwgMTUwO1xuXG5cblx0XHQvKipcblx0XHQgKiBUaGUgY29udGV4dCBhdHRyaWJ1dGVzIGZvciBpbml0aWFsaXppbmcgdGhlIEdMIHN0YXRlLiBUaGlzIG1pZ2h0IGluY2x1ZGVcblx0XHQgKiBhbnRpLWFsaWFzaW5nLCBhbHBoYSBzZXR0aW5ncywgdmVyaXNvbiwgYW5kIHNvIGZvcnRoLlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb250ZXh0QXR0cmlidXRlcyBcblx0XHQgKi9cblx0XHR0aGlzLmNvbnRleHRBdHRyaWJ1dGVzID0gY29udGV4dEF0dHJpYnV0ZXM7XG5cdFx0XG5cdFx0LyoqXG5cdFx0ICogV2hldGhlciB0aGlzIGNvbnRleHQgaXMgJ3ZhbGlkJywgaS5lLiByZW5kZXJhYmxlLiBBIGNvbnRleHQgdGhhdCBoYXMgYmVlbiBsb3N0XG5cdFx0ICogKGFuZCBub3QgeWV0IHJlc3RvcmVkKSBvciBkZXN0cm95ZWQgaXMgaW52YWxpZC5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkge0Jvb2xlYW59IHZhbGlkXG5cdFx0ICovXG5cdFx0dGhpcy52YWxpZCA9IGZhbHNlO1xuXG5cdFx0LyoqXG5cdFx0ICogQSBzaWduYWwgZGlzcGF0Y2hlZCB3aGVuIEdMIGNvbnRleHQgaXMgbG9zdC4gXG5cdFx0ICogXG5cdFx0ICogVGhlIGZpcnN0IGFyZ3VtZW50IHBhc3NlZCB0byB0aGUgbGlzdGVuZXIgaXMgdGhlIFdlYkdMQ29udGV4dFxuXHRcdCAqIG1hbmFnaW5nIHRoZSBjb250ZXh0IGxvc3MuXG5cdFx0ICogXG5cdFx0ICogQGV2ZW50IHtTaWduYWx9IGxvc3Rcblx0XHQgKi9cblx0XHR0aGlzLmxvc3QgPSBuZXcgU2lnbmFsKCk7XG5cblx0XHQvKipcblx0XHQgKiBBIHNpZ25hbCBkaXNwYXRjaGVkIHdoZW4gR0wgY29udGV4dCBpcyByZXN0b3JlZCwgYWZ0ZXIgYWxsIHRoZSBtYW5hZ2VkXG5cdFx0ICogb2JqZWN0cyBoYXZlIGJlZW4gcmVjcmVhdGVkLlxuXHRcdCAqXG5cdFx0ICogVGhlIGZpcnN0IGFyZ3VtZW50IHBhc3NlZCB0byB0aGUgbGlzdGVuZXIgaXMgdGhlIFdlYkdMQ29udGV4dFxuXHRcdCAqIHdoaWNoIG1hbmFnZWQgdGhlIHJlc3RvcmF0aW9uLlxuXHRcdCAqXG5cdFx0ICogVGhpcyBkb2VzIG5vdCBnYXVyZW50ZWUgdGhhdCBhbGwgb2JqZWN0cyB3aWxsIGJlIHJlbmRlcmFibGUuXG5cdFx0ICogRm9yIGV4YW1wbGUsIGEgVGV4dHVyZSB3aXRoIGFuIEltYWdlUHJvdmlkZXIgbWF5IHN0aWxsIGJlIGxvYWRpbmdcblx0XHQgKiBhc3luY2hyb25vdXNseS5cdCBcblx0XHQgKiBcblx0XHQgKiBAZXZlbnQge1NpZ25hbH0gcmVzdG9yZWRcblx0XHQgKi9cblx0XHR0aGlzLnJlc3RvcmVkID0gbmV3IFNpZ25hbCgpO1x0XG5cdFx0XG5cdFx0Ly9zZXR1cCBjb250ZXh0IGxvc3QgYW5kIHJlc3RvcmUgbGlzdGVuZXJzXG5cdFx0dGhpcy52aWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJ3ZWJnbGNvbnRleHRsb3N0XCIsIGZ1bmN0aW9uIChldikge1xuXHRcdFx0ZXYucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMuX2NvbnRleHRMb3N0KGV2KTtcblx0XHR9LmJpbmQodGhpcykpO1xuXHRcdHRoaXMudmlldy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0cmVzdG9yZWRcIiwgZnVuY3Rpb24gKGV2KSB7XG5cdFx0XHRldi5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5fY29udGV4dFJlc3RvcmVkKGV2KTtcblx0XHR9LmJpbmQodGhpcykpO1xuXHRcdFx0XG5cdFx0dGhpcy5faW5pdENvbnRleHQoKTtcblxuXHRcdHRoaXMucmVzaXplKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcblx0fSxcblx0XG5cdF9pbml0Q29udGV4dDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGVyciA9IFwiXCI7XG5cdFx0dGhpcy52YWxpZCA9IGZhbHNlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuZ2wgPSAodGhpcy52aWV3LmdldENvbnRleHQoJ3dlYmdsJywgdGhpcy5jb250ZXh0QXR0cmlidXRlcykgXG5cdFx0XHRcdFx0XHR8fCB0aGlzLnZpZXcuZ2V0Q29udGV4dCgnZXhwZXJpbWVudGFsLXdlYmdsJywgdGhpcy5jb250ZXh0QXR0cmlidXRlcykpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuZ2wgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdsKSB7XG5cdFx0XHR0aGlzLnZhbGlkID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgXCJXZWJHTCBDb250ZXh0IE5vdCBTdXBwb3J0ZWQgLS0gdHJ5IGVuYWJsaW5nIGl0IG9yIHVzaW5nIGEgZGlmZmVyZW50IGJyb3dzZXJcIjtcblx0XHR9XHRcblx0fSxcblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgd2lkdGggYW5kIGhlaWdodCBvZiB0aGlzIFdlYkdMIGNvbnRleHQsIHJlc2l6ZXNcblx0ICogdGhlIGNhbnZhcyB2aWV3LCBhbmQgY2FsbHMgZ2wudmlld3BvcnQoKSB3aXRoIHRoZSBuZXcgc2l6ZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggIHRoZSBuZXcgd2lkdGhcblx0ICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgdGhlIG5ldyBoZWlnaHRcblx0ICovXG5cdHJlc2l6ZTogZnVuY3Rpb24od2lkdGgsIGhlaWdodCkge1xuXHRcdHRoaXMud2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuXHRcdHRoaXMudmlldy53aWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMudmlldy5oZWlnaHQgPSBoZWlnaHQ7XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLnZpZXdwb3J0KDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcblx0fSxcblxuXHQvKipcblx0ICogKGludGVybmFsIHVzZSlcblx0ICogQSBtYW5hZ2VkIG9iamVjdCBpcyBhbnl0aGluZyB3aXRoIGEgXCJjcmVhdGVcIiBmdW5jdGlvbiwgdGhhdCB3aWxsXG5cdCAqIHJlc3RvcmUgR0wgc3RhdGUgYWZ0ZXIgY29udGV4dCBsb3NzLiBcblx0ICogXG5cdCAqIEBwYXJhbSB7W3R5cGVdfSB0ZXggW2Rlc2NyaXB0aW9uXVxuXHQgKi9cblx0YWRkTWFuYWdlZE9iamVjdDogZnVuY3Rpb24ob2JqKSB7XG5cdFx0dGhpcy5tYW5hZ2VkT2JqZWN0cy5wdXNoKG9iaik7XG5cdH0sXG5cblx0LyoqXG5cdCAqIChpbnRlcm5hbCB1c2UpXG5cdCAqIFJlbW92ZXMgYSBtYW5hZ2VkIG9iamVjdCBmcm9tIHRoZSBjYWNoZS4gVGhpcyBpcyB1c2VmdWwgdG8gZGVzdHJveVxuXHQgKiBhIHRleHR1cmUgb3Igc2hhZGVyLCBhbmQgaGF2ZSBpdCBubyBsb25nZXIgcmUtbG9hZCBvbiBjb250ZXh0IHJlc3RvcmUuXG5cdCAqXG5cdCAqIFJldHVybnMgdGhlIG9iamVjdCB0aGF0IHdhcyByZW1vdmVkLCBvciBudWxsIGlmIGl0IHdhcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLlxuXHQgKiBcblx0ICogQHBhcmFtICB7T2JqZWN0fSBvYmogdGhlIG9iamVjdCB0byBiZSBtYW5hZ2VkXG5cdCAqIEByZXR1cm4ge09iamVjdH0gICAgIHRoZSByZW1vdmVkIG9iamVjdCwgb3IgbnVsbFxuXHQgKi9cblx0cmVtb3ZlTWFuYWdlZE9iamVjdDogZnVuY3Rpb24ob2JqKSB7XG5cdFx0dmFyIGlkeCA9IHRoaXMubWFuYWdlZE9iamVjdHMuaW5kZXhPZihvYmopO1xuXHRcdGlmIChpZHggPiAtMSkge1xuXHRcdFx0dGhpcy5tYW5hZ2VkT2JqZWN0cy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fSBcblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogQ2FsbHMgZGVzdHJveSgpIG9uIGVhY2ggbWFuYWdlZCBvYmplY3QsIHRoZW4gcmVtb3ZlcyByZWZlcmVuY2VzIHRvIHRoZXNlIG9iamVjdHNcblx0ICogYW5kIHRoZSBHTCByZW5kZXJpbmcgY29udGV4dC4gVGhpcyBhbHNvIHJlbW92ZXMgcmVmZXJlbmNlcyB0byB0aGUgdmlldyBhbmQgc2V0c1xuXHQgKiB0aGUgY29udGV4dCdzIHdpZHRoIGFuZCBoZWlnaHQgdG8gemVyby5cblx0ICpcblx0ICogQXR0ZW1wdGluZyB0byB1c2UgdGhpcyBXZWJHTENvbnRleHQgb3IgdGhlIEdMIHJlbmRlcmluZyBjb250ZXh0IGFmdGVyIGRlc3Ryb3lpbmcgaXRcblx0ICogd2lsbCBsZWFkIHRvIHVuZGVmaW5lZCBiZWhhdmlvdXIuXG5cdCAqL1xuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5tYW5hZ2VkT2JqZWN0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dmFyIG9iaiA9IHRoaXMubWFuYWdlZE9iamVjdHNbaV07XG5cdFx0XHRpZiAob2JqICYmIHR5cGVvZiBvYmouZGVzdHJveSlcblx0XHRcdFx0b2JqLmRlc3Ryb3koKTtcblx0XHR9XG5cdFx0dGhpcy5tYW5hZ2VkT2JqZWN0cy5sZW5ndGggPSAwO1xuXHRcdHRoaXMudmFsaWQgPSBmYWxzZTtcblx0XHR0aGlzLmdsID0gbnVsbDtcblx0XHR0aGlzLnZpZXcgPSBudWxsO1xuXHRcdHRoaXMud2lkdGggPSB0aGlzLmhlaWdodCA9IDA7XG5cdH0sXG5cblx0X2NvbnRleHRMb3N0OiBmdW5jdGlvbihldikge1xuXHRcdC8vYWxsIHRleHR1cmVzL3NoYWRlcnMvYnVmZmVycy9GQk9zIGhhdmUgYmVlbiBkZWxldGVkLi4uIFxuXHRcdC8vd2UgbmVlZCB0byByZS1jcmVhdGUgdGhlbSBvbiByZXN0b3JlXG5cdFx0dGhpcy52YWxpZCA9IGZhbHNlO1xuXG5cdFx0dGhpcy5sb3N0LmRpc3BhdGNoKHRoaXMpO1xuXHR9LFxuXG5cdF9jb250ZXh0UmVzdG9yZWQ6IGZ1bmN0aW9uKGV2KSB7XG5cdFx0Ly9maXJzdCwgaW5pdGlhbGl6ZSB0aGUgR0wgY29udGV4dCBhZ2FpblxuXHRcdHRoaXMuX2luaXRDb250ZXh0KCk7XG5cblx0XHQvL25vdyB3ZSByZWNyZWF0ZSBvdXIgc2hhZGVycyBhbmQgdGV4dHVyZXNcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5tYW5hZ2VkT2JqZWN0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5tYW5hZ2VkT2JqZWN0c1tpXS5jcmVhdGUoKTtcblx0XHR9XG5cblx0XHQvL3VwZGF0ZSBHTCB2aWV3cG9ydFxuXHRcdHRoaXMucmVzaXplKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcblxuXHRcdHRoaXMucmVzdG9yZWQuZGlzcGF0Y2godGhpcyk7XG5cdH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdlYkdMQ29udGV4dDsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcbnZhciBUZXh0dXJlID0gcmVxdWlyZSgnLi4vVGV4dHVyZScpO1xuXG5cbnZhciBGcmFtZUJ1ZmZlciA9IG5ldyBDbGFzcyh7XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgRnJhbWUgQnVmZmVyIE9iamVjdCB3aXRoIHRoZSBnaXZlbiB3aWR0aCBhbmQgaGVpZ2h0LlxuXHQgKlxuXHQgKiBJZiB3aWR0aCBhbmQgaGVpZ2h0IGFyZSBub24tbnVtYmVycywgdGhpcyBtZXRob2QgZXhwZWN0cyB0aGVcblx0ICogZmlyc3QgcGFyYW1ldGVyIHRvIGJlIGEgVGV4dHVyZSBvYmplY3Qgd2hpY2ggc2hvdWxkIGJlIGFjdGVkIHVwb24uIFxuXHQgKiBJbiB0aGlzIGNhc2UsIHRoZSBGcmFtZUJ1ZmZlciBkb2VzIG5vdCBcIm93blwiIHRoZSB0ZXh0dXJlLCBhbmQgc28gaXRcblx0ICogd29uJ3QgZGlzcG9zZSBvZiBpdCB1cG9uIGRlc3RydWN0aW9uLiBUaGlzIGlzIGFuIGFkdmFuY2VkIHZlcnNpb24gb2YgdGhlXG5cdCAqIGNvbnN0cnVjdG9yIHRoYXQgYXNzdW1lcyB0aGUgdXNlciBpcyBnaXZpbmcgdXMgYSB2YWxpZCBUZXh0dXJlIHRoYXQgY2FuIGJlIGJvdW5kIChpLmUuXG5cdCAqIG5vIGFzeW5jIEltYWdlIHRleHR1cmVzKS5cblx0ICpcblx0ICogQGNsYXNzICBGcmFtZUJ1ZmZlclxuXHQgKiBAY29uc3RydWN0b3Jcblx0ICogQHBhcmFtICB7W3R5cGVdfSB3aWR0aCAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19IGhlaWdodCBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gZmlsdGVyIFtkZXNjcmlwdGlvbl1cblx0ICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKi9cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gRnJhbWVCdWZmZXIoY29udGV4dCwgd2lkdGgsIGhlaWdodCwgZm9ybWF0KSB7IC8vVE9ETzogZGVwdGggY29tcG9uZW50XG5cdFx0aWYgKHR5cGVvZiBjb250ZXh0ICE9PSBcIm9iamVjdFwiKVxuXHRcdFx0dGhyb3cgXCJHTCBjb250ZXh0IG5vdCBzcGVjaWZpZWQgdG8gRnJhbWVCdWZmZXJcIjtcblx0XG5cblx0XHQvKipcblx0XHQgKiBUaGUgdW5kZXJseWluZyBJRCBvZiB0aGUgR0wgZnJhbWUgYnVmZmVyIG9iamVjdC5cblx0XHQgKlxuXHRcdCAqIEBwcm9wZXJ0eSB7V2ViR0xGcmFtZWJ1ZmZlcn0gaWRcblx0XHQgKi9cdFx0XG5cdFx0dGhpcy5pZCA9IG51bGw7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgV2ViR0xDb250ZXh0IGJhY2tlZCBieSB0aGlzIGZyYW1lIGJ1ZmZlci5cblx0XHQgKlxuXHRcdCAqIEBwcm9wZXJ0eSB7V2ViR0xDb250ZXh0fSBjb250ZXh0XG5cdFx0ICovXG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBUZXh0dXJlIGJhY2tlZCBieSB0aGlzIGZyYW1lIGJ1ZmZlci5cblx0XHQgKlxuXHRcdCAqIEBwcm9wZXJ0eSB7VGV4dHVyZX0gVGV4dHVyZVxuXHRcdCAqL1xuXHRcdC8vdGhpcyBUZXh0dXJlIGlzIG5vdyBtYW5hZ2VkLlxuXHRcdHRoaXMudGV4dHVyZSA9IG5ldyBUZXh0dXJlKGNvbnRleHQsIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCk7XG5cblx0XHQvL1RoaXMgaXMgbWFhbmdlZCBieSBXZWJHTENvbnRleHRcblx0XHR0aGlzLmNvbnRleHQuYWRkTWFuYWdlZE9iamVjdCh0aGlzKTtcblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIHJlYWQtb25seSBwcm9wZXJ0eSB3aGljaCByZXR1cm5zIHRoZSB3aWR0aCBvZiB0aGUgYmFja2luZyB0ZXh0dXJlLiBcblx0ICogXG5cdCAqIEByZWFkT25seVxuXHQgKiBAcHJvcGVydHkgd2lkdGhcblx0ICogQHR5cGUge051bWJlcn1cblx0ICovXG5cdHdpZHRoOiB7XG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLnRleHR1cmUud2lkdGhcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIEEgcmVhZC1vbmx5IHByb3BlcnR5IHdoaWNoIHJldHVybnMgdGhlIGhlaWdodCBvZiB0aGUgYmFja2luZyB0ZXh0dXJlLiBcblx0ICogXG5cdCAqIEByZWFkT25seVxuXHQgKiBAcHJvcGVydHkgaGVpZ2h0XG5cdCAqIEB0eXBlIHtOdW1iZXJ9XG5cdCAqL1xuXHRoZWlnaHQ6IHtcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudGV4dHVyZS5oZWlnaHQ7XG5cdFx0fVxuXHR9LFxuXG5cblx0LyoqXG5cdCAqIENhbGxlZCBkdXJpbmcgaW5pdGlhbGl6YXRpb24gdG8gc2V0dXAgdGhlIGZyYW1lIGJ1ZmZlcjsgYWxzbyBjYWxsZWQgb25cblx0ICogY29udGV4dCByZXN0b3JlLiBVc2VycyB3aWxsIG5vdCBuZWVkIHRvIGNhbGwgdGhpcyBkaXJlY3RseS5cblx0ICogXG5cdCAqIEBtZXRob2QgY3JlYXRlXG5cdCAqL1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7IFxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR2YXIgdGV4ID0gdGhpcy50ZXh0dXJlO1xuXG5cdFx0Ly93ZSBhc3N1bWUgdGhlIHRleHR1cmUgaGFzIGFscmVhZHkgaGFkIGNyZWF0ZSgpIGNhbGxlZCBvbiBpdFxuXHRcdC8vc2luY2UgaXQgd2FzIGFkZGVkIGFzIGEgbWFuYWdlZCBvYmplY3QgcHJpb3IgdG8gdGhpcyBGcmFtZUJ1ZmZlclxuXHRcdHRleC5iaW5kKCk7XG4gXG5cdFx0dGhpcy5pZCA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKCk7XG5cdFx0Z2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCB0aGlzLmlkKTtcblxuXHRcdGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKGdsLkZSQU1FQlVGRkVSLCBnbC5DT0xPUl9BVFRBQ0hNRU5UMCwgdGV4LnRhcmdldCwgdGV4LmlkLCAwKTtcblxuXHRcdHZhciByZXN1bHQgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKGdsLkZSQU1FQlVGRkVSKTtcblx0XHRpZiAocmVzdWx0ICE9IGdsLkZSQU1FQlVGRkVSX0NPTVBMRVRFKSB7XG5cdFx0XHR0aGlzLmRlc3Ryb3koKTsgLy9kZXN0cm95IG91ciByZXNvdXJjZXMgYmVmb3JlIGxlYXZpbmcgdGhpcyBmdW5jdGlvbi4uXG5cblx0XHRcdHZhciBlcnIgPSBcIkZyYW1lYnVmZmVyIG5vdCBjb21wbGV0ZVwiO1xuXHRcdFx0c3dpdGNoIChyZXN1bHQpIHtcblx0XHRcdFx0Y2FzZSBnbC5GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRDpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgXCI6IHVuc3VwcG9ydGVkXCIpO1xuXHRcdFx0XHRjYXNlIGdsLklOQ09NUExFVEVfRElNRU5TSU9OUzpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgXCI6IGluY29tcGxldGUgZGltZW5zaW9uc1wiKTtcblx0XHRcdFx0Y2FzZSBnbC5JTkNPTVBMRVRFX0FUVEFDSE1FTlQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGVyciArIFwiOiBpbmNvbXBsZXRlIGF0dGFjaG1lbnRcIik7XG5cdFx0XHRcdGNhc2UgZ2wuSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGVyciArIFwiOiBtaXNzaW5nIGF0dGFjaG1lbnRcIik7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgbnVsbCk7XG5cdH0sXG5cblxuXHQvKipcblx0ICogRGVzdHJveXMgdGhpcyBmcmFtZSBidWZmZXIuIFVzaW5nIHRoaXMgb2JqZWN0IGFmdGVyIGRlc3Ryb3lpbmcgaXQgd2lsbCBoYXZlXG5cdCAqIHVuZGVmaW5lZCByZXN1bHRzLiBcblx0ICogQG1ldGhvZCBkZXN0cm95XG5cdCAqL1xuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0aWYgKHRoaXMudGV4dHVyZSlcblx0XHRcdHRoaXMudGV4dHVyZS5kZXN0cm95KCk7XG5cdFx0aWYgKHRoaXMuaWQgJiYgdGhpcy5nbClcblx0XHRcdHRoaXMuZ2wuZGVsZXRlRnJhbWVidWZmZXIodGhpcy5pZCk7XG5cdFx0aWYgKHRoaXMuY29udGV4dClcblx0XHRcdHRoaXMuY29udGV4dC5yZW1vdmVNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXG5cdFx0dGhpcy5pZCA9IG51bGw7XG5cdFx0dGhpcy50ZXh0dXJlID0gbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogQmluZHMgdGhpcyBmcmFtZWJ1ZmZlciBhbmQgc2V0cyB0aGUgdmlld3BvcnQgdG8gdGhlIGV4cGVjdGVkIHNpemUuXG5cdCAqIEBtZXRob2QgYmVnaW5cblx0ICovXG5cdGJlZ2luOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLnZpZXdwb3J0KDAsIDAsIHRoaXMudGV4dHVyZS53aWR0aCwgdGhpcy50ZXh0dXJlLmhlaWdodCk7XG5cdFx0Z2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCB0aGlzLmlkKTtcblx0fSxcblxuXHQvKipcblx0ICogQmluZHMgdGhlIGRlZmF1bHQgZnJhbWUgYnVmZmVyICh0aGUgc2NyZWVuKSBhbmQgc2V0cyB0aGUgdmlld3BvcnQgYmFja1xuXHQgKiB0byB0aGUgc2l6ZSBvZiB0aGUgV2ViR0xDb250ZXh0LlxuXHQgKiBcblx0ICogQG1ldGhvZCBlbmRcblx0ICovXG5cdGVuZDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC52aWV3cG9ydCgwLCAwLCB0aGlzLmNvbnRleHQud2lkdGgsIHRoaXMuY29udGV4dC5oZWlnaHQpO1xuXHRcdGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgbnVsbCk7XG5cdH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZyYW1lQnVmZmVyOyIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG5cbi8vVE9ETzogZGVjb3VwbGUgaW50byBWQk8gKyBJQk8gdXRpbGl0aWVzIFxuLyoqXG4gKiBBIG1lc2ggY2xhc3MgdGhhdCB3cmFwcyBWQk8gYW5kIElCTy5cbiAqXG4gKiBAY2xhc3MgIE1lc2hcbiAqL1xudmFyIE1lc2ggPSBuZXcgQ2xhc3Moe1xuXG5cblx0LyoqXG5cdCAqIEEgd3JpdGUtb25seSBwcm9wZXJ0eSB3aGljaCBzZXRzIGJvdGggdmVydGljZXMgYW5kIGluZGljZXMgXG5cdCAqIGZsYWcgdG8gZGlydHkgb3Igbm90LiBcblx0ICpcblx0ICogQHByb3BlcnR5IGRpcnR5XG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKiBAd3JpdGVPbmx5XG5cdCAqL1xuXHRkaXJ0eToge1xuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSB2YWw7XG5cdFx0XHR0aGlzLmluZGljZXNEaXJ0eSA9IHZhbDtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgTWVzaCB3aXRoIHRoZSBwcm92aWRlZCBwYXJhbWV0ZXJzLlxuXHQgKlxuXHQgKiBJZiBudW1JbmRpY2VzIGlzIDAgb3IgZmFsc3ksIG5vIGluZGV4IGJ1ZmZlciB3aWxsIGJlIHVzZWRcblx0ICogYW5kIGluZGljZXMgd2lsbCBiZSBhbiBlbXB0eSBBcnJheUJ1ZmZlciBhbmQgYSBudWxsIGluZGV4QnVmZmVyLlxuXHQgKiBcblx0ICogSWYgaXNTdGF0aWMgaXMgdHJ1ZSwgdGhlbiB2ZXJ0ZXhVc2FnZSBhbmQgaW5kZXhVc2FnZSB3aWxsXG5cdCAqIGJlIHNldCB0byBnbC5TVEFUSUNfRFJBVy4gT3RoZXJ3aXNlIHRoZXkgd2lsbCB1c2UgZ2wuRFlOQU1JQ19EUkFXLlxuXHQgKiBZb3UgbWF5IHdhbnQgdG8gYWRqdXN0IHRoZXNlIGFmdGVyIGluaXRpYWxpemF0aW9uIGZvciBmdXJ0aGVyIGNvbnRyb2wuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtXZWJHTENvbnRleHR9ICBjb250ZXh0IHRoZSBjb250ZXh0IGZvciBtYW5hZ2VtZW50XG5cdCAqIEBwYXJhbSAge0Jvb2xlYW59IGlzU3RhdGljICAgICAgYSBoaW50IGFzIHRvIHdoZXRoZXIgdGhpcyBnZW9tZXRyeSBpcyBzdGF0aWNcblx0ICogQHBhcmFtICB7W3R5cGVdfSAgbnVtVmVydHMgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gIG51bUluZGljZXMgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19ICB2ZXJ0ZXhBdHRyaWJzIFtkZXNjcmlwdGlvbl1cblx0ICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgICAgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBNZXNoKGNvbnRleHQsIGlzU3RhdGljLCBudW1WZXJ0cywgbnVtSW5kaWNlcywgdmVydGV4QXR0cmlicykge1xuXHRcdGlmICh0eXBlb2YgY29udGV4dCAhPT0gXCJvYmplY3RcIilcblx0XHRcdHRocm93IFwiR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkIHRvIE1lc2hcIjtcblx0XHRpZiAoIW51bVZlcnRzKVxuXHRcdFx0dGhyb3cgXCJudW1WZXJ0cyBub3Qgc3BlY2lmaWVkLCBtdXN0IGJlID4gMFwiO1xuXG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLmdsID0gY29udGV4dC5nbDtcblx0XHRcblx0XHR0aGlzLm51bVZlcnRzID0gbnVsbDtcblx0XHR0aGlzLm51bUluZGljZXMgPSBudWxsO1xuXHRcdFxuXHRcdHRoaXMudmVydGljZXMgPSBudWxsO1xuXHRcdHRoaXMuaW5kaWNlcyA9IG51bGw7XG5cdFx0dGhpcy52ZXJ0ZXhCdWZmZXIgPSBudWxsO1xuXHRcdHRoaXMuaW5kZXhCdWZmZXIgPSBudWxsO1xuXG5cdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLmluZGljZXNEaXJ0eSA9IHRydWU7XG5cdFx0dGhpcy5pbmRleFVzYWdlID0gbnVsbDtcblx0XHR0aGlzLnZlcnRleFVzYWdlID0gbnVsbDtcblxuXHRcdC8qKiBcblx0XHQgKiBAcHJvcGVydHlcblx0XHQgKiBAcHJpdmF0ZVxuXHRcdCAqL1xuXHRcdHRoaXMuX3ZlcnRleEF0dHJpYnMgPSBudWxsO1xuXG5cdFx0LyoqIFxuXHRcdCAqIEBwcm9wZXJ0eVxuXHRcdCAqIEBwcml2YXRlXG5cdFx0ICovXG5cdFx0dGhpcy5fdmVydGV4U3RyaWRlID0gbnVsbDtcblxuXHRcdHRoaXMubnVtVmVydHMgPSBudW1WZXJ0cztcblx0XHR0aGlzLm51bUluZGljZXMgPSBudW1JbmRpY2VzIHx8IDA7XG5cdFx0dGhpcy52ZXJ0ZXhVc2FnZSA9IGlzU3RhdGljID8gdGhpcy5nbC5TVEFUSUNfRFJBVyA6IHRoaXMuZ2wuRFlOQU1JQ19EUkFXO1xuXHRcdHRoaXMuaW5kZXhVc2FnZSAgPSBpc1N0YXRpYyA/IHRoaXMuZ2wuU1RBVElDX0RSQVcgOiB0aGlzLmdsLkRZTkFNSUNfRFJBVztcblx0XHR0aGlzLl92ZXJ0ZXhBdHRyaWJzID0gdmVydGV4QXR0cmlicyB8fCBbXTtcblx0XHRcblx0XHR0aGlzLmluZGljZXNEaXJ0eSA9IHRydWU7XG5cdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gdHJ1ZTtcblxuXHRcdC8vZGV0ZXJtaW5lIHRoZSB2ZXJ0ZXggc3RyaWRlIGJhc2VkIG9uIGdpdmVuIGF0dHJpYnV0ZXNcblx0XHR2YXIgdG90YWxOdW1Db21wb25lbnRzID0gMDtcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5fdmVydGV4QXR0cmlicy5sZW5ndGg7IGkrKylcblx0XHRcdHRvdGFsTnVtQ29tcG9uZW50cyArPSB0aGlzLl92ZXJ0ZXhBdHRyaWJzW2ldLm9mZnNldENvdW50O1xuXHRcdHRoaXMuX3ZlcnRleFN0cmlkZSA9IHRvdGFsTnVtQ29tcG9uZW50cyAqIDQ7IC8vIGluIGJ5dGVzXG5cblx0XHR0aGlzLnZlcnRpY2VzID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLm51bVZlcnRzKTtcblx0XHR0aGlzLmluZGljZXMgPSBuZXcgVWludDE2QXJyYXkodGhpcy5udW1JbmRpY2VzKTtcblxuXHRcdC8vYWRkIHRoaXMgVkJPIHRvIHRoZSBtYW5hZ2VkIGNhY2hlXG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8vcmVjcmVhdGVzIHRoZSBidWZmZXJzIG9uIGNvbnRleHQgbG9zc1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR0aGlzLnZlcnRleEJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xuXG5cdFx0Ly9pZ25vcmUgaW5kZXggYnVmZmVyIGlmIHdlIGhhdmVuJ3Qgc3BlY2lmaWVkIGFueVxuXHRcdHRoaXMuaW5kZXhCdWZmZXIgPSB0aGlzLm51bUluZGljZXMgPiAwXG5cdFx0XHRcdFx0PyBnbC5jcmVhdGVCdWZmZXIoKVxuXHRcdFx0XHRcdDogbnVsbDtcblxuXHRcdHRoaXMuZGlydHkgPSB0cnVlO1xuXHR9LFxuXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMudmVydGljZXMgPSBbXTtcblx0XHR0aGlzLmluZGljZXMgPSBbXTtcblx0XHRpZiAodGhpcy52ZXJ0ZXhCdWZmZXIgJiYgdGhpcy5nbClcblx0XHRcdHRoaXMuZ2wuZGVsZXRlQnVmZmVyKHRoaXMudmVydGV4QnVmZmVyKTtcblx0XHRpZiAodGhpcy5pbmRleEJ1ZmZlciAmJiB0aGlzLmdsKVxuXHRcdFx0dGhpcy5nbC5kZWxldGVCdWZmZXIodGhpcy5pbmRleEJ1ZmZlcik7XG5cdFx0dGhpcy52ZXJ0ZXhCdWZmZXIgPSBudWxsO1xuXHRcdHRoaXMuaW5kZXhCdWZmZXIgPSBudWxsO1xuXHRcdGlmICh0aGlzLmNvbnRleHQpXG5cdFx0XHR0aGlzLmNvbnRleHQucmVtb3ZlTWFuYWdlZE9iamVjdCh0aGlzKTtcblx0XHR0aGlzLmdsID0gbnVsbDtcblx0XHR0aGlzLmNvbnRleHQgPSBudWxsO1xuXHR9LFxuXG5cdF91cGRhdGVCdWZmZXJzOiBmdW5jdGlvbihpZ25vcmVCaW5kLCBzdWJEYXRhTGVuZ3RoKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdC8vYmluZCBvdXIgaW5kZXggZGF0YSwgaWYgd2UgaGF2ZSBhbnlcblx0XHRpZiAodGhpcy5udW1JbmRpY2VzID4gMCkge1xuXHRcdFx0aWYgKCFpZ25vcmVCaW5kKVxuXHRcdFx0XHRnbC5iaW5kQnVmZmVyKGdsLkVMRU1FTlRfQVJSQVlfQlVGRkVSLCB0aGlzLmluZGV4QnVmZmVyKTtcblxuXHRcdFx0Ly91cGRhdGUgdGhlIGluZGV4IGRhdGFcblx0XHRcdGlmICh0aGlzLmluZGljZXNEaXJ0eSkge1xuXHRcdFx0XHRnbC5idWZmZXJEYXRhKGdsLkVMRU1FTlRfQVJSQVlfQlVGRkVSLCB0aGlzLmluZGljZXMsIHRoaXMuaW5kZXhVc2FnZSk7XG5cdFx0XHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly9iaW5kIG91ciB2ZXJ0ZXggZGF0YVxuXHRcdGlmICghaWdub3JlQmluZClcblx0XHRcdGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCB0aGlzLnZlcnRleEJ1ZmZlcik7XG5cblx0XHQvL3VwZGF0ZSBvdXIgdmVydGV4IGRhdGFcblx0XHRpZiAodGhpcy52ZXJ0aWNlc0RpcnR5KSB7XG5cdFx0XHRpZiAoc3ViRGF0YUxlbmd0aCkge1xuXHRcdFx0XHQvLyBUT0RPOiBXaGVuIGRlY291cGxpbmcgVkJPL0lCTyBiZSBzdXJlIHRvIGdpdmUgYmV0dGVyIHN1YkRhdGEgc3VwcG9ydC4uXG5cdFx0XHRcdHZhciB2aWV3ID0gdGhpcy52ZXJ0aWNlcy5zdWJhcnJheSgwLCBzdWJEYXRhTGVuZ3RoKTtcblx0XHRcdFx0Z2wuYnVmZmVyU3ViRGF0YShnbC5BUlJBWV9CVUZGRVIsIDAsIHZpZXcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIHRoaXMudmVydGljZXMsIHRoaXMudmVydGV4VXNhZ2UpO1x0XG5cdFx0XHR9XG5cblx0XHRcdFxuXHRcdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gZmFsc2U7XG5cdFx0fVxuXHR9LFxuXG5cdGRyYXc6IGZ1bmN0aW9uKHByaW1pdGl2ZVR5cGUsIGNvdW50LCBvZmZzZXQsIHN1YkRhdGFMZW5ndGgpIHtcblx0XHRpZiAoY291bnQgPT09IDApXG5cdFx0XHRyZXR1cm47XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdFxuXHRcdG9mZnNldCA9IG9mZnNldCB8fCAwO1xuXG5cdFx0Ly9iaW5kcyBhbmQgdXBkYXRlcyBvdXIgYnVmZmVycy4gcGFzcyBpZ25vcmVCaW5kIGFzIHRydWVcblx0XHQvL3RvIGF2b2lkIGJpbmRpbmcgdW5uZWNlc3NhcmlseVxuXHRcdHRoaXMuX3VwZGF0ZUJ1ZmZlcnModHJ1ZSwgc3ViRGF0YUxlbmd0aCk7XG5cblx0XHRpZiAodGhpcy5udW1JbmRpY2VzID4gMCkgeyBcblx0XHRcdGdsLmRyYXdFbGVtZW50cyhwcmltaXRpdmVUeXBlLCBjb3VudCwgXG5cdFx0XHRcdFx0XHRnbC5VTlNJR05FRF9TSE9SVCwgb2Zmc2V0ICogMik7IC8vKiBVaW50MTZBcnJheS5CWVRFU19QRVJfRUxFTUVOVFxuXHRcdH0gZWxzZVxuXHRcdFx0Z2wuZHJhd0FycmF5cyhwcmltaXRpdmVUeXBlLCBvZmZzZXQsIGNvdW50KTtcblx0fSxcblxuXHQvL2JpbmRzIHRoaXMgbWVzaCdzIHZlcnRleCBhdHRyaWJ1dGVzIGZvciB0aGUgZ2l2ZW4gc2hhZGVyXG5cdGJpbmQ6IGZ1bmN0aW9uKHNoYWRlcikge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR2YXIgb2Zmc2V0ID0gMDtcblx0XHR2YXIgc3RyaWRlID0gdGhpcy5fdmVydGV4U3RyaWRlO1xuXG5cdFx0Ly9iaW5kIGFuZCB1cGRhdGUgb3VyIHZlcnRleCBkYXRhIGJlZm9yZSBiaW5kaW5nIGF0dHJpYnV0ZXNcblx0XHR0aGlzLl91cGRhdGVCdWZmZXJzKCk7XG5cblx0XHQvL2ZvciBlYWNoIGF0dHJpYnR1ZVxuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLl92ZXJ0ZXhBdHRyaWJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgYSA9IHRoaXMuX3ZlcnRleEF0dHJpYnNbaV07XG5cblx0XHRcdC8vbG9jYXRpb24gb2YgdGhlIGF0dHJpYnV0ZVxuXHRcdFx0dmFyIGxvYyA9IGEubG9jYXRpb24gPT09IG51bGwgXG5cdFx0XHRcdFx0PyBzaGFkZXIuZ2V0QXR0cmlidXRlTG9jYXRpb24oYS5uYW1lKVxuXHRcdFx0XHRcdDogYS5sb2NhdGlvbjtcblxuXHRcdFx0Ly9UT0RPOiBXZSBtYXkgd2FudCB0byBza2lwIHVuZm91bmQgYXR0cmlic1xuXHRcdFx0Ly8gaWYgKGxvYyE9PTAgJiYgIWxvYylcblx0XHRcdC8vIFx0Y29uc29sZS53YXJuKFwiV0FSTjpcIiwgYS5uYW1lLCBcImlzIG5vdCBlbmFibGVkXCIpO1xuXG5cdFx0XHQvL2ZpcnN0LCBlbmFibGUgdGhlIHZlcnRleCBhcnJheVxuXHRcdFx0Z2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkobG9jKTtcblxuXHRcdFx0Ly90aGVuIHNwZWNpZnkgb3VyIHZlcnRleCBmb3JtYXRcblx0XHRcdGdsLnZlcnRleEF0dHJpYlBvaW50ZXIobG9jLCBhLm51bUNvbXBvbmVudHMsIGEudHlwZSB8fCBnbC5GTE9BVCwgXG5cdFx0XHRcdFx0XHRcdFx0ICAgYS5ub3JtYWxpemUsIHN0cmlkZSwgb2Zmc2V0KTtcblxuXHRcdFx0Ly9hbmQgaW5jcmVhc2UgdGhlIG9mZnNldC4uLlxuXHRcdFx0b2Zmc2V0ICs9IGEub2Zmc2V0Q291bnQgKiA0OyAvL2luIGJ5dGVzXG5cdFx0fVxuXHR9LFxuXG5cdHVuYmluZDogZnVuY3Rpb24oc2hhZGVyKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdC8vZm9yIGVhY2ggYXR0cmlidHVlXG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMuX3ZlcnRleEF0dHJpYnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhciBhID0gdGhpcy5fdmVydGV4QXR0cmlic1tpXTtcblxuXHRcdFx0Ly9sb2NhdGlvbiBvZiB0aGUgYXR0cmlidXRlXG5cdFx0XHR2YXIgbG9jID0gYS5sb2NhdGlvbiA9PT0gbnVsbCBcblx0XHRcdFx0XHQ/IHNoYWRlci5nZXRBdHRyaWJ1dGVMb2NhdGlvbihhLm5hbWUpXG5cdFx0XHRcdFx0OiBhLmxvY2F0aW9uO1xuXG5cdFx0XHQvL2ZpcnN0LCBlbmFibGUgdGhlIHZlcnRleCBhcnJheVxuXHRcdFx0Z2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KGxvYyk7XG5cdFx0fVxuXHR9XG59KTtcblxuTWVzaC5BdHRyaWIgPSBuZXcgQ2xhc3Moe1xuXG5cdG5hbWU6IG51bGwsXG5cdG51bUNvbXBvbmVudHM6IG51bGwsXG5cdGxvY2F0aW9uOiBudWxsLFxuXHR0eXBlOiBudWxsLFxuXG5cdC8qKlxuXHQgKiBMb2NhdGlvbiBpcyBvcHRpb25hbCBhbmQgZm9yIGFkdmFuY2VkIHVzZXJzIHRoYXRcblx0ICogd2FudCB2ZXJ0ZXggYXJyYXlzIHRvIG1hdGNoIGFjcm9zcyBzaGFkZXJzLiBBbnkgbm9uLW51bWVyaWNhbFxuXHQgKiB2YWx1ZSB3aWxsIGJlIGNvbnZlcnRlZCB0byBudWxsLCBhbmQgaWdub3JlZC4gSWYgYSBudW1lcmljYWxcblx0ICogdmFsdWUgaXMgZ2l2ZW4sIGl0IHdpbGwgb3ZlcnJpZGUgdGhlIHBvc2l0aW9uIG9mIHRoaXMgYXR0cmlidXRlXG5cdCAqIHdoZW4gZ2l2ZW4gdG8gYSBtZXNoLlxuXHQgKiBcblx0ICogQHBhcmFtICB7W3R5cGVdfSBuYW1lICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSBudW1Db21wb25lbnRzIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSBsb2NhdGlvbiAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKG5hbWUsIG51bUNvbXBvbmVudHMsIGxvY2F0aW9uLCB0eXBlLCBub3JtYWxpemUsIG9mZnNldENvdW50KSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLm51bUNvbXBvbmVudHMgPSBudW1Db21wb25lbnRzO1xuXHRcdHRoaXMubG9jYXRpb24gPSB0eXBlb2YgbG9jYXRpb24gPT09IFwibnVtYmVyXCIgPyBsb2NhdGlvbiA6IG51bGw7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHR0aGlzLm5vcm1hbGl6ZSA9IEJvb2xlYW4obm9ybWFsaXplKTtcblx0XHR0aGlzLm9mZnNldENvdW50ID0gdHlwZW9mIG9mZnNldENvdW50ID09PSBcIm51bWJlclwiID8gb2Zmc2V0Q291bnQgOiB0aGlzLm51bUNvbXBvbmVudHM7XG5cdH1cbn0pXG5cblxubW9kdWxlLmV4cG9ydHMgPSBNZXNoOyIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG5cblxudmFyIFNoYWRlclByb2dyYW0gPSBuZXcgQ2xhc3Moe1xuXHRcblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgU2hhZGVyUHJvZ3JhbSBmcm9tIHRoZSBnaXZlbiBzb3VyY2UsIGFuZCBhbiBvcHRpb25hbCBtYXAgb2YgYXR0cmlidXRlXG5cdCAqIGxvY2F0aW9ucyBhcyA8bmFtZSwgaW5kZXg+IHBhaXJzLlxuXHQgKlxuXHQgKiBfTm90ZTpfIENocm9tZSB2ZXJzaW9uIDMxIHdhcyBnaXZpbmcgbWUgaXNzdWVzIHdpdGggYXR0cmlidXRlIGxvY2F0aW9ucyAtLSB5b3UgbWF5XG5cdCAqIHdhbnQgdG8gb21pdCB0aGlzIHRvIGxldCB0aGUgYnJvd3NlciBwaWNrIHRoZSBsb2NhdGlvbnMgZm9yIHlvdS5cdFxuXHQgKlxuXHQgKiBAY2xhc3MgIFNoYWRlclByb2dyYW1cblx0ICogQGNvbnN0cnVjdG9yXG5cdCAqIEBwYXJhbSAge1dlYkdMQ29udGV4dH0gY29udGV4dCAgICAgIHRoZSBjb250ZXh0IHRvIG1hbmFnZSB0aGlzIG9iamVjdFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IHZlcnRTb3VyY2UgICAgICAgICB0aGUgdmVydGV4IHNoYWRlciBzb3VyY2Vcblx0ICogQHBhcmFtICB7U3RyaW5nfSBmcmFnU291cmNlICAgICAgICAgdGhlIGZyYWdtZW50IHNoYWRlciBzb3VyY2Vcblx0ICogQHBhcmFtICB7T2JqZWN0fSBhdHRyaWJ1dGVMb2NhdGlvbnMgdGhlIGF0dHJpYnV0ZSBsb2NhdGlvbnNcblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFNoYWRlclByb2dyYW0oY29udGV4dCwgdmVydFNvdXJjZSwgZnJhZ1NvdXJjZSwgYXR0cmlidXRlTG9jYXRpb25zKSB7XG5cdFx0aWYgKCF2ZXJ0U291cmNlIHx8ICFmcmFnU291cmNlKVxuXHRcdFx0dGhyb3cgXCJ2ZXJ0ZXggYW5kIGZyYWdtZW50IHNoYWRlcnMgbXVzdCBiZSBkZWZpbmVkXCI7XG5cdFx0aWYgKHR5cGVvZiBjb250ZXh0ICE9PSBcIm9iamVjdFwiKVxuXHRcdFx0dGhyb3cgXCJHTCBjb250ZXh0IG5vdCBzcGVjaWZpZWQgdG8gU2hhZGVyUHJvZ3JhbVwiO1xuXHRcdHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cblx0XHR0aGlzLnZlcnRTaGFkZXIgPSBudWxsO1xuXHRcdHRoaXMuZnJhZ1NoYWRlciA9IG51bGw7XG5cdFx0dGhpcy5wcm9ncmFtID0gbnVsbDtcblx0XHR0aGlzLmxvZyA9IFwiXCI7XG5cblx0XHR0aGlzLnVuaWZvcm1DYWNoZSA9IG51bGw7XG5cdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZSA9IG51bGw7XG5cblx0XHR0aGlzLmF0dHJpYnV0ZUxvY2F0aW9ucyA9IGF0dHJpYnV0ZUxvY2F0aW9ucztcblxuXHRcdC8vV2UgdHJpbSAoRUNNQVNjcmlwdDUpIHNvIHRoYXQgdGhlIEdMU0wgbGluZSBudW1iZXJzIGFyZVxuXHRcdC8vYWNjdXJhdGUgb24gc2hhZGVyIGxvZ1xuXHRcdHRoaXMudmVydFNvdXJjZSA9IHZlcnRTb3VyY2UudHJpbSgpO1xuXHRcdHRoaXMuZnJhZ1NvdXJjZSA9IGZyYWdTb3VyY2UudHJpbSgpO1xuXG5cdFx0Ly9BZGRzIHRoaXMgc2hhZGVyIHRvIHRoZSBjb250ZXh0LCB0byBiZSBtYW5hZ2VkXG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8qKiBcblx0ICogVGhpcyBpcyBjYWxsZWQgZHVyaW5nIHRoZSBTaGFkZXJQcm9ncmFtIGNvbnN0cnVjdG9yLFxuXHQgKiBhbmQgbWF5IG5lZWQgdG8gYmUgY2FsbGVkIGFnYWluIGFmdGVyIGNvbnRleHQgbG9zcyBhbmQgcmVzdG9yZS5cblx0ICogXG5cdCAqIEBtZXRob2QgIGNyZWF0ZVxuXHQgKi9cblx0Y3JlYXRlOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHRcdHRoaXMuX2NvbXBpbGVTaGFkZXJzKCk7XG5cdH0sXG5cblx0Ly9Db21waWxlcyB0aGUgc2hhZGVycywgdGhyb3dpbmcgYW4gZXJyb3IgaWYgdGhlIHByb2dyYW0gd2FzIGludmFsaWQuXG5cdF9jb21waWxlU2hhZGVyczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDsgXG5cdFx0XG5cdFx0dGhpcy5sb2cgPSBcIlwiO1xuXG5cdFx0dGhpcy52ZXJ0U2hhZGVyID0gdGhpcy5fbG9hZFNoYWRlcihnbC5WRVJURVhfU0hBREVSLCB0aGlzLnZlcnRTb3VyY2UpO1xuXHRcdHRoaXMuZnJhZ1NoYWRlciA9IHRoaXMuX2xvYWRTaGFkZXIoZ2wuRlJBR01FTlRfU0hBREVSLCB0aGlzLmZyYWdTb3VyY2UpO1xuXG5cdFx0aWYgKCF0aGlzLnZlcnRTaGFkZXIgfHwgIXRoaXMuZnJhZ1NoYWRlcilcblx0XHRcdHRocm93IFwiRXJyb3IgcmV0dXJuZWQgd2hlbiBjYWxsaW5nIGNyZWF0ZVNoYWRlclwiO1xuXG5cdFx0dGhpcy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpO1xuXG5cdFx0Z2wuYXR0YWNoU2hhZGVyKHRoaXMucHJvZ3JhbSwgdGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRnbC5hdHRhY2hTaGFkZXIodGhpcy5wcm9ncmFtLCB0aGlzLmZyYWdTaGFkZXIpO1xuXHRcblx0XHQvL1RPRE86IFRoaXMgc2VlbXMgbm90IHRvIGJlIHdvcmtpbmcgb24gbXkgT1NYIC0tIG1heWJlIGEgZHJpdmVyIGJ1Zz9cblx0XHRpZiAodGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnMpIHtcblx0XHRcdGZvciAodmFyIGtleSBpbiB0aGlzLmF0dHJpYnV0ZUxvY2F0aW9ucykge1xuXHRcdFx0XHRpZiAodGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdFx0XHRcdGdsLmJpbmRBdHRyaWJMb2NhdGlvbih0aGlzLnByb2dyYW0sIE1hdGguZmxvb3IodGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnNba2V5XSksIGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRnbC5saW5rUHJvZ3JhbSh0aGlzLnByb2dyYW0pOyBcblxuXHRcdHRoaXMubG9nICs9IGdsLmdldFByb2dyYW1JbmZvTG9nKHRoaXMucHJvZ3JhbSkgfHwgXCJcIjtcblxuXHRcdGlmICghZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSkge1xuXHRcdFx0dGhyb3cgXCJFcnJvciBsaW5raW5nIHRoZSBzaGFkZXIgcHJvZ3JhbTpcXG5cIlxuXHRcdFx0XHQrIHRoaXMubG9nO1xuXHRcdH1cblxuXHRcdHRoaXMuX2ZldGNoVW5pZm9ybXMoKTtcblx0XHR0aGlzLl9mZXRjaEF0dHJpYnV0ZXMoKTtcblx0fSxcblxuXHRfZmV0Y2hVbmlmb3JtczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHRoaXMudW5pZm9ybUNhY2hlID0ge307XG5cblx0XHR2YXIgbGVuID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkFDVElWRV9VTklGT1JNUyk7XG5cdFx0aWYgKCFsZW4pIC8vbnVsbCBvciB6ZXJvXG5cdFx0XHRyZXR1cm47XG5cblx0XHRmb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHtcblx0XHRcdHZhciBpbmZvID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybSh0aGlzLnByb2dyYW0sIGkpO1xuXHRcdFx0aWYgKGluZm8gPT09IG51bGwpIFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdHZhciBuYW1lID0gaW5mby5uYW1lO1xuXHRcdFx0dmFyIGxvY2F0aW9uID0gZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgbmFtZSk7XG5cdFx0XHRcblx0XHRcdHRoaXMudW5pZm9ybUNhY2hlW25hbWVdID0ge1xuXHRcdFx0XHRzaXplOiBpbmZvLnNpemUsXG5cdFx0XHRcdHR5cGU6IGluZm8udHlwZSxcblx0XHRcdFx0bG9jYXRpb246IGxvY2F0aW9uXG5cdFx0XHR9O1xuXHRcdH1cblx0fSxcblxuXHRfZmV0Y2hBdHRyaWJ1dGVzOiBmdW5jdGlvbigpIHsgXG5cdFx0dmFyIGdsID0gdGhpcy5nbDsgXG5cblx0XHR0aGlzLmF0dHJpYnV0ZUNhY2hlID0ge307XG5cblx0XHR2YXIgbGVuID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkFDVElWRV9BVFRSSUJVVEVTKTtcblx0XHRpZiAoIWxlbikgLy9udWxsIG9yIHplcm9cblx0XHRcdHJldHVybjtcdFxuXG5cdFx0Zm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSB7XG5cdFx0XHR2YXIgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYih0aGlzLnByb2dyYW0sIGkpO1xuXHRcdFx0aWYgKGluZm8gPT09IG51bGwpIFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdHZhciBuYW1lID0gaW5mby5uYW1lO1xuXG5cdFx0XHQvL3RoZSBhdHRyaWIgbG9jYXRpb24gaXMgYSBzaW1wbGUgaW5kZXhcblx0XHRcdHZhciBsb2NhdGlvbiA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgbmFtZSk7XG5cdFx0XHRcblx0XHRcdHRoaXMuYXR0cmlidXRlQ2FjaGVbbmFtZV0gPSB7XG5cdFx0XHRcdHNpemU6IGluZm8uc2l6ZSxcblx0XHRcdFx0dHlwZTogaW5mby50eXBlLFxuXHRcdFx0XHRsb2NhdGlvbjogbG9jYXRpb25cblx0XHRcdH07XG5cdFx0fVxuXHR9LFxuXG5cdF9sb2FkU2hhZGVyOiBmdW5jdGlvbih0eXBlLCBzb3VyY2UpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dmFyIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKTtcblx0XHRpZiAoIXNoYWRlcikgLy9zaG91bGQgbm90IG9jY3VyLi4uXG5cdFx0XHRyZXR1cm4gLTE7XG5cblx0XHRnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpO1xuXHRcdGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKTtcblx0XHRcblx0XHR2YXIgbG9nUmVzdWx0ID0gZ2wuZ2V0U2hhZGVySW5mb0xvZyhzaGFkZXIpIHx8IFwiXCI7XG5cdFx0aWYgKGxvZ1Jlc3VsdCkge1xuXHRcdFx0Ly93ZSBkbyB0aGlzIHNvIHRoZSB1c2VyIGtub3dzIHdoaWNoIHNoYWRlciBoYXMgdGhlIGVycm9yXG5cdFx0XHR2YXIgdHlwZVN0ciA9ICh0eXBlID09PSBnbC5WRVJURVhfU0hBREVSKSA/IFwidmVydGV4XCIgOiBcImZyYWdtZW50XCI7XG5cdFx0XHRsb2dSZXN1bHQgPSBcIkVycm9yIGNvbXBpbGluZyBcIisgdHlwZVN0cisgXCIgc2hhZGVyOlxcblwiK2xvZ1Jlc3VsdDtcblx0XHR9XG5cblx0XHR0aGlzLmxvZyArPSBsb2dSZXN1bHQ7XG5cblx0XHRpZiAoIWdsLmdldFNoYWRlclBhcmFtZXRlcihzaGFkZXIsIGdsLkNPTVBJTEVfU1RBVFVTKSApIHtcblx0XHRcdHRocm93IHRoaXMubG9nO1xuXHRcdH1cblx0XHRyZXR1cm4gc2hhZGVyO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgdG8gYmluZCB0aGlzIHNoYWRlci4gTm90ZSB0aGF0IHRoZXJlIGlzIG5vIFwidW5iaW5kXCIgc2luY2Vcblx0ICogdGVjaG5pY2FsbHkgc3VjaCBhIHRoaW5nIGlzIG5vdCBwb3NzaWJsZSBpbiB0aGUgcHJvZ3JhbW1hYmxlIHBpcGVsaW5lLlxuXHQgKlxuXHQgKiBZb3UgbXVzdCBiaW5kIGEgc2hhZGVyIGJlZm9yZSBzZXR0aW5ncyBpdHMgdW5pZm9ybXMuXG5cdCAqIFxuXHQgKiBAbWV0aG9kIGJpbmRcblx0ICovXG5cdGJpbmQ6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wudXNlUHJvZ3JhbSh0aGlzLnByb2dyYW0pO1xuXHR9LFxuXG5cblx0LyoqXG5cdCAqIERlc3Ryb3lzIHRoaXMgc2hhZGVyIGFuZCBpdHMgcmVzb3VyY2VzLiBZb3Ugc2hvdWxkIG5vdCB0cnkgdG8gdXNlIHRoaXNcblx0ICogYWZ0ZXIgZGVzdHJveWluZyBpdC5cblx0ICogQG1ldGhvZCAgZGVzdHJveVxuXHQgKi9cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuY29udGV4dClcblx0XHRcdHRoaXMuY29udGV4dC5yZW1vdmVNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXG5cdFx0aWYgKHRoaXMuZ2wpIHtcblx0XHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0XHRnbC5kZXRhY2hTaGFkZXIodGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRcdGdsLmRldGFjaFNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXG5cdFx0XHRnbC5kZWxldGVTaGFkZXIodGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRcdGdsLmRlbGV0ZVNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXHRcdFx0Z2wuZGVsZXRlUHJvZ3JhbSh0aGlzLnByb2dyYW0pO1xuXHRcdH1cblx0XHR0aGlzLmF0dHJpYnV0ZUNhY2hlID0gbnVsbDtcblx0XHR0aGlzLnVuaWZvcm1DYWNoZSA9IG51bGw7XG5cdFx0dGhpcy52ZXJ0U2hhZGVyID0gbnVsbDtcblx0XHR0aGlzLmZyYWdTaGFkZXIgPSBudWxsO1xuXHRcdHRoaXMucHJvZ3JhbSA9IG51bGw7XG5cdFx0dGhpcy5nbCA9IG51bGw7XG5cdFx0dGhpcy5jb250ZXh0ID0gbnVsbDtcblx0fSxcblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBpbmZvIChzaXplLCB0eXBlLCBsb2NhdGlvbikuXG5cdCAqIElmIHRoZSB1bmlmb3JtIGlzIG5vdCBmb3VuZCBpbiB0aGUgY2FjaGUsIGl0IGlzIGFzc3VtZWRcblx0ICogdG8gbm90IGV4aXN0LCBhbmQgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXHQgKlxuXHQgKiBUaGlzIG1heSByZXR1cm4gbnVsbCBldmVuIGlmIHRoZSB1bmlmb3JtIGlzIGRlZmluZWQgaW4gR0xTTDpcblx0ICogaWYgaXQgaXMgX2luYWN0aXZlXyAoaS5lLiBub3QgdXNlZCBpbiB0aGUgcHJvZ3JhbSkgdGhlbiBpdCBtYXlcblx0ICogYmUgb3B0aW1pemVkIG91dC5cblx0ICpcblx0ICogQG1ldGhvZCAgZ2V0VW5pZm9ybUluZm9cblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge09iamVjdH0gYW4gb2JqZWN0IGNvbnRhaW5pbmcgbG9jYXRpb24sIHNpemUsIGFuZCB0eXBlXG5cdCAqL1xuXHRnZXRVbmlmb3JtSW5mbzogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLnVuaWZvcm1DYWNoZVtuYW1lXSB8fCBudWxsOyBcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIGF0dHJpYnV0ZSBpbmZvIChzaXplLCB0eXBlLCBsb2NhdGlvbikuXG5cdCAqIElmIHRoZSBhdHRyaWJ1dGUgaXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZSwgaXQgaXMgYXNzdW1lZFxuXHQgKiB0byBub3QgZXhpc3QsIGFuZCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqXG5cdCAqIFRoaXMgbWF5IHJldHVybiBudWxsIGV2ZW4gaWYgdGhlIGF0dHJpYnV0ZSBpcyBkZWZpbmVkIGluIEdMU0w6XG5cdCAqIGlmIGl0IGlzIF9pbmFjdGl2ZV8gKGkuZS4gbm90IHVzZWQgaW4gdGhlIHByb2dyYW0gb3IgZGlzYWJsZWQpIFxuXHQgKiB0aGVuIGl0IG1heSBiZSBvcHRpbWl6ZWQgb3V0LlxuXHQgKlxuXHQgKiBAbWV0aG9kICBnZXRBdHRyaWJ1dGVJbmZvXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgYXR0cmlidXRlIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge29iamVjdH0gYW4gb2JqZWN0IGNvbnRhaW5pbmcgbG9jYXRpb24sIHNpemUgYW5kIHR5cGVcblx0ICovXG5cdGdldEF0dHJpYnV0ZUluZm86IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5hdHRyaWJ1dGVDYWNoZVtuYW1lXSB8fCBudWxsOyBcblx0fSxcblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBsb2NhdGlvbiBvYmplY3QuXG5cdCAqIElmIHRoZSB1bmlmb3JtIGlzIG5vdCBmb3VuZCwgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBnZXRBdHRyaWJ1dGVMb2NhdGlvblxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7R0xpbnR9IHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICovXG5cdGdldEF0dHJpYnV0ZUxvY2F0aW9uOiBmdW5jdGlvbihuYW1lKSB7IC8vVE9ETzogbWFrZSBmYXN0ZXIsIGRvbid0IGNhY2hlXG5cdFx0dmFyIGluZm8gPSB0aGlzLmdldEF0dHJpYnV0ZUluZm8obmFtZSk7XG5cdFx0cmV0dXJuIGluZm8gPyBpbmZvLmxvY2F0aW9uIDogbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gbG9jYXRpb24gb2JqZWN0LCBhc3N1bWluZyBpdCBleGlzdHNcblx0ICogYW5kIGlzIGFjdGl2ZS4gTm90ZSB0aGF0IHVuaWZvcm1zIG1heSBiZSBpbmFjdGl2ZSBpZiBcblx0ICogdGhlIEdMU0wgY29tcGlsZXIgZGVlbWVkIHRoZW0gdW51c2VkLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBnZXRVbmlmb3JtTG9jYXRpb25cblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge1dlYkdMVW5pZm9ybUxvY2F0aW9ufSB0aGUgbG9jYXRpb24gb2JqZWN0XG5cdCAqL1xuXHRnZXRVbmlmb3JtTG9jYXRpb246IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgaW5mbyA9IHRoaXMuZ2V0VW5pZm9ybUluZm8obmFtZSk7XG5cdFx0cmV0dXJuIGluZm8gPyBpbmZvLmxvY2F0aW9uIDogbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSB1bmlmb3JtIGlzIGFjdGl2ZSBhbmQgZm91bmQgaW4gdGhpc1xuXHQgKiBjb21waWxlZCBwcm9ncmFtLiBOb3RlIHRoYXQgdW5pZm9ybXMgbWF5IGJlIGluYWN0aXZlIGlmIFxuXHQgKiB0aGUgR0xTTCBjb21waWxlciBkZWVtZWQgdGhlbSB1bnVzZWQuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGhhc1VuaWZvcm1cblx0ICogQHBhcmFtICB7U3RyaW5nfSAgbmFtZSB0aGUgdW5pZm9ybSBuYW1lXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgdGhlIHVuaWZvcm0gaXMgZm91bmQgYW5kIGFjdGl2ZVxuXHQgKi9cblx0aGFzVW5pZm9ybTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdldFVuaWZvcm1JbmZvKG5hbWUpICE9PSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGF0dHJpYnV0ZSBpcyBhY3RpdmUgYW5kIGZvdW5kIGluIHRoaXNcblx0ICogY29tcGlsZWQgcHJvZ3JhbS5cblx0ICpcblx0ICogQG1ldGhvZCAgaGFzQXR0cmlidXRlXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gIG5hbWUgdGhlIGF0dHJpYnV0ZSBuYW1lXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgdGhlIGF0dHJpYnV0ZSBpcyBmb3VuZCBhbmQgYWN0aXZlXG5cdCAqL1xuXHRoYXNBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBdHRyaWJ1dGVJbmZvKG5hbWUpICE9PSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB1bmlmb3JtIHZhbHVlIGJ5IG5hbWUuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGdldFVuaWZvcm1cblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge2FueX0gVGhlIHZhbHVlIG9mIHRoZSBXZWJHTCB1bmlmb3JtXG5cdCAqL1xuXHRnZXRVbmlmb3JtOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2wuZ2V0VW5pZm9ybSh0aGlzLnByb2dyYW0sIHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpKTtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgdW5pZm9ybSB2YWx1ZSBhdCB0aGUgc3BlY2lmaWVkIFdlYkdMVW5pZm9ybUxvY2F0aW9uLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBnZXRVbmlmb3JtQXRcblx0ICogQHBhcmFtICB7V2ViR0xVbmlmb3JtTG9jYXRpb259IGxvY2F0aW9uIHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICogQHJldHVybiB7YW55fSBUaGUgdmFsdWUgb2YgdGhlIFdlYkdMIHVuaWZvcm1cblx0ICovXG5cdGdldFVuaWZvcm1BdDogZnVuY3Rpb24obG9jYXRpb24pIHtcblx0XHRyZXR1cm4gdGhpcy5nbC5nZXRVbmlmb3JtKHRoaXMucHJvZ3JhbSwgbG9jYXRpb24pO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIGNvbnZlbmllbmNlIG1ldGhvZCB0byBzZXQgdW5pZm9ybWkgZnJvbSB0aGUgZ2l2ZW4gYXJndW1lbnRzLlxuXHQgKiBXZSBkZXRlcm1pbmUgd2hpY2ggR0wgY2FsbCB0byBtYWtlIGJhc2VkIG9uIHRoZSBudW1iZXIgb2YgYXJndW1lbnRzXG5cdCAqIHBhc3NlZC4gRm9yIGV4YW1wbGUsIGBzZXRVbmlmb3JtaShcInZhclwiLCAwLCAxKWAgbWFwcyB0byBgZ2wudW5pZm9ybTJpYC5cblx0ICogXG5cdCAqIEBtZXRob2QgIHNldFVuaWZvcm1pXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lICAgICAgICBcdFx0dGhlIG5hbWUgb2YgdGhlIHVuaWZvcm1cblx0ICogQHBhcmFtIHtHTGludH0geCAgdGhlIHggY29tcG9uZW50IGZvciBpbnRzXG5cdCAqIEBwYXJhbSB7R0xpbnR9IHkgIHRoZSB5IGNvbXBvbmVudCBmb3IgaXZlYzJcblx0ICogQHBhcmFtIHtHTGludH0geiAgdGhlIHogY29tcG9uZW50IGZvciBpdmVjM1xuXHQgKiBAcGFyYW0ge0dMaW50fSB3ICB0aGUgdyBjb21wb25lbnQgZm9yIGl2ZWM0XG5cdCAqL1xuXHRzZXRVbmlmb3JtaTogZnVuY3Rpb24obmFtZSwgeCwgeSwgeiwgdykge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dmFyIGxvYyA9IHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpO1xuXHRcdGlmICghbG9jKSBcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdGNhc2UgMjogZ2wudW5pZm9ybTFpKGxvYywgeCk7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAzOiBnbC51bmlmb3JtMmkobG9jLCB4LCB5KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDQ6IGdsLnVuaWZvcm0zaShsb2MsIHgsIHksIHopOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNTogZ2wudW5pZm9ybTRpKGxvYywgeCwgeSwgeiwgdyk7IHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIGFyZ3VtZW50cyB0byBzZXRVbmlmb3JtaVwiOyBcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIEEgY29udmVuaWVuY2UgbWV0aG9kIHRvIHNldCB1bmlmb3JtZiBmcm9tIHRoZSBnaXZlbiBhcmd1bWVudHMuXG5cdCAqIFdlIGRldGVybWluZSB3aGljaCBHTCBjYWxsIHRvIG1ha2UgYmFzZWQgb24gdGhlIG51bWJlciBvZiBhcmd1bWVudHNcblx0ICogcGFzc2VkLiBGb3IgZXhhbXBsZSwgYHNldFVuaWZvcm1mKFwidmFyXCIsIDAsIDEpYCBtYXBzIHRvIGBnbC51bmlmb3JtMmZgLlxuXHQgKiBcblx0ICogQG1ldGhvZCAgc2V0VW5pZm9ybWZcblx0ICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgICAgICAgIFx0XHR0aGUgbmFtZSBvZiB0aGUgdW5pZm9ybVxuXHQgKiBAcGFyYW0ge0dMZmxvYXR9IHggIHRoZSB4IGNvbXBvbmVudCBmb3IgZmxvYXRzXG5cdCAqIEBwYXJhbSB7R0xmbG9hdH0geSAgdGhlIHkgY29tcG9uZW50IGZvciB2ZWMyXG5cdCAqIEBwYXJhbSB7R0xmbG9hdH0geiAgdGhlIHogY29tcG9uZW50IGZvciB2ZWMzXG5cdCAqIEBwYXJhbSB7R0xmbG9hdH0gdyAgdGhlIHcgY29tcG9uZW50IGZvciB2ZWM0XG5cdCAqL1xuXHRzZXRVbmlmb3JtZjogZnVuY3Rpb24obmFtZSwgeCwgeSwgeiwgdykge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dmFyIGxvYyA9IHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpO1xuXHRcdGlmICghbG9jKSBcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdGNhc2UgMjogZ2wudW5pZm9ybTFmKGxvYywgeCk7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAzOiBnbC51bmlmb3JtMmYobG9jLCB4LCB5KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDQ6IGdsLnVuaWZvcm0zZihsb2MsIHgsIHksIHopOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNTogZ2wudW5pZm9ybTRmKGxvYywgeCwgeSwgeiwgdyk7IHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIGFyZ3VtZW50cyB0byBzZXRVbmlmb3JtZlwiOyBcblx0XHR9XG5cdH0sXG5cblx0Ly9JIGd1ZXNzIHdlIHdvbid0IHN1cHBvcnQgc2VxdWVuY2U8R0xmbG9hdD4gLi4gd2hhdGV2ZXIgdGhhdCBpcyA/P1xuXHRcblxuXHQvLy8vLyBcblx0XG5cdC8qKlxuXHQgKiBBIGNvbnZlbmllbmNlIG1ldGhvZCB0byBzZXQgdW5pZm9ybU5mdiBmcm9tIHRoZSBnaXZlbiBBcnJheUJ1ZmZlci5cblx0ICogV2UgZGV0ZXJtaW5lIHdoaWNoIEdMIGNhbGwgdG8gbWFrZSBiYXNlZCBvbiB0aGUgbGVuZ3RoIG9mIHRoZSBhcnJheSBcblx0ICogYnVmZmVyIChmb3IgMS00IGNvbXBvbmVudCB2ZWN0b3JzIHN0b3JlZCBpbiBhIEZsb2F0MzJBcnJheSkuIFRvIHVzZVxuXHQgKiB0aGlzIG1ldGhvZCB0byB1cGxvYWQgZGF0YSB0byB1bmlmb3JtIGFycmF5cywgeW91IG5lZWQgdG8gc3BlY2lmeSB0aGVcblx0ICogJ2NvdW50JyBwYXJhbWV0ZXI7IGkuZS4gdGhlIGRhdGEgdHlwZSB5b3UgYXJlIHVzaW5nIGZvciB0aGF0IGFycmF5LiBJZlxuXHQgKiBzcGVjaWZpZWQsIHRoaXMgd2lsbCBkaWN0YXRlIHdoZXRoZXIgdG8gY2FsbCB1bmlmb3JtMWZ2LCB1bmlmb3JtMmZ2LCBldGMuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHNldFVuaWZvcm1mdlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAgICAgICAgXHRcdHRoZSBuYW1lIG9mIHRoZSB1bmlmb3JtXG5cdCAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGFycmF5QnVmZmVyIHRoZSBhcnJheSBidWZmZXJcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvdW50ICAgICAgICAgICAgb3B0aW9uYWwsIHRoZSBleHBsaWNpdCBkYXRhIHR5cGUgY291bnQsIGUuZy4gMiBmb3IgdmVjMlxuXHQgKi9cblx0c2V0VW5pZm9ybWZ2OiBmdW5jdGlvbihuYW1lLCBhcnJheUJ1ZmZlciwgY291bnQpIHtcblx0XHRjb3VudCA9IGNvdW50IHx8IGFycmF5QnVmZmVyLmxlbmd0aDtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdHZhciBsb2MgPSB0aGlzLmdldFVuaWZvcm1Mb2NhdGlvbihuYW1lKTtcblx0XHRpZiAoIWxvYykgXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0c3dpdGNoIChjb3VudCkge1xuXHRcdFx0Y2FzZSAxOiBnbC51bmlmb3JtMWZ2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMjogZ2wudW5pZm9ybTJmdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDM6IGdsLnVuaWZvcm0zZnYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSA0OiBnbC51bmlmb3JtNGZ2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IFwiaW52YWxpZCBhcmd1bWVudHMgdG8gc2V0VW5pZm9ybWZcIjsgXG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIGNvbnZlbmllbmNlIG1ldGhvZCB0byBzZXQgdW5pZm9ybU5pdiBmcm9tIHRoZSBnaXZlbiBBcnJheUJ1ZmZlci5cblx0ICogV2UgZGV0ZXJtaW5lIHdoaWNoIEdMIGNhbGwgdG8gbWFrZSBiYXNlZCBvbiB0aGUgbGVuZ3RoIG9mIHRoZSBhcnJheSBcblx0ICogYnVmZmVyIChmb3IgMS00IGNvbXBvbmVudCB2ZWN0b3JzIHN0b3JlZCBpbiBhIGludCBhcnJheSkuIFRvIHVzZVxuXHQgKiB0aGlzIG1ldGhvZCB0byB1cGxvYWQgZGF0YSB0byB1bmlmb3JtIGFycmF5cywgeW91IG5lZWQgdG8gc3BlY2lmeSB0aGVcblx0ICogJ2NvdW50JyBwYXJhbWV0ZXI7IGkuZS4gdGhlIGRhdGEgdHlwZSB5b3UgYXJlIHVzaW5nIGZvciB0aGF0IGFycmF5LiBJZlxuXHQgKiBzcGVjaWZpZWQsIHRoaXMgd2lsbCBkaWN0YXRlIHdoZXRoZXIgdG8gY2FsbCB1bmlmb3JtMWZ2LCB1bmlmb3JtMmZ2LCBldGMuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHNldFVuaWZvcm1pdlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAgICAgICAgXHRcdHRoZSBuYW1lIG9mIHRoZSB1bmlmb3JtXG5cdCAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGFycmF5QnVmZmVyIHRoZSBhcnJheSBidWZmZXJcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvdW50ICAgICAgICAgICAgb3B0aW9uYWwsIHRoZSBleHBsaWNpdCBkYXRhIHR5cGUgY291bnQsIGUuZy4gMiBmb3IgaXZlYzJcblx0ICovXG5cdHNldFVuaWZvcm1pdjogZnVuY3Rpb24obmFtZSwgYXJyYXlCdWZmZXIsIGNvdW50KSB7XG5cdFx0Y291bnQgPSBjb3VudCB8fCBhcnJheUJ1ZmZlci5sZW5ndGg7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKCFsb2MpIFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdHN3aXRjaCAoY291bnQpIHtcblx0XHRcdGNhc2UgMTogZ2wudW5pZm9ybTFpdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDI6IGdsLnVuaWZvcm0yaXYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAzOiBnbC51bmlmb3JtM2l2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNDogZ2wudW5pZm9ybTRpdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBcImludmFsaWQgYXJndW1lbnRzIHRvIHNldFVuaWZvcm1mXCI7IFxuXHRcdH1cblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gU2hhZGVyUHJvZ3JhbTsiLCIvKipcbiAgQXV0by1nZW5lcmF0ZWQgS2FtaSBpbmRleCBmaWxlLlxuICBDcmVhdGVkIG9uIDIwMTMtMTItMjMuXG4qL1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgLy9jb3JlIGNsYXNzZXNcbiAgICAnQmFzZUJhdGNoJzogICAgICAgcmVxdWlyZSgnLi9CYXNlQmF0Y2guanMnKSxcbiAgICAnU3ByaXRlQmF0Y2gnOiAgICAgcmVxdWlyZSgnLi9TcHJpdGVCYXRjaC5qcycpLFxuICAgICdUZXh0dXJlJzogICAgICAgICByZXF1aXJlKCcuL1RleHR1cmUuanMnKSxcbiAgICAnVGV4dHVyZVJlZ2lvbic6ICAgcmVxdWlyZSgnLi9UZXh0dXJlUmVnaW9uLmpzJyksXG4gICAgJ1dlYkdMQ29udGV4dCc6ICAgIHJlcXVpcmUoJy4vV2ViR0xDb250ZXh0LmpzJyksXG4gICAgJ0ZyYW1lQnVmZmVyJzogICAgIHJlcXVpcmUoJy4vZ2x1dGlscy9GcmFtZUJ1ZmZlci5qcycpLFxuICAgICdNZXNoJzogICAgICAgICAgICByZXF1aXJlKCcuL2dsdXRpbHMvTWVzaC5qcycpLFxuICAgICdTaGFkZXJQcm9ncmFtJzogICByZXF1aXJlKCcuL2dsdXRpbHMvU2hhZGVyUHJvZ3JhbS5qcycpXG59OyIsImZ1bmN0aW9uIGhhc0dldHRlck9yU2V0dGVyKGRlZikge1xuXHRyZXR1cm4gKCEhZGVmLmdldCAmJiB0eXBlb2YgZGVmLmdldCA9PT0gXCJmdW5jdGlvblwiKSB8fCAoISFkZWYuc2V0ICYmIHR5cGVvZiBkZWYuc2V0ID09PSBcImZ1bmN0aW9uXCIpO1xufVxuXG5mdW5jdGlvbiBnZXRQcm9wZXJ0eShkZWZpbml0aW9uLCBrLCBpc0NsYXNzRGVzY3JpcHRvcikge1xuXHQvL1RoaXMgbWF5IGJlIGEgbGlnaHR3ZWlnaHQgb2JqZWN0LCBPUiBpdCBtaWdodCBiZSBhIHByb3BlcnR5XG5cdC8vdGhhdCB3YXMgZGVmaW5lZCBwcmV2aW91c2x5LlxuXHRcblx0Ly9Gb3Igc2ltcGxlIGNsYXNzIGRlc2NyaXB0b3JzIHdlIGNhbiBqdXN0IGFzc3VtZSBpdHMgTk9UIHByZXZpb3VzbHkgZGVmaW5lZC5cblx0dmFyIGRlZiA9IGlzQ2xhc3NEZXNjcmlwdG9yIFxuXHRcdFx0XHQ/IGRlZmluaXRpb25ba10gXG5cdFx0XHRcdDogT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihkZWZpbml0aW9uLCBrKTtcblxuXHRpZiAoIWlzQ2xhc3NEZXNjcmlwdG9yICYmIGRlZi52YWx1ZSAmJiB0eXBlb2YgZGVmLnZhbHVlID09PSBcIm9iamVjdFwiKSB7XG5cdFx0ZGVmID0gZGVmLnZhbHVlO1xuXHR9XG5cblxuXHQvL1RoaXMgbWlnaHQgYmUgYSByZWd1bGFyIHByb3BlcnR5LCBvciBpdCBtYXkgYmUgYSBnZXR0ZXIvc2V0dGVyIHRoZSB1c2VyIGRlZmluZWQgaW4gYSBjbGFzcy5cblx0aWYgKCBkZWYgJiYgaGFzR2V0dGVyT3JTZXR0ZXIoZGVmKSApIHtcblx0XHRpZiAodHlwZW9mIGRlZi5lbnVtZXJhYmxlID09PSBcInVuZGVmaW5lZFwiKVxuXHRcdFx0ZGVmLmVudW1lcmFibGUgPSB0cnVlO1xuXHRcdGlmICh0eXBlb2YgZGVmLmNvbmZpZ3VyYWJsZSA9PT0gXCJ1bmRlZmluZWRcIilcblx0XHRcdGRlZi5jb25maWd1cmFibGUgPSB0cnVlO1xuXHRcdHJldHVybiBkZWY7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGhhc05vbkNvbmZpZ3VyYWJsZShvYmosIGspIHtcblx0dmFyIHByb3AgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKG9iaiwgayk7XG5cdGlmICghcHJvcClcblx0XHRyZXR1cm4gZmFsc2U7XG5cblx0aWYgKHByb3AudmFsdWUgJiYgdHlwZW9mIHByb3AudmFsdWUgPT09IFwib2JqZWN0XCIpXG5cdFx0cHJvcCA9IHByb3AudmFsdWU7XG5cblx0aWYgKHByb3AuY29uZmlndXJhYmxlID09PSBmYWxzZSkgXG5cdFx0cmV0dXJuIHRydWU7XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vL1RPRE86IE9uIGNyZWF0ZSwgXG4vL1x0XHRPbiBtaXhpbiwgXG5cbmZ1bmN0aW9uIGV4dGVuZChjdG9yLCBkZWZpbml0aW9uLCBpc0NsYXNzRGVzY3JpcHRvciwgZXh0ZW5kKSB7XG5cdGZvciAodmFyIGsgaW4gZGVmaW5pdGlvbikge1xuXHRcdGlmICghZGVmaW5pdGlvbi5oYXNPd25Qcm9wZXJ0eShrKSlcblx0XHRcdGNvbnRpbnVlO1xuXG5cdFx0dmFyIGRlZiA9IGdldFByb3BlcnR5KGRlZmluaXRpb24sIGssIGlzQ2xhc3NEZXNjcmlwdG9yKTtcblxuXHRcdGlmIChkZWYgIT09IGZhbHNlKSB7XG5cdFx0XHQvL0lmIEV4dGVuZHMgaXMgdXNlZCwgd2Ugd2lsbCBjaGVjayBpdHMgcHJvdG90eXBlIHRvIHNlZSBpZiBcblx0XHRcdC8vdGhlIGZpbmFsIHZhcmlhYmxlIGV4aXN0cy5cblx0XHRcdFxuXHRcdFx0dmFyIHBhcmVudCA9IGV4dGVuZCB8fCBjdG9yO1xuXHRcdFx0aWYgKGhhc05vbkNvbmZpZ3VyYWJsZShwYXJlbnQucHJvdG90eXBlLCBrKSkge1xuXG5cdFx0XHRcdC8vanVzdCBza2lwIHRoZSBmaW5hbCBwcm9wZXJ0eVxuXHRcdFx0XHRpZiAoQ2xhc3MuaWdub3JlRmluYWxzKVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXG5cdFx0XHRcdC8vV2UgY2Fubm90IHJlLWRlZmluZSBhIHByb3BlcnR5IHRoYXQgaXMgY29uZmlndXJhYmxlPWZhbHNlLlxuXHRcdFx0XHQvL1NvIHdlIHdpbGwgY29uc2lkZXIgdGhlbSBmaW5hbCBhbmQgdGhyb3cgYW4gZXJyb3IuIFRoaXMgaXMgYnlcblx0XHRcdFx0Ly9kZWZhdWx0IHNvIGl0IGlzIGNsZWFyIHRvIHRoZSBkZXZlbG9wZXIgd2hhdCBpcyBoYXBwZW5pbmcuXG5cdFx0XHRcdC8vWW91IGNhbiBzZXQgaWdub3JlRmluYWxzIHRvIHRydWUgaWYgeW91IG5lZWQgdG8gZXh0ZW5kIGEgY2xhc3Ncblx0XHRcdFx0Ly93aGljaCBoYXMgY29uZmlndXJhYmxlPWZhbHNlOyBpdCB3aWxsIHNpbXBseSBub3QgcmUtZGVmaW5lIGZpbmFsIHByb3BlcnRpZXMuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImNhbm5vdCBvdmVycmlkZSBmaW5hbCBwcm9wZXJ0eSAnXCIra1xuXHRcdFx0XHRcdFx0XHQrXCInLCBzZXQgQ2xhc3MuaWdub3JlRmluYWxzID0gdHJ1ZSB0byBza2lwXCIpO1xuXHRcdFx0fVxuXG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoY3Rvci5wcm90b3R5cGUsIGssIGRlZik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN0b3IucHJvdG90eXBlW2tdID0gZGVmaW5pdGlvbltrXTtcblx0XHR9XG5cblx0fVxufVxuXG4vKipcbiAqL1xuZnVuY3Rpb24gbWl4aW4obXlDbGFzcywgbWl4aW5zKSB7XG5cdGlmICghbWl4aW5zKVxuXHRcdHJldHVybjtcblxuXHRpZiAoIUFycmF5LmlzQXJyYXkobWl4aW5zKSlcblx0XHRtaXhpbnMgPSBbbWl4aW5zXTtcblxuXHRmb3IgKHZhciBpPTA7IGk8bWl4aW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0ZXh0ZW5kKG15Q2xhc3MsIG1peGluc1tpXS5wcm90b3R5cGUgfHwgbWl4aW5zW2ldKTtcblx0fVxufVxuXG4vKipcbiAqIFxuICovXG5mdW5jdGlvbiBDbGFzcyhkZWZpbml0aW9uKSB7XG5cdGlmICghZGVmaW5pdGlvbilcblx0XHRkZWZpbml0aW9uID0ge307XG5cblx0Ly9UaGUgdmFyaWFibGUgbmFtZSBoZXJlIGRpY3RhdGVzIHdoYXQgd2Ugc2VlIGluIENocm9tZSBkZWJ1Z2dlclxuXHR2YXIgaW5pdGlhbGl6ZTtcblx0dmFyIEV4dGVuZHM7XG5cblx0aWYgKGRlZmluaXRpb24uaW5pdGlhbGl6ZSkge1xuXHRcdGlmICh0eXBlb2YgZGVmaW5pdGlvbi5pbml0aWFsaXplICE9PSBcImZ1bmN0aW9uXCIpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJpbml0aWFsaXplIG11c3QgYmUgYSBmdW5jdGlvblwiKTtcblx0XHRpbml0aWFsaXplID0gZGVmaW5pdGlvbi5pbml0aWFsaXplO1xuXG5cdFx0Ly9Vc3VhbGx5IHdlIHNob3VsZCBhdm9pZCBcImRlbGV0ZVwiIGluIFY4IGF0IGFsbCBjb3N0cy5cblx0XHQvL0hvd2V2ZXIsIGl0cyB1bmxpa2VseSB0byBtYWtlIGFueSBwZXJmb3JtYW5jZSBkaWZmZXJlbmNlXG5cdFx0Ly9oZXJlIHNpbmNlIHdlIG9ubHkgY2FsbCB0aGlzIG9uIGNsYXNzIGNyZWF0aW9uIChpLmUuIG5vdCBvYmplY3QgY3JlYXRpb24pLlxuXHRcdGRlbGV0ZSBkZWZpbml0aW9uLmluaXRpYWxpemU7XG5cdH0gZWxzZSB7XG5cdFx0aWYgKGRlZmluaXRpb24uRXh0ZW5kcykge1xuXHRcdFx0dmFyIGJhc2UgPSBkZWZpbml0aW9uLkV4dGVuZHM7XG5cdFx0XHRpbml0aWFsaXplID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRiYXNlLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0XHR9OyBcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5pdGlhbGl6ZSA9IGZ1bmN0aW9uICgpIHt9OyBcblx0XHR9XG5cdH1cblxuXHRpZiAoZGVmaW5pdGlvbi5FeHRlbmRzKSB7XG5cdFx0aW5pdGlhbGl6ZS5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKGRlZmluaXRpb24uRXh0ZW5kcy5wcm90b3R5cGUpO1xuXHRcdGluaXRpYWxpemUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gaW5pdGlhbGl6ZTtcblx0XHQvL2ZvciBnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IgdG8gd29yaywgd2UgbmVlZCB0byBhY3Rcblx0XHQvL2RpcmVjdGx5IG9uIHRoZSBFeHRlbmRzIChvciBNaXhpbilcblx0XHRFeHRlbmRzID0gZGVmaW5pdGlvbi5FeHRlbmRzO1xuXHRcdGRlbGV0ZSBkZWZpbml0aW9uLkV4dGVuZHM7XG5cdH0gZWxzZSB7XG5cdFx0aW5pdGlhbGl6ZS5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBpbml0aWFsaXplO1xuXHR9XG5cblx0Ly9HcmFiIHRoZSBtaXhpbnMsIGlmIHRoZXkgYXJlIHNwZWNpZmllZC4uLlxuXHR2YXIgbWl4aW5zID0gbnVsbDtcblx0aWYgKGRlZmluaXRpb24uTWl4aW5zKSB7XG5cdFx0bWl4aW5zID0gZGVmaW5pdGlvbi5NaXhpbnM7XG5cdFx0ZGVsZXRlIGRlZmluaXRpb24uTWl4aW5zO1xuXHR9XG5cblx0Ly9GaXJzdCwgbWl4aW4gaWYgd2UgY2FuLlxuXHRtaXhpbihpbml0aWFsaXplLCBtaXhpbnMpO1xuXG5cdC8vTm93IHdlIGdyYWIgdGhlIGFjdHVhbCBkZWZpbml0aW9uIHdoaWNoIGRlZmluZXMgdGhlIG92ZXJyaWRlcy5cblx0ZXh0ZW5kKGluaXRpYWxpemUsIGRlZmluaXRpb24sIHRydWUsIEV4dGVuZHMpO1xuXG5cdHJldHVybiBpbml0aWFsaXplO1xufTtcblxuQ2xhc3MuZXh0ZW5kID0gZXh0ZW5kO1xuQ2xhc3MubWl4aW4gPSBtaXhpbjtcbkNsYXNzLmlnbm9yZUZpbmFscyA9IGZhbHNlO1xuXG5tb2R1bGUuZXhwb3J0cyA9IENsYXNzOyIsInZhciBpbnQ4ID0gbmV3IEludDhBcnJheSg0KTtcbnZhciBpbnQzMiA9IG5ldyBJbnQzMkFycmF5KGludDguYnVmZmVyLCAwLCAxKTtcbnZhciBmbG9hdDMyID0gbmV3IEZsb2F0MzJBcnJheShpbnQ4LmJ1ZmZlciwgMCwgMSk7XG5cbi8qKlxuICogQSBzaW5nbGV0b24gZm9yIG51bWJlciB1dGlsaXRpZXMuIFxuICogQGNsYXNzIE51bWJlclV0aWxcbiAqL1xudmFyIE51bWJlclV0aWwgPSBmdW5jdGlvbigpIHtcblxufTtcblxuXG4vKipcbiAqIFJldHVybnMgYSBmbG9hdCByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gaW50IGJpdHMuIEFycmF5QnVmZmVyXG4gKiBpcyB1c2VkIGZvciB0aGUgY29udmVyc2lvbi5cbiAqXG4gKiBAbWV0aG9kICBpbnRCaXRzVG9GbG9hdFxuICogQHN0YXRpY1xuICogQHBhcmFtICB7TnVtYmVyfSBpIHRoZSBpbnQgdG8gY2FzdFxuICogQHJldHVybiB7TnVtYmVyfSAgIHRoZSBmbG9hdFxuICovXG5OdW1iZXJVdGlsLmludEJpdHNUb0Zsb2F0ID0gZnVuY3Rpb24oaSkge1xuXHRpbnQzMlswXSA9IGk7XG5cdHJldHVybiBmbG9hdDMyWzBdO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBpbnQgYml0cyBmcm9tIHRoZSBnaXZlbiBmbG9hdC4gQXJyYXlCdWZmZXIgaXMgdXNlZFxuICogZm9yIHRoZSBjb252ZXJzaW9uLlxuICpcbiAqIEBtZXRob2QgIGZsb2F0VG9JbnRCaXRzXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0gIHtOdW1iZXJ9IGYgdGhlIGZsb2F0IHRvIGNhc3RcbiAqIEByZXR1cm4ge051bWJlcn0gICB0aGUgaW50IGJpdHNcbiAqL1xuTnVtYmVyVXRpbC5mbG9hdFRvSW50Qml0cyA9IGZ1bmN0aW9uKGYpIHtcblx0ZmxvYXQzMlswXSA9IGY7XG5cdHJldHVybiBpbnQzMlswXTtcbn07XG5cbi8qKlxuICogRW5jb2RlcyBBQkdSIGludCBhcyBhIGZsb2F0LCB3aXRoIHNsaWdodCBwcmVjaXNpb24gbG9zcy5cbiAqXG4gKiBAbWV0aG9kICBpbnRUb0Zsb2F0Q29sb3JcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZSBhbiBBQkdSIHBhY2tlZCBpbnRlZ2VyXG4gKi9cbk51bWJlclV0aWwuaW50VG9GbG9hdENvbG9yID0gZnVuY3Rpb24odmFsdWUpIHtcblx0cmV0dXJuIE51bWJlclV0aWwuaW50Qml0c1RvRmxvYXQoIHZhbHVlICYgMHhmZWZmZmZmZiApO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgZmxvYXQgZW5jb2RlZCBBQkdSIHZhbHVlIGZyb20gdGhlIGdpdmVuIFJHQkFcbiAqIGJ5dGVzICgwIC0gMjU1KS4gVXNlZnVsIGZvciBzYXZpbmcgYmFuZHdpZHRoIGluIHZlcnRleCBkYXRhLlxuICpcbiAqIEBtZXRob2QgIGNvbG9yVG9GbG9hdFxuICogQHN0YXRpY1xuICogQHBhcmFtIHtOdW1iZXJ9IHIgdGhlIFJlZCBieXRlICgwIC0gMjU1KVxuICogQHBhcmFtIHtOdW1iZXJ9IGcgdGhlIEdyZWVuIGJ5dGUgKDAgLSAyNTUpXG4gKiBAcGFyYW0ge051bWJlcn0gYiB0aGUgQmx1ZSBieXRlICgwIC0gMjU1KVxuICogQHBhcmFtIHtOdW1iZXJ9IGEgdGhlIEFscGhhIGJ5dGUgKDAgLSAyNTUpXG4gKiBAcmV0dXJuIHtGbG9hdDMyfSAgYSBGbG9hdDMyIG9mIHRoZSBSR0JBIGNvbG9yXG4gKi9cbk51bWJlclV0aWwuY29sb3JUb0Zsb2F0ID0gZnVuY3Rpb24ociwgZywgYiwgYSkge1xuXHR2YXIgYml0cyA9IChhIDw8IDI0IHwgYiA8PCAxNiB8IGcgPDwgOCB8IHIpO1xuXHRyZXR1cm4gTnVtYmVyVXRpbC5pbnRUb0Zsb2F0Q29sb3IoYml0cyk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgbnVtYmVyIGlzIGEgcG93ZXItb2YtdHdvLlxuICpcbiAqIEBtZXRob2QgIGlzUG93ZXJPZlR3b1xuICogQHBhcmFtICB7TnVtYmVyfSAgbiB0aGUgbnVtYmVyIHRvIHRlc3RcbiAqIEByZXR1cm4ge0Jvb2xlYW59ICAgdHJ1ZSBpZiBwb3dlci1vZi10d29cbiAqL1xuTnVtYmVyVXRpbC5pc1Bvd2VyT2ZUd28gPSBmdW5jdGlvbihuKSB7XG5cdHJldHVybiAobiAmIChuIC0gMSkpID09IDA7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG5leHQgaGlnaGVzdCBwb3dlci1vZi10d28gZnJvbSB0aGUgc3BlY2lmaWVkIG51bWJlci4gXG4gKiBcbiAqIEBwYXJhbSAge051bWJlcn0gbiB0aGUgbnVtYmVyIHRvIHRlc3RcbiAqIEByZXR1cm4ge051bWJlcn0gICB0aGUgbmV4dCBoaWdoZXN0IHBvd2VyIG9mIHR3b1xuICovXG5OdW1iZXJVdGlsLm5leHRQb3dlck9mVHdvID0gZnVuY3Rpb24obikge1xuXHRuLS07XG5cdG4gfD0gbiA+PiAxO1xuXHRuIHw9IG4gPj4gMjtcblx0biB8PSBuID4+IDQ7XG5cdG4gfD0gbiA+PiA4O1xuXHRuIHw9IG4gPj4gMTY7XG5cdHJldHVybiBuKzE7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE51bWJlclV0aWw7IiwiLypqc2xpbnQgb25ldmFyOnRydWUsIHVuZGVmOnRydWUsIG5ld2NhcDp0cnVlLCByZWdleHA6dHJ1ZSwgYml0d2lzZTp0cnVlLCBtYXhlcnI6NTAsIGluZGVudDo0LCB3aGl0ZTpmYWxzZSwgbm9tZW46ZmFsc2UsIHBsdXNwbHVzOmZhbHNlICovXG4vKmdsb2JhbCBkZWZpbmU6ZmFsc2UsIHJlcXVpcmU6ZmFsc2UsIGV4cG9ydHM6ZmFsc2UsIG1vZHVsZTpmYWxzZSwgc2lnbmFsczpmYWxzZSAqL1xuXG4vKiogQGxpY2Vuc2VcbiAqIEpTIFNpZ25hbHMgPGh0dHA6Ly9taWxsZXJtZWRlaXJvcy5naXRodWIuY29tL2pzLXNpZ25hbHMvPlxuICogUmVsZWFzZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlXG4gKiBBdXRob3I6IE1pbGxlciBNZWRlaXJvc1xuICogVmVyc2lvbjogMS4wLjAgLSBCdWlsZDogMjY4ICgyMDEyLzExLzI5IDA1OjQ4IFBNKVxuICovXG5cbihmdW5jdGlvbihnbG9iYWwpe1xuXG4gICAgLy8gU2lnbmFsQmluZGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvKipcbiAgICAgKiBPYmplY3QgdGhhdCByZXByZXNlbnRzIGEgYmluZGluZyBiZXR3ZWVuIGEgU2lnbmFsIGFuZCBhIGxpc3RlbmVyIGZ1bmN0aW9uLlxuICAgICAqIDxiciAvPi0gPHN0cm9uZz5UaGlzIGlzIGFuIGludGVybmFsIGNvbnN0cnVjdG9yIGFuZCBzaG91bGRuJ3QgYmUgY2FsbGVkIGJ5IHJlZ3VsYXIgdXNlcnMuPC9zdHJvbmc+XG4gICAgICogPGJyIC8+LSBpbnNwaXJlZCBieSBKb2EgRWJlcnQgQVMzIFNpZ25hbEJpbmRpbmcgYW5kIFJvYmVydCBQZW5uZXIncyBTbG90IGNsYXNzZXMuXG4gICAgICogQGF1dGhvciBNaWxsZXIgTWVkZWlyb3NcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAaW50ZXJuYWxcbiAgICAgKiBAbmFtZSBTaWduYWxCaW5kaW5nXG4gICAgICogQHBhcmFtIHtTaWduYWx9IHNpZ25hbCBSZWZlcmVuY2UgdG8gU2lnbmFsIG9iamVjdCB0aGF0IGxpc3RlbmVyIGlzIGN1cnJlbnRseSBib3VuZCB0by5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpc09uY2UgSWYgYmluZGluZyBzaG91bGQgYmUgZXhlY3V0ZWQganVzdCBvbmNlLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XSBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldIFRoZSBwcmlvcml0eSBsZXZlbCBvZiB0aGUgZXZlbnQgbGlzdGVuZXIuIChkZWZhdWx0ID0gMCkuXG4gICAgICovXG4gICAgZnVuY3Rpb24gU2lnbmFsQmluZGluZyhzaWduYWwsIGxpc3RlbmVyLCBpc09uY2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcblxuICAgICAgICAvKipcbiAgICAgICAgICogSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsLlxuICAgICAgICAgKiBAdHlwZSBGdW5jdGlvblxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fbGlzdGVuZXIgPSBsaXN0ZW5lcjtcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgYmluZGluZyBzaG91bGQgYmUgZXhlY3V0ZWQganVzdCBvbmNlLlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9pc09uY2UgPSBpc09uY2U7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICAgICAqIEBtZW1iZXJPZiBTaWduYWxCaW5kaW5nLnByb3RvdHlwZVxuICAgICAgICAgKiBAbmFtZSBjb250ZXh0XG4gICAgICAgICAqIEB0eXBlIE9iamVjdHx1bmRlZmluZWR8bnVsbFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jb250ZXh0ID0gbGlzdGVuZXJDb250ZXh0O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZWZlcmVuY2UgdG8gU2lnbmFsIG9iamVjdCB0aGF0IGxpc3RlbmVyIGlzIGN1cnJlbnRseSBib3VuZCB0by5cbiAgICAgICAgICogQHR5cGUgU2lnbmFsXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9zaWduYWwgPSBzaWduYWw7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIExpc3RlbmVyIHByaW9yaXR5XG4gICAgICAgICAqIEB0eXBlIE51bWJlclxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fcHJpb3JpdHkgPSBwcmlvcml0eSB8fCAwO1xuICAgIH1cblxuICAgIFNpZ25hbEJpbmRpbmcucHJvdG90eXBlID0ge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBiaW5kaW5nIGlzIGFjdGl2ZSBhbmQgc2hvdWxkIGJlIGV4ZWN1dGVkLlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICBhY3RpdmUgOiB0cnVlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEZWZhdWx0IHBhcmFtZXRlcnMgcGFzc2VkIHRvIGxpc3RlbmVyIGR1cmluZyBgU2lnbmFsLmRpc3BhdGNoYCBhbmQgYFNpZ25hbEJpbmRpbmcuZXhlY3V0ZWAuIChjdXJyaWVkIHBhcmFtZXRlcnMpXG4gICAgICAgICAqIEB0eXBlIEFycmF5fG51bGxcbiAgICAgICAgICovXG4gICAgICAgIHBhcmFtcyA6IG51bGwsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENhbGwgbGlzdGVuZXIgcGFzc2luZyBhcmJpdHJhcnkgcGFyYW1ldGVycy5cbiAgICAgICAgICogPHA+SWYgYmluZGluZyB3YXMgYWRkZWQgdXNpbmcgYFNpZ25hbC5hZGRPbmNlKClgIGl0IHdpbGwgYmUgYXV0b21hdGljYWxseSByZW1vdmVkIGZyb20gc2lnbmFsIGRpc3BhdGNoIHF1ZXVlLCB0aGlzIG1ldGhvZCBpcyB1c2VkIGludGVybmFsbHkgZm9yIHRoZSBzaWduYWwgZGlzcGF0Y2guPC9wPlxuICAgICAgICAgKiBAcGFyYW0ge0FycmF5fSBbcGFyYW1zQXJyXSBBcnJheSBvZiBwYXJhbWV0ZXJzIHRoYXQgc2hvdWxkIGJlIHBhc3NlZCB0byB0aGUgbGlzdGVuZXJcbiAgICAgICAgICogQHJldHVybiB7Kn0gVmFsdWUgcmV0dXJuZWQgYnkgdGhlIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgZXhlY3V0ZSA6IGZ1bmN0aW9uIChwYXJhbXNBcnIpIHtcbiAgICAgICAgICAgIHZhciBoYW5kbGVyUmV0dXJuLCBwYXJhbXM7XG4gICAgICAgICAgICBpZiAodGhpcy5hY3RpdmUgJiYgISF0aGlzLl9saXN0ZW5lcikge1xuICAgICAgICAgICAgICAgIHBhcmFtcyA9IHRoaXMucGFyYW1zPyB0aGlzLnBhcmFtcy5jb25jYXQocGFyYW1zQXJyKSA6IHBhcmFtc0FycjtcbiAgICAgICAgICAgICAgICBoYW5kbGVyUmV0dXJuID0gdGhpcy5fbGlzdGVuZXIuYXBwbHkodGhpcy5jb250ZXh0LCBwYXJhbXMpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9pc09uY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlclJldHVybjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGV0YWNoIGJpbmRpbmcgZnJvbSBzaWduYWwuXG4gICAgICAgICAqIC0gYWxpYXMgdG86IG15U2lnbmFsLnJlbW92ZShteUJpbmRpbmcuZ2V0TGlzdGVuZXIoKSk7XG4gICAgICAgICAqIEByZXR1cm4ge0Z1bmN0aW9ufG51bGx9IEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbCBvciBgbnVsbGAgaWYgYmluZGluZyB3YXMgcHJldmlvdXNseSBkZXRhY2hlZC5cbiAgICAgICAgICovXG4gICAgICAgIGRldGFjaCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlzQm91bmQoKT8gdGhpcy5fc2lnbmFsLnJlbW92ZSh0aGlzLl9saXN0ZW5lciwgdGhpcy5jb250ZXh0KSA6IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IGB0cnVlYCBpZiBiaW5kaW5nIGlzIHN0aWxsIGJvdW5kIHRvIHRoZSBzaWduYWwgYW5kIGhhdmUgYSBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGlzQm91bmQgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gKCEhdGhpcy5fc2lnbmFsICYmICEhdGhpcy5fbGlzdGVuZXIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtib29sZWFufSBJZiBTaWduYWxCaW5kaW5nIHdpbGwgb25seSBiZSBleGVjdXRlZCBvbmNlLlxuICAgICAgICAgKi9cbiAgICAgICAgaXNPbmNlIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2lzT25jZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7RnVuY3Rpb259IEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIGdldExpc3RlbmVyIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2xpc3RlbmVyO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWx9IFNpZ25hbCB0aGF0IGxpc3RlbmVyIGlzIGN1cnJlbnRseSBib3VuZCB0by5cbiAgICAgICAgICovXG4gICAgICAgIGdldFNpZ25hbCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zaWduYWw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERlbGV0ZSBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfZGVzdHJveSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9zaWduYWw7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fbGlzdGVuZXI7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5jb250ZXh0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgb2JqZWN0LlxuICAgICAgICAgKi9cbiAgICAgICAgdG9TdHJpbmcgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ1tTaWduYWxCaW5kaW5nIGlzT25jZTonICsgdGhpcy5faXNPbmNlICsnLCBpc0JvdW5kOicrIHRoaXMuaXNCb3VuZCgpICsnLCBhY3RpdmU6JyArIHRoaXMuYWN0aXZlICsgJ10nO1xuICAgICAgICB9XG5cbiAgICB9O1xuXG5cbi8qZ2xvYmFsIFNpZ25hbEJpbmRpbmc6ZmFsc2UqL1xuXG4gICAgLy8gU2lnbmFsIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBmdW5jdGlvbiB2YWxpZGF0ZUxpc3RlbmVyKGxpc3RlbmVyLCBmbk5hbWUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnbGlzdGVuZXIgaXMgYSByZXF1aXJlZCBwYXJhbSBvZiB7Zm59KCkgYW5kIHNob3VsZCBiZSBhIEZ1bmN0aW9uLicucmVwbGFjZSgne2ZufScsIGZuTmFtZSkgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEN1c3RvbSBldmVudCBicm9hZGNhc3RlclxuICAgICAqIDxiciAvPi0gaW5zcGlyZWQgYnkgUm9iZXJ0IFBlbm5lcidzIEFTMyBTaWduYWxzLlxuICAgICAqIEBuYW1lIFNpZ25hbFxuICAgICAqIEBhdXRob3IgTWlsbGVyIE1lZGVpcm9zXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgZnVuY3Rpb24gU2lnbmFsKCkge1xuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUgQXJyYXkuPFNpZ25hbEJpbmRpbmc+XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9iaW5kaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9wcmV2UGFyYW1zID0gbnVsbDtcblxuICAgICAgICAvLyBlbmZvcmNlIGRpc3BhdGNoIHRvIGF3YXlzIHdvcmsgb24gc2FtZSBjb250ZXh0ICgjNDcpXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5kaXNwYXRjaCA9IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBTaWduYWwucHJvdG90eXBlLmRpc3BhdGNoLmFwcGx5KHNlbGYsIGFyZ3VtZW50cyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgU2lnbmFsLnByb3RvdHlwZSA9IHtcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2lnbmFscyBWZXJzaW9uIE51bWJlclxuICAgICAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgICAgICogQGNvbnN0XG4gICAgICAgICAqL1xuICAgICAgICBWRVJTSU9OIDogJzEuMC4wJyxcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgU2lnbmFsIHNob3VsZCBrZWVwIHJlY29yZCBvZiBwcmV2aW91c2x5IGRpc3BhdGNoZWQgcGFyYW1ldGVycyBhbmRcbiAgICAgICAgICogYXV0b21hdGljYWxseSBleGVjdXRlIGxpc3RlbmVyIGR1cmluZyBgYWRkKClgL2BhZGRPbmNlKClgIGlmIFNpZ25hbCB3YXNcbiAgICAgICAgICogYWxyZWFkeSBkaXNwYXRjaGVkIGJlZm9yZS5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKi9cbiAgICAgICAgbWVtb3JpemUgOiBmYWxzZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX3Nob3VsZFByb3BhZ2F0ZSA6IHRydWUsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIFNpZ25hbCBpcyBhY3RpdmUgYW5kIHNob3VsZCBicm9hZGNhc3QgZXZlbnRzLlxuICAgICAgICAgKiA8cD48c3Ryb25nPklNUE9SVEFOVDo8L3N0cm9uZz4gU2V0dGluZyB0aGlzIHByb3BlcnR5IGR1cmluZyBhIGRpc3BhdGNoIHdpbGwgb25seSBhZmZlY3QgdGhlIG5leHQgZGlzcGF0Y2gsIGlmIHlvdSB3YW50IHRvIHN0b3AgdGhlIHByb3BhZ2F0aW9uIG9mIGEgc2lnbmFsIHVzZSBgaGFsdCgpYCBpbnN0ZWFkLjwvcD5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKi9cbiAgICAgICAgYWN0aXZlIDogdHJ1ZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXJcbiAgICAgICAgICogQHBhcmFtIHtib29sZWFufSBpc09uY2VcbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdXG4gICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbEJpbmRpbmd9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfcmVnaXN0ZXJMaXN0ZW5lciA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgaXNPbmNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KSB7XG5cbiAgICAgICAgICAgIHZhciBwcmV2SW5kZXggPSB0aGlzLl9pbmRleE9mTGlzdGVuZXIobGlzdGVuZXIsIGxpc3RlbmVyQ29udGV4dCksXG4gICAgICAgICAgICAgICAgYmluZGluZztcblxuICAgICAgICAgICAgaWYgKHByZXZJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBiaW5kaW5nID0gdGhpcy5fYmluZGluZ3NbcHJldkluZGV4XTtcbiAgICAgICAgICAgICAgICBpZiAoYmluZGluZy5pc09uY2UoKSAhPT0gaXNPbmNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignWW91IGNhbm5vdCBhZGQnKyAoaXNPbmNlPyAnJyA6ICdPbmNlJykgKycoKSB0aGVuIGFkZCcrICghaXNPbmNlPyAnJyA6ICdPbmNlJykgKycoKSB0aGUgc2FtZSBsaXN0ZW5lciB3aXRob3V0IHJlbW92aW5nIHRoZSByZWxhdGlvbnNoaXAgZmlyc3QuJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBiaW5kaW5nID0gbmV3IFNpZ25hbEJpbmRpbmcodGhpcywgbGlzdGVuZXIsIGlzT25jZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRkQmluZGluZyhiaW5kaW5nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYodGhpcy5tZW1vcml6ZSAmJiB0aGlzLl9wcmV2UGFyYW1zKXtcbiAgICAgICAgICAgICAgICBiaW5kaW5nLmV4ZWN1dGUodGhpcy5fcHJldlBhcmFtcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBiaW5kaW5nO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge1NpZ25hbEJpbmRpbmd9IGJpbmRpbmdcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9hZGRCaW5kaW5nIDogZnVuY3Rpb24gKGJpbmRpbmcpIHtcbiAgICAgICAgICAgIC8vc2ltcGxpZmllZCBpbnNlcnRpb24gc29ydFxuICAgICAgICAgICAgdmFyIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGg7XG4gICAgICAgICAgICBkbyB7IC0tbjsgfSB3aGlsZSAodGhpcy5fYmluZGluZ3Nbbl0gJiYgYmluZGluZy5fcHJpb3JpdHkgPD0gdGhpcy5fYmluZGluZ3Nbbl0uX3ByaW9yaXR5KTtcbiAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzLnNwbGljZShuICsgMSwgMCwgYmluZGluZyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyXG4gICAgICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9pbmRleE9mTGlzdGVuZXIgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGN1cjtcbiAgICAgICAgICAgIHdoaWxlIChuLS0pIHtcbiAgICAgICAgICAgICAgICBjdXIgPSB0aGlzLl9iaW5kaW5nc1tuXTtcbiAgICAgICAgICAgICAgICBpZiAoY3VyLl9saXN0ZW5lciA9PT0gbGlzdGVuZXIgJiYgY3VyLmNvbnRleHQgPT09IGNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDaGVjayBpZiBsaXN0ZW5lciB3YXMgYXR0YWNoZWQgdG8gU2lnbmFsLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lclxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2NvbnRleHRdXG4gICAgICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IGlmIFNpZ25hbCBoYXMgdGhlIHNwZWNpZmllZCBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGhhcyA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgY29udGV4dCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2luZGV4T2ZMaXN0ZW5lcihsaXN0ZW5lciwgY29udGV4dCkgIT09IC0xO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBBZGQgYSBsaXN0ZW5lciB0byB0aGUgc2lnbmFsLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBTaWduYWwgaGFuZGxlciBmdW5jdGlvbi5cbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldIFRoZSBwcmlvcml0eSBsZXZlbCBvZiB0aGUgZXZlbnQgbGlzdGVuZXIuIExpc3RlbmVycyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIGV4ZWN1dGVkIGJlZm9yZSBsaXN0ZW5lcnMgd2l0aCBsb3dlciBwcmlvcml0eS4gTGlzdGVuZXJzIHdpdGggc2FtZSBwcmlvcml0eSBsZXZlbCB3aWxsIGJlIGV4ZWN1dGVkIGF0IHRoZSBzYW1lIG9yZGVyIGFzIHRoZXkgd2VyZSBhZGRlZC4gKGRlZmF1bHQgPSAwKVxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWxCaW5kaW5nfSBBbiBPYmplY3QgcmVwcmVzZW50aW5nIHRoZSBiaW5kaW5nIGJldHdlZW4gdGhlIFNpZ25hbCBhbmQgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBhZGQgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsICdhZGQnKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9yZWdpc3Rlckxpc3RlbmVyKGxpc3RlbmVyLCBmYWxzZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEFkZCBsaXN0ZW5lciB0byB0aGUgc2lnbmFsIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgZmlyc3QgZXhlY3V0aW9uICh3aWxsIGJlIGV4ZWN1dGVkIG9ubHkgb25jZSkuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIFNpZ25hbCBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF0gQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV0gVGhlIHByaW9yaXR5IGxldmVsIG9mIHRoZSBldmVudCBsaXN0ZW5lci4gTGlzdGVuZXJzIHdpdGggaGlnaGVyIHByaW9yaXR5IHdpbGwgYmUgZXhlY3V0ZWQgYmVmb3JlIGxpc3RlbmVycyB3aXRoIGxvd2VyIHByaW9yaXR5LiBMaXN0ZW5lcnMgd2l0aCBzYW1lIHByaW9yaXR5IGxldmVsIHdpbGwgYmUgZXhlY3V0ZWQgYXQgdGhlIHNhbWUgb3JkZXIgYXMgdGhleSB3ZXJlIGFkZGVkLiAoZGVmYXVsdCA9IDApXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbEJpbmRpbmd9IEFuIE9iamVjdCByZXByZXNlbnRpbmcgdGhlIGJpbmRpbmcgYmV0d2VlbiB0aGUgU2lnbmFsIGFuZCBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGFkZE9uY2UgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsICdhZGRPbmNlJyk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcihsaXN0ZW5lciwgdHJ1ZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlbW92ZSBhIHNpbmdsZSBsaXN0ZW5lciBmcm9tIHRoZSBkaXNwYXRjaCBxdWV1ZS5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgSGFuZGxlciBmdW5jdGlvbiB0aGF0IHNob3VsZCBiZSByZW1vdmVkLlxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2NvbnRleHRdIEV4ZWN1dGlvbiBjb250ZXh0IChzaW5jZSB5b3UgY2FuIGFkZCB0aGUgc2FtZSBoYW5kbGVyIG11bHRpcGxlIHRpbWVzIGlmIGV4ZWN1dGluZyBpbiBhIGRpZmZlcmVudCBjb250ZXh0KS5cbiAgICAgICAgICogQHJldHVybiB7RnVuY3Rpb259IExpc3RlbmVyIGhhbmRsZXIgZnVuY3Rpb24uXG4gICAgICAgICAqL1xuICAgICAgICByZW1vdmUgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsICdyZW1vdmUnKTtcblxuICAgICAgICAgICAgdmFyIGkgPSB0aGlzLl9pbmRleE9mTGlzdGVuZXIobGlzdGVuZXIsIGNvbnRleHQpO1xuICAgICAgICAgICAgaWYgKGkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYmluZGluZ3NbaV0uX2Rlc3Ryb3koKTsgLy9ubyByZWFzb24gdG8gYSBTaWduYWxCaW5kaW5nIGV4aXN0IGlmIGl0IGlzbid0IGF0dGFjaGVkIHRvIGEgc2lnbmFsXG4gICAgICAgICAgICAgICAgdGhpcy5fYmluZGluZ3Muc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGxpc3RlbmVyO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZW1vdmUgYWxsIGxpc3RlbmVycyBmcm9tIHRoZSBTaWduYWwuXG4gICAgICAgICAqL1xuICAgICAgICByZW1vdmVBbGwgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aDtcbiAgICAgICAgICAgIHdoaWxlIChuLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kaW5nc1tuXS5fZGVzdHJveSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fYmluZGluZ3MubGVuZ3RoID0gMDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7bnVtYmVyfSBOdW1iZXIgb2YgbGlzdGVuZXJzIGF0dGFjaGVkIHRvIHRoZSBTaWduYWwuXG4gICAgICAgICAqL1xuICAgICAgICBnZXROdW1MaXN0ZW5lcnMgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fYmluZGluZ3MubGVuZ3RoO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTdG9wIHByb3BhZ2F0aW9uIG9mIHRoZSBldmVudCwgYmxvY2tpbmcgdGhlIGRpc3BhdGNoIHRvIG5leHQgbGlzdGVuZXJzIG9uIHRoZSBxdWV1ZS5cbiAgICAgICAgICogPHA+PHN0cm9uZz5JTVBPUlRBTlQ6PC9zdHJvbmc+IHNob3VsZCBiZSBjYWxsZWQgb25seSBkdXJpbmcgc2lnbmFsIGRpc3BhdGNoLCBjYWxsaW5nIGl0IGJlZm9yZS9hZnRlciBkaXNwYXRjaCB3b24ndCBhZmZlY3Qgc2lnbmFsIGJyb2FkY2FzdC48L3A+XG4gICAgICAgICAqIEBzZWUgU2lnbmFsLnByb3RvdHlwZS5kaXNhYmxlXG4gICAgICAgICAqL1xuICAgICAgICBoYWx0IDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5fc2hvdWxkUHJvcGFnYXRlID0gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERpc3BhdGNoL0Jyb2FkY2FzdCBTaWduYWwgdG8gYWxsIGxpc3RlbmVycyBhZGRlZCB0byB0aGUgcXVldWUuXG4gICAgICAgICAqIEBwYXJhbSB7Li4uKn0gW3BhcmFtc10gUGFyYW1ldGVycyB0aGF0IHNob3VsZCBiZSBwYXNzZWQgdG8gZWFjaCBoYW5kbGVyLlxuICAgICAgICAgKi9cbiAgICAgICAgZGlzcGF0Y2ggOiBmdW5jdGlvbiAocGFyYW1zKSB7XG4gICAgICAgICAgICBpZiAoISB0aGlzLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHBhcmFtc0FyciA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyksXG4gICAgICAgICAgICAgICAgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBiaW5kaW5ncztcblxuICAgICAgICAgICAgaWYgKHRoaXMubWVtb3JpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wcmV2UGFyYW1zID0gcGFyYW1zQXJyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoISBuKSB7XG4gICAgICAgICAgICAgICAgLy9zaG91bGQgY29tZSBhZnRlciBtZW1vcml6ZVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYmluZGluZ3MgPSB0aGlzLl9iaW5kaW5ncy5zbGljZSgpOyAvL2Nsb25lIGFycmF5IGluIGNhc2UgYWRkL3JlbW92ZSBpdGVtcyBkdXJpbmcgZGlzcGF0Y2hcbiAgICAgICAgICAgIHRoaXMuX3Nob3VsZFByb3BhZ2F0ZSA9IHRydWU7IC8vaW4gY2FzZSBgaGFsdGAgd2FzIGNhbGxlZCBiZWZvcmUgZGlzcGF0Y2ggb3IgZHVyaW5nIHRoZSBwcmV2aW91cyBkaXNwYXRjaC5cblxuICAgICAgICAgICAgLy9leGVjdXRlIGFsbCBjYWxsYmFja3MgdW50aWwgZW5kIG9mIHRoZSBsaXN0IG9yIHVudGlsIGEgY2FsbGJhY2sgcmV0dXJucyBgZmFsc2VgIG9yIHN0b3BzIHByb3BhZ2F0aW9uXG4gICAgICAgICAgICAvL3JldmVyc2UgbG9vcCBzaW5jZSBsaXN0ZW5lcnMgd2l0aCBoaWdoZXIgcHJpb3JpdHkgd2lsbCBiZSBhZGRlZCBhdCB0aGUgZW5kIG9mIHRoZSBsaXN0XG4gICAgICAgICAgICBkbyB7IG4tLTsgfSB3aGlsZSAoYmluZGluZ3Nbbl0gJiYgdGhpcy5fc2hvdWxkUHJvcGFnYXRlICYmIGJpbmRpbmdzW25dLmV4ZWN1dGUocGFyYW1zQXJyKSAhPT0gZmFsc2UpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBGb3JnZXQgbWVtb3JpemVkIGFyZ3VtZW50cy5cbiAgICAgICAgICogQHNlZSBTaWduYWwubWVtb3JpemVcbiAgICAgICAgICovXG4gICAgICAgIGZvcmdldCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLl9wcmV2UGFyYW1zID0gbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlIGFsbCBiaW5kaW5ncyBmcm9tIHNpZ25hbCBhbmQgZGVzdHJveSBhbnkgcmVmZXJlbmNlIHRvIGV4dGVybmFsIG9iamVjdHMgKGRlc3Ryb3kgU2lnbmFsIG9iamVjdCkuXG4gICAgICAgICAqIDxwPjxzdHJvbmc+SU1QT1JUQU5UOjwvc3Ryb25nPiBjYWxsaW5nIGFueSBtZXRob2Qgb24gdGhlIHNpZ25hbCBpbnN0YW5jZSBhZnRlciBjYWxsaW5nIGRpc3Bvc2Ugd2lsbCB0aHJvdyBlcnJvcnMuPC9wPlxuICAgICAgICAgKi9cbiAgICAgICAgZGlzcG9zZSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlQWxsKCk7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fYmluZGluZ3M7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fcHJldlBhcmFtcztcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfSBTdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG9iamVjdC5cbiAgICAgICAgICovXG4gICAgICAgIHRvU3RyaW5nIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdbU2lnbmFsIGFjdGl2ZTonKyB0aGlzLmFjdGl2ZSArJyBudW1MaXN0ZW5lcnM6JysgdGhpcy5nZXROdW1MaXN0ZW5lcnMoKSArJ10nO1xuICAgICAgICB9XG5cbiAgICB9O1xuXG5cbiAgICAvLyBOYW1lc3BhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8qKlxuICAgICAqIFNpZ25hbHMgbmFtZXNwYWNlXG4gICAgICogQG5hbWVzcGFjZVxuICAgICAqIEBuYW1lIHNpZ25hbHNcbiAgICAgKi9cbiAgICB2YXIgc2lnbmFscyA9IFNpZ25hbDtcblxuICAgIC8qKlxuICAgICAqIEN1c3RvbSBldmVudCBicm9hZGNhc3RlclxuICAgICAqIEBzZWUgU2lnbmFsXG4gICAgICovXG4gICAgLy8gYWxpYXMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IChzZWUgI2doLTQ0KVxuICAgIHNpZ25hbHMuU2lnbmFsID0gU2lnbmFsO1xuXG5cblxuICAgIC8vZXhwb3J0cyB0byBtdWx0aXBsZSBlbnZpcm9ubWVudHNcbiAgICBpZih0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpeyAvL0FNRFxuICAgICAgICBkZWZpbmUoZnVuY3Rpb24gKCkgeyByZXR1cm4gc2lnbmFsczsgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cyl7IC8vbm9kZVxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IHNpZ25hbHM7XG4gICAgfSBlbHNlIHsgLy9icm93c2VyXG4gICAgICAgIC8vdXNlIHN0cmluZyBiZWNhdXNlIG9mIEdvb2dsZSBjbG9zdXJlIGNvbXBpbGVyIEFEVkFOQ0VEX01PREVcbiAgICAgICAgLypqc2xpbnQgc3ViOnRydWUgKi9cbiAgICAgICAgZ2xvYmFsWydzaWduYWxzJ10gPSBzaWduYWxzO1xuICAgIH1cblxufSh0aGlzKSk7XG4iXX0=
;