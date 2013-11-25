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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pL2xpYi9BYnN0cmFjdEJhdGNoLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvQXNzZXRNYW5hZ2VyLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvU3ByaXRlQmF0Y2guanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL2xpYi9UZXh0dXJlLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvV2ViR0xDb250ZXh0LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvZ2x1dGlscy9NZXNoLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvZ2x1dGlscy9TaGFkZXJQcm9ncmFtLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvaW5kZXguanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9rbGFzc2UvaW5kZXguanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL25vZGVfbW9kdWxlcy9udW1iZXItdXRpbC9pbmRleC5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbm9kZV9tb2R1bGVzL3NpZ25hbHMvZGlzdC9zaWduYWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0akJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL2NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Y0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDaFdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3JFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBUaGUgY29yZSBrYW1pIG1vZHVsZSBwcm92aWRlcyBiYXNpYyAyRCBzcHJpdGUgYmF0Y2hpbmcgYW5kIFxuICogYXNzZXQgbWFuYWdlbWVudC5cbiAqIFxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgTWVzaCA9IHJlcXVpcmUoJy4vZ2x1dGlscy9NZXNoJyk7XG5cbnZhciBjb2xvclRvRmxvYXQgPSByZXF1aXJlKCdudW1iZXItdXRpbCcpLmNvbG9yVG9GbG9hdDtcblxuLyoqXG4gKiBBbiBhYnN0cmFjdCBiYXRjaGVyIGNvbXBvc2VkIG9mIHF1YWRzICh0d28gdHJpcywgaW5kZXhlZCkuIFxuICpcbiAqIFRoaXMgaXMgdXNlZCBpbnRlcm5hbGx5OyB1c2VycyBzaG91bGQgbG9vayBhdCBcbiAqIHt7I2Nyb3NzTGluayBcIlNwcml0ZUJhdGNoXCJ9fXt7L2Nyb3NzTGlua319IGluc3RlYWQuXG4gKiBcbiAqIFRoZSBiYXRjaGVyIGl0c2VsZiBpcyBub3QgbWFuYWdlZCBieSBXZWJHTENvbnRleHQ7IGhvd2V2ZXIsIGl0IG1ha2VzXG4gKiB1c2Ugb2YgTWVzaCBhbmQgVGV4dHVyZSB3aGljaCB3aWxsIGJlIG1hbmFnZWQuIEZvciB0aGlzIHJlYXNvbiwgdGhlIGJhdGNoZXJcbiAqIGRvZXMgbm90IGhvbGQgYSBkaXJlY3QgcmVmZXJlbmNlIHRvIHRoZSBHTCBzdGF0ZS5cbiAqXG4gKiBTdWJjbGFzc2VzIG11c3QgaW1wbGVtZW50IHRoZSBmb2xsb3dpbmc6ICBcbiAqIHt7I2Nyb3NzTGluayBcIkFic3RyYWN0QmF0Y2gvX2NyZWF0ZVNoYWRlcjptZXRob2RcIn19e3svY3Jvc3NMaW5rfX0gIFxuICoge3sjY3Jvc3NMaW5rIFwiQWJzdHJhY3RCYXRjaC9fY3JlYXRlVmVydGV4QXR0cmlidXRlczptZXRob2RcIn19e3svY3Jvc3NMaW5rfX0gIFxuICoge3sjY3Jvc3NMaW5rIFwiQWJzdHJhY3RCYXRjaC9nZXRWZXJ0ZXhTaXplOm1ldGhvZFwifX17ey9jcm9zc0xpbmt9fSAgXG4gKiBcbiAqIEBjbGFzcyAgQWJzdHJhY3RCYXRjaFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge1dlYkdMQ29udGV4dH0gY29udGV4dCB0aGUgY29udGV4dCB0aGlzIGJhdGNoZXIgYmVsb25ncyB0b1xuICogQHBhcmFtIHtOdW1iZXJ9IHNpemUgdGhlIG9wdGlvbmFsIHNpemUgb2YgdGhpcyBiYXRjaCwgaS5lLiBtYXggbnVtYmVyIG9mIHF1YWRzXG4gKiBAZGVmYXVsdCAgNTAwXG4gKi9cbnZhciBBYnN0cmFjdEJhdGNoID0gbmV3IENsYXNzKHtcblxuXHQvL0NvbnN0cnVjdG9yXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIEFic3RyYWN0QmF0Y2goY29udGV4dCwgc2l6ZSkge1xuXHRcdGlmICghY29udGV4dClcblx0XHRcdHRocm93IFwiR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkXCI7XG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblxuXHRcdHRoaXMuc2l6ZSA9IHNpemUgfHwgNTAwO1xuXHRcdFxuXHRcdC8vIDY1NTM1IGlzIG1heCBpbmRleCwgc28gNjU1MzUgLyA2ID0gMTA5MjIuXG5cdFx0aWYgKHRoaXMuc2l6ZSA+IDEwOTIyKSAgLy8oeW91J2QgaGF2ZSB0byBiZSBpbnNhbmUgdG8gdHJ5IGFuZCBiYXRjaCB0aGlzIG11Y2ggd2l0aCBXZWJHTClcblx0XHRcdHRocm93IFwiQ2FuJ3QgaGF2ZSBtb3JlIHRoYW4gMTA5MjIgc3ByaXRlcyBwZXIgYmF0Y2g6IFwiICsgdGhpcy5zaXplO1xuXHRcdFx0XHRcblx0XHQvL1RPRE86IHN1cHBvcnQgZGVmYXVsdFNoYWRlci9jdXN0b21TaGFkZXIgXG5cdFx0dGhpcy5zaGFkZXIgPSB0aGlzLl9jcmVhdGVTaGFkZXIoKTtcblxuXHRcdC8vVE9ETzogbWFrZSB0aGVzZSBwdWJsaWNcblx0XHR0aGlzLl9ibGVuZFNyYyA9IHRoaXMuY29udGV4dC5nbC5PTkU7XG5cdFx0dGhpcy5fYmxlbmREc3QgPSB0aGlzLmNvbnRleHQuZ2wuT05FX01JTlVTX1NSQ19BTFBIQVxuXHRcdHRoaXMuX2JsZW5kRW5hYmxlZCA9IHRydWU7XG5cblx0XHR0aGlzLmlkeCA9IDA7XG5cdFx0dGhpcy5kcmF3aW5nID0gZmFsc2U7XG5cblx0XHR0aGlzLm1lc2ggPSB0aGlzLl9jcmVhdGVNZXNoKHRoaXMuc2l6ZSk7XG5cblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIEFCR1IgcGFja2VkIGNvbG9yLCBhcyBhIHNpbmdsZSBmbG9hdC4gVGhlIGRlZmF1bHRcbiAgICAgICAgICogdmFsdWUgaXMgdGhlIGNvbG9yIHdoaXRlICgyNTUsIDI1NSwgMjU1LCAyNTUpLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcHJvcGVydHkge051bWJlcn0gY29sb3JcbiAgICAgICAgICogQHJlYWRPbmx5IFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jb2xvciA9IGNvbG9yVG9GbG9hdCgyNTUsIDI1NSwgMjU1LCAyNTUpO1xuICAgICAgICBcbiAgICAgICAgLyoqXG4gICAgICAgICAqIFdoZXRoZXIgdG8gcHJlbXVsdGlwbHkgYWxwaGEgb24gY2FsbHMgdG8gc2V0Q29sb3IuIFxuICAgICAgICAgKiBUaGlzIGlzIHRydWUgYnkgZGVmYXVsdCwgc28gdGhhdCB3ZSBjYW4gY29udmVuaWVudGx5IHdyaXRlOlxuICAgICAgICAgKlxuICAgICAgICAgKiAgICAgYmF0Y2guc2V0Q29sb3IoMSwgMCwgMCwgMC4yNSk7IC8vdGludHMgcmVkIHdpdGggMjUlIG9wYWNpdHlcbiAgICAgICAgICpcbiAgICAgICAgICogSWYgZmFsc2UsIHlvdSBtdXN0IHByZW11bHRpcGx5IHRoZSBjb2xvcnMgeW91cnNlbGYgdG8gYWNoaWV2ZVxuICAgICAgICAgKiB0aGUgc2FtZSB0aW50LCBsaWtlIHNvOlxuICAgICAgICAgKlxuICAgICAgICAgKiAgICAgYmF0Y2guc2V0Q29sb3IoMC4yNSwgMCwgMCwgMC4yNSk7XG4gICAgICAgICAqIFxuICAgICAgICAgKiBAcHJvcGVydHkgcHJlbXVsdGlwbHlDb2xvclxuICAgICAgICAgKiBAdHlwZSB7Qm9vbGVhbn1cbiAgICAgICAgICogQGRlZmF1bHQgIHRydWVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMucHJlbXVsdGlwbGllZCA9IHRydWU7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGNvbG9yIG9mIHRoaXMgc3ByaXRlIGJhdGNoZXIsIHdoaWNoIGlzIHVzZWQgaW4gc3Vic2VxdWVudCBkcmF3XG5cdCAqIGNhbGxzLiBUaGlzIGRvZXMgbm90IGZsdXNoIHRoZSBiYXRjaC5cblx0ICpcblx0ICogSWYgdGhyZWUgb3IgbW9yZSBhcmd1bWVudHMgYXJlIHNwZWNpZmllZCwgdGhpcyBtZXRob2QgYXNzdW1lcyB0aGF0IFJHQiBcblx0ICogb3IgUkdCQSBmbG9hdCB2YWx1ZXMgKDAuMCB0byAxLjApIGFyZSBiZWluZyBwYXNzZWQuIFxuXHQgKiBcblx0ICogSWYgbGVzcyB0aGFuIHRocmVlIGFyZ3VtZW50cyBhcmUgc3BlY2lmaWVkLCB3ZSBvbmx5IGNvbnNpZGVyIHRoZSBmaXJzdCBcblx0ICogYW5kIGFzc2lnbiBpdCB0byBhbGwgZm91ciBjb21wb25lbnRzIC0tIHRoaXMgaXMgdXNlZnVsIGZvciBzZXR0aW5nIHRyYW5zcGFyZW5jeSBcblx0ICogaW4gYSBwcmVtdWx0aXBsaWVkIGFscGhhIHN0YWdlLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBzZXRDb2xvclxuXHQgKiBAcGFyYW0ge051bWJlcn0gciB0aGUgcmVkIGNvbXBvbmVudCwgbm9ybWFsaXplZFxuXHQgKiBAcGFyYW0ge051bWJlcn0gZyB0aGUgZ3JlZW4gY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBiIHRoZSBibHVlIGNvbXBvbmVudCwgbm9ybWFsaXplZFxuXHQgKiBAcGFyYW0ge051bWJlcn0gYSB0aGUgYWxwaGEgY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqL1xuXHRzZXRDb2xvcjogZnVuY3Rpb24ociwgZywgYiwgYSkge1xuXHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIHtcblx0XHRcdC8vZGVmYXVsdCBhbHBoYSB0byBvbmUgXG5cdFx0XHRhID0gKGEgfHwgYSA9PT0gMCkgPyBhIDogMS4wO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyID0gZyA9IGIgPSBhID0gYXJndW1lbnRzWzBdO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnByZW11bHRpcGxpZWQpIHtcblx0XHRcdHIgKj0gYTtcblx0XHRcdGcgKj0gYTtcblx0XHRcdGIgKj0gYTtcblx0XHR9XG5cdFx0XG5cdFx0dGhpcy5jb2xvciA9IGNvbG9yVG9GbG9hdChcblx0XHRcdH5+KHIgKiAyNTUpLFxuXHRcdFx0fn4oZyAqIDI1NSksXG5cdFx0XHR+fihiICogMjU1KSxcblx0XHRcdH5+KGEgKiAyNTUpXG5cdFx0KTtcblx0fSxcblxuXHQvKipcblx0ICogQ2FsbGVkIGZyb20gdGhlIGNvbnN0cnVjdG9yIHRvIGNyZWF0ZSBhIG5ldyBNZXNoIFxuXHQgKiBiYXNlZCBvbiB0aGUgZXhwZWN0ZWQgYmF0Y2ggc2l6ZS4gU2hvdWxkIHNldCB1cFxuXHQgKiB2ZXJ0cyAmIGluZGljZXMgcHJvcGVybHkuXG5cdCAqXG5cdCAqIFVzZXJzIHNob3VsZCBub3QgY2FsbCB0aGlzIGRpcmVjdGx5OyBpbnN0ZWFkLCBpdFxuXHQgKiBzaG91bGQgb25seSBiZSBpbXBsZW1lbnRlZCBieSBzdWJjbGFzc2VzLlxuXHQgKiBcblx0ICogQG1ldGhvZCBfY3JlYXRlTWVzaFxuXHQgKiBAcGFyYW0ge051bWJlcn0gc2l6ZSB0aGUgc2l6ZSBwYXNzZWQgdGhyb3VnaCB0aGUgY29uc3RydWN0b3Jcblx0ICovXG5cdF9jcmVhdGVNZXNoOiBmdW5jdGlvbihzaXplKSB7XG5cdFx0Ly90aGUgdG90YWwgbnVtYmVyIG9mIGZsb2F0cyBpbiBvdXIgYmF0Y2hcblx0XHR2YXIgbnVtVmVydHMgPSBzaXplICogNCAqIHRoaXMuZ2V0VmVydGV4U2l6ZSgpO1xuXHRcdC8vdGhlIHRvdGFsIG51bWJlciBvZiBpbmRpY2VzIGluIG91ciBiYXRjaFxuXHRcdHZhciBudW1JbmRpY2VzID0gc2l6ZSAqIDY7XG5cdFx0dmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXG5cdFx0Ly92ZXJ0ZXggZGF0YVxuXHRcdHRoaXMudmVydGljZXMgPSBuZXcgRmxvYXQzMkFycmF5KG51bVZlcnRzKTtcblx0XHQvL2luZGV4IGRhdGFcblx0XHR0aGlzLmluZGljZXMgPSBuZXcgVWludDE2QXJyYXkobnVtSW5kaWNlcyk7IFxuXHRcdFxuXHRcdGZvciAodmFyIGk9MCwgaj0wOyBpIDwgbnVtSW5kaWNlczsgaSArPSA2LCBqICs9IDQpIFxuXHRcdHtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgMF0gPSBqICsgMDsgXG5cdFx0XHR0aGlzLmluZGljZXNbaSArIDFdID0gaiArIDE7XG5cdFx0XHR0aGlzLmluZGljZXNbaSArIDJdID0gaiArIDI7XG5cdFx0XHR0aGlzLmluZGljZXNbaSArIDNdID0gaiArIDA7XG5cdFx0XHR0aGlzLmluZGljZXNbaSArIDRdID0gaiArIDI7XG5cdFx0XHR0aGlzLmluZGljZXNbaSArIDVdID0gaiArIDM7XG5cdFx0fVxuXG5cdFx0dmFyIG1lc2ggPSBuZXcgTWVzaCh0aGlzLmNvbnRleHQsIGZhbHNlLCBcblx0XHRcdFx0XHRcdG51bVZlcnRzLCBudW1JbmRpY2VzLCB0aGlzLl9jcmVhdGVWZXJ0ZXhBdHRyaWJ1dGVzKCkpO1xuXHRcdG1lc2gudmVydGljZXMgPSB0aGlzLnZlcnRpY2VzO1xuXHRcdG1lc2guaW5kaWNlcyA9IHRoaXMuaW5kaWNlcztcblx0XHRtZXNoLnZlcnRleFVzYWdlID0gZ2wuRFlOQU1JQ19EUkFXO1xuXHRcdG1lc2guaW5kZXhVc2FnZSA9IGdsLlNUQVRJQ19EUkFXO1xuXHRcdG1lc2guZGlydHkgPSB0cnVlO1xuXHRcdHJldHVybiBtZXNoO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgc2hhZGVyIGZvciB0aGlzIGJhdGNoLiBJZiB5b3UgcGxhbiB0byBzdXBwb3J0XG5cdCAqIG11bHRpcGxlIGluc3RhbmNlcyBvZiB5b3VyIGJhdGNoLCBpdCBtYXkgb3IgbWF5IG5vdCBiZSB3aXNlXG5cdCAqIHRvIHVzZSBhIHNoYXJlZCBzaGFkZXIgdG8gc2F2ZSByZXNvdXJjZXMuXG5cdCAqIFxuXHQgKiBUaGlzIG1ldGhvZCBpbml0aWFsbHkgdGhyb3dzIGFuIGVycm9yOyBzbyBpdCBtdXN0IGJlIG92ZXJyaWRkZW4gYnlcblx0ICogc3ViY2xhc3NlcyBvZiBBYnN0cmFjdEJhdGNoLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBfY3JlYXRlU2hhZGVyXG5cdCAqIEByZXR1cm4ge051bWJlcn0gdGhlIHNpemUgb2YgYSB2ZXJ0ZXgsIGluICMgb2YgZmxvYXRzXG5cdCAqL1xuXHRfY3JlYXRlU2hhZGVyOiBmdW5jdGlvbigpIHtcblx0XHR0aHJvdyBcIl9jcmVhdGVTaGFkZXIgbm90IGltcGxlbWVudGVkXCJcblx0fSxcdFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFuIGFycmF5IG9mIHZlcnRleCBhdHRyaWJ1dGVzIGZvciB0aGlzIG1lc2g7IFxuXHQgKiBzdWJjbGFzc2VzIHNob3VsZCBpbXBsZW1lbnQgdGhpcyB3aXRoIHRoZSBhdHRyaWJ1dGVzIFxuXHQgKiBleHBlY3RlZCBmb3IgdGhlaXIgYmF0Y2guXG5cdCAqXG5cdCAqIFRoaXMgbWV0aG9kIGluaXRpYWxseSB0aHJvd3MgYW4gZXJyb3I7IHNvIGl0IG11c3QgYmUgb3ZlcnJpZGRlbiBieVxuXHQgKiBzdWJjbGFzc2VzIG9mIEFic3RyYWN0QmF0Y2guXG5cdCAqXG5cdCAqIEBtZXRob2QgX2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXNcblx0ICogQHJldHVybiB7QXJyYXl9IGFuIGFycmF5IG9mIE1lc2guVmVydGV4QXR0cmliIG9iamVjdHNcblx0ICovXG5cdF9jcmVhdGVWZXJ0ZXhBdHRyaWJ1dGVzOiBmdW5jdGlvbigpIHtcblx0XHR0aHJvdyBcIl9jcmVhdGVWZXJ0ZXhBdHRyaWJ1dGVzIG5vdCBpbXBsZW1lbnRlZFwiO1xuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG51bWJlciBvZiBmbG9hdHMgcGVyIHZlcnRleCBmb3IgdGhpcyBiYXRjaGVyLlxuXHQgKiBcblx0ICogVGhpcyBtZXRob2QgaW5pdGlhbGx5IHRocm93cyBhbiBlcnJvcjsgc28gaXQgbXVzdCBiZSBvdmVycmlkZGVuIGJ5XG5cdCAqIHN1YmNsYXNzZXMgb2YgQWJzdHJhY3RCYXRjaC5cblx0ICpcblx0ICogQG1ldGhvZCAgZ2V0VmVydGV4U2l6ZVxuXHQgKiBAcmV0dXJuIHtOdW1iZXJ9IHRoZSBzaXplIG9mIGEgdmVydGV4LCBpbiAjIG9mIGZsb2F0c1xuXHQgKi9cblx0Z2V0VmVydGV4U2l6ZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhyb3cgXCJnZXRWZXJ0ZXhTaXplIG5vdCBpbXBsZW1lbnRlZFwiO1xuXHR9LFxuXG5cdFxuXHQvKiogXG5cdCAqIEJlZ2lucyB0aGUgc3ByaXRlIGJhdGNoLiBUaGlzIHdpbGwgYmluZCB0aGUgc2hhZGVyXG5cdCAqIGFuZCBtZXNoLiBTdWJjbGFzc2VzIG1heSB3YW50IHRvIGRpc2FibGUgZGVwdGggb3IgXG5cdCAqIHNldCB1cCBibGVuZGluZy5cblx0ICpcblx0ICogQG1ldGhvZCAgYmVnaW5cblx0ICovXG5cdGJlZ2luOiBmdW5jdGlvbigpICB7XG5cdFx0aWYgKHRoaXMuZHJhd2luZykgXG5cdFx0XHR0aHJvdyBcImJhdGNoLmVuZCgpIG11c3QgYmUgY2FsbGVkIGJlZm9yZSBiZWdpblwiO1xuXHRcdHRoaXMuZHJhd2luZyA9IHRydWU7XG5cblx0XHR0aGlzLnNoYWRlci5iaW5kKCk7XG5cblx0XHQvL2JpbmQgdGhlIGF0dHJpYnV0ZXMgbm93IHRvIGF2b2lkIHJlZHVuZGFudCBjYWxsc1xuXHRcdHRoaXMubWVzaC5iaW5kKHRoaXMuc2hhZGVyKTtcblx0fSxcblxuXHQvKiogXG5cdCAqIEVuZHMgdGhlIHNwcml0ZSBiYXRjaC4gVGhpcyB3aWxsIGZsdXNoIGFueSByZW1haW5pbmcgXG5cdCAqIGRhdGEgYW5kIHNldCBHTCBzdGF0ZSBiYWNrIHRvIG5vcm1hbC5cblx0ICogXG5cdCAqIEBtZXRob2QgIGVuZFxuXHQgKi9cblx0ZW5kOiBmdW5jdGlvbigpICB7XG5cdFx0aWYgKCF0aGlzLmRyYXdpbmcpXG5cdFx0XHR0aHJvdyBcImJhdGNoLmJlZ2luKCkgbXVzdCBiZSBjYWxsZWQgYmVmb3JlIGVuZFwiO1xuXHRcdGlmICh0aGlzLmlkeCA+IDApXG5cdFx0XHR0aGlzLmZsdXNoKCk7XG5cdFx0dGhpcy5kcmF3aW5nID0gZmFsc2U7XG5cblx0XHR0aGlzLm1lc2gudW5iaW5kKHRoaXMuc2hhZGVyKTtcblx0fSxcblxuXHQvKiogXG5cdCAqIENhbGxlZCBiZWZvcmUgcmVuZGVyaW5nIHRvIGJpbmQgbmV3IHRleHR1cmVzLlxuXHQgKiBUaGlzIG1ldGhvZCBkb2VzIG5vdGhpbmcgYnkgZGVmYXVsdC5cblx0ICpcblx0ICogQG1ldGhvZCAgX3ByZVJlbmRlclxuXHQgKi9cblx0X3ByZVJlbmRlcjogZnVuY3Rpb24oKSAge1xuXHR9LFxuXG5cdC8qKiBcblx0ICogQ2FsbGVkIGFmdGVyIGZsdXNoaW5nIHRoZSBiYXRjaC4gVGhpcyBtZXRob2Rcblx0ICogZG9lcyBub3RoaW5nIGJ5IGRlZmF1bHQuXG5cdCAqXG5cdCAqIEBtZXRob2QgIF9wb3N0UmVuZGVyXG5cdCAqL1xuXHRfcG9zdFJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEZsdXNoZXMgdGhlIGJhdGNoIGJ5IHB1c2hpbmcgdGhlIGN1cnJlbnQgZGF0YVxuXHQgKiB0byBHTC5cblx0ICogXG5cdCAqIEBtZXRob2QgZmx1c2hcblx0ICovXG5cdGZsdXNoOiBmdW5jdGlvbigpICB7XG5cdFx0aWYgKHRoaXMuaWR4PT09MClcblx0XHRcdHJldHVybjtcblxuXHQgICAgdmFyIGdsID0gdGhpcy5nbDtcblx0ICAgIFxuXHRcdHRoaXMuX3ByZVJlbmRlcigpO1xuXG5cdFx0Ly9udW1iZXIgb2Ygc3ByaXRlcyBpbiBiYXRjaFxuXHRcdHZhciBudW1Db21wb25lbnRzID0gdGhpcy5nZXRWZXJ0ZXhTaXplKCk7XG5cdFx0dmFyIHNwcml0ZUNvdW50ID0gKHRoaXMuaWR4IC8gKG51bUNvbXBvbmVudHMgKiA0KSk7XG5cdCBcdFxuXHQgXHQvL2RyYXcgdGhlIHNwcml0ZXNcblx0ICAgIHZhciBnbCA9IHRoaXMuY29udGV4dC5nbDtcblx0ICAgIHRoaXMubWVzaC52ZXJ0aWNlc0RpcnR5ID0gdHJ1ZTtcblx0ICAgIHRoaXMubWVzaC5kcmF3KGdsLlRSSUFOR0xFUywgc3ByaXRlQ291bnQgKiA2LCAwLCB0aGlzLmlkeCk7XG5cblx0ICAgIHRoaXMuaWR4ID0gMDtcblx0fSxcblxuXHQvKipcblx0ICogQWRkcyBhIHNwcml0ZSB0byB0aGlzIGJhdGNoLlxuXHQgKiBUaGUgc3BlY2lmaWNzIGRlcGVuZCBvbiB0aGUgc3ByaXRlIGJhdGNoIGltcGxlbWVudGF0aW9uLlxuXHQgKlxuXHQgKiBAbWV0aG9kIGRyYXdcblx0ICogQHBhcmFtICB7VGV4dHVyZX0gdGV4dHVyZSB0aGUgdGV4dHVyZSBmb3IgdGhpcyBzcHJpdGVcblx0ICogQHBhcmFtICB7TnVtYmVyfSB4ICAgICAgIHRoZSB4IHBvc2l0aW9uLCBkZWZhdWx0cyB0byB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0geSAgICAgICB0aGUgeSBwb3NpdGlvbiwgZGVmYXVsdHMgdG8gemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoICAgdGhlIHdpZHRoLCBkZWZhdWx0cyB0byB0aGUgdGV4dHVyZSB3aWR0aFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCAgdGhlIGhlaWdodCwgZGVmYXVsdHMgdG8gdGhlIHRleHR1cmUgaGVpZ2h0XG5cdCAqIEBwYXJhbSAge051bWJlcn0gdTEgICAgICB0aGUgZmlyc3QgVSBjb29yZGluYXRlLCBkZWZhdWx0IHplcm9cblx0ICogQHBhcmFtICB7TnVtYmVyfSB2MSAgICAgIHRoZSBmaXJzdCBWIGNvb3JkaW5hdGUsIGRlZmF1bHQgemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHUyICAgICAgdGhlIHNlY29uZCBVIGNvb3JkaW5hdGUsIGRlZmF1bHQgb25lXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdjIgICAgICB0aGUgc2Vjb25kIFYgY29vcmRpbmF0ZSwgZGVmYXVsdCBvbmVcblx0ICovXG5cdGRyYXc6IGZ1bmN0aW9uKHRleHR1cmUsIHgsIHksIHdpZHRoLCBoZWlnaHQsIHUxLCB2MSwgdTIsIHYyKSB7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEFkZHMgYSBzaW5nbGUgcXVhZCBtZXNoIHRvIHRoaXMgc3ByaXRlIGJhdGNoIGZyb20gdGhlIGdpdmVuXG5cdCAqIGFycmF5IG9mIHZlcnRpY2VzLlxuXHQgKiBUaGUgc3BlY2lmaWNzIGRlcGVuZCBvbiB0aGUgc3ByaXRlIGJhdGNoIGltcGxlbWVudGF0aW9uLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBkcmF3VmVydGljZXNcblx0ICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIHdlIGFyZSBkcmF3aW5nIGZvciB0aGlzIHNwcml0ZVxuXHQgKiBAcGFyYW0ge0Zsb2F0MzJBcnJheX0gdmVydHMgYW4gYXJyYXkgb2YgdmVydGljZXNcblx0ICogQHBhcmFtIHtOdW1iZXJ9IG9mZiB0aGUgb2Zmc2V0IGludG8gdGhlIHZlcnRpY2VzIGFycmF5IHRvIHJlYWQgZnJvbVxuXHQgKi9cblx0ZHJhd1ZlcnRpY2VzOiBmdW5jdGlvbih0ZXh0dXJlLCB2ZXJ0cywgb2ZmKSAge1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBEZXN0cm95cyB0aGUgYmF0Y2gsIGRlbGV0aW5nIGl0cyBidWZmZXJzIGFuZCByZW1vdmluZyBpdCBmcm9tIHRoZVxuXHQgKiBXZWJHTENvbnRleHQgbWFuYWdlbWVudC4gVHJ5aW5nIHRvIHVzZSB0aGlzXG5cdCAqIGJhdGNoIGFmdGVyIGRlc3Ryb3lpbmcgaXQgY2FuIGxlYWQgdG8gdW5wcmVkaWN0YWJsZSBiZWhhdmlvdXIuXG5cdCAqXG5cdCAqIEBtZXRob2QgZGVzdHJveVxuXHQgKi9cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy52ZXJ0aWNlcyA9IFtdO1xuXHRcdHRoaXMuaW5kaWNlcyA9IFtdO1xuXHRcdHRoaXMuc2l6ZSA9IHRoaXMubWF4VmVydGljZXMgPSAwO1xuXG5cdFx0dGhpcy5tZXNoLmRlc3Ryb3koKTtcblx0fVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQWJzdHJhY3RCYXRjaDtcbiIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgU2lnbmFsID0gcmVxdWlyZSgnc2lnbmFscycpO1xuXG4vKipcbiAqIFRoaXMgaXMgYSB1dGlsaXR5IHdoaWNoIG1ha2VzIGFzc2V0IGxvYWRpbmcgY2xlYW5lclxuICogYW5kIHNpbXBsZXIsIGVzcGVjaWFsbHkgd2l0aCByZWdhcmQgdG8gYXN5bmNocm9ub3VzIGltYWdlXG4gKiBsb2FkaW5nIGFuZCBXZWJHTCBjb250ZXh0IGxvc3MuXG4gKlxuICpcbiAqIEJhc2ljIHVzYWdlIGxvb2tzIGxpa2UgdGhpczpcbiAqXG4gKiAgICAgLy9DcmVhdGUgYW4gYXNzZXQgbWFuYWdlciBcbiAqICAgICB2YXIgYXNzZXRzID0gbmV3IEFzc2V0TWFuYWdlcihjb250ZXh0KTtcbiAqICBcbiAqICAgICAvL2ltYWdlIHR5cGVzIHdpbGwgcmV0dXJuIGEgbmV3IFRleHR1cmVcbiAqICAgICB2YXIgdGV4MCA9IGFzc2V0cy5sb2FkKFwiaW1nL2dyYXNzLnBuZ1wiKTtcbiAqICAgICB2YXIgdGV4MSA9IGFzc2V0cy5sb2FkKFwiaW1nL3NjZW5lLnBuZ1wiKTtcbiAqXG4gKiAgICAgLi4uIGluc2lkZSBnYW1lIGxvb3AgLi4uXG4gKlxuICogICAgICAgICBpZiAoYXNzZXRzLnVwZGF0ZSgpKSB7XG4gKiAgICAgICAgICAgICAvLyBhbGwgYXNzZXRzIGFyZSBsb2FkZWQsIHdlIGNhbiByZW5kZXIuXG4gKiAgICAgICAgIH0gZWxzZSB7XG4gKiAgICAgICAgICAgICAvLyBub3QgYWxsIGFzc2V0cyBhcmUgbG9hZGVkLiB3ZSBuZWVkXG4gKiAgICAgICAgICAgICAvLyB0byBzaG93IG91ciBwcmVsb2FkZXIuXG4gKiAgICAgICAgIH1cbiAqXG4gKiBDdXJyZW50bHkgdGhpcyBjbGFzcyBvbmx5IHN1cHBvcnRzIGltYWdlIGxvYWRpbmcsXG4gKiBhbHRob3VnaCBpbiB0aGUgZnV0dXJlIG90aGVycyBjb3VsZCBiZSBhZGRlZCBmb3IgXG4gKiBjb21wcmVzc2VkIHRleHR1cmVzLCBzcHJpdGUgc2hlZXRzLCBhbmQgc28gZm9ydGguXG4gKlxuICogQ3JlYXRpbmcgYSBuZXcgYXNzZXQgbWFuYWdlciB3aWxsIGxpc3RlbiBmb3IgY29udGV4dFxuICogbG9zcyBldmVudHMgb24gdGhlIGdpdmVuIFdlYkdMQ29udGV4dC4gV2hlbiB0aGlzIGhhcHBlbnMsXG4gKiBhbGwgYXNzZXRzIHdpbGwgYmUgaW52YWxpZGF0ZWQgYW5kIGFkZGVkIHRvIHRoZSBsb2FkaW5nIHF1ZXVlLlxuICogQXMgc3VjaCwgdXBkYXRlKCkgd2lsbCByZXR1cm4gZmFsc2UgdW50aWwgdGhlIGFzc2V0cyBoYXZlIGJlZW5cbiAqIHJlLWxvYWRlZC5cbiAqIFxuICogQGNsYXNzICBBc3NldE1hbmFnZXJcbiAqIEBjb25zdHJ1Y3RvciBcdFxuICogQHBhcmFtIHtXZWJHTENvbnRleHR9IGNvbnRleHQgdGhlIFdlYkdMQ29udGV4dCBmb3IgdGhpcyBtYW5hZ2VyXG4gKi9cbnZhciBBc3NldE1hbmFnZXIgPSBuZXcgQ2xhc3Moe1xuXHRcblxuXHQvKipcblx0ICogQSByZWFkLW9ubHkgcHJvcGVydHkgdGhhdCBkZXNjcmliZXMgdGhlIG51bWJlciBvZiBcblx0ICogYXNzZXRzIHJlbWFpbmluZyB0byBiZSBsb2FkZWQuXG5cdCAqXG5cdCAqIEBhdHRyaWJ1dGUgcmVtYWluaW5nXG5cdCAqIEB0eXBlIHtOdW1iZXJ9XG5cdCAqIEByZWFkT25seVxuXHQgKi9cblx0cmVtYWluaW5nOiB7XG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLl9fdG90YWxJdGVtcyAtIHRoaXMuX19sb2FkQ291bnQ7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIHJlYWQtb25seSBwcm9wZXJ0eSB0aGF0IGRlc2NyaWliZXMgdGhlIHRvdGFsXG5cdCAqIG51bWJlciBvZiBhc3NldHMgaW4gdGhpcyBBc3NldE1hbmFnZXIuXG5cdCAqXG5cdCAqIEBhdHRyaWJ1dGUgdG90YWxcblx0ICogQHJlYWRPbmx5XG5cdCAqIEB0eXBlIHtOdW1iZXJ9XG5cdCAqL1xuXHR0b3RhbDoge1xuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fX3RvdGFsSXRlbXM7XG5cdFx0fVxuXHR9LFxuXG5cdC8vQ29uc3RydWN0b3Jcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gQXNzZXRNYW5hZ2VyKGNvbnRleHQpIHtcblx0XHRpZiAoIWNvbnRleHQpXG5cdFx0XHR0aHJvdyBcIm5vIGNvbnRleHQgZGVmaW5lZCBmb3IgQXNzZXRNYW5hZ2VyXCI7XG5cblx0XHQvKipcblx0XHQgKiBBbiBhcnJheSBvZiBhc3NldHMgdGhhdCB0aGlzIEFzc2V0TWFuYWdlciBpcyBoYW5kbGluZy5cblx0XHQgKiBUaGlzIHNob3VsZCBub3QgYmUgbW9kaWZpZWQgZGlyZWN0bHkuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IGFzc2V0c1xuXHRcdCAqIEB0eXBlIHtBcnJheX1cblx0XHQgKi9cblx0XHR0aGlzLmFzc2V0cyA9IFtdO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIHF1ZXVlIG9mIHRhc2tzIHRvIGxvYWQuIEVhY2ggY29udGFpbnNcblx0XHQgKiBhblxuXHRcdCAqIHt7I2Nyb3NzTGluayBcIkFzc2V0TWFuYWdlci5EZXNjcmlwdG9yXCJ9fXt7L2Nyb3NzTGlua319LlxuXHRcdCAqXG5cdFx0ICogTG9hZGluZyBhIHRhc2sgd2lsbCBwb3AgaXQgb2ZmIHRoaXMgbGlzdCBhbmQgZmlyZSB0aGUgYXN5bmNcblx0XHQgKiBvciBzeW5jaHJvbm91cyBwcm9jZXNzLlxuXHRcdCAqXG5cdFx0ICogVGhpcyBzaG91bGQgbm90IGJlIG1vZGlmaWVkIGRpcmVjdGx5LlxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IHRhc2tzXG5cdFx0ICogQHByb3RlY3RlZFxuXHRcdCAqIEB0eXBlIHtBcnJheX1cblx0XHQgKi9cblx0XHR0aGlzLnRhc2tzID0gW107XG5cblx0XHQvL1ByaXZhdGUgc3R1ZmYuLi4gZG8gbm90IHRvdWNoIVxuXG5cdFx0dGhpcy5fX2xvYWRDb3VudCA9IDA7XG5cdFx0dGhpcy5fX3RvdGFsSXRlbXMgPSAwO1xuXHRcdHRoaXMuX19sb2FkQ2FsbGJhY2tGdW5jID0gbnVsbDtcblx0XHR0aGlzLl9faW52YWxpZGF0ZUZ1bmMgPSBudWxsO1xuXG5cdFx0Ly8gU2lnbmFscyBcblx0XHRcblx0XHQvKipcblx0XHQgKiBBIHNpZ25hbCBkaXNwYXRjaGVkIHdoZW4gbG9hZGluZyBmaXJzdCBiZWdpbnMsIFxuXHRcdCAqIGkuZS4gd2hlbiB1cGRhdGUoKSBpcyBjYWxsZWQgYW5kIHRoZSBsb2FkaW5nIHF1ZXVlIGlzIHRoZVxuXHRcdCAqIHNhbWUgc2l6ZSBhcyB0aGUgdG90YWwgYXNzZXQgbGlzdC5cblx0XHQgKlxuXHRcdCAqIEBldmVudCBsb2FkU3RhcnRlZFxuXHRcdCAqIEB0eXBlIHtTaWduYWx9XG5cdFx0ICovXG5cdFx0dGhpcy5sb2FkU3RhcnRlZCA9IG5ldyBTaWduYWwoKTtcblxuXHRcdC8qKlxuXHRcdCAqIEEgc2lnbmFsIGRpc3BhdGNoZWQgd2hlbiBhbGwgYXNzZXRzIGhhdmUgYmVlbiBsb2FkZWRcblx0XHQgKiAoaS5lLiB0aGVpciBhc3luYyB0YXNrcyBmaW5pc2hlZCkuXG5cdFx0ICpcblx0XHQgKiBAZXZlbnQgbG9hZEZpbmlzaGVkXG5cdFx0ICogQHR5cGUge1NpZ25hbH1cblx0XHQgKi9cblx0XHR0aGlzLmxvYWRGaW5pc2hlZCA9IG5ldyBTaWduYWwoKTtcblxuXHRcdC8qKlxuXHRcdCAqIEEgc2lnbmFsIGRpc3BhdGNoZWQgb24gcHJvZ3Jlc3MgdXBkYXRlcywgb25jZSBhbiBhc3NldFxuXHRcdCAqIGhhcyBiZWVuIGxvYWRlZCBpbiBmdWxsIChpLmUuIGl0cyBhc3luYyB0YXNrIGZpbmlzaGVkKS5cblx0XHQgKlxuXHRcdCAqIFRoaXMgcGFzc2VzIHRocmVlIGFyZ3VtZW50cyB0byB0aGUgbGlzdGVuZXIgZnVuY3Rpb246XG5cdFx0ICogXG5cdFx0ICogLSBgY3VycmVudGAgbnVtYmVyIG9mIGFzc2V0cyB0aGF0IGhhdmUgYmVlbiBsb2FkZWRcblx0XHQgKiAtIGB0b3RhbGAgbnVtYmVyIG9mIGFzc2V0cyB0byBsb2FkZWRcblx0XHQgKiAtIGBuYW1lYCBvZiB0aGUgYXNzZXQgd2hpY2ggd2FzIGp1c3QgbG9hZGVkXG5cdFx0ICogIFxuXHRcdCAqIEBldmVudCBsb2FkUHJvZ3Jlc3Ncblx0XHQgKiBAdHlwZSB7W3R5cGVdfVxuXHRcdCAqL1xuXHRcdHRoaXMubG9hZFByb2dyZXNzID0gbmV3IFNpZ25hbCgpO1xuXG5cdFx0LyoqXG5cdFx0ICogQSBzaWduYWwgZGlzcGF0Y2hlZCBvbiBwcm9ibGVtYXRpYyBsb2FkOyBlLmcuIGlmXG5cdFx0ICogdGhlIGltYWdlIHdhcyBub3QgZm91bmQgYW5kIFwib25lcnJvclwiIHdhcyB0cmlnZ2VyZWQuIFxuXHRcdCAqIFRoZSBmaXJzdCBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIGxpc3RlbmVyIHdpbGwgYmUgXG5cdFx0ICogdGhlIHN0cmluZyBuYW1lIG9mIHRoZSBhc3NldC5cblx0XHQgKlxuXHRcdCAqIFRoZSBhc3NldCBtYW5hZ2VyIHdpbGwgY29udGludWUgbG9hZGluZyBzdWJzZXF1ZW50IGFzc2V0cy5cblx0XHQgKlxuXHRcdCAqIFRoaXMgaXMgZGlzcGF0Y2hlZCBhZnRlciB0aGUgc3RhdHVzIG9mIHRoZSBhc3NldCBpc1xuXHRcdCAqIHNldCB0byBTdGF0dXMuTE9BRF9GQUlMLCBhbmQgYmVmb3JlIHRoZSBsb2FkUHJvZ3Jlc3Ncblx0XHQgKiBzaWduYWwgaXMgZGlzcGF0Y2hlZC5cblx0XHQgKlxuXHRcdCAqIEBldmVudCBsb2FkRXJyb3Jcblx0XHQgKiBAdHlwZSB7U2lnbmFsfVxuXHRcdCAqL1xuXHRcdHRoaXMubG9hZEVycm9yID0gbmV3IFNpZ25hbCgpO1xuXG5cdFx0dGhpcy5sb2FkZXJzID0ge307XG5cblx0XHR0aGlzLl9faW52YWxpZGF0ZUZ1bmMgPSB0aGlzLmludmFsaWRhdGUuYmluZCh0aGlzKTtcblx0XHR0aGlzLl9fbG9hZENhbGxiYWNrRnVuYyA9IHRoaXMuX19sb2FkQ2FsbGJhY2suYmluZCh0aGlzKTtcblxuXHRcdHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0dGhpcy5jb250ZXh0Lmxvc3QuYWRkKHRoaXMuX19pbnZhbGlkYXRlRnVuYyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIERlc3Ryb3lzIHRoaXMgYXNzZXQgbWFuYWdlcjsgcmVtb3ZpbmcgaXRzIGxpc3RlbmVyc1xuXHQgKiB3aXRoIFdlYkdMQ29udGV4dCBhbmQgZGVsZXRpbmcgdGhlIGFzc2V0cyBhcnJheS5cblx0ICpcblx0ICogQG1ldGhvZCAgZGVzdHJveVxuXHQgKi9cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5hc3NldHMgPSBbXTtcblx0XHR0aGlzLnRhc2tzID0gW107XG5cdFx0dGhpcy5fX2xvYWRDb3VudCA9IHRoaXMuX190b3RhbEl0ZW1zID0gMDtcblx0XHR0aGlzLmNvbnRleHQubG9zdC5yZW1vdmUodGhpcy5fX2ludmFsaWRhdGVGdW5jKTtcblx0fSxcblxuXHQvKipcblx0ICogQ2FsbGVkIHRvIGludmFsaWRhdGUgdGhlIGFzc2V0IG1hbmFnZXJcblx0ICogYW5kIHJlcXVpcmUgYWxsIGFzc2V0cyB0byBiZSByZS1sb2FkZWQuXG5cdCAqIFRoaXMgaXMgY2FsbGVkIGludGVybmFsbHkgb24gY29udGV4dCBsb3NzLlxuXHQgKlxuXHQgKiBAcHJvdGVjdGVkXG5cdCAqIEBtZXRob2QgaW52YWxpZGF0ZVxuXHQgKi9cblx0aW52YWxpZGF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0Ly9tYXJrIGFsbCBhcyBub3QgeWV0IGxvYWRlZFxuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLmFzc2V0cy5sZW5ndGg7IGkrKykgXG5cdFx0XHR0aGlzLmFzc2V0c1tpXS5sb2FkZWQgPSBmYWxzZTtcblxuXHRcdC8vY29weSBvdXIgYXNzZXRzIHRvIGEgcXVldWUgd2hpY2ggY2FuIGJlIHBvcHBlZFxuXHRcdHRoaXMudGFza3MgPSB0aGlzLmFzc2V0cy5zbGljZSgpO1xuXG5cdFx0dGhpcy5fX2xvYWRDb3VudCA9IHRoaXMuX190b3RhbEl0ZW1zID0gdGhpcy50YXNrcy5sZW5ndGg7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFB1c2hlcyBhbiBhc3NldCBvbnRvIHRoaXMgc3RhY2suIFRoaXNcblx0ICogYXR0ZW1wdHMgdG8gZGV0ZWN0IHRoZSBsb2FkZXIgZm9yIHlvdSBiYXNlZFxuXHQgKiBvbiB0aGUgYXNzZXQgbmFtZSdzIGZpbGUgZXh0ZW5zaW9uLiBJZiB0aGVcblx0ICogYXNzZXQgbmFtZSBkb2Vzbid0IGhhdmUgYSBrbm93biBmaWxlIGV4dGVuc2lvbixcblx0ICogb3IgaWYgdGhlcmUgaXMgbm8gbG9hZGVyIHJlZ2lzdGVyZWQgZm9yIHRoYXQgZmlsZW5hbWUsXG5cdCAqIHRoaXMgbWV0aG9kIHRocm93cyBhbiBlcnJvci4gXG5cdCAqXG5cdCAqIFRoZSBmaXJzdCBhcmd1bWVudCBpcyB0aGUgYXNzZXQgbmFtZS4gQW55IHN1YnNlcXVlbnRcblx0ICogYXJndW1lbnRzIHdpbGwgYmUgcGFzc2VkIGFsb25nIHRvIHRoZSBsb2FkZXIgZm9yIGZ1cnRoZXJcblx0ICogcHJvY2Vzc2luZy5cblx0ICpcblx0ICogVGhlIHJldHVybiB2YWx1ZSBvZiB0aGlzIG1ldGhvZCBpcyBkZXRlcm1pbmVkIGJ5XG5cdCAqIHRoZSBsb2FkZXIncyBwcm9jZXNzQXJndW1lbnRzIG1ldGhvZC4gRm9yIGV4YW1wbGUsIHRoZVxuXHQgKiBkZWZhdWx0IEltYWdlIGxvYWRlciByZXR1cm5zIGEgVGV4dHVyZSBvYmplY3QuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGxvYWRcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSBhc3NldCBuYW1lXG5cdCAqIEBwYXJhbSB7YW55fSBhcmdzIGEgdmFyaWFibGUgbnVtYmVyIG9mIG9wdGlvbmFsIGFyZ3VtZW50c1xuXHQgKiBAcmV0dXJuIHthbnl9IHJldHVybnMgdGhlIGJlc3QgdHlwZSBmb3IgdGhpcyBhc3NldCdzIGxvYWRlclxuXHQgKi9cblx0bG9hZDogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBleHQgPSB0aGlzLl9fZXh0ZW5zaW9uKG5hbWUpO1xuXHRcdGlmICghZXh0KSBcblx0XHRcdHRocm93IFwiQXNzZXQgbmFtZSBkb2VzIG5vdCBoYXZlIGEgZmlsZSBleHRlbnNpb246IFwiICsgbmFtZTtcblx0XHRpZiAoIUFzc2V0TWFuYWdlci5sb2FkZXJzLmhhc093blByb3BlcnR5KGV4dCkpXG5cdFx0XHR0aHJvdyBcIk5vIGtub3duIGxvYWRlciBmb3IgZXh0ZW5zaW9uIFwiK2V4dCtcIiBpbiBhc3NldCBcIituYW1lO1xuXG5cdFx0dmFyIGFyZ3MgPSBbIG5hbWUsIEFzc2V0TWFuYWdlci5sb2FkZXJzW2V4dF0gXTtcblx0XHRhcmdzID0gYXJncy5jb25jYXQoIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkgKTtcblxuXHRcdHJldHVybiB0aGlzLmxvYWRBcy5hcHBseSh0aGlzLCBhcmdzKTtcblx0fSxcblxuXHRfX2V4dGVuc2lvbjogZnVuY3Rpb24oc3RyKSB7XG5cdFx0dmFyIGlkeCA9IHN0ci5sYXN0SW5kZXhPZignLicpO1xuXHRcdGlmIChpZHggPT09IC0xIHx8IGlkeCA9PT0gMCB8fCBpZHggPT09IHN0ci5sZW5ndGgtMSkgLy8gZG9lcyBub3QgaGF2ZSBhIGNsZWFyIGZpbGUgZXh0ZW5zaW9uXG5cdFx0XHRyZXR1cm4gXCJcIjtcblx0XHRyZXR1cm4gc3RyLnN1YnN0cmluZyhpZHgrMSkudG9Mb3dlckNhc2UoKTtcblx0fSxcblxuXHQvKipcblx0ICogUHVzaGVzIGFuIGFzc2V0IG9udG8gdGhpcyBzdGFjay4gVGhpcyBhbGxvd3MgeW91IHRvXG5cdCAqIHNwZWNpZnkgYSBsb2FkZXIgZnVuY3Rpb24gZm9yIHRoZSBhc3NldC4gVGhpcyBpcyB1c2VmdWxcblx0ICogaWYgeW91IHdpc2ggdG8gdXNlIGdlbmVyaWMgbmFtZXMgZm9yIHlvdXIgYXNzZXRzIChpbnN0ZWFkIG9mXG5cdCAqIGZpbGVuYW1lcyksIG9yIGlmIHlvdSB3YW50IGEgcGFydGljdWxhciBhc3NldCB0byB1c2UgYSBzcGVjaWZpY1xuXHQgKiBsb2FkZXIuIFxuXHQgKlxuXHQgKiBMaWtlIHdpdGgge3sjY3Jvc3NMaW5rIFwiQXNzZXRNYW5hZ2VyL2xvYWQ6bWV0aG9kXCJ9fXt7L2Nyb3NzTGlua319LFxuXHQgKiB0aGUgZmlyc3QgYXJndW1lbnQgaXMgdGhlIGFzc2V0IG5hbWUuIFRoZSBzZWNvbmQgYXJndW1lbnQgaXMgdGhlIGxvYWRlclxuXHQgKiB0byB1c2UgZm9yIHRoaXMgYXNzZXQuIEFueSBzdWJzZXF1ZW50XG5cdCAqIGFyZ3VtZW50cyB3aWxsIGJlIHBhc3NlZCBhbG9uZyB0byB0aGUgbG9hZGVyIGZvciBmdXJ0aGVyXG5cdCAqIHByb2Nlc3NpbmcuXG5cdCAqXG5cdCAqIFRoZSByZXR1cm4gdmFsdWUgb2YgdGhpcyBtZXRob2QgaXMgZGV0ZXJtaW5lZCBieVxuXHQgKiB0aGUgbG9hZGVyJ3MgcHJvY2Vzc0FyZ3VtZW50cyBtZXRob2QuIEZvciBleGFtcGxlLCB0aGVcblx0ICogZGVmYXVsdCBJbWFnZSBsb2FkZXIgcmV0dXJucyBhIFRleHR1cmUgb2JqZWN0LlxuXHQgKlxuXHQgKiBAbWV0aG9kICBsb2FkXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIHRoZSBhc3NldCBuYW1lXG5cdCAqIEBwYXJhbSB7RnVjbnRpb259IGxvYWRlciB0aGUgbG9hZGVyIGZ1bmN0aW9uXG5cdCAqIEBwYXJhbSB7T2JqZWN0IC4uLn0gYXJncyBhIHZhcmlhYmxlIG51bWJlciBvZiBvcHRpb25hbCBhcmd1bWVudHNcblx0ICogQHJldHVybiB7YW55fSByZXR1cm5zIHRoZSBiZXN0IHR5cGUgZm9yIHRoaXMgYXNzZXQncyBsb2FkZXJcblx0ICovXG5cdGxvYWRBczogZnVuY3Rpb24obmFtZSwgbG9hZGVyKSB7XG5cdFx0aWYgKCFuYW1lKVxuXHRcdFx0dGhyb3cgXCJubyBuYW1lIHNwZWNpZmllZCB0byBsb2FkXCI7XG5cdFx0aWYgKCFsb2FkZXIpXG5cdFx0XHR0aHJvdyBcIm5vIGxvYWRlciBzcGVjaWZpZWQgZm9yIGFzc2V0IFwiK25hbWU7XG5cblx0XHR2YXIgaWR4ID0gdGhpcy5fX2luZGV4T2YodGhpcy5hc3NldHMsIG5hbWUpO1xuXHRcdGlmIChpZHggIT09IC0xKSAvL1RPRE86IGV2ZW50dWFsbHkgYWRkIHN1cHBvcnQgZm9yIGRlcGVuZGVuY2llcyBhbmQgc2hhcmVkIGFzc2V0c1xuXHRcdFx0dGhyb3cgXCJhc3NldCBhbHJlYWR5IGRlZmluZWQgaW4gYXNzZXQgbWFuYWdlclwiO1xuXG5cdFx0Ly9ncmFiIGFueSBhZGRpdGlvbmFsIGFyZ3VtZW50c1xuXHRcdHZhciBwYXJhbXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuXG5cdFx0dmFyIGRlc2MgPSBuZXcgQXNzZXRNYW5hZ2VyLkRlc2NyaXB0b3IobmFtZSwgbG9hZGVyLCBwYXJhbXMpO1xuXG5cdFx0Ly9rZWVwIGhvbGQgb2YgdGhpcyBhc3NldFxuXHRcdHRoaXMuYXNzZXRzLnB1c2goZGVzYyk7XG5cblx0XHQvL2Fsc28gYWRkIGl0IHRvIG91ciBxdWV1ZSBvZiBjdXJyZW50IHRhc2tzXG5cdFx0dGhpcy50YXNrcy5wdXNoKGRlc2MpO1xuXHRcdHRoaXMuX19sb2FkQ291bnQrKztcblx0XHR0aGlzLl9fdG90YWxJdGVtcysrO1xuXG5cblx0XHQvL2lmIHdlIGNhbiBwcm9jZXNzIHRoZSBhcmd1bWVudHMgYW5kIGdldCBhIHJldHVybiB2YWx1ZS4uLlxuXHRcdGlmIChsb2FkZXIucHJvY2Vzc0FyZ3VtZW50cykge1xuXHRcdFx0cmV0dXJuIGxvYWRlci5wcm9jZXNzQXJndW1lbnRzLmNhbGwodGhpcywgbmFtZSwgcGFyYW1zKTtcblx0XHR9IGVsc2Vcblx0XHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdF9faW5kZXhPZjogZnVuY3Rpb24obGlzdCwgbmFtZSkge1xuXHRcdGZvciAodmFyIGk9MDsgaTxsaXN0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAobGlzdFtpXS5uYW1lID09PSBuYW1lKVxuXHRcdFx0XHRyZXR1cm4gaTtcblx0XHR9XG5cdFx0cmV0dXJuIC0xO1xuXHR9LFxuXG5cdF9fbG9hZENhbGxiYWNrOiBmdW5jdGlvbihuYW1lLCBzdWNjZXNzKSB7XG5cdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPCAyKSAvL3NvbWUgaGVscGZ1bCBkZWJ1ZyBpbmZvcm1hdGlvbiBpZiB5b3UncmUgd3JpdGluZyBhIExvYWRlclxuXHRcdFx0dGhyb3cgXCJMb2FkZXIgcGFzc2VkIGludmFsaWQgYXJndW1lbnRzIHRvIGZpbmlzaGVkKCkgY2FsbGJhY2s7XCJcblx0XHRcdFx0XHQrXCIgbXVzdCBpbmNsdWRlIG5hbWUgYW5kIHN1Y2Nlc3MgZmxhZ1wiO1xuXG5cdFx0dGhpcy5fX2xvYWRDb3VudC0tO1xuXG5cdFx0dmFyIGFzc2V0SWR4ID0gdGhpcy5fX2luZGV4T2YodGhpcy5hc3NldHMsIG5hbWUpO1xuXHRcdGlmIChhc3NldElkeCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuYXNzZXRzW2Fzc2V0SWR4XS5zdGF0dXMgPSBzdWNjZXNzIFxuXHRcdFx0XHRcdFx0PyBBc3NldE1hbmFnZXIuU3RhdHVzLkxPQURfU1VDQ0VTU1xuXHRcdFx0XHRcdFx0OiBBc3NldE1hbmFnZXIuU3RhdHVzLkxPQURfRkFJTEVEO1xuXHRcdFx0aWYgKCFzdWNjZXNzKSB7XG5cdFx0XHRcdHRoaXMubG9hZEVycm9yLmRpc3BhdGNoKG5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubG9hZFByb2dyZXNzLmRpc3BhdGNoKCAodGhpcy5fX3RvdGFsSXRlbXMgLSB0aGlzLl9fbG9hZENvdW50KSwgXG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9fdG90YWxJdGVtcyxcblx0XHRcdFx0XHRcdFx0XHRcdG5hbWUpO1xuXHRcdFx0XG5cdFx0aWYgKHRoaXMuX19sb2FkQ291bnQgPT09IDApIHtcblx0XHRcdHRoaXMubG9hZEZpbmlzaGVkLmRpc3BhdGNoKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIFRPRE8uLi4uXG5cdC8vIGlzTG9hZGVkOiBmdW5jdGlvbihuYW1lKSB7XG5cdC8vIFx0dmFyIGFzc2V0SWR4ID0gdGhpcy5fX2luZGV4T2YodGhpcy5hc3NldHMsIG5hbWUpO1xuXHQvLyBcdHJldHVybiBhc3NldElkeCAhPT0gLTEgPyB0aGlzLmFzc2V0c1thc3NldElkeF0ubG9hZGVkIDogZmFsc2U7XG5cdC8vIH0sXG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhpcyBBc3NldE1hbmFnZXIgYnkgbG9hZGluZyB0aGUgbmV4dCBhc3NldCBpbiB0aGUgcXVldWUuXG5cdCAqIElmIGFsbCBhc3NldHMgaGF2ZSBiZWVuIGxvYWRlZCwgdGhpcyBtZXRob2QgcmV0dXJucyB0cnVlLCBvdGhlcndpc2Vcblx0ICogaXQgd2lsbCByZXR1cm4gZmFsc2UuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHVwZGF0ZVxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSB3aGV0aGVyIHRoaXMgYXNzZXQgbWFuYWdlciBoYXMgZmluaXNoZWQgbG9hZGluZ1xuXHQgKi9cblx0dXBkYXRlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuY29udGV4dC52YWxpZClcblx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdGlmICh0aGlzLnRhc2tzLmxlbmd0aCA9PT0gMClcblx0XHRcdHJldHVybiAodGhpcy5fX2xvYWRDb3VudCA9PT0gMCk7XG5cblx0XHQvL0lmIHdlIHN0aWxsIGhhdmVuJ3QgcG9wcGVkIGFueSBmcm9tIHRoZSBhc3NldHMgbGlzdC4uLlxuXHRcdGlmICh0aGlzLnRhc2tzLmxlbmd0aCA9PT0gdGhpcy5hc3NldHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmxvYWRTdGFydGVkLmRpc3BhdGNoKCk7XG5cdFx0fVxuXG5cdFx0Ly9ncmFiIHRoZSBuZXh0IHRhc2sgb24gdGhlIHN0YWNrXG5cdFx0dmFyIG5leHRUYXNrID0gdGhpcy50YXNrcy5zaGlmdCgpO1xuXG5cdFx0Ly9hcHBseSB0aGUgbG9hZGluZyBzdGVwXG5cdFx0dmFyIGxvYWRlciA9IG5leHRUYXNrLmxvYWRlcjtcblxuXHRcdHZhciBjYiA9IHRoaXMuX19sb2FkQ2FsbGJhY2tGdW5jO1xuXG5cdFx0dmFyIG5ld1BhcmFtcyA9IFsgbmV4dFRhc2submFtZSwgY2IgXS5jb25jYXQobmV4dFRhc2sucGFyYW1zKTtcblx0XHRsb2FkZXIubG9hZEFzc2V0LmFwcGx5KHRoaXMsIG5ld1BhcmFtcyk7XG5cblx0XHRyZXR1cm4gKHRoaXMuX19sb2FkQ291bnQgPT09IDApO1xuXHR9XG59KTtcblxuLyoqXG4gKiBBIHNldCBvZiBsb2FkZXIgcGx1Z2lucyBmb3IgdGhpcyBhc3NldCBtYW5hZ2VyLiBUaGVzZSBtaWdodCBiZSBhcyBzaW1wbGVcbiAqIGFzIHB1c2hpbmcgSFRNTCBJbWFnZSBvYmplY3RzIGludG8gYSBUZXh0dXJlLCBvciBtb3JlIGNvbXBsZXggbGlrZSBkZWNvZGluZ1xuICogYSBjb21wcmVzc2VkLCBtaXAtbWFwcGVkLCBvciBjdWJlLW1hcCB0ZXh0dXJlLlxuICpcbiAqIFRoaXMgb2JqZWN0IGlzIGEgc2ltcGxlIGhhc2htYXAgb2YgbG93ZXItY2FzZSBleHRlbnNpb24gbmFtZXMgdG8gTG9hZGVyIGZ1bmN0aW9ucy5cbiAqIFxuICogQHByb3BlcnR5IGxvYWRlcnNcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cbkFzc2V0TWFuYWdlci5sb2FkZXJzID0ge307XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgbG9hZGVyIGZ1bmN0aW9uIHdpdGggdGhlIGdpdmVuIGV4dGVuc2lvbihzKS5cbiAqIFRoZSBmaXJzdCBwYXJhbWV0ZXIgaXMgYSBsb2FkZXIgZnVuY3Rpb24sIGFuZCBhbGwgc3Vic2VxdWVudFxuICogcGFyYW1ldGVycyBhcmUgbG93ZXItY2FzZSBleHRlbnNpb25zICh3aXRob3V0IHRoZSBwZXJpb2QpIHRoYXRcbiAqIHNob3VsZCBiZSBhc3NvY2lhdGVkIHdpdGggdGhhdCBsb2FkZXIuIFRoaXMgd2lsbCBvdmVycmlkZSBvdGhlclxuICogbG9hZGVycyBieSB0aGUgc2FtZSBleHRlbnNpb24uXG4gKlxuICogQnkgZGVmYXVsdCwgdGhlIGV4dGVuc2lvbnMgXCJwbmdcIiwgXCJqcGdcIiwgXCJqcGVnXCIsIGFuZCBcImdpZlwiIGFyZVxuICogcmVnaXN0ZXJlZCB0byB7eyNjcm9zc0xpbmsgXCJBc3NldE1hbmFnZXIvSW1hZ2VMb2FkZXI6YXR0cmlidXRlXCJ9fXt7L2Nyb3NzTGlua319LlxuICogXG4gKiBAbWV0aG9kIHJlZ2lzdGVyTG9hZGVyXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBsb2FkZXJGdW5jIHRoZSBsb2FkZXIgZnVuY3Rpb25cbiAqIEBwYXJhbSB7U3RyaW5nIC4uLn0gZXh0ZW5zaW9ucyBhIHZhcmlhYmxlIG51bWJlciBvZiBzdHJpbmdzXG4gKi9cbkFzc2V0TWFuYWdlci5yZWdpc3RlckxvYWRlciA9IGZ1bmN0aW9uKGxvYWRlckZ1bmMsIGV4dGVuc2lvbnMpIHtcblx0aWYgKGFyZ3VtZW50cy5sZW5ndGg9PT0wKVxuXHRcdHRocm93IFwibXVzdCBzcGVjaWZ5IGF0IGxlYXN0IG9uZSBleHRlbnNpb24gZm9yIHRoZSBsb2FkZXJcIjtcblx0dmFyIGV4dHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXHRmb3IgKHZhciBpPTA7IGk8ZXh0cy5sZW5ndGg7IGkrKykgXG5cdFx0QXNzZXRNYW5hZ2VyLmxvYWRlcnNbIGV4dHNbaV0gXSA9IGxvYWRlckZ1bmM7XG59O1xuXG4vKipcbiAqIEEgc2ltcGxlIHdyYXBwZXIgZm9yIGFzc2V0cyB3aGljaCB3aWxsIGJlIHBhc3NlZCBhbG9uZyB0byB0aGUgbG9hZGVyO1xuICogdGhpcyBpcyB1c2VkIGludGVybmFsbHkuXG4gKiBcbiAqIC8vQGNsYXNzIEFzc2V0TWFuYWdlci5EZXNjcmlwdG9yXG4gKi9cbkFzc2V0TWFuYWdlci5EZXNjcmlwdG9yID0gbmV3IENsYXNzKHtcblxuXHRuYW1lOiBudWxsLFxuXHRsb2FkZXI6IG51bGwsXG5cdHBhcmFtczogbnVsbCxcblx0c3RhdHVzOiBudWxsLFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKG5hbWUsIGxvYWRlciwgcGFyYW1zKSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmxvYWRlciA9IGxvYWRlcjtcblx0XHR0aGlzLnBhcmFtcyA9IHBhcmFtcztcblx0XHR0aGlzLnN0YXR1cyA9IEFzc2V0TWFuYWdlci5TdGF0dXMuUVVFVUVEO1xuXHR9XG59KTtcblxuLy9UT0RPOiBkb2N1bWVudCB0aGlzXG4vKipcbiAqIERlZmluZXMgdGhlIHN0YXR1cyBvZiBhbiBhc3NldCBpbiB0aGUgbWFuYWdlciBxdWV1ZS5cbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cbkFzc2V0TWFuYWdlci5TdGF0dXMgPSB7XG5cdFFVRVVFRDogMCxcblx0TE9BRElORzogMSxcblx0TE9BRF9TVUNDRVNTOiAyLFxuXHRMT0FEX0ZBSUw6IDNcbn07XG5cblxuLy9UT0RPOiB1c2UgYSBiYXNlIGxvYWRlciBjbGFzczsgcHVsbCB0aGVzZSBvdXQgaW50byB0aGVpciBvd24gZmlsZXMgP1xuXG4vKipcbiAqIFRoaXMgaXMgdGhlIGRlZmF1bHQgaW1wbGVtZW50YXRpb24gb2YgYW4gaW1hZ2UgbG9hZGVyIHBsdWdpbiBmb3IgQXNzZXRNYW5hZ2VyLlxuICogVGhpcyB1c2VzIGEgRE9NIEltYWdlIG9iamVjdCB0byB1cGxvYWQgUE5HLCBHSUYgYW5kIEpQRyBpbWFnZXMgdG8gYSBXZWJHTFxuICogdGV4dHVyZS4gWW91IHdpbGwgbm90IG5lZWQgdG8gZGVhbCB3aXRoIHRoaXMgY2xhc3MgZGlyZWN0bHksIHVubGVzcyB5b3Ugd2FudFxuICogdG8gd3JpdGUgeW91ciBvd24gQXNzZXRNYW5hZ2VyIGxvYWRlcnMuXG4gKlxuICogQSBgTG9hZGVyYCB0eXBlIGZvciBBc3NldE1hbmFnZXIgaXMgc2ltcGx5IGFuIG9iamVjdCB3aGljaCBkZWZpbmVzIHR3byBtZXRob2RzOlxuICpcbiAqIC0gYGxvYWRBc3NldGA6IHRoaXMgaXMgdGhlIGxvYWRpbmcgZnVuY3Rpb24sIHdoaWNoIGhhbmRsZXMgdGhlIGFzeW5jaHJvbm91cyBsb2FkLlxuICogLSBgcHJvY2Vzc0FyZ3VtZW50c2A6IHRoaXMgaXMgZm9yIHRoZSB1c2VyJ3MgY29udmVuaWVuY2UsIGhhbmRsaW5nIGRlZmF1bHQgYXJndW1lbnRzXG4gKiBhbmQgZ2l2aW5nIGEgbWVhbmluZ2Z1bCByZXR1cm4gdmFsdWUuIFxuICogXG4gKiBAY2xhc3MgQXNzZXRNYW5hZ2VyLkltYWdlTG9hZGVyXG4gKi9cbkFzc2V0TWFuYWdlci5JbWFnZUxvYWRlciA9IHtcblx0XG5cdC8qKlxuXHQgKiBUaGlzIGlzIGEgXCJsb2FkZXIgZnVuY3Rpb25cIiB3aGljaCBoYW5kbGVzIHRoZSBhc3luY2hyb25vdXNcblx0ICogbG9hZGluZyBmb3IgYW4gYXNzZXQuIFRoZSBmdW5jdGlvbiBtdXN0IGJlIGltcGxlbWVudGVkIGluIGEgdmVyeVxuXHQgKiBzdHJpY3QgbWFubmVyIGZvciB0aGUgYXNzZXQgbWFuYWdlciB0byB3b3JrIGNvcnJlY3RseS5cblx0ICpcblx0ICogVGhlIGZpcnN0IHBhcmFtZXRlciBwYXNzZWQgdG8gdGhpcyBmdW5jdGlvbiBpcyB0aGUgbmFtZSBvZiB0aGVcblx0ICogYXNzZXQgYmVpbmcgbG9hZGVkLiBUaGUgc2Vjb25kIHBhcmFtZXRlciBpcyBhIGNhbGxiYWNrIHRoYXQgbXVzdFxuXHQgKiBiZSBpbnZva2VkIGFmdGVyIHRoZSBhc3luYyB0YXNrIGlzIGNvbXBsZXRlZC5cblx0ICogQW55IHN1YnNlcXVlbnQgcGFyYW1ldGVycyBhcmUgdGhvc2UgdGhhdCBjYW1lIGZyb20gdGhlIGluaXRhbCBjYWxsXG5cdCAqIHRvIHt7I2Nyb3NzTGluayBcIkFzc2V0TWFuYWdlci9sb2FkOm1ldGhvZFwifX1Bc3NldE1hbmFnZXIubG9hZHt7L2Nyb3NzTGlua319LiBcblx0ICpcblx0ICogT25jZSB0aGUgc3luY2hyb25vdXMgb3IgYXN5bmNocm9ub3VzIGxvYWRpbmcgdGFzayBpcyBjb21wbGV0ZWQsIHRoZVxuXHQgKiBgZmluaXNoZWRgIGNhbGxiYWNrIG11c3QgYmUgaW52b2tlZCB3aXRoIHR3byBwYXJhbWV0ZXJzOiBmaXJzdCwgdGhlXG5cdCAqIGBuYW1lYCBvZiB0aGUgYXNzZXQgYXMgcGFzc2VkIHRvIHRoaXMgbG9hZGVyLiBBbmQgc2Vjb25kLCBhIGJvb2xlYW4gaW5kaWNhdGluZ1xuXHQgKiB0aGUgYHN1Y2Nlc3NgIG9mIHRoZSBsb2FkIG9wZXJhdGlvbi4gXG5cdCAqXG5cdCAqIElmIHlvdSBkb24ndCBpbnZva2UgdGhlIGNhbGxiYWNrLCB0aGUgYXNzZXQgbWFuYWdlciBtYXkgbmV2ZXIgZmluaXNoIGxvYWRpbmcuXG5cdCAqIFxuXHQgKiBAbWV0aG9kIGxvYWRBc3NldFxuXHQgKiBAc3RhdGljXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgbmFtZSBvZiB0aGUgYXNzZXQgdG8gbG9hZFxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmaW5pc2hlZCB0aGUgZnVuY3Rpb24gdG8gY2FsbCB3aGVuIGFzeW5jIGxvYWRpbmcgaXMgY29tcGxldGVcblx0ICogQHBhcmFtIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIHRvIG9wZXJhdGUgb24gZm9yIHRoaXMgYXNzZXRcblx0ICogQHBhcmFtIHtTdHJpbmd9IHBhdGggdGhlIG9wdGlvbmFsIGltYWdlIHBhdGggdG8gdXNlIGluc3RlYWQgb2YgdGhlIGBuYW1lYCBwYXJhbWV0ZXJcblx0ICovXG5cdGxvYWRBc3NldDogZnVuY3Rpb24obmFtZSwgZmluaXNoZWQsIHRleHR1cmUsIHBhdGgpIHtcblx0XHRpZiAoIXRleHR1cmUpIHtcblx0XHRcdHRocm93IFwibm8gdGV4dHVyZSBvYmplY3Qgc3BlY2lmaWVkIHRvIHRoZSBJbWFnZUxvYWRlciBmb3IgYXNzZXQgbWFuYWdlclwiO1xuXHRcdH1cblxuXHRcdC8vaWYgcGF0aCBpcyB1bmRlZmluZWQsIHVzZSB0aGUgYXNzZXQgbmFtZSBhbmQgXG5cdFx0Ly9hc3N1bWUgaXRzIGEgcGF0aC5cblx0XHRwYXRoID0gcGF0aCB8fCBuYW1lO1xuXG5cdFx0dmFyIGltZyA9IG5ldyBJbWFnZSgpO1xuXG5cdFx0aW1nLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0aW1nLm9uZXJyb3IgPSBpbWcub25hYm9ydCA9IG51bGw7IC8vY2xlYXIgb3RoZXIgbGlzdGVuZXJzXG5cdFx0XHR0ZXh0dXJlLnVwbG9hZEltYWdlKGltZyk7XG5cdFx0XHRmaW5pc2hlZChuYW1lLCB0cnVlKTtcblx0XHR9O1xuXHRcdGltZy5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRpbWcub25sb2FkID0gaW1nLm9uYWJvcnQgPSBudWxsO1xuXHRcdFx0Y29uc29sZS53YXJuKFwiRXJyb3IgbG9hZGluZyBpbWFnZTogXCIrcGF0aCk7XG5cdFx0XHQvL1dlIHVzZSBudWxsIGRhdGEgdG8gYXZvaWQgV2ViR0wgZXJyb3JzXG5cdFx0XHQvL1RPRE86IGhhbmRsZSBmYWlsIG1vcmUgc21vb3RobHksIGkuZS4gd2l0aCBhIGNhbGxiYWNrXG5cdFx0XHQvL1RPRE86IFNob3VsZCB0aGlzIGJlIHB1cmUgYmxhY2ssIG9yIHB1cmVseSB0cmFuc3BhcmVudD9cblx0XHRcdHRleHR1cmUudXBsb2FkRGF0YSgxLCAxKTsgXG5cdFx0XHRmaW5pc2hlZChuYW1lLCBmYWxzZSk7XG5cdFx0fTtcblx0XHRpbWcub25hYm9ydCA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0aW1nLm9ubG9hZCA9IGltZy5vbmVycm9yID0gbnVsbDtcblx0XHRcdGNvbnNvbGUud2FybihcIkFib3J0ZWQgaW1hZ2U6IFwiK3BhdGgpO1xuXHRcdFx0Ly9XZSB1c2UgbnVsbCBkYXRhIHRvIGF2b2lkIFdlYkdMIGVycm9yc1xuXHRcdFx0dGV4dHVyZS51cGxvYWREYXRhKDEsIDEpO1xuXHRcdFx0ZmluaXNoZWQobmFtZSwgZmFsc2UpO1xuXHRcdH07XG5cblx0XHQvL3NldHVwIHNvdXJjZVxuXHRcdGltZy5zcmMgPSBwYXRoO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgZnJvbSBcblx0ICoge3sjY3Jvc3NMaW5rIFwiQXNzZXRNYW5hZ2VyL2xvYWQ6bWV0aG9kXCJ9fUFzc2V0TWFuYWdlci5sb2Fke3svY3Jvc3NMaW5rfX0gdG9cblx0ICogcHJvY2VzcyB0aGUgYXJndW1lbnRzIGFuZCBzZXR1cCBhbnkgZGVmYXVsdCB2YWx1ZXMuIFRoaXMgaXMgYWxzbyByZXNwb25zaWJsZSBmb3Jcblx0ICogZGV0ZXJtaW5pbmcgdGhlIGFwcHJvcHJpYXRlIHJldHVybiB2YWx1ZSBmb3IgdGhlIGxvYWQgZnVuY3Rpb24uIEluIHRoZSBjYXNlIG9mXG5cdCAqIGBJbWFnZUxvYWRlcmAsIHdlIHJldHVybiB0aGUgVGV4dHVyZSB0aGF0IHdhcyBwYXNzZWQgdG8gdGhlIGxvYWQoKSBmdW5jdGlvbiwgb3Jcblx0ICogYSBuZXcgVGV4dHVyZSBvYmplY3QgaWYgbm9uZSB3YXMgZ2l2ZW4uIFRoaXMgd2F5LCB0aGUgdXNlciBjYW4gd3JpdGUgY29kZSBsaWtlIHRoaXM6XG5cdCAqXG5cdCAqICAgICAgIHZhciB0ZXh0dXJlID0gYXNzZXRNYW5hZ2VyLmxvYWQoXCJpbWcucG5nXCIpOyAvL3JldHVybnMgbmV3IFRleHR1cmVcblx0ICpcblx0ICogVGhlIGZpcnN0IGFyZ3VtZW50IGlzIHRoZSBuYW1lIG9mIHRoZSBhc3NldCBiZWluZyBwcm9jZXNzZWQuIFRoZSBzZWNvbmQgYXJndW1lbnRcblx0ICogaXMgYW4gYXJyYXkgb2YgYXJndW1lbnRzIHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gdGhlIGxvYWRlciBmdW5jdGlvbi5cblx0ICogXG5cdCAqIFRoZSBtZXRob2QgaXMgY2FsbGVkIGJvdW5kIHRvIHRoZSBBc3NldE1hbmFnZXIsIHNvIHdlIGNhbiBhY2Nlc3MgV2ViR0xDb250ZXh0XG5cdCAqIHdpdGggXCJ0aGlzLmNvbnRleHRcIi5cblx0ICpcblx0ICogQG1ldGhvZCAgcHJvY2Vzc0FyZ3VtZW50c1xuXHQgKiBAc3RhdGljXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgYXNzZXQgbmFtZVxuXHQgKiBAcGFyYW0gIHtBcnJheX0gcGFyYW1zIGFuIGFycmF5IG9mIHBhcmFtZXRlcnMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gbG9hZCB0aGUgYXNzZXRcblx0ICogQHJldHVybiB7YW55fSB0aGUgb2JqZWN0IHRoZSB1c2VyIG1heSBleHBlY3QgZnJvbSB0aGUgbG9hZGVyLCBpbiB0aGlzIGNhc2UgYSBUZXh0dXJlIG9iamVjdFxuXHQgKi9cblx0cHJvY2Vzc0FyZ3VtZW50czogZnVuY3Rpb24obmFtZSwgcGFyYW1zKSB7XG5cdFx0Ly90aGUgZmlyc3QgcGFyYW1ldGVyIGlzIGEgdGV4dHVyZS4uLiBpZiBub3Qgc3BlY2lmaWVkLCB3ZSBuZWVkIHRvIGFzc2lnbiBpdCBhIG5ldyBvYmplY3Rcblx0XHRpZiAocGFyYW1zLmxlbmd0aCA9PT0gMCB8fCAhcGFyYW1zWzBdKVxuXHRcdFx0cmV0dXJuIChwYXJhbXNbMF0gPSBuZXcgVGV4dHVyZSh0aGlzLmNvbnRleHQpKTtcblx0XHRlbHNlXG5cdFx0XHRyZXR1cm4gcGFyYW1zWzBdO1xuXHR9XG59O1xuXG5cdFxuXG5cbi8vIFJlZ2lzdGVyIG91ciBkZWZhdWx0IGxvYWRlcnMuLi5cblxuQXNzZXRNYW5hZ2VyLnJlZ2lzdGVyTG9hZGVyKEFzc2V0TWFuYWdlci5JbWFnZUxvYWRlciwgXCJwbmdcIiwgXCJnaWZcIiwgXCJqcGdcIiwgXCJqcGVnXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFzc2V0TWFuYWdlcjtcbiIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxuLy8gUmVxdWlyZXMuLi4uXG52YXIgQ2xhc3MgICAgICAgICA9IHJlcXVpcmUoJ2tsYXNzZScpO1xuXG52YXIgQWJzdHJhY3RCYXRjaCA9IHJlcXVpcmUoJy4vQWJzdHJhY3RCYXRjaCcpO1xuXG52YXIgTWVzaCAgICAgICAgICA9IHJlcXVpcmUoJy4vZ2x1dGlscy9NZXNoJyk7XG52YXIgU2hhZGVyUHJvZ3JhbSA9IHJlcXVpcmUoJy4vZ2x1dGlscy9TaGFkZXJQcm9ncmFtJyk7XG5cblxuLyoqXG4gKiBBIGJhc2ljIGltcGxlbWVudGF0aW9uIG9mIGEgYmF0Y2hlciB3aGljaCBkcmF3cyAyRCBzcHJpdGVzLlxuICogVGhpcyB1c2VzIHR3byB0cmlhbmdsZXMgKHF1YWRzKSB3aXRoIGluZGV4ZWQgYW5kIGludGVybGVhdmVkXG4gKiB2ZXJ0ZXggZGF0YS4gRWFjaCB2ZXJ0ZXggaG9sZHMgNSBmbG9hdHMgKFBvc2l0aW9uLnh5LCBDb2xvciwgVGV4Q29vcmQwLnh5KS5cbiAqXG4gKiBUaGUgY29sb3IgaXMgcGFja2VkIGludG8gYSBzaW5nbGUgZmxvYXQgdG8gcmVkdWNlIHZlcnRleCBiYW5kd2lkdGgsIGFuZFxuICogdGhlIGRhdGEgaXMgaW50ZXJsZWF2ZWQgZm9yIGJlc3QgcGVyZm9ybWFuY2UuIFdlIHVzZSBhIHN0YXRpYyBpbmRleCBidWZmZXIsXG4gKiBhbmQgYSBkeW5hbWljIHZlcnRleCBidWZmZXIgdGhhdCBpcyB1cGRhdGVkIHdpdGggYnVmZmVyU3ViRGF0YS4gXG4gKiBcbiAqIEBleGFtcGxlXG4gKiAgICAgIHZhciBTcHJpdGVCYXRjaCA9IHJlcXVpcmUoJ2thbWknKS5TcHJpdGVCYXRjaDsgIFxuICogICAgICBcbiAqICAgICAgLy9jcmVhdGUgYSBuZXcgYmF0Y2hlclxuICogICAgICB2YXIgYmF0Y2ggPSBuZXcgU3ByaXRlQmF0Y2goY29udGV4dCk7XG4gKlxuICogICAgICBmdW5jdGlvbiByZW5kZXIoKSB7XG4gKiAgICAgICAgICBiYXRjaC5iZWdpbigpO1xuICogICAgICAgICAgXG4gKiAgICAgICAgICAvL2RyYXcgc29tZSBzcHJpdGVzIGluIGJldHdlZW4gYmVnaW4gYW5kIGVuZC4uLlxuICogICAgICAgICAgYmF0Y2guZHJhdyggdGV4dHVyZSwgMCwgMCwgMjUsIDMyICk7XG4gKiAgICAgICAgICBiYXRjaC5kcmF3KCB0ZXh0dXJlMSwgMCwgMjUsIDQyLCAyMyApO1xuICogXG4gKiAgICAgICAgICBiYXRjaC5lbmQoKTtcbiAqICAgICAgfVxuICogXG4gKiBAY2xhc3MgIFNwcml0ZUJhdGNoXG4gKiBAZXh0ZW5kcyBBYnN0cmFjdEJhdGNoXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7V2ViR0xDb250ZXh0fSBjb250ZXh0IHRoZSBjb250ZXh0IGZvciB0aGlzIGJhdGNoXG4gKiBAcGFyYW0ge051bWJlcn0gc2l6ZSB0aGUgbWF4IG51bWJlciBvZiBzcHJpdGVzIHRvIGZpdCBpbiBhIHNpbmdsZSBiYXRjaFxuICovXG52YXIgU3ByaXRlQmF0Y2ggPSBuZXcgQ2xhc3Moe1xuXG4gICAgRXh0ZW5kczogQWJzdHJhY3RCYXRjaCxcblxuICAgIC8vQ29uc3RydWN0b3JcbiAgICBpbml0aWFsaXplOiBmdW5jdGlvbiBTcHJpdGVCYXRjaChjb250ZXh0LCBzaXplKSB7XG4gICAgICAgIEFic3RyYWN0QmF0Y2guY2FsbCh0aGlzLCBjb250ZXh0LCBzaXplKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogU3ByaXRlQmF0Y2ggdXBsb2FkcyBhIHZlYzIgZm9yIHByb2plY3Rpb25cbiAgICAgICAgICogdHJhbnNmb3JtIGluIHRoZSBzaGFkZXIuIEEgY3VzdG9tIHNoYWRlciBtaWdodFxuICAgICAgICAgKiB1c2UgYSBtYXRyaXggb3Igc29tZSBvdGhlciBtZWFucyBvZiBjYWxjdWxhdGluZyBcbiAgICAgICAgICogcHJvamVjdGlvbjsgaW4gd2hpY2ggY2FzZSB0aGlzIHNob3VsZCBiZSBzZXQgdG8gZmFsc2UuXG4gICAgICAgICAqIFxuICAgICAgICAgKiBAcHJvcGVydHkgdXNlUHJvamVjdGlvblZlY3RvclxuICAgICAgICAgKiBAdHlwZSB7Qm9vbGVhbn1cbiAgICAgICAgICogQGRlZmF1bHQgIHRydWVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMudXNlUHJvamVjdGlvblZlY3RvciA9IHRydWU7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSBwcm9qZWN0aW9uIEZsb2F0MzJBcnJheSB2ZWMyIHdoaWNoIGlzXG4gICAgICAgICAqIHVzZWQgdG8gYXZvaWQgc29tZSBtYXRyaXggY2FsY3VsYXRpb25zLiBBIDNEIFxuICAgICAgICAgKiBiYXRjaGVyIG1pZ2h0IHdhbnQgdG8gcmVwbGFjZSB0aGlzIGFuZCBcbiAgICAgICAgICoge3sjY3Jvc3NMaW5rIFwiU3ByaXRlQmF0Y2gvc2V0UHJvamVjdGlvbjptZXRob2RcIn19e3svY3Jvc3NMaW5rfX0gXG4gICAgICAgICAqIGVudGlyZWx5LiBcbiAgICAgICAgICpcbiAgICAgICAgICogQHByb3BlcnR5IHByb2plY3Rpb25cbiAgICAgICAgICogQHR5cGUge0Zsb2F0MzJBcnJheX1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMucHJvamVjdGlvbiA9IG5ldyBGbG9hdDMyQXJyYXkoMik7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSBjdXJyZW50bHkgYm91bmQgdGV4dHVyZS4gRG8gbm90IG1vZGlmeS5cbiAgICAgICAgICogXG4gICAgICAgICAqIEBwcm9wZXJ0eSB7VGV4dHVyZX0gdGV4dHVyZVxuICAgICAgICAgKiBAcmVhZE9ubHlcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMudGV4dHVyZSA9IG51bGw7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFRoZSBudW1iZXIgb2YgZmxvYXRzIHBlciB2ZXJ0ZXggZm9yIHRoaXMgYmF0Y2hlciBcbiAgICAgKiAoUG9zaXRpb24ueHkgKyBDb2xvciArIFRleENvb3JkMC54eSkuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kICBnZXRWZXJ0ZXhTaXplXG4gICAgICogQHJldHVybiB7TnVtYmVyfSB0aGUgbnVtYmVyIG9mIGZsb2F0cyBwZXIgdmVydGV4XG4gICAgICovXG4gICAgZ2V0VmVydGV4U2l6ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBTcHJpdGVCYXRjaC5WRVJURVhfU0laRTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogVXNlZCBpbnRlcm5hbGx5IHRvIHJldHVybiB0aGUgUG9zaXRpb24sIENvbG9yLCBhbmQgVGV4Q29vcmQwIGF0dHJpYnV0ZXMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kICBfY3JlYXRlVmVydGV4QXR0cmlidWV0c1xuICAgICAqIEBwcm90ZWN0ZWRcbiAgICAgKiBAcmV0dXJuIHtbdHlwZV19IFtkZXNjcmlwdGlvbl1cbiAgICAgKi9cbiAgICBfY3JlYXRlVmVydGV4QXR0cmlidXRlczogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBnbCA9IHRoaXMuY29udGV4dC5nbDtcblxuICAgICAgICByZXR1cm4gWyBcbiAgICAgICAgICAgIG5ldyBNZXNoLkF0dHJpYihcIlBvc2l0aW9uXCIsIDIpLFxuICAgICAgICAgICAgIC8vcGFjayB0aGUgY29sb3IgdXNpbmcgc29tZSBjcmF6eSB3aXphcmRyeSBcbiAgICAgICAgICAgIG5ldyBNZXNoLkF0dHJpYihcIkNvbG9yXCIsIDQsIG51bGwsIGdsLlVOU0lHTkVEX0JZVEUsIHRydWUsIDEpLFxuICAgICAgICAgICAgbmV3IE1lc2guQXR0cmliKFwiVGV4Q29vcmQwXCIsIDIpXG4gICAgICAgIF07XG4gICAgfSxcblxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgcHJvamVjdGlvbiB2ZWN0b3IsIGFuIHggYW5kIHlcbiAgICAgKiBkZWZpbmluZyB0aGUgbWlkZGxlIHBvaW50cyBvZiB5b3VyIHN0YWdlLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRQcm9qZWN0aW9uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHggdGhlIHggcHJvamVjdGlvbiB2YWx1ZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB5IHRoZSB5IHByb2plY3Rpb24gdmFsdWVcbiAgICAgKi9cbiAgICBzZXRQcm9qZWN0aW9uOiBmdW5jdGlvbih4LCB5KSB7XG4gICAgICAgIHZhciBvbGRYID0gdGhpcy5wcm9qZWN0aW9uWzBdO1xuICAgICAgICB2YXIgb2xkWSA9IHRoaXMucHJvamVjdGlvblsxXTtcbiAgICAgICAgdGhpcy5wcm9qZWN0aW9uWzBdID0geDtcbiAgICAgICAgdGhpcy5wcm9qZWN0aW9uWzFdID0geTtcblxuICAgICAgICAvL3dlIG5lZWQgdG8gZmx1c2ggdGhlIGJhdGNoLi5cbiAgICAgICAgaWYgKHRoaXMuZHJhd2luZyAmJiAoeCAhPSBvbGRYIHx8IHkgIT0gb2xkWSkpIHtcbiAgICAgICAgICAgIHRoaXMuZmx1c2goKTtcbiAgICAgICAgICAgIHRoaXMuX3VwZGF0ZU1hdHJpY2VzKCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIGRlZmF1bHQgc2hhZGVyIGZvciB0aGlzIGJhdGNoLlxuICAgICAqXG4gICAgICogQG1ldGhvZCAgX2NyZWF0ZVNoYWRlclxuICAgICAqIEBwcm90ZWN0ZWRcbiAgICAgKiBAcmV0dXJuIHtTaGFkZXJQcm9ncmFtfSBhIG5ldyBpbnN0YW5jZSBvZiBTaGFkZXJQcm9ncmFtXG4gICAgICovXG4gICAgX2NyZWF0ZVNoYWRlcjogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBzaGFkZXIgPSBuZXcgU2hhZGVyUHJvZ3JhbSh0aGlzLmNvbnRleHQsXG4gICAgICAgICAgICAgICAgU3ByaXRlQmF0Y2guREVGQVVMVF9WRVJUX1NIQURFUiwgXG4gICAgICAgICAgICAgICAgU3ByaXRlQmF0Y2guREVGQVVMVF9GUkFHX1NIQURFUik7XG4gICAgICAgIGlmIChzaGFkZXIubG9nKVxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiU2hhZGVyIExvZzpcXG5cIiArIHNoYWRlci5sb2cpO1xuICAgICAgICByZXR1cm4gc2hhZGVyO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBUaGlzIGlzIGNhbGxlZCBkdXJpbmcgcmVuZGVyaW5nIHRvIHVwZGF0ZSBwcm9qZWN0aW9uL3RyYW5zZm9ybVxuICAgICAqIG1hdHJpY2VzIGFuZCB1cGxvYWQgdGhlIG5ldyB2YWx1ZXMgdG8gdGhlIHNoYWRlci4gRm9yIGV4YW1wbGUsXG4gICAgICogaWYgdGhlIHVzZXIgY2FsbHMgc2V0UHJvamVjdGlvbiBtaWQtZHJhdywgdGhlIGJhdGNoIHdpbGwgZmx1c2hcbiAgICAgKiBhbmQgdGhpcyB3aWxsIGJlIGNhbGxlZCBiZWZvcmUgY29udGludWluZyB0byBhZGQgaXRlbXMgdG8gdGhlIGJhdGNoLlxuICAgICAqXG4gICAgICogWW91IGdlbmVyYWxseSBzaG91bGQgbm90IG5lZWQgdG8gY2FsbCB0aGlzIGRpcmVjdGx5LlxuICAgICAqIFxuICAgICAqIEBtZXRob2QgIHVwZGF0ZU1hdHJpY2VzXG4gICAgICogQHByb3RlY3RlZFxuICAgICAqL1xuICAgIHVwZGF0ZU1hdHJpY2VzOiBmdW5jdGlvbigpIHtcbiAgICAgICAgLy9hbiBleHRlbnNpb24gb2YgU3ByaXRlQmF0Y2ggbWlnaHQgd2FudCB0byBzdXBwb3J0IGZ1bGwgdHJhbnNmb3JtICZcbiAgICAgICAgLy9wcm9qZWN0aW9uIG1hdHJpY2VzIGZvciAzRCBiaWxsYm9hcmRzLiBpZiBzbywgb3ZlcnJpZGUgdGhpcyBtZXRob2RcbiAgICAgICAgaWYgKHRoaXMudXNlUHJvamVjdGlvblZlY3RvcilcbiAgICAgICAgICAgIHRoaXMuc2hhZGVyLnNldFVuaWZvcm1mdihcInVfcHJvamVjdGlvblwiLCB0aGlzLnByb2plY3Rpb24pO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDYWxsZWQgYmVmb3JlIHJlbmRlcmluZywgYW5kIGJpbmRzIHRoZSBjdXJyZW50IHRleHR1cmUuXG4gICAgICogXG4gICAgICogQG1ldGhvZCBfcHJlUmVuZGVyXG4gICAgICogQHByb3RlY3RlZFxuICAgICAqL1xuICAgIF9wcmVSZW5kZXI6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy50ZXh0dXJlKVxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmJpbmQoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQmluZHMgdGhlIHNoYWRlciwgZGlzYWJsZXMgZGVwdGggd3JpdGluZywgXG4gICAgICogZW5hYmxlcyBibGVuZGluZywgYWN0aXZhdGVzIHRleHR1cmUgdW5pdCAwLCBhbmQgc2VuZHNcbiAgICAgKiBkZWZhdWx0IG1hdHJpY2VzIGFuZCBzYW1wbGVyMkQgdW5pZm9ybXMgdG8gdGhlIHNoYWRlci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgIGJlZ2luXG4gICAgICovXG4gICAgYmVnaW46IGZ1bmN0aW9uKCkge1xuICAgICAgICAvL3Nwcml0ZSBiYXRjaCBkb2Vzbid0IGhvbGQgYSByZWZlcmVuY2UgdG8gR0wgc2luY2UgaXQgaXMgdm9sYXRpbGVcbiAgICAgICAgdmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuICAgICAgICBcbiAgICAgICAgLy9qdXN0IGRvIGRpcmVjdCBwYXJlbnQgY2FsbCBmb3Igc3BlZWQgaGVyZVxuICAgICAgICAvL1RoaXMgYmluZHMgdGhlIHNoYWRlciBhbmQgbWVzaCFcbiAgICAgICAgQWJzdHJhY3RCYXRjaC5wcm90b3R5cGUuYmVnaW4uY2FsbCh0aGlzKTtcblxuICAgICAgICB0aGlzLnVwZGF0ZU1hdHJpY2VzKCk7IC8vc2VuZCBwcm9qZWN0aW9uL3RyYW5zZm9ybSB0byBzaGFkZXJcblxuICAgICAgICAvL3VwbG9hZCB0aGUgc2FtcGxlciB1bmlmb3JtLiBub3QgbmVjZXNzYXJ5IGV2ZXJ5IGZsdXNoIHNvIHdlIGp1c3RcbiAgICAgICAgLy9kbyBpdCBoZXJlLlxuICAgICAgICB0aGlzLnNoYWRlci5zZXRVbmlmb3JtaShcInVfdGV4dHVyZTBcIiwgMCk7XG5cbiAgICAgICAgLy9kaXNhYmxlIGRlcHRoIG1hc2tcbiAgICAgICAgZ2wuZGVwdGhNYXNrKGZhbHNlKTtcblxuICAgICAgICAvL3ByZW11bHRpcGxpZWQgYWxwaGFcbiAgICAgICAgaWYgKHRoaXMuX2JsZW5kRW5hYmxlZCkge1xuICAgICAgICAgICAgZ2wuZW5hYmxlKGdsLkJMRU5EKTtcblxuICAgICAgICAgICAgLy9zZXQgZWl0aGVyIHRvIC0xIGlmIHlvdSB3YW50IHRvIGNhbGwgeW91ciBvd24gXG4gICAgICAgICAgICAvL2JsZW5kRnVuYyBvciBibGVuZEZ1bmNTZXBhcmF0ZVxuICAgICAgICAgICAgaWYgKHRoaXMuX2JsZW5kU3JjICE9PSAtMSAmJiB0aGlzLl9ibGVuZERzdCAhPT0gLTEpXG4gICAgICAgICAgICAgICAgZ2wuYmxlbmRGdW5jKHRoaXMuX2JsZW5kU3JjLCB0aGlzLl9ibGVuZERzdCk7IFxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEVuZHMgdGhlIHNwcml0ZSBiYXRjaGVyIGFuZCBmbHVzaGVzIGFueSByZW1haW5pbmcgZGF0YSB0byB0aGUgR1BVLlxuICAgICAqIFxuICAgICAqIEBtZXRob2QgZW5kXG4gICAgICovXG4gICAgZW5kOiBmdW5jdGlvbigpIHtcbiAgICAgICAgLy9zcHJpdGUgYmF0Y2ggZG9lc24ndCBob2xkIGEgcmVmZXJlbmNlIHRvIEdMIHNpbmNlIGl0IGlzIHZvbGF0aWxlXG4gICAgICAgIHZhciBnbCA9IHRoaXMuY29udGV4dC5nbDtcbiAgICAgICAgXG4gICAgICAgIC8vanVzdCBkbyBkaXJlY3QgcGFyZW50IGNhbGwgZm9yIHNwZWVkIGhlcmVcbiAgICAgICAgLy9UaGlzIGJpbmRzIHRoZSBzaGFkZXIgYW5kIG1lc2ghXG4gICAgICAgIEFic3RyYWN0QmF0Y2gucHJvdG90eXBlLmVuZC5jYWxsKHRoaXMpO1xuXG4gICAgICAgIGdsLmRlcHRoTWFzayh0cnVlKTtcblxuICAgICAgICBpZiAodGhpcy5fYmxlbmRFbmFibGVkKVxuICAgICAgICAgICAgZ2wuZGlzYWJsZShnbC5CTEVORCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEZsdXNoZXMgdGhlIGJhdGNoIHRvIHRoZSBHUFUuIFRoaXMgc2hvdWxkIGJlIGNhbGxlZCB3aGVuXG4gICAgICogc3RhdGUgY2hhbmdlcywgc3VjaCBhcyBibGVuZCBmdW5jdGlvbnMsIGRlcHRoIG9yIHN0ZW5jaWwgc3RhdGVzLFxuICAgICAqIHNoYWRlcnMsIGFuZCBzbyBmb3J0aC5cbiAgICAgKiBcbiAgICAgKiBAbWV0aG9kIGZsdXNoXG4gICAgICovXG4gICAgZmx1c2g6IGZ1bmN0aW9uKCkge1xuICAgICAgICAvL2lnbm9yZSBmbHVzaCBpZiB0ZXh0dXJlIGlzIG51bGwgb3Igb3VyIGJhdGNoIGlzIGVtcHR5XG4gICAgICAgIGlmICghdGhpcy50ZXh0dXJlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAodGhpcy5pZHggPT09IDApXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIEFic3RyYWN0QmF0Y2gucHJvdG90eXBlLmZsdXNoLmNhbGwodGhpcyk7XG4gICAgICAgIFNwcml0ZUJhdGNoLnRvdGFsUmVuZGVyQ2FsbHMrKztcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHNwcml0ZSB0byB0aGlzIGJhdGNoLiBUaGUgc3ByaXRlIGlzIGRyYXduIGluIFxuICAgICAqIHNjcmVlbi1zcGFjZSB3aXRoIHRoZSBvcmlnaW4gYXQgdGhlIHVwcGVyLWxlZnQgY29ybmVyICh5LWRvd24pLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBkcmF3XG4gICAgICogQHBhcmFtICB7VGV4dHVyZX0gdGV4dHVyZSB0aGUgdGV4dHVyZSBmb3IgdGhpcyBzcHJpdGVcbiAgICAgKiBAcGFyYW0gIHtOdW1iZXJ9IHggICAgICAgdGhlIHggcG9zaXRpb24gaW4gcGl4ZWxzLCBkZWZhdWx0cyB0byB6ZXJvXG4gICAgICogQHBhcmFtICB7TnVtYmVyfSB5ICAgICAgIHRoZSB5IHBvc2l0aW9uIGluIHBpeGVscywgZGVmYXVsdHMgdG8gemVyb1xuICAgICAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICB0aGUgd2lkdGggaW4gcGl4ZWxzLCBkZWZhdWx0cyB0byB0aGUgdGV4dHVyZSB3aWR0aFxuICAgICAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0ICB0aGUgaGVpZ2h0IGluIHBpeGVscywgZGVmYXVsdHMgdG8gdGhlIHRleHR1cmUgaGVpZ2h0XG4gICAgICogQHBhcmFtICB7TnVtYmVyfSB1MSAgICAgIHRoZSBmaXJzdCBVIGNvb3JkaW5hdGUsIGRlZmF1bHQgemVyb1xuICAgICAqIEBwYXJhbSAge051bWJlcn0gdjEgICAgICB0aGUgZmlyc3QgViBjb29yZGluYXRlLCBkZWZhdWx0IHplcm9cbiAgICAgKiBAcGFyYW0gIHtOdW1iZXJ9IHUyICAgICAgdGhlIHNlY29uZCBVIGNvb3JkaW5hdGUsIGRlZmF1bHQgb25lXG4gICAgICogQHBhcmFtICB7TnVtYmVyfSB2MiAgICAgIHRoZSBzZWNvbmQgViBjb29yZGluYXRlLCBkZWZhdWx0IG9uZVxuICAgICAqL1xuICAgIGRyYXc6IGZ1bmN0aW9uKHRleHR1cmUsIHgsIHksIHdpZHRoLCBoZWlnaHQsIHUxLCB2MSwgdTIsIHYyKSB7XG4gICAgICAgIGlmICghdGhpcy5kcmF3aW5nKVxuICAgICAgICAgICAgdGhyb3cgXCJJbGxlZ2FsIFN0YXRlOiB0cnlpbmcgdG8gZHJhdyBhIGJhdGNoIGJlZm9yZSBiZWdpbigpXCI7XG4gICAgICAgIFxuICAgICAgICAvL2Rvbid0IGRyYXcgYW55dGhpbmcgaWYgR0wgdGV4IGRvZXNuJ3QgZXhpc3QuLlxuICAgICAgICBpZiAoIXRleHR1cmUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy50ZXh0dXJlID09PSBudWxsIHx8IHRoaXMudGV4dHVyZS5pZCAhPT0gdGV4dHVyZS5pZCkge1xuICAgICAgICAgICAgLy9uZXcgdGV4dHVyZS4uIGZsdXNoIHByZXZpb3VzIGRhdGFcbiAgICAgICAgICAgIHRoaXMuZmx1c2goKTtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZSA9IHRleHR1cmU7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5pZHggPT0gdGhpcy52ZXJ0aWNlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMuZmx1c2goKTsgLy93ZSd2ZSByZWFjaGVkIG91ciBtYXgsIGZsdXNoIGJlZm9yZSBwdXNoaW5nIG1vcmUgZGF0YVxuICAgICAgICB9XG5cbiAgICAgICAgd2lkdGggPSAod2lkdGg9PT0wKSA/IHdpZHRoIDogKHdpZHRoIHx8IHRleHR1cmUud2lkdGgpO1xuICAgICAgICBoZWlnaHQgPSAoaGVpZ2h0PT09MCkgPyBoZWlnaHQgOiAoaGVpZ2h0IHx8IHRleHR1cmUuaGVpZ2h0KTtcbiAgICAgICAgeCA9IHggfHwgMDtcbiAgICAgICAgeSA9IHkgfHwgMDtcblxuICAgICAgICB2YXIgeDEgPSB4O1xuICAgICAgICB2YXIgeDIgPSB4ICsgd2lkdGg7XG4gICAgICAgIHZhciB5MSA9IHk7XG4gICAgICAgIHZhciB5MiA9IHkgKyBoZWlnaHQ7XG5cbiAgICAgICAgdTEgPSB1MSB8fCAwO1xuICAgICAgICB1MiA9ICh1Mj09PTApID8gdTIgOiAodTIgfHwgMSk7XG4gICAgICAgIHYxID0gdjEgfHwgMDtcbiAgICAgICAgdjIgPSAodjI9PT0wKSA/IHYyIDogKHYyIHx8IDEpO1xuXG4gICAgICAgIHZhciBjID0gdGhpcy5jb2xvcjtcblxuICAgICAgICAvL3h5XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB4MTtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHkxO1xuICAgICAgICAvL2NvbG9yXG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSBjO1xuICAgICAgICAvL3V2XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB1MTtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHYxO1xuICAgICAgICBcbiAgICAgICAgLy94eVxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geDI7XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB5MTtcbiAgICAgICAgLy9jb2xvclxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gYztcbiAgICAgICAgLy91dlxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdTI7XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2MTtcblxuICAgICAgICAvL3h5XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB4MjtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHkyO1xuICAgICAgICAvL2NvbG9yXG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSBjO1xuICAgICAgICAvL3V2XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB1MjtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHYyO1xuXG4gICAgICAgIC8veHlcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHgxO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geTI7XG4gICAgICAgIC8vY29sb3JcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IGM7XG4gICAgICAgIC8vdXZcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHUxO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdjI7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBzaW5nbGUgcXVhZCBtZXNoIHRvIHRoaXMgc3ByaXRlIGJhdGNoIGZyb20gdGhlIGdpdmVuXG4gICAgICogYXJyYXkgb2YgdmVydGljZXMuIFRoZSBzcHJpdGUgaXMgZHJhd24gaW4gXG4gICAgICogc2NyZWVuLXNwYWNlIHdpdGggdGhlIG9yaWdpbiBhdCB0aGUgdXBwZXItbGVmdCBjb3JuZXIgKHktZG93bikuXG4gICAgICpcbiAgICAgKiBUaGlzIHJlYWRzIDIwIGludGVybGVhdmVkIGZsb2F0cyBmcm9tIHRoZSBnaXZlbiBvZmZzZXQgaW5kZXgsIGluIHRoZSBmb3JtYXRcbiAgICAgKlxuICAgICAqICB7IHgsIHksIGNvbG9yLCB1LCB2LFxuICAgICAqICAgICAgLi4uICB9XG4gICAgICpcbiAgICAgKiBAbWV0aG9kICBkcmF3VmVydGljZXNcbiAgICAgKiBAcGFyYW0ge1RleHR1cmV9IHRleHR1cmUgdGhlIHRleHR1cmUgd2UgYXJlIGRyYXdpbmcgZm9yIHRoaXMgc3ByaXRlXG4gICAgICogQHBhcmFtIHtGbG9hdDMyQXJyYXl9IHZlcnRzIGFuIGFycmF5IG9mIHZlcnRpY2VzXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZiB0aGUgb2Zmc2V0IGludG8gdGhlIHZlcnRpY2VzIGFycmF5IHRvIHJlYWQgZnJvbVxuICAgICAqL1xuICAgIGRyYXdWZXJ0aWNlczogZnVuY3Rpb24odGV4dHVyZSwgdmVydHMsIG9mZikge1xuICAgICAgICBpZiAoIXRoaXMuZHJhd2luZylcbiAgICAgICAgICAgIHRocm93IFwiSWxsZWdhbCBTdGF0ZTogdHJ5aW5nIHRvIGRyYXcgYSBiYXRjaCBiZWZvcmUgYmVnaW4oKVwiO1xuICAgICAgICBcbiAgICAgICAgLy9kb24ndCBkcmF3IGFueXRoaW5nIGlmIEdMIHRleCBkb2Vzbid0IGV4aXN0Li5cbiAgICAgICAgaWYgKCF0ZXh0dXJlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBcbiAgICAgICAgaWYgKHRoaXMudGV4dHVyZSAhPSB0ZXh0dXJlKSB7XG4gICAgICAgICAgICAvL25ldyB0ZXh0dXJlLi4gZmx1c2ggcHJldmlvdXMgZGF0YVxuICAgICAgICAgICAgdGhpcy5mbHVzaCgpO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlkeCA9PSB0aGlzLnZlcnRpY2VzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5mbHVzaCgpOyAvL3dlJ3ZlIHJlYWNoZWQgb3VyIG1heCwgZmx1c2ggYmVmb3JlIHB1c2hpbmcgbW9yZSBkYXRhXG4gICAgICAgIH1cblxuICAgICAgICBvZmYgPSBvZmYgfHwgMDtcbiAgICAgICAgLy9UT0RPOiB1c2UgYSBsb29wIGhlcmU/XG4gICAgICAgIC8veHlcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgLy9jb2xvclxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICAvL3V2XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIFxuICAgICAgICAvL3h5XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIC8vY29sb3JcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgLy91dlxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuXG4gICAgICAgIC8veHlcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgLy9jb2xvclxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICAvL3V2XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cbiAgICAgICAgLy94eVxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICAvL2NvbG9yXG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIC8vdXZcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICB9XG59KTtcblxuLyoqXG4gKiBUaGUgZGVmYXVsdCB2ZXJ0ZXggc2l6ZSwgaS5lLiBudW1iZXIgb2YgZmxvYXRzIHBlciB2ZXJ0ZXguXG4gKiBAYXR0cmlidXRlICBWRVJURVhfU0laRVxuICogQHN0YXRpY1xuICogQGZpbmFsXG4gKiBAdHlwZSB7TnVtYmVyfVxuICogQGRlZmF1bHQgIDVcbiAqL1xuU3ByaXRlQmF0Y2guVkVSVEVYX1NJWkUgPSA1O1xuXG4vKipcbiAqIEluY3JlbWVudGVkIGFmdGVyIGVhY2ggZHJhdyBjYWxsLCBjYW4gYmUgdXNlZCBmb3IgZGVidWdnaW5nLlxuICpcbiAqICAgICBTcHJpdGVCYXRjaC50b3RhbFJlbmRlckNhbGxzID0gMDtcbiAqXG4gKiAgICAgLi4uIGRyYXcgeW91ciBzY2VuZSAuLi5cbiAqXG4gKiAgICAgY29uc29sZS5sb2coXCJEcmF3IGNhbGxzIHBlciBmcmFtZTpcIiwgU3ByaXRlQmF0Y2gudG90YWxSZW5kZXJDYWxscyk7XG4gKlxuICogXG4gKiBAYXR0cmlidXRlICB0b3RhbFJlbmRlckNhbGxzXG4gKiBAc3RhdGljXG4gKiBAdHlwZSB7TnVtYmVyfVxuICogQGRlZmF1bHQgIDBcbiAqL1xuU3ByaXRlQmF0Y2gudG90YWxSZW5kZXJDYWxscyA9IDA7XG5cblNwcml0ZUJhdGNoLkRFRkFVTFRfRlJBR19TSEFERVIgPSBbXG4gICAgXCJwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcIixcbiAgICBcInZhcnlpbmcgdmVjMiB2VGV4Q29vcmQwO1wiLFxuICAgIFwidmFyeWluZyB2ZWM0IHZDb2xvcjtcIixcbiAgICBcInVuaWZvcm0gc2FtcGxlcjJEIHVfdGV4dHVyZTA7XCIsXG5cbiAgICBcInZvaWQgbWFpbih2b2lkKSB7XCIsXG4gICAgXCIgICBnbF9GcmFnQ29sb3IgPSB0ZXh0dXJlMkQodV90ZXh0dXJlMCwgdlRleENvb3JkMCkgKiB2Q29sb3I7XCIsXG4gICAgXCJ9XCJcbl0uam9pbignXFxuJyk7XG5cblNwcml0ZUJhdGNoLkRFRkFVTFRfVkVSVF9TSEFERVIgPSBbXG4gICAgXCJhdHRyaWJ1dGUgdmVjMiBQb3NpdGlvbjtcIixcbiAgICBcImF0dHJpYnV0ZSB2ZWM0IENvbG9yO1wiLFxuICAgIFwiYXR0cmlidXRlIHZlYzIgVGV4Q29vcmQwO1wiLFxuXG4gICAgXCJ1bmlmb3JtIHZlYzIgdV9wcm9qZWN0aW9uO1wiLFxuICAgIFwidmFyeWluZyB2ZWMyIHZUZXhDb29yZDA7XCIsXG4gICAgXCJ2YXJ5aW5nIHZlYzQgdkNvbG9yO1wiLFxuXG4gICAgXCJ2b2lkIG1haW4odm9pZCkge1wiLFxuICAgIFwiICAgZ2xfUG9zaXRpb24gPSB2ZWM0KCBQb3NpdGlvbi54IC8gdV9wcm9qZWN0aW9uLnggLSAxLjAsIFBvc2l0aW9uLnkgLyAtdV9wcm9qZWN0aW9uLnkgKyAxLjAgLCAwLjAsIDEuMCk7XCIsXG4gICAgXCIgICB2VGV4Q29vcmQwID0gVGV4Q29vcmQwO1wiLFxuICAgIFwiICAgdkNvbG9yID0gQ29sb3I7XCIsXG4gICAgXCJ9XCJcbl0uam9pbignXFxuJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gU3ByaXRlQmF0Y2g7XG4iLCIvKipcbiAqIEBtb2R1bGUga2FtaVxuICovXG5cbnZhciBDbGFzcyA9IHJlcXVpcmUoJ2tsYXNzZScpO1xudmFyIFNpZ25hbCA9IHJlcXVpcmUoJ3NpZ25hbHMnKTtcblxudmFyIFRleHR1cmUgPSBuZXcgQ2xhc3Moe1xuXG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgdGV4dHVyZSB3aXRoIHRoZSBvcHRpb25hbCB3aWR0aCwgaGVpZ2h0LCBhbmQgZGF0YS5cblx0ICpcblx0ICogSWYgdGhlIGNvbnN0cnVjdG9yIGlzIHBhc3NlZCBubyBwYXJhbWV0ZXJzIG90aGVyIHRoYW4gV2ViR0xDb250ZXh0LCB0aGVuXG5cdCAqIGl0IHdpbGwgbm90IGJlIGluaXRpYWxpemVkIGFuZCB3aWxsIGJlIG5vbi1yZW5kZXJhYmxlLiBZb3Ugd2lsbCBuZWVkIHRvIG1hbnVhbGx5XG5cdCAqIHVwbG9hZERhdGEgb3IgdXBsb2FkSW1hZ2UgeW91cnNlbGYuXG5cdCAqXG5cdCAqIElmIHlvdSBwYXNzIGEgd2lkdGggYW5kIGhlaWdodCwgdGhlIHRleHR1cmUgd2lsbCBiZSBpbml0aWFsaXplZCB3aXRoIHRoYXQgc2l6ZVxuXHQgKiBhbmQgbnVsbCBkYXRhIChlLmcuIHRyYW5zcGFyZW50IGJsYWNrKS4gSWYgeW91IGFsc28gcGFzcyB0aGUgZm9ybWF0IGFuZCBkYXRhLCBcblx0ICogaXQgd2lsbCBiZSB1cGxvYWRlZCB0byB0aGUgdGV4dHVyZS4gXG5cdCAqXG5cdCAqIFRoZSBhcmd1bWVudHMgYXJlIGtlcHQgaW4gbWVtb3J5IGZvciBmdXR1cmUgY29udGV4dCByZXN0b3JhdGlvbiBldmVudHMuIElmXG5cdCAqIHRoaXMgaXMgdW5kZXNpcmFibGUgKGUuZy4gaHVnZSBidWZmZXJzIHdoaWNoIG5lZWQgdG8gYmUgR0MnZCksIHlvdSBzaG91bGQgbm90XG5cdCAqIHBhc3MgdGhlIGRhdGEgaW4gdGhlIGNvbnN0cnVjdG9yLCBidXQgaW5zdGVhZCB1cGxvYWQgaXQgYWZ0ZXIgY3JlYXRpbmcgYW4gdW5pbml0aWFsaXplZCBcblx0ICogdGV4dHVyZS4gWW91IHdpbGwgbmVlZCB0byBtYW5hZ2UgaXQgeW91cnNlbGYsIGVpdGhlciBieSBleHRlbmRpbmcgdGhlIGNyZWF0ZSgpIG1ldGhvZCwgXG5cdCAqIG9yIGxpc3RlbmluZyB0byByZXN0b3JlZCBldmVudHMgaW4gV2ViR0xDb250ZXh0LlxuXHQgKlxuXHQgKiBNb3N0IHVzZXJzIHdpbGwgd2FudCB0byB1c2UgdGhlIEFzc2V0TWFuYWdlciB0byBjcmVhdGUgYW5kIG1hbmFnZSB0aGVpciB0ZXh0dXJlc1xuXHQgKiB3aXRoIGFzeW5jaHJvbm91cyBsb2FkaW5nIGFuZCBjb250ZXh0IGxvc3MuIFxuXHQgKlxuXHQgKiBAY2xhc3MgIFRleHR1cmVcblx0ICogQGNvbnN0cnVjdG9yXG5cdCAqIEBwYXJhbSAge1dlYkdMQ29udGV4dH0gY29udGV4dCB0aGUgV2ViR0wgY29udGV4dFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoIHRoZSB3aWR0aCBvZiB0aGlzIHRleHR1cmVcblx0ICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgdGhlIGhlaWdodCBvZiB0aGlzIHRleHR1cmVcblx0ICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgZS5nLiBUZXh0dXJlLkZvcm1hdC5SR0JBXG5cdCAqIEBwYXJhbSAge0dMZW51bX0gZGF0YVR5cGUgZS5nLiBUZXh0dXJlLkRhdGFUeXBlLlVOU0lHTkVEX0JZVEUgKFVpbnQ4QXJyYXkpXG5cdCAqIEBwYXJhbSAge0dMZW51bX0gZGF0YSB0aGUgYXJyYXkgYnVmZmVyLCBlLmcuIGEgVWludDhBcnJheSB2aWV3XG5cdCAqL1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBUZXh0dXJlKGNvbnRleHQsIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgZGF0YVR5cGUsIGRhdGEpIHtcblx0XHRpZiAoIWNvbnRleHQpXG5cdFx0XHR0aHJvdyBcIkdMIGNvbnRleHQgbm90IHNwZWNpZmllZFwiO1xuXHRcdHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgV2ViR0xUZXh0dXJlIHdoaWNoIGJhY2tzIHRoaXMgVGV4dHVyZSBvYmplY3QuIFRoaXNcblx0XHQgKiBjYW4gYmUgdXNlZCBmb3IgbG93LWxldmVsIEdMIGNhbGxzLlxuXHRcdCAqIFxuXHRcdCAqIEB0eXBlIHtXZWJHTFRleHR1cmV9XG5cdFx0ICovXG5cdFx0dGhpcy5pZCA9IG51bGw7IC8vaW5pdGlhbGl6ZWQgaW4gY3JlYXRlKClcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSB0YXJnZXQgZm9yIHRoaXMgdGV4dHVyZSB1bml0LCBpLmUuIFRFWFRVUkVfMkQuIFN1YmNsYXNzZXNcblx0XHQgKiBzaG91bGQgb3ZlcnJpZGUgdGhlIGNyZWF0ZSgpIG1ldGhvZCB0byBjaGFuZ2UgdGhpcywgZm9yIGNvcnJlY3Rcblx0XHQgKiB1c2FnZSB3aXRoIGNvbnRleHQgcmVzdG9yZS5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkgdGFyZ2V0XG5cdFx0ICogQHR5cGUge0dMZW51bX1cblx0XHQgKiBAZGVmYXVsdCAgZ2wuVEVYVFVSRV8yRFxuXHRcdCAqL1xuXHRcdHRoaXMudGFyZ2V0ID0gbnVsbDsgLy9pbml0aWFsaXplZCBpbiBjcmVhdGUoKVxuXG5cdFx0LyoqXG5cdFx0ICogVGhlIHdpZHRoIG9mIHRoaXMgdGV4dHVyZSwgaW4gcGl4ZWxzLlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB3aWR0aFxuXHRcdCAqIEByZWFkT25seVxuXHRcdCAqIEB0eXBlIHtOdW1iZXJ9IHRoZSB3aWR0aFxuXHRcdCAqL1xuXHRcdHRoaXMud2lkdGggPSAwOyAvL2luaXRpYWxpemVkIGluIGNyZWF0ZSgpXG5cblx0XHQvKipcblx0XHQgKiBUaGUgaGVpZ2h0IG9mIHRoaXMgdGV4dHVyZSwgaW4gcGl4ZWxzLlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSBoZWlnaHRcblx0XHQgKiBAcmVhZE9ubHlcblx0XHQgKiBAdHlwZSB7TnVtYmVyfSB0aGUgaGVpZ2h0XG5cdFx0ICovXG5cdFx0dGhpcy5oZWlnaHQgPSAwOyAvL2luaXRpYWxpemVkIGluIGNyZWF0ZSgpXG5cblx0XHQvLyBlLmcuIC0tPiBuZXcgVGV4dHVyZShnbCwgMjU2LCAyNTYsIGdsLlJHQiwgZ2wuVU5TSUdORURfQllURSwgZGF0YSk7XG5cdFx0Ly9cdFx0ICAgICAgY3JlYXRlcyBhIG5ldyBlbXB0eSB0ZXh0dXJlLCAyNTZ4MjU2XG5cdFx0Ly9cdFx0LS0+IG5ldyBUZXh0dXJlKGdsKTtcblx0XHQvL1x0XHRcdCAgY3JlYXRlcyBhIG5ldyB0ZXh0dXJlIGJ1dCBXSVRIT1VUIHVwbG9hZGluZyBhbnkgZGF0YS4gXG5cblx0XHR0aGlzLndyYXBTID0gVGV4dHVyZS5ERUZBVUxUX1dSQVA7XG5cdFx0dGhpcy53cmFwVCA9IFRleHR1cmUuREVGQVVMVF9XUkFQO1xuXHRcdHRoaXMubWluRmlsdGVyID0gVGV4dHVyZS5ERUZBVUxUX0ZJTFRFUjtcblx0XHR0aGlzLm1hZ0ZpbHRlciA9IFRleHR1cmUuREVGQVVMVF9GSUxURVI7XG5cblx0XHQvKipcblx0XHQgKiBXaGVuIGEgdGV4dHVyZSBpcyBjcmVhdGVkLCB3ZSBrZWVwIHRyYWNrIG9mIHRoZSBhcmd1bWVudHMgcHJvdmlkZWQgdG8gXG5cdFx0ICogaXRzIGNvbnN0cnVjdG9yLiBPbiBjb250ZXh0IGxvc3MgYW5kIHJlc3RvcmUsIHRoZXNlIGFyZ3VtZW50cyBhcmUgcmUtc3VwcGxpZWRcblx0XHQgKiB0byB0aGUgVGV4dHVyZSwgc28gYXMgdG8gcmUtY3JlYXRlIGl0IGluIGl0cyBjb3JyZWN0IGZvcm0uXG5cdFx0ICpcblx0XHQgKiBUaGlzIGlzIG1haW5seSB1c2VmdWwgaWYgeW91IGFyZSBwcm9jZWR1cmFsbHkgY3JlYXRpbmcgdGV4dHVyZXMgYW5kIHBhc3Npbmdcblx0XHQgKiB0aGVpciBkYXRhIGRpcmVjdGx5IChlLmcuIGZvciBnZW5lcmljIGxvb2t1cCB0YWJsZXMgaW4gYSBzaGFkZXIpLiBGb3IgaW1hZ2Vcblx0XHQgKiBvciBtZWRpYSBiYXNlZCB0ZXh0dXJlcywgaXQgd291bGQgYmUgYmV0dGVyIHRvIHVzZSBhbiBBc3NldE1hbmFnZXIgdG8gbWFuYWdlXG5cdFx0ICogdGhlIGFzeW5jaHJvbm91cyB0ZXh0dXJlIHVwbG9hZC5cblx0XHQgKlxuXHRcdCAqIFVwb24gZGVzdHJveWluZyBhIHRleHR1cmUsIGEgcmVmZXJlbmNlIHRvIHRoaXMgaXMgYWxzbyBsb3N0LlxuXHRcdCAqIFxuXHRcdCAqIEB0eXBlIHtBcnJheX0gdGhlIGFycmF5IG9mIGFyZ3VtZW50cywgc2hpZnRlZCB0byBleGNsdWRlIHRoZSBXZWJHTENvbnRleHQgcGFyYW1ldGVyXG5cdFx0ICovXG5cdFx0dGhpcy5tYW5hZ2VkQXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cblx0XHQvL1RoaXMgaXMgbWFhbmdlZCBieSBXZWJHTENvbnRleHRcblx0XHR0aGlzLmNvbnRleHQuYWRkTWFuYWdlZE9iamVjdCh0aGlzKTtcblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgaW4gdGhlIFRleHR1cmUgY29uc3RydWN0b3IsIGFuZCBhZnRlciB0aGUgR0wgY29udGV4dCBoYXMgYmVlbiByZS1pbml0aWFsaXplZC4gXG5cdCAqIFN1YmNsYXNzZXMgY2FuIG92ZXJyaWRlIHRoaXMgdG8gcHJvdmlkZSBhIGN1c3RvbSBkYXRhIHVwbG9hZCwgZS5nLiBjdWJlbWFwcyBvciBjb21wcmVzc2VkXG5cdCAqIHRleHR1cmVzLlxuXHQgKi9cblx0Y3JlYXRlOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsID0gdGhpcy5jb250ZXh0LmdsOyBcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy5pZCA9IGdsLmNyZWF0ZVRleHR1cmUoKTsgLy90ZXh0dXJlIElEIGlzIHJlY3JlYXRlZFxuXHRcdHRoaXMud2lkdGggPSB0aGlzLmhlaWdodCA9IDA7IC8vc2l6ZSBpcyByZXNldCB0byB6ZXJvIHVudGlsIGxvYWRlZFxuXHRcdHRoaXMudGFyZ2V0ID0gZ2wuVEVYVFVSRV8yRDsgIC8vdGhlIHByb3ZpZGVyIGNhbiBjaGFuZ2UgdGhpcyBpZiBuZWNlc3NhcnkgKGUuZy4gY3ViZSBtYXBzKVxuXG5cdFx0dGhpcy5iaW5kKCk7XG5cblx0XHQvL1RPRE86IGNsZWFuIHRoZXNlIHVwIGEgbGl0dGxlLiBcblx0IFx0Z2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCBUZXh0dXJlLlVOUEFDS19QUkVNVUxUSVBMWV9BTFBIQSk7XG5cdCBcdGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19BTElHTk1FTlQsIFRleHR1cmUuVU5QQUNLX0FMSUdOTUVOVCk7XG5cdCBcdGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19GTElQX1lfV0VCR0wsIFRleHR1cmUuVU5QQUNLX0ZMSVBfWSk7XG5cdCBcdFxuXHQgXHR2YXIgY29sb3JzcGFjZSA9IFRleHR1cmUuVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTiB8fCBnbC5CUk9XU0VSX0RFRkFVTFRfV0VCR0w7XG5cdCBcdGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wsIGNvbG9yc3BhY2UpO1xuXG5cdCBcdC8vc2V0dXAgd3JhcCBtb2RlcyB3aXRob3V0IGJpbmRpbmcgcmVkdW5kYW50bHlcblx0IFx0dGhpcy5zZXRXcmFwKHRoaXMud3JhcFMsIHRoaXMud3JhcFQsIGZhbHNlKTtcblx0IFx0dGhpcy5zZXRGaWx0ZXIodGhpcy5taW5GaWx0ZXIsIHRoaXMubWFnRmlsdGVyLCBmYWxzZSk7XG5cdCBcdFxuXHQgXHRpZiAodGhpcy5tYW5hZ2VkQXJncy5sZW5ndGggIT09IDApIHtcblx0IFx0XHR0aGlzLnVwbG9hZERhdGEuYXBwbHkodGhpcywgdGhpcy5tYW5hZ2VkQXJncyk7XG5cdCBcdH1cblx0fSxcblxuXHQvKipcblx0ICogRGVzdHJveXMgdGhpcyB0ZXh0dXJlIGJ5IGRlbGV0aW5nIHRoZSBHTCByZXNvdXJjZSxcblx0ICogcmVtb3ZpbmcgaXQgZnJvbSB0aGUgV2ViR0xDb250ZXh0IG1hbmFnZW1lbnQgc3RhY2ssXG5cdCAqIHNldHRpbmcgaXRzIHNpemUgdG8gemVybywgYW5kIGlkIGFuZCBtYW5hZ2VkIGFyZ3VtZW50cyB0byBudWxsLlxuXHQgKiBcblx0ICogR2VuZXJhbGx5IGEgZGVzdHJveWVkIHRleHR1cmUgaXMgbm8gbG9uZ2VyIHVzYWJsZS5cblx0ICovXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlkICYmIHRoaXMuZ2wpXG5cdFx0XHR0aGlzLmdsLmRlbGV0ZVRleHR1cmUodGhpcy5pZCk7XG5cdFx0aWYgKHRoaXMuY29udGV4dClcblx0XHRcdHRoaXMuY29udGV4dC5yZW1vdmVNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXHRcdHRoaXMud2lkdGggPSB0aGlzLmhlaWdodCA9IDA7XG5cdFx0dGhpcy5pZCA9IG51bGw7XG5cdFx0dGhpcy5tYW5hZ2VkQXJncyA9IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIHdyYXAgbW9kZSBmb3IgdGhpcyB0ZXh0dXJlOyBpZiB0aGUgc2Vjb25kIGFyZ3VtZW50XG5cdCAqIGlzIHVuZGVmaW5lZCBvciBmYWxzeSwgdGhlbiBib3RoIFMgYW5kIFQgd3JhcCB3aWxsIHVzZSB0aGUgZmlyc3Rcblx0ICogYXJndW1lbnQuXG5cdCAqXG5cdCAqIFlvdSBjYW4gdXNlIFRleHR1cmUuV3JhcCBjb25zdGFudHMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCBuZWVkaW5nIFxuXHQgKiBhIEdMIHJlZmVyZW5jZS5cblx0ICpcblx0ICogQG1ldGhvZCAgc2V0V3JhcFxuXHQgKiBAcGFyYW0ge0dMZW51bX0gcyB0aGUgUyB3cmFwIG1vZGVcblx0ICogQHBhcmFtIHtHTGVudW19IHQgdGhlIFQgd3JhcCBtb2RlXG5cdCAqIEBwYXJhbSB7Qm9vbGVhbn0gaWdub3JlQmluZCAob3B0aW9uYWwpIGlmIHRydWUsIHRoZSBiaW5kIHdpbGwgYmUgaWdub3JlZC4gXG5cdCAqL1xuXHRzZXRXcmFwOiBmdW5jdGlvbihzLCB0LCBpZ25vcmVCaW5kKSB7IC8vVE9ETzogc3VwcG9ydCBSIHdyYXAgbW9kZVxuXHRcdGlmIChzICYmIHQpIHtcblx0XHRcdHRoaXMud3JhcFMgPSBzO1xuXHRcdFx0dGhpcy53cmFwVCA9IHQ7XG5cdFx0fSBlbHNlIFxuXHRcdFx0dGhpcy53cmFwUyA9IHRoaXMud3JhcFQgPSBzO1xuXHRcdFx0XG5cdFx0aWYgKCFpZ25vcmVCaW5kKVxuXHRcdFx0dGhpcy5iaW5kKCk7XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHQgXHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX1dSQVBfUywgdGhpcy53cmFwUyk7XG5cdFx0Z2wudGV4UGFyYW1ldGVyaSh0aGlzLnRhcmdldCwgZ2wuVEVYVFVSRV9XUkFQX1QsIHRoaXMud3JhcFQpO1xuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIG1pbiBhbmQgbWFnIGZpbHRlciBmb3IgdGhpcyB0ZXh0dXJlOyBcblx0ICogaWYgbWFnIGlzIHVuZGVmaW5lZCBvciBmYWxzeSwgdGhlbiBib3RoIG1pbiBhbmQgbWFnIHdpbGwgdXNlIHRoZVxuXHQgKiBmaWx0ZXIgc3BlY2lmaWVkIGZvciBtaW4uXG5cdCAqXG5cdCAqIFlvdSBjYW4gdXNlIFRleHR1cmUuRmlsdGVyIGNvbnN0YW50cyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIG5lZWRpbmcgXG5cdCAqIGEgR0wgcmVmZXJlbmNlLlxuXHQgKiBcblx0ICogQHBhcmFtIHtHTGVudW19IG1pbiB0aGUgbWluaWZpY2F0aW9uIGZpbHRlclxuXHQgKiBAcGFyYW0ge0dMZW51bX0gbWFnIHRoZSBtYWduaWZpY2F0aW9uIGZpbHRlclxuXHQgKiBAcGFyYW0ge0Jvb2xlYW59IGlnbm9yZUJpbmQgaWYgdHJ1ZSwgdGhlIGJpbmQgd2lsbCBiZSBpZ25vcmVkLiBcblx0ICovXG5cdHNldEZpbHRlcjogZnVuY3Rpb24obWluLCBtYWcsIGlnbm9yZUJpbmQpIHsgXG5cdFx0aWYgKG1pbiAmJiBtYWcpIHtcblx0XHRcdHRoaXMubWluRmlsdGVyID0gbWluO1xuXHRcdFx0dGhpcy5tYWdGaWx0ZXIgPSBtYWc7XG5cdFx0fSBlbHNlIFxuXHRcdFx0dGhpcy5taW5GaWx0ZXIgPSB0aGlzLm1hZ0ZpbHRlciA9IG1pbjtcblx0XHRcdFxuXHRcdGlmICghaWdub3JlQmluZClcblx0XHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX01JTl9GSUxURVIsIHRoaXMubWluRmlsdGVyKTtcblx0IFx0Z2wudGV4UGFyYW1ldGVyaSh0aGlzLnRhcmdldCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCB0aGlzLm1hZ0ZpbHRlcik7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEEgbG93LWxldmVsIG1ldGhvZCB0byB1cGxvYWQgdGhlIHNwZWNpZmllZCBBcnJheUJ1ZmZlclZpZXdcblx0ICogdG8gdGhpcyB0ZXh0dXJlLiBUaGlzIHdpbGwgY2F1c2UgdGhlIHdpZHRoIGFuZCBoZWlnaHQgb2YgdGhpc1xuXHQgKiB0ZXh0dXJlIHRvIGNoYW5nZS5cblx0ICpcblx0ICogQG1ldGhvZCAgdXBsb2FkRGF0YVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoICAgICAgICAgIHRoZSBuZXcgd2lkdGggb2YgdGhpcyB0ZXh0dXJlLFxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRzIHRvIHRoZSBsYXN0IHVzZWQgd2lkdGggKG9yIHplcm8pXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0ICAgICAgICAgdGhlIG5ldyBoZWlnaHQgb2YgdGhpcyB0ZXh0dXJlXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHMgdG8gdGhlIGxhc3QgdXNlZCBoZWlnaHQgKG9yIHplcm8pXG5cdCAqIEBwYXJhbSAge0dMZW51bX0gZm9ybWF0ICAgICAgICAgdGhlIGRhdGEgZm9ybWF0LCBkZWZhdWx0IFJHQkFcblx0ICogQHBhcmFtICB7R0xlbnVtfSB0eXBlICAgICAgICAgICB0aGUgZGF0YSB0eXBlLCBkZWZhdWx0IFVOU0lHTkVEX0JZVEUgKFVpbnQ4QXJyYXkpXG5cdCAqIEBwYXJhbSAge0FycmF5QnVmZmVyVmlld30gZGF0YSAgdGhlIHJhdyBkYXRhIGZvciB0aGlzIHRleHR1cmUsIG9yIG51bGwgZm9yIGFuIGVtcHR5IGltYWdlXG5cdCAqL1xuXHR1cGxvYWREYXRhOiBmdW5jdGlvbih3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUsIGRhdGEpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy5mb3JtYXQgPSBmb3JtYXQgfHwgZ2wuUkdCQTtcblx0XHR0eXBlID0gdHlwZSB8fCBnbC5VTlNJR05FRF9CWVRFO1xuXHRcdGRhdGEgPSBkYXRhIHx8IG51bGw7IC8vbWFrZSBzdXJlIGZhbHNleSB2YWx1ZSBpcyBudWxsIGZvciB0ZXhJbWFnZTJEXG5cblx0XHR0aGlzLndpZHRoID0gKHdpZHRoIHx8IHdpZHRoPT0wKSA/IHdpZHRoIDogdGhpcy53aWR0aDtcblx0XHR0aGlzLmhlaWdodCA9IChoZWlnaHQgfHwgaGVpZ2h0PT0wKSA/IGhlaWdodCA6IHRoaXMuaGVpZ2h0O1xuXG5cdFx0dGhpcy5iaW5kKCk7XG5cblx0XHRnbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCB0aGlzLmZvcm1hdCwgXG5cdFx0XHRcdFx0ICB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgMCwgdGhpcy5mb3JtYXQsXG5cdFx0XHRcdFx0ICB0eXBlLCBkYXRhKTtcblx0fSxcblxuXHQvKipcblx0ICogVXBsb2FkcyBJbWFnZURhdGEsIEhUTUxJbWFnZUVsZW1lbnQsIEhUTUxDYW52YXNFbGVtZW50IG9yIFxuXHQgKiBIVE1MVmlkZW9FbGVtZW50LlxuXHQgKlxuXHQgKiBAbWV0aG9kICB1cGxvYWRJbWFnZVxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IGRvbU9iamVjdCB0aGUgRE9NIGltYWdlIGNvbnRhaW5lclxuXHQgKi9cblx0dXBsb2FkSW1hZ2U6IGZ1bmN0aW9uKGRvbU9iamVjdCwgZm9ybWF0LCB0eXBlKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHRoaXMuZm9ybWF0ID0gZm9ybWF0IHx8IGdsLlJHQkE7XG5cdFx0dHlwZSA9IHR5cGUgfHwgZ2wuVU5TSUdORURfQllURTtcblx0XHRcblx0XHR0aGlzLndpZHRoID0gZG9tT2JqZWN0LndpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gZG9tT2JqZWN0LmhlaWdodDtcblxuXHRcdHRoaXMuYmluZCgpO1xuXG5cdFx0Z2wudGV4SW1hZ2UyRCh0aGlzLnRhcmdldCwgMCwgdGhpcy5mb3JtYXQsIHRoaXMuZm9ybWF0LFxuXHRcdFx0XHRcdCAgdHlwZSwgZG9tT2JqZWN0KTtcblx0fSxcblxuXHQvKipcblx0ICogQmluZHMgdGhlIHRleHR1cmUuIElmIHVuaXQgaXMgc3BlY2lmaWVkLFxuXHQgKiBpdCB3aWxsIGJpbmQgdGhlIHRleHR1cmUgYXQgdGhlIGdpdmVuIHNsb3Rcblx0ICogKFRFWFRVUkUwLCBURVhUVVJFMSwgZXRjKS4gSWYgdW5pdCBpcyBub3Qgc3BlY2lmaWVkLFxuXHQgKiBpdCB3aWxsIHNpbXBseSBiaW5kIHRoZSB0ZXh0dXJlIGF0IHdoaWNoZXZlciBzbG90XG5cdCAqIGlzIGN1cnJlbnRseSBhY3RpdmUuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGJpbmRcblx0ICogQHBhcmFtICB7TnVtYmVyfSB1bml0IHRoZSB0ZXh0dXJlIHVuaXQgaW5kZXgsIHN0YXJ0aW5nIGF0IDBcblx0ICovXG5cdGJpbmQ6IGZ1bmN0aW9uKHVuaXQpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGlmICh1bml0IHx8IHVuaXQgPT09IDApXG5cdFx0XHRnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwICsgdW5pdCk7XG5cdFx0Z2wuYmluZFRleHR1cmUodGhpcy50YXJnZXQsIHRoaXMuaWQpO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5pZCArIFwiOlwiICsgdGhpcy53aWR0aCArIFwieFwiICsgdGhpcy5oZWlnaHQgKyBcIlwiO1xuXHR9XG59KTtcblxuLyoqIFxuICogQSBzZXQgb2YgRmlsdGVyIGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVFxuICogICAgIFRleHR1cmUuRmlsdGVyLk5FQVJFU1RfTUlQTUFQX0xJTkVBUlxuICogICAgIFRleHR1cmUuRmlsdGVyLk5FQVJFU1RfTUlQTUFQX05FQVJFU1RcbiAqICAgICBUZXh0dXJlLkZpbHRlci5MSU5FQVJcbiAqICAgICBUZXh0dXJlLkZpbHRlci5MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICogICAgIFRleHR1cmUuRmlsdGVyLkxJTkVBUl9NSVBNQVBfTkVBUkVTVFxuICogYGBgXG4gKiBAYXR0cmlidXRlIEZpbHRlclxuICogQHN0YXRpY1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuVGV4dHVyZS5GaWx0ZXIgPSB7XG5cdE5FQVJFU1Q6IDk3MjgsXG5cdE5FQVJFU1RfTUlQTUFQX0xJTkVBUjogOTk4Nixcblx0TkVBUkVTVF9NSVBNQVBfTkVBUkVTVDogOTk4NCxcblx0TElORUFSOiA5NzI5LFxuXHRMSU5FQVJfTUlQTUFQX0xJTkVBUjogOTk4Nyxcblx0TElORUFSX01JUE1BUF9ORUFSRVNUOiA5OTg1XG59O1xuXG4vKiogXG4gKiBBIHNldCBvZiBXcmFwIGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5XcmFwLkNMQU1QX1RPX0VER0VcbiAqICAgICBUZXh0dXJlLldyYXAuTUlSUk9SRURfUkVQRUFUXG4gKiAgICAgVGV4dHVyZS5XcmFwLlJFUEVBVFxuICogYGBgXG4gKiBAYXR0cmlidXRlIFdyYXBcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblRleHR1cmUuV3JhcCA9IHtcblx0Q0xBTVBfVE9fRURHRTogMzMwNzEsXG5cdE1JUlJPUkVEX1JFUEVBVDogMzM2NDgsXG5cdFJFUEVBVDogMTA0OTdcbn07XG5cbi8qKiBcbiAqIEEgc2V0IG9mIEZvcm1hdCBjb25zdGFudHMgdGhhdCBtYXRjaCB0aGVpciBHTCBjb3VudGVycGFydHMuXG4gKiBUaGlzIGlzIGZvciBjb252ZW5pZW5jZSwgdG8gYXZvaWQgdGhlIG5lZWQgZm9yIGEgR0wgcmVuZGVyaW5nIGNvbnRleHQuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYFxuICogICAgIFRleHR1cmUuRm9ybWF0LlJHQlxuICogICAgIFRleHR1cmUuRm9ybWF0LlJHQkFcbiAqICAgICBUZXh0dXJlLkZvcm1hdC5MVU1JTkFOQ0VfQUxQSEFcbiAqIGBgYFxuICogQGF0dHJpYnV0ZSBGb3JtYXRcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblRleHR1cmUuRm9ybWF0ID0ge1xuXHRERVBUSF9DT01QT05FTlQ6IDY0MDIsXG5cdEFMUEhBOiA2NDA2LFxuXHRSR0JBOiA2NDA4LFxuXHRSR0I6IDY0MDcsXG5cdExVTUlOQU5DRTogNjQwOSxcblx0TFVNSU5BTkNFX0FMUEhBOiA2NDEwXG59O1xuXG4vKiogXG4gKiBBIHNldCBvZiBEYXRhVHlwZSBjb25zdGFudHMgdGhhdCBtYXRjaCB0aGVpciBHTCBjb3VudGVycGFydHMuXG4gKiBUaGlzIGlzIGZvciBjb252ZW5pZW5jZSwgdG8gYXZvaWQgdGhlIG5lZWQgZm9yIGEgR0wgcmVuZGVyaW5nIGNvbnRleHQuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYFxuICogICAgIFRleHR1cmUuRGF0YVR5cGUuVU5TSUdORURfQllURSBcbiAqICAgICBUZXh0dXJlLkRhdGFUeXBlLkZMT0FUIFxuICogYGBgXG4gKiBAYXR0cmlidXRlIERhdGFUeXBlXG4gKiBAc3RhdGljXG4gKiBAdHlwZSB7T2JqZWN0fVxuICovXG5UZXh0dXJlLkRhdGFUeXBlID0ge1xuXHRCWVRFOiA1MTIwLFxuXHRTSE9SVDogNTEyMixcblx0SU5UOiA1MTI0LFxuXHRGTE9BVDogNTEyNixcblx0VU5TSUdORURfQllURTogNTEyMSxcblx0VU5TSUdORURfSU5UOiA1MTI1LFxuXHRVTlNJR05FRF9TSE9SVDogNTEyMyxcblx0VU5TSUdORURfU0hPUlRfNF80XzRfNDogMzI4MTksXG5cdFVOU0lHTkVEX1NIT1JUXzVfNV81XzE6IDMyODIwLFxuXHRVTlNJR05FRF9TSE9SVF81XzZfNTogMzM2MzVcbn1cblxuLyoqXG4gKiBUaGUgZGVmYXVsdCB3cmFwIG1vZGUgd2hlbiBjcmVhdGluZyBuZXcgdGV4dHVyZXMuIElmIGEgY3VzdG9tIFxuICogcHJvdmlkZXIgd2FzIHNwZWNpZmllZCwgaXQgbWF5IGNob29zZSB0byBvdmVycmlkZSB0aGlzIGRlZmF1bHQgbW9kZS5cbiAqIFxuICogQGF0dHJpYnV0ZSB7R0xlbnVtfSBERUZBVUxUX1dSQVBcbiAqIEBzdGF0aWMgXG4gKiBAZGVmYXVsdCAgVGV4dHVyZS5XcmFwLkNMQU1QX1RPX0VER0VcbiAqL1xuVGV4dHVyZS5ERUZBVUxUX1dSQVAgPSBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRTtcblxuXG4vKipcbiAqIFRoZSBkZWZhdWx0IGZpbHRlciBtb2RlIHdoZW4gY3JlYXRpbmcgbmV3IHRleHR1cmVzLiBJZiBhIGN1c3RvbVxuICogcHJvdmlkZXIgd2FzIHNwZWNpZmllZCwgaXQgbWF5IGNob29zZSB0byBvdmVycmlkZSB0aGlzIGRlZmF1bHQgbW9kZS5cbiAqXG4gKiBAYXR0cmlidXRlIHtHTGVudW19IERFRkFVTFRfRklMVEVSXG4gKiBAc3RhdGljXG4gKiBAZGVmYXVsdCAgVGV4dHVyZS5GaWx0ZXIuTElORUFSXG4gKi9cblRleHR1cmUuREVGQVVMVF9GSUxURVIgPSBUZXh0dXJlLkZpbHRlci5ORUFSRVNUO1xuXG4vL2RlZmF1bHQgcGl4ZWwgc3RvcmUgb3BlcmF0aW9ucy4gVXNlZCBpbiBjcmVhdGUoKVxuVGV4dHVyZS5VTlBBQ0tfRkxJUF9ZID0gZmFsc2U7XG5UZXh0dXJlLlVOUEFDS19BTElHTk1FTlQgPSAxO1xuVGV4dHVyZS5VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEEgPSB0cnVlOyBcblRleHR1cmUuVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTiA9IHVuZGVmaW5lZDtcblxuLyoqXG4gKiBVdGlsaXR5IHRvIGdldCB0aGUgbnVtYmVyIG9mIGNvbXBvbmVudHMgZm9yIHRoZSBnaXZlbiBHTGVudW0sIGUuZy4gZ2wuUkdCQSByZXR1cm5zIDQuXG4gKiBSZXR1cm5zIG51bGwgaWYgdGhlIHNwZWNpZmllZCBmb3JtYXQgaXMgbm90IG9mIHR5cGUgREVQVEhfQ09NUE9ORU5ULCBBTFBIQSwgTFVNSU5BTkNFLFxuICogTFVNSU5BTkNFX0FMUEhBLCBSR0IsIG9yIFJHQkEuXG4gKiBcbiAqIEBtZXRob2QgZ2V0TnVtQ29tcG9uZW50c1xuICogQHN0YXRpY1xuICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgYSB0ZXh0dXJlIGZvcm1hdCwgaS5lLiBUZXh0dXJlLkZvcm1hdC5SR0JBXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IHRoZSBudW1iZXIgb2YgY29tcG9uZW50cyBmb3IgdGhpcyBmb3JtYXRcbiAqL1xuVGV4dHVyZS5nZXROdW1Db21wb25lbnRzID0gZnVuY3Rpb24oZm9ybWF0KSB7XG5cdHN3aXRjaCAoZm9ybWF0KSB7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5ERVBUSF9DT01QT05FTlQ6XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5BTFBIQTpcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkxVTUlOQU5DRTpcblx0XHRcdHJldHVybiAxO1xuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuTFVNSU5BTkNFX0FMUEhBOlxuXHRcdFx0cmV0dXJuIDI7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5SR0I6XG5cdFx0XHRyZXR1cm4gMztcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LlJHQkE6XG5cdFx0XHRyZXR1cm4gNDtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn07XG5cbi8vVW5tYW5hZ2VkIHRleHR1cmVzOlxuLy9cdEhUTUwgZWxlbWVudHMgbGlrZSBJbWFnZSwgVmlkZW8sIENhbnZhc1xuLy9cdHBpeGVscyBidWZmZXIgZnJvbSBDYW52YXNcbi8vXHRwaXhlbHMgYXJyYXlcblxuLy9OZWVkIHNwZWNpYWwgaGFuZGxpbmc6XG4vLyAgY29udGV4dC5vbkNvbnRleHRMb3N0LmFkZChmdW5jdGlvbigpIHtcbi8vICBcdGNyZWF0ZUR5bmFtaWNUZXh0dXJlKCk7XG4vLyAgfS5iaW5kKHRoaXMpKTtcblxuLy9NYW5hZ2VkIHRleHR1cmVzOlxuLy9cdGltYWdlcyBzcGVjaWZpZWQgd2l0aCBhIHBhdGhcbi8vXHR0aGlzIHdpbGwgdXNlIEltYWdlIHVuZGVyIHRoZSBob29kXG5cblxubW9kdWxlLmV4cG9ydHMgPSBUZXh0dXJlOyIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgU2lnbmFsID0gcmVxdWlyZSgnc2lnbmFscycpO1xuXG4vKipcbiAqIEEgdGhpbiB3cmFwcGVyIGFyb3VuZCBXZWJHTFJlbmRlcmluZ0NvbnRleHQgd2hpY2ggaGFuZGxlc1xuICogY29udGV4dCBsb3NzIGFuZCByZXN0b3JlIHdpdGggdmFyaW91cyByZW5kZXJpbmcgb2JqZWN0cyAodGV4dHVyZXMsXG4gKiBzaGFkZXJzIGFuZCBidWZmZXJzKS4gVGhpcyBhbHNvIGhhbmRsZXMgZ2VuZXJhbCB2aWV3cG9ydCBtYW5hZ2VtZW50LlxuICpcbiAqIElmIHRoZSB2aWV3IGlzIG5vdCBzcGVjaWZpZWQsIGEgY2FudmFzIHdpbGwgYmUgY3JlYXRlZC5cbiAqIFxuICogQGNsYXNzICBXZWJHTENvbnRleHRcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtOdW1iZXJ9IHdpZHRoIHRoZSB3aWR0aCBvZiB0aGUgR0wgY2FudmFzXG4gKiBAcGFyYW0ge051bWJlcn0gaGVpZ2h0IHRoZSBoZWlnaHQgb2YgdGhlIEdMIGNhbnZhc1xuICogQHBhcmFtIHtIVE1MQ2FudmFzRWxlbWVudH0gdmlldyB0aGUgb3B0aW9uYWwgRE9NIGNhbnZhcyBlbGVtZW50XG4gKiBAcGFyYW0ge09iamVjdH0gY29udGV4dEF0dHJpYnVldHMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgY29udGV4dCBhdHRyaWJzIHdoaWNoXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lsbCBiZSB1c2VkIGR1cmluZyBHTCBpbml0aWFsaXphdGlvblxuICovXG52YXIgV2ViR0xDb250ZXh0ID0gbmV3IENsYXNzKHtcblx0XG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFdlYkdMQ29udGV4dCh3aWR0aCwgaGVpZ2h0LCB2aWV3LCBjb250ZXh0QXR0cmlidXRlcykge1xuXHRcdC8qKlxuXHRcdCAqIFRoZSBsaXN0IG9mIHJlbmRlcmluZyBvYmplY3RzIChzaGFkZXJzLCBWQk9zLCB0ZXh0dXJlcywgZXRjKSB3aGljaCBhcmUgXG5cdFx0ICogY3VycmVudGx5IGJlaW5nIG1hbmFnZWQuIEFueSBvYmplY3Qgd2l0aCBhIFwiY3JlYXRlXCIgbWV0aG9kIGNhbiBiZSBhZGRlZFxuXHRcdCAqIHRvIHRoaXMgbGlzdC4gVXBvbiBkZXN0cm95aW5nIHRoZSByZW5kZXJpbmcgb2JqZWN0LCBpdCBzaG91bGQgYmUgcmVtb3ZlZC5cblx0XHQgKiBTZWUgYWRkTWFuYWdlZE9iamVjdCBhbmQgcmVtb3ZlTWFuYWdlZE9iamVjdC5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkge0FycmF5fSBtYW5hZ2VkT2JqZWN0c1xuXHRcdCAqL1xuXHRcdHRoaXMubWFuYWdlZE9iamVjdHMgPSBbXTtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBhY3R1YWwgR0wgY29udGV4dC4gWW91IGNhbiB1c2UgdGhpcyBmb3Jcblx0XHQgKiByYXcgR0wgY2FsbHMgb3IgdG8gYWNjZXNzIEdMZW51bSBjb25zdGFudHMuIFRoaXNcblx0XHQgKiB3aWxsIGJlIHVwZGF0ZWQgb24gY29udGV4dCByZXN0b3JlLiBXaGlsZSB0aGUgV2ViR0xDb250ZXh0XG5cdFx0ICogaXMgbm90IGB2YWxpZGAsIHlvdSBzaG91bGQgbm90IHRyeSB0byBhY2Nlc3MgR0wgc3RhdGUuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IGdsXG5cdFx0ICogQHR5cGUge1dlYkdMUmVuZGVyaW5nQ29udGV4dH1cblx0XHQgKi9cblx0XHR0aGlzLmdsID0gbnVsbDtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBjYW52YXMgRE9NIGVsZW1lbnQgZm9yIHRoaXMgY29udGV4dC5cblx0XHQgKiBAcHJvcGVydHkge051bWJlcn0gdmlld1xuXHRcdCAqL1xuXHRcdHRoaXMudmlldyA9IHZpZXcgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcblxuXHRcdC8vZGVmYXVsdCBzaXplIGFzIHBlciBzcGVjOlxuXHRcdC8vaHR0cDovL3d3dy53My5vcmcvVFIvMjAxMi9XRC1odG1sNS1hdXRob3ItMjAxMjAzMjkvdGhlLWNhbnZhcy1lbGVtZW50Lmh0bWwjdGhlLWNhbnZhcy1lbGVtZW50XG5cdFx0XG5cdFx0LyoqXG5cdFx0ICogVGhlIHdpZHRoIG9mIHRoaXMgY2FudmFzLlxuXHRcdCAqXG5cdFx0ICogQHByb3BlcnR5IHdpZHRoXG5cdFx0ICogQHR5cGUge051bWJlcn1cblx0XHQgKi9cblx0XHR0aGlzLndpZHRoID0gdGhpcy52aWV3LndpZHRoID0gd2lkdGggfHwgMzAwO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIGhlaWdodCBvZiB0aGlzIGNhbnZhcy5cblx0XHQgKiBAcHJvcGVydHkgaGVpZ2h0XG5cdFx0ICogQHR5cGUge051bWJlcn1cblx0XHQgKi9cblx0XHR0aGlzLmhlaWdodCA9IHRoaXMudmlldy5oZWlnaHQgPSBoZWlnaHQgfHwgMTUwO1xuXG5cblx0XHQvKipcblx0XHQgKiBUaGUgY29udGV4dCBhdHRyaWJ1dGVzIGZvciBpbml0aWFsaXppbmcgdGhlIEdMIHN0YXRlLiBUaGlzIG1pZ2h0IGluY2x1ZGVcblx0XHQgKiBhbnRpLWFsaWFzaW5nLCBhbHBoYSBzZXR0aW5ncywgdmVyaXNvbiwgYW5kIHNvIGZvcnRoLlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb250ZXh0QXR0cmlidXRlcyBcblx0XHQgKi9cblx0XHR0aGlzLmNvbnRleHRBdHRyaWJ1dGVzID0gY29udGV4dEF0dHJpYnV0ZXM7XG5cdFx0XG5cdFx0LyoqXG5cdFx0ICogV2hldGhlciB0aGlzIGNvbnRleHQgaXMgJ3ZhbGlkJywgaS5lLiByZW5kZXJhYmxlLiBBIGNvbnRleHQgdGhhdCBoYXMgYmVlbiBsb3N0XG5cdFx0ICogKGFuZCBub3QgeWV0IHJlc3RvcmVkKSBpcyBpbnZhbGlkLlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gdmFsaWRcblx0XHQgKi9cblx0XHR0aGlzLnZhbGlkID0gZmFsc2U7XG5cblx0XHQvKipcblx0XHQgKiBBIHNpZ25hbCBkaXNwYXRjaGVkIHdoZW4gR0wgY29udGV4dCBpcyBsb3N0LiBcblx0XHQgKiBcblx0XHQgKiBUaGUgZmlyc3QgYXJndW1lbnQgcGFzc2VkIHRvIHRoZSBsaXN0ZW5lciBpcyB0aGUgV2ViR0xDb250ZXh0XG5cdFx0ICogbWFuYWdpbmcgdGhlIGNvbnRleHQgbG9zcy5cblx0XHQgKiBcblx0XHQgKiBAZXZlbnQge1NpZ25hbH0gbG9zdFxuXHRcdCAqL1xuXHRcdHRoaXMubG9zdCA9IG5ldyBTaWduYWwoKTtcblxuXHRcdC8qKlxuXHRcdCAqIEEgc2lnbmFsIGRpc3BhdGNoZWQgd2hlbiBHTCBjb250ZXh0IGlzIHJlc3RvcmVkLCBhZnRlciBhbGwgdGhlIG1hbmFnZWRcblx0XHQgKiBvYmplY3RzIGhhdmUgYmVlbiByZWNyZWF0ZWQuXG5cdFx0ICpcblx0XHQgKiBUaGUgZmlyc3QgYXJndW1lbnQgcGFzc2VkIHRvIHRoZSBsaXN0ZW5lciBpcyB0aGUgV2ViR0xDb250ZXh0XG5cdFx0ICogd2hpY2ggbWFuYWdlZCB0aGUgcmVzdG9yYXRpb24uXG5cdFx0ICpcblx0XHQgKiBUaGlzIGRvZXMgbm90IGdhdXJlbnRlZSB0aGF0IGFsbCBvYmplY3RzIHdpbGwgYmUgcmVuZGVyYWJsZS5cblx0XHQgKiBGb3IgZXhhbXBsZSwgYSBUZXh0dXJlIHdpdGggYW4gSW1hZ2VQcm92aWRlciBtYXkgc3RpbGwgYmUgbG9hZGluZ1xuXHRcdCAqIGFzeW5jaHJvbm91c2x5Llx0IFxuXHRcdCAqIFxuXHRcdCAqIEBldmVudCB7U2lnbmFsfSByZXN0b3JlZFxuXHRcdCAqL1xuXHRcdHRoaXMucmVzdG9yZWQgPSBuZXcgU2lnbmFsKCk7XHRcblx0XHRcblx0XHQvL3NldHVwIGNvbnRleHQgbG9zdCBhbmQgcmVzdG9yZSBsaXN0ZW5lcnNcblx0XHR0aGlzLnZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmdsY29udGV4dGxvc3RcIiwgZnVuY3Rpb24gKGV2KSB7XG5cdFx0XHRldi5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5fY29udGV4dExvc3QoZXYpO1xuXHRcdH0uYmluZCh0aGlzKSk7XG5cdFx0dGhpcy52aWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJ3ZWJnbGNvbnRleHRyZXN0b3JlZFwiLCBmdW5jdGlvbiAoZXYpIHtcblx0XHRcdGV2LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLl9jb250ZXh0UmVzdG9yZWQoZXYpO1xuXHRcdH0uYmluZCh0aGlzKSk7XG5cdFx0XHRcblx0XHR0aGlzLl9pbml0Q29udGV4dCgpO1xuXG5cdFx0dGhpcy5yZXNpemUodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuXHR9LFxuXG5cdF9pbml0Q29udGV4dDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGVyciA9IFwiXCI7XG5cdFx0dGhpcy52YWxpZCA9IGZhbHNlO1xuXG5cdFx0dHJ5IHtcblx0ICAgICAgICB0aGlzLmdsID0gKHRoaXMudmlldy5nZXRDb250ZXh0KCd3ZWJnbCcsIHRoaXMuY29udGV4dEF0dHJpYnV0ZXMpIFxuXHQgICAgICAgIFx0XHRcdHx8IHRoaXMudmlldy5nZXRDb250ZXh0KCdleHBlcmltZW50YWwtd2ViZ2wnLCB0aGlzLmNvbnRleHRBdHRyaWJ1dGVzKSk7XG5cdCAgICB9IGNhdGNoIChlKSB7XG5cdCAgICBcdHRoaXMuZ2wgPSBudWxsO1xuXHQgICAgfVxuXG5cdFx0aWYgKHRoaXMuZ2wpIHtcblx0XHRcdHRoaXMudmFsaWQgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBcIldlYkdMIENvbnRleHQgTm90IFN1cHBvcnRlZCAtLSB0cnkgZW5hYmxpbmcgaXQgb3IgdXNpbmcgYSBkaWZmZXJlbnQgYnJvd3NlclwiO1xuXHRcdH1cdFxuXHR9LFxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IG9mIHRoaXMgV2ViR0wgY29udGV4dCwgcmVzaXplc1xuXHQgKiB0aGUgY2FudmFzIHZpZXcsIGFuZCBjYWxscyBnbC52aWV3cG9ydCgpIHdpdGggdGhlIG5ldyBzaXplLlxuXHQgKiBcblx0ICogQHBhcmFtICB7TnVtYmVyfSB3aWR0aCAgdGhlIG5ldyB3aWR0aFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCB0aGUgbmV3IGhlaWdodFxuXHQgKi9cblx0cmVzaXplOiBmdW5jdGlvbih3aWR0aCwgaGVpZ2h0KSB7XG5cdFx0dGhpcy53aWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG5cdFx0dGhpcy52aWV3LndpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy52aWV3LmhlaWdodCA9IGhlaWdodDtcblxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0Z2wudmlld3BvcnQoMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiAoaW50ZXJuYWwgdXNlKVxuXHQgKiBBIG1hbmFnZWQgb2JqZWN0IGlzIGFueXRoaW5nIHdpdGggYSBcImNyZWF0ZVwiIGZ1bmN0aW9uLCB0aGF0IHdpbGxcblx0ICogcmVzdG9yZSBHTCBzdGF0ZSBhZnRlciBjb250ZXh0IGxvc3MuIFxuXHQgKiBcblx0ICogQHBhcmFtIHtbdHlwZV19IHRleCBbZGVzY3JpcHRpb25dXG5cdCAqL1xuXHRhZGRNYW5hZ2VkT2JqZWN0OiBmdW5jdGlvbihvYmopIHtcblx0XHR0aGlzLm1hbmFnZWRPYmplY3RzLnB1c2gob2JqKTtcblx0fSxcblxuXHQvKipcblx0ICogKGludGVybmFsIHVzZSlcblx0ICogUmVtb3ZlcyBhIG1hbmFnZWQgb2JqZWN0IGZyb20gdGhlIGNhY2hlLiBUaGlzIGlzIHVzZWZ1bCB0byBkZXN0cm95XG5cdCAqIGEgdGV4dHVyZSBvciBzaGFkZXIsIGFuZCBoYXZlIGl0IG5vIGxvbmdlciByZS1sb2FkIG9uIGNvbnRleHQgcmVzdG9yZS5cblx0ICpcblx0ICogUmV0dXJucyB0aGUgb2JqZWN0IHRoYXQgd2FzIHJlbW92ZWQsIG9yIG51bGwgaWYgaXQgd2FzIG5vdCBmb3VuZCBpbiB0aGUgY2FjaGUuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9iaiB0aGUgb2JqZWN0IHRvIGJlIG1hbmFnZWRcblx0ICogQHJldHVybiB7T2JqZWN0fSAgICAgdGhlIHJlbW92ZWQgb2JqZWN0LCBvciBudWxsXG5cdCAqL1xuXHRyZW1vdmVNYW5hZ2VkT2JqZWN0OiBmdW5jdGlvbihvYmopIHtcblx0XHR2YXIgaWR4ID0gdGhpcy5tYW5hZ2VkT2JqZWN0cy5pbmRleE9mKG9iaik7XG5cdFx0aWYgKGlkeCA+IC0xKSB7XG5cdFx0XHR0aGlzLm1hbmFnZWRPYmplY3RzLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9IFxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdF9jb250ZXh0TG9zdDogZnVuY3Rpb24oZXYpIHtcblx0XHQvL2FsbCB0ZXh0dXJlcy9zaGFkZXJzL2J1ZmZlcnMvRkJPcyBoYXZlIGJlZW4gZGVsZXRlZC4uLiBcblx0XHQvL3dlIG5lZWQgdG8gcmUtY3JlYXRlIHRoZW0gb24gcmVzdG9yZVxuXHRcdHRoaXMudmFsaWQgPSBmYWxzZTtcblxuXHRcdHRoaXMubG9zdC5kaXNwYXRjaCh0aGlzKTtcblx0fSxcblxuXHRfY29udGV4dFJlc3RvcmVkOiBmdW5jdGlvbihldikge1xuXHRcdC8vSWYgYW4gYXNzZXQgbWFuYWdlciBpcyBhdHRhY2hlZCB0byB0aGlzXG5cdFx0Ly9jb250ZXh0LCB3ZSBuZWVkIHRvIGludmFsaWRhdGUgaXQgYW5kIHJlLWxvYWQgXG5cdFx0Ly90aGUgYXNzZXRzLlxuXHRcdGlmICh0aGlzLmFzc2V0TWFuYWdlcikge1xuXHRcdFx0dGhpcy5hc3NldE1hbmFnZXIuaW52YWxpZGF0ZSgpO1xuXHRcdH1cblxuXHRcdC8vZmlyc3QsIGluaXRpYWxpemUgdGhlIEdMIGNvbnRleHQgYWdhaW5cblx0XHR0aGlzLl9pbml0Q29udGV4dCgpO1xuXG5cdFx0Ly9ub3cgd2UgcmVjcmVhdGUgb3VyIHNoYWRlcnMgYW5kIHRleHR1cmVzXG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMubWFuYWdlZE9iamVjdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMubWFuYWdlZE9iamVjdHNbaV0uY3JlYXRlKCk7XG5cdFx0fVxuXG5cdFx0Ly91cGRhdGUgR0wgdmlld3BvcnRcblx0XHR0aGlzLnJlc2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG5cblx0XHR0aGlzLnJlc3RvcmVkLmRpc3BhdGNoKHRoaXMpO1xuXHR9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXZWJHTENvbnRleHQ7IiwiLyoqXG4gKiBAbW9kdWxlIGthbWlcbiAqL1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcblxuLy9UT0RPOiBkZWNvdXBsZSBpbnRvIFZCTyArIElCTyB1dGlsaXRpZXMgXG4vKipcbiAqIEEgbWVzaCBjbGFzcyB0aGF0IHdyYXBzIFZCTyBhbmQgSUJPLlxuICpcbiAqIEBjbGFzcyAgTWVzaFxuICovXG52YXIgTWVzaCA9IG5ldyBDbGFzcyh7XG5cblxuXHQvKipcblx0ICogQSB3cml0ZS1vbmx5IHByb3BlcnR5IHdoaWNoIHNldHMgYm90aCB2ZXJ0aWNlcyBhbmQgaW5kaWNlcyBcblx0ICogZmxhZyB0byBkaXJ0eSBvciBub3QuIFxuXHQgKlxuXHQgKiBAcHJvcGVydHkgZGlydHlcblx0ICogQHR5cGUge0Jvb2xlYW59XG5cdCAqIEB3cml0ZU9ubHlcblx0ICovXG5cdGRpcnR5OiB7XG5cdFx0c2V0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRcdHRoaXMudmVydGljZXNEaXJ0eSA9IHZhbDtcblx0XHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gdmFsO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBNZXNoIHdpdGggdGhlIHByb3ZpZGVkIHBhcmFtZXRlcnMuXG5cdCAqXG5cdCAqIElmIG51bUluZGljZXMgaXMgMCBvciBmYWxzeSwgbm8gaW5kZXggYnVmZmVyIHdpbGwgYmUgdXNlZFxuXHQgKiBhbmQgaW5kaWNlcyB3aWxsIGJlIGFuIGVtcHR5IEFycmF5QnVmZmVyIGFuZCBhIG51bGwgaW5kZXhCdWZmZXIuXG5cdCAqIFxuXHQgKiBJZiBpc1N0YXRpYyBpcyB0cnVlLCB0aGVuIHZlcnRleFVzYWdlIGFuZCBpbmRleFVzYWdlIHdpbGxcblx0ICogYmUgc2V0IHRvIGdsLlNUQVRJQ19EUkFXLiBPdGhlcndpc2UgdGhleSB3aWxsIHVzZSBnbC5EWU5BTUlDX0RSQVcuXG5cdCAqIFlvdSBtYXkgd2FudCB0byBhZGp1c3QgdGhlc2UgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gZm9yIGZ1cnRoZXIgY29udHJvbC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1dlYkdMQ29udGV4dH0gIGNvbnRleHQgdGhlIGNvbnRleHQgZm9yIG1hbmFnZW1lbnRcblx0ICogQHBhcmFtICB7Qm9vbGVhbn0gaXNTdGF0aWMgICAgICBhIGhpbnQgYXMgdG8gd2hldGhlciB0aGlzIGdlb21ldHJ5IGlzIHN0YXRpY1xuXHQgKiBAcGFyYW0gIHtbdHlwZV19ICBudW1WZXJ0cyAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSAgbnVtSW5kaWNlcyAgICBbZGVzY3JpcHRpb25dXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gIHZlcnRleEF0dHJpYnMgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcmV0dXJuIHtbdHlwZV19ICAgICAgICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIE1lc2goY29udGV4dCwgaXNTdGF0aWMsIG51bVZlcnRzLCBudW1JbmRpY2VzLCB2ZXJ0ZXhBdHRyaWJzKSB7XG5cdFx0aWYgKCFjb250ZXh0KVxuXHRcdFx0dGhyb3cgXCJHTCBjb250ZXh0IG5vdCBzcGVjaWZpZWRcIjtcblx0XHRpZiAoIW51bVZlcnRzKVxuXHRcdFx0dGhyb3cgXCJudW1WZXJ0cyBub3Qgc3BlY2lmaWVkLCBtdXN0IGJlID4gMFwiO1xuXG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLmdsID0gY29udGV4dC5nbDtcblx0XHRcblx0XHR0aGlzLm51bVZlcnRzID0gbnVsbDtcblx0XHR0aGlzLm51bUluZGljZXMgPSBudWxsO1xuXHRcdFxuXHRcdHRoaXMudmVydGljZXMgPSBudWxsO1xuXHRcdHRoaXMuaW5kaWNlcyA9IG51bGw7XG5cdFx0dGhpcy52ZXJ0ZXhCdWZmZXIgPSBudWxsO1xuXHRcdHRoaXMuaW5kZXhCdWZmZXIgPSBudWxsO1xuXG5cdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLmluZGljZXNEaXJ0eSA9IHRydWU7XG5cdFx0dGhpcy5pbmRleFVzYWdlID0gbnVsbDtcblx0XHR0aGlzLnZlcnRleFVzYWdlID0gbnVsbDtcblxuXHRcdC8qKiBcblx0XHQgKiBAcHJvcGVydHlcblx0XHQgKiBAcHJpdmF0ZVxuXHRcdCAqL1xuXHRcdHRoaXMuX3ZlcnRleEF0dHJpYnMgPSBudWxsO1xuXG5cdFx0LyoqIFxuXHRcdCAqIEBwcm9wZXJ0eVxuXHRcdCAqIEBwcml2YXRlXG5cdFx0ICovXG5cdFx0dGhpcy5fdmVydGV4U3RyaWRlID0gbnVsbDtcblxuXHRcdHRoaXMubnVtVmVydHMgPSBudW1WZXJ0cztcblx0XHR0aGlzLm51bUluZGljZXMgPSBudW1JbmRpY2VzIHx8IDA7XG5cdFx0dGhpcy52ZXJ0ZXhVc2FnZSA9IGlzU3RhdGljID8gdGhpcy5nbC5TVEFUSUNfRFJBVyA6IHRoaXMuZ2wuRFlOQU1JQ19EUkFXO1xuXHRcdHRoaXMuaW5kZXhVc2FnZSAgPSBpc1N0YXRpYyA/IHRoaXMuZ2wuU1RBVElDX0RSQVcgOiB0aGlzLmdsLkRZTkFNSUNfRFJBVztcblx0XHR0aGlzLl92ZXJ0ZXhBdHRyaWJzID0gdmVydGV4QXR0cmlicyB8fCBbXTtcblx0XHRcblx0XHR0aGlzLmluZGljZXNEaXJ0eSA9IHRydWU7XG5cdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gdHJ1ZTtcblxuXHRcdC8vZGV0ZXJtaW5lIHRoZSB2ZXJ0ZXggc3RyaWRlIGJhc2VkIG9uIGdpdmVuIGF0dHJpYnV0ZXNcblx0XHR2YXIgdG90YWxOdW1Db21wb25lbnRzID0gMDtcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5fdmVydGV4QXR0cmlicy5sZW5ndGg7IGkrKylcblx0XHRcdHRvdGFsTnVtQ29tcG9uZW50cyArPSB0aGlzLl92ZXJ0ZXhBdHRyaWJzW2ldLm9mZnNldENvdW50O1xuXHRcdHRoaXMuX3ZlcnRleFN0cmlkZSA9IHRvdGFsTnVtQ29tcG9uZW50cyAqIDQ7IC8vIGluIGJ5dGVzXG5cblx0XHR0aGlzLnZlcnRpY2VzID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLm51bVZlcnRzKTtcblx0XHR0aGlzLmluZGljZXMgPSBuZXcgVWludDE2QXJyYXkodGhpcy5udW1JbmRpY2VzKTtcblxuXHRcdC8vYWRkIHRoaXMgVkJPIHRvIHRoZSBtYW5hZ2VkIGNhY2hlXG5cdFx0dGhpcy5jb250ZXh0LmFkZE1hbmFnZWRPYmplY3QodGhpcyk7XG5cblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9LFxuXG5cdC8vcmVjcmVhdGVzIHRoZSBidWZmZXJzIG9uIGNvbnRleHQgbG9zc1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR0aGlzLnZlcnRleEJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xuXG5cdFx0Ly9pZ25vcmUgaW5kZXggYnVmZmVyIGlmIHdlIGhhdmVuJ3Qgc3BlY2lmaWVkIGFueVxuXHRcdHRoaXMuaW5kZXhCdWZmZXIgPSB0aGlzLm51bUluZGljZXMgPiAwXG5cdFx0XHRcdFx0PyBnbC5jcmVhdGVCdWZmZXIoKVxuXHRcdFx0XHRcdDogbnVsbDtcblxuXHRcdHRoaXMuZGlydHkgPSB0cnVlO1xuXHR9LFxuXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMudmVydGljZXMgPSBbXTtcblx0XHR0aGlzLmluZGljZXMgPSBbXTtcblx0XHRpZiAodGhpcy52ZXJ0ZXhCdWZmZXIpXG5cdFx0XHR0aGlzLmdsLmRlbGV0ZUJ1ZmZlcih0aGlzLnZlcnRleEJ1ZmZlcik7XG5cdFx0aWYgKHRoaXMuaW5kZXhCdWZmZXIpXG5cdFx0XHR0aGlzLmdsLmRlbGV0ZUJ1ZmZlcih0aGlzLmluZGV4QnVmZmVyKTtcblx0XHR0aGlzLnZlcnRleEJ1ZmZlciA9IG51bGw7XG5cdFx0dGhpcy5pbmRleEJ1ZmZlciA9IG51bGw7XG5cdFx0aWYgKHRoaXMuY29udGV4dClcblx0XHRcdHRoaXMuY29udGV4dC5yZW1vdmVNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXHR9LFxuXG5cdF91cGRhdGVCdWZmZXJzOiBmdW5jdGlvbihpZ25vcmVCaW5kLCBzdWJEYXRhTGVuZ3RoKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdC8vYmluZCBvdXIgaW5kZXggZGF0YSwgaWYgd2UgaGF2ZSBhbnlcblx0XHRpZiAodGhpcy5udW1JbmRpY2VzID4gMCkge1xuXHRcdFx0aWYgKCFpZ25vcmVCaW5kKVxuXHRcdFx0XHRnbC5iaW5kQnVmZmVyKGdsLkVMRU1FTlRfQVJSQVlfQlVGRkVSLCB0aGlzLmluZGV4QnVmZmVyKTtcblxuXHRcdFx0Ly91cGRhdGUgdGhlIGluZGV4IGRhdGFcblx0XHRcdGlmICh0aGlzLmluZGljZXNEaXJ0eSkge1xuXHRcdFx0XHRnbC5idWZmZXJEYXRhKGdsLkVMRU1FTlRfQVJSQVlfQlVGRkVSLCB0aGlzLmluZGljZXMsIHRoaXMuaW5kZXhVc2FnZSk7XG5cdFx0XHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly9iaW5kIG91ciB2ZXJ0ZXggZGF0YVxuXHRcdGlmICghaWdub3JlQmluZClcblx0XHRcdGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCB0aGlzLnZlcnRleEJ1ZmZlcik7XG5cblx0XHQvL3VwZGF0ZSBvdXIgdmVydGV4IGRhdGFcblx0XHRpZiAodGhpcy52ZXJ0aWNlc0RpcnR5KSB7XG5cdFx0XHRpZiAoc3ViRGF0YUxlbmd0aCkge1xuXHRcdFx0XHQvLyBUT0RPOiBXaGVuIGRlY291cGxpbmcgVkJPL0lCTyBiZSBzdXJlIHRvIGdpdmUgYmV0dGVyIHN1YkRhdGEgc3VwcG9ydC4uXG5cdFx0XHRcdHZhciB2aWV3ID0gdGhpcy52ZXJ0aWNlcy5zdWJhcnJheSgwLCBzdWJEYXRhTGVuZ3RoKTtcblx0XHRcdFx0Z2wuYnVmZmVyU3ViRGF0YShnbC5BUlJBWV9CVUZGRVIsIDAsIHZpZXcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIHRoaXMudmVydGljZXMsIHRoaXMudmVydGV4VXNhZ2UpO1x0XG5cdFx0XHR9XG5cblx0XHRcdFxuXHRcdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gZmFsc2U7XG5cdFx0fVxuXHR9LFxuXG5cdGRyYXc6IGZ1bmN0aW9uKHByaW1pdGl2ZVR5cGUsIGNvdW50LCBvZmZzZXQsIHN1YkRhdGFMZW5ndGgpIHtcblx0XHRpZiAoY291bnQgPT09IDApXG5cdFx0XHRyZXR1cm47XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdFxuXHRcdG9mZnNldCA9IG9mZnNldCB8fCAwO1xuXG5cdFx0Ly9iaW5kcyBhbmQgdXBkYXRlcyBvdXIgYnVmZmVycy4gcGFzcyBpZ25vcmVCaW5kIGFzIHRydWVcblx0XHQvL3RvIGF2b2lkIGJpbmRpbmcgdW5uZWNlc3NhcmlseVxuXHRcdHRoaXMuX3VwZGF0ZUJ1ZmZlcnModHJ1ZSwgc3ViRGF0YUxlbmd0aCk7XG5cblx0XHRpZiAodGhpcy5udW1JbmRpY2VzID4gMCkgeyBcblx0XHRcdGdsLmRyYXdFbGVtZW50cyhwcmltaXRpdmVUeXBlLCBjb3VudCwgXG5cdFx0XHRcdFx0XHRnbC5VTlNJR05FRF9TSE9SVCwgb2Zmc2V0ICogMik7IC8vKiBVaW50MTZBcnJheS5CWVRFU19QRVJfRUxFTUVOVFxuXHRcdH0gZWxzZVxuXHRcdFx0Z2wuZHJhd0FycmF5cyhwcmltaXRpdmVUeXBlLCBvZmZzZXQsIGNvdW50KTtcblx0fSxcblxuXHQvL2JpbmRzIHRoaXMgbWVzaCdzIHZlcnRleCBhdHRyaWJ1dGVzIGZvciB0aGUgZ2l2ZW4gc2hhZGVyXG5cdGJpbmQ6IGZ1bmN0aW9uKHNoYWRlcikge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR2YXIgb2Zmc2V0ID0gMDtcblx0XHR2YXIgc3RyaWRlID0gdGhpcy5fdmVydGV4U3RyaWRlO1xuXG5cdFx0Ly9iaW5kIGFuZCB1cGRhdGUgb3VyIHZlcnRleCBkYXRhIGJlZm9yZSBiaW5kaW5nIGF0dHJpYnV0ZXNcblx0XHR0aGlzLl91cGRhdGVCdWZmZXJzKCk7XG5cblx0XHQvL2ZvciBlYWNoIGF0dHJpYnR1ZVxuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLl92ZXJ0ZXhBdHRyaWJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgYSA9IHRoaXMuX3ZlcnRleEF0dHJpYnNbaV07XG5cblx0XHRcdC8vbG9jYXRpb24gb2YgdGhlIGF0dHJpYnV0ZVxuXHRcdFx0dmFyIGxvYyA9IGEubG9jYXRpb24gPT09IG51bGwgXG5cdFx0XHRcdFx0PyBzaGFkZXIuZ2V0QXR0cmlidXRlTG9jYXRpb24oYS5uYW1lKVxuXHRcdFx0XHRcdDogYS5sb2NhdGlvbjtcblxuXHRcdFx0Ly9UT0RPOiBXZSBtYXkgd2FudCB0byBza2lwIHVuZm91bmQgYXR0cmlic1xuXHRcdFx0Ly8gaWYgKGxvYyE9PTAgJiYgIWxvYylcblx0XHRcdC8vIFx0Y29uc29sZS53YXJuKFwiV0FSTjpcIiwgYS5uYW1lLCBcImlzIG5vdCBlbmFibGVkXCIpO1xuXG5cdFx0XHQvL2ZpcnN0LCBlbmFibGUgdGhlIHZlcnRleCBhcnJheVxuXHRcdFx0Z2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkobG9jKTtcblxuXHRcdFx0Ly90aGVuIHNwZWNpZnkgb3VyIHZlcnRleCBmb3JtYXRcblx0XHRcdGdsLnZlcnRleEF0dHJpYlBvaW50ZXIobG9jLCBhLm51bUNvbXBvbmVudHMsIGEudHlwZSB8fCBnbC5GTE9BVCwgXG5cdFx0XHRcdFx0XHRcdFx0ICAgYS5ub3JtYWxpemUsIHN0cmlkZSwgb2Zmc2V0KTtcblxuXHRcdFx0Ly9hbmQgaW5jcmVhc2UgdGhlIG9mZnNldC4uLlxuXHRcdFx0b2Zmc2V0ICs9IGEub2Zmc2V0Q291bnQgKiA0OyAvL2luIGJ5dGVzXG5cdFx0fVxuXHR9LFxuXG5cdHVuYmluZDogZnVuY3Rpb24oc2hhZGVyKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdC8vZm9yIGVhY2ggYXR0cmlidHVlXG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMuX3ZlcnRleEF0dHJpYnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhciBhID0gdGhpcy5fdmVydGV4QXR0cmlic1tpXTtcblxuXHRcdFx0Ly9sb2NhdGlvbiBvZiB0aGUgYXR0cmlidXRlXG5cdFx0XHR2YXIgbG9jID0gYS5sb2NhdGlvbiA9PT0gbnVsbCBcblx0XHRcdFx0XHQ/IHNoYWRlci5nZXRBdHRyaWJ1dGVMb2NhdGlvbihhLm5hbWUpXG5cdFx0XHRcdFx0OiBhLmxvY2F0aW9uO1xuXG5cdFx0XHQvL2ZpcnN0LCBlbmFibGUgdGhlIHZlcnRleCBhcnJheVxuXHRcdFx0Z2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KGxvYyk7XG5cdFx0fVxuXHR9XG59KTtcblxuTWVzaC5BdHRyaWIgPSBuZXcgQ2xhc3Moe1xuXG5cdG5hbWU6IG51bGwsXG5cdG51bUNvbXBvbmVudHM6IG51bGwsXG5cdGxvY2F0aW9uOiBudWxsLFxuXHR0eXBlOiBudWxsLFxuXG5cdC8qKlxuXHQgKiBMb2NhdGlvbiBpcyBvcHRpb25hbCBhbmQgZm9yIGFkdmFuY2VkIHVzZXJzIHRoYXRcblx0ICogd2FudCB2ZXJ0ZXggYXJyYXlzIHRvIG1hdGNoIGFjcm9zcyBzaGFkZXJzLiBBbnkgbm9uLW51bWVyaWNhbFxuXHQgKiB2YWx1ZSB3aWxsIGJlIGNvbnZlcnRlZCB0byBudWxsLCBhbmQgaWdub3JlZC4gSWYgYSBudW1lcmljYWxcblx0ICogdmFsdWUgaXMgZ2l2ZW4sIGl0IHdpbGwgb3ZlcnJpZGUgdGhlIHBvc2l0aW9uIG9mIHRoaXMgYXR0cmlidXRlXG5cdCAqIHdoZW4gZ2l2ZW4gdG8gYSBtZXNoLlxuXHQgKiBcblx0ICogQHBhcmFtICB7W3R5cGVdfSBuYW1lICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSBudW1Db21wb25lbnRzIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSBsb2NhdGlvbiAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgICAgICAgIFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKG5hbWUsIG51bUNvbXBvbmVudHMsIGxvY2F0aW9uLCB0eXBlLCBub3JtYWxpemUsIG9mZnNldENvdW50KSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLm51bUNvbXBvbmVudHMgPSBudW1Db21wb25lbnRzO1xuXHRcdHRoaXMubG9jYXRpb24gPSB0eXBlb2YgbG9jYXRpb24gPT09IFwibnVtYmVyXCIgPyBsb2NhdGlvbiA6IG51bGw7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHR0aGlzLm5vcm1hbGl6ZSA9IEJvb2xlYW4obm9ybWFsaXplKTtcblx0XHR0aGlzLm9mZnNldENvdW50ID0gdHlwZW9mIG9mZnNldENvdW50ID09PSBcIm51bWJlclwiID8gb2Zmc2V0Q291bnQgOiB0aGlzLm51bUNvbXBvbmVudHM7XG5cdH1cbn0pXG5cblxubW9kdWxlLmV4cG9ydHMgPSBNZXNoOyIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG5cbnZhciBTaGFkZXJQcm9ncmFtID0gbmV3IENsYXNzKHtcblx0XG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFNoYWRlclByb2dyYW0oY29udGV4dCwgdmVydFNvdXJjZSwgZnJhZ1NvdXJjZSwgYXR0cmlidXRlTG9jYXRpb25zKSB7XG5cdFx0aWYgKCF2ZXJ0U291cmNlIHx8ICFmcmFnU291cmNlKVxuXHRcdFx0dGhyb3cgXCJ2ZXJ0ZXggYW5kIGZyYWdtZW50IHNoYWRlcnMgbXVzdCBiZSBkZWZpbmVkXCI7XG5cdFx0aWYgKCFjb250ZXh0KVxuXHRcdFx0dGhyb3cgXCJubyBHTCBjb250ZXh0IHNwZWNpZmllZFwiO1xuXHRcdHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cblx0IFx0dGhpcy52ZXJ0U2hhZGVyID0gbnVsbDtcblx0IFx0dGhpcy5mcmFnU2hhZGVyID0gbnVsbDtcblx0IFx0dGhpcy5wcm9ncmFtID0gbnVsbDtcblx0IFx0dGhpcy5sb2cgPSBcIlwiO1xuXG5cdFx0dGhpcy51bmlmb3JtQ2FjaGUgPSBudWxsO1xuXHRcdHRoaXMuYXR0cmlidXRlQ2FjaGUgPSBudWxsO1xuXG5cdFx0dGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnMgPSBhdHRyaWJ1dGVMb2NhdGlvbnM7XG5cblx0XHQvL1dlIHRyaW0gKEVDTUFTY3JpcHQ1KSBzbyB0aGF0IHRoZSBHTFNMIGxpbmUgbnVtYmVycyBhcmVcblx0XHQvL2FjY3VyYXRlIG9uIHNoYWRlciBsb2dcblx0XHR0aGlzLnZlcnRTb3VyY2UgPSB2ZXJ0U291cmNlLnRyaW0oKTtcblx0XHR0aGlzLmZyYWdTb3VyY2UgPSBmcmFnU291cmNlLnRyaW0oKTtcblxuXHRcdC8vQWRkcyB0aGlzIHNoYWRlciB0byB0aGUgY29udGV4dCwgdG8gYmUgbWFuYWdlZFxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fSxcblxuXHQvKiogXG5cdCAqIFRoaXMgaXMgY2FsbGVkIGR1cmluZyB0aGUgU2hhZGVyUHJvZ3JhbSBjb25zdHJ1Y3Rvcixcblx0ICogYW5kIG1heSBuZWVkIHRvIGJlIGNhbGxlZCBhZ2FpbiBhZnRlciBjb250ZXh0IGxvc3MgYW5kIHJlc3RvcmUuXG5cdCAqL1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cdFx0dGhpcy5fY29tcGlsZVNoYWRlcnMoKTtcblx0fSxcblxuXHQvL0NvbXBpbGVzIHRoZSBzaGFkZXJzLCB0aHJvd2luZyBhbiBlcnJvciBpZiB0aGUgcHJvZ3JhbSB3YXMgaW52YWxpZC5cblx0X2NvbXBpbGVTaGFkZXJzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsOyBcblx0XHRcblx0XHR0aGlzLmxvZyA9IFwiXCI7XG5cblx0XHR0aGlzLnZlcnRTaGFkZXIgPSB0aGlzLl9sb2FkU2hhZGVyKGdsLlZFUlRFWF9TSEFERVIsIHRoaXMudmVydFNvdXJjZSk7XG5cdFx0dGhpcy5mcmFnU2hhZGVyID0gdGhpcy5fbG9hZFNoYWRlcihnbC5GUkFHTUVOVF9TSEFERVIsIHRoaXMuZnJhZ1NvdXJjZSk7XG5cblx0XHRpZiAoIXRoaXMudmVydFNoYWRlciB8fCAhdGhpcy5mcmFnU2hhZGVyKVxuXHRcdFx0dGhyb3cgXCJFcnJvciByZXR1cm5lZCB3aGVuIGNhbGxpbmcgY3JlYXRlU2hhZGVyXCI7XG5cblx0XHR0aGlzLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKCk7XG5cblx0XHRnbC5hdHRhY2hTaGFkZXIodGhpcy5wcm9ncmFtLCB0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmF0dGFjaFNoYWRlcih0aGlzLnByb2dyYW0sIHRoaXMuZnJhZ1NoYWRlcik7XG4gXHRcbiBcdFx0Ly9UT0RPOiBUaGlzIHNlZW1zIG5vdCB0byBiZSB3b3JraW5nIG9uIG15IE9TWCAtLSBtYXliZSBhIGRyaXZlciBidWc/XG5cdFx0aWYgKHRoaXMuYXR0cmlidXRlTG9jYXRpb25zKSB7XG5cdFx0XHRmb3IgKHZhciBrZXkgaW4gdGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnMpIHtcblx0XHRcdFx0aWYgKHRoaXMuYXR0cmlidXRlTG9jYXRpb25zLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0XHQgICAgXHRcdGdsLmJpbmRBdHRyaWJMb2NhdGlvbih0aGlzLnByb2dyYW0sIE1hdGguZmxvb3IodGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnNba2V5XSksIGtleSk7XG5cdCAgICBcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGdsLmxpbmtQcm9ncmFtKHRoaXMucHJvZ3JhbSk7IFxuXG5cdFx0dGhpcy5sb2cgKz0gZ2wuZ2V0UHJvZ3JhbUluZm9Mb2codGhpcy5wcm9ncmFtKSB8fCBcIlwiO1xuXG5cdFx0aWYgKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHRoaXMucHJvZ3JhbSwgZ2wuTElOS19TVEFUVVMpKSB7XG5cdFx0XHR0aHJvdyBcIkVycm9yIGxpbmtpbmcgdGhlIHNoYWRlciBwcm9ncmFtOlxcblwiXG5cdFx0XHRcdCsgdGhpcy5sb2c7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZmV0Y2hVbmlmb3JtcygpO1xuXHRcdHRoaXMuX2ZldGNoQXR0cmlidXRlcygpO1xuXHR9LFxuXG5cdF9mZXRjaFVuaWZvcm1zOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy51bmlmb3JtQ2FjaGUgPSB7fTtcblxuXHRcdHZhciBsZW4gPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHRoaXMucHJvZ3JhbSwgZ2wuQUNUSVZFX1VOSUZPUk1TKTtcblx0XHRpZiAoIWxlbikgLy9udWxsIG9yIHplcm9cblx0XHRcdHJldHVybjtcblxuXHRcdGZvciAodmFyIGk9MDsgaTxsZW47IGkrKykge1xuXHRcdFx0dmFyIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHRoaXMucHJvZ3JhbSwgaSk7XG5cdFx0XHRpZiAoaW5mbyA9PT0gbnVsbCkgXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0dmFyIG5hbWUgPSBpbmZvLm5hbWU7XG5cdFx0XHR2YXIgbG9jYXRpb24gPSBnbC5nZXRVbmlmb3JtTG9jYXRpb24odGhpcy5wcm9ncmFtLCBuYW1lKTtcblx0XHRcdFxuXHRcdFx0dGhpcy51bmlmb3JtQ2FjaGVbbmFtZV0gPSB7XG5cdFx0XHRcdHNpemU6IGluZm8uc2l6ZSxcblx0XHRcdFx0dHlwZTogaW5mby50eXBlLFxuXHRcdFx0XHRsb2NhdGlvbjogbG9jYXRpb25cblx0XHRcdH07XG5cdFx0fVxuXHR9LFxuXG5cdF9mZXRjaEF0dHJpYnV0ZXM6IGZ1bmN0aW9uKCkgeyBcblx0XHR2YXIgZ2wgPSB0aGlzLmdsOyBcblxuXHRcdHRoaXMuYXR0cmlidXRlQ2FjaGUgPSB7fTtcblxuXHRcdHZhciBsZW4gPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHRoaXMucHJvZ3JhbSwgZ2wuQUNUSVZFX0FUVFJJQlVURVMpO1xuXHRcdGlmICghbGVuKSAvL251bGwgb3IgemVyb1xuXHRcdFx0cmV0dXJuO1x0XG5cblx0XHRmb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHtcblx0XHRcdHZhciBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHRoaXMucHJvZ3JhbSwgaSk7XG5cdFx0XHRpZiAoaW5mbyA9PT0gbnVsbCkgXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0dmFyIG5hbWUgPSBpbmZvLm5hbWU7XG5cblx0XHRcdC8vdGhlIGF0dHJpYiBsb2NhdGlvbiBpcyBhIHNpbXBsZSBpbmRleFxuXHRcdFx0dmFyIGxvY2F0aW9uID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24odGhpcy5wcm9ncmFtLCBuYW1lKTtcblx0XHRcdFxuXHRcdFx0dGhpcy5hdHRyaWJ1dGVDYWNoZVtuYW1lXSA9IHtcblx0XHRcdFx0c2l6ZTogaW5mby5zaXplLFxuXHRcdFx0XHR0eXBlOiBpbmZvLnR5cGUsXG5cdFx0XHRcdGxvY2F0aW9uOiBsb2NhdGlvblxuXHRcdFx0fTtcblx0XHR9XG5cdH0sXG5cblx0X2xvYWRTaGFkZXI6IGZ1bmN0aW9uKHR5cGUsIHNvdXJjZSkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR2YXIgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpO1xuXHRcdGlmICghc2hhZGVyKSAvL3Nob3VsZCBub3Qgb2NjdXIuLi5cblx0XHRcdHJldHVybiAtMTtcblxuXHRcdGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSk7XG5cdFx0Z2wuY29tcGlsZVNoYWRlcihzaGFkZXIpO1xuXHRcdFxuXHRcdHZhciBsb2dSZXN1bHQgPSBnbC5nZXRTaGFkZXJJbmZvTG9nKHNoYWRlcikgfHwgXCJcIjtcblx0XHRpZiAobG9nUmVzdWx0KSB7XG5cdFx0XHQvL3dlIGRvIHRoaXMgc28gdGhlIHVzZXIga25vd3Mgd2hpY2ggc2hhZGVyIGhhcyB0aGUgZXJyb3Jcblx0XHRcdHZhciB0eXBlU3RyID0gKHR5cGUgPT09IGdsLlZFUlRFWF9TSEFERVIpID8gXCJ2ZXJ0ZXhcIiA6IFwiZnJhZ21lbnRcIjtcblx0XHRcdGxvZ1Jlc3VsdCA9IFwiRXJyb3IgY29tcGlsaW5nIFwiKyB0eXBlU3RyKyBcIiBzaGFkZXI6XFxuXCIrbG9nUmVzdWx0O1xuXHRcdH1cblxuXHRcdHRoaXMubG9nICs9IGxvZ1Jlc3VsdDtcblxuXHRcdGlmICghZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKHNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpICkge1xuXHRcdFx0dGhyb3cgdGhpcy5sb2c7XG5cdFx0fVxuXHRcdHJldHVybiBzaGFkZXI7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGluZm8gKHNpemUsIHR5cGUsIGxvY2F0aW9uKS5cblx0ICogSWYgdGhlIHVuaWZvcm0gaXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZSwgaXQgaXMgYXNzdW1lZFxuXHQgKiB0byBub3QgZXhpc3QsIGFuZCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqXG5cdCAqIFRoaXMgbWF5IHJldHVybiBudWxsIGV2ZW4gaWYgdGhlIHVuaWZvcm0gaXMgZGVmaW5lZCBpbiBHTFNMOlxuXHQgKiBpZiBpdCBpcyBfaW5hY3RpdmVfIChpLmUuIG5vdCB1c2VkIGluIHRoZSBwcm9ncmFtKSB0aGVuIGl0IG1heVxuXHQgKiBiZSBvcHRpbWl6ZWQgb3V0LlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge09iamVjdH0gYW4gb2JqZWN0IGNvbnRhaW5pbmcgbG9jYXRpb24sIHNpemUsIGFuZCB0eXBlXG5cdCAqL1xuXHRnZXRVbmlmb3JtSW5mbzogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLnVuaWZvcm1DYWNoZVtuYW1lXSB8fCBudWxsOyBcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIGF0dHJpYnV0ZSBpbmZvIChzaXplLCB0eXBlLCBsb2NhdGlvbikuXG5cdCAqIElmIHRoZSBhdHRyaWJ1dGUgaXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZSwgaXQgaXMgYXNzdW1lZFxuXHQgKiB0byBub3QgZXhpc3QsIGFuZCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqXG5cdCAqIFRoaXMgbWF5IHJldHVybiBudWxsIGV2ZW4gaWYgdGhlIGF0dHJpYnV0ZSBpcyBkZWZpbmVkIGluIEdMU0w6XG5cdCAqIGlmIGl0IGlzIF9pbmFjdGl2ZV8gKGkuZS4gbm90IHVzZWQgaW4gdGhlIHByb2dyYW0gb3IgZGlzYWJsZWQpIFxuXHQgKiB0aGVuIGl0IG1heSBiZSBvcHRpbWl6ZWQgb3V0LlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSBhdHRyaWJ1dGUgbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7b2JqZWN0fSBhbiBvYmplY3QgY29udGFpbmluZyBsb2NhdGlvbiwgc2l6ZSBhbmQgdHlwZVxuXHQgKi9cblx0Z2V0QXR0cmlidXRlSW5mbzogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmF0dHJpYnV0ZUNhY2hlW25hbWVdIHx8IG51bGw7IFxuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGxvY2F0aW9uIG9iamVjdC5cblx0ICogSWYgdGhlIHVuaWZvcm0gaXMgbm90IGZvdW5kLCB0aGlzIG1ldGhvZCByZXR1cm5zIG51bGwuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7R0xpbnR9IHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICovXG5cdGdldEF0dHJpYnV0ZUxvY2F0aW9uOiBmdW5jdGlvbihuYW1lKSB7IC8vVE9ETzogbWFrZSBmYXN0ZXIsIGRvbid0IGNhY2hlXG5cdFx0dmFyIGluZm8gPSB0aGlzLmdldEF0dHJpYnV0ZUluZm8obmFtZSk7XG5cdFx0cmV0dXJuIGluZm8gPyBpbmZvLmxvY2F0aW9uIDogbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2FjaGVkIHVuaWZvcm0gbG9jYXRpb24gb2JqZWN0LlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge1dlYkdMVW5pZm9ybUxvY2F0aW9ufSB0aGUgbG9jYXRpb24gb2JqZWN0XG5cdCAqL1xuXHRnZXRVbmlmb3JtTG9jYXRpb246IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgaW5mbyA9IHRoaXMuZ2V0VW5pZm9ybUluZm8obmFtZSk7XG5cdFx0cmV0dXJuIGluZm8gPyBpbmZvLmxvY2F0aW9uIDogbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSB1bmlmb3JtIGlzIGFjdGl2ZSBhbmQgZm91bmQgaW4gdGhpc1xuXHQgKiBjb21waWxlZCBwcm9ncmFtLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSAgbmFtZSB0aGUgdW5pZm9ybSBuYW1lXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgdGhlIHVuaWZvcm0gaXMgZm91bmQgYW5kIGFjdGl2ZVxuXHQgKi9cblx0aGFzVW5pZm9ybTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLmdldFVuaWZvcm1JbmZvKG5hbWUpICE9PSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGF0dHJpYnV0ZSBpcyBhY3RpdmUgYW5kIGZvdW5kIGluIHRoaXNcblx0ICogY29tcGlsZWQgcHJvZ3JhbS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gIG5hbWUgdGhlIGF0dHJpYnV0ZSBuYW1lXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgdGhlIGF0dHJpYnV0ZSBpcyBmb3VuZCBhbmQgYWN0aXZlXG5cdCAqL1xuXHRoYXNBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBdHRyaWJ1dGVJbmZvKG5hbWUpICE9PSBudWxsO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB1bmlmb3JtIHZhbHVlIGJ5IG5hbWUuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIHVuaWZvcm0gbmFtZSBhcyBkZWZpbmVkIGluIEdMU0xcblx0ICogQHJldHVybiB7YW55fSBUaGUgdmFsdWUgb2YgdGhlIFdlYkdMIHVuaWZvcm1cblx0ICovXG5cdGdldFVuaWZvcm06IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nbC5nZXRVbmlmb3JtKHRoaXMucHJvZ3JhbSwgdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSkpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB1bmlmb3JtIHZhbHVlIGF0IHRoZSBzcGVjaWZpZWQgV2ViR0xVbmlmb3JtTG9jYXRpb24uXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtXZWJHTFVuaWZvcm1Mb2NhdGlvbn0gbG9jYXRpb24gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKiBAcmV0dXJuIHthbnl9IFRoZSB2YWx1ZSBvZiB0aGUgV2ViR0wgdW5pZm9ybVxuXHQgKi9cblx0Z2V0VW5pZm9ybUF0OiBmdW5jdGlvbihsb2NhdGlvbikge1xuXHRcdHJldHVybiB0aGlzLmdsLmdldFVuaWZvcm0odGhpcy5wcm9ncmFtLCBsb2NhdGlvbik7XG5cdH0sXG5cblx0YmluZDogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbC51c2VQcm9ncmFtKHRoaXMucHJvZ3JhbSk7XG5cdH0sXG5cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC5kZXRhY2hTaGFkZXIodGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRnbC5kZXRhY2hTaGFkZXIodGhpcy5mcmFnU2hhZGVyKTtcblxuXHRcdGdsLmRlbGV0ZVNoYWRlcih0aGlzLnZlcnRTaGFkZXIpO1xuXHRcdGdsLmRlbGV0ZVNoYWRlcih0aGlzLmZyYWdTaGFkZXIpO1xuXG5cdFx0Z2wuZGVsZXRlUHJvZ3JhbSh0aGlzLnByb2dyYW0pO1xuXHRcdHRoaXMucHJvZ3JhbSA9IG51bGw7XG5cdH0sXG5cblx0c2V0VW5pZm9ybWk6IGZ1bmN0aW9uKG5hbWUsIHgsIHksIHosIHcpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdHZhciBsb2MgPSB0aGlzLmdldFVuaWZvcm1Mb2NhdGlvbihuYW1lKTtcblx0XHRpZiAoIWxvYykgXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0c3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG5cdFx0XHRjYXNlIDI6IGdsLnVuaWZvcm0xaShsb2MsIHgpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMzogZ2wudW5pZm9ybTJpKGxvYywgeCwgeSk7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSA0OiBnbC51bmlmb3JtM2kobG9jLCB4LCB5LCB6KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDU6IGdsLnVuaWZvcm00aShsb2MsIHgsIHksIHosIHcpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IFwiaW52YWxpZCBhcmd1bWVudHMgdG8gc2V0VW5pZm9ybWlcIjsgXG5cdFx0fVxuXHR9LFxuXG5cdHNldFVuaWZvcm1mOiBmdW5jdGlvbihuYW1lLCB4LCB5LCB6LCB3KSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKCFsb2MpIFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0Y2FzZSAyOiBnbC51bmlmb3JtMWYobG9jLCB4KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDM6IGdsLnVuaWZvcm0yZihsb2MsIHgsIHkpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNDogZ2wudW5pZm9ybTNmKGxvYywgeCwgeSwgeik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSA1OiBnbC51bmlmb3JtNGYobG9jLCB4LCB5LCB6LCB3KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBcImludmFsaWQgYXJndW1lbnRzIHRvIHNldFVuaWZvcm1mXCI7IFxuXHRcdH1cblx0fSxcblxuXHQvL0kgZ3Vlc3Mgd2Ugd29uJ3Qgc3VwcG9ydCBzZXF1ZW5jZTxHTGZsb2F0PiAuLiB3aGF0ZXZlciB0aGF0IGlzID8/XG5cdFxuXHQvKipcblx0ICogQSBjb252ZW5pZW5jZSBtZXRob2QgdG8gc2V0IHVuaWZvcm1OZnYgZnJvbSB0aGUgZ2l2ZW4gQXJyYXlCdWZmZXIuXG5cdCAqIFdlIGRldGVybWluZSB3aGljaCBHTCBjYWxsIHRvIG1ha2UgYmFzZWQgb24gdGhlIGxlbmd0aCBvZiB0aGUgYXJyYXkgXG5cdCAqIGJ1ZmZlci4gXG5cdCAqIFx0XG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lICAgICAgICBcdFx0dGhlIG5hbWUgb2YgdGhlIHVuaWZvcm1cblx0ICogQHBhcmFtIHtBcnJheUJ1ZmZlcn0gYXJyYXlCdWZmZXIgdGhlIGFycmF5IGJ1ZmZlclxuXHQgKi9cblx0c2V0VW5pZm9ybWZ2OiBmdW5jdGlvbihuYW1lLCBhcnJheUJ1ZmZlcikge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dmFyIGxvYyA9IHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpO1xuXHRcdGlmICghbG9jKSBcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRzd2l0Y2ggKGFycmF5QnVmZmVyLmxlbmd0aCkge1xuXHRcdFx0Y2FzZSAxOiBnbC51bmlmb3JtMWZ2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMjogZ2wudW5pZm9ybTJmdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDM6IGdsLnVuaWZvcm0zZnYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSA0OiBnbC51bmlmb3JtNGZ2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IFwiaW52YWxpZCBhcmd1bWVudHMgdG8gc2V0VW5pZm9ybWZcIjsgXG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBBIGNvbnZlbmllbmNlIG1ldGhvZCB0byBzZXQgdW5pZm9ybU5mdiBmcm9tIHRoZSBnaXZlbiBBcnJheUJ1ZmZlci5cblx0ICogV2UgZGV0ZXJtaW5lIHdoaWNoIEdMIGNhbGwgdG8gbWFrZSBiYXNlZCBvbiB0aGUgbGVuZ3RoIG9mIHRoZSBhcnJheSBcblx0ICogYnVmZmVyLiBcblx0ICogXHRcblx0ICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgICAgICAgIFx0XHR0aGUgbmFtZSBvZiB0aGUgdW5pZm9ybVxuXHQgKiBAcGFyYW0ge0FycmF5QnVmZmVyfSBhcnJheUJ1ZmZlciB0aGUgYXJyYXkgYnVmZmVyXG5cdCAqL1xuXHRzZXRVbmlmb3JtaXY6IGZ1bmN0aW9uKG5hbWUsIGFycmF5QnVmZmVyKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKCFsb2MpIFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdHN3aXRjaCAoYXJyYXlCdWZmZXIubGVuZ3RoKSB7XG5cdFx0XHRjYXNlIDE6IGdsLnVuaWZvcm0xaXYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAyOiBnbC51bmlmb3JtMml2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMzogZ2wudW5pZm9ybTNpdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDQ6IGdsLnVuaWZvcm00aXYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIGFyZ3VtZW50cyB0byBzZXRVbmlmb3JtZlwiOyBcblx0XHR9XG5cdH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNoYWRlclByb2dyYW07IiwiLyoqXG4gIEF1dG8tZ2VuZXJhdGVkIEthbWkgaW5kZXggZmlsZS5cbiAgQ3JlYXRlZCBvbiAyMDEzLTExLTI1XG4qL1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgLy9jb3JlIGNsYXNzZXNcbiAgICAnQWJzdHJhY3RCYXRjaCc6ICAgcmVxdWlyZSgnLi9BYnN0cmFjdEJhdGNoLmpzJyksXG4gICAgJ0Fzc2V0TWFuYWdlcic6ICAgIHJlcXVpcmUoJy4vQXNzZXRNYW5hZ2VyLmpzJyksXG4gICAgJ1Nwcml0ZUJhdGNoJzogICAgIHJlcXVpcmUoJy4vU3ByaXRlQmF0Y2guanMnKSxcbiAgICAnVGV4dHVyZSc6ICAgICAgICAgcmVxdWlyZSgnLi9UZXh0dXJlLmpzJyksXG4gICAgJ1dlYkdMQ29udGV4dCc6ICAgIHJlcXVpcmUoJy4vV2ViR0xDb250ZXh0LmpzJyksXG4gICAgJ01lc2gnOiAgICAgICAgICAgIHJlcXVpcmUoJy4vZ2x1dGlscy9NZXNoLmpzJyksXG4gICAgJ1NoYWRlclByb2dyYW0nOiAgIHJlcXVpcmUoJy4vZ2x1dGlscy9TaGFkZXJQcm9ncmFtLmpzJylcbn07IiwiZnVuY3Rpb24gaGFzR2V0dGVyT3JTZXR0ZXIoZGVmKSB7XG5cdHJldHVybiAoISFkZWYuZ2V0ICYmIHR5cGVvZiBkZWYuZ2V0ID09PSBcImZ1bmN0aW9uXCIpIHx8ICghIWRlZi5zZXQgJiYgdHlwZW9mIGRlZi5zZXQgPT09IFwiZnVuY3Rpb25cIik7XG59XG5cbmZ1bmN0aW9uIGdldFByb3BlcnR5KGRlZmluaXRpb24sIGssIGlzQ2xhc3NEZXNjcmlwdG9yKSB7XG5cdC8vVGhpcyBtYXkgYmUgYSBsaWdodHdlaWdodCBvYmplY3QsIE9SIGl0IG1pZ2h0IGJlIGEgcHJvcGVydHlcblx0Ly90aGF0IHdhcyBkZWZpbmVkIHByZXZpb3VzbHkuXG5cdFxuXHQvL0ZvciBzaW1wbGUgY2xhc3MgZGVzY3JpcHRvcnMgd2UgY2FuIGp1c3QgYXNzdW1lIGl0cyBOT1QgcHJldmlvdXNseSBkZWZpbmVkLlxuXHR2YXIgZGVmID0gaXNDbGFzc0Rlc2NyaXB0b3IgXG5cdFx0XHRcdD8gZGVmaW5pdGlvbltrXSBcblx0XHRcdFx0OiBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGRlZmluaXRpb24sIGspO1xuXG5cdGlmICghaXNDbGFzc0Rlc2NyaXB0b3IgJiYgZGVmLnZhbHVlICYmIHR5cGVvZiBkZWYudmFsdWUgPT09IFwib2JqZWN0XCIpIHtcblx0XHRkZWYgPSBkZWYudmFsdWU7XG5cdH1cblxuXG5cdC8vVGhpcyBtaWdodCBiZSBhIHJlZ3VsYXIgcHJvcGVydHksIG9yIGl0IG1heSBiZSBhIGdldHRlci9zZXR0ZXIgdGhlIHVzZXIgZGVmaW5lZCBpbiBhIGNsYXNzLlxuXHRpZiAoIGRlZiAmJiBoYXNHZXR0ZXJPclNldHRlcihkZWYpICkge1xuXHRcdGlmICh0eXBlb2YgZGVmLmVudW1lcmFibGUgPT09IFwidW5kZWZpbmVkXCIpXG5cdFx0XHRkZWYuZW51bWVyYWJsZSA9IHRydWU7XG5cdFx0aWYgKHR5cGVvZiBkZWYuY29uZmlndXJhYmxlID09PSBcInVuZGVmaW5lZFwiKVxuXHRcdFx0ZGVmLmNvbmZpZ3VyYWJsZSA9IHRydWU7XG5cdFx0cmV0dXJuIGRlZjtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gaGFzTm9uQ29uZmlndXJhYmxlKG9iaiwgaykge1xuXHR2YXIgcHJvcCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3Iob2JqLCBrKTtcblx0aWYgKCFwcm9wKVxuXHRcdHJldHVybiBmYWxzZTtcblxuXHRpZiAocHJvcC52YWx1ZSAmJiB0eXBlb2YgcHJvcC52YWx1ZSA9PT0gXCJvYmplY3RcIilcblx0XHRwcm9wID0gcHJvcC52YWx1ZTtcblxuXHRpZiAocHJvcC5jb25maWd1cmFibGUgPT09IGZhbHNlKSBcblx0XHRyZXR1cm4gdHJ1ZTtcblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8vVE9ETzogT24gY3JlYXRlLCBcbi8vXHRcdE9uIG1peGluLCBcblxuZnVuY3Rpb24gZXh0ZW5kKGN0b3IsIGRlZmluaXRpb24sIGlzQ2xhc3NEZXNjcmlwdG9yLCBleHRlbmQpIHtcblx0Zm9yICh2YXIgayBpbiBkZWZpbml0aW9uKSB7XG5cdFx0aWYgKCFkZWZpbml0aW9uLmhhc093blByb3BlcnR5KGspKVxuXHRcdFx0Y29udGludWU7XG5cblx0XHR2YXIgZGVmID0gZ2V0UHJvcGVydHkoZGVmaW5pdGlvbiwgaywgaXNDbGFzc0Rlc2NyaXB0b3IpO1xuXG5cdFx0aWYgKGRlZiAhPT0gZmFsc2UpIHtcblx0XHRcdC8vSWYgRXh0ZW5kcyBpcyB1c2VkLCB3ZSB3aWxsIGNoZWNrIGl0cyBwcm90b3R5cGUgdG8gc2VlIGlmIFxuXHRcdFx0Ly90aGUgZmluYWwgdmFyaWFibGUgZXhpc3RzLlxuXHRcdFx0XG5cdFx0XHR2YXIgcGFyZW50ID0gZXh0ZW5kIHx8IGN0b3I7XG5cdFx0XHRpZiAoaGFzTm9uQ29uZmlndXJhYmxlKHBhcmVudC5wcm90b3R5cGUsIGspKSB7XG5cblx0XHRcdFx0Ly9qdXN0IHNraXAgdGhlIGZpbmFsIHByb3BlcnR5XG5cdFx0XHRcdGlmIChDbGFzcy5pZ25vcmVGaW5hbHMpXG5cdFx0XHRcdFx0Y29udGludWU7XG5cblx0XHRcdFx0Ly9XZSBjYW5ub3QgcmUtZGVmaW5lIGEgcHJvcGVydHkgdGhhdCBpcyBjb25maWd1cmFibGU9ZmFsc2UuXG5cdFx0XHRcdC8vU28gd2Ugd2lsbCBjb25zaWRlciB0aGVtIGZpbmFsIGFuZCB0aHJvdyBhbiBlcnJvci4gVGhpcyBpcyBieVxuXHRcdFx0XHQvL2RlZmF1bHQgc28gaXQgaXMgY2xlYXIgdG8gdGhlIGRldmVsb3BlciB3aGF0IGlzIGhhcHBlbmluZy5cblx0XHRcdFx0Ly9Zb3UgY2FuIHNldCBpZ25vcmVGaW5hbHMgdG8gdHJ1ZSBpZiB5b3UgbmVlZCB0byBleHRlbmQgYSBjbGFzc1xuXHRcdFx0XHQvL3doaWNoIGhhcyBjb25maWd1cmFibGU9ZmFsc2U7IGl0IHdpbGwgc2ltcGx5IG5vdCByZS1kZWZpbmUgZmluYWwgcHJvcGVydGllcy5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiY2Fubm90IG92ZXJyaWRlIGZpbmFsIHByb3BlcnR5ICdcIitrXG5cdFx0XHRcdFx0XHRcdCtcIicsIHNldCBDbGFzcy5pZ25vcmVGaW5hbHMgPSB0cnVlIHRvIHNraXBcIik7XG5cdFx0XHR9XG5cblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjdG9yLnByb3RvdHlwZSwgaywgZGVmKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3Rvci5wcm90b3R5cGVba10gPSBkZWZpbml0aW9uW2tdO1xuXHRcdH1cblxuXHR9XG59XG5cbi8qKlxuICovXG5mdW5jdGlvbiBtaXhpbihteUNsYXNzLCBtaXhpbnMpIHtcblx0aWYgKCFtaXhpbnMpXG5cdFx0cmV0dXJuO1xuXG5cdGlmICghQXJyYXkuaXNBcnJheShtaXhpbnMpKVxuXHRcdG1peGlucyA9IFttaXhpbnNdO1xuXG5cdGZvciAodmFyIGk9MDsgaTxtaXhpbnMubGVuZ3RoOyBpKyspIHtcblx0XHRleHRlbmQobXlDbGFzcywgbWl4aW5zW2ldLnByb3RvdHlwZSB8fCBtaXhpbnNbaV0pO1xuXHR9XG59XG5cbi8qKlxuICogXG4gKi9cbmZ1bmN0aW9uIENsYXNzKGRlZmluaXRpb24pIHtcblx0aWYgKCFkZWZpbml0aW9uKVxuXHRcdGRlZmluaXRpb24gPSB7fTtcblxuXHQvL1RoZSB2YXJpYWJsZSBuYW1lIGhlcmUgZGljdGF0ZXMgd2hhdCB3ZSBzZWUgaW4gQ2hyb21lIGRlYnVnZ2VyXG5cdHZhciBpbml0aWFsaXplO1xuXHR2YXIgRXh0ZW5kcztcblxuXHRpZiAoZGVmaW5pdGlvbi5pbml0aWFsaXplKSB7XG5cdFx0aWYgKHR5cGVvZiBkZWZpbml0aW9uLmluaXRpYWxpemUgIT09IFwiZnVuY3Rpb25cIilcblx0XHRcdHRocm93IG5ldyBFcnJvcihcImluaXRpYWxpemUgbXVzdCBiZSBhIGZ1bmN0aW9uXCIpO1xuXHRcdGluaXRpYWxpemUgPSBkZWZpbml0aW9uLmluaXRpYWxpemU7XG5cblx0XHQvL1VzdWFsbHkgd2Ugc2hvdWxkIGF2b2lkIFwiZGVsZXRlXCIgaW4gVjggYXQgYWxsIGNvc3RzLlxuXHRcdC8vSG93ZXZlciwgaXRzIHVubGlrZWx5IHRvIG1ha2UgYW55IHBlcmZvcm1hbmNlIGRpZmZlcmVuY2Vcblx0XHQvL2hlcmUgc2luY2Ugd2Ugb25seSBjYWxsIHRoaXMgb24gY2xhc3MgY3JlYXRpb24gKGkuZS4gbm90IG9iamVjdCBjcmVhdGlvbikuXG5cdFx0ZGVsZXRlIGRlZmluaXRpb24uaW5pdGlhbGl6ZTtcblx0fSBlbHNlIHtcblx0XHRpZiAoZGVmaW5pdGlvbi5FeHRlbmRzKSB7XG5cdFx0XHR2YXIgYmFzZSA9IGRlZmluaXRpb24uRXh0ZW5kcztcblx0XHRcdGluaXRpYWxpemUgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGJhc2UuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRcdH07IFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbml0aWFsaXplID0gZnVuY3Rpb24gKCkge307IFxuXHRcdH1cblx0fVxuXG5cdGlmIChkZWZpbml0aW9uLkV4dGVuZHMpIHtcblx0XHRpbml0aWFsaXplLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoZGVmaW5pdGlvbi5FeHRlbmRzLnByb3RvdHlwZSk7XG5cdFx0aW5pdGlhbGl6ZS5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBpbml0aWFsaXplO1xuXHRcdC8vZm9yIGdldE93blByb3BlcnR5RGVzY3JpcHRvciB0byB3b3JrLCB3ZSBuZWVkIHRvIGFjdFxuXHRcdC8vZGlyZWN0bHkgb24gdGhlIEV4dGVuZHMgKG9yIE1peGluKVxuXHRcdEV4dGVuZHMgPSBkZWZpbml0aW9uLkV4dGVuZHM7XG5cdFx0ZGVsZXRlIGRlZmluaXRpb24uRXh0ZW5kcztcblx0fSBlbHNlIHtcblx0XHRpbml0aWFsaXplLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGluaXRpYWxpemU7XG5cdH1cblxuXHQvL0dyYWIgdGhlIG1peGlucywgaWYgdGhleSBhcmUgc3BlY2lmaWVkLi4uXG5cdHZhciBtaXhpbnMgPSBudWxsO1xuXHRpZiAoZGVmaW5pdGlvbi5NaXhpbnMpIHtcblx0XHRtaXhpbnMgPSBkZWZpbml0aW9uLk1peGlucztcblx0XHRkZWxldGUgZGVmaW5pdGlvbi5NaXhpbnM7XG5cdH1cblxuXHQvL0ZpcnN0LCBtaXhpbiBpZiB3ZSBjYW4uXG5cdG1peGluKGluaXRpYWxpemUsIG1peGlucyk7XG5cblx0Ly9Ob3cgd2UgZ3JhYiB0aGUgYWN0dWFsIGRlZmluaXRpb24gd2hpY2ggZGVmaW5lcyB0aGUgb3ZlcnJpZGVzLlxuXHRleHRlbmQoaW5pdGlhbGl6ZSwgZGVmaW5pdGlvbiwgdHJ1ZSwgRXh0ZW5kcyk7XG5cblx0cmV0dXJuIGluaXRpYWxpemU7XG59O1xuXG5DbGFzcy5leHRlbmQgPSBleHRlbmQ7XG5DbGFzcy5taXhpbiA9IG1peGluO1xuQ2xhc3MuaWdub3JlRmluYWxzID0gZmFsc2U7XG5cbm1vZHVsZS5leHBvcnRzID0gQ2xhc3M7IiwidmFyIGludDggPSBuZXcgSW50OEFycmF5KDQpO1xudmFyIGludDMyID0gbmV3IEludDMyQXJyYXkoaW50OC5idWZmZXIsIDAsIDEpO1xudmFyIGZsb2F0MzIgPSBuZXcgRmxvYXQzMkFycmF5KGludDguYnVmZmVyLCAwLCAxKTtcblxuLyoqXG4gKiBBIHNpbmdsZXRvbiBmb3IgbnVtYmVyIHV0aWxpdGllcy4gXG4gKiBAY2xhc3MgTnVtYmVyVXRpbFxuICovXG52YXIgTnVtYmVyVXRpbCA9IGZ1bmN0aW9uKCkge1xuXG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhIGZsb2F0IHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBpbnQgYml0cy4gQXJyYXlCdWZmZXJcbiAqIGlzIHVzZWQgZm9yIHRoZSBjb252ZXJzaW9uLlxuICpcbiAqIEBtZXRob2QgIGludEJpdHNUb0Zsb2F0XG4gKiBAc3RhdGljXG4gKiBAcGFyYW0gIHtOdW1iZXJ9IGkgdGhlIGludCB0byBjYXN0XG4gKiBAcmV0dXJuIHtOdW1iZXJ9ICAgdGhlIGZsb2F0XG4gKi9cbk51bWJlclV0aWwuaW50Qml0c1RvRmxvYXQgPSBmdW5jdGlvbihpKSB7XG5cdGludDMyWzBdID0gaTtcblx0cmV0dXJuIGZsb2F0MzJbMF07XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGludCBiaXRzIGZyb20gdGhlIGdpdmVuIGZsb2F0LiBBcnJheUJ1ZmZlciBpcyB1c2VkXG4gKiBmb3IgdGhlIGNvbnZlcnNpb24uXG4gKlxuICogQG1ldGhvZCAgZmxvYXRUb0ludEJpdHNcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSAge051bWJlcn0gZiB0aGUgZmxvYXQgdG8gY2FzdFxuICogQHJldHVybiB7TnVtYmVyfSAgIHRoZSBpbnQgYml0c1xuICovXG5OdW1iZXJVdGlsLmZsb2F0VG9JbnRCaXRzID0gZnVuY3Rpb24oZikge1xuXHRmbG9hdDMyWzBdID0gZjtcblx0cmV0dXJuIGludDMyWzBdO1xufTtcblxuLyoqXG4gKiBFbmNvZGVzIEFCR1IgaW50IGFzIGEgZmxvYXQsIHdpdGggc2xpZ2h0IHByZWNpc2lvbiBsb3NzLlxuICpcbiAqIEBtZXRob2QgIGludFRvRmxvYXRDb2xvclxuICogQHN0YXRpY1xuICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlIGFuIEFCR1IgcGFja2VkIGludGVnZXJcbiAqL1xuTnVtYmVyVXRpbC5pbnRUb0Zsb2F0Q29sb3IgPSBmdW5jdGlvbih2YWx1ZSkge1xuXHRyZXR1cm4gTnVtYmVyVXRpbC5pbnRCaXRzVG9GbG9hdCggdmFsdWUgJiAweGZlZmZmZmZmICk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBmbG9hdCBlbmNvZGVkIEFCR1IgdmFsdWUgZnJvbSB0aGUgZ2l2ZW4gUkdCQVxuICogYnl0ZXMgKDAgLSAyNTUpLiBVc2VmdWwgZm9yIHNhdmluZyBiYW5kd2lkdGggaW4gdmVydGV4IGRhdGEuXG4gKlxuICogQG1ldGhvZCAgY29sb3JUb0Zsb2F0XG4gKiBAc3RhdGljXG4gKiBAcGFyYW0ge051bWJlcn0gciB0aGUgUmVkIGJ5dGUgKDAgLSAyNTUpXG4gKiBAcGFyYW0ge051bWJlcn0gZyB0aGUgR3JlZW4gYnl0ZSAoMCAtIDI1NSlcbiAqIEBwYXJhbSB7TnVtYmVyfSBiIHRoZSBCbHVlIGJ5dGUgKDAgLSAyNTUpXG4gKiBAcGFyYW0ge051bWJlcn0gYSB0aGUgQWxwaGEgYnl0ZSAoMCAtIDI1NSlcbiAqIEByZXR1cm4ge0Zsb2F0MzJ9ICBhIEZsb2F0MzIgb2YgdGhlIFJHQkEgY29sb3JcbiAqL1xuTnVtYmVyVXRpbC5jb2xvclRvRmxvYXQgPSBmdW5jdGlvbihyLCBnLCBiLCBhKSB7XG5cdHZhciBiaXRzID0gKGEgPDwgMjQgfCBiIDw8IDE2IHwgZyA8PCA4IHwgcik7XG5cdHJldHVybiBOdW1iZXJVdGlsLmludFRvRmxvYXRDb2xvcihiaXRzKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTnVtYmVyVXRpbDsiLCIvKmpzbGludCBvbmV2YXI6dHJ1ZSwgdW5kZWY6dHJ1ZSwgbmV3Y2FwOnRydWUsIHJlZ2V4cDp0cnVlLCBiaXR3aXNlOnRydWUsIG1heGVycjo1MCwgaW5kZW50OjQsIHdoaXRlOmZhbHNlLCBub21lbjpmYWxzZSwgcGx1c3BsdXM6ZmFsc2UgKi9cbi8qZ2xvYmFsIGRlZmluZTpmYWxzZSwgcmVxdWlyZTpmYWxzZSwgZXhwb3J0czpmYWxzZSwgbW9kdWxlOmZhbHNlLCBzaWduYWxzOmZhbHNlICovXG5cbi8qKiBAbGljZW5zZVxuICogSlMgU2lnbmFscyA8aHR0cDovL21pbGxlcm1lZGVpcm9zLmdpdGh1Yi5jb20vanMtc2lnbmFscy8+XG4gKiBSZWxlYXNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2VcbiAqIEF1dGhvcjogTWlsbGVyIE1lZGVpcm9zXG4gKiBWZXJzaW9uOiAxLjAuMCAtIEJ1aWxkOiAyNjggKDIwMTIvMTEvMjkgMDU6NDggUE0pXG4gKi9cblxuKGZ1bmN0aW9uKGdsb2JhbCl7XG5cbiAgICAvLyBTaWduYWxCaW5kaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8qKlxuICAgICAqIE9iamVjdCB0aGF0IHJlcHJlc2VudHMgYSBiaW5kaW5nIGJldHdlZW4gYSBTaWduYWwgYW5kIGEgbGlzdGVuZXIgZnVuY3Rpb24uXG4gICAgICogPGJyIC8+LSA8c3Ryb25nPlRoaXMgaXMgYW4gaW50ZXJuYWwgY29uc3RydWN0b3IgYW5kIHNob3VsZG4ndCBiZSBjYWxsZWQgYnkgcmVndWxhciB1c2Vycy48L3N0cm9uZz5cbiAgICAgKiA8YnIgLz4tIGluc3BpcmVkIGJ5IEpvYSBFYmVydCBBUzMgU2lnbmFsQmluZGluZyBhbmQgUm9iZXJ0IFBlbm5lcidzIFNsb3QgY2xhc3Nlcy5cbiAgICAgKiBAYXV0aG9yIE1pbGxlciBNZWRlaXJvc1xuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBpbnRlcm5hbFxuICAgICAqIEBuYW1lIFNpZ25hbEJpbmRpbmdcbiAgICAgKiBAcGFyYW0ge1NpZ25hbH0gc2lnbmFsIFJlZmVyZW5jZSB0byBTaWduYWwgb2JqZWN0IHRoYXQgbGlzdGVuZXIgaXMgY3VycmVudGx5IGJvdW5kIHRvLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbC5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzT25jZSBJZiBiaW5kaW5nIHNob3VsZCBiZSBleGVjdXRlZCBqdXN0IG9uY2UuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV0gVGhlIHByaW9yaXR5IGxldmVsIG9mIHRoZSBldmVudCBsaXN0ZW5lci4gKGRlZmF1bHQgPSAwKS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBTaWduYWxCaW5kaW5nKHNpZ25hbCwgbGlzdGVuZXIsIGlzT25jZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwuXG4gICAgICAgICAqIEB0eXBlIEZ1bmN0aW9uXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9saXN0ZW5lciA9IGxpc3RlbmVyO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBiaW5kaW5nIHNob3VsZCBiZSBleGVjdXRlZCBqdXN0IG9uY2UuXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX2lzT25jZSA9IGlzT25jZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgICAgICogQG1lbWJlck9mIFNpZ25hbEJpbmRpbmcucHJvdG90eXBlXG4gICAgICAgICAqIEBuYW1lIGNvbnRleHRcbiAgICAgICAgICogQHR5cGUgT2JqZWN0fHVuZGVmaW5lZHxudWxsXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmNvbnRleHQgPSBsaXN0ZW5lckNvbnRleHQ7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlZmVyZW5jZSB0byBTaWduYWwgb2JqZWN0IHRoYXQgbGlzdGVuZXIgaXMgY3VycmVudGx5IGJvdW5kIHRvLlxuICAgICAgICAgKiBAdHlwZSBTaWduYWxcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3NpZ25hbCA9IHNpZ25hbDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogTGlzdGVuZXIgcHJpb3JpdHlcbiAgICAgICAgICogQHR5cGUgTnVtYmVyXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9wcmlvcml0eSA9IHByaW9yaXR5IHx8IDA7XG4gICAgfVxuXG4gICAgU2lnbmFsQmluZGluZy5wcm90b3R5cGUgPSB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIGJpbmRpbmcgaXMgYWN0aXZlIGFuZCBzaG91bGQgYmUgZXhlY3V0ZWQuXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICovXG4gICAgICAgIGFjdGl2ZSA6IHRydWUsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERlZmF1bHQgcGFyYW1ldGVycyBwYXNzZWQgdG8gbGlzdGVuZXIgZHVyaW5nIGBTaWduYWwuZGlzcGF0Y2hgIGFuZCBgU2lnbmFsQmluZGluZy5leGVjdXRlYC4gKGN1cnJpZWQgcGFyYW1ldGVycylcbiAgICAgICAgICogQHR5cGUgQXJyYXl8bnVsbFxuICAgICAgICAgKi9cbiAgICAgICAgcGFyYW1zIDogbnVsbCxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ2FsbCBsaXN0ZW5lciBwYXNzaW5nIGFyYml0cmFyeSBwYXJhbWV0ZXJzLlxuICAgICAgICAgKiA8cD5JZiBiaW5kaW5nIHdhcyBhZGRlZCB1c2luZyBgU2lnbmFsLmFkZE9uY2UoKWAgaXQgd2lsbCBiZSBhdXRvbWF0aWNhbGx5IHJlbW92ZWQgZnJvbSBzaWduYWwgZGlzcGF0Y2ggcXVldWUsIHRoaXMgbWV0aG9kIGlzIHVzZWQgaW50ZXJuYWxseSBmb3IgdGhlIHNpZ25hbCBkaXNwYXRjaC48L3A+XG4gICAgICAgICAqIEBwYXJhbSB7QXJyYXl9IFtwYXJhbXNBcnJdIEFycmF5IG9mIHBhcmFtZXRlcnMgdGhhdCBzaG91bGQgYmUgcGFzc2VkIHRvIHRoZSBsaXN0ZW5lclxuICAgICAgICAgKiBAcmV0dXJuIHsqfSBWYWx1ZSByZXR1cm5lZCBieSB0aGUgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBleGVjdXRlIDogZnVuY3Rpb24gKHBhcmFtc0Fycikge1xuICAgICAgICAgICAgdmFyIGhhbmRsZXJSZXR1cm4sIHBhcmFtcztcbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZSAmJiAhIXRoaXMuX2xpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgcGFyYW1zID0gdGhpcy5wYXJhbXM/IHRoaXMucGFyYW1zLmNvbmNhdChwYXJhbXNBcnIpIDogcGFyYW1zQXJyO1xuICAgICAgICAgICAgICAgIGhhbmRsZXJSZXR1cm4gPSB0aGlzLl9saXN0ZW5lci5hcHBseSh0aGlzLmNvbnRleHQsIHBhcmFtcyk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2lzT25jZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVyUmV0dXJuO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEZXRhY2ggYmluZGluZyBmcm9tIHNpZ25hbC5cbiAgICAgICAgICogLSBhbGlhcyB0bzogbXlTaWduYWwucmVtb3ZlKG15QmluZGluZy5nZXRMaXN0ZW5lcigpKTtcbiAgICAgICAgICogQHJldHVybiB7RnVuY3Rpb258bnVsbH0gSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsIG9yIGBudWxsYCBpZiBiaW5kaW5nIHdhcyBwcmV2aW91c2x5IGRldGFjaGVkLlxuICAgICAgICAgKi9cbiAgICAgICAgZGV0YWNoIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNCb3VuZCgpPyB0aGlzLl9zaWduYWwucmVtb3ZlKHRoaXMuX2xpc3RlbmVyLCB0aGlzLmNvbnRleHQpIDogbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7Qm9vbGVhbn0gYHRydWVgIGlmIGJpbmRpbmcgaXMgc3RpbGwgYm91bmQgdG8gdGhlIHNpZ25hbCBhbmQgaGF2ZSBhIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgaXNCb3VuZCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAoISF0aGlzLl9zaWduYWwgJiYgISF0aGlzLl9saXN0ZW5lcik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IElmIFNpZ25hbEJpbmRpbmcgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIG9uY2UuXG4gICAgICAgICAqL1xuICAgICAgICBpc09uY2UgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faXNPbmNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0TGlzdGVuZXIgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fbGlzdGVuZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbH0gU2lnbmFsIHRoYXQgbGlzdGVuZXIgaXMgY3VycmVudGx5IGJvdW5kIHRvLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0U2lnbmFsIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NpZ25hbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGVsZXRlIGluc3RhbmNlIHByb3BlcnRpZXNcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9kZXN0cm95IDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX3NpZ25hbDtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9saXN0ZW5lcjtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbnRleHQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge3N0cmluZ30gU3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBvYmplY3QuXG4gICAgICAgICAqL1xuICAgICAgICB0b1N0cmluZyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAnW1NpZ25hbEJpbmRpbmcgaXNPbmNlOicgKyB0aGlzLl9pc09uY2UgKycsIGlzQm91bmQ6JysgdGhpcy5pc0JvdW5kKCkgKycsIGFjdGl2ZTonICsgdGhpcy5hY3RpdmUgKyAnXSc7XG4gICAgICAgIH1cblxuICAgIH07XG5cblxuLypnbG9iYWwgU2lnbmFsQmluZGluZzpmYWxzZSovXG5cbiAgICAvLyBTaWduYWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsIGZuTmFtZSkge1xuICAgICAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoICdsaXN0ZW5lciBpcyBhIHJlcXVpcmVkIHBhcmFtIG9mIHtmbn0oKSBhbmQgc2hvdWxkIGJlIGEgRnVuY3Rpb24uJy5yZXBsYWNlKCd7Zm59JywgZm5OYW1lKSApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3VzdG9tIGV2ZW50IGJyb2FkY2FzdGVyXG4gICAgICogPGJyIC8+LSBpbnNwaXJlZCBieSBSb2JlcnQgUGVubmVyJ3MgQVMzIFNpZ25hbHMuXG4gICAgICogQG5hbWUgU2lnbmFsXG4gICAgICogQGF1dGhvciBNaWxsZXIgTWVkZWlyb3NcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBTaWduYWwoKSB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSBBcnJheS48U2lnbmFsQmluZGluZz5cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX2JpbmRpbmdzID0gW107XG4gICAgICAgIHRoaXMuX3ByZXZQYXJhbXMgPSBudWxsO1xuXG4gICAgICAgIC8vIGVuZm9yY2UgZGlzcGF0Y2ggdG8gYXdheXMgd29yayBvbiBzYW1lIGNvbnRleHQgKCM0NylcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmRpc3BhdGNoID0gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIFNpZ25hbC5wcm90b3R5cGUuZGlzcGF0Y2guYXBwbHkoc2VsZiwgYXJndW1lbnRzKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBTaWduYWwucHJvdG90eXBlID0ge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTaWduYWxzIFZlcnNpb24gTnVtYmVyXG4gICAgICAgICAqIEB0eXBlIFN0cmluZ1xuICAgICAgICAgKiBAY29uc3RcbiAgICAgICAgICovXG4gICAgICAgIFZFUlNJT04gOiAnMS4wLjAnLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBTaWduYWwgc2hvdWxkIGtlZXAgcmVjb3JkIG9mIHByZXZpb3VzbHkgZGlzcGF0Y2hlZCBwYXJhbWV0ZXJzIGFuZFxuICAgICAgICAgKiBhdXRvbWF0aWNhbGx5IGV4ZWN1dGUgbGlzdGVuZXIgZHVyaW5nIGBhZGQoKWAvYGFkZE9uY2UoKWAgaWYgU2lnbmFsIHdhc1xuICAgICAgICAgKiBhbHJlYWR5IGRpc3BhdGNoZWQgYmVmb3JlLlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICBtZW1vcml6ZSA6IGZhbHNlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfc2hvdWxkUHJvcGFnYXRlIDogdHJ1ZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgU2lnbmFsIGlzIGFjdGl2ZSBhbmQgc2hvdWxkIGJyb2FkY2FzdCBldmVudHMuXG4gICAgICAgICAqIDxwPjxzdHJvbmc+SU1QT1JUQU5UOjwvc3Ryb25nPiBTZXR0aW5nIHRoaXMgcHJvcGVydHkgZHVyaW5nIGEgZGlzcGF0Y2ggd2lsbCBvbmx5IGFmZmVjdCB0aGUgbmV4dCBkaXNwYXRjaCwgaWYgeW91IHdhbnQgdG8gc3RvcCB0aGUgcHJvcGFnYXRpb24gb2YgYSBzaWduYWwgdXNlIGBoYWx0KClgIGluc3RlYWQuPC9wPlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICBhY3RpdmUgOiB0cnVlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lclxuICAgICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzT25jZVxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF1cbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV1cbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsQmluZGluZ31cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9yZWdpc3Rlckxpc3RlbmVyIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBpc09uY2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcblxuICAgICAgICAgICAgdmFyIHByZXZJbmRleCA9IHRoaXMuX2luZGV4T2ZMaXN0ZW5lcihsaXN0ZW5lciwgbGlzdGVuZXJDb250ZXh0KSxcbiAgICAgICAgICAgICAgICBiaW5kaW5nO1xuXG4gICAgICAgICAgICBpZiAocHJldkluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGJpbmRpbmcgPSB0aGlzLl9iaW5kaW5nc1twcmV2SW5kZXhdO1xuICAgICAgICAgICAgICAgIGlmIChiaW5kaW5nLmlzT25jZSgpICE9PSBpc09uY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgY2Fubm90IGFkZCcrIChpc09uY2U/ICcnIDogJ09uY2UnKSArJygpIHRoZW4gYWRkJysgKCFpc09uY2U/ICcnIDogJ09uY2UnKSArJygpIHRoZSBzYW1lIGxpc3RlbmVyIHdpdGhvdXQgcmVtb3ZpbmcgdGhlIHJlbGF0aW9uc2hpcCBmaXJzdC4nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJpbmRpbmcgPSBuZXcgU2lnbmFsQmluZGluZyh0aGlzLCBsaXN0ZW5lciwgaXNPbmNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGRCaW5kaW5nKGJpbmRpbmcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZih0aGlzLm1lbW9yaXplICYmIHRoaXMuX3ByZXZQYXJhbXMpe1xuICAgICAgICAgICAgICAgIGJpbmRpbmcuZXhlY3V0ZSh0aGlzLl9wcmV2UGFyYW1zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGJpbmRpbmc7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwYXJhbSB7U2lnbmFsQmluZGluZ30gYmluZGluZ1xuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX2FkZEJpbmRpbmcgOiBmdW5jdGlvbiAoYmluZGluZykge1xuICAgICAgICAgICAgLy9zaW1wbGlmaWVkIGluc2VydGlvbiBzb3J0XG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aDtcbiAgICAgICAgICAgIGRvIHsgLS1uOyB9IHdoaWxlICh0aGlzLl9iaW5kaW5nc1tuXSAmJiBiaW5kaW5nLl9wcmlvcml0eSA8PSB0aGlzLl9iaW5kaW5nc1tuXS5fcHJpb3JpdHkpO1xuICAgICAgICAgICAgdGhpcy5fYmluZGluZ3Muc3BsaWNlKG4gKyAxLCAwLCBiaW5kaW5nKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXJcbiAgICAgICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX2luZGV4T2ZMaXN0ZW5lciA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgY29udGV4dCkge1xuICAgICAgICAgICAgdmFyIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgY3VyO1xuICAgICAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgICAgIGN1ciA9IHRoaXMuX2JpbmRpbmdzW25dO1xuICAgICAgICAgICAgICAgIGlmIChjdXIuX2xpc3RlbmVyID09PSBsaXN0ZW5lciAmJiBjdXIuY29udGV4dCA9PT0gY29udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENoZWNrIGlmIGxpc3RlbmVyIHdhcyBhdHRhY2hlZCB0byBTaWduYWwuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY29udGV4dF1cbiAgICAgICAgICogQHJldHVybiB7Ym9vbGVhbn0gaWYgU2lnbmFsIGhhcyB0aGUgc3BlY2lmaWVkIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgaGFzIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBjb250ZXh0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faW5kZXhPZkxpc3RlbmVyKGxpc3RlbmVyLCBjb250ZXh0KSAhPT0gLTE7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEFkZCBhIGxpc3RlbmVyIHRvIHRoZSBzaWduYWwuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIFNpZ25hbCBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF0gQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV0gVGhlIHByaW9yaXR5IGxldmVsIG9mIHRoZSBldmVudCBsaXN0ZW5lci4gTGlzdGVuZXJzIHdpdGggaGlnaGVyIHByaW9yaXR5IHdpbGwgYmUgZXhlY3V0ZWQgYmVmb3JlIGxpc3RlbmVycyB3aXRoIGxvd2VyIHByaW9yaXR5LiBMaXN0ZW5lcnMgd2l0aCBzYW1lIHByaW9yaXR5IGxldmVsIHdpbGwgYmUgZXhlY3V0ZWQgYXQgdGhlIHNhbWUgb3JkZXIgYXMgdGhleSB3ZXJlIGFkZGVkLiAoZGVmYXVsdCA9IDApXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbEJpbmRpbmd9IEFuIE9iamVjdCByZXByZXNlbnRpbmcgdGhlIGJpbmRpbmcgYmV0d2VlbiB0aGUgU2lnbmFsIGFuZCBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGFkZCA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuICAgICAgICAgICAgdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgJ2FkZCcpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXIobGlzdGVuZXIsIGZhbHNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQWRkIGxpc3RlbmVyIHRvIHRoZSBzaWduYWwgdGhhdCBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBmaXJzdCBleGVjdXRpb24gKHdpbGwgYmUgZXhlY3V0ZWQgb25seSBvbmNlKS5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgU2lnbmFsIGhhbmRsZXIgZnVuY3Rpb24uXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XSBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gW3ByaW9yaXR5XSBUaGUgcHJpb3JpdHkgbGV2ZWwgb2YgdGhlIGV2ZW50IGxpc3RlbmVyLiBMaXN0ZW5lcnMgd2l0aCBoaWdoZXIgcHJpb3JpdHkgd2lsbCBiZSBleGVjdXRlZCBiZWZvcmUgbGlzdGVuZXJzIHdpdGggbG93ZXIgcHJpb3JpdHkuIExpc3RlbmVycyB3aXRoIHNhbWUgcHJpb3JpdHkgbGV2ZWwgd2lsbCBiZSBleGVjdXRlZCBhdCB0aGUgc2FtZSBvcmRlciBhcyB0aGV5IHdlcmUgYWRkZWQuIChkZWZhdWx0ID0gMClcbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsQmluZGluZ30gQW4gT2JqZWN0IHJlcHJlc2VudGluZyB0aGUgYmluZGluZyBiZXR3ZWVuIHRoZSBTaWduYWwgYW5kIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgYWRkT25jZSA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuICAgICAgICAgICAgdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgJ2FkZE9uY2UnKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9yZWdpc3Rlckxpc3RlbmVyKGxpc3RlbmVyLCB0cnVlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlIGEgc2luZ2xlIGxpc3RlbmVyIGZyb20gdGhlIGRpc3BhdGNoIHF1ZXVlLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBIYW5kbGVyIGZ1bmN0aW9uIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQuXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY29udGV4dF0gRXhlY3V0aW9uIGNvbnRleHQgKHNpbmNlIHlvdSBjYW4gYWRkIHRoZSBzYW1lIGhhbmRsZXIgbXVsdGlwbGUgdGltZXMgaWYgZXhlY3V0aW5nIGluIGEgZGlmZmVyZW50IGNvbnRleHQpLlxuICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gTGlzdGVuZXIgaGFuZGxlciBmdW5jdGlvbi5cbiAgICAgICAgICovXG4gICAgICAgIHJlbW92ZSA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgY29udGV4dCkge1xuICAgICAgICAgICAgdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgJ3JlbW92ZScpO1xuXG4gICAgICAgICAgICB2YXIgaSA9IHRoaXMuX2luZGV4T2ZMaXN0ZW5lcihsaXN0ZW5lciwgY29udGV4dCk7XG4gICAgICAgICAgICBpZiAoaSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kaW5nc1tpXS5fZGVzdHJveSgpOyAvL25vIHJlYXNvbiB0byBhIFNpZ25hbEJpbmRpbmcgZXhpc3QgaWYgaXQgaXNuJ3QgYXR0YWNoZWQgdG8gYSBzaWduYWxcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kaW5ncy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbGlzdGVuZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlbW92ZSBhbGwgbGlzdGVuZXJzIGZyb20gdGhlIFNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIHJlbW92ZUFsbCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoO1xuICAgICAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzW25dLl9kZXN0cm95KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9iaW5kaW5ncy5sZW5ndGggPSAwO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtudW1iZXJ9IE51bWJlciBvZiBsaXN0ZW5lcnMgYXR0YWNoZWQgdG8gdGhlIFNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIGdldE51bUxpc3RlbmVycyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9iaW5kaW5ncy5sZW5ndGg7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFN0b3AgcHJvcGFnYXRpb24gb2YgdGhlIGV2ZW50LCBibG9ja2luZyB0aGUgZGlzcGF0Y2ggdG8gbmV4dCBsaXN0ZW5lcnMgb24gdGhlIHF1ZXVlLlxuICAgICAgICAgKiA8cD48c3Ryb25nPklNUE9SVEFOVDo8L3N0cm9uZz4gc2hvdWxkIGJlIGNhbGxlZCBvbmx5IGR1cmluZyBzaWduYWwgZGlzcGF0Y2gsIGNhbGxpbmcgaXQgYmVmb3JlL2FmdGVyIGRpc3BhdGNoIHdvbid0IGFmZmVjdCBzaWduYWwgYnJvYWRjYXN0LjwvcD5cbiAgICAgICAgICogQHNlZSBTaWduYWwucHJvdG90eXBlLmRpc2FibGVcbiAgICAgICAgICovXG4gICAgICAgIGhhbHQgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLl9zaG91bGRQcm9wYWdhdGUgPSBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGlzcGF0Y2gvQnJvYWRjYXN0IFNpZ25hbCB0byBhbGwgbGlzdGVuZXJzIGFkZGVkIHRvIHRoZSBxdWV1ZS5cbiAgICAgICAgICogQHBhcmFtIHsuLi4qfSBbcGFyYW1zXSBQYXJhbWV0ZXJzIHRoYXQgc2hvdWxkIGJlIHBhc3NlZCB0byBlYWNoIGhhbmRsZXIuXG4gICAgICAgICAqL1xuICAgICAgICBkaXNwYXRjaCA6IGZ1bmN0aW9uIChwYXJhbXMpIHtcbiAgICAgICAgICAgIGlmICghIHRoaXMuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcGFyYW1zQXJyID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSxcbiAgICAgICAgICAgICAgICBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGJpbmRpbmdzO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5tZW1vcml6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3ByZXZQYXJhbXMgPSBwYXJhbXNBcnI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghIG4pIHtcbiAgICAgICAgICAgICAgICAvL3Nob3VsZCBjb21lIGFmdGVyIG1lbW9yaXplXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBiaW5kaW5ncyA9IHRoaXMuX2JpbmRpbmdzLnNsaWNlKCk7IC8vY2xvbmUgYXJyYXkgaW4gY2FzZSBhZGQvcmVtb3ZlIGl0ZW1zIGR1cmluZyBkaXNwYXRjaFxuICAgICAgICAgICAgdGhpcy5fc2hvdWxkUHJvcGFnYXRlID0gdHJ1ZTsgLy9pbiBjYXNlIGBoYWx0YCB3YXMgY2FsbGVkIGJlZm9yZSBkaXNwYXRjaCBvciBkdXJpbmcgdGhlIHByZXZpb3VzIGRpc3BhdGNoLlxuXG4gICAgICAgICAgICAvL2V4ZWN1dGUgYWxsIGNhbGxiYWNrcyB1bnRpbCBlbmQgb2YgdGhlIGxpc3Qgb3IgdW50aWwgYSBjYWxsYmFjayByZXR1cm5zIGBmYWxzZWAgb3Igc3RvcHMgcHJvcGFnYXRpb25cbiAgICAgICAgICAgIC8vcmV2ZXJzZSBsb29wIHNpbmNlIGxpc3RlbmVycyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIGFkZGVkIGF0IHRoZSBlbmQgb2YgdGhlIGxpc3RcbiAgICAgICAgICAgIGRvIHsgbi0tOyB9IHdoaWxlIChiaW5kaW5nc1tuXSAmJiB0aGlzLl9zaG91bGRQcm9wYWdhdGUgJiYgYmluZGluZ3Nbbl0uZXhlY3V0ZShwYXJhbXNBcnIpICE9PSBmYWxzZSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEZvcmdldCBtZW1vcml6ZWQgYXJndW1lbnRzLlxuICAgICAgICAgKiBAc2VlIFNpZ25hbC5tZW1vcml6ZVxuICAgICAgICAgKi9cbiAgICAgICAgZm9yZ2V0IDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMuX3ByZXZQYXJhbXMgPSBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZW1vdmUgYWxsIGJpbmRpbmdzIGZyb20gc2lnbmFsIGFuZCBkZXN0cm95IGFueSByZWZlcmVuY2UgdG8gZXh0ZXJuYWwgb2JqZWN0cyAoZGVzdHJveSBTaWduYWwgb2JqZWN0KS5cbiAgICAgICAgICogPHA+PHN0cm9uZz5JTVBPUlRBTlQ6PC9zdHJvbmc+IGNhbGxpbmcgYW55IG1ldGhvZCBvbiB0aGUgc2lnbmFsIGluc3RhbmNlIGFmdGVyIGNhbGxpbmcgZGlzcG9zZSB3aWxsIHRocm93IGVycm9ycy48L3A+XG4gICAgICAgICAqL1xuICAgICAgICBkaXNwb3NlIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVBbGwoKTtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9iaW5kaW5ncztcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9wcmV2UGFyYW1zO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgb2JqZWN0LlxuICAgICAgICAgKi9cbiAgICAgICAgdG9TdHJpbmcgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ1tTaWduYWwgYWN0aXZlOicrIHRoaXMuYWN0aXZlICsnIG51bUxpc3RlbmVyczonKyB0aGlzLmdldE51bUxpc3RlbmVycygpICsnXSc7XG4gICAgICAgIH1cblxuICAgIH07XG5cblxuICAgIC8vIE5hbWVzcGFjZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLyoqXG4gICAgICogU2lnbmFscyBuYW1lc3BhY2VcbiAgICAgKiBAbmFtZXNwYWNlXG4gICAgICogQG5hbWUgc2lnbmFsc1xuICAgICAqL1xuICAgIHZhciBzaWduYWxzID0gU2lnbmFsO1xuXG4gICAgLyoqXG4gICAgICogQ3VzdG9tIGV2ZW50IGJyb2FkY2FzdGVyXG4gICAgICogQHNlZSBTaWduYWxcbiAgICAgKi9cbiAgICAvLyBhbGlhcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgKHNlZSAjZ2gtNDQpXG4gICAgc2lnbmFscy5TaWduYWwgPSBTaWduYWw7XG5cblxuXG4gICAgLy9leHBvcnRzIHRvIG11bHRpcGxlIGVudmlyb25tZW50c1xuICAgIGlmKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCl7IC8vQU1EXG4gICAgICAgIGRlZmluZShmdW5jdGlvbiAoKSB7IHJldHVybiBzaWduYWxzOyB9KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKXsgLy9ub2RlXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gc2lnbmFscztcbiAgICB9IGVsc2UgeyAvL2Jyb3dzZXJcbiAgICAgICAgLy91c2Ugc3RyaW5nIGJlY2F1c2Ugb2YgR29vZ2xlIGNsb3N1cmUgY29tcGlsZXIgQURWQU5DRURfTU9ERVxuICAgICAgICAvKmpzbGludCBzdWI6dHJ1ZSAqL1xuICAgICAgICBnbG9iYWxbJ3NpZ25hbHMnXSA9IHNpZ25hbHM7XG4gICAgfVxuXG59KHRoaXMpKTtcbiJdfQ==
;