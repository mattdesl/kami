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

	shader.bind();
	context.gl.uniform1i(shader.getUniformLocation("tex0"), 0);

	// console.log(shader.getUniformLocation("tex0"));
	// console.log(shader.getAttributeLocation("TexCoord"));
	// 
	//create a texture from Image
	// var tex = new Texture(context.gl);

	var pixels = new Uint16Array([255, 255, 0, 255]);

	//create texture from Image (async load)
	var tex = new Texture(context, "img/bunny.png");

	// var tex = new Texture(context, "img/bunny.png", onload);

	var vertices = new Float32Array([
		-1, -1,
		0, 0,

		0, -1,
		1, 0,

		0, 0,
		1, 1,

		-1, 0, //xy
		0, 1 //uv
	]);
	
	var indices = new Uint16Array([
		0, 1, 2,
		0, 2, 3,
	]);

	// context.gl.disable(context.gl.CULL_FACE)

	//static = true
	//numVerts = 4
	//numIndices = 6
	//attribs = just position right now...
	var vbo = new VertexData(context, true, 4, 6, [
		new VertexData.Attrib("Position", 2),
		new VertexData.Attrib("TexCoord", 2)
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
		tex.bind();
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

		this.wrapS = this.wrapT = Texture.DEFAULT_WRAP;
		this.minFilter = this.magFilter = Texture.DEFAULT_FILTER;

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

		
		//load the data
		if (this.provider) {
			this.provider.apply(this, this.providerArgs);
		}
	},

	/**
	 * Sets the wrap mode for this texture; if the second argument
	 * is undefined or falsy, then both S and T wrap will use the first
	 * argument.
	 *
	 * You can use Texture.Wrap constants for convenience, to avoid needing 
	 * a GL reference.
	 * 
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
 * The default wrap mode when creating new textures. If a custom 
 * provider was specified, it may choose to override this default mode.
 * 
 * @type {GLenum} the wrap mode for S and T coordinates
 * @default  Texture.Wrap.CLAMP_TO_EDGE
 */
Texture.DEFAULT_WRAP = Texture.Wrap.CLAMP_TO_EDGE;


/**
 * The default filter mode when creating new textures. If a custom
 * provider was specified, it may choose to override this default mode.
 *
 * @type {GLenum} the filter mode for min/mag
 * @default  Texture.Filter.LINEAR
 */
Texture.DEFAULT_FILTER = Texture.Filter.NEAREST;

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

		var gl = texture.gl;
	 	//TODO: investigate this further
	 	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
	 	
	 	//setup wrap modes without binding redundantly
	 	texture.setWrap(Texture.Wrap.CLAMP_TO_EDGE, Texture.Wrap.CLAMP_TO_EDGE, false);
	 	texture.setFilter(Texture.Filter.LINEAR, Texture.Filter.LINEAR, false);
	 	
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pL2RlbW9zL3NyYy9pbmRleC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL1NoYWRlclByb2dyYW0uanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL2xpYi9UZXh0dXJlLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9saWIvVmVydGV4RGF0YS5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL1dlYkdMQ29udGV4dC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL2luZGV4LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvaW5kZXguanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvQ2xhc3MuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvRW51bS5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL2pzT09QL2xpYi9JbnRlcmZhY2UuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvYmFzZUNsYXNzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbInZhciBXZWJHTENvbnRleHQgPSByZXF1aXJlKCdrYW1pJykuV2ViR0xDb250ZXh0O1xudmFyIFNoYWRlclByb2dyYW0gPSByZXF1aXJlKCdrYW1pJykuU2hhZGVyUHJvZ3JhbTtcbnZhciBUZXh0dXJlID0gcmVxdWlyZSgna2FtaScpLlRleHR1cmU7XG52YXIgVmVydGV4RGF0YSA9IHJlcXVpcmUoJ2thbWknKS5WZXJ0ZXhEYXRhO1xuXG4kKGZ1bmN0aW9uKCkge1xuXHR2YXIgbWFpbkNvbnRhaW5lciA9ICQoXCJib2R5XCIpLmNzcyh7XG5cdFx0YmFja2dyb3VuZDogXCIjMDAwXCJcblx0fSk7XG5cblx0dmFyIGRlbW9Db250YWluZXJzID0gW107XG5cdHZhciBjdXJyZW50RGVtbyA9IG51bGw7XG5cdHZhciBjdXJyZW50SW5kZXggPSAwO1xuXG5cblx0dmFyIHdpZHRoID0gODAwO1xuXHR2YXIgaGVpZ2h0ID0gNjAwO1xuXG5cdHZhciBjYW52YXMgPSAkKFwiPGNhbnZhcz5cIiwge1xuXHRcdHdpZHRoOiB3aWR0aCxcblx0XHRoZWlnaHQ6IGhlaWdodFxuXHR9KS5jc3Moe1xuXHRcdGJhY2tncm91bmQ6IFwiIzM0MzQzNFwiLCAgXG5cdFx0cG9zaXRpb246IFwiZml4ZWRcIixcblx0XHR0b3A6IDAsXG5cdFx0bGVmdDogMCxcblx0XHRvdmVyZmxvdzogXCJoaWRkZW5cIlxuXHR9KTtcblxuXHRjYW52YXMuYXBwZW5kVG8obWFpbkNvbnRhaW5lcik7XG5cblx0Ly9jcmVhdGUgb3VyIHdlYkdMIGNvbnRleHQuLlxuXHQvL3RoaXMgd2lsbCBtYW5hZ2Ugdmlld3BvcnQgYW5kIGNvbnRleHQgbG9zcy9yZXN0b3JlXG5cdHZhciBjb250ZXh0ID0gbmV3IFdlYkdMQ29udGV4dCg4MDAsIDYwMCwgY2FudmFzWzBdKTtcblx0XG5cdC8vY3JlYXRlIGEgYmFzaWMgc2hhZGVyLi5cblx0Ly90aGlzIHdpbGwgYmUgYWRkZWQgdG8gdGhlIGNvbnRleHQgYW5kIHJlLWNvbXBpbGVkIG9uIGNvbnRleHQgcmVzdG9yZVxuXHR2YXIgc2hhZGVyID0gbmV3IFNoYWRlclByb2dyYW0oY29udGV4dCwgJChcIiN2ZXJ0X3NoYWRlclwiKS5odG1sKCksICQoXCIjZnJhZ19zaGFkZXJcIikuaHRtbCgpKTtcblxuXHRzaGFkZXIuYmluZCgpO1xuXHRjb250ZXh0LmdsLnVuaWZvcm0xaShzaGFkZXIuZ2V0VW5pZm9ybUxvY2F0aW9uKFwidGV4MFwiKSwgMCk7XG5cblx0Ly8gY29uc29sZS5sb2coc2hhZGVyLmdldFVuaWZvcm1Mb2NhdGlvbihcInRleDBcIikpO1xuXHQvLyBjb25zb2xlLmxvZyhzaGFkZXIuZ2V0QXR0cmlidXRlTG9jYXRpb24oXCJUZXhDb29yZFwiKSk7XG5cdC8vIFxuXHQvL2NyZWF0ZSBhIHRleHR1cmUgZnJvbSBJbWFnZVxuXHQvLyB2YXIgdGV4ID0gbmV3IFRleHR1cmUoY29udGV4dC5nbCk7XG5cblx0dmFyIHBpeGVscyA9IG5ldyBVaW50MTZBcnJheShbMjU1LCAyNTUsIDAsIDI1NV0pO1xuXG5cdC8vY3JlYXRlIHRleHR1cmUgZnJvbSBJbWFnZSAoYXN5bmMgbG9hZClcblx0dmFyIHRleCA9IG5ldyBUZXh0dXJlKGNvbnRleHQsIFwiaW1nL2J1bm55LnBuZ1wiKTtcblxuXHQvLyB2YXIgdGV4ID0gbmV3IFRleHR1cmUoY29udGV4dCwgXCJpbWcvYnVubnkucG5nXCIsIG9ubG9hZCk7XG5cblx0dmFyIHZlcnRpY2VzID0gbmV3IEZsb2F0MzJBcnJheShbXG5cdFx0LTEsIC0xLFxuXHRcdDAsIDAsXG5cblx0XHQwLCAtMSxcblx0XHQxLCAwLFxuXG5cdFx0MCwgMCxcblx0XHQxLCAxLFxuXG5cdFx0LTEsIDAsIC8veHlcblx0XHQwLCAxIC8vdXZcblx0XSk7XG5cdFxuXHR2YXIgaW5kaWNlcyA9IG5ldyBVaW50MTZBcnJheShbXG5cdFx0MCwgMSwgMixcblx0XHQwLCAyLCAzLFxuXHRdKTtcblxuXHQvLyBjb250ZXh0LmdsLmRpc2FibGUoY29udGV4dC5nbC5DVUxMX0ZBQ0UpXG5cblx0Ly9zdGF0aWMgPSB0cnVlXG5cdC8vbnVtVmVydHMgPSA0XG5cdC8vbnVtSW5kaWNlcyA9IDZcblx0Ly9hdHRyaWJzID0ganVzdCBwb3NpdGlvbiByaWdodCBub3cuLi5cblx0dmFyIHZibyA9IG5ldyBWZXJ0ZXhEYXRhKGNvbnRleHQsIHRydWUsIDQsIDYsIFtcblx0XHRuZXcgVmVydGV4RGF0YS5BdHRyaWIoXCJQb3NpdGlvblwiLCAyKSxcblx0XHRuZXcgVmVydGV4RGF0YS5BdHRyaWIoXCJUZXhDb29yZFwiLCAyKVxuXHRdKTtcblxuXHQvL3RoZXNlIGFyZSBpbml0aWFsaXplZCBhbHJlYWR5LCBvciB3ZSBjYW4gb3ZlcnJpZGUgdGhlbSBsaWtlIHNvOlxuXHR2Ym8uaW5kaWNlcyA9IGluZGljZXM7XG5cdHZiby52ZXJ0aWNlcyA9IHZlcnRpY2VzO1xuXHR2Ym8uZGlydHkgPSB0cnVlO1xuXG5cdHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xuXG5cdC8vIHZhciBsb3NlQ3R4ID0gY29udGV4dC5nbC5nZXRFeHRlbnNpb24oXCJXRUJHTF9sb3NlX2NvbnRleHRcIik7XG5cblx0Ly8gc2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0Ly8gXHRsb3NlQ3R4Lmxvc2VDb250ZXh0KCk7XHRcblx0XHRcblx0Ly8gfS5iaW5kKHRoaXMpLCAxMDAwKTtcblxuXHQvLyBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHQvLyBcdGxvc2VDdHgucmVzdG9yZUNvbnRleHQoKTtcblx0Ly8gfS5iaW5kKHRoaXMpLCAzMjAwKTtcblxuXHRmdW5jdGlvbiByZW5kZXIoKSB7XG5cdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKHJlbmRlcik7XG5cblx0XHRpZiAoIWNvbnRleHQudmFsaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9IFxuXG5cdFx0dmFyIGdsID0gY29udGV4dC5nbDtcblxuXHRcdHZiby5kaXJ0eSA9IHRydWU7XG5cdFx0dGV4LmJpbmQoKTtcblx0XHRzaGFkZXIuYmluZCgpO1xuXG5cdFx0dmJvLmJpbmQoc2hhZGVyKTtcblx0XHR2Ym8uZHJhdyhnbC5UUklBTkdMRVMsIDYsIDApO1xuXHRcdHZiby51bmJpbmQoc2hhZGVyKTtcblx0fVxufSk7IiwidmFyIENsYXNzID0gcmVxdWlyZSgnanNPT1AnKS5DbGFzcztcblxudmFyIFNoYWRlclByb2dyYW0gPSBuZXcgQ2xhc3Moe1xuXHRcblx0dmVydFNvdXJjZTogbnVsbCxcblx0ZnJhZ1NvdXJjZTogbnVsbCwgXG4gXG5cdHZlcnRTaGFkZXI6IG51bGwsXG5cdGZyYWdTaGFkZXI6IG51bGwsXG5cblx0cHJvZ3JhbTogbnVsbCxcblxuXHR1bmlmb3JtQ2FjaGU6IG51bGwsXG5cdGF0dHJpYnV0ZUNhY2hlOiBudWxsLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKGNvbnRleHQsIHZlcnRTb3VyY2UsIGZyYWdTb3VyY2UsIGF0dHJpYkxvY2F0aW9ucykge1xuXHRcdGlmICghdmVydFNvdXJjZSB8fCAhZnJhZ1NvdXJjZSlcblx0XHRcdHRocm93IFwidmVydGV4IGFuZCBmcmFnbWVudCBzaGFkZXJzIG11c3QgYmUgZGVmaW5lZFwiO1xuXHRcdGlmICghY29udGV4dClcblx0XHRcdHRocm93IFwibm8gR0wgY29udGV4dCBzcGVjaWZpZWRcIjtcblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXG5cdFx0dGhpcy5hdHRyaWJMb2NhdGlvbnMgPSBhdHRyaWJMb2NhdGlvbnM7XG5cblx0XHQvL1dlIHRyaW0gKEVDTUFTY3JpcHQ1KSBzbyB0aGF0IHRoZSBHTFNMIGxpbmUgbnVtYmVycyBhcmVcblx0XHQvL2FjY3VyYXRlIG9uIHNoYWRlciBsb2dcblx0XHR0aGlzLnZlcnRTb3VyY2UgPSB2ZXJ0U291cmNlLnRyaW0oKTtcblx0XHR0aGlzLmZyYWdTb3VyY2UgPSBmcmFnU291cmNlLnRyaW0oKTtcblxuXHRcdC8vQWRkcyB0aGlzIHNoYWRlciB0byB0aGUgY29udGV4dCwgdG8gYmUgbWFuYWdlZFxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fSxcblxuXHQvKiogXG5cdCAqIFRoaXMgaXMgY2FsbGVkIGR1cmluZyB0aGUgU2hhZGVyUHJvZ3JhbSBjb25zdHJ1Y3Rvcixcblx0ICogYW5kIG1heSBuZWVkIHRvIGJlIGNhbGxlZCBhZ2FpbiBhZnRlciBjb250ZXh0IGxvc3MgYW5kIHJlc3RvcmUuXG5cdCAqL1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0dGhpcy5fY29tcGlsZVNoYWRlcnMoKTtcblx0fSxcblxuXHQvL0NvbXBpbGVzIHRoZSBzaGFkZXJzLCB0aHJvd2luZyBhbiBlcnJvciBpZiB0aGUgcHJvZ3JhbSB3YXMgaW52YWxpZC5cblx0X2NvbXBpbGVTaGFkZXJzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsOyBcblxuXHRcdHRoaXMudmVydFNoYWRlciA9IHRoaXMuX2xvYWRTaGFkZXIoZ2wuVkVSVEVYX1NIQURFUiwgdGhpcy52ZXJ0U291cmNlKTtcblx0XHR0aGlzLmZyYWdTaGFkZXIgPSB0aGlzLl9sb2FkU2hhZGVyKGdsLkZSQUdNRU5UX1NIQURFUiwgdGhpcy5mcmFnU291cmNlKTtcblxuXHRcdGlmICghdGhpcy52ZXJ0U2hhZGVyIHx8ICF0aGlzLmZyYWdTaGFkZXIpXG5cdFx0XHR0aHJvdyBcIkVycm9yIHJldHVybmVkIHdoZW4gY2FsbGluZyBjcmVhdGVTaGFkZXJcIjtcblxuXHRcdHRoaXMucHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKTtcblxuXHRcdGlmICh0aGlzLmF0dHJpYkxvY2F0aW9ucykge1xuXHRcdFx0Zm9yICh2YXIga2V5IGluIHRoaXMuYXR0cmliTG9jYXRpb25zKSB7XG5cdFx0XHRcdGlmICh0aGlzLmF0dHJpYkxvY2F0aW9ucy5oYXNPd25Qcm9wZXJ0eShrZXkpKVxuXHRcdCAgICBcdFx0Z2wuYmluZEF0dHJpYkxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgdGhpcy5hdHRyaWJMb2NhdGlvbnNba2V5XSwga2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRnbC5hdHRhY2hTaGFkZXIodGhpcy5wcm9ncmFtLCB0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmF0dGFjaFNoYWRlcih0aGlzLnByb2dyYW0sIHRoaXMuZnJhZ1NoYWRlcik7XG5cdFx0Z2wubGlua1Byb2dyYW0odGhpcy5wcm9ncmFtKTsgXG5cblx0XHRpZiAoIWdsLmdldFByb2dyYW1QYXJhbWV0ZXIodGhpcy5wcm9ncmFtLCBnbC5MSU5LX1NUQVRVUykpIHtcblx0XHRcdHRocm93IFwiRXJyb3IgbGlua2luZyB0aGUgc2hhZGVyIHByb2dyYW06XFxuXCJcblx0XHRcdFx0KyBnbC5nZXRQcm9ncmFtSW5mb0xvZyh0aGlzLnByb2dyYW0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2ZldGNoVW5pZm9ybXMoKTtcblx0XHR0aGlzLl9mZXRjaEF0dHJpYnV0ZXMoKTtcblx0fSxcblxuXHRfZmV0Y2hVbmlmb3JtczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHRoaXMudW5pZm9ybUNhY2hlID0ge307XG5cblx0XHR2YXIgbGVuID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkFDVElWRV9VTklGT1JNUyk7XG5cdFx0aWYgKCFsZW4pIC8vbnVsbCBvciB6ZXJvXG5cdFx0XHRyZXR1cm47XG5cblx0XHRmb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHtcblx0XHRcdHZhciBpbmZvID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybSh0aGlzLnByb2dyYW0sIGkpO1xuXHRcdFx0aWYgKGluZm8gPT09IG51bGwpIFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdHZhciBuYW1lID0gaW5mby5uYW1lO1xuXHRcdFx0dmFyIGxvY2F0aW9uID0gZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgbmFtZSk7XG5cdFx0XHRcblx0XHRcdHRoaXMudW5pZm9ybUNhY2hlW25hbWVdID0ge1xuXHRcdFx0XHRzaXplOiBpbmZvLnNpemUsXG5cdFx0XHRcdHR5cGU6IGluZm8udHlwZSxcblx0XHRcdFx0bG9jYXRpb246IGxvY2F0aW9uXG5cdFx0XHR9O1xuXHRcdH1cblx0fSxcblxuXHRfZmV0Y2hBdHRyaWJ1dGVzOiBmdW5jdGlvbigpIHsgXG5cdFx0dmFyIGdsID0gdGhpcy5nbDsgXG5cblx0XHR0aGlzLmF0dHJpYnV0ZUNhY2hlID0ge307XG5cblx0XHR2YXIgbGVuID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkFDVElWRV9BVFRSSUJVVEVTKTtcblx0XHRpZiAoIWxlbikgLy9udWxsIG9yIHplcm9cblx0XHRcdHJldHVybjtcdFxuXG5cdFx0Zm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSB7XG5cdFx0XHR2YXIgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYih0aGlzLnByb2dyYW0sIGkpO1xuXHRcdFx0aWYgKGluZm8gPT09IG51bGwpIFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdHZhciBuYW1lID0gaW5mby5uYW1lO1xuXG5cdFx0XHQvL3RoZSBhdHRyaWIgbG9jYXRpb24gaXMgYSBzaW1wbGUgaW5kZXhcblx0XHRcdHZhciBsb2NhdGlvbiA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgbmFtZSk7XG5cdFx0XHRcblx0XHRcdHRoaXMuYXR0cmlidXRlQ2FjaGVbbmFtZV0gPSB7XG5cdFx0XHRcdHNpemU6IGluZm8uc2l6ZSxcblx0XHRcdFx0dHlwZTogaW5mby50eXBlLFxuXHRcdFx0XHRsb2NhdGlvbjogbG9jYXRpb25cblx0XHRcdH07XG5cdFx0fVxuXHR9LFxuXG5cdF9sb2FkU2hhZGVyOiBmdW5jdGlvbih0eXBlLCBzb3VyY2UpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dmFyIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKTtcblx0XHRpZiAoIXNoYWRlcikgLy9zaG91bGQgbm90IG9jY3VyLi4uXG5cdFx0XHRyZXR1cm4gLTE7XG5cblx0XHRnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpO1xuXHRcdGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKTtcblx0XHRcblx0XHRpZiAoIWdsLmdldFNoYWRlclBhcmFtZXRlcihzaGFkZXIsIGdsLkNPTVBJTEVfU1RBVFVTKSApIHtcblx0XHRcdHZhciBsb2cgPSBnbC5nZXRTaGFkZXJJbmZvTG9nKHNoYWRlcik7XG5cdFx0XHRpZiAobG9nID09PSBudWxsKSAvL21heSByZXR1cm4gbnVsbCBhcyBwZXIgV2ViR0wgc3BlY1xuXHRcdFx0XHRsb2cgPSBcIkVycm9yIGV4ZWN1dGluZyBnZXRTaGFkZXJJbmZvTG9nXCI7XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Ly93ZSBkbyB0aGlzIHNvIHRoZSB1c2VyIGtub3dzIHdoaWNoIHNoYWRlciBoYXMgdGhlIGVycm9yXG5cdFx0XHRcdHZhciB0eXBlU3RyID0gKHR5cGUgPT09IGdsLlZFUlRFWF9TSEFERVIpID8gXCJ2ZXJ0ZXhcIiA6IFwiZnJhZ21lbnRcIjtcblx0XHRcdFx0bG9nID0gXCJFcnJvciBjb21waWxpbmcgXCIrIHR5cGVTdHIrIFwiIHNoYWRlcjpcXG5cIitsb2c7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBsb2c7XG5cdFx0fVxuXHRcdHJldHVybiBzaGFkZXI7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGluZm8gKHNpemUsIHR5cGUsIGxvY2F0aW9uKS5cblx0ICogSWYgdGhlIHVuaWZvcm0gaXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZSwgaXQgaXMgYXNzdW1lZFxuXHQgKiB0byBub3QgZXhpc3QsIGFuZCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqXG5cdCAqIFRoaXMgbWF5IHJldHVybiBudWxsIGV2ZW4gaWYgdGhlIHVuaWZvcm0gaXMgZGVmaW5lZCBpbiBHTFNMOlxuXHQgKiBpZiBpdCBpcyBfaW5hY3RpdmVfIChpLmUuIG5vdCB1c2VkIGluIHRoZSBwcm9ncmFtKSB0aGVuIGl0IG1heVxuXHQgKiBiZSBvcHRpbWl6ZWQgb3V0LlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge09iamVjdH0gYW4gb2JqZWN0IGNvbnRhaW5pbmcgbG9jYXRpb24sIHNpemUsIGFuZCB0eXBlXG5cdCAqL1xuXHRnZXRVbmlmb3JtSW5mbzogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLnVuaWZvcm1DYWNoZVtuYW1lXSB8fCBudWxsOyBcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIGF0dHJpYnV0ZSBpbmZvIChzaXplLCB0eXBlLCBsb2NhdGlvbikuXG5cdCAqIElmIHRoZSBhdHRyaWJ1dGUgaXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZSwgaXQgaXMgYXNzdW1lZFxuXHQgKiB0byBub3QgZXhpc3QsIGFuZCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqXG5cdCAqIFRoaXMgbWF5IHJldHVybiBudWxsIGV2ZW4gaWYgdGhlIGF0dHJpYnV0ZSBpcyBkZWZpbmVkIGluIEdMU0w6XG5cdCAqIGlmIGl0IGlzIF9pbmFjdGl2ZV8gKGkuZS4gbm90IHVzZWQgaW4gdGhlIHByb2dyYW0gb3IgZGlzYWJsZWQpIFxuXHQgKiB0aGVuIGl0IG1heSBiZSBvcHRpbWl6ZWQgb3V0LlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSBhdHRyaWJ1dGUgbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7b2JqZWN0fSBhbiBvYmplY3QgY29udGFpbmluZyBsb2NhdGlvbiwgc2l6ZSBhbmQgdHlwZVxuXHQgKi9cblx0Z2V0QXR0cmlidXRlSW5mbzogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmF0dHJpYnV0ZUNhY2hlW25hbWVdIHx8IG51bGw7IFxuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGxvY2F0aW9uIG9iamVjdC5cblx0ICogSWYgdGhlIHVuaWZvcm0gaXMgbm90IGZvdW5kLCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7R0xpbnR9IHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICovXG5cdGdldEF0dHJpYnV0ZUxvY2F0aW9uOiBmdW5jdGlvbihuYW1lKSB7IC8vVE9ETzogbWFrZSBmYXN0ZXIsIGRvbid0IGNhY2hlXG5cdFx0dmFyIGluZm8gPSB0aGlzLmdldEF0dHJpYnV0ZUluZm8obmFtZSk7XG5cdFx0cmV0dXJuIGluZm8gPyBpbmZvLmxvY2F0aW9uIDogbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gbG9jYXRpb24gb2JqZWN0LlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge1dlYkdMVW5pZm9ybUxvY2F0aW9ufSB0aGUgbG9jYXRpb24gb2JqZWN0XG5cdCAqL1xuXHRnZXRVbmlmb3JtTG9jYXRpb246IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgaW5mbyA9IHRoaXMuZ2V0VW5pZm9ybUluZm8obmFtZSk7XG5cdFx0cmV0dXJuIGluZm8gPyBpbmZvLmxvY2F0aW9uIDogbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSB1bmlmb3JtIGlzIGFjdGl2ZSBhbmQgZm91bmQgaW4gdGhpc1xuXHQgKiBjb21waWxlZCBwcm9ncmFtLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSAgbmFtZSB0aGUgdW5pZm9ybSBuYW1lXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgdGhlIHVuaWZvcm0gaXMgZm91bmQgYW5kIGFjdGl2ZVxuXHQgKi9cblx0aGFzVW5pZm9ybTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdldFVuaWZvcm1JbmZvKG5hbWUpICE9PSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGF0dHJpYnV0ZSBpcyBhY3RpdmUgYW5kIGZvdW5kIGluIHRoaXNcblx0ICogY29tcGlsZWQgcHJvZ3JhbS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gIG5hbWUgdGhlIGF0dHJpYnV0ZSBuYW1lXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgdGhlIGF0dHJpYnV0ZSBpcyBmb3VuZCBhbmQgYWN0aXZlXG5cdCAqL1xuXHRoYXNBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBdHRyaWJ1dGVJbmZvKG5hbWUpICE9PSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB1bmlmb3JtIHZhbHVlIGJ5IG5hbWUuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7YW55fSBUaGUgdmFsdWUgb2YgdGhlIFdlYkdMIHVuaWZvcm1cblx0ICovXG5cdGdldFVuaWZvcm06IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nbC5nZXRVbmlmb3JtKHRoaXMucHJvZ3JhbSwgdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSkpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB1bmlmb3JtIHZhbHVlIGF0IHRoZSBzcGVjaWZpZWQgV2ViR0xVbmlmb3JtTG9jYXRpb24uXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtXZWJHTFVuaWZvcm1Mb2NhdGlvbn0gbG9jYXRpb24gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKiBAcmV0dXJuIHthbnl9IFRoZSB2YWx1ZSBvZiB0aGUgV2ViR0wgdW5pZm9ybVxuXHQgKi9cblx0Z2V0VW5pZm9ybUF0OiBmdW5jdGlvbihsb2NhdGlvbikge1xuXHRcdHJldHVybiB0aGlzLmdsLmdldFVuaWZvcm0odGhpcy5wcm9ncmFtLCBsb2NhdGlvbik7XG5cdH0sXG5cdFxuXHRzZXRVbmlmb3JtOiBmdW5jdGlvbihuYW1lLCB0eXBlLCBhcmdzKSB7XG5cdFx0Ly9maXJzdCBsb29rIGluIGNhY2hlXG5cdFx0Ly9pZiBub3QgZm91bmQsXG5cdH0sXG5cblx0Z2V0VW5pZm9ybTogZnVuY3Rpb24obmFtZSkge1xuXG5cdH0sXG5cblx0YmluZDogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbC51c2VQcm9ncmFtKHRoaXMucHJvZ3JhbSk7XG5cdH0sXG5cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC5kZXRhY2hTaGFkZXIodGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRnbC5kZXRhY2hTaGFkZXIodGhpcy5mcmFnU2hhZGVyKTtcblxuXHRcdGdsLmRlbGV0ZVNoYWRlcih0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmRlbGV0ZVNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXG5cdFx0Z2wuZGVsZXRlUHJvZ3JhbSh0aGlzLnByb2dyYW0pO1xuXHRcdHRoaXMucHJvZ3JhbSA9IG51bGw7XG5cdH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNoYWRlclByb2dyYW07IiwidmFyIENsYXNzID0gcmVxdWlyZSgnanNPT1AnKS5DbGFzcztcblxudmFyIFRleHR1cmUgPSBuZXcgQ2xhc3Moe1xuXG5cdGlkOiBudWxsLFxuXHR0YXJnZXQ6IG51bGwsXG5cdHdpZHRoOiAwLFxuXHRoZWlnaHQ6IDAsXG5cdHdyYXA6IG51bGwsXG5cdGZpbHRlcjogbnVsbCxcblxuXHRfX21hbmFnZWQ6IGZhbHNlLFxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgdGV4dHVyZSBpcyAnbWFuYWdlZCcgYW5kIHdpbGwgYmUgcmVzdG9yZWQgb24gY29udGV4dCBsb3NzLlxuXHQgKiBJZiBubyBpbWFnZSBwcm92aWRlciBpcyB1c2VkXG5cdCAqIFxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdG1hbmFnZWQ6IHtcblx0XHRnZXQ6IGZ1bmN0aW9uKCkgeyBcblx0XHRcdHJldHVybiB0aGlzLl9fbWFuYWdlZDsgXG5cdFx0fVxuXG5cdFx0Ly9UT0RPOiBhZGQgdG8gY2FjaGUgd2hlbiB1c2VyIHNldHMgbWFuYWdlZCA9IHRydWVcblx0XHQvLyBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXG5cdFx0Ly8gfVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IHRleHR1cmUgd2l0aCB0aGUgb3B0aW9uYWwgZGF0YSBwcm92aWRlci5cblx0ICpcblx0ICogQSBkYXRhIHByb3ZpZGVyIGlzIGEgZnVuY3Rpb24gd2hpY2ggaXMgY2FsbGVkIGJ5IFRleHR1cmVcblx0ICogb24gaW50aWlhbGl6YXRpb24sIGFuZCBzdWJzZXF1ZW50bHkgb24gYW55IGNvbnRleHQgcmVzdG9yYXRpb24uXG5cdCAqIFRoaXMgYWxsb3dzIGltYWdlcyB0byBiZSByZS1sb2FkZWQgd2l0aG91dCB0aGUgbmVlZCB0byBrZWVwXG5cdCAqIHRoZW0gaGFuZ2luZyBhcm91bmQgaW4gbWVtb3J5LiBUaGlzIGFsc28gbWVhbnMgdGhhdCBwcm9jZWR1cmFsXG5cdCAqIHRleHR1cmVzIHdpbGwgYmUgcmUtY3JlYXRlZCBwcm9wZXJseSBvbiBjb250ZXh0IHJlc3RvcmUuXG5cdCAqXG5cdCAqIENhbGxpbmcgdGhpcyBjb25zdHJ1Y3RvciB3aXRoIG5vIGFyZ3VtZW50cyB3aWxsIHJlc3VsdCBpbiBhbiBFcnJvci5cblx0ICpcblx0ICogSWYgdGhpcyBjb25zdHJ1Y3RvciBpcyBjYWxsZWQgd2l0aCBvbmx5IHRoZSBjb250ZXh0IChvbmUgYXJndW1lbnQpLFxuXHQgKiB0aGVuIG5vIHByb3ZpZGVyIGlzIHVzZWQgYW5kIHRoZSB0ZXh0dXJlIHdpbGwgYmUgdW5tYW5hZ2VkIGFuZCBpdHMgd2lkdGhcblx0ICogYW5kIGhlaWdodCB3aWxsIGJlIHplcm8uXG5cdCAqIFxuXHQgKiBJZiB0aGUgc2Vjb25kIGFyZ3VtZW50IGlzIGEgc3RyaW5nLCB3ZSB3aWxsIHVzZSB0aGUgZGVmYXVsdCBJbWFnZVByb3ZpZGVyIFxuXHQgKiB0byBsb2FkIHRoZSB0ZXh0dXJlIGludG8gdGhlIEdQVSBhc3luY2hyb25vdXNseS4gVXNhZ2U6XG5cdCAqXG5cdCAqICAgICBuZXcgVGV4dHVyZShjb250ZXh0LCBcInBhdGgvaW1nLnBuZ1wiKTtcblx0ICogICAgIG5ldyBUZXh0dXJlKGNvbnRleHQsIFwicGF0aC9pbWcucG5nXCIsIG9ubG9hZENhbGxiYWNrLCBvbmVycm9yQ2FsbGJhY2spO1xuXHQgKlxuXHQgKiBUaGUgY2FsbGJhY2tzIHdpbGwgYmUgZmlyZWQgZXZlcnkgdGltZSB0aGUgaW1hZ2UgaXMgcmUtbG9hZGVkLCBldmVuIG9uIGNvbnRleHRcblx0ICogcmVzdG9yZS5cblx0ICpcblx0ICogSWYgdGhlIHNlY29uZCBhbmQgdGhpcmQgYXJndW1lbnRzIGFyZSBOdW1iZXJzLCB3ZSB3aWxsIHVzZSB0aGUgZGVmYXVsdFxuXHQgKiBBcnJheVByb3ZpZGVyLCB3aGljaCB0YWtlcyBpbiBhIEFycmF5QnVmZmVyVmlldyBvZiBwaXhlbHMuIFRoaXMgYWxsb3dzXG5cdCAqIHVzIHRvIGNyZWF0ZSB0ZXh0dXJlcyBzeW5jaHJvbm91c2x5IGxpa2Ugc286XG5cdCAqXG5cdCAqICAgICBuZXcgVGV4dHVyZShjb250ZXh0LCAyNTYsIDI1Nik7IC8vdXNlcyBlbXB0eSBkYXRhLCB0cmFuc3BhcmVudCBibGFja1xuXHQgKiAgICAgbmV3IFRleHR1cmUoY29udGV4dCwgMjU2LCAyNTYsIGdsLkxVTUlOQU5DRSk7IC8vZW1wdHkgZGF0YSBhbmQgTFVNSU5BTkNFIGZvcm1hdFxuXHQgKiAgICAgbmV3IFRleHR1cmUoY29udGV4dCwgMjU2LCAyNTYsIGdsLkxVTUlOQU5DRSwgZ2wuVU5TSUdORURfQllURSwgYnl0ZUFycmF5KTsgLy9jdXN0b20gZGF0YVxuXHQgKlxuXHQgKiBPdGhlcndpc2UsIHdlIHdpbGwgYXNzdW1lIHRoYXQgYSBjdXN0b20gcHJvdmlkZXIgaXMgc3BlY2lmaWVkLiBJbiB0aGlzIGNhc2UsIHRoZSBzZWNvbmRcblx0ICogYXJndW1lbnQgaXMgYSBwcm92aWRlciBmdW5jdGlvbiwgYW5kIHRoZSBzdWJzZXF1ZW50IGFyZ3VtZW50cyBhcmUgdGhvc2Ugd2hpY2ggd2lsbCBiZSBwYXNzZWQgXG5cdCAqIHRvIHRoZSBwcm92aWRlci4gVGhlIHByb3ZpZGVyIGZ1bmN0aW9uIGFsd2F5cyByZWNlaXZlcyB0aGUgdGV4dHVyZSBvYmplY3QgYXMgdGhlIGZpcnN0IGFyZ3VtZW50LFxuXHQgKiBhbmQgdGhlbiBhbnkgb3RoZXJzIHRoYXQgbWF5IGhhdmUgYmVlbiBwYXNzZWQgdG8gaXQuIEZvciBleGFtcGxlLCBoZXJlIGlzIGEgYmFzaWMgSW1hZ2VQcm92aWRlciBcblx0ICogaW1wbGVtZW50YXRpb246XG5cdCAqXG5cdCAqICAgICAvL3RoZSBwcm92aWRlciBmdW5jdGlvblxuXHQgKiAgICAgdmFyIEltYWdlUHJvdmlkZXIgPSBmdW5jdGlvbih0ZXh0dXJlLCBwYXRoKSB7XG5cdCAqICAgICAgICAgdmFyIGltZyA9IG5ldyBJbWFnZSgpO1xuXHQgKiAgICAgICAgIGltZy5vbmxvYWQgPSBmdW5jdGlvbigpIHtcblx0ICogICAgXHQgICAgICAgdGV4dHVyZS51cGxvYWRJbWFnZShpbWcpO1xuXHQgKiAgICAgICAgIH0uYmluZCh0aGlzKTtcblx0ICogICAgICAgICBpbWcuc3JjID0gcGF0aDtcblx0ICogICAgIH07XG5cdCAqXG5cdCAqICAgICAvL2xvYWRzIHRoZSBpbWFnZSBhc3luY2hyb25vdXNseVxuXHQgKiAgICAgdmFyIHRleCA9IG5ldyBUZXh0dXJlKGNvbnRleHQsIEltYWdlUHJvdmlkZXIsIFwibXlpbWcucG5nXCIpO1xuXHQgKlxuXHQgKiBcblx0ICogQHBhcmFtICB7V2ViR0xDb250ZXh0fSBnbCB0aGUgV2ViR0wgY29udGV4dFxuXHQgKiBAcGFyYW0gIHtGdW5jdGlvbn0gcHJvdmlkZXIgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19IGFyZ3MgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbihjb250ZXh0KSB7XG5cdFx0aWYgKCFjb250ZXh0IHx8IGFyZ3VtZW50cy5sZW5ndGggPT09IDApXG5cdFx0XHR0aHJvdyBcIm5vIFdlYkdMQ2FudmFzIHNwZWNpZmllZFwiO1xuXHRcdHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0XG5cdFx0dmFyIHByb3ZpZGVyQXJncyA9IFt0aGlzXTtcblx0XHR2YXIgcHJvdmlkZXIgPSBudWxsO1xuXG5cdFx0Ly8gZS5nLiAtLT4gbmV3IFRleHR1cmUoZ2wsIFwibXlwYXRoLmpwZ1wiKVxuXHRcdC8vIFx0XHRcdG5ldyBUZXh0dXJlKGdsLCBcIm15cGF0aC5qcGdcIiwgZ2wuUkdCKVxuXHRcdC8vXHRcdFx0bmV3IFRleHR1cmUoZ2wsIG15UHJvdmlkZXIsIGFyZzAsIGFyZzEpXG5cdFx0Ly8gICAgICAgICAgbmV3IFRleHR1cmUoZ2wsIFRleHR1cmUuSW1hZ2VQcm92aWRlciwgXCJteXBhdGguanBnXCIsIGdsLlJHQilcblx0XHQvL1x0XHRcdG5ldyBUZXh0dXJlKGdsLCBUZXh0dWVyLkFycmF5UHJvdmlkZXIsIDI1NiwgMjU2KVxuXHRcdC8vXHRcdFx0bmV3IFRleHR1cmUoZ2wsIDI1NiwgMjU2LCBnbC5SR0IsIGdsLlVOU0lHTkVEX0JZVEUsIGRhdGEpO1xuXG5cdFx0Ly93ZSBhcmUgd29ya2luZyB3aXRoIGEgcHJvdmlkZXIgb2Ygc29tZSBraW5kLi4uXG5cdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG5cdFx0XHR2YXIgc2xpY2VkQXJncyA9IFtdO1xuXG5cdFx0XHQvL2RldGVybWluZSB0aGUgcHJvdmlkZXIsIGlmIGFueS4uLlxuXHRcdFx0aWYgKHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdFx0cHJvdmlkZXIgPSBUZXh0dXJlLkltYWdlUHJvdmlkZXI7XG5cdFx0XHRcdHNsaWNlZEFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpXG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRwcm92aWRlciA9IGFyZ3VtZW50c1sxXTtcblx0XHRcdFx0c2xpY2VkQXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG5cdFx0XHR9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAyIFxuXHRcdFx0XHRcdFx0JiYgdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJudW1iZXJcIiBcblx0XHRcdFx0XHRcdCYmIHR5cGVvZiBhcmd1bWVudHNbMl0gPT09IFwibnVtYmVyXCIpIHtcblx0XHRcdFx0cHJvdmlkZXIgPSBUZXh0dXJlLkFycmF5UHJvdmlkZXI7XG5cdFx0XHRcdHNsaWNlZEFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHQvL2NvbmNhdCB3aXRoIHRleHR1cmUgYXMgZmlyc3QgcGFyYW1cblx0XHRcdHByb3ZpZGVyQXJncyA9IHByb3ZpZGVyQXJncy5jb25jYXQoc2xpY2VkQXJncyk7XG5cdFx0fVxuXG5cdFx0dGhpcy53cmFwUyA9IHRoaXMud3JhcFQgPSBUZXh0dXJlLkRFRkFVTFRfV1JBUDtcblx0XHR0aGlzLm1pbkZpbHRlciA9IHRoaXMubWFnRmlsdGVyID0gVGV4dHVyZS5ERUZBVUxUX0ZJTFRFUjtcblxuXHRcdC8vdGhlIHByb3ZpZGVyIGFuZCBpdHMgYXJncywgbWF5IGJlIG51bGwuLi5cblx0XHR0aGlzLnByb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0dGhpcy5wcm92aWRlckFyZ3MgPSBwcm92aWRlckFyZ3M7XG5cblx0XHQvL2lmIGEgcHJvdmlkZXIgaXMgc3BlY2lmaWVkLCBpdCB3aWxsIGJlIG1hbmFnZWQgYnkgV2ViR0xDYW52YXNcblx0XHR0aGlzLl9fbWFuYWdlZCA9IHRoaXMucHJvdmlkZXIgIT09IG51bGw7XG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHQvL2lmIHdlIGhhdmUgYSBwcm92aWRlciwgaW52b2tlIGl0XG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fSxcblxuXHQvL2NhbGxlZCBhZnRlciB0aGUgY29udGV4dCBoYXMgYmVlbiByZS1pbml0aWFsaXplZFxuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7IFxuXHRcdHRoaXMuaWQgPSB0aGlzLmdsLmNyZWF0ZVRleHR1cmUoKTsgLy90ZXh0dXJlIElEIGlzIHJlY3JlYXRlZFxuXHRcdHRoaXMud2lkdGggPSB0aGlzLmhlaWdodCA9IDA7IC8vc2l6ZSBpcyByZXNldCB0byB6ZXJvIHVudGlsIGxvYWRlZFxuXHRcdHRoaXMudGFyZ2V0ID0gdGhpcy5nbC5URVhUVVJFXzJEOyAgLy90aGUgcHJvdmlkZXIgY2FuIGNoYW5nZSB0aGlzIGlmIG5lY2Vzc2FyeSAoZS5nLiBjdWJlIG1hcHMpXG5cblx0XHRcblx0XHQvL2xvYWQgdGhlIGRhdGFcblx0XHRpZiAodGhpcy5wcm92aWRlcikge1xuXHRcdFx0dGhpcy5wcm92aWRlci5hcHBseSh0aGlzLCB0aGlzLnByb3ZpZGVyQXJncyk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSB3cmFwIG1vZGUgZm9yIHRoaXMgdGV4dHVyZTsgaWYgdGhlIHNlY29uZCBhcmd1bWVudFxuXHQgKiBpcyB1bmRlZmluZWQgb3IgZmFsc3ksIHRoZW4gYm90aCBTIGFuZCBUIHdyYXAgd2lsbCB1c2UgdGhlIGZpcnN0XG5cdCAqIGFyZ3VtZW50LlxuXHQgKlxuXHQgKiBZb3UgY2FuIHVzZSBUZXh0dXJlLldyYXAgY29uc3RhbnRzIGZvciBjb252ZW5pZW5jZSwgdG8gYXZvaWQgbmVlZGluZyBcblx0ICogYSBHTCByZWZlcmVuY2UuXG5cdCAqIFxuXHQgKiBAcGFyYW0ge0dMZW51bX0gcyB0aGUgUyB3cmFwIG1vZGVcblx0ICogQHBhcmFtIHtHTGVudW19IHQgdGhlIFQgd3JhcCBtb2RlXG5cdCAqIEBwYXJhbSB7Qm9vbGVhbn0gaWdub3JlQmluZCAob3B0aW9uYWwpIGlmIHRydWUsIHRoZSBiaW5kIHdpbGwgYmUgaWdub3JlZC4gXG5cdCAqL1xuXHRzZXRXcmFwOiBmdW5jdGlvbihzLCB0LCBpZ25vcmVCaW5kKSB7IC8vVE9ETzogc3VwcG9ydCBSIHdyYXAgbW9kZVxuXHRcdGlmIChzICYmIHQpIHtcblx0XHRcdHRoaXMud3JhcFMgPSBzO1xuXHRcdFx0dGhpcy53cmFwVCA9IHQ7XG5cdFx0fSBlbHNlIFxuXHRcdFx0dGhpcy53cmFwUyA9IHRoaXMud3JhcFQgPSBzO1xuXHRcdFx0XG5cdFx0aWYgKCFpZ25vcmVCaW5kKVxuXHRcdFx0dGhpcy5iaW5kKCk7XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHQgXHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX1dSQVBfUywgdGhpcy53cmFwUyk7XG5cdFx0Z2wudGV4UGFyYW1ldGVyaSh0aGlzLnRhcmdldCwgZ2wuVEVYVFVSRV9XUkFQX1QsIHRoaXMud3JhcFQpO1xuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIG1pbiBhbmQgbWFnIGZpbHRlciBmb3IgdGhpcyB0ZXh0dXJlOyBcblx0ICogaWYgbWFnIGlzIHVuZGVmaW5lZCBvciBmYWxzeSwgdGhlbiBib3RoIG1pbiBhbmQgbWFnIHdpbGwgdXNlIHRoZVxuXHQgKiBmaWx0ZXIgc3BlY2lmaWVkIGZvciBtaW4uXG5cdCAqXG5cdCAqIFlvdSBjYW4gdXNlIFRleHR1cmUuRmlsdGVyIGNvbnN0YW50cyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIG5lZWRpbmcgXG5cdCAqIGEgR0wgcmVmZXJlbmNlLlxuXHQgKiBcblx0ICogQHBhcmFtIHtHTGVudW19IG1pbiB0aGUgbWluaWZpY2F0aW9uIGZpbHRlclxuXHQgKiBAcGFyYW0ge0dMZW51bX0gbWFnIHRoZSBtYWduaWZpY2F0aW9uIGZpbHRlclxuXHQgKiBAcGFyYW0ge0Jvb2xlYW59IGlnbm9yZUJpbmQgaWYgdHJ1ZSwgdGhlIGJpbmQgd2lsbCBiZSBpZ25vcmVkLiBcblx0ICovXG5cdHNldEZpbHRlcjogZnVuY3Rpb24obWluLCBtYWcsIGlnbm9yZUJpbmQpIHsgXG5cdFx0aWYgKG1pbiAmJiBtYWcpIHtcblx0XHRcdHRoaXMubWluRmlsdGVyID0gbWluO1xuXHRcdFx0dGhpcy5tYWdGaWx0ZXIgPSBtYWc7XG5cdFx0fSBlbHNlIFxuXHRcdFx0dGhpcy5taW5GaWx0ZXIgPSB0aGlzLm1hZ0ZpbHRlciA9IG1pbjtcblx0XHRcdFxuXHRcdGlmICghaWdub3JlQmluZClcblx0XHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX01JTl9GSUxURVIsIHRoaXMubWluRmlsdGVyKTtcblx0IFx0Z2wudGV4UGFyYW1ldGVyaSh0aGlzLnRhcmdldCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCB0aGlzLm1hZ0ZpbHRlcik7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEEgbG93LWxldmVsIG1ldGhvZCB0byB1cGxvYWQgdGhlIHNwZWNpZmllZCBBcnJheUJ1ZmZlclZpZXdcblx0ICogdG8gdGhpcyB0ZXh0dXJlLiBUaGlzIHdpbGwgY2F1c2UgdGhlIHdpZHRoIGFuZCBoZWlnaHQgb2YgdGhpc1xuXHQgKiB0ZXh0dXJlIHRvIGNoYW5nZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICAgICAgICAgdGhlIG5ldyB3aWR0aCBvZiB0aGlzIHRleHR1cmUsXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHMgdG8gdGhlIGxhc3QgdXNlZCB3aWR0aCAob3IgemVybylcblx0ICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgICAgICAgICB0aGUgbmV3IGhlaWdodCBvZiB0aGlzIHRleHR1cmVcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0cyB0byB0aGUgbGFzdCB1c2VkIGhlaWdodCAob3IgemVybylcblx0ICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgICAgICAgICB0aGUgZGF0YSBmb3JtYXQsIGRlZmF1bHQgUkdCQVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IHR5cGUgICAgICAgICAgIHRoZSBkYXRhIHR5cGUsIGRlZmF1bHQgVU5TSUdORURfQllURSAoVWludDhBcnJheSlcblx0ICogQHBhcmFtICB7QXJyYXlCdWZmZXJWaWV3fSBkYXRhICB0aGUgcmF3IGRhdGEgZm9yIHRoaXMgdGV4dHVyZSwgb3IgbnVsbCBmb3IgYW4gZW1wdHkgaW1hZ2Vcblx0ICovXG5cdHVwbG9hZERhdGE6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLmZvcm1hdCA9IGZvcm1hdCB8fCBnbC5SR0JBO1xuXHRcdHR5cGUgPSB0eXBlIHx8IGdsLlVOU0lHTkVEX0JZVEU7XG5cdFx0ZGF0YSA9IGRhdGEgfHwgbnVsbDsgLy9tYWtlIHN1cmUgZmFsc2V5IHZhbHVlIGlzIG51bGwgZm9yIHRleEltYWdlMkRcblxuXHRcdHRoaXMud2lkdGggPSAod2lkdGggfHwgd2lkdGg9PTApID8gd2lkdGggOiB0aGlzLndpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gKGhlaWdodCB8fCBoZWlnaHQ9PTApID8gaGVpZ2h0IDogdGhpcy5oZWlnaHQ7XG5cblx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdGdsLnRleEltYWdlMkQodGhpcy50YXJnZXQsIDAsIHRoaXMuZm9ybWF0LCBcblx0XHRcdFx0XHQgIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0LCAwLCB0aGlzLmZvcm1hdCxcblx0XHRcdFx0XHQgIHR5cGUsIGRhdGEpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBVcGxvYWRzIEltYWdlRGF0YSwgSFRNTEltYWdlRWxlbWVudCwgSFRNTENhbnZhc0VsZW1lbnQgb3IgXG5cdCAqIEhUTUxWaWRlb0VsZW1lbnQuXG5cdCAqIFx0XG5cdCAqIEBwYXJhbSAge09iamVjdH0gZG9tT2JqZWN0IHRoZSBET00gaW1hZ2UgY29udGFpbmVyXG5cdCAqL1xuXHR1cGxvYWRJbWFnZTogZnVuY3Rpb24oZG9tT2JqZWN0LCBmb3JtYXQsIHR5cGUpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy5mb3JtYXQgPSBmb3JtYXQgfHwgZ2wuUkdCQTtcblx0XHR0eXBlID0gdHlwZSB8fCBnbC5VTlNJR05FRF9CWVRFO1xuXHRcdFxuXHRcdHRoaXMud2lkdGggPSBkb21PYmplY3Qud2lkdGg7XG5cdFx0dGhpcy5oZWlnaHQgPSBkb21PYmplY3QuaGVpZ2h0O1xuXG5cdFx0dGhpcy5iaW5kKCk7XG5cblx0XHRnbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCB0aGlzLmZvcm1hdCwgdGhpcy5mb3JtYXQsXG5cdFx0XHRcdFx0ICB0eXBlLCBkb21PYmplY3QpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBCaW5kcyB0aGUgdGV4dHVyZS4gSWYgdW5pdCBpcyBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgYmluZCB0aGUgdGV4dHVyZSBhdCB0aGUgZ2l2ZW4gc2xvdFxuXHQgKiAoVEVYVFVSRTAsIFRFWFRVUkUxLCBldGMpLiBJZiB1bml0IGlzIG5vdCBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgc2ltcGx5IGJpbmQgdGhlIHRleHR1cmUgYXQgd2hpY2hldmVyIHNsb3Rcblx0ICogaXMgY3VycmVudGx5IGFjdGl2ZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdW5pdCB0aGUgdGV4dHVyZSB1bml0IGluZGV4LCBzdGFydGluZyBhdCAwXG5cdCAqL1xuXHRiaW5kOiBmdW5jdGlvbih1bml0KSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRpZiAodW5pdCB8fCB1bml0ID09PSAwKVxuXHRcdFx0Z2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMCArIHVuaXQpO1xuXHRcdGdsLmJpbmRUZXh0dXJlKHRoaXMudGFyZ2V0LCB0aGlzLmlkKTtcblx0fVxufSk7XG5cblRleHR1cmUuRmlsdGVyID0ge1xuXHRORUFSRVNUOiA5NzI4LFxuXHRORUFSRVNUX01JUE1BUF9MSU5FQVI6IDk5ODYsXG5cdE5FQVJFU1RfTUlQTUFQX05FQVJFU1Q6IDk5ODQsXG5cdExJTkVBUjogOTcyOSxcblx0TElORUFSX01JUE1BUF9MSU5FQVI6IDk5ODcsXG5cdExJTkVBUl9NSVBNQVBfTkVBUkVTVDogOTk4NVxufTtcblxuVGV4dHVyZS5XcmFwID0ge1xuXHRDTEFNUF9UT19FREdFOiAzMzA3MSxcblx0TUlSUk9SRURfUkVQRUFUOiAzMzY0OCxcblx0UkVQRUFUOiAxMDQ5N1xufTtcblxuVGV4dHVyZS5Gb3JtYXQgPSB7XG5cdERFUFRIX0NPTVBPTkVOVDogNjQwMixcblx0QUxQSEE6IDY0MDYsXG5cdFJHQkE6IDY0MDgsXG5cdFJHQjogNjQwNyxcblx0TFVNSU5BTkNFOiA2NDA5LFxuXHRMVU1JTkFOQ0VfQUxQSEE6IDY0MTBcbn07XG5cbi8qKlxuICogVGhlIGRlZmF1bHQgd3JhcCBtb2RlIHdoZW4gY3JlYXRpbmcgbmV3IHRleHR1cmVzLiBJZiBhIGN1c3RvbSBcbiAqIHByb3ZpZGVyIHdhcyBzcGVjaWZpZWQsIGl0IG1heSBjaG9vc2UgdG8gb3ZlcnJpZGUgdGhpcyBkZWZhdWx0IG1vZGUuXG4gKiBcbiAqIEB0eXBlIHtHTGVudW19IHRoZSB3cmFwIG1vZGUgZm9yIFMgYW5kIFQgY29vcmRpbmF0ZXNcbiAqIEBkZWZhdWx0ICBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRVxuICovXG5UZXh0dXJlLkRFRkFVTFRfV1JBUCA9IFRleHR1cmUuV3JhcC5DTEFNUF9UT19FREdFO1xuXG5cbi8qKlxuICogVGhlIGRlZmF1bHQgZmlsdGVyIG1vZGUgd2hlbiBjcmVhdGluZyBuZXcgdGV4dHVyZXMuIElmIGEgY3VzdG9tXG4gKiBwcm92aWRlciB3YXMgc3BlY2lmaWVkLCBpdCBtYXkgY2hvb3NlIHRvIG92ZXJyaWRlIHRoaXMgZGVmYXVsdCBtb2RlLlxuICpcbiAqIEB0eXBlIHtHTGVudW19IHRoZSBmaWx0ZXIgbW9kZSBmb3IgbWluL21hZ1xuICogQGRlZmF1bHQgIFRleHR1cmUuRmlsdGVyLkxJTkVBUlxuICovXG5UZXh0dXJlLkRFRkFVTFRfRklMVEVSID0gVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVDtcblxuLyoqXG4gKiBUaGlzIGlzIGEgXCJwcm92aWRlclwiIGZ1bmN0aW9uIGZvciBpbWFnZXMsIGJhc2VkIG9uIHRoZSBnaXZlblxuICogcGF0aCAoc3JjKSBhbmQgb3B0aW9uYWwgY2FsbGJhY2tzLCBXZWJHTCBmb3JtYXQgYW5kIHR5cGUgb3B0aW9ucy5cbiAqXG4gKiBUaGUgY2FsbGJhY2tzIGFyZSBjYWxsZWQgZnJvbSB0aGUgVGV4dHVyZSBzY29wZTsgYnV0IGFsc28gcGFzc2VkIHRoZVxuICogdGV4dHVyZSB0byB0aGUgZmlyc3QgYXJndW1lbnQgKGluIGNhc2UgdGhlIHVzZXIgd2lzaGVzIHRvIHJlLWJpbmQgdGhlIFxuICogZnVuY3Rpb25zIHRvIHNvbWV0aGluZyBlbHNlKS5cbiAqIFxuICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIHdoaWNoIGlzIGJlaW5nIGFjdGVkIG9uXG4gKiBAcGFyYW0ge1N0cmluZ30gcGF0aCAgICAgdGhlIHBhdGggdG8gdGhlIGltYWdlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvbkxvYWQgdGhlIGNhbGxiYWNrIGFmdGVyIHRoZSBpbWFnZSBoYXMgYmVlbiBsb2FkZWQgYW5kIHVwbG9hZGVkIHRvIEdQVVxuICogQHBhcmFtIHtGdW5jdGlvbn0gb25FcnIgIHRoZSBjYWxsYmFjayBpZiB0aGVyZSB3YXMgYW4gZXJyb3Igd2hpbGUgbG9hZGluZyB0aGUgaW1hZ2VcbiAqIEBwYXJhbSB7R0xlbnVtfSBmb3JtYXQgICB0aGUgR0wgdGV4dHVyZSBmb3JtYXQgKGRlZmF1bHQgUkdCQSlcbiAqIEBwYXJhbSB7R0xlbnVtfSB0eXBlICAgICB0aGUgR0wgdGV4dHVyZSB0eXBlIChkZWZhdWx0IFVOU0lHTkVEX0JZVEUpXG4gKi9cblRleHR1cmUuSW1hZ2VQcm92aWRlciA9IGZ1bmN0aW9uKHRleHR1cmUsIHBhdGgsIG9uTG9hZCwgb25FcnIsIGZvcm1hdCwgdHlwZSkge1xuXHR2YXIgaW1nID0gbmV3IEltYWdlKCk7XG5cdGltZy5vbmxvYWQgPSBmdW5jdGlvbigpIHtcblx0XHR0ZXh0dXJlLnVwbG9hZEltYWdlKGltZywgZm9ybWF0LCB0eXBlKTtcblxuXHRcdHZhciBnbCA9IHRleHR1cmUuZ2w7XG5cdCBcdC8vVE9ETzogaW52ZXN0aWdhdGUgdGhpcyBmdXJ0aGVyXG5cdCBcdGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgdHJ1ZSk7XG5cdCBcdFxuXHQgXHQvL3NldHVwIHdyYXAgbW9kZXMgd2l0aG91dCBiaW5kaW5nIHJlZHVuZGFudGx5XG5cdCBcdHRleHR1cmUuc2V0V3JhcChUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRSwgVGV4dHVyZS5XcmFwLkNMQU1QX1RPX0VER0UsIGZhbHNlKTtcblx0IFx0dGV4dHVyZS5zZXRGaWx0ZXIoVGV4dHVyZS5GaWx0ZXIuTElORUFSLCBUZXh0dXJlLkZpbHRlci5MSU5FQVIsIGZhbHNlKTtcblx0IFx0XG5cdFx0aWYgKG9uTG9hZCAmJiB0eXBlb2Ygb25Mb2FkID09PSBcImZ1bmN0aW9uXCIpXG5cdFx0XHRvbkxvYWQuY2FsbCh0ZXh0dXJlLCB0ZXh0dXJlKTtcblx0fTtcblx0XG5cdGltZy5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKG9uRXJyICYmIHR5cGVvZiBvbkVyciA9PT0gXCJmdW5jdGlvblwiKSBcblx0XHRcdG9uRXJyLmNhbGwodGV4dHVyZSwgdGV4dHVyZSk7XG5cdH07XG5cblx0aW1nLnNyYyA9IHBhdGg7XG59O1xuXG4vKipcbiAqIFRoaXMgaXMgYSBcInByb3ZpZGVyXCIgZnVuY3Rpb24gZm9yIHN5bmNocm9ub3VzIEFycmF5QnVmZmVyVmlldyBwaXhlbCB1cGxvYWRzLlxuICogXG4gKiBAcGFyYW0gIHtUZXh0dXJlfSB0ZXh0dXJlICBcdCAgIHRoZSB0ZXh0dXJlIHdoaWNoIGlzIGJlaW5nIGFjdGVkIG9uXG4gKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoICAgICAgICAgIHRoZSB3aWR0aCBvZiB0aGlzIHRleHR1cmUsXG4gKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCAgICAgICAgIHRoZSBoZWlnaHQgb2YgdGhpcyB0ZXh0dXJlXG4gKiBAcGFyYW0gIHtHTGVudW19IGZvcm1hdCAgICAgICAgIHRoZSBkYXRhIGZvcm1hdCwgZGVmYXVsdCBSR0JBXG4gKiBAcGFyYW0gIHtHTGVudW19IHR5cGUgICAgICAgICAgIHRoZSBkYXRhIHR5cGUsIGRlZmF1bHQgVU5TSUdORURfQllURSAoVWludDhBcnJheSlcbiAqIEBwYXJhbSAge0FycmF5QnVmZmVyVmlld30gZGF0YSAgdGhlIHJhdyBkYXRhIGZvciB0aGlzIHRleHR1cmUsIG9yIG51bGwgZm9yIGFuIGVtcHR5IGltYWdlXG4gKi9cblRleHR1cmUuQXJyYXlQcm92aWRlciA9IGZ1bmN0aW9uKHRleHR1cmUsIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSkge1xuXHR0ZXh0dXJlLnVwbG9hZERhdGEod2lkdGgsIGhlaWdodCwgZm9ybWF0LCB0eXBlLCBkYXRhKTtcbn07XG5cbi8qKlxuICogVXRpbGl0eSB0byBnZXQgdGhlIG51bWJlciBvZiBjb21wb25lbnRzIGZvciB0aGUgZ2l2ZW4gR0xlbnVtLCBlLmcuIGdsLlJHQkEgcmV0dXJucyA0LlxuICogUmV0dXJucyBudWxsIGlmIHRoZSBzcGVjaWZpZWQgZm9ybWF0IGlzIG5vdCBvZiB0eXBlIERFUFRIX0NPTVBPTkVOVCwgQUxQSEEsIExVTUlOQU5DRSxcbiAqIExVTUlOQU5DRV9BTFBIQSwgUkdCLCBvciBSR0JBLlxuICpcbiAqIEBtZXRob2RcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSAge0dMZW51bX0gZm9ybWF0IGEgdGV4dHVyZSBmb3JtYXQsIGkuZS4gVGV4dHVyZS5Gb3JtYXQuUkdCQVxuICogQHJldHVybiB7TnVtYmVyfSB0aGUgbnVtYmVyIG9mIGNvbXBvbmVudHMgZm9yIHRoaXMgZm9ybWF0XG4gKi9cblRleHR1cmUuZ2V0TnVtQ29tcG9uZW50cyA9IGZ1bmN0aW9uKGZvcm1hdCkge1xuXHRzd2l0Y2ggKGZvcm1hdCkge1xuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuREVQVEhfQ09NUE9ORU5UOlxuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuQUxQSEE6XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5MVU1JTkFOQ0U6XG5cdFx0XHRyZXR1cm4gMTtcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkxVTUlOQU5DRV9BTFBIQTpcblx0XHRcdHJldHVybiAyO1xuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuUkdCOlxuXHRcdFx0cmV0dXJuIDM7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5SR0JBOlxuXHRcdFx0cmV0dXJuIDQ7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59O1xuXG4vL1VubWFuYWdlZCB0ZXh0dXJlczpcbi8vXHRIVE1MIGVsZW1lbnRzIGxpa2UgSW1hZ2UsIFZpZGVvLCBDYW52YXNcbi8vXHRwaXhlbHMgYnVmZmVyIGZyb20gQ2FudmFzXG4vL1x0cGl4ZWxzIGFycmF5XG5cbi8vTmVlZCBzcGVjaWFsIGhhbmRsaW5nOlxuLy8gIGNvbnRleHQub25Db250ZXh0TG9zdC5hZGQoZnVuY3Rpb24oKSB7XG4vLyAgXHRjcmVhdGVEeW5hbWljVGV4dHVyZSgpO1xuLy8gIH0uYmluZCh0aGlzKSk7XG5cbi8vTWFuYWdlZCB0ZXh0dXJlczpcbi8vXHRpbWFnZXMgc3BlY2lmaWVkIHdpdGggYSBwYXRoXG4vL1x0dGhpcyB3aWxsIHVzZSBJbWFnZSB1bmRlciB0aGUgaG9vZFxuXG5cblxubW9kdWxlLmV4cG9ydHMgPSBUZXh0dXJlOyIsInZhciBDbGFzcyA9IHJlcXVpcmUoJ2pzT09QJykuQ2xhc3M7XG5cbi8vVE9ETzogZGVjb3VwbGUgaW50byBWQk8gKyBJQk8gdXRpbGl0aWVzIFxudmFyIFZlcnRleERhdGEgPSBuZXcgQ2xhc3Moe1xuXG5cdGNvbnRleHQ6IG51bGwsXG5cdGdsOiBudWxsLFxuXG5cdG51bVZlcnRzOiBudWxsLFxuXHRudW1JbmRpY2VzOiBudWxsLFxuXHRcblx0dmVydGljZXM6IG51bGwsXG5cdGluZGljZXM6IG51bGwsXG5cdHZlcnRleEJ1ZmZlcjogbnVsbCxcblx0aW5kZXhCdWZmZXI6IG51bGwsXG5cblx0dmVydGljZXNEaXJ0eTogdHJ1ZSxcblx0aW5kaWNlc0RpcnR5OiB0cnVlLFxuXHRpbmRleFVzYWdlOiBudWxsLFxuXHR2ZXJ0ZXhVc2FnZTogbnVsbCxcblxuXHQvKiogXG5cdCAqIEBwcm9wZXJ0eVxuXHQgKiBAcHJpdmF0ZVxuXHQgKi9cblx0X3ZlcnRleEF0dHJpYnM6IG51bGwsXG5cblx0LyoqIFxuXHQgKiBAcHJvcGVydHlcblx0ICogQHByaXZhdGVcblx0ICovXG5cdF92ZXJ0ZXhTdHJpZGU6IG51bGwsXG5cblx0LyoqXG5cdCAqIEEgd3JpdGUtb25seSBwcm9wZXJ0eSB3aGljaCBzZXRzIGJvdGggdmVydGljZXMgYW5kIGluZGljZXMgXG5cdCAqIGZsYWcgdG8gZGlydHkgb3Igbm90LlxuXHQgKlxuXHQgKiBAcHJvcGVydHlcblx0ICogQHR5cGUge0Jvb2xlYW59XG5cdCAqIEB3cml0ZU9ubHlcblx0ICovXG5cdGRpcnR5OiB7XG5cdFx0c2V0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRcdHRoaXMudmVydGljZXNEaXJ0eSA9IHZhbDtcblx0XHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gdmFsO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBWZXJ0ZXhEYXRhIHdpdGggdGhlIHByb3ZpZGVkIHBhcmFtZXRlcnMuXG5cdCAqXG5cdCAqIElmIG51bUluZGljZXMgaXMgMCBvciBmYWxzeSwgbm8gaW5kZXggYnVmZmVyIHdpbGwgYmUgdXNlZFxuXHQgKiBhbmQgaW5kaWNlcyB3aWxsIGJlIGFuIGVtcHR5IEFycmF5QnVmZmVyIGFuZCBhIG51bGwgaW5kZXhCdWZmZXIuXG5cdCAqIFxuXHQgKiBJZiBpc1N0YXRpYyBpcyB0cnVlLCB0aGVuIHZlcnRleFVzYWdlIGFuZCBpbmRleFVzYWdlIHdpbGxcblx0ICogYmUgc2V0IHRvIGdsLlNUQVRJQ19EUkFXLiBPdGhlcndpc2UgdGhleSB3aWxsIHVzZSBnbC5EWU5BTUlDX0RSQVcuXG5cdCAqIFlvdSBtYXkgd2FudCB0byBhZGp1c3QgdGhlc2UgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gZm9yIGZ1cnRoZXIgY29udHJvbC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1dlYkdMQ29udGV4dH0gIGNvbnRleHQgdGhlIGNvbnRleHQgZm9yIG1hbmFnZW1lbnRcblx0ICogQHBhcmFtICB7Qm9vbGVhbn0gaXNTdGF0aWMgICAgICBhIGhpbnQgYXMgdG8gd2hldGhlciB0aGlzIGdlb21ldHJ5IGlzIHN0YXRpY1xuXHQgKiBAcGFyYW0gIHtbdHlwZV19ICBudW1WZXJ0cyAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSAgbnVtSW5kaWNlcyAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gIHZlcnRleEF0dHJpYnMgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcmV0dXJuIHtbdHlwZV19ICAgICAgICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKGNvbnRleHQsIGlzU3RhdGljLCBudW1WZXJ0cywgbnVtSW5kaWNlcywgdmVydGV4QXR0cmlicykge1xuXHRcdGlmICghY29udGV4dClcblx0XHRcdHRocm93IFwiR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkXCI7XG5cdFx0aWYgKCFudW1WZXJ0cylcblx0XHRcdHRocm93IFwibnVtVmVydHMgbm90IHNwZWNpZmllZCwgbXVzdCBiZSA+IDBcIjtcblxuXHRcdHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0dGhpcy5nbCA9IGNvbnRleHQuZ2w7XG5cdFx0XG5cdFx0dGhpcy5udW1WZXJ0cyA9IG51bVZlcnRzO1xuXHRcdHRoaXMubnVtSW5kaWNlcyA9IG51bUluZGljZXMgfHwgMDtcblx0XHR0aGlzLnZlcnRleFVzYWdlID0gaXNTdGF0aWMgPyB0aGlzLmdsLlNUQVRJQ19EUkFXIDogdGhpcy5nbC5EWU5BTUlDX0RSQVc7XG5cdFx0dGhpcy5pbmRleFVzYWdlICA9IGlzU3RhdGljID8gdGhpcy5nbC5TVEFUSUNfRFJBVyA6IHRoaXMuZ2wuRFlOQU1JQ19EUkFXO1xuXHRcdHRoaXMuX3ZlcnRleEF0dHJpYnMgPSB2ZXJ0ZXhBdHRyaWJzIHx8IFtdO1xuXHRcdFxuXHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSB0cnVlO1xuXG5cdFx0Ly9kZXRlcm1pbmUgdGhlIHZlcnRleCBzdHJpZGUgYmFzZWQgb24gZ2l2ZW4gYXR0cmlidXRlc1xuXHRcdHZhciB0b3RhbE51bUNvbXBvbmVudHMgPSAwO1xuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLl92ZXJ0ZXhBdHRyaWJzLmxlbmd0aDsgaSsrKVxuXHRcdFx0dG90YWxOdW1Db21wb25lbnRzICs9IHRoaXMuX3ZlcnRleEF0dHJpYnNbaV0ubnVtQ29tcG9uZW50cztcblx0XHR0aGlzLl92ZXJ0ZXhTdHJpZGUgPSB0b3RhbE51bUNvbXBvbmVudHMgKiA0OyAvLyBpbiBieXRlc1xuXG5cdFx0dGhpcy52ZXJ0aWNlcyA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5udW1WZXJ0cyk7XG5cdFx0dGhpcy5pbmRpY2VzID0gbmV3IFVpbnQxNkFycmF5KHRoaXMubnVtSW5kaWNlcyk7XG5cblx0XHQvL2FkZCB0aGlzIFZCTyB0byB0aGUgbWFuYWdlZCBjYWNoZVxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fSxcblxuXHQvL3JlY3JlYXRlcyB0aGUgYnVmZmVycyBvbiBjb250ZXh0IGxvc3Ncblx0Y3JlYXRlOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dGhpcy52ZXJ0ZXhCdWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKTtcblxuXHRcdC8vaWdub3JlIGluZGV4IGJ1ZmZlciBpZiB3ZSBoYXZlbid0IHNwZWNpZmllZCBhbnlcblx0XHR0aGlzLmluZGV4QnVmZmVyID0gdGhpcy5udW1JbmRpY2VzID4gMFxuXHRcdFx0XHRcdD8gZ2wuY3JlYXRlQnVmZmVyKClcblx0XHRcdFx0XHQ6IG51bGw7XG5cdH0sXG5cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy52ZXJ0aWNlcyA9IFtdO1xuXHRcdHRoaXMuaW5kaWNlcyA9IFtdO1xuXHRcdGlmICh0aGlzLnZlcnRleEJ1ZmZlcilcblx0XHRcdHRoaXMuZ2wuZGVsZXRlQnVmZmVyKHRoaXMudmVydGV4QnVmZmVyKTtcblx0XHRpZiAodGhpcy5pbmRleEJ1ZmZlcilcblx0XHRcdHRoaXMuZ2wuZGVsZXRlQnVmZmVyKHRoaXMuaW5kZXhCdWZmZXIpO1xuXHRcdHRoaXMudmVydGV4QnVmZmVyID0gbnVsbDtcblx0XHR0aGlzLmluZGV4QnVmZmVyID0gbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogQ2FsbGVkIHRvIGJpbmQgdGhpcyB2ZXJ0ZXggZGF0YSB3aXRoIHRoZSBnaXZlbiBcblx0ICogU2hhZGVyUHJvZ3JhbSwgZW5hYmxpbmcgYW55IGFzc29jaWF0ZWQgYXR0cmlidXRlXG5cdCAqIGFycmF5cy5cblx0ICpcblx0ICogSWYgc2hhZGVyIGlzIG51bGwgb3IgdW5kZWZpbmVkLCBpdCdzIGFzc3VtZWRcblx0ICogdGhhdCB0aGUgdmVydGV4IGF0dHJpYnV0ZXMgaGF2ZSBhbHJlYWR5IGJlZW4gYm91bmQuIFxuXHQgKiBUaGlzIGNhbiBiZSB1c2VkIGJ5IGFkdmFuY2VkIHVzZXJzIHRvIGF2b2lkIHJlZHVuZGFudFxuXHQgKiBHTCBjYWxscy5cblx0ICogXG5cdCAqIEBwYXJhbSAge1NoYWRlclByb2dyYW19IHNoYWRlciB0aGUgc2hhZGVyIHRoYXQgd2lsbCBiZSB1c2VkIHRvIHJlbmRlciB0aGlzIG1lc2hcblx0ICovXG5cdGJpbmQ6IGZ1bmN0aW9uKHNoYWRlcikge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHQvL2JpbmQgb3VyIGluZGV4IGRhdGEsIGlmIHdlIGhhdmUgYW55XG5cdFx0aWYgKHRoaXMubnVtSW5kaWNlcyA+IDApIHtcblx0XHRcdGdsLmJpbmRCdWZmZXIoZ2wuRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRoaXMuaW5kZXhCdWZmZXIpO1xuXHRcdFx0Ly91cGRhdGUgdGhlIGluZGV4IGRhdGFcblx0XHRcdGlmICh0aGlzLmluZGljZXNEaXJ0eSkge1xuXHRcdFx0XHRnbC5idWZmZXJEYXRhKGdsLkVMRU1FTlRfQVJSQVlfQlVGRkVSLCB0aGlzLmluZGljZXMsIHRoaXMuaW5kZXhVc2FnZSk7XG5cdFx0XHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly9iaW5kIG91ciB2ZXJ0ZXggZGF0YVxuXHRcdGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCB0aGlzLnZlcnRleEJ1ZmZlcik7XG5cdFx0Ly91cGRhdGUgb3VyIHZlcnRleCBkYXRhXG5cdFx0aWYgKHRoaXMudmVydGljZXNEaXJ0eSkge1xuXHRcdFx0Z2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIHRoaXMudmVydGljZXMsIHRoaXMudmVydGV4VXNhZ2UpO1xuXHRcdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHNoYWRlcilcblx0XHRcdHRoaXMuYmluZEF0dHJpYnV0ZXMoc2hhZGVyKTtcblx0fSxcblxuXHRkcmF3OiBmdW5jdGlvbihwcmltaXRpdmVUeXBlLCBjb3VudCwgb2Zmc2V0KSB7XG5cdFx0aWYgKGNvdW50ID09PSAwKVxuXHRcdFx0cmV0dXJuO1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRpZiAodGhpcy5udW1JbmRpY2VzID4gMCkgeyBcblx0XHRcdGdsLmRyYXdFbGVtZW50cyhwcmltaXRpdmVUeXBlLCBjb3VudCwgXG5cdFx0XHRcdFx0XHRnbC5VTlNJR05FRF9TSE9SVCwgb2Zmc2V0ICogMik7IC8vKiBVaW50MTZBcnJheS5CWVRFU19QRVJfRUxFTUVOVFxuXHRcdH0gZWxzZVxuXHRcdFx0Z2wuZHJhd0FycmF5cyhwcmltaXRpdmVUeXBlLCBvZmZzZXQsIGNvdW50KTtcblx0fSxcblxuXHR1bmJpbmQ6IGZ1bmN0aW9uKHNoYWRlcikge1xuXHRcdGlmIChzaGFkZXIpXG5cdFx0XHR0aGlzLnVuYmluZEF0dHJpYnV0ZXMoc2hhZGVyKTtcblx0fSxcblxuXHQvL2JpbmRzIHRoaXMgbWVzaCdzIHZlcnRleCBhdHRyaWJ1dGVzIGZvciB0aGUgZ2l2ZW4gc2hhZGVyXG5cdGJpbmRBdHRyaWJ1dGVzOiBmdW5jdGlvbihzaGFkZXIpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dmFyIG9mZnNldCA9IDA7XG5cdFx0dmFyIHN0cmlkZSA9IHRoaXMuX3ZlcnRleFN0cmlkZTtcblxuXHRcdC8vZm9yIGVhY2ggYXR0cmlidHVlXG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMuX3ZlcnRleEF0dHJpYnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhciBhID0gdGhpcy5fdmVydGV4QXR0cmlic1tpXTtcblxuXHRcdFx0Ly9sb2NhdGlvbiBvZiB0aGUgYXR0cmlidXRlXG5cdFx0XHR2YXIgbG9jID0gYS5sb2NhdGlvbiA9PT0gbnVsbCBcblx0XHRcdFx0XHQ/IHNoYWRlci5nZXRBdHRyaWJ1dGVMb2NhdGlvbihhLm5hbWUpXG5cdFx0XHRcdFx0OiBhLmxvY2F0aW9uO1xuXHRcdFx0XG5cdFx0XHQvL2ZpcnN0LCBlbmFibGUgdGhlIHZlcnRleCBhcnJheVxuXHRcdFx0Z2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkobG9jKTtcblx0XHRcdC8vdGhlbiBzcGVjaWZ5IG91ciB2ZXJ0ZXggZm9ybWF0XG5cdFx0XHRnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKGxvYywgYS5udW1Db21wb25lbnRzLCBhLnR5cGUgfHwgZ2wuRkxPQVQsIFxuXHRcdFx0XHRcdFx0XHRcdCAgIGEubm9ybWFsaXplIHx8IGZhbHNlLCBzdHJpZGUsIG9mZnNldCk7XG5cblxuXHRcdFx0Ly9hbmQgaW5jcmVhc2UgdGhlIG9mZnNldC4uLlxuXHRcdFx0b2Zmc2V0ICs9IGEubnVtQ29tcG9uZW50cyAqIDQ7IC8vaW4gYnl0ZXNcblxuXHRcdFx0Ly8gdmFyIGVyciA9IGdsLmdldEVycm9yKCk7XG5cdFx0XHQvLyBpZiAoZXJyKVxuXHRcdFx0Ly8gXHRjb25zb2xlLmxvZyhlcnIpO1xuXHRcdH1cblx0fSxcblxuXHR1bmJpbmRBdHRyaWJ1dGVzOiBmdW5jdGlvbihzaGFkZXIpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0Ly9mb3IgZWFjaCBhdHRyaWJ0dWVcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5fdmVydGV4QXR0cmlicy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dmFyIGEgPSB0aGlzLl92ZXJ0ZXhBdHRyaWJzW2ldO1xuXG5cdFx0XHQvL2xvY2F0aW9uIG9mIHRoZSBhdHRyaWJ1dGVcblx0XHRcdHZhciBsb2MgPSBhLmxvY2F0aW9uID09PSBudWxsIFxuXHRcdFx0XHRcdD8gc2hhZGVyLmdldEF0dHJpYnV0ZUxvY2F0aW9uKGEubmFtZSlcblx0XHRcdFx0XHQ6IGEubG9jYXRpb247XG5cblx0XHRcdC8vZmlyc3QsIGVuYWJsZSB0aGUgdmVydGV4IGFycmF5XG5cdFx0XHRnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkobG9jKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5WZXJ0ZXhEYXRhLkF0dHJpYiA9IG5ldyBDbGFzcyh7XG5cblx0bmFtZTogbnVsbCxcblx0bnVtQ29tcG9uZW50czogbnVsbCxcblx0bG9jYXRpb246IG51bGwsXG5cdHR5cGU6IG51bGwsXG5cblx0LyoqXG5cdCAqIExvY2F0aW9uIGlzIG9wdGlvbmFsIGFuZCBmb3IgYWR2YW5jZWQgdXNlcnMgdGhhdFxuXHQgKiB3YW50IHZlcnRleCBhcnJheXMgdG8gbWF0Y2ggYWNyb3NzIHNoYWRlcnMuIEFueSBub24tbnVtZXJpY2FsXG5cdCAqIHZhbHVlIHdpbGwgYmUgY29udmVydGVkIHRvIG51bGwsIGFuZCBpZ25vcmVkLiBJZiBhIG51bWVyaWNhbFxuXHQgKiB2YWx1ZSBpcyBnaXZlbiwgaXQgd2lsbCBvdmVycmlkZSB0aGUgcG9zaXRpb24gb2YgdGhpcyBhdHRyaWJ1dGVcblx0ICogd2hlbiBnaXZlbiB0byBhIG1lc2guXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtbdHlwZV19IG5hbWUgICAgICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19IG51bUNvbXBvbmVudHMgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19IGxvY2F0aW9uICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcmV0dXJuIHtbdHlwZV19ICAgICAgICAgICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKi9cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24obmFtZSwgbnVtQ29tcG9uZW50cywgbG9jYXRpb24sIHR5cGUsIG5vcm1hbGl6ZSkge1xuXHRcdHRoaXMubmFtZSA9IG5hbWU7XG5cdFx0dGhpcy5udW1Db21wb25lbnRzID0gbnVtQ29tcG9uZW50cztcblx0XHR0aGlzLmxvY2F0aW9uID0gdHlwZW9mIGxvY2F0aW9uID09PSBcIm51bWJlclwiID8gbG9jYXRpb24gOiBudWxsO1xuXHRcdHRoaXMudHlwZSA9IHR5cGU7XG5cdFx0dGhpcy5ub3JtYWxpemUgPSBub3JtYWxpemU7XG5cdH1cbn0pXG5cblxubW9kdWxlLmV4cG9ydHMgPSBWZXJ0ZXhEYXRhO1xuXG5cbi8vZmxvdzpcbi8vICBcblxuXG5cbi8vIHZhciBhdHRyaWJzID0gW1xuLy8gXHRuZXcgTWVzaC5BdHRyaWJ1dGUoXCJhX3Bvc2l0aW9uXCIsIDIpLFxuLy8gXHRuZXcgTWVzaC5BdHRyaWJ1dGUoXCJhX2NvbG9yXCIsIDEpXG4vLyBdO1xuLy8gdmFyIG1lc2ggPSBuZXcgTWVzaChjb250ZXh0LCA0LCA2LCBNZXNoLlNUQVRJQywgYXR0cmlicyk7XG5cblxuLy9Db25zdGFudCBWZXJ0ZXggQXR0cmliOlxuLy9cdGUuZy4gd2l0aCBpbnN0YW5jaW5nIG1heWJlP1xuLy9Pbmx5IGVuYWJsZSB2ZXJ0ZXggYXR0cmliIGlmIGl0J3MgdXNlZD9cbi8vXHRidXQgd2UgYXJlIHN0aWxsIHNlbmRpbmcgYWxwaGEgc28gV1RGXG4vL1x0d291bGQgbmVlZCBhbm90aGVyIGJ1ZmZlciwgYnV0IHRoYXQgY2FuIGdldCByZWFsIHVnbHkuXG4vLyAgIiwidmFyIENsYXNzID0gcmVxdWlyZSgnanNPT1AnKS5DbGFzcztcblxuLyoqXG4gKiBBIHRoaW4gd3JhcHBlciBhcm91bmQgV2ViR0xSZW5kZXJpbmdDb250ZXh0IHdoaWNoIGhhbmRsZXNcbiAqIGNvbnRleHQgbG9zcyBhbmQgcmVzdG9yZSB3aXRoIG90aGVyIEthbWkgcmVuZGVyaW5nIG9iamVjdHMuXG4gKi9cbnZhciBXZWJHTENvbnRleHQgPSBuZXcgQ2xhc3Moe1xuXHRcblx0bWFuYWdlZFRleHR1cmVzOiBudWxsLFxuXHRtYW5hZ2VkU2hhZGVyczogbnVsbCxcblxuXHRnbDogbnVsbCxcblx0d2lkdGg6IG51bGwsXG5cdGhlaWdodDogbnVsbCxcblx0dmlldzogbnVsbCxcblx0Y29udGV4dEF0dHJpYnV0ZXM6IG51bGwsXG5cdFxuXHQvKipcblx0ICogV2hldGhlciB0aGlzIGNvbnRleHQgaXMgJ3ZhbGlkJywgaS5lLiByZW5kZXJhYmxlLiBBIGNvbnRleHQgdGhhdCBoYXMgYmVlbiBsb3N0XG5cdCAqIChhbmQgbm90IHlldCByZXN0b3JlZCkgaXMgaW52YWxpZC5cblx0ICogXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0dmFsaWQ6IGZhbHNlLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIHZpZXcsIGNvbnRleHRBdHRyaWJ1dGVzKSB7XG5cdFx0Ly9zZXR1cCBkZWZhdWx0c1xuXHRcdHRoaXMudmlldyA9IHZpZXcgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcblxuXHRcdC8vZGVmYXVsdCBzaXplIGFzIHBlciBzcGVjOlxuXHRcdC8vaHR0cDovL3d3dy53My5vcmcvVFIvMjAxMi9XRC1odG1sNS1hdXRob3ItMjAxMjAzMjkvdGhlLWNhbnZhcy1lbGVtZW50Lmh0bWwjdGhlLWNhbnZhcy1lbGVtZW50XG5cdFx0dGhpcy53aWR0aCA9IHRoaXMudmlldy53aWR0aCA9IHdpZHRoIHx8IDMwMDtcblx0XHR0aGlzLmhlaWdodCA9IHRoaXMudmlldy5oZWlnaHQgPSBoZWlnaHQgfHwgMTUwO1xuXHRcdFxuXHRcdC8vdGhlIGxpc3Qgb2YgbWFuYWdlZCBvYmplY3RzLi4uXG5cdFx0dGhpcy5tYW5hZ2VkT2JqZWN0cyA9IFtdO1xuXG5cdFx0Ly9zZXR1cCBjb250ZXh0IGxvc3QgYW5kIHJlc3RvcmUgbGlzdGVuZXJzXG5cdFx0dGhpcy52aWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJ3ZWJnbGNvbnRleHRsb3N0XCIsIGZ1bmN0aW9uIChldikge1xuXHRcdFx0ZXYucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMuX2NvbnRleHRMb3N0KGV2KTtcblx0XHR9LmJpbmQodGhpcykpO1xuXHRcdHRoaXMudmlldy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0cmVzdG9yZWRcIiwgZnVuY3Rpb24gKGV2KSB7XG5cdFx0XHRldi5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5fY29udGV4dFJlc3RvcmVkKGV2KTtcblx0XHR9LmJpbmQodGhpcykpO1xuXHRcdFx0XG5cdFx0dGhpcy5jb250ZXh0QXR0cmlidXRlcyA9IGNvbnRleHRBdHRyaWJ1dGVzO1xuXHRcdHRoaXMuX2luaXRDb250ZXh0KCk7XG5cdFx0dGhpcy5pbml0R0woKTtcblx0fSxcblxuXHRfaW5pdENvbnRleHQ6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBlcnIgPSBcIlwiO1xuXHRcdHRoaXMudmFsaWQgPSBmYWxzZTtcblxuXHRcdHRyeSB7XG5cdCAgICAgICAgdGhpcy5nbCA9ICh0aGlzLnZpZXcuZ2V0Q29udGV4dCgnd2ViZ2wnKSB8fCB0aGlzLnZpZXcuZ2V0Q29udGV4dCgnZXhwZXJpbWVudGFsLXdlYmdsJykpO1xuXHQgICAgfSBjYXRjaCAoZSkge1xuXHQgICAgXHR0aGlzLmdsID0gbnVsbDtcblx0ICAgIH1cblxuXHRcdGlmICh0aGlzLmdsKSB7XG5cdFx0XHR0aGlzLnZhbGlkID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgXCJXZWJHTCBDb250ZXh0IE5vdCBTdXBwb3J0ZWQgLS0gdHJ5IGVuYWJsaW5nIGl0IG9yIHVzaW5nIGEgZGlmZmVyZW50IGJyb3dzZXJcIjtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHdpZHRoIGFuZCBoZWlnaHQgb2YgdGhpcyBXZWJHTCBjb250ZXh0LCByZXNpemVzXG5cdCAqIHRoZSBjYW52YXMgdmlldywgYW5kIGNhbGxzIGdsLnZpZXdwb3J0KCkgd2l0aCB0aGUgbmV3IHNpemUuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoICB0aGUgbmV3IHdpZHRoXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0IHRoZSBuZXcgaGVpZ2h0XG5cdCAqL1xuXHRyZXNpemU6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQpIHtcblx0XHR0aGlzLndpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cblx0XHR0aGlzLnZpZXcud2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLnZpZXcuaGVpZ2h0ID0gaGVpZ2h0O1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC52aWV3cG9ydCgwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG5cdH0sXG5cblx0aW5pdEdMOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLnZpZXdwb3J0KDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcblxuXHRcdC8vIGdldCByaWQgb2YgdGhpcy4uIGxldCB1c2VyIGhhbmRsZSBpdFxuXHRcdC8vIGdsLmNsZWFyQ29sb3IoMC41LDAuNSwwLjAsMS4wKTtcblx0XHQvLyBnbC5jbGVhcihnbC5DT0xPUl9CVUZGRVJfQklUKTtcblx0fSxcblxuXHQvKipcblx0ICogKGludGVybmFsIHVzZSlcblx0ICogQSBtYW5hZ2VkIG9iamVjdCBpcyBhbnl0aGluZyB3aXRoIGEgXCJjcmVhdGVcIiBmdW5jdGlvbiwgdGhhdCB3aWxsXG5cdCAqIHJlc3RvcmUgR0wgc3RhdGUgYWZ0ZXIgY29udGV4dCBsb3NzLiBcblx0ICogXG5cdCAqIEBwYXJhbSB7W3R5cGVdfSB0ZXggW2Rlc2NyaXB0aW9uXVxuXHQgKi9cblx0YWRkTWFuYWdlZE9iamVjdDogZnVuY3Rpb24ob2JqKSB7XG5cdFx0dGhpcy5tYW5hZ2VkT2JqZWN0cy5wdXNoKG9iaik7XG5cdH0sXG5cblx0LyoqXG5cdCAqIChpbnRlcm5hbCB1c2UpXG5cdCAqIFJlbW92ZXMgYSBtYW5hZ2VkIG9iamVjdCBmcm9tIHRoZSBjYWNoZS4gVGhpcyBpcyB1c2VmdWwgdG8gZGVzdHJveVxuXHQgKiBhIHRleHR1cmUgb3Igc2hhZGVyLCBhbmQgaGF2ZSBpdCBubyBsb25nZXIgcmUtbG9hZCBvbiBjb250ZXh0IHJlc3RvcmUuXG5cdCAqXG5cdCAqIFJldHVybnMgdGhlIG9iamVjdCB0aGF0IHdhcyByZW1vdmVkLCBvciBudWxsIGlmIGl0IHdhcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLlxuXHQgKiBcblx0ICogQHBhcmFtICB7T2JqZWN0fSBvYmogdGhlIG9iamVjdCB0byBiZSBtYW5hZ2VkXG5cdCAqIEByZXR1cm4ge09iamVjdH0gICAgIHRoZSByZW1vdmVkIG9iamVjdCwgb3IgbnVsbFxuXHQgKi9cblx0cmVtb3ZlTWFuYWdlZE9iamVjdDogZnVuY3Rpb24ob2JqKSB7XG5cdFx0dmFyIGlkeCA9IHRoaXMubWFuYWdlZE9iamVjdHMuaW5kZXhPZihvYmopO1xuXHRcdGlmIChpZHggPiAtMSkge1xuXHRcdFx0dGhpcy5tYW5hZ2VkT2JqZWN0cy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fSBcblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHRfY29udGV4dExvc3Q6IGZ1bmN0aW9uKGV2KSB7XG5cdFx0Ly9hbGwgdGV4dHVyZXMvc2hhZGVycy9idWZmZXJzL0ZCT3MgaGF2ZSBiZWVuIGRlbGV0ZWQuLi4gXG5cdFx0Ly93ZSBuZWVkIHRvIHJlLWNyZWF0ZSB0aGVtIG9uIHJlc3RvcmVcblx0XHR0aGlzLnZhbGlkID0gZmFsc2U7XG5cdH0sXG5cblx0X2NvbnRleHRSZXN0b3JlZDogZnVuY3Rpb24oZXYpIHtcblx0XHQvL2ZpcnN0LCBpbml0aWFsaXplIHRoZSBHTCBjb250ZXh0IGFnYWluXG5cdFx0dGhpcy5faW5pdENvbnRleHQoKTtcblxuXHRcdC8vbm93IHdlIHJlY3JlYXRlIG91ciBzaGFkZXJzIGFuZCB0ZXh0dXJlc1xuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLm1hbmFnZWRPYmplY3RzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLm1hbmFnZWRPYmplY3RzW2ldLmNyZWF0ZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5pdEdMKCk7XG5cdH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdlYkdMQ29udGV4dDsiLCJtb2R1bGUuZXhwb3J0cyA9IHtcblx0U2hhZGVyUHJvZ3JhbTogcmVxdWlyZSgnLi9TaGFkZXJQcm9ncmFtJyksXG5cdFdlYkdMQ29udGV4dDogcmVxdWlyZSgnLi9XZWJHTENvbnRleHQnKSxcblx0VGV4dHVyZTogcmVxdWlyZSgnLi9UZXh0dXJlJyksXG5cdFZlcnRleERhdGE6IHJlcXVpcmUoJy4vVmVydGV4RGF0YScpXG59OyIsInZhciBDbGFzcyA9IHJlcXVpcmUoJy4vbGliL0NsYXNzJyksXG5cdEVudW0gPSByZXF1aXJlKCcuL2xpYi9FbnVtJyksXG5cdEludGVyZmFjZSA9IHJlcXVpcmUoJy4vbGliL0ludGVyZmFjZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcblx0Q2xhc3M6IENsYXNzLFxuXHRFbnVtOiBFbnVtLFxuXHRJbnRlcmZhY2U6IEludGVyZmFjZVxufTsiLCJ2YXIgQmFzZUNsYXNzID0gcmVxdWlyZSgnLi9iYXNlQ2xhc3MnKTtcblxudmFyIENsYXNzID0gZnVuY3Rpb24oIGRlc2NyaXB0b3IgKSB7XG5cdGlmICghZGVzY3JpcHRvcikgXG5cdFx0ZGVzY3JpcHRvciA9IHt9O1xuXHRcblx0aWYoIGRlc2NyaXB0b3IuaW5pdGlhbGl6ZSApIHtcblx0XHR2YXIgclZhbCA9IGRlc2NyaXB0b3IuaW5pdGlhbGl6ZTtcblx0XHRkZWxldGUgZGVzY3JpcHRvci5pbml0aWFsaXplO1xuXHR9IGVsc2Uge1xuXHRcdHJWYWwgPSBmdW5jdGlvbigpIHsgdGhpcy5wYXJlbnQuYXBwbHkoIHRoaXMsIGFyZ3VtZW50cyApOyB9O1xuXHR9XG5cblx0aWYoIGRlc2NyaXB0b3IuRXh0ZW5kcyApIHtcblx0XHRyVmFsLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoIGRlc2NyaXB0b3IuRXh0ZW5kcy5wcm90b3R5cGUgKTtcblx0XHQvLyB0aGlzIHdpbGwgYmUgdXNlZCB0byBjYWxsIHRoZSBwYXJlbnQgY29uc3RydWN0b3Jcblx0XHRyVmFsLiQkcGFyZW50Q29uc3RydWN0b3IgPSBkZXNjcmlwdG9yLkV4dGVuZHM7XG5cdFx0ZGVsZXRlIGRlc2NyaXB0b3IuRXh0ZW5kcztcblx0fSBlbHNlIHtcblx0XHRyVmFsLiQkcGFyZW50Q29uc3RydWN0b3IgPSBmdW5jdGlvbigpIHt9XG5cdFx0clZhbC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKCBCYXNlQ2xhc3MgKTtcblx0fVxuXG5cdHJWYWwucHJvdG90eXBlLiQkZ2V0dGVycyA9IHt9O1xuXHRyVmFsLnByb3RvdHlwZS4kJHNldHRlcnMgPSB7fTtcblxuXHRmb3IoIHZhciBpIGluIGRlc2NyaXB0b3IgKSB7XG5cdFx0aWYoIHR5cGVvZiBkZXNjcmlwdG9yWyBpIF0gPT0gJ2Z1bmN0aW9uJyApIHtcblx0XHRcdGRlc2NyaXB0b3JbIGkgXS4kJG5hbWUgPSBpO1xuXHRcdFx0ZGVzY3JpcHRvclsgaSBdLiQkb3duZXIgPSByVmFsLnByb3RvdHlwZTtcblxuXHRcdFx0clZhbC5wcm90b3R5cGVbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXTtcblx0XHR9IGVsc2UgaWYoIGRlc2NyaXB0b3JbIGkgXSAmJiB0eXBlb2YgZGVzY3JpcHRvclsgaSBdID09ICdvYmplY3QnICYmICggZGVzY3JpcHRvclsgaSBdLmdldCB8fCBkZXNjcmlwdG9yWyBpIF0uc2V0ICkgKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoIHJWYWwucHJvdG90eXBlLCBpICwgZGVzY3JpcHRvclsgaSBdICk7XG5cblx0XHRcdGlmKCBkZXNjcmlwdG9yWyBpIF0uZ2V0ICkge1xuXHRcdFx0XHRyVmFsLnByb3RvdHlwZS4kJGdldHRlcnNbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXS5nZXQ7XG5cdFx0XHRcdGRlc2NyaXB0b3JbIGkgXS5nZXQuJCRuYW1lID0gaTtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLmdldC4kJG93bmVyID0gclZhbC5wcm90b3R5cGU7XG5cdFx0XHR9XG5cblx0XHRcdGlmKCBkZXNjcmlwdG9yWyBpIF0uc2V0ICkge1xuXHRcdFx0XHRyVmFsLnByb3RvdHlwZS4kJHNldHRlcnNbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXS5zZXQ7XG5cdFx0XHRcdGRlc2NyaXB0b3JbIGkgXS5zZXQuJCRuYW1lID0gaTtcblx0XHRcdFx0ZGVzY3JpcHRvclsgaSBdLnNldC4kJG93bmVyID0gclZhbC5wcm90b3R5cGU7XHRcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0clZhbC5wcm90b3R5cGVbIGkgXSA9IGRlc2NyaXB0b3JbIGkgXTtcblx0XHR9XG5cdH1cblxuXHQvLyB0aGlzIHdpbGwgYmUgdXNlZCB0byBjaGVjayBpZiB0aGUgY2FsbGVyIGZ1bmN0aW9uIGlzIHRoZSBjb25zcnVjdG9yXG5cdHJWYWwuJCRpc0NvbnN0cnVjdG9yID0gdHJ1ZTtcblxuXG5cdC8vIG5vdyB3ZSdsbCBjaGVjayBpbnRlcmZhY2VzXG5cdGZvciggdmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrICkge1xuXHRcdGFyZ3VtZW50c1sgaSBdLmNvbXBhcmUoIHJWYWwgKTtcblx0fVxuXG5cdHJldHVybiByVmFsO1xufTtcdFxuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBDbGFzczsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCcuL0NsYXNzJyk7XG5cbi8qKlxuVGhlIEVudW0gY2xhc3MsIHdoaWNoIGhvbGRzIGEgc2V0IG9mIGNvbnN0YW50cyBpbiBhIGZpeGVkIG9yZGVyLlxuXG4jIyMjIEJhc2ljIFVzYWdlOlxuXHR2YXIgRGF5cyA9IG5ldyBFbnVtKFsgXG5cdFx0XHQnTW9uZGF5Jyxcblx0XHRcdCdUdWVzZGF5Jyxcblx0XHRcdCdXZWRuZXNkYXknLFxuXHRcdFx0J1RodXJzZGF5Jyxcblx0XHRcdCdGcmlkYXknLFxuXHRcdFx0J1NhdHVyZGF5Jyxcblx0XHRcdCdTdW5kYXknXG5cdF0pO1xuXG5cdGNvbnNvbGUubG9nKCBEYXlzLk1vbmRheSA9PT0gRGF5cy5UdWVzZGF5ICk7IC8vID0+IGZhbHNlXG5cdGNvbnNvbGUubG9nKCBEYXlzLnZhbHVlc1sxXSApIC8vID0+IHRoZSAnVHVlc2RheScgc3ltYm9sIG9iamVjdFxuXG5FYWNoIGVudW0gKnN5bWJvbCogaXMgYW4gb2JqZWN0IHdoaWNoIGV4dGVuZHMgZnJvbSB0aGUgYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZVwifX17ey9jcm9zc0xpbmt9fWAgXG5jbGFzcy4gVGhpcyBiYXNlXG5jbGFzcyBoYXMgIHByb3BlcnRpZXMgbGlrZSBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlL3ZhbHVlOnByb3BlcnR5XCJ9fXt7L2Nyb3NzTGlua319YCAgXG5hbmQgYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZS9vcmRpbmFsOnByb3BlcnR5XCJ9fXt7L2Nyb3NzTGlua319YC4gXG5fX2B2YWx1ZWBfXyBpcyBhIHN0cmluZ1xud2hpY2ggbWF0Y2hlcyB0aGUgZWxlbWVudCBvZiB0aGUgYXJyYXkuIF9fYG9yZGluYWxgX18gaXMgdGhlIGluZGV4IHRoZSBcbnN5bWJvbCB3YXMgZGVmaW5lZCBhdCBpbiB0aGUgZW51bWVyYXRpb24uIFxuXG5UaGUgcmVzdWx0aW5nIEVudW0gb2JqZWN0IChpbiB0aGUgYWJvdmUgY2FzZSwgRGF5cykgYWxzbyBoYXMgc29tZSB1dGlsaXR5IG1ldGhvZHMsXG5saWtlIGZyb21WYWx1ZShzdHJpbmcpIGFuZCB0aGUgdmFsdWVzIHByb3BlcnR5IHRvIGFjY2VzcyB0aGUgYXJyYXkgb2Ygc3ltYm9scy5cblxuTm90ZSB0aGF0IHRoZSB2YWx1ZXMgYXJyYXkgaXMgZnJvemVuLCBhcyBpcyBlYWNoIHN5bWJvbC4gVGhlIHJldHVybmVkIG9iamVjdCBpcyBcbl9fbm90X18gZnJvemVuLCBhcyB0byBhbGxvdyB0aGUgdXNlciB0byBtb2RpZnkgaXQgKGkuZS4gYWRkIFwic3RhdGljXCIgbWVtYmVycykuXG5cbkEgbW9yZSBhZHZhbmNlZCBFbnVtIHVzYWdlIGlzIHRvIHNwZWNpZnkgYSBiYXNlIEVudW0gc3ltYm9sIGNsYXNzIGFzIHRoZSBzZWNvbmRcbnBhcmFtZXRlci4gVGhpcyBpcyB0aGUgY2xhc3MgdGhhdCBlYWNoIHN5bWJvbCB3aWxsIHVzZS4gVGhlbiwgaWYgYW55IHN5bWJvbHNcbmFyZSBnaXZlbiBhcyBhbiBBcnJheSAoaW5zdGVhZCBvZiBzdHJpbmcpLCBpdCB3aWxsIGJlIHRyZWF0ZWQgYXMgYW4gYXJyYXkgb2YgYXJndW1lbnRzXG50byB0aGUgYmFzZSBjbGFzcy4gVGhlIGZpcnN0IGFyZ3VtZW50IHNob3VsZCBhbHdheXMgYmUgdGhlIGRlc2lyZWQga2V5IG9mIHRoYXQgc3ltYm9sLlxuXG5Ob3RlIHRoYXQgX19gb3JkaW5hbGBfXyBpcyBhZGRlZCBkeW5hbWljYWxseVxuYWZ0ZXIgdGhlIHN5bWJvbCBpcyBjcmVhdGVkOyBzbyBpdCBjYW4ndCBiZSB1c2VkIGluIHRoZSBzeW1ib2wncyBjb25zdHJ1Y3Rvci5cblxuIyMjIyBBZHZhbmNlZCBVc2FnZVxuXHR2YXIgRGF5cyA9IG5ldyBFbnVtKFsgXG5cdFx0XHQnTW9uZGF5Jyxcblx0XHRcdCdUdWVzZGF5Jyxcblx0XHRcdCdXZWRuZXNkYXknLFxuXHRcdFx0J1RodXJzZGF5Jyxcblx0XHRcdCdGcmlkYXknLFxuXHRcdFx0WydTYXR1cmRheScsIHRydWVdLFxuXHRcdFx0WydTdW5kYXknLCB0cnVlXVxuXHRcdF0sIG5ldyBDbGFzcyh7XG5cdFx0XHRcblx0XHRcdEV4dGVuZHM6IEVudW0uQmFzZSxcblxuXHRcdFx0aXNXZWVrZW5kOiBmYWxzZSxcblxuXHRcdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oIGtleSwgaXNXZWVrZW5kICkge1xuXHRcdFx0XHQvL3Bhc3MgdGhlIHN0cmluZyB2YWx1ZSBhbG9uZyB0byBwYXJlbnQgY29uc3RydWN0b3Jcblx0XHRcdFx0dGhpcy5wYXJlbnQoIGtleSApOyBcblx0XHRcdFx0XG5cdFx0XHRcdC8vZ2V0IGEgYm9vbGVhbiBwcmltaXRpdmUgb3V0IG9mIHRoZSB0cnV0aHkvZmFsc3kgdmFsdWVcblx0XHRcdFx0dGhpcy5pc1dla2VlbmQgPSBCb29sZWFuKGlzV2Vla2VuZCk7XG5cdFx0XHR9XG5cdFx0fSlcblx0KTtcblxuXHRjb25zb2xlLmxvZyggRGF5cy5TYXR1cmRheS5pc1dlZWtlbmQgKTsgLy8gPT4gdHJ1ZVxuXG5UaGlzIG1ldGhvZCB3aWxsIHRocm93IGFuIGVycm9yIGlmIHlvdSB0cnkgdG8gc3BlY2lmeSBhIGNsYXNzIHdoaWNoIGRvZXNcbm5vdCBleHRlbmQgZnJvbSBge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlXCJ9fXt7L2Nyb3NzTGlua319YC5cblxuIyMjIyBTaG9ydGhhbmRcblxuWW91IGNhbiBhbHNvIG9taXQgdGhlIGBuZXcgQ2xhc3NgIGFuZCBwYXNzIGEgZGVzY3JpcHRvciwgdGh1cyByZWR1Y2luZyB0aGUgbmVlZCB0byBcbmV4cGxpY2l0bHkgcmVxdWlyZSB0aGUgQ2xhc3MgbW9kdWxlLiBGdXJ0aGVyLCBpZiB5b3UgYXJlIHBhc3NpbmcgYSBkZXNjcmlwdG9yIHRoYXRcbmRvZXMgbm90IGhhdmUgYEV4dGVuZHNgIGRlZmluZWQsIGl0IHdpbGwgZGVmYXVsdCB0b1xuYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZVwifX17ey9jcm9zc0xpbmt9fWAuXG5cblx0dmFyIEljb25zID0gbmV3IEVudW0oWyBcblx0XHRcdCdPcGVuJyxcblx0XHRcdCdTYXZlJyxcblx0XHRcdCdIZWxwJyxcblx0XHRcdCdOZXcnXG5cdFx0XSwge1xuXG5cdFx0XHRwYXRoOiBmdW5jdGlvbiggcmV0aW5hICkge1xuXHRcdFx0XHRyZXR1cm4gXCJpY29ucy9cIiArIHRoaXMudmFsdWUudG9Mb3dlckNhc2UoKSArIChyZXRpbmEgPyBcIkAyeFwiIDogXCJcIikgKyBcIi5wbmdcIjtcblx0XHRcdH1cblx0XHR9XG5cdCk7XG5cblxuQGNsYXNzIEVudW1cbkBjb25zdHJ1Y3RvciBcbkBwYXJhbSB7QXJyYXl9IGVsZW1lbnRzIEFuIGFycmF5IG9mIGVudW1lcmF0ZWQgY29uc3RhbnRzLCBvciBhcmd1bWVudHMgdG8gYmUgcGFzc2VkIHRvIHRoZSBzeW1ib2xcbkBwYXJhbSB7Q2xhc3N9IGJhc2UgQ2xhc3MgdG8gYmUgaW5zdGFudGlhdGVkIGZvciBlYWNoIGVudW0gc3ltYm9sLCBtdXN0IGV4dGVuZCBcbmB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2VcIn19e3svY3Jvc3NMaW5rfX1gXG4qL1xudmFyIEVudW1SZXN1bHQgPSBuZXcgQ2xhc3Moe1xuXG5cdC8qKlxuXHRBbiBhcnJheSBvZiB0aGUgZW51bWVyYXRlZCBzeW1ib2wgb2JqZWN0cy5cblxuXHRAcHJvcGVydHkgdmFsdWVzXG5cdEB0eXBlIEFycmF5XG5cdCovXG5cdHZhbHVlczogbnVsbCxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy52YWx1ZXMgPSBbXTtcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBcIlsgXCIrdGhpcy52YWx1ZXMuam9pbihcIiwgXCIpK1wiIF1cIjtcblx0fSxcblxuXHQvKipcblx0TG9va3MgZm9yIHRoZSBmaXJzdCBzeW1ib2wgaW4gdGhpcyBlbnVtIHdob3NlICd2YWx1ZScgbWF0Y2hlcyB0aGUgc3BlY2lmaWVkIHN0cmluZy4gXG5cdElmIG5vbmUgYXJlIGZvdW5kLCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cblx0QG1ldGhvZCBmcm9tVmFsdWVcblx0QHBhcmFtIHtTdHJpbmd9IHN0ciB0aGUgc3RyaW5nIHRvIGxvb2sgdXBcblx0QHJldHVybiB7RW51bS5CYXNlfSByZXR1cm5zIGFuIGVudW0gc3ltYm9sIGZyb20gdGhlIGdpdmVuICd2YWx1ZScgc3RyaW5nLCBvciBudWxsXG5cdCovXG5cdGZyb21WYWx1ZTogZnVuY3Rpb24gKHN0cikge1xuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLnZhbHVlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHN0ciA9PT0gdGhpcy52YWx1ZXNbaV0udmFsdWUpXG5cdFx0XHRcdHJldHVybiB0aGlzLnZhbHVlc1tpXTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn0pO1xuXG5cblxudmFyIEVudW0gPSBmdW5jdGlvbiAoIGVsZW1lbnRzLCBiYXNlICkge1xuXHRpZiAoIWJhc2UpXG5cdFx0YmFzZSA9IEVudW0uQmFzZTtcblxuXHQvL1RoZSB1c2VyIGlzIG9taXR0aW5nIENsYXNzLCBpbmplY3QgaXQgaGVyZVxuXHRpZiAodHlwZW9mIGJhc2UgPT09IFwib2JqZWN0XCIpIHtcblx0XHQvL2lmIHdlIGRpZG4ndCBzcGVjaWZ5IGEgc3ViY2xhc3MuLiBcblx0XHRpZiAoIWJhc2UuRXh0ZW5kcylcblx0XHRcdGJhc2UuRXh0ZW5kcyA9IEVudW0uQmFzZTtcblx0XHRiYXNlID0gbmV3IENsYXNzKGJhc2UpO1xuXHR9XG5cdFxuXHR2YXIgcmV0ID0gbmV3IEVudW1SZXN1bHQoKTtcblxuXHRmb3IgKHZhciBpPTA7IGk8ZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHR2YXIgZSA9IGVsZW1lbnRzW2ldO1xuXG5cdFx0dmFyIG9iaiA9IG51bGw7XG5cdFx0dmFyIGtleSA9IG51bGw7XG5cblx0XHRpZiAoIWUpXG5cdFx0XHR0aHJvdyBcImVudW0gdmFsdWUgYXQgaW5kZXggXCIraStcIiBpcyB1bmRlZmluZWRcIjtcblxuXHRcdGlmICh0eXBlb2YgZSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0a2V5ID0gZTtcblx0XHRcdG9iaiA9IG5ldyBiYXNlKGUpO1xuXHRcdFx0cmV0W2VdID0gb2JqO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZSkpXG5cdFx0XHRcdHRocm93IFwiZW51bSB2YWx1ZXMgbXVzdCBiZSBTdHJpbmcgb3IgYW4gYXJyYXkgb2YgYXJndW1lbnRzXCI7XG5cblx0XHRcdGtleSA9IGVbMF07XG5cblx0XHRcdC8vZmlyc3QgYXJnIGlzIGlnbm9yZWRcblx0XHRcdGUudW5zaGlmdChudWxsKTtcblx0XHRcdG9iaiA9IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkoYmFzZSwgZSkpO1xuXG5cdFx0XHRyZXRba2V5XSA9IG9iajtcblx0XHR9XG5cblx0XHRpZiAoICEob2JqIGluc3RhbmNlb2YgRW51bS5CYXNlKSApXG5cdFx0XHR0aHJvdyBcImVudW0gYmFzZSBjbGFzcyBtdXN0IGJlIGEgc3ViY2xhc3Mgb2YgRW51bS5CYXNlXCI7XG5cblx0XHRvYmoub3JkaW5hbCA9IGk7XG5cdFx0cmV0LnZhbHVlcy5wdXNoKG9iaik7XG5cdFx0T2JqZWN0LmZyZWV6ZShvYmopO1xuXHR9O1xuXG5cdC8vd2UgU0hPVUxEIGZyZWV6ZSB0aGUgcmV0dXJybmVkIG9iamVjdCwgYnV0IG1vc3QgSlMgZGV2ZWxvcGVyc1xuXHQvL2FyZW4ndCBleHBlY3RpbmcgYW4gb2JqZWN0IHRvIGJlIGZyb3plbiwgYW5kIHRoZSBicm93c2VycyBkb24ndCBhbHdheXMgd2FybiB1cy5cblx0Ly9JdCBqdXN0IGNhdXNlcyBmcnVzdHJhdGlvbiwgZS5nLiBpZiB5b3UncmUgdHJ5aW5nIHRvIGFkZCBhIHN0YXRpYyBvciBjb25zdGFudFxuXHQvL3RvIHRoZSByZXR1cm5lZCBvYmplY3QuXG5cblx0Ly8gT2JqZWN0LmZyZWV6ZShyZXQpO1xuXHRPYmplY3QuZnJlZXplKHJldC52YWx1ZXMpO1xuXHRyZXR1cm4gcmV0O1xufTtcblxuXG4vKipcblxuVGhlIGJhc2UgdHlwZSBmb3IgRW51bSBzeW1ib2xzLiBTdWJjbGFzc2VzIGNhbiBleHRlbmRcbnRoaXMgdG8gaW1wbGVtZW50IG1vcmUgZnVuY3Rpb25hbGl0eSBmb3IgZW51bSBzeW1ib2xzLlxuXG5AY2xhc3MgRW51bS5CYXNlXG5AY29uc3RydWN0b3IgXG5AcGFyYW0ge1N0cmluZ30ga2V5IHRoZSBzdHJpbmcgdmFsdWUgZm9yIHRoaXMgc3ltYm9sXG4qL1xuRW51bS5CYXNlID0gbmV3IENsYXNzKHtcblxuXHQvKipcblx0VGhlIHN0cmluZyB2YWx1ZSBvZiB0aGlzIHN5bWJvbC5cblx0QHByb3BlcnR5IHZhbHVlXG5cdEB0eXBlIFN0cmluZ1xuXHQqL1xuXHR2YWx1ZTogdW5kZWZpbmVkLFxuXG5cdC8qKlxuXHRUaGUgaW5kZXggb2YgdGhpcyBzeW1ib2wgaW4gaXRzIGVudW1lcmF0aW9uIGFycmF5LlxuXHRAcHJvcGVydHkgb3JkaW5hbFxuXHRAdHlwZSBOdW1iZXJcblx0Ki9cblx0b3JkaW5hbDogdW5kZWZpbmVkLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uICgga2V5ICkge1xuXHRcdHRoaXMudmFsdWUgPSBrZXk7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlIHx8IHRoaXMucGFyZW50KCk7XG5cdH0sXG5cblx0dmFsdWVPZjogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUgfHwgdGhpcy5wYXJlbnQoKTtcblx0fVxufSk7XG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEVudW07XG4iLCJcbnZhciBJbnRlcmZhY2UgPSBmdW5jdGlvbiggZGVzY3JpcHRvciApIHtcblx0dGhpcy5kZXNjcmlwdG9yID0gZGVzY3JpcHRvcjtcbn07XG5cbkludGVyZmFjZS5wcm90b3R5cGUuZGVzY3JpcHRvciA9IG51bGw7XG5cbkludGVyZmFjZS5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uKCBjbGFzc1RvQ2hlY2sgKSB7XG5cblx0Zm9yKCB2YXIgaSAgaW4gdGhpcy5kZXNjcmlwdG9yICkge1xuXHRcdC8vIEZpcnN0IHdlJ2xsIGNoZWNrIGlmIHRoaXMgcHJvcGVydHkgZXhpc3RzIG9uIHRoZSBjbGFzc1xuXHRcdGlmKCBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF0gPT09IHVuZGVmaW5lZCApIHtcblxuXHRcdFx0dGhyb3cgJ0lOVEVSRkFDRSBFUlJPUjogJyArIGkgKyAnIGlzIG5vdCBkZWZpbmVkIGluIHRoZSBjbGFzcyc7XG5cblx0XHQvLyBTZWNvbmQgd2UnbGwgY2hlY2sgdGhhdCB0aGUgdHlwZXMgZXhwZWN0ZWQgbWF0Y2hcblx0XHR9IGVsc2UgaWYoIHR5cGVvZiB0aGlzLmRlc2NyaXB0b3JbIGkgXSAhPSB0eXBlb2YgY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdICkge1xuXG5cdFx0XHR0aHJvdyAnSU5URVJGQUNFIEVSUk9SOiBJbnRlcmZhY2UgYW5kIGNsYXNzIGRlZmluZSBpdGVtcyBvZiBkaWZmZXJlbnQgdHlwZSBmb3IgJyArIGkgKyBcblx0XHRcdFx0ICAnXFxuaW50ZXJmYWNlWyAnICsgaSArICcgXSA9PSAnICsgdHlwZW9mIHRoaXMuZGVzY3JpcHRvclsgaSBdICtcblx0XHRcdFx0ICAnXFxuY2xhc3NbICcgKyBpICsgJyBdID09ICcgKyB0eXBlb2YgY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdO1xuXG5cdFx0Ly8gVGhpcmQgaWYgdGhpcyBwcm9wZXJ0eSBpcyBhIGZ1bmN0aW9uIHdlJ2xsIGNoZWNrIHRoYXQgdGhleSBleHBlY3QgdGhlIHNhbWUgYW1vdW50IG9mIHBhcmFtZXRlcnNcblx0XHR9IGVsc2UgaWYoIHR5cGVvZiB0aGlzLmRlc2NyaXB0b3JbIGkgXSA9PSAnZnVuY3Rpb24nICYmIGNsYXNzVG9DaGVjay5wcm90b3R5cGVbIGkgXS5sZW5ndGggIT0gdGhpcy5kZXNjcmlwdG9yWyBpIF0ubGVuZ3RoICkge1xuXG5cdFx0XHR0aHJvdyAnSU5URVJGQUNFIEVSUk9SOiBJbnRlcmZhY2UgYW5kIGNsYXNzIGV4cGVjdCBhIGRpZmZlcmVudCBhbW91bnQgb2YgcGFyYW1ldGVycyBmb3IgdGhlIGZ1bmN0aW9uICcgKyBpICtcblx0XHRcdFx0ICAnXFxuRVhQRUNURUQ6ICcgKyB0aGlzLmRlc2NyaXB0b3JbIGkgXS5sZW5ndGggKyBcblx0XHRcdFx0ICAnXFxuUkVDRUlWRUQ6ICcgKyBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF0ubGVuZ3RoO1xuXG5cdFx0fVxuXHR9XG59O1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBJbnRlcmZhY2U7IiwiLy9FeHBvcnRzIGEgZnVuY3Rpb24gbmFtZWQgJ3BhcmVudCdcbm1vZHVsZS5leHBvcnRzLnBhcmVudCA9IGZ1bmN0aW9uKCkge1xuXHQvLyBpZiB0aGUgY3VycmVudCBmdW5jdGlvbiBjYWxsaW5nIGlzIHRoZSBjb25zdHJ1Y3RvclxuXHRpZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkaXNDb25zdHJ1Y3RvciApIHtcblx0XHR2YXIgcGFyZW50RnVuY3Rpb24gPSB0aGlzLnBhcmVudC5jYWxsZXIuJCRwYXJlbnRDb25zdHJ1Y3Rvcjtcblx0fSBlbHNlIHtcblx0XHRpZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkbmFtZSApIHtcblx0XHRcdHZhciBjYWxsZXJOYW1lID0gdGhpcy5wYXJlbnQuY2FsbGVyLiQkbmFtZTtcblx0XHRcdHZhciBpc0dldHRlciA9IHRoaXMucGFyZW50LmNhbGxlci4kJG93bmVyLiQkZ2V0dGVyc1sgY2FsbGVyTmFtZSBdO1xuXHRcdFx0dmFyIGlzU2V0dGVyID0gdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIuJCRzZXR0ZXJzWyBjYWxsZXJOYW1lIF07XG5cblx0XHRcdGlmKCBhcmd1bWVudHMubGVuZ3RoID09IDEgJiYgaXNTZXR0ZXIgKSB7XG5cdFx0XHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIgKS4kJHNldHRlcnNbIGNhbGxlck5hbWUgXTtcblxuXHRcdFx0XHRpZiggcGFyZW50RnVuY3Rpb24gPT09IHVuZGVmaW5lZCApIHtcblx0XHRcdFx0XHR0aHJvdyAnTm8gc2V0dGVyIGRlZmluZWQgaW4gcGFyZW50Jztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmKCBhcmd1bWVudHMubGVuZ3RoID09IDAgJiYgaXNHZXR0ZXIgKSB7XG5cdFx0XHRcdHZhciBwYXJlbnRGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZiggdGhpcy5wYXJlbnQuY2FsbGVyLiQkb3duZXIgKS4kJGdldHRlcnNbIGNhbGxlck5hbWUgXTtcblxuXHRcdFx0XHRpZiggcGFyZW50RnVuY3Rpb24gPT09IHVuZGVmaW5lZCApIHtcblx0XHRcdFx0XHR0aHJvdyAnTm8gZ2V0dGVyIGRlZmluZWQgaW4gcGFyZW50Jztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmKCBpc1NldHRlciB8fCBpc0dldHRlciApIHtcblx0XHRcdFx0dGhyb3cgJ0luY29ycmVjdCBhbW91bnQgb2YgYXJndW1lbnRzIHNlbnQgdG8gZ2V0dGVyIG9yIHNldHRlcic7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXIgcGFyZW50RnVuY3Rpb24gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoIHRoaXMucGFyZW50LmNhbGxlci4kJG93bmVyIClbIGNhbGxlck5hbWUgXTtcdFxuXG5cdFx0XHRcdGlmKCBwYXJlbnRGdW5jdGlvbiA9PT0gdW5kZWZpbmVkICkge1xuXHRcdFx0XHRcdHRocm93ICdObyBwYXJlbnQgZnVuY3Rpb24gZGVmaW5lZCBmb3IgJyArIGNhbGxlck5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgJ1lvdSBjYW5ub3QgY2FsbCBwYXJlbnQgaGVyZSc7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHBhcmVudEZ1bmN0aW9uLmFwcGx5KCB0aGlzLCBhcmd1bWVudHMgKTtcbn07Il19
;