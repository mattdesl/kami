;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var WebGLContext = require('kami').WebGLContext;
var ShaderProgram = require('kami').ShaderProgram;
var Texture = require('kami').Texture;

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

	//create a texture from Image
	// var tex = new Texture(context.gl);

	var pixels = new Uint8Array([255, 255, 0, 255]);

	//create texture from Image (async load)
	// var tex = new Texture(context, "img/bunny.png");

	var tex = new Texture(context, "img/bunny.png", onload);


	requestAnimationFrame(render);

	var loseCtx = context.gl.getExtension("WEBGL_lose_context");

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
		shader.bind();
		tex.bind();
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
		return this.uniformCache.hasOwnProperty(name) 
			? this.uniformCache[name] : null; 
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
		return this.attributeCache.hasOwnProperty(name)
			? this.attributeCache[name] : null;
	},


	/**
	 * Returns the cached uniform location object.
	 * If the uniform is not found, this method returns null.
	 * 
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {GLint} the location object
	 */
	getAttributeLocation: function(name) { //TODO: make faster, don't cache
		return this.attributeCache.hasOwnProperty(name) 
			&& this.attributeCache[name] !== null
					? this.attributeCache[name].location 
					: null; 
	},

	/**
	 * Returns the cached uniform location object.
	 * If the uniform is not found, this method returns null.
	 * 
	 * @param  {String} name the uniform name as defined in GLSL
	 * @return {WebGLUniformLocation} the location object
	 */
	getUniformLocation: function(name) {
		return this.uniformCache.hasOwnProperty(name) 
			&& this.uniformCache[name] !== null
					? this.uniformCache[name].location 
					: null; 
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
		this.gl.useProgram(this.shaderProgram);
	},

	destroy: function() {
		var gl = this.gl;
		gl.detachShader(this.vertShader);
		gl.detachShader(this.fragShader);

		gl.deleteShader(this.vertShader);
		gl.deleteShader(this.fragShader);

		gl.deleteProgram(this.shaderProgram);
		this.shaderProgram = null;
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

		//load the data
		if (this.provider) {
			this.provider.apply(this, this.providerArgs);
		}
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

var VertexData = new Class({

	initialize: function(context, numVerts, numIndices, drawMode, vertexAttribs) {
		if (!context)
			throw "GL context not specified";
		if (!numVerts)
			throw "numVerts not specified, must be > 0";

		this.context = context;
		this.gl = context.gl;
		
		this.numVerts = numVerts;
		this.numIndices = numIndices || 0;
		this.drawMode = drawMode || this.gl.STATIC_DRAW;
		this.vertexAttribs = vertexAttribs || [];

		//add this VBO to the managed cache
		this.context.addManagedObject(this);

		this.create();
	},

	//recreates the buffers on context loss
	create: function() {
		this.gl = this.context.gl;
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
		if (shader)
			this.bindVertexAttributes(shader);
	},

	//binds this mesh's vertex attributes for the given shader
	bindVertexAttributes: function(shader) {
		//
		for (var i=0; i<this.vertexAttribs.length; i++) {
			var a = this.vertexAttribs[i];

			//determine the location to 
			var loc = a.location === null 
					? shader.getAttributeLocation(a.name)
					: a.location;
		}
	}
});

VertexData.Attrib = new Class({

	name: null,
	numComponents: null,
	location: null,

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
	initialize: function(name, numComponents, location) {
		this.name = name;
		this.numComponents = numComponents;
		this.location = typeof location === "number" ? location : null;
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

		gl.clearColor(0.5,0.5,0.0,1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pL2RlbW9zL3NyYy9pbmRleC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL1NoYWRlclByb2dyYW0uanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL2xpYi9UZXh0dXJlLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9saWIvVmVydGV4RGF0YS5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL1dlYkdMQ29udGV4dC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbGliL2luZGV4LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2FtaS9ub2RlX21vZHVsZXMvanNPT1AvaW5kZXguanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvQ2xhc3MuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvRW51bS5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL2thbWkvbm9kZV9tb2R1bGVzL2pzT09QL2xpYi9JbnRlcmZhY2UuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rYW1pL25vZGVfbW9kdWxlcy9qc09PUC9saWIvYmFzZUNsYXNzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6UkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcFVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDek9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgV2ViR0xDb250ZXh0ID0gcmVxdWlyZSgna2FtaScpLldlYkdMQ29udGV4dDtcbnZhciBTaGFkZXJQcm9ncmFtID0gcmVxdWlyZSgna2FtaScpLlNoYWRlclByb2dyYW07XG52YXIgVGV4dHVyZSA9IHJlcXVpcmUoJ2thbWknKS5UZXh0dXJlO1xuXG4kKGZ1bmN0aW9uKCkge1xuXHR2YXIgbWFpbkNvbnRhaW5lciA9ICQoXCJib2R5XCIpLmNzcyh7XG5cdFx0YmFja2dyb3VuZDogXCIjMDAwXCJcblx0fSk7XG5cblx0dmFyIGRlbW9Db250YWluZXJzID0gW107XG5cdHZhciBjdXJyZW50RGVtbyA9IG51bGw7XG5cdHZhciBjdXJyZW50SW5kZXggPSAwO1xuXG5cblx0dmFyIHdpZHRoID0gODAwO1xuXHR2YXIgaGVpZ2h0ID0gNjAwO1xuXG5cdHZhciBjYW52YXMgPSAkKFwiPGNhbnZhcz5cIiwge1xuXHRcdHdpZHRoOiB3aWR0aCxcblx0XHRoZWlnaHQ6IGhlaWdodFxuXHR9KS5jc3Moe1xuXHRcdGJhY2tncm91bmQ6IFwiIzM0MzQzNFwiLCAgXG5cdFx0cG9zaXRpb246IFwiZml4ZWRcIixcblx0XHR0b3A6IDAsXG5cdFx0bGVmdDogMCxcblx0XHRvdmVyZmxvdzogXCJoaWRkZW5cIlxuXHR9KTtcblxuXHRjYW52YXMuYXBwZW5kVG8obWFpbkNvbnRhaW5lcik7XG5cblx0Ly9jcmVhdGUgb3VyIHdlYkdMIGNvbnRleHQuLlxuXHQvL3RoaXMgd2lsbCBtYW5hZ2Ugdmlld3BvcnQgYW5kIGNvbnRleHQgbG9zcy9yZXN0b3JlXG5cdHZhciBjb250ZXh0ID0gbmV3IFdlYkdMQ29udGV4dCg4MDAsIDYwMCwgY2FudmFzWzBdKTtcblx0XG5cdC8vY3JlYXRlIGEgYmFzaWMgc2hhZGVyLi5cblx0Ly90aGlzIHdpbGwgYmUgYWRkZWQgdG8gdGhlIGNvbnRleHQgYW5kIHJlLWNvbXBpbGVkIG9uIGNvbnRleHQgcmVzdG9yZVxuXHR2YXIgc2hhZGVyID0gbmV3IFNoYWRlclByb2dyYW0oY29udGV4dCwgJChcIiN2ZXJ0X3NoYWRlclwiKS5odG1sKCksICQoXCIjZnJhZ19zaGFkZXJcIikuaHRtbCgpKTtcblxuXHQvL2NyZWF0ZSBhIHRleHR1cmUgZnJvbSBJbWFnZVxuXHQvLyB2YXIgdGV4ID0gbmV3IFRleHR1cmUoY29udGV4dC5nbCk7XG5cblx0dmFyIHBpeGVscyA9IG5ldyBVaW50OEFycmF5KFsyNTUsIDI1NSwgMCwgMjU1XSk7XG5cblx0Ly9jcmVhdGUgdGV4dHVyZSBmcm9tIEltYWdlIChhc3luYyBsb2FkKVxuXHQvLyB2YXIgdGV4ID0gbmV3IFRleHR1cmUoY29udGV4dCwgXCJpbWcvYnVubnkucG5nXCIpO1xuXG5cdHZhciB0ZXggPSBuZXcgVGV4dHVyZShjb250ZXh0LCBcImltZy9idW5ueS5wbmdcIiwgb25sb2FkKTtcblxuXG5cdHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xuXG5cdHZhciBsb3NlQ3R4ID0gY29udGV4dC5nbC5nZXRFeHRlbnNpb24oXCJXRUJHTF9sb3NlX2NvbnRleHRcIik7XG5cblx0Ly8gc2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0Ly8gXHRsb3NlQ3R4Lmxvc2VDb250ZXh0KCk7XHRcblx0XHRcblx0Ly8gfS5iaW5kKHRoaXMpLCAxMDAwKTtcblxuXHQvLyBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHQvLyBcdGxvc2VDdHgucmVzdG9yZUNvbnRleHQoKTtcblx0Ly8gfS5iaW5kKHRoaXMpLCAzMjAwKTtcblxuXHRmdW5jdGlvbiByZW5kZXIoKSB7XG5cdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKHJlbmRlcik7XG5cblx0XHRpZiAoIWNvbnRleHQudmFsaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9IFxuXHRcdHNoYWRlci5iaW5kKCk7XG5cdFx0dGV4LmJpbmQoKTtcblx0fVxufSk7IiwidmFyIENsYXNzID0gcmVxdWlyZSgnanNPT1AnKS5DbGFzcztcblxudmFyIFNoYWRlclByb2dyYW0gPSBuZXcgQ2xhc3Moe1xuXHRcblx0dmVydFNvdXJjZTogbnVsbCxcblx0ZnJhZ1NvdXJjZTogbnVsbCwgXG4gXG5cdHZlcnRTaGFkZXI6IG51bGwsXG5cdGZyYWdTaGFkZXI6IG51bGwsXG5cblx0cHJvZ3JhbTogbnVsbCxcblxuXHR1bmlmb3JtQ2FjaGU6IG51bGwsXG5cdGF0dHJpYnV0ZUNhY2hlOiBudWxsLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKGNvbnRleHQsIHZlcnRTb3VyY2UsIGZyYWdTb3VyY2UsIGF0dHJpYkxvY2F0aW9ucykge1xuXHRcdGlmICghdmVydFNvdXJjZSB8fCAhZnJhZ1NvdXJjZSlcblx0XHRcdHRocm93IFwidmVydGV4IGFuZCBmcmFnbWVudCBzaGFkZXJzIG11c3QgYmUgZGVmaW5lZFwiO1xuXHRcdGlmICghY29udGV4dClcblx0XHRcdHRocm93IFwibm8gR0wgY29udGV4dCBzcGVjaWZpZWRcIjtcblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXG5cdFx0dGhpcy5hdHRyaWJMb2NhdGlvbnMgPSBhdHRyaWJMb2NhdGlvbnM7XG5cblx0XHQvL1dlIHRyaW0gKEVDTUFTY3JpcHQ1KSBzbyB0aGF0IHRoZSBHTFNMIGxpbmUgbnVtYmVycyBhcmVcblx0XHQvL2FjY3VyYXRlIG9uIHNoYWRlciBsb2dcblx0XHR0aGlzLnZlcnRTb3VyY2UgPSB2ZXJ0U291cmNlLnRyaW0oKTtcblx0XHR0aGlzLmZyYWdTb3VyY2UgPSBmcmFnU291cmNlLnRyaW0oKTtcblxuXHRcdC8vQWRkcyB0aGlzIHNoYWRlciB0byB0aGUgY29udGV4dCwgdG8gYmUgbWFuYWdlZFxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fSxcblxuXHQvKiogXG5cdCAqIFRoaXMgaXMgY2FsbGVkIGR1cmluZyB0aGUgU2hhZGVyUHJvZ3JhbSBjb25zdHJ1Y3Rvcixcblx0ICogYW5kIG1heSBuZWVkIHRvIGJlIGNhbGxlZCBhZ2FpbiBhZnRlciBjb250ZXh0IGxvc3MgYW5kIHJlc3RvcmUuXG5cdCAqL1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0dGhpcy5fY29tcGlsZVNoYWRlcnMoKTtcblx0fSxcblxuXHQvL0NvbXBpbGVzIHRoZSBzaGFkZXJzLCB0aHJvd2luZyBhbiBlcnJvciBpZiB0aGUgcHJvZ3JhbSB3YXMgaW52YWxpZC5cblx0X2NvbXBpbGVTaGFkZXJzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsOyBcblxuXHRcdHRoaXMudmVydFNoYWRlciA9IHRoaXMuX2xvYWRTaGFkZXIoZ2wuVkVSVEVYX1NIQURFUiwgdGhpcy52ZXJ0U291cmNlKTtcblx0XHR0aGlzLmZyYWdTaGFkZXIgPSB0aGlzLl9sb2FkU2hhZGVyKGdsLkZSQUdNRU5UX1NIQURFUiwgdGhpcy5mcmFnU291cmNlKTtcblxuXHRcdGlmICghdGhpcy52ZXJ0U2hhZGVyIHx8ICF0aGlzLmZyYWdTaGFkZXIpXG5cdFx0XHR0aHJvdyBcIkVycm9yIHJldHVybmVkIHdoZW4gY2FsbGluZyBjcmVhdGVTaGFkZXJcIjtcblxuXHRcdHRoaXMucHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKTtcblxuXHRcdGlmICh0aGlzLmF0dHJpYkxvY2F0aW9ucykge1xuXHRcdFx0Zm9yICh2YXIga2V5IGluIHRoaXMuYXR0cmliTG9jYXRpb25zKSB7XG5cdFx0XHRcdGlmICh0aGlzLmF0dHJpYkxvY2F0aW9ucy5oYXNPd25Qcm9wZXJ0eShrZXkpKVxuXHRcdCAgICBcdFx0Z2wuYmluZEF0dHJpYkxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgdGhpcy5hdHRyaWJMb2NhdGlvbnNba2V5XSwga2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRnbC5hdHRhY2hTaGFkZXIodGhpcy5wcm9ncmFtLCB0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmF0dGFjaFNoYWRlcih0aGlzLnByb2dyYW0sIHRoaXMuZnJhZ1NoYWRlcik7XG5cdFx0Z2wubGlua1Byb2dyYW0odGhpcy5wcm9ncmFtKTsgXG5cblx0XHRpZiAoIWdsLmdldFByb2dyYW1QYXJhbWV0ZXIodGhpcy5wcm9ncmFtLCBnbC5MSU5LX1NUQVRVUykpIHtcblx0XHRcdHRocm93IFwiRXJyb3IgbGlua2luZyB0aGUgc2hhZGVyIHByb2dyYW06XFxuXCJcblx0XHRcdFx0KyBnbC5nZXRQcm9ncmFtSW5mb0xvZyh0aGlzLnByb2dyYW0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2ZldGNoVW5pZm9ybXMoKTtcblx0XHR0aGlzLl9mZXRjaEF0dHJpYnV0ZXMoKTtcblx0fSxcblxuXHRfZmV0Y2hVbmlmb3JtczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHRoaXMudW5pZm9ybUNhY2hlID0ge307XG5cblx0XHR2YXIgbGVuID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkFDVElWRV9VTklGT1JNUyk7XG5cdFx0aWYgKCFsZW4pIC8vbnVsbCBvciB6ZXJvXG5cdFx0XHRyZXR1cm47XG5cblx0XHRmb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHtcblx0XHRcdHZhciBpbmZvID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybSh0aGlzLnByb2dyYW0sIGkpO1xuXHRcdFx0aWYgKGluZm8gPT09IG51bGwpIFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdHZhciBuYW1lID0gaW5mby5uYW1lO1xuXHRcdFx0dmFyIGxvY2F0aW9uID0gZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgbmFtZSk7XG5cdFx0XHRcblx0XHRcdHRoaXMudW5pZm9ybUNhY2hlW25hbWVdID0ge1xuXHRcdFx0XHRzaXplOiBpbmZvLnNpemUsXG5cdFx0XHRcdHR5cGU6IGluZm8udHlwZSxcblx0XHRcdFx0bG9jYXRpb246IGxvY2F0aW9uXG5cdFx0XHR9O1xuXHRcdH1cblx0fSxcblxuXHRfZmV0Y2hBdHRyaWJ1dGVzOiBmdW5jdGlvbigpIHsgXG5cdFx0dmFyIGdsID0gdGhpcy5nbDsgXG5cblx0XHR0aGlzLmF0dHJpYnV0ZUNhY2hlID0ge307XG5cblx0XHR2YXIgbGVuID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkFDVElWRV9BVFRSSUJVVEVTKTtcblx0XHRpZiAoIWxlbikgLy9udWxsIG9yIHplcm9cblx0XHRcdHJldHVybjtcdFxuXG5cdFx0Zm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSB7XG5cdFx0XHR2YXIgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYih0aGlzLnByb2dyYW0sIGkpO1xuXHRcdFx0aWYgKGluZm8gPT09IG51bGwpIFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdHZhciBuYW1lID0gaW5mby5uYW1lO1xuXG5cdFx0XHQvL3RoZSBhdHRyaWIgbG9jYXRpb24gaXMgYSBzaW1wbGUgaW5kZXhcblx0XHRcdHZhciBsb2NhdGlvbiA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgbmFtZSk7XG5cdFx0XHRcblx0XHRcdHRoaXMuYXR0cmlidXRlQ2FjaGVbbmFtZV0gPSB7XG5cdFx0XHRcdHNpemU6IGluZm8uc2l6ZSxcblx0XHRcdFx0dHlwZTogaW5mby50eXBlLFxuXHRcdFx0XHRsb2NhdGlvbjogbG9jYXRpb25cblx0XHRcdH07XG5cdFx0fVxuXHR9LFxuXG5cdF9sb2FkU2hhZGVyOiBmdW5jdGlvbih0eXBlLCBzb3VyY2UpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dmFyIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKTtcblx0XHRpZiAoIXNoYWRlcikgLy9zaG91bGQgbm90IG9jY3VyLi4uXG5cdFx0XHRyZXR1cm4gLTE7XG5cblx0XHRnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpO1xuXHRcdGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKTtcblx0XHRcblx0XHRpZiAoIWdsLmdldFNoYWRlclBhcmFtZXRlcihzaGFkZXIsIGdsLkNPTVBJTEVfU1RBVFVTKSApIHtcblx0XHRcdHZhciBsb2cgPSBnbC5nZXRTaGFkZXJJbmZvTG9nKHNoYWRlcik7XG5cdFx0XHRpZiAobG9nID09PSBudWxsKSAvL21heSByZXR1cm4gbnVsbCBhcyBwZXIgV2ViR0wgc3BlY1xuXHRcdFx0XHRsb2cgPSBcIkVycm9yIGV4ZWN1dGluZyBnZXRTaGFkZXJJbmZvTG9nXCI7XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Ly93ZSBkbyB0aGlzIHNvIHRoZSB1c2VyIGtub3dzIHdoaWNoIHNoYWRlciBoYXMgdGhlIGVycm9yXG5cdFx0XHRcdHZhciB0eXBlU3RyID0gKHR5cGUgPT09IGdsLlZFUlRFWF9TSEFERVIpID8gXCJ2ZXJ0ZXhcIiA6IFwiZnJhZ21lbnRcIjtcblx0XHRcdFx0bG9nID0gXCJFcnJvciBjb21waWxpbmcgXCIrIHR5cGVTdHIrIFwiIHNoYWRlcjpcXG5cIitsb2c7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBsb2c7XG5cdFx0fVxuXHRcdHJldHVybiBzaGFkZXI7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGluZm8gKHNpemUsIHR5cGUsIGxvY2F0aW9uKS5cblx0ICogSWYgdGhlIHVuaWZvcm0gaXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZSwgaXQgaXMgYXNzdW1lZFxuXHQgKiB0byBub3QgZXhpc3QsIGFuZCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqXG5cdCAqIFRoaXMgbWF5IHJldHVybiBudWxsIGV2ZW4gaWYgdGhlIHVuaWZvcm0gaXMgZGVmaW5lZCBpbiBHTFNMOlxuXHQgKiBpZiBpdCBpcyBfaW5hY3RpdmVfIChpLmUuIG5vdCB1c2VkIGluIHRoZSBwcm9ncmFtKSB0aGVuIGl0IG1heVxuXHQgKiBiZSBvcHRpbWl6ZWQgb3V0LlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge09iamVjdH0gYW4gb2JqZWN0IGNvbnRhaW5pbmcgbG9jYXRpb24sIHNpemUsIGFuZCB0eXBlXG5cdCAqL1xuXHRnZXRVbmlmb3JtSW5mbzogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLnVuaWZvcm1DYWNoZS5oYXNPd25Qcm9wZXJ0eShuYW1lKSBcblx0XHRcdD8gdGhpcy51bmlmb3JtQ2FjaGVbbmFtZV0gOiBudWxsOyBcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIGF0dHJpYnV0ZSBpbmZvIChzaXplLCB0eXBlLCBsb2NhdGlvbikuXG5cdCAqIElmIHRoZSBhdHRyaWJ1dGUgaXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZSwgaXQgaXMgYXNzdW1lZFxuXHQgKiB0byBub3QgZXhpc3QsIGFuZCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqXG5cdCAqIFRoaXMgbWF5IHJldHVybiBudWxsIGV2ZW4gaWYgdGhlIGF0dHJpYnV0ZSBpcyBkZWZpbmVkIGluIEdMU0w6XG5cdCAqIGlmIGl0IGlzIF9pbmFjdGl2ZV8gKGkuZS4gbm90IHVzZWQgaW4gdGhlIHByb2dyYW0gb3IgZGlzYWJsZWQpIFxuXHQgKiB0aGVuIGl0IG1heSBiZSBvcHRpbWl6ZWQgb3V0LlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSBhdHRyaWJ1dGUgbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7b2JqZWN0fSBhbiBvYmplY3QgY29udGFpbmluZyBsb2NhdGlvbiwgc2l6ZSBhbmQgdHlwZVxuXHQgKi9cblx0Z2V0QXR0cmlidXRlSW5mbzogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmF0dHJpYnV0ZUNhY2hlLmhhc093blByb3BlcnR5KG5hbWUpXG5cdFx0XHQ/IHRoaXMuYXR0cmlidXRlQ2FjaGVbbmFtZV0gOiBudWxsO1xuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGxvY2F0aW9uIG9iamVjdC5cblx0ICogSWYgdGhlIHVuaWZvcm0gaXMgbm90IGZvdW5kLCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7R0xpbnR9IHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICovXG5cdGdldEF0dHJpYnV0ZUxvY2F0aW9uOiBmdW5jdGlvbihuYW1lKSB7IC8vVE9ETzogbWFrZSBmYXN0ZXIsIGRvbid0IGNhY2hlXG5cdFx0cmV0dXJuIHRoaXMuYXR0cmlidXRlQ2FjaGUuaGFzT3duUHJvcGVydHkobmFtZSkgXG5cdFx0XHQmJiB0aGlzLmF0dHJpYnV0ZUNhY2hlW25hbWVdICE9PSBudWxsXG5cdFx0XHRcdFx0PyB0aGlzLmF0dHJpYnV0ZUNhY2hlW25hbWVdLmxvY2F0aW9uIFxuXHRcdFx0XHRcdDogbnVsbDsgXG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGxvY2F0aW9uIG9iamVjdC5cblx0ICogSWYgdGhlIHVuaWZvcm0gaXMgbm90IGZvdW5kLCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7V2ViR0xVbmlmb3JtTG9jYXRpb259IHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICovXG5cdGdldFVuaWZvcm1Mb2NhdGlvbjogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLnVuaWZvcm1DYWNoZS5oYXNPd25Qcm9wZXJ0eShuYW1lKSBcblx0XHRcdCYmIHRoaXMudW5pZm9ybUNhY2hlW25hbWVdICE9PSBudWxsXG5cdFx0XHRcdFx0PyB0aGlzLnVuaWZvcm1DYWNoZVtuYW1lXS5sb2NhdGlvbiBcblx0XHRcdFx0XHQ6IG51bGw7IFxuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHVuaWZvcm0gaXMgYWN0aXZlIGFuZCBmb3VuZCBpbiB0aGlzXG5cdCAqIGNvbXBpbGVkIHByb2dyYW0uXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9ICBuYW1lIHRoZSB1bmlmb3JtIG5hbWVcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gdHJ1ZSBpZiB0aGUgdW5pZm9ybSBpcyBmb3VuZCBhbmQgYWN0aXZlXG5cdCAqL1xuXHRoYXNVbmlmb3JtOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VW5pZm9ybUluZm8obmFtZSkgIT09IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgYXR0cmlidXRlIGlzIGFjdGl2ZSBhbmQgZm91bmQgaW4gdGhpc1xuXHQgKiBjb21waWxlZCBwcm9ncmFtLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSAgbmFtZSB0aGUgYXR0cmlidXRlIG5hbWVcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gdHJ1ZSBpZiB0aGUgYXR0cmlidXRlIGlzIGZvdW5kIGFuZCBhY3RpdmVcblx0ICovXG5cdGhhc0F0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdldEF0dHJpYnV0ZUluZm8obmFtZSkgIT09IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHVuaWZvcm0gdmFsdWUgYnkgbmFtZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHthbnl9IFRoZSB2YWx1ZSBvZiB0aGUgV2ViR0wgdW5pZm9ybVxuXHQgKi9cblx0Z2V0VW5pZm9ybTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdsLmdldFVuaWZvcm0odGhpcy5wcm9ncmFtLCB0aGlzLmdldFVuaWZvcm1Mb2NhdGlvbihuYW1lKSk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHVuaWZvcm0gdmFsdWUgYXQgdGhlIHNwZWNpZmllZCBXZWJHTFVuaWZvcm1Mb2NhdGlvbi5cblx0ICogXG5cdCAqIEBwYXJhbSAge1dlYkdMVW5pZm9ybUxvY2F0aW9ufSBsb2NhdGlvbiB0aGUgbG9jYXRpb24gb2JqZWN0XG5cdCAqIEByZXR1cm4ge2FueX0gVGhlIHZhbHVlIG9mIHRoZSBXZWJHTCB1bmlmb3JtXG5cdCAqL1xuXHRnZXRVbmlmb3JtQXQ6IGZ1bmN0aW9uKGxvY2F0aW9uKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2wuZ2V0VW5pZm9ybSh0aGlzLnByb2dyYW0sIGxvY2F0aW9uKTtcblx0fSxcblx0XG5cdHNldFVuaWZvcm06IGZ1bmN0aW9uKG5hbWUsIHR5cGUsIGFyZ3MpIHtcblx0XHQvL2ZpcnN0IGxvb2sgaW4gY2FjaGVcblx0XHQvL2lmIG5vdCBmb3VuZCxcblx0fSxcblxuXHRnZXRVbmlmb3JtOiBmdW5jdGlvbihuYW1lKSB7XG5cblx0fSxcblxuXHRiaW5kOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsLnVzZVByb2dyYW0odGhpcy5zaGFkZXJQcm9ncmFtKTtcblx0fSxcblxuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLmRldGFjaFNoYWRlcih0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmRldGFjaFNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXG5cdFx0Z2wuZGVsZXRlU2hhZGVyKHRoaXMudmVydFNoYWRlcik7XG5cdFx0Z2wuZGVsZXRlU2hhZGVyKHRoaXMuZnJhZ1NoYWRlcik7XG5cblx0XHRnbC5kZWxldGVQcm9ncmFtKHRoaXMuc2hhZGVyUHJvZ3JhbSk7XG5cdFx0dGhpcy5zaGFkZXJQcm9ncmFtID0gbnVsbDtcblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gU2hhZGVyUHJvZ3JhbTsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCdqc09PUCcpLkNsYXNzO1xuXG52YXIgVGV4dHVyZSA9IG5ldyBDbGFzcyh7XG5cblx0aWQ6IG51bGwsXG5cdHRhcmdldDogbnVsbCxcblx0d2lkdGg6IDAsXG5cdGhlaWdodDogMCxcblx0X19tYW5hZ2VkOiBmYWxzZSxcblxuXHQvKipcblx0ICogV2hldGhlciB0aGlzIHRleHR1cmUgaXMgJ21hbmFnZWQnIGFuZCB3aWxsIGJlIHJlc3RvcmVkIG9uIGNvbnRleHQgbG9zcy5cblx0ICogSWYgbm8gaW1hZ2UgcHJvdmlkZXIgaXMgdXNlZFxuXHQgKiBcblx0ICogQHR5cGUge0Jvb2xlYW59XG5cdCAqL1xuXHRtYW5hZ2VkOiB7XG5cdFx0Z2V0OiBmdW5jdGlvbigpIHsgXG5cdFx0XHRyZXR1cm4gdGhpcy5fX21hbmFnZWQ7IFxuXHRcdH1cblxuXHRcdC8vVE9ETzogYWRkIHRvIGNhY2hlIHdoZW4gdXNlciBzZXRzIG1hbmFnZWQgPSB0cnVlXG5cdFx0Ly8gc2V0OiBmdW5jdGlvbih2YWwpIHtcblxuXHRcdC8vIH1cblx0fSxcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyB0ZXh0dXJlIHdpdGggdGhlIG9wdGlvbmFsIGRhdGEgcHJvdmlkZXIuXG5cdCAqXG5cdCAqIEEgZGF0YSBwcm92aWRlciBpcyBhIGZ1bmN0aW9uIHdoaWNoIGlzIGNhbGxlZCBieSBUZXh0dXJlXG5cdCAqIG9uIGludGlpYWxpemF0aW9uLCBhbmQgc3Vic2VxdWVudGx5IG9uIGFueSBjb250ZXh0IHJlc3RvcmF0aW9uLlxuXHQgKiBUaGlzIGFsbG93cyBpbWFnZXMgdG8gYmUgcmUtbG9hZGVkIHdpdGhvdXQgdGhlIG5lZWQgdG8ga2VlcFxuXHQgKiB0aGVtIGhhbmdpbmcgYXJvdW5kIGluIG1lbW9yeS4gVGhpcyBhbHNvIG1lYW5zIHRoYXQgcHJvY2VkdXJhbFxuXHQgKiB0ZXh0dXJlcyB3aWxsIGJlIHJlLWNyZWF0ZWQgcHJvcGVybHkgb24gY29udGV4dCByZXN0b3JlLlxuXHQgKlxuXHQgKiBDYWxsaW5nIHRoaXMgY29uc3RydWN0b3Igd2l0aCBubyBhcmd1bWVudHMgd2lsbCByZXN1bHQgaW4gYW4gRXJyb3IuXG5cdCAqXG5cdCAqIElmIHRoaXMgY29uc3RydWN0b3IgaXMgY2FsbGVkIHdpdGggb25seSB0aGUgY29udGV4dCAob25lIGFyZ3VtZW50KSxcblx0ICogdGhlbiBubyBwcm92aWRlciBpcyB1c2VkIGFuZCB0aGUgdGV4dHVyZSB3aWxsIGJlIHVubWFuYWdlZCBhbmQgaXRzIHdpZHRoXG5cdCAqIGFuZCBoZWlnaHQgd2lsbCBiZSB6ZXJvLlxuXHQgKiBcblx0ICogSWYgdGhlIHNlY29uZCBhcmd1bWVudCBpcyBhIHN0cmluZywgd2Ugd2lsbCB1c2UgdGhlIGRlZmF1bHQgSW1hZ2VQcm92aWRlciBcblx0ICogdG8gbG9hZCB0aGUgdGV4dHVyZSBpbnRvIHRoZSBHUFUgYXN5bmNocm9ub3VzbHkuIFVzYWdlOlxuXHQgKlxuXHQgKiAgICAgbmV3IFRleHR1cmUoY29udGV4dCwgXCJwYXRoL2ltZy5wbmdcIik7XG5cdCAqICAgICBuZXcgVGV4dHVyZShjb250ZXh0LCBcInBhdGgvaW1nLnBuZ1wiLCBvbmxvYWRDYWxsYmFjaywgb25lcnJvckNhbGxiYWNrKTtcblx0ICpcblx0ICogVGhlIGNhbGxiYWNrcyB3aWxsIGJlIGZpcmVkIGV2ZXJ5IHRpbWUgdGhlIGltYWdlIGlzIHJlLWxvYWRlZCwgZXZlbiBvbiBjb250ZXh0XG5cdCAqIHJlc3RvcmUuXG5cdCAqXG5cdCAqIElmIHRoZSBzZWNvbmQgYW5kIHRoaXJkIGFyZ3VtZW50cyBhcmUgTnVtYmVycywgd2Ugd2lsbCB1c2UgdGhlIGRlZmF1bHRcblx0ICogQXJyYXlQcm92aWRlciwgd2hpY2ggdGFrZXMgaW4gYSBBcnJheUJ1ZmZlclZpZXcgb2YgcGl4ZWxzLiBUaGlzIGFsbG93c1xuXHQgKiB1cyB0byBjcmVhdGUgdGV4dHVyZXMgc3luY2hyb25vdXNseSBsaWtlIHNvOlxuXHQgKlxuXHQgKiAgICAgbmV3IFRleHR1cmUoY29udGV4dCwgMjU2LCAyNTYpOyAvL3VzZXMgZW1wdHkgZGF0YSwgdHJhbnNwYXJlbnQgYmxhY2tcblx0ICogICAgIG5ldyBUZXh0dXJlKGNvbnRleHQsIDI1NiwgMjU2LCBnbC5MVU1JTkFOQ0UpOyAvL2VtcHR5IGRhdGEgYW5kIExVTUlOQU5DRSBmb3JtYXRcblx0ICogICAgIG5ldyBUZXh0dXJlKGNvbnRleHQsIDI1NiwgMjU2LCBnbC5MVU1JTkFOQ0UsIGdsLlVOU0lHTkVEX0JZVEUsIGJ5dGVBcnJheSk7IC8vY3VzdG9tIGRhdGFcblx0ICpcblx0ICogT3RoZXJ3aXNlLCB3ZSB3aWxsIGFzc3VtZSB0aGF0IGEgY3VzdG9tIHByb3ZpZGVyIGlzIHNwZWNpZmllZC4gSW4gdGhpcyBjYXNlLCB0aGUgc2Vjb25kXG5cdCAqIGFyZ3VtZW50IGlzIGEgcHJvdmlkZXIgZnVuY3Rpb24sIGFuZCB0aGUgc3Vic2VxdWVudCBhcmd1bWVudHMgYXJlIHRob3NlIHdoaWNoIHdpbGwgYmUgcGFzc2VkIFxuXHQgKiB0byB0aGUgcHJvdmlkZXIuIFRoZSBwcm92aWRlciBmdW5jdGlvbiBhbHdheXMgcmVjZWl2ZXMgdGhlIHRleHR1cmUgb2JqZWN0IGFzIHRoZSBmaXJzdCBhcmd1bWVudCxcblx0ICogYW5kIHRoZW4gYW55IG90aGVycyB0aGF0IG1heSBoYXZlIGJlZW4gcGFzc2VkIHRvIGl0LiBGb3IgZXhhbXBsZSwgaGVyZSBpcyBhIGJhc2ljIEltYWdlUHJvdmlkZXIgXG5cdCAqIGltcGxlbWVudGF0aW9uOlxuXHQgKlxuXHQgKiAgICAgLy90aGUgcHJvdmlkZXIgZnVuY3Rpb25cblx0ICogICAgIHZhciBJbWFnZVByb3ZpZGVyID0gZnVuY3Rpb24odGV4dHVyZSwgcGF0aCkge1xuXHQgKiAgICAgICAgIHZhciBpbWcgPSBuZXcgSW1hZ2UoKTtcblx0ICogICAgICAgICBpbWcub25sb2FkID0gZnVuY3Rpb24oKSB7XG5cdCAqICAgIFx0ICAgICAgIHRleHR1cmUudXBsb2FkSW1hZ2UoaW1nKTtcblx0ICogICAgICAgICB9LmJpbmQodGhpcyk7XG5cdCAqICAgICAgICAgaW1nLnNyYyA9IHBhdGg7XG5cdCAqICAgICB9O1xuXHQgKlxuXHQgKiAgICAgLy9sb2FkcyB0aGUgaW1hZ2UgYXN5bmNocm9ub3VzbHlcblx0ICogICAgIHZhciB0ZXggPSBuZXcgVGV4dHVyZShjb250ZXh0LCBJbWFnZVByb3ZpZGVyLCBcIm15aW1nLnBuZ1wiKTtcblx0ICpcblx0ICogXG5cdCAqIEBwYXJhbSAge1dlYkdMQ29udGV4dH0gZ2wgdGhlIFdlYkdMIGNvbnRleHRcblx0ICogQHBhcmFtICB7RnVuY3Rpb259IHByb3ZpZGVyIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSBhcmdzICAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEByZXR1cm4ge1t0eXBlXX0gICAgICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKi9cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oY29udGV4dCkge1xuXHRcdGlmICghY29udGV4dCB8fCBhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuXHRcdFx0dGhyb3cgXCJubyBXZWJHTENhbnZhcyBzcGVjaWZpZWRcIjtcblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdFxuXHRcdHZhciBwcm92aWRlckFyZ3MgPSBbdGhpc107XG5cdFx0dmFyIHByb3ZpZGVyID0gbnVsbDtcblxuXHRcdC8vIGUuZy4gLS0+IG5ldyBUZXh0dXJlKGdsLCBcIm15cGF0aC5qcGdcIilcblx0XHQvLyBcdFx0XHRuZXcgVGV4dHVyZShnbCwgXCJteXBhdGguanBnXCIsIGdsLlJHQilcblx0XHQvL1x0XHRcdG5ldyBUZXh0dXJlKGdsLCBteVByb3ZpZGVyLCBhcmcwLCBhcmcxKVxuXHRcdC8vICAgICAgICAgIG5ldyBUZXh0dXJlKGdsLCBUZXh0dXJlLkltYWdlUHJvdmlkZXIsIFwibXlwYXRoLmpwZ1wiLCBnbC5SR0IpXG5cdFx0Ly9cdFx0XHRuZXcgVGV4dHVyZShnbCwgVGV4dHVlci5BcnJheVByb3ZpZGVyLCAyNTYsIDI1Nilcblx0XHQvL1x0XHRcdG5ldyBUZXh0dXJlKGdsLCAyNTYsIDI1NiwgZ2wuUkdCLCBnbC5VTlNJR05FRF9CWVRFLCBkYXRhKTtcblxuXHRcdC8vd2UgYXJlIHdvcmtpbmcgd2l0aCBhIHByb3ZpZGVyIG9mIHNvbWUga2luZC4uLlxuXHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuXHRcdFx0dmFyIHNsaWNlZEFyZ3MgPSBbXTtcblxuXHRcdFx0Ly9kZXRlcm1pbmUgdGhlIHByb3ZpZGVyLCBpZiBhbnkuLi5cblx0XHRcdGlmICh0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRcdHByb3ZpZGVyID0gVGV4dHVyZS5JbWFnZVByb3ZpZGVyO1xuXHRcdFx0XHRzbGljZWRBcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKVxuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0cHJvdmlkZXIgPSBhcmd1bWVudHNbMV07XG5cdFx0XHRcdHNsaWNlZEFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuXHRcdFx0fSBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMiBcblx0XHRcdFx0XHRcdCYmIHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwibnVtYmVyXCIgXG5cdFx0XHRcdFx0XHQmJiB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcIm51bWJlclwiKSB7XG5cdFx0XHRcdHByb3ZpZGVyID0gVGV4dHVyZS5BcnJheVByb3ZpZGVyO1xuXHRcdFx0XHRzbGljZWRBcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblx0XHRcdH1cblxuXHRcdFx0Ly9jb25jYXQgd2l0aCB0ZXh0dXJlIGFzIGZpcnN0IHBhcmFtXG5cdFx0XHRwcm92aWRlckFyZ3MgPSBwcm92aWRlckFyZ3MuY29uY2F0KHNsaWNlZEFyZ3MpO1xuXHRcdH1cblxuXHRcdC8vdGhlIHByb3ZpZGVyIGFuZCBpdHMgYXJncywgbWF5IGJlIG51bGwuLi5cblx0XHR0aGlzLnByb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0dGhpcy5wcm92aWRlckFyZ3MgPSBwcm92aWRlckFyZ3M7XG5cblx0XHQvL2lmIGEgcHJvdmlkZXIgaXMgc3BlY2lmaWVkLCBpdCB3aWxsIGJlIG1hbmFnZWQgYnkgV2ViR0xDYW52YXNcblx0XHR0aGlzLl9fbWFuYWdlZCA9IHRoaXMucHJvdmlkZXIgIT09IG51bGw7XG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHQvL2lmIHdlIGhhdmUgYSBwcm92aWRlciwgaW52b2tlIGl0XG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fSxcblxuXHQvL2NhbGxlZCBhZnRlciB0aGUgY29udGV4dCBoYXMgYmVlbiByZS1pbml0aWFsaXplZFxuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7IFxuXHRcdHRoaXMuaWQgPSB0aGlzLmdsLmNyZWF0ZVRleHR1cmUoKTsgLy90ZXh0dXJlIElEIGlzIHJlY3JlYXRlZFxuXHRcdHRoaXMud2lkdGggPSB0aGlzLmhlaWdodCA9IDA7IC8vc2l6ZSBpcyByZXNldCB0byB6ZXJvIHVudGlsIGxvYWRlZFxuXHRcdHRoaXMudGFyZ2V0ID0gdGhpcy5nbC5URVhUVVJFXzJEOyAgLy90aGUgcHJvdmlkZXIgY2FuIGNoYW5nZSB0aGlzIGlmIG5lY2Vzc2FyeSAoZS5nLiBjdWJlIG1hcHMpXG5cblx0XHQvL2xvYWQgdGhlIGRhdGFcblx0XHRpZiAodGhpcy5wcm92aWRlcikge1xuXHRcdFx0dGhpcy5wcm92aWRlci5hcHBseSh0aGlzLCB0aGlzLnByb3ZpZGVyQXJncyk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIGxvdy1sZXZlbCBtZXRob2QgdG8gdXBsb2FkIHRoZSBzcGVjaWZpZWQgQXJyYXlCdWZmZXJWaWV3XG5cdCAqIHRvIHRoaXMgdGV4dHVyZS4gVGhpcyB3aWxsIGNhdXNlIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IG9mIHRoaXNcblx0ICogdGV4dHVyZSB0byBjaGFuZ2UuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoICAgICAgICAgIHRoZSBuZXcgd2lkdGggb2YgdGhpcyB0ZXh0dXJlLFxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRzIHRvIHRoZSBsYXN0IHVzZWQgd2lkdGggKG9yIHplcm8pXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0ICAgICAgICAgdGhlIG5ldyBoZWlnaHQgb2YgdGhpcyB0ZXh0dXJlXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHMgdG8gdGhlIGxhc3QgdXNlZCBoZWlnaHQgKG9yIHplcm8pXG5cdCAqIEBwYXJhbSAge0dMZW51bX0gZm9ybWF0ICAgICAgICAgdGhlIGRhdGEgZm9ybWF0LCBkZWZhdWx0IFJHQkFcblx0ICogQHBhcmFtICB7R0xlbnVtfSB0eXBlICAgICAgICAgICB0aGUgZGF0YSB0eXBlLCBkZWZhdWx0IFVOU0lHTkVEX0JZVEUgKFVpbnQ4QXJyYXkpXG5cdCAqIEBwYXJhbSAge0FycmF5QnVmZmVyVmlld30gZGF0YSAgdGhlIHJhdyBkYXRhIGZvciB0aGlzIHRleHR1cmUsIG9yIG51bGwgZm9yIGFuIGVtcHR5IGltYWdlXG5cdCAqL1xuXHR1cGxvYWREYXRhOiBmdW5jdGlvbih3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUsIGRhdGEpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy5mb3JtYXQgPSBmb3JtYXQgfHwgZ2wuUkdCQTtcblx0XHR0eXBlID0gdHlwZSB8fCBnbC5VTlNJR05FRF9CWVRFO1xuXHRcdGRhdGEgPSBkYXRhIHx8IG51bGw7IC8vbWFrZSBzdXJlIGZhbHNleSB2YWx1ZSBpcyBudWxsIGZvciB0ZXhJbWFnZTJEXG5cblx0XHR0aGlzLndpZHRoID0gKHdpZHRoIHx8IHdpZHRoPT0wKSA/IHdpZHRoIDogdGhpcy53aWR0aDtcblx0XHR0aGlzLmhlaWdodCA9IChoZWlnaHQgfHwgaGVpZ2h0PT0wKSA/IGhlaWdodCA6IHRoaXMuaGVpZ2h0O1xuXG5cdFx0dGhpcy5iaW5kKCk7XG5cblx0XHRnbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCB0aGlzLmZvcm1hdCwgXG5cdFx0XHRcdFx0ICB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgMCwgdGhpcy5mb3JtYXQsXG5cdFx0XHRcdFx0ICB0eXBlLCBkYXRhKTtcblx0fSxcblxuXHQvKipcblx0ICogVXBsb2FkcyBJbWFnZURhdGEsIEhUTUxJbWFnZUVsZW1lbnQsIEhUTUxDYW52YXNFbGVtZW50IG9yIFxuXHQgKiBIVE1MVmlkZW9FbGVtZW50LlxuXHQgKiBcdFxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IGRvbU9iamVjdCB0aGUgRE9NIGltYWdlIGNvbnRhaW5lclxuXHQgKi9cblx0dXBsb2FkSW1hZ2U6IGZ1bmN0aW9uKGRvbU9iamVjdCwgZm9ybWF0LCB0eXBlKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHRoaXMuZm9ybWF0ID0gZm9ybWF0IHx8IGdsLlJHQkE7XG5cdFx0dHlwZSA9IHR5cGUgfHwgZ2wuVU5TSUdORURfQllURTtcblx0XHRcblx0XHR0aGlzLndpZHRoID0gZG9tT2JqZWN0LndpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gZG9tT2JqZWN0LmhlaWdodDtcblxuXHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0Z2wudGV4SW1hZ2UyRCh0aGlzLnRhcmdldCwgMCwgdGhpcy5mb3JtYXQsIHRoaXMuZm9ybWF0LFxuXHRcdFx0XHRcdCAgdHlwZSwgZG9tT2JqZWN0KTtcblx0fSxcblxuXHQvKipcblx0ICogQmluZHMgdGhlIHRleHR1cmUuIElmIHVuaXQgaXMgc3BlY2lmaWVkLFxuXHQgKiBpdCB3aWxsIGJpbmQgdGhlIHRleHR1cmUgYXQgdGhlIGdpdmVuIHNsb3Rcblx0ICogKFRFWFRVUkUwLCBURVhUVVJFMSwgZXRjKS4gSWYgdW5pdCBpcyBub3Qgc3BlY2lmaWVkLFxuXHQgKiBpdCB3aWxsIHNpbXBseSBiaW5kIHRoZSB0ZXh0dXJlIGF0IHdoaWNoZXZlciBzbG90XG5cdCAqIGlzIGN1cnJlbnRseSBhY3RpdmUuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHVuaXQgdGhlIHRleHR1cmUgdW5pdCBpbmRleCwgc3RhcnRpbmcgYXQgMFxuXHQgKi9cblx0YmluZDogZnVuY3Rpb24odW5pdCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0aWYgKHVuaXQgfHwgdW5pdCA9PT0gMClcblx0XHRcdGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyB1bml0KTtcblx0XHRnbC5iaW5kVGV4dHVyZSh0aGlzLnRhcmdldCwgdGhpcy5pZCk7XG5cdH1cbn0pO1xuXG5UZXh0dXJlLkZpbHRlciA9IHtcblx0TkVBUkVTVDogOTcyOCxcblx0TkVBUkVTVF9NSVBNQVBfTElORUFSOiA5OTg2LFxuXHRORUFSRVNUX01JUE1BUF9ORUFSRVNUOiA5OTg0LFxuXHRMSU5FQVI6IDk3MjksXG5cdExJTkVBUl9NSVBNQVBfTElORUFSOiA5OTg3LFxuXHRMSU5FQVJfTUlQTUFQX05FQVJFU1Q6IDk5ODVcbn07XG5cblRleHR1cmUuV3JhcCA9IHtcblx0Q0xBTVBfVE9fRURHRTogMzMwNzEsXG5cdE1JUlJPUkVEX1JFUEVBVDogMzM2NDgsXG5cdFJFUEVBVDogMTA0OTdcbn07XG5cblRleHR1cmUuRm9ybWF0ID0ge1xuXHRERVBUSF9DT01QT05FTlQ6IDY0MDIsXG5cdEFMUEhBOiA2NDA2LFxuXHRSR0JBOiA2NDA4LFxuXHRSR0I6IDY0MDcsXG5cdExVTUlOQU5DRTogNjQwOSxcblx0TFVNSU5BTkNFX0FMUEhBOiA2NDEwXG59O1xuXG4vKipcbiAqIFRoaXMgaXMgYSBcInByb3ZpZGVyXCIgZnVuY3Rpb24gZm9yIGltYWdlcywgYmFzZWQgb24gdGhlIGdpdmVuXG4gKiBwYXRoIChzcmMpIGFuZCBvcHRpb25hbCBjYWxsYmFja3MsIFdlYkdMIGZvcm1hdCBhbmQgdHlwZSBvcHRpb25zLlxuICpcbiAqIFRoZSBjYWxsYmFja3MgYXJlIGNhbGxlZCBmcm9tIHRoZSBUZXh0dXJlIHNjb3BlOyBidXQgYWxzbyBwYXNzZWQgdGhlXG4gKiB0ZXh0dXJlIHRvIHRoZSBmaXJzdCBhcmd1bWVudCAoaW4gY2FzZSB0aGUgdXNlciB3aXNoZXMgdG8gcmUtYmluZCB0aGUgXG4gKiBmdW5jdGlvbnMgdG8gc29tZXRoaW5nIGVsc2UpLlxuICogXG4gKiBAcGFyYW0ge1RleHR1cmV9IHRleHR1cmUgdGhlIHRleHR1cmUgd2hpY2ggaXMgYmVpbmcgYWN0ZWQgb25cbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoICAgICB0aGUgcGF0aCB0byB0aGUgaW1hZ2VcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9uTG9hZCB0aGUgY2FsbGJhY2sgYWZ0ZXIgdGhlIGltYWdlIGhhcyBiZWVuIGxvYWRlZCBhbmQgdXBsb2FkZWQgdG8gR1BVXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvbkVyciAgdGhlIGNhbGxiYWNrIGlmIHRoZXJlIHdhcyBhbiBlcnJvciB3aGlsZSBsb2FkaW5nIHRoZSBpbWFnZVxuICogQHBhcmFtIHtHTGVudW19IGZvcm1hdCAgIHRoZSBHTCB0ZXh0dXJlIGZvcm1hdCAoZGVmYXVsdCBSR0JBKVxuICogQHBhcmFtIHtHTGVudW19IHR5cGUgICAgIHRoZSBHTCB0ZXh0dXJlIHR5cGUgKGRlZmF1bHQgVU5TSUdORURfQllURSlcbiAqL1xuVGV4dHVyZS5JbWFnZVByb3ZpZGVyID0gZnVuY3Rpb24odGV4dHVyZSwgcGF0aCwgb25Mb2FkLCBvbkVyciwgZm9ybWF0LCB0eXBlKSB7XG5cdHZhciBpbWcgPSBuZXcgSW1hZ2UoKTtcblx0aW1nLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuXHRcdHRleHR1cmUudXBsb2FkSW1hZ2UoaW1nLCBmb3JtYXQsIHR5cGUpO1xuXHRcdGlmIChvbkxvYWQgJiYgdHlwZW9mIG9uTG9hZCA9PT0gXCJmdW5jdGlvblwiKVxuXHRcdFx0b25Mb2FkLmNhbGwodGV4dHVyZSwgdGV4dHVyZSk7XG5cdH07XG5cdFxuXHRpbWcub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuXHRcdGlmIChvbkVyciAmJiB0eXBlb2Ygb25FcnIgPT09IFwiZnVuY3Rpb25cIikgXG5cdFx0XHRvbkVyci5jYWxsKHRleHR1cmUsIHRleHR1cmUpO1xuXHR9O1xuXG5cdGltZy5zcmMgPSBwYXRoO1xufTtcblxuLyoqXG4gKiBUaGlzIGlzIGEgXCJwcm92aWRlclwiIGZ1bmN0aW9uIGZvciBzeW5jaHJvbm91cyBBcnJheUJ1ZmZlclZpZXcgcGl4ZWwgdXBsb2Fkcy5cbiAqIFxuICogQHBhcmFtICB7VGV4dHVyZX0gdGV4dHVyZSAgXHQgICB0aGUgdGV4dHVyZSB3aGljaCBpcyBiZWluZyBhY3RlZCBvblxuICogQHBhcmFtICB7TnVtYmVyfSB3aWR0aCAgICAgICAgICB0aGUgd2lkdGggb2YgdGhpcyB0ZXh0dXJlLFxuICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgICAgICAgICB0aGUgaGVpZ2h0IG9mIHRoaXMgdGV4dHVyZVxuICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgICAgICAgICB0aGUgZGF0YSBmb3JtYXQsIGRlZmF1bHQgUkdCQVxuICogQHBhcmFtICB7R0xlbnVtfSB0eXBlICAgICAgICAgICB0aGUgZGF0YSB0eXBlLCBkZWZhdWx0IFVOU0lHTkVEX0JZVEUgKFVpbnQ4QXJyYXkpXG4gKiBAcGFyYW0gIHtBcnJheUJ1ZmZlclZpZXd9IGRhdGEgIHRoZSByYXcgZGF0YSBmb3IgdGhpcyB0ZXh0dXJlLCBvciBudWxsIGZvciBhbiBlbXB0eSBpbWFnZVxuICovXG5UZXh0dXJlLkFycmF5UHJvdmlkZXIgPSBmdW5jdGlvbih0ZXh0dXJlLCB3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUsIGRhdGEpIHtcblx0dGV4dHVyZS51cGxvYWREYXRhKHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSk7XG59O1xuXG4vKipcbiAqIFV0aWxpdHkgdG8gZ2V0IHRoZSBudW1iZXIgb2YgY29tcG9uZW50cyBmb3IgdGhlIGdpdmVuIEdMZW51bSwgZS5nLiBnbC5SR0JBIHJldHVybnMgNC5cbiAqIFJldHVybnMgbnVsbCBpZiB0aGUgc3BlY2lmaWVkIGZvcm1hdCBpcyBub3Qgb2YgdHlwZSBERVBUSF9DT01QT05FTlQsIEFMUEhBLCBMVU1JTkFOQ0UsXG4gKiBMVU1JTkFOQ0VfQUxQSEEsIFJHQiwgb3IgUkdCQS5cbiAqXG4gKiBAbWV0aG9kXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0gIHtHTGVudW19IGZvcm1hdCBhIHRleHR1cmUgZm9ybWF0LCBpLmUuIFRleHR1cmUuRm9ybWF0LlJHQkFcbiAqIEByZXR1cm4ge051bWJlcn0gdGhlIG51bWJlciBvZiBjb21wb25lbnRzIGZvciB0aGlzIGZvcm1hdFxuICovXG5UZXh0dXJlLmdldE51bUNvbXBvbmVudHMgPSBmdW5jdGlvbihmb3JtYXQpIHtcblx0c3dpdGNoIChmb3JtYXQpIHtcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkRFUFRIX0NPTVBPTkVOVDpcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkFMUEhBOlxuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuTFVNSU5BTkNFOlxuXHRcdFx0cmV0dXJuIDE7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5MVU1JTkFOQ0VfQUxQSEE6XG5cdFx0XHRyZXR1cm4gMjtcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LlJHQjpcblx0XHRcdHJldHVybiAzO1xuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuUkdCQTpcblx0XHRcdHJldHVybiA0O1xuXHR9XG5cdHJldHVybiBudWxsO1xufTtcblxuLy9Vbm1hbmFnZWQgdGV4dHVyZXM6XG4vL1x0SFRNTCBlbGVtZW50cyBsaWtlIEltYWdlLCBWaWRlbywgQ2FudmFzXG4vL1x0cGl4ZWxzIGJ1ZmZlciBmcm9tIENhbnZhc1xuLy9cdHBpeGVscyBhcnJheVxuXG4vL05lZWQgc3BlY2lhbCBoYW5kbGluZzpcbi8vICBjb250ZXh0Lm9uQ29udGV4dExvc3QuYWRkKGZ1bmN0aW9uKCkge1xuLy8gIFx0Y3JlYXRlRHluYW1pY1RleHR1cmUoKTtcbi8vICB9LmJpbmQodGhpcykpO1xuXG4vL01hbmFnZWQgdGV4dHVyZXM6XG4vL1x0aW1hZ2VzIHNwZWNpZmllZCB3aXRoIGEgcGF0aFxuLy9cdHRoaXMgd2lsbCB1c2UgSW1hZ2UgdW5kZXIgdGhlIGhvb2RcblxuXG5cbm1vZHVsZS5leHBvcnRzID0gVGV4dHVyZTsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCdqc09PUCcpLkNsYXNzO1xuXG52YXIgVmVydGV4RGF0YSA9IG5ldyBDbGFzcyh7XG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oY29udGV4dCwgbnVtVmVydHMsIG51bUluZGljZXMsIGRyYXdNb2RlLCB2ZXJ0ZXhBdHRyaWJzKSB7XG5cdFx0aWYgKCFjb250ZXh0KVxuXHRcdFx0dGhyb3cgXCJHTCBjb250ZXh0IG5vdCBzcGVjaWZpZWRcIjtcblx0XHRpZiAoIW51bVZlcnRzKVxuXHRcdFx0dGhyb3cgXCJudW1WZXJ0cyBub3Qgc3BlY2lmaWVkLCBtdXN0IGJlID4gMFwiO1xuXG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLmdsID0gY29udGV4dC5nbDtcblx0XHRcblx0XHR0aGlzLm51bVZlcnRzID0gbnVtVmVydHM7XG5cdFx0dGhpcy5udW1JbmRpY2VzID0gbnVtSW5kaWNlcyB8fCAwO1xuXHRcdHRoaXMuZHJhd01vZGUgPSBkcmF3TW9kZSB8fCB0aGlzLmdsLlNUQVRJQ19EUkFXO1xuXHRcdHRoaXMudmVydGV4QXR0cmlicyA9IHZlcnRleEF0dHJpYnMgfHwgW107XG5cblx0XHQvL2FkZCB0aGlzIFZCTyB0byB0aGUgbWFuYWdlZCBjYWNoZVxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fSxcblxuXHQvL3JlY3JlYXRlcyB0aGUgYnVmZmVycyBvbiBjb250ZXh0IGxvc3Ncblx0Y3JlYXRlOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgdG8gYmluZCB0aGlzIHZlcnRleCBkYXRhIHdpdGggdGhlIGdpdmVuIFxuXHQgKiBTaGFkZXJQcm9ncmFtLCBlbmFibGluZyBhbnkgYXNzb2NpYXRlZCBhdHRyaWJ1dGVcblx0ICogYXJyYXlzLlxuXHQgKlxuXHQgKiBJZiBzaGFkZXIgaXMgbnVsbCBvciB1bmRlZmluZWQsIGl0J3MgYXNzdW1lZFxuXHQgKiB0aGF0IHRoZSB2ZXJ0ZXggYXR0cmlidXRlcyBoYXZlIGFscmVhZHkgYmVlbiBib3VuZC4gXG5cdCAqIFRoaXMgY2FuIGJlIHVzZWQgYnkgYWR2YW5jZWQgdXNlcnMgdG8gYXZvaWQgcmVkdW5kYW50XG5cdCAqIEdMIGNhbGxzLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U2hhZGVyUHJvZ3JhbX0gc2hhZGVyIHRoZSBzaGFkZXIgdGhhdCB3aWxsIGJlIHVzZWQgdG8gcmVuZGVyIHRoaXMgbWVzaFxuXHQgKi9cblx0YmluZDogZnVuY3Rpb24oc2hhZGVyKSB7XG5cdFx0aWYgKHNoYWRlcilcblx0XHRcdHRoaXMuYmluZFZlcnRleEF0dHJpYnV0ZXMoc2hhZGVyKTtcblx0fSxcblxuXHQvL2JpbmRzIHRoaXMgbWVzaCdzIHZlcnRleCBhdHRyaWJ1dGVzIGZvciB0aGUgZ2l2ZW4gc2hhZGVyXG5cdGJpbmRWZXJ0ZXhBdHRyaWJ1dGVzOiBmdW5jdGlvbihzaGFkZXIpIHtcblx0XHQvL1xuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLnZlcnRleEF0dHJpYnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhciBhID0gdGhpcy52ZXJ0ZXhBdHRyaWJzW2ldO1xuXG5cdFx0XHQvL2RldGVybWluZSB0aGUgbG9jYXRpb24gdG8gXG5cdFx0XHR2YXIgbG9jID0gYS5sb2NhdGlvbiA9PT0gbnVsbCBcblx0XHRcdFx0XHQ/IHNoYWRlci5nZXRBdHRyaWJ1dGVMb2NhdGlvbihhLm5hbWUpXG5cdFx0XHRcdFx0OiBhLmxvY2F0aW9uO1xuXHRcdH1cblx0fVxufSk7XG5cblZlcnRleERhdGEuQXR0cmliID0gbmV3IENsYXNzKHtcblxuXHRuYW1lOiBudWxsLFxuXHRudW1Db21wb25lbnRzOiBudWxsLFxuXHRsb2NhdGlvbjogbnVsbCxcblxuXHQvKipcblx0ICogTG9jYXRpb24gaXMgb3B0aW9uYWwgYW5kIGZvciBhZHZhbmNlZCB1c2VycyB0aGF0XG5cdCAqIHdhbnQgdmVydGV4IGFycmF5cyB0byBtYXRjaCBhY3Jvc3Mgc2hhZGVycy4gQW55IG5vbi1udW1lcmljYWxcblx0ICogdmFsdWUgd2lsbCBiZSBjb252ZXJ0ZWQgdG8gbnVsbCwgYW5kIGlnbm9yZWQuIElmIGEgbnVtZXJpY2FsXG5cdCAqIHZhbHVlIGlzIGdpdmVuLCBpdCB3aWxsIG92ZXJyaWRlIHRoZSBwb3NpdGlvbiBvZiB0aGlzIGF0dHJpYnV0ZVxuXHQgKiB3aGVuIGdpdmVuIHRvIGEgbWVzaC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gbmFtZSAgICAgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gbnVtQ29tcG9uZW50cyBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gbG9jYXRpb24gICAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEByZXR1cm4ge1t0eXBlXX0gICAgICAgICAgICAgICBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbihuYW1lLCBudW1Db21wb25lbnRzLCBsb2NhdGlvbikge1xuXHRcdHRoaXMubmFtZSA9IG5hbWU7XG5cdFx0dGhpcy5udW1Db21wb25lbnRzID0gbnVtQ29tcG9uZW50cztcblx0XHR0aGlzLmxvY2F0aW9uID0gdHlwZW9mIGxvY2F0aW9uID09PSBcIm51bWJlclwiID8gbG9jYXRpb24gOiBudWxsO1xuXHR9XG59KVxuXG5cbm1vZHVsZS5leHBvcnRzID0gVmVydGV4RGF0YTtcblxuXG4vL2Zsb3c6XG4vLyAgXG5cblxuXG4vLyB2YXIgYXR0cmlicyA9IFtcbi8vIFx0bmV3IE1lc2guQXR0cmlidXRlKFwiYV9wb3NpdGlvblwiLCAyKSxcbi8vIFx0bmV3IE1lc2guQXR0cmlidXRlKFwiYV9jb2xvclwiLCAxKVxuLy8gXTtcbi8vIHZhciBtZXNoID0gbmV3IE1lc2goY29udGV4dCwgNCwgNiwgTWVzaC5TVEFUSUMsIGF0dHJpYnMpO1xuXG5cbi8vQ29uc3RhbnQgVmVydGV4IEF0dHJpYjpcbi8vXHRlLmcuIHdpdGggaW5zdGFuY2luZyBtYXliZT9cbi8vT25seSBlbmFibGUgdmVydGV4IGF0dHJpYiBpZiBpdCdzIHVzZWQ/XG4vL1x0YnV0IHdlIGFyZSBzdGlsbCBzZW5kaW5nIGFscGhhIHNvIFdURlxuLy9cdHdvdWxkIG5lZWQgYW5vdGhlciBidWZmZXIsIGJ1dCB0aGF0IGNhbiBnZXQgcmVhbCB1Z2x5LlxuLy8gICIsInZhciBDbGFzcyA9IHJlcXVpcmUoJ2pzT09QJykuQ2xhc3M7XG5cbi8qKlxuICogQSB0aGluIHdyYXBwZXIgYXJvdW5kIFdlYkdMUmVuZGVyaW5nQ29udGV4dCB3aGljaCBoYW5kbGVzXG4gKiBjb250ZXh0IGxvc3MgYW5kIHJlc3RvcmUgd2l0aCBvdGhlciBLYW1pIHJlbmRlcmluZyBvYmplY3RzLlxuICovXG52YXIgV2ViR0xDb250ZXh0ID0gbmV3IENsYXNzKHtcblx0XG5cdG1hbmFnZWRUZXh0dXJlczogbnVsbCxcblx0bWFuYWdlZFNoYWRlcnM6IG51bGwsXG5cblx0Z2w6IG51bGwsXG5cdHdpZHRoOiBudWxsLFxuXHRoZWlnaHQ6IG51bGwsXG5cdHZpZXc6IG51bGwsXG5cdGNvbnRleHRBdHRyaWJ1dGVzOiBudWxsLFxuXHRcblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyBjb250ZXh0IGlzICd2YWxpZCcsIGkuZS4gcmVuZGVyYWJsZS4gQSBjb250ZXh0IHRoYXQgaGFzIGJlZW4gbG9zdFxuXHQgKiAoYW5kIG5vdCB5ZXQgcmVzdG9yZWQpIGlzIGludmFsaWQuXG5cdCAqIFxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdHZhbGlkOiBmYWxzZSxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbih3aWR0aCwgaGVpZ2h0LCB2aWV3LCBjb250ZXh0QXR0cmlidXRlcykge1xuXHRcdC8vc2V0dXAgZGVmYXVsdHNcblx0XHR0aGlzLnZpZXcgPSB2aWV3IHx8IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIik7XG5cblx0XHQvL2RlZmF1bHQgc2l6ZSBhcyBwZXIgc3BlYzpcblx0XHQvL2h0dHA6Ly93d3cudzMub3JnL1RSLzIwMTIvV0QtaHRtbDUtYXV0aG9yLTIwMTIwMzI5L3RoZS1jYW52YXMtZWxlbWVudC5odG1sI3RoZS1jYW52YXMtZWxlbWVudFxuXHRcdHRoaXMud2lkdGggPSB0aGlzLnZpZXcud2lkdGggPSB3aWR0aCB8fCAzMDA7XG5cdFx0dGhpcy5oZWlnaHQgPSB0aGlzLnZpZXcuaGVpZ2h0ID0gaGVpZ2h0IHx8IDE1MDtcblx0XHRcblx0XHQvL3RoZSBsaXN0IG9mIG1hbmFnZWQgb2JqZWN0cy4uLlxuXHRcdHRoaXMubWFuYWdlZE9iamVjdHMgPSBbXTtcblxuXHRcdC8vc2V0dXAgY29udGV4dCBsb3N0IGFuZCByZXN0b3JlIGxpc3RlbmVyc1xuXHRcdHRoaXMudmlldy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0bG9zdFwiLCBmdW5jdGlvbiAoZXYpIHtcblx0XHRcdGV2LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLl9jb250ZXh0TG9zdChldik7XG5cdFx0fS5iaW5kKHRoaXMpKTtcblx0XHR0aGlzLnZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmdsY29udGV4dHJlc3RvcmVkXCIsIGZ1bmN0aW9uIChldikge1xuXHRcdFx0ZXYucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMuX2NvbnRleHRSZXN0b3JlZChldik7XG5cdFx0fS5iaW5kKHRoaXMpKTtcblx0XHRcdFxuXHRcdHRoaXMuY29udGV4dEF0dHJpYnV0ZXMgPSBjb250ZXh0QXR0cmlidXRlcztcblx0XHR0aGlzLl9pbml0Q29udGV4dCgpO1xuXHRcdHRoaXMuaW5pdEdMKCk7XG5cdH0sXG5cblx0X2luaXRDb250ZXh0OiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZXJyID0gXCJcIjtcblx0XHR0aGlzLnZhbGlkID0gZmFsc2U7XG5cblx0XHR0cnkge1xuXHQgICAgICAgIHRoaXMuZ2wgPSAodGhpcy52aWV3LmdldENvbnRleHQoJ3dlYmdsJykgfHwgdGhpcy52aWV3LmdldENvbnRleHQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpKTtcblx0ICAgIH0gY2F0Y2ggKGUpIHtcblx0ICAgIFx0dGhpcy5nbCA9IG51bGw7XG5cdCAgICB9XG5cblx0XHRpZiAodGhpcy5nbCkge1xuXHRcdFx0dGhpcy52YWxpZCA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IFwiV2ViR0wgQ29udGV4dCBOb3QgU3VwcG9ydGVkIC0tIHRyeSBlbmFibGluZyBpdCBvciB1c2luZyBhIGRpZmZlcmVudCBicm93c2VyXCI7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IG9mIHRoaXMgV2ViR0wgY29udGV4dCwgcmVzaXplc1xuXHQgKiB0aGUgY2FudmFzIHZpZXcsIGFuZCBjYWxscyBnbC52aWV3cG9ydCgpIHdpdGggdGhlIG5ldyBzaXplLlxuXHQgKiBcblx0ICogQHBhcmFtICB7TnVtYmVyfSB3aWR0aCAgdGhlIG5ldyB3aWR0aFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCB0aGUgbmV3IGhlaWdodFxuXHQgKi9cblx0cmVzaXplOiBmdW5jdGlvbih3aWR0aCwgaGVpZ2h0KSB7XG5cdFx0dGhpcy53aWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG5cdFx0dGhpcy52aWV3LndpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy52aWV3LmhlaWdodCA9IGhlaWdodDtcblxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0Z2wudmlld3BvcnQoMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuXHR9LFxuXG5cdGluaXRHTDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC52aWV3cG9ydCgwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG5cblx0XHRnbC5jbGVhckNvbG9yKDAuNSwwLjUsMC4wLDEuMCk7XG5cdFx0Z2wuY2xlYXIoZ2wuQ09MT1JfQlVGRkVSX0JJVCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIChpbnRlcm5hbCB1c2UpXG5cdCAqIEEgbWFuYWdlZCBvYmplY3QgaXMgYW55dGhpbmcgd2l0aCBhIFwiY3JlYXRlXCIgZnVuY3Rpb24sIHRoYXQgd2lsbFxuXHQgKiByZXN0b3JlIEdMIHN0YXRlIGFmdGVyIGNvbnRleHQgbG9zcy4gXG5cdCAqIFxuXHQgKiBAcGFyYW0ge1t0eXBlXX0gdGV4IFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdGFkZE1hbmFnZWRPYmplY3Q6IGZ1bmN0aW9uKG9iaikge1xuXHRcdHRoaXMubWFuYWdlZE9iamVjdHMucHVzaChvYmopO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiAoaW50ZXJuYWwgdXNlKVxuXHQgKiBSZW1vdmVzIGEgbWFuYWdlZCBvYmplY3QgZnJvbSB0aGUgY2FjaGUuIFRoaXMgaXMgdXNlZnVsIHRvIGRlc3Ryb3lcblx0ICogYSB0ZXh0dXJlIG9yIHNoYWRlciwgYW5kIGhhdmUgaXQgbm8gbG9uZ2VyIHJlLWxvYWQgb24gY29udGV4dCByZXN0b3JlLlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRoZSBvYmplY3QgdGhhdCB3YXMgcmVtb3ZlZCwgb3IgbnVsbCBpZiBpdCB3YXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge09iamVjdH0gb2JqIHRoZSBvYmplY3QgdG8gYmUgbWFuYWdlZFxuXHQgKiBAcmV0dXJuIHtPYmplY3R9ICAgICB0aGUgcmVtb3ZlZCBvYmplY3QsIG9yIG51bGxcblx0ICovXG5cdHJlbW92ZU1hbmFnZWRPYmplY3Q6IGZ1bmN0aW9uKG9iaikge1xuXHRcdHZhciBpZHggPSB0aGlzLm1hbmFnZWRPYmplY3RzLmluZGV4T2Yob2JqKTtcblx0XHRpZiAoaWR4ID4gLTEpIHtcblx0XHRcdHRoaXMubWFuYWdlZE9iamVjdHMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRyZXR1cm4gb2JqO1xuXHRcdH0gXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0X2NvbnRleHRMb3N0OiBmdW5jdGlvbihldikge1xuXHRcdC8vYWxsIHRleHR1cmVzL3NoYWRlcnMvYnVmZmVycy9GQk9zIGhhdmUgYmVlbiBkZWxldGVkLi4uIFxuXHRcdC8vd2UgbmVlZCB0byByZS1jcmVhdGUgdGhlbSBvbiByZXN0b3JlXG5cdFx0dGhpcy52YWxpZCA9IGZhbHNlO1xuXHR9LFxuXG5cdF9jb250ZXh0UmVzdG9yZWQ6IGZ1bmN0aW9uKGV2KSB7XG5cdFx0Ly9maXJzdCwgaW5pdGlhbGl6ZSB0aGUgR0wgY29udGV4dCBhZ2FpblxuXHRcdHRoaXMuX2luaXRDb250ZXh0KCk7XG5cblx0XHQvL25vdyB3ZSByZWNyZWF0ZSBvdXIgc2hhZGVycyBhbmQgdGV4dHVyZXNcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5tYW5hZ2VkT2JqZWN0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5tYW5hZ2VkT2JqZWN0c1tpXS5jcmVhdGUoKTtcblx0XHR9XG5cblx0XHR0aGlzLmluaXRHTCgpO1xuXHR9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXZWJHTENvbnRleHQ7IiwibW9kdWxlLmV4cG9ydHMgPSB7XG5cdFNoYWRlclByb2dyYW06IHJlcXVpcmUoJy4vU2hhZGVyUHJvZ3JhbScpLFxuXHRXZWJHTENvbnRleHQ6IHJlcXVpcmUoJy4vV2ViR0xDb250ZXh0JyksXG5cdFRleHR1cmU6IHJlcXVpcmUoJy4vVGV4dHVyZScpLFxuXHRWZXJ0ZXhEYXRhOiByZXF1aXJlKCcuL1ZlcnRleERhdGEnKVxufTsiLCJ2YXIgQ2xhc3MgPSByZXF1aXJlKCcuL2xpYi9DbGFzcycpLFxuXHRFbnVtID0gcmVxdWlyZSgnLi9saWIvRW51bScpLFxuXHRJbnRlcmZhY2UgPSByZXF1aXJlKCcuL2xpYi9JbnRlcmZhY2UnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG5cdENsYXNzOiBDbGFzcyxcblx0RW51bTogRW51bSxcblx0SW50ZXJmYWNlOiBJbnRlcmZhY2Vcbn07IiwidmFyIEJhc2VDbGFzcyA9IHJlcXVpcmUoJy4vYmFzZUNsYXNzJyk7XG5cbnZhciBDbGFzcyA9IGZ1bmN0aW9uKCBkZXNjcmlwdG9yICkge1xuXHRpZiAoIWRlc2NyaXB0b3IpIFxuXHRcdGRlc2NyaXB0b3IgPSB7fTtcblx0XG5cdGlmKCBkZXNjcmlwdG9yLmluaXRpYWxpemUgKSB7XG5cdFx0dmFyIHJWYWwgPSBkZXNjcmlwdG9yLmluaXRpYWxpemU7XG5cdFx0ZGVsZXRlIGRlc2NyaXB0b3IuaW5pdGlhbGl6ZTtcblx0fSBlbHNlIHtcblx0XHRyVmFsID0gZnVuY3Rpb24oKSB7IHRoaXMucGFyZW50LmFwcGx5KCB0aGlzLCBhcmd1bWVudHMgKTsgfTtcblx0fVxuXG5cdGlmKCBkZXNjcmlwdG9yLkV4dGVuZHMgKSB7XG5cdFx0clZhbC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKCBkZXNjcmlwdG9yLkV4dGVuZHMucHJvdG90eXBlICk7XG5cdFx0Ly8gdGhpcyB3aWxsIGJlIHVzZWQgdG8gY2FsbCB0aGUgcGFyZW50IGNvbnN0cnVjdG9yXG5cdFx0clZhbC4kJHBhcmVudENvbnN0cnVjdG9yID0gZGVzY3JpcHRvci5FeHRlbmRzO1xuXHRcdGRlbGV0ZSBkZXNjcmlwdG9yLkV4dGVuZHM7XG5cdH0gZWxzZSB7XG5cdFx0clZhbC4kJHBhcmVudENvbnN0cnVjdG9yID0gZnVuY3Rpb24oKSB7fVxuXHRcdHJWYWwucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSggQmFzZUNsYXNzICk7XG5cdH1cblxuXHRyVmFsLnByb3RvdHlwZS4kJGdldHRlcnMgPSB7fTtcblx0clZhbC5wcm90b3R5cGUuJCRzZXR0ZXJzID0ge307XG5cblx0Zm9yKCB2YXIgaSBpbiBkZXNjcmlwdG9yICkge1xuXHRcdGlmKCB0eXBlb2YgZGVzY3JpcHRvclsgaSBdID09ICdmdW5jdGlvbicgKSB7XG5cdFx0XHRkZXNjcmlwdG9yWyBpIF0uJCRuYW1lID0gaTtcblx0XHRcdGRlc2NyaXB0b3JbIGkgXS4kJG93bmVyID0gclZhbC5wcm90b3R5cGU7XG5cblx0XHRcdHJWYWwucHJvdG90eXBlWyBpIF0gPSBkZXNjcmlwdG9yWyBpIF07XG5cdFx0fSBlbHNlIGlmKCBkZXNjcmlwdG9yWyBpIF0gJiYgdHlwZW9mIGRlc2NyaXB0b3JbIGkgXSA9PSAnb2JqZWN0JyAmJiAoIGRlc2NyaXB0b3JbIGkgXS5nZXQgfHwgZGVzY3JpcHRvclsgaSBdLnNldCApICkge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KCByVmFsLnByb3RvdHlwZSwgaSAsIGRlc2NyaXB0b3JbIGkgXSApO1xuXG5cdFx0XHRpZiggZGVzY3JpcHRvclsgaSBdLmdldCApIHtcblx0XHRcdFx0clZhbC5wcm90b3R5cGUuJCRnZXR0ZXJzWyBpIF0gPSBkZXNjcmlwdG9yWyBpIF0uZ2V0O1xuXHRcdFx0XHRkZXNjcmlwdG9yWyBpIF0uZ2V0LiQkbmFtZSA9IGk7XG5cdFx0XHRcdGRlc2NyaXB0b3JbIGkgXS5nZXQuJCRvd25lciA9IHJWYWwucHJvdG90eXBlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiggZGVzY3JpcHRvclsgaSBdLnNldCApIHtcblx0XHRcdFx0clZhbC5wcm90b3R5cGUuJCRzZXR0ZXJzWyBpIF0gPSBkZXNjcmlwdG9yWyBpIF0uc2V0O1xuXHRcdFx0XHRkZXNjcmlwdG9yWyBpIF0uc2V0LiQkbmFtZSA9IGk7XG5cdFx0XHRcdGRlc2NyaXB0b3JbIGkgXS5zZXQuJCRvd25lciA9IHJWYWwucHJvdG90eXBlO1x0XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJWYWwucHJvdG90eXBlWyBpIF0gPSBkZXNjcmlwdG9yWyBpIF07XG5cdFx0fVxuXHR9XG5cblx0Ly8gdGhpcyB3aWxsIGJlIHVzZWQgdG8gY2hlY2sgaWYgdGhlIGNhbGxlciBmdW5jdGlvbiBpcyB0aGUgY29uc3J1Y3RvclxuXHRyVmFsLiQkaXNDb25zdHJ1Y3RvciA9IHRydWU7XG5cblxuXHQvLyBub3cgd2UnbGwgY2hlY2sgaW50ZXJmYWNlc1xuXHRmb3IoIHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKyApIHtcblx0XHRhcmd1bWVudHNbIGkgXS5jb21wYXJlKCByVmFsICk7XG5cdH1cblxuXHRyZXR1cm4gclZhbDtcbn07XHRcblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gQ2xhc3M7IiwidmFyIENsYXNzID0gcmVxdWlyZSgnLi9DbGFzcycpO1xuXG4vKipcblRoZSBFbnVtIGNsYXNzLCB3aGljaCBob2xkcyBhIHNldCBvZiBjb25zdGFudHMgaW4gYSBmaXhlZCBvcmRlci5cblxuIyMjIyBCYXNpYyBVc2FnZTpcblx0dmFyIERheXMgPSBuZXcgRW51bShbIFxuXHRcdFx0J01vbmRheScsXG5cdFx0XHQnVHVlc2RheScsXG5cdFx0XHQnV2VkbmVzZGF5Jyxcblx0XHRcdCdUaHVyc2RheScsXG5cdFx0XHQnRnJpZGF5Jyxcblx0XHRcdCdTYXR1cmRheScsXG5cdFx0XHQnU3VuZGF5J1xuXHRdKTtcblxuXHRjb25zb2xlLmxvZyggRGF5cy5Nb25kYXkgPT09IERheXMuVHVlc2RheSApOyAvLyA9PiBmYWxzZVxuXHRjb25zb2xlLmxvZyggRGF5cy52YWx1ZXNbMV0gKSAvLyA9PiB0aGUgJ1R1ZXNkYXknIHN5bWJvbCBvYmplY3RcblxuRWFjaCBlbnVtICpzeW1ib2wqIGlzIGFuIG9iamVjdCB3aGljaCBleHRlbmRzIGZyb20gdGhlIGB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2VcIn19e3svY3Jvc3NMaW5rfX1gIFxuY2xhc3MuIFRoaXMgYmFzZVxuY2xhc3MgaGFzICBwcm9wZXJ0aWVzIGxpa2UgYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZS92YWx1ZTpwcm9wZXJ0eVwifX17ey9jcm9zc0xpbmt9fWAgIFxuYW5kIGB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2Uvb3JkaW5hbDpwcm9wZXJ0eVwifX17ey9jcm9zc0xpbmt9fWAuIFxuX19gdmFsdWVgX18gaXMgYSBzdHJpbmdcbndoaWNoIG1hdGNoZXMgdGhlIGVsZW1lbnQgb2YgdGhlIGFycmF5LiBfX2BvcmRpbmFsYF9fIGlzIHRoZSBpbmRleCB0aGUgXG5zeW1ib2wgd2FzIGRlZmluZWQgYXQgaW4gdGhlIGVudW1lcmF0aW9uLiBcblxuVGhlIHJlc3VsdGluZyBFbnVtIG9iamVjdCAoaW4gdGhlIGFib3ZlIGNhc2UsIERheXMpIGFsc28gaGFzIHNvbWUgdXRpbGl0eSBtZXRob2RzLFxubGlrZSBmcm9tVmFsdWUoc3RyaW5nKSBhbmQgdGhlIHZhbHVlcyBwcm9wZXJ0eSB0byBhY2Nlc3MgdGhlIGFycmF5IG9mIHN5bWJvbHMuXG5cbk5vdGUgdGhhdCB0aGUgdmFsdWVzIGFycmF5IGlzIGZyb3plbiwgYXMgaXMgZWFjaCBzeW1ib2wuIFRoZSByZXR1cm5lZCBvYmplY3QgaXMgXG5fX25vdF9fIGZyb3plbiwgYXMgdG8gYWxsb3cgdGhlIHVzZXIgdG8gbW9kaWZ5IGl0IChpLmUuIGFkZCBcInN0YXRpY1wiIG1lbWJlcnMpLlxuXG5BIG1vcmUgYWR2YW5jZWQgRW51bSB1c2FnZSBpcyB0byBzcGVjaWZ5IGEgYmFzZSBFbnVtIHN5bWJvbCBjbGFzcyBhcyB0aGUgc2Vjb25kXG5wYXJhbWV0ZXIuIFRoaXMgaXMgdGhlIGNsYXNzIHRoYXQgZWFjaCBzeW1ib2wgd2lsbCB1c2UuIFRoZW4sIGlmIGFueSBzeW1ib2xzXG5hcmUgZ2l2ZW4gYXMgYW4gQXJyYXkgKGluc3RlYWQgb2Ygc3RyaW5nKSwgaXQgd2lsbCBiZSB0cmVhdGVkIGFzIGFuIGFycmF5IG9mIGFyZ3VtZW50c1xudG8gdGhlIGJhc2UgY2xhc3MuIFRoZSBmaXJzdCBhcmd1bWVudCBzaG91bGQgYWx3YXlzIGJlIHRoZSBkZXNpcmVkIGtleSBvZiB0aGF0IHN5bWJvbC5cblxuTm90ZSB0aGF0IF9fYG9yZGluYWxgX18gaXMgYWRkZWQgZHluYW1pY2FsbHlcbmFmdGVyIHRoZSBzeW1ib2wgaXMgY3JlYXRlZDsgc28gaXQgY2FuJ3QgYmUgdXNlZCBpbiB0aGUgc3ltYm9sJ3MgY29uc3RydWN0b3IuXG5cbiMjIyMgQWR2YW5jZWQgVXNhZ2Vcblx0dmFyIERheXMgPSBuZXcgRW51bShbIFxuXHRcdFx0J01vbmRheScsXG5cdFx0XHQnVHVlc2RheScsXG5cdFx0XHQnV2VkbmVzZGF5Jyxcblx0XHRcdCdUaHVyc2RheScsXG5cdFx0XHQnRnJpZGF5Jyxcblx0XHRcdFsnU2F0dXJkYXknLCB0cnVlXSxcblx0XHRcdFsnU3VuZGF5JywgdHJ1ZV1cblx0XHRdLCBuZXcgQ2xhc3Moe1xuXHRcdFx0XG5cdFx0XHRFeHRlbmRzOiBFbnVtLkJhc2UsXG5cblx0XHRcdGlzV2Vla2VuZDogZmFsc2UsXG5cblx0XHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uKCBrZXksIGlzV2Vla2VuZCApIHtcblx0XHRcdFx0Ly9wYXNzIHRoZSBzdHJpbmcgdmFsdWUgYWxvbmcgdG8gcGFyZW50IGNvbnN0cnVjdG9yXG5cdFx0XHRcdHRoaXMucGFyZW50KCBrZXkgKTsgXG5cdFx0XHRcdFxuXHRcdFx0XHQvL2dldCBhIGJvb2xlYW4gcHJpbWl0aXZlIG91dCBvZiB0aGUgdHJ1dGh5L2ZhbHN5IHZhbHVlXG5cdFx0XHRcdHRoaXMuaXNXZWtlZW5kID0gQm9vbGVhbihpc1dlZWtlbmQpO1xuXHRcdFx0fVxuXHRcdH0pXG5cdCk7XG5cblx0Y29uc29sZS5sb2coIERheXMuU2F0dXJkYXkuaXNXZWVrZW5kICk7IC8vID0+IHRydWVcblxuVGhpcyBtZXRob2Qgd2lsbCB0aHJvdyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIHNwZWNpZnkgYSBjbGFzcyB3aGljaCBkb2VzXG5ub3QgZXh0ZW5kIGZyb20gYHt7I2Nyb3NzTGluayBcIkVudW0uQmFzZVwifX17ey9jcm9zc0xpbmt9fWAuXG5cbiMjIyMgU2hvcnRoYW5kXG5cbllvdSBjYW4gYWxzbyBvbWl0IHRoZSBgbmV3IENsYXNzYCBhbmQgcGFzcyBhIGRlc2NyaXB0b3IsIHRodXMgcmVkdWNpbmcgdGhlIG5lZWQgdG8gXG5leHBsaWNpdGx5IHJlcXVpcmUgdGhlIENsYXNzIG1vZHVsZS4gRnVydGhlciwgaWYgeW91IGFyZSBwYXNzaW5nIGEgZGVzY3JpcHRvciB0aGF0XG5kb2VzIG5vdCBoYXZlIGBFeHRlbmRzYCBkZWZpbmVkLCBpdCB3aWxsIGRlZmF1bHQgdG9cbmB7eyNjcm9zc0xpbmsgXCJFbnVtLkJhc2VcIn19e3svY3Jvc3NMaW5rfX1gLlxuXG5cdHZhciBJY29ucyA9IG5ldyBFbnVtKFsgXG5cdFx0XHQnT3BlbicsXG5cdFx0XHQnU2F2ZScsXG5cdFx0XHQnSGVscCcsXG5cdFx0XHQnTmV3J1xuXHRcdF0sIHtcblxuXHRcdFx0cGF0aDogZnVuY3Rpb24oIHJldGluYSApIHtcblx0XHRcdFx0cmV0dXJuIFwiaWNvbnMvXCIgKyB0aGlzLnZhbHVlLnRvTG93ZXJDYXNlKCkgKyAocmV0aW5hID8gXCJAMnhcIiA6IFwiXCIpICsgXCIucG5nXCI7XG5cdFx0XHR9XG5cdFx0fVxuXHQpO1xuXG5cbkBjbGFzcyBFbnVtXG5AY29uc3RydWN0b3IgXG5AcGFyYW0ge0FycmF5fSBlbGVtZW50cyBBbiBhcnJheSBvZiBlbnVtZXJhdGVkIGNvbnN0YW50cywgb3IgYXJndW1lbnRzIHRvIGJlIHBhc3NlZCB0byB0aGUgc3ltYm9sXG5AcGFyYW0ge0NsYXNzfSBiYXNlIENsYXNzIHRvIGJlIGluc3RhbnRpYXRlZCBmb3IgZWFjaCBlbnVtIHN5bWJvbCwgbXVzdCBleHRlbmQgXG5ge3sjY3Jvc3NMaW5rIFwiRW51bS5CYXNlXCJ9fXt7L2Nyb3NzTGlua319YFxuKi9cbnZhciBFbnVtUmVzdWx0ID0gbmV3IENsYXNzKHtcblxuXHQvKipcblx0QW4gYXJyYXkgb2YgdGhlIGVudW1lcmF0ZWQgc3ltYm9sIG9iamVjdHMuXG5cblx0QHByb3BlcnR5IHZhbHVlc1xuXHRAdHlwZSBBcnJheVxuXHQqL1xuXHR2YWx1ZXM6IG51bGwsXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudmFsdWVzID0gW107XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gXCJbIFwiK3RoaXMudmFsdWVzLmpvaW4oXCIsIFwiKStcIiBdXCI7XG5cdH0sXG5cblx0LyoqXG5cdExvb2tzIGZvciB0aGUgZmlyc3Qgc3ltYm9sIGluIHRoaXMgZW51bSB3aG9zZSAndmFsdWUnIG1hdGNoZXMgdGhlIHNwZWNpZmllZCBzdHJpbmcuIFxuXHRJZiBub25lIGFyZSBmb3VuZCwgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXG5cdEBtZXRob2QgZnJvbVZhbHVlXG5cdEBwYXJhbSB7U3RyaW5nfSBzdHIgdGhlIHN0cmluZyB0byBsb29rIHVwXG5cdEByZXR1cm4ge0VudW0uQmFzZX0gcmV0dXJucyBhbiBlbnVtIHN5bWJvbCBmcm9tIHRoZSBnaXZlbiAndmFsdWUnIHN0cmluZywgb3IgbnVsbFxuXHQqL1xuXHRmcm9tVmFsdWU6IGZ1bmN0aW9uIChzdHIpIHtcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy52YWx1ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChzdHIgPT09IHRoaXMudmFsdWVzW2ldLnZhbHVlKVxuXHRcdFx0XHRyZXR1cm4gdGhpcy52YWx1ZXNbaV07XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59KTtcblxuXG5cbnZhciBFbnVtID0gZnVuY3Rpb24gKCBlbGVtZW50cywgYmFzZSApIHtcblx0aWYgKCFiYXNlKVxuXHRcdGJhc2UgPSBFbnVtLkJhc2U7XG5cblx0Ly9UaGUgdXNlciBpcyBvbWl0dGluZyBDbGFzcywgaW5qZWN0IGl0IGhlcmVcblx0aWYgKHR5cGVvZiBiYXNlID09PSBcIm9iamVjdFwiKSB7XG5cdFx0Ly9pZiB3ZSBkaWRuJ3Qgc3BlY2lmeSBhIHN1YmNsYXNzLi4gXG5cdFx0aWYgKCFiYXNlLkV4dGVuZHMpXG5cdFx0XHRiYXNlLkV4dGVuZHMgPSBFbnVtLkJhc2U7XG5cdFx0YmFzZSA9IG5ldyBDbGFzcyhiYXNlKTtcblx0fVxuXHRcblx0dmFyIHJldCA9IG5ldyBFbnVtUmVzdWx0KCk7XG5cblx0Zm9yICh2YXIgaT0wOyBpPGVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0dmFyIGUgPSBlbGVtZW50c1tpXTtcblxuXHRcdHZhciBvYmogPSBudWxsO1xuXHRcdHZhciBrZXkgPSBudWxsO1xuXG5cdFx0aWYgKCFlKVxuXHRcdFx0dGhyb3cgXCJlbnVtIHZhbHVlIGF0IGluZGV4IFwiK2krXCIgaXMgdW5kZWZpbmVkXCI7XG5cblx0XHRpZiAodHlwZW9mIGUgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdGtleSA9IGU7XG5cdFx0XHRvYmogPSBuZXcgYmFzZShlKTtcblx0XHRcdHJldFtlXSA9IG9iajtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGUpKVxuXHRcdFx0XHR0aHJvdyBcImVudW0gdmFsdWVzIG11c3QgYmUgU3RyaW5nIG9yIGFuIGFycmF5IG9mIGFyZ3VtZW50c1wiO1xuXG5cdFx0XHRrZXkgPSBlWzBdO1xuXG5cdFx0XHQvL2ZpcnN0IGFyZyBpcyBpZ25vcmVkXG5cdFx0XHRlLnVuc2hpZnQobnVsbCk7XG5cdFx0XHRvYmogPSBuZXcgKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLmFwcGx5KGJhc2UsIGUpKTtcblxuXHRcdFx0cmV0W2tleV0gPSBvYmo7XG5cdFx0fVxuXG5cdFx0aWYgKCAhKG9iaiBpbnN0YW5jZW9mIEVudW0uQmFzZSkgKVxuXHRcdFx0dGhyb3cgXCJlbnVtIGJhc2UgY2xhc3MgbXVzdCBiZSBhIHN1YmNsYXNzIG9mIEVudW0uQmFzZVwiO1xuXG5cdFx0b2JqLm9yZGluYWwgPSBpO1xuXHRcdHJldC52YWx1ZXMucHVzaChvYmopO1xuXHRcdE9iamVjdC5mcmVlemUob2JqKTtcblx0fTtcblxuXHQvL3dlIFNIT1VMRCBmcmVlemUgdGhlIHJldHVycm5lZCBvYmplY3QsIGJ1dCBtb3N0IEpTIGRldmVsb3BlcnNcblx0Ly9hcmVuJ3QgZXhwZWN0aW5nIGFuIG9iamVjdCB0byBiZSBmcm96ZW4sIGFuZCB0aGUgYnJvd3NlcnMgZG9uJ3QgYWx3YXlzIHdhcm4gdXMuXG5cdC8vSXQganVzdCBjYXVzZXMgZnJ1c3RyYXRpb24sIGUuZy4gaWYgeW91J3JlIHRyeWluZyB0byBhZGQgYSBzdGF0aWMgb3IgY29uc3RhbnRcblx0Ly90byB0aGUgcmV0dXJuZWQgb2JqZWN0LlxuXG5cdC8vIE9iamVjdC5mcmVlemUocmV0KTtcblx0T2JqZWN0LmZyZWV6ZShyZXQudmFsdWVzKTtcblx0cmV0dXJuIHJldDtcbn07XG5cblxuLyoqXG5cblRoZSBiYXNlIHR5cGUgZm9yIEVudW0gc3ltYm9scy4gU3ViY2xhc3NlcyBjYW4gZXh0ZW5kXG50aGlzIHRvIGltcGxlbWVudCBtb3JlIGZ1bmN0aW9uYWxpdHkgZm9yIGVudW0gc3ltYm9scy5cblxuQGNsYXNzIEVudW0uQmFzZVxuQGNvbnN0cnVjdG9yIFxuQHBhcmFtIHtTdHJpbmd9IGtleSB0aGUgc3RyaW5nIHZhbHVlIGZvciB0aGlzIHN5bWJvbFxuKi9cbkVudW0uQmFzZSA9IG5ldyBDbGFzcyh7XG5cblx0LyoqXG5cdFRoZSBzdHJpbmcgdmFsdWUgb2YgdGhpcyBzeW1ib2wuXG5cdEBwcm9wZXJ0eSB2YWx1ZVxuXHRAdHlwZSBTdHJpbmdcblx0Ki9cblx0dmFsdWU6IHVuZGVmaW5lZCxcblxuXHQvKipcblx0VGhlIGluZGV4IG9mIHRoaXMgc3ltYm9sIGluIGl0cyBlbnVtZXJhdGlvbiBhcnJheS5cblx0QHByb3BlcnR5IG9yZGluYWxcblx0QHR5cGUgTnVtYmVyXG5cdCovXG5cdG9yZGluYWw6IHVuZGVmaW5lZCxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAoIGtleSApIHtcblx0XHR0aGlzLnZhbHVlID0ga2V5O1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZSB8fCB0aGlzLnBhcmVudCgpO1xuXHR9LFxuXG5cdHZhbHVlT2Y6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlIHx8IHRoaXMucGFyZW50KCk7XG5cdH1cbn0pO1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBFbnVtO1xuIiwiXG52YXIgSW50ZXJmYWNlID0gZnVuY3Rpb24oIGRlc2NyaXB0b3IgKSB7XG5cdHRoaXMuZGVzY3JpcHRvciA9IGRlc2NyaXB0b3I7XG59O1xuXG5JbnRlcmZhY2UucHJvdG90eXBlLmRlc2NyaXB0b3IgPSBudWxsO1xuXG5JbnRlcmZhY2UucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiggY2xhc3NUb0NoZWNrICkge1xuXG5cdGZvciggdmFyIGkgIGluIHRoaXMuZGVzY3JpcHRvciApIHtcblx0XHQvLyBGaXJzdCB3ZSdsbCBjaGVjayBpZiB0aGlzIHByb3BlcnR5IGV4aXN0cyBvbiB0aGUgY2xhc3Ncblx0XHRpZiggY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdID09PSB1bmRlZmluZWQgKSB7XG5cblx0XHRcdHRocm93ICdJTlRFUkZBQ0UgRVJST1I6ICcgKyBpICsgJyBpcyBub3QgZGVmaW5lZCBpbiB0aGUgY2xhc3MnO1xuXG5cdFx0Ly8gU2Vjb25kIHdlJ2xsIGNoZWNrIHRoYXQgdGhlIHR5cGVzIGV4cGVjdGVkIG1hdGNoXG5cdFx0fSBlbHNlIGlmKCB0eXBlb2YgdGhpcy5kZXNjcmlwdG9yWyBpIF0gIT0gdHlwZW9mIGNsYXNzVG9DaGVjay5wcm90b3R5cGVbIGkgXSApIHtcblxuXHRcdFx0dGhyb3cgJ0lOVEVSRkFDRSBFUlJPUjogSW50ZXJmYWNlIGFuZCBjbGFzcyBkZWZpbmUgaXRlbXMgb2YgZGlmZmVyZW50IHR5cGUgZm9yICcgKyBpICsgXG5cdFx0XHRcdCAgJ1xcbmludGVyZmFjZVsgJyArIGkgKyAnIF0gPT0gJyArIHR5cGVvZiB0aGlzLmRlc2NyaXB0b3JbIGkgXSArXG5cdFx0XHRcdCAgJ1xcbmNsYXNzWyAnICsgaSArICcgXSA9PSAnICsgdHlwZW9mIGNsYXNzVG9DaGVjay5wcm90b3R5cGVbIGkgXTtcblxuXHRcdC8vIFRoaXJkIGlmIHRoaXMgcHJvcGVydHkgaXMgYSBmdW5jdGlvbiB3ZSdsbCBjaGVjayB0aGF0IHRoZXkgZXhwZWN0IHRoZSBzYW1lIGFtb3VudCBvZiBwYXJhbWV0ZXJzXG5cdFx0fSBlbHNlIGlmKCB0eXBlb2YgdGhpcy5kZXNjcmlwdG9yWyBpIF0gPT0gJ2Z1bmN0aW9uJyAmJiBjbGFzc1RvQ2hlY2sucHJvdG90eXBlWyBpIF0ubGVuZ3RoICE9IHRoaXMuZGVzY3JpcHRvclsgaSBdLmxlbmd0aCApIHtcblxuXHRcdFx0dGhyb3cgJ0lOVEVSRkFDRSBFUlJPUjogSW50ZXJmYWNlIGFuZCBjbGFzcyBleHBlY3QgYSBkaWZmZXJlbnQgYW1vdW50IG9mIHBhcmFtZXRlcnMgZm9yIHRoZSBmdW5jdGlvbiAnICsgaSArXG5cdFx0XHRcdCAgJ1xcbkVYUEVDVEVEOiAnICsgdGhpcy5kZXNjcmlwdG9yWyBpIF0ubGVuZ3RoICsgXG5cdFx0XHRcdCAgJ1xcblJFQ0VJVkVEOiAnICsgY2xhc3NUb0NoZWNrLnByb3RvdHlwZVsgaSBdLmxlbmd0aDtcblxuXHRcdH1cblx0fVxufTtcblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gSW50ZXJmYWNlOyIsIi8vRXhwb3J0cyBhIGZ1bmN0aW9uIG5hbWVkICdwYXJlbnQnXG5tb2R1bGUuZXhwb3J0cy5wYXJlbnQgPSBmdW5jdGlvbigpIHtcblx0Ly8gaWYgdGhlIGN1cnJlbnQgZnVuY3Rpb24gY2FsbGluZyBpcyB0aGUgY29uc3RydWN0b3Jcblx0aWYoIHRoaXMucGFyZW50LmNhbGxlci4kJGlzQ29uc3RydWN0b3IgKSB7XG5cdFx0dmFyIHBhcmVudEZ1bmN0aW9uID0gdGhpcy5wYXJlbnQuY2FsbGVyLiQkcGFyZW50Q29uc3RydWN0b3I7XG5cdH0gZWxzZSB7XG5cdFx0aWYoIHRoaXMucGFyZW50LmNhbGxlci4kJG5hbWUgKSB7XG5cdFx0XHR2YXIgY2FsbGVyTmFtZSA9IHRoaXMucGFyZW50LmNhbGxlci4kJG5hbWU7XG5cdFx0XHR2YXIgaXNHZXR0ZXIgPSB0aGlzLnBhcmVudC5jYWxsZXIuJCRvd25lci4kJGdldHRlcnNbIGNhbGxlck5hbWUgXTtcblx0XHRcdHZhciBpc1NldHRlciA9IHRoaXMucGFyZW50LmNhbGxlci4kJG93bmVyLiQkc2V0dGVyc1sgY2FsbGVyTmFtZSBdO1xuXG5cdFx0XHRpZiggYXJndW1lbnRzLmxlbmd0aCA9PSAxICYmIGlzU2V0dGVyICkge1xuXHRcdFx0XHR2YXIgcGFyZW50RnVuY3Rpb24gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoIHRoaXMucGFyZW50LmNhbGxlci4kJG93bmVyICkuJCRzZXR0ZXJzWyBjYWxsZXJOYW1lIF07XG5cblx0XHRcdFx0aWYoIHBhcmVudEZ1bmN0aW9uID09PSB1bmRlZmluZWQgKSB7XG5cdFx0XHRcdFx0dGhyb3cgJ05vIHNldHRlciBkZWZpbmVkIGluIHBhcmVudCc7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiggYXJndW1lbnRzLmxlbmd0aCA9PSAwICYmIGlzR2V0dGVyICkge1xuXHRcdFx0XHR2YXIgcGFyZW50RnVuY3Rpb24gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoIHRoaXMucGFyZW50LmNhbGxlci4kJG93bmVyICkuJCRnZXR0ZXJzWyBjYWxsZXJOYW1lIF07XG5cblx0XHRcdFx0aWYoIHBhcmVudEZ1bmN0aW9uID09PSB1bmRlZmluZWQgKSB7XG5cdFx0XHRcdFx0dGhyb3cgJ05vIGdldHRlciBkZWZpbmVkIGluIHBhcmVudCc7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiggaXNTZXR0ZXIgfHwgaXNHZXR0ZXIgKSB7XG5cdFx0XHRcdHRocm93ICdJbmNvcnJlY3QgYW1vdW50IG9mIGFyZ3VtZW50cyBzZW50IHRvIGdldHRlciBvciBzZXR0ZXInO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIHBhcmVudEZ1bmN0aW9uID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKCB0aGlzLnBhcmVudC5jYWxsZXIuJCRvd25lciApWyBjYWxsZXJOYW1lIF07XHRcblxuXHRcdFx0XHRpZiggcGFyZW50RnVuY3Rpb24gPT09IHVuZGVmaW5lZCApIHtcblx0XHRcdFx0XHR0aHJvdyAnTm8gcGFyZW50IGZ1bmN0aW9uIGRlZmluZWQgZm9yICcgKyBjYWxsZXJOYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93ICdZb3UgY2Fubm90IGNhbGwgcGFyZW50IGhlcmUnO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBwYXJlbnRGdW5jdGlvbi5hcHBseSggdGhpcywgYXJndW1lbnRzICk7XG59OyJdfQ==
;