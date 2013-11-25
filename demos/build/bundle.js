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
 * An abstract batcher composed of quads (two tris, indexed). 
 *
 * This is used internally; users should look at 
 * {{#crossLink "SpriteBatch"}}{{/crossLink}} instead.
 * 
 * The batcher itself is not managed by WebGLContext; however, it makes
 * use of Mesh and Texture which will be managed. For this reason, the batcher
 * does not hold a direct reference to the GL state.
 *
 * Subclasses must implement the following:  
 * {{#crossLink "AbstractBatch/_createShader:method"}}{{/crossLink}}  
 * {{#crossLink "AbstractBatch/_createVertexAttributes:method"}}{{/crossLink}}  
 * {{#crossLink "AbstractBatch/getVertexSize:method"}}{{/crossLink}}  
 * 
 * @class  AbstractBatch
 * @constructor
 * @param {WebGLContext} context the context this batcher belongs to
 * @param {Number} size the optional size of this batch, i.e. max number of quads
 * @default  500
 */
var AbstractBatch = new Class({

	//Constructor
	initialize: function AbstractBatch(context, size) {
		if (!context)
			throw "GL context not specified";
		this.context = context;

		this.size = size || 500;
		
		// 65535 is max index, so 65535 / 6 = 10922.
		if (this.size > 10922)  //(you'd have to be insane to try and batch this much with WebGL)
			throw "Can't have more than 10922 sprites per batch: " + this.size;
				
		//TODO: support defaultShader/customShader 
		this.shader = this._createShader();

		//TODO: make these public
		this._blendSrc = this.context.gl.ONE;
		this._blendDst = this.context.gl.ONE_MINUS_SRC_ALPHA
		this._blendEnabled = true;

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
		 * @property premultiplyColor
		 * @type {Boolean}
		 * @default  true
		 */
		this.premultiplied = true;
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
			r = g = b = a = arguments[0];
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
	 * subclasses of AbstractBatch.
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
	 * subclasses of AbstractBatch.
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
	 * subclasses of AbstractBatch.
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

	/**
	 * Destroys the batch, deleting its buffers and removing it from the
	 * WebGLContext management. Trying to use this
	 * batch after destroying it can lead to unpredictable behaviour.
	 *
	 * @method destroy
	 */
	destroy: function() {
		this.vertices = [];
		this.indices = [];
		this.size = this.maxVertices = 0;

		this.mesh.destroy();
	}
});

module.exports = AbstractBatch;

},{"./glutils/Mesh":6,"klasse":10,"number-util":11}],2:[function(require,module,exports){
/**
 * @module kami
 */

var Class = require('klasse');
var Signal = require('signals');

/**
 * This is a utility which makes asset loading cleaner
 * and simpler, especially with regard to asynchronous image
 * loading and WebGL context loss.
 *
 *
 * Basic usage looks like this:
 *
 *     //Create an asset manager 
 *     var assets = new AssetManager(context);
 *  
 *     //image types will return a new Texture
 *     var tex0 = assets.load("img/grass.png");
 *     var tex1 = assets.load("img/scene.png");
 *
 *     ... inside game loop ...
 *
 *         if (assets.update()) {
 *             // all assets are loaded, we can render.
 *         } else {
 *             // not all assets are loaded. we need
 *             // to show our preloader.
 *         }
 *
 * Currently this class only supports image loading,
 * although in the future others could be added for 
 * compressed textures, sprite sheets, and so forth.
 *
 * Creating a new asset manager will listen for context
 * loss events on the given WebGLContext. When this happens,
 * all assets will be invalidated and added to the loading queue.
 * As such, update() will return false until the assets have been
 * re-loaded.
 * 
 * @class  AssetManager
 * @constructor 	
 * @param {WebGLContext} context the WebGLContext for this manager
 */
var AssetManager = new Class({
	

	/**
	 * A read-only property that describes the number of 
	 * assets remaining to be loaded.
	 *
	 * @attribute remaining
	 * @type {Number}
	 * @readOnly
	 */
	remaining: {
		get: function() {
			return this.__totalItems - this.__loadCount;
		}
	},

	/**
	 * A read-only property that descriibes the total
	 * number of assets in this AssetManager.
	 *
	 * @attribute total
	 * @readOnly
	 * @type {Number}
	 */
	total: {
		get: function() {
			return this.__totalItems;
		}
	},

	//Constructor
	initialize: function AssetManager(context) {
		if (!context)
			throw "no context defined for AssetManager";

		/**
		 * An array of assets that this AssetManager is handling.
		 * This should not be modified directly.
		 * 
		 * @property assets
		 * @type {Array}
		 */
		this.assets = [];

		/**
		 * The queue of tasks to load. Each contains
		 * an
		 * {{#crossLink "AssetManager.Descriptor"}}{{/crossLink}}.
		 *
		 * Loading a task will pop it off this list and fire the async
		 * or synchronous process.
		 *
		 * This should not be modified directly.
		 *
		 * @property tasks
		 * @protected
		 * @type {Array}
		 */
		this.tasks = [];

		//Private stuff... do not touch!

		this.__loadCount = 0;
		this.__totalItems = 0;
		this.__loadCallbackFunc = null;
		this.__invalidateFunc = null;

		// Signals 
		
		/**
		 * A signal dispatched when loading first begins, 
		 * i.e. when update() is called and the loading queue is the
		 * same size as the total asset list.
		 *
		 * @event loadStarted
		 * @type {Signal}
		 */
		this.loadStarted = new Signal();

		/**
		 * A signal dispatched when all assets have been loaded
		 * (i.e. their async tasks finished).
		 *
		 * @event loadFinished
		 * @type {Signal}
		 */
		this.loadFinished = new Signal();

		/**
		 * A signal dispatched on progress updates, once an asset
		 * has been loaded in full (i.e. its async task finished).
		 *
		 * This passes three arguments to the listener function:
		 * 
		 * - `current` number of assets that have been loaded
		 * - `total` number of assets to loaded
		 * - `name` of the asset which was just loaded
		 *  
		 * @event loadProgress
		 * @type {[type]}
		 */
		this.loadProgress = new Signal();

		/**
		 * A signal dispatched on problematic load; e.g. if
		 * the image was not found and "onerror" was triggered. 
		 * The first argument passed to the listener will be 
		 * the string name of the asset.
		 *
		 * The asset manager will continue loading subsequent assets.
		 *
		 * This is dispatched after the status of the asset is
		 * set to Status.LOAD_FAIL, and before the loadProgress
		 * signal is dispatched.
		 *
		 * @event loadError
		 * @type {Signal}
		 */
		this.loadError = new Signal();

		this.loaders = {};

		this.__invalidateFunc = this.invalidate.bind(this);
		this.__loadCallbackFunc = this.__loadCallback.bind(this);

		this.context = context;
		this.context.lost.add(this.__invalidateFunc);
	},

	/**
	 * Destroys this asset manager; removing its listeners
	 * with WebGLContext and deleting the assets array.
	 *
	 * @method  destroy
	 */
	destroy: function() {
		this.assets = [];
		this.tasks = [];
		this.__loadCount = this.__totalItems = 0;
		this.context.lost.remove(this.__invalidateFunc);
	},

	/**
	 * Called to invalidate the asset manager
	 * and require all assets to be re-loaded.
	 * This is called internally on context loss.
	 *
	 * @protected
	 * @method invalidate
	 */
	invalidate: function() {
		//mark all as not yet loaded
		for (var i=0; i<this.assets.length; i++) 
			this.assets[i].loaded = false;

		//copy our assets to a queue which can be popped
		this.tasks = this.assets.slice();

		this.__loadCount = this.__totalItems = this.tasks.length;
	},

	/**
	 * Pushes an asset onto this stack. This
	 * attempts to detect the loader for you based
	 * on the asset name's file extension. If the
	 * asset name doesn't have a known file extension,
	 * or if there is no loader registered for that filename,
	 * this method throws an error. 
	 *
	 * The first argument is the asset name. Any subsequent
	 * arguments will be passed along to the loader for further
	 * processing.
	 *
	 * The return value of this method is determined by
	 * the loader's processArguments method. For example, the
	 * default Image loader returns a Texture object.
	 *
	 * @method  load
	 * @param  {String} name the asset name
	 * @param {any} args a variable number of optional arguments
	 * @return {any} returns the best type for this asset's loader
	 */
	load: function(name) {
		var ext = this.__extension(name);
		if (!ext) 
			throw "Asset name does not have a file extension: " + name;
		if (!AssetManager.loaders.hasOwnProperty(ext))
			throw "No known loader for extension "+ext+" in asset "+name;

		var args = [ name, AssetManager.loaders[ext] ];
		args = args.concat( Array.prototype.slice.call(arguments, 1) );

		return this.loadAs.apply(this, args);
	},

	__extension: function(str) {
		var idx = str.lastIndexOf('.');
		if (idx === -1 || idx === 0 || idx === str.length-1) // does not have a clear file extension
			return "";
		return str.substring(idx+1).toLowerCase();
	},

	/**
	 * Pushes an asset onto this stack. This allows you to
	 * specify a loader function for the asset. This is useful
	 * if you wish to use generic names for your assets (instead of
	 * filenames), or if you want a particular asset to use a specific
	 * loader. 
	 *
	 * Like with {{#crossLink "AssetManager/load:method"}}{{/crossLink}},
	 * the first argument is the asset name. The second argument is the loader
	 * to use for this asset. Any subsequent
	 * arguments will be passed along to the loader for further
	 * processing.
	 *
	 * The return value of this method is determined by
	 * the loader's processArguments method. For example, the
	 * default Image loader returns a Texture object.
	 *
	 * @method  load
	 * @param {String} name the asset name
	 * @param {Fucntion} loader the loader function
	 * @param {Object ...} args a variable number of optional arguments
	 * @return {any} returns the best type for this asset's loader
	 */
	loadAs: function(name, loader) {
		if (!name)
			throw "no name specified to load";
		if (!loader)
			throw "no loader specified for asset "+name;

		var idx = this.__indexOf(this.assets, name);
		if (idx !== -1) //TODO: eventually add support for dependencies and shared assets
			throw "asset already defined in asset manager";

		//grab any additional arguments
		var params = Array.prototype.slice.call(arguments, 2);

		var desc = new AssetManager.Descriptor(name, loader, params);

		//keep hold of this asset
		this.assets.push(desc);

		//also add it to our queue of current tasks
		this.tasks.push(desc);
		this.__loadCount++;
		this.__totalItems++;


		//if we can process the arguments and get a return value...
		if (loader.processArguments) {
			return loader.processArguments.call(this, name, params);
		} else
			return null;
	},

	__indexOf: function(list, name) {
		for (var i=0; i<list.length; i++) {
			if (list[i].name === name)
				return i;
		}
		return -1;
	},

	__loadCallback: function(name, success) {
		if (arguments.length < 2) //some helpful debug information if you're writing a Loader
			throw "Loader passed invalid arguments to finished() callback;"
					+" must include name and success flag";

		this.__loadCount--;

		var assetIdx = this.__indexOf(this.assets, name);
		if (assetIdx !== -1) {
			this.assets[assetIdx].status = success 
						? AssetManager.Status.LOAD_SUCCESS
						: AssetManager.Status.LOAD_FAILED;
			if (!success) {
				this.loadError.dispatch(name);
			}
		}

		this.loadProgress.dispatch( (this.__totalItems - this.__loadCount), 
									this.__totalItems,
									name);
			
		if (this.__loadCount === 0) {
			this.loadFinished.dispatch();
		}
	},

	// TODO....
	// isLoaded: function(name) {
	// 	var assetIdx = this.__indexOf(this.assets, name);
	// 	return assetIdx !== -1 ? this.assets[assetIdx].loaded : false;
	// },

	/**
	 * Updates this AssetManager by loading the next asset in the queue.
	 * If all assets have been loaded, this method returns true, otherwise
	 * it will return false.
	 *
	 * @method  update
	 * @return {Boolean} whether this asset manager has finished loading
	 */
	update: function() {
		if (!this.context.valid)
			return false;

		if (this.tasks.length === 0)
			return (this.__loadCount === 0);

		//If we still haven't popped any from the assets list...
		if (this.tasks.length === this.assets.length) {
			this.loadStarted.dispatch();
		}

		//grab the next task on the stack
		var nextTask = this.tasks.shift();

		//apply the loading step
		var loader = nextTask.loader;

		var cb = this.__loadCallbackFunc;

		var newParams = [ nextTask.name, cb ].concat(nextTask.params);
		loader.loadAsset.apply(this, newParams);

		return (this.__loadCount === 0);
	}
});

/**
 * A set of loader plugins for this asset manager. These might be as simple
 * as pushing HTML Image objects into a Texture, or more complex like decoding
 * a compressed, mip-mapped, or cube-map texture.
 *
 * This object is a simple hashmap of lower-case extension names to Loader functions.
 * 
 * @property loaders
 * @static
 * @type {Object}
 */
AssetManager.loaders = {};

/**
 * Registers a loader function with the given extension(s).
 * The first parameter is a loader function, and all subsequent
 * parameters are lower-case extensions (without the period) that
 * should be associated with that loader. This will override other
 * loaders by the same extension.
 *
 * By default, the extensions "png", "jpg", "jpeg", and "gif" are
 * registered to {{#crossLink "AssetManager/ImageLoader:attribute"}}{{/crossLink}}.
 * 
 * @method registerLoader
 * @static
 * @param {Function} loaderFunc the loader function
 * @param {String ...} extensions a variable number of strings
 */
AssetManager.registerLoader = function(loaderFunc, extensions) {
	if (arguments.length===0)
		throw "must specify at least one extension for the loader";
	var exts = Array.prototype.slice.call(arguments, 1);
	for (var i=0; i<exts.length; i++) 
		AssetManager.loaders[ exts[i] ] = loaderFunc;
};

/**
 * A simple wrapper for assets which will be passed along to the loader;
 * this is used internally.
 * 
 * //@class AssetManager.Descriptor
 */
AssetManager.Descriptor = new Class({

	name: null,
	loader: null,
	params: null,
	status: null,

	initialize: function(name, loader, params) {
		this.name = name;
		this.loader = loader;
		this.params = params;
		this.status = AssetManager.Status.QUEUED;
	}
});

//TODO: document this
/**
 * Defines the status of an asset in the manager queue.
 * @type {Object}
 */
AssetManager.Status = {
	QUEUED: 0,
	LOADING: 1,
	LOAD_SUCCESS: 2,
	LOAD_FAIL: 3
};


//TODO: use a base loader class; pull these out into their own files ?

/**
 * This is the default implementation of an image loader plugin for AssetManager.
 * This uses a DOM Image object to upload PNG, GIF and JPG images to a WebGL
 * texture. You will not need to deal with this class directly, unless you want
 * to write your own AssetManager loaders.
 *
 * A `Loader` type for AssetManager is simply an object which defines two methods:
 *
 * - `loadAsset`: this is the loading function, which handles the asynchronous load.
 * - `processArguments`: this is for the user's convenience, handling default arguments
 * and giving a meaningful return value. 
 * 
 * @class AssetManager.ImageLoader
 */
AssetManager.ImageLoader = {
	
	/**
	 * This is a "loader function" which handles the asynchronous
	 * loading for an asset. The function must be implemented in a very
	 * strict manner for the asset manager to work correctly.
	 *
	 * The first parameter passed to this function is the name of the
	 * asset being loaded. The second parameter is a callback that must
	 * be invoked after the async task is completed.
	 * Any subsequent parameters are those that came from the inital call
	 * to {{#crossLink "AssetManager/load:method"}}AssetManager.load{{/crossLink}}. 
	 *
	 * Once the synchronous or asynchronous loading task is completed, the
	 * `finished` callback must be invoked with two parameters: first, the
	 * `name` of the asset as passed to this loader. And second, a boolean indicating
	 * the `success` of the load operation. 
	 *
	 * If you don't invoke the callback, the asset manager may never finish loading.
	 * 
	 * @method loadAsset
	 * @static
	 * @param  {String} name the name of the asset to load
	 * @param {Function} finished the function to call when async loading is complete
	 * @param {Texture} texture the texture to operate on for this asset
	 * @param {String} path the optional image path to use instead of the `name` parameter
	 */
	loadAsset: function(name, finished, texture, path) {
		if (!texture) {
			throw "no texture object specified to the ImageLoader for asset manager";
		}

		//if path is undefined, use the asset name and 
		//assume its a path.
		path = path || name;

		var img = new Image();

		img.onload = function() {
			img.onerror = img.onabort = null; //clear other listeners
			texture.uploadImage(img);
			finished(name, true);
		};
		img.onerror = function() {
			img.onload = img.onabort = null;
			console.warn("Error loading image: "+path);
			//We use null data to avoid WebGL errors
			//TODO: handle fail more smoothly, i.e. with a callback
			//TODO: Should this be pure black, or purely transparent?
			texture.uploadData(1, 1); 
			finished(name, false);
		};
		img.onabort = function() {
			img.onload = img.onerror = null;
			console.warn("Aborted image: "+path);
			//We use null data to avoid WebGL errors
			texture.uploadData(1, 1);
			finished(name, false);
		};

		//setup source
		img.src = path;
	},

	/**
	 * This method is called from 
	 * {{#crossLink "AssetManager/load:method"}}AssetManager.load{{/crossLink}} to
	 * process the arguments and setup any default values. This is also responsible for
	 * determining the appropriate return value for the load function. In the case of
	 * `ImageLoader`, we return the Texture that was passed to the load() function, or
	 * a new Texture object if none was given. This way, the user can write code like this:
	 *
	 *       var texture = assetManager.load("img.png"); //returns new Texture
	 *
	 * The first argument is the name of the asset being processed. The second argument
	 * is an array of arguments that will be passed to the loader function.
	 * 
	 * The method is called bound to the AssetManager, so we can access WebGLContext
	 * with "this.context".
	 *
	 * @method  processArguments
	 * @static
	 * @param  {String} name the asset name
	 * @param  {Array} params an array of parameters that will be used to load the asset
	 * @return {any} the object the user may expect from the loader, in this case a Texture object
	 */
	processArguments: function(name, params) {
		//the first parameter is a texture... if not specified, we need to assign it a new object
		if (params.length === 0 || !params[0])
			return (params[0] = new Texture(this.context));
		else
			return params[0];
	}
};

	


// Register our default loaders...

AssetManager.registerLoader(AssetManager.ImageLoader, "png", "gif", "jpg", "jpeg");

module.exports = AssetManager;

},{"klasse":10,"signals":"vsGaoX"}],3:[function(require,module,exports){
/**
 * @module kami
 */

// Requires....
var Class         = require('klasse');

var AbstractBatch = require('./AbstractBatch');

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
 * @extends AbstractBatch
 * @constructor
 * @param {WebGLContext} context the context for this batch
 * @param {Number} size the max number of sprites to fit in a single batch
 */
var SpriteBatch = new Class({

	Extends: AbstractBatch,

	//Constructor
	initialize: function SpriteBatch(context, size) {
		AbstractBatch.call(this, context, size);

		/**
		 * SpriteBatch uploads a vec2 for projection
		 * transform in the shader. A custom shader might
		 * use a matrix or some other means of calculating 
		 * projection; in which case this should be set to false.
		 * 
		 * @property useProjectionVector
		 * @type {Boolean}
		 * @default  true
		 */
		this.useProjectionVector = true;

		/**
		 * The projection Float32Array vec2 which is
		 * used to avoid some matrix calculations. A 3D 
		 * batcher might want to replace this and 
		 * {{#crossLink "SpriteBatch/setProjection:method"}}{{/crossLink}} 
		 * entirely. 
		 *
		 * @property projection
		 * @type {Float32Array}
		 */
		this.projection = new Float32Array(2);

		/**
		 * The currently bound texture. Do not modify.
		 * 
		 * @property {Texture} texture
		 * @readOnly
		 */
		this.texture = null;
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
		//an extension of SpriteBatch might want to support full transform &
		//projection matrices for 3D billboards. if so, override this method
		if (this.useProjectionVector)
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
		
		//just do direct parent call for speed here
		//This binds the shader and mesh!
		AbstractBatch.prototype.begin.call(this);

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
		AbstractBatch.prototype.end.call(this);

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
		AbstractBatch.prototype.flush.call(this);
		SpriteBatch.totalRenderCalls++;
	},

	/**
	 * Adds a sprite to this batch. The sprite is drawn in 
	 * screen-space with the origin at the upper-left corner (y-down).
	 *
	 * @method draw
	 * @param  {Texture} texture the texture for this sprite
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
	 * @param {Texture} texture the texture we are drawing for this sprite
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

},{"./AbstractBatch":1,"./glutils/Mesh":6,"./glutils/ShaderProgram":7,"klasse":10}],4:[function(require,module,exports){
/**
 * @module kami
 */

var Class = require('klasse');
var Signal = require('signals');

var Texture = new Class({


	/**
	 * Creates a new texture with the optional width, height, and data.
	 *
	 * If the constructor is passed no parameters other than WebGLContext, then
	 * it will not be initialized and will be non-renderable. You will need to manually
	 * uploadData or uploadImage yourself.
	 *
	 * If you pass a width and height, the texture will be initialized with that size
	 * and null data (e.g. transparent black). If you also pass the format and data, 
	 * it will be uploaded to the texture. 
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
	 * @class  Texture
	 * @constructor
	 * @param  {WebGLContext} context the WebGL context
	 * @param  {Number} width the width of this texture
	 * @param  {Number} height the height of this texture
	 * @param  {GLenum} format e.g. Texture.Format.RGBA
	 * @param  {GLenum} dataType e.g. Texture.DataType.UNSIGNED_BYTE (Uint8Array)
	 * @param  {GLenum} data the array buffer, e.g. a Uint8Array view
	 */
	initialize: function Texture(context, width, height, format, dataType, data) {
		if (!context)
			throw "GL context not specified";
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
		this.width = 0; //initialized in create()

		/**
		 * The height of this texture, in pixels.
		 * 
		 * @property height
		 * @readOnly
		 * @type {Number} the height
		 */
		this.height = 0; //initialized in create()

		// e.g. --> new Texture(gl, 256, 256, gl.RGB, gl.UNSIGNED_BYTE, data);
		//		      creates a new empty texture, 256x256
		//		--> new Texture(gl);
		//			  creates a new texture but WITHOUT uploading any data. 

		this.wrapS = Texture.DEFAULT_WRAP;
		this.wrapT = Texture.DEFAULT_WRAP;
		this.minFilter = Texture.DEFAULT_FILTER;
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
		 * @type {Array} the array of arguments, shifted to exclude the WebGLContext parameter
		 */
		this.managedArgs = Array.prototype.slice.call(arguments, 1);

		//This is maanged by WebGLContext
		this.context.addManagedObject(this);
		this.create();
	},

	/**
	 * Called in the Texture constructor, and after the GL context has been re-initialized. 
	 * Subclasses can override this to provide a custom data upload, e.g. cubemaps or compressed
	 * textures.
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
			this.uploadData.apply(this, this.managedArgs);
		}
	},

	/**
	 * Destroys this texture by deleting the GL resource,
	 * removing it from the WebGLContext management stack,
	 * setting its size to zero, and id and managed arguments to null.
	 * 
	 * Generally a destroyed texture is no longer usable.
	 */
	destroy: function() {
		if (this.id && this.gl)
			this.gl.deleteTexture(this.id);
		if (this.context)
			this.context.removeManagedObject(this);
		this.width = this.height = 0;
		this.id = null;
		this.managedArgs = null;
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
	 * @method  uploadData
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
	 * @method  uploadImage
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
},{"klasse":10,"signals":"vsGaoX"}],5:[function(require,module,exports){
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
		 * (and not yet restored) is invalid.
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

	_contextLost: function(ev) {
		//all textures/shaders/buffers/FBOs have been deleted... 
		//we need to re-create them on restore
		this.valid = false;

		this.lost.dispatch(this);
	},

	_contextRestored: function(ev) {
		//If an asset manager is attached to this
		//context, we need to invalidate it and re-load 
		//the assets.
		if (this.assetManager) {
			this.assetManager.invalidate();
		}

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
},{"klasse":10,"signals":"vsGaoX"}],6:[function(require,module,exports){
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
		if (!context)
			throw "GL context not specified";
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
		if (this.vertexBuffer)
			this.gl.deleteBuffer(this.vertexBuffer);
		if (this.indexBuffer)
			this.gl.deleteBuffer(this.indexBuffer);
		this.vertexBuffer = null;
		this.indexBuffer = null;
		if (this.context)
			this.context.removeManagedObject(this);
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
},{"klasse":10}],7:[function(require,module,exports){
/**
 * @module kami
 */

var Class = require('klasse');

var ShaderProgram = new Class({
	
	initialize: function ShaderProgram(context, vertSource, fragSource, attributeLocations) {
		if (!vertSource || !fragSource)
			throw "vertex and fragment shaders must be defined";
		if (!context)
			throw "no GL context specified";
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
	},

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
	
	/**
	 * A convenience method to set uniformNfv from the given ArrayBuffer.
	 * We determine which GL call to make based on the length of the array 
	 * buffer. 
	 * 	
	 * @param {String} name        		the name of the uniform
	 * @param {ArrayBuffer} arrayBuffer the array buffer
	 */
	setUniformfv: function(name, arrayBuffer) {
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (!loc) 
			return false;
		switch (arrayBuffer.length) {
			case 1: gl.uniform1fv(loc, arrayBuffer); return true;
			case 2: gl.uniform2fv(loc, arrayBuffer); return true;
			case 3: gl.uniform3fv(loc, arrayBuffer); return true;
			case 4: gl.uniform4fv(loc, arrayBuffer); return true;
			default:
				throw "invalid arguments to setUniformf"; 
		}
	},

	/**
	 * A convenience method to set uniformNfv from the given ArrayBuffer.
	 * We determine which GL call to make based on the length of the array 
	 * buffer. 
	 * 	
	 * @param {String} name        		the name of the uniform
	 * @param {ArrayBuffer} arrayBuffer the array buffer
	 */
	setUniformiv: function(name, arrayBuffer) {
		var gl = this.gl;
		var loc = this.getUniformLocation(name);
		if (!loc) 
			return false;
		switch (arrayBuffer.length) {
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
},{"klasse":10}],"kami":[function(require,module,exports){
module.exports=require('7Kjm00');
},{}],"7Kjm00":[function(require,module,exports){
/**
  Auto-generated Kami index file.
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
    'ShaderProgram':   require('./glutils/ShaderProgram.js')
};
},{"./AbstractBatch.js":1,"./AssetManager.js":2,"./SpriteBatch.js":3,"./Texture.js":4,"./WebGLContext.js":5,"./glutils/Mesh.js":6,"./glutils/ShaderProgram.js":7}],10:[function(require,module,exports){
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
},{}],11:[function(require,module,exports){
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

module.exports = NumberUtil;
},{}],"signals":[function(require,module,exports){
module.exports=require('vsGaoX');
},{}],"vsGaoX":[function(require,module,exports){
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

},{}]},{},["7Kjm00"])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pL2xpYi9BYnN0cmFjdEJhdGNoLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvQXNzZXRNYW5hZ2VyLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvU3ByaXRlQmF0Y2guanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL2xpYi9UZXh0dXJlLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvV2ViR0xDb250ZXh0LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvZ2x1dGlscy9NZXNoLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvZ2x1dGlscy9TaGFkZXJQcm9ncmFtLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvaW5kZXguanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rbGFzc2UvaW5kZXguanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9udW1iZXItdXRpbC9pbmRleC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL3NpZ25hbHMvZGlzdC9zaWduYWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0akJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL2NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Y0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDaFdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3JFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBUaGUgY29yZSBrYW1pIG1vZHVsZSBwcm92aWRlcyBiYXNpYyAyRCBzcHJpdGUgYmF0Y2hpbmcgYW5kIFxuICogYXNzZXQgbWFuYWdlbWVudC5cbiAqIFxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgTWVzaCA9IHJlcXVpcmUoJy4vZ2x1dGlscy9NZXNoJyk7XG5cbnZhciBjb2xvclRvRmxvYXQgPSByZXF1aXJlKCdudW1iZXItdXRpbCcpLmNvbG9yVG9GbG9hdDtcblxuLyoqXG4gKiBBbiBhYnN0cmFjdCBiYXRjaGVyIGNvbXBvc2VkIG9mIHF1YWRzICh0d28gdHJpcywgaW5kZXhlZCkuIFxuICpcbiAqIFRoaXMgaXMgdXNlZCBpbnRlcm5hbGx5OyB1c2VycyBzaG91bGQgbG9vayBhdCBcbiAqIHt7I2Nyb3NzTGluayBcIlNwcml0ZUJhdGNoXCJ9fXt7L2Nyb3NzTGlua319IGluc3RlYWQuXG4gKiBcbiAqIFRoZSBiYXRjaGVyIGl0c2VsZiBpcyBub3QgbWFuYWdlZCBieSBXZWJHTENvbnRleHQ7IGhvd2V2ZXIsIGl0IG1ha2VzXG4gKiB1c2Ugb2YgTWVzaCBhbmQgVGV4dHVyZSB3aGljaCB3aWxsIGJlIG1hbmFnZWQuIEZvciB0aGlzIHJlYXNvbiwgdGhlIGJhdGNoZXJcbiAqIGRvZXMgbm90IGhvbGQgYSBkaXJlY3QgcmVmZXJlbmNlIHRvIHRoZSBHTCBzdGF0ZS5cbiAqXG4gKiBTdWJjbGFzc2VzIG11c3QgaW1wbGVtZW50IHRoZSBmb2xsb3dpbmc6ICBcbiAqIHt7I2Nyb3NzTGluayBcIkFic3RyYWN0QmF0Y2gvX2NyZWF0ZVNoYWRlcjptZXRob2RcIn19e3svY3Jvc3NMaW5rfX0gIFxuICoge3sjY3Jvc3NMaW5rIFwiQWJzdHJhY3RCYXRjaC9fY3JlYXRlVmVydGV4QXR0cmlidXRlczptZXRob2RcIn19e3svY3Jvc3NMaW5rfX0gIFxuICoge3sjY3Jvc3NMaW5rIFwiQWJzdHJhY3RCYXRjaC9nZXRWZXJ0ZXhTaXplOm1ldGhvZFwifX17ey9jcm9zc0xpbmt9fSAgXG4gKiBcbiAqIEBjbGFzcyAgQWJzdHJhY3RCYXRjaFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge1dlYkdMQ29udGV4dH0gY29udGV4dCB0aGUgY29udGV4dCB0aGlzIGJhdGNoZXIgYmVsb25ncyB0b1xuICogQHBhcmFtIHtOdW1iZXJ9IHNpemUgdGhlIG9wdGlvbmFsIHNpemUgb2YgdGhpcyBiYXRjaCwgaS5lLiBtYXggbnVtYmVyIG9mIHF1YWRzXG4gKiBAZGVmYXVsdCAgNTAwXG4gKi9cbnZhciBBYnN0cmFjdEJhdGNoID0gbmV3IENsYXNzKHtcblxuXHQvL0NvbnN0cnVjdG9yXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIEFic3RyYWN0QmF0Y2goY29udGV4dCwgc2l6ZSkge1xuXHRcdGlmICghY29udGV4dClcblx0XHRcdHRocm93IFwiR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkXCI7XG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblxuXHRcdHRoaXMuc2l6ZSA9IHNpemUgfHwgNTAwO1xuXHRcdFxuXHRcdC8vIDY1NTM1IGlzIG1heCBpbmRleCwgc28gNjU1MzUgLyA2ID0gMTA5MjIuXG5cdFx0aWYgKHRoaXMuc2l6ZSA+IDEwOTIyKSAgLy8oeW91J2QgaGF2ZSB0byBiZSBpbnNhbmUgdG8gdHJ5IGFuZCBiYXRjaCB0aGlzIG11Y2ggd2l0aCBXZWJHTClcblx0XHRcdHRocm93IFwiQ2FuJ3QgaGF2ZSBtb3JlIHRoYW4gMTA5MjIgc3ByaXRlcyBwZXIgYmF0Y2g6IFwiICsgdGhpcy5zaXplO1xuXHRcdFx0XHRcblx0XHQvL1RPRE86IHN1cHBvcnQgZGVmYXVsdFNoYWRlci9jdXN0b21TaGFkZXIgXG5cdFx0dGhpcy5zaGFkZXIgPSB0aGlzLl9jcmVhdGVTaGFkZXIoKTtcblxuXHRcdC8vVE9ETzogbWFrZSB0aGVzZSBwdWJsaWNcblx0XHR0aGlzLl9ibGVuZFNyYyA9IHRoaXMuY29udGV4dC5nbC5PTkU7XG5cdFx0dGhpcy5fYmxlbmREc3QgPSB0aGlzLmNvbnRleHQuZ2wuT05FX01JTlVTX1NSQ19BTFBIQVxuXHRcdHRoaXMuX2JsZW5kRW5hYmxlZCA9IHRydWU7XG5cblx0XHR0aGlzLmlkeCA9IDA7XG5cdFx0dGhpcy5kcmF3aW5nID0gZmFsc2U7XG5cblx0XHR0aGlzLm1lc2ggPSB0aGlzLl9jcmVhdGVNZXNoKHRoaXMuc2l6ZSk7XG5cblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBBQkdSIHBhY2tlZCBjb2xvciwgYXMgYSBzaW5nbGUgZmxvYXQuIFRoZSBkZWZhdWx0XG5cdFx0ICogdmFsdWUgaXMgdGhlIGNvbG9yIHdoaXRlICgyNTUsIDI1NSwgMjU1LCAyNTUpLlxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IHtOdW1iZXJ9IGNvbG9yXG5cdFx0ICogQHJlYWRPbmx5IFxuXHRcdCAqL1xuXHRcdHRoaXMuY29sb3IgPSBjb2xvclRvRmxvYXQoMjU1LCAyNTUsIDI1NSwgMjU1KTtcblx0XHRcblx0XHQvKipcblx0XHQgKiBXaGV0aGVyIHRvIHByZW11bHRpcGx5IGFscGhhIG9uIGNhbGxzIHRvIHNldENvbG9yLiBcblx0XHQgKiBUaGlzIGlzIHRydWUgYnkgZGVmYXVsdCwgc28gdGhhdCB3ZSBjYW4gY29udmVuaWVudGx5IHdyaXRlOlxuXHRcdCAqXG5cdFx0ICogICAgIGJhdGNoLnNldENvbG9yKDEsIDAsIDAsIDAuMjUpOyAvL3RpbnRzIHJlZCB3aXRoIDI1JSBvcGFjaXR5XG5cdFx0ICpcblx0XHQgKiBJZiBmYWxzZSwgeW91IG11c3QgcHJlbXVsdGlwbHkgdGhlIGNvbG9ycyB5b3Vyc2VsZiB0byBhY2hpZXZlXG5cdFx0ICogdGhlIHNhbWUgdGludCwgbGlrZSBzbzpcblx0XHQgKlxuXHRcdCAqICAgICBiYXRjaC5zZXRDb2xvcigwLjI1LCAwLCAwLCAwLjI1KTtcblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkgcHJlbXVsdGlwbHlDb2xvclxuXHRcdCAqIEB0eXBlIHtCb29sZWFufVxuXHRcdCAqIEBkZWZhdWx0ICB0cnVlXG5cdFx0ICovXG5cdFx0dGhpcy5wcmVtdWx0aXBsaWVkID0gdHJ1ZTtcblx0fSxcblxuXHQvKipcblx0ICogU2V0cyB0aGUgY29sb3Igb2YgdGhpcyBzcHJpdGUgYmF0Y2hlciwgd2hpY2ggaXMgdXNlZCBpbiBzdWJzZXF1ZW50IGRyYXdcblx0ICogY2FsbHMuIFRoaXMgZG9lcyBub3QgZmx1c2ggdGhlIGJhdGNoLlxuXHQgKlxuXHQgKiBJZiB0aHJlZSBvciBtb3JlIGFyZ3VtZW50cyBhcmUgc3BlY2lmaWVkLCB0aGlzIG1ldGhvZCBhc3N1bWVzIHRoYXQgUkdCIFxuXHQgKiBvciBSR0JBIGZsb2F0IHZhbHVlcyAoMC4wIHRvIDEuMCkgYXJlIGJlaW5nIHBhc3NlZC4gXG5cdCAqIFxuXHQgKiBJZiBsZXNzIHRoYW4gdGhyZWUgYXJndW1lbnRzIGFyZSBzcGVjaWZpZWQsIHdlIG9ubHkgY29uc2lkZXIgdGhlIGZpcnN0IFxuXHQgKiBhbmQgYXNzaWduIGl0IHRvIGFsbCBmb3VyIGNvbXBvbmVudHMgLS0gdGhpcyBpcyB1c2VmdWwgZm9yIHNldHRpbmcgdHJhbnNwYXJlbmN5IFxuXHQgKiBpbiBhIHByZW11bHRpcGxpZWQgYWxwaGEgc3RhZ2UuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHNldENvbG9yXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSByIHRoZSByZWQgY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBnIHRoZSBncmVlbiBjb21wb25lbnQsIG5vcm1hbGl6ZWRcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGIgdGhlIGJsdWUgY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBhIHRoZSBhbHBoYSBjb21wb25lbnQsIG5vcm1hbGl6ZWRcblx0ICovXG5cdHNldENvbG9yOiBmdW5jdGlvbihyLCBnLCBiLCBhKSB7XG5cdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gMykge1xuXHRcdFx0Ly9kZWZhdWx0IGFscGhhIHRvIG9uZSBcblx0XHRcdGEgPSAoYSB8fCBhID09PSAwKSA/IGEgOiAxLjA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHIgPSBnID0gYiA9IGEgPSBhcmd1bWVudHNbMF07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJlbXVsdGlwbGllZCkge1xuXHRcdFx0ciAqPSBhO1xuXHRcdFx0ZyAqPSBhO1xuXHRcdFx0YiAqPSBhO1xuXHRcdH1cblx0XHRcblx0XHR0aGlzLmNvbG9yID0gY29sb3JUb0Zsb2F0KFxuXHRcdFx0fn4ociAqIDI1NSksXG5cdFx0XHR+fihnICogMjU1KSxcblx0XHRcdH5+KGIgKiAyNTUpLFxuXHRcdFx0fn4oYSAqIDI1NSlcblx0XHQpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgZnJvbSB0aGUgY29uc3RydWN0b3IgdG8gY3JlYXRlIGEgbmV3IE1lc2ggXG5cdCAqIGJhc2VkIG9uIHRoZSBleHBlY3RlZCBiYXRjaCBzaXplLiBTaG91bGQgc2V0IHVwXG5cdCAqIHZlcnRzICYgaW5kaWNlcyBwcm9wZXJseS5cblx0ICpcblx0ICogVXNlcnMgc2hvdWxkIG5vdCBjYWxsIHRoaXMgZGlyZWN0bHk7IGluc3RlYWQsIGl0XG5cdCAqIHNob3VsZCBvbmx5IGJlIGltcGxlbWVudGVkIGJ5IHN1YmNsYXNzZXMuXG5cdCAqIFxuXHQgKiBAbWV0aG9kIF9jcmVhdGVNZXNoXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBzaXplIHRoZSBzaXplIHBhc3NlZCB0aHJvdWdoIHRoZSBjb25zdHJ1Y3RvclxuXHQgKi9cblx0X2NyZWF0ZU1lc2g6IGZ1bmN0aW9uKHNpemUpIHtcblx0XHQvL3RoZSB0b3RhbCBudW1iZXIgb2YgZmxvYXRzIGluIG91ciBiYXRjaFxuXHRcdHZhciBudW1WZXJ0cyA9IHNpemUgKiA0ICogdGhpcy5nZXRWZXJ0ZXhTaXplKCk7XG5cdFx0Ly90aGUgdG90YWwgbnVtYmVyIG9mIGluZGljZXMgaW4gb3VyIGJhdGNoXG5cdFx0dmFyIG51bUluZGljZXMgPSBzaXplICogNjtcblx0XHR2YXIgZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cblx0XHQvL3ZlcnRleCBkYXRhXG5cdFx0dGhpcy52ZXJ0aWNlcyA9IG5ldyBGbG9hdDMyQXJyYXkobnVtVmVydHMpO1xuXHRcdC8vaW5kZXggZGF0YVxuXHRcdHRoaXMuaW5kaWNlcyA9IG5ldyBVaW50MTZBcnJheShudW1JbmRpY2VzKTsgXG5cdFx0XG5cdFx0Zm9yICh2YXIgaT0wLCBqPTA7IGkgPCBudW1JbmRpY2VzOyBpICs9IDYsIGogKz0gNCkgXG5cdFx0e1xuXHRcdFx0dGhpcy5pbmRpY2VzW2kgKyAwXSA9IGogKyAwOyBcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgMV0gPSBqICsgMTtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgMl0gPSBqICsgMjtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgM10gPSBqICsgMDtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgNF0gPSBqICsgMjtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgNV0gPSBqICsgMztcblx0XHR9XG5cblx0XHR2YXIgbWVzaCA9IG5ldyBNZXNoKHRoaXMuY29udGV4dCwgZmFsc2UsIFxuXHRcdFx0XHRcdFx0bnVtVmVydHMsIG51bUluZGljZXMsIHRoaXMuX2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXMoKSk7XG5cdFx0bWVzaC52ZXJ0aWNlcyA9IHRoaXMudmVydGljZXM7XG5cdFx0bWVzaC5pbmRpY2VzID0gdGhpcy5pbmRpY2VzO1xuXHRcdG1lc2gudmVydGV4VXNhZ2UgPSBnbC5EWU5BTUlDX0RSQVc7XG5cdFx0bWVzaC5pbmRleFVzYWdlID0gZ2wuU1RBVElDX0RSQVc7XG5cdFx0bWVzaC5kaXJ0eSA9IHRydWU7XG5cdFx0cmV0dXJuIG1lc2g7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBzaGFkZXIgZm9yIHRoaXMgYmF0Y2guIElmIHlvdSBwbGFuIHRvIHN1cHBvcnRcblx0ICogbXVsdGlwbGUgaW5zdGFuY2VzIG9mIHlvdXIgYmF0Y2gsIGl0IG1heSBvciBtYXkgbm90IGJlIHdpc2Vcblx0ICogdG8gdXNlIGEgc2hhcmVkIHNoYWRlciB0byBzYXZlIHJlc291cmNlcy5cblx0ICogXG5cdCAqIFRoaXMgbWV0aG9kIGluaXRpYWxseSB0aHJvd3MgYW4gZXJyb3I7IHNvIGl0IG11c3QgYmUgb3ZlcnJpZGRlbiBieVxuXHQgKiBzdWJjbGFzc2VzIG9mIEFic3RyYWN0QmF0Y2guXG5cdCAqXG5cdCAqIEBtZXRob2QgIF9jcmVhdGVTaGFkZXJcblx0ICogQHJldHVybiB7TnVtYmVyfSB0aGUgc2l6ZSBvZiBhIHZlcnRleCwgaW4gIyBvZiBmbG9hdHNcblx0ICovXG5cdF9jcmVhdGVTaGFkZXI6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IFwiX2NyZWF0ZVNoYWRlciBub3QgaW1wbGVtZW50ZWRcIlxuXHR9LFx0XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYW4gYXJyYXkgb2YgdmVydGV4IGF0dHJpYnV0ZXMgZm9yIHRoaXMgbWVzaDsgXG5cdCAqIHN1YmNsYXNzZXMgc2hvdWxkIGltcGxlbWVudCB0aGlzIHdpdGggdGhlIGF0dHJpYnV0ZXMgXG5cdCAqIGV4cGVjdGVkIGZvciB0aGVpciBiYXRjaC5cblx0ICpcblx0ICogVGhpcyBtZXRob2QgaW5pdGlhbGx5IHRocm93cyBhbiBlcnJvcjsgc28gaXQgbXVzdCBiZSBvdmVycmlkZGVuIGJ5XG5cdCAqIHN1YmNsYXNzZXMgb2YgQWJzdHJhY3RCYXRjaC5cblx0ICpcblx0ICogQG1ldGhvZCBfY3JlYXRlVmVydGV4QXR0cmlidXRlc1xuXHQgKiBAcmV0dXJuIHtBcnJheX0gYW4gYXJyYXkgb2YgTWVzaC5WZXJ0ZXhBdHRyaWIgb2JqZWN0c1xuXHQgKi9cblx0X2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IFwiX2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXMgbm90IGltcGxlbWVudGVkXCI7XG5cdH0sXG5cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIGZsb2F0cyBwZXIgdmVydGV4IGZvciB0aGlzIGJhdGNoZXIuXG5cdCAqIFxuXHQgKiBUaGlzIG1ldGhvZCBpbml0aWFsbHkgdGhyb3dzIGFuIGVycm9yOyBzbyBpdCBtdXN0IGJlIG92ZXJyaWRkZW4gYnlcblx0ICogc3ViY2xhc3NlcyBvZiBBYnN0cmFjdEJhdGNoLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBnZXRWZXJ0ZXhTaXplXG5cdCAqIEByZXR1cm4ge051bWJlcn0gdGhlIHNpemUgb2YgYSB2ZXJ0ZXgsIGluICMgb2YgZmxvYXRzXG5cdCAqL1xuXHRnZXRWZXJ0ZXhTaXplOiBmdW5jdGlvbigpIHtcblx0XHR0aHJvdyBcImdldFZlcnRleFNpemUgbm90IGltcGxlbWVudGVkXCI7XG5cdH0sXG5cblx0XG5cdC8qKiBcblx0ICogQmVnaW5zIHRoZSBzcHJpdGUgYmF0Y2guIFRoaXMgd2lsbCBiaW5kIHRoZSBzaGFkZXJcblx0ICogYW5kIG1lc2guIFN1YmNsYXNzZXMgbWF5IHdhbnQgdG8gZGlzYWJsZSBkZXB0aCBvciBcblx0ICogc2V0IHVwIGJsZW5kaW5nLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBiZWdpblxuXHQgKi9cblx0YmVnaW46IGZ1bmN0aW9uKCkgIHtcblx0XHRpZiAodGhpcy5kcmF3aW5nKSBcblx0XHRcdHRocm93IFwiYmF0Y2guZW5kKCkgbXVzdCBiZSBjYWxsZWQgYmVmb3JlIGJlZ2luXCI7XG5cdFx0dGhpcy5kcmF3aW5nID0gdHJ1ZTtcblxuXHRcdHRoaXMuc2hhZGVyLmJpbmQoKTtcblxuXHRcdC8vYmluZCB0aGUgYXR0cmlidXRlcyBub3cgdG8gYXZvaWQgcmVkdW5kYW50IGNhbGxzXG5cdFx0dGhpcy5tZXNoLmJpbmQodGhpcy5zaGFkZXIpO1xuXHR9LFxuXG5cdC8qKiBcblx0ICogRW5kcyB0aGUgc3ByaXRlIGJhdGNoLiBUaGlzIHdpbGwgZmx1c2ggYW55IHJlbWFpbmluZyBcblx0ICogZGF0YSBhbmQgc2V0IEdMIHN0YXRlIGJhY2sgdG8gbm9ybWFsLlxuXHQgKiBcblx0ICogQG1ldGhvZCAgZW5kXG5cdCAqL1xuXHRlbmQ6IGZ1bmN0aW9uKCkgIHtcblx0XHRpZiAoIXRoaXMuZHJhd2luZylcblx0XHRcdHRocm93IFwiYmF0Y2guYmVnaW4oKSBtdXN0IGJlIGNhbGxlZCBiZWZvcmUgZW5kXCI7XG5cdFx0aWYgKHRoaXMuaWR4ID4gMClcblx0XHRcdHRoaXMuZmx1c2goKTtcblx0XHR0aGlzLmRyYXdpbmcgPSBmYWxzZTtcblxuXHRcdHRoaXMubWVzaC51bmJpbmQodGhpcy5zaGFkZXIpO1xuXHR9LFxuXG5cdC8qKiBcblx0ICogQ2FsbGVkIGJlZm9yZSByZW5kZXJpbmcgdG8gYmluZCBuZXcgdGV4dHVyZXMuXG5cdCAqIFRoaXMgbWV0aG9kIGRvZXMgbm90aGluZyBieSBkZWZhdWx0LlxuXHQgKlxuXHQgKiBAbWV0aG9kICBfcHJlUmVuZGVyXG5cdCAqL1xuXHRfcHJlUmVuZGVyOiBmdW5jdGlvbigpICB7XG5cdH0sXG5cblx0LyoqIFxuXHQgKiBDYWxsZWQgYWZ0ZXIgZmx1c2hpbmcgdGhlIGJhdGNoLiBUaGlzIG1ldGhvZFxuXHQgKiBkb2VzIG5vdGhpbmcgYnkgZGVmYXVsdC5cblx0ICpcblx0ICogQG1ldGhvZCAgX3Bvc3RSZW5kZXJcblx0ICovXG5cdF9wb3N0UmVuZGVyOiBmdW5jdGlvbigpIHtcblx0fSxcblxuXHQvKipcblx0ICogRmx1c2hlcyB0aGUgYmF0Y2ggYnkgcHVzaGluZyB0aGUgY3VycmVudCBkYXRhXG5cdCAqIHRvIEdMLlxuXHQgKiBcblx0ICogQG1ldGhvZCBmbHVzaFxuXHQgKi9cblx0Zmx1c2g6IGZ1bmN0aW9uKCkgIHtcblx0XHRpZiAodGhpcy5pZHg9PT0wKVxuXHRcdFx0cmV0dXJuO1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRcblx0XHR0aGlzLl9wcmVSZW5kZXIoKTtcblxuXHRcdC8vbnVtYmVyIG9mIHNwcml0ZXMgaW4gYmF0Y2hcblx0XHR2YXIgbnVtQ29tcG9uZW50cyA9IHRoaXMuZ2V0VmVydGV4U2l6ZSgpO1xuXHRcdHZhciBzcHJpdGVDb3VudCA9ICh0aGlzLmlkeCAvIChudW1Db21wb25lbnRzICogNCkpO1xuXHRcdFxuXHRcdC8vZHJhdyB0aGUgc3ByaXRlc1xuXHRcdHZhciBnbCA9IHRoaXMuY29udGV4dC5nbDtcblx0XHR0aGlzLm1lc2gudmVydGljZXNEaXJ0eSA9IHRydWU7XG5cdFx0dGhpcy5tZXNoLmRyYXcoZ2wuVFJJQU5HTEVTLCBzcHJpdGVDb3VudCAqIDYsIDAsIHRoaXMuaWR4KTtcblxuXHRcdHRoaXMuaWR4ID0gMDtcblx0fSxcblxuXHQvKipcblx0ICogQWRkcyBhIHNwcml0ZSB0byB0aGlzIGJhdGNoLlxuXHQgKiBUaGUgc3BlY2lmaWNzIGRlcGVuZCBvbiB0aGUgc3ByaXRlIGJhdGNoIGltcGxlbWVudGF0aW9uLlxuXHQgKlxuXHQgKiBAbWV0aG9kIGRyYXdcblx0ICogQHBhcmFtICB7VGV4dHVyZX0gdGV4dHVyZSB0aGUgdGV4dHVyZSBmb3IgdGhpcyBzcHJpdGVcblx0ICogQHBhcmFtICB7TnVtYmVyfSB4ICAgICAgIHRoZSB4IHBvc2l0aW9uLCBkZWZhdWx0cyB0byB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0geSAgICAgICB0aGUgeSBwb3NpdGlvbiwgZGVmYXVsdHMgdG8gemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoICAgdGhlIHdpZHRoLCBkZWZhdWx0cyB0byB0aGUgdGV4dHVyZSB3aWR0aFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCAgdGhlIGhlaWdodCwgZGVmYXVsdHMgdG8gdGhlIHRleHR1cmUgaGVpZ2h0XG5cdCAqIEBwYXJhbSAge051bWJlcn0gdTEgICAgICB0aGUgZmlyc3QgVSBjb29yZGluYXRlLCBkZWZhdWx0IHplcm9cblx0ICogQHBhcmFtICB7TnVtYmVyfSB2MSAgICAgIHRoZSBmaXJzdCBWIGNvb3JkaW5hdGUsIGRlZmF1bHQgemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHUyICAgICAgdGhlIHNlY29uZCBVIGNvb3JkaW5hdGUsIGRlZmF1bHQgb25lXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdjIgICAgICB0aGUgc2Vjb25kIFYgY29vcmRpbmF0ZSwgZGVmYXVsdCBvbmVcblx0ICovXG5cdGRyYXc6IGZ1bmN0aW9uKHRleHR1cmUsIHgsIHksIHdpZHRoLCBoZWlnaHQsIHUxLCB2MSwgdTIsIHYyKSB7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEFkZHMgYSBzaW5nbGUgcXVhZCBtZXNoIHRvIHRoaXMgc3ByaXRlIGJhdGNoIGZyb20gdGhlIGdpdmVuXG5cdCAqIGFycmF5IG9mIHZlcnRpY2VzLlxuXHQgKiBUaGUgc3BlY2lmaWNzIGRlcGVuZCBvbiB0aGUgc3ByaXRlIGJhdGNoIGltcGxlbWVudGF0aW9uLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBkcmF3VmVydGljZXNcblx0ICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIHdlIGFyZSBkcmF3aW5nIGZvciB0aGlzIHNwcml0ZVxuXHQgKiBAcGFyYW0ge0Zsb2F0MzJBcnJheX0gdmVydHMgYW4gYXJyYXkgb2YgdmVydGljZXNcblx0ICogQHBhcmFtIHtOdW1iZXJ9IG9mZiB0aGUgb2Zmc2V0IGludG8gdGhlIHZlcnRpY2VzIGFycmF5IHRvIHJlYWQgZnJvbVxuXHQgKi9cblx0ZHJhd1ZlcnRpY2VzOiBmdW5jdGlvbih0ZXh0dXJlLCB2ZXJ0cywgb2ZmKSAge1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBEZXN0cm95cyB0aGUgYmF0Y2gsIGRlbGV0aW5nIGl0cyBidWZmZXJzIGFuZCByZW1vdmluZyBpdCBmcm9tIHRoZVxuXHQgKiBXZWJHTENvbnRleHQgbWFuYWdlbWVudC4gVHJ5aW5nIHRvIHVzZSB0aGlzXG5cdCAqIGJhdGNoIGFmdGVyIGRlc3Ryb3lpbmcgaXQgY2FuIGxlYWQgdG8gdW5wcmVkaWN0YWJsZSBiZWhhdmlvdXIuXG5cdCAqXG5cdCAqIEBtZXRob2QgZGVzdHJveVxuXHQgKi9cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy52ZXJ0aWNlcyA9IFtdO1xuXHRcdHRoaXMuaW5kaWNlcyA9IFtdO1xuXHRcdHRoaXMuc2l6ZSA9IHRoaXMubWF4VmVydGljZXMgPSAwO1xuXG5cdFx0dGhpcy5tZXNoLmRlc3Ryb3koKTtcblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQWJzdHJhY3RCYXRjaDtcbiIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgU2lnbmFsID0gcmVxdWlyZSgnc2lnbmFscycpO1xuXG4vKipcbiAqIFRoaXMgaXMgYSB1dGlsaXR5IHdoaWNoIG1ha2VzIGFzc2V0IGxvYWRpbmcgY2xlYW5lclxuICogYW5kIHNpbXBsZXIsIGVzcGVjaWFsbHkgd2l0aCByZWdhcmQgdG8gYXN5bmNocm9ub3VzIGltYWdlXG4gKiBsb2FkaW5nIGFuZCBXZWJHTCBjb250ZXh0IGxvc3MuXG4gKlxuICpcbiAqIEJhc2ljIHVzYWdlIGxvb2tzIGxpa2UgdGhpczpcbiAqXG4gKiAgICAgLy9DcmVhdGUgYW4gYXNzZXQgbWFuYWdlciBcbiAqICAgICB2YXIgYXNzZXRzID0gbmV3IEFzc2V0TWFuYWdlcihjb250ZXh0KTtcbiAqICBcbiAqICAgICAvL2ltYWdlIHR5cGVzIHdpbGwgcmV0dXJuIGEgbmV3IFRleHR1cmVcbiAqICAgICB2YXIgdGV4MCA9IGFzc2V0cy5sb2FkKFwiaW1nL2dyYXNzLnBuZ1wiKTtcbiAqICAgICB2YXIgdGV4MSA9IGFzc2V0cy5sb2FkKFwiaW1nL3NjZW5lLnBuZ1wiKTtcbiAqXG4gKiAgICAgLi4uIGluc2lkZSBnYW1lIGxvb3AgLi4uXG4gKlxuICogICAgICAgICBpZiAoYXNzZXRzLnVwZGF0ZSgpKSB7XG4gKiAgICAgICAgICAgICAvLyBhbGwgYXNzZXRzIGFyZSBsb2FkZWQsIHdlIGNhbiByZW5kZXIuXG4gKiAgICAgICAgIH0gZWxzZSB7XG4gKiAgICAgICAgICAgICAvLyBub3QgYWxsIGFzc2V0cyBhcmUgbG9hZGVkLiB3ZSBuZWVkXG4gKiAgICAgICAgICAgICAvLyB0byBzaG93IG91ciBwcmVsb2FkZXIuXG4gKiAgICAgICAgIH1cbiAqXG4gKiBDdXJyZW50bHkgdGhpcyBjbGFzcyBvbmx5IHN1cHBvcnRzIGltYWdlIGxvYWRpbmcsXG4gKiBhbHRob3VnaCBpbiB0aGUgZnV0dXJlIG90aGVycyBjb3VsZCBiZSBhZGRlZCBmb3IgXG4gKiBjb21wcmVzc2VkIHRleHR1cmVzLCBzcHJpdGUgc2hlZXRzLCBhbmQgc28gZm9ydGguXG4gKlxuICogQ3JlYXRpbmcgYSBuZXcgYXNzZXQgbWFuYWdlciB3aWxsIGxpc3RlbiBmb3IgY29udGV4dFxuICogbG9zcyBldmVudHMgb24gdGhlIGdpdmVuIFdlYkdMQ29udGV4dC4gV2hlbiB0aGlzIGhhcHBlbnMsXG4gKiBhbGwgYXNzZXRzIHdpbGwgYmUgaW52YWxpZGF0ZWQgYW5kIGFkZGVkIHRvIHRoZSBsb2FkaW5nIHF1ZXVlLlxuICogQXMgc3VjaCwgdXBkYXRlKCkgd2lsbCByZXR1cm4gZmFsc2UgdW50aWwgdGhlIGFzc2V0cyBoYXZlIGJlZW5cbiAqIHJlLWxvYWRlZC5cbiAqIFxuICogQGNsYXNzICBBc3NldE1hbmFnZXJcbiAqIEBjb25zdHJ1Y3RvciBcdFxuICogQHBhcmFtIHtXZWJHTENvbnRleHR9IGNvbnRleHQgdGhlIFdlYkdMQ29udGV4dCBmb3IgdGhpcyBtYW5hZ2VyXG4gKi9cbnZhciBBc3NldE1hbmFnZXIgPSBuZXcgQ2xhc3Moe1xuXHRcblxuXHQvKipcblx0ICogQSByZWFkLW9ubHkgcHJvcGVydHkgdGhhdCBkZXNjcmliZXMgdGhlIG51bWJlciBvZiBcblx0ICogYXNzZXRzIHJlbWFpbmluZyB0byBiZSBsb2FkZWQuXG5cdCAqXG5cdCAqIEBhdHRyaWJ1dGUgcmVtYWluaW5nXG5cdCAqIEB0eXBlIHtOdW1iZXJ9XG5cdCAqIEByZWFkT25seVxuXHQgKi9cblx0cmVtYWluaW5nOiB7XG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLl9fdG90YWxJdGVtcyAtIHRoaXMuX19sb2FkQ291bnQ7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIHJlYWQtb25seSBwcm9wZXJ0eSB0aGF0IGRlc2NyaWliZXMgdGhlIHRvdGFsXG5cdCAqIG51bWJlciBvZiBhc3NldHMgaW4gdGhpcyBBc3NldE1hbmFnZXIuXG5cdCAqXG5cdCAqIEBhdHRyaWJ1dGUgdG90YWxcblx0ICogQHJlYWRPbmx5XG5cdCAqIEB0eXBlIHtOdW1iZXJ9XG5cdCAqL1xuXHR0b3RhbDoge1xuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fX3RvdGFsSXRlbXM7XG5cdFx0fVxuXHR9LFxuXG5cdC8vQ29uc3RydWN0b3Jcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gQXNzZXRNYW5hZ2VyKGNvbnRleHQpIHtcblx0XHRpZiAoIWNvbnRleHQpXG5cdFx0XHR0aHJvdyBcIm5vIGNvbnRleHQgZGVmaW5lZCBmb3IgQXNzZXRNYW5hZ2VyXCI7XG5cblx0XHQvKipcblx0XHQgKiBBbiBhcnJheSBvZiBhc3NldHMgdGhhdCB0aGlzIEFzc2V0TWFuYWdlciBpcyBoYW5kbGluZy5cblx0XHQgKiBUaGlzIHNob3VsZCBub3QgYmUgbW9kaWZpZWQgZGlyZWN0bHkuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IGFzc2V0c1xuXHRcdCAqIEB0eXBlIHtBcnJheX1cblx0XHQgKi9cblx0XHR0aGlzLmFzc2V0cyA9IFtdO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIHF1ZXVlIG9mIHRhc2tzIHRvIGxvYWQuIEVhY2ggY29udGFpbnNcblx0XHQgKiBhblxuXHRcdCAqIHt7I2Nyb3NzTGluayBcIkFzc2V0TWFuYWdlci5EZXNjcmlwdG9yXCJ9fXt7L2Nyb3NzTGlua319LlxuXHRcdCAqXG5cdFx0ICogTG9hZGluZyBhIHRhc2sgd2lsbCBwb3AgaXQgb2ZmIHRoaXMgbGlzdCBhbmQgZmlyZSB0aGUgYXN5bmNcblx0XHQgKiBvciBzeW5jaHJvbm91cyBwcm9jZXNzLlxuXHRcdCAqXG5cdFx0ICogVGhpcyBzaG91bGQgbm90IGJlIG1vZGlmaWVkIGRpcmVjdGx5LlxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IHRhc2tzXG5cdFx0ICogQHByb3RlY3RlZFxuXHRcdCAqIEB0eXBlIHtBcnJheX1cblx0XHQgKi9cblx0XHR0aGlzLnRhc2tzID0gW107XG5cblx0XHQvL1ByaXZhdGUgc3R1ZmYuLi4gZG8gbm90IHRvdWNoIVxuXG5cdFx0dGhpcy5fX2xvYWRDb3VudCA9IDA7XG5cdFx0dGhpcy5fX3RvdGFsSXRlbXMgPSAwO1xuXHRcdHRoaXMuX19sb2FkQ2FsbGJhY2tGdW5jID0gbnVsbDtcblx0XHR0aGlzLl9faW52YWxpZGF0ZUZ1bmMgPSBudWxsO1xuXG5cdFx0Ly8gU2lnbmFscyBcblx0XHRcblx0XHQvKipcblx0XHQgKiBBIHNpZ25hbCBkaXNwYXRjaGVkIHdoZW4gbG9hZGluZyBmaXJzdCBiZWdpbnMsIFxuXHRcdCAqIGkuZS4gd2hlbiB1cGRhdGUoKSBpcyBjYWxsZWQgYW5kIHRoZSBsb2FkaW5nIHF1ZXVlIGlzIHRoZVxuXHRcdCAqIHNhbWUgc2l6ZSBhcyB0aGUgdG90YWwgYXNzZXQgbGlzdC5cblx0XHQgKlxuXHRcdCAqIEBldmVudCBsb2FkU3RhcnRlZFxuXHRcdCAqIEB0eXBlIHtTaWduYWx9XG5cdFx0ICovXG5cdFx0dGhpcy5sb2FkU3RhcnRlZCA9IG5ldyBTaWduYWwoKTtcblxuXHRcdC8qKlxuXHRcdCAqIEEgc2lnbmFsIGRpc3BhdGNoZWQgd2hlbiBhbGwgYXNzZXRzIGhhdmUgYmVlbiBsb2FkZWRcblx0XHQgKiAoaS5lLiB0aGVpciBhc3luYyB0YXNrcyBmaW5pc2hlZCkuXG5cdFx0ICpcblx0XHQgKiBAZXZlbnQgbG9hZEZpbmlzaGVkXG5cdFx0ICogQHR5cGUge1NpZ25hbH1cblx0XHQgKi9cblx0XHR0aGlzLmxvYWRGaW5pc2hlZCA9IG5ldyBTaWduYWwoKTtcblxuXHRcdC8qKlxuXHRcdCAqIEEgc2lnbmFsIGRpc3BhdGNoZWQgb24gcHJvZ3Jlc3MgdXBkYXRlcywgb25jZSBhbiBhc3NldFxuXHRcdCAqIGhhcyBiZWVuIGxvYWRlZCBpbiBmdWxsIChpLmUuIGl0cyBhc3luYyB0YXNrIGZpbmlzaGVkKS5cblx0XHQgKlxuXHRcdCAqIFRoaXMgcGFzc2VzIHRocmVlIGFyZ3VtZW50cyB0byB0aGUgbGlzdGVuZXIgZnVuY3Rpb246XG5cdFx0ICogXG5cdFx0ICogLSBgY3VycmVudGAgbnVtYmVyIG9mIGFzc2V0cyB0aGF0IGhhdmUgYmVlbiBsb2FkZWRcblx0XHQgKiAtIGB0b3RhbGAgbnVtYmVyIG9mIGFzc2V0cyB0byBsb2FkZWRcblx0XHQgKiAtIGBuYW1lYCBvZiB0aGUgYXNzZXQgd2hpY2ggd2FzIGp1c3QgbG9hZGVkXG5cdFx0ICogIFxuXHRcdCAqIEBldmVudCBsb2FkUHJvZ3Jlc3Ncblx0XHQgKiBAdHlwZSB7W3R5cGVdfVxuXHRcdCAqL1xuXHRcdHRoaXMubG9hZFByb2dyZXNzID0gbmV3IFNpZ25hbCgpO1xuXG5cdFx0LyoqXG5cdFx0ICogQSBzaWduYWwgZGlzcGF0Y2hlZCBvbiBwcm9ibGVtYXRpYyBsb2FkOyBlLmcuIGlmXG5cdFx0ICogdGhlIGltYWdlIHdhcyBub3QgZm91bmQgYW5kIFwib25lcnJvclwiIHdhcyB0cmlnZ2VyZWQuIFxuXHRcdCAqIFRoZSBmaXJzdCBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIGxpc3RlbmVyIHdpbGwgYmUgXG5cdFx0ICogdGhlIHN0cmluZyBuYW1lIG9mIHRoZSBhc3NldC5cblx0XHQgKlxuXHRcdCAqIFRoZSBhc3NldCBtYW5hZ2VyIHdpbGwgY29udGludWUgbG9hZGluZyBzdWJzZXF1ZW50IGFzc2V0cy5cblx0XHQgKlxuXHRcdCAqIFRoaXMgaXMgZGlzcGF0Y2hlZCBhZnRlciB0aGUgc3RhdHVzIG9mIHRoZSBhc3NldCBpc1xuXHRcdCAqIHNldCB0byBTdGF0dXMuTE9BRF9GQUlMLCBhbmQgYmVmb3JlIHRoZSBsb2FkUHJvZ3Jlc3Ncblx0XHQgKiBzaWduYWwgaXMgZGlzcGF0Y2hlZC5cblx0XHQgKlxuXHRcdCAqIEBldmVudCBsb2FkRXJyb3Jcblx0XHQgKiBAdHlwZSB7U2lnbmFsfVxuXHRcdCAqL1xuXHRcdHRoaXMubG9hZEVycm9yID0gbmV3IFNpZ25hbCgpO1xuXG5cdFx0dGhpcy5sb2FkZXJzID0ge307XG5cblx0XHR0aGlzLl9faW52YWxpZGF0ZUZ1bmMgPSB0aGlzLmludmFsaWRhdGUuYmluZCh0aGlzKTtcblx0XHR0aGlzLl9fbG9hZENhbGxiYWNrRnVuYyA9IHRoaXMuX19sb2FkQ2FsbGJhY2suYmluZCh0aGlzKTtcblxuXHRcdHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0dGhpcy5jb250ZXh0Lmxvc3QuYWRkKHRoaXMuX19pbnZhbGlkYXRlRnVuYyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIERlc3Ryb3lzIHRoaXMgYXNzZXQgbWFuYWdlcjsgcmVtb3ZpbmcgaXRzIGxpc3RlbmVyc1xuXHQgKiB3aXRoIFdlYkdMQ29udGV4dCBhbmQgZGVsZXRpbmcgdGhlIGFzc2V0cyBhcnJheS5cblx0ICpcblx0ICogQG1ldGhvZCAgZGVzdHJveVxuXHQgKi9cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5hc3NldHMgPSBbXTtcblx0XHR0aGlzLnRhc2tzID0gW107XG5cdFx0dGhpcy5fX2xvYWRDb3VudCA9IHRoaXMuX190b3RhbEl0ZW1zID0gMDtcblx0XHR0aGlzLmNvbnRleHQubG9zdC5yZW1vdmUodGhpcy5fX2ludmFsaWRhdGVGdW5jKTtcblx0fSxcblxuXHQvKipcblx0ICogQ2FsbGVkIHRvIGludmFsaWRhdGUgdGhlIGFzc2V0IG1hbmFnZXJcblx0ICogYW5kIHJlcXVpcmUgYWxsIGFzc2V0cyB0byBiZSByZS1sb2FkZWQuXG5cdCAqIFRoaXMgaXMgY2FsbGVkIGludGVybmFsbHkgb24gY29udGV4dCBsb3NzLlxuXHQgKlxuXHQgKiBAcHJvdGVjdGVkXG5cdCAqIEBtZXRob2QgaW52YWxpZGF0ZVxuXHQgKi9cblx0aW52YWxpZGF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0Ly9tYXJrIGFsbCBhcyBub3QgeWV0IGxvYWRlZFxuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLmFzc2V0cy5sZW5ndGg7IGkrKykgXG5cdFx0XHR0aGlzLmFzc2V0c1tpXS5sb2FkZWQgPSBmYWxzZTtcblxuXHRcdC8vY29weSBvdXIgYXNzZXRzIHRvIGEgcXVldWUgd2hpY2ggY2FuIGJlIHBvcHBlZFxuXHRcdHRoaXMudGFza3MgPSB0aGlzLmFzc2V0cy5zbGljZSgpO1xuXG5cdFx0dGhpcy5fX2xvYWRDb3VudCA9IHRoaXMuX190b3RhbEl0ZW1zID0gdGhpcy50YXNrcy5sZW5ndGg7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFB1c2hlcyBhbiBhc3NldCBvbnRvIHRoaXMgc3RhY2suIFRoaXNcblx0ICogYXR0ZW1wdHMgdG8gZGV0ZWN0IHRoZSBsb2FkZXIgZm9yIHlvdSBiYXNlZFxuXHQgKiBvbiB0aGUgYXNzZXQgbmFtZSdzIGZpbGUgZXh0ZW5zaW9uLiBJZiB0aGVcblx0ICogYXNzZXQgbmFtZSBkb2Vzbid0IGhhdmUgYSBrbm93biBmaWxlIGV4dGVuc2lvbixcblx0ICogb3IgaWYgdGhlcmUgaXMgbm8gbG9hZGVyIHJlZ2lzdGVyZWQgZm9yIHRoYXQgZmlsZW5hbWUsXG5cdCAqIHRoaXMgbWV0aG9kIHRocm93cyBhbiBlcnJvci4gXG5cdCAqXG5cdCAqIFRoZSBmaXJzdCBhcmd1bWVudCBpcyB0aGUgYXNzZXQgbmFtZS4gQW55IHN1YnNlcXVlbnRcblx0ICogYXJndW1lbnRzIHdpbGwgYmUgcGFzc2VkIGFsb25nIHRvIHRoZSBsb2FkZXIgZm9yIGZ1cnRoZXJcblx0ICogcHJvY2Vzc2luZy5cblx0ICpcblx0ICogVGhlIHJldHVybiB2YWx1ZSBvZiB0aGlzIG1ldGhvZCBpcyBkZXRlcm1pbmVkIGJ5XG5cdCAqIHRoZSBsb2FkZXIncyBwcm9jZXNzQXJndW1lbnRzIG1ldGhvZC4gRm9yIGV4YW1wbGUsIHRoZVxuXHQgKiBkZWZhdWx0IEltYWdlIGxvYWRlciByZXR1cm5zIGEgVGV4dHVyZSBvYmplY3QuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGxvYWRcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSBhc3NldCBuYW1lXG5cdCAqIEBwYXJhbSB7YW55fSBhcmdzIGEgdmFyaWFibGUgbnVtYmVyIG9mIG9wdGlvbmFsIGFyZ3VtZW50c1xuXHQgKiBAcmV0dXJuIHthbnl9IHJldHVybnMgdGhlIGJlc3QgdHlwZSBmb3IgdGhpcyBhc3NldCdzIGxvYWRlclxuXHQgKi9cblx0bG9hZDogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBleHQgPSB0aGlzLl9fZXh0ZW5zaW9uKG5hbWUpO1xuXHRcdGlmICghZXh0KSBcblx0XHRcdHRocm93IFwiQXNzZXQgbmFtZSBkb2VzIG5vdCBoYXZlIGEgZmlsZSBleHRlbnNpb246IFwiICsgbmFtZTtcblx0XHRpZiAoIUFzc2V0TWFuYWdlci5sb2FkZXJzLmhhc093blByb3BlcnR5KGV4dCkpXG5cdFx0XHR0aHJvdyBcIk5vIGtub3duIGxvYWRlciBmb3IgZXh0ZW5zaW9uIFwiK2V4dCtcIiBpbiBhc3NldCBcIituYW1lO1xuXG5cdFx0dmFyIGFyZ3MgPSBbIG5hbWUsIEFzc2V0TWFuYWdlci5sb2FkZXJzW2V4dF0gXTtcblx0XHRhcmdzID0gYXJncy5jb25jYXQoIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkgKTtcblxuXHRcdHJldHVybiB0aGlzLmxvYWRBcy5hcHBseSh0aGlzLCBhcmdzKTtcblx0fSxcblxuXHRfX2V4dGVuc2lvbjogZnVuY3Rpb24oc3RyKSB7XG5cdFx0dmFyIGlkeCA9IHN0ci5sYXN0SW5kZXhPZignLicpO1xuXHRcdGlmIChpZHggPT09IC0xIHx8IGlkeCA9PT0gMCB8fCBpZHggPT09IHN0ci5sZW5ndGgtMSkgLy8gZG9lcyBub3QgaGF2ZSBhIGNsZWFyIGZpbGUgZXh0ZW5zaW9uXG5cdFx0XHRyZXR1cm4gXCJcIjtcblx0XHRyZXR1cm4gc3RyLnN1YnN0cmluZyhpZHgrMSkudG9Mb3dlckNhc2UoKTtcblx0fSxcblxuXHQvKipcblx0ICogUHVzaGVzIGFuIGFzc2V0IG9udG8gdGhpcyBzdGFjay4gVGhpcyBhbGxvd3MgeW91IHRvXG5cdCAqIHNwZWNpZnkgYSBsb2FkZXIgZnVuY3Rpb24gZm9yIHRoZSBhc3NldC4gVGhpcyBpcyB1c2VmdWxcblx0ICogaWYgeW91IHdpc2ggdG8gdXNlIGdlbmVyaWMgbmFtZXMgZm9yIHlvdXIgYXNzZXRzIChpbnN0ZWFkIG9mXG5cdCAqIGZpbGVuYW1lcyksIG9yIGlmIHlvdSB3YW50IGEgcGFydGljdWxhciBhc3NldCB0byB1c2UgYSBzcGVjaWZpY1xuXHQgKiBsb2FkZXIuIFxuXHQgKlxuXHQgKiBMaWtlIHdpdGgge3sjY3Jvc3NMaW5rIFwiQXNzZXRNYW5hZ2VyL2xvYWQ6bWV0aG9kXCJ9fXt7L2Nyb3NzTGlua319LFxuXHQgKiB0aGUgZmlyc3QgYXJndW1lbnQgaXMgdGhlIGFzc2V0IG5hbWUuIFRoZSBzZWNvbmQgYXJndW1lbnQgaXMgdGhlIGxvYWRlclxuXHQgKiB0byB1c2UgZm9yIHRoaXMgYXNzZXQuIEFueSBzdWJzZXF1ZW50XG5cdCAqIGFyZ3VtZW50cyB3aWxsIGJlIHBhc3NlZCBhbG9uZyB0byB0aGUgbG9hZGVyIGZvciBmdXJ0aGVyXG5cdCAqIHByb2Nlc3NpbmcuXG5cdCAqXG5cdCAqIFRoZSByZXR1cm4gdmFsdWUgb2YgdGhpcyBtZXRob2QgaXMgZGV0ZXJtaW5lZCBieVxuXHQgKiB0aGUgbG9hZGVyJ3MgcHJvY2Vzc0FyZ3VtZW50cyBtZXRob2QuIEZvciBleGFtcGxlLCB0aGVcblx0ICogZGVmYXVsdCBJbWFnZSBsb2FkZXIgcmV0dXJucyBhIFRleHR1cmUgb2JqZWN0LlxuXHQgKlxuXHQgKiBAbWV0aG9kICBsb2FkXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIHRoZSBhc3NldCBuYW1lXG5cdCAqIEBwYXJhbSB7RnVjbnRpb259IGxvYWRlciB0aGUgbG9hZGVyIGZ1bmN0aW9uXG5cdCAqIEBwYXJhbSB7T2JqZWN0IC4uLn0gYXJncyBhIHZhcmlhYmxlIG51bWJlciBvZiBvcHRpb25hbCBhcmd1bWVudHNcblx0ICogQHJldHVybiB7YW55fSByZXR1cm5zIHRoZSBiZXN0IHR5cGUgZm9yIHRoaXMgYXNzZXQncyBsb2FkZXJcblx0ICovXG5cdGxvYWRBczogZnVuY3Rpb24obmFtZSwgbG9hZGVyKSB7XG5cdFx0aWYgKCFuYW1lKVxuXHRcdFx0dGhyb3cgXCJubyBuYW1lIHNwZWNpZmllZCB0byBsb2FkXCI7XG5cdFx0aWYgKCFsb2FkZXIpXG5cdFx0XHR0aHJvdyBcIm5vIGxvYWRlciBzcGVjaWZpZWQgZm9yIGFzc2V0IFwiK25hbWU7XG5cblx0XHR2YXIgaWR4ID0gdGhpcy5fX2luZGV4T2YodGhpcy5hc3NldHMsIG5hbWUpO1xuXHRcdGlmIChpZHggIT09IC0xKSAvL1RPRE86IGV2ZW50dWFsbHkgYWRkIHN1cHBvcnQgZm9yIGRlcGVuZGVuY2llcyBhbmQgc2hhcmVkIGFzc2V0c1xuXHRcdFx0dGhyb3cgXCJhc3NldCBhbHJlYWR5IGRlZmluZWQgaW4gYXNzZXQgbWFuYWdlclwiO1xuXG5cdFx0Ly9ncmFiIGFueSBhZGRpdGlvbmFsIGFyZ3VtZW50c1xuXHRcdHZhciBwYXJhbXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuXG5cdFx0dmFyIGRlc2MgPSBuZXcgQXNzZXRNYW5hZ2VyLkRlc2NyaXB0b3IobmFtZSwgbG9hZGVyLCBwYXJhbXMpO1xuXG5cdFx0Ly9rZWVwIGhvbGQgb2YgdGhpcyBhc3NldFxuXHRcdHRoaXMuYXNzZXRzLnB1c2goZGVzYyk7XG5cblx0XHQvL2Fsc28gYWRkIGl0IHRvIG91ciBxdWV1ZSBvZiBjdXJyZW50IHRhc2tzXG5cdFx0dGhpcy50YXNrcy5wdXNoKGRlc2MpO1xuXHRcdHRoaXMuX19sb2FkQ291bnQrKztcblx0XHR0aGlzLl9fdG90YWxJdGVtcysrO1xuXG5cblx0XHQvL2lmIHdlIGNhbiBwcm9jZXNzIHRoZSBhcmd1bWVudHMgYW5kIGdldCBhIHJldHVybiB2YWx1ZS4uLlxuXHRcdGlmIChsb2FkZXIucHJvY2Vzc0FyZ3VtZW50cykge1xuXHRcdFx0cmV0dXJuIGxvYWRlci5wcm9jZXNzQXJndW1lbnRzLmNhbGwodGhpcywgbmFtZSwgcGFyYW1zKTtcblx0XHR9IGVsc2Vcblx0XHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdF9faW5kZXhPZjogZnVuY3Rpb24obGlzdCwgbmFtZSkge1xuXHRcdGZvciAodmFyIGk9MDsgaTxsaXN0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAobGlzdFtpXS5uYW1lID09PSBuYW1lKVxuXHRcdFx0XHRyZXR1cm4gaTtcblx0XHR9XG5cdFx0cmV0dXJuIC0xO1xuXHR9LFxuXG5cdF9fbG9hZENhbGxiYWNrOiBmdW5jdGlvbihuYW1lLCBzdWNjZXNzKSB7XG5cdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPCAyKSAvL3NvbWUgaGVscGZ1bCBkZWJ1ZyBpbmZvcm1hdGlvbiBpZiB5b3UncmUgd3JpdGluZyBhIExvYWRlclxuXHRcdFx0dGhyb3cgXCJMb2FkZXIgcGFzc2VkIGludmFsaWQgYXJndW1lbnRzIHRvIGZpbmlzaGVkKCkgY2FsbGJhY2s7XCJcblx0XHRcdFx0XHQrXCIgbXVzdCBpbmNsdWRlIG5hbWUgYW5kIHN1Y2Nlc3MgZmxhZ1wiO1xuXG5cdFx0dGhpcy5fX2xvYWRDb3VudC0tO1xuXG5cdFx0dmFyIGFzc2V0SWR4ID0gdGhpcy5fX2luZGV4T2YodGhpcy5hc3NldHMsIG5hbWUpO1xuXHRcdGlmIChhc3NldElkeCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuYXNzZXRzW2Fzc2V0SWR4XS5zdGF0dXMgPSBzdWNjZXNzIFxuXHRcdFx0XHRcdFx0PyBBc3NldE1hbmFnZXIuU3RhdHVzLkxPQURfU1VDQ0VTU1xuXHRcdFx0XHRcdFx0OiBBc3NldE1hbmFnZXIuU3RhdHVzLkxPQURfRkFJTEVEO1xuXHRcdFx0aWYgKCFzdWNjZXNzKSB7XG5cdFx0XHRcdHRoaXMubG9hZEVycm9yLmRpc3BhdGNoKG5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubG9hZFByb2dyZXNzLmRpc3BhdGNoKCAodGhpcy5fX3RvdGFsSXRlbXMgLSB0aGlzLl9fbG9hZENvdW50KSwgXG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9fdG90YWxJdGVtcyxcblx0XHRcdFx0XHRcdFx0XHRcdG5hbWUpO1xuXHRcdFx0XG5cdFx0aWYgKHRoaXMuX19sb2FkQ291bnQgPT09IDApIHtcblx0XHRcdHRoaXMubG9hZEZpbmlzaGVkLmRpc3BhdGNoKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIFRPRE8uLi4uXG5cdC8vIGlzTG9hZGVkOiBmdW5jdGlvbihuYW1lKSB7XG5cdC8vIFx0dmFyIGFzc2V0SWR4ID0gdGhpcy5fX2luZGV4T2YodGhpcy5hc3NldHMsIG5hbWUpO1xuXHQvLyBcdHJldHVybiBhc3NldElkeCAhPT0gLTEgPyB0aGlzLmFzc2V0c1thc3NldElkeF0ubG9hZGVkIDogZmFsc2U7XG5cdC8vIH0sXG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhpcyBBc3NldE1hbmFnZXIgYnkgbG9hZGluZyB0aGUgbmV4dCBhc3NldCBpbiB0aGUgcXVldWUuXG5cdCAqIElmIGFsbCBhc3NldHMgaGF2ZSBiZWVuIGxvYWRlZCwgdGhpcyBtZXRob2QgcmV0dXJucyB0cnVlLCBvdGhlcndpc2Vcblx0ICogaXQgd2lsbCByZXR1cm4gZmFsc2UuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHVwZGF0ZVxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSB3aGV0aGVyIHRoaXMgYXNzZXQgbWFuYWdlciBoYXMgZmluaXNoZWQgbG9hZGluZ1xuXHQgKi9cblx0dXBkYXRlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuY29udGV4dC52YWxpZClcblx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdGlmICh0aGlzLnRhc2tzLmxlbmd0aCA9PT0gMClcblx0XHRcdHJldHVybiAodGhpcy5fX2xvYWRDb3VudCA9PT0gMCk7XG5cblx0XHQvL0lmIHdlIHN0aWxsIGhhdmVuJ3QgcG9wcGVkIGFueSBmcm9tIHRoZSBhc3NldHMgbGlzdC4uLlxuXHRcdGlmICh0aGlzLnRhc2tzLmxlbmd0aCA9PT0gdGhpcy5hc3NldHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmxvYWRTdGFydGVkLmRpc3BhdGNoKCk7XG5cdFx0fVxuXG5cdFx0Ly9ncmFiIHRoZSBuZXh0IHRhc2sgb24gdGhlIHN0YWNrXG5cdFx0dmFyIG5leHRUYXNrID0gdGhpcy50YXNrcy5zaGlmdCgpO1xuXG5cdFx0Ly9hcHBseSB0aGUgbG9hZGluZyBzdGVwXG5cdFx0dmFyIGxvYWRlciA9IG5leHRUYXNrLmxvYWRlcjtcblxuXHRcdHZhciBjYiA9IHRoaXMuX19sb2FkQ2FsbGJhY2tGdW5jO1xuXG5cdFx0dmFyIG5ld1BhcmFtcyA9IFsgbmV4dFRhc2submFtZSwgY2IgXS5jb25jYXQobmV4dFRhc2sucGFyYW1zKTtcblx0XHRsb2FkZXIubG9hZEFzc2V0LmFwcGx5KHRoaXMsIG5ld1BhcmFtcyk7XG5cblx0XHRyZXR1cm4gKHRoaXMuX19sb2FkQ291bnQgPT09IDApO1xuXHR9XG59KTtcblxuLyoqXG4gKiBBIHNldCBvZiBsb2FkZXIgcGx1Z2lucyBmb3IgdGhpcyBhc3NldCBtYW5hZ2VyLiBUaGVzZSBtaWdodCBiZSBhcyBzaW1wbGVcbiAqIGFzIHB1c2hpbmcgSFRNTCBJbWFnZSBvYmplY3RzIGludG8gYSBUZXh0dXJlLCBvciBtb3JlIGNvbXBsZXggbGlrZSBkZWNvZGluZ1xuICogYSBjb21wcmVzc2VkLCBtaXAtbWFwcGVkLCBvciBjdWJlLW1hcCB0ZXh0dXJlLlxuICpcbiAqIFRoaXMgb2JqZWN0IGlzIGEgc2ltcGxlIGhhc2htYXAgb2YgbG93ZXItY2FzZSBleHRlbnNpb24gbmFtZXMgdG8gTG9hZGVyIGZ1bmN0aW9ucy5cbiAqIFxuICogQHByb3BlcnR5IGxvYWRlcnNcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cbkFzc2V0TWFuYWdlci5sb2FkZXJzID0ge307XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgbG9hZGVyIGZ1bmN0aW9uIHdpdGggdGhlIGdpdmVuIGV4dGVuc2lvbihzKS5cbiAqIFRoZSBmaXJzdCBwYXJhbWV0ZXIgaXMgYSBsb2FkZXIgZnVuY3Rpb24sIGFuZCBhbGwgc3Vic2VxdWVudFxuICogcGFyYW1ldGVycyBhcmUgbG93ZXItY2FzZSBleHRlbnNpb25zICh3aXRob3V0IHRoZSBwZXJpb2QpIHRoYXRcbiAqIHNob3VsZCBiZSBhc3NvY2lhdGVkIHdpdGggdGhhdCBsb2FkZXIuIFRoaXMgd2lsbCBvdmVycmlkZSBvdGhlclxuICogbG9hZGVycyBieSB0aGUgc2FtZSBleHRlbnNpb24uXG4gKlxuICogQnkgZGVmYXVsdCwgdGhlIGV4dGVuc2lvbnMgXCJwbmdcIiwgXCJqcGdcIiwgXCJqcGVnXCIsIGFuZCBcImdpZlwiIGFyZVxuICogcmVnaXN0ZXJlZCB0byB7eyNjcm9zc0xpbmsgXCJBc3NldE1hbmFnZXIvSW1hZ2VMb2FkZXI6YXR0cmlidXRlXCJ9fXt7L2Nyb3NzTGlua319LlxuICogXG4gKiBAbWV0aG9kIHJlZ2lzdGVyTG9hZGVyXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBsb2FkZXJGdW5jIHRoZSBsb2FkZXIgZnVuY3Rpb25cbiAqIEBwYXJhbSB7U3RyaW5nIC4uLn0gZXh0ZW5zaW9ucyBhIHZhcmlhYmxlIG51bWJlciBvZiBzdHJpbmdzXG4gKi9cbkFzc2V0TWFuYWdlci5yZWdpc3RlckxvYWRlciA9IGZ1bmN0aW9uKGxvYWRlckZ1bmMsIGV4dGVuc2lvbnMpIHtcblx0aWYgKGFyZ3VtZW50cy5sZW5ndGg9PT0wKVxuXHRcdHRocm93IFwibXVzdCBzcGVjaWZ5IGF0IGxlYXN0IG9uZSBleHRlbnNpb24gZm9yIHRoZSBsb2FkZXJcIjtcblx0dmFyIGV4dHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXHRmb3IgKHZhciBpPTA7IGk8ZXh0cy5sZW5ndGg7IGkrKykgXG5cdFx0QXNzZXRNYW5hZ2VyLmxvYWRlcnNbIGV4dHNbaV0gXSA9IGxvYWRlckZ1bmM7XG59O1xuXG4vKipcbiAqIEEgc2ltcGxlIHdyYXBwZXIgZm9yIGFzc2V0cyB3aGljaCB3aWxsIGJlIHBhc3NlZCBhbG9uZyB0byB0aGUgbG9hZGVyO1xuICogdGhpcyBpcyB1c2VkIGludGVybmFsbHkuXG4gKiBcbiAqIC8vQGNsYXNzIEFzc2V0TWFuYWdlci5EZXNjcmlwdG9yXG4gKi9cbkFzc2V0TWFuYWdlci5EZXNjcmlwdG9yID0gbmV3IENsYXNzKHtcblxuXHRuYW1lOiBudWxsLFxuXHRsb2FkZXI6IG51bGwsXG5cdHBhcmFtczogbnVsbCxcblx0c3RhdHVzOiBudWxsLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKG5hbWUsIGxvYWRlciwgcGFyYW1zKSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmxvYWRlciA9IGxvYWRlcjtcblx0XHR0aGlzLnBhcmFtcyA9IHBhcmFtcztcblx0XHR0aGlzLnN0YXR1cyA9IEFzc2V0TWFuYWdlci5TdGF0dXMuUVVFVUVEO1xuXHR9XG59KTtcblxuLy9UT0RPOiBkb2N1bWVudCB0aGlzXG4vKipcbiAqIERlZmluZXMgdGhlIHN0YXR1cyBvZiBhbiBhc3NldCBpbiB0aGUgbWFuYWdlciBxdWV1ZS5cbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cbkFzc2V0TWFuYWdlci5TdGF0dXMgPSB7XG5cdFFVRVVFRDogMCxcblx0TE9BRElORzogMSxcblx0TE9BRF9TVUNDRVNTOiAyLFxuXHRMT0FEX0ZBSUw6IDNcbn07XG5cblxuLy9UT0RPOiB1c2UgYSBiYXNlIGxvYWRlciBjbGFzczsgcHVsbCB0aGVzZSBvdXQgaW50byB0aGVpciBvd24gZmlsZXMgP1xuXG4vKipcbiAqIFRoaXMgaXMgdGhlIGRlZmF1bHQgaW1wbGVtZW50YXRpb24gb2YgYW4gaW1hZ2UgbG9hZGVyIHBsdWdpbiBmb3IgQXNzZXRNYW5hZ2VyLlxuICogVGhpcyB1c2VzIGEgRE9NIEltYWdlIG9iamVjdCB0byB1cGxvYWQgUE5HLCBHSUYgYW5kIEpQRyBpbWFnZXMgdG8gYSBXZWJHTFxuICogdGV4dHVyZS4gWW91IHdpbGwgbm90IG5lZWQgdG8gZGVhbCB3aXRoIHRoaXMgY2xhc3MgZGlyZWN0bHksIHVubGVzcyB5b3Ugd2FudFxuICogdG8gd3JpdGUgeW91ciBvd24gQXNzZXRNYW5hZ2VyIGxvYWRlcnMuXG4gKlxuICogQSBgTG9hZGVyYCB0eXBlIGZvciBBc3NldE1hbmFnZXIgaXMgc2ltcGx5IGFuIG9iamVjdCB3aGljaCBkZWZpbmVzIHR3byBtZXRob2RzOlxuICpcbiAqIC0gYGxvYWRBc3NldGA6IHRoaXMgaXMgdGhlIGxvYWRpbmcgZnVuY3Rpb24sIHdoaWNoIGhhbmRsZXMgdGhlIGFzeW5jaHJvbm91cyBsb2FkLlxuICogLSBgcHJvY2Vzc0FyZ3VtZW50c2A6IHRoaXMgaXMgZm9yIHRoZSB1c2VyJ3MgY29udmVuaWVuY2UsIGhhbmRsaW5nIGRlZmF1bHQgYXJndW1lbnRzXG4gKiBhbmQgZ2l2aW5nIGEgbWVhbmluZ2Z1bCByZXR1cm4gdmFsdWUuIFxuICogXG4gKiBAY2xhc3MgQXNzZXRNYW5hZ2VyLkltYWdlTG9hZGVyXG4gKi9cbkFzc2V0TWFuYWdlci5JbWFnZUxvYWRlciA9IHtcblx0XG5cdC8qKlxuXHQgKiBUaGlzIGlzIGEgXCJsb2FkZXIgZnVuY3Rpb25cIiB3aGljaCBoYW5kbGVzIHRoZSBhc3luY2hyb25vdXNcblx0ICogbG9hZGluZyBmb3IgYW4gYXNzZXQuIFRoZSBmdW5jdGlvbiBtdXN0IGJlIGltcGxlbWVudGVkIGluIGEgdmVyeVxuXHQgKiBzdHJpY3QgbWFubmVyIGZvciB0aGUgYXNzZXQgbWFuYWdlciB0byB3b3JrIGNvcnJlY3RseS5cblx0ICpcblx0ICogVGhlIGZpcnN0IHBhcmFtZXRlciBwYXNzZWQgdG8gdGhpcyBmdW5jdGlvbiBpcyB0aGUgbmFtZSBvZiB0aGVcblx0ICogYXNzZXQgYmVpbmcgbG9hZGVkLiBUaGUgc2Vjb25kIHBhcmFtZXRlciBpcyBhIGNhbGxiYWNrIHRoYXQgbXVzdFxuXHQgKiBiZSBpbnZva2VkIGFmdGVyIHRoZSBhc3luYyB0YXNrIGlzIGNvbXBsZXRlZC5cblx0ICogQW55IHN1YnNlcXVlbnQgcGFyYW1ldGVycyBhcmUgdGhvc2UgdGhhdCBjYW1lIGZyb20gdGhlIGluaXRhbCBjYWxsXG5cdCAqIHRvIHt7I2Nyb3NzTGluayBcIkFzc2V0TWFuYWdlci9sb2FkOm1ldGhvZFwifX1Bc3NldE1hbmFnZXIubG9hZHt7L2Nyb3NzTGlua319LiBcblx0ICpcblx0ICogT25jZSB0aGUgc3luY2hyb25vdXMgb3IgYXN5bmNocm9ub3VzIGxvYWRpbmcgdGFzayBpcyBjb21wbGV0ZWQsIHRoZVxuXHQgKiBgZmluaXNoZWRgIGNhbGxiYWNrIG11c3QgYmUgaW52b2tlZCB3aXRoIHR3byBwYXJhbWV0ZXJzOiBmaXJzdCwgdGhlXG5cdCAqIGBuYW1lYCBvZiB0aGUgYXNzZXQgYXMgcGFzc2VkIHRvIHRoaXMgbG9hZGVyLiBBbmQgc2Vjb25kLCBhIGJvb2xlYW4gaW5kaWNhdGluZ1xuXHQgKiB0aGUgYHN1Y2Nlc3NgIG9mIHRoZSBsb2FkIG9wZXJhdGlvbi4gXG5cdCAqXG5cdCAqIElmIHlvdSBkb24ndCBpbnZva2UgdGhlIGNhbGxiYWNrLCB0aGUgYXNzZXQgbWFuYWdlciBtYXkgbmV2ZXIgZmluaXNoIGxvYWRpbmcuXG5cdCAqIFxuXHQgKiBAbWV0aG9kIGxvYWRBc3NldFxuXHQgKiBAc3RhdGljXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgbmFtZSBvZiB0aGUgYXNzZXQgdG8gbG9hZFxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmaW5pc2hlZCB0aGUgZnVuY3Rpb24gdG8gY2FsbCB3aGVuIGFzeW5jIGxvYWRpbmcgaXMgY29tcGxldGVcblx0ICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIHRvIG9wZXJhdGUgb24gZm9yIHRoaXMgYXNzZXRcblx0ICogQHBhcmFtIHtTdHJpbmd9IHBhdGggdGhlIG9wdGlvbmFsIGltYWdlIHBhdGggdG8gdXNlIGluc3RlYWQgb2YgdGhlIGBuYW1lYCBwYXJhbWV0ZXJcblx0ICovXG5cdGxvYWRBc3NldDogZnVuY3Rpb24obmFtZSwgZmluaXNoZWQsIHRleHR1cmUsIHBhdGgpIHtcblx0XHRpZiAoIXRleHR1cmUpIHtcblx0XHRcdHRocm93IFwibm8gdGV4dHVyZSBvYmplY3Qgc3BlY2lmaWVkIHRvIHRoZSBJbWFnZUxvYWRlciBmb3IgYXNzZXQgbWFuYWdlclwiO1xuXHRcdH1cblxuXHRcdC8vaWYgcGF0aCBpcyB1bmRlZmluZWQsIHVzZSB0aGUgYXNzZXQgbmFtZSBhbmQgXG5cdFx0Ly9hc3N1bWUgaXRzIGEgcGF0aC5cblx0XHRwYXRoID0gcGF0aCB8fCBuYW1lO1xuXG5cdFx0dmFyIGltZyA9IG5ldyBJbWFnZSgpO1xuXG5cdFx0aW1nLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0aW1nLm9uZXJyb3IgPSBpbWcub25hYm9ydCA9IG51bGw7IC8vY2xlYXIgb3RoZXIgbGlzdGVuZXJzXG5cdFx0XHR0ZXh0dXJlLnVwbG9hZEltYWdlKGltZyk7XG5cdFx0XHRmaW5pc2hlZChuYW1lLCB0cnVlKTtcblx0XHR9O1xuXHRcdGltZy5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRpbWcub25sb2FkID0gaW1nLm9uYWJvcnQgPSBudWxsO1xuXHRcdFx0Y29uc29sZS53YXJuKFwiRXJyb3IgbG9hZGluZyBpbWFnZTogXCIrcGF0aCk7XG5cdFx0XHQvL1dlIHVzZSBudWxsIGRhdGEgdG8gYXZvaWQgV2ViR0wgZXJyb3JzXG5cdFx0XHQvL1RPRE86IGhhbmRsZSBmYWlsIG1vcmUgc21vb3RobHksIGkuZS4gd2l0aCBhIGNhbGxiYWNrXG5cdFx0XHQvL1RPRE86IFNob3VsZCB0aGlzIGJlIHB1cmUgYmxhY2ssIG9yIHB1cmVseSB0cmFuc3BhcmVudD9cblx0XHRcdHRleHR1cmUudXBsb2FkRGF0YSgxLCAxKTsgXG5cdFx0XHRmaW5pc2hlZChuYW1lLCBmYWxzZSk7XG5cdFx0fTtcblx0XHRpbWcub25hYm9ydCA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0aW1nLm9ubG9hZCA9IGltZy5vbmVycm9yID0gbnVsbDtcblx0XHRcdGNvbnNvbGUud2FybihcIkFib3J0ZWQgaW1hZ2U6IFwiK3BhdGgpO1xuXHRcdFx0Ly9XZSB1c2UgbnVsbCBkYXRhIHRvIGF2b2lkIFdlYkdMIGVycm9yc1xuXHRcdFx0dGV4dHVyZS51cGxvYWREYXRhKDEsIDEpO1xuXHRcdFx0ZmluaXNoZWQobmFtZSwgZmFsc2UpO1xuXHRcdH07XG5cblx0XHQvL3NldHVwIHNvdXJjZVxuXHRcdGltZy5zcmMgPSBwYXRoO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgZnJvbSBcblx0ICoge3sjY3Jvc3NMaW5rIFwiQXNzZXRNYW5hZ2VyL2xvYWQ6bWV0aG9kXCJ9fUFzc2V0TWFuYWdlci5sb2Fke3svY3Jvc3NMaW5rfX0gdG9cblx0ICogcHJvY2VzcyB0aGUgYXJndW1lbnRzIGFuZCBzZXR1cCBhbnkgZGVmYXVsdCB2YWx1ZXMuIFRoaXMgaXMgYWxzbyByZXNwb25zaWJsZSBmb3Jcblx0ICogZGV0ZXJtaW5pbmcgdGhlIGFwcHJvcHJpYXRlIHJldHVybiB2YWx1ZSBmb3IgdGhlIGxvYWQgZnVuY3Rpb24uIEluIHRoZSBjYXNlIG9mXG5cdCAqIGBJbWFnZUxvYWRlcmAsIHdlIHJldHVybiB0aGUgVGV4dHVyZSB0aGF0IHdhcyBwYXNzZWQgdG8gdGhlIGxvYWQoKSBmdW5jdGlvbiwgb3Jcblx0ICogYSBuZXcgVGV4dHVyZSBvYmplY3QgaWYgbm9uZSB3YXMgZ2l2ZW4uIFRoaXMgd2F5LCB0aGUgdXNlciBjYW4gd3JpdGUgY29kZSBsaWtlIHRoaXM6XG5cdCAqXG5cdCAqICAgICAgIHZhciB0ZXh0dXJlID0gYXNzZXRNYW5hZ2VyLmxvYWQoXCJpbWcucG5nXCIpOyAvL3JldHVybnMgbmV3IFRleHR1cmVcblx0ICpcblx0ICogVGhlIGZpcnN0IGFyZ3VtZW50IGlzIHRoZSBuYW1lIG9mIHRoZSBhc3NldCBiZWluZyBwcm9jZXNzZWQuIFRoZSBzZWNvbmQgYXJndW1lbnRcblx0ICogaXMgYW4gYXJyYXkgb2YgYXJndW1lbnRzIHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gdGhlIGxvYWRlciBmdW5jdGlvbi5cblx0ICogXG5cdCAqIFRoZSBtZXRob2QgaXMgY2FsbGVkIGJvdW5kIHRvIHRoZSBBc3NldE1hbmFnZXIsIHNvIHdlIGNhbiBhY2Nlc3MgV2ViR0xDb250ZXh0XG5cdCAqIHdpdGggXCJ0aGlzLmNvbnRleHRcIi5cblx0ICpcblx0ICogQG1ldGhvZCAgcHJvY2Vzc0FyZ3VtZW50c1xuXHQgKiBAc3RhdGljXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgYXNzZXQgbmFtZVxuXHQgKiBAcGFyYW0gIHtBcnJheX0gcGFyYW1zIGFuIGFycmF5IG9mIHBhcmFtZXRlcnMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gbG9hZCB0aGUgYXNzZXRcblx0ICogQHJldHVybiB7YW55fSB0aGUgb2JqZWN0IHRoZSB1c2VyIG1heSBleHBlY3QgZnJvbSB0aGUgbG9hZGVyLCBpbiB0aGlzIGNhc2UgYSBUZXh0dXJlIG9iamVjdFxuXHQgKi9cblx0cHJvY2Vzc0FyZ3VtZW50czogZnVuY3Rpb24obmFtZSwgcGFyYW1zKSB7XG5cdFx0Ly90aGUgZmlyc3QgcGFyYW1ldGVyIGlzIGEgdGV4dHVyZS4uLiBpZiBub3Qgc3BlY2lmaWVkLCB3ZSBuZWVkIHRvIGFzc2lnbiBpdCBhIG5ldyBvYmplY3Rcblx0XHRpZiAocGFyYW1zLmxlbmd0aCA9PT0gMCB8fCAhcGFyYW1zWzBdKVxuXHRcdFx0cmV0dXJuIChwYXJhbXNbMF0gPSBuZXcgVGV4dHVyZSh0aGlzLmNvbnRleHQpKTtcblx0XHRlbHNlXG5cdFx0XHRyZXR1cm4gcGFyYW1zWzBdO1xuXHR9XG59O1xuXG5cdFxuXG5cbi8vIFJlZ2lzdGVyIG91ciBkZWZhdWx0IGxvYWRlcnMuLi5cblxuQXNzZXRNYW5hZ2VyLnJlZ2lzdGVyTG9hZGVyKEFzc2V0TWFuYWdlci5JbWFnZUxvYWRlciwgXCJwbmdcIiwgXCJnaWZcIiwgXCJqcGdcIiwgXCJqcGVnXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFzc2V0TWFuYWdlcjtcbiIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxuLy8gUmVxdWlyZXMuLi4uXG52YXIgQ2xhc3MgICAgICAgICA9IHJlcXVpcmUoJ2tsYXNzZScpO1xuXG52YXIgQWJzdHJhY3RCYXRjaCA9IHJlcXVpcmUoJy4vQWJzdHJhY3RCYXRjaCcpO1xuXG52YXIgTWVzaCAgICAgICAgICA9IHJlcXVpcmUoJy4vZ2x1dGlscy9NZXNoJyk7XG52YXIgU2hhZGVyUHJvZ3JhbSA9IHJlcXVpcmUoJy4vZ2x1dGlscy9TaGFkZXJQcm9ncmFtJyk7XG5cblxuLyoqXG4gKiBBIGJhc2ljIGltcGxlbWVudGF0aW9uIG9mIGEgYmF0Y2hlciB3aGljaCBkcmF3cyAyRCBzcHJpdGVzLlxuICogVGhpcyB1c2VzIHR3byB0cmlhbmdsZXMgKHF1YWRzKSB3aXRoIGluZGV4ZWQgYW5kIGludGVybGVhdmVkXG4gKiB2ZXJ0ZXggZGF0YS4gRWFjaCB2ZXJ0ZXggaG9sZHMgNSBmbG9hdHMgKFBvc2l0aW9uLnh5LCBDb2xvciwgVGV4Q29vcmQwLnh5KS5cbiAqXG4gKiBUaGUgY29sb3IgaXMgcGFja2VkIGludG8gYSBzaW5nbGUgZmxvYXQgdG8gcmVkdWNlIHZlcnRleCBiYW5kd2lkdGgsIGFuZFxuICogdGhlIGRhdGEgaXMgaW50ZXJsZWF2ZWQgZm9yIGJlc3QgcGVyZm9ybWFuY2UuIFdlIHVzZSBhIHN0YXRpYyBpbmRleCBidWZmZXIsXG4gKiBhbmQgYSBkeW5hbWljIHZlcnRleCBidWZmZXIgdGhhdCBpcyB1cGRhdGVkIHdpdGggYnVmZmVyU3ViRGF0YS4gXG4gKiBcbiAqIEBleGFtcGxlXG4gKiAgICAgIHZhciBTcHJpdGVCYXRjaCA9IHJlcXVpcmUoJ2thbWknKS5TcHJpdGVCYXRjaDsgIFxuICogICAgICBcbiAqICAgICAgLy9jcmVhdGUgYSBuZXcgYmF0Y2hlclxuICogICAgICB2YXIgYmF0Y2ggPSBuZXcgU3ByaXRlQmF0Y2goY29udGV4dCk7XG4gKlxuICogICAgICBmdW5jdGlvbiByZW5kZXIoKSB7XG4gKiAgICAgICAgICBiYXRjaC5iZWdpbigpO1xuICogICAgICAgICAgXG4gKiAgICAgICAgICAvL2RyYXcgc29tZSBzcHJpdGVzIGluIGJldHdlZW4gYmVnaW4gYW5kIGVuZC4uLlxuICogICAgICAgICAgYmF0Y2guZHJhdyggdGV4dHVyZSwgMCwgMCwgMjUsIDMyICk7XG4gKiAgICAgICAgICBiYXRjaC5kcmF3KCB0ZXh0dXJlMSwgMCwgMjUsIDQyLCAyMyApO1xuICogXG4gKiAgICAgICAgICBiYXRjaC5lbmQoKTtcbiAqICAgICAgfVxuICogXG4gKiBAY2xhc3MgIFNwcml0ZUJhdGNoXG4gKiBAZXh0ZW5kcyBBYnN0cmFjdEJhdGNoXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7V2ViR0xDb250ZXh0fSBjb250ZXh0IHRoZSBjb250ZXh0IGZvciB0aGlzIGJhdGNoXG4gKiBAcGFyYW0ge051bWJlcn0gc2l6ZSB0aGUgbWF4IG51bWJlciBvZiBzcHJpdGVzIHRvIGZpdCBpbiBhIHNpbmdsZSBiYXRjaFxuICovXG52YXIgU3ByaXRlQmF0Y2ggPSBuZXcgQ2xhc3Moe1xuXG5cdEV4dGVuZHM6IEFic3RyYWN0QmF0Y2gsXG5cblx0Ly9Db25zdHJ1Y3RvclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBTcHJpdGVCYXRjaChjb250ZXh0LCBzaXplKSB7XG5cdFx0QWJzdHJhY3RCYXRjaC5jYWxsKHRoaXMsIGNvbnRleHQsIHNpemUpO1xuXG5cdFx0LyoqXG5cdFx0ICogU3ByaXRlQmF0Y2ggdXBsb2FkcyBhIHZlYzIgZm9yIHByb2plY3Rpb25cblx0XHQgKiB0cmFuc2Zvcm0gaW4gdGhlIHNoYWRlci4gQSBjdXN0b20gc2hhZGVyIG1pZ2h0XG5cdFx0ICogdXNlIGEgbWF0cml4IG9yIHNvbWUgb3RoZXIgbWVhbnMgb2YgY2FsY3VsYXRpbmcgXG5cdFx0ICogcHJvamVjdGlvbjsgaW4gd2hpY2ggY2FzZSB0aGlzIHNob3VsZCBiZSBzZXQgdG8gZmFsc2UuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IHVzZVByb2plY3Rpb25WZWN0b3Jcblx0XHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0XHQgKiBAZGVmYXVsdCAgdHJ1ZVxuXHRcdCAqL1xuXHRcdHRoaXMudXNlUHJvamVjdGlvblZlY3RvciA9IHRydWU7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgcHJvamVjdGlvbiBGbG9hdDMyQXJyYXkgdmVjMiB3aGljaCBpc1xuXHRcdCAqIHVzZWQgdG8gYXZvaWQgc29tZSBtYXRyaXggY2FsY3VsYXRpb25zLiBBIDNEIFxuXHRcdCAqIGJhdGNoZXIgbWlnaHQgd2FudCB0byByZXBsYWNlIHRoaXMgYW5kIFxuXHRcdCAqIHt7I2Nyb3NzTGluayBcIlNwcml0ZUJhdGNoL3NldFByb2plY3Rpb246bWV0aG9kXCJ9fXt7L2Nyb3NzTGlua319IFxuXHRcdCAqIGVudGlyZWx5LiBcblx0XHQgKlxuXHRcdCAqIEBwcm9wZXJ0eSBwcm9qZWN0aW9uXG5cdFx0ICogQHR5cGUge0Zsb2F0MzJBcnJheX1cblx0XHQgKi9cblx0XHR0aGlzLnByb2plY3Rpb24gPSBuZXcgRmxvYXQzMkFycmF5KDIpO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIGN1cnJlbnRseSBib3VuZCB0ZXh0dXJlLiBEbyBub3QgbW9kaWZ5LlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB7VGV4dHVyZX0gdGV4dHVyZVxuXHRcdCAqIEByZWFkT25seVxuXHRcdCAqL1xuXHRcdHRoaXMudGV4dHVyZSA9IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2YgZmxvYXRzIHBlciB2ZXJ0ZXggZm9yIHRoaXMgYmF0Y2hlciBcblx0ICogKFBvc2l0aW9uLnh5ICsgQ29sb3IgKyBUZXhDb29yZDAueHkpLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBnZXRWZXJ0ZXhTaXplXG5cdCAqIEByZXR1cm4ge051bWJlcn0gdGhlIG51bWJlciBvZiBmbG9hdHMgcGVyIHZlcnRleFxuXHQgKi9cblx0Z2V0VmVydGV4U2l6ZTogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIFNwcml0ZUJhdGNoLlZFUlRFWF9TSVpFO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBVc2VkIGludGVybmFsbHkgdG8gcmV0dXJuIHRoZSBQb3NpdGlvbiwgQ29sb3IsIGFuZCBUZXhDb29yZDAgYXR0cmlidXRlcy5cblx0ICpcblx0ICogQG1ldGhvZCAgX2NyZWF0ZVZlcnRleEF0dHJpYnVldHNcblx0ICogQHByb3RlY3RlZFxuXHQgKiBAcmV0dXJuIHtbdHlwZV19IFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdF9jcmVhdGVWZXJ0ZXhBdHRyaWJ1dGVzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cblx0XHRyZXR1cm4gWyBcblx0XHRcdG5ldyBNZXNoLkF0dHJpYihcIlBvc2l0aW9uXCIsIDIpLFxuXHRcdFx0IC8vcGFjayB0aGUgY29sb3IgdXNpbmcgc29tZSBjcmF6eSB3aXphcmRyeSBcblx0XHRcdG5ldyBNZXNoLkF0dHJpYihcIkNvbG9yXCIsIDQsIG51bGwsIGdsLlVOU0lHTkVEX0JZVEUsIHRydWUsIDEpLFxuXHRcdFx0bmV3IE1lc2guQXR0cmliKFwiVGV4Q29vcmQwXCIsIDIpXG5cdFx0XTtcblx0fSxcblxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBwcm9qZWN0aW9uIHZlY3RvciwgYW4geCBhbmQgeVxuXHQgKiBkZWZpbmluZyB0aGUgbWlkZGxlIHBvaW50cyBvZiB5b3VyIHN0YWdlLlxuXHQgKlxuXHQgKiBAbWV0aG9kIHNldFByb2plY3Rpb25cblx0ICogQHBhcmFtIHtOdW1iZXJ9IHggdGhlIHggcHJvamVjdGlvbiB2YWx1ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0geSB0aGUgeSBwcm9qZWN0aW9uIHZhbHVlXG5cdCAqL1xuXHRzZXRQcm9qZWN0aW9uOiBmdW5jdGlvbih4LCB5KSB7XG5cdFx0dmFyIG9sZFggPSB0aGlzLnByb2plY3Rpb25bMF07XG5cdFx0dmFyIG9sZFkgPSB0aGlzLnByb2plY3Rpb25bMV07XG5cdFx0dGhpcy5wcm9qZWN0aW9uWzBdID0geDtcblx0XHR0aGlzLnByb2plY3Rpb25bMV0gPSB5O1xuXG5cdFx0Ly93ZSBuZWVkIHRvIGZsdXNoIHRoZSBiYXRjaC4uXG5cdFx0aWYgKHRoaXMuZHJhd2luZyAmJiAoeCAhPSBvbGRYIHx8IHkgIT0gb2xkWSkpIHtcblx0XHRcdHRoaXMuZmx1c2goKTtcblx0XHRcdHRoaXMuX3VwZGF0ZU1hdHJpY2VzKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgZGVmYXVsdCBzaGFkZXIgZm9yIHRoaXMgYmF0Y2guXG5cdCAqXG5cdCAqIEBtZXRob2QgIF9jcmVhdGVTaGFkZXJcblx0ICogQHByb3RlY3RlZFxuXHQgKiBAcmV0dXJuIHtTaGFkZXJQcm9ncmFtfSBhIG5ldyBpbnN0YW5jZSBvZiBTaGFkZXJQcm9ncmFtXG5cdCAqL1xuXHRfY3JlYXRlU2hhZGVyOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgc2hhZGVyID0gbmV3IFNoYWRlclByb2dyYW0odGhpcy5jb250ZXh0LFxuXHRcdFx0XHRTcHJpdGVCYXRjaC5ERUZBVUxUX1ZFUlRfU0hBREVSLCBcblx0XHRcdFx0U3ByaXRlQmF0Y2guREVGQVVMVF9GUkFHX1NIQURFUik7XG5cdFx0aWYgKHNoYWRlci5sb2cpXG5cdFx0XHRjb25zb2xlLndhcm4oXCJTaGFkZXIgTG9nOlxcblwiICsgc2hhZGVyLmxvZyk7XG5cdFx0cmV0dXJuIHNoYWRlcjtcblx0fSxcblxuXHQvKipcblx0ICogVGhpcyBpcyBjYWxsZWQgZHVyaW5nIHJlbmRlcmluZyB0byB1cGRhdGUgcHJvamVjdGlvbi90cmFuc2Zvcm1cblx0ICogbWF0cmljZXMgYW5kIHVwbG9hZCB0aGUgbmV3IHZhbHVlcyB0byB0aGUgc2hhZGVyLiBGb3IgZXhhbXBsZSxcblx0ICogaWYgdGhlIHVzZXIgY2FsbHMgc2V0UHJvamVjdGlvbiBtaWQtZHJhdywgdGhlIGJhdGNoIHdpbGwgZmx1c2hcblx0ICogYW5kIHRoaXMgd2lsbCBiZSBjYWxsZWQgYmVmb3JlIGNvbnRpbnVpbmcgdG8gYWRkIGl0ZW1zIHRvIHRoZSBiYXRjaC5cblx0ICpcblx0ICogWW91IGdlbmVyYWxseSBzaG91bGQgbm90IG5lZWQgdG8gY2FsbCB0aGlzIGRpcmVjdGx5LlxuXHQgKiBcblx0ICogQG1ldGhvZCAgdXBkYXRlTWF0cmljZXNcblx0ICogQHByb3RlY3RlZFxuXHQgKi9cblx0dXBkYXRlTWF0cmljZXM6IGZ1bmN0aW9uKCkge1xuXHRcdC8vYW4gZXh0ZW5zaW9uIG9mIFNwcml0ZUJhdGNoIG1pZ2h0IHdhbnQgdG8gc3VwcG9ydCBmdWxsIHRyYW5zZm9ybSAmXG5cdFx0Ly9wcm9qZWN0aW9uIG1hdHJpY2VzIGZvciAzRCBiaWxsYm9hcmRzLiBpZiBzbywgb3ZlcnJpZGUgdGhpcyBtZXRob2Rcblx0XHRpZiAodGhpcy51c2VQcm9qZWN0aW9uVmVjdG9yKVxuXHRcdFx0dGhpcy5zaGFkZXIuc2V0VW5pZm9ybWZ2KFwidV9wcm9qZWN0aW9uXCIsIHRoaXMucHJvamVjdGlvbik7XG5cdH0sXG5cblx0LyoqXG5cdCAqIENhbGxlZCBiZWZvcmUgcmVuZGVyaW5nLCBhbmQgYmluZHMgdGhlIGN1cnJlbnQgdGV4dHVyZS5cblx0ICogXG5cdCAqIEBtZXRob2QgX3ByZVJlbmRlclxuXHQgKiBAcHJvdGVjdGVkXG5cdCAqL1xuXHRfcHJlUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy50ZXh0dXJlKVxuXHRcdFx0dGhpcy50ZXh0dXJlLmJpbmQoKTtcblx0fSxcblxuXHQvKipcblx0ICogQmluZHMgdGhlIHNoYWRlciwgZGlzYWJsZXMgZGVwdGggd3JpdGluZywgXG5cdCAqIGVuYWJsZXMgYmxlbmRpbmcsIGFjdGl2YXRlcyB0ZXh0dXJlIHVuaXQgMCwgYW5kIHNlbmRzXG5cdCAqIGRlZmF1bHQgbWF0cmljZXMgYW5kIHNhbXBsZXIyRCB1bmlmb3JtcyB0byB0aGUgc2hhZGVyLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBiZWdpblxuXHQgKi9cblx0YmVnaW46IGZ1bmN0aW9uKCkge1xuXHRcdC8vc3ByaXRlIGJhdGNoIGRvZXNuJ3QgaG9sZCBhIHJlZmVyZW5jZSB0byBHTCBzaW5jZSBpdCBpcyB2b2xhdGlsZVxuXHRcdHZhciBnbCA9IHRoaXMuY29udGV4dC5nbDtcblx0XHRcblx0XHQvL2p1c3QgZG8gZGlyZWN0IHBhcmVudCBjYWxsIGZvciBzcGVlZCBoZXJlXG5cdFx0Ly9UaGlzIGJpbmRzIHRoZSBzaGFkZXIgYW5kIG1lc2ghXG5cdFx0QWJzdHJhY3RCYXRjaC5wcm90b3R5cGUuYmVnaW4uY2FsbCh0aGlzKTtcblxuXHRcdHRoaXMudXBkYXRlTWF0cmljZXMoKTsgLy9zZW5kIHByb2plY3Rpb24vdHJhbnNmb3JtIHRvIHNoYWRlclxuXG5cdFx0Ly91cGxvYWQgdGhlIHNhbXBsZXIgdW5pZm9ybS4gbm90IG5lY2Vzc2FyeSBldmVyeSBmbHVzaCBzbyB3ZSBqdXN0XG5cdFx0Ly9kbyBpdCBoZXJlLlxuXHRcdHRoaXMuc2hhZGVyLnNldFVuaWZvcm1pKFwidV90ZXh0dXJlMFwiLCAwKTtcblxuXHRcdC8vZGlzYWJsZSBkZXB0aCBtYXNrXG5cdFx0Z2wuZGVwdGhNYXNrKGZhbHNlKTtcblxuXHRcdC8vcHJlbXVsdGlwbGllZCBhbHBoYVxuXHRcdGlmICh0aGlzLl9ibGVuZEVuYWJsZWQpIHtcblx0XHRcdGdsLmVuYWJsZShnbC5CTEVORCk7XG5cblx0XHRcdC8vc2V0IGVpdGhlciB0byAtMSBpZiB5b3Ugd2FudCB0byBjYWxsIHlvdXIgb3duIFxuXHRcdFx0Ly9ibGVuZEZ1bmMgb3IgYmxlbmRGdW5jU2VwYXJhdGVcblx0XHRcdGlmICh0aGlzLl9ibGVuZFNyYyAhPT0gLTEgJiYgdGhpcy5fYmxlbmREc3QgIT09IC0xKVxuXHRcdFx0XHRnbC5ibGVuZEZ1bmModGhpcy5fYmxlbmRTcmMsIHRoaXMuX2JsZW5kRHN0KTsgXG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBFbmRzIHRoZSBzcHJpdGUgYmF0Y2hlciBhbmQgZmx1c2hlcyBhbnkgcmVtYWluaW5nIGRhdGEgdG8gdGhlIEdQVS5cblx0ICogXG5cdCAqIEBtZXRob2QgZW5kXG5cdCAqL1xuXHRlbmQ6IGZ1bmN0aW9uKCkge1xuXHRcdC8vc3ByaXRlIGJhdGNoIGRvZXNuJ3QgaG9sZCBhIHJlZmVyZW5jZSB0byBHTCBzaW5jZSBpdCBpcyB2b2xhdGlsZVxuXHRcdHZhciBnbCA9IHRoaXMuY29udGV4dC5nbDtcblx0XHRcblx0XHQvL2p1c3QgZG8gZGlyZWN0IHBhcmVudCBjYWxsIGZvciBzcGVlZCBoZXJlXG5cdFx0Ly9UaGlzIGJpbmRzIHRoZSBzaGFkZXIgYW5kIG1lc2ghXG5cdFx0QWJzdHJhY3RCYXRjaC5wcm90b3R5cGUuZW5kLmNhbGwodGhpcyk7XG5cblx0XHRnbC5kZXB0aE1hc2sodHJ1ZSk7XG5cblx0XHRpZiAodGhpcy5fYmxlbmRFbmFibGVkKVxuXHRcdFx0Z2wuZGlzYWJsZShnbC5CTEVORCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEZsdXNoZXMgdGhlIGJhdGNoIHRvIHRoZSBHUFUuIFRoaXMgc2hvdWxkIGJlIGNhbGxlZCB3aGVuXG5cdCAqIHN0YXRlIGNoYW5nZXMsIHN1Y2ggYXMgYmxlbmQgZnVuY3Rpb25zLCBkZXB0aCBvciBzdGVuY2lsIHN0YXRlcyxcblx0ICogc2hhZGVycywgYW5kIHNvIGZvcnRoLlxuXHQgKiBcblx0ICogQG1ldGhvZCBmbHVzaFxuXHQgKi9cblx0Zmx1c2g6IGZ1bmN0aW9uKCkge1xuXHRcdC8vaWdub3JlIGZsdXNoIGlmIHRleHR1cmUgaXMgbnVsbCBvciBvdXIgYmF0Y2ggaXMgZW1wdHlcblx0XHRpZiAoIXRoaXMudGV4dHVyZSlcblx0XHRcdHJldHVybjtcblx0XHRpZiAodGhpcy5pZHggPT09IDApXG5cdFx0XHRyZXR1cm47XG5cdFx0QWJzdHJhY3RCYXRjaC5wcm90b3R5cGUuZmx1c2guY2FsbCh0aGlzKTtcblx0XHRTcHJpdGVCYXRjaC50b3RhbFJlbmRlckNhbGxzKys7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEFkZHMgYSBzcHJpdGUgdG8gdGhpcyBiYXRjaC4gVGhlIHNwcml0ZSBpcyBkcmF3biBpbiBcblx0ICogc2NyZWVuLXNwYWNlIHdpdGggdGhlIG9yaWdpbiBhdCB0aGUgdXBwZXItbGVmdCBjb3JuZXIgKHktZG93bikuXG5cdCAqXG5cdCAqIEBtZXRob2QgZHJhd1xuXHQgKiBAcGFyYW0gIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIGZvciB0aGlzIHNwcml0ZVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHggICAgICAgdGhlIHggcG9zaXRpb24gaW4gcGl4ZWxzLCBkZWZhdWx0cyB0byB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0geSAgICAgICB0aGUgeSBwb3NpdGlvbiBpbiBwaXhlbHMsIGRlZmF1bHRzIHRvIHplcm9cblx0ICogQHBhcmFtICB7TnVtYmVyfSB3aWR0aCAgIHRoZSB3aWR0aCBpbiBwaXhlbHMsIGRlZmF1bHRzIHRvIHRoZSB0ZXh0dXJlIHdpZHRoXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0ICB0aGUgaGVpZ2h0IGluIHBpeGVscywgZGVmYXVsdHMgdG8gdGhlIHRleHR1cmUgaGVpZ2h0XG5cdCAqIEBwYXJhbSAge051bWJlcn0gdTEgICAgICB0aGUgZmlyc3QgVSBjb29yZGluYXRlLCBkZWZhdWx0IHplcm9cblx0ICogQHBhcmFtICB7TnVtYmVyfSB2MSAgICAgIHRoZSBmaXJzdCBWIGNvb3JkaW5hdGUsIGRlZmF1bHQgemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHUyICAgICAgdGhlIHNlY29uZCBVIGNvb3JkaW5hdGUsIGRlZmF1bHQgb25lXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdjIgICAgICB0aGUgc2Vjb25kIFYgY29vcmRpbmF0ZSwgZGVmYXVsdCBvbmVcblx0ICovXG5cdGRyYXc6IGZ1bmN0aW9uKHRleHR1cmUsIHgsIHksIHdpZHRoLCBoZWlnaHQsIHUxLCB2MSwgdTIsIHYyKSB7XG5cdFx0aWYgKCF0aGlzLmRyYXdpbmcpXG5cdFx0XHR0aHJvdyBcIklsbGVnYWwgU3RhdGU6IHRyeWluZyB0byBkcmF3IGEgYmF0Y2ggYmVmb3JlIGJlZ2luKClcIjtcblx0XHRcblx0XHQvL2Rvbid0IGRyYXcgYW55dGhpbmcgaWYgR0wgdGV4IGRvZXNuJ3QgZXhpc3QuLlxuXHRcdGlmICghdGV4dHVyZSlcblx0XHRcdHJldHVybjtcblx0XHRcblx0XHRpZiAodGhpcy50ZXh0dXJlID09PSBudWxsIHx8IHRoaXMudGV4dHVyZS5pZCAhPT0gdGV4dHVyZS5pZCkge1xuXHRcdFx0Ly9uZXcgdGV4dHVyZS4uIGZsdXNoIHByZXZpb3VzIGRhdGFcblx0XHRcdHRoaXMuZmx1c2goKTtcblx0XHRcdHRoaXMudGV4dHVyZSA9IHRleHR1cmU7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmlkeCA9PSB0aGlzLnZlcnRpY2VzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5mbHVzaCgpOyAvL3dlJ3ZlIHJlYWNoZWQgb3VyIG1heCwgZmx1c2ggYmVmb3JlIHB1c2hpbmcgbW9yZSBkYXRhXG5cdFx0fVxuXG5cdFx0d2lkdGggPSAod2lkdGg9PT0wKSA/IHdpZHRoIDogKHdpZHRoIHx8IHRleHR1cmUud2lkdGgpO1xuXHRcdGhlaWdodCA9IChoZWlnaHQ9PT0wKSA/IGhlaWdodCA6IChoZWlnaHQgfHwgdGV4dHVyZS5oZWlnaHQpO1xuXHRcdHggPSB4IHx8IDA7XG5cdFx0eSA9IHkgfHwgMDtcblxuXHRcdHZhciB4MSA9IHg7XG5cdFx0dmFyIHgyID0geCArIHdpZHRoO1xuXHRcdHZhciB5MSA9IHk7XG5cdFx0dmFyIHkyID0geSArIGhlaWdodDtcblxuXHRcdHUxID0gdTEgfHwgMDtcblx0XHR1MiA9ICh1Mj09PTApID8gdTIgOiAodTIgfHwgMSk7XG5cdFx0djEgPSB2MSB8fCAwO1xuXHRcdHYyID0gKHYyPT09MCkgPyB2MiA6ICh2MiB8fCAxKTtcblxuXHRcdHZhciBjID0gdGhpcy5jb2xvcjtcblxuXHRcdC8veHlcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geDE7XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHkxO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gYztcblx0XHQvL3V2XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHUxO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2MTtcblx0XHRcblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHgyO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB5MTtcblx0XHQvL2NvbG9yXG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IGM7XG5cdFx0Ly91dlxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB1Mjtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdjE7XG5cblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHgyO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB5Mjtcblx0XHQvL2NvbG9yXG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IGM7XG5cdFx0Ly91dlxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB1Mjtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdjI7XG5cblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHgxO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB5Mjtcblx0XHQvL2NvbG9yXG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IGM7XG5cdFx0Ly91dlxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB1MTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdjI7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEFkZHMgYSBzaW5nbGUgcXVhZCBtZXNoIHRvIHRoaXMgc3ByaXRlIGJhdGNoIGZyb20gdGhlIGdpdmVuXG5cdCAqIGFycmF5IG9mIHZlcnRpY2VzLiBUaGUgc3ByaXRlIGlzIGRyYXduIGluIFxuXHQgKiBzY3JlZW4tc3BhY2Ugd2l0aCB0aGUgb3JpZ2luIGF0IHRoZSB1cHBlci1sZWZ0IGNvcm5lciAoeS1kb3duKS5cblx0ICpcblx0ICogVGhpcyByZWFkcyAyMCBpbnRlcmxlYXZlZCBmbG9hdHMgZnJvbSB0aGUgZ2l2ZW4gb2Zmc2V0IGluZGV4LCBpbiB0aGUgZm9ybWF0XG5cdCAqXG5cdCAqICB7IHgsIHksIGNvbG9yLCB1LCB2LFxuXHQgKiAgICAgIC4uLiAgfVxuXHQgKlxuXHQgKiBAbWV0aG9kICBkcmF3VmVydGljZXNcblx0ICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIHdlIGFyZSBkcmF3aW5nIGZvciB0aGlzIHNwcml0ZVxuXHQgKiBAcGFyYW0ge0Zsb2F0MzJBcnJheX0gdmVydHMgYW4gYXJyYXkgb2YgdmVydGljZXNcblx0ICogQHBhcmFtIHtOdW1iZXJ9IG9mZiB0aGUgb2Zmc2V0IGludG8gdGhlIHZlcnRpY2VzIGFycmF5IHRvIHJlYWQgZnJvbVxuXHQgKi9cblx0ZHJhd1ZlcnRpY2VzOiBmdW5jdGlvbih0ZXh0dXJlLCB2ZXJ0cywgb2ZmKSB7XG5cdFx0aWYgKCF0aGlzLmRyYXdpbmcpXG5cdFx0XHR0aHJvdyBcIklsbGVnYWwgU3RhdGU6IHRyeWluZyB0byBkcmF3IGEgYmF0Y2ggYmVmb3JlIGJlZ2luKClcIjtcblx0XHRcblx0XHQvL2Rvbid0IGRyYXcgYW55dGhpbmcgaWYgR0wgdGV4IGRvZXNuJ3QgZXhpc3QuLlxuXHRcdGlmICghdGV4dHVyZSlcblx0XHRcdHJldHVybjtcblx0XHRcblx0XHRpZiAodGhpcy50ZXh0dXJlICE9IHRleHR1cmUpIHtcblx0XHRcdC8vbmV3IHRleHR1cmUuLiBmbHVzaCBwcmV2aW91cyBkYXRhXG5cdFx0XHR0aGlzLmZsdXNoKCk7XG5cdFx0XHR0aGlzLnRleHR1cmUgPSB0ZXh0dXJlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5pZHggPT0gdGhpcy52ZXJ0aWNlcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuZmx1c2goKTsgLy93ZSd2ZSByZWFjaGVkIG91ciBtYXgsIGZsdXNoIGJlZm9yZSBwdXNoaW5nIG1vcmUgZGF0YVxuXHRcdH1cblxuXHRcdG9mZiA9IG9mZiB8fCAwO1xuXHRcdC8vVE9ETzogdXNlIGEgbG9vcCBoZXJlP1xuXHRcdC8veHlcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0Ly9jb2xvclxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0Ly91dlxuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHRcblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vdXZcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vdXZcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cblx0XHQvL3h5XG5cdFx0dGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vY29sb3Jcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdC8vdXZcblx0XHR0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXHRcdHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cdH1cbn0pO1xuXG4vKipcbiAqIFRoZSBkZWZhdWx0IHZlcnRleCBzaXplLCBpLmUuIG51bWJlciBvZiBmbG9hdHMgcGVyIHZlcnRleC5cbiAqIEBhdHRyaWJ1dGUgIFZFUlRFWF9TSVpFXG4gKiBAc3RhdGljXG4gKiBAZmluYWxcbiAqIEB0eXBlIHtOdW1iZXJ9XG4gKiBAZGVmYXVsdCAgNVxuICovXG5TcHJpdGVCYXRjaC5WRVJURVhfU0laRSA9IDU7XG5cbi8qKlxuICogSW5jcmVtZW50ZWQgYWZ0ZXIgZWFjaCBkcmF3IGNhbGwsIGNhbiBiZSB1c2VkIGZvciBkZWJ1Z2dpbmcuXG4gKlxuICogICAgIFNwcml0ZUJhdGNoLnRvdGFsUmVuZGVyQ2FsbHMgPSAwO1xuICpcbiAqICAgICAuLi4gZHJhdyB5b3VyIHNjZW5lIC4uLlxuICpcbiAqICAgICBjb25zb2xlLmxvZyhcIkRyYXcgY2FsbHMgcGVyIGZyYW1lOlwiLCBTcHJpdGVCYXRjaC50b3RhbFJlbmRlckNhbGxzKTtcbiAqXG4gKiBcbiAqIEBhdHRyaWJ1dGUgIHRvdGFsUmVuZGVyQ2FsbHNcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtOdW1iZXJ9XG4gKiBAZGVmYXVsdCAgMFxuICovXG5TcHJpdGVCYXRjaC50b3RhbFJlbmRlckNhbGxzID0gMDtcblxuU3ByaXRlQmF0Y2guREVGQVVMVF9GUkFHX1NIQURFUiA9IFtcblx0XCJwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcIixcblx0XCJ2YXJ5aW5nIHZlYzIgdlRleENvb3JkMDtcIixcblx0XCJ2YXJ5aW5nIHZlYzQgdkNvbG9yO1wiLFxuXHRcInVuaWZvcm0gc2FtcGxlcjJEIHVfdGV4dHVyZTA7XCIsXG5cblx0XCJ2b2lkIG1haW4odm9pZCkge1wiLFxuXHRcIiAgIGdsX0ZyYWdDb2xvciA9IHRleHR1cmUyRCh1X3RleHR1cmUwLCB2VGV4Q29vcmQwKSAqIHZDb2xvcjtcIixcblx0XCJ9XCJcbl0uam9pbignXFxuJyk7XG5cblNwcml0ZUJhdGNoLkRFRkFVTFRfVkVSVF9TSEFERVIgPSBbXG5cdFwiYXR0cmlidXRlIHZlYzIgUG9zaXRpb247XCIsXG5cdFwiYXR0cmlidXRlIHZlYzQgQ29sb3I7XCIsXG5cdFwiYXR0cmlidXRlIHZlYzIgVGV4Q29vcmQwO1wiLFxuXG5cdFwidW5pZm9ybSB2ZWMyIHVfcHJvamVjdGlvbjtcIixcblx0XCJ2YXJ5aW5nIHZlYzIgdlRleENvb3JkMDtcIixcblx0XCJ2YXJ5aW5nIHZlYzQgdkNvbG9yO1wiLFxuXG5cdFwidm9pZCBtYWluKHZvaWQpIHtcIixcblx0XCIgICBnbF9Qb3NpdGlvbiA9IHZlYzQoIFBvc2l0aW9uLnggLyB1X3Byb2plY3Rpb24ueCAtIDEuMCwgUG9zaXRpb24ueSAvIC11X3Byb2plY3Rpb24ueSArIDEuMCAsIDAuMCwgMS4wKTtcIixcblx0XCIgICB2VGV4Q29vcmQwID0gVGV4Q29vcmQwO1wiLFxuXHRcIiAgIHZDb2xvciA9IENvbG9yO1wiLFxuXHRcIn1cIlxuXS5qb2luKCdcXG4nKTtcblxubW9kdWxlLmV4cG9ydHMgPSBTcHJpdGVCYXRjaDtcbiIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgU2lnbmFsID0gcmVxdWlyZSgnc2lnbmFscycpO1xuXG52YXIgVGV4dHVyZSA9IG5ldyBDbGFzcyh7XG5cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyB0ZXh0dXJlIHdpdGggdGhlIG9wdGlvbmFsIHdpZHRoLCBoZWlnaHQsIGFuZCBkYXRhLlxuXHQgKlxuXHQgKiBJZiB0aGUgY29uc3RydWN0b3IgaXMgcGFzc2VkIG5vIHBhcmFtZXRlcnMgb3RoZXIgdGhhbiBXZWJHTENvbnRleHQsIHRoZW5cblx0ICogaXQgd2lsbCBub3QgYmUgaW5pdGlhbGl6ZWQgYW5kIHdpbGwgYmUgbm9uLXJlbmRlcmFibGUuIFlvdSB3aWxsIG5lZWQgdG8gbWFudWFsbHlcblx0ICogdXBsb2FkRGF0YSBvciB1cGxvYWRJbWFnZSB5b3Vyc2VsZi5cblx0ICpcblx0ICogSWYgeW91IHBhc3MgYSB3aWR0aCBhbmQgaGVpZ2h0LCB0aGUgdGV4dHVyZSB3aWxsIGJlIGluaXRpYWxpemVkIHdpdGggdGhhdCBzaXplXG5cdCAqIGFuZCBudWxsIGRhdGEgKGUuZy4gdHJhbnNwYXJlbnQgYmxhY2spLiBJZiB5b3UgYWxzbyBwYXNzIHRoZSBmb3JtYXQgYW5kIGRhdGEsIFxuXHQgKiBpdCB3aWxsIGJlIHVwbG9hZGVkIHRvIHRoZSB0ZXh0dXJlLiBcblx0ICpcblx0ICogVGhlIGFyZ3VtZW50cyBhcmUga2VwdCBpbiBtZW1vcnkgZm9yIGZ1dHVyZSBjb250ZXh0IHJlc3RvcmF0aW9uIGV2ZW50cy4gSWZcblx0ICogdGhpcyBpcyB1bmRlc2lyYWJsZSAoZS5nLiBodWdlIGJ1ZmZlcnMgd2hpY2ggbmVlZCB0byBiZSBHQydkKSwgeW91IHNob3VsZCBub3Rcblx0ICogcGFzcyB0aGUgZGF0YSBpbiB0aGUgY29uc3RydWN0b3IsIGJ1dCBpbnN0ZWFkIHVwbG9hZCBpdCBhZnRlciBjcmVhdGluZyBhbiB1bmluaXRpYWxpemVkIFxuXHQgKiB0ZXh0dXJlLiBZb3Ugd2lsbCBuZWVkIHRvIG1hbmFnZSBpdCB5b3Vyc2VsZiwgZWl0aGVyIGJ5IGV4dGVuZGluZyB0aGUgY3JlYXRlKCkgbWV0aG9kLCBcblx0ICogb3IgbGlzdGVuaW5nIHRvIHJlc3RvcmVkIGV2ZW50cyBpbiBXZWJHTENvbnRleHQuXG5cdCAqXG5cdCAqIE1vc3QgdXNlcnMgd2lsbCB3YW50IHRvIHVzZSB0aGUgQXNzZXRNYW5hZ2VyIHRvIGNyZWF0ZSBhbmQgbWFuYWdlIHRoZWlyIHRleHR1cmVzXG5cdCAqIHdpdGggYXN5bmNocm9ub3VzIGxvYWRpbmcgYW5kIGNvbnRleHQgbG9zcy4gXG5cdCAqXG5cdCAqIEBjbGFzcyAgVGV4dHVyZVxuXHQgKiBAY29uc3RydWN0b3Jcblx0ICogQHBhcmFtICB7V2ViR0xDb250ZXh0fSBjb250ZXh0IHRoZSBXZWJHTCBjb250ZXh0XG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggdGhlIHdpZHRoIG9mIHRoaXMgdGV4dHVyZVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCB0aGUgaGVpZ2h0IG9mIHRoaXMgdGV4dHVyZVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IGZvcm1hdCBlLmcuIFRleHR1cmUuRm9ybWF0LlJHQkFcblx0ICogQHBhcmFtICB7R0xlbnVtfSBkYXRhVHlwZSBlLmcuIFRleHR1cmUuRGF0YVR5cGUuVU5TSUdORURfQllURSAoVWludDhBcnJheSlcblx0ICogQHBhcmFtICB7R0xlbnVtfSBkYXRhIHRoZSBhcnJheSBidWZmZXIsIGUuZy4gYSBVaW50OEFycmF5IHZpZXdcblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFRleHR1cmUoY29udGV4dCwgd2lkdGgsIGhlaWdodCwgZm9ybWF0LCBkYXRhVHlwZSwgZGF0YSkge1xuXHRcdGlmICghY29udGV4dClcblx0XHRcdHRocm93IFwiR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkXCI7XG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBXZWJHTFRleHR1cmUgd2hpY2ggYmFja3MgdGhpcyBUZXh0dXJlIG9iamVjdC4gVGhpc1xuXHRcdCAqIGNhbiBiZSB1c2VkIGZvciBsb3ctbGV2ZWwgR0wgY2FsbHMuXG5cdFx0ICogXG5cdFx0ICogQHR5cGUge1dlYkdMVGV4dHVyZX1cblx0XHQgKi9cblx0XHR0aGlzLmlkID0gbnVsbDsgLy9pbml0aWFsaXplZCBpbiBjcmVhdGUoKVxuXG5cdFx0LyoqXG5cdFx0ICogVGhlIHRhcmdldCBmb3IgdGhpcyB0ZXh0dXJlIHVuaXQsIGkuZS4gVEVYVFVSRV8yRC4gU3ViY2xhc3Nlc1xuXHRcdCAqIHNob3VsZCBvdmVycmlkZSB0aGUgY3JlYXRlKCkgbWV0aG9kIHRvIGNoYW5nZSB0aGlzLCBmb3IgY29ycmVjdFxuXHRcdCAqIHVzYWdlIHdpdGggY29udGV4dCByZXN0b3JlLlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB0YXJnZXRcblx0XHQgKiBAdHlwZSB7R0xlbnVtfVxuXHRcdCAqIEBkZWZhdWx0ICBnbC5URVhUVVJFXzJEXG5cdFx0ICovXG5cdFx0dGhpcy50YXJnZXQgPSBudWxsOyAvL2luaXRpYWxpemVkIGluIGNyZWF0ZSgpXG5cblx0XHQvKipcblx0XHQgKiBUaGUgd2lkdGggb2YgdGhpcyB0ZXh0dXJlLCBpbiBwaXhlbHMuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IHdpZHRoXG5cdFx0ICogQHJlYWRPbmx5XG5cdFx0ICogQHR5cGUge051bWJlcn0gdGhlIHdpZHRoXG5cdFx0ICovXG5cdFx0dGhpcy53aWR0aCA9IDA7IC8vaW5pdGlhbGl6ZWQgaW4gY3JlYXRlKClcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBoZWlnaHQgb2YgdGhpcyB0ZXh0dXJlLCBpbiBwaXhlbHMuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IGhlaWdodFxuXHRcdCAqIEByZWFkT25seVxuXHRcdCAqIEB0eXBlIHtOdW1iZXJ9IHRoZSBoZWlnaHRcblx0XHQgKi9cblx0XHR0aGlzLmhlaWdodCA9IDA7IC8vaW5pdGlhbGl6ZWQgaW4gY3JlYXRlKClcblxuXHRcdC8vIGUuZy4gLS0+IG5ldyBUZXh0dXJlKGdsLCAyNTYsIDI1NiwgZ2wuUkdCLCBnbC5VTlNJR05FRF9CWVRFLCBkYXRhKTtcblx0XHQvL1x0XHQgICAgICBjcmVhdGVzIGEgbmV3IGVtcHR5IHRleHR1cmUsIDI1NngyNTZcblx0XHQvL1x0XHQtLT4gbmV3IFRleHR1cmUoZ2wpO1xuXHRcdC8vXHRcdFx0ICBjcmVhdGVzIGEgbmV3IHRleHR1cmUgYnV0IFdJVEhPVVQgdXBsb2FkaW5nIGFueSBkYXRhLiBcblxuXHRcdHRoaXMud3JhcFMgPSBUZXh0dXJlLkRFRkFVTFRfV1JBUDtcblx0XHR0aGlzLndyYXBUID0gVGV4dHVyZS5ERUZBVUxUX1dSQVA7XG5cdFx0dGhpcy5taW5GaWx0ZXIgPSBUZXh0dXJlLkRFRkFVTFRfRklMVEVSO1xuXHRcdHRoaXMubWFnRmlsdGVyID0gVGV4dHVyZS5ERUZBVUxUX0ZJTFRFUjtcblxuXHRcdC8qKlxuXHRcdCAqIFdoZW4gYSB0ZXh0dXJlIGlzIGNyZWF0ZWQsIHdlIGtlZXAgdHJhY2sgb2YgdGhlIGFyZ3VtZW50cyBwcm92aWRlZCB0byBcblx0XHQgKiBpdHMgY29uc3RydWN0b3IuIE9uIGNvbnRleHQgbG9zcyBhbmQgcmVzdG9yZSwgdGhlc2UgYXJndW1lbnRzIGFyZSByZS1zdXBwbGllZFxuXHRcdCAqIHRvIHRoZSBUZXh0dXJlLCBzbyBhcyB0byByZS1jcmVhdGUgaXQgaW4gaXRzIGNvcnJlY3QgZm9ybS5cblx0XHQgKlxuXHRcdCAqIFRoaXMgaXMgbWFpbmx5IHVzZWZ1bCBpZiB5b3UgYXJlIHByb2NlZHVyYWxseSBjcmVhdGluZyB0ZXh0dXJlcyBhbmQgcGFzc2luZ1xuXHRcdCAqIHRoZWlyIGRhdGEgZGlyZWN0bHkgKGUuZy4gZm9yIGdlbmVyaWMgbG9va3VwIHRhYmxlcyBpbiBhIHNoYWRlcikuIEZvciBpbWFnZVxuXHRcdCAqIG9yIG1lZGlhIGJhc2VkIHRleHR1cmVzLCBpdCB3b3VsZCBiZSBiZXR0ZXIgdG8gdXNlIGFuIEFzc2V0TWFuYWdlciB0byBtYW5hZ2Vcblx0XHQgKiB0aGUgYXN5bmNocm9ub3VzIHRleHR1cmUgdXBsb2FkLlxuXHRcdCAqXG5cdFx0ICogVXBvbiBkZXN0cm95aW5nIGEgdGV4dHVyZSwgYSByZWZlcmVuY2UgdG8gdGhpcyBpcyBhbHNvIGxvc3QuXG5cdFx0ICogXG5cdFx0ICogQHR5cGUge0FycmF5fSB0aGUgYXJyYXkgb2YgYXJndW1lbnRzLCBzaGlmdGVkIHRvIGV4Y2x1ZGUgdGhlIFdlYkdMQ29udGV4dCBwYXJhbWV0ZXJcblx0XHQgKi9cblx0XHR0aGlzLm1hbmFnZWRBcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblxuXHRcdC8vVGhpcyBpcyBtYWFuZ2VkIGJ5IFdlYkdMQ29udGV4dFxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIENhbGxlZCBpbiB0aGUgVGV4dHVyZSBjb25zdHJ1Y3RvciwgYW5kIGFmdGVyIHRoZSBHTCBjb250ZXh0IGhhcyBiZWVuIHJlLWluaXRpYWxpemVkLiBcblx0ICogU3ViY2xhc3NlcyBjYW4gb3ZlcnJpZGUgdGhpcyB0byBwcm92aWRlIGEgY3VzdG9tIGRhdGEgdXBsb2FkLCBlLmcuIGN1YmVtYXBzIG9yIGNvbXByZXNzZWRcblx0ICogdGV4dHVyZXMuXG5cdCAqL1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7IFxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLmlkID0gZ2wuY3JlYXRlVGV4dHVyZSgpOyAvL3RleHR1cmUgSUQgaXMgcmVjcmVhdGVkXG5cdFx0dGhpcy53aWR0aCA9IHRoaXMuaGVpZ2h0ID0gMDsgLy9zaXplIGlzIHJlc2V0IHRvIHplcm8gdW50aWwgbG9hZGVkXG5cdFx0dGhpcy50YXJnZXQgPSBnbC5URVhUVVJFXzJEOyAgLy90aGUgcHJvdmlkZXIgY2FuIGNoYW5nZSB0aGlzIGlmIG5lY2Vzc2FyeSAoZS5nLiBjdWJlIG1hcHMpXG5cblx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdC8vVE9ETzogY2xlYW4gdGhlc2UgdXAgYSBsaXR0bGUuIFxuXHRcdGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgVGV4dHVyZS5VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEEpO1xuXHRcdGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19BTElHTk1FTlQsIFRleHR1cmUuVU5QQUNLX0FMSUdOTUVOVCk7XG5cdFx0Z2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX0ZMSVBfWV9XRUJHTCwgVGV4dHVyZS5VTlBBQ0tfRkxJUF9ZKTtcblx0XHRcblx0XHR2YXIgY29sb3JzcGFjZSA9IFRleHR1cmUuVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTiB8fCBnbC5CUk9XU0VSX0RFRkFVTFRfV0VCR0w7XG5cdFx0Z2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgY29sb3JzcGFjZSk7XG5cblx0XHQvL3NldHVwIHdyYXAgbW9kZXMgd2l0aG91dCBiaW5kaW5nIHJlZHVuZGFudGx5XG5cdFx0dGhpcy5zZXRXcmFwKHRoaXMud3JhcFMsIHRoaXMud3JhcFQsIGZhbHNlKTtcblx0XHR0aGlzLnNldEZpbHRlcih0aGlzLm1pbkZpbHRlciwgdGhpcy5tYWdGaWx0ZXIsIGZhbHNlKTtcblx0XHRcblx0XHRpZiAodGhpcy5tYW5hZ2VkQXJncy5sZW5ndGggIT09IDApIHtcblx0XHRcdHRoaXMudXBsb2FkRGF0YS5hcHBseSh0aGlzLCB0aGlzLm1hbmFnZWRBcmdzKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIERlc3Ryb3lzIHRoaXMgdGV4dHVyZSBieSBkZWxldGluZyB0aGUgR0wgcmVzb3VyY2UsXG5cdCAqIHJlbW92aW5nIGl0IGZyb20gdGhlIFdlYkdMQ29udGV4dCBtYW5hZ2VtZW50IHN0YWNrLFxuXHQgKiBzZXR0aW5nIGl0cyBzaXplIHRvIHplcm8sIGFuZCBpZCBhbmQgbWFuYWdlZCBhcmd1bWVudHMgdG8gbnVsbC5cblx0ICogXG5cdCAqIEdlbmVyYWxseSBhIGRlc3Ryb3llZCB0ZXh0dXJlIGlzIG5vIGxvbmdlciB1c2FibGUuXG5cdCAqL1xuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pZCAmJiB0aGlzLmdsKVxuXHRcdFx0dGhpcy5nbC5kZWxldGVUZXh0dXJlKHRoaXMuaWQpO1xuXHRcdGlmICh0aGlzLmNvbnRleHQpXG5cdFx0XHR0aGlzLmNvbnRleHQucmVtb3ZlTWFuYWdlZE9iamVjdCh0aGlzKTtcblx0XHR0aGlzLndpZHRoID0gdGhpcy5oZWlnaHQgPSAwO1xuXHRcdHRoaXMuaWQgPSBudWxsO1xuXHRcdHRoaXMubWFuYWdlZEFyZ3MgPSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSB3cmFwIG1vZGUgZm9yIHRoaXMgdGV4dHVyZTsgaWYgdGhlIHNlY29uZCBhcmd1bWVudFxuXHQgKiBpcyB1bmRlZmluZWQgb3IgZmFsc3ksIHRoZW4gYm90aCBTIGFuZCBUIHdyYXAgd2lsbCB1c2UgdGhlIGZpcnN0XG5cdCAqIGFyZ3VtZW50LlxuXHQgKlxuXHQgKiBZb3UgY2FuIHVzZSBUZXh0dXJlLldyYXAgY29uc3RhbnRzIGZvciBjb252ZW5pZW5jZSwgdG8gYXZvaWQgbmVlZGluZyBcblx0ICogYSBHTCByZWZlcmVuY2UuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHNldFdyYXBcblx0ICogQHBhcmFtIHtHTGVudW19IHMgdGhlIFMgd3JhcCBtb2RlXG5cdCAqIEBwYXJhbSB7R0xlbnVtfSB0IHRoZSBUIHdyYXAgbW9kZVxuXHQgKiBAcGFyYW0ge0Jvb2xlYW59IGlnbm9yZUJpbmQgKG9wdGlvbmFsKSBpZiB0cnVlLCB0aGUgYmluZCB3aWxsIGJlIGlnbm9yZWQuIFxuXHQgKi9cblx0c2V0V3JhcDogZnVuY3Rpb24ocywgdCwgaWdub3JlQmluZCkgeyAvL1RPRE86IHN1cHBvcnQgUiB3cmFwIG1vZGVcblx0XHRpZiAocyAmJiB0KSB7XG5cdFx0XHR0aGlzLndyYXBTID0gcztcblx0XHRcdHRoaXMud3JhcFQgPSB0O1xuXHRcdH0gZWxzZSBcblx0XHRcdHRoaXMud3JhcFMgPSB0aGlzLndyYXBUID0gcztcblx0XHRcdFxuXHRcdGlmICghaWdub3JlQmluZClcblx0XHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX1dSQVBfUywgdGhpcy53cmFwUyk7XG5cdFx0Z2wudGV4UGFyYW1ldGVyaSh0aGlzLnRhcmdldCwgZ2wuVEVYVFVSRV9XUkFQX1QsIHRoaXMud3JhcFQpO1xuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIG1pbiBhbmQgbWFnIGZpbHRlciBmb3IgdGhpcyB0ZXh0dXJlOyBcblx0ICogaWYgbWFnIGlzIHVuZGVmaW5lZCBvciBmYWxzeSwgdGhlbiBib3RoIG1pbiBhbmQgbWFnIHdpbGwgdXNlIHRoZVxuXHQgKiBmaWx0ZXIgc3BlY2lmaWVkIGZvciBtaW4uXG5cdCAqXG5cdCAqIFlvdSBjYW4gdXNlIFRleHR1cmUuRmlsdGVyIGNvbnN0YW50cyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIG5lZWRpbmcgXG5cdCAqIGEgR0wgcmVmZXJlbmNlLlxuXHQgKiBcblx0ICogQHBhcmFtIHtHTGVudW19IG1pbiB0aGUgbWluaWZpY2F0aW9uIGZpbHRlclxuXHQgKiBAcGFyYW0ge0dMZW51bX0gbWFnIHRoZSBtYWduaWZpY2F0aW9uIGZpbHRlclxuXHQgKiBAcGFyYW0ge0Jvb2xlYW59IGlnbm9yZUJpbmQgaWYgdHJ1ZSwgdGhlIGJpbmQgd2lsbCBiZSBpZ25vcmVkLiBcblx0ICovXG5cdHNldEZpbHRlcjogZnVuY3Rpb24obWluLCBtYWcsIGlnbm9yZUJpbmQpIHsgXG5cdFx0aWYgKG1pbiAmJiBtYWcpIHtcblx0XHRcdHRoaXMubWluRmlsdGVyID0gbWluO1xuXHRcdFx0dGhpcy5tYWdGaWx0ZXIgPSBtYWc7XG5cdFx0fSBlbHNlIFxuXHRcdFx0dGhpcy5taW5GaWx0ZXIgPSB0aGlzLm1hZ0ZpbHRlciA9IG1pbjtcblx0XHRcdFxuXHRcdGlmICghaWdub3JlQmluZClcblx0XHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX01JTl9GSUxURVIsIHRoaXMubWluRmlsdGVyKTtcblx0XHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX01BR19GSUxURVIsIHRoaXMubWFnRmlsdGVyKTtcblx0fSxcblxuXHQvKipcblx0ICogQSBsb3ctbGV2ZWwgbWV0aG9kIHRvIHVwbG9hZCB0aGUgc3BlY2lmaWVkIEFycmF5QnVmZmVyVmlld1xuXHQgKiB0byB0aGlzIHRleHR1cmUuIFRoaXMgd2lsbCBjYXVzZSB0aGUgd2lkdGggYW5kIGhlaWdodCBvZiB0aGlzXG5cdCAqIHRleHR1cmUgdG8gY2hhbmdlLlxuXHQgKlxuXHQgKiBAbWV0aG9kICB1cGxvYWREYXRhXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICAgICAgICAgdGhlIG5ldyB3aWR0aCBvZiB0aGlzIHRleHR1cmUsXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHMgdG8gdGhlIGxhc3QgdXNlZCB3aWR0aCAob3IgemVybylcblx0ICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgICAgICAgICB0aGUgbmV3IGhlaWdodCBvZiB0aGlzIHRleHR1cmVcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0cyB0byB0aGUgbGFzdCB1c2VkIGhlaWdodCAob3IgemVybylcblx0ICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgICAgICAgICB0aGUgZGF0YSBmb3JtYXQsIGRlZmF1bHQgUkdCQVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IHR5cGUgICAgICAgICAgIHRoZSBkYXRhIHR5cGUsIGRlZmF1bHQgVU5TSUdORURfQllURSAoVWludDhBcnJheSlcblx0ICogQHBhcmFtICB7QXJyYXlCdWZmZXJWaWV3fSBkYXRhICB0aGUgcmF3IGRhdGEgZm9yIHRoaXMgdGV4dHVyZSwgb3IgbnVsbCBmb3IgYW4gZW1wdHkgaW1hZ2Vcblx0ICovXG5cdHVwbG9hZERhdGE6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLmZvcm1hdCA9IGZvcm1hdCB8fCBnbC5SR0JBO1xuXHRcdHR5cGUgPSB0eXBlIHx8IGdsLlVOU0lHTkVEX0JZVEU7XG5cdFx0ZGF0YSA9IGRhdGEgfHwgbnVsbDsgLy9tYWtlIHN1cmUgZmFsc2V5IHZhbHVlIGlzIG51bGwgZm9yIHRleEltYWdlMkRcblxuXHRcdHRoaXMud2lkdGggPSAod2lkdGggfHwgd2lkdGg9PTApID8gd2lkdGggOiB0aGlzLndpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gKGhlaWdodCB8fCBoZWlnaHQ9PTApID8gaGVpZ2h0IDogdGhpcy5oZWlnaHQ7XG5cblx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdGdsLnRleEltYWdlMkQodGhpcy50YXJnZXQsIDAsIHRoaXMuZm9ybWF0LCBcblx0XHRcdFx0XHQgIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0LCAwLCB0aGlzLmZvcm1hdCxcblx0XHRcdFx0XHQgIHR5cGUsIGRhdGEpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBVcGxvYWRzIEltYWdlRGF0YSwgSFRNTEltYWdlRWxlbWVudCwgSFRNTENhbnZhc0VsZW1lbnQgb3IgXG5cdCAqIEhUTUxWaWRlb0VsZW1lbnQuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHVwbG9hZEltYWdlXG5cdCAqIEBwYXJhbSAge09iamVjdH0gZG9tT2JqZWN0IHRoZSBET00gaW1hZ2UgY29udGFpbmVyXG5cdCAqL1xuXHR1cGxvYWRJbWFnZTogZnVuY3Rpb24oZG9tT2JqZWN0LCBmb3JtYXQsIHR5cGUpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy5mb3JtYXQgPSBmb3JtYXQgfHwgZ2wuUkdCQTtcblx0XHR0eXBlID0gdHlwZSB8fCBnbC5VTlNJR05FRF9CWVRFO1xuXHRcdFxuXHRcdHRoaXMud2lkdGggPSBkb21PYmplY3Qud2lkdGg7XG5cdFx0dGhpcy5oZWlnaHQgPSBkb21PYmplY3QuaGVpZ2h0O1xuXG5cdFx0dGhpcy5iaW5kKCk7XG5cblx0XHRnbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCB0aGlzLmZvcm1hdCwgdGhpcy5mb3JtYXQsXG5cdFx0XHRcdFx0ICB0eXBlLCBkb21PYmplY3QpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBCaW5kcyB0aGUgdGV4dHVyZS4gSWYgdW5pdCBpcyBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgYmluZCB0aGUgdGV4dHVyZSBhdCB0aGUgZ2l2ZW4gc2xvdFxuXHQgKiAoVEVYVFVSRTAsIFRFWFRVUkUxLCBldGMpLiBJZiB1bml0IGlzIG5vdCBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgc2ltcGx5IGJpbmQgdGhlIHRleHR1cmUgYXQgd2hpY2hldmVyIHNsb3Rcblx0ICogaXMgY3VycmVudGx5IGFjdGl2ZS5cblx0ICpcblx0ICogQG1ldGhvZCAgYmluZFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHVuaXQgdGhlIHRleHR1cmUgdW5pdCBpbmRleCwgc3RhcnRpbmcgYXQgMFxuXHQgKi9cblx0YmluZDogZnVuY3Rpb24odW5pdCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0aWYgKHVuaXQgfHwgdW5pdCA9PT0gMClcblx0XHRcdGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyB1bml0KTtcblx0XHRnbC5iaW5kVGV4dHVyZSh0aGlzLnRhcmdldCwgdGhpcy5pZCk7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmlkICsgXCI6XCIgKyB0aGlzLndpZHRoICsgXCJ4XCIgKyB0aGlzLmhlaWdodCArIFwiXCI7XG5cdH1cbn0pO1xuXG4vKiogXG4gKiBBIHNldCBvZiBGaWx0ZXIgY29uc3RhbnRzIHRoYXQgbWF0Y2ggdGhlaXIgR0wgY291bnRlcnBhcnRzLlxuICogVGhpcyBpcyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIHRoZSBuZWVkIGZvciBhIEdMIHJlbmRlcmluZyBjb250ZXh0LlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGBcbiAqICAgICBUZXh0dXJlLkZpbHRlci5ORUFSRVNUXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVF9NSVBNQVBfTElORUFSXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVF9NSVBNQVBfTkVBUkVTVFxuICogICAgIFRleHR1cmUuRmlsdGVyLkxJTkVBUlxuICogICAgIFRleHR1cmUuRmlsdGVyLkxJTkVBUl9NSVBNQVBfTElORUFSXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTElORUFSX01JUE1BUF9ORUFSRVNUXG4gKiBgYGBcbiAqIEBhdHRyaWJ1dGUgRmlsdGVyXG4gKiBAc3RhdGljXG4gKiBAdHlwZSB7T2JqZWN0fVxuICovXG5UZXh0dXJlLkZpbHRlciA9IHtcblx0TkVBUkVTVDogOTcyOCxcblx0TkVBUkVTVF9NSVBNQVBfTElORUFSOiA5OTg2LFxuXHRORUFSRVNUX01JUE1BUF9ORUFSRVNUOiA5OTg0LFxuXHRMSU5FQVI6IDk3MjksXG5cdExJTkVBUl9NSVBNQVBfTElORUFSOiA5OTg3LFxuXHRMSU5FQVJfTUlQTUFQX05FQVJFU1Q6IDk5ODVcbn07XG5cbi8qKiBcbiAqIEEgc2V0IG9mIFdyYXAgY29uc3RhbnRzIHRoYXQgbWF0Y2ggdGhlaXIgR0wgY291bnRlcnBhcnRzLlxuICogVGhpcyBpcyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIHRoZSBuZWVkIGZvciBhIEdMIHJlbmRlcmluZyBjb250ZXh0LlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGBcbiAqICAgICBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRVxuICogICAgIFRleHR1cmUuV3JhcC5NSVJST1JFRF9SRVBFQVRcbiAqICAgICBUZXh0dXJlLldyYXAuUkVQRUFUXG4gKiBgYGBcbiAqIEBhdHRyaWJ1dGUgV3JhcFxuICogQHN0YXRpY1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuVGV4dHVyZS5XcmFwID0ge1xuXHRDTEFNUF9UT19FREdFOiAzMzA3MSxcblx0TUlSUk9SRURfUkVQRUFUOiAzMzY0OCxcblx0UkVQRUFUOiAxMDQ5N1xufTtcblxuLyoqIFxuICogQSBzZXQgb2YgRm9ybWF0IGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5Gb3JtYXQuUkdCXG4gKiAgICAgVGV4dHVyZS5Gb3JtYXQuUkdCQVxuICogICAgIFRleHR1cmUuRm9ybWF0LkxVTUlOQU5DRV9BTFBIQVxuICogYGBgXG4gKiBAYXR0cmlidXRlIEZvcm1hdFxuICogQHN0YXRpY1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuVGV4dHVyZS5Gb3JtYXQgPSB7XG5cdERFUFRIX0NPTVBPTkVOVDogNjQwMixcblx0QUxQSEE6IDY0MDYsXG5cdFJHQkE6IDY0MDgsXG5cdFJHQjogNjQwNyxcblx0TFVNSU5BTkNFOiA2NDA5LFxuXHRMVU1JTkFOQ0VfQUxQSEE6IDY0MTBcbn07XG5cbi8qKiBcbiAqIEEgc2V0IG9mIERhdGFUeXBlIGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5EYXRhVHlwZS5VTlNJR05FRF9CWVRFIFxuICogICAgIFRleHR1cmUuRGF0YVR5cGUuRkxPQVQgXG4gKiBgYGBcbiAqIEBhdHRyaWJ1dGUgRGF0YVR5cGVcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblRleHR1cmUuRGF0YVR5cGUgPSB7XG5cdEJZVEU6IDUxMjAsXG5cdFNIT1JUOiA1MTIyLFxuXHRJTlQ6IDUxMjQsXG5cdEZMT0FUOiA1MTI2LFxuXHRVTlNJR05FRF9CWVRFOiA1MTIxLFxuXHRVTlNJR05FRF9JTlQ6IDUxMjUsXG5cdFVOU0lHTkVEX1NIT1JUOiA1MTIzLFxuXHRVTlNJR05FRF9TSE9SVF80XzRfNF80OiAzMjgxOSxcblx0VU5TSUdORURfU0hPUlRfNV81XzVfMTogMzI4MjAsXG5cdFVOU0lHTkVEX1NIT1JUXzVfNl81OiAzMzYzNVxufVxuXG4vKipcbiAqIFRoZSBkZWZhdWx0IHdyYXAgbW9kZSB3aGVuIGNyZWF0aW5nIG5ldyB0ZXh0dXJlcy4gSWYgYSBjdXN0b20gXG4gKiBwcm92aWRlciB3YXMgc3BlY2lmaWVkLCBpdCBtYXkgY2hvb3NlIHRvIG92ZXJyaWRlIHRoaXMgZGVmYXVsdCBtb2RlLlxuICogXG4gKiBAYXR0cmlidXRlIHtHTGVudW19IERFRkFVTFRfV1JBUFxuICogQHN0YXRpYyBcbiAqIEBkZWZhdWx0ICBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRVxuICovXG5UZXh0dXJlLkRFRkFVTFRfV1JBUCA9IFRleHR1cmUuV3JhcC5DTEFNUF9UT19FREdFO1xuXG5cbi8qKlxuICogVGhlIGRlZmF1bHQgZmlsdGVyIG1vZGUgd2hlbiBjcmVhdGluZyBuZXcgdGV4dHVyZXMuIElmIGEgY3VzdG9tXG4gKiBwcm92aWRlciB3YXMgc3BlY2lmaWVkLCBpdCBtYXkgY2hvb3NlIHRvIG92ZXJyaWRlIHRoaXMgZGVmYXVsdCBtb2RlLlxuICpcbiAqIEBhdHRyaWJ1dGUge0dMZW51bX0gREVGQVVMVF9GSUxURVJcbiAqIEBzdGF0aWNcbiAqIEBkZWZhdWx0ICBUZXh0dXJlLkZpbHRlci5MSU5FQVJcbiAqL1xuVGV4dHVyZS5ERUZBVUxUX0ZJTFRFUiA9IFRleHR1cmUuRmlsdGVyLk5FQVJFU1Q7XG5cbi8vZGVmYXVsdCBwaXhlbCBzdG9yZSBvcGVyYXRpb25zLiBVc2VkIGluIGNyZWF0ZSgpXG5UZXh0dXJlLlVOUEFDS19GTElQX1kgPSBmYWxzZTtcblRleHR1cmUuVU5QQUNLX0FMSUdOTUVOVCA9IDE7XG5UZXh0dXJlLlVOUEFDS19QUkVNVUxUSVBMWV9BTFBIQSA9IHRydWU7IFxuVGV4dHVyZS5VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OID0gdW5kZWZpbmVkO1xuXG4vKipcbiAqIFV0aWxpdHkgdG8gZ2V0IHRoZSBudW1iZXIgb2YgY29tcG9uZW50cyBmb3IgdGhlIGdpdmVuIEdMZW51bSwgZS5nLiBnbC5SR0JBIHJldHVybnMgNC5cbiAqIFJldHVybnMgbnVsbCBpZiB0aGUgc3BlY2lmaWVkIGZvcm1hdCBpcyBub3Qgb2YgdHlwZSBERVBUSF9DT01QT05FTlQsIEFMUEhBLCBMVU1JTkFOQ0UsXG4gKiBMVU1JTkFOQ0VfQUxQSEEsIFJHQiwgb3IgUkdCQS5cbiAqIFxuICogQG1ldGhvZCBnZXROdW1Db21wb25lbnRzXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0gIHtHTGVudW19IGZvcm1hdCBhIHRleHR1cmUgZm9ybWF0LCBpLmUuIFRleHR1cmUuRm9ybWF0LlJHQkFcbiAqIEByZXR1cm4ge051bWJlcn0gdGhlIG51bWJlciBvZiBjb21wb25lbnRzIGZvciB0aGlzIGZvcm1hdFxuICovXG5UZXh0dXJlLmdldE51bUNvbXBvbmVudHMgPSBmdW5jdGlvbihmb3JtYXQpIHtcblx0c3dpdGNoIChmb3JtYXQpIHtcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkRFUFRIX0NPTVBPTkVOVDpcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkFMUEhBOlxuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuTFVNSU5BTkNFOlxuXHRcdFx0cmV0dXJuIDE7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5MVU1JTkFOQ0VfQUxQSEE6XG5cdFx0XHRyZXR1cm4gMjtcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LlJHQjpcblx0XHRcdHJldHVybiAzO1xuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuUkdCQTpcblx0XHRcdHJldHVybiA0O1xuXHR9XG5cdHJldHVybiBudWxsO1xufTtcblxuLy9Vbm1hbmFnZWQgdGV4dHVyZXM6XG4vL1x0SFRNTCBlbGVtZW50cyBsaWtlIEltYWdlLCBWaWRlbywgQ2FudmFzXG4vL1x0cGl4ZWxzIGJ1ZmZlciBmcm9tIENhbnZhc1xuLy9cdHBpeGVscyBhcnJheVxuXG4vL05lZWQgc3BlY2lhbCBoYW5kbGluZzpcbi8vICBjb250ZXh0Lm9uQ29udGV4dExvc3QuYWRkKGZ1bmN0aW9uKCkge1xuLy8gIFx0Y3JlYXRlRHluYW1pY1RleHR1cmUoKTtcbi8vICB9LmJpbmQodGhpcykpO1xuXG4vL01hbmFnZWQgdGV4dHVyZXM6XG4vL1x0aW1hZ2VzIHNwZWNpZmllZCB3aXRoIGEgcGF0aFxuLy9cdHRoaXMgd2lsbCB1c2UgSW1hZ2UgdW5kZXIgdGhlIGhvb2RcblxuXG5tb2R1bGUuZXhwb3J0cyA9IFRleHR1cmU7IiwiLyoqXG4gKiBAbW9kdWxlIGthbWlcbiAqL1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcbnZhciBTaWduYWwgPSByZXF1aXJlKCdzaWduYWxzJyk7XG5cbi8qKlxuICogQSB0aGluIHdyYXBwZXIgYXJvdW5kIFdlYkdMUmVuZGVyaW5nQ29udGV4dCB3aGljaCBoYW5kbGVzXG4gKiBjb250ZXh0IGxvc3MgYW5kIHJlc3RvcmUgd2l0aCB2YXJpb3VzIHJlbmRlcmluZyBvYmplY3RzICh0ZXh0dXJlcyxcbiAqIHNoYWRlcnMgYW5kIGJ1ZmZlcnMpLiBUaGlzIGFsc28gaGFuZGxlcyBnZW5lcmFsIHZpZXdwb3J0IG1hbmFnZW1lbnQuXG4gKlxuICogSWYgdGhlIHZpZXcgaXMgbm90IHNwZWNpZmllZCwgYSBjYW52YXMgd2lsbCBiZSBjcmVhdGVkLlxuICogXG4gKiBAY2xhc3MgIFdlYkdMQ29udGV4dFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge051bWJlcn0gd2lkdGggdGhlIHdpZHRoIG9mIHRoZSBHTCBjYW52YXNcbiAqIEBwYXJhbSB7TnVtYmVyfSBoZWlnaHQgdGhlIGhlaWdodCBvZiB0aGUgR0wgY2FudmFzXG4gKiBAcGFyYW0ge0hUTUxDYW52YXNFbGVtZW50fSB2aWV3IHRoZSBvcHRpb25hbCBET00gY2FudmFzIGVsZW1lbnRcbiAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0QXR0cmlidWV0cyBhbiBvYmplY3QgY29udGFpbmluZyBjb250ZXh0IGF0dHJpYnMgd2hpY2hcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWxsIGJlIHVzZWQgZHVyaW5nIEdMIGluaXRpYWxpemF0aW9uXG4gKi9cbnZhciBXZWJHTENvbnRleHQgPSBuZXcgQ2xhc3Moe1xuXHRcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gV2ViR0xDb250ZXh0KHdpZHRoLCBoZWlnaHQsIHZpZXcsIGNvbnRleHRBdHRyaWJ1dGVzKSB7XG5cdFx0LyoqXG5cdFx0ICogVGhlIGxpc3Qgb2YgcmVuZGVyaW5nIG9iamVjdHMgKHNoYWRlcnMsIFZCT3MsIHRleHR1cmVzLCBldGMpIHdoaWNoIGFyZSBcblx0XHQgKiBjdXJyZW50bHkgYmVpbmcgbWFuYWdlZC4gQW55IG9iamVjdCB3aXRoIGEgXCJjcmVhdGVcIiBtZXRob2QgY2FuIGJlIGFkZGVkXG5cdFx0ICogdG8gdGhpcyBsaXN0LiBVcG9uIGRlc3Ryb3lpbmcgdGhlIHJlbmRlcmluZyBvYmplY3QsIGl0IHNob3VsZCBiZSByZW1vdmVkLlxuXHRcdCAqIFNlZSBhZGRNYW5hZ2VkT2JqZWN0IGFuZCByZW1vdmVNYW5hZ2VkT2JqZWN0LlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB7QXJyYXl9IG1hbmFnZWRPYmplY3RzXG5cdFx0ICovXG5cdFx0dGhpcy5tYW5hZ2VkT2JqZWN0cyA9IFtdO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIGFjdHVhbCBHTCBjb250ZXh0LiBZb3UgY2FuIHVzZSB0aGlzIGZvclxuXHRcdCAqIHJhdyBHTCBjYWxscyBvciB0byBhY2Nlc3MgR0xlbnVtIGNvbnN0YW50cy4gVGhpc1xuXHRcdCAqIHdpbGwgYmUgdXBkYXRlZCBvbiBjb250ZXh0IHJlc3RvcmUuIFdoaWxlIHRoZSBXZWJHTENvbnRleHRcblx0XHQgKiBpcyBub3QgYHZhbGlkYCwgeW91IHNob3VsZCBub3QgdHJ5IHRvIGFjY2VzcyBHTCBzdGF0ZS5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkgZ2xcblx0XHQgKiBAdHlwZSB7V2ViR0xSZW5kZXJpbmdDb250ZXh0fVxuXHRcdCAqL1xuXHRcdHRoaXMuZ2wgPSBudWxsO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIGNhbnZhcyBET00gZWxlbWVudCBmb3IgdGhpcyBjb250ZXh0LlxuXHRcdCAqIEBwcm9wZXJ0eSB7TnVtYmVyfSB2aWV3XG5cdFx0ICovXG5cdFx0dGhpcy52aWV3ID0gdmlldyB8fCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuXG5cdFx0Ly9kZWZhdWx0IHNpemUgYXMgcGVyIHNwZWM6XG5cdFx0Ly9odHRwOi8vd3d3LnczLm9yZy9UUi8yMDEyL1dELWh0bWw1LWF1dGhvci0yMDEyMDMyOS90aGUtY2FudmFzLWVsZW1lbnQuaHRtbCN0aGUtY2FudmFzLWVsZW1lbnRcblx0XHRcblx0XHQvKipcblx0XHQgKiBUaGUgd2lkdGggb2YgdGhpcyBjYW52YXMuXG5cdFx0ICpcblx0XHQgKiBAcHJvcGVydHkgd2lkdGhcblx0XHQgKiBAdHlwZSB7TnVtYmVyfVxuXHRcdCAqL1xuXHRcdHRoaXMud2lkdGggPSB0aGlzLnZpZXcud2lkdGggPSB3aWR0aCB8fCAzMDA7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgaGVpZ2h0IG9mIHRoaXMgY2FudmFzLlxuXHRcdCAqIEBwcm9wZXJ0eSBoZWlnaHRcblx0XHQgKiBAdHlwZSB7TnVtYmVyfVxuXHRcdCAqL1xuXHRcdHRoaXMuaGVpZ2h0ID0gdGhpcy52aWV3LmhlaWdodCA9IGhlaWdodCB8fCAxNTA7XG5cblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBjb250ZXh0IGF0dHJpYnV0ZXMgZm9yIGluaXRpYWxpemluZyB0aGUgR0wgc3RhdGUuIFRoaXMgbWlnaHQgaW5jbHVkZVxuXHRcdCAqIGFudGktYWxpYXNpbmcsIGFscGhhIHNldHRpbmdzLCB2ZXJpc29uLCBhbmQgc28gZm9ydGguXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IHtPYmplY3R9IGNvbnRleHRBdHRyaWJ1dGVzIFxuXHRcdCAqL1xuXHRcdHRoaXMuY29udGV4dEF0dHJpYnV0ZXMgPSBjb250ZXh0QXR0cmlidXRlcztcblx0XHRcblx0XHQvKipcblx0XHQgKiBXaGV0aGVyIHRoaXMgY29udGV4dCBpcyAndmFsaWQnLCBpLmUuIHJlbmRlcmFibGUuIEEgY29udGV4dCB0aGF0IGhhcyBiZWVuIGxvc3Rcblx0XHQgKiAoYW5kIG5vdCB5ZXQgcmVzdG9yZWQpIGlzIGludmFsaWQuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IHtCb29sZWFufSB2YWxpZFxuXHRcdCAqL1xuXHRcdHRoaXMudmFsaWQgPSBmYWxzZTtcblxuXHRcdC8qKlxuXHRcdCAqIEEgc2lnbmFsIGRpc3BhdGNoZWQgd2hlbiBHTCBjb250ZXh0IGlzIGxvc3QuIFxuXHRcdCAqIFxuXHRcdCAqIFRoZSBmaXJzdCBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIGxpc3RlbmVyIGlzIHRoZSBXZWJHTENvbnRleHRcblx0XHQgKiBtYW5hZ2luZyB0aGUgY29udGV4dCBsb3NzLlxuXHRcdCAqIFxuXHRcdCAqIEBldmVudCB7U2lnbmFsfSBsb3N0XG5cdFx0ICovXG5cdFx0dGhpcy5sb3N0ID0gbmV3IFNpZ25hbCgpO1xuXG5cdFx0LyoqXG5cdFx0ICogQSBzaWduYWwgZGlzcGF0Y2hlZCB3aGVuIEdMIGNvbnRleHQgaXMgcmVzdG9yZWQsIGFmdGVyIGFsbCB0aGUgbWFuYWdlZFxuXHRcdCAqIG9iamVjdHMgaGF2ZSBiZWVuIHJlY3JlYXRlZC5cblx0XHQgKlxuXHRcdCAqIFRoZSBmaXJzdCBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIGxpc3RlbmVyIGlzIHRoZSBXZWJHTENvbnRleHRcblx0XHQgKiB3aGljaCBtYW5hZ2VkIHRoZSByZXN0b3JhdGlvbi5cblx0XHQgKlxuXHRcdCAqIFRoaXMgZG9lcyBub3QgZ2F1cmVudGVlIHRoYXQgYWxsIG9iamVjdHMgd2lsbCBiZSByZW5kZXJhYmxlLlxuXHRcdCAqIEZvciBleGFtcGxlLCBhIFRleHR1cmUgd2l0aCBhbiBJbWFnZVByb3ZpZGVyIG1heSBzdGlsbCBiZSBsb2FkaW5nXG5cdFx0ICogYXN5bmNocm9ub3VzbHkuXHQgXG5cdFx0ICogXG5cdFx0ICogQGV2ZW50IHtTaWduYWx9IHJlc3RvcmVkXG5cdFx0ICovXG5cdFx0dGhpcy5yZXN0b3JlZCA9IG5ldyBTaWduYWwoKTtcdFxuXHRcdFxuXHRcdC8vc2V0dXAgY29udGV4dCBsb3N0IGFuZCByZXN0b3JlIGxpc3RlbmVyc1xuXHRcdHRoaXMudmlldy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0bG9zdFwiLCBmdW5jdGlvbiAoZXYpIHtcblx0XHRcdGV2LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLl9jb250ZXh0TG9zdChldik7XG5cdFx0fS5iaW5kKHRoaXMpKTtcblx0XHR0aGlzLnZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmdsY29udGV4dHJlc3RvcmVkXCIsIGZ1bmN0aW9uIChldikge1xuXHRcdFx0ZXYucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMuX2NvbnRleHRSZXN0b3JlZChldik7XG5cdFx0fS5iaW5kKHRoaXMpKTtcblx0XHRcdFxuXHRcdHRoaXMuX2luaXRDb250ZXh0KCk7XG5cblx0XHR0aGlzLnJlc2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG5cdH0sXG5cblx0X2luaXRDb250ZXh0OiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZXJyID0gXCJcIjtcblx0XHR0aGlzLnZhbGlkID0gZmFsc2U7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5nbCA9ICh0aGlzLnZpZXcuZ2V0Q29udGV4dCgnd2ViZ2wnLCB0aGlzLmNvbnRleHRBdHRyaWJ1dGVzKSBcblx0XHRcdFx0XHRcdHx8IHRoaXMudmlldy5nZXRDb250ZXh0KCdleHBlcmltZW50YWwtd2ViZ2wnLCB0aGlzLmNvbnRleHRBdHRyaWJ1dGVzKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5nbCA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2wpIHtcblx0XHRcdHRoaXMudmFsaWQgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBcIldlYkdMIENvbnRleHQgTm90IFN1cHBvcnRlZCAtLSB0cnkgZW5hYmxpbmcgaXQgb3IgdXNpbmcgYSBkaWZmZXJlbnQgYnJvd3NlclwiO1xuXHRcdH1cdFxuXHR9LFxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IG9mIHRoaXMgV2ViR0wgY29udGV4dCwgcmVzaXplc1xuXHQgKiB0aGUgY2FudmFzIHZpZXcsIGFuZCBjYWxscyBnbC52aWV3cG9ydCgpIHdpdGggdGhlIG5ldyBzaXplLlxuXHQgKiBcblx0ICogQHBhcmFtICB7TnVtYmVyfSB3aWR0aCAgdGhlIG5ldyB3aWR0aFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCB0aGUgbmV3IGhlaWdodFxuXHQgKi9cblx0cmVzaXplOiBmdW5jdGlvbih3aWR0aCwgaGVpZ2h0KSB7XG5cdFx0dGhpcy53aWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG5cdFx0dGhpcy52aWV3LndpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy52aWV3LmhlaWdodCA9IGhlaWdodDtcblxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0Z2wudmlld3BvcnQoMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiAoaW50ZXJuYWwgdXNlKVxuXHQgKiBBIG1hbmFnZWQgb2JqZWN0IGlzIGFueXRoaW5nIHdpdGggYSBcImNyZWF0ZVwiIGZ1bmN0aW9uLCB0aGF0IHdpbGxcblx0ICogcmVzdG9yZSBHTCBzdGF0ZSBhZnRlciBjb250ZXh0IGxvc3MuIFxuXHQgKiBcblx0ICogQHBhcmFtIHtbdHlwZV19IHRleCBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRhZGRNYW5hZ2VkT2JqZWN0OiBmdW5jdGlvbihvYmopIHtcblx0XHR0aGlzLm1hbmFnZWRPYmplY3RzLnB1c2gob2JqKTtcblx0fSxcblxuXHQvKipcblx0ICogKGludGVybmFsIHVzZSlcblx0ICogUmVtb3ZlcyBhIG1hbmFnZWQgb2JqZWN0IGZyb20gdGhlIGNhY2hlLiBUaGlzIGlzIHVzZWZ1bCB0byBkZXN0cm95XG5cdCAqIGEgdGV4dHVyZSBvciBzaGFkZXIsIGFuZCBoYXZlIGl0IG5vIGxvbmdlciByZS1sb2FkIG9uIGNvbnRleHQgcmVzdG9yZS5cblx0ICpcblx0ICogUmV0dXJucyB0aGUgb2JqZWN0IHRoYXQgd2FzIHJlbW92ZWQsIG9yIG51bGwgaWYgaXQgd2FzIG5vdCBmb3VuZCBpbiB0aGUgY2FjaGUuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9iaiB0aGUgb2JqZWN0IHRvIGJlIG1hbmFnZWRcblx0ICogQHJldHVybiB7T2JqZWN0fSAgICAgdGhlIHJlbW92ZWQgb2JqZWN0LCBvciBudWxsXG5cdCAqL1xuXHRyZW1vdmVNYW5hZ2VkT2JqZWN0OiBmdW5jdGlvbihvYmopIHtcblx0XHR2YXIgaWR4ID0gdGhpcy5tYW5hZ2VkT2JqZWN0cy5pbmRleE9mKG9iaik7XG5cdFx0aWYgKGlkeCA+IC0xKSB7XG5cdFx0XHR0aGlzLm1hbmFnZWRPYmplY3RzLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9IFxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdF9jb250ZXh0TG9zdDogZnVuY3Rpb24oZXYpIHtcblx0XHQvL2FsbCB0ZXh0dXJlcy9zaGFkZXJzL2J1ZmZlcnMvRkJPcyBoYXZlIGJlZW4gZGVsZXRlZC4uLiBcblx0XHQvL3dlIG5lZWQgdG8gcmUtY3JlYXRlIHRoZW0gb24gcmVzdG9yZVxuXHRcdHRoaXMudmFsaWQgPSBmYWxzZTtcblxuXHRcdHRoaXMubG9zdC5kaXNwYXRjaCh0aGlzKTtcblx0fSxcblxuXHRfY29udGV4dFJlc3RvcmVkOiBmdW5jdGlvbihldikge1xuXHRcdC8vSWYgYW4gYXNzZXQgbWFuYWdlciBpcyBhdHRhY2hlZCB0byB0aGlzXG5cdFx0Ly9jb250ZXh0LCB3ZSBuZWVkIHRvIGludmFsaWRhdGUgaXQgYW5kIHJlLWxvYWQgXG5cdFx0Ly90aGUgYXNzZXRzLlxuXHRcdGlmICh0aGlzLmFzc2V0TWFuYWdlcikge1xuXHRcdFx0dGhpcy5hc3NldE1hbmFnZXIuaW52YWxpZGF0ZSgpO1xuXHRcdH1cblxuXHRcdC8vZmlyc3QsIGluaXRpYWxpemUgdGhlIEdMIGNvbnRleHQgYWdhaW5cblx0XHR0aGlzLl9pbml0Q29udGV4dCgpO1xuXG5cdFx0Ly9ub3cgd2UgcmVjcmVhdGUgb3VyIHNoYWRlcnMgYW5kIHRleHR1cmVzXG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMubWFuYWdlZE9iamVjdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMubWFuYWdlZE9iamVjdHNbaV0uY3JlYXRlKCk7XG5cdFx0fVxuXG5cdFx0Ly91cGRhdGUgR0wgdmlld3BvcnRcblx0XHR0aGlzLnJlc2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG5cblx0XHR0aGlzLnJlc3RvcmVkLmRpc3BhdGNoKHRoaXMpO1xuXHR9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXZWJHTENvbnRleHQ7IiwiLyoqXG4gKiBAbW9kdWxlIGthbWlcbiAqL1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcblxuLy9UT0RPOiBkZWNvdXBsZSBpbnRvIFZCTyArIElCTyB1dGlsaXRpZXMgXG4vKipcbiAqIEEgbWVzaCBjbGFzcyB0aGF0IHdyYXBzIFZCTyBhbmQgSUJPLlxuICpcbiAqIEBjbGFzcyAgTWVzaFxuICovXG52YXIgTWVzaCA9IG5ldyBDbGFzcyh7XG5cblxuXHQvKipcblx0ICogQSB3cml0ZS1vbmx5IHByb3BlcnR5IHdoaWNoIHNldHMgYm90aCB2ZXJ0aWNlcyBhbmQgaW5kaWNlcyBcblx0ICogZmxhZyB0byBkaXJ0eSBvciBub3QuIFxuXHQgKlxuXHQgKiBAcHJvcGVydHkgZGlydHlcblx0ICogQHR5cGUge0Jvb2xlYW59XG5cdCAqIEB3cml0ZU9ubHlcblx0ICovXG5cdGRpcnR5OiB7XG5cdFx0c2V0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRcdHRoaXMudmVydGljZXNEaXJ0eSA9IHZhbDtcblx0XHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gdmFsO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBNZXNoIHdpdGggdGhlIHByb3ZpZGVkIHBhcmFtZXRlcnMuXG5cdCAqXG5cdCAqIElmIG51bUluZGljZXMgaXMgMCBvciBmYWxzeSwgbm8gaW5kZXggYnVmZmVyIHdpbGwgYmUgdXNlZFxuXHQgKiBhbmQgaW5kaWNlcyB3aWxsIGJlIGFuIGVtcHR5IEFycmF5QnVmZmVyIGFuZCBhIG51bGwgaW5kZXhCdWZmZXIuXG5cdCAqIFxuXHQgKiBJZiBpc1N0YXRpYyBpcyB0cnVlLCB0aGVuIHZlcnRleFVzYWdlIGFuZCBpbmRleFVzYWdlIHdpbGxcblx0ICogYmUgc2V0IHRvIGdsLlNUQVRJQ19EUkFXLiBPdGhlcndpc2UgdGhleSB3aWxsIHVzZSBnbC5EWU5BTUlDX0RSQVcuXG5cdCAqIFlvdSBtYXkgd2FudCB0byBhZGp1c3QgdGhlc2UgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gZm9yIGZ1cnRoZXIgY29udHJvbC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1dlYkdMQ29udGV4dH0gIGNvbnRleHQgdGhlIGNvbnRleHQgZm9yIG1hbmFnZW1lbnRcblx0ICogQHBhcmFtICB7Qm9vbGVhbn0gaXNTdGF0aWMgICAgICBhIGhpbnQgYXMgdG8gd2hldGhlciB0aGlzIGdlb21ldHJ5IGlzIHN0YXRpY1xuXHQgKiBAcGFyYW0gIHtbdHlwZV19ICBudW1WZXJ0cyAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSAgbnVtSW5kaWNlcyAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gIHZlcnRleEF0dHJpYnMgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcmV0dXJuIHtbdHlwZV19ICAgICAgICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIE1lc2goY29udGV4dCwgaXNTdGF0aWMsIG51bVZlcnRzLCBudW1JbmRpY2VzLCB2ZXJ0ZXhBdHRyaWJzKSB7XG5cdFx0aWYgKCFjb250ZXh0KVxuXHRcdFx0dGhyb3cgXCJHTCBjb250ZXh0IG5vdCBzcGVjaWZpZWRcIjtcblx0XHRpZiAoIW51bVZlcnRzKVxuXHRcdFx0dGhyb3cgXCJudW1WZXJ0cyBub3Qgc3BlY2lmaWVkLCBtdXN0IGJlID4gMFwiO1xuXG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLmdsID0gY29udGV4dC5nbDtcblx0XHRcblx0XHR0aGlzLm51bVZlcnRzID0gbnVsbDtcblx0XHR0aGlzLm51bUluZGljZXMgPSBudWxsO1xuXHRcdFxuXHRcdHRoaXMudmVydGljZXMgPSBudWxsO1xuXHRcdHRoaXMuaW5kaWNlcyA9IG51bGw7XG5cdFx0dGhpcy52ZXJ0ZXhCdWZmZXIgPSBudWxsO1xuXHRcdHRoaXMuaW5kZXhCdWZmZXIgPSBudWxsO1xuXG5cdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLmluZGljZXNEaXJ0eSA9IHRydWU7XG5cdFx0dGhpcy5pbmRleFVzYWdlID0gbnVsbDtcblx0XHR0aGlzLnZlcnRleFVzYWdlID0gbnVsbDtcblxuXHRcdC8qKiBcblx0XHQgKiBAcHJvcGVydHlcblx0XHQgKiBAcHJpdmF0ZVxuXHRcdCAqL1xuXHRcdHRoaXMuX3ZlcnRleEF0dHJpYnMgPSBudWxsO1xuXG5cdFx0LyoqIFxuXHRcdCAqIEBwcm9wZXJ0eVxuXHRcdCAqIEBwcml2YXRlXG5cdFx0ICovXG5cdFx0dGhpcy5fdmVydGV4U3RyaWRlID0gbnVsbDtcblxuXHRcdHRoaXMubnVtVmVydHMgPSBudW1WZXJ0cztcblx0XHR0aGlzLm51bUluZGljZXMgPSBudW1JbmRpY2VzIHx8IDA7XG5cdFx0dGhpcy52ZXJ0ZXhVc2FnZSA9IGlzU3RhdGljID8gdGhpcy5nbC5TVEFUSUNfRFJBVyA6IHRoaXMuZ2wuRFlOQU1JQ19EUkFXO1xuXHRcdHRoaXMuaW5kZXhVc2FnZSAgPSBpc1N0YXRpYyA/IHRoaXMuZ2wuU1RBVElDX0RSQVcgOiB0aGlzLmdsLkRZTkFNSUNfRFJBVztcblx0XHR0aGlzLl92ZXJ0ZXhBdHRyaWJzID0gdmVydGV4QXR0cmlicyB8fCBbXTtcblx0XHRcblx0XHR0aGlzLmluZGljZXNEaXJ0eSA9IHRydWU7XG5cdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gdHJ1ZTtcblxuXHRcdC8vZGV0ZXJtaW5lIHRoZSB2ZXJ0ZXggc3RyaWRlIGJhc2VkIG9uIGdpdmVuIGF0dHJpYnV0ZXNcblx0XHR2YXIgdG90YWxOdW1Db21wb25lbnRzID0gMDtcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5fdmVydGV4QXR0cmlicy5sZW5ndGg7IGkrKylcblx0XHRcdHRvdGFsTnVtQ29tcG9uZW50cyArPSB0aGlzLl92ZXJ0ZXhBdHRyaWJzW2ldLm9mZnNldENvdW50O1xuXHRcdHRoaXMuX3ZlcnRleFN0cmlkZSA9IHRvdGFsTnVtQ29tcG9uZW50cyAqIDQ7IC8vIGluIGJ5dGVzXG5cblx0XHR0aGlzLnZlcnRpY2VzID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLm51bVZlcnRzKTtcblx0XHR0aGlzLmluZGljZXMgPSBuZXcgVWludDE2QXJyYXkodGhpcy5udW1JbmRpY2VzKTtcblxuXHRcdC8vYWRkIHRoaXMgVkJPIHRvIHRoZSBtYW5hZ2VkIGNhY2hlXG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8vcmVjcmVhdGVzIHRoZSBidWZmZXJzIG9uIGNvbnRleHQgbG9zc1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR0aGlzLnZlcnRleEJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xuXG5cdFx0Ly9pZ25vcmUgaW5kZXggYnVmZmVyIGlmIHdlIGhhdmVuJ3Qgc3BlY2lmaWVkIGFueVxuXHRcdHRoaXMuaW5kZXhCdWZmZXIgPSB0aGlzLm51bUluZGljZXMgPiAwXG5cdFx0XHRcdFx0PyBnbC5jcmVhdGVCdWZmZXIoKVxuXHRcdFx0XHRcdDogbnVsbDtcblxuXHRcdHRoaXMuZGlydHkgPSB0cnVlO1xuXHR9LFxuXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMudmVydGljZXMgPSBbXTtcblx0XHR0aGlzLmluZGljZXMgPSBbXTtcblx0XHRpZiAodGhpcy52ZXJ0ZXhCdWZmZXIpXG5cdFx0XHR0aGlzLmdsLmRlbGV0ZUJ1ZmZlcih0aGlzLnZlcnRleEJ1ZmZlcik7XG5cdFx0aWYgKHRoaXMuaW5kZXhCdWZmZXIpXG5cdFx0XHR0aGlzLmdsLmRlbGV0ZUJ1ZmZlcih0aGlzLmluZGV4QnVmZmVyKTtcblx0XHR0aGlzLnZlcnRleEJ1ZmZlciA9IG51bGw7XG5cdFx0dGhpcy5pbmRleEJ1ZmZlciA9IG51bGw7XG5cdFx0aWYgKHRoaXMuY29udGV4dClcblx0XHRcdHRoaXMuY29udGV4dC5yZW1vdmVNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXHR9LFxuXG5cdF91cGRhdGVCdWZmZXJzOiBmdW5jdGlvbihpZ25vcmVCaW5kLCBzdWJEYXRhTGVuZ3RoKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdC8vYmluZCBvdXIgaW5kZXggZGF0YSwgaWYgd2UgaGF2ZSBhbnlcblx0XHRpZiAodGhpcy5udW1JbmRpY2VzID4gMCkge1xuXHRcdFx0aWYgKCFpZ25vcmVCaW5kKVxuXHRcdFx0XHRnbC5iaW5kQnVmZmVyKGdsLkVMRU1FTlRfQVJSQVlfQlVGRkVSLCB0aGlzLmluZGV4QnVmZmVyKTtcblxuXHRcdFx0Ly91cGRhdGUgdGhlIGluZGV4IGRhdGFcblx0XHRcdGlmICh0aGlzLmluZGljZXNEaXJ0eSkge1xuXHRcdFx0XHRnbC5idWZmZXJEYXRhKGdsLkVMRU1FTlRfQVJSQVlfQlVGRkVSLCB0aGlzLmluZGljZXMsIHRoaXMuaW5kZXhVc2FnZSk7XG5cdFx0XHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly9iaW5kIG91ciB2ZXJ0ZXggZGF0YVxuXHRcdGlmICghaWdub3JlQmluZClcblx0XHRcdGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCB0aGlzLnZlcnRleEJ1ZmZlcik7XG5cblx0XHQvL3VwZGF0ZSBvdXIgdmVydGV4IGRhdGFcblx0XHRpZiAodGhpcy52ZXJ0aWNlc0RpcnR5KSB7XG5cdFx0XHRpZiAoc3ViRGF0YUxlbmd0aCkge1xuXHRcdFx0XHQvLyBUT0RPOiBXaGVuIGRlY291cGxpbmcgVkJPL0lCTyBiZSBzdXJlIHRvIGdpdmUgYmV0dGVyIHN1YkRhdGEgc3VwcG9ydC4uXG5cdFx0XHRcdHZhciB2aWV3ID0gdGhpcy52ZXJ0aWNlcy5zdWJhcnJheSgwLCBzdWJEYXRhTGVuZ3RoKTtcblx0XHRcdFx0Z2wuYnVmZmVyU3ViRGF0YShnbC5BUlJBWV9CVUZGRVIsIDAsIHZpZXcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIHRoaXMudmVydGljZXMsIHRoaXMudmVydGV4VXNhZ2UpO1x0XG5cdFx0XHR9XG5cblx0XHRcdFxuXHRcdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gZmFsc2U7XG5cdFx0fVxuXHR9LFxuXG5cdGRyYXc6IGZ1bmN0aW9uKHByaW1pdGl2ZVR5cGUsIGNvdW50LCBvZmZzZXQsIHN1YkRhdGFMZW5ndGgpIHtcblx0XHRpZiAoY291bnQgPT09IDApXG5cdFx0XHRyZXR1cm47XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdFxuXHRcdG9mZnNldCA9IG9mZnNldCB8fCAwO1xuXG5cdFx0Ly9iaW5kcyBhbmQgdXBkYXRlcyBvdXIgYnVmZmVycy4gcGFzcyBpZ25vcmVCaW5kIGFzIHRydWVcblx0XHQvL3RvIGF2b2lkIGJpbmRpbmcgdW5uZWNlc3NhcmlseVxuXHRcdHRoaXMuX3VwZGF0ZUJ1ZmZlcnModHJ1ZSwgc3ViRGF0YUxlbmd0aCk7XG5cblx0XHRpZiAodGhpcy5udW1JbmRpY2VzID4gMCkgeyBcblx0XHRcdGdsLmRyYXdFbGVtZW50cyhwcmltaXRpdmVUeXBlLCBjb3VudCwgXG5cdFx0XHRcdFx0XHRnbC5VTlNJR05FRF9TSE9SVCwgb2Zmc2V0ICogMik7IC8vKiBVaW50MTZBcnJheS5CWVRFU19QRVJfRUxFTUVOVFxuXHRcdH0gZWxzZVxuXHRcdFx0Z2wuZHJhd0FycmF5cyhwcmltaXRpdmVUeXBlLCBvZmZzZXQsIGNvdW50KTtcblx0fSxcblxuXHQvL2JpbmRzIHRoaXMgbWVzaCdzIHZlcnRleCBhdHRyaWJ1dGVzIGZvciB0aGUgZ2l2ZW4gc2hhZGVyXG5cdGJpbmQ6IGZ1bmN0aW9uKHNoYWRlcikge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR2YXIgb2Zmc2V0ID0gMDtcblx0XHR2YXIgc3RyaWRlID0gdGhpcy5fdmVydGV4U3RyaWRlO1xuXG5cdFx0Ly9iaW5kIGFuZCB1cGRhdGUgb3VyIHZlcnRleCBkYXRhIGJlZm9yZSBiaW5kaW5nIGF0dHJpYnV0ZXNcblx0XHR0aGlzLl91cGRhdGVCdWZmZXJzKCk7XG5cblx0XHQvL2ZvciBlYWNoIGF0dHJpYnR1ZVxuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLl92ZXJ0ZXhBdHRyaWJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgYSA9IHRoaXMuX3ZlcnRleEF0dHJpYnNbaV07XG5cblx0XHRcdC8vbG9jYXRpb24gb2YgdGhlIGF0dHJpYnV0ZVxuXHRcdFx0dmFyIGxvYyA9IGEubG9jYXRpb24gPT09IG51bGwgXG5cdFx0XHRcdFx0PyBzaGFkZXIuZ2V0QXR0cmlidXRlTG9jYXRpb24oYS5uYW1lKVxuXHRcdFx0XHRcdDogYS5sb2NhdGlvbjtcblxuXHRcdFx0Ly9UT0RPOiBXZSBtYXkgd2FudCB0byBza2lwIHVuZm91bmQgYXR0cmlic1xuXHRcdFx0Ly8gaWYgKGxvYyE9PTAgJiYgIWxvYylcblx0XHRcdC8vIFx0Y29uc29sZS53YXJuKFwiV0FSTjpcIiwgYS5uYW1lLCBcImlzIG5vdCBlbmFibGVkXCIpO1xuXG5cdFx0XHQvL2ZpcnN0LCBlbmFibGUgdGhlIHZlcnRleCBhcnJheVxuXHRcdFx0Z2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkobG9jKTtcblxuXHRcdFx0Ly90aGVuIHNwZWNpZnkgb3VyIHZlcnRleCBmb3JtYXRcblx0XHRcdGdsLnZlcnRleEF0dHJpYlBvaW50ZXIobG9jLCBhLm51bUNvbXBvbmVudHMsIGEudHlwZSB8fCBnbC5GTE9BVCwgXG5cdFx0XHRcdFx0XHRcdFx0ICAgYS5ub3JtYWxpemUsIHN0cmlkZSwgb2Zmc2V0KTtcblxuXHRcdFx0Ly9hbmQgaW5jcmVhc2UgdGhlIG9mZnNldC4uLlxuXHRcdFx0b2Zmc2V0ICs9IGEub2Zmc2V0Q291bnQgKiA0OyAvL2luIGJ5dGVzXG5cdFx0fVxuXHR9LFxuXG5cdHVuYmluZDogZnVuY3Rpb24oc2hhZGVyKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdC8vZm9yIGVhY2ggYXR0cmlidHVlXG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMuX3ZlcnRleEF0dHJpYnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhciBhID0gdGhpcy5fdmVydGV4QXR0cmlic1tpXTtcblxuXHRcdFx0Ly9sb2NhdGlvbiBvZiB0aGUgYXR0cmlidXRlXG5cdFx0XHR2YXIgbG9jID0gYS5sb2NhdGlvbiA9PT0gbnVsbCBcblx0XHRcdFx0XHQ/IHNoYWRlci5nZXRBdHRyaWJ1dGVMb2NhdGlvbihhLm5hbWUpXG5cdFx0XHRcdFx0OiBhLmxvY2F0aW9uO1xuXG5cdFx0XHQvL2ZpcnN0LCBlbmFibGUgdGhlIHZlcnRleCBhcnJheVxuXHRcdFx0Z2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KGxvYyk7XG5cdFx0fVxuXHR9XG59KTtcblxuTWVzaC5BdHRyaWIgPSBuZXcgQ2xhc3Moe1xuXG5cdG5hbWU6IG51bGwsXG5cdG51bUNvbXBvbmVudHM6IG51bGwsXG5cdGxvY2F0aW9uOiBudWxsLFxuXHR0eXBlOiBudWxsLFxuXG5cdC8qKlxuXHQgKiBMb2NhdGlvbiBpcyBvcHRpb25hbCBhbmQgZm9yIGFkdmFuY2VkIHVzZXJzIHRoYXRcblx0ICogd2FudCB2ZXJ0ZXggYXJyYXlzIHRvIG1hdGNoIGFjcm9zcyBzaGFkZXJzLiBBbnkgbm9uLW51bWVyaWNhbFxuXHQgKiB2YWx1ZSB3aWxsIGJlIGNvbnZlcnRlZCB0byBudWxsLCBhbmQgaWdub3JlZC4gSWYgYSBudW1lcmljYWxcblx0ICogdmFsdWUgaXMgZ2l2ZW4sIGl0IHdpbGwgb3ZlcnJpZGUgdGhlIHBvc2l0aW9uIG9mIHRoaXMgYXR0cmlidXRlXG5cdCAqIHdoZW4gZ2l2ZW4gdG8gYSBtZXNoLlxuXHQgKiBcblx0ICogQHBhcmFtICB7W3R5cGVdfSBuYW1lICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSBudW1Db21wb25lbnRzIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSBsb2NhdGlvbiAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKG5hbWUsIG51bUNvbXBvbmVudHMsIGxvY2F0aW9uLCB0eXBlLCBub3JtYWxpemUsIG9mZnNldENvdW50KSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLm51bUNvbXBvbmVudHMgPSBudW1Db21wb25lbnRzO1xuXHRcdHRoaXMubG9jYXRpb24gPSB0eXBlb2YgbG9jYXRpb24gPT09IFwibnVtYmVyXCIgPyBsb2NhdGlvbiA6IG51bGw7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHR0aGlzLm5vcm1hbGl6ZSA9IEJvb2xlYW4obm9ybWFsaXplKTtcblx0XHR0aGlzLm9mZnNldENvdW50ID0gdHlwZW9mIG9mZnNldENvdW50ID09PSBcIm51bWJlclwiID8gb2Zmc2V0Q291bnQgOiB0aGlzLm51bUNvbXBvbmVudHM7XG5cdH1cbn0pXG5cblxubW9kdWxlLmV4cG9ydHMgPSBNZXNoOyIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG5cbnZhciBTaGFkZXJQcm9ncmFtID0gbmV3IENsYXNzKHtcblx0XG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFNoYWRlclByb2dyYW0oY29udGV4dCwgdmVydFNvdXJjZSwgZnJhZ1NvdXJjZSwgYXR0cmlidXRlTG9jYXRpb25zKSB7XG5cdFx0aWYgKCF2ZXJ0U291cmNlIHx8ICFmcmFnU291cmNlKVxuXHRcdFx0dGhyb3cgXCJ2ZXJ0ZXggYW5kIGZyYWdtZW50IHNoYWRlcnMgbXVzdCBiZSBkZWZpbmVkXCI7XG5cdFx0aWYgKCFjb250ZXh0KVxuXHRcdFx0dGhyb3cgXCJubyBHTCBjb250ZXh0IHNwZWNpZmllZFwiO1xuXHRcdHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cblx0XHR0aGlzLnZlcnRTaGFkZXIgPSBudWxsO1xuXHRcdHRoaXMuZnJhZ1NoYWRlciA9IG51bGw7XG5cdFx0dGhpcy5wcm9ncmFtID0gbnVsbDtcblx0XHR0aGlzLmxvZyA9IFwiXCI7XG5cblx0XHR0aGlzLnVuaWZvcm1DYWNoZSA9IG51bGw7XG5cdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZSA9IG51bGw7XG5cblx0XHR0aGlzLmF0dHJpYnV0ZUxvY2F0aW9ucyA9IGF0dHJpYnV0ZUxvY2F0aW9ucztcblxuXHRcdC8vV2UgdHJpbSAoRUNNQVNjcmlwdDUpIHNvIHRoYXQgdGhlIEdMU0wgbGluZSBudW1iZXJzIGFyZVxuXHRcdC8vYWNjdXJhdGUgb24gc2hhZGVyIGxvZ1xuXHRcdHRoaXMudmVydFNvdXJjZSA9IHZlcnRTb3VyY2UudHJpbSgpO1xuXHRcdHRoaXMuZnJhZ1NvdXJjZSA9IGZyYWdTb3VyY2UudHJpbSgpO1xuXG5cdFx0Ly9BZGRzIHRoaXMgc2hhZGVyIHRvIHRoZSBjb250ZXh0LCB0byBiZSBtYW5hZ2VkXG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8qKiBcblx0ICogVGhpcyBpcyBjYWxsZWQgZHVyaW5nIHRoZSBTaGFkZXJQcm9ncmFtIGNvbnN0cnVjdG9yLFxuXHQgKiBhbmQgbWF5IG5lZWQgdG8gYmUgY2FsbGVkIGFnYWluIGFmdGVyIGNvbnRleHQgbG9zcyBhbmQgcmVzdG9yZS5cblx0ICovXG5cdGNyZWF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbCA9IHRoaXMuY29udGV4dC5nbDtcblx0XHR0aGlzLl9jb21waWxlU2hhZGVycygpO1xuXHR9LFxuXG5cdC8vQ29tcGlsZXMgdGhlIHNoYWRlcnMsIHRocm93aW5nIGFuIGVycm9yIGlmIHRoZSBwcm9ncmFtIHdhcyBpbnZhbGlkLlxuXHRfY29tcGlsZVNoYWRlcnM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7IFxuXHRcdFxuXHRcdHRoaXMubG9nID0gXCJcIjtcblxuXHRcdHRoaXMudmVydFNoYWRlciA9IHRoaXMuX2xvYWRTaGFkZXIoZ2wuVkVSVEVYX1NIQURFUiwgdGhpcy52ZXJ0U291cmNlKTtcblx0XHR0aGlzLmZyYWdTaGFkZXIgPSB0aGlzLl9sb2FkU2hhZGVyKGdsLkZSQUdNRU5UX1NIQURFUiwgdGhpcy5mcmFnU291cmNlKTtcblxuXHRcdGlmICghdGhpcy52ZXJ0U2hhZGVyIHx8ICF0aGlzLmZyYWdTaGFkZXIpXG5cdFx0XHR0aHJvdyBcIkVycm9yIHJldHVybmVkIHdoZW4gY2FsbGluZyBjcmVhdGVTaGFkZXJcIjtcblxuXHRcdHRoaXMucHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKTtcblxuXHRcdGdsLmF0dGFjaFNoYWRlcih0aGlzLnByb2dyYW0sIHRoaXMudmVydFNoYWRlcik7XG5cdFx0Z2wuYXR0YWNoU2hhZGVyKHRoaXMucHJvZ3JhbSwgdGhpcy5mcmFnU2hhZGVyKTtcblx0XG5cdFx0Ly9UT0RPOiBUaGlzIHNlZW1zIG5vdCB0byBiZSB3b3JraW5nIG9uIG15IE9TWCAtLSBtYXliZSBhIGRyaXZlciBidWc/XG5cdFx0aWYgKHRoaXMuYXR0cmlidXRlTG9jYXRpb25zKSB7XG5cdFx0XHRmb3IgKHZhciBrZXkgaW4gdGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnMpIHtcblx0XHRcdFx0aWYgKHRoaXMuYXR0cmlidXRlTG9jYXRpb25zLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0XHRcdFx0XHRnbC5iaW5kQXR0cmliTG9jYXRpb24odGhpcy5wcm9ncmFtLCBNYXRoLmZsb29yKHRoaXMuYXR0cmlidXRlTG9jYXRpb25zW2tleV0pLCBrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Z2wubGlua1Byb2dyYW0odGhpcy5wcm9ncmFtKTsgXG5cblx0XHR0aGlzLmxvZyArPSBnbC5nZXRQcm9ncmFtSW5mb0xvZyh0aGlzLnByb2dyYW0pIHx8IFwiXCI7XG5cblx0XHRpZiAoIWdsLmdldFByb2dyYW1QYXJhbWV0ZXIodGhpcy5wcm9ncmFtLCBnbC5MSU5LX1NUQVRVUykpIHtcblx0XHRcdHRocm93IFwiRXJyb3IgbGlua2luZyB0aGUgc2hhZGVyIHByb2dyYW06XFxuXCJcblx0XHRcdFx0KyB0aGlzLmxvZztcblx0XHR9XG5cblx0XHR0aGlzLl9mZXRjaFVuaWZvcm1zKCk7XG5cdFx0dGhpcy5fZmV0Y2hBdHRyaWJ1dGVzKCk7XG5cdH0sXG5cblx0X2ZldGNoVW5pZm9ybXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLnVuaWZvcm1DYWNoZSA9IHt9O1xuXG5cdFx0dmFyIGxlbiA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIodGhpcy5wcm9ncmFtLCBnbC5BQ1RJVkVfVU5JRk9STVMpO1xuXHRcdGlmICghbGVuKSAvL251bGwgb3IgemVyb1xuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Zm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSB7XG5cdFx0XHR2YXIgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0odGhpcy5wcm9ncmFtLCBpKTtcblx0XHRcdGlmIChpbmZvID09PSBudWxsKSBcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR2YXIgbmFtZSA9IGluZm8ubmFtZTtcblx0XHRcdHZhciBsb2NhdGlvbiA9IGdsLmdldFVuaWZvcm1Mb2NhdGlvbih0aGlzLnByb2dyYW0sIG5hbWUpO1xuXHRcdFx0XG5cdFx0XHR0aGlzLnVuaWZvcm1DYWNoZVtuYW1lXSA9IHtcblx0XHRcdFx0c2l6ZTogaW5mby5zaXplLFxuXHRcdFx0XHR0eXBlOiBpbmZvLnR5cGUsXG5cdFx0XHRcdGxvY2F0aW9uOiBsb2NhdGlvblxuXHRcdFx0fTtcblx0XHR9XG5cdH0sXG5cblx0X2ZldGNoQXR0cmlidXRlczogZnVuY3Rpb24oKSB7IFxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7IFxuXG5cdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZSA9IHt9O1xuXG5cdFx0dmFyIGxlbiA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIodGhpcy5wcm9ncmFtLCBnbC5BQ1RJVkVfQVRUUklCVVRFUyk7XG5cdFx0aWYgKCFsZW4pIC8vbnVsbCBvciB6ZXJvXG5cdFx0XHRyZXR1cm47XHRcblxuXHRcdGZvciAodmFyIGk9MDsgaTxsZW47IGkrKykge1xuXHRcdFx0dmFyIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIodGhpcy5wcm9ncmFtLCBpKTtcblx0XHRcdGlmIChpbmZvID09PSBudWxsKSBcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR2YXIgbmFtZSA9IGluZm8ubmFtZTtcblxuXHRcdFx0Ly90aGUgYXR0cmliIGxvY2F0aW9uIGlzIGEgc2ltcGxlIGluZGV4XG5cdFx0XHR2YXIgbG9jYXRpb24gPSBnbC5nZXRBdHRyaWJMb2NhdGlvbih0aGlzLnByb2dyYW0sIG5hbWUpO1xuXHRcdFx0XG5cdFx0XHR0aGlzLmF0dHJpYnV0ZUNhY2hlW25hbWVdID0ge1xuXHRcdFx0XHRzaXplOiBpbmZvLnNpemUsXG5cdFx0XHRcdHR5cGU6IGluZm8udHlwZSxcblx0XHRcdFx0bG9jYXRpb246IGxvY2F0aW9uXG5cdFx0XHR9O1xuXHRcdH1cblx0fSxcblxuXHRfbG9hZFNoYWRlcjogZnVuY3Rpb24odHlwZSwgc291cmNlKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHZhciBzaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIodHlwZSk7XG5cdFx0aWYgKCFzaGFkZXIpIC8vc2hvdWxkIG5vdCBvY2N1ci4uLlxuXHRcdFx0cmV0dXJuIC0xO1xuXG5cdFx0Z2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKTtcblx0XHRnbC5jb21waWxlU2hhZGVyKHNoYWRlcik7XG5cdFx0XG5cdFx0dmFyIGxvZ1Jlc3VsdCA9IGdsLmdldFNoYWRlckluZm9Mb2coc2hhZGVyKSB8fCBcIlwiO1xuXHRcdGlmIChsb2dSZXN1bHQpIHtcblx0XHRcdC8vd2UgZG8gdGhpcyBzbyB0aGUgdXNlciBrbm93cyB3aGljaCBzaGFkZXIgaGFzIHRoZSBlcnJvclxuXHRcdFx0dmFyIHR5cGVTdHIgPSAodHlwZSA9PT0gZ2wuVkVSVEVYX1NIQURFUikgPyBcInZlcnRleFwiIDogXCJmcmFnbWVudFwiO1xuXHRcdFx0bG9nUmVzdWx0ID0gXCJFcnJvciBjb21waWxpbmcgXCIrIHR5cGVTdHIrIFwiIHNoYWRlcjpcXG5cIitsb2dSZXN1bHQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2cgKz0gbG9nUmVzdWx0O1xuXG5cdFx0aWYgKCFnbC5nZXRTaGFkZXJQYXJhbWV0ZXIoc2hhZGVyLCBnbC5DT01QSUxFX1NUQVRVUykgKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmxvZztcblx0XHR9XG5cdFx0cmV0dXJuIHNoYWRlcjtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gaW5mbyAoc2l6ZSwgdHlwZSwgbG9jYXRpb24pLlxuXHQgKiBJZiB0aGUgdW5pZm9ybSBpcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLCBpdCBpcyBhc3N1bWVkXG5cdCAqIHRvIG5vdCBleGlzdCwgYW5kIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICpcblx0ICogVGhpcyBtYXkgcmV0dXJuIG51bGwgZXZlbiBpZiB0aGUgdW5pZm9ybSBpcyBkZWZpbmVkIGluIEdMU0w6XG5cdCAqIGlmIGl0IGlzIF9pbmFjdGl2ZV8gKGkuZS4gbm90IHVzZWQgaW4gdGhlIHByb2dyYW0pIHRoZW4gaXQgbWF5XG5cdCAqIGJlIG9wdGltaXplZCBvdXQuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7T2JqZWN0fSBhbiBvYmplY3QgY29udGFpbmluZyBsb2NhdGlvbiwgc2l6ZSwgYW5kIHR5cGVcblx0ICovXG5cdGdldFVuaWZvcm1JbmZvOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMudW5pZm9ybUNhY2hlW25hbWVdIHx8IG51bGw7IFxuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgYXR0cmlidXRlIGluZm8gKHNpemUsIHR5cGUsIGxvY2F0aW9uKS5cblx0ICogSWYgdGhlIGF0dHJpYnV0ZSBpcyBub3QgZm91bmQgaW4gdGhlIGNhY2hlLCBpdCBpcyBhc3N1bWVkXG5cdCAqIHRvIG5vdCBleGlzdCwgYW5kIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICpcblx0ICogVGhpcyBtYXkgcmV0dXJuIG51bGwgZXZlbiBpZiB0aGUgYXR0cmlidXRlIGlzIGRlZmluZWQgaW4gR0xTTDpcblx0ICogaWYgaXQgaXMgX2luYWN0aXZlXyAoaS5lLiBub3QgdXNlZCBpbiB0aGUgcHJvZ3JhbSBvciBkaXNhYmxlZCkgXG5cdCAqIHRoZW4gaXQgbWF5IGJlIG9wdGltaXplZCBvdXQuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIGF0dHJpYnV0ZSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtvYmplY3R9IGFuIG9iamVjdCBjb250YWluaW5nIGxvY2F0aW9uLCBzaXplIGFuZCB0eXBlXG5cdCAqL1xuXHRnZXRBdHRyaWJ1dGVJbmZvOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuYXR0cmlidXRlQ2FjaGVbbmFtZV0gfHwgbnVsbDsgXG5cdH0sXG5cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gbG9jYXRpb24gb2JqZWN0LlxuXHQgKiBJZiB0aGUgdW5pZm9ybSBpcyBub3QgZm91bmQsIHRoaXMgbWV0aG9kIHJldHVybnMgbnVsbC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtHTGludH0gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKi9cblx0Z2V0QXR0cmlidXRlTG9jYXRpb246IGZ1bmN0aW9uKG5hbWUpIHsgLy9UT0RPOiBtYWtlIGZhc3RlciwgZG9uJ3QgY2FjaGVcblx0XHR2YXIgaW5mbyA9IHRoaXMuZ2V0QXR0cmlidXRlSW5mbyhuYW1lKTtcblx0XHRyZXR1cm4gaW5mbyA/IGluZm8ubG9jYXRpb24gOiBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBsb2NhdGlvbiBvYmplY3QuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7V2ViR0xVbmlmb3JtTG9jYXRpb259IHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICovXG5cdGdldFVuaWZvcm1Mb2NhdGlvbjogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBpbmZvID0gdGhpcy5nZXRVbmlmb3JtSW5mbyhuYW1lKTtcblx0XHRyZXR1cm4gaW5mbyA/IGluZm8ubG9jYXRpb24gOiBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHVuaWZvcm0gaXMgYWN0aXZlIGFuZCBmb3VuZCBpbiB0aGlzXG5cdCAqIGNvbXBpbGVkIHByb2dyYW0uXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9ICBuYW1lIHRoZSB1bmlmb3JtIG5hbWVcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gdHJ1ZSBpZiB0aGUgdW5pZm9ybSBpcyBmb3VuZCBhbmQgYWN0aXZlXG5cdCAqL1xuXHRoYXNVbmlmb3JtOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VW5pZm9ybUluZm8obmFtZSkgIT09IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgYXR0cmlidXRlIGlzIGFjdGl2ZSBhbmQgZm91bmQgaW4gdGhpc1xuXHQgKiBjb21waWxlZCBwcm9ncmFtLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSAgbmFtZSB0aGUgYXR0cmlidXRlIG5hbWVcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gdHJ1ZSBpZiB0aGUgYXR0cmlidXRlIGlzIGZvdW5kIGFuZCBhY3RpdmVcblx0ICovXG5cdGhhc0F0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdldEF0dHJpYnV0ZUluZm8obmFtZSkgIT09IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHVuaWZvcm0gdmFsdWUgYnkgbmFtZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHthbnl9IFRoZSB2YWx1ZSBvZiB0aGUgV2ViR0wgdW5pZm9ybVxuXHQgKi9cblx0Z2V0VW5pZm9ybTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdsLmdldFVuaWZvcm0odGhpcy5wcm9ncmFtLCB0aGlzLmdldFVuaWZvcm1Mb2NhdGlvbihuYW1lKSk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHVuaWZvcm0gdmFsdWUgYXQgdGhlIHNwZWNpZmllZCBXZWJHTFVuaWZvcm1Mb2NhdGlvbi5cblx0ICogXG5cdCAqIEBwYXJhbSAge1dlYkdMVW5pZm9ybUxvY2F0aW9ufSBsb2NhdGlvbiB0aGUgbG9jYXRpb24gb2JqZWN0XG5cdCAqIEByZXR1cm4ge2FueX0gVGhlIHZhbHVlIG9mIHRoZSBXZWJHTCB1bmlmb3JtXG5cdCAqL1xuXHRnZXRVbmlmb3JtQXQ6IGZ1bmN0aW9uKGxvY2F0aW9uKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2wuZ2V0VW5pZm9ybSh0aGlzLnByb2dyYW0sIGxvY2F0aW9uKTtcblx0fSxcblxuXHRiaW5kOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsLnVzZVByb2dyYW0odGhpcy5wcm9ncmFtKTtcblx0fSxcblxuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLmRldGFjaFNoYWRlcih0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmRldGFjaFNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXG5cdFx0Z2wuZGVsZXRlU2hhZGVyKHRoaXMudmVydFNoYWRlcik7XG5cdFx0Z2wuZGVsZXRlU2hhZGVyKHRoaXMuZnJhZ1NoYWRlcik7XG5cblx0XHRnbC5kZWxldGVQcm9ncmFtKHRoaXMucHJvZ3JhbSk7XG5cdFx0dGhpcy5wcm9ncmFtID0gbnVsbDtcblx0fSxcblxuXHRzZXRVbmlmb3JtaTogZnVuY3Rpb24obmFtZSwgeCwgeSwgeiwgdykge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dmFyIGxvYyA9IHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpO1xuXHRcdGlmICghbG9jKSBcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdGNhc2UgMjogZ2wudW5pZm9ybTFpKGxvYywgeCk7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAzOiBnbC51bmlmb3JtMmkobG9jLCB4LCB5KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDQ6IGdsLnVuaWZvcm0zaShsb2MsIHgsIHksIHopOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNTogZ2wudW5pZm9ybTRpKGxvYywgeCwgeSwgeiwgdyk7IHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIGFyZ3VtZW50cyB0byBzZXRVbmlmb3JtaVwiOyBcblx0XHR9XG5cdH0sXG5cblx0c2V0VW5pZm9ybWY6IGZ1bmN0aW9uKG5hbWUsIHgsIHksIHosIHcpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdHZhciBsb2MgPSB0aGlzLmdldFVuaWZvcm1Mb2NhdGlvbihuYW1lKTtcblx0XHRpZiAoIWxvYykgXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0c3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG5cdFx0XHRjYXNlIDI6IGdsLnVuaWZvcm0xZihsb2MsIHgpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMzogZ2wudW5pZm9ybTJmKGxvYywgeCwgeSk7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSA0OiBnbC51bmlmb3JtM2YobG9jLCB4LCB5LCB6KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDU6IGdsLnVuaWZvcm00Zihsb2MsIHgsIHksIHosIHcpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IFwiaW52YWxpZCBhcmd1bWVudHMgdG8gc2V0VW5pZm9ybWZcIjsgXG5cdFx0fVxuXHR9LFxuXG5cdC8vSSBndWVzcyB3ZSB3b24ndCBzdXBwb3J0IHNlcXVlbmNlPEdMZmxvYXQ+IC4uIHdoYXRldmVyIHRoYXQgaXMgPz9cblx0XG5cdC8qKlxuXHQgKiBBIGNvbnZlbmllbmNlIG1ldGhvZCB0byBzZXQgdW5pZm9ybU5mdiBmcm9tIHRoZSBnaXZlbiBBcnJheUJ1ZmZlci5cblx0ICogV2UgZGV0ZXJtaW5lIHdoaWNoIEdMIGNhbGwgdG8gbWFrZSBiYXNlZCBvbiB0aGUgbGVuZ3RoIG9mIHRoZSBhcnJheSBcblx0ICogYnVmZmVyLiBcblx0ICogXHRcblx0ICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgICAgICAgIFx0XHR0aGUgbmFtZSBvZiB0aGUgdW5pZm9ybVxuXHQgKiBAcGFyYW0ge0FycmF5QnVmZmVyfSBhcnJheUJ1ZmZlciB0aGUgYXJyYXkgYnVmZmVyXG5cdCAqL1xuXHRzZXRVbmlmb3JtZnY6IGZ1bmN0aW9uKG5hbWUsIGFycmF5QnVmZmVyKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKCFsb2MpIFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdHN3aXRjaCAoYXJyYXlCdWZmZXIubGVuZ3RoKSB7XG5cdFx0XHRjYXNlIDE6IGdsLnVuaWZvcm0xZnYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAyOiBnbC51bmlmb3JtMmZ2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMzogZ2wudW5pZm9ybTNmdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDQ6IGdsLnVuaWZvcm00ZnYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIGFyZ3VtZW50cyB0byBzZXRVbmlmb3JtZlwiOyBcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIEEgY29udmVuaWVuY2UgbWV0aG9kIHRvIHNldCB1bmlmb3JtTmZ2IGZyb20gdGhlIGdpdmVuIEFycmF5QnVmZmVyLlxuXHQgKiBXZSBkZXRlcm1pbmUgd2hpY2ggR0wgY2FsbCB0byBtYWtlIGJhc2VkIG9uIHRoZSBsZW5ndGggb2YgdGhlIGFycmF5IFxuXHQgKiBidWZmZXIuIFxuXHQgKiBcdFxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAgICAgICAgXHRcdHRoZSBuYW1lIG9mIHRoZSB1bmlmb3JtXG5cdCAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGFycmF5QnVmZmVyIHRoZSBhcnJheSBidWZmZXJcblx0ICovXG5cdHNldFVuaWZvcm1pdjogZnVuY3Rpb24obmFtZSwgYXJyYXlCdWZmZXIpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdHZhciBsb2MgPSB0aGlzLmdldFVuaWZvcm1Mb2NhdGlvbihuYW1lKTtcblx0XHRpZiAoIWxvYykgXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0c3dpdGNoIChhcnJheUJ1ZmZlci5sZW5ndGgpIHtcblx0XHRcdGNhc2UgMTogZ2wudW5pZm9ybTFpdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDI6IGdsLnVuaWZvcm0yaXYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAzOiBnbC51bmlmb3JtM2l2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNDogZ2wudW5pZm9ybTRpdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBcImludmFsaWQgYXJndW1lbnRzIHRvIHNldFVuaWZvcm1mXCI7IFxuXHRcdH1cblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gU2hhZGVyUHJvZ3JhbTsiLCIvKipcbiAgQXV0by1nZW5lcmF0ZWQgS2FtaSBpbmRleCBmaWxlLlxuICBDcmVhdGVkIG9uIDIwMTMtMTEtMjVcbiovXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICAvL2NvcmUgY2xhc3Nlc1xuICAgICdBYnN0cmFjdEJhdGNoJzogICByZXF1aXJlKCcuL0Fic3RyYWN0QmF0Y2guanMnKSxcbiAgICAnQXNzZXRNYW5hZ2VyJzogICAgcmVxdWlyZSgnLi9Bc3NldE1hbmFnZXIuanMnKSxcbiAgICAnU3ByaXRlQmF0Y2gnOiAgICAgcmVxdWlyZSgnLi9TcHJpdGVCYXRjaC5qcycpLFxuICAgICdUZXh0dXJlJzogICAgICAgICByZXF1aXJlKCcuL1RleHR1cmUuanMnKSxcbiAgICAnV2ViR0xDb250ZXh0JzogICAgcmVxdWlyZSgnLi9XZWJHTENvbnRleHQuanMnKSxcbiAgICAnTWVzaCc6ICAgICAgICAgICAgcmVxdWlyZSgnLi9nbHV0aWxzL01lc2guanMnKSxcbiAgICAnU2hhZGVyUHJvZ3JhbSc6ICAgcmVxdWlyZSgnLi9nbHV0aWxzL1NoYWRlclByb2dyYW0uanMnKVxufTsiLCJmdW5jdGlvbiBoYXNHZXR0ZXJPclNldHRlcihkZWYpIHtcblx0cmV0dXJuICghIWRlZi5nZXQgJiYgdHlwZW9mIGRlZi5nZXQgPT09IFwiZnVuY3Rpb25cIikgfHwgKCEhZGVmLnNldCAmJiB0eXBlb2YgZGVmLnNldCA9PT0gXCJmdW5jdGlvblwiKTtcbn1cblxuZnVuY3Rpb24gZ2V0UHJvcGVydHkoZGVmaW5pdGlvbiwgaywgaXNDbGFzc0Rlc2NyaXB0b3IpIHtcblx0Ly9UaGlzIG1heSBiZSBhIGxpZ2h0d2VpZ2h0IG9iamVjdCwgT1IgaXQgbWlnaHQgYmUgYSBwcm9wZXJ0eVxuXHQvL3RoYXQgd2FzIGRlZmluZWQgcHJldmlvdXNseS5cblx0XG5cdC8vRm9yIHNpbXBsZSBjbGFzcyBkZXNjcmlwdG9ycyB3ZSBjYW4ganVzdCBhc3N1bWUgaXRzIE5PVCBwcmV2aW91c2x5IGRlZmluZWQuXG5cdHZhciBkZWYgPSBpc0NsYXNzRGVzY3JpcHRvciBcblx0XHRcdFx0PyBkZWZpbml0aW9uW2tdIFxuXHRcdFx0XHQ6IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoZGVmaW5pdGlvbiwgayk7XG5cblx0aWYgKCFpc0NsYXNzRGVzY3JpcHRvciAmJiBkZWYudmFsdWUgJiYgdHlwZW9mIGRlZi52YWx1ZSA9PT0gXCJvYmplY3RcIikge1xuXHRcdGRlZiA9IGRlZi52YWx1ZTtcblx0fVxuXG5cblx0Ly9UaGlzIG1pZ2h0IGJlIGEgcmVndWxhciBwcm9wZXJ0eSwgb3IgaXQgbWF5IGJlIGEgZ2V0dGVyL3NldHRlciB0aGUgdXNlciBkZWZpbmVkIGluIGEgY2xhc3MuXG5cdGlmICggZGVmICYmIGhhc0dldHRlck9yU2V0dGVyKGRlZikgKSB7XG5cdFx0aWYgKHR5cGVvZiBkZWYuZW51bWVyYWJsZSA9PT0gXCJ1bmRlZmluZWRcIilcblx0XHRcdGRlZi5lbnVtZXJhYmxlID0gdHJ1ZTtcblx0XHRpZiAodHlwZW9mIGRlZi5jb25maWd1cmFibGUgPT09IFwidW5kZWZpbmVkXCIpXG5cdFx0XHRkZWYuY29uZmlndXJhYmxlID0gdHJ1ZTtcblx0XHRyZXR1cm4gZGVmO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBoYXNOb25Db25maWd1cmFibGUob2JqLCBrKSB7XG5cdHZhciBwcm9wID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihvYmosIGspO1xuXHRpZiAoIXByb3ApXG5cdFx0cmV0dXJuIGZhbHNlO1xuXG5cdGlmIChwcm9wLnZhbHVlICYmIHR5cGVvZiBwcm9wLnZhbHVlID09PSBcIm9iamVjdFwiKVxuXHRcdHByb3AgPSBwcm9wLnZhbHVlO1xuXG5cdGlmIChwcm9wLmNvbmZpZ3VyYWJsZSA9PT0gZmFsc2UpIFxuXHRcdHJldHVybiB0cnVlO1xuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuLy9UT0RPOiBPbiBjcmVhdGUsIFxuLy9cdFx0T24gbWl4aW4sIFxuXG5mdW5jdGlvbiBleHRlbmQoY3RvciwgZGVmaW5pdGlvbiwgaXNDbGFzc0Rlc2NyaXB0b3IsIGV4dGVuZCkge1xuXHRmb3IgKHZhciBrIGluIGRlZmluaXRpb24pIHtcblx0XHRpZiAoIWRlZmluaXRpb24uaGFzT3duUHJvcGVydHkoaykpXG5cdFx0XHRjb250aW51ZTtcblxuXHRcdHZhciBkZWYgPSBnZXRQcm9wZXJ0eShkZWZpbml0aW9uLCBrLCBpc0NsYXNzRGVzY3JpcHRvcik7XG5cblx0XHRpZiAoZGVmICE9PSBmYWxzZSkge1xuXHRcdFx0Ly9JZiBFeHRlbmRzIGlzIHVzZWQsIHdlIHdpbGwgY2hlY2sgaXRzIHByb3RvdHlwZSB0byBzZWUgaWYgXG5cdFx0XHQvL3RoZSBmaW5hbCB2YXJpYWJsZSBleGlzdHMuXG5cdFx0XHRcblx0XHRcdHZhciBwYXJlbnQgPSBleHRlbmQgfHwgY3Rvcjtcblx0XHRcdGlmIChoYXNOb25Db25maWd1cmFibGUocGFyZW50LnByb3RvdHlwZSwgaykpIHtcblxuXHRcdFx0XHQvL2p1c3Qgc2tpcCB0aGUgZmluYWwgcHJvcGVydHlcblx0XHRcdFx0aWYgKENsYXNzLmlnbm9yZUZpbmFscylcblx0XHRcdFx0XHRjb250aW51ZTtcblxuXHRcdFx0XHQvL1dlIGNhbm5vdCByZS1kZWZpbmUgYSBwcm9wZXJ0eSB0aGF0IGlzIGNvbmZpZ3VyYWJsZT1mYWxzZS5cblx0XHRcdFx0Ly9TbyB3ZSB3aWxsIGNvbnNpZGVyIHRoZW0gZmluYWwgYW5kIHRocm93IGFuIGVycm9yLiBUaGlzIGlzIGJ5XG5cdFx0XHRcdC8vZGVmYXVsdCBzbyBpdCBpcyBjbGVhciB0byB0aGUgZGV2ZWxvcGVyIHdoYXQgaXMgaGFwcGVuaW5nLlxuXHRcdFx0XHQvL1lvdSBjYW4gc2V0IGlnbm9yZUZpbmFscyB0byB0cnVlIGlmIHlvdSBuZWVkIHRvIGV4dGVuZCBhIGNsYXNzXG5cdFx0XHRcdC8vd2hpY2ggaGFzIGNvbmZpZ3VyYWJsZT1mYWxzZTsgaXQgd2lsbCBzaW1wbHkgbm90IHJlLWRlZmluZSBmaW5hbCBwcm9wZXJ0aWVzLlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJjYW5ub3Qgb3ZlcnJpZGUgZmluYWwgcHJvcGVydHkgJ1wiK2tcblx0XHRcdFx0XHRcdFx0K1wiJywgc2V0IENsYXNzLmlnbm9yZUZpbmFscyA9IHRydWUgdG8gc2tpcFwiKTtcblx0XHRcdH1cblxuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGN0b3IucHJvdG90eXBlLCBrLCBkZWYpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdG9yLnByb3RvdHlwZVtrXSA9IGRlZmluaXRpb25ba107XG5cdFx0fVxuXG5cdH1cbn1cblxuLyoqXG4gKi9cbmZ1bmN0aW9uIG1peGluKG15Q2xhc3MsIG1peGlucykge1xuXHRpZiAoIW1peGlucylcblx0XHRyZXR1cm47XG5cblx0aWYgKCFBcnJheS5pc0FycmF5KG1peGlucykpXG5cdFx0bWl4aW5zID0gW21peGluc107XG5cblx0Zm9yICh2YXIgaT0wOyBpPG1peGlucy5sZW5ndGg7IGkrKykge1xuXHRcdGV4dGVuZChteUNsYXNzLCBtaXhpbnNbaV0ucHJvdG90eXBlIHx8IG1peGluc1tpXSk7XG5cdH1cbn1cblxuLyoqXG4gKiBcbiAqL1xuZnVuY3Rpb24gQ2xhc3MoZGVmaW5pdGlvbikge1xuXHRpZiAoIWRlZmluaXRpb24pXG5cdFx0ZGVmaW5pdGlvbiA9IHt9O1xuXG5cdC8vVGhlIHZhcmlhYmxlIG5hbWUgaGVyZSBkaWN0YXRlcyB3aGF0IHdlIHNlZSBpbiBDaHJvbWUgZGVidWdnZXJcblx0dmFyIGluaXRpYWxpemU7XG5cdHZhciBFeHRlbmRzO1xuXG5cdGlmIChkZWZpbml0aW9uLmluaXRpYWxpemUpIHtcblx0XHRpZiAodHlwZW9mIGRlZmluaXRpb24uaW5pdGlhbGl6ZSAhPT0gXCJmdW5jdGlvblwiKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiaW5pdGlhbGl6ZSBtdXN0IGJlIGEgZnVuY3Rpb25cIik7XG5cdFx0aW5pdGlhbGl6ZSA9IGRlZmluaXRpb24uaW5pdGlhbGl6ZTtcblxuXHRcdC8vVXN1YWxseSB3ZSBzaG91bGQgYXZvaWQgXCJkZWxldGVcIiBpbiBWOCBhdCBhbGwgY29zdHMuXG5cdFx0Ly9Ib3dldmVyLCBpdHMgdW5saWtlbHkgdG8gbWFrZSBhbnkgcGVyZm9ybWFuY2UgZGlmZmVyZW5jZVxuXHRcdC8vaGVyZSBzaW5jZSB3ZSBvbmx5IGNhbGwgdGhpcyBvbiBjbGFzcyBjcmVhdGlvbiAoaS5lLiBub3Qgb2JqZWN0IGNyZWF0aW9uKS5cblx0XHRkZWxldGUgZGVmaW5pdGlvbi5pbml0aWFsaXplO1xuXHR9IGVsc2Uge1xuXHRcdGlmIChkZWZpbml0aW9uLkV4dGVuZHMpIHtcblx0XHRcdHZhciBiYXNlID0gZGVmaW5pdGlvbi5FeHRlbmRzO1xuXHRcdFx0aW5pdGlhbGl6ZSA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0YmFzZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdFx0fTsgXG5cdFx0fSBlbHNlIHtcblx0XHRcdGluaXRpYWxpemUgPSBmdW5jdGlvbiAoKSB7fTsgXG5cdFx0fVxuXHR9XG5cblx0aWYgKGRlZmluaXRpb24uRXh0ZW5kcykge1xuXHRcdGluaXRpYWxpemUucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShkZWZpbml0aW9uLkV4dGVuZHMucHJvdG90eXBlKTtcblx0XHRpbml0aWFsaXplLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGluaXRpYWxpemU7XG5cdFx0Ly9mb3IgZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIHRvIHdvcmssIHdlIG5lZWQgdG8gYWN0XG5cdFx0Ly9kaXJlY3RseSBvbiB0aGUgRXh0ZW5kcyAob3IgTWl4aW4pXG5cdFx0RXh0ZW5kcyA9IGRlZmluaXRpb24uRXh0ZW5kcztcblx0XHRkZWxldGUgZGVmaW5pdGlvbi5FeHRlbmRzO1xuXHR9IGVsc2Uge1xuXHRcdGluaXRpYWxpemUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gaW5pdGlhbGl6ZTtcblx0fVxuXG5cdC8vR3JhYiB0aGUgbWl4aW5zLCBpZiB0aGV5IGFyZSBzcGVjaWZpZWQuLi5cblx0dmFyIG1peGlucyA9IG51bGw7XG5cdGlmIChkZWZpbml0aW9uLk1peGlucykge1xuXHRcdG1peGlucyA9IGRlZmluaXRpb24uTWl4aW5zO1xuXHRcdGRlbGV0ZSBkZWZpbml0aW9uLk1peGlucztcblx0fVxuXG5cdC8vRmlyc3QsIG1peGluIGlmIHdlIGNhbi5cblx0bWl4aW4oaW5pdGlhbGl6ZSwgbWl4aW5zKTtcblxuXHQvL05vdyB3ZSBncmFiIHRoZSBhY3R1YWwgZGVmaW5pdGlvbiB3aGljaCBkZWZpbmVzIHRoZSBvdmVycmlkZXMuXG5cdGV4dGVuZChpbml0aWFsaXplLCBkZWZpbml0aW9uLCB0cnVlLCBFeHRlbmRzKTtcblxuXHRyZXR1cm4gaW5pdGlhbGl6ZTtcbn07XG5cbkNsYXNzLmV4dGVuZCA9IGV4dGVuZDtcbkNsYXNzLm1peGluID0gbWl4aW47XG5DbGFzcy5pZ25vcmVGaW5hbHMgPSBmYWxzZTtcblxubW9kdWxlLmV4cG9ydHMgPSBDbGFzczsiLCJ2YXIgaW50OCA9IG5ldyBJbnQ4QXJyYXkoNCk7XG52YXIgaW50MzIgPSBuZXcgSW50MzJBcnJheShpbnQ4LmJ1ZmZlciwgMCwgMSk7XG52YXIgZmxvYXQzMiA9IG5ldyBGbG9hdDMyQXJyYXkoaW50OC5idWZmZXIsIDAsIDEpO1xuXG4vKipcbiAqIEEgc2luZ2xldG9uIGZvciBudW1iZXIgdXRpbGl0aWVzLiBcbiAqIEBjbGFzcyBOdW1iZXJVdGlsXG4gKi9cbnZhciBOdW1iZXJVdGlsID0gZnVuY3Rpb24oKSB7XG5cbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgZmxvYXQgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGludCBiaXRzLiBBcnJheUJ1ZmZlclxuICogaXMgdXNlZCBmb3IgdGhlIGNvbnZlcnNpb24uXG4gKlxuICogQG1ldGhvZCAgaW50Qml0c1RvRmxvYXRcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSAge051bWJlcn0gaSB0aGUgaW50IHRvIGNhc3RcbiAqIEByZXR1cm4ge051bWJlcn0gICB0aGUgZmxvYXRcbiAqL1xuTnVtYmVyVXRpbC5pbnRCaXRzVG9GbG9hdCA9IGZ1bmN0aW9uKGkpIHtcblx0aW50MzJbMF0gPSBpO1xuXHRyZXR1cm4gZmxvYXQzMlswXTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaW50IGJpdHMgZnJvbSB0aGUgZ2l2ZW4gZmxvYXQuIEFycmF5QnVmZmVyIGlzIHVzZWRcbiAqIGZvciB0aGUgY29udmVyc2lvbi5cbiAqXG4gKiBAbWV0aG9kICBmbG9hdFRvSW50Qml0c1xuICogQHN0YXRpY1xuICogQHBhcmFtICB7TnVtYmVyfSBmIHRoZSBmbG9hdCB0byBjYXN0XG4gKiBAcmV0dXJuIHtOdW1iZXJ9ICAgdGhlIGludCBiaXRzXG4gKi9cbk51bWJlclV0aWwuZmxvYXRUb0ludEJpdHMgPSBmdW5jdGlvbihmKSB7XG5cdGZsb2F0MzJbMF0gPSBmO1xuXHRyZXR1cm4gaW50MzJbMF07XG59O1xuXG4vKipcbiAqIEVuY29kZXMgQUJHUiBpbnQgYXMgYSBmbG9hdCwgd2l0aCBzbGlnaHQgcHJlY2lzaW9uIGxvc3MuXG4gKlxuICogQG1ldGhvZCAgaW50VG9GbG9hdENvbG9yXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0ge051bWJlcn0gdmFsdWUgYW4gQUJHUiBwYWNrZWQgaW50ZWdlclxuICovXG5OdW1iZXJVdGlsLmludFRvRmxvYXRDb2xvciA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdHJldHVybiBOdW1iZXJVdGlsLmludEJpdHNUb0Zsb2F0KCB2YWx1ZSAmIDB4ZmVmZmZmZmYgKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIGZsb2F0IGVuY29kZWQgQUJHUiB2YWx1ZSBmcm9tIHRoZSBnaXZlbiBSR0JBXG4gKiBieXRlcyAoMCAtIDI1NSkuIFVzZWZ1bCBmb3Igc2F2aW5nIGJhbmR3aWR0aCBpbiB2ZXJ0ZXggZGF0YS5cbiAqXG4gKiBAbWV0aG9kICBjb2xvclRvRmxvYXRcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7TnVtYmVyfSByIHRoZSBSZWQgYnl0ZSAoMCAtIDI1NSlcbiAqIEBwYXJhbSB7TnVtYmVyfSBnIHRoZSBHcmVlbiBieXRlICgwIC0gMjU1KVxuICogQHBhcmFtIHtOdW1iZXJ9IGIgdGhlIEJsdWUgYnl0ZSAoMCAtIDI1NSlcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIHRoZSBBbHBoYSBieXRlICgwIC0gMjU1KVxuICogQHJldHVybiB7RmxvYXQzMn0gIGEgRmxvYXQzMiBvZiB0aGUgUkdCQSBjb2xvclxuICovXG5OdW1iZXJVdGlsLmNvbG9yVG9GbG9hdCA9IGZ1bmN0aW9uKHIsIGcsIGIsIGEpIHtcblx0dmFyIGJpdHMgPSAoYSA8PCAyNCB8IGIgPDwgMTYgfCBnIDw8IDggfCByKTtcblx0cmV0dXJuIE51bWJlclV0aWwuaW50VG9GbG9hdENvbG9yKGJpdHMpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBOdW1iZXJVdGlsOyIsIi8qanNsaW50IG9uZXZhcjp0cnVlLCB1bmRlZjp0cnVlLCBuZXdjYXA6dHJ1ZSwgcmVnZXhwOnRydWUsIGJpdHdpc2U6dHJ1ZSwgbWF4ZXJyOjUwLCBpbmRlbnQ6NCwgd2hpdGU6ZmFsc2UsIG5vbWVuOmZhbHNlLCBwbHVzcGx1czpmYWxzZSAqL1xuLypnbG9iYWwgZGVmaW5lOmZhbHNlLCByZXF1aXJlOmZhbHNlLCBleHBvcnRzOmZhbHNlLCBtb2R1bGU6ZmFsc2UsIHNpZ25hbHM6ZmFsc2UgKi9cblxuLyoqIEBsaWNlbnNlXG4gKiBKUyBTaWduYWxzIDxodHRwOi8vbWlsbGVybWVkZWlyb3MuZ2l0aHViLmNvbS9qcy1zaWduYWxzLz5cbiAqIFJlbGVhc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZVxuICogQXV0aG9yOiBNaWxsZXIgTWVkZWlyb3NcbiAqIFZlcnNpb246IDEuMC4wIC0gQnVpbGQ6IDI2OCAoMjAxMi8xMS8yOSAwNTo0OCBQTSlcbiAqL1xuXG4oZnVuY3Rpb24oZ2xvYmFsKXtcblxuICAgIC8vIFNpZ25hbEJpbmRpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLyoqXG4gICAgICogT2JqZWN0IHRoYXQgcmVwcmVzZW50cyBhIGJpbmRpbmcgYmV0d2VlbiBhIFNpZ25hbCBhbmQgYSBsaXN0ZW5lciBmdW5jdGlvbi5cbiAgICAgKiA8YnIgLz4tIDxzdHJvbmc+VGhpcyBpcyBhbiBpbnRlcm5hbCBjb25zdHJ1Y3RvciBhbmQgc2hvdWxkbid0IGJlIGNhbGxlZCBieSByZWd1bGFyIHVzZXJzLjwvc3Ryb25nPlxuICAgICAqIDxiciAvPi0gaW5zcGlyZWQgYnkgSm9hIEViZXJ0IEFTMyBTaWduYWxCaW5kaW5nIGFuZCBSb2JlcnQgUGVubmVyJ3MgU2xvdCBjbGFzc2VzLlxuICAgICAqIEBhdXRob3IgTWlsbGVyIE1lZGVpcm9zXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQGludGVybmFsXG4gICAgICogQG5hbWUgU2lnbmFsQmluZGluZ1xuICAgICAqIEBwYXJhbSB7U2lnbmFsfSBzaWduYWwgUmVmZXJlbmNlIHRvIFNpZ25hbCBvYmplY3QgdGhhdCBsaXN0ZW5lciBpcyBjdXJyZW50bHkgYm91bmQgdG8uXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNPbmNlIElmIGJpbmRpbmcgc2hvdWxkIGJlIGV4ZWN1dGVkIGp1c3Qgb25jZS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF0gQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gW3ByaW9yaXR5XSBUaGUgcHJpb3JpdHkgbGV2ZWwgb2YgdGhlIGV2ZW50IGxpc3RlbmVyLiAoZGVmYXVsdCA9IDApLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIFNpZ25hbEJpbmRpbmcoc2lnbmFsLCBsaXN0ZW5lciwgaXNPbmNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KSB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbC5cbiAgICAgICAgICogQHR5cGUgRnVuY3Rpb25cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX2xpc3RlbmVyID0gbGlzdGVuZXI7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIGJpbmRpbmcgc2hvdWxkIGJlIGV4ZWN1dGVkIGp1c3Qgb25jZS5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5faXNPbmNlID0gaXNPbmNlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAgICAgKiBAbWVtYmVyT2YgU2lnbmFsQmluZGluZy5wcm90b3R5cGVcbiAgICAgICAgICogQG5hbWUgY29udGV4dFxuICAgICAgICAgKiBAdHlwZSBPYmplY3R8dW5kZWZpbmVkfG51bGxcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuY29udGV4dCA9IGxpc3RlbmVyQ29udGV4dDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVmZXJlbmNlIHRvIFNpZ25hbCBvYmplY3QgdGhhdCBsaXN0ZW5lciBpcyBjdXJyZW50bHkgYm91bmQgdG8uXG4gICAgICAgICAqIEB0eXBlIFNpZ25hbFxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fc2lnbmFsID0gc2lnbmFsO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBMaXN0ZW5lciBwcmlvcml0eVxuICAgICAgICAgKiBAdHlwZSBOdW1iZXJcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3ByaW9yaXR5ID0gcHJpb3JpdHkgfHwgMDtcbiAgICB9XG5cbiAgICBTaWduYWxCaW5kaW5nLnByb3RvdHlwZSA9IHtcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgYmluZGluZyBpcyBhY3RpdmUgYW5kIHNob3VsZCBiZSBleGVjdXRlZC5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKi9cbiAgICAgICAgYWN0aXZlIDogdHJ1ZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGVmYXVsdCBwYXJhbWV0ZXJzIHBhc3NlZCB0byBsaXN0ZW5lciBkdXJpbmcgYFNpZ25hbC5kaXNwYXRjaGAgYW5kIGBTaWduYWxCaW5kaW5nLmV4ZWN1dGVgLiAoY3VycmllZCBwYXJhbWV0ZXJzKVxuICAgICAgICAgKiBAdHlwZSBBcnJheXxudWxsXG4gICAgICAgICAqL1xuICAgICAgICBwYXJhbXMgOiBudWxsLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDYWxsIGxpc3RlbmVyIHBhc3NpbmcgYXJiaXRyYXJ5IHBhcmFtZXRlcnMuXG4gICAgICAgICAqIDxwPklmIGJpbmRpbmcgd2FzIGFkZGVkIHVzaW5nIGBTaWduYWwuYWRkT25jZSgpYCBpdCB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgcmVtb3ZlZCBmcm9tIHNpZ25hbCBkaXNwYXRjaCBxdWV1ZSwgdGhpcyBtZXRob2QgaXMgdXNlZCBpbnRlcm5hbGx5IGZvciB0aGUgc2lnbmFsIGRpc3BhdGNoLjwvcD5cbiAgICAgICAgICogQHBhcmFtIHtBcnJheX0gW3BhcmFtc0Fycl0gQXJyYXkgb2YgcGFyYW1ldGVycyB0aGF0IHNob3VsZCBiZSBwYXNzZWQgdG8gdGhlIGxpc3RlbmVyXG4gICAgICAgICAqIEByZXR1cm4geyp9IFZhbHVlIHJldHVybmVkIGJ5IHRoZSBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGV4ZWN1dGUgOiBmdW5jdGlvbiAocGFyYW1zQXJyKSB7XG4gICAgICAgICAgICB2YXIgaGFuZGxlclJldHVybiwgcGFyYW1zO1xuICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlICYmICEhdGhpcy5fbGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICBwYXJhbXMgPSB0aGlzLnBhcmFtcz8gdGhpcy5wYXJhbXMuY29uY2F0KHBhcmFtc0FycikgOiBwYXJhbXNBcnI7XG4gICAgICAgICAgICAgICAgaGFuZGxlclJldHVybiA9IHRoaXMuX2xpc3RlbmVyLmFwcGx5KHRoaXMuY29udGV4dCwgcGFyYW1zKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5faXNPbmNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZXJSZXR1cm47XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERldGFjaCBiaW5kaW5nIGZyb20gc2lnbmFsLlxuICAgICAgICAgKiAtIGFsaWFzIHRvOiBteVNpZ25hbC5yZW1vdmUobXlCaW5kaW5nLmdldExpc3RlbmVyKCkpO1xuICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbnxudWxsfSBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwgb3IgYG51bGxgIGlmIGJpbmRpbmcgd2FzIHByZXZpb3VzbHkgZGV0YWNoZWQuXG4gICAgICAgICAqL1xuICAgICAgICBkZXRhY2ggOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pc0JvdW5kKCk/IHRoaXMuX3NpZ25hbC5yZW1vdmUodGhpcy5fbGlzdGVuZXIsIHRoaXMuY29udGV4dCkgOiBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtCb29sZWFufSBgdHJ1ZWAgaWYgYmluZGluZyBpcyBzdGlsbCBib3VuZCB0byB0aGUgc2lnbmFsIGFuZCBoYXZlIGEgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBpc0JvdW5kIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICghIXRoaXMuX3NpZ25hbCAmJiAhIXRoaXMuX2xpc3RlbmVyKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7Ym9vbGVhbn0gSWYgU2lnbmFsQmluZGluZyB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgb25jZS5cbiAgICAgICAgICovXG4gICAgICAgIGlzT25jZSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9pc09uY2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge0Z1bmN0aW9ufSBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwuXG4gICAgICAgICAqL1xuICAgICAgICBnZXRMaXN0ZW5lciA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9saXN0ZW5lcjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsfSBTaWduYWwgdGhhdCBsaXN0ZW5lciBpcyBjdXJyZW50bHkgYm91bmQgdG8uXG4gICAgICAgICAqL1xuICAgICAgICBnZXRTaWduYWwgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2lnbmFsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEZWxldGUgaW5zdGFuY2UgcHJvcGVydGllc1xuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX2Rlc3Ryb3kgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fc2lnbmFsO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2xpc3RlbmVyO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuY29udGV4dDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfSBTdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG9iamVjdC5cbiAgICAgICAgICovXG4gICAgICAgIHRvU3RyaW5nIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdbU2lnbmFsQmluZGluZyBpc09uY2U6JyArIHRoaXMuX2lzT25jZSArJywgaXNCb3VuZDonKyB0aGlzLmlzQm91bmQoKSArJywgYWN0aXZlOicgKyB0aGlzLmFjdGl2ZSArICddJztcbiAgICAgICAgfVxuXG4gICAgfTtcblxuXG4vKmdsb2JhbCBTaWduYWxCaW5kaW5nOmZhbHNlKi9cblxuICAgIC8vIFNpZ25hbCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgZm5OYW1lKSB7XG4gICAgICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciggJ2xpc3RlbmVyIGlzIGEgcmVxdWlyZWQgcGFyYW0gb2Yge2ZufSgpIGFuZCBzaG91bGQgYmUgYSBGdW5jdGlvbi4nLnJlcGxhY2UoJ3tmbn0nLCBmbk5hbWUpICk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDdXN0b20gZXZlbnQgYnJvYWRjYXN0ZXJcbiAgICAgKiA8YnIgLz4tIGluc3BpcmVkIGJ5IFJvYmVydCBQZW5uZXIncyBBUzMgU2lnbmFscy5cbiAgICAgKiBAbmFtZSBTaWduYWxcbiAgICAgKiBAYXV0aG9yIE1pbGxlciBNZWRlaXJvc1xuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGZ1bmN0aW9uIFNpZ25hbCgpIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIEFycmF5LjxTaWduYWxCaW5kaW5nPlxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fYmluZGluZ3MgPSBbXTtcbiAgICAgICAgdGhpcy5fcHJldlBhcmFtcyA9IG51bGw7XG5cbiAgICAgICAgLy8gZW5mb3JjZSBkaXNwYXRjaCB0byBhd2F5cyB3b3JrIG9uIHNhbWUgY29udGV4dCAoIzQ3KVxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2ggPSBmdW5jdGlvbigpe1xuICAgICAgICAgICAgU2lnbmFsLnByb3RvdHlwZS5kaXNwYXRjaC5hcHBseShzZWxmLCBhcmd1bWVudHMpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIFNpZ25hbC5wcm90b3R5cGUgPSB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFNpZ25hbHMgVmVyc2lvbiBOdW1iZXJcbiAgICAgICAgICogQHR5cGUgU3RyaW5nXG4gICAgICAgICAqIEBjb25zdFxuICAgICAgICAgKi9cbiAgICAgICAgVkVSU0lPTiA6ICcxLjAuMCcsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIFNpZ25hbCBzaG91bGQga2VlcCByZWNvcmQgb2YgcHJldmlvdXNseSBkaXNwYXRjaGVkIHBhcmFtZXRlcnMgYW5kXG4gICAgICAgICAqIGF1dG9tYXRpY2FsbHkgZXhlY3V0ZSBsaXN0ZW5lciBkdXJpbmcgYGFkZCgpYC9gYWRkT25jZSgpYCBpZiBTaWduYWwgd2FzXG4gICAgICAgICAqIGFscmVhZHkgZGlzcGF0Y2hlZCBiZWZvcmUuXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICovXG4gICAgICAgIG1lbW9yaXplIDogZmFsc2UsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9zaG91bGRQcm9wYWdhdGUgOiB0cnVlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBTaWduYWwgaXMgYWN0aXZlIGFuZCBzaG91bGQgYnJvYWRjYXN0IGV2ZW50cy5cbiAgICAgICAgICogPHA+PHN0cm9uZz5JTVBPUlRBTlQ6PC9zdHJvbmc+IFNldHRpbmcgdGhpcyBwcm9wZXJ0eSBkdXJpbmcgYSBkaXNwYXRjaCB3aWxsIG9ubHkgYWZmZWN0IHRoZSBuZXh0IGRpc3BhdGNoLCBpZiB5b3Ugd2FudCB0byBzdG9wIHRoZSBwcm9wYWdhdGlvbiBvZiBhIHNpZ25hbCB1c2UgYGhhbHQoKWAgaW5zdGVhZC48L3A+XG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICovXG4gICAgICAgIGFjdGl2ZSA6IHRydWUsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyXG4gICAgICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNPbmNlXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XVxuICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gW3ByaW9yaXR5XVxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWxCaW5kaW5nfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX3JlZ2lzdGVyTGlzdGVuZXIgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGlzT25jZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuXG4gICAgICAgICAgICB2YXIgcHJldkluZGV4ID0gdGhpcy5faW5kZXhPZkxpc3RlbmVyKGxpc3RlbmVyLCBsaXN0ZW5lckNvbnRleHQpLFxuICAgICAgICAgICAgICAgIGJpbmRpbmc7XG5cbiAgICAgICAgICAgIGlmIChwcmV2SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgYmluZGluZyA9IHRoaXMuX2JpbmRpbmdzW3ByZXZJbmRleF07XG4gICAgICAgICAgICAgICAgaWYgKGJpbmRpbmcuaXNPbmNlKCkgIT09IGlzT25jZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBjYW5ub3QgYWRkJysgKGlzT25jZT8gJycgOiAnT25jZScpICsnKCkgdGhlbiBhZGQnKyAoIWlzT25jZT8gJycgOiAnT25jZScpICsnKCkgdGhlIHNhbWUgbGlzdGVuZXIgd2l0aG91dCByZW1vdmluZyB0aGUgcmVsYXRpb25zaGlwIGZpcnN0LicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYmluZGluZyA9IG5ldyBTaWduYWxCaW5kaW5nKHRoaXMsIGxpc3RlbmVyLCBpc09uY2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkZEJpbmRpbmcoYmluZGluZyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKHRoaXMubWVtb3JpemUgJiYgdGhpcy5fcHJldlBhcmFtcyl7XG4gICAgICAgICAgICAgICAgYmluZGluZy5leGVjdXRlKHRoaXMuX3ByZXZQYXJhbXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gYmluZGluZztcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtTaWduYWxCaW5kaW5nfSBiaW5kaW5nXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfYWRkQmluZGluZyA6IGZ1bmN0aW9uIChiaW5kaW5nKSB7XG4gICAgICAgICAgICAvL3NpbXBsaWZpZWQgaW5zZXJ0aW9uIHNvcnRcbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoO1xuICAgICAgICAgICAgZG8geyAtLW47IH0gd2hpbGUgKHRoaXMuX2JpbmRpbmdzW25dICYmIGJpbmRpbmcuX3ByaW9yaXR5IDw9IHRoaXMuX2JpbmRpbmdzW25dLl9wcmlvcml0eSk7XG4gICAgICAgICAgICB0aGlzLl9iaW5kaW5ncy5zcGxpY2UobiArIDEsIDAsIGJpbmRpbmcpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lclxuICAgICAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfaW5kZXhPZkxpc3RlbmVyIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBjb250ZXh0KSB7XG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBjdXI7XG4gICAgICAgICAgICB3aGlsZSAobi0tKSB7XG4gICAgICAgICAgICAgICAgY3VyID0gdGhpcy5fYmluZGluZ3Nbbl07XG4gICAgICAgICAgICAgICAgaWYgKGN1ci5fbGlzdGVuZXIgPT09IGxpc3RlbmVyICYmIGN1ci5jb250ZXh0ID09PSBjb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ2hlY2sgaWYgbGlzdGVuZXIgd2FzIGF0dGFjaGVkIHRvIFNpZ25hbC5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXJcbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtjb250ZXh0XVxuICAgICAgICAgKiBAcmV0dXJuIHtib29sZWFufSBpZiBTaWduYWwgaGFzIHRoZSBzcGVjaWZpZWQgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBoYXMgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9pbmRleE9mTGlzdGVuZXIobGlzdGVuZXIsIGNvbnRleHQpICE9PSAtMTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQWRkIGEgbGlzdGVuZXIgdG8gdGhlIHNpZ25hbC5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgU2lnbmFsIGhhbmRsZXIgZnVuY3Rpb24uXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XSBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gW3ByaW9yaXR5XSBUaGUgcHJpb3JpdHkgbGV2ZWwgb2YgdGhlIGV2ZW50IGxpc3RlbmVyLiBMaXN0ZW5lcnMgd2l0aCBoaWdoZXIgcHJpb3JpdHkgd2lsbCBiZSBleGVjdXRlZCBiZWZvcmUgbGlzdGVuZXJzIHdpdGggbG93ZXIgcHJpb3JpdHkuIExpc3RlbmVycyB3aXRoIHNhbWUgcHJpb3JpdHkgbGV2ZWwgd2lsbCBiZSBleGVjdXRlZCBhdCB0aGUgc2FtZSBvcmRlciBhcyB0aGV5IHdlcmUgYWRkZWQuIChkZWZhdWx0ID0gMClcbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsQmluZGluZ30gQW4gT2JqZWN0IHJlcHJlc2VudGluZyB0aGUgYmluZGluZyBiZXR3ZWVuIHRoZSBTaWduYWwgYW5kIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgYWRkIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KSB7XG4gICAgICAgICAgICB2YWxpZGF0ZUxpc3RlbmVyKGxpc3RlbmVyLCAnYWRkJyk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcihsaXN0ZW5lciwgZmFsc2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBBZGQgbGlzdGVuZXIgdG8gdGhlIHNpZ25hbCB0aGF0IHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIGZpcnN0IGV4ZWN1dGlvbiAod2lsbCBiZSBleGVjdXRlZCBvbmx5IG9uY2UpLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBTaWduYWwgaGFuZGxlciBmdW5jdGlvbi5cbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldIFRoZSBwcmlvcml0eSBsZXZlbCBvZiB0aGUgZXZlbnQgbGlzdGVuZXIuIExpc3RlbmVycyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIGV4ZWN1dGVkIGJlZm9yZSBsaXN0ZW5lcnMgd2l0aCBsb3dlciBwcmlvcml0eS4gTGlzdGVuZXJzIHdpdGggc2FtZSBwcmlvcml0eSBsZXZlbCB3aWxsIGJlIGV4ZWN1dGVkIGF0IHRoZSBzYW1lIG9yZGVyIGFzIHRoZXkgd2VyZSBhZGRlZC4gKGRlZmF1bHQgPSAwKVxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWxCaW5kaW5nfSBBbiBPYmplY3QgcmVwcmVzZW50aW5nIHRoZSBiaW5kaW5nIGJldHdlZW4gdGhlIFNpZ25hbCBhbmQgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBhZGRPbmNlIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KSB7XG4gICAgICAgICAgICB2YWxpZGF0ZUxpc3RlbmVyKGxpc3RlbmVyLCAnYWRkT25jZScpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXIobGlzdGVuZXIsIHRydWUsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZW1vdmUgYSBzaW5nbGUgbGlzdGVuZXIgZnJvbSB0aGUgZGlzcGF0Y2ggcXVldWUuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIEhhbmRsZXIgZnVuY3Rpb24gdGhhdCBzaG91bGQgYmUgcmVtb3ZlZC5cbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtjb250ZXh0XSBFeGVjdXRpb24gY29udGV4dCAoc2luY2UgeW91IGNhbiBhZGQgdGhlIHNhbWUgaGFuZGxlciBtdWx0aXBsZSB0aW1lcyBpZiBleGVjdXRpbmcgaW4gYSBkaWZmZXJlbnQgY29udGV4dCkuXG4gICAgICAgICAqIEByZXR1cm4ge0Z1bmN0aW9ufSBMaXN0ZW5lciBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAgKi9cbiAgICAgICAgcmVtb3ZlIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBjb250ZXh0KSB7XG4gICAgICAgICAgICB2YWxpZGF0ZUxpc3RlbmVyKGxpc3RlbmVyLCAncmVtb3ZlJyk7XG5cbiAgICAgICAgICAgIHZhciBpID0gdGhpcy5faW5kZXhPZkxpc3RlbmVyKGxpc3RlbmVyLCBjb250ZXh0KTtcbiAgICAgICAgICAgIGlmIChpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzW2ldLl9kZXN0cm95KCk7IC8vbm8gcmVhc29uIHRvIGEgU2lnbmFsQmluZGluZyBleGlzdCBpZiBpdCBpc24ndCBhdHRhY2hlZCB0byBhIHNpZ25hbFxuICAgICAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBsaXN0ZW5lcjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlIGFsbCBsaXN0ZW5lcnMgZnJvbSB0aGUgU2lnbmFsLlxuICAgICAgICAgKi9cbiAgICAgICAgcmVtb3ZlQWxsIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGg7XG4gICAgICAgICAgICB3aGlsZSAobi0tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYmluZGluZ3Nbbl0uX2Rlc3Ryb3koKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzLmxlbmd0aCA9IDA7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge251bWJlcn0gTnVtYmVyIG9mIGxpc3RlbmVycyBhdHRhY2hlZCB0byB0aGUgU2lnbmFsLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0TnVtTGlzdGVuZXJzIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2JpbmRpbmdzLmxlbmd0aDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU3RvcCBwcm9wYWdhdGlvbiBvZiB0aGUgZXZlbnQsIGJsb2NraW5nIHRoZSBkaXNwYXRjaCB0byBuZXh0IGxpc3RlbmVycyBvbiB0aGUgcXVldWUuXG4gICAgICAgICAqIDxwPjxzdHJvbmc+SU1QT1JUQU5UOjwvc3Ryb25nPiBzaG91bGQgYmUgY2FsbGVkIG9ubHkgZHVyaW5nIHNpZ25hbCBkaXNwYXRjaCwgY2FsbGluZyBpdCBiZWZvcmUvYWZ0ZXIgZGlzcGF0Y2ggd29uJ3QgYWZmZWN0IHNpZ25hbCBicm9hZGNhc3QuPC9wPlxuICAgICAgICAgKiBAc2VlIFNpZ25hbC5wcm90b3R5cGUuZGlzYWJsZVxuICAgICAgICAgKi9cbiAgICAgICAgaGFsdCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuX3Nob3VsZFByb3BhZ2F0ZSA9IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEaXNwYXRjaC9Ccm9hZGNhc3QgU2lnbmFsIHRvIGFsbCBsaXN0ZW5lcnMgYWRkZWQgdG8gdGhlIHF1ZXVlLlxuICAgICAgICAgKiBAcGFyYW0gey4uLip9IFtwYXJhbXNdIFBhcmFtZXRlcnMgdGhhdCBzaG91bGQgYmUgcGFzc2VkIHRvIGVhY2ggaGFuZGxlci5cbiAgICAgICAgICovXG4gICAgICAgIGRpc3BhdGNoIDogZnVuY3Rpb24gKHBhcmFtcykge1xuICAgICAgICAgICAgaWYgKCEgdGhpcy5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBwYXJhbXNBcnIgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpLFxuICAgICAgICAgICAgICAgIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgYmluZGluZ3M7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm1lbW9yaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJldlBhcmFtcyA9IHBhcmFtc0FycjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCEgbikge1xuICAgICAgICAgICAgICAgIC8vc2hvdWxkIGNvbWUgYWZ0ZXIgbWVtb3JpemVcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJpbmRpbmdzID0gdGhpcy5fYmluZGluZ3Muc2xpY2UoKTsgLy9jbG9uZSBhcnJheSBpbiBjYXNlIGFkZC9yZW1vdmUgaXRlbXMgZHVyaW5nIGRpc3BhdGNoXG4gICAgICAgICAgICB0aGlzLl9zaG91bGRQcm9wYWdhdGUgPSB0cnVlOyAvL2luIGNhc2UgYGhhbHRgIHdhcyBjYWxsZWQgYmVmb3JlIGRpc3BhdGNoIG9yIGR1cmluZyB0aGUgcHJldmlvdXMgZGlzcGF0Y2guXG5cbiAgICAgICAgICAgIC8vZXhlY3V0ZSBhbGwgY2FsbGJhY2tzIHVudGlsIGVuZCBvZiB0aGUgbGlzdCBvciB1bnRpbCBhIGNhbGxiYWNrIHJldHVybnMgYGZhbHNlYCBvciBzdG9wcyBwcm9wYWdhdGlvblxuICAgICAgICAgICAgLy9yZXZlcnNlIGxvb3Agc2luY2UgbGlzdGVuZXJzIHdpdGggaGlnaGVyIHByaW9yaXR5IHdpbGwgYmUgYWRkZWQgYXQgdGhlIGVuZCBvZiB0aGUgbGlzdFxuICAgICAgICAgICAgZG8geyBuLS07IH0gd2hpbGUgKGJpbmRpbmdzW25dICYmIHRoaXMuX3Nob3VsZFByb3BhZ2F0ZSAmJiBiaW5kaW5nc1tuXS5leGVjdXRlKHBhcmFtc0FycikgIT09IGZhbHNlKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRm9yZ2V0IG1lbW9yaXplZCBhcmd1bWVudHMuXG4gICAgICAgICAqIEBzZWUgU2lnbmFsLm1lbW9yaXplXG4gICAgICAgICAqL1xuICAgICAgICBmb3JnZXQgOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5fcHJldlBhcmFtcyA9IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlbW92ZSBhbGwgYmluZGluZ3MgZnJvbSBzaWduYWwgYW5kIGRlc3Ryb3kgYW55IHJlZmVyZW5jZSB0byBleHRlcm5hbCBvYmplY3RzIChkZXN0cm95IFNpZ25hbCBvYmplY3QpLlxuICAgICAgICAgKiA8cD48c3Ryb25nPklNUE9SVEFOVDo8L3N0cm9uZz4gY2FsbGluZyBhbnkgbWV0aG9kIG9uIHRoZSBzaWduYWwgaW5zdGFuY2UgYWZ0ZXIgY2FsbGluZyBkaXNwb3NlIHdpbGwgdGhyb3cgZXJyb3JzLjwvcD5cbiAgICAgICAgICovXG4gICAgICAgIGRpc3Bvc2UgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUFsbCgpO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2JpbmRpbmdzO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX3ByZXZQYXJhbXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge3N0cmluZ30gU3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBvYmplY3QuXG4gICAgICAgICAqL1xuICAgICAgICB0b1N0cmluZyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAnW1NpZ25hbCBhY3RpdmU6JysgdGhpcy5hY3RpdmUgKycgbnVtTGlzdGVuZXJzOicrIHRoaXMuZ2V0TnVtTGlzdGVuZXJzKCkgKyddJztcbiAgICAgICAgfVxuXG4gICAgfTtcblxuXG4gICAgLy8gTmFtZXNwYWNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvKipcbiAgICAgKiBTaWduYWxzIG5hbWVzcGFjZVxuICAgICAqIEBuYW1lc3BhY2VcbiAgICAgKiBAbmFtZSBzaWduYWxzXG4gICAgICovXG4gICAgdmFyIHNpZ25hbHMgPSBTaWduYWw7XG5cbiAgICAvKipcbiAgICAgKiBDdXN0b20gZXZlbnQgYnJvYWRjYXN0ZXJcbiAgICAgKiBAc2VlIFNpZ25hbFxuICAgICAqL1xuICAgIC8vIGFsaWFzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSAoc2VlICNnaC00NClcbiAgICBzaWduYWxzLlNpZ25hbCA9IFNpZ25hbDtcblxuXG5cbiAgICAvL2V4cG9ydHMgdG8gbXVsdGlwbGUgZW52aXJvbm1lbnRzXG4gICAgaWYodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKXsgLy9BTURcbiAgICAgICAgZGVmaW5lKGZ1bmN0aW9uICgpIHsgcmV0dXJuIHNpZ25hbHM7IH0pO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpeyAvL25vZGVcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBzaWduYWxzO1xuICAgIH0gZWxzZSB7IC8vYnJvd3NlclxuICAgICAgICAvL3VzZSBzdHJpbmcgYmVjYXVzZSBvZiBHb29nbGUgY2xvc3VyZSBjb21waWxlciBBRFZBTkNFRF9NT0RFXG4gICAgICAgIC8qanNsaW50IHN1Yjp0cnVlICovXG4gICAgICAgIGdsb2JhbFsnc2lnbmFscyddID0gc2lnbmFscztcbiAgICB9XG5cbn0odGhpcykpO1xuIl19
;