/**
 * @module kami
 */

var Class = require('jsOOP').Class;
var Signal = require('signals');

var Texture = new Class({

	id: null,
	target: null,
	width: 0,
	height: 0,
	wrap: null,
	filter: null,


	//TODO: Get rid of provider stuff since it is better for AssetManager to handle it.
	 /** A data provider is a function which is called by Texture
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
	 *     	   var img = new Image();
	 *         img.onload = function() {
	 *    	       texture.uploadImage(img);
	 *         }.bind(this);
	 *         img.src = path;
	 *     };
	 *
	 *     //loads the image asynchronously
	 *     var tex = new Texture(context, ImageProvider, "myimg.png");
	 */

	/**
	 * Creates a new texture with the optional data provider.
	 *
	 * Note that a texture will not be renderable until some data has been uploaded to it.
	 * To get around this, you can upload a very small null buffer to the uploadData function,
	 * until your async load is complete. Or you can use a higher level provider that manages
	 * multiple assets and dispatches a signal once all textures are renderable.
	 *
	 * @class  Texture
	 * @param  {WebGLContext} gl the WebGL context
	 * @param  {Function} provider [description]
	 * @param  {[type]} args     [description]
	 * @return {[type]}          [description]
	 */
	initialize: function(context) {
		if (!context)
			throw "GL context not specified";
		this.context = context;
		this.created = new Signal();

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

		//This is maanged by WebGLContext
		this.context.addManagedObject(this);
		this.create();
	},

	//called after the context has been re-initialized
	create: function() {
		this.gl = this.context.gl; 
		var gl = this.gl;

		this.id = gl.createTexture(); //texture ID is recreated
		this.width = this.height = 0; //size is reset to zero until loaded
		this.target = gl.TEXTURE_2D;  //the provider can change this if necessary (e.g. cube maps)

		this.bind();

	 	//TODO: investigate this further
	 	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

	 	//setup wrap modes without binding redundantly
	 	this.setWrap(this.wrapS, this.wrapT, false);
	 	this.setFilter(this.minFilter, this.magFilter, false);
	 	
		//load the data
		if (this.provider) {
			this.provider.apply(this, this.providerArgs);
		}
	},


	destroy: function() {
		if (this.id && this.gl)
			this.gl.deleteTexture(this.id);
		if (this.context)
			this.context.removeManagedObject(this);
		this.width = this.height = 0;
		this.id = null;
		this.provider = null; 
		this.providerArgs = null;
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
	},

	toString: function() {
		return this.id + ":" + this.width + "x" + this.height + "";
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
		if (onLoad && typeof onLoad === "function")
			onLoad.call(texture, texture);
	};
	
	img.onerror = function() {
		if (onErr && typeof onErr === "function") 
			onErr.call(texture, texture);
	};

	img.onabort = function() {
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