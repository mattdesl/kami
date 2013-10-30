;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var WebGLContext = require('kami').WebGLContext;
var ShaderProgram = require('kami').ShaderProgram;
var Texture = require('kami').Texture;
var VertexData = require('kami').VertexData;

$(function() {
	var mainContainer = $("body").css({
		background: "#000"
	});

	var demoContainers = [];
	var currentDemo = null;
	var currentIndex = 0;


	var width = 800;
	var height = 600;

	var canvas = $("<canvas>", {
		width: width,
		height: height
	}).css({
		background: "#343434",  
		position: "fixed",
		top: 0,
		left: 0,
		overflow: "hidden"
	});

	canvas.appendTo(mainContainer);

	//create our webGL context..
	//this will manage viewport and context loss/restore
	var context = new WebGLContext(800, 600, canvas[0]);
	
	//create a basic shader..
	//this will be added to the context and re-compiled on context restore
	var shader = new ShaderProgram(context, $("#vert_shader").html(), $("#frag_shader").html());

	console.log(shader.getUniformLocation("u_projView"));
	console.log(shader.getAttributeLocation("Position"));
	//create a texture from Image
	// var tex = new Texture(context.gl);

	var pixels = new Uint16Array([255, 255, 0, 255]);

	//create texture from Image (async load)
	// var tex = new Texture(context, "img/bunny.png");

	// var tex = new Texture(context, "img/bunny.png", onload);

	var vertices = new Float32Array([
		-1, -1,
		0, -1,
		0, 0,
		-1, 0
	]);
	
	var indices = new Uint16Array([
		0, 1, 2,
		0, 2, 3
	]);

	// context.gl.disable(context.gl.CULL_FACE)

	//static = true
	//numVerts = 4
	//numIndices = 6
	//attribs = just position right now...
	var vbo = new VertexData(context, true, 4, 6, [
		new VertexData.Attrib("Position", 2) //this should match our shader
	]);

	//these are initialized already, or we can override them like so:
	vbo.indices = indices;
	vbo.vertices = vertices;
	vbo.dirty = true;

	requestAnimationFrame(render);

	// var loseCtx = context.gl.getExtension("WEBGL_lose_context");

	// setTimeout(function() {
	// 	loseCtx.loseContext();	
		
	// }.bind(this), 1000);

	// setTimeout(function() {
	// 	loseCtx.restoreContext();
	// }.bind(this), 3200);

	function render() {
		requestAnimationFrame(render);

		if (!context.valid) {
			return;
		} 

		var gl = context.gl;

		vbo.dirty = true;
		shader.bind();

		vbo.bind(shader);
		vbo.draw(gl.TRIANGLES, 6, 0);
		vbo.unbind(shader);
	}
});
},{"kami":6}],2:[function(require,module,exports){
var Class = require('jsOOP').Class;

var ShaderProgram = new Class({
	
	vertSource: null,
	fragSource: null, 
 
	vertShader: null,
	fragShader: null,

	program: null,

	uniformCache: null,
	attributeCache: null,

	initialize: function(context, vertSource, fragSource, attribLocations) {
		if (!vertSource || !fragSource)
			throw "vertex and fragment shaders must be defined";
		if (!context)
			throw "no GL context specified";
		this.context = context;

		this.attribLocations = attribLocations;

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
	 */
	create: function() {
		this.gl = this.context.gl;
		this._compileShaders();
	},

	//Compiles the shaders, throwing an error if the program was invalid.
	_compileShaders: function() {
		var gl = this.gl; 

		this.vertShader = this._loadShader(gl.VERTEX_SHADER, this.vertSource);
		this.fragShader = this._loadShader(gl.FRAGMENT_SHADER, this.fragSource);

		if (!this.vertShader || !this.fragShader)
			throw "Error returned when calling createShader";

		this.program = gl.createProgram();

		if (this.attribLocations) {
			for (var key in this.attribLocations) {
				if (this.attribLocations.hasOwnProperty(key))
		    		gl.bindAttribLocation(this.program, this.attribLocations[key], key);
			}
		}

		gl.attachShader(this.program, this.vertShader);
		gl.attachShader(this.program, this.fragShader);
		gl.linkProgram(this.program); 

		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
			throw "Error linking the shader program:\n"
				+ gl.getProgramInfoLog(this.program);
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
		
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) ) {
			var log = gl.getShaderInfoLog(shader);
			if (log === null) //may return null as per WebGL spec
				log = "Error executing getShaderInfoLog";
			else {
				//we do this so the user knows which shader has the error
				var typeStr = (type === gl.VERTEX_SHADER) ? "vertex" : "fragment";
				log = "Error compiling "+ typeStr+ " shader:\n"+log;
			}
			throw log;
		}
		return shader;
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
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {GLint} the location object
	 */
	getAttributeLocation: function(name) { //TODO: make faster, don't cache
		var info = this.getAttributeInfo(name);
		return info ? info.location : null;
	},

	/**
	 * Returns the cached uniform location object.
	 * 
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {WebGLUniformLocation} the location object
	 */
	getUniformLocation: function(name) {
		var info = this.getUniformInfo(name);
		return info ? info.location : null;
	},

	/**
	 * Returns true if the uniform is active and found in this
	 * compiled program.
	 * 
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
	 * @param  {String}  name the attribute name
	 * @return {Boolean} true if the attribute is found and active
	 */
	hasAttribute: function(name) {
		return this.getAttributeInfo(name) !== null;
	},

	/**
	 * Returns the uniform value by name.
	 * 
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {any} The value of the WebGL uniform
	 */
	getUniform: function(name) {
		return this.gl.getUniform(this.program, this.getUniformLocation(name));
	},

	/**
	 * Returns the uniform value at the specified WebGLUniformLocation.
	 * 
	 * @param  {WebGLUniformLocation} location the location object
	 * @return {any} The value of the WebGL uniform
	 */
	getUniformAt: function(location) {
		return this.gl.getUniform(this.program, location);
	},
	
	setUniform: function(name, type, args) {
		//first look in cache
		//if not found,
	},

	getUniform: function(name) {

	},

	bind: function() {
		this.gl.useProgram(this.program);
	},

	destroy: function() {
		var gl = this.gl;
		gl.detachShader(this.vertShader);
		gl.detachShader(this.fragShader);

		gl.deleteShader(this.vertShader);
		gl.deleteShader(this.fragShader);

		gl.deleteProgram(this.program);
		this.program = null;
	}
});

module.exports = ShaderProgram;
},{"jsOOP":7}],3:[function(require,module,exports){
var Class = require('jsOOP').Class;

var Texture = new Class({

	id: null,
	target: null,
	width: 0,
	height: 0,
	wrap: null,
	filter: null,

	__managed: false,

	/**
	 * Whether this texture is 'managed' and will be restored on context loss.
	 * If no image provider is used
	 * 
	 * @type {Boolean}
	 */
	managed: {
		get: function() { 
			return this.__managed; 
		}

		//TODO: add to cache when user sets managed = true
		// set: function(val) {

		// }
	},

	/**
	 * Creates a new texture with the optional data provider.
	 *
	 * A data provider is a function which is called by Texture
	 * on intiialization, and subsequently on any context restoration.
	 * This allows images to be re-loaded without the need to keep
	 * them hanging around in memory. This also means that procedural
	 * textures will be re-created properly on context restore.
	 *
	 * Calling this constructor with no arguments will result in an Error.
	 *
	 * If this constructor is called with only the context (one argument),
	 * then no provider is used and the texture will be unmanaged and its width
	 * and height will be zero.
	 * 
	 * If the second argument is a string, we will use the default ImageProvider 
	 * to load the texture into the GPU asynchronously. Usage:
	 *
	 *     new Texture(context, "path/img.png");
	 *     new Texture(context, "path/img.png", onloadCallback, onerrorCallback);
	 *
	 * The callbacks will be fired every time the image is re-loaded, even on context
	 * restore.
	 *
	 * If the second and third arguments are Numbers, we will use the default
	 * ArrayProvider, which takes in a ArrayBufferView of pixels. This allows
	 * us to create textures synchronously like so:
	 *
	 *     new Texture(context, 256, 256); //uses empty data, transparent black
	 *     new Texture(context, 256, 256, gl.LUMINANCE); //empty data and LUMINANCE format
	 *     new Texture(context, 256, 256, gl.LUMINANCE, gl.UNSIGNED_BYTE, byteArray); //custom data
	 *
	 * Otherwise, we will assume that a custom provider is specified. In this case, the second
	 * argument is a provider function, and the subsequent arguments are those which will be passed 
	 * to the provider. The provider function always receives the texture object as the first argument,
	 * and then any others that may have been passed to it. For example, here is a basic ImageProvider 
	 * implementation:
	 *
	 *     //the provider function
	 *     var ImageProvider = function(texture, path) {
	 *         var img = new Image();
	 *         img.onload = function() {
	 *    	       texture.uploadImage(img);
	 *         }.bind(this);
	 *         img.src = path;
	 *     };
	 *
	 *     //loads the image asynchronously
	 *     var tex = new Texture(context, ImageProvider, "myimg.png");
	 *
	 * 
	 * @param  {WebGLContext} gl the WebGL context
	 * @param  {Function} provider [description]
	 * @param  {[type]} args     [description]
	 * @return {[type]}          [description]
	 */
	initialize: function(context) {
		if (!context || arguments.length === 0)
			throw "no WebGLCanvas specified";
		this.context = context;
		
		var providerArgs = [this];
		var provider = null;

		// e.g. --> new Texture(gl, "mypath.jpg")
		// 			new Texture(gl, "mypath.jpg", gl.RGB)
		//			new Texture(gl, myProvider, arg0, arg1)
		//          new Texture(gl, Texture.ImageProvider, "mypath.jpg", gl.RGB)
		//			new Texture(gl, Textuer.ArrayProvider, 256, 256)
		//			new Texture(gl, 256, 256, gl.RGB, gl.UNSIGNED_BYTE, data);

		//we are working with a provider of some kind...
		if (arguments.length > 1) {
			var slicedArgs = [];

			//determine the provider, if any...
			if (typeof arguments[1] === "string") {
				provider = Texture.ImageProvider;
				slicedArgs = Array.prototype.slice.call(arguments, 1)
			} else if (typeof arguments[1] === "function") {
				provider = arguments[1];
				slicedArgs = Array.prototype.slice.call(arguments, 2);
			} else if (arguments.length > 2 
						&& typeof arguments[1] === "number" 
						&& typeof arguments[2] === "number") {
				provider = Texture.ArrayProvider;
				slicedArgs = Array.prototype.slice.call(arguments, 1);
			}

			//concat with texture as first param
			providerArgs = providerArgs.concat(slicedArgs);
		}

		//the provider and its args, may be null...
		this.provider = provider;
		this.providerArgs = providerArgs;

		//if a provider is specified, it will be managed by WebGLCanvas
		this.__managed = this.provider !== null;
		this.context.addManagedObject(this);

		//if we have a provider, invoke it
		this.create();
	},

	//called after the context has been re-initialized
	create: function() {
		this.gl = this.context.gl; 
		this.id = this.gl.createTexture(); //texture ID is recreated
		this.width = this.height = 0; //size is reset to zero until loaded
		this.target = this.gl.TEXTURE_2D;  //the provider can change this if necessary (e.g. cube maps)

		//TODO: set filter & wrap based on last, or a default

		//load the data
		if (this.provider) {
			this.provider.apply(this, this.providerArgs);
		}
	},

	setFilter: function(mode) {
		this.bind();
		//...
	},

	/**
	 * A low-level method to upload the specified ArrayBufferView
	 * to this texture. This will cause the width and height of this
	 * texture to change.
	 * 
	 * @param  {Number} width          the new width of this texture,
	 *                                 defaults to the last used width (or zero)
	 * @param  {Number} height         the new height of this texture
	 *                                 defaults to the last used height (or zero)
	 * @param  {GLenum} format         the data format, default RGBA
	 * @param  {GLenum} type           the data type, default UNSIGNED_BYTE (Uint8Array)
	 * @param  {ArrayBufferView} data  the raw data for this texture, or null for an empty image
	 */
	uploadData: function(width, height, format, type, data) {
		var gl = this.gl;

		this.format = format || gl.RGBA;
		type = type || gl.UNSIGNED_BYTE;
		data = data || null; //make sure falsey value is null for texImage2D

		this.width = (width || width==0) ? width : this.width;
		this.height = (height || height==0) ? height : this.height;

		this.bind();

		gl.texImage2D(this.target, 0, this.format, 
					  this.width, this.height, 0, this.format,
					  type, data);
	},

	/**
	 * Uploads ImageData, HTMLImageElement, HTMLCanvasElement or 
	 * HTMLVideoElement.
	 * 	
	 * @param  {Object} domObject the DOM image container
	 */
	uploadImage: function(domObject, format, type) {
		var gl = this.gl;

		this.format = format || gl.RGBA;
		type = type || gl.UNSIGNED_BYTE;
		
		this.width = domObject.width;
		this.height = domObject.height;

		this.bind();

		gl.texImage2D(this.target, 0, this.format, this.format,
					  type, domObject);
	},

	/**
	 * Binds the texture. If unit is specified,
	 * it will bind the texture at the given slot
	 * (TEXTURE0, TEXTURE1, etc). If unit is not specified,
	 * it will simply bind the texture at whichever slot
	 * is currently active.
	 * 
	 * @param  {Number} unit the texture unit index, starting at 0
	 */
	bind: function(unit) {
		var gl = this.gl;
		if (unit || unit === 0)
			gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(this.target, this.id);
	}
});

Texture.Filter = {
	NEAREST: 9728,
	NEAREST_MIPMAP_LINEAR: 9986,
	NEAREST_MIPMAP_NEAREST: 9984,
	LINEAR: 9729,
	LINEAR_MIPMAP_LINEAR: 9987,
	LINEAR_MIPMAP_NEAREST: 9985
};

Texture.Wrap = {
	CLAMP_TO_EDGE: 33071,
	MIRRORED_REPEAT: 33648,
	REPEAT: 10497
};

Texture.Format = {
	DEPTH_COMPONENT: 6402,
	ALPHA: 6406,
	RGBA: 6408,
	RGB: 6407,
	LUMINANCE: 6409,
	LUMINANCE_ALPHA: 6410
};

/**
 * This is a "provider" function for images, based on the given
 * path (src) and optional callbacks, WebGL format and type options.
 *
 * The callbacks are called from the Texture scope; but also passed the
 * texture to the first argument (in case the user wishes to re-bind the 
 * functions to something else).
 * 
 * @param {Texture} texture the texture which is being acted on
 * @param {String} path     the path to the image
 * @param {Function} onLoad the callback after the image has been loaded and uploaded to GPU
 * @param {Function} onErr  the callback if there was an error while loading the image
 * @param {GLenum} format   the GL texture format (default RGBA)
 * @param {GLenum} type     the GL texture type (default UNSIGNED_BYTE)
 */
Texture.ImageProvider = function(texture, path, onLoad, onErr, format, type) {
	var img = new Image();
	img.onload = function() {
		texture.uploadImage(img, format, type);
		if (onLoad && typeof onLoad === "function")
			onLoad.call(texture, texture);
	};
	
	img.onerror = function() {
		if (onErr && typeof onErr === "function") 
			onErr.call(texture, texture);
	};

	img.src = path;
};

/**
 * This is a "provider" function for synchronous ArrayBufferView pixel uploads.
 * 
 * @param  {Texture} texture  	   the texture which is being acted on
 * @param  {Number} width          the width of this texture,
 * @param  {Number} height         the height of this texture
 * @param  {GLenum} format         the data format, default RGBA
 * @param  {GLenum} type           the data type, default UNSIGNED_BYTE (Uint8Array)
 * @param  {ArrayBufferView} data  the raw data for this texture, or null for an empty image
 */
Texture.ArrayProvider = function(texture, width, height, format, type, data) {
	texture.uploadData(width, height, format, type, data);
};

/**
 * Utility to get the number of components for the given GLenum, e.g. gl.RGBA returns 4.
 * Returns null if the specified format is not of type DEPTH_COMPONENT, ALPHA, LUMINANCE,
 * LUMINANCE_ALPHA, RGB, or RGBA.
 *
 * @method
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
},{"jsOOP":7}],4:[function(require,module,exports){
var Class = require('jsOOP').Class;

//TODO: decouple into VBO + IBO utilities 
var VertexData = new Class({

	context: null,
	gl: null,

	numVerts: null,
	numIndices: null,
	
	vertices: null,
	indices: null,
	vertexBuffer: null,
	indexBuffer: null,

	verticesDirty: true,
	indicesDirty: true,
	indexUsage: null,
	vertexUsage: null,

	/** 
	 * @property
	 * @private
	 */
	_vertexAttribs: null,

	/** 
	 * @property
	 * @private
	 */
	_vertexStride: null,

	/**
	 * A write-only property which sets both vertices and indices 
	 * flag to dirty or not.
	 *
	 * @property
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
	 * Creates a new VertexData with the provided parameters.
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
	initialize: function(context, isStatic, numVerts, numIndices, vertexAttribs) {
		if (!context)
			throw "GL context not specified";
		if (!numVerts)
			throw "numVerts not specified, must be > 0";

		this.context = context;
		this.gl = context.gl;
		
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
			totalNumComponents += this._vertexAttribs[i].numComponents;
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
	},

	destroy: function() {
		this.vertices = [];
		this.indices = [];
		if (this.vertexBuffer)
			this.gl.deleteBuffer(this.vertexBuffer);
		if (this.indexBuffer)
			this.gl.deleteBuffer(this.indexBuffer);
		this.vertexBuffer = null;
		this.indexBuffer = null;
	},

	/**
	 * Called to bind this vertex data with the given 
	 * ShaderProgram, enabling any associated attribute
	 * arrays.
	 *
	 * If shader is null or undefined, it's assumed
	 * that the vertex attributes have already been bound. 
	 * This can be used by advanced users to avoid redundant
	 * GL calls.
	 * 
	 * @param  {ShaderProgram} shader the shader that will be used to render this mesh
	 */
	bind: function(shader) {
		var gl = this.gl;

		//bind our index data, if we have any
		if (this.numIndices > 0) {
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
			//update the index data
			if (this.indicesDirty) {
				gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, this.indexUsage);
				this.indicesDirty = false;
			}
		}

		//bind our vertex data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		//update our vertex data
		if (this.verticesDirty) {
			gl.bufferData(gl.ARRAY_BUFFER, this.vertices, this.vertexUsage);
			this.verticesDirty = false;
		}

		if (shader)
			this.bindAttributes(shader);
	},

	draw: function(primitiveType, count, offset) {
		if (count === 0)
			return;

		var gl = this.gl;
		if (this.numIndices > 0) { 
			gl.drawElements(primitiveType, count, 
						gl.UNSIGNED_SHORT, offset * 2); //* Uint16Array.BYTES_PER_ELEMENT
		} else
			gl.drawArrays(primitiveType, offset, count);
	},

	unbind: function(shader) {
		if (shader)
			this.unbindAttributes(shader);
	},

	//binds this mesh's vertex attributes for the given shader
	bindAttributes: function(shader) {
		var gl = this.gl;

		var offset = 0;
		var stride = this._vertexStride;

		//for each attribtue
		for (var i=0; i<this._vertexAttribs.length; i++) {
			var a = this._vertexAttribs[i];

			//location of the attribute
			var loc = a.location === null 
					? shader.getAttributeLocation(a.name)
					: a.location;
			
			//first, enable the vertex array
			gl.enableVertexAttribArray(loc);
			//then specify our vertex format
			gl.vertexAttribPointer(loc, a.numComponents, a.type || gl.FLOAT, 
								   a.normalize || false, stride, offset);


			//and increase the offset...
			offset += a.numComponents * 4; //in bytes

			// var err = gl.getError();
			// if (err)
			// 	console.log(err);
		}
	},

	unbindAttributes: function(shader) {
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

VertexData.Attrib = new Class({

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
	initialize: function(name, numComponents, location, type, normalize) {
		this.name = name;
		this.numComponents = numComponents;
		this.location = typeof location === "number" ? location : null;
		this.type = type;
		this.normalize = normalize;
	}
})


module.exports = VertexData;


//flow:
//  



// var attribs = [
// 	new Mesh.Attribute("a_position", 2),
// 	new Mesh.Attribute("a_color", 1)
// ];
// var mesh = new Mesh(context, 4, 6, Mesh.STATIC, attribs);


//Constant Vertex Attrib:
//	e.g. with instancing maybe?
//Only enable vertex attrib if it's used?
//	but we are still sending alpha so WTF
//	would need another buffer, but that can get real ugly.
//  
},{"jsOOP":7}],5:[function(require,module,exports){
var Class = require('jsOOP').Class;

/**
 * A thin wrapper around WebGLRenderingContext which handles
 * context loss and restore with other Kami rendering objects.
 */
var WebGLContext = new Class({
	
	managedTextures: null,
	managedShaders: null,

	gl: null,
	width: null,
	height: null,
	view: null,
	contextAttributes: null,
	
	/**
	 * Whether this context is 'valid', i.e. renderable. A context that has been lost
	 * (and not yet restored) is invalid.
	 * 
	 * @type {Boolean}
	 */
	valid: false,

	initialize: function(width, height, view, contextAttributes) {
		//setup defaults
		this.view = view || document.createElement("canvas");

		//default size as per spec:
		//http://www.w3.org/TR/2012/WD-html5-author-20120329/the-canvas-element.html#the-canvas-element
		this.width = this.view.width = width || 300;
		this.height = this.view.height = height || 150;
		
		//the list of managed objects...
		this.managedObjects = [];

		//setup context lost and restore listeners
		this.view.addEventListener("webglcontextlost", function (ev) {
			ev.preventDefault();
			this._contextLost(ev);
		}.bind(this));
		this.view.addEventListener("webglcontextrestored", function (ev) {
			ev.preventDefault();
			this._contextRestored(ev);
		}.bind(this));
			
		this.contextAttributes = contextAttributes;
		this._initContext();
		this.initGL();
	},

	_initContext: function() {
		var err = "";
		this.valid = false;

		try {
	        this.gl = (this.view.getContext('webgl') || this.view.getContext('experimental-webgl'));
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

	initGL: function() {
		var gl = this.gl;
		gl.viewport(0, 0, this.width, this.height);

		// get rid of this.. let user handle it
		// gl.clearColor(0.5,0.5,0.0,1.0);
		// gl.clear(gl.COLOR_BUFFER_BIT);
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

	_contextLost: function(ev) {
		//all textures/shaders/buffers/FBOs have been deleted... 
		//we need to re-create them on restore
		this.valid = false;
	},

	_contextRestored: function(ev) {
		//first, initialize the GL context again
		this._initContext();

		//now we recreate our shaders and textures
		for (var i=0; i<this.managedObjects.length; i++) {
			this.managedObjects[i].create();
		}

		this.initGL();
	}
});

module.exports = WebGLContext;
},{"jsOOP":7}],6:[function(require,module,exports){
module.exports = {
	ShaderProgram: require('./ShaderProgram'),
	WebGLContext: require('./WebGLContext'),
	Texture: require('./Texture'),
	VertexData: require('./VertexData')
};
},{"./ShaderProgram":2,"./Texture":3,"./VertexData":4,"./WebGLContext":5}],7:[function(require,module,exports){
var Class = require('./lib/Class'),
	Enum = require('./lib/Enum'),
	Interface = require('./lib/Interface');

module.exports = {
	Class: Class,
	Enum: Enum,
	Interface: Interface
};
},{"./lib/Class":8,"./lib/Enum":9,"./lib/Interface":10}],8:[function(require,module,exports){
var BaseClass = require('./baseClass');

var Class = function( descriptor ) {
	if (!descriptor) 
		descriptor = {};
	
	if( descriptor.initialize ) {
		var rVal = descriptor.initialize;
		delete descriptor.initialize;
	} else {
		rVal = function() { this.parent.apply( this, arguments ); };
	}

	if( descriptor.Extends ) {
		rVal.prototype = Object.create( descriptor.Extends.prototype );
		// this will be used to call the parent constructor
		rVal.$$parentConstructor = descriptor.Extends;
		delete descriptor.Extends;
	} else {
		rVal.$$parentConstructor = function() {}
		rVal.prototype = Object.create( BaseClass );
	}

	rVal.prototype.$$getters = {};
	rVal.prototype.$$setters = {};

	for( var i in descriptor ) {
		if( typeof descriptor[ i ] == 'function' ) {
			descriptor[ i ].$$name = i;
			descriptor[ i ].$$owner = rVal.prototype;

			rVal.prototype[ i ] = descriptor[ i ];
		} else if( descriptor[ i ] && typeof descriptor[ i ] == 'object' && ( descriptor[ i ].get || descriptor[ i ].set ) ) {
			Object.defineProperty( rVal.prototype, i , descriptor[ i ] );

			if( descriptor[ i ].get ) {
				rVal.prototype.$$getters[ i ] = descriptor[ i ].get;
				descriptor[ i ].get.$$name = i;
				descriptor[ i ].get.$$owner = rVal.prototype;
			}

			if( descriptor[ i ].set ) {
				rVal.prototype.$$setters[ i ] = descriptor[ i ].set;
				descriptor[ i ].set.$$name = i;
				descriptor[ i ].set.$$owner = rVal.prototype;	
			}
		} else {
			rVal.prototype[ i ] = descriptor[ i ];
		}
	}

	// this will be used to check if the caller function is the consructor
	rVal.$$isConstructor = true;


	// now we'll check interfaces
	for( var i = 1; i < arguments.length; i++ ) {
		arguments[ i ].compare( rVal );
	}

	return rVal;
};	

exports = module.exports = Class;
},{"./baseClass":11}],9:[function(require,module,exports){
var Class = require('./Class');

/**
The Enum class, which holds a set of constants in a fixed order.

#### Basic Usage:
	var Days = new Enum([ 
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday',
			'Saturday',
			'Sunday'
	]);

	console.log( Days.Monday === Days.Tuesday ); // => false
	console.log( Days.values[1] ) // => the 'Tuesday' symbol object

Each enum *symbol* is an object which extends from the `{{#crossLink "Enum.Base"}}{{/crossLink}}` 
class. This base
class has  properties like `{{#crossLink "Enum.Base/value:property"}}{{/crossLink}}`  
and `{{#crossLink "Enum.Base/ordinal:property"}}{{/crossLink}}`. 
__`value`__ is a string
which matches the element of the array. __`ordinal`__ is the index the 
symbol was defined at in the enumeration. 

The resulting Enum object (in the above case, Days) also has some utility methods,
like fromValue(string) and the values property to access the array of symbols.

Note that the values array is frozen, as is each symbol. The returned object is 
__not__ frozen, as to allow the user to modify it (i.e. add "static" members).

A more advanced Enum usage is to specify a base Enum symbol class as the second
parameter. This is the class that each symbol will use. Then, if any symbols
are given as an Array (instead of string), it will be treated as an array of arguments
to the base class. The first argument should always be the desired key of that symbol.

Note that __`ordinal`__ is added dynamically
after the symbol is created; so it can't be used in the symbol's constructor.

#### Advanced Usage
	var Days = new Enum([ 
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday',
			['Saturday', true],
			['Sunday', true]
		], new Class({
			
			Extends: Enum.Base,

			isWeekend: false,

			initialize: function( key, isWeekend ) {
				//pass the string value along to parent constructor
				this.parent( key ); 
				
				//get a boolean primitive out of the truthy/falsy value
				this.isWekeend = Boolean(isWeekend);
			}
		})
	);

	console.log( Days.Saturday.isWeekend ); // => true

This method will throw an error if you try to specify a class which does
not extend from `{{#crossLink "Enum.Base"}}{{/crossLink}}`.

#### Shorthand

You can also omit the `new Class` and pass a descriptor, thus reducing the need to 
explicitly require the Class module. Further, if you are passing a descriptor that
does not have `Extends` defined, it will default to
`{{#crossLink "Enum.Base"}}{{/crossLink}}`.

	var Icons = new Enum([ 
			'Open',
			'Save',
			'Help',
			'New'
		], {

			path: function( retina ) {
				return "icons/" + this.value.toLowerCase() + (retina ? "@2x" : "") + ".png";
			}
		}
	);


@class Enum
@constructor 
@param {Array} elements An array of enumerated constants, or arguments to be passed to the symbol
@param {Class} base Class to be instantiated for each enum symbol, must extend 
`{{#crossLink "Enum.Base"}}{{/crossLink}}`
*/
var EnumResult = new Class({

	/**
	An array of the enumerated symbol objects.

	@property values
	@type Array
	*/
	values: null,

	initialize: function () {
		this.values = [];
	},

	toString: function () {
		return "[ "+this.values.join(", ")+" ]";
	},

	/**
	Looks for the first symbol in this enum whose 'value' matches the specified string. 
	If none are found, this method returns null.

	@method fromValue
	@param {String} str the string to look up
	@return {Enum.Base} returns an enum symbol from the given 'value' string, or null
	*/
	fromValue: function (str) {
		for (var i=0; i<this.values.length; i++) {
			if (str === this.values[i].value)
				return this.values[i];
		}
		return null;
	}
});



var Enum = function ( elements, base ) {
	if (!base)
		base = Enum.Base;

	//The user is omitting Class, inject it here
	if (typeof base === "object") {
		//if we didn't specify a subclass.. 
		if (!base.Extends)
			base.Extends = Enum.Base;
		base = new Class(base);
	}
	
	var ret = new EnumResult();

	for (var i=0; i<elements.length; i++) {
		var e = elements[i];

		var obj = null;
		var key = null;

		if (!e)
			throw "enum value at index "+i+" is undefined";

		if (typeof e === "string") {
			key = e;
			obj = new base(e);
			ret[e] = obj;
		} else {
			if (!Array.isArray(e))
				throw "enum values must be String or an array of arguments";

			key = e[0];

			//first arg is ignored
			e.unshift(null);
			obj = new (Function.prototype.bind.apply(base, e));

			ret[key] = obj;
		}

		if ( !(obj instanceof Enum.Base) )
			throw "enum base class must be a subclass of Enum.Base";

		obj.ordinal = i;
		ret.values.push(obj);
		Object.freeze(obj);
	};

	//we SHOULD freeze the returrned object, but most JS developers
	//aren't expecting an object to be frozen, and the browsers don't always warn us.
	//It just causes frustration, e.g. if you're trying to add a static or constant
	//to the returned object.

	// Object.freeze(ret);
	Object.freeze(ret.values);
	return ret;
};


/**

The base type for Enum symbols. Subclasses can extend
this to implement more functionality for enum symbols.

@class Enum.Base
@constructor 
@param {String} key the string value for this symbol
*/
Enum.Base = new Class({

	/**
	The string value of this symbol.
	@property value
	@type String
	*/
	value: undefined,

	/**
	The index of this symbol in its enumeration array.
	@property ordinal
	@type Number
	*/
	ordinal: undefined,

	initialize: function ( key ) {
		this.value = key;
	},

	toString: function() {
		return this.value || this.parent();
	},

	valueOf: function() {
		return this.value || this.parent();
	}
});

exports = module.exports = Enum;

},{"./Class":8}],10:[function(require,module,exports){

var Interface = function( descriptor ) {
	this.descriptor = descriptor;
};

Interface.prototype.descriptor = null;

Interface.prototype.compare = function( classToCheck ) {

	for( var i  in this.descriptor ) {
		// First we'll check if this property exists on the class
		if( classToCheck.prototype[ i ] === undefined ) {

			throw 'INTERFACE ERROR: ' + i + ' is not defined in the class';

		// Second we'll check that the types expected match
		} else if( typeof this.descriptor[ i ] != typeof classToCheck.prototype[ i ] ) {

			throw 'INTERFACE ERROR: Interface and class define items of different type for ' + i + 
				  '\ninterface[ ' + i + ' ] == ' + typeof this.descriptor[ i ] +
				  '\nclass[ ' + i + ' ] == ' + typeof classToCheck.prototype[ i ];

		// Third if this property is a function we'll check that they expect the same amount of parameters
		} else if( typeof this.descriptor[ i ] == 'function' && classToCheck.prototype[ i ].length != this.descriptor[ i ].length ) {

			throw 'INTERFACE ERROR: Interface and class expect a different amount of parameters for the function ' + i +
				  '\nEXPECTED: ' + this.descriptor[ i ].length + 
				  '\nRECEIVED: ' + classToCheck.prototype[ i ].length;

		}
	}
};

exports = module.exports = Interface;
},{}],11:[function(require,module,exports){
//Exports a function named 'parent'
module.exports.parent = function() {
	// if the current function calling is the constructor
	if( this.parent.caller.$$isConstructor ) {
		var parentFunction = this.parent.caller.$$parentConstructor;
	} else {
		if( this.parent.caller.$$name ) {
			var callerName = this.parent.caller.$$name;
			var isGetter = this.parent.caller.$$owner.$$getters[ callerName ];
			var isSetter = this.parent.caller.$$owner.$$setters[ callerName ];

			if( arguments.length == 1 && isSetter ) {
				var parentFunction = Object.getPrototypeOf( this.parent.caller.$$owner ).$$setters[ callerName ];

				if( parentFunction === undefined ) {
					throw 'No setter defined in parent';
				}
			} else if( arguments.length == 0 && isGetter ) {
				var parentFunction = Object.getPrototypeOf( this.parent.caller.$$owner ).$$getters[ callerName ];

				if( parentFunction === undefined ) {
					throw 'No getter defined in parent';
				}
			} else if( isSetter || isGetter ) {
				throw 'Incorrect amount of arguments sent to getter or setter';
			} else {
				var parentFunction = Object.getPrototypeOf( this.parent.caller.$$owner )[ callerName ];	

				if( parentFunction === undefined ) {
					throw 'No parent function defined for ' + callerName;
				}
			}
		} else {
			throw 'You cannot call parent here';
		}
	}

	return parentFunction.apply( this, arguments );
};
},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pL2RlbW9zL3NyYy9pbmRleC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL1NoYWRlclByb2dyYW0uanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL2xpYi9UZXh0dXJlLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9saWIvVmVydGV4RGF0YS5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL1dlYkdMQ29udGV4dC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL2luZGV4LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvaW5kZXguanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvQ2xhc3MuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvRW51bS5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL2pzT09QL2xpYi9JbnRlcmZhY2UuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvYmFzZUNsYXNzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbInZhciBXZWJHTENvbnRleHQgPSByZXF1aXJlKCdrYW1pJykuV2ViR0xDb250ZXh0O1xudmFyIFNoYWRlclByb2dyYW0gPSByZXF1aXJlKCdrYW1pJykuU2hhZGVyUHJvZ3JhbTtcbnZhciBUZXh0dXJlID0gcmVxdWlyZSgna2FtaScpLlRleHR1cmU7XG52YXIgVmVydGV4RGF0YSA9IHJlcXVpcmUoJ2thbWknKS5WZXJ0ZXhEYXRhO1xuXG4kKGZ1bmN0aW9uKCkge1xuXHR2YXIgbWFpbkNvbnRhaW5lciA9ICQoXCJib2R5XCIpLmNzcyh7XG5cdFx0YmFja2dyb3VuZDogXCIjMDAwXCJcblx0fSk7XG5cblx0dmFyIGRlbW9Db250YWluZXJzID0gW107XG5cdHZhciBjdXJyZW50RGVtbyA9IG51bGw7XG5cdHZhciBjdXJyZW50SW5kZXggPSAwO1xuXG5cblx0dmFyIHdpZHRoID0gODAwO1xuXHR2YXIgaGVpZ2h0ID0gNjAwO1xuXG5cdHZhciBjYW52YXMgPSAkKFwiPGNhbnZhcz5cIiwge1xuXHRcdHdpZHRoOiB3aWR0aCxcblx0XHRoZWlnaHQ6IGhlaWdodFxuXHR9KS5jc3Moe1xuXHRcdGJhY2tncm91bmQ6IFwiIzM0MzQzNFwiLCAgXG5cdFx0cG9zaXRpb246IFwiZml4ZWRcIixcblx0XHR0b3A6IDAsXG5cdFx0bGVmdDogMCxcblx0XHRvdmVyZmxvdzogXCJoaWRkZW5cIlxuXHR9KTtcblxuXHRjYW52YXMuYXBwZW5kVG8obWFpbkNvbnRhaW5lcik7XG5cblx0Ly9jcmVhdGUgb3VyIHdlYkdMIGNvbnRleHQuLlxuXHQvL3RoaXMgd2lsbCBtYW5hZ2Ugdmlld3BvcnQgYW5kIGNvbnRleHQgbG9zcy9yZXN0b3JlXG5cdHZhciBjb250ZXh0ID0gbmV3IFdlYkdMQ29udGV4dCg4MDAsIDYwMCwgY2FudmFzWzBdKTtcblx0XG5cdC8vY3JlYXRlIGEgYmFzaWMgc2hhZGVyLi5cblx0Ly90aGlzIHdpbGwgYmUgYWRkZWQgdG8gdGhlIGNvbnRleHQgYW5kIHJlLWNvbXBpbGVkIG9uIGNvbnRleHQgcmVzdG9yZVxuXHR2YXIgc2hhZGVyID0gbmV3IFNoYWRlclByb2dyYW0oY29udGV4dCwgJChcIiN2ZXJ0X3NoYWRlclwiKS5odG1sKCksICQoXCIjZnJhZ19zaGFkZXJcIikuaHRtbCgpKTtcblxuXHRjb25zb2xlLmxvZyhzaGFkZXIuZ2V0VW5pZm9ybUxvY2F0aW9uKFwidV9wcm9qVmlld1wiKSk7XG5cdGNvbnNvbGUubG9nKHNoYWRlci5nZXRBdHRyaWJ1dGVMb2NhdGlvbihcIlBvc2l0aW9uXCIpKTtcblx0Ly9jcmVhdGUgYSB0ZXh0dXJlIGZyb20gSW1hZ2Vcblx0Ly8gdmFyIHRleCA9IG5ldyBUZXh0dXJlKGNvbnRleHQuZ2wpO1xuXG5cdHZhciBwaXhlbHMgPSBuZXcgVWludDE2QXJyYXkoWzI1NSwgMjU1LCAwLCAyNTVdKTtcblxuXHQvL2NyZWF0ZSB0ZXh0dXJlIGZyb20gSW1hZ2UgKGFzeW5jIGxvYWQpXG5cdC8vIHZhciB0ZXggPSBuZXcgVGV4dHVyZShjb250ZXh0LCBcImltZy9idW5ueS5wbmdcIik7XG5cblx0Ly8gdmFyIHRleCA9IG5ldyBUZXh0dXJlKGNvbnRleHQsIFwiaW1nL2J1bm55LnBuZ1wiLCBvbmxvYWQpO1xuXG5cdHZhciB2ZXJ0aWNlcyA9IG5ldyBGbG9hdDMyQXJyYXkoW1xuXHRcdC0xLCAtMSxcblx0XHQwLCAtMSxcblx0XHQwLCAwLFxuXHRcdC0xLCAwXG5cdF0pO1xuXHRcblx0dmFyIGluZGljZXMgPSBuZXcgVWludDE2QXJyYXkoW1xuXHRcdDAsIDEsIDIsXG5cdFx0MCwgMiwgM1xuXHRdKTtcblxuXHQvLyBjb250ZXh0LmdsLmRpc2FibGUoY29udGV4dC5nbC5DVUxMX0ZBQ0UpXG5cblx0Ly9zdGF0aWMgPSB0cnVlXG5cdC8vbnVtVmVydHMgPSA0XG5cdC8vbnVtSW5kaWNlcyA9IDZcblx0Ly9hdHRyaWJzID0ganVzdCBwb3NpdGlvbiByaWdodCBub3cuLi5cblx0dmFyIHZibyA9IG5ldyBWZXJ0ZXhEYXRhKGNvbnRleHQsIHRydWUsIDQsIDYsIFtcblx0XHRuZXcgVmVydGV4RGF0YS5BdHRyaWIoXCJQb3NpdGlvblwiLCAyKSAvL3RoaXMgc2hvdWxkIG1hdGNoIG91ciBzaGFkZXJcblx0XSk7XG5cblx0Ly90aGVzZSBhcmUgaW5pdGlhbGl6ZWQgYWxyZWFkeSwgb3Igd2UgY2FuIG92ZXJyaWRlIHRoZW0gbGlrZSBzbzpcblx0dmJvLmluZGljZXMgPSBpbmRpY2VzO1xuXHR2Ym8udmVydGljZXMgPSB2ZXJ0aWNlcztcblx0dmJvLmRpcnR5ID0gdHJ1ZTtcblxuXHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUocmVuZGVyKTtcblxuXHQvLyB2YXIgbG9zZUN0eCA9IGNvbnRleHQuZ2wuZ2V0RXh0ZW5zaW9uKFwiV0VCR0xfbG9zZV9jb250ZXh0XCIpO1xuXG5cdC8vIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdC8vIFx0bG9zZUN0eC5sb3NlQ29udGV4dCgpO1x0XG5cdFx0XG5cdC8vIH0uYmluZCh0aGlzKSwgMTAwMCk7XG5cblx0Ly8gc2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0Ly8gXHRsb3NlQ3R4LnJlc3RvcmVDb250ZXh0KCk7XG5cdC8vIH0uYmluZCh0aGlzKSwgMzIwMCk7XG5cblx0ZnVuY3Rpb24gcmVuZGVyKCkge1xuXHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xuXG5cdFx0aWYgKCFjb250ZXh0LnZhbGlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBcblxuXHRcdHZhciBnbCA9IGNvbnRleHQuZ2w7XG5cblx0XHR2Ym8uZGlydHkgPSB0cnVlO1xuXHRcdHNoYWRlci5iaW5kKCk7XG5cblx0XHR2Ym8uYmluZChzaGFkZXIpO1xuXHRcdHZiby5kcmF3KGdsLlRSSUFOR0xFUywgNiwgMCk7XG5cdFx0dmJvLnVuYmluZChzaGFkZXIpO1xuXHR9XG59KTsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCdqc09PUCcpLkNsYXNzO1xuXG52YXIgU2hhZGVyUHJvZ3JhbSA9IG5ldyBDbGFzcyh7XG5cdFxuXHR2ZXJ0U291cmNlOiBudWxsLFxuXHRmcmFnU291cmNlOiBudWxsLCBcbiBcblx0dmVydFNoYWRlcjogbnVsbCxcblx0ZnJhZ1NoYWRlcjogbnVsbCxcblxuXHRwcm9ncmFtOiBudWxsLFxuXG5cdHVuaWZvcm1DYWNoZTogbnVsbCxcblx0YXR0cmlidXRlQ2FjaGU6IG51bGwsXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oY29udGV4dCwgdmVydFNvdXJjZSwgZnJhZ1NvdXJjZSwgYXR0cmliTG9jYXRpb25zKSB7XG5cdFx0aWYgKCF2ZXJ0U291cmNlIHx8ICFmcmFnU291cmNlKVxuXHRcdFx0dGhyb3cgXCJ2ZXJ0ZXggYW5kIGZyYWdtZW50IHNoYWRlcnMgbXVzdCBiZSBkZWZpbmVkXCI7XG5cdFx0aWYgKCFjb250ZXh0KVxuXHRcdFx0dGhyb3cgXCJubyBHTCBjb250ZXh0IHNwZWNpZmllZFwiO1xuXHRcdHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cblx0XHR0aGlzLmF0dHJpYkxvY2F0aW9ucyA9IGF0dHJpYkxvY2F0aW9ucztcblxuXHRcdC8vV2UgdHJpbSAoRUNNQVNjcmlwdDUpIHNvIHRoYXQgdGhlIEdMU0wgbGluZSBudW1iZXJzIGFyZVxuXHRcdC8vYWNjdXJhdGUgb24gc2hhZGVyIGxvZ1xuXHRcdHRoaXMudmVydFNvdXJjZSA9IHZlcnRTb3VyY2UudHJpbSgpO1xuXHRcdHRoaXMuZnJhZ1NvdXJjZSA9IGZyYWdTb3VyY2UudHJpbSgpO1xuXG5cdFx0Ly9BZGRzIHRoaXMgc2hhZGVyIHRvIHRoZSBjb250ZXh0LCB0byBiZSBtYW5hZ2VkXG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8qKiBcblx0ICogVGhpcyBpcyBjYWxsZWQgZHVyaW5nIHRoZSBTaGFkZXJQcm9ncmFtIGNvbnN0cnVjdG9yLFxuXHQgKiBhbmQgbWF5IG5lZWQgdG8gYmUgY2FsbGVkIGFnYWluIGFmdGVyIGNvbnRleHQgbG9zcyBhbmQgcmVzdG9yZS5cblx0ICovXG5cdGNyZWF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbCA9IHRoaXMuY29udGV4dC5nbDtcblx0XHR0aGlzLl9jb21waWxlU2hhZGVycygpO1xuXHR9LFxuXG5cdC8vQ29tcGlsZXMgdGhlIHNoYWRlcnMsIHRocm93aW5nIGFuIGVycm9yIGlmIHRoZSBwcm9ncmFtIHdhcyBpbnZhbGlkLlxuXHRfY29tcGlsZVNoYWRlcnM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7IFxuXG5cdFx0dGhpcy52ZXJ0U2hhZGVyID0gdGhpcy5fbG9hZFNoYWRlcihnbC5WRVJURVhfU0hBREVSLCB0aGlzLnZlcnRTb3VyY2UpO1xuXHRcdHRoaXMuZnJhZ1NoYWRlciA9IHRoaXMuX2xvYWRTaGFkZXIoZ2wuRlJBR01FTlRfU0hBREVSLCB0aGlzLmZyYWdTb3VyY2UpO1xuXG5cdFx0aWYgKCF0aGlzLnZlcnRTaGFkZXIgfHwgIXRoaXMuZnJhZ1NoYWRlcilcblx0XHRcdHRocm93IFwiRXJyb3IgcmV0dXJuZWQgd2hlbiBjYWxsaW5nIGNyZWF0ZVNoYWRlclwiO1xuXG5cdFx0dGhpcy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpO1xuXG5cdFx0aWYgKHRoaXMuYXR0cmliTG9jYXRpb25zKSB7XG5cdFx0XHRmb3IgKHZhciBrZXkgaW4gdGhpcy5hdHRyaWJMb2NhdGlvbnMpIHtcblx0XHRcdFx0aWYgKHRoaXMuYXR0cmliTG9jYXRpb25zLmhhc093blByb3BlcnR5KGtleSkpXG5cdFx0ICAgIFx0XHRnbC5iaW5kQXR0cmliTG9jYXRpb24odGhpcy5wcm9ncmFtLCB0aGlzLmF0dHJpYkxvY2F0aW9uc1trZXldLCBrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGdsLmF0dGFjaFNoYWRlcih0aGlzLnByb2dyYW0sIHRoaXMudmVydFNoYWRlcik7XG5cdFx0Z2wuYXR0YWNoU2hhZGVyKHRoaXMucHJvZ3JhbSwgdGhpcy5mcmFnU2hhZGVyKTtcblx0XHRnbC5saW5rUHJvZ3JhbSh0aGlzLnByb2dyYW0pOyBcblxuXHRcdGlmICghZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSkge1xuXHRcdFx0dGhyb3cgXCJFcnJvciBsaW5raW5nIHRoZSBzaGFkZXIgcHJvZ3JhbTpcXG5cIlxuXHRcdFx0XHQrIGdsLmdldFByb2dyYW1JbmZvTG9nKHRoaXMucHJvZ3JhbSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZmV0Y2hVbmlmb3JtcygpO1xuXHRcdHRoaXMuX2ZldGNoQXR0cmlidXRlcygpO1xuXHR9LFxuXG5cdF9mZXRjaFVuaWZvcm1zOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy51bmlmb3JtQ2FjaGUgPSB7fTtcblxuXHRcdHZhciBsZW4gPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHRoaXMucHJvZ3JhbSwgZ2wuQUNUSVZFX1VOSUZPUk1TKTtcblx0XHRpZiAoIWxlbikgLy9udWxsIG9yIHplcm9cblx0XHRcdHJldHVybjtcblxuXHRcdGZvciAodmFyIGk9MDsgaTxsZW47IGkrKykge1xuXHRcdFx0dmFyIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHRoaXMucHJvZ3JhbSwgaSk7XG5cdFx0XHRpZiAoaW5mbyA9PT0gbnVsbCkgXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0dmFyIG5hbWUgPSBpbmZvLm5hbWU7XG5cdFx0XHR2YXIgbG9jYXRpb24gPSBnbC5nZXRVbmlmb3JtTG9jYXRpb24odGhpcy5wcm9ncmFtLCBuYW1lKTtcblx0XHRcdFxuXHRcdFx0dGhpcy51bmlmb3JtQ2FjaGVbbmFtZV0gPSB7XG5cdFx0XHRcdHNpemU6IGluZm8uc2l6ZSxcblx0XHRcdFx0dHlwZTogaW5mby50eXBlLFxuXHRcdFx0XHRsb2NhdGlvbjogbG9jYXRpb25cblx0XHRcdH07XG5cdFx0fVxuXHR9LFxuXG5cdF9mZXRjaEF0dHJpYnV0ZXM6IGZ1bmN0aW9uKCkgeyBcblx0XHR2YXIgZ2wgPSB0aGlzLmdsOyBcblxuXHRcdHRoaXMuYXR0cmlidXRlQ2FjaGUgPSB7fTtcblxuXHRcdHZhciBsZW4gPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHRoaXMucHJvZ3JhbSwgZ2wuQUNUSVZFX0FUVFJJQlVURVMpO1xuXHRcdGlmICghbGVuKSAvL251bGwgb3IgemVyb1xuXHRcdFx0cmV0dXJuO1x0XG5cblx0XHRmb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHtcblx0XHRcdHZhciBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHRoaXMucHJvZ3JhbSwgaSk7XG5cdFx0XHRpZiAoaW5mbyA9PT0gbnVsbCkgXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0dmFyIG5hbWUgPSBpbmZvLm5hbWU7XG5cblx0XHRcdC8vdGhlIGF0dHJpYiBsb2NhdGlvbiBpcyBhIHNpbXBsZSBpbmRleFxuXHRcdFx0dmFyIGxvY2F0aW9uID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24odGhpcy5wcm9ncmFtLCBuYW1lKTtcblx0XHRcdFxuXHRcdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZVtuYW1lXSA9IHtcblx0XHRcdFx0c2l6ZTogaW5mby5zaXplLFxuXHRcdFx0XHR0eXBlOiBpbmZvLnR5cGUsXG5cdFx0XHRcdGxvY2F0aW9uOiBsb2NhdGlvblxuXHRcdFx0fTtcblx0XHR9XG5cdH0sXG5cblx0X2xvYWRTaGFkZXI6IGZ1bmN0aW9uKHR5cGUsIHNvdXJjZSkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR2YXIgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpO1xuXHRcdGlmICghc2hhZGVyKSAvL3Nob3VsZCBub3Qgb2NjdXIuLi5cblx0XHRcdHJldHVybiAtMTtcblxuXHRcdGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSk7XG5cdFx0Z2wuY29tcGlsZVNoYWRlcihzaGFkZXIpO1xuXHRcdFxuXHRcdGlmICghZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKHNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpICkge1xuXHRcdFx0dmFyIGxvZyA9IGdsLmdldFNoYWRlckluZm9Mb2coc2hhZGVyKTtcblx0XHRcdGlmIChsb2cgPT09IG51bGwpIC8vbWF5IHJldHVybiBudWxsIGFzIHBlciBXZWJHTCBzcGVjXG5cdFx0XHRcdGxvZyA9IFwiRXJyb3IgZXhlY3V0aW5nIGdldFNoYWRlckluZm9Mb2dcIjtcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQvL3dlIGRvIHRoaXMgc28gdGhlIHVzZXIga25vd3Mgd2hpY2ggc2hhZGVyIGhhcyB0aGUgZXJyb3Jcblx0XHRcdFx0dmFyIHR5cGVTdHIgPSAodHlwZSA9PT0gZ2wuVkVSVEVYX1NIQURFUikgPyBcInZlcnRleFwiIDogXCJmcmFnbWVudFwiO1xuXHRcdFx0XHRsb2cgPSBcIkVycm9yIGNvbXBpbGluZyBcIisgdHlwZVN0cisgXCIgc2hhZGVyOlxcblwiK2xvZztcblx0XHRcdH1cblx0XHRcdHRocm93IGxvZztcblx0XHR9XG5cdFx0cmV0dXJuIHNoYWRlcjtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gaW5mbyAoc2l6ZSwgdHlwZSwgbG9jYXRpb24pLlxuXHQgKiBJZiB0aGUgdW5pZm9ybSBpcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLCBpdCBpcyBhc3N1bWVkXG5cdCAqIHRvIG5vdCBleGlzdCwgYW5kIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICpcblx0ICogVGhpcyBtYXkgcmV0dXJuIG51bGwgZXZlbiBpZiB0aGUgdW5pZm9ybSBpcyBkZWZpbmVkIGluIEdMU0w6XG5cdCAqIGlmIGl0IGlzIF9pbmFjdGl2ZV8gKGkuZS4gbm90IHVzZWQgaW4gdGhlIHByb2dyYW0pIHRoZW4gaXQgbWF5XG5cdCAqIGJlIG9wdGltaXplZCBvdXQuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7T2JqZWN0fSBhbiBvYmplY3QgY29udGFpbmluZyBsb2NhdGlvbiwgc2l6ZSwgYW5kIHR5cGVcblx0ICovXG5cdGdldFVuaWZvcm1JbmZvOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMudW5pZm9ybUNhY2hlW25hbWVdIHx8IG51bGw7IFxuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgYXR0cmlidXRlIGluZm8gKHNpemUsIHR5cGUsIGxvY2F0aW9uKS5cblx0ICogSWYgdGhlIGF0dHJpYnV0ZSBpcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLCBpdCBpcyBhc3N1bWVkXG5cdCAqIHRvIG5vdCBleGlzdCwgYW5kIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICpcblx0ICogVGhpcyBtYXkgcmV0dXJuIG51bGwgZXZlbiBpZiB0aGUgYXR0cmlidXRlIGlzIGRlZmluZWQgaW4gR0xTTDpcblx0ICogaWYgaXQgaXMgX2luYWN0aXZlXyAoaS5lLiBub3QgdXNlZCBpbiB0aGUgcHJvZ3JhbSBvciBkaXNhYmxlZCkgXG5cdCAqIHRoZW4gaXQgbWF5IGJlIG9wdGltaXplZCBvdXQuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIGF0dHJpYnV0ZSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtvYmplY3R9IGFuIG9iamVjdCBjb250YWluaW5nIGxvY2F0aW9uLCBzaXplIGFuZCB0eXBlXG5cdCAqL1xuXHRnZXRBdHRyaWJ1dGVJbmZvOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuYXR0cmlidXRlQ2FjaGVbbmFtZV0gfHwgbnVsbDsgXG5cdH0sXG5cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gbG9jYXRpb24gb2JqZWN0LlxuXHQgKiBJZiB0aGUgdW5pZm9ybSBpcyBub3QgZm91bmQsIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtHTGludH0gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKi9cblx0Z2V0QXR0cmlidXRlTG9jYXRpb246IGZ1bmN0aW9uKG5hbWUpIHsgLy9UT0RPOiBtYWtlIGZhc3RlciwgZG9uJ3QgY2FjaGVcblx0XHR2YXIgaW5mbyA9IHRoaXMuZ2V0QXR0cmlidXRlSW5mbyhuYW1lKTtcblx0XHRyZXR1cm4gaW5mbyA/IGluZm8ubG9jYXRpb24gOiBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBsb2NhdGlvbiBvYmplY3QuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7V2ViR0xVbmlmb3JtTG9jYXRpb259IHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICovXG5cdGdldFVuaWZvcm1Mb2NhdGlvbjogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBpbmZvID0gdGhpcy5nZXRVbmlmb3JtSW5mbyhuYW1lKTtcblx0XHRyZXR1cm4gaW5mbyA/IGluZm8ubG9jYXRpb24gOiBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHVuaWZvcm0gaXMgYWN0aXZlIGFuZCBmb3VuZCBpbiB0aGlzXG5cdCAqIGNvbXBpbGVkIHByb2dyYW0uXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9ICBuYW1lIHRoZSB1bmlmb3JtIG5hbWVcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gdHJ1ZSBpZiB0aGUgdW5pZm9ybSBpcyBmb3VuZCBhbmQgYWN0aXZlXG5cdCAqL1xuXHRoYXNVbmlmb3JtOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VW5pZm9ybUluZm8obmFtZSkgIT09IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgYXR0cmlidXRlIGlzIGFjdGl2ZSBhbmQgZm91bmQgaW4gdGhpc1xuXHQgKiBjb21waWxlZCBwcm9ncmFtLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSAgbmFtZSB0aGUgYXR0cmlidXRlIG5hbWVcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gdHJ1ZSBpZiB0aGUgYXR0cmlidXRlIGlzIGZvdW5kIGFuZCBhY3RpdmVcblx0ICovXG5cdGhhc0F0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdldEF0dHJpYnV0ZUluZm8obmFtZSkgIT09IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHVuaWZvcm0gdmFsdWUgYnkgbmFtZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHthbnl9IFRoZSB2YWx1ZSBvZiB0aGUgV2ViR0wgdW5pZm9ybVxuXHQgKi9cblx0Z2V0VW5pZm9ybTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdsLmdldFVuaWZvcm0odGhpcy5wcm9ncmFtLCB0aGlzLmdldFVuaWZvcm1Mb2NhdGlvbihuYW1lKSk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHVuaWZvcm0gdmFsdWUgYXQgdGhlIHNwZWNpZmllZCBXZWJHTFVuaWZvcm1Mb2NhdGlvbi5cblx0ICogXG5cdCAqIEBwYXJhbSAge1dlYkdMVW5pZm9ybUxvY2F0aW9ufSBsb2NhdGlvbiB0aGUgbG9jYXRpb24gb2JqZWN0XG5cdCAqIEByZXR1cm4ge2FueX0gVGhlIHZhbHVlIG9mIHRoZSBXZWJHTCB1bmlmb3JtXG5cdCAqL1xuXHRnZXRVbmlmb3JtQXQ6IGZ1bmN0aW9uKGxvY2F0aW9uKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2wuZ2V0VW5pZm9ybSh0aGlzLnByb2dyYW0sIGxvY2F0aW9uKTtcblx0fSxcblx0XG5cdHNldFVuaWZvcm06IGZ1bmN0aW9uKG5hbWUsIHR5cGUsIGFyZ3MpIHtcblx0XHQvL2ZpcnN0IGxvb2sgaW4gY2FjaGVcblx0XHQvL2lmIG5vdCBmb3VuZCxcblx0fSxcblxuXHRnZXRVbmlmb3JtOiBmdW5jdGlvbihuYW1lKSB7XG5cblx0fSxcblxuXHRiaW5kOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsLnVzZVByb2dyYW0odGhpcy5wcm9ncmFtKTtcblx0fSxcblxuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLmRldGFjaFNoYWRlcih0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmRldGFjaFNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXG5cdFx0Z2wuZGVsZXRlU2hhZGVyKHRoaXMudmVydFNoYWRlcik7XG5cdFx0Z2wuZGVsZXRlU2hhZGVyKHRoaXMuZnJhZ1NoYWRlcik7XG5cblx0XHRnbC5kZWxldGVQcm9ncmFtKHRoaXMucHJvZ3JhbSk7XG5cdFx0dGhpcy5wcm9ncmFtID0gbnVsbDtcblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gU2hhZGVyUHJvZ3JhbTsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCdqc09PUCcpLkNsYXNzO1xuXG52YXIgVGV4dHVyZSA9IG5ldyBDbGFzcyh7XG5cblx0aWQ6IG51bGwsXG5cdHRhcmdldDogbnVsbCxcblx0d2lkdGg6IDAsXG5cdGhlaWdodDogMCxcblx0d3JhcDogbnVsbCxcblx0ZmlsdGVyOiBudWxsLFxuXG5cdF9fbWFuYWdlZDogZmFsc2UsXG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyB0ZXh0dXJlIGlzICdtYW5hZ2VkJyBhbmQgd2lsbCBiZSByZXN0b3JlZCBvbiBjb250ZXh0IGxvc3MuXG5cdCAqIElmIG5vIGltYWdlIHByb3ZpZGVyIGlzIHVzZWRcblx0ICogXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0bWFuYWdlZDoge1xuXHRcdGdldDogZnVuY3Rpb24oKSB7IFxuXHRcdFx0cmV0dXJuIHRoaXMuX19tYW5hZ2VkOyBcblx0XHR9XG5cblx0XHQvL1RPRE86IGFkZCB0byBjYWNoZSB3aGVuIHVzZXIgc2V0cyBtYW5hZ2VkID0gdHJ1ZVxuXHRcdC8vIHNldDogZnVuY3Rpb24odmFsKSB7XG5cblx0XHQvLyB9XG5cdH0sXG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgdGV4dHVyZSB3aXRoIHRoZSBvcHRpb25hbCBkYXRhIHByb3ZpZGVyLlxuXHQgKlxuXHQgKiBBIGRhdGEgcHJvdmlkZXIgaXMgYSBmdW5jdGlvbiB3aGljaCBpcyBjYWxsZWQgYnkgVGV4dHVyZVxuXHQgKiBvbiBpbnRpaWFsaXphdGlvbiwgYW5kIHN1YnNlcXVlbnRseSBvbiBhbnkgY29udGV4dCByZXN0b3JhdGlvbi5cblx0ICogVGhpcyBhbGxvd3MgaW1hZ2VzIHRvIGJlIHJlLWxvYWRlZCB3aXRob3V0IHRoZSBuZWVkIHRvIGtlZXBcblx0ICogdGhlbSBoYW5naW5nIGFyb3VuZCBpbiBtZW1vcnkuIFRoaXMgYWxzbyBtZWFucyB0aGF0IHByb2NlZHVyYWxcblx0ICogdGV4dHVyZXMgd2lsbCBiZSByZS1jcmVhdGVkIHByb3Blcmx5IG9uIGNvbnRleHQgcmVzdG9yZS5cblx0ICpcblx0ICogQ2FsbGluZyB0aGlzIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIHdpbGwgcmVzdWx0IGluIGFuIEVycm9yLlxuXHQgKlxuXHQgKiBJZiB0aGlzIGNvbnN0cnVjdG9yIGlzIGNhbGxlZCB3aXRoIG9ubHkgdGhlIGNvbnRleHQgKG9uZSBhcmd1bWVudCksXG5cdCAqIHRoZW4gbm8gcHJvdmlkZXIgaXMgdXNlZCBhbmQgdGhlIHRleHR1cmUgd2lsbCBiZSB1bm1hbmFnZWQgYW5kIGl0cyB3aWR0aFxuXHQgKiBhbmQgaGVpZ2h0IHdpbGwgYmUgemVyby5cblx0ICogXG5cdCAqIElmIHRoZSBzZWNvbmQgYXJndW1lbnQgaXMgYSBzdHJpbmcsIHdlIHdpbGwgdXNlIHRoZSBkZWZhdWx0IEltYWdlUHJvdmlkZXIgXG5cdCAqIHRvIGxvYWQgdGhlIHRleHR1cmUgaW50byB0aGUgR1BVIGFzeW5jaHJvbm91c2x5LiBVc2FnZTpcblx0ICpcblx0ICogICAgIG5ldyBUZXh0dXJlKGNvbnRleHQsIFwicGF0aC9pbWcucG5nXCIpO1xuXHQgKiAgICAgbmV3IFRleHR1cmUoY29udGV4dCwgXCJwYXRoL2ltZy5wbmdcIiwgb25sb2FkQ2FsbGJhY2ssIG9uZXJyb3JDYWxsYmFjayk7XG5cdCAqXG5cdCAqIFRoZSBjYWxsYmFja3Mgd2lsbCBiZSBmaXJlZCBldmVyeSB0aW1lIHRoZSBpbWFnZSBpcyByZS1sb2FkZWQsIGV2ZW4gb24gY29udGV4dFxuXHQgKiByZXN0b3JlLlxuXHQgKlxuXHQgKiBJZiB0aGUgc2Vjb25kIGFuZCB0aGlyZCBhcmd1bWVudHMgYXJlIE51bWJlcnMsIHdlIHdpbGwgdXNlIHRoZSBkZWZhdWx0XG5cdCAqIEFycmF5UHJvdmlkZXIsIHdoaWNoIHRha2VzIGluIGEgQXJyYXlCdWZmZXJWaWV3IG9mIHBpeGVscy4gVGhpcyBhbGxvd3Ncblx0ICogdXMgdG8gY3JlYXRlIHRleHR1cmVzIHN5bmNocm9ub3VzbHkgbGlrZSBzbzpcblx0ICpcblx0ICogICAgIG5ldyBUZXh0dXJlKGNvbnRleHQsIDI1NiwgMjU2KTsgLy91c2VzIGVtcHR5IGRhdGEsIHRyYW5zcGFyZW50IGJsYWNrXG5cdCAqICAgICBuZXcgVGV4dHVyZShjb250ZXh0LCAyNTYsIDI1NiwgZ2wuTFVNSU5BTkNFKTsgLy9lbXB0eSBkYXRhIGFuZCBMVU1JTkFOQ0UgZm9ybWF0XG5cdCAqICAgICBuZXcgVGV4dHVyZShjb250ZXh0LCAyNTYsIDI1NiwgZ2wuTFVNSU5BTkNFLCBnbC5VTlNJR05FRF9CWVRFLCBieXRlQXJyYXkpOyAvL2N1c3RvbSBkYXRhXG5cdCAqXG5cdCAqIE90aGVyd2lzZSwgd2Ugd2lsbCBhc3N1bWUgdGhhdCBhIGN1c3RvbSBwcm92aWRlciBpcyBzcGVjaWZpZWQuIEluIHRoaXMgY2FzZSwgdGhlIHNlY29uZFxuXHQgKiBhcmd1bWVudCBpcyBhIHByb3ZpZGVyIGZ1bmN0aW9uLCBhbmQgdGhlIHN1YnNlcXVlbnQgYXJndW1lbnRzIGFyZSB0aG9zZSB3aGljaCB3aWxsIGJlIHBhc3NlZCBcblx0ICogdG8gdGhlIHByb3ZpZGVyLiBUaGUgcHJvdmlkZXIgZnVuY3Rpb24gYWx3YXlzIHJlY2VpdmVzIHRoZSB0ZXh0dXJlIG9iamVjdCBhcyB0aGUgZmlyc3QgYXJndW1lbnQsXG5cdCAqIGFuZCB0aGVuIGFueSBvdGhlcnMgdGhhdCBtYXkgaGF2ZSBiZWVuIHBhc3NlZCB0byBpdC4gRm9yIGV4YW1wbGUsIGhlcmUgaXMgYSBiYXNpYyBJbWFnZVByb3ZpZGVyIFxuXHQgKiBpbXBsZW1lbnRhdGlvbjpcblx0ICpcblx0ICogICAgIC8vdGhlIHByb3ZpZGVyIGZ1bmN0aW9uXG5cdCAqICAgICB2YXIgSW1hZ2VQcm92aWRlciA9IGZ1bmN0aW9uKHRleHR1cmUsIHBhdGgpIHtcblx0ICogICAgICAgICB2YXIgaW1nID0gbmV3IEltYWdlKCk7XG5cdCAqICAgICAgICAgaW1nLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuXHQgKiAgICBcdCAgICAgICB0ZXh0dXJlLnVwbG9hZEltYWdlKGltZyk7XG5cdCAqICAgICAgICAgfS5iaW5kKHRoaXMpO1xuXHQgKiAgICAgICAgIGltZy5zcmMgPSBwYXRoO1xuXHQgKiAgICAgfTtcblx0ICpcblx0ICogICAgIC8vbG9hZHMgdGhlIGltYWdlIGFzeW5jaHJvbm91c2x5XG5cdCAqICAgICB2YXIgdGV4ID0gbmV3IFRleHR1cmUoY29udGV4dCwgSW1hZ2VQcm92aWRlciwgXCJteWltZy5wbmdcIik7XG5cdCAqXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtXZWJHTENvbnRleHR9IGdsIHRoZSBXZWJHTCBjb250ZXh0XG5cdCAqIEBwYXJhbSAge0Z1bmN0aW9ufSBwcm92aWRlciBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gYXJncyAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcmV0dXJuIHtbdHlwZV19ICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKGNvbnRleHQpIHtcblx0XHRpZiAoIWNvbnRleHQgfHwgYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcblx0XHRcdHRocm93IFwibm8gV2ViR0xDYW52YXMgc3BlY2lmaWVkXCI7XG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0XHRcblx0XHR2YXIgcHJvdmlkZXJBcmdzID0gW3RoaXNdO1xuXHRcdHZhciBwcm92aWRlciA9IG51bGw7XG5cblx0XHQvLyBlLmcuIC0tPiBuZXcgVGV4dHVyZShnbCwgXCJteXBhdGguanBnXCIpXG5cdFx0Ly8gXHRcdFx0bmV3IFRleHR1cmUoZ2wsIFwibXlwYXRoLmpwZ1wiLCBnbC5SR0IpXG5cdFx0Ly9cdFx0XHRuZXcgVGV4dHVyZShnbCwgbXlQcm92aWRlciwgYXJnMCwgYXJnMSlcblx0XHQvLyAgICAgICAgICBuZXcgVGV4dHVyZShnbCwgVGV4dHVyZS5JbWFnZVByb3ZpZGVyLCBcIm15cGF0aC5qcGdcIiwgZ2wuUkdCKVxuXHRcdC8vXHRcdFx0bmV3IFRleHR1cmUoZ2wsIFRleHR1ZXIuQXJyYXlQcm92aWRlciwgMjU2LCAyNTYpXG5cdFx0Ly9cdFx0XHRuZXcgVGV4dHVyZShnbCwgMjU2LCAyNTYsIGdsLlJHQiwgZ2wuVU5TSUdORURfQllURSwgZGF0YSk7XG5cblx0XHQvL3dlIGFyZSB3b3JraW5nIHdpdGggYSBwcm92aWRlciBvZiBzb21lIGtpbmQuLi5cblx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHZhciBzbGljZWRBcmdzID0gW107XG5cblx0XHRcdC8vZGV0ZXJtaW5lIHRoZSBwcm92aWRlciwgaWYgYW55Li4uXG5cdFx0XHRpZiAodHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0XHRwcm92aWRlciA9IFRleHR1cmUuSW1hZ2VQcm92aWRlcjtcblx0XHRcdFx0c2xpY2VkQXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSlcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdHByb3ZpZGVyID0gYXJndW1lbnRzWzFdO1xuXHRcdFx0XHRzbGljZWRBcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcblx0XHRcdH0gZWxzZSBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDIgXG5cdFx0XHRcdFx0XHQmJiB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcIm51bWJlclwiIFxuXHRcdFx0XHRcdFx0JiYgdHlwZW9mIGFyZ3VtZW50c1syXSA9PT0gXCJudW1iZXJcIikge1xuXHRcdFx0XHRwcm92aWRlciA9IFRleHR1cmUuQXJyYXlQcm92aWRlcjtcblx0XHRcdFx0c2xpY2VkQXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vY29uY2F0IHdpdGggdGV4dHVyZSBhcyBmaXJzdCBwYXJhbVxuXHRcdFx0cHJvdmlkZXJBcmdzID0gcHJvdmlkZXJBcmdzLmNvbmNhdChzbGljZWRBcmdzKTtcblx0XHR9XG5cblx0XHQvL3RoZSBwcm92aWRlciBhbmQgaXRzIGFyZ3MsIG1heSBiZSBudWxsLi4uXG5cdFx0dGhpcy5wcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdHRoaXMucHJvdmlkZXJBcmdzID0gcHJvdmlkZXJBcmdzO1xuXG5cdFx0Ly9pZiBhIHByb3ZpZGVyIGlzIHNwZWNpZmllZCwgaXQgd2lsbCBiZSBtYW5hZ2VkIGJ5IFdlYkdMQ2FudmFzXG5cdFx0dGhpcy5fX21hbmFnZWQgPSB0aGlzLnByb3ZpZGVyICE9PSBudWxsO1xuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXG5cdFx0Ly9pZiB3ZSBoYXZlIGEgcHJvdmlkZXIsIGludm9rZSBpdFxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH0sXG5cblx0Ly9jYWxsZWQgYWZ0ZXIgdGhlIGNvbnRleHQgaGFzIGJlZW4gcmUtaW5pdGlhbGl6ZWRcblx0Y3JlYXRlOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsID0gdGhpcy5jb250ZXh0LmdsOyBcblx0XHR0aGlzLmlkID0gdGhpcy5nbC5jcmVhdGVUZXh0dXJlKCk7IC8vdGV4dHVyZSBJRCBpcyByZWNyZWF0ZWRcblx0XHR0aGlzLndpZHRoID0gdGhpcy5oZWlnaHQgPSAwOyAvL3NpemUgaXMgcmVzZXQgdG8gemVybyB1bnRpbCBsb2FkZWRcblx0XHR0aGlzLnRhcmdldCA9IHRoaXMuZ2wuVEVYVFVSRV8yRDsgIC8vdGhlIHByb3ZpZGVyIGNhbiBjaGFuZ2UgdGhpcyBpZiBuZWNlc3NhcnkgKGUuZy4gY3ViZSBtYXBzKVxuXG5cdFx0Ly9UT0RPOiBzZXQgZmlsdGVyICYgd3JhcCBiYXNlZCBvbiBsYXN0LCBvciBhIGRlZmF1bHRcblxuXHRcdC8vbG9hZCB0aGUgZGF0YVxuXHRcdGlmICh0aGlzLnByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLnByb3ZpZGVyLmFwcGx5KHRoaXMsIHRoaXMucHJvdmlkZXJBcmdzKTtcblx0XHR9XG5cdH0sXG5cblx0c2V0RmlsdGVyOiBmdW5jdGlvbihtb2RlKSB7XG5cdFx0dGhpcy5iaW5kKCk7XG5cdFx0Ly8uLi5cblx0fSxcblxuXHQvKipcblx0ICogQSBsb3ctbGV2ZWwgbWV0aG9kIHRvIHVwbG9hZCB0aGUgc3BlY2lmaWVkIEFycmF5QnVmZmVyVmlld1xuXHQgKiB0byB0aGlzIHRleHR1cmUuIFRoaXMgd2lsbCBjYXVzZSB0aGUgd2lkdGggYW5kIGhlaWdodCBvZiB0aGlzXG5cdCAqIHRleHR1cmUgdG8gY2hhbmdlLlxuXHQgKiBcblx0ICogQHBhcmFtICB7TnVtYmVyfSB3aWR0aCAgICAgICAgICB0aGUgbmV3IHdpZHRoIG9mIHRoaXMgdGV4dHVyZSxcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0cyB0byB0aGUgbGFzdCB1c2VkIHdpZHRoIChvciB6ZXJvKVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCAgICAgICAgIHRoZSBuZXcgaGVpZ2h0IG9mIHRoaXMgdGV4dHVyZVxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRzIHRvIHRoZSBsYXN0IHVzZWQgaGVpZ2h0IChvciB6ZXJvKVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IGZvcm1hdCAgICAgICAgIHRoZSBkYXRhIGZvcm1hdCwgZGVmYXVsdCBSR0JBXG5cdCAqIEBwYXJhbSAge0dMZW51bX0gdHlwZSAgICAgICAgICAgdGhlIGRhdGEgdHlwZSwgZGVmYXVsdCBVTlNJR05FRF9CWVRFIChVaW50OEFycmF5KVxuXHQgKiBAcGFyYW0gIHtBcnJheUJ1ZmZlclZpZXd9IGRhdGEgIHRoZSByYXcgZGF0YSBmb3IgdGhpcyB0ZXh0dXJlLCBvciBudWxsIGZvciBhbiBlbXB0eSBpbWFnZVxuXHQgKi9cblx0dXBsb2FkRGF0YTogZnVuY3Rpb24od2lkdGgsIGhlaWdodCwgZm9ybWF0LCB0eXBlLCBkYXRhKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHRoaXMuZm9ybWF0ID0gZm9ybWF0IHx8IGdsLlJHQkE7XG5cdFx0dHlwZSA9IHR5cGUgfHwgZ2wuVU5TSUdORURfQllURTtcblx0XHRkYXRhID0gZGF0YSB8fCBudWxsOyAvL21ha2Ugc3VyZSBmYWxzZXkgdmFsdWUgaXMgbnVsbCBmb3IgdGV4SW1hZ2UyRFxuXG5cdFx0dGhpcy53aWR0aCA9ICh3aWR0aCB8fCB3aWR0aD09MCkgPyB3aWR0aCA6IHRoaXMud2lkdGg7XG5cdFx0dGhpcy5oZWlnaHQgPSAoaGVpZ2h0IHx8IGhlaWdodD09MCkgPyBoZWlnaHQgOiB0aGlzLmhlaWdodDtcblxuXHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0Z2wudGV4SW1hZ2UyRCh0aGlzLnRhcmdldCwgMCwgdGhpcy5mb3JtYXQsIFxuXHRcdFx0XHRcdCAgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQsIDAsIHRoaXMuZm9ybWF0LFxuXHRcdFx0XHRcdCAgdHlwZSwgZGF0YSk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFVwbG9hZHMgSW1hZ2VEYXRhLCBIVE1MSW1hZ2VFbGVtZW50LCBIVE1MQ2FudmFzRWxlbWVudCBvciBcblx0ICogSFRNTFZpZGVvRWxlbWVudC5cblx0ICogXHRcblx0ICogQHBhcmFtICB7T2JqZWN0fSBkb21PYmplY3QgdGhlIERPTSBpbWFnZSBjb250YWluZXJcblx0ICovXG5cdHVwbG9hZEltYWdlOiBmdW5jdGlvbihkb21PYmplY3QsIGZvcm1hdCwgdHlwZSkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLmZvcm1hdCA9IGZvcm1hdCB8fCBnbC5SR0JBO1xuXHRcdHR5cGUgPSB0eXBlIHx8IGdsLlVOU0lHTkVEX0JZVEU7XG5cdFx0XG5cdFx0dGhpcy53aWR0aCA9IGRvbU9iamVjdC53aWR0aDtcblx0XHR0aGlzLmhlaWdodCA9IGRvbU9iamVjdC5oZWlnaHQ7XG5cblx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdGdsLnRleEltYWdlMkQodGhpcy50YXJnZXQsIDAsIHRoaXMuZm9ybWF0LCB0aGlzLmZvcm1hdCxcblx0XHRcdFx0XHQgIHR5cGUsIGRvbU9iamVjdCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEJpbmRzIHRoZSB0ZXh0dXJlLiBJZiB1bml0IGlzIHNwZWNpZmllZCxcblx0ICogaXQgd2lsbCBiaW5kIHRoZSB0ZXh0dXJlIGF0IHRoZSBnaXZlbiBzbG90XG5cdCAqIChURVhUVVJFMCwgVEVYVFVSRTEsIGV0YykuIElmIHVuaXQgaXMgbm90IHNwZWNpZmllZCxcblx0ICogaXQgd2lsbCBzaW1wbHkgYmluZCB0aGUgdGV4dHVyZSBhdCB3aGljaGV2ZXIgc2xvdFxuXHQgKiBpcyBjdXJyZW50bHkgYWN0aXZlLlxuXHQgKiBcblx0ICogQHBhcmFtICB7TnVtYmVyfSB1bml0IHRoZSB0ZXh0dXJlIHVuaXQgaW5kZXgsIHN0YXJ0aW5nIGF0IDBcblx0ICovXG5cdGJpbmQ6IGZ1bmN0aW9uKHVuaXQpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGlmICh1bml0IHx8IHVuaXQgPT09IDApXG5cdFx0XHRnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwICsgdW5pdCk7XG5cdFx0Z2wuYmluZFRleHR1cmUodGhpcy50YXJnZXQsIHRoaXMuaWQpO1xuXHR9XG59KTtcblxuVGV4dHVyZS5GaWx0ZXIgPSB7XG5cdE5FQVJFU1Q6IDk3MjgsXG5cdE5FQVJFU1RfTUlQTUFQX0xJTkVBUjogOTk4Nixcblx0TkVBUkVTVF9NSVBNQVBfTkVBUkVTVDogOTk4NCxcblx0TElORUFSOiA5NzI5LFxuXHRMSU5FQVJfTUlQTUFQX0xJTkVBUjogOTk4Nyxcblx0TElORUFSX01JUE1BUF9ORUFSRVNUOiA5OTg1XG59O1xuXG5UZXh0dXJlLldyYXAgPSB7XG5cdENMQU1QX1RPX0VER0U6IDMzMDcxLFxuXHRNSVJST1JFRF9SRVBFQVQ6IDMzNjQ4LFxuXHRSRVBFQVQ6IDEwNDk3XG59O1xuXG5UZXh0dXJlLkZvcm1hdCA9IHtcblx0REVQVEhfQ09NUE9ORU5UOiA2NDAyLFxuXHRBTFBIQTogNjQwNixcblx0UkdCQTogNjQwOCxcblx0UkdCOiA2NDA3LFxuXHRMVU1JTkFOQ0U6IDY0MDksXG5cdExVTUlOQU5DRV9BTFBIQTogNjQxMFxufTtcblxuLyoqXG4gKiBUaGlzIGlzIGEgXCJwcm92aWRlclwiIGZ1bmN0aW9uIGZvciBpbWFnZXMsIGJhc2VkIG9uIHRoZSBnaXZlblxuICogcGF0aCAoc3JjKSBhbmQgb3B0aW9uYWwgY2FsbGJhY2tzLCBXZWJHTCBmb3JtYXQgYW5kIHR5cGUgb3B0aW9ucy5cbiAqXG4gKiBUaGUgY2FsbGJhY2tzIGFyZSBjYWxsZWQgZnJvbSB0aGUgVGV4dHVyZSBzY29wZTsgYnV0IGFsc28gcGFzc2VkIHRoZVxuICogdGV4dHVyZSB0byB0aGUgZmlyc3QgYXJndW1lbnQgKGluIGNhc2UgdGhlIHVzZXIgd2lzaGVzIHRvIHJlLWJpbmQgdGhlIFxuICogZnVuY3Rpb25zIHRvIHNvbWV0aGluZyBlbHNlKS5cbiAqIFxuICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIHdoaWNoIGlzIGJlaW5nIGFjdGVkIG9uXG4gKiBAcGFyYW0ge1N0cmluZ30gcGF0aCAgICAgdGhlIHBhdGggdG8gdGhlIGltYWdlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvbkxvYWQgdGhlIGNhbGxiYWNrIGFmdGVyIHRoZSBpbWFnZSBoYXMgYmVlbiBsb2FkZWQgYW5kIHVwbG9hZGVkIHRvIEdQVVxuICogQHBhcmFtIHtGdW5jdGlvbn0gb25FcnIgIHRoZSBjYWxsYmFjayBpZiB0aGVyZSB3YXMgYW4gZXJyb3Igd2hpbGUgbG9hZGluZyB0aGUgaW1hZ2VcbiAqIEBwYXJhbSB7R0xlbnVtfSBmb3JtYXQgICB0aGUgR0wgdGV4dHVyZSBmb3JtYXQgKGRlZmF1bHQgUkdCQSlcbiAqIEBwYXJhbSB7R0xlbnVtfSB0eXBlICAgICB0aGUgR0wgdGV4dHVyZSB0eXBlIChkZWZhdWx0IFVOU0lHTkVEX0JZVEUpXG4gKi9cblRleHR1cmUuSW1hZ2VQcm92aWRlciA9IGZ1bmN0aW9uKHRleHR1cmUsIHBhdGgsIG9uTG9hZCwgb25FcnIsIGZvcm1hdCwgdHlwZSkge1xuXHR2YXIgaW1nID0gbmV3IEltYWdlKCk7XG5cdGltZy5vbmxvYWQgPSBmdW5jdGlvbigpIHtcblx0XHR0ZXh0dXJlLnVwbG9hZEltYWdlKGltZywgZm9ybWF0LCB0eXBlKTtcblx0XHRpZiAob25Mb2FkICYmIHR5cGVvZiBvbkxvYWQgPT09IFwiZnVuY3Rpb25cIilcblx0XHRcdG9uTG9hZC5jYWxsKHRleHR1cmUsIHRleHR1cmUpO1xuXHR9O1xuXHRcblx0aW1nLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcblx0XHRpZiAob25FcnIgJiYgdHlwZW9mIG9uRXJyID09PSBcImZ1bmN0aW9uXCIpIFxuXHRcdFx0b25FcnIuY2FsbCh0ZXh0dXJlLCB0ZXh0dXJlKTtcblx0fTtcblxuXHRpbWcuc3JjID0gcGF0aDtcbn07XG5cbi8qKlxuICogVGhpcyBpcyBhIFwicHJvdmlkZXJcIiBmdW5jdGlvbiBmb3Igc3luY2hyb25vdXMgQXJyYXlCdWZmZXJWaWV3IHBpeGVsIHVwbG9hZHMuXG4gKiBcbiAqIEBwYXJhbSAge1RleHR1cmV9IHRleHR1cmUgIFx0ICAgdGhlIHRleHR1cmUgd2hpY2ggaXMgYmVpbmcgYWN0ZWQgb25cbiAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICAgICAgICAgdGhlIHdpZHRoIG9mIHRoaXMgdGV4dHVyZSxcbiAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0ICAgICAgICAgdGhlIGhlaWdodCBvZiB0aGlzIHRleHR1cmVcbiAqIEBwYXJhbSAge0dMZW51bX0gZm9ybWF0ICAgICAgICAgdGhlIGRhdGEgZm9ybWF0LCBkZWZhdWx0IFJHQkFcbiAqIEBwYXJhbSAge0dMZW51bX0gdHlwZSAgICAgICAgICAgdGhlIGRhdGEgdHlwZSwgZGVmYXVsdCBVTlNJR05FRF9CWVRFIChVaW50OEFycmF5KVxuICogQHBhcmFtICB7QXJyYXlCdWZmZXJWaWV3fSBkYXRhICB0aGUgcmF3IGRhdGEgZm9yIHRoaXMgdGV4dHVyZSwgb3IgbnVsbCBmb3IgYW4gZW1wdHkgaW1hZ2VcbiAqL1xuVGV4dHVyZS5BcnJheVByb3ZpZGVyID0gZnVuY3Rpb24odGV4dHVyZSwgd2lkdGgsIGhlaWdodCwgZm9ybWF0LCB0eXBlLCBkYXRhKSB7XG5cdHRleHR1cmUudXBsb2FkRGF0YSh3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUsIGRhdGEpO1xufTtcblxuLyoqXG4gKiBVdGlsaXR5IHRvIGdldCB0aGUgbnVtYmVyIG9mIGNvbXBvbmVudHMgZm9yIHRoZSBnaXZlbiBHTGVudW0sIGUuZy4gZ2wuUkdCQSByZXR1cm5zIDQuXG4gKiBSZXR1cm5zIG51bGwgaWYgdGhlIHNwZWNpZmllZCBmb3JtYXQgaXMgbm90IG9mIHR5cGUgREVQVEhfQ09NUE9ORU5ULCBBTFBIQSwgTFVNSU5BTkNFLFxuICogTFVNSU5BTkNFX0FMUEhBLCBSR0IsIG9yIFJHQkEuXG4gKlxuICogQG1ldGhvZFxuICogQHN0YXRpY1xuICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgYSB0ZXh0dXJlIGZvcm1hdCwgaS5lLiBUZXh0dXJlLkZvcm1hdC5SR0JBXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IHRoZSBudW1iZXIgb2YgY29tcG9uZW50cyBmb3IgdGhpcyBmb3JtYXRcbiAqL1xuVGV4dHVyZS5nZXROdW1Db21wb25lbnRzID0gZnVuY3Rpb24oZm9ybWF0KSB7XG5cdHN3aXRjaCAoZm9ybWF0KSB7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5ERVBUSF9DT01QT05FTlQ6XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5BTFBIQTpcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkxVTUlOQU5DRTpcblx0XHRcdHJldHVybiAxO1xuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuTFVNSU5BTkNFX0FMUEhBOlxuXHRcdFx0cmV0dXJuIDI7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5SR0I6XG5cdFx0XHRyZXR1cm4gMztcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LlJHQkE6XG5cdFx0XHRyZXR1cm4gNDtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn07XG5cbi8vVW5tYW5hZ2VkIHRleHR1cmVzOlxuLy9cdEhUTUwgZWxlbWVudHMgbGlrZSBJbWFnZSwgVmlkZW8sIENhbnZhc1xuLy9cdHBpeGVscyBidWZmZXIgZnJvbSBDYW52YXNcbi8vXHRwaXhlbHMgYXJyYXlcblxuLy9OZWVkIHNwZWNpYWwgaGFuZGxpbmc6XG4vLyAgY29udGV4dC5vbkNvbnRleHRMb3N0LmFkZChmdW5jdGlvbigpIHtcbi8vICBcdGNyZWF0ZUR5bmFtaWNUZXh0dXJlKCk7XG4vLyAgfS5iaW5kKHRoaXMpKTtcblxuLy9NYW5hZ2VkIHRleHR1cmVzOlxuLy9cdGltYWdlcyBzcGVjaWZpZWQgd2l0aCBhIHBhdGhcbi8vXHR0aGlzIHdpbGwgdXNlIEltYWdlIHVuZGVyIHRoZSBob29kXG5cblxuXG5tb2R1bGUuZXhwb3J0cyA9IFRleHR1cmU7IiwidmFyIENsYXNzID0gcmVxdWlyZSgnanNPT1AnKS5DbGFzcztcblxuLy9UT0RPOiBkZWNvdXBsZSBpbnRvIFZCTyArIElCTyB1dGlsaXRpZXMgXG52YXIgVmVydGV4RGF0YSA9IG5ldyBDbGFzcyh7XG5cblx0Y29udGV4dDogbnVsbCxcblx0Z2w6IG51bGwsXG5cblx0bnVtVmVydHM6IG51bGwsXG5cdG51bUluZGljZXM6IG51bGwsXG5cdFxuXHR2ZXJ0aWNlczogbnVsbCxcblx0aW5kaWNlczogbnVsbCxcblx0dmVydGV4QnVmZmVyOiBudWxsLFxuXHRpbmRleEJ1ZmZlcjogbnVsbCxcblxuXHR2ZXJ0aWNlc0RpcnR5OiB0cnVlLFxuXHRpbmRpY2VzRGlydHk6IHRydWUsXG5cdGluZGV4VXNhZ2U6IG51bGwsXG5cdHZlcnRleFVzYWdlOiBudWxsLFxuXG5cdC8qKiBcblx0ICogQHByb3BlcnR5XG5cdCAqIEBwcml2YXRlXG5cdCAqL1xuXHRfdmVydGV4QXR0cmliczogbnVsbCxcblxuXHQvKiogXG5cdCAqIEBwcm9wZXJ0eVxuXHQgKiBAcHJpdmF0ZVxuXHQgKi9cblx0X3ZlcnRleFN0cmlkZTogbnVsbCxcblxuXHQvKipcblx0ICogQSB3cml0ZS1vbmx5IHByb3BlcnR5IHdoaWNoIHNldHMgYm90aCB2ZXJ0aWNlcyBhbmQgaW5kaWNlcyBcblx0ICogZmxhZyB0byBkaXJ0eSBvciBub3QuXG5cdCAqXG5cdCAqIEBwcm9wZXJ0eVxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICogQHdyaXRlT25seVxuXHQgKi9cblx0ZGlydHk6IHtcblx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gdmFsO1xuXHRcdFx0dGhpcy5pbmRpY2VzRGlydHkgPSB2YWw7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IFZlcnRleERhdGEgd2l0aCB0aGUgcHJvdmlkZWQgcGFyYW1ldGVycy5cblx0ICpcblx0ICogSWYgbnVtSW5kaWNlcyBpcyAwIG9yIGZhbHN5LCBubyBpbmRleCBidWZmZXIgd2lsbCBiZSB1c2VkXG5cdCAqIGFuZCBpbmRpY2VzIHdpbGwgYmUgYW4gZW1wdHkgQXJyYXlCdWZmZXIgYW5kIGEgbnVsbCBpbmRleEJ1ZmZlci5cblx0ICogXG5cdCAqIElmIGlzU3RhdGljIGlzIHRydWUsIHRoZW4gdmVydGV4VXNhZ2UgYW5kIGluZGV4VXNhZ2Ugd2lsbFxuXHQgKiBiZSBzZXQgdG8gZ2wuU1RBVElDX0RSQVcuIE90aGVyd2lzZSB0aGV5IHdpbGwgdXNlIGdsLkRZTkFNSUNfRFJBVy5cblx0ICogWW91IG1heSB3YW50IHRvIGFkanVzdCB0aGVzZSBhZnRlciBpbml0aWFsaXphdGlvbiBmb3IgZnVydGhlciBjb250cm9sLlxuXHQgKiBcblx0ICogQHBhcmFtICB7V2ViR0xDb250ZXh0fSAgY29udGV4dCB0aGUgY29udGV4dCBmb3IgbWFuYWdlbWVudFxuXHQgKiBAcGFyYW0gIHtCb29sZWFufSBpc1N0YXRpYyAgICAgIGEgaGludCBhcyB0byB3aGV0aGVyIHRoaXMgZ2VvbWV0cnkgaXMgc3RhdGljXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gIG51bVZlcnRzICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19ICBudW1JbmRpY2VzICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSAgdmVydGV4QXR0cmlicyBbZGVzY3JpcHRpb25dXG5cdCAqIEByZXR1cm4ge1t0eXBlXX0gICAgICAgICAgICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKi9cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oY29udGV4dCwgaXNTdGF0aWMsIG51bVZlcnRzLCBudW1JbmRpY2VzLCB2ZXJ0ZXhBdHRyaWJzKSB7XG5cdFx0aWYgKCFjb250ZXh0KVxuXHRcdFx0dGhyb3cgXCJHTCBjb250ZXh0IG5vdCBzcGVjaWZpZWRcIjtcblx0XHRpZiAoIW51bVZlcnRzKVxuXHRcdFx0dGhyb3cgXCJudW1WZXJ0cyBub3Qgc3BlY2lmaWVkLCBtdXN0IGJlID4gMFwiO1xuXG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLmdsID0gY29udGV4dC5nbDtcblx0XHRcblx0XHR0aGlzLm51bVZlcnRzID0gbnVtVmVydHM7XG5cdFx0dGhpcy5udW1JbmRpY2VzID0gbnVtSW5kaWNlcyB8fCAwO1xuXHRcdHRoaXMudmVydGV4VXNhZ2UgPSBpc1N0YXRpYyA/IHRoaXMuZ2wuU1RBVElDX0RSQVcgOiB0aGlzLmdsLkRZTkFNSUNfRFJBVztcblx0XHR0aGlzLmluZGV4VXNhZ2UgID0gaXNTdGF0aWMgPyB0aGlzLmdsLlNUQVRJQ19EUkFXIDogdGhpcy5nbC5EWU5BTUlDX0RSQVc7XG5cdFx0dGhpcy5fdmVydGV4QXR0cmlicyA9IHZlcnRleEF0dHJpYnMgfHwgW107XG5cdFx0XG5cdFx0dGhpcy5pbmRpY2VzRGlydHkgPSB0cnVlO1xuXHRcdHRoaXMudmVydGljZXNEaXJ0eSA9IHRydWU7XG5cblx0XHQvL2RldGVybWluZSB0aGUgdmVydGV4IHN0cmlkZSBiYXNlZCBvbiBnaXZlbiBhdHRyaWJ1dGVzXG5cdFx0dmFyIHRvdGFsTnVtQ29tcG9uZW50cyA9IDA7XG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMuX3ZlcnRleEF0dHJpYnMubGVuZ3RoOyBpKyspXG5cdFx0XHR0b3RhbE51bUNvbXBvbmVudHMgKz0gdGhpcy5fdmVydGV4QXR0cmlic1tpXS5udW1Db21wb25lbnRzO1xuXHRcdHRoaXMuX3ZlcnRleFN0cmlkZSA9IHRvdGFsTnVtQ29tcG9uZW50cyAqIDQ7IC8vIGluIGJ5dGVzXG5cblx0XHR0aGlzLnZlcnRpY2VzID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLm51bVZlcnRzKTtcblx0XHR0aGlzLmluZGljZXMgPSBuZXcgVWludDE2QXJyYXkodGhpcy5udW1JbmRpY2VzKTtcblxuXHRcdC8vYWRkIHRoaXMgVkJPIHRvIHRoZSBtYW5hZ2VkIGNhY2hlXG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8vcmVjcmVhdGVzIHRoZSBidWZmZXJzIG9uIGNvbnRleHQgbG9zc1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR0aGlzLnZlcnRleEJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xuXG5cdFx0Ly9pZ25vcmUgaW5kZXggYnVmZmVyIGlmIHdlIGhhdmVuJ3Qgc3BlY2lmaWVkIGFueVxuXHRcdHRoaXMuaW5kZXhCdWZmZXIgPSB0aGlzLm51bUluZGljZXMgPiAwXG5cdFx0XHRcdFx0PyBnbC5jcmVhdGVCdWZmZXIoKVxuXHRcdFx0XHRcdDogbnVsbDtcblx0fSxcblxuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnZlcnRpY2VzID0gW107XG5cdFx0dGhpcy5pbmRpY2VzID0gW107XG5cdFx0aWYgKHRoaXMudmVydGV4QnVmZmVyKVxuXHRcdFx0dGhpcy5nbC5kZWxldGVCdWZmZXIodGhpcy52ZXJ0ZXhCdWZmZXIpO1xuXHRcdGlmICh0aGlzLmluZGV4QnVmZmVyKVxuXHRcdFx0dGhpcy5nbC5kZWxldGVCdWZmZXIodGhpcy5pbmRleEJ1ZmZlcik7XG5cdFx0dGhpcy52ZXJ0ZXhCdWZmZXIgPSBudWxsO1xuXHRcdHRoaXMuaW5kZXhCdWZmZXIgPSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgdG8gYmluZCB0aGlzIHZlcnRleCBkYXRhIHdpdGggdGhlIGdpdmVuIFxuXHQgKiBTaGFkZXJQcm9ncmFtLCBlbmFibGluZyBhbnkgYXNzb2NpYXRlZCBhdHRyaWJ1dGVcblx0ICogYXJyYXlzLlxuXHQgKlxuXHQgKiBJZiBzaGFkZXIgaXMgbnVsbCBvciB1bmRlZmluZWQsIGl0J3MgYXNzdW1lZFxuXHQgKiB0aGF0IHRoZSB2ZXJ0ZXggYXR0cmlidXRlcyBoYXZlIGFscmVhZHkgYmVlbiBib3VuZC4gXG5cdCAqIFRoaXMgY2FuIGJlIHVzZWQgYnkgYWR2YW5jZWQgdXNlcnMgdG8gYXZvaWQgcmVkdW5kYW50XG5cdCAqIEdMIGNhbGxzLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U2hhZGVyUHJvZ3JhbX0gc2hhZGVyIHRoZSBzaGFkZXIgdGhhdCB3aWxsIGJlIHVzZWQgdG8gcmVuZGVyIHRoaXMgbWVzaFxuXHQgKi9cblx0YmluZDogZnVuY3Rpb24oc2hhZGVyKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdC8vYmluZCBvdXIgaW5kZXggZGF0YSwgaWYgd2UgaGF2ZSBhbnlcblx0XHRpZiAodGhpcy5udW1JbmRpY2VzID4gMCkge1xuXHRcdFx0Z2wuYmluZEJ1ZmZlcihnbC5FTEVNRU5UX0FSUkFZX0JVRkZFUiwgdGhpcy5pbmRleEJ1ZmZlcik7XG5cdFx0XHQvL3VwZGF0ZSB0aGUgaW5kZXggZGF0YVxuXHRcdFx0aWYgKHRoaXMuaW5kaWNlc0RpcnR5KSB7XG5cdFx0XHRcdGdsLmJ1ZmZlckRhdGEoZ2wuRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRoaXMuaW5kaWNlcywgdGhpcy5pbmRleFVzYWdlKTtcblx0XHRcdFx0dGhpcy5pbmRpY2VzRGlydHkgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvL2JpbmQgb3VyIHZlcnRleCBkYXRhXG5cdFx0Z2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHRoaXMudmVydGV4QnVmZmVyKTtcblx0XHQvL3VwZGF0ZSBvdXIgdmVydGV4IGRhdGFcblx0XHRpZiAodGhpcy52ZXJ0aWNlc0RpcnR5KSB7XG5cdFx0XHRnbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy52ZXJ0aWNlcywgdGhpcy52ZXJ0ZXhVc2FnZSk7XG5cdFx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoc2hhZGVyKVxuXHRcdFx0dGhpcy5iaW5kQXR0cmlidXRlcyhzaGFkZXIpO1xuXHR9LFxuXG5cdGRyYXc6IGZ1bmN0aW9uKHByaW1pdGl2ZVR5cGUsIGNvdW50LCBvZmZzZXQpIHtcblx0XHRpZiAoY291bnQgPT09IDApXG5cdFx0XHRyZXR1cm47XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGlmICh0aGlzLm51bUluZGljZXMgPiAwKSB7IFxuXHRcdFx0Z2wuZHJhd0VsZW1lbnRzKHByaW1pdGl2ZVR5cGUsIGNvdW50LCBcblx0XHRcdFx0XHRcdGdsLlVOU0lHTkVEX1NIT1JULCBvZmZzZXQgKiAyKTsgLy8qIFVpbnQxNkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UXG5cdFx0fSBlbHNlXG5cdFx0XHRnbC5kcmF3QXJyYXlzKHByaW1pdGl2ZVR5cGUsIG9mZnNldCwgY291bnQpO1xuXHR9LFxuXG5cdHVuYmluZDogZnVuY3Rpb24oc2hhZGVyKSB7XG5cdFx0aWYgKHNoYWRlcilcblx0XHRcdHRoaXMudW5iaW5kQXR0cmlidXRlcyhzaGFkZXIpO1xuXHR9LFxuXG5cdC8vYmluZHMgdGhpcyBtZXNoJ3MgdmVydGV4IGF0dHJpYnV0ZXMgZm9yIHRoZSBnaXZlbiBzaGFkZXJcblx0YmluZEF0dHJpYnV0ZXM6IGZ1bmN0aW9uKHNoYWRlcikge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR2YXIgb2Zmc2V0ID0gMDtcblx0XHR2YXIgc3RyaWRlID0gdGhpcy5fdmVydGV4U3RyaWRlO1xuXG5cdFx0Ly9mb3IgZWFjaCBhdHRyaWJ0dWVcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5fdmVydGV4QXR0cmlicy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dmFyIGEgPSB0aGlzLl92ZXJ0ZXhBdHRyaWJzW2ldO1xuXG5cdFx0XHQvL2xvY2F0aW9uIG9mIHRoZSBhdHRyaWJ1dGVcblx0XHRcdHZhciBsb2MgPSBhLmxvY2F0aW9uID09PSBudWxsIFxuXHRcdFx0XHRcdD8gc2hhZGVyLmdldEF0dHJpYnV0ZUxvY2F0aW9uKGEubmFtZSlcblx0XHRcdFx0XHQ6IGEubG9jYXRpb247XG5cdFx0XHRcblx0XHRcdC8vZmlyc3QsIGVuYWJsZSB0aGUgdmVydGV4IGFycmF5XG5cdFx0XHRnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShsb2MpO1xuXHRcdFx0Ly90aGVuIHNwZWNpZnkgb3VyIHZlcnRleCBmb3JtYXRcblx0XHRcdGdsLnZlcnRleEF0dHJpYlBvaW50ZXIobG9jLCBhLm51bUNvbXBvbmVudHMsIGEudHlwZSB8fCBnbC5GTE9BVCwgXG5cdFx0XHRcdFx0XHRcdFx0ICAgYS5ub3JtYWxpemUgfHwgZmFsc2UsIHN0cmlkZSwgb2Zmc2V0KTtcblxuXG5cdFx0XHQvL2FuZCBpbmNyZWFzZSB0aGUgb2Zmc2V0Li4uXG5cdFx0XHRvZmZzZXQgKz0gYS5udW1Db21wb25lbnRzICogNDsgLy9pbiBieXRlc1xuXG5cdFx0XHQvLyB2YXIgZXJyID0gZ2wuZ2V0RXJyb3IoKTtcblx0XHRcdC8vIGlmIChlcnIpXG5cdFx0XHQvLyBcdGNvbnNvbGUubG9nKGVycik7XG5cdFx0fVxuXHR9LFxuXG5cdHVuYmluZEF0dHJpYnV0ZXM6IGZ1bmN0aW9uKHNoYWRlcikge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHQvL2ZvciBlYWNoIGF0dHJpYnR1ZVxuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLl92ZXJ0ZXhBdHRyaWJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgYSA9IHRoaXMuX3ZlcnRleEF0dHJpYnNbaV07XG5cblx0XHRcdC8vbG9jYXRpb24gb2YgdGhlIGF0dHJpYnV0ZVxuXHRcdFx0dmFyIGxvYyA9IGEubG9jYXRpb24gPT09IG51bGwgXG5cdFx0XHRcdFx0PyBzaGFkZXIuZ2V0QXR0cmlidXRlTG9jYXRpb24oYS5uYW1lKVxuXHRcdFx0XHRcdDogYS5sb2NhdGlvbjtcblxuXHRcdFx0Ly9maXJzdCwgZW5hYmxlIHRoZSB2ZXJ0ZXggYXJyYXlcblx0XHRcdGdsLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheShsb2MpO1xuXHRcdH1cblx0fVxufSk7XG5cblZlcnRleERhdGEuQXR0cmliID0gbmV3IENsYXNzKHtcblxuXHRuYW1lOiBudWxsLFxuXHRudW1Db21wb25lbnRzOiBudWxsLFxuXHRsb2NhdGlvbjogbnVsbCxcblx0dHlwZTogbnVsbCxcblxuXHQvKipcblx0ICogTG9jYXRpb24gaXMgb3B0aW9uYWwgYW5kIGZvciBhZHZhbmNlZCB1c2VycyB0aGF0XG5cdCAqIHdhbnQgdmVydGV4IGFycmF5cyB0byBtYXRjaCBhY3Jvc3Mgc2hhZGVycy4gQW55IG5vbi1udW1lcmljYWxcblx0ICogdmFsdWUgd2lsbCBiZSBjb252ZXJ0ZWQgdG8gbnVsbCwgYW5kIGlnbm9yZWQuIElmIGEgbnVtZXJpY2FsXG5cdCAqIHZhbHVlIGlzIGdpdmVuLCBpdCB3aWxsIG92ZXJyaWRlIHRoZSBwb3NpdGlvbiBvZiB0aGlzIGF0dHJpYnV0ZVxuXHQgKiB3aGVuIGdpdmVuIHRvIGEgbWVzaC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gbmFtZSAgICAgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gbnVtQ29tcG9uZW50cyBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gbG9jYXRpb24gICAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEByZXR1cm4ge1t0eXBlXX0gICAgICAgICAgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbihuYW1lLCBudW1Db21wb25lbnRzLCBsb2NhdGlvbiwgdHlwZSwgbm9ybWFsaXplKSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLm51bUNvbXBvbmVudHMgPSBudW1Db21wb25lbnRzO1xuXHRcdHRoaXMubG9jYXRpb24gPSB0eXBlb2YgbG9jYXRpb24gPT09IFwibnVtYmVyXCIgPyBsb2NhdGlvbiA6IG51bGw7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHR0aGlzLm5vcm1hbGl6ZSA9IG5vcm1hbGl6ZTtcblx0fVxufSlcblxuXG5tb2R1bGUuZXhwb3J0cyA9IFZlcnRleERhdGE7XG5cblxuLy9mbG93OlxuLy8gIFxuXG5cblxuLy8gdmFyIGF0dHJpYnMgPSBbXG4vLyBcdG5ldyBNZXNoLkF0dHJpYnV0ZShcImFfcG9zaXRpb25cIiwgMiksXG4vLyBcdG5ldyBNZXNoLkF0dHJpYnV0ZShcImFfY29sb3JcIiwgMSlcbi8vIF07XG4vLyB2YXIgbWVzaCA9IG5ldyBNZXNoKGNvbnRleHQsIDQsIDYsIE1lc2guU1RBVElDLCBhdHRyaWJzKTtcblxuXG4vL0NvbnN0YW50IFZlcnRleCBBdHRyaWI6XG4vL1x0ZS5nLiB3aXRoIGluc3RhbmNpbmcgbWF5YmU/XG4vL09ubHkgZW5hYmxlIHZlcnRleCBhdHRyaWIgaWYgaXQncyB1c2VkP1xuLy9cdGJ1dCB3ZSBhcmUgc3RpbGwgc2VuZGluZyBhbHBoYSBzbyBXVEZcbi8vXHR3b3VsZCBuZWVkIGFub3RoZXIgYnVmZmVyLCBidXQgdGhhdCBjYW4gZ2V0IHJlYWwgdWdseS5cbi8vICAiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCdqc09PUCcpLkNsYXNzO1xuXG4vKipcbiAqIEEgdGhpbiB3cmFwcGVyIGFyb3VuZCBXZWJHTFJlbmRlcmluZ0NvbnRleHQgd2hpY2ggaGFuZGxlc1xuICogY29udGV4dCBsb3NzIGFuZCByZXN0b3JlIHdpdGggb3RoZXIgS2FtaSByZW5kZXJpbmcgb2JqZWN0cy5cbiAqL1xudmFyIFdlYkdMQ29udGV4dCA9IG5ldyBDbGFzcyh7XG5cdFxuXHRtYW5hZ2VkVGV4dHVyZXM6IG51bGwsXG5cdG1hbmFnZWRTaGFkZXJzOiBudWxsLFxuXG5cdGdsOiBudWxsLFxuXHR3aWR0aDogbnVsbCxcblx0aGVpZ2h0OiBudWxsLFxuXHR2aWV3OiBudWxsLFxuXHRjb250ZXh0QXR0cmlidXRlczogbnVsbCxcblx0XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgY29udGV4dCBpcyAndmFsaWQnLCBpLmUuIHJlbmRlcmFibGUuIEEgY29udGV4dCB0aGF0IGhhcyBiZWVuIGxvc3Rcblx0ICogKGFuZCBub3QgeWV0IHJlc3RvcmVkKSBpcyBpbnZhbGlkLlxuXHQgKiBcblx0ICogQHR5cGUge0Jvb2xlYW59XG5cdCAqL1xuXHR2YWxpZDogZmFsc2UsXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24od2lkdGgsIGhlaWdodCwgdmlldywgY29udGV4dEF0dHJpYnV0ZXMpIHtcblx0XHQvL3NldHVwIGRlZmF1bHRzXG5cdFx0dGhpcy52aWV3ID0gdmlldyB8fCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuXG5cdFx0Ly9kZWZhdWx0IHNpemUgYXMgcGVyIHNwZWM6XG5cdFx0Ly9odHRwOi8vd3d3LnczLm9yZy9UUi8yMDEyL1dELWh0bWw1LWF1dGhvci0yMDEyMDMyOS90aGUtY2FudmFzLWVsZW1lbnQuaHRtbCN0aGUtY2FudmFzLWVsZW1lbnRcblx0XHR0aGlzLndpZHRoID0gdGhpcy52aWV3LndpZHRoID0gd2lkdGggfHwgMzAwO1xuXHRcdHRoaXMuaGVpZ2h0ID0gdGhpcy52aWV3LmhlaWdodCA9IGhlaWdodCB8fCAxNTA7XG5cdFx0XG5cdFx0Ly90aGUgbGlzdCBvZiBtYW5hZ2VkIG9iamVjdHMuLi5cblx0XHR0aGlzLm1hbmFnZWRPYmplY3RzID0gW107XG5cblx0XHQvL3NldHVwIGNvbnRleHQgbG9zdCBhbmQgcmVzdG9yZSBsaXN0ZW5lcnNcblx0XHR0aGlzLnZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmdsY29udGV4dGxvc3RcIiwgZnVuY3Rpb24gKGV2KSB7XG5cdFx0XHRldi5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5fY29udGV4dExvc3QoZXYpO1xuXHRcdH0uYmluZCh0aGlzKSk7XG5cdFx0dGhpcy52aWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJ3ZWJnbGNvbnRleHRyZXN0b3JlZFwiLCBmdW5jdGlvbiAoZXYpIHtcblx0XHRcdGV2LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLl9jb250ZXh0UmVzdG9yZWQoZXYpO1xuXHRcdH0uYmluZCh0aGlzKSk7XG5cdFx0XHRcblx0XHR0aGlzLmNvbnRleHRBdHRyaWJ1dGVzID0gY29udGV4dEF0dHJpYnV0ZXM7XG5cdFx0dGhpcy5faW5pdENvbnRleHQoKTtcblx0XHR0aGlzLmluaXRHTCgpO1xuXHR9LFxuXG5cdF9pbml0Q29udGV4dDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGVyciA9IFwiXCI7XG5cdFx0dGhpcy52YWxpZCA9IGZhbHNlO1xuXG5cdFx0dHJ5IHtcblx0ICAgICAgICB0aGlzLmdsID0gKHRoaXMudmlldy5nZXRDb250ZXh0KCd3ZWJnbCcpIHx8IHRoaXMudmlldy5nZXRDb250ZXh0KCdleHBlcmltZW50YWwtd2ViZ2wnKSk7XG5cdCAgICB9IGNhdGNoIChlKSB7XG5cdCAgICBcdHRoaXMuZ2wgPSBudWxsO1xuXHQgICAgfVxuXG5cdFx0aWYgKHRoaXMuZ2wpIHtcblx0XHRcdHRoaXMudmFsaWQgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBcIldlYkdMIENvbnRleHQgTm90IFN1cHBvcnRlZCAtLSB0cnkgZW5hYmxpbmcgaXQgb3IgdXNpbmcgYSBkaWZmZXJlbnQgYnJvd3NlclwiO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgd2lkdGggYW5kIGhlaWdodCBvZiB0aGlzIFdlYkdMIGNvbnRleHQsIHJlc2l6ZXNcblx0ICogdGhlIGNhbnZhcyB2aWV3LCBhbmQgY2FsbHMgZ2wudmlld3BvcnQoKSB3aXRoIHRoZSBuZXcgc2l6ZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggIHRoZSBuZXcgd2lkdGhcblx0ICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgdGhlIG5ldyBoZWlnaHRcblx0ICovXG5cdHJlc2l6ZTogZnVuY3Rpb24od2lkdGgsIGhlaWdodCkge1xuXHRcdHRoaXMud2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuXHRcdHRoaXMudmlldy53aWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMudmlldy5oZWlnaHQgPSBoZWlnaHQ7XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLnZpZXdwb3J0KDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcblx0fSxcblxuXHRpbml0R0w6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0Z2wudmlld3BvcnQoMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuXG5cdFx0Ly8gZ2V0IHJpZCBvZiB0aGlzLi4gbGV0IHVzZXIgaGFuZGxlIGl0XG5cdFx0Ly8gZ2wuY2xlYXJDb2xvcigwLjUsMC41LDAuMCwxLjApO1xuXHRcdC8vIGdsLmNsZWFyKGdsLkNPTE9SX0JVRkZFUl9CSVQpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiAoaW50ZXJuYWwgdXNlKVxuXHQgKiBBIG1hbmFnZWQgb2JqZWN0IGlzIGFueXRoaW5nIHdpdGggYSBcImNyZWF0ZVwiIGZ1bmN0aW9uLCB0aGF0IHdpbGxcblx0ICogcmVzdG9yZSBHTCBzdGF0ZSBhZnRlciBjb250ZXh0IGxvc3MuIFxuXHQgKiBcblx0ICogQHBhcmFtIHtbdHlwZV19IHRleCBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRhZGRNYW5hZ2VkT2JqZWN0OiBmdW5jdGlvbihvYmopIHtcblx0XHR0aGlzLm1hbmFnZWRPYmplY3RzLnB1c2gob2JqKTtcblx0fSxcblxuXHQvKipcblx0ICogKGludGVybmFsIHVzZSlcblx0ICogUmVtb3ZlcyBhIG1hbmFnZWQgb2JqZWN0IGZyb20gdGhlIGNhY2hlLiBUaGlzIGlzIHVzZWZ1bCB0byBkZXN0cm95XG5cdCAqIGEgdGV4dHVyZSBvciBzaGFkZXIsIGFuZCBoYXZlIGl0IG5vIGxvbmdlciByZS1sb2FkIG9uIGNvbnRleHQgcmVzdG9yZS5cblx0ICpcblx0ICogUmV0dXJucyB0aGUgb2JqZWN0IHRoYXQgd2FzIHJlbW92ZWQsIG9yIG51bGwgaWYgaXQgd2FzIG5vdCBmb3VuZCBpbiB0aGUgY2FjaGUuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9iaiB0aGUgb2JqZWN0IHRvIGJlIG1hbmFnZWRcblx0ICogQHJldHVybiB7T2JqZWN0fSAgICAgdGhlIHJlbW92ZWQgb2JqZWN0LCBvciBudWxsXG5cdCAqL1xuXHRyZW1vdmVNYW5hZ2VkT2JqZWN0OiBmdW5jdGlvbihvYmopIHtcblx0XHR2YXIgaWR4ID0gdGhpcy5tYW5hZ2VkT2JqZWN0cy5pbmRleE9mKG9iaik7XG5cdFx0aWYgKGlkeCA+IC0xKSB7XG5cdFx0XHR0aGlzLm1hbmFnZWRPYmplY3RzLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9IFxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdF9jb250ZXh0TG9zdDogZnVuY3Rpb24oZXYpIHtcblx0XHQvL2FsbCB0ZXh0dXJlcy9zaGFkZXJzL2J1ZmZlcnMvRkJPcyBoYXZlIGJlZW4gZGVsZXRlZC4uLiBcblx0XHQvL3dlIG5lZWQgdG8gcmUtY3JlYXRlIHRoZW0gb24gcmVzdG9yZVxuXHRcdHRoaXMudmFsaWQgPSBmYWxzZTtcblx0fSxcblxuXHRfY29udGV4dFJlc3RvcmVkOiBmdW5jdGlvbihldikge1xuXHRcdC8vZmlyc3QsIGluaXRpYWxpemUgdGhlIEdMIGNvbnRleHQgYWdhaW5cblx0XHR0aGlzLl9pbml0Q29udGV4dCgpO1xuXG5cdFx0Ly9ub3cgd2UgcmVjcmVhdGUgb3VyIHNoYWRlcnMgYW5kIHRleHR1cmVzXG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMubWFuYWdlZE9iamVjdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMubWFuYWdlZE9iamVjdHNbaV0uY3JlYXRlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5pbml0R0woKTtcblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gV2ViR0xDb250ZXh0OyIsIm1vZHVsZS5leHBvcnRzID0ge1xuXHRTaGFkZXJQcm9ncmFtOiByZXF1aXJlKCcuL1NoYWRlclByb2dyYW0nKSxcblx0V2ViR0xDb250ZXh0OiByZXF1aXJlKCcuL1dlYkdMQ29udGV4dCcpLFxuXHRUZXh0dXJlOiByZXF1aXJlKCcuL1RleHR1cmUnKSxcblx0VmVydGV4RGF0YTogcmVxdWlyZSgnLi9WZXJ0ZXhEYXRhJylcbn07IiwidmFyIENsYXNzID0gcmVxdWlyZSgnLi9saWIvQ2xhc3MnKSxcblx0RW51bSA9IHJlcXVpcmUoJy4vbGliL0VudW0nKSxcblx0SW50ZXJmYWNlID0gcmVxdWlyZSgnLi9saWIvSW50ZXJmYWNlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuXHRDbGFzczogQ2xhc3MsXG5cdEVudW06IEVudW0sXG5cdEludGVyZmFjZTogSW50ZXJmYWNlXG59OyIsInZhciBCYXNlQ2xhc3MgPSByZXF1aXJlKCcuL2Jhc2VDbGFzcycpO1xuXG52YXIgQ2xhc3MgPSBmdW5jdGlvbiggZGVzY3JpcHRvciApIHtcblx0aWYgKCFkZXNjcmlwdG9yKSBcblx0XHRkZXNjcmlwdG9yID0ge307XG5cdFxuXHRpZiggZGVzY3JpcHRvci5pbml0aWFsaXplICkge1xuXHRcdHZhciByVmFsID0gZGVzY3JpcHRvci5pbml0aWFsaXplO1xuXHRcdGRlbGV0ZSBkZXNjcmlwdG9yLmluaXRpYWxpemU7XG5cdH0gZWxzZSB7XG5cdFx0clZhbCA9IGZ1bmN0aW9uKCkgeyB0aGlzLnBhcmVudC5hcHBseSggdGhpcywgYXJndW1lbnRzICk7IH07XG5cdH1cblxuXHRpZiggZGVzY3JpcHRvci5FeHRlbmRzICkge1xuXHRcdHJWYWwucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSggZGVzY3JpcHRvci5FeHRlbmRzLnByb3RvdHlwZSApO1xuXHRcdC8vIHRoaXMgd2lsbCBiZSB1c2VkIHRvIGNhbGwgdGhlIHBhcmVudCBjb25zdHJ1Y3RvclxuXHRcdHJWYWwuJCRwYXJlbnRDb25zdHJ1Y3RvciA9IGRlc2NyaXB0b3IuRXh0ZW5kcztcblx0XHRkZWxldGUgZGVzY3JpcHRvci5FeHRlbmRzO1xuXHR9IGVsc2Uge1xuXHRcdHJWYWwuJCRwYXJlbnRDb25zdHJ1Y3RvciA9IGZ1bmN0aW9uKCkge31cblx0XHRyVmFsLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoIEJhc2VDbGFzcyApO1xuXHR9XG5cblx0clZhbC5wcm90b3R5cGUuJCRnZXR0ZXJzID0ge307XG5cdHJWYWwucHJvdG90eXBlLiQkc2V0dGVycyA9IHt9O1xuXG5cdGZvciggdmFyIGkgaW4gZGVzY3JpcHRvciApIHtcblx0XHRpZiggdHlwZW9mIGRlc2NyaXB0b3JbIGkgXSA9PSAnZnVuY3Rpb24nICkge1xuXHRcdFx0ZGVzY3JpcHRvclsgaSBdLiQkbmFtZSA9IGk7XG5cdFx0XHRkZXNjcmlwdG9yWyBpIF0uJCRvd25lciA9IHJWYWwucHJvdG90eXBlO1xuXG5cdFx0XHRyVmFsLnByb3RvdHlwZVsgaSBdID0gZGVzY3JpcHRvclsgaSBdO1xuXHRcdH0gZWxzZSBpZiggZGVzY3JpcHRvclsgaSBdICYmIHR5cGVvZiBkZXNjcmlwdG9yWyBpIF0gPT0gJ29iamVjdCcgJiYgKCBkZXNjcmlwdG9yWyBpIF0uZ2V0IHx8IGRlc2NyaXB0b3JbIGkgXS5zZXQgKSApIHtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSggclZhbC5wcm90b3R5cGUsIGkgLCBkZXNjcmlwdG9yWyBpIF0gKTtcblxuXHRcdFx0aWYoIGRlc2NyaXB0b3JbIGkgXS5nZXQgKSB7XG5cdFx0XHRcdHJWYWwucHJvdG90eXBlLiQkZ2V0dGVyc1sgaSBdID0gZGVzY3JpcHRvclsgaSBdLmdldDtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLmdldC4kJG5hbWUgPSBpO1xuXHRcdFx0XHRkZXNjcmlwdG9yWyBpIF0uZ2V0LiQkb3duZXIgPSByVmFsLnByb3RvdHlwZTtcblx0XHRcdH1cblxuXHRcdFx0aWYoIGRlc2NyaXB0b3JbIGkgXS5zZXQgKSB7XG5cdFx0XHRcdHJWYWwucHJvdG90eXBlLiQkc2V0dGVyc1sgaSBdID0gZGVzY3JpcHRvclsgaSBdLnNldDtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLnNldC4kJG5hbWUgPSBpO1xuXHRcdFx0XHRkZXNjcmlwdG9yWyBpIF0uc2V0LiQkb3duZXIgPSByVmFsLnByb3RvdHlwZTtcdFxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyVmFsLnByb3RvdHlwZVsgaSBdID0gZGVzY3JpcHRvclsgaSBdO1xuXHRcdH1cblx0fVxuXG5cdC8vIHRoaXMgd2lsbCBiZSB1c2VkIHRvIGNoZWNrIGlmIHRoZSBjYWxsZXIgZnVuY3Rpb24gaXMgdGhlIGNvbnNydWN0b3Jcblx0clZhbC4kJGlzQ29uc3RydWN0b3IgPSB0cnVlO1xuXG5cblx0Ly8gbm93IHdlJ2xsIGNoZWNrIGludGVyZmFjZXNcblx0Zm9yKCB2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKysgKSB7XG5cdFx0YXJndW1lbnRzWyBpIF0uY29tcGFyZSggclZhbCApO1xuXHR9XG5cblx0cmV0dXJuIHJWYWw7XG59O1x0XG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IENsYXNzOyIsInZhciBDbGFzcyA9IHJlcXVpcmUoJy4vQ2xhc3MnKTtcblxuLyoqXG5UaGUgRW51bSBjbGFzcywgd2hpY2ggaG9sZHMgYSBzZXQgb2YgY29uc3RhbnRzIGluIGEgZml4ZWQgb3JkZXIuXG5cbiMjIyMgQmFzaWMgVXNhZ2U6XG5cdHZhciBEYXlzID0gbmV3IEVudW0oWyBcblx0XHRcdCdNb25kYXknLFxuXHRcdFx0J1R1ZXNkYXknLFxuXHRcdFx0J1dlZG5lc2RheScsXG5cdFx0XHQnVGh1cnNkYXknLFxuXHRcdFx0J0ZyaWRheScsXG5cdFx0XHQnU2F0dXJkYXknLFxuXHRcdFx0J1N1bmRheSdcblx0XSk7XG5cblx0Y29uc29sZS5sb2coIERheXMuTW9uZGF5ID09PSBEYXlzLlR1ZXNkYXkgKTsgLy8gPT4gZmFsc2Vcblx0Y29uc29sZS5sb2coIERheXMudmFsdWVzWzFdICkgLy8gPT4gdGhlICdUdWVzZGF5JyBzeW1ib2wgb2JqZWN0XG5cbkVhY2ggZW51bSAqc3ltYm9sKiBpcyBhbiBvYmplY3Qgd2hpY2ggZXh0ZW5kcyBmcm9tIHRoZSBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlXCJ9fXt7L2Nyb3NzTGlua319YCBcbmNsYXNzLiBUaGlzIGJhc2VcbmNsYXNzIGhhcyAgcHJvcGVydGllcyBsaWtlIGB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2UvdmFsdWU6cHJvcGVydHlcIn19e3svY3Jvc3NMaW5rfX1gICBcbmFuZCBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlL29yZGluYWw6cHJvcGVydHlcIn19e3svY3Jvc3NMaW5rfX1gLiBcbl9fYHZhbHVlYF9fIGlzIGEgc3RyaW5nXG53aGljaCBtYXRjaGVzIHRoZSBlbGVtZW50IG9mIHRoZSBhcnJheS4gX19gb3JkaW5hbGBfXyBpcyB0aGUgaW5kZXggdGhlIFxuc3ltYm9sIHdhcyBkZWZpbmVkIGF0IGluIHRoZSBlbnVtZXJhdGlvbi4gXG5cblRoZSByZXN1bHRpbmcgRW51bSBvYmplY3QgKGluIHRoZSBhYm92ZSBjYXNlLCBEYXlzKSBhbHNvIGhhcyBzb21lIHV0aWxpdHkgbWV0aG9kcyxcbmxpa2UgZnJvbVZhbHVlKHN0cmluZykgYW5kIHRoZSB2YWx1ZXMgcHJvcGVydHkgdG8gYWNjZXNzIHRoZSBhcnJheSBvZiBzeW1ib2xzLlxuXG5Ob3RlIHRoYXQgdGhlIHZhbHVlcyBhcnJheSBpcyBmcm96ZW4sIGFzIGlzIGVhY2ggc3ltYm9sLiBUaGUgcmV0dXJuZWQgb2JqZWN0IGlzIFxuX19ub3RfXyBmcm96ZW4sIGFzIHRvIGFsbG93IHRoZSB1c2VyIHRvIG1vZGlmeSBpdCAoaS5lLiBhZGQgXCJzdGF0aWNcIiBtZW1iZXJzKS5cblxuQSBtb3JlIGFkdmFuY2VkIEVudW0gdXNhZ2UgaXMgdG8gc3BlY2lmeSBhIGJhc2UgRW51bSBzeW1ib2wgY2xhc3MgYXMgdGhlIHNlY29uZFxucGFyYW1ldGVyLiBUaGlzIGlzIHRoZSBjbGFzcyB0aGF0IGVhY2ggc3ltYm9sIHdpbGwgdXNlLiBUaGVuLCBpZiBhbnkgc3ltYm9sc1xuYXJlIGdpdmVuIGFzIGFuIEFycmF5IChpbnN0ZWFkIG9mIHN0cmluZyksIGl0IHdpbGwgYmUgdHJlYXRlZCBhcyBhbiBhcnJheSBvZiBhcmd1bWVudHNcbnRvIHRoZSBiYXNlIGNsYXNzLiBUaGUgZmlyc3QgYXJndW1lbnQgc2hvdWxkIGFsd2F5cyBiZSB0aGUgZGVzaXJlZCBrZXkgb2YgdGhhdCBzeW1ib2wuXG5cbk5vdGUgdGhhdCBfX2BvcmRpbmFsYF9fIGlzIGFkZGVkIGR5bmFtaWNhbGx5XG5hZnRlciB0aGUgc3ltYm9sIGlzIGNyZWF0ZWQ7IHNvIGl0IGNhbid0IGJlIHVzZWQgaW4gdGhlIHN5bWJvbCdzIGNvbnN0cnVjdG9yLlxuXG4jIyMjIEFkdmFuY2VkIFVzYWdlXG5cdHZhciBEYXlzID0gbmV3IEVudW0oWyBcblx0XHRcdCdNb25kYXknLFxuXHRcdFx0J1R1ZXNkYXknLFxuXHRcdFx0J1dlZG5lc2RheScsXG5cdFx0XHQnVGh1cnNkYXknLFxuXHRcdFx0J0ZyaWRheScsXG5cdFx0XHRbJ1NhdHVyZGF5JywgdHJ1ZV0sXG5cdFx0XHRbJ1N1bmRheScsIHRydWVdXG5cdFx0XSwgbmV3IENsYXNzKHtcblx0XHRcdFxuXHRcdFx0RXh0ZW5kczogRW51bS5CYXNlLFxuXG5cdFx0XHRpc1dlZWtlbmQ6IGZhbHNlLFxuXG5cdFx0XHRpbml0aWFsaXplOiBmdW5jdGlvbigga2V5LCBpc1dlZWtlbmQgKSB7XG5cdFx0XHRcdC8vcGFzcyB0aGUgc3RyaW5nIHZhbHVlIGFsb25nIHRvIHBhcmVudCBjb25zdHJ1Y3RvclxuXHRcdFx0XHR0aGlzLnBhcmVudCgga2V5ICk7IFxuXHRcdFx0XHRcblx0XHRcdFx0Ly9nZXQgYSBib29sZWFuIHByaW1pdGl2ZSBvdXQgb2YgdGhlIHRydXRoeS9mYWxzeSB2YWx1ZVxuXHRcdFx0XHR0aGlzLmlzV2VrZWVuZCA9IEJvb2xlYW4oaXNXZWVrZW5kKTtcblx0XHRcdH1cblx0XHR9KVxuXHQpO1xuXG5cdGNvbnNvbGUubG9nKCBEYXlzLlNhdHVyZGF5LmlzV2Vla2VuZCApOyAvLyA9PiB0cnVlXG5cblRoaXMgbWV0aG9kIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgeW91IHRyeSB0byBzcGVjaWZ5IGEgY2xhc3Mgd2hpY2ggZG9lc1xubm90IGV4dGVuZCBmcm9tIGB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2VcIn19e3svY3Jvc3NMaW5rfX1gLlxuXG4jIyMjIFNob3J0aGFuZFxuXG5Zb3UgY2FuIGFsc28gb21pdCB0aGUgYG5ldyBDbGFzc2AgYW5kIHBhc3MgYSBkZXNjcmlwdG9yLCB0aHVzIHJlZHVjaW5nIHRoZSBuZWVkIHRvIFxuZXhwbGljaXRseSByZXF1aXJlIHRoZSBDbGFzcyBtb2R1bGUuIEZ1cnRoZXIsIGlmIHlvdSBhcmUgcGFzc2luZyBhIGRlc2NyaXB0b3IgdGhhdFxuZG9lcyBub3QgaGF2ZSBgRXh0ZW5kc2AgZGVmaW5lZCwgaXQgd2lsbCBkZWZhdWx0IHRvXG5ge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlXCJ9fXt7L2Nyb3NzTGlua319YC5cblxuXHR2YXIgSWNvbnMgPSBuZXcgRW51bShbIFxuXHRcdFx0J09wZW4nLFxuXHRcdFx0J1NhdmUnLFxuXHRcdFx0J0hlbHAnLFxuXHRcdFx0J05ldydcblx0XHRdLCB7XG5cblx0XHRcdHBhdGg6IGZ1bmN0aW9uKCByZXRpbmEgKSB7XG5cdFx0XHRcdHJldHVybiBcImljb25zL1wiICsgdGhpcy52YWx1ZS50b0xvd2VyQ2FzZSgpICsgKHJldGluYSA/IFwiQDJ4XCIgOiBcIlwiKSArIFwiLnBuZ1wiO1xuXHRcdFx0fVxuXHRcdH1cblx0KTtcblxuXG5AY2xhc3MgRW51bVxuQGNvbnN0cnVjdG9yIFxuQHBhcmFtIHtBcnJheX0gZWxlbWVudHMgQW4gYXJyYXkgb2YgZW51bWVyYXRlZCBjb25zdGFudHMsIG9yIGFyZ3VtZW50cyB0byBiZSBwYXNzZWQgdG8gdGhlIHN5bWJvbFxuQHBhcmFtIHtDbGFzc30gYmFzZSBDbGFzcyB0byBiZSBpbnN0YW50aWF0ZWQgZm9yIGVhY2ggZW51bSBzeW1ib2wsIG11c3QgZXh0ZW5kIFxuYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZVwifX17ey9jcm9zc0xpbmt9fWBcbiovXG52YXIgRW51bVJlc3VsdCA9IG5ldyBDbGFzcyh7XG5cblx0LyoqXG5cdEFuIGFycmF5IG9mIHRoZSBlbnVtZXJhdGVkIHN5bWJvbCBvYmplY3RzLlxuXG5cdEBwcm9wZXJ0eSB2YWx1ZXNcblx0QHR5cGUgQXJyYXlcblx0Ki9cblx0dmFsdWVzOiBudWxsLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnZhbHVlcyA9IFtdO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIFwiWyBcIit0aGlzLnZhbHVlcy5qb2luKFwiLCBcIikrXCIgXVwiO1xuXHR9LFxuXG5cdC8qKlxuXHRMb29rcyBmb3IgdGhlIGZpcnN0IHN5bWJvbCBpbiB0aGlzIGVudW0gd2hvc2UgJ3ZhbHVlJyBtYXRjaGVzIHRoZSBzcGVjaWZpZWQgc3RyaW5nLiBcblx0SWYgbm9uZSBhcmUgZm91bmQsIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblxuXHRAbWV0aG9kIGZyb21WYWx1ZVxuXHRAcGFyYW0ge1N0cmluZ30gc3RyIHRoZSBzdHJpbmcgdG8gbG9vayB1cFxuXHRAcmV0dXJuIHtFbnVtLkJhc2V9IHJldHVybnMgYW4gZW51bSBzeW1ib2wgZnJvbSB0aGUgZ2l2ZW4gJ3ZhbHVlJyBzdHJpbmcsIG9yIG51bGxcblx0Ki9cblx0ZnJvbVZhbHVlOiBmdW5jdGlvbiAoc3RyKSB7XG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMudmFsdWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoc3RyID09PSB0aGlzLnZhbHVlc1tpXS52YWx1ZSlcblx0XHRcdFx0cmV0dXJuIHRoaXMudmFsdWVzW2ldO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufSk7XG5cblxuXG52YXIgRW51bSA9IGZ1bmN0aW9uICggZWxlbWVudHMsIGJhc2UgKSB7XG5cdGlmICghYmFzZSlcblx0XHRiYXNlID0gRW51bS5CYXNlO1xuXG5cdC8vVGhlIHVzZXIgaXMgb21pdHRpbmcgQ2xhc3MsIGluamVjdCBpdCBoZXJlXG5cdGlmICh0eXBlb2YgYmFzZSA9PT0gXCJvYmplY3RcIikge1xuXHRcdC8vaWYgd2UgZGlkbid0IHNwZWNpZnkgYSBzdWJjbGFzcy4uIFxuXHRcdGlmICghYmFzZS5FeHRlbmRzKVxuXHRcdFx0YmFzZS5FeHRlbmRzID0gRW51bS5CYXNlO1xuXHRcdGJhc2UgPSBuZXcgQ2xhc3MoYmFzZSk7XG5cdH1cblx0XG5cdHZhciByZXQgPSBuZXcgRW51bVJlc3VsdCgpO1xuXG5cdGZvciAodmFyIGk9MDsgaTxlbGVtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdHZhciBlID0gZWxlbWVudHNbaV07XG5cblx0XHR2YXIgb2JqID0gbnVsbDtcblx0XHR2YXIga2V5ID0gbnVsbDtcblxuXHRcdGlmICghZSlcblx0XHRcdHRocm93IFwiZW51bSB2YWx1ZSBhdCBpbmRleCBcIitpK1wiIGlzIHVuZGVmaW5lZFwiO1xuXG5cdFx0aWYgKHR5cGVvZiBlID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRrZXkgPSBlO1xuXHRcdFx0b2JqID0gbmV3IGJhc2UoZSk7XG5cdFx0XHRyZXRbZV0gPSBvYmo7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShlKSlcblx0XHRcdFx0dGhyb3cgXCJlbnVtIHZhbHVlcyBtdXN0IGJlIFN0cmluZyBvciBhbiBhcnJheSBvZiBhcmd1bWVudHNcIjtcblxuXHRcdFx0a2V5ID0gZVswXTtcblxuXHRcdFx0Ly9maXJzdCBhcmcgaXMgaWdub3JlZFxuXHRcdFx0ZS51bnNoaWZ0KG51bGwpO1xuXHRcdFx0b2JqID0gbmV3IChGdW5jdGlvbi5wcm90b3R5cGUuYmluZC5hcHBseShiYXNlLCBlKSk7XG5cblx0XHRcdHJldFtrZXldID0gb2JqO1xuXHRcdH1cblxuXHRcdGlmICggIShvYmogaW5zdGFuY2VvZiBFbnVtLkJhc2UpIClcblx0XHRcdHRocm93IFwiZW51bSBiYXNlIGNsYXNzIG11c3QgYmUgYSBzdWJjbGFzcyBvZiBFbnVtLkJhc2VcIjtcblxuXHRcdG9iai5vcmRpbmFsID0gaTtcblx0XHRyZXQudmFsdWVzLnB1c2gob2JqKTtcblx0XHRPYmplY3QuZnJlZXplKG9iaik7XG5cdH07XG5cblx0Ly93ZSBTSE9VTEQgZnJlZXplIHRoZSByZXR1cnJuZWQgb2JqZWN0LCBidXQgbW9zdCBKUyBkZXZlbG9wZXJzXG5cdC8vYXJlbid0IGV4cGVjdGluZyBhbiBvYmplY3QgdG8gYmUgZnJvemVuLCBhbmQgdGhlIGJyb3dzZXJzIGRvbid0IGFsd2F5cyB3YXJuIHVzLlxuXHQvL0l0IGp1c3QgY2F1c2VzIGZydXN0cmF0aW9uLCBlLmcuIGlmIHlvdSdyZSB0cnlpbmcgdG8gYWRkIGEgc3RhdGljIG9yIGNvbnN0YW50XG5cdC8vdG8gdGhlIHJldHVybmVkIG9iamVjdC5cblxuXHQvLyBPYmplY3QuZnJlZXplKHJldCk7XG5cdE9iamVjdC5mcmVlemUocmV0LnZhbHVlcyk7XG5cdHJldHVybiByZXQ7XG59O1xuXG5cbi8qKlxuXG5UaGUgYmFzZSB0eXBlIGZvciBFbnVtIHN5bWJvbHMuIFN1YmNsYXNzZXMgY2FuIGV4dGVuZFxudGhpcyB0byBpbXBsZW1lbnQgbW9yZSBmdW5jdGlvbmFsaXR5IGZvciBlbnVtIHN5bWJvbHMuXG5cbkBjbGFzcyBFbnVtLkJhc2VcbkBjb25zdHJ1Y3RvciBcbkBwYXJhbSB7U3RyaW5nfSBrZXkgdGhlIHN0cmluZyB2YWx1ZSBmb3IgdGhpcyBzeW1ib2xcbiovXG5FbnVtLkJhc2UgPSBuZXcgQ2xhc3Moe1xuXG5cdC8qKlxuXHRUaGUgc3RyaW5nIHZhbHVlIG9mIHRoaXMgc3ltYm9sLlxuXHRAcHJvcGVydHkgdmFsdWVcblx0QHR5cGUgU3RyaW5nXG5cdCovXG5cdHZhbHVlOiB1bmRlZmluZWQsXG5cblx0LyoqXG5cdFRoZSBpbmRleCBvZiB0aGlzIHN5bWJvbCBpbiBpdHMgZW51bWVyYXRpb24gYXJyYXkuXG5cdEBwcm9wZXJ0eSBvcmRpbmFsXG5cdEB0eXBlIE51bWJlclxuXHQqL1xuXHRvcmRpbmFsOiB1bmRlZmluZWQsXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKCBrZXkgKSB7XG5cdFx0dGhpcy52YWx1ZSA9IGtleTtcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUgfHwgdGhpcy5wYXJlbnQoKTtcblx0fSxcblxuXHR2YWx1ZU9mOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZSB8fCB0aGlzLnBhcmVudCgpO1xuXHR9XG59KTtcblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gRW51bTtcbiIsIlxudmFyIEludGVyZmFjZSA9IGZ1bmN0aW9uKCBkZXNjcmlwdG9yICkge1xuXHR0aGlzLmRlc2NyaXB0b3IgPSBkZXNjcmlwdG9yO1xufTtcblxuSW50ZXJmYWNlLnByb3RvdHlwZS5kZXNjcmlwdG9yID0gbnVsbDtcblxuSW50ZXJmYWNlLnByb3RvdHlwZS5jb21wYXJlID0gZnVuY3Rpb24oIGNsYXNzVG9DaGVjayApIHtcblxuXHRmb3IoIHZhciBpICBpbiB0aGlzLmRlc2NyaXB0b3IgKSB7XG5cdFx0Ly8gRmlyc3Qgd2UnbGwgY2hlY2sgaWYgdGhpcyBwcm9wZXJ0eSBleGlzdHMgb24gdGhlIGNsYXNzXG5cdFx0aWYoIGNsYXNzVG9DaGVjay5wcm90b3R5cGVbIGkgXSA9PT0gdW5kZWZpbmVkICkge1xuXG5cdFx0XHR0aHJvdyAnSU5URVJGQUNFIEVSUk9SOiAnICsgaSArICcgaXMgbm90IGRlZmluZWQgaW4gdGhlIGNsYXNzJztcblxuXHRcdC8vIFNlY29uZCB3ZSdsbCBjaGVjayB0aGF0IHRoZSB0eXBlcyBleHBlY3RlZCBtYXRjaFxuXHRcdH0gZWxzZSBpZiggdHlwZW9mIHRoaXMuZGVzY3JpcHRvclsgaSBdICE9IHR5cGVvZiBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF0gKSB7XG5cblx0XHRcdHRocm93ICdJTlRFUkZBQ0UgRVJST1I6IEludGVyZmFjZSBhbmQgY2xhc3MgZGVmaW5lIGl0ZW1zIG9mIGRpZmZlcmVudCB0eXBlIGZvciAnICsgaSArIFxuXHRcdFx0XHQgICdcXG5pbnRlcmZhY2VbICcgKyBpICsgJyBdID09ICcgKyB0eXBlb2YgdGhpcy5kZXNjcmlwdG9yWyBpIF0gK1xuXHRcdFx0XHQgICdcXG5jbGFzc1sgJyArIGkgKyAnIF0gPT0gJyArIHR5cGVvZiBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF07XG5cblx0XHQvLyBUaGlyZCBpZiB0aGlzIHByb3BlcnR5IGlzIGEgZnVuY3Rpb24gd2UnbGwgY2hlY2sgdGhhdCB0aGV5IGV4cGVjdCB0aGUgc2FtZSBhbW91bnQgb2YgcGFyYW1ldGVyc1xuXHRcdH0gZWxzZSBpZiggdHlwZW9mIHRoaXMuZGVzY3JpcHRvclsgaSBdID09ICdmdW5jdGlvbicgJiYgY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdLmxlbmd0aCAhPSB0aGlzLmRlc2NyaXB0b3JbIGkgXS5sZW5ndGggKSB7XG5cblx0XHRcdHRocm93ICdJTlRFUkZBQ0UgRVJST1I6IEludGVyZmFjZSBhbmQgY2xhc3MgZXhwZWN0IGEgZGlmZmVyZW50IGFtb3VudCBvZiBwYXJhbWV0ZXJzIGZvciB0aGUgZnVuY3Rpb24gJyArIGkgK1xuXHRcdFx0XHQgICdcXG5FWFBFQ1RFRDogJyArIHRoaXMuZGVzY3JpcHRvclsgaSBdLmxlbmd0aCArIFxuXHRcdFx0XHQgICdcXG5SRUNFSVZFRDogJyArIGNsYXNzVG9DaGVjay5wcm90b3R5cGVbIGkgXS5sZW5ndGg7XG5cblx0XHR9XG5cdH1cbn07XG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEludGVyZmFjZTsiLCIvL0V4cG9ydHMgYSBmdW5jdGlvbiBuYW1lZCAncGFyZW50J1xubW9kdWxlLmV4cG9ydHMucGFyZW50ID0gZnVuY3Rpb24oKSB7XG5cdC8vIGlmIHRoZSBjdXJyZW50IGZ1bmN0aW9uIGNhbGxpbmcgaXMgdGhlIGNvbnN0cnVjdG9yXG5cdGlmKCB0aGlzLnBhcmVudC5jYWxsZXIuJCRpc0NvbnN0cnVjdG9yICkge1xuXHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IHRoaXMucGFyZW50LmNhbGxlci4kJHBhcmVudENvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdGlmKCB0aGlzLnBhcmVudC5jYWxsZXIuJCRuYW1lICkge1xuXHRcdFx0dmFyIGNhbGxlck5hbWUgPSB0aGlzLnBhcmVudC5jYWxsZXIuJCRuYW1lO1xuXHRcdFx0dmFyIGlzR2V0dGVyID0gdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIuJCRnZXR0ZXJzWyBjYWxsZXJOYW1lIF07XG5cdFx0XHR2YXIgaXNTZXR0ZXIgPSB0aGlzLnBhcmVudC5jYWxsZXIuJCRvd25lci4kJHNldHRlcnNbIGNhbGxlck5hbWUgXTtcblxuXHRcdFx0aWYoIGFyZ3VtZW50cy5sZW5ndGggPT0gMSAmJiBpc1NldHRlciApIHtcblx0XHRcdFx0dmFyIHBhcmVudEZ1bmN0aW9uID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKCB0aGlzLnBhcmVudC5jYWxsZXIuJCRvd25lciApLiQkc2V0dGVyc1sgY2FsbGVyTmFtZSBdO1xuXG5cdFx0XHRcdGlmKCBwYXJlbnRGdW5jdGlvbiA9PT0gdW5kZWZpbmVkICkge1xuXHRcdFx0XHRcdHRocm93ICdObyBzZXR0ZXIgZGVmaW5lZCBpbiBwYXJlbnQnO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYoIGFyZ3VtZW50cy5sZW5ndGggPT0gMCAmJiBpc0dldHRlciApIHtcblx0XHRcdFx0dmFyIHBhcmVudEZ1bmN0aW9uID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKCB0aGlzLnBhcmVudC5jYWxsZXIuJCRvd25lciApLiQkZ2V0dGVyc1sgY2FsbGVyTmFtZSBdO1xuXG5cdFx0XHRcdGlmKCBwYXJlbnRGdW5jdGlvbiA9PT0gdW5kZWZpbmVkICkge1xuXHRcdFx0XHRcdHRocm93ICdObyBnZXR0ZXIgZGVmaW5lZCBpbiBwYXJlbnQnO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYoIGlzU2V0dGVyIHx8IGlzR2V0dGVyICkge1xuXHRcdFx0XHR0aHJvdyAnSW5jb3JyZWN0IGFtb3VudCBvZiBhcmd1bWVudHMgc2VudCB0byBnZXR0ZXIgb3Igc2V0dGVyJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIgKVsgY2FsbGVyTmFtZSBdO1x0XG5cblx0XHRcdFx0aWYoIHBhcmVudEZ1bmN0aW9uID09PSB1bmRlZmluZWQgKSB7XG5cdFx0XHRcdFx0dGhyb3cgJ05vIHBhcmVudCBmdW5jdGlvbiBkZWZpbmVkIGZvciAnICsgY2FsbGVyTmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyAnWW91IGNhbm5vdCBjYWxsIHBhcmVudCBoZXJlJztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcGFyZW50RnVuY3Rpb24uYXBwbHkoIHRoaXMsIGFyZ3VtZW50cyApO1xufTsiXX0=
;