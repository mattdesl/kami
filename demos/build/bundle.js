require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * The core kami module provides basic 2D sprite batching and 
 * asset management.
 * 
 * @module kami
 */

var Class = require('klasse');
var Mesh = require('./glutils/Mesh');

var colorToFloat = require('./glutils/NumberUtils').colorToFloat;

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

},{"./glutils/Mesh":6,"./glutils/NumberUtils":7,"klasse":11}],2:[function(require,module,exports){
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

},{"klasse":11,"signals":"vsGaoX"}],3:[function(require,module,exports){
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

},{"./AbstractBatch":1,"./glutils/Mesh":6,"./glutils/ShaderProgram":8,"klasse":11}],4:[function(require,module,exports){
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
},{"klasse":11,"signals":"vsGaoX"}],5:[function(require,module,exports){
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
},{"klasse":11,"signals":"vsGaoX"}],6:[function(require,module,exports){
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
},{"klasse":11}],7:[function(require,module,exports){
/**
 * @module kami
 */

var int8 = new Int8Array(4);
var int32 = new Int32Array(int8.buffer, 0, 1);
var float32 = new Float32Array(int8.buffer, 0, 1);



/**
 * A singleton for number utilities. 
 * @class NumberUtils
 */
var NumberUtils = function() {

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
NumberUtils.intBitsToFloat = function(i) {
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
NumberUtils.floatToIntBits = function(f) {
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
NumberUtils.intToFloatColor = function(value) {
	return NumberUtils.intBitsToFloat( value & 0xfeffffff );
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
NumberUtils.colorToFloat = function(r, g, b, a) {
	var bits = (a << 24 | b << 16 | g << 8 | r);
	return NumberUtils.intToFloatColor(bits);
};

module.exports = NumberUtils;
},{}],8:[function(require,module,exports){
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
},{"klasse":11}],"kami":[function(require,module,exports){
module.exports=require('7Kjm00');
},{}],"7Kjm00":[function(require,module,exports){
/**
  Auto-generated Kami index file.
  Created on 2013-11-24
*/
module.exports = {
    //core classes
    'AbstractBatch':   require('./AbstractBatch.js'),
    'AssetManager':    require('./AssetManager.js'),
    'SpriteBatch':     require('./SpriteBatch.js'),
    'Texture':         require('./Texture.js'),
    'WebGLContext':    require('./WebGLContext.js'),
    'Mesh':            require('./glutils/Mesh.js'),
    'NumberUtils':     require('./glutils/NumberUtils.js'),
    'ShaderProgram':   require('./glutils/ShaderProgram.js')
};
},{"./AbstractBatch.js":1,"./AssetManager.js":2,"./SpriteBatch.js":3,"./Texture.js":4,"./WebGLContext.js":5,"./glutils/Mesh.js":6,"./glutils/NumberUtils.js":7,"./glutils/ShaderProgram.js":8}],11:[function(require,module,exports){
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pL2xpYi9BYnN0cmFjdEJhdGNoLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvQXNzZXRNYW5hZ2VyLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvU3ByaXRlQmF0Y2guanMiLCIvcHJvamVjdHMva2FtaS9rYW1pL2xpYi9UZXh0dXJlLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvV2ViR0xDb250ZXh0LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvZ2x1dGlscy9NZXNoLmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9saWIvZ2x1dGlscy9OdW1iZXJVdGlscy5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbGliL2dsdXRpbHMvU2hhZGVyUHJvZ3JhbS5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWkvbGliL2luZGV4LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMva2xhc3NlL2luZGV4LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS9ub2RlX21vZHVsZXMvc2lnbmFscy9kaXN0L3NpZ25hbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvY0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZjQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDaFdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM5SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVGhlIGNvcmUga2FtaSBtb2R1bGUgcHJvdmlkZXMgYmFzaWMgMkQgc3ByaXRlIGJhdGNoaW5nIGFuZCBcbiAqIGFzc2V0IG1hbmFnZW1lbnQuXG4gKiBcbiAqIEBtb2R1bGUga2FtaVxuICovXG5cbnZhciBDbGFzcyA9IHJlcXVpcmUoJ2tsYXNzZScpO1xudmFyIE1lc2ggPSByZXF1aXJlKCcuL2dsdXRpbHMvTWVzaCcpO1xuXG52YXIgY29sb3JUb0Zsb2F0ID0gcmVxdWlyZSgnLi9nbHV0aWxzL051bWJlclV0aWxzJykuY29sb3JUb0Zsb2F0O1xuXG4vKipcbiAqIEFuIGFic3RyYWN0IGJhdGNoZXIgY29tcG9zZWQgb2YgcXVhZHMgKHR3byB0cmlzLCBpbmRleGVkKS4gXG4gKlxuICogVGhpcyBpcyB1c2VkIGludGVybmFsbHk7IHVzZXJzIHNob3VsZCBsb29rIGF0IFxuICoge3sjY3Jvc3NMaW5rIFwiU3ByaXRlQmF0Y2hcIn19e3svY3Jvc3NMaW5rfX0gaW5zdGVhZC5cbiAqIFxuICogVGhlIGJhdGNoZXIgaXRzZWxmIGlzIG5vdCBtYW5hZ2VkIGJ5IFdlYkdMQ29udGV4dDsgaG93ZXZlciwgaXQgbWFrZXNcbiAqIHVzZSBvZiBNZXNoIGFuZCBUZXh0dXJlIHdoaWNoIHdpbGwgYmUgbWFuYWdlZC4gRm9yIHRoaXMgcmVhc29uLCB0aGUgYmF0Y2hlclxuICogZG9lcyBub3QgaG9sZCBhIGRpcmVjdCByZWZlcmVuY2UgdG8gdGhlIEdMIHN0YXRlLlxuICpcbiAqIFN1YmNsYXNzZXMgbXVzdCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZzogIFxuICoge3sjY3Jvc3NMaW5rIFwiQWJzdHJhY3RCYXRjaC9fY3JlYXRlU2hhZGVyOm1ldGhvZFwifX17ey9jcm9zc0xpbmt9fSAgXG4gKiB7eyNjcm9zc0xpbmsgXCJBYnN0cmFjdEJhdGNoL19jcmVhdGVWZXJ0ZXhBdHRyaWJ1dGVzOm1ldGhvZFwifX17ey9jcm9zc0xpbmt9fSAgXG4gKiB7eyNjcm9zc0xpbmsgXCJBYnN0cmFjdEJhdGNoL2dldFZlcnRleFNpemU6bWV0aG9kXCJ9fXt7L2Nyb3NzTGlua319ICBcbiAqIFxuICogQGNsYXNzICBBYnN0cmFjdEJhdGNoXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7V2ViR0xDb250ZXh0fSBjb250ZXh0IHRoZSBjb250ZXh0IHRoaXMgYmF0Y2hlciBiZWxvbmdzIHRvXG4gKiBAcGFyYW0ge051bWJlcn0gc2l6ZSB0aGUgb3B0aW9uYWwgc2l6ZSBvZiB0aGlzIGJhdGNoLCBpLmUuIG1heCBudW1iZXIgb2YgcXVhZHNcbiAqIEBkZWZhdWx0ICA1MDBcbiAqL1xudmFyIEFic3RyYWN0QmF0Y2ggPSBuZXcgQ2xhc3Moe1xuXG5cdC8vQ29uc3RydWN0b3Jcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gQWJzdHJhY3RCYXRjaChjb250ZXh0LCBzaXplKSB7XG5cdFx0aWYgKCFjb250ZXh0KVxuXHRcdFx0dGhyb3cgXCJHTCBjb250ZXh0IG5vdCBzcGVjaWZpZWRcIjtcblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXG5cdFx0dGhpcy5zaXplID0gc2l6ZSB8fCA1MDA7XG5cdFx0XG5cdFx0Ly8gNjU1MzUgaXMgbWF4IGluZGV4LCBzbyA2NTUzNSAvIDYgPSAxMDkyMi5cblx0XHRpZiAodGhpcy5zaXplID4gMTA5MjIpICAvLyh5b3UnZCBoYXZlIHRvIGJlIGluc2FuZSB0byB0cnkgYW5kIGJhdGNoIHRoaXMgbXVjaCB3aXRoIFdlYkdMKVxuXHRcdFx0dGhyb3cgXCJDYW4ndCBoYXZlIG1vcmUgdGhhbiAxMDkyMiBzcHJpdGVzIHBlciBiYXRjaDogXCIgKyB0aGlzLnNpemU7XG5cdFx0XHRcdFxuXHRcdC8vVE9ETzogc3VwcG9ydCBkZWZhdWx0U2hhZGVyL2N1c3RvbVNoYWRlciBcblx0XHR0aGlzLnNoYWRlciA9IHRoaXMuX2NyZWF0ZVNoYWRlcigpO1xuXG5cdFx0Ly9UT0RPOiBtYWtlIHRoZXNlIHB1YmxpY1xuXHRcdHRoaXMuX2JsZW5kU3JjID0gdGhpcy5jb250ZXh0LmdsLk9ORTtcblx0XHR0aGlzLl9ibGVuZERzdCA9IHRoaXMuY29udGV4dC5nbC5PTkVfTUlOVVNfU1JDX0FMUEhBXG5cdFx0dGhpcy5fYmxlbmRFbmFibGVkID0gdHJ1ZTtcblxuXHRcdHRoaXMuaWR4ID0gMDtcblx0XHR0aGlzLmRyYXdpbmcgPSBmYWxzZTtcblxuXHRcdHRoaXMubWVzaCA9IHRoaXMuX2NyZWF0ZU1lc2godGhpcy5zaXplKTtcblxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgQUJHUiBwYWNrZWQgY29sb3IsIGFzIGEgc2luZ2xlIGZsb2F0LiBUaGUgZGVmYXVsdFxuICAgICAgICAgKiB2YWx1ZSBpcyB0aGUgY29sb3Igd2hpdGUgKDI1NSwgMjU1LCAyNTUsIDI1NSkuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwcm9wZXJ0eSB7TnVtYmVyfSBjb2xvclxuICAgICAgICAgKiBAcmVhZE9ubHkgXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmNvbG9yID0gY29sb3JUb0Zsb2F0KDI1NSwgMjU1LCAyNTUsIDI1NSk7XG4gICAgICAgIFxuICAgICAgICAvKipcbiAgICAgICAgICogV2hldGhlciB0byBwcmVtdWx0aXBseSBhbHBoYSBvbiBjYWxscyB0byBzZXRDb2xvci4gXG4gICAgICAgICAqIFRoaXMgaXMgdHJ1ZSBieSBkZWZhdWx0LCBzbyB0aGF0IHdlIGNhbiBjb252ZW5pZW50bHkgd3JpdGU6XG4gICAgICAgICAqXG4gICAgICAgICAqICAgICBiYXRjaC5zZXRDb2xvcigxLCAwLCAwLCAwLjI1KTsgLy90aW50cyByZWQgd2l0aCAyNSUgb3BhY2l0eVxuICAgICAgICAgKlxuICAgICAgICAgKiBJZiBmYWxzZSwgeW91IG11c3QgcHJlbXVsdGlwbHkgdGhlIGNvbG9ycyB5b3Vyc2VsZiB0byBhY2hpZXZlXG4gICAgICAgICAqIHRoZSBzYW1lIHRpbnQsIGxpa2Ugc286XG4gICAgICAgICAqXG4gICAgICAgICAqICAgICBiYXRjaC5zZXRDb2xvcigwLjI1LCAwLCAwLCAwLjI1KTtcbiAgICAgICAgICogXG4gICAgICAgICAqIEBwcm9wZXJ0eSBwcmVtdWx0aXBseUNvbG9yXG4gICAgICAgICAqIEB0eXBlIHtCb29sZWFufVxuICAgICAgICAgKiBAZGVmYXVsdCAgdHJ1ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5wcmVtdWx0aXBsaWVkID0gdHJ1ZTtcblx0fSxcblxuXHQvKipcblx0ICogU2V0cyB0aGUgY29sb3Igb2YgdGhpcyBzcHJpdGUgYmF0Y2hlciwgd2hpY2ggaXMgdXNlZCBpbiBzdWJzZXF1ZW50IGRyYXdcblx0ICogY2FsbHMuIFRoaXMgZG9lcyBub3QgZmx1c2ggdGhlIGJhdGNoLlxuXHQgKlxuXHQgKiBJZiB0aHJlZSBvciBtb3JlIGFyZ3VtZW50cyBhcmUgc3BlY2lmaWVkLCB0aGlzIG1ldGhvZCBhc3N1bWVzIHRoYXQgUkdCIFxuXHQgKiBvciBSR0JBIGZsb2F0IHZhbHVlcyAoMC4wIHRvIDEuMCkgYXJlIGJlaW5nIHBhc3NlZC4gXG5cdCAqIFxuXHQgKiBJZiBsZXNzIHRoYW4gdGhyZWUgYXJndW1lbnRzIGFyZSBzcGVjaWZpZWQsIHdlIG9ubHkgY29uc2lkZXIgdGhlIGZpcnN0IFxuXHQgKiBhbmQgYXNzaWduIGl0IHRvIGFsbCBmb3VyIGNvbXBvbmVudHMgLS0gdGhpcyBpcyB1c2VmdWwgZm9yIHNldHRpbmcgdHJhbnNwYXJlbmN5IFxuXHQgKiBpbiBhIHByZW11bHRpcGxpZWQgYWxwaGEgc3RhZ2UuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHNldENvbG9yXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSByIHRoZSByZWQgY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBnIHRoZSBncmVlbiBjb21wb25lbnQsIG5vcm1hbGl6ZWRcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGIgdGhlIGJsdWUgY29tcG9uZW50LCBub3JtYWxpemVkXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBhIHRoZSBhbHBoYSBjb21wb25lbnQsIG5vcm1hbGl6ZWRcblx0ICovXG5cdHNldENvbG9yOiBmdW5jdGlvbihyLCBnLCBiLCBhKSB7XG5cdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gMykge1xuXHRcdFx0Ly9kZWZhdWx0IGFscGhhIHRvIG9uZSBcblx0XHRcdGEgPSAoYSB8fCBhID09PSAwKSA/IGEgOiAxLjA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHIgPSBnID0gYiA9IGEgPSBhcmd1bWVudHNbMF07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJlbXVsdGlwbGllZCkge1xuXHRcdFx0ciAqPSBhO1xuXHRcdFx0ZyAqPSBhO1xuXHRcdFx0YiAqPSBhO1xuXHRcdH1cblx0XHRcblx0XHR0aGlzLmNvbG9yID0gY29sb3JUb0Zsb2F0KFxuXHRcdFx0fn4ociAqIDI1NSksXG5cdFx0XHR+fihnICogMjU1KSxcblx0XHRcdH5+KGIgKiAyNTUpLFxuXHRcdFx0fn4oYSAqIDI1NSlcblx0XHQpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgZnJvbSB0aGUgY29uc3RydWN0b3IgdG8gY3JlYXRlIGEgbmV3IE1lc2ggXG5cdCAqIGJhc2VkIG9uIHRoZSBleHBlY3RlZCBiYXRjaCBzaXplLiBTaG91bGQgc2V0IHVwXG5cdCAqIHZlcnRzICYgaW5kaWNlcyBwcm9wZXJseS5cblx0ICpcblx0ICogVXNlcnMgc2hvdWxkIG5vdCBjYWxsIHRoaXMgZGlyZWN0bHk7IGluc3RlYWQsIGl0XG5cdCAqIHNob3VsZCBvbmx5IGJlIGltcGxlbWVudGVkIGJ5IHN1YmNsYXNzZXMuXG5cdCAqIFxuXHQgKiBAbWV0aG9kIF9jcmVhdGVNZXNoXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBzaXplIHRoZSBzaXplIHBhc3NlZCB0aHJvdWdoIHRoZSBjb25zdHJ1Y3RvclxuXHQgKi9cblx0X2NyZWF0ZU1lc2g6IGZ1bmN0aW9uKHNpemUpIHtcblx0XHQvL3RoZSB0b3RhbCBudW1iZXIgb2YgZmxvYXRzIGluIG91ciBiYXRjaFxuXHRcdHZhciBudW1WZXJ0cyA9IHNpemUgKiA0ICogdGhpcy5nZXRWZXJ0ZXhTaXplKCk7XG5cdFx0Ly90aGUgdG90YWwgbnVtYmVyIG9mIGluZGljZXMgaW4gb3VyIGJhdGNoXG5cdFx0dmFyIG51bUluZGljZXMgPSBzaXplICogNjtcblx0XHR2YXIgZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG5cblx0XHQvL3ZlcnRleCBkYXRhXG5cdFx0dGhpcy52ZXJ0aWNlcyA9IG5ldyBGbG9hdDMyQXJyYXkobnVtVmVydHMpO1xuXHRcdC8vaW5kZXggZGF0YVxuXHRcdHRoaXMuaW5kaWNlcyA9IG5ldyBVaW50MTZBcnJheShudW1JbmRpY2VzKTsgXG5cdFx0XG5cdFx0Zm9yICh2YXIgaT0wLCBqPTA7IGkgPCBudW1JbmRpY2VzOyBpICs9IDYsIGogKz0gNCkgXG5cdFx0e1xuXHRcdFx0dGhpcy5pbmRpY2VzW2kgKyAwXSA9IGogKyAwOyBcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgMV0gPSBqICsgMTtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgMl0gPSBqICsgMjtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgM10gPSBqICsgMDtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgNF0gPSBqICsgMjtcblx0XHRcdHRoaXMuaW5kaWNlc1tpICsgNV0gPSBqICsgMztcblx0XHR9XG5cblx0XHR2YXIgbWVzaCA9IG5ldyBNZXNoKHRoaXMuY29udGV4dCwgZmFsc2UsIFxuXHRcdFx0XHRcdFx0bnVtVmVydHMsIG51bUluZGljZXMsIHRoaXMuX2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXMoKSk7XG5cdFx0bWVzaC52ZXJ0aWNlcyA9IHRoaXMudmVydGljZXM7XG5cdFx0bWVzaC5pbmRpY2VzID0gdGhpcy5pbmRpY2VzO1xuXHRcdG1lc2gudmVydGV4VXNhZ2UgPSBnbC5EWU5BTUlDX0RSQVc7XG5cdFx0bWVzaC5pbmRleFVzYWdlID0gZ2wuU1RBVElDX0RSQVc7XG5cdFx0bWVzaC5kaXJ0eSA9IHRydWU7XG5cdFx0cmV0dXJuIG1lc2g7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBzaGFkZXIgZm9yIHRoaXMgYmF0Y2guIElmIHlvdSBwbGFuIHRvIHN1cHBvcnRcblx0ICogbXVsdGlwbGUgaW5zdGFuY2VzIG9mIHlvdXIgYmF0Y2gsIGl0IG1heSBvciBtYXkgbm90IGJlIHdpc2Vcblx0ICogdG8gdXNlIGEgc2hhcmVkIHNoYWRlciB0byBzYXZlIHJlc291cmNlcy5cblx0ICogXG5cdCAqIFRoaXMgbWV0aG9kIGluaXRpYWxseSB0aHJvd3MgYW4gZXJyb3I7IHNvIGl0IG11c3QgYmUgb3ZlcnJpZGRlbiBieVxuXHQgKiBzdWJjbGFzc2VzIG9mIEFic3RyYWN0QmF0Y2guXG5cdCAqXG5cdCAqIEBtZXRob2QgIF9jcmVhdGVTaGFkZXJcblx0ICogQHJldHVybiB7TnVtYmVyfSB0aGUgc2l6ZSBvZiBhIHZlcnRleCwgaW4gIyBvZiBmbG9hdHNcblx0ICovXG5cdF9jcmVhdGVTaGFkZXI6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IFwiX2NyZWF0ZVNoYWRlciBub3QgaW1wbGVtZW50ZWRcIlxuXHR9LFx0XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYW4gYXJyYXkgb2YgdmVydGV4IGF0dHJpYnV0ZXMgZm9yIHRoaXMgbWVzaDsgXG5cdCAqIHN1YmNsYXNzZXMgc2hvdWxkIGltcGxlbWVudCB0aGlzIHdpdGggdGhlIGF0dHJpYnV0ZXMgXG5cdCAqIGV4cGVjdGVkIGZvciB0aGVpciBiYXRjaC5cblx0ICpcblx0ICogVGhpcyBtZXRob2QgaW5pdGlhbGx5IHRocm93cyBhbiBlcnJvcjsgc28gaXQgbXVzdCBiZSBvdmVycmlkZGVuIGJ5XG5cdCAqIHN1YmNsYXNzZXMgb2YgQWJzdHJhY3RCYXRjaC5cblx0ICpcblx0ICogQG1ldGhvZCBfY3JlYXRlVmVydGV4QXR0cmlidXRlc1xuXHQgKiBAcmV0dXJuIHtBcnJheX0gYW4gYXJyYXkgb2YgTWVzaC5WZXJ0ZXhBdHRyaWIgb2JqZWN0c1xuXHQgKi9cblx0X2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IFwiX2NyZWF0ZVZlcnRleEF0dHJpYnV0ZXMgbm90IGltcGxlbWVudGVkXCI7XG5cdH0sXG5cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIGZsb2F0cyBwZXIgdmVydGV4IGZvciB0aGlzIGJhdGNoZXIuXG5cdCAqIFxuXHQgKiBUaGlzIG1ldGhvZCBpbml0aWFsbHkgdGhyb3dzIGFuIGVycm9yOyBzbyBpdCBtdXN0IGJlIG92ZXJyaWRkZW4gYnlcblx0ICogc3ViY2xhc3NlcyBvZiBBYnN0cmFjdEJhdGNoLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBnZXRWZXJ0ZXhTaXplXG5cdCAqIEByZXR1cm4ge051bWJlcn0gdGhlIHNpemUgb2YgYSB2ZXJ0ZXgsIGluICMgb2YgZmxvYXRzXG5cdCAqL1xuXHRnZXRWZXJ0ZXhTaXplOiBmdW5jdGlvbigpIHtcblx0XHR0aHJvdyBcImdldFZlcnRleFNpemUgbm90IGltcGxlbWVudGVkXCI7XG5cdH0sXG5cblx0XG5cdC8qKiBcblx0ICogQmVnaW5zIHRoZSBzcHJpdGUgYmF0Y2guIFRoaXMgd2lsbCBiaW5kIHRoZSBzaGFkZXJcblx0ICogYW5kIG1lc2guIFN1YmNsYXNzZXMgbWF5IHdhbnQgdG8gZGlzYWJsZSBkZXB0aCBvciBcblx0ICogc2V0IHVwIGJsZW5kaW5nLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBiZWdpblxuXHQgKi9cblx0YmVnaW46IGZ1bmN0aW9uKCkgIHtcblx0XHRpZiAodGhpcy5kcmF3aW5nKSBcblx0XHRcdHRocm93IFwiYmF0Y2guZW5kKCkgbXVzdCBiZSBjYWxsZWQgYmVmb3JlIGJlZ2luXCI7XG5cdFx0dGhpcy5kcmF3aW5nID0gdHJ1ZTtcblxuXHRcdHRoaXMuc2hhZGVyLmJpbmQoKTtcblxuXHRcdC8vYmluZCB0aGUgYXR0cmlidXRlcyBub3cgdG8gYXZvaWQgcmVkdW5kYW50IGNhbGxzXG5cdFx0dGhpcy5tZXNoLmJpbmQodGhpcy5zaGFkZXIpO1xuXHR9LFxuXG5cdC8qKiBcblx0ICogRW5kcyB0aGUgc3ByaXRlIGJhdGNoLiBUaGlzIHdpbGwgZmx1c2ggYW55IHJlbWFpbmluZyBcblx0ICogZGF0YSBhbmQgc2V0IEdMIHN0YXRlIGJhY2sgdG8gbm9ybWFsLlxuXHQgKiBcblx0ICogQG1ldGhvZCAgZW5kXG5cdCAqL1xuXHRlbmQ6IGZ1bmN0aW9uKCkgIHtcblx0XHRpZiAoIXRoaXMuZHJhd2luZylcblx0XHRcdHRocm93IFwiYmF0Y2guYmVnaW4oKSBtdXN0IGJlIGNhbGxlZCBiZWZvcmUgZW5kXCI7XG5cdFx0aWYgKHRoaXMuaWR4ID4gMClcblx0XHRcdHRoaXMuZmx1c2goKTtcblx0XHR0aGlzLmRyYXdpbmcgPSBmYWxzZTtcblxuXHRcdHRoaXMubWVzaC51bmJpbmQodGhpcy5zaGFkZXIpO1xuXHR9LFxuXG5cdC8qKiBcblx0ICogQ2FsbGVkIGJlZm9yZSByZW5kZXJpbmcgdG8gYmluZCBuZXcgdGV4dHVyZXMuXG5cdCAqIFRoaXMgbWV0aG9kIGRvZXMgbm90aGluZyBieSBkZWZhdWx0LlxuXHQgKlxuXHQgKiBAbWV0aG9kICBfcHJlUmVuZGVyXG5cdCAqL1xuXHRfcHJlUmVuZGVyOiBmdW5jdGlvbigpICB7XG5cdH0sXG5cblx0LyoqIFxuXHQgKiBDYWxsZWQgYWZ0ZXIgZmx1c2hpbmcgdGhlIGJhdGNoLiBUaGlzIG1ldGhvZFxuXHQgKiBkb2VzIG5vdGhpbmcgYnkgZGVmYXVsdC5cblx0ICpcblx0ICogQG1ldGhvZCAgX3Bvc3RSZW5kZXJcblx0ICovXG5cdF9wb3N0UmVuZGVyOiBmdW5jdGlvbigpIHtcblx0fSxcblxuXHQvKipcblx0ICogRmx1c2hlcyB0aGUgYmF0Y2ggYnkgcHVzaGluZyB0aGUgY3VycmVudCBkYXRhXG5cdCAqIHRvIEdMLlxuXHQgKiBcblx0ICogQG1ldGhvZCBmbHVzaFxuXHQgKi9cblx0Zmx1c2g6IGZ1bmN0aW9uKCkgIHtcblx0XHRpZiAodGhpcy5pZHg9PT0wKVxuXHRcdFx0cmV0dXJuO1xuXG5cdCAgICB2YXIgZ2wgPSB0aGlzLmdsO1xuXHQgICAgXG5cdFx0dGhpcy5fcHJlUmVuZGVyKCk7XG5cblx0XHQvL251bWJlciBvZiBzcHJpdGVzIGluIGJhdGNoXG5cdFx0dmFyIG51bUNvbXBvbmVudHMgPSB0aGlzLmdldFZlcnRleFNpemUoKTtcblx0XHR2YXIgc3ByaXRlQ291bnQgPSAodGhpcy5pZHggLyAobnVtQ29tcG9uZW50cyAqIDQpKTtcblx0IFx0XG5cdCBcdC8vZHJhdyB0aGUgc3ByaXRlc1xuXHQgICAgdmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHQgICAgdGhpcy5tZXNoLnZlcnRpY2VzRGlydHkgPSB0cnVlO1xuXHQgICAgdGhpcy5tZXNoLmRyYXcoZ2wuVFJJQU5HTEVTLCBzcHJpdGVDb3VudCAqIDYsIDAsIHRoaXMuaWR4KTtcblxuXHQgICAgdGhpcy5pZHggPSAwO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBBZGRzIGEgc3ByaXRlIHRvIHRoaXMgYmF0Y2guXG5cdCAqIFRoZSBzcGVjaWZpY3MgZGVwZW5kIG9uIHRoZSBzcHJpdGUgYmF0Y2ggaW1wbGVtZW50YXRpb24uXG5cdCAqXG5cdCAqIEBtZXRob2QgZHJhd1xuXHQgKiBAcGFyYW0gIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIGZvciB0aGlzIHNwcml0ZVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHggICAgICAgdGhlIHggcG9zaXRpb24sIGRlZmF1bHRzIHRvIHplcm9cblx0ICogQHBhcmFtICB7TnVtYmVyfSB5ICAgICAgIHRoZSB5IHBvc2l0aW9uLCBkZWZhdWx0cyB0byB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICB0aGUgd2lkdGgsIGRlZmF1bHRzIHRvIHRoZSB0ZXh0dXJlIHdpZHRoXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0ICB0aGUgaGVpZ2h0LCBkZWZhdWx0cyB0byB0aGUgdGV4dHVyZSBoZWlnaHRcblx0ICogQHBhcmFtICB7TnVtYmVyfSB1MSAgICAgIHRoZSBmaXJzdCBVIGNvb3JkaW5hdGUsIGRlZmF1bHQgemVyb1xuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHYxICAgICAgdGhlIGZpcnN0IFYgY29vcmRpbmF0ZSwgZGVmYXVsdCB6ZXJvXG5cdCAqIEBwYXJhbSAge051bWJlcn0gdTIgICAgICB0aGUgc2Vjb25kIFUgY29vcmRpbmF0ZSwgZGVmYXVsdCBvbmVcblx0ICogQHBhcmFtICB7TnVtYmVyfSB2MiAgICAgIHRoZSBzZWNvbmQgViBjb29yZGluYXRlLCBkZWZhdWx0IG9uZVxuXHQgKi9cblx0ZHJhdzogZnVuY3Rpb24odGV4dHVyZSwgeCwgeSwgd2lkdGgsIGhlaWdodCwgdTEsIHYxLCB1MiwgdjIpIHtcblx0fSxcblxuXHQvKipcblx0ICogQWRkcyBhIHNpbmdsZSBxdWFkIG1lc2ggdG8gdGhpcyBzcHJpdGUgYmF0Y2ggZnJvbSB0aGUgZ2l2ZW5cblx0ICogYXJyYXkgb2YgdmVydGljZXMuXG5cdCAqIFRoZSBzcGVjaWZpY3MgZGVwZW5kIG9uIHRoZSBzcHJpdGUgYmF0Y2ggaW1wbGVtZW50YXRpb24uXG5cdCAqXG5cdCAqIEBtZXRob2QgIGRyYXdWZXJ0aWNlc1xuXHQgKiBAcGFyYW0ge1RleHR1cmV9IHRleHR1cmUgdGhlIHRleHR1cmUgd2UgYXJlIGRyYXdpbmcgZm9yIHRoaXMgc3ByaXRlXG5cdCAqIEBwYXJhbSB7RmxvYXQzMkFycmF5fSB2ZXJ0cyBhbiBhcnJheSBvZiB2ZXJ0aWNlc1xuXHQgKiBAcGFyYW0ge051bWJlcn0gb2ZmIHRoZSBvZmZzZXQgaW50byB0aGUgdmVydGljZXMgYXJyYXkgdG8gcmVhZCBmcm9tXG5cdCAqL1xuXHRkcmF3VmVydGljZXM6IGZ1bmN0aW9uKHRleHR1cmUsIHZlcnRzLCBvZmYpICB7XG5cdH0sXG5cblx0LyoqXG5cdCAqIERlc3Ryb3lzIHRoZSBiYXRjaCwgZGVsZXRpbmcgaXRzIGJ1ZmZlcnMgYW5kIHJlbW92aW5nIGl0IGZyb20gdGhlXG5cdCAqIFdlYkdMQ29udGV4dCBtYW5hZ2VtZW50LiBUcnlpbmcgdG8gdXNlIHRoaXNcblx0ICogYmF0Y2ggYWZ0ZXIgZGVzdHJveWluZyBpdCBjYW4gbGVhZCB0byB1bnByZWRpY3RhYmxlIGJlaGF2aW91ci5cblx0ICpcblx0ICogQG1ldGhvZCBkZXN0cm95XG5cdCAqL1xuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnZlcnRpY2VzID0gW107XG5cdFx0dGhpcy5pbmRpY2VzID0gW107XG5cdFx0dGhpcy5zaXplID0gdGhpcy5tYXhWZXJ0aWNlcyA9IDA7XG5cblx0XHR0aGlzLm1lc2guZGVzdHJveSgpO1xuXHR9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBBYnN0cmFjdEJhdGNoO1xuIiwiLyoqXG4gKiBAbW9kdWxlIGthbWlcbiAqL1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcbnZhciBTaWduYWwgPSByZXF1aXJlKCdzaWduYWxzJyk7XG5cbi8qKlxuICogVGhpcyBpcyBhIHV0aWxpdHkgd2hpY2ggbWFrZXMgYXNzZXQgbG9hZGluZyBjbGVhbmVyXG4gKiBhbmQgc2ltcGxlciwgZXNwZWNpYWxseSB3aXRoIHJlZ2FyZCB0byBhc3luY2hyb25vdXMgaW1hZ2VcbiAqIGxvYWRpbmcgYW5kIFdlYkdMIGNvbnRleHQgbG9zcy5cbiAqXG4gKlxuICogQmFzaWMgdXNhZ2UgbG9va3MgbGlrZSB0aGlzOlxuICpcbiAqICAgICAvL0NyZWF0ZSBhbiBhc3NldCBtYW5hZ2VyIFxuICogICAgIHZhciBhc3NldHMgPSBuZXcgQXNzZXRNYW5hZ2VyKGNvbnRleHQpO1xuICogIFxuICogICAgIC8vaW1hZ2UgdHlwZXMgd2lsbCByZXR1cm4gYSBuZXcgVGV4dHVyZVxuICogICAgIHZhciB0ZXgwID0gYXNzZXRzLmxvYWQoXCJpbWcvZ3Jhc3MucG5nXCIpO1xuICogICAgIHZhciB0ZXgxID0gYXNzZXRzLmxvYWQoXCJpbWcvc2NlbmUucG5nXCIpO1xuICpcbiAqICAgICAuLi4gaW5zaWRlIGdhbWUgbG9vcCAuLi5cbiAqXG4gKiAgICAgICAgIGlmIChhc3NldHMudXBkYXRlKCkpIHtcbiAqICAgICAgICAgICAgIC8vIGFsbCBhc3NldHMgYXJlIGxvYWRlZCwgd2UgY2FuIHJlbmRlci5cbiAqICAgICAgICAgfSBlbHNlIHtcbiAqICAgICAgICAgICAgIC8vIG5vdCBhbGwgYXNzZXRzIGFyZSBsb2FkZWQuIHdlIG5lZWRcbiAqICAgICAgICAgICAgIC8vIHRvIHNob3cgb3VyIHByZWxvYWRlci5cbiAqICAgICAgICAgfVxuICpcbiAqIEN1cnJlbnRseSB0aGlzIGNsYXNzIG9ubHkgc3VwcG9ydHMgaW1hZ2UgbG9hZGluZyxcbiAqIGFsdGhvdWdoIGluIHRoZSBmdXR1cmUgb3RoZXJzIGNvdWxkIGJlIGFkZGVkIGZvciBcbiAqIGNvbXByZXNzZWQgdGV4dHVyZXMsIHNwcml0ZSBzaGVldHMsIGFuZCBzbyBmb3J0aC5cbiAqXG4gKiBDcmVhdGluZyBhIG5ldyBhc3NldCBtYW5hZ2VyIHdpbGwgbGlzdGVuIGZvciBjb250ZXh0XG4gKiBsb3NzIGV2ZW50cyBvbiB0aGUgZ2l2ZW4gV2ViR0xDb250ZXh0LiBXaGVuIHRoaXMgaGFwcGVucyxcbiAqIGFsbCBhc3NldHMgd2lsbCBiZSBpbnZhbGlkYXRlZCBhbmQgYWRkZWQgdG8gdGhlIGxvYWRpbmcgcXVldWUuXG4gKiBBcyBzdWNoLCB1cGRhdGUoKSB3aWxsIHJldHVybiBmYWxzZSB1bnRpbCB0aGUgYXNzZXRzIGhhdmUgYmVlblxuICogcmUtbG9hZGVkLlxuICogXG4gKiBAY2xhc3MgIEFzc2V0TWFuYWdlclxuICogQGNvbnN0cnVjdG9yIFx0XG4gKiBAcGFyYW0ge1dlYkdMQ29udGV4dH0gY29udGV4dCB0aGUgV2ViR0xDb250ZXh0IGZvciB0aGlzIG1hbmFnZXJcbiAqL1xudmFyIEFzc2V0TWFuYWdlciA9IG5ldyBDbGFzcyh7XG5cdFxuXG5cdC8qKlxuXHQgKiBBIHJlYWQtb25seSBwcm9wZXJ0eSB0aGF0IGRlc2NyaWJlcyB0aGUgbnVtYmVyIG9mIFxuXHQgKiBhc3NldHMgcmVtYWluaW5nIHRvIGJlIGxvYWRlZC5cblx0ICpcblx0ICogQGF0dHJpYnV0ZSByZW1haW5pbmdcblx0ICogQHR5cGUge051bWJlcn1cblx0ICogQHJlYWRPbmx5XG5cdCAqL1xuXHRyZW1haW5pbmc6IHtcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX190b3RhbEl0ZW1zIC0gdGhpcy5fX2xvYWRDb3VudDtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqIEEgcmVhZC1vbmx5IHByb3BlcnR5IHRoYXQgZGVzY3JpaWJlcyB0aGUgdG90YWxcblx0ICogbnVtYmVyIG9mIGFzc2V0cyBpbiB0aGlzIEFzc2V0TWFuYWdlci5cblx0ICpcblx0ICogQGF0dHJpYnV0ZSB0b3RhbFxuXHQgKiBAcmVhZE9ubHlcblx0ICogQHR5cGUge051bWJlcn1cblx0ICovXG5cdHRvdGFsOiB7XG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLl9fdG90YWxJdGVtcztcblx0XHR9XG5cdH0sXG5cblx0Ly9Db25zdHJ1Y3RvclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBBc3NldE1hbmFnZXIoY29udGV4dCkge1xuXHRcdGlmICghY29udGV4dClcblx0XHRcdHRocm93IFwibm8gY29udGV4dCBkZWZpbmVkIGZvciBBc3NldE1hbmFnZXJcIjtcblxuXHRcdC8qKlxuXHRcdCAqIEFuIGFycmF5IG9mIGFzc2V0cyB0aGF0IHRoaXMgQXNzZXRNYW5hZ2VyIGlzIGhhbmRsaW5nLlxuXHRcdCAqIFRoaXMgc2hvdWxkIG5vdCBiZSBtb2RpZmllZCBkaXJlY3RseS5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkgYXNzZXRzXG5cdFx0ICogQHR5cGUge0FycmF5fVxuXHRcdCAqL1xuXHRcdHRoaXMuYXNzZXRzID0gW107XG5cblx0XHQvKipcblx0XHQgKiBUaGUgcXVldWUgb2YgdGFza3MgdG8gbG9hZC4gRWFjaCBjb250YWluc1xuXHRcdCAqIGFuXG5cdFx0ICoge3sjY3Jvc3NMaW5rIFwiQXNzZXRNYW5hZ2VyLkRlc2NyaXB0b3JcIn19e3svY3Jvc3NMaW5rfX0uXG5cdFx0ICpcblx0XHQgKiBMb2FkaW5nIGEgdGFzayB3aWxsIHBvcCBpdCBvZmYgdGhpcyBsaXN0IGFuZCBmaXJlIHRoZSBhc3luY1xuXHRcdCAqIG9yIHN5bmNocm9ub3VzIHByb2Nlc3MuXG5cdFx0ICpcblx0XHQgKiBUaGlzIHNob3VsZCBub3QgYmUgbW9kaWZpZWQgZGlyZWN0bHkuXG5cdFx0ICpcblx0XHQgKiBAcHJvcGVydHkgdGFza3Ncblx0XHQgKiBAcHJvdGVjdGVkXG5cdFx0ICogQHR5cGUge0FycmF5fVxuXHRcdCAqL1xuXHRcdHRoaXMudGFza3MgPSBbXTtcblxuXHRcdC8vUHJpdmF0ZSBzdHVmZi4uLiBkbyBub3QgdG91Y2ghXG5cblx0XHR0aGlzLl9fbG9hZENvdW50ID0gMDtcblx0XHR0aGlzLl9fdG90YWxJdGVtcyA9IDA7XG5cdFx0dGhpcy5fX2xvYWRDYWxsYmFja0Z1bmMgPSBudWxsO1xuXHRcdHRoaXMuX19pbnZhbGlkYXRlRnVuYyA9IG51bGw7XG5cblx0XHQvLyBTaWduYWxzIFxuXHRcdFxuXHRcdC8qKlxuXHRcdCAqIEEgc2lnbmFsIGRpc3BhdGNoZWQgd2hlbiBsb2FkaW5nIGZpcnN0IGJlZ2lucywgXG5cdFx0ICogaS5lLiB3aGVuIHVwZGF0ZSgpIGlzIGNhbGxlZCBhbmQgdGhlIGxvYWRpbmcgcXVldWUgaXMgdGhlXG5cdFx0ICogc2FtZSBzaXplIGFzIHRoZSB0b3RhbCBhc3NldCBsaXN0LlxuXHRcdCAqXG5cdFx0ICogQGV2ZW50IGxvYWRTdGFydGVkXG5cdFx0ICogQHR5cGUge1NpZ25hbH1cblx0XHQgKi9cblx0XHR0aGlzLmxvYWRTdGFydGVkID0gbmV3IFNpZ25hbCgpO1xuXG5cdFx0LyoqXG5cdFx0ICogQSBzaWduYWwgZGlzcGF0Y2hlZCB3aGVuIGFsbCBhc3NldHMgaGF2ZSBiZWVuIGxvYWRlZFxuXHRcdCAqIChpLmUuIHRoZWlyIGFzeW5jIHRhc2tzIGZpbmlzaGVkKS5cblx0XHQgKlxuXHRcdCAqIEBldmVudCBsb2FkRmluaXNoZWRcblx0XHQgKiBAdHlwZSB7U2lnbmFsfVxuXHRcdCAqL1xuXHRcdHRoaXMubG9hZEZpbmlzaGVkID0gbmV3IFNpZ25hbCgpO1xuXG5cdFx0LyoqXG5cdFx0ICogQSBzaWduYWwgZGlzcGF0Y2hlZCBvbiBwcm9ncmVzcyB1cGRhdGVzLCBvbmNlIGFuIGFzc2V0XG5cdFx0ICogaGFzIGJlZW4gbG9hZGVkIGluIGZ1bGwgKGkuZS4gaXRzIGFzeW5jIHRhc2sgZmluaXNoZWQpLlxuXHRcdCAqXG5cdFx0ICogVGhpcyBwYXNzZXMgdGhyZWUgYXJndW1lbnRzIHRvIHRoZSBsaXN0ZW5lciBmdW5jdGlvbjpcblx0XHQgKiBcblx0XHQgKiAtIGBjdXJyZW50YCBudW1iZXIgb2YgYXNzZXRzIHRoYXQgaGF2ZSBiZWVuIGxvYWRlZFxuXHRcdCAqIC0gYHRvdGFsYCBudW1iZXIgb2YgYXNzZXRzIHRvIGxvYWRlZFxuXHRcdCAqIC0gYG5hbWVgIG9mIHRoZSBhc3NldCB3aGljaCB3YXMganVzdCBsb2FkZWRcblx0XHQgKiAgXG5cdFx0ICogQGV2ZW50IGxvYWRQcm9ncmVzc1xuXHRcdCAqIEB0eXBlIHtbdHlwZV19XG5cdFx0ICovXG5cdFx0dGhpcy5sb2FkUHJvZ3Jlc3MgPSBuZXcgU2lnbmFsKCk7XG5cblx0XHQvKipcblx0XHQgKiBBIHNpZ25hbCBkaXNwYXRjaGVkIG9uIHByb2JsZW1hdGljIGxvYWQ7IGUuZy4gaWZcblx0XHQgKiB0aGUgaW1hZ2Ugd2FzIG5vdCBmb3VuZCBhbmQgXCJvbmVycm9yXCIgd2FzIHRyaWdnZXJlZC4gXG5cdFx0ICogVGhlIGZpcnN0IGFyZ3VtZW50IHBhc3NlZCB0byB0aGUgbGlzdGVuZXIgd2lsbCBiZSBcblx0XHQgKiB0aGUgc3RyaW5nIG5hbWUgb2YgdGhlIGFzc2V0LlxuXHRcdCAqXG5cdFx0ICogVGhlIGFzc2V0IG1hbmFnZXIgd2lsbCBjb250aW51ZSBsb2FkaW5nIHN1YnNlcXVlbnQgYXNzZXRzLlxuXHRcdCAqXG5cdFx0ICogVGhpcyBpcyBkaXNwYXRjaGVkIGFmdGVyIHRoZSBzdGF0dXMgb2YgdGhlIGFzc2V0IGlzXG5cdFx0ICogc2V0IHRvIFN0YXR1cy5MT0FEX0ZBSUwsIGFuZCBiZWZvcmUgdGhlIGxvYWRQcm9ncmVzc1xuXHRcdCAqIHNpZ25hbCBpcyBkaXNwYXRjaGVkLlxuXHRcdCAqXG5cdFx0ICogQGV2ZW50IGxvYWRFcnJvclxuXHRcdCAqIEB0eXBlIHtTaWduYWx9XG5cdFx0ICovXG5cdFx0dGhpcy5sb2FkRXJyb3IgPSBuZXcgU2lnbmFsKCk7XG5cblx0XHR0aGlzLmxvYWRlcnMgPSB7fTtcblxuXHRcdHRoaXMuX19pbnZhbGlkYXRlRnVuYyA9IHRoaXMuaW52YWxpZGF0ZS5iaW5kKHRoaXMpO1xuXHRcdHRoaXMuX19sb2FkQ2FsbGJhY2tGdW5jID0gdGhpcy5fX2xvYWRDYWxsYmFjay5iaW5kKHRoaXMpO1xuXG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLmNvbnRleHQubG9zdC5hZGQodGhpcy5fX2ludmFsaWRhdGVGdW5jKTtcblx0fSxcblxuXHQvKipcblx0ICogRGVzdHJveXMgdGhpcyBhc3NldCBtYW5hZ2VyOyByZW1vdmluZyBpdHMgbGlzdGVuZXJzXG5cdCAqIHdpdGggV2ViR0xDb250ZXh0IGFuZCBkZWxldGluZyB0aGUgYXNzZXRzIGFycmF5LlxuXHQgKlxuXHQgKiBAbWV0aG9kICBkZXN0cm95XG5cdCAqL1xuXHRkZXN0cm95OiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmFzc2V0cyA9IFtdO1xuXHRcdHRoaXMudGFza3MgPSBbXTtcblx0XHR0aGlzLl9fbG9hZENvdW50ID0gdGhpcy5fX3RvdGFsSXRlbXMgPSAwO1xuXHRcdHRoaXMuY29udGV4dC5sb3N0LnJlbW92ZSh0aGlzLl9faW52YWxpZGF0ZUZ1bmMpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgdG8gaW52YWxpZGF0ZSB0aGUgYXNzZXQgbWFuYWdlclxuXHQgKiBhbmQgcmVxdWlyZSBhbGwgYXNzZXRzIHRvIGJlIHJlLWxvYWRlZC5cblx0ICogVGhpcyBpcyBjYWxsZWQgaW50ZXJuYWxseSBvbiBjb250ZXh0IGxvc3MuXG5cdCAqXG5cdCAqIEBwcm90ZWN0ZWRcblx0ICogQG1ldGhvZCBpbnZhbGlkYXRlXG5cdCAqL1xuXHRpbnZhbGlkYXRlOiBmdW5jdGlvbigpIHtcblx0XHQvL21hcmsgYWxsIGFzIG5vdCB5ZXQgbG9hZGVkXG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMuYXNzZXRzLmxlbmd0aDsgaSsrKSBcblx0XHRcdHRoaXMuYXNzZXRzW2ldLmxvYWRlZCA9IGZhbHNlO1xuXG5cdFx0Ly9jb3B5IG91ciBhc3NldHMgdG8gYSBxdWV1ZSB3aGljaCBjYW4gYmUgcG9wcGVkXG5cdFx0dGhpcy50YXNrcyA9IHRoaXMuYXNzZXRzLnNsaWNlKCk7XG5cblx0XHR0aGlzLl9fbG9hZENvdW50ID0gdGhpcy5fX3RvdGFsSXRlbXMgPSB0aGlzLnRhc2tzLmxlbmd0aDtcblx0fSxcblxuXHQvKipcblx0ICogUHVzaGVzIGFuIGFzc2V0IG9udG8gdGhpcyBzdGFjay4gVGhpc1xuXHQgKiBhdHRlbXB0cyB0byBkZXRlY3QgdGhlIGxvYWRlciBmb3IgeW91IGJhc2VkXG5cdCAqIG9uIHRoZSBhc3NldCBuYW1lJ3MgZmlsZSBleHRlbnNpb24uIElmIHRoZVxuXHQgKiBhc3NldCBuYW1lIGRvZXNuJ3QgaGF2ZSBhIGtub3duIGZpbGUgZXh0ZW5zaW9uLFxuXHQgKiBvciBpZiB0aGVyZSBpcyBubyBsb2FkZXIgcmVnaXN0ZXJlZCBmb3IgdGhhdCBmaWxlbmFtZSxcblx0ICogdGhpcyBtZXRob2QgdGhyb3dzIGFuIGVycm9yLiBcblx0ICpcblx0ICogVGhlIGZpcnN0IGFyZ3VtZW50IGlzIHRoZSBhc3NldCBuYW1lLiBBbnkgc3Vic2VxdWVudFxuXHQgKiBhcmd1bWVudHMgd2lsbCBiZSBwYXNzZWQgYWxvbmcgdG8gdGhlIGxvYWRlciBmb3IgZnVydGhlclxuXHQgKiBwcm9jZXNzaW5nLlxuXHQgKlxuXHQgKiBUaGUgcmV0dXJuIHZhbHVlIG9mIHRoaXMgbWV0aG9kIGlzIGRldGVybWluZWQgYnlcblx0ICogdGhlIGxvYWRlcidzIHByb2Nlc3NBcmd1bWVudHMgbWV0aG9kLiBGb3IgZXhhbXBsZSwgdGhlXG5cdCAqIGRlZmF1bHQgSW1hZ2UgbG9hZGVyIHJldHVybnMgYSBUZXh0dXJlIG9iamVjdC5cblx0ICpcblx0ICogQG1ldGhvZCAgbG9hZFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IG5hbWUgdGhlIGFzc2V0IG5hbWVcblx0ICogQHBhcmFtIHthbnl9IGFyZ3MgYSB2YXJpYWJsZSBudW1iZXIgb2Ygb3B0aW9uYWwgYXJndW1lbnRzXG5cdCAqIEByZXR1cm4ge2FueX0gcmV0dXJucyB0aGUgYmVzdCB0eXBlIGZvciB0aGlzIGFzc2V0J3MgbG9hZGVyXG5cdCAqL1xuXHRsb2FkOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGV4dCA9IHRoaXMuX19leHRlbnNpb24obmFtZSk7XG5cdFx0aWYgKCFleHQpIFxuXHRcdFx0dGhyb3cgXCJBc3NldCBuYW1lIGRvZXMgbm90IGhhdmUgYSBmaWxlIGV4dGVuc2lvbjogXCIgKyBuYW1lO1xuXHRcdGlmICghQXNzZXRNYW5hZ2VyLmxvYWRlcnMuaGFzT3duUHJvcGVydHkoZXh0KSlcblx0XHRcdHRocm93IFwiTm8ga25vd24gbG9hZGVyIGZvciBleHRlbnNpb24gXCIrZXh0K1wiIGluIGFzc2V0IFwiK25hbWU7XG5cblx0XHR2YXIgYXJncyA9IFsgbmFtZSwgQXNzZXRNYW5hZ2VyLmxvYWRlcnNbZXh0XSBdO1xuXHRcdGFyZ3MgPSBhcmdzLmNvbmNhdCggQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSApO1xuXG5cdFx0cmV0dXJuIHRoaXMubG9hZEFzLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHR9LFxuXG5cdF9fZXh0ZW5zaW9uOiBmdW5jdGlvbihzdHIpIHtcblx0XHR2YXIgaWR4ID0gc3RyLmxhc3RJbmRleE9mKCcuJyk7XG5cdFx0aWYgKGlkeCA9PT0gLTEgfHwgaWR4ID09PSAwIHx8IGlkeCA9PT0gc3RyLmxlbmd0aC0xKSAvLyBkb2VzIG5vdCBoYXZlIGEgY2xlYXIgZmlsZSBleHRlbnNpb25cblx0XHRcdHJldHVybiBcIlwiO1xuXHRcdHJldHVybiBzdHIuc3Vic3RyaW5nKGlkeCsxKS50b0xvd2VyQ2FzZSgpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBQdXNoZXMgYW4gYXNzZXQgb250byB0aGlzIHN0YWNrLiBUaGlzIGFsbG93cyB5b3UgdG9cblx0ICogc3BlY2lmeSBhIGxvYWRlciBmdW5jdGlvbiBmb3IgdGhlIGFzc2V0LiBUaGlzIGlzIHVzZWZ1bFxuXHQgKiBpZiB5b3Ugd2lzaCB0byB1c2UgZ2VuZXJpYyBuYW1lcyBmb3IgeW91ciBhc3NldHMgKGluc3RlYWQgb2Zcblx0ICogZmlsZW5hbWVzKSwgb3IgaWYgeW91IHdhbnQgYSBwYXJ0aWN1bGFyIGFzc2V0IHRvIHVzZSBhIHNwZWNpZmljXG5cdCAqIGxvYWRlci4gXG5cdCAqXG5cdCAqIExpa2Ugd2l0aCB7eyNjcm9zc0xpbmsgXCJBc3NldE1hbmFnZXIvbG9hZDptZXRob2RcIn19e3svY3Jvc3NMaW5rfX0sXG5cdCAqIHRoZSBmaXJzdCBhcmd1bWVudCBpcyB0aGUgYXNzZXQgbmFtZS4gVGhlIHNlY29uZCBhcmd1bWVudCBpcyB0aGUgbG9hZGVyXG5cdCAqIHRvIHVzZSBmb3IgdGhpcyBhc3NldC4gQW55IHN1YnNlcXVlbnRcblx0ICogYXJndW1lbnRzIHdpbGwgYmUgcGFzc2VkIGFsb25nIHRvIHRoZSBsb2FkZXIgZm9yIGZ1cnRoZXJcblx0ICogcHJvY2Vzc2luZy5cblx0ICpcblx0ICogVGhlIHJldHVybiB2YWx1ZSBvZiB0aGlzIG1ldGhvZCBpcyBkZXRlcm1pbmVkIGJ5XG5cdCAqIHRoZSBsb2FkZXIncyBwcm9jZXNzQXJndW1lbnRzIG1ldGhvZC4gRm9yIGV4YW1wbGUsIHRoZVxuXHQgKiBkZWZhdWx0IEltYWdlIGxvYWRlciByZXR1cm5zIGEgVGV4dHVyZSBvYmplY3QuXG5cdCAqXG5cdCAqIEBtZXRob2QgIGxvYWRcblx0ICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgdGhlIGFzc2V0IG5hbWVcblx0ICogQHBhcmFtIHtGdWNudGlvbn0gbG9hZGVyIHRoZSBsb2FkZXIgZnVuY3Rpb25cblx0ICogQHBhcmFtIHtPYmplY3QgLi4ufSBhcmdzIGEgdmFyaWFibGUgbnVtYmVyIG9mIG9wdGlvbmFsIGFyZ3VtZW50c1xuXHQgKiBAcmV0dXJuIHthbnl9IHJldHVybnMgdGhlIGJlc3QgdHlwZSBmb3IgdGhpcyBhc3NldCdzIGxvYWRlclxuXHQgKi9cblx0bG9hZEFzOiBmdW5jdGlvbihuYW1lLCBsb2FkZXIpIHtcblx0XHRpZiAoIW5hbWUpXG5cdFx0XHR0aHJvdyBcIm5vIG5hbWUgc3BlY2lmaWVkIHRvIGxvYWRcIjtcblx0XHRpZiAoIWxvYWRlcilcblx0XHRcdHRocm93IFwibm8gbG9hZGVyIHNwZWNpZmllZCBmb3IgYXNzZXQgXCIrbmFtZTtcblxuXHRcdHZhciBpZHggPSB0aGlzLl9faW5kZXhPZih0aGlzLmFzc2V0cywgbmFtZSk7XG5cdFx0aWYgKGlkeCAhPT0gLTEpIC8vVE9ETzogZXZlbnR1YWxseSBhZGQgc3VwcG9ydCBmb3IgZGVwZW5kZW5jaWVzIGFuZCBzaGFyZWQgYXNzZXRzXG5cdFx0XHR0aHJvdyBcImFzc2V0IGFscmVhZHkgZGVmaW5lZCBpbiBhc3NldCBtYW5hZ2VyXCI7XG5cblx0XHQvL2dyYWIgYW55IGFkZGl0aW9uYWwgYXJndW1lbnRzXG5cdFx0dmFyIHBhcmFtcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG5cblx0XHR2YXIgZGVzYyA9IG5ldyBBc3NldE1hbmFnZXIuRGVzY3JpcHRvcihuYW1lLCBsb2FkZXIsIHBhcmFtcyk7XG5cblx0XHQvL2tlZXAgaG9sZCBvZiB0aGlzIGFzc2V0XG5cdFx0dGhpcy5hc3NldHMucHVzaChkZXNjKTtcblxuXHRcdC8vYWxzbyBhZGQgaXQgdG8gb3VyIHF1ZXVlIG9mIGN1cnJlbnQgdGFza3Ncblx0XHR0aGlzLnRhc2tzLnB1c2goZGVzYyk7XG5cdFx0dGhpcy5fX2xvYWRDb3VudCsrO1xuXHRcdHRoaXMuX190b3RhbEl0ZW1zKys7XG5cblxuXHRcdC8vaWYgd2UgY2FuIHByb2Nlc3MgdGhlIGFyZ3VtZW50cyBhbmQgZ2V0IGEgcmV0dXJuIHZhbHVlLi4uXG5cdFx0aWYgKGxvYWRlci5wcm9jZXNzQXJndW1lbnRzKSB7XG5cdFx0XHRyZXR1cm4gbG9hZGVyLnByb2Nlc3NBcmd1bWVudHMuY2FsbCh0aGlzLCBuYW1lLCBwYXJhbXMpO1xuXHRcdH0gZWxzZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0X19pbmRleE9mOiBmdW5jdGlvbihsaXN0LCBuYW1lKSB7XG5cdFx0Zm9yICh2YXIgaT0wOyBpPGxpc3QubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChsaXN0W2ldLm5hbWUgPT09IG5hbWUpXG5cdFx0XHRcdHJldHVybiBpO1xuXHRcdH1cblx0XHRyZXR1cm4gLTE7XG5cdH0sXG5cblx0X19sb2FkQ2FsbGJhY2s6IGZ1bmN0aW9uKG5hbWUsIHN1Y2Nlc3MpIHtcblx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDIpIC8vc29tZSBoZWxwZnVsIGRlYnVnIGluZm9ybWF0aW9uIGlmIHlvdSdyZSB3cml0aW5nIGEgTG9hZGVyXG5cdFx0XHR0aHJvdyBcIkxvYWRlciBwYXNzZWQgaW52YWxpZCBhcmd1bWVudHMgdG8gZmluaXNoZWQoKSBjYWxsYmFjaztcIlxuXHRcdFx0XHRcdCtcIiBtdXN0IGluY2x1ZGUgbmFtZSBhbmQgc3VjY2VzcyBmbGFnXCI7XG5cblx0XHR0aGlzLl9fbG9hZENvdW50LS07XG5cblx0XHR2YXIgYXNzZXRJZHggPSB0aGlzLl9faW5kZXhPZih0aGlzLmFzc2V0cywgbmFtZSk7XG5cdFx0aWYgKGFzc2V0SWR4ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5hc3NldHNbYXNzZXRJZHhdLnN0YXR1cyA9IHN1Y2Nlc3MgXG5cdFx0XHRcdFx0XHQ/IEFzc2V0TWFuYWdlci5TdGF0dXMuTE9BRF9TVUNDRVNTXG5cdFx0XHRcdFx0XHQ6IEFzc2V0TWFuYWdlci5TdGF0dXMuTE9BRF9GQUlMRUQ7XG5cdFx0XHRpZiAoIXN1Y2Nlc3MpIHtcblx0XHRcdFx0dGhpcy5sb2FkRXJyb3IuZGlzcGF0Y2gobmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2FkUHJvZ3Jlc3MuZGlzcGF0Y2goICh0aGlzLl9fdG90YWxJdGVtcyAtIHRoaXMuX19sb2FkQ291bnQpLCBcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX190b3RhbEl0ZW1zLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmFtZSk7XG5cdFx0XHRcblx0XHRpZiAodGhpcy5fX2xvYWRDb3VudCA9PT0gMCkge1xuXHRcdFx0dGhpcy5sb2FkRmluaXNoZWQuZGlzcGF0Y2goKTtcblx0XHR9XG5cdH0sXG5cblx0Ly8gVE9ETy4uLi5cblx0Ly8gaXNMb2FkZWQ6IGZ1bmN0aW9uKG5hbWUpIHtcblx0Ly8gXHR2YXIgYXNzZXRJZHggPSB0aGlzLl9faW5kZXhPZih0aGlzLmFzc2V0cywgbmFtZSk7XG5cdC8vIFx0cmV0dXJuIGFzc2V0SWR4ICE9PSAtMSA/IHRoaXMuYXNzZXRzW2Fzc2V0SWR4XS5sb2FkZWQgOiBmYWxzZTtcblx0Ly8gfSxcblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGlzIEFzc2V0TWFuYWdlciBieSBsb2FkaW5nIHRoZSBuZXh0IGFzc2V0IGluIHRoZSBxdWV1ZS5cblx0ICogSWYgYWxsIGFzc2V0cyBoYXZlIGJlZW4gbG9hZGVkLCB0aGlzIG1ldGhvZCByZXR1cm5zIHRydWUsIG90aGVyd2lzZVxuXHQgKiBpdCB3aWxsIHJldHVybiBmYWxzZS5cblx0ICpcblx0ICogQG1ldGhvZCAgdXBkYXRlXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IHdoZXRoZXIgdGhpcyBhc3NldCBtYW5hZ2VyIGhhcyBmaW5pc2hlZCBsb2FkaW5nXG5cdCAqL1xuXHR1cGRhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICghdGhpcy5jb250ZXh0LnZhbGlkKVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXG5cdFx0aWYgKHRoaXMudGFza3MubGVuZ3RoID09PSAwKVxuXHRcdFx0cmV0dXJuICh0aGlzLl9fbG9hZENvdW50ID09PSAwKTtcblxuXHRcdC8vSWYgd2Ugc3RpbGwgaGF2ZW4ndCBwb3BwZWQgYW55IGZyb20gdGhlIGFzc2V0cyBsaXN0Li4uXG5cdFx0aWYgKHRoaXMudGFza3MubGVuZ3RoID09PSB0aGlzLmFzc2V0cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMubG9hZFN0YXJ0ZWQuZGlzcGF0Y2goKTtcblx0XHR9XG5cblx0XHQvL2dyYWIgdGhlIG5leHQgdGFzayBvbiB0aGUgc3RhY2tcblx0XHR2YXIgbmV4dFRhc2sgPSB0aGlzLnRhc2tzLnNoaWZ0KCk7XG5cblx0XHQvL2FwcGx5IHRoZSBsb2FkaW5nIHN0ZXBcblx0XHR2YXIgbG9hZGVyID0gbmV4dFRhc2subG9hZGVyO1xuXG5cdFx0dmFyIGNiID0gdGhpcy5fX2xvYWRDYWxsYmFja0Z1bmM7XG5cblx0XHR2YXIgbmV3UGFyYW1zID0gWyBuZXh0VGFzay5uYW1lLCBjYiBdLmNvbmNhdChuZXh0VGFzay5wYXJhbXMpO1xuXHRcdGxvYWRlci5sb2FkQXNzZXQuYXBwbHkodGhpcywgbmV3UGFyYW1zKTtcblxuXHRcdHJldHVybiAodGhpcy5fX2xvYWRDb3VudCA9PT0gMCk7XG5cdH1cbn0pO1xuXG4vKipcbiAqIEEgc2V0IG9mIGxvYWRlciBwbHVnaW5zIGZvciB0aGlzIGFzc2V0IG1hbmFnZXIuIFRoZXNlIG1pZ2h0IGJlIGFzIHNpbXBsZVxuICogYXMgcHVzaGluZyBIVE1MIEltYWdlIG9iamVjdHMgaW50byBhIFRleHR1cmUsIG9yIG1vcmUgY29tcGxleCBsaWtlIGRlY29kaW5nXG4gKiBhIGNvbXByZXNzZWQsIG1pcC1tYXBwZWQsIG9yIGN1YmUtbWFwIHRleHR1cmUuXG4gKlxuICogVGhpcyBvYmplY3QgaXMgYSBzaW1wbGUgaGFzaG1hcCBvZiBsb3dlci1jYXNlIGV4dGVuc2lvbiBuYW1lcyB0byBMb2FkZXIgZnVuY3Rpb25zLlxuICogXG4gKiBAcHJvcGVydHkgbG9hZGVyc1xuICogQHN0YXRpY1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuQXNzZXRNYW5hZ2VyLmxvYWRlcnMgPSB7fTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBsb2FkZXIgZnVuY3Rpb24gd2l0aCB0aGUgZ2l2ZW4gZXh0ZW5zaW9uKHMpLlxuICogVGhlIGZpcnN0IHBhcmFtZXRlciBpcyBhIGxvYWRlciBmdW5jdGlvbiwgYW5kIGFsbCBzdWJzZXF1ZW50XG4gKiBwYXJhbWV0ZXJzIGFyZSBsb3dlci1jYXNlIGV4dGVuc2lvbnMgKHdpdGhvdXQgdGhlIHBlcmlvZCkgdGhhdFxuICogc2hvdWxkIGJlIGFzc29jaWF0ZWQgd2l0aCB0aGF0IGxvYWRlci4gVGhpcyB3aWxsIG92ZXJyaWRlIG90aGVyXG4gKiBsb2FkZXJzIGJ5IHRoZSBzYW1lIGV4dGVuc2lvbi5cbiAqXG4gKiBCeSBkZWZhdWx0LCB0aGUgZXh0ZW5zaW9ucyBcInBuZ1wiLCBcImpwZ1wiLCBcImpwZWdcIiwgYW5kIFwiZ2lmXCIgYXJlXG4gKiByZWdpc3RlcmVkIHRvIHt7I2Nyb3NzTGluayBcIkFzc2V0TWFuYWdlci9JbWFnZUxvYWRlcjphdHRyaWJ1dGVcIn19e3svY3Jvc3NMaW5rfX0uXG4gKiBcbiAqIEBtZXRob2QgcmVnaXN0ZXJMb2FkZXJcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGxvYWRlckZ1bmMgdGhlIGxvYWRlciBmdW5jdGlvblxuICogQHBhcmFtIHtTdHJpbmcgLi4ufSBleHRlbnNpb25zIGEgdmFyaWFibGUgbnVtYmVyIG9mIHN0cmluZ3NcbiAqL1xuQXNzZXRNYW5hZ2VyLnJlZ2lzdGVyTG9hZGVyID0gZnVuY3Rpb24obG9hZGVyRnVuYywgZXh0ZW5zaW9ucykge1xuXHRpZiAoYXJndW1lbnRzLmxlbmd0aD09PTApXG5cdFx0dGhyb3cgXCJtdXN0IHNwZWNpZnkgYXQgbGVhc3Qgb25lIGV4dGVuc2lvbiBmb3IgdGhlIGxvYWRlclwiO1xuXHR2YXIgZXh0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cdGZvciAodmFyIGk9MDsgaTxleHRzLmxlbmd0aDsgaSsrKSBcblx0XHRBc3NldE1hbmFnZXIubG9hZGVyc1sgZXh0c1tpXSBdID0gbG9hZGVyRnVuYztcbn07XG5cbi8qKlxuICogQSBzaW1wbGUgd3JhcHBlciBmb3IgYXNzZXRzIHdoaWNoIHdpbGwgYmUgcGFzc2VkIGFsb25nIHRvIHRoZSBsb2FkZXI7XG4gKiB0aGlzIGlzIHVzZWQgaW50ZXJuYWxseS5cbiAqIFxuICogLy9AY2xhc3MgQXNzZXRNYW5hZ2VyLkRlc2NyaXB0b3JcbiAqL1xuQXNzZXRNYW5hZ2VyLkRlc2NyaXB0b3IgPSBuZXcgQ2xhc3Moe1xuXG5cdG5hbWU6IG51bGwsXG5cdGxvYWRlcjogbnVsbCxcblx0cGFyYW1zOiBudWxsLFxuXHRzdGF0dXM6IG51bGwsXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24obmFtZSwgbG9hZGVyLCBwYXJhbXMpIHtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMubG9hZGVyID0gbG9hZGVyO1xuXHRcdHRoaXMucGFyYW1zID0gcGFyYW1zO1xuXHRcdHRoaXMuc3RhdHVzID0gQXNzZXRNYW5hZ2VyLlN0YXR1cy5RVUVVRUQ7XG5cdH1cbn0pO1xuXG4vL1RPRE86IGRvY3VtZW50IHRoaXNcbi8qKlxuICogRGVmaW5lcyB0aGUgc3RhdHVzIG9mIGFuIGFzc2V0IGluIHRoZSBtYW5hZ2VyIHF1ZXVlLlxuICogQHR5cGUge09iamVjdH1cbiAqL1xuQXNzZXRNYW5hZ2VyLlN0YXR1cyA9IHtcblx0UVVFVUVEOiAwLFxuXHRMT0FESU5HOiAxLFxuXHRMT0FEX1NVQ0NFU1M6IDIsXG5cdExPQURfRkFJTDogM1xufTtcblxuXG4vL1RPRE86IHVzZSBhIGJhc2UgbG9hZGVyIGNsYXNzOyBwdWxsIHRoZXNlIG91dCBpbnRvIHRoZWlyIG93biBmaWxlcyA/XG5cbi8qKlxuICogVGhpcyBpcyB0aGUgZGVmYXVsdCBpbXBsZW1lbnRhdGlvbiBvZiBhbiBpbWFnZSBsb2FkZXIgcGx1Z2luIGZvciBBc3NldE1hbmFnZXIuXG4gKiBUaGlzIHVzZXMgYSBET00gSW1hZ2Ugb2JqZWN0IHRvIHVwbG9hZCBQTkcsIEdJRiBhbmQgSlBHIGltYWdlcyB0byBhIFdlYkdMXG4gKiB0ZXh0dXJlLiBZb3Ugd2lsbCBub3QgbmVlZCB0byBkZWFsIHdpdGggdGhpcyBjbGFzcyBkaXJlY3RseSwgdW5sZXNzIHlvdSB3YW50XG4gKiB0byB3cml0ZSB5b3VyIG93biBBc3NldE1hbmFnZXIgbG9hZGVycy5cbiAqXG4gKiBBIGBMb2FkZXJgIHR5cGUgZm9yIEFzc2V0TWFuYWdlciBpcyBzaW1wbHkgYW4gb2JqZWN0IHdoaWNoIGRlZmluZXMgdHdvIG1ldGhvZHM6XG4gKlxuICogLSBgbG9hZEFzc2V0YDogdGhpcyBpcyB0aGUgbG9hZGluZyBmdW5jdGlvbiwgd2hpY2ggaGFuZGxlcyB0aGUgYXN5bmNocm9ub3VzIGxvYWQuXG4gKiAtIGBwcm9jZXNzQXJndW1lbnRzYDogdGhpcyBpcyBmb3IgdGhlIHVzZXIncyBjb252ZW5pZW5jZSwgaGFuZGxpbmcgZGVmYXVsdCBhcmd1bWVudHNcbiAqIGFuZCBnaXZpbmcgYSBtZWFuaW5nZnVsIHJldHVybiB2YWx1ZS4gXG4gKiBcbiAqIEBjbGFzcyBBc3NldE1hbmFnZXIuSW1hZ2VMb2FkZXJcbiAqL1xuQXNzZXRNYW5hZ2VyLkltYWdlTG9hZGVyID0ge1xuXHRcblx0LyoqXG5cdCAqIFRoaXMgaXMgYSBcImxvYWRlciBmdW5jdGlvblwiIHdoaWNoIGhhbmRsZXMgdGhlIGFzeW5jaHJvbm91c1xuXHQgKiBsb2FkaW5nIGZvciBhbiBhc3NldC4gVGhlIGZ1bmN0aW9uIG11c3QgYmUgaW1wbGVtZW50ZWQgaW4gYSB2ZXJ5XG5cdCAqIHN0cmljdCBtYW5uZXIgZm9yIHRoZSBhc3NldCBtYW5hZ2VyIHRvIHdvcmsgY29ycmVjdGx5LlxuXHQgKlxuXHQgKiBUaGUgZmlyc3QgcGFyYW1ldGVyIHBhc3NlZCB0byB0aGlzIGZ1bmN0aW9uIGlzIHRoZSBuYW1lIG9mIHRoZVxuXHQgKiBhc3NldCBiZWluZyBsb2FkZWQuIFRoZSBzZWNvbmQgcGFyYW1ldGVyIGlzIGEgY2FsbGJhY2sgdGhhdCBtdXN0XG5cdCAqIGJlIGludm9rZWQgYWZ0ZXIgdGhlIGFzeW5jIHRhc2sgaXMgY29tcGxldGVkLlxuXHQgKiBBbnkgc3Vic2VxdWVudCBwYXJhbWV0ZXJzIGFyZSB0aG9zZSB0aGF0IGNhbWUgZnJvbSB0aGUgaW5pdGFsIGNhbGxcblx0ICogdG8ge3sjY3Jvc3NMaW5rIFwiQXNzZXRNYW5hZ2VyL2xvYWQ6bWV0aG9kXCJ9fUFzc2V0TWFuYWdlci5sb2Fke3svY3Jvc3NMaW5rfX0uIFxuXHQgKlxuXHQgKiBPbmNlIHRoZSBzeW5jaHJvbm91cyBvciBhc3luY2hyb25vdXMgbG9hZGluZyB0YXNrIGlzIGNvbXBsZXRlZCwgdGhlXG5cdCAqIGBmaW5pc2hlZGAgY2FsbGJhY2sgbXVzdCBiZSBpbnZva2VkIHdpdGggdHdvIHBhcmFtZXRlcnM6IGZpcnN0LCB0aGVcblx0ICogYG5hbWVgIG9mIHRoZSBhc3NldCBhcyBwYXNzZWQgdG8gdGhpcyBsb2FkZXIuIEFuZCBzZWNvbmQsIGEgYm9vbGVhbiBpbmRpY2F0aW5nXG5cdCAqIHRoZSBgc3VjY2Vzc2Agb2YgdGhlIGxvYWQgb3BlcmF0aW9uLiBcblx0ICpcblx0ICogSWYgeW91IGRvbid0IGludm9rZSB0aGUgY2FsbGJhY2ssIHRoZSBhc3NldCBtYW5hZ2VyIG1heSBuZXZlciBmaW5pc2ggbG9hZGluZy5cblx0ICogXG5cdCAqIEBtZXRob2QgbG9hZEFzc2V0XG5cdCAqIEBzdGF0aWNcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSBuYW1lIG9mIHRoZSBhc3NldCB0byBsb2FkXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGZpbmlzaGVkIHRoZSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gYXN5bmMgbG9hZGluZyBpcyBjb21wbGV0ZVxuXHQgKiBAcGFyYW0ge1RleHR1cmV9IHRleHR1cmUgdGhlIHRleHR1cmUgdG8gb3BlcmF0ZSBvbiBmb3IgdGhpcyBhc3NldFxuXHQgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCB0aGUgb3B0aW9uYWwgaW1hZ2UgcGF0aCB0byB1c2UgaW5zdGVhZCBvZiB0aGUgYG5hbWVgIHBhcmFtZXRlclxuXHQgKi9cblx0bG9hZEFzc2V0OiBmdW5jdGlvbihuYW1lLCBmaW5pc2hlZCwgdGV4dHVyZSwgcGF0aCkge1xuXHRcdGlmICghdGV4dHVyZSkge1xuXHRcdFx0dGhyb3cgXCJubyB0ZXh0dXJlIG9iamVjdCBzcGVjaWZpZWQgdG8gdGhlIEltYWdlTG9hZGVyIGZvciBhc3NldCBtYW5hZ2VyXCI7XG5cdFx0fVxuXG5cdFx0Ly9pZiBwYXRoIGlzIHVuZGVmaW5lZCwgdXNlIHRoZSBhc3NldCBuYW1lIGFuZCBcblx0XHQvL2Fzc3VtZSBpdHMgYSBwYXRoLlxuXHRcdHBhdGggPSBwYXRoIHx8IG5hbWU7XG5cblx0XHR2YXIgaW1nID0gbmV3IEltYWdlKCk7XG5cblx0XHRpbWcub25sb2FkID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRpbWcub25lcnJvciA9IGltZy5vbmFib3J0ID0gbnVsbDsgLy9jbGVhciBvdGhlciBsaXN0ZW5lcnNcblx0XHRcdHRleHR1cmUudXBsb2FkSW1hZ2UoaW1nKTtcblx0XHRcdGZpbmlzaGVkKG5hbWUsIHRydWUpO1xuXHRcdH07XG5cdFx0aW1nLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcblx0XHRcdGltZy5vbmxvYWQgPSBpbWcub25hYm9ydCA9IG51bGw7XG5cdFx0XHRjb25zb2xlLndhcm4oXCJFcnJvciBsb2FkaW5nIGltYWdlOiBcIitwYXRoKTtcblx0XHRcdC8vV2UgdXNlIG51bGwgZGF0YSB0byBhdm9pZCBXZWJHTCBlcnJvcnNcblx0XHRcdC8vVE9ETzogaGFuZGxlIGZhaWwgbW9yZSBzbW9vdGhseSwgaS5lLiB3aXRoIGEgY2FsbGJhY2tcblx0XHRcdC8vVE9ETzogU2hvdWxkIHRoaXMgYmUgcHVyZSBibGFjaywgb3IgcHVyZWx5IHRyYW5zcGFyZW50P1xuXHRcdFx0dGV4dHVyZS51cGxvYWREYXRhKDEsIDEpOyBcblx0XHRcdGZpbmlzaGVkKG5hbWUsIGZhbHNlKTtcblx0XHR9O1xuXHRcdGltZy5vbmFib3J0ID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRpbWcub25sb2FkID0gaW1nLm9uZXJyb3IgPSBudWxsO1xuXHRcdFx0Y29uc29sZS53YXJuKFwiQWJvcnRlZCBpbWFnZTogXCIrcGF0aCk7XG5cdFx0XHQvL1dlIHVzZSBudWxsIGRhdGEgdG8gYXZvaWQgV2ViR0wgZXJyb3JzXG5cdFx0XHR0ZXh0dXJlLnVwbG9hZERhdGEoMSwgMSk7XG5cdFx0XHRmaW5pc2hlZChuYW1lLCBmYWxzZSk7XG5cdFx0fTtcblxuXHRcdC8vc2V0dXAgc291cmNlXG5cdFx0aW1nLnNyYyA9IHBhdGg7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFRoaXMgbWV0aG9kIGlzIGNhbGxlZCBmcm9tIFxuXHQgKiB7eyNjcm9zc0xpbmsgXCJBc3NldE1hbmFnZXIvbG9hZDptZXRob2RcIn19QXNzZXRNYW5hZ2VyLmxvYWR7ey9jcm9zc0xpbmt9fSB0b1xuXHQgKiBwcm9jZXNzIHRoZSBhcmd1bWVudHMgYW5kIHNldHVwIGFueSBkZWZhdWx0IHZhbHVlcy4gVGhpcyBpcyBhbHNvIHJlc3BvbnNpYmxlIGZvclxuXHQgKiBkZXRlcm1pbmluZyB0aGUgYXBwcm9wcmlhdGUgcmV0dXJuIHZhbHVlIGZvciB0aGUgbG9hZCBmdW5jdGlvbi4gSW4gdGhlIGNhc2Ugb2Zcblx0ICogYEltYWdlTG9hZGVyYCwgd2UgcmV0dXJuIHRoZSBUZXh0dXJlIHRoYXQgd2FzIHBhc3NlZCB0byB0aGUgbG9hZCgpIGZ1bmN0aW9uLCBvclxuXHQgKiBhIG5ldyBUZXh0dXJlIG9iamVjdCBpZiBub25lIHdhcyBnaXZlbi4gVGhpcyB3YXksIHRoZSB1c2VyIGNhbiB3cml0ZSBjb2RlIGxpa2UgdGhpczpcblx0ICpcblx0ICogICAgICAgdmFyIHRleHR1cmUgPSBhc3NldE1hbmFnZXIubG9hZChcImltZy5wbmdcIik7IC8vcmV0dXJucyBuZXcgVGV4dHVyZVxuXHQgKlxuXHQgKiBUaGUgZmlyc3QgYXJndW1lbnQgaXMgdGhlIG5hbWUgb2YgdGhlIGFzc2V0IGJlaW5nIHByb2Nlc3NlZC4gVGhlIHNlY29uZCBhcmd1bWVudFxuXHQgKiBpcyBhbiBhcnJheSBvZiBhcmd1bWVudHMgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byB0aGUgbG9hZGVyIGZ1bmN0aW9uLlxuXHQgKiBcblx0ICogVGhlIG1ldGhvZCBpcyBjYWxsZWQgYm91bmQgdG8gdGhlIEFzc2V0TWFuYWdlciwgc28gd2UgY2FuIGFjY2VzcyBXZWJHTENvbnRleHRcblx0ICogd2l0aCBcInRoaXMuY29udGV4dFwiLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBwcm9jZXNzQXJndW1lbnRzXG5cdCAqIEBzdGF0aWNcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSBhc3NldCBuYW1lXG5cdCAqIEBwYXJhbSAge0FycmF5fSBwYXJhbXMgYW4gYXJyYXkgb2YgcGFyYW1ldGVycyB0aGF0IHdpbGwgYmUgdXNlZCB0byBsb2FkIHRoZSBhc3NldFxuXHQgKiBAcmV0dXJuIHthbnl9IHRoZSBvYmplY3QgdGhlIHVzZXIgbWF5IGV4cGVjdCBmcm9tIHRoZSBsb2FkZXIsIGluIHRoaXMgY2FzZSBhIFRleHR1cmUgb2JqZWN0XG5cdCAqL1xuXHRwcm9jZXNzQXJndW1lbnRzOiBmdW5jdGlvbihuYW1lLCBwYXJhbXMpIHtcblx0XHQvL3RoZSBmaXJzdCBwYXJhbWV0ZXIgaXMgYSB0ZXh0dXJlLi4uIGlmIG5vdCBzcGVjaWZpZWQsIHdlIG5lZWQgdG8gYXNzaWduIGl0IGEgbmV3IG9iamVjdFxuXHRcdGlmIChwYXJhbXMubGVuZ3RoID09PSAwIHx8ICFwYXJhbXNbMF0pXG5cdFx0XHRyZXR1cm4gKHBhcmFtc1swXSA9IG5ldyBUZXh0dXJlKHRoaXMuY29udGV4dCkpO1xuXHRcdGVsc2Vcblx0XHRcdHJldHVybiBwYXJhbXNbMF07XG5cdH1cbn07XG5cblx0XG5cblxuLy8gUmVnaXN0ZXIgb3VyIGRlZmF1bHQgbG9hZGVycy4uLlxuXG5Bc3NldE1hbmFnZXIucmVnaXN0ZXJMb2FkZXIoQXNzZXRNYW5hZ2VyLkltYWdlTG9hZGVyLCBcInBuZ1wiLCBcImdpZlwiLCBcImpwZ1wiLCBcImpwZWdcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gQXNzZXRNYW5hZ2VyO1xuIiwiLyoqXG4gKiBAbW9kdWxlIGthbWlcbiAqL1xuXG4vLyBSZXF1aXJlcy4uLi5cbnZhciBDbGFzcyAgICAgICAgID0gcmVxdWlyZSgna2xhc3NlJyk7XG5cbnZhciBBYnN0cmFjdEJhdGNoID0gcmVxdWlyZSgnLi9BYnN0cmFjdEJhdGNoJyk7XG5cbnZhciBNZXNoICAgICAgICAgID0gcmVxdWlyZSgnLi9nbHV0aWxzL01lc2gnKTtcbnZhciBTaGFkZXJQcm9ncmFtID0gcmVxdWlyZSgnLi9nbHV0aWxzL1NoYWRlclByb2dyYW0nKTtcblxuXG4vKipcbiAqIEEgYmFzaWMgaW1wbGVtZW50YXRpb24gb2YgYSBiYXRjaGVyIHdoaWNoIGRyYXdzIDJEIHNwcml0ZXMuXG4gKiBUaGlzIHVzZXMgdHdvIHRyaWFuZ2xlcyAocXVhZHMpIHdpdGggaW5kZXhlZCBhbmQgaW50ZXJsZWF2ZWRcbiAqIHZlcnRleCBkYXRhLiBFYWNoIHZlcnRleCBob2xkcyA1IGZsb2F0cyAoUG9zaXRpb24ueHksIENvbG9yLCBUZXhDb29yZDAueHkpLlxuICpcbiAqIFRoZSBjb2xvciBpcyBwYWNrZWQgaW50byBhIHNpbmdsZSBmbG9hdCB0byByZWR1Y2UgdmVydGV4IGJhbmR3aWR0aCwgYW5kXG4gKiB0aGUgZGF0YSBpcyBpbnRlcmxlYXZlZCBmb3IgYmVzdCBwZXJmb3JtYW5jZS4gV2UgdXNlIGEgc3RhdGljIGluZGV4IGJ1ZmZlcixcbiAqIGFuZCBhIGR5bmFtaWMgdmVydGV4IGJ1ZmZlciB0aGF0IGlzIHVwZGF0ZWQgd2l0aCBidWZmZXJTdWJEYXRhLiBcbiAqIFxuICogQGV4YW1wbGVcbiAqICAgICAgdmFyIFNwcml0ZUJhdGNoID0gcmVxdWlyZSgna2FtaScpLlNwcml0ZUJhdGNoOyAgXG4gKiAgICAgIFxuICogICAgICAvL2NyZWF0ZSBhIG5ldyBiYXRjaGVyXG4gKiAgICAgIHZhciBiYXRjaCA9IG5ldyBTcHJpdGVCYXRjaChjb250ZXh0KTtcbiAqXG4gKiAgICAgIGZ1bmN0aW9uIHJlbmRlcigpIHtcbiAqICAgICAgICAgIGJhdGNoLmJlZ2luKCk7XG4gKiAgICAgICAgICBcbiAqICAgICAgICAgIC8vZHJhdyBzb21lIHNwcml0ZXMgaW4gYmV0d2VlbiBiZWdpbiBhbmQgZW5kLi4uXG4gKiAgICAgICAgICBiYXRjaC5kcmF3KCB0ZXh0dXJlLCAwLCAwLCAyNSwgMzIgKTtcbiAqICAgICAgICAgIGJhdGNoLmRyYXcoIHRleHR1cmUxLCAwLCAyNSwgNDIsIDIzICk7XG4gKiBcbiAqICAgICAgICAgIGJhdGNoLmVuZCgpO1xuICogICAgICB9XG4gKiBcbiAqIEBjbGFzcyAgU3ByaXRlQmF0Y2hcbiAqIEBleHRlbmRzIEFic3RyYWN0QmF0Y2hcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtXZWJHTENvbnRleHR9IGNvbnRleHQgdGhlIGNvbnRleHQgZm9yIHRoaXMgYmF0Y2hcbiAqIEBwYXJhbSB7TnVtYmVyfSBzaXplIHRoZSBtYXggbnVtYmVyIG9mIHNwcml0ZXMgdG8gZml0IGluIGEgc2luZ2xlIGJhdGNoXG4gKi9cbnZhciBTcHJpdGVCYXRjaCA9IG5ldyBDbGFzcyh7XG5cbiAgICBFeHRlbmRzOiBBYnN0cmFjdEJhdGNoLFxuXG4gICAgLy9Db25zdHJ1Y3RvclxuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIFNwcml0ZUJhdGNoKGNvbnRleHQsIHNpemUpIHtcbiAgICAgICAgQWJzdHJhY3RCYXRjaC5jYWxsKHRoaXMsIGNvbnRleHQsIHNpemUpO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTcHJpdGVCYXRjaCB1cGxvYWRzIGEgdmVjMiBmb3IgcHJvamVjdGlvblxuICAgICAgICAgKiB0cmFuc2Zvcm0gaW4gdGhlIHNoYWRlci4gQSBjdXN0b20gc2hhZGVyIG1pZ2h0XG4gICAgICAgICAqIHVzZSBhIG1hdHJpeCBvciBzb21lIG90aGVyIG1lYW5zIG9mIGNhbGN1bGF0aW5nIFxuICAgICAgICAgKiBwcm9qZWN0aW9uOyBpbiB3aGljaCBjYXNlIHRoaXMgc2hvdWxkIGJlIHNldCB0byBmYWxzZS5cbiAgICAgICAgICogXG4gICAgICAgICAqIEBwcm9wZXJ0eSB1c2VQcm9qZWN0aW9uVmVjdG9yXG4gICAgICAgICAqIEB0eXBlIHtCb29sZWFufVxuICAgICAgICAgKiBAZGVmYXVsdCAgdHJ1ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy51c2VQcm9qZWN0aW9uVmVjdG9yID0gdHJ1ZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIHByb2plY3Rpb24gRmxvYXQzMkFycmF5IHZlYzIgd2hpY2ggaXNcbiAgICAgICAgICogdXNlZCB0byBhdm9pZCBzb21lIG1hdHJpeCBjYWxjdWxhdGlvbnMuIEEgM0QgXG4gICAgICAgICAqIGJhdGNoZXIgbWlnaHQgd2FudCB0byByZXBsYWNlIHRoaXMgYW5kIFxuICAgICAgICAgKiB7eyNjcm9zc0xpbmsgXCJTcHJpdGVCYXRjaC9zZXRQcm9qZWN0aW9uOm1ldGhvZFwifX17ey9jcm9zc0xpbmt9fSBcbiAgICAgICAgICogZW50aXJlbHkuIFxuICAgICAgICAgKlxuICAgICAgICAgKiBAcHJvcGVydHkgcHJvamVjdGlvblxuICAgICAgICAgKiBAdHlwZSB7RmxvYXQzMkFycmF5fVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5wcm9qZWN0aW9uID0gbmV3IEZsb2F0MzJBcnJheSgyKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGhlIGN1cnJlbnRseSBib3VuZCB0ZXh0dXJlLiBEbyBub3QgbW9kaWZ5LlxuICAgICAgICAgKiBcbiAgICAgICAgICogQHByb3BlcnR5IHtUZXh0dXJlfSB0ZXh0dXJlXG4gICAgICAgICAqIEByZWFkT25seVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy50ZXh0dXJlID0gbnVsbDtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogVGhlIG51bWJlciBvZiBmbG9hdHMgcGVyIHZlcnRleCBmb3IgdGhpcyBiYXRjaGVyIFxuICAgICAqIChQb3NpdGlvbi54eSArIENvbG9yICsgVGV4Q29vcmQwLnh5KS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgIGdldFZlcnRleFNpemVcbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IHRoZSBudW1iZXIgb2YgZmxvYXRzIHBlciB2ZXJ0ZXhcbiAgICAgKi9cbiAgICBnZXRWZXJ0ZXhTaXplOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIFNwcml0ZUJhdGNoLlZFUlRFWF9TSVpFO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBVc2VkIGludGVybmFsbHkgdG8gcmV0dXJuIHRoZSBQb3NpdGlvbiwgQ29sb3IsIGFuZCBUZXhDb29yZDAgYXR0cmlidXRlcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgIF9jcmVhdGVWZXJ0ZXhBdHRyaWJ1ZXRzXG4gICAgICogQHByb3RlY3RlZFxuICAgICAqIEByZXR1cm4ge1t0eXBlXX0gW2Rlc2NyaXB0aW9uXVxuICAgICAqL1xuICAgIF9jcmVhdGVWZXJ0ZXhBdHRyaWJ1dGVzOiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuXG4gICAgICAgIHJldHVybiBbIFxuICAgICAgICAgICAgbmV3IE1lc2guQXR0cmliKFwiUG9zaXRpb25cIiwgMiksXG4gICAgICAgICAgICAgLy9wYWNrIHRoZSBjb2xvciB1c2luZyBzb21lIGNyYXp5IHdpemFyZHJ5IFxuICAgICAgICAgICAgbmV3IE1lc2guQXR0cmliKFwiQ29sb3JcIiwgNCwgbnVsbCwgZ2wuVU5TSUdORURfQllURSwgdHJ1ZSwgMSksXG4gICAgICAgICAgICBuZXcgTWVzaC5BdHRyaWIoXCJUZXhDb29yZDBcIiwgMilcbiAgICAgICAgXTtcbiAgICB9LFxuXG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBwcm9qZWN0aW9uIHZlY3RvciwgYW4geCBhbmQgeVxuICAgICAqIGRlZmluaW5nIHRoZSBtaWRkbGUgcG9pbnRzIG9mIHlvdXIgc3RhZ2UuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFByb2plY3Rpb25cbiAgICAgKiBAcGFyYW0ge051bWJlcn0geCB0aGUgeCBwcm9qZWN0aW9uIHZhbHVlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHkgdGhlIHkgcHJvamVjdGlvbiB2YWx1ZVxuICAgICAqL1xuICAgIHNldFByb2plY3Rpb246IGZ1bmN0aW9uKHgsIHkpIHtcbiAgICAgICAgdmFyIG9sZFggPSB0aGlzLnByb2plY3Rpb25bMF07XG4gICAgICAgIHZhciBvbGRZID0gdGhpcy5wcm9qZWN0aW9uWzFdO1xuICAgICAgICB0aGlzLnByb2plY3Rpb25bMF0gPSB4O1xuICAgICAgICB0aGlzLnByb2plY3Rpb25bMV0gPSB5O1xuXG4gICAgICAgIC8vd2UgbmVlZCB0byBmbHVzaCB0aGUgYmF0Y2guLlxuICAgICAgICBpZiAodGhpcy5kcmF3aW5nICYmICh4ICE9IG9sZFggfHwgeSAhPSBvbGRZKSkge1xuICAgICAgICAgICAgdGhpcy5mbHVzaCgpO1xuICAgICAgICAgICAgdGhpcy5fdXBkYXRlTWF0cmljZXMoKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgZGVmYXVsdCBzaGFkZXIgZm9yIHRoaXMgYmF0Y2guXG4gICAgICpcbiAgICAgKiBAbWV0aG9kICBfY3JlYXRlU2hhZGVyXG4gICAgICogQHByb3RlY3RlZFxuICAgICAqIEByZXR1cm4ge1NoYWRlclByb2dyYW19IGEgbmV3IGluc3RhbmNlIG9mIFNoYWRlclByb2dyYW1cbiAgICAgKi9cbiAgICBfY3JlYXRlU2hhZGVyOiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHNoYWRlciA9IG5ldyBTaGFkZXJQcm9ncmFtKHRoaXMuY29udGV4dCxcbiAgICAgICAgICAgICAgICBTcHJpdGVCYXRjaC5ERUZBVUxUX1ZFUlRfU0hBREVSLCBcbiAgICAgICAgICAgICAgICBTcHJpdGVCYXRjaC5ERUZBVUxUX0ZSQUdfU0hBREVSKTtcbiAgICAgICAgaWYgKHNoYWRlci5sb2cpXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJTaGFkZXIgTG9nOlxcblwiICsgc2hhZGVyLmxvZyk7XG4gICAgICAgIHJldHVybiBzaGFkZXI7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFRoaXMgaXMgY2FsbGVkIGR1cmluZyByZW5kZXJpbmcgdG8gdXBkYXRlIHByb2plY3Rpb24vdHJhbnNmb3JtXG4gICAgICogbWF0cmljZXMgYW5kIHVwbG9hZCB0aGUgbmV3IHZhbHVlcyB0byB0aGUgc2hhZGVyLiBGb3IgZXhhbXBsZSxcbiAgICAgKiBpZiB0aGUgdXNlciBjYWxscyBzZXRQcm9qZWN0aW9uIG1pZC1kcmF3LCB0aGUgYmF0Y2ggd2lsbCBmbHVzaFxuICAgICAqIGFuZCB0aGlzIHdpbGwgYmUgY2FsbGVkIGJlZm9yZSBjb250aW51aW5nIHRvIGFkZCBpdGVtcyB0byB0aGUgYmF0Y2guXG4gICAgICpcbiAgICAgKiBZb3UgZ2VuZXJhbGx5IHNob3VsZCBub3QgbmVlZCB0byBjYWxsIHRoaXMgZGlyZWN0bHkuXG4gICAgICogXG4gICAgICogQG1ldGhvZCAgdXBkYXRlTWF0cmljZXNcbiAgICAgKiBAcHJvdGVjdGVkXG4gICAgICovXG4gICAgdXBkYXRlTWF0cmljZXM6IGZ1bmN0aW9uKCkge1xuICAgICAgICAvL2FuIGV4dGVuc2lvbiBvZiBTcHJpdGVCYXRjaCBtaWdodCB3YW50IHRvIHN1cHBvcnQgZnVsbCB0cmFuc2Zvcm0gJlxuICAgICAgICAvL3Byb2plY3Rpb24gbWF0cmljZXMgZm9yIDNEIGJpbGxib2FyZHMuIGlmIHNvLCBvdmVycmlkZSB0aGlzIG1ldGhvZFxuICAgICAgICBpZiAodGhpcy51c2VQcm9qZWN0aW9uVmVjdG9yKVxuICAgICAgICAgICAgdGhpcy5zaGFkZXIuc2V0VW5pZm9ybWZ2KFwidV9wcm9qZWN0aW9uXCIsIHRoaXMucHJvamVjdGlvbik7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENhbGxlZCBiZWZvcmUgcmVuZGVyaW5nLCBhbmQgYmluZHMgdGhlIGN1cnJlbnQgdGV4dHVyZS5cbiAgICAgKiBcbiAgICAgKiBAbWV0aG9kIF9wcmVSZW5kZXJcbiAgICAgKiBAcHJvdGVjdGVkXG4gICAgICovXG4gICAgX3ByZVJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnRleHR1cmUpXG4gICAgICAgICAgICB0aGlzLnRleHR1cmUuYmluZCgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBCaW5kcyB0aGUgc2hhZGVyLCBkaXNhYmxlcyBkZXB0aCB3cml0aW5nLCBcbiAgICAgKiBlbmFibGVzIGJsZW5kaW5nLCBhY3RpdmF0ZXMgdGV4dHVyZSB1bml0IDAsIGFuZCBzZW5kc1xuICAgICAqIGRlZmF1bHQgbWF0cmljZXMgYW5kIHNhbXBsZXIyRCB1bmlmb3JtcyB0byB0aGUgc2hhZGVyLlxuICAgICAqXG4gICAgICogQG1ldGhvZCAgYmVnaW5cbiAgICAgKi9cbiAgICBiZWdpbjogZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vc3ByaXRlIGJhdGNoIGRvZXNuJ3QgaG9sZCBhIHJlZmVyZW5jZSB0byBHTCBzaW5jZSBpdCBpcyB2b2xhdGlsZVxuICAgICAgICB2YXIgZ2wgPSB0aGlzLmNvbnRleHQuZ2w7XG4gICAgICAgIFxuICAgICAgICAvL2p1c3QgZG8gZGlyZWN0IHBhcmVudCBjYWxsIGZvciBzcGVlZCBoZXJlXG4gICAgICAgIC8vVGhpcyBiaW5kcyB0aGUgc2hhZGVyIGFuZCBtZXNoIVxuICAgICAgICBBYnN0cmFjdEJhdGNoLnByb3RvdHlwZS5iZWdpbi5jYWxsKHRoaXMpO1xuXG4gICAgICAgIHRoaXMudXBkYXRlTWF0cmljZXMoKTsgLy9zZW5kIHByb2plY3Rpb24vdHJhbnNmb3JtIHRvIHNoYWRlclxuXG4gICAgICAgIC8vdXBsb2FkIHRoZSBzYW1wbGVyIHVuaWZvcm0uIG5vdCBuZWNlc3NhcnkgZXZlcnkgZmx1c2ggc28gd2UganVzdFxuICAgICAgICAvL2RvIGl0IGhlcmUuXG4gICAgICAgIHRoaXMuc2hhZGVyLnNldFVuaWZvcm1pKFwidV90ZXh0dXJlMFwiLCAwKTtcblxuICAgICAgICAvL2Rpc2FibGUgZGVwdGggbWFza1xuICAgICAgICBnbC5kZXB0aE1hc2soZmFsc2UpO1xuXG4gICAgICAgIC8vcHJlbXVsdGlwbGllZCBhbHBoYVxuICAgICAgICBpZiAodGhpcy5fYmxlbmRFbmFibGVkKSB7XG4gICAgICAgICAgICBnbC5lbmFibGUoZ2wuQkxFTkQpO1xuXG4gICAgICAgICAgICAvL3NldCBlaXRoZXIgdG8gLTEgaWYgeW91IHdhbnQgdG8gY2FsbCB5b3VyIG93biBcbiAgICAgICAgICAgIC8vYmxlbmRGdW5jIG9yIGJsZW5kRnVuY1NlcGFyYXRlXG4gICAgICAgICAgICBpZiAodGhpcy5fYmxlbmRTcmMgIT09IC0xICYmIHRoaXMuX2JsZW5kRHN0ICE9PSAtMSlcbiAgICAgICAgICAgICAgICBnbC5ibGVuZEZ1bmModGhpcy5fYmxlbmRTcmMsIHRoaXMuX2JsZW5kRHN0KTsgXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogRW5kcyB0aGUgc3ByaXRlIGJhdGNoZXIgYW5kIGZsdXNoZXMgYW55IHJlbWFpbmluZyBkYXRhIHRvIHRoZSBHUFUuXG4gICAgICogXG4gICAgICogQG1ldGhvZCBlbmRcbiAgICAgKi9cbiAgICBlbmQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAvL3Nwcml0ZSBiYXRjaCBkb2Vzbid0IGhvbGQgYSByZWZlcmVuY2UgdG8gR0wgc2luY2UgaXQgaXMgdm9sYXRpbGVcbiAgICAgICAgdmFyIGdsID0gdGhpcy5jb250ZXh0LmdsO1xuICAgICAgICBcbiAgICAgICAgLy9qdXN0IGRvIGRpcmVjdCBwYXJlbnQgY2FsbCBmb3Igc3BlZWQgaGVyZVxuICAgICAgICAvL1RoaXMgYmluZHMgdGhlIHNoYWRlciBhbmQgbWVzaCFcbiAgICAgICAgQWJzdHJhY3RCYXRjaC5wcm90b3R5cGUuZW5kLmNhbGwodGhpcyk7XG5cbiAgICAgICAgZ2wuZGVwdGhNYXNrKHRydWUpO1xuXG4gICAgICAgIGlmICh0aGlzLl9ibGVuZEVuYWJsZWQpXG4gICAgICAgICAgICBnbC5kaXNhYmxlKGdsLkJMRU5EKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogRmx1c2hlcyB0aGUgYmF0Y2ggdG8gdGhlIEdQVS4gVGhpcyBzaG91bGQgYmUgY2FsbGVkIHdoZW5cbiAgICAgKiBzdGF0ZSBjaGFuZ2VzLCBzdWNoIGFzIGJsZW5kIGZ1bmN0aW9ucywgZGVwdGggb3Igc3RlbmNpbCBzdGF0ZXMsXG4gICAgICogc2hhZGVycywgYW5kIHNvIGZvcnRoLlxuICAgICAqIFxuICAgICAqIEBtZXRob2QgZmx1c2hcbiAgICAgKi9cbiAgICBmbHVzaDogZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vaWdub3JlIGZsdXNoIGlmIHRleHR1cmUgaXMgbnVsbCBvciBvdXIgYmF0Y2ggaXMgZW1wdHlcbiAgICAgICAgaWYgKCF0aGlzLnRleHR1cmUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmICh0aGlzLmlkeCA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgQWJzdHJhY3RCYXRjaC5wcm90b3R5cGUuZmx1c2guY2FsbCh0aGlzKTtcbiAgICAgICAgU3ByaXRlQmF0Y2gudG90YWxSZW5kZXJDYWxscysrO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgc3ByaXRlIHRvIHRoaXMgYmF0Y2guIFRoZSBzcHJpdGUgaXMgZHJhd24gaW4gXG4gICAgICogc2NyZWVuLXNwYWNlIHdpdGggdGhlIG9yaWdpbiBhdCB0aGUgdXBwZXItbGVmdCBjb3JuZXIgKHktZG93bikuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGRyYXdcbiAgICAgKiBAcGFyYW0gIHtUZXh0dXJlfSB0ZXh0dXJlIHRoZSB0ZXh0dXJlIGZvciB0aGlzIHNwcml0ZVxuICAgICAqIEBwYXJhbSAge051bWJlcn0geCAgICAgICB0aGUgeCBwb3NpdGlvbiBpbiBwaXhlbHMsIGRlZmF1bHRzIHRvIHplcm9cbiAgICAgKiBAcGFyYW0gIHtOdW1iZXJ9IHkgICAgICAgdGhlIHkgcG9zaXRpb24gaW4gcGl4ZWxzLCBkZWZhdWx0cyB0byB6ZXJvXG4gICAgICogQHBhcmFtICB7TnVtYmVyfSB3aWR0aCAgIHRoZSB3aWR0aCBpbiBwaXhlbHMsIGRlZmF1bHRzIHRvIHRoZSB0ZXh0dXJlIHdpZHRoXG4gICAgICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgIHRoZSBoZWlnaHQgaW4gcGl4ZWxzLCBkZWZhdWx0cyB0byB0aGUgdGV4dHVyZSBoZWlnaHRcbiAgICAgKiBAcGFyYW0gIHtOdW1iZXJ9IHUxICAgICAgdGhlIGZpcnN0IFUgY29vcmRpbmF0ZSwgZGVmYXVsdCB6ZXJvXG4gICAgICogQHBhcmFtICB7TnVtYmVyfSB2MSAgICAgIHRoZSBmaXJzdCBWIGNvb3JkaW5hdGUsIGRlZmF1bHQgemVyb1xuICAgICAqIEBwYXJhbSAge051bWJlcn0gdTIgICAgICB0aGUgc2Vjb25kIFUgY29vcmRpbmF0ZSwgZGVmYXVsdCBvbmVcbiAgICAgKiBAcGFyYW0gIHtOdW1iZXJ9IHYyICAgICAgdGhlIHNlY29uZCBWIGNvb3JkaW5hdGUsIGRlZmF1bHQgb25lXG4gICAgICovXG4gICAgZHJhdzogZnVuY3Rpb24odGV4dHVyZSwgeCwgeSwgd2lkdGgsIGhlaWdodCwgdTEsIHYxLCB1MiwgdjIpIHtcbiAgICAgICAgaWYgKCF0aGlzLmRyYXdpbmcpXG4gICAgICAgICAgICB0aHJvdyBcIklsbGVnYWwgU3RhdGU6IHRyeWluZyB0byBkcmF3IGEgYmF0Y2ggYmVmb3JlIGJlZ2luKClcIjtcbiAgICAgICAgXG4gICAgICAgIC8vZG9uJ3QgZHJhdyBhbnl0aGluZyBpZiBHTCB0ZXggZG9lc24ndCBleGlzdC4uXG4gICAgICAgIGlmICghdGV4dHVyZSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLnRleHR1cmUgPT09IG51bGwgfHwgdGhpcy50ZXh0dXJlLmlkICE9PSB0ZXh0dXJlLmlkKSB7XG4gICAgICAgICAgICAvL25ldyB0ZXh0dXJlLi4gZmx1c2ggcHJldmlvdXMgZGF0YVxuICAgICAgICAgICAgdGhpcy5mbHVzaCgpO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlkeCA9PSB0aGlzLnZlcnRpY2VzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5mbHVzaCgpOyAvL3dlJ3ZlIHJlYWNoZWQgb3VyIG1heCwgZmx1c2ggYmVmb3JlIHB1c2hpbmcgbW9yZSBkYXRhXG4gICAgICAgIH1cblxuICAgICAgICB3aWR0aCA9ICh3aWR0aD09PTApID8gd2lkdGggOiAod2lkdGggfHwgdGV4dHVyZS53aWR0aCk7XG4gICAgICAgIGhlaWdodCA9IChoZWlnaHQ9PT0wKSA/IGhlaWdodCA6IChoZWlnaHQgfHwgdGV4dHVyZS5oZWlnaHQpO1xuICAgICAgICB4ID0geCB8fCAwO1xuICAgICAgICB5ID0geSB8fCAwO1xuXG4gICAgICAgIHZhciB4MSA9IHg7XG4gICAgICAgIHZhciB4MiA9IHggKyB3aWR0aDtcbiAgICAgICAgdmFyIHkxID0geTtcbiAgICAgICAgdmFyIHkyID0geSArIGhlaWdodDtcblxuICAgICAgICB1MSA9IHUxIHx8IDA7XG4gICAgICAgIHUyID0gKHUyPT09MCkgPyB1MiA6ICh1MiB8fCAxKTtcbiAgICAgICAgdjEgPSB2MSB8fCAwO1xuICAgICAgICB2MiA9ICh2Mj09PTApID8gdjIgOiAodjIgfHwgMSk7XG5cbiAgICAgICAgdmFyIGMgPSB0aGlzLmNvbG9yO1xuXG4gICAgICAgIC8veHlcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHgxO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geTE7XG4gICAgICAgIC8vY29sb3JcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IGM7XG4gICAgICAgIC8vdXZcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHUxO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdjE7XG4gICAgICAgIFxuICAgICAgICAvL3h5XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB4MjtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHkxO1xuICAgICAgICAvL2NvbG9yXG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSBjO1xuICAgICAgICAvL3V2XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB1MjtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHYxO1xuXG4gICAgICAgIC8veHlcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHgyO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geTI7XG4gICAgICAgIC8vY29sb3JcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IGM7XG4gICAgICAgIC8vdXZcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHUyO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdjI7XG5cbiAgICAgICAgLy94eVxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0geDE7XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB5MjtcbiAgICAgICAgLy9jb2xvclxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gYztcbiAgICAgICAgLy91dlxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdTE7XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2MjtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHNpbmdsZSBxdWFkIG1lc2ggdG8gdGhpcyBzcHJpdGUgYmF0Y2ggZnJvbSB0aGUgZ2l2ZW5cbiAgICAgKiBhcnJheSBvZiB2ZXJ0aWNlcy4gVGhlIHNwcml0ZSBpcyBkcmF3biBpbiBcbiAgICAgKiBzY3JlZW4tc3BhY2Ugd2l0aCB0aGUgb3JpZ2luIGF0IHRoZSB1cHBlci1sZWZ0IGNvcm5lciAoeS1kb3duKS5cbiAgICAgKlxuICAgICAqIFRoaXMgcmVhZHMgMjAgaW50ZXJsZWF2ZWQgZmxvYXRzIGZyb20gdGhlIGdpdmVuIG9mZnNldCBpbmRleCwgaW4gdGhlIGZvcm1hdFxuICAgICAqXG4gICAgICogIHsgeCwgeSwgY29sb3IsIHUsIHYsXG4gICAgICogICAgICAuLi4gIH1cbiAgICAgKlxuICAgICAqIEBtZXRob2QgIGRyYXdWZXJ0aWNlc1xuICAgICAqIEBwYXJhbSB7VGV4dHVyZX0gdGV4dHVyZSB0aGUgdGV4dHVyZSB3ZSBhcmUgZHJhd2luZyBmb3IgdGhpcyBzcHJpdGVcbiAgICAgKiBAcGFyYW0ge0Zsb2F0MzJBcnJheX0gdmVydHMgYW4gYXJyYXkgb2YgdmVydGljZXNcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gb2ZmIHRoZSBvZmZzZXQgaW50byB0aGUgdmVydGljZXMgYXJyYXkgdG8gcmVhZCBmcm9tXG4gICAgICovXG4gICAgZHJhd1ZlcnRpY2VzOiBmdW5jdGlvbih0ZXh0dXJlLCB2ZXJ0cywgb2ZmKSB7XG4gICAgICAgIGlmICghdGhpcy5kcmF3aW5nKVxuICAgICAgICAgICAgdGhyb3cgXCJJbGxlZ2FsIFN0YXRlOiB0cnlpbmcgdG8gZHJhdyBhIGJhdGNoIGJlZm9yZSBiZWdpbigpXCI7XG4gICAgICAgIFxuICAgICAgICAvL2Rvbid0IGRyYXcgYW55dGhpbmcgaWYgR0wgdGV4IGRvZXNuJ3QgZXhpc3QuLlxuICAgICAgICBpZiAoIXRleHR1cmUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy50ZXh0dXJlICE9IHRleHR1cmUpIHtcbiAgICAgICAgICAgIC8vbmV3IHRleHR1cmUuLiBmbHVzaCBwcmV2aW91cyBkYXRhXG4gICAgICAgICAgICB0aGlzLmZsdXNoKCk7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUgPSB0ZXh0dXJlO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaWR4ID09IHRoaXMudmVydGljZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLmZsdXNoKCk7IC8vd2UndmUgcmVhY2hlZCBvdXIgbWF4LCBmbHVzaCBiZWZvcmUgcHVzaGluZyBtb3JlIGRhdGFcbiAgICAgICAgfVxuXG4gICAgICAgIG9mZiA9IG9mZiB8fCAwO1xuICAgICAgICAvL1RPRE86IHVzZSBhIGxvb3AgaGVyZT9cbiAgICAgICAgLy94eVxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICAvL2NvbG9yXG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIC8vdXZcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgXG4gICAgICAgIC8veHlcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgLy9jb2xvclxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICAvL3V2XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG5cbiAgICAgICAgLy94eVxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICAvL2NvbG9yXG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIC8vdXZcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcblxuICAgICAgICAvL3h5XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIHRoaXMudmVydGljZXNbdGhpcy5pZHgrK10gPSB2ZXJ0c1tvZmYrK107XG4gICAgICAgIC8vY29sb3JcbiAgICAgICAgdGhpcy52ZXJ0aWNlc1t0aGlzLmlkeCsrXSA9IHZlcnRzW29mZisrXTtcbiAgICAgICAgLy91dlxuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgICAgICB0aGlzLnZlcnRpY2VzW3RoaXMuaWR4KytdID0gdmVydHNbb2ZmKytdO1xuICAgIH1cbn0pO1xuXG4vKipcbiAqIFRoZSBkZWZhdWx0IHZlcnRleCBzaXplLCBpLmUuIG51bWJlciBvZiBmbG9hdHMgcGVyIHZlcnRleC5cbiAqIEBhdHRyaWJ1dGUgIFZFUlRFWF9TSVpFXG4gKiBAc3RhdGljXG4gKiBAZmluYWxcbiAqIEB0eXBlIHtOdW1iZXJ9XG4gKiBAZGVmYXVsdCAgNVxuICovXG5TcHJpdGVCYXRjaC5WRVJURVhfU0laRSA9IDU7XG5cbi8qKlxuICogSW5jcmVtZW50ZWQgYWZ0ZXIgZWFjaCBkcmF3IGNhbGwsIGNhbiBiZSB1c2VkIGZvciBkZWJ1Z2dpbmcuXG4gKlxuICogICAgIFNwcml0ZUJhdGNoLnRvdGFsUmVuZGVyQ2FsbHMgPSAwO1xuICpcbiAqICAgICAuLi4gZHJhdyB5b3VyIHNjZW5lIC4uLlxuICpcbiAqICAgICBjb25zb2xlLmxvZyhcIkRyYXcgY2FsbHMgcGVyIGZyYW1lOlwiLCBTcHJpdGVCYXRjaC50b3RhbFJlbmRlckNhbGxzKTtcbiAqXG4gKiBcbiAqIEBhdHRyaWJ1dGUgIHRvdGFsUmVuZGVyQ2FsbHNcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtOdW1iZXJ9XG4gKiBAZGVmYXVsdCAgMFxuICovXG5TcHJpdGVCYXRjaC50b3RhbFJlbmRlckNhbGxzID0gMDtcblxuU3ByaXRlQmF0Y2guREVGQVVMVF9GUkFHX1NIQURFUiA9IFtcbiAgICBcInByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1wiLFxuICAgIFwidmFyeWluZyB2ZWMyIHZUZXhDb29yZDA7XCIsXG4gICAgXCJ2YXJ5aW5nIHZlYzQgdkNvbG9yO1wiLFxuICAgIFwidW5pZm9ybSBzYW1wbGVyMkQgdV90ZXh0dXJlMDtcIixcblxuICAgIFwidm9pZCBtYWluKHZvaWQpIHtcIixcbiAgICBcIiAgIGdsX0ZyYWdDb2xvciA9IHRleHR1cmUyRCh1X3RleHR1cmUwLCB2VGV4Q29vcmQwKSAqIHZDb2xvcjtcIixcbiAgICBcIn1cIlxuXS5qb2luKCdcXG4nKTtcblxuU3ByaXRlQmF0Y2guREVGQVVMVF9WRVJUX1NIQURFUiA9IFtcbiAgICBcImF0dHJpYnV0ZSB2ZWMyIFBvc2l0aW9uO1wiLFxuICAgIFwiYXR0cmlidXRlIHZlYzQgQ29sb3I7XCIsXG4gICAgXCJhdHRyaWJ1dGUgdmVjMiBUZXhDb29yZDA7XCIsXG5cbiAgICBcInVuaWZvcm0gdmVjMiB1X3Byb2plY3Rpb247XCIsXG4gICAgXCJ2YXJ5aW5nIHZlYzIgdlRleENvb3JkMDtcIixcbiAgICBcInZhcnlpbmcgdmVjNCB2Q29sb3I7XCIsXG5cbiAgICBcInZvaWQgbWFpbih2b2lkKSB7XCIsXG4gICAgXCIgICBnbF9Qb3NpdGlvbiA9IHZlYzQoIFBvc2l0aW9uLnggLyB1X3Byb2plY3Rpb24ueCAtIDEuMCwgUG9zaXRpb24ueSAvIC11X3Byb2plY3Rpb24ueSArIDEuMCAsIDAuMCwgMS4wKTtcIixcbiAgICBcIiAgIHZUZXhDb29yZDAgPSBUZXhDb29yZDA7XCIsXG4gICAgXCIgICB2Q29sb3IgPSBDb2xvcjtcIixcbiAgICBcIn1cIlxuXS5qb2luKCdcXG4nKTtcblxubW9kdWxlLmV4cG9ydHMgPSBTcHJpdGVCYXRjaDtcbiIsIi8qKlxuICogQG1vZHVsZSBrYW1pXG4gKi9cblxudmFyIENsYXNzID0gcmVxdWlyZSgna2xhc3NlJyk7XG52YXIgU2lnbmFsID0gcmVxdWlyZSgnc2lnbmFscycpO1xuXG52YXIgVGV4dHVyZSA9IG5ldyBDbGFzcyh7XG5cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyB0ZXh0dXJlIHdpdGggdGhlIG9wdGlvbmFsIHdpZHRoLCBoZWlnaHQsIGFuZCBkYXRhLlxuXHQgKlxuXHQgKiBJZiB0aGUgY29uc3RydWN0b3IgaXMgcGFzc2VkIG5vIHBhcmFtZXRlcnMgb3RoZXIgdGhhbiBXZWJHTENvbnRleHQsIHRoZW5cblx0ICogaXQgd2lsbCBub3QgYmUgaW5pdGlhbGl6ZWQgYW5kIHdpbGwgYmUgbm9uLXJlbmRlcmFibGUuIFlvdSB3aWxsIG5lZWQgdG8gbWFudWFsbHlcblx0ICogdXBsb2FkRGF0YSBvciB1cGxvYWRJbWFnZSB5b3Vyc2VsZi5cblx0ICpcblx0ICogSWYgeW91IHBhc3MgYSB3aWR0aCBhbmQgaGVpZ2h0LCB0aGUgdGV4dHVyZSB3aWxsIGJlIGluaXRpYWxpemVkIHdpdGggdGhhdCBzaXplXG5cdCAqIGFuZCBudWxsIGRhdGEgKGUuZy4gdHJhbnNwYXJlbnQgYmxhY2spLiBJZiB5b3UgYWxzbyBwYXNzIHRoZSBmb3JtYXQgYW5kIGRhdGEsIFxuXHQgKiBpdCB3aWxsIGJlIHVwbG9hZGVkIHRvIHRoZSB0ZXh0dXJlLiBcblx0ICpcblx0ICogVGhlIGFyZ3VtZW50cyBhcmUga2VwdCBpbiBtZW1vcnkgZm9yIGZ1dHVyZSBjb250ZXh0IHJlc3RvcmF0aW9uIGV2ZW50cy4gSWZcblx0ICogdGhpcyBpcyB1bmRlc2lyYWJsZSAoZS5nLiBodWdlIGJ1ZmZlcnMgd2hpY2ggbmVlZCB0byBiZSBHQydkKSwgeW91IHNob3VsZCBub3Rcblx0ICogcGFzcyB0aGUgZGF0YSBpbiB0aGUgY29uc3RydWN0b3IsIGJ1dCBpbnN0ZWFkIHVwbG9hZCBpdCBhZnRlciBjcmVhdGluZyBhbiB1bmluaXRpYWxpemVkIFxuXHQgKiB0ZXh0dXJlLiBZb3Ugd2lsbCBuZWVkIHRvIG1hbmFnZSBpdCB5b3Vyc2VsZiwgZWl0aGVyIGJ5IGV4dGVuZGluZyB0aGUgY3JlYXRlKCkgbWV0aG9kLCBcblx0ICogb3IgbGlzdGVuaW5nIHRvIHJlc3RvcmVkIGV2ZW50cyBpbiBXZWJHTENvbnRleHQuXG5cdCAqXG5cdCAqIE1vc3QgdXNlcnMgd2lsbCB3YW50IHRvIHVzZSB0aGUgQXNzZXRNYW5hZ2VyIHRvIGNyZWF0ZSBhbmQgbWFuYWdlIHRoZWlyIHRleHR1cmVzXG5cdCAqIHdpdGggYXN5bmNocm9ub3VzIGxvYWRpbmcgYW5kIGNvbnRleHQgbG9zcy4gXG5cdCAqXG5cdCAqIEBjbGFzcyAgVGV4dHVyZVxuXHQgKiBAY29uc3RydWN0b3Jcblx0ICogQHBhcmFtICB7V2ViR0xDb250ZXh0fSBjb250ZXh0IHRoZSBXZWJHTCBjb250ZXh0XG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggdGhlIHdpZHRoIG9mIHRoaXMgdGV4dHVyZVxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IGhlaWdodCB0aGUgaGVpZ2h0IG9mIHRoaXMgdGV4dHVyZVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IGZvcm1hdCBlLmcuIFRleHR1cmUuRm9ybWF0LlJHQkFcblx0ICogQHBhcmFtICB7R0xlbnVtfSBkYXRhVHlwZSBlLmcuIFRleHR1cmUuRGF0YVR5cGUuVU5TSUdORURfQllURSAoVWludDhBcnJheSlcblx0ICogQHBhcmFtICB7R0xlbnVtfSBkYXRhIHRoZSBhcnJheSBidWZmZXIsIGUuZy4gYSBVaW50OEFycmF5IHZpZXdcblx0ICovXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIFRleHR1cmUoY29udGV4dCwgd2lkdGgsIGhlaWdodCwgZm9ybWF0LCBkYXRhVHlwZSwgZGF0YSkge1xuXHRcdGlmICghY29udGV4dClcblx0XHRcdHRocm93IFwiR0wgY29udGV4dCBub3Qgc3BlY2lmaWVkXCI7XG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBXZWJHTFRleHR1cmUgd2hpY2ggYmFja3MgdGhpcyBUZXh0dXJlIG9iamVjdC4gVGhpc1xuXHRcdCAqIGNhbiBiZSB1c2VkIGZvciBsb3ctbGV2ZWwgR0wgY2FsbHMuXG5cdFx0ICogXG5cdFx0ICogQHR5cGUge1dlYkdMVGV4dHVyZX1cblx0XHQgKi9cblx0XHR0aGlzLmlkID0gbnVsbDsgLy9pbml0aWFsaXplZCBpbiBjcmVhdGUoKVxuXG5cdFx0LyoqXG5cdFx0ICogVGhlIHRhcmdldCBmb3IgdGhpcyB0ZXh0dXJlIHVuaXQsIGkuZS4gVEVYVFVSRV8yRC4gU3ViY2xhc3Nlc1xuXHRcdCAqIHNob3VsZCBvdmVycmlkZSB0aGUgY3JlYXRlKCkgbWV0aG9kIHRvIGNoYW5nZSB0aGlzLCBmb3IgY29ycmVjdFxuXHRcdCAqIHVzYWdlIHdpdGggY29udGV4dCByZXN0b3JlLlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB0YXJnZXRcblx0XHQgKiBAdHlwZSB7R0xlbnVtfVxuXHRcdCAqIEBkZWZhdWx0ICBnbC5URVhUVVJFXzJEXG5cdFx0ICovXG5cdFx0dGhpcy50YXJnZXQgPSBudWxsOyAvL2luaXRpYWxpemVkIGluIGNyZWF0ZSgpXG5cblx0XHQvKipcblx0XHQgKiBUaGUgd2lkdGggb2YgdGhpcyB0ZXh0dXJlLCBpbiBwaXhlbHMuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IHdpZHRoXG5cdFx0ICogQHJlYWRPbmx5XG5cdFx0ICogQHR5cGUge051bWJlcn0gdGhlIHdpZHRoXG5cdFx0ICovXG5cdFx0dGhpcy53aWR0aCA9IDA7IC8vaW5pdGlhbGl6ZWQgaW4gY3JlYXRlKClcblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBoZWlnaHQgb2YgdGhpcyB0ZXh0dXJlLCBpbiBwaXhlbHMuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IGhlaWdodFxuXHRcdCAqIEByZWFkT25seVxuXHRcdCAqIEB0eXBlIHtOdW1iZXJ9IHRoZSBoZWlnaHRcblx0XHQgKi9cblx0XHR0aGlzLmhlaWdodCA9IDA7IC8vaW5pdGlhbGl6ZWQgaW4gY3JlYXRlKClcblxuXHRcdC8vIGUuZy4gLS0+IG5ldyBUZXh0dXJlKGdsLCAyNTYsIDI1NiwgZ2wuUkdCLCBnbC5VTlNJR05FRF9CWVRFLCBkYXRhKTtcblx0XHQvL1x0XHQgICAgICBjcmVhdGVzIGEgbmV3IGVtcHR5IHRleHR1cmUsIDI1NngyNTZcblx0XHQvL1x0XHQtLT4gbmV3IFRleHR1cmUoZ2wpO1xuXHRcdC8vXHRcdFx0ICBjcmVhdGVzIGEgbmV3IHRleHR1cmUgYnV0IFdJVEhPVVQgdXBsb2FkaW5nIGFueSBkYXRhLiBcblxuXHRcdHRoaXMud3JhcFMgPSBUZXh0dXJlLkRFRkFVTFRfV1JBUDtcblx0XHR0aGlzLndyYXBUID0gVGV4dHVyZS5ERUZBVUxUX1dSQVA7XG5cdFx0dGhpcy5taW5GaWx0ZXIgPSBUZXh0dXJlLkRFRkFVTFRfRklMVEVSO1xuXHRcdHRoaXMubWFnRmlsdGVyID0gVGV4dHVyZS5ERUZBVUxUX0ZJTFRFUjtcblxuXHRcdC8qKlxuXHRcdCAqIFdoZW4gYSB0ZXh0dXJlIGlzIGNyZWF0ZWQsIHdlIGtlZXAgdHJhY2sgb2YgdGhlIGFyZ3VtZW50cyBwcm92aWRlZCB0byBcblx0XHQgKiBpdHMgY29uc3RydWN0b3IuIE9uIGNvbnRleHQgbG9zcyBhbmQgcmVzdG9yZSwgdGhlc2UgYXJndW1lbnRzIGFyZSByZS1zdXBwbGllZFxuXHRcdCAqIHRvIHRoZSBUZXh0dXJlLCBzbyBhcyB0byByZS1jcmVhdGUgaXQgaW4gaXRzIGNvcnJlY3QgZm9ybS5cblx0XHQgKlxuXHRcdCAqIFRoaXMgaXMgbWFpbmx5IHVzZWZ1bCBpZiB5b3UgYXJlIHByb2NlZHVyYWxseSBjcmVhdGluZyB0ZXh0dXJlcyBhbmQgcGFzc2luZ1xuXHRcdCAqIHRoZWlyIGRhdGEgZGlyZWN0bHkgKGUuZy4gZm9yIGdlbmVyaWMgbG9va3VwIHRhYmxlcyBpbiBhIHNoYWRlcikuIEZvciBpbWFnZVxuXHRcdCAqIG9yIG1lZGlhIGJhc2VkIHRleHR1cmVzLCBpdCB3b3VsZCBiZSBiZXR0ZXIgdG8gdXNlIGFuIEFzc2V0TWFuYWdlciB0byBtYW5hZ2Vcblx0XHQgKiB0aGUgYXN5bmNocm9ub3VzIHRleHR1cmUgdXBsb2FkLlxuXHRcdCAqXG5cdFx0ICogVXBvbiBkZXN0cm95aW5nIGEgdGV4dHVyZSwgYSByZWZlcmVuY2UgdG8gdGhpcyBpcyBhbHNvIGxvc3QuXG5cdFx0ICogXG5cdFx0ICogQHR5cGUge0FycmF5fSB0aGUgYXJyYXkgb2YgYXJndW1lbnRzLCBzaGlmdGVkIHRvIGV4Y2x1ZGUgdGhlIFdlYkdMQ29udGV4dCBwYXJhbWV0ZXJcblx0XHQgKi9cblx0XHR0aGlzLm1hbmFnZWRBcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblxuXHRcdC8vVGhpcyBpcyBtYWFuZ2VkIGJ5IFdlYkdMQ29udGV4dFxuXHRcdHRoaXMuY29udGV4dC5hZGRNYW5hZ2VkT2JqZWN0KHRoaXMpO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIENhbGxlZCBpbiB0aGUgVGV4dHVyZSBjb25zdHJ1Y3RvciwgYW5kIGFmdGVyIHRoZSBHTCBjb250ZXh0IGhhcyBiZWVuIHJlLWluaXRpYWxpemVkLiBcblx0ICogU3ViY2xhc3NlcyBjYW4gb3ZlcnJpZGUgdGhpcyB0byBwcm92aWRlIGEgY3VzdG9tIGRhdGEgdXBsb2FkLCBlLmcuIGN1YmVtYXBzIG9yIGNvbXByZXNzZWRcblx0ICogdGV4dHVyZXMuXG5cdCAqL1xuXHRjcmVhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wgPSB0aGlzLmNvbnRleHQuZ2w7IFxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLmlkID0gZ2wuY3JlYXRlVGV4dHVyZSgpOyAvL3RleHR1cmUgSUQgaXMgcmVjcmVhdGVkXG5cdFx0dGhpcy53aWR0aCA9IHRoaXMuaGVpZ2h0ID0gMDsgLy9zaXplIGlzIHJlc2V0IHRvIHplcm8gdW50aWwgbG9hZGVkXG5cdFx0dGhpcy50YXJnZXQgPSBnbC5URVhUVVJFXzJEOyAgLy90aGUgcHJvdmlkZXIgY2FuIGNoYW5nZSB0aGlzIGlmIG5lY2Vzc2FyeSAoZS5nLiBjdWJlIG1hcHMpXG5cblx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdC8vVE9ETzogY2xlYW4gdGhlc2UgdXAgYSBsaXR0bGUuIFxuXHQgXHRnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wsIFRleHR1cmUuVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBKTtcblx0IFx0Z2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX0FMSUdOTUVOVCwgVGV4dHVyZS5VTlBBQ0tfQUxJR05NRU5UKTtcblx0IFx0Z2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX0ZMSVBfWV9XRUJHTCwgVGV4dHVyZS5VTlBBQ0tfRkxJUF9ZKTtcblx0IFx0XG5cdCBcdHZhciBjb2xvcnNwYWNlID0gVGV4dHVyZS5VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OIHx8IGdsLkJST1dTRVJfREVGQVVMVF9XRUJHTDtcblx0IFx0Z2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgY29sb3JzcGFjZSk7XG5cblx0IFx0Ly9zZXR1cCB3cmFwIG1vZGVzIHdpdGhvdXQgYmluZGluZyByZWR1bmRhbnRseVxuXHQgXHR0aGlzLnNldFdyYXAodGhpcy53cmFwUywgdGhpcy53cmFwVCwgZmFsc2UpO1xuXHQgXHR0aGlzLnNldEZpbHRlcih0aGlzLm1pbkZpbHRlciwgdGhpcy5tYWdGaWx0ZXIsIGZhbHNlKTtcblx0IFx0XG5cdCBcdGlmICh0aGlzLm1hbmFnZWRBcmdzLmxlbmd0aCAhPT0gMCkge1xuXHQgXHRcdHRoaXMudXBsb2FkRGF0YS5hcHBseSh0aGlzLCB0aGlzLm1hbmFnZWRBcmdzKTtcblx0IFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBEZXN0cm95cyB0aGlzIHRleHR1cmUgYnkgZGVsZXRpbmcgdGhlIEdMIHJlc291cmNlLFxuXHQgKiByZW1vdmluZyBpdCBmcm9tIHRoZSBXZWJHTENvbnRleHQgbWFuYWdlbWVudCBzdGFjayxcblx0ICogc2V0dGluZyBpdHMgc2l6ZSB0byB6ZXJvLCBhbmQgaWQgYW5kIG1hbmFnZWQgYXJndW1lbnRzIHRvIG51bGwuXG5cdCAqIFxuXHQgKiBHZW5lcmFsbHkgYSBkZXN0cm95ZWQgdGV4dHVyZSBpcyBubyBsb25nZXIgdXNhYmxlLlxuXHQgKi9cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaWQgJiYgdGhpcy5nbClcblx0XHRcdHRoaXMuZ2wuZGVsZXRlVGV4dHVyZSh0aGlzLmlkKTtcblx0XHRpZiAodGhpcy5jb250ZXh0KVxuXHRcdFx0dGhpcy5jb250ZXh0LnJlbW92ZU1hbmFnZWRPYmplY3QodGhpcyk7XG5cdFx0dGhpcy53aWR0aCA9IHRoaXMuaGVpZ2h0ID0gMDtcblx0XHR0aGlzLmlkID0gbnVsbDtcblx0XHR0aGlzLm1hbmFnZWRBcmdzID0gbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogU2V0cyB0aGUgd3JhcCBtb2RlIGZvciB0aGlzIHRleHR1cmU7IGlmIHRoZSBzZWNvbmQgYXJndW1lbnRcblx0ICogaXMgdW5kZWZpbmVkIG9yIGZhbHN5LCB0aGVuIGJvdGggUyBhbmQgVCB3cmFwIHdpbGwgdXNlIHRoZSBmaXJzdFxuXHQgKiBhcmd1bWVudC5cblx0ICpcblx0ICogWW91IGNhbiB1c2UgVGV4dHVyZS5XcmFwIGNvbnN0YW50cyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIG5lZWRpbmcgXG5cdCAqIGEgR0wgcmVmZXJlbmNlLlxuXHQgKlxuXHQgKiBAbWV0aG9kICBzZXRXcmFwXG5cdCAqIEBwYXJhbSB7R0xlbnVtfSBzIHRoZSBTIHdyYXAgbW9kZVxuXHQgKiBAcGFyYW0ge0dMZW51bX0gdCB0aGUgVCB3cmFwIG1vZGVcblx0ICogQHBhcmFtIHtCb29sZWFufSBpZ25vcmVCaW5kIChvcHRpb25hbCkgaWYgdHJ1ZSwgdGhlIGJpbmQgd2lsbCBiZSBpZ25vcmVkLiBcblx0ICovXG5cdHNldFdyYXA6IGZ1bmN0aW9uKHMsIHQsIGlnbm9yZUJpbmQpIHsgLy9UT0RPOiBzdXBwb3J0IFIgd3JhcCBtb2RlXG5cdFx0aWYgKHMgJiYgdCkge1xuXHRcdFx0dGhpcy53cmFwUyA9IHM7XG5cdFx0XHR0aGlzLndyYXBUID0gdDtcblx0XHR9IGVsc2UgXG5cdFx0XHR0aGlzLndyYXBTID0gdGhpcy53cmFwVCA9IHM7XG5cdFx0XHRcblx0XHRpZiAoIWlnbm9yZUJpbmQpXG5cdFx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdCBcdGdsLnRleFBhcmFtZXRlcmkodGhpcy50YXJnZXQsIGdsLlRFWFRVUkVfV1JBUF9TLCB0aGlzLndyYXBTKTtcblx0XHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX1dSQVBfVCwgdGhpcy53cmFwVCk7XG5cdH0sXG5cblxuXHQvKipcblx0ICogU2V0cyB0aGUgbWluIGFuZCBtYWcgZmlsdGVyIGZvciB0aGlzIHRleHR1cmU7IFxuXHQgKiBpZiBtYWcgaXMgdW5kZWZpbmVkIG9yIGZhbHN5LCB0aGVuIGJvdGggbWluIGFuZCBtYWcgd2lsbCB1c2UgdGhlXG5cdCAqIGZpbHRlciBzcGVjaWZpZWQgZm9yIG1pbi5cblx0ICpcblx0ICogWW91IGNhbiB1c2UgVGV4dHVyZS5GaWx0ZXIgY29uc3RhbnRzIGZvciBjb252ZW5pZW5jZSwgdG8gYXZvaWQgbmVlZGluZyBcblx0ICogYSBHTCByZWZlcmVuY2UuXG5cdCAqIFxuXHQgKiBAcGFyYW0ge0dMZW51bX0gbWluIHRoZSBtaW5pZmljYXRpb24gZmlsdGVyXG5cdCAqIEBwYXJhbSB7R0xlbnVtfSBtYWcgdGhlIG1hZ25pZmljYXRpb24gZmlsdGVyXG5cdCAqIEBwYXJhbSB7Qm9vbGVhbn0gaWdub3JlQmluZCBpZiB0cnVlLCB0aGUgYmluZCB3aWxsIGJlIGlnbm9yZWQuIFxuXHQgKi9cblx0c2V0RmlsdGVyOiBmdW5jdGlvbihtaW4sIG1hZywgaWdub3JlQmluZCkgeyBcblx0XHRpZiAobWluICYmIG1hZykge1xuXHRcdFx0dGhpcy5taW5GaWx0ZXIgPSBtaW47XG5cdFx0XHR0aGlzLm1hZ0ZpbHRlciA9IG1hZztcblx0XHR9IGVsc2UgXG5cdFx0XHR0aGlzLm1pbkZpbHRlciA9IHRoaXMubWFnRmlsdGVyID0gbWluO1xuXHRcdFx0XG5cdFx0aWYgKCFpZ25vcmVCaW5kKVxuXHRcdFx0dGhpcy5iaW5kKCk7XG5cblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdGdsLnRleFBhcmFtZXRlcmkodGhpcy50YXJnZXQsIGdsLlRFWFRVUkVfTUlOX0ZJTFRFUiwgdGhpcy5taW5GaWx0ZXIpO1xuXHQgXHRnbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCBnbC5URVhUVVJFX01BR19GSUxURVIsIHRoaXMubWFnRmlsdGVyKTtcblx0fSxcblxuXHQvKipcblx0ICogQSBsb3ctbGV2ZWwgbWV0aG9kIHRvIHVwbG9hZCB0aGUgc3BlY2lmaWVkIEFycmF5QnVmZmVyVmlld1xuXHQgKiB0byB0aGlzIHRleHR1cmUuIFRoaXMgd2lsbCBjYXVzZSB0aGUgd2lkdGggYW5kIGhlaWdodCBvZiB0aGlzXG5cdCAqIHRleHR1cmUgdG8gY2hhbmdlLlxuXHQgKlxuXHQgKiBAbWV0aG9kICB1cGxvYWREYXRhXG5cdCAqIEBwYXJhbSAge051bWJlcn0gd2lkdGggICAgICAgICAgdGhlIG5ldyB3aWR0aCBvZiB0aGlzIHRleHR1cmUsXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHMgdG8gdGhlIGxhc3QgdXNlZCB3aWR0aCAob3IgemVybylcblx0ICogQHBhcmFtICB7TnVtYmVyfSBoZWlnaHQgICAgICAgICB0aGUgbmV3IGhlaWdodCBvZiB0aGlzIHRleHR1cmVcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0cyB0byB0aGUgbGFzdCB1c2VkIGhlaWdodCAob3IgemVybylcblx0ICogQHBhcmFtICB7R0xlbnVtfSBmb3JtYXQgICAgICAgICB0aGUgZGF0YSBmb3JtYXQsIGRlZmF1bHQgUkdCQVxuXHQgKiBAcGFyYW0gIHtHTGVudW19IHR5cGUgICAgICAgICAgIHRoZSBkYXRhIHR5cGUsIGRlZmF1bHQgVU5TSUdORURfQllURSAoVWludDhBcnJheSlcblx0ICogQHBhcmFtICB7QXJyYXlCdWZmZXJWaWV3fSBkYXRhICB0aGUgcmF3IGRhdGEgZm9yIHRoaXMgdGV4dHVyZSwgb3IgbnVsbCBmb3IgYW4gZW1wdHkgaW1hZ2Vcblx0ICovXG5cdHVwbG9hZERhdGE6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cblx0XHR0aGlzLmZvcm1hdCA9IGZvcm1hdCB8fCBnbC5SR0JBO1xuXHRcdHR5cGUgPSB0eXBlIHx8IGdsLlVOU0lHTkVEX0JZVEU7XG5cdFx0ZGF0YSA9IGRhdGEgfHwgbnVsbDsgLy9tYWtlIHN1cmUgZmFsc2V5IHZhbHVlIGlzIG51bGwgZm9yIHRleEltYWdlMkRcblxuXHRcdHRoaXMud2lkdGggPSAod2lkdGggfHwgd2lkdGg9PTApID8gd2lkdGggOiB0aGlzLndpZHRoO1xuXHRcdHRoaXMuaGVpZ2h0ID0gKGhlaWdodCB8fCBoZWlnaHQ9PTApID8gaGVpZ2h0IDogdGhpcy5oZWlnaHQ7XG5cblx0XHR0aGlzLmJpbmQoKTtcblxuXHRcdGdsLnRleEltYWdlMkQodGhpcy50YXJnZXQsIDAsIHRoaXMuZm9ybWF0LCBcblx0XHRcdFx0XHQgIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0LCAwLCB0aGlzLmZvcm1hdCxcblx0XHRcdFx0XHQgIHR5cGUsIGRhdGEpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBVcGxvYWRzIEltYWdlRGF0YSwgSFRNTEltYWdlRWxlbWVudCwgSFRNTENhbnZhc0VsZW1lbnQgb3IgXG5cdCAqIEhUTUxWaWRlb0VsZW1lbnQuXG5cdCAqXG5cdCAqIEBtZXRob2QgIHVwbG9hZEltYWdlXG5cdCAqIEBwYXJhbSAge09iamVjdH0gZG9tT2JqZWN0IHRoZSBET00gaW1hZ2UgY29udGFpbmVyXG5cdCAqL1xuXHR1cGxvYWRJbWFnZTogZnVuY3Rpb24oZG9tT2JqZWN0LCBmb3JtYXQsIHR5cGUpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dGhpcy5mb3JtYXQgPSBmb3JtYXQgfHwgZ2wuUkdCQTtcblx0XHR0eXBlID0gdHlwZSB8fCBnbC5VTlNJR05FRF9CWVRFO1xuXHRcdFxuXHRcdHRoaXMud2lkdGggPSBkb21PYmplY3Qud2lkdGg7XG5cdFx0dGhpcy5oZWlnaHQgPSBkb21PYmplY3QuaGVpZ2h0O1xuXG5cdFx0dGhpcy5iaW5kKCk7XG5cblx0XHRnbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCB0aGlzLmZvcm1hdCwgdGhpcy5mb3JtYXQsXG5cdFx0XHRcdFx0ICB0eXBlLCBkb21PYmplY3QpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBCaW5kcyB0aGUgdGV4dHVyZS4gSWYgdW5pdCBpcyBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgYmluZCB0aGUgdGV4dHVyZSBhdCB0aGUgZ2l2ZW4gc2xvdFxuXHQgKiAoVEVYVFVSRTAsIFRFWFRVUkUxLCBldGMpLiBJZiB1bml0IGlzIG5vdCBzcGVjaWZpZWQsXG5cdCAqIGl0IHdpbGwgc2ltcGx5IGJpbmQgdGhlIHRleHR1cmUgYXQgd2hpY2hldmVyIHNsb3Rcblx0ICogaXMgY3VycmVudGx5IGFjdGl2ZS5cblx0ICpcblx0ICogQG1ldGhvZCAgYmluZFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHVuaXQgdGhlIHRleHR1cmUgdW5pdCBpbmRleCwgc3RhcnRpbmcgYXQgMFxuXHQgKi9cblx0YmluZDogZnVuY3Rpb24odW5pdCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0aWYgKHVuaXQgfHwgdW5pdCA9PT0gMClcblx0XHRcdGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyB1bml0KTtcblx0XHRnbC5iaW5kVGV4dHVyZSh0aGlzLnRhcmdldCwgdGhpcy5pZCk7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmlkICsgXCI6XCIgKyB0aGlzLndpZHRoICsgXCJ4XCIgKyB0aGlzLmhlaWdodCArIFwiXCI7XG5cdH1cbn0pO1xuXG4vKiogXG4gKiBBIHNldCBvZiBGaWx0ZXIgY29uc3RhbnRzIHRoYXQgbWF0Y2ggdGhlaXIgR0wgY291bnRlcnBhcnRzLlxuICogVGhpcyBpcyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIHRoZSBuZWVkIGZvciBhIEdMIHJlbmRlcmluZyBjb250ZXh0LlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGBcbiAqICAgICBUZXh0dXJlLkZpbHRlci5ORUFSRVNUXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVF9NSVBNQVBfTElORUFSXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTkVBUkVTVF9NSVBNQVBfTkVBUkVTVFxuICogICAgIFRleHR1cmUuRmlsdGVyLkxJTkVBUlxuICogICAgIFRleHR1cmUuRmlsdGVyLkxJTkVBUl9NSVBNQVBfTElORUFSXG4gKiAgICAgVGV4dHVyZS5GaWx0ZXIuTElORUFSX01JUE1BUF9ORUFSRVNUXG4gKiBgYGBcbiAqIEBhdHRyaWJ1dGUgRmlsdGVyXG4gKiBAc3RhdGljXG4gKiBAdHlwZSB7T2JqZWN0fVxuICovXG5UZXh0dXJlLkZpbHRlciA9IHtcblx0TkVBUkVTVDogOTcyOCxcblx0TkVBUkVTVF9NSVBNQVBfTElORUFSOiA5OTg2LFxuXHRORUFSRVNUX01JUE1BUF9ORUFSRVNUOiA5OTg0LFxuXHRMSU5FQVI6IDk3MjksXG5cdExJTkVBUl9NSVBNQVBfTElORUFSOiA5OTg3LFxuXHRMSU5FQVJfTUlQTUFQX05FQVJFU1Q6IDk5ODVcbn07XG5cbi8qKiBcbiAqIEEgc2V0IG9mIFdyYXAgY29uc3RhbnRzIHRoYXQgbWF0Y2ggdGhlaXIgR0wgY291bnRlcnBhcnRzLlxuICogVGhpcyBpcyBmb3IgY29udmVuaWVuY2UsIHRvIGF2b2lkIHRoZSBuZWVkIGZvciBhIEdMIHJlbmRlcmluZyBjb250ZXh0LlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGBcbiAqICAgICBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRVxuICogICAgIFRleHR1cmUuV3JhcC5NSVJST1JFRF9SRVBFQVRcbiAqICAgICBUZXh0dXJlLldyYXAuUkVQRUFUXG4gKiBgYGBcbiAqIEBhdHRyaWJ1dGUgV3JhcFxuICogQHN0YXRpY1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuVGV4dHVyZS5XcmFwID0ge1xuXHRDTEFNUF9UT19FREdFOiAzMzA3MSxcblx0TUlSUk9SRURfUkVQRUFUOiAzMzY0OCxcblx0UkVQRUFUOiAxMDQ5N1xufTtcblxuLyoqIFxuICogQSBzZXQgb2YgRm9ybWF0IGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5Gb3JtYXQuUkdCXG4gKiAgICAgVGV4dHVyZS5Gb3JtYXQuUkdCQVxuICogICAgIFRleHR1cmUuRm9ybWF0LkxVTUlOQU5DRV9BTFBIQVxuICogYGBgXG4gKiBAYXR0cmlidXRlIEZvcm1hdFxuICogQHN0YXRpY1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuVGV4dHVyZS5Gb3JtYXQgPSB7XG5cdERFUFRIX0NPTVBPTkVOVDogNjQwMixcblx0QUxQSEE6IDY0MDYsXG5cdFJHQkE6IDY0MDgsXG5cdFJHQjogNjQwNyxcblx0TFVNSU5BTkNFOiA2NDA5LFxuXHRMVU1JTkFOQ0VfQUxQSEE6IDY0MTBcbn07XG5cbi8qKiBcbiAqIEEgc2V0IG9mIERhdGFUeXBlIGNvbnN0YW50cyB0aGF0IG1hdGNoIHRoZWlyIEdMIGNvdW50ZXJwYXJ0cy5cbiAqIFRoaXMgaXMgZm9yIGNvbnZlbmllbmNlLCB0byBhdm9pZCB0aGUgbmVlZCBmb3IgYSBHTCByZW5kZXJpbmcgY29udGV4dC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgXG4gKiAgICAgVGV4dHVyZS5EYXRhVHlwZS5VTlNJR05FRF9CWVRFIFxuICogICAgIFRleHR1cmUuRGF0YVR5cGUuRkxPQVQgXG4gKiBgYGBcbiAqIEBhdHRyaWJ1dGUgRGF0YVR5cGVcbiAqIEBzdGF0aWNcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblRleHR1cmUuRGF0YVR5cGUgPSB7XG5cdEJZVEU6IDUxMjAsXG5cdFNIT1JUOiA1MTIyLFxuXHRJTlQ6IDUxMjQsXG5cdEZMT0FUOiA1MTI2LFxuXHRVTlNJR05FRF9CWVRFOiA1MTIxLFxuXHRVTlNJR05FRF9JTlQ6IDUxMjUsXG5cdFVOU0lHTkVEX1NIT1JUOiA1MTIzLFxuXHRVTlNJR05FRF9TSE9SVF80XzRfNF80OiAzMjgxOSxcblx0VU5TSUdORURfU0hPUlRfNV81XzVfMTogMzI4MjAsXG5cdFVOU0lHTkVEX1NIT1JUXzVfNl81OiAzMzYzNVxufVxuXG4vKipcbiAqIFRoZSBkZWZhdWx0IHdyYXAgbW9kZSB3aGVuIGNyZWF0aW5nIG5ldyB0ZXh0dXJlcy4gSWYgYSBjdXN0b20gXG4gKiBwcm92aWRlciB3YXMgc3BlY2lmaWVkLCBpdCBtYXkgY2hvb3NlIHRvIG92ZXJyaWRlIHRoaXMgZGVmYXVsdCBtb2RlLlxuICogXG4gKiBAYXR0cmlidXRlIHtHTGVudW19IERFRkFVTFRfV1JBUFxuICogQHN0YXRpYyBcbiAqIEBkZWZhdWx0ICBUZXh0dXJlLldyYXAuQ0xBTVBfVE9fRURHRVxuICovXG5UZXh0dXJlLkRFRkFVTFRfV1JBUCA9IFRleHR1cmUuV3JhcC5DTEFNUF9UT19FREdFO1xuXG5cbi8qKlxuICogVGhlIGRlZmF1bHQgZmlsdGVyIG1vZGUgd2hlbiBjcmVhdGluZyBuZXcgdGV4dHVyZXMuIElmIGEgY3VzdG9tXG4gKiBwcm92aWRlciB3YXMgc3BlY2lmaWVkLCBpdCBtYXkgY2hvb3NlIHRvIG92ZXJyaWRlIHRoaXMgZGVmYXVsdCBtb2RlLlxuICpcbiAqIEBhdHRyaWJ1dGUge0dMZW51bX0gREVGQVVMVF9GSUxURVJcbiAqIEBzdGF0aWNcbiAqIEBkZWZhdWx0ICBUZXh0dXJlLkZpbHRlci5MSU5FQVJcbiAqL1xuVGV4dHVyZS5ERUZBVUxUX0ZJTFRFUiA9IFRleHR1cmUuRmlsdGVyLk5FQVJFU1Q7XG5cbi8vZGVmYXVsdCBwaXhlbCBzdG9yZSBvcGVyYXRpb25zLiBVc2VkIGluIGNyZWF0ZSgpXG5UZXh0dXJlLlVOUEFDS19GTElQX1kgPSBmYWxzZTtcblRleHR1cmUuVU5QQUNLX0FMSUdOTUVOVCA9IDE7XG5UZXh0dXJlLlVOUEFDS19QUkVNVUxUSVBMWV9BTFBIQSA9IHRydWU7IFxuVGV4dHVyZS5VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OID0gdW5kZWZpbmVkO1xuXG4vKipcbiAqIFV0aWxpdHkgdG8gZ2V0IHRoZSBudW1iZXIgb2YgY29tcG9uZW50cyBmb3IgdGhlIGdpdmVuIEdMZW51bSwgZS5nLiBnbC5SR0JBIHJldHVybnMgNC5cbiAqIFJldHVybnMgbnVsbCBpZiB0aGUgc3BlY2lmaWVkIGZvcm1hdCBpcyBub3Qgb2YgdHlwZSBERVBUSF9DT01QT05FTlQsIEFMUEhBLCBMVU1JTkFOQ0UsXG4gKiBMVU1JTkFOQ0VfQUxQSEEsIFJHQiwgb3IgUkdCQS5cbiAqIFxuICogQG1ldGhvZCBnZXROdW1Db21wb25lbnRzXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0gIHtHTGVudW19IGZvcm1hdCBhIHRleHR1cmUgZm9ybWF0LCBpLmUuIFRleHR1cmUuRm9ybWF0LlJHQkFcbiAqIEByZXR1cm4ge051bWJlcn0gdGhlIG51bWJlciBvZiBjb21wb25lbnRzIGZvciB0aGlzIGZvcm1hdFxuICovXG5UZXh0dXJlLmdldE51bUNvbXBvbmVudHMgPSBmdW5jdGlvbihmb3JtYXQpIHtcblx0c3dpdGNoIChmb3JtYXQpIHtcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkRFUFRIX0NPTVBPTkVOVDpcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LkFMUEhBOlxuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuTFVNSU5BTkNFOlxuXHRcdFx0cmV0dXJuIDE7XG5cdFx0Y2FzZSBUZXh0dXJlLkZvcm1hdC5MVU1JTkFOQ0VfQUxQSEE6XG5cdFx0XHRyZXR1cm4gMjtcblx0XHRjYXNlIFRleHR1cmUuRm9ybWF0LlJHQjpcblx0XHRcdHJldHVybiAzO1xuXHRcdGNhc2UgVGV4dHVyZS5Gb3JtYXQuUkdCQTpcblx0XHRcdHJldHVybiA0O1xuXHR9XG5cdHJldHVybiBudWxsO1xufTtcblxuLy9Vbm1hbmFnZWQgdGV4dHVyZXM6XG4vL1x0SFRNTCBlbGVtZW50cyBsaWtlIEltYWdlLCBWaWRlbywgQ2FudmFzXG4vL1x0cGl4ZWxzIGJ1ZmZlciBmcm9tIENhbnZhc1xuLy9cdHBpeGVscyBhcnJheVxuXG4vL05lZWQgc3BlY2lhbCBoYW5kbGluZzpcbi8vICBjb250ZXh0Lm9uQ29udGV4dExvc3QuYWRkKGZ1bmN0aW9uKCkge1xuLy8gIFx0Y3JlYXRlRHluYW1pY1RleHR1cmUoKTtcbi8vICB9LmJpbmQodGhpcykpO1xuXG4vL01hbmFnZWQgdGV4dHVyZXM6XG4vL1x0aW1hZ2VzIHNwZWNpZmllZCB3aXRoIGEgcGF0aFxuLy9cdHRoaXMgd2lsbCB1c2UgSW1hZ2UgdW5kZXIgdGhlIGhvb2RcblxuXG5tb2R1bGUuZXhwb3J0cyA9IFRleHR1cmU7IiwiLyoqXG4gKiBAbW9kdWxlIGthbWlcbiAqL1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCdrbGFzc2UnKTtcbnZhciBTaWduYWwgPSByZXF1aXJlKCdzaWduYWxzJyk7XG5cbi8qKlxuICogQSB0aGluIHdyYXBwZXIgYXJvdW5kIFdlYkdMUmVuZGVyaW5nQ29udGV4dCB3aGljaCBoYW5kbGVzXG4gKiBjb250ZXh0IGxvc3MgYW5kIHJlc3RvcmUgd2l0aCB2YXJpb3VzIHJlbmRlcmluZyBvYmplY3RzICh0ZXh0dXJlcyxcbiAqIHNoYWRlcnMgYW5kIGJ1ZmZlcnMpLiBUaGlzIGFsc28gaGFuZGxlcyBnZW5lcmFsIHZpZXdwb3J0IG1hbmFnZW1lbnQuXG4gKlxuICogSWYgdGhlIHZpZXcgaXMgbm90IHNwZWNpZmllZCwgYSBjYW52YXMgd2lsbCBiZSBjcmVhdGVkLlxuICogXG4gKiBAY2xhc3MgIFdlYkdMQ29udGV4dFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge051bWJlcn0gd2lkdGggdGhlIHdpZHRoIG9mIHRoZSBHTCBjYW52YXNcbiAqIEBwYXJhbSB7TnVtYmVyfSBoZWlnaHQgdGhlIGhlaWdodCBvZiB0aGUgR0wgY2FudmFzXG4gKiBAcGFyYW0ge0hUTUxDYW52YXNFbGVtZW50fSB2aWV3IHRoZSBvcHRpb25hbCBET00gY2FudmFzIGVsZW1lbnRcbiAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0QXR0cmlidWV0cyBhbiBvYmplY3QgY29udGFpbmluZyBjb250ZXh0IGF0dHJpYnMgd2hpY2hcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWxsIGJlIHVzZWQgZHVyaW5nIEdMIGluaXRpYWxpemF0aW9uXG4gKi9cbnZhciBXZWJHTENvbnRleHQgPSBuZXcgQ2xhc3Moe1xuXHRcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gV2ViR0xDb250ZXh0KHdpZHRoLCBoZWlnaHQsIHZpZXcsIGNvbnRleHRBdHRyaWJ1dGVzKSB7XG5cdFx0LyoqXG5cdFx0ICogVGhlIGxpc3Qgb2YgcmVuZGVyaW5nIG9iamVjdHMgKHNoYWRlcnMsIFZCT3MsIHRleHR1cmVzLCBldGMpIHdoaWNoIGFyZSBcblx0XHQgKiBjdXJyZW50bHkgYmVpbmcgbWFuYWdlZC4gQW55IG9iamVjdCB3aXRoIGEgXCJjcmVhdGVcIiBtZXRob2QgY2FuIGJlIGFkZGVkXG5cdFx0ICogdG8gdGhpcyBsaXN0LiBVcG9uIGRlc3Ryb3lpbmcgdGhlIHJlbmRlcmluZyBvYmplY3QsIGl0IHNob3VsZCBiZSByZW1vdmVkLlxuXHRcdCAqIFNlZSBhZGRNYW5hZ2VkT2JqZWN0IGFuZCByZW1vdmVNYW5hZ2VkT2JqZWN0LlxuXHRcdCAqIFxuXHRcdCAqIEBwcm9wZXJ0eSB7QXJyYXl9IG1hbmFnZWRPYmplY3RzXG5cdFx0ICovXG5cdFx0dGhpcy5tYW5hZ2VkT2JqZWN0cyA9IFtdO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIGFjdHVhbCBHTCBjb250ZXh0LiBZb3UgY2FuIHVzZSB0aGlzIGZvclxuXHRcdCAqIHJhdyBHTCBjYWxscyBvciB0byBhY2Nlc3MgR0xlbnVtIGNvbnN0YW50cy4gVGhpc1xuXHRcdCAqIHdpbGwgYmUgdXBkYXRlZCBvbiBjb250ZXh0IHJlc3RvcmUuIFdoaWxlIHRoZSBXZWJHTENvbnRleHRcblx0XHQgKiBpcyBub3QgYHZhbGlkYCwgeW91IHNob3VsZCBub3QgdHJ5IHRvIGFjY2VzcyBHTCBzdGF0ZS5cblx0XHQgKiBcblx0XHQgKiBAcHJvcGVydHkgZ2xcblx0XHQgKiBAdHlwZSB7V2ViR0xSZW5kZXJpbmdDb250ZXh0fVxuXHRcdCAqL1xuXHRcdHRoaXMuZ2wgPSBudWxsO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIGNhbnZhcyBET00gZWxlbWVudCBmb3IgdGhpcyBjb250ZXh0LlxuXHRcdCAqIEBwcm9wZXJ0eSB7TnVtYmVyfSB2aWV3XG5cdFx0ICovXG5cdFx0dGhpcy52aWV3ID0gdmlldyB8fCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuXG5cdFx0Ly9kZWZhdWx0IHNpemUgYXMgcGVyIHNwZWM6XG5cdFx0Ly9odHRwOi8vd3d3LnczLm9yZy9UUi8yMDEyL1dELWh0bWw1LWF1dGhvci0yMDEyMDMyOS90aGUtY2FudmFzLWVsZW1lbnQuaHRtbCN0aGUtY2FudmFzLWVsZW1lbnRcblx0XHRcblx0XHQvKipcblx0XHQgKiBUaGUgd2lkdGggb2YgdGhpcyBjYW52YXMuXG5cdFx0ICpcblx0XHQgKiBAcHJvcGVydHkgd2lkdGhcblx0XHQgKiBAdHlwZSB7TnVtYmVyfVxuXHRcdCAqL1xuXHRcdHRoaXMud2lkdGggPSB0aGlzLnZpZXcud2lkdGggPSB3aWR0aCB8fCAzMDA7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgaGVpZ2h0IG9mIHRoaXMgY2FudmFzLlxuXHRcdCAqIEBwcm9wZXJ0eSBoZWlnaHRcblx0XHQgKiBAdHlwZSB7TnVtYmVyfVxuXHRcdCAqL1xuXHRcdHRoaXMuaGVpZ2h0ID0gdGhpcy52aWV3LmhlaWdodCA9IGhlaWdodCB8fCAxNTA7XG5cblxuXHRcdC8qKlxuXHRcdCAqIFRoZSBjb250ZXh0IGF0dHJpYnV0ZXMgZm9yIGluaXRpYWxpemluZyB0aGUgR0wgc3RhdGUuIFRoaXMgbWlnaHQgaW5jbHVkZVxuXHRcdCAqIGFudGktYWxpYXNpbmcsIGFscGhhIHNldHRpbmdzLCB2ZXJpc29uLCBhbmQgc28gZm9ydGguXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IHtPYmplY3R9IGNvbnRleHRBdHRyaWJ1dGVzIFxuXHRcdCAqL1xuXHRcdHRoaXMuY29udGV4dEF0dHJpYnV0ZXMgPSBjb250ZXh0QXR0cmlidXRlcztcblx0XHRcblx0XHQvKipcblx0XHQgKiBXaGV0aGVyIHRoaXMgY29udGV4dCBpcyAndmFsaWQnLCBpLmUuIHJlbmRlcmFibGUuIEEgY29udGV4dCB0aGF0IGhhcyBiZWVuIGxvc3Rcblx0XHQgKiAoYW5kIG5vdCB5ZXQgcmVzdG9yZWQpIGlzIGludmFsaWQuXG5cdFx0ICogXG5cdFx0ICogQHByb3BlcnR5IHtCb29sZWFufSB2YWxpZFxuXHRcdCAqL1xuXHRcdHRoaXMudmFsaWQgPSBmYWxzZTtcblxuXHRcdC8qKlxuXHRcdCAqIEEgc2lnbmFsIGRpc3BhdGNoZWQgd2hlbiBHTCBjb250ZXh0IGlzIGxvc3QuIFxuXHRcdCAqIFxuXHRcdCAqIFRoZSBmaXJzdCBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIGxpc3RlbmVyIGlzIHRoZSBXZWJHTENvbnRleHRcblx0XHQgKiBtYW5hZ2luZyB0aGUgY29udGV4dCBsb3NzLlxuXHRcdCAqIFxuXHRcdCAqIEBldmVudCB7U2lnbmFsfSBsb3N0XG5cdFx0ICovXG5cdFx0dGhpcy5sb3N0ID0gbmV3IFNpZ25hbCgpO1xuXG5cdFx0LyoqXG5cdFx0ICogQSBzaWduYWwgZGlzcGF0Y2hlZCB3aGVuIEdMIGNvbnRleHQgaXMgcmVzdG9yZWQsIGFmdGVyIGFsbCB0aGUgbWFuYWdlZFxuXHRcdCAqIG9iamVjdHMgaGF2ZSBiZWVuIHJlY3JlYXRlZC5cblx0XHQgKlxuXHRcdCAqIFRoZSBmaXJzdCBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIGxpc3RlbmVyIGlzIHRoZSBXZWJHTENvbnRleHRcblx0XHQgKiB3aGljaCBtYW5hZ2VkIHRoZSByZXN0b3JhdGlvbi5cblx0XHQgKlxuXHRcdCAqIFRoaXMgZG9lcyBub3QgZ2F1cmVudGVlIHRoYXQgYWxsIG9iamVjdHMgd2lsbCBiZSByZW5kZXJhYmxlLlxuXHRcdCAqIEZvciBleGFtcGxlLCBhIFRleHR1cmUgd2l0aCBhbiBJbWFnZVByb3ZpZGVyIG1heSBzdGlsbCBiZSBsb2FkaW5nXG5cdFx0ICogYXN5bmNocm9ub3VzbHkuXHQgXG5cdFx0ICogXG5cdFx0ICogQGV2ZW50IHtTaWduYWx9IHJlc3RvcmVkXG5cdFx0ICovXG5cdFx0dGhpcy5yZXN0b3JlZCA9IG5ldyBTaWduYWwoKTtcdFxuXHRcdFxuXHRcdC8vc2V0dXAgY29udGV4dCBsb3N0IGFuZCByZXN0b3JlIGxpc3RlbmVyc1xuXHRcdHRoaXMudmlldy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0bG9zdFwiLCBmdW5jdGlvbiAoZXYpIHtcblx0XHRcdGV2LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLl9jb250ZXh0TG9zdChldik7XG5cdFx0fS5iaW5kKHRoaXMpKTtcblx0XHR0aGlzLnZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmdsY29udGV4dHJlc3RvcmVkXCIsIGZ1bmN0aW9uIChldikge1xuXHRcdFx0ZXYucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMuX2NvbnRleHRSZXN0b3JlZChldik7XG5cdFx0fS5iaW5kKHRoaXMpKTtcblx0XHRcdFxuXHRcdHRoaXMuX2luaXRDb250ZXh0KCk7XG5cblx0XHR0aGlzLnJlc2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG5cdH0sXG5cblx0X2luaXRDb250ZXh0OiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZXJyID0gXCJcIjtcblx0XHR0aGlzLnZhbGlkID0gZmFsc2U7XG5cblx0XHR0cnkge1xuXHQgICAgICAgIHRoaXMuZ2wgPSAodGhpcy52aWV3LmdldENvbnRleHQoJ3dlYmdsJywgdGhpcy5jb250ZXh0QXR0cmlidXRlcykgXG5cdCAgICAgICAgXHRcdFx0fHwgdGhpcy52aWV3LmdldENvbnRleHQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcsIHRoaXMuY29udGV4dEF0dHJpYnV0ZXMpKTtcblx0ICAgIH0gY2F0Y2ggKGUpIHtcblx0ICAgIFx0dGhpcy5nbCA9IG51bGw7XG5cdCAgICB9XG5cblx0XHRpZiAodGhpcy5nbCkge1xuXHRcdFx0dGhpcy52YWxpZCA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IFwiV2ViR0wgQ29udGV4dCBOb3QgU3VwcG9ydGVkIC0tIHRyeSBlbmFibGluZyBpdCBvciB1c2luZyBhIGRpZmZlcmVudCBicm93c2VyXCI7XG5cdFx0fVx0XG5cdH0sXG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHdpZHRoIGFuZCBoZWlnaHQgb2YgdGhpcyBXZWJHTCBjb250ZXh0LCByZXNpemVzXG5cdCAqIHRoZSBjYW52YXMgdmlldywgYW5kIGNhbGxzIGdsLnZpZXdwb3J0KCkgd2l0aCB0aGUgbmV3IHNpemUuXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtOdW1iZXJ9IHdpZHRoICB0aGUgbmV3IHdpZHRoXG5cdCAqIEBwYXJhbSAge051bWJlcn0gaGVpZ2h0IHRoZSBuZXcgaGVpZ2h0XG5cdCAqL1xuXHRyZXNpemU6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQpIHtcblx0XHR0aGlzLndpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cblx0XHR0aGlzLnZpZXcud2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLnZpZXcuaGVpZ2h0ID0gaGVpZ2h0O1xuXG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHRnbC52aWV3cG9ydCgwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIChpbnRlcm5hbCB1c2UpXG5cdCAqIEEgbWFuYWdlZCBvYmplY3QgaXMgYW55dGhpbmcgd2l0aCBhIFwiY3JlYXRlXCIgZnVuY3Rpb24sIHRoYXQgd2lsbFxuXHQgKiByZXN0b3JlIEdMIHN0YXRlIGFmdGVyIGNvbnRleHQgbG9zcy4gXG5cdCAqIFxuXHQgKiBAcGFyYW0ge1t0eXBlXX0gdGV4IFtkZXNjcmlwdGlvbl1cblx0ICovXG5cdGFkZE1hbmFnZWRPYmplY3Q6IGZ1bmN0aW9uKG9iaikge1xuXHRcdHRoaXMubWFuYWdlZE9iamVjdHMucHVzaChvYmopO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiAoaW50ZXJuYWwgdXNlKVxuXHQgKiBSZW1vdmVzIGEgbWFuYWdlZCBvYmplY3QgZnJvbSB0aGUgY2FjaGUuIFRoaXMgaXMgdXNlZnVsIHRvIGRlc3Ryb3lcblx0ICogYSB0ZXh0dXJlIG9yIHNoYWRlciwgYW5kIGhhdmUgaXQgbm8gbG9uZ2VyIHJlLWxvYWQgb24gY29udGV4dCByZXN0b3JlLlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRoZSBvYmplY3QgdGhhdCB3YXMgcmVtb3ZlZCwgb3IgbnVsbCBpZiBpdCB3YXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZS5cblx0ICogXG5cdCAqIEBwYXJhbSAge09iamVjdH0gb2JqIHRoZSBvYmplY3QgdG8gYmUgbWFuYWdlZFxuXHQgKiBAcmV0dXJuIHtPYmplY3R9ICAgICB0aGUgcmVtb3ZlZCBvYmplY3QsIG9yIG51bGxcblx0ICovXG5cdHJlbW92ZU1hbmFnZWRPYmplY3Q6IGZ1bmN0aW9uKG9iaikge1xuXHRcdHZhciBpZHggPSB0aGlzLm1hbmFnZWRPYmplY3RzLmluZGV4T2Yob2JqKTtcblx0XHRpZiAoaWR4ID4gLTEpIHtcblx0XHRcdHRoaXMubWFuYWdlZE9iamVjdHMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRyZXR1cm4gb2JqO1xuXHRcdH0gXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0X2NvbnRleHRMb3N0OiBmdW5jdGlvbihldikge1xuXHRcdC8vYWxsIHRleHR1cmVzL3NoYWRlcnMvYnVmZmVycy9GQk9zIGhhdmUgYmVlbiBkZWxldGVkLi4uIFxuXHRcdC8vd2UgbmVlZCB0byByZS1jcmVhdGUgdGhlbSBvbiByZXN0b3JlXG5cdFx0dGhpcy52YWxpZCA9IGZhbHNlO1xuXG5cdFx0dGhpcy5sb3N0LmRpc3BhdGNoKHRoaXMpO1xuXHR9LFxuXG5cdF9jb250ZXh0UmVzdG9yZWQ6IGZ1bmN0aW9uKGV2KSB7XG5cdFx0Ly9JZiBhbiBhc3NldCBtYW5hZ2VyIGlzIGF0dGFjaGVkIHRvIHRoaXNcblx0XHQvL2NvbnRleHQsIHdlIG5lZWQgdG8gaW52YWxpZGF0ZSBpdCBhbmQgcmUtbG9hZCBcblx0XHQvL3RoZSBhc3NldHMuXG5cdFx0aWYgKHRoaXMuYXNzZXRNYW5hZ2VyKSB7XG5cdFx0XHR0aGlzLmFzc2V0TWFuYWdlci5pbnZhbGlkYXRlKCk7XG5cdFx0fVxuXG5cdFx0Ly9maXJzdCwgaW5pdGlhbGl6ZSB0aGUgR0wgY29udGV4dCBhZ2FpblxuXHRcdHRoaXMuX2luaXRDb250ZXh0KCk7XG5cblx0XHQvL25vdyB3ZSByZWNyZWF0ZSBvdXIgc2hhZGVycyBhbmQgdGV4dHVyZXNcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5tYW5hZ2VkT2JqZWN0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5tYW5hZ2VkT2JqZWN0c1tpXS5jcmVhdGUoKTtcblx0XHR9XG5cblx0XHQvL3VwZGF0ZSBHTCB2aWV3cG9ydFxuXHRcdHRoaXMucmVzaXplKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcblxuXHRcdHRoaXMucmVzdG9yZWQuZGlzcGF0Y2godGhpcyk7XG5cdH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdlYkdMQ29udGV4dDsiLCIvKipcbiAqIEBtb2R1bGUga2FtaVxuICovXG5cbnZhciBDbGFzcyA9IHJlcXVpcmUoJ2tsYXNzZScpO1xuXG4vL1RPRE86IGRlY291cGxlIGludG8gVkJPICsgSUJPIHV0aWxpdGllcyBcbi8qKlxuICogQSBtZXNoIGNsYXNzIHRoYXQgd3JhcHMgVkJPIGFuZCBJQk8uXG4gKlxuICogQGNsYXNzICBNZXNoXG4gKi9cbnZhciBNZXNoID0gbmV3IENsYXNzKHtcblxuXG5cdC8qKlxuXHQgKiBBIHdyaXRlLW9ubHkgcHJvcGVydHkgd2hpY2ggc2V0cyBib3RoIHZlcnRpY2VzIGFuZCBpbmRpY2VzIFxuXHQgKiBmbGFnIHRvIGRpcnR5IG9yIG5vdC4gXG5cdCAqXG5cdCAqIEBwcm9wZXJ0eSBkaXJ0eVxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICogQHdyaXRlT25seVxuXHQgKi9cblx0ZGlydHk6IHtcblx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0dGhpcy52ZXJ0aWNlc0RpcnR5ID0gdmFsO1xuXHRcdFx0dGhpcy5pbmRpY2VzRGlydHkgPSB2YWw7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IE1lc2ggd2l0aCB0aGUgcHJvdmlkZWQgcGFyYW1ldGVycy5cblx0ICpcblx0ICogSWYgbnVtSW5kaWNlcyBpcyAwIG9yIGZhbHN5LCBubyBpbmRleCBidWZmZXIgd2lsbCBiZSB1c2VkXG5cdCAqIGFuZCBpbmRpY2VzIHdpbGwgYmUgYW4gZW1wdHkgQXJyYXlCdWZmZXIgYW5kIGEgbnVsbCBpbmRleEJ1ZmZlci5cblx0ICogXG5cdCAqIElmIGlzU3RhdGljIGlzIHRydWUsIHRoZW4gdmVydGV4VXNhZ2UgYW5kIGluZGV4VXNhZ2Ugd2lsbFxuXHQgKiBiZSBzZXQgdG8gZ2wuU1RBVElDX0RSQVcuIE90aGVyd2lzZSB0aGV5IHdpbGwgdXNlIGdsLkRZTkFNSUNfRFJBVy5cblx0ICogWW91IG1heSB3YW50IHRvIGFkanVzdCB0aGVzZSBhZnRlciBpbml0aWFsaXphdGlvbiBmb3IgZnVydGhlciBjb250cm9sLlxuXHQgKiBcblx0ICogQHBhcmFtICB7V2ViR0xDb250ZXh0fSAgY29udGV4dCB0aGUgY29udGV4dCBmb3IgbWFuYWdlbWVudFxuXHQgKiBAcGFyYW0gIHtCb29sZWFufSBpc1N0YXRpYyAgICAgIGEgaGludCBhcyB0byB3aGV0aGVyIHRoaXMgZ2VvbWV0cnkgaXMgc3RhdGljXG5cdCAqIEBwYXJhbSAge1t0eXBlXX0gIG51bVZlcnRzICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19ICBudW1JbmRpY2VzICAgIFtkZXNjcmlwdGlvbl1cblx0ICogQHBhcmFtICB7W3R5cGVdfSAgdmVydGV4QXR0cmlicyBbZGVzY3JpcHRpb25dXG5cdCAqIEByZXR1cm4ge1t0eXBlXX0gICAgICAgICAgICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKi9cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gTWVzaChjb250ZXh0LCBpc1N0YXRpYywgbnVtVmVydHMsIG51bUluZGljZXMsIHZlcnRleEF0dHJpYnMpIHtcblx0XHRpZiAoIWNvbnRleHQpXG5cdFx0XHR0aHJvdyBcIkdMIGNvbnRleHQgbm90IHNwZWNpZmllZFwiO1xuXHRcdGlmICghbnVtVmVydHMpXG5cdFx0XHR0aHJvdyBcIm51bVZlcnRzIG5vdCBzcGVjaWZpZWQsIG11c3QgYmUgPiAwXCI7XG5cblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdHRoaXMuZ2wgPSBjb250ZXh0LmdsO1xuXHRcdFxuXHRcdHRoaXMubnVtVmVydHMgPSBudWxsO1xuXHRcdHRoaXMubnVtSW5kaWNlcyA9IG51bGw7XG5cdFx0XG5cdFx0dGhpcy52ZXJ0aWNlcyA9IG51bGw7XG5cdFx0dGhpcy5pbmRpY2VzID0gbnVsbDtcblx0XHR0aGlzLnZlcnRleEJ1ZmZlciA9IG51bGw7XG5cdFx0dGhpcy5pbmRleEJ1ZmZlciA9IG51bGw7XG5cblx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSB0cnVlO1xuXHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLmluZGV4VXNhZ2UgPSBudWxsO1xuXHRcdHRoaXMudmVydGV4VXNhZ2UgPSBudWxsO1xuXG5cdFx0LyoqIFxuXHRcdCAqIEBwcm9wZXJ0eVxuXHRcdCAqIEBwcml2YXRlXG5cdFx0ICovXG5cdFx0dGhpcy5fdmVydGV4QXR0cmlicyA9IG51bGw7XG5cblx0XHQvKiogXG5cdFx0ICogQHByb3BlcnR5XG5cdFx0ICogQHByaXZhdGVcblx0XHQgKi9cblx0XHR0aGlzLl92ZXJ0ZXhTdHJpZGUgPSBudWxsO1xuXG5cdFx0dGhpcy5udW1WZXJ0cyA9IG51bVZlcnRzO1xuXHRcdHRoaXMubnVtSW5kaWNlcyA9IG51bUluZGljZXMgfHwgMDtcblx0XHR0aGlzLnZlcnRleFVzYWdlID0gaXNTdGF0aWMgPyB0aGlzLmdsLlNUQVRJQ19EUkFXIDogdGhpcy5nbC5EWU5BTUlDX0RSQVc7XG5cdFx0dGhpcy5pbmRleFVzYWdlICA9IGlzU3RhdGljID8gdGhpcy5nbC5TVEFUSUNfRFJBVyA6IHRoaXMuZ2wuRFlOQU1JQ19EUkFXO1xuXHRcdHRoaXMuX3ZlcnRleEF0dHJpYnMgPSB2ZXJ0ZXhBdHRyaWJzIHx8IFtdO1xuXHRcdFxuXHRcdHRoaXMuaW5kaWNlc0RpcnR5ID0gdHJ1ZTtcblx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSB0cnVlO1xuXG5cdFx0Ly9kZXRlcm1pbmUgdGhlIHZlcnRleCBzdHJpZGUgYmFzZWQgb24gZ2l2ZW4gYXR0cmlidXRlc1xuXHRcdHZhciB0b3RhbE51bUNvbXBvbmVudHMgPSAwO1xuXHRcdGZvciAodmFyIGk9MDsgaTx0aGlzLl92ZXJ0ZXhBdHRyaWJzLmxlbmd0aDsgaSsrKVxuXHRcdFx0dG90YWxOdW1Db21wb25lbnRzICs9IHRoaXMuX3ZlcnRleEF0dHJpYnNbaV0ub2Zmc2V0Q291bnQ7XG5cdFx0dGhpcy5fdmVydGV4U3RyaWRlID0gdG90YWxOdW1Db21wb25lbnRzICogNDsgLy8gaW4gYnl0ZXNcblxuXHRcdHRoaXMudmVydGljZXMgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMubnVtVmVydHMpO1xuXHRcdHRoaXMuaW5kaWNlcyA9IG5ldyBVaW50MTZBcnJheSh0aGlzLm51bUluZGljZXMpO1xuXG5cdFx0Ly9hZGQgdGhpcyBWQk8gdG8gdGhlIG1hbmFnZWQgY2FjaGVcblx0XHR0aGlzLmNvbnRleHQuYWRkTWFuYWdlZE9iamVjdCh0aGlzKTtcblxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH0sXG5cblx0Ly9yZWNyZWF0ZXMgdGhlIGJ1ZmZlcnMgb24gY29udGV4dCBsb3NzXG5cdGNyZWF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5nbCA9IHRoaXMuY29udGV4dC5nbDtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdHRoaXMudmVydGV4QnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKCk7XG5cblx0XHQvL2lnbm9yZSBpbmRleCBidWZmZXIgaWYgd2UgaGF2ZW4ndCBzcGVjaWZpZWQgYW55XG5cdFx0dGhpcy5pbmRleEJ1ZmZlciA9IHRoaXMubnVtSW5kaWNlcyA+IDBcblx0XHRcdFx0XHQ/IGdsLmNyZWF0ZUJ1ZmZlcigpXG5cdFx0XHRcdFx0OiBudWxsO1xuXG5cdFx0dGhpcy5kaXJ0eSA9IHRydWU7XG5cdH0sXG5cblx0ZGVzdHJveTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy52ZXJ0aWNlcyA9IFtdO1xuXHRcdHRoaXMuaW5kaWNlcyA9IFtdO1xuXHRcdGlmICh0aGlzLnZlcnRleEJ1ZmZlcilcblx0XHRcdHRoaXMuZ2wuZGVsZXRlQnVmZmVyKHRoaXMudmVydGV4QnVmZmVyKTtcblx0XHRpZiAodGhpcy5pbmRleEJ1ZmZlcilcblx0XHRcdHRoaXMuZ2wuZGVsZXRlQnVmZmVyKHRoaXMuaW5kZXhCdWZmZXIpO1xuXHRcdHRoaXMudmVydGV4QnVmZmVyID0gbnVsbDtcblx0XHR0aGlzLmluZGV4QnVmZmVyID0gbnVsbDtcblx0XHRpZiAodGhpcy5jb250ZXh0KVxuXHRcdFx0dGhpcy5jb250ZXh0LnJlbW92ZU1hbmFnZWRPYmplY3QodGhpcyk7XG5cdH0sXG5cblx0X3VwZGF0ZUJ1ZmZlcnM6IGZ1bmN0aW9uKGlnbm9yZUJpbmQsIHN1YkRhdGFMZW5ndGgpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0Ly9iaW5kIG91ciBpbmRleCBkYXRhLCBpZiB3ZSBoYXZlIGFueVxuXHRcdGlmICh0aGlzLm51bUluZGljZXMgPiAwKSB7XG5cdFx0XHRpZiAoIWlnbm9yZUJpbmQpXG5cdFx0XHRcdGdsLmJpbmRCdWZmZXIoZ2wuRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRoaXMuaW5kZXhCdWZmZXIpO1xuXG5cdFx0XHQvL3VwZGF0ZSB0aGUgaW5kZXggZGF0YVxuXHRcdFx0aWYgKHRoaXMuaW5kaWNlc0RpcnR5KSB7XG5cdFx0XHRcdGdsLmJ1ZmZlckRhdGEoZ2wuRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRoaXMuaW5kaWNlcywgdGhpcy5pbmRleFVzYWdlKTtcblx0XHRcdFx0dGhpcy5pbmRpY2VzRGlydHkgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvL2JpbmQgb3VyIHZlcnRleCBkYXRhXG5cdFx0aWYgKCFpZ25vcmVCaW5kKVxuXHRcdFx0Z2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHRoaXMudmVydGV4QnVmZmVyKTtcblxuXHRcdC8vdXBkYXRlIG91ciB2ZXJ0ZXggZGF0YVxuXHRcdGlmICh0aGlzLnZlcnRpY2VzRGlydHkpIHtcblx0XHRcdGlmIChzdWJEYXRhTGVuZ3RoKSB7XG5cdFx0XHRcdC8vIFRPRE86IFdoZW4gZGVjb3VwbGluZyBWQk8vSUJPIGJlIHN1cmUgdG8gZ2l2ZSBiZXR0ZXIgc3ViRGF0YSBzdXBwb3J0Li5cblx0XHRcdFx0dmFyIHZpZXcgPSB0aGlzLnZlcnRpY2VzLnN1YmFycmF5KDAsIHN1YkRhdGFMZW5ndGgpO1xuXHRcdFx0XHRnbC5idWZmZXJTdWJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgMCwgdmlldyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRnbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy52ZXJ0aWNlcywgdGhpcy52ZXJ0ZXhVc2FnZSk7XHRcblx0XHRcdH1cblxuXHRcdFx0XG5cdFx0XHR0aGlzLnZlcnRpY2VzRGlydHkgPSBmYWxzZTtcblx0XHR9XG5cdH0sXG5cblx0ZHJhdzogZnVuY3Rpb24ocHJpbWl0aXZlVHlwZSwgY291bnQsIG9mZnNldCwgc3ViRGF0YUxlbmd0aCkge1xuXHRcdGlmIChjb3VudCA9PT0gMClcblx0XHRcdHJldHVybjtcblxuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0XG5cdFx0b2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cblx0XHQvL2JpbmRzIGFuZCB1cGRhdGVzIG91ciBidWZmZXJzLiBwYXNzIGlnbm9yZUJpbmQgYXMgdHJ1ZVxuXHRcdC8vdG8gYXZvaWQgYmluZGluZyB1bm5lY2Vzc2FyaWx5XG5cdFx0dGhpcy5fdXBkYXRlQnVmZmVycyh0cnVlLCBzdWJEYXRhTGVuZ3RoKTtcblxuXHRcdGlmICh0aGlzLm51bUluZGljZXMgPiAwKSB7IFxuXHRcdFx0Z2wuZHJhd0VsZW1lbnRzKHByaW1pdGl2ZVR5cGUsIGNvdW50LCBcblx0XHRcdFx0XHRcdGdsLlVOU0lHTkVEX1NIT1JULCBvZmZzZXQgKiAyKTsgLy8qIFVpbnQxNkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UXG5cdFx0fSBlbHNlXG5cdFx0XHRnbC5kcmF3QXJyYXlzKHByaW1pdGl2ZVR5cGUsIG9mZnNldCwgY291bnQpO1xuXHR9LFxuXG5cdC8vYmluZHMgdGhpcyBtZXNoJ3MgdmVydGV4IGF0dHJpYnV0ZXMgZm9yIHRoZSBnaXZlbiBzaGFkZXJcblx0YmluZDogZnVuY3Rpb24oc2hhZGVyKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHZhciBvZmZzZXQgPSAwO1xuXHRcdHZhciBzdHJpZGUgPSB0aGlzLl92ZXJ0ZXhTdHJpZGU7XG5cblx0XHQvL2JpbmQgYW5kIHVwZGF0ZSBvdXIgdmVydGV4IGRhdGEgYmVmb3JlIGJpbmRpbmcgYXR0cmlidXRlc1xuXHRcdHRoaXMuX3VwZGF0ZUJ1ZmZlcnMoKTtcblxuXHRcdC8vZm9yIGVhY2ggYXR0cmlidHVlXG5cdFx0Zm9yICh2YXIgaT0wOyBpPHRoaXMuX3ZlcnRleEF0dHJpYnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhciBhID0gdGhpcy5fdmVydGV4QXR0cmlic1tpXTtcblxuXHRcdFx0Ly9sb2NhdGlvbiBvZiB0aGUgYXR0cmlidXRlXG5cdFx0XHR2YXIgbG9jID0gYS5sb2NhdGlvbiA9PT0gbnVsbCBcblx0XHRcdFx0XHQ/IHNoYWRlci5nZXRBdHRyaWJ1dGVMb2NhdGlvbihhLm5hbWUpXG5cdFx0XHRcdFx0OiBhLmxvY2F0aW9uO1xuXG5cdFx0XHQvL1RPRE86IFdlIG1heSB3YW50IHRvIHNraXAgdW5mb3VuZCBhdHRyaWJzXG5cdFx0XHQvLyBpZiAobG9jIT09MCAmJiAhbG9jKVxuXHRcdFx0Ly8gXHRjb25zb2xlLndhcm4oXCJXQVJOOlwiLCBhLm5hbWUsIFwiaXMgbm90IGVuYWJsZWRcIik7XG5cblx0XHRcdC8vZmlyc3QsIGVuYWJsZSB0aGUgdmVydGV4IGFycmF5XG5cdFx0XHRnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShsb2MpO1xuXG5cdFx0XHQvL3RoZW4gc3BlY2lmeSBvdXIgdmVydGV4IGZvcm1hdFxuXHRcdFx0Z2wudmVydGV4QXR0cmliUG9pbnRlcihsb2MsIGEubnVtQ29tcG9uZW50cywgYS50eXBlIHx8IGdsLkZMT0FULCBcblx0XHRcdFx0XHRcdFx0XHQgICBhLm5vcm1hbGl6ZSwgc3RyaWRlLCBvZmZzZXQpO1xuXG5cdFx0XHQvL2FuZCBpbmNyZWFzZSB0aGUgb2Zmc2V0Li4uXG5cdFx0XHRvZmZzZXQgKz0gYS5vZmZzZXRDb3VudCAqIDQ7IC8vaW4gYnl0ZXNcblx0XHR9XG5cdH0sXG5cblx0dW5iaW5kOiBmdW5jdGlvbihzaGFkZXIpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0Ly9mb3IgZWFjaCBhdHRyaWJ0dWVcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5fdmVydGV4QXR0cmlicy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dmFyIGEgPSB0aGlzLl92ZXJ0ZXhBdHRyaWJzW2ldO1xuXG5cdFx0XHQvL2xvY2F0aW9uIG9mIHRoZSBhdHRyaWJ1dGVcblx0XHRcdHZhciBsb2MgPSBhLmxvY2F0aW9uID09PSBudWxsIFxuXHRcdFx0XHRcdD8gc2hhZGVyLmdldEF0dHJpYnV0ZUxvY2F0aW9uKGEubmFtZSlcblx0XHRcdFx0XHQ6IGEubG9jYXRpb247XG5cblx0XHRcdC8vZmlyc3QsIGVuYWJsZSB0aGUgdmVydGV4IGFycmF5XG5cdFx0XHRnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkobG9jKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5NZXNoLkF0dHJpYiA9IG5ldyBDbGFzcyh7XG5cblx0bmFtZTogbnVsbCxcblx0bnVtQ29tcG9uZW50czogbnVsbCxcblx0bG9jYXRpb246IG51bGwsXG5cdHR5cGU6IG51bGwsXG5cblx0LyoqXG5cdCAqIExvY2F0aW9uIGlzIG9wdGlvbmFsIGFuZCBmb3IgYWR2YW5jZWQgdXNlcnMgdGhhdFxuXHQgKiB3YW50IHZlcnRleCBhcnJheXMgdG8gbWF0Y2ggYWNyb3NzIHNoYWRlcnMuIEFueSBub24tbnVtZXJpY2FsXG5cdCAqIHZhbHVlIHdpbGwgYmUgY29udmVydGVkIHRvIG51bGwsIGFuZCBpZ25vcmVkLiBJZiBhIG51bWVyaWNhbFxuXHQgKiB2YWx1ZSBpcyBnaXZlbiwgaXQgd2lsbCBvdmVycmlkZSB0aGUgcG9zaXRpb24gb2YgdGhpcyBhdHRyaWJ1dGVcblx0ICogd2hlbiBnaXZlbiB0byBhIG1lc2guXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtbdHlwZV19IG5hbWUgICAgICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19IG51bUNvbXBvbmVudHMgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcGFyYW0gIHtbdHlwZV19IGxvY2F0aW9uICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKiBAcmV0dXJuIHtbdHlwZV19ICAgICAgICAgICAgICAgW2Rlc2NyaXB0aW9uXVxuXHQgKi9cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24obmFtZSwgbnVtQ29tcG9uZW50cywgbG9jYXRpb24sIHR5cGUsIG5vcm1hbGl6ZSwgb2Zmc2V0Q291bnQpIHtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMubnVtQ29tcG9uZW50cyA9IG51bUNvbXBvbmVudHM7XG5cdFx0dGhpcy5sb2NhdGlvbiA9IHR5cGVvZiBsb2NhdGlvbiA9PT0gXCJudW1iZXJcIiA/IGxvY2F0aW9uIDogbnVsbDtcblx0XHR0aGlzLnR5cGUgPSB0eXBlO1xuXHRcdHRoaXMubm9ybWFsaXplID0gQm9vbGVhbihub3JtYWxpemUpO1xuXHRcdHRoaXMub2Zmc2V0Q291bnQgPSB0eXBlb2Ygb2Zmc2V0Q291bnQgPT09IFwibnVtYmVyXCIgPyBvZmZzZXRDb3VudCA6IHRoaXMubnVtQ29tcG9uZW50cztcblx0fVxufSlcblxuXG5tb2R1bGUuZXhwb3J0cyA9IE1lc2g7IiwiLyoqXG4gKiBAbW9kdWxlIGthbWlcbiAqL1xuXG52YXIgaW50OCA9IG5ldyBJbnQ4QXJyYXkoNCk7XG52YXIgaW50MzIgPSBuZXcgSW50MzJBcnJheShpbnQ4LmJ1ZmZlciwgMCwgMSk7XG52YXIgZmxvYXQzMiA9IG5ldyBGbG9hdDMyQXJyYXkoaW50OC5idWZmZXIsIDAsIDEpO1xuXG5cblxuLyoqXG4gKiBBIHNpbmdsZXRvbiBmb3IgbnVtYmVyIHV0aWxpdGllcy4gXG4gKiBAY2xhc3MgTnVtYmVyVXRpbHNcbiAqL1xudmFyIE51bWJlclV0aWxzID0gZnVuY3Rpb24oKSB7XG5cbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIGEgZmxvYXQgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGludCBiaXRzLiBBcnJheUJ1ZmZlclxuICogaXMgdXNlZCBmb3IgdGhlIGNvbnZlcnNpb24uXG4gKlxuICogQG1ldGhvZCAgaW50Qml0c1RvRmxvYXRcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSAge051bWJlcn0gaSB0aGUgaW50IHRvIGNhc3RcbiAqIEByZXR1cm4ge051bWJlcn0gICB0aGUgZmxvYXRcbiAqL1xuTnVtYmVyVXRpbHMuaW50Qml0c1RvRmxvYXQgPSBmdW5jdGlvbihpKSB7XG5cdGludDMyWzBdID0gaTtcblx0cmV0dXJuIGZsb2F0MzJbMF07XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGludCBiaXRzIGZyb20gdGhlIGdpdmVuIGZsb2F0LiBBcnJheUJ1ZmZlciBpcyB1c2VkXG4gKiBmb3IgdGhlIGNvbnZlcnNpb24uXG4gKlxuICogQG1ldGhvZCAgZmxvYXRUb0ludEJpdHNcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSAge051bWJlcn0gZiB0aGUgZmxvYXQgdG8gY2FzdFxuICogQHJldHVybiB7TnVtYmVyfSAgIHRoZSBpbnQgYml0c1xuICovXG5OdW1iZXJVdGlscy5mbG9hdFRvSW50Qml0cyA9IGZ1bmN0aW9uKGYpIHtcblx0ZmxvYXQzMlswXSA9IGY7XG5cdHJldHVybiBpbnQzMlswXTtcbn07XG5cbi8qKlxuICogRW5jb2RlcyBBQkdSIGludCBhcyBhIGZsb2F0LCB3aXRoIHNsaWdodCBwcmVjaXNpb24gbG9zcy5cbiAqXG4gKiBAbWV0aG9kICBpbnRUb0Zsb2F0Q29sb3JcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZSBhbiBBQkdSIHBhY2tlZCBpbnRlZ2VyXG4gKi9cbk51bWJlclV0aWxzLmludFRvRmxvYXRDb2xvciA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdHJldHVybiBOdW1iZXJVdGlscy5pbnRCaXRzVG9GbG9hdCggdmFsdWUgJiAweGZlZmZmZmZmICk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBmbG9hdCBlbmNvZGVkIEFCR1IgdmFsdWUgZnJvbSB0aGUgZ2l2ZW4gUkdCQVxuICogYnl0ZXMgKDAgLSAyNTUpLiBVc2VmdWwgZm9yIHNhdmluZyBiYW5kd2lkdGggaW4gdmVydGV4IGRhdGEuXG4gKlxuICogQG1ldGhvZCAgY29sb3JUb0Zsb2F0XG4gKiBAc3RhdGljXG4gKiBAcGFyYW0ge051bWJlcn0gciB0aGUgUmVkIGJ5dGUgKDAgLSAyNTUpXG4gKiBAcGFyYW0ge051bWJlcn0gZyB0aGUgR3JlZW4gYnl0ZSAoMCAtIDI1NSlcbiAqIEBwYXJhbSB7TnVtYmVyfSBiIHRoZSBCbHVlIGJ5dGUgKDAgLSAyNTUpXG4gKiBAcGFyYW0ge051bWJlcn0gYSB0aGUgQWxwaGEgYnl0ZSAoMCAtIDI1NSlcbiAqIEByZXR1cm4ge0Zsb2F0MzJ9ICBhIEZsb2F0MzIgb2YgdGhlIFJHQkEgY29sb3JcbiAqL1xuTnVtYmVyVXRpbHMuY29sb3JUb0Zsb2F0ID0gZnVuY3Rpb24ociwgZywgYiwgYSkge1xuXHR2YXIgYml0cyA9IChhIDw8IDI0IHwgYiA8PCAxNiB8IGcgPDwgOCB8IHIpO1xuXHRyZXR1cm4gTnVtYmVyVXRpbHMuaW50VG9GbG9hdENvbG9yKGJpdHMpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBOdW1iZXJVdGlsczsiLCIvKipcbiAqIEBtb2R1bGUga2FtaVxuICovXG5cbnZhciBDbGFzcyA9IHJlcXVpcmUoJ2tsYXNzZScpO1xuXG52YXIgU2hhZGVyUHJvZ3JhbSA9IG5ldyBDbGFzcyh7XG5cdFxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiBTaGFkZXJQcm9ncmFtKGNvbnRleHQsIHZlcnRTb3VyY2UsIGZyYWdTb3VyY2UsIGF0dHJpYnV0ZUxvY2F0aW9ucykge1xuXHRcdGlmICghdmVydFNvdXJjZSB8fCAhZnJhZ1NvdXJjZSlcblx0XHRcdHRocm93IFwidmVydGV4IGFuZCBmcmFnbWVudCBzaGFkZXJzIG11c3QgYmUgZGVmaW5lZFwiO1xuXHRcdGlmICghY29udGV4dClcblx0XHRcdHRocm93IFwibm8gR0wgY29udGV4dCBzcGVjaWZpZWRcIjtcblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXG5cdCBcdHRoaXMudmVydFNoYWRlciA9IG51bGw7XG5cdCBcdHRoaXMuZnJhZ1NoYWRlciA9IG51bGw7XG5cdCBcdHRoaXMucHJvZ3JhbSA9IG51bGw7XG5cdCBcdHRoaXMubG9nID0gXCJcIjtcblxuXHRcdHRoaXMudW5pZm9ybUNhY2hlID0gbnVsbDtcblx0XHR0aGlzLmF0dHJpYnV0ZUNhY2hlID0gbnVsbDtcblxuXHRcdHRoaXMuYXR0cmlidXRlTG9jYXRpb25zID0gYXR0cmlidXRlTG9jYXRpb25zO1xuXG5cdFx0Ly9XZSB0cmltIChFQ01BU2NyaXB0NSkgc28gdGhhdCB0aGUgR0xTTCBsaW5lIG51bWJlcnMgYXJlXG5cdFx0Ly9hY2N1cmF0ZSBvbiBzaGFkZXIgbG9nXG5cdFx0dGhpcy52ZXJ0U291cmNlID0gdmVydFNvdXJjZS50cmltKCk7XG5cdFx0dGhpcy5mcmFnU291cmNlID0gZnJhZ1NvdXJjZS50cmltKCk7XG5cblx0XHQvL0FkZHMgdGhpcyBzaGFkZXIgdG8gdGhlIGNvbnRleHQsIHRvIGJlIG1hbmFnZWRcblx0XHR0aGlzLmNvbnRleHQuYWRkTWFuYWdlZE9iamVjdCh0aGlzKTtcblxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH0sXG5cblx0LyoqIFxuXHQgKiBUaGlzIGlzIGNhbGxlZCBkdXJpbmcgdGhlIFNoYWRlclByb2dyYW0gY29uc3RydWN0b3IsXG5cdCAqIGFuZCBtYXkgbmVlZCB0byBiZSBjYWxsZWQgYWdhaW4gYWZ0ZXIgY29udGV4dCBsb3NzIGFuZCByZXN0b3JlLlxuXHQgKi9cblx0Y3JlYXRlOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmdsID0gdGhpcy5jb250ZXh0LmdsO1xuXHRcdHRoaXMuX2NvbXBpbGVTaGFkZXJzKCk7XG5cdH0sXG5cblx0Ly9Db21waWxlcyB0aGUgc2hhZGVycywgdGhyb3dpbmcgYW4gZXJyb3IgaWYgdGhlIHByb2dyYW0gd2FzIGludmFsaWQuXG5cdF9jb21waWxlU2hhZGVyczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDsgXG5cdFx0XG5cdFx0dGhpcy5sb2cgPSBcIlwiO1xuXG5cdFx0dGhpcy52ZXJ0U2hhZGVyID0gdGhpcy5fbG9hZFNoYWRlcihnbC5WRVJURVhfU0hBREVSLCB0aGlzLnZlcnRTb3VyY2UpO1xuXHRcdHRoaXMuZnJhZ1NoYWRlciA9IHRoaXMuX2xvYWRTaGFkZXIoZ2wuRlJBR01FTlRfU0hBREVSLCB0aGlzLmZyYWdTb3VyY2UpO1xuXG5cdFx0aWYgKCF0aGlzLnZlcnRTaGFkZXIgfHwgIXRoaXMuZnJhZ1NoYWRlcilcblx0XHRcdHRocm93IFwiRXJyb3IgcmV0dXJuZWQgd2hlbiBjYWxsaW5nIGNyZWF0ZVNoYWRlclwiO1xuXG5cdFx0dGhpcy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpO1xuXG5cdFx0Z2wuYXR0YWNoU2hhZGVyKHRoaXMucHJvZ3JhbSwgdGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRnbC5hdHRhY2hTaGFkZXIodGhpcy5wcm9ncmFtLCB0aGlzLmZyYWdTaGFkZXIpO1xuIFx0XG4gXHRcdC8vVE9ETzogVGhpcyBzZWVtcyBub3QgdG8gYmUgd29ya2luZyBvbiBteSBPU1ggLS0gbWF5YmUgYSBkcml2ZXIgYnVnP1xuXHRcdGlmICh0aGlzLmF0dHJpYnV0ZUxvY2F0aW9ucykge1xuXHRcdFx0Zm9yICh2YXIga2V5IGluIHRoaXMuYXR0cmlidXRlTG9jYXRpb25zKSB7XG5cdFx0XHRcdGlmICh0aGlzLmF0dHJpYnV0ZUxvY2F0aW9ucy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0ICAgIFx0XHRnbC5iaW5kQXR0cmliTG9jYXRpb24odGhpcy5wcm9ncmFtLCBNYXRoLmZsb29yKHRoaXMuYXR0cmlidXRlTG9jYXRpb25zW2tleV0pLCBrZXkpO1xuXHQgICAgXHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRnbC5saW5rUHJvZ3JhbSh0aGlzLnByb2dyYW0pOyBcblxuXHRcdHRoaXMubG9nICs9IGdsLmdldFByb2dyYW1JbmZvTG9nKHRoaXMucHJvZ3JhbSkgfHwgXCJcIjtcblxuXHRcdGlmICghZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSkge1xuXHRcdFx0dGhyb3cgXCJFcnJvciBsaW5raW5nIHRoZSBzaGFkZXIgcHJvZ3JhbTpcXG5cIlxuXHRcdFx0XHQrIHRoaXMubG9nO1xuXHRcdH1cblxuXHRcdHRoaXMuX2ZldGNoVW5pZm9ybXMoKTtcblx0XHR0aGlzLl9mZXRjaEF0dHJpYnV0ZXMoKTtcblx0fSxcblxuXHRfZmV0Y2hVbmlmb3JtczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblxuXHRcdHRoaXMudW5pZm9ybUNhY2hlID0ge307XG5cblx0XHR2YXIgbGVuID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkFDVElWRV9VTklGT1JNUyk7XG5cdFx0aWYgKCFsZW4pIC8vbnVsbCBvciB6ZXJvXG5cdFx0XHRyZXR1cm47XG5cblx0XHRmb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHtcblx0XHRcdHZhciBpbmZvID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybSh0aGlzLnByb2dyYW0sIGkpO1xuXHRcdFx0aWYgKGluZm8gPT09IG51bGwpIFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdHZhciBuYW1lID0gaW5mby5uYW1lO1xuXHRcdFx0dmFyIGxvY2F0aW9uID0gZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgbmFtZSk7XG5cdFx0XHRcblx0XHRcdHRoaXMudW5pZm9ybUNhY2hlW25hbWVdID0ge1xuXHRcdFx0XHRzaXplOiBpbmZvLnNpemUsXG5cdFx0XHRcdHR5cGU6IGluZm8udHlwZSxcblx0XHRcdFx0bG9jYXRpb246IGxvY2F0aW9uXG5cdFx0XHR9O1xuXHRcdH1cblx0fSxcblxuXHRfZmV0Y2hBdHRyaWJ1dGVzOiBmdW5jdGlvbigpIHsgXG5cdFx0dmFyIGdsID0gdGhpcy5nbDsgXG5cblx0XHR0aGlzLmF0dHJpYnV0ZUNhY2hlID0ge307XG5cblx0XHR2YXIgbGVuID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcih0aGlzLnByb2dyYW0sIGdsLkFDVElWRV9BVFRSSUJVVEVTKTtcblx0XHRpZiAoIWxlbikgLy9udWxsIG9yIHplcm9cblx0XHRcdHJldHVybjtcdFxuXG5cdFx0Zm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSB7XG5cdFx0XHR2YXIgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYih0aGlzLnByb2dyYW0sIGkpO1xuXHRcdFx0aWYgKGluZm8gPT09IG51bGwpIFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdHZhciBuYW1lID0gaW5mby5uYW1lO1xuXG5cdFx0XHQvL3RoZSBhdHRyaWIgbG9jYXRpb24gaXMgYSBzaW1wbGUgaW5kZXhcblx0XHRcdHZhciBsb2NhdGlvbiA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgbmFtZSk7XG5cdFx0XHRcblx0XHRcdHRoaXMuYXR0cmlidXRlQ2FjaGVbbmFtZV0gPSB7XG5cdFx0XHRcdHNpemU6IGluZm8uc2l6ZSxcblx0XHRcdFx0dHlwZTogaW5mby50eXBlLFxuXHRcdFx0XHRsb2NhdGlvbjogbG9jYXRpb25cblx0XHRcdH07XG5cdFx0fVxuXHR9LFxuXG5cdF9sb2FkU2hhZGVyOiBmdW5jdGlvbih0eXBlLCBzb3VyY2UpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXG5cdFx0dmFyIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKTtcblx0XHRpZiAoIXNoYWRlcikgLy9zaG91bGQgbm90IG9jY3VyLi4uXG5cdFx0XHRyZXR1cm4gLTE7XG5cblx0XHRnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpO1xuXHRcdGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKTtcblx0XHRcblx0XHR2YXIgbG9nUmVzdWx0ID0gZ2wuZ2V0U2hhZGVySW5mb0xvZyhzaGFkZXIpIHx8IFwiXCI7XG5cdFx0aWYgKGxvZ1Jlc3VsdCkge1xuXHRcdFx0Ly93ZSBkbyB0aGlzIHNvIHRoZSB1c2VyIGtub3dzIHdoaWNoIHNoYWRlciBoYXMgdGhlIGVycm9yXG5cdFx0XHR2YXIgdHlwZVN0ciA9ICh0eXBlID09PSBnbC5WRVJURVhfU0hBREVSKSA/IFwidmVydGV4XCIgOiBcImZyYWdtZW50XCI7XG5cdFx0XHRsb2dSZXN1bHQgPSBcIkVycm9yIGNvbXBpbGluZyBcIisgdHlwZVN0cisgXCIgc2hhZGVyOlxcblwiK2xvZ1Jlc3VsdDtcblx0XHR9XG5cblx0XHR0aGlzLmxvZyArPSBsb2dSZXN1bHQ7XG5cblx0XHRpZiAoIWdsLmdldFNoYWRlclBhcmFtZXRlcihzaGFkZXIsIGdsLkNPTVBJTEVfU1RBVFVTKSApIHtcblx0XHRcdHRocm93IHRoaXMubG9nO1xuXHRcdH1cblx0XHRyZXR1cm4gc2hhZGVyO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBpbmZvIChzaXplLCB0eXBlLCBsb2NhdGlvbikuXG5cdCAqIElmIHRoZSB1bmlmb3JtIGlzIG5vdCBmb3VuZCBpbiB0aGUgY2FjaGUsIGl0IGlzIGFzc3VtZWRcblx0ICogdG8gbm90IGV4aXN0LCBhbmQgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXHQgKlxuXHQgKiBUaGlzIG1heSByZXR1cm4gbnVsbCBldmVuIGlmIHRoZSB1bmlmb3JtIGlzIGRlZmluZWQgaW4gR0xTTDpcblx0ICogaWYgaXQgaXMgX2luYWN0aXZlXyAoaS5lLiBub3QgdXNlZCBpbiB0aGUgcHJvZ3JhbSkgdGhlbiBpdCBtYXlcblx0ICogYmUgb3B0aW1pemVkIG91dC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtPYmplY3R9IGFuIG9iamVjdCBjb250YWluaW5nIGxvY2F0aW9uLCBzaXplLCBhbmQgdHlwZVxuXHQgKi9cblx0Z2V0VW5pZm9ybUluZm86IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy51bmlmb3JtQ2FjaGVbbmFtZV0gfHwgbnVsbDsgXG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCBhdHRyaWJ1dGUgaW5mbyAoc2l6ZSwgdHlwZSwgbG9jYXRpb24pLlxuXHQgKiBJZiB0aGUgYXR0cmlidXRlIGlzIG5vdCBmb3VuZCBpbiB0aGUgY2FjaGUsIGl0IGlzIGFzc3VtZWRcblx0ICogdG8gbm90IGV4aXN0LCBhbmQgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXHQgKlxuXHQgKiBUaGlzIG1heSByZXR1cm4gbnVsbCBldmVuIGlmIHRoZSBhdHRyaWJ1dGUgaXMgZGVmaW5lZCBpbiBHTFNMOlxuXHQgKiBpZiBpdCBpcyBfaW5hY3RpdmVfIChpLmUuIG5vdCB1c2VkIGluIHRoZSBwcm9ncmFtIG9yIGRpc2FibGVkKSBcblx0ICogdGhlbiBpdCBtYXkgYmUgb3B0aW1pemVkIG91dC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgYXR0cmlidXRlIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge29iamVjdH0gYW4gb2JqZWN0IGNvbnRhaW5pbmcgbG9jYXRpb24sIHNpemUgYW5kIHR5cGVcblx0ICovXG5cdGdldEF0dHJpYnV0ZUluZm86IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5hdHRyaWJ1dGVDYWNoZVtuYW1lXSB8fCBudWxsOyBcblx0fSxcblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjYWNoZWQgdW5pZm9ybSBsb2NhdGlvbiBvYmplY3QuXG5cdCAqIElmIHRoZSB1bmlmb3JtIGlzIG5vdCBmb3VuZCwgdGhpcyBtZXRob2QgcmV0dXJucyBudWxsLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge0dMaW50fSB0aGUgbG9jYXRpb24gb2JqZWN0XG5cdCAqL1xuXHRnZXRBdHRyaWJ1dGVMb2NhdGlvbjogZnVuY3Rpb24obmFtZSkgeyAvL1RPRE86IG1ha2UgZmFzdGVyLCBkb24ndCBjYWNoZVxuXHRcdHZhciBpbmZvID0gdGhpcy5nZXRBdHRyaWJ1dGVJbmZvKG5hbWUpO1xuXHRcdHJldHVybiBpbmZvID8gaW5mby5sb2NhdGlvbiA6IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNhY2hlZCB1bmlmb3JtIGxvY2F0aW9uIG9iamVjdC5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gbmFtZSB0aGUgdW5pZm9ybSBuYW1lIGFzIGRlZmluZWQgaW4gR0xTTFxuXHQgKiBAcmV0dXJuIHtXZWJHTFVuaWZvcm1Mb2NhdGlvbn0gdGhlIGxvY2F0aW9uIG9iamVjdFxuXHQgKi9cblx0Z2V0VW5pZm9ybUxvY2F0aW9uOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGluZm8gPSB0aGlzLmdldFVuaWZvcm1JbmZvKG5hbWUpO1xuXHRcdHJldHVybiBpbmZvID8gaW5mby5sb2NhdGlvbiA6IG51bGw7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgdW5pZm9ybSBpcyBhY3RpdmUgYW5kIGZvdW5kIGluIHRoaXNcblx0ICogY29tcGlsZWQgcHJvZ3JhbS5cblx0ICogXG5cdCAqIEBwYXJhbSAge1N0cmluZ30gIG5hbWUgdGhlIHVuaWZvcm0gbmFtZVxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSB0cnVlIGlmIHRoZSB1bmlmb3JtIGlzIGZvdW5kIGFuZCBhY3RpdmVcblx0ICovXG5cdGhhc1VuaWZvcm06IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRVbmlmb3JtSW5mbyhuYW1lKSAhPT0gbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBhdHRyaWJ1dGUgaXMgYWN0aXZlIGFuZCBmb3VuZCBpbiB0aGlzXG5cdCAqIGNvbXBpbGVkIHByb2dyYW0uXG5cdCAqIFxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9ICBuYW1lIHRoZSBhdHRyaWJ1dGUgbmFtZVxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSB0cnVlIGlmIHRoZSBhdHRyaWJ1dGUgaXMgZm91bmQgYW5kIGFjdGl2ZVxuXHQgKi9cblx0aGFzQXR0cmlidXRlOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QXR0cmlidXRlSW5mbyhuYW1lKSAhPT0gbnVsbDtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgdW5pZm9ybSB2YWx1ZSBieSBuYW1lLlxuXHQgKiBcblx0ICogQHBhcmFtICB7U3RyaW5nfSBuYW1lIHRoZSB1bmlmb3JtIG5hbWUgYXMgZGVmaW5lZCBpbiBHTFNMXG5cdCAqIEByZXR1cm4ge2FueX0gVGhlIHZhbHVlIG9mIHRoZSBXZWJHTCB1bmlmb3JtXG5cdCAqL1xuXHRnZXRVbmlmb3JtOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2wuZ2V0VW5pZm9ybSh0aGlzLnByb2dyYW0sIHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpKTtcblx0fSxcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgdW5pZm9ybSB2YWx1ZSBhdCB0aGUgc3BlY2lmaWVkIFdlYkdMVW5pZm9ybUxvY2F0aW9uLlxuXHQgKiBcblx0ICogQHBhcmFtICB7V2ViR0xVbmlmb3JtTG9jYXRpb259IGxvY2F0aW9uIHRoZSBsb2NhdGlvbiBvYmplY3Rcblx0ICogQHJldHVybiB7YW55fSBUaGUgdmFsdWUgb2YgdGhlIFdlYkdMIHVuaWZvcm1cblx0ICovXG5cdGdldFVuaWZvcm1BdDogZnVuY3Rpb24obG9jYXRpb24pIHtcblx0XHRyZXR1cm4gdGhpcy5nbC5nZXRVbmlmb3JtKHRoaXMucHJvZ3JhbSwgbG9jYXRpb24pO1xuXHR9LFxuXG5cdGJpbmQ6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZ2wudXNlUHJvZ3JhbSh0aGlzLnByb2dyYW0pO1xuXHR9LFxuXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0Z2wuZGV0YWNoU2hhZGVyKHRoaXMudmVydFNoYWRlcik7XG5cdFx0Z2wuZGV0YWNoU2hhZGVyKHRoaXMuZnJhZ1NoYWRlcik7XG5cblx0XHRnbC5kZWxldGVTaGFkZXIodGhpcy52ZXJ0U2hhZGVyKTtcblx0XHRnbC5kZWxldGVTaGFkZXIodGhpcy5mcmFnU2hhZGVyKTtcblxuXHRcdGdsLmRlbGV0ZVByb2dyYW0odGhpcy5wcm9ncmFtKTtcblx0XHR0aGlzLnByb2dyYW0gPSBudWxsO1xuXHR9LFxuXG5cdHNldFVuaWZvcm1pOiBmdW5jdGlvbihuYW1lLCB4LCB5LCB6LCB3KSB7XG5cdFx0dmFyIGdsID0gdGhpcy5nbDtcblx0XHR2YXIgbG9jID0gdGhpcy5nZXRVbmlmb3JtTG9jYXRpb24obmFtZSk7XG5cdFx0aWYgKCFsb2MpIFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0Y2FzZSAyOiBnbC51bmlmb3JtMWkobG9jLCB4KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDM6IGdsLnVuaWZvcm0yaShsb2MsIHgsIHkpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNDogZ2wudW5pZm9ybTNpKGxvYywgeCwgeSwgeik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSA1OiBnbC51bmlmb3JtNGkobG9jLCB4LCB5LCB6LCB3KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBcImludmFsaWQgYXJndW1lbnRzIHRvIHNldFVuaWZvcm1pXCI7IFxuXHRcdH1cblx0fSxcblxuXHRzZXRVbmlmb3JtZjogZnVuY3Rpb24obmFtZSwgeCwgeSwgeiwgdykge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dmFyIGxvYyA9IHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpO1xuXHRcdGlmICghbG9jKSBcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdGNhc2UgMjogZ2wudW5pZm9ybTFmKGxvYywgeCk7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAzOiBnbC51bmlmb3JtMmYobG9jLCB4LCB5KTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDQ6IGdsLnVuaWZvcm0zZihsb2MsIHgsIHksIHopOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNTogZ2wudW5pZm9ybTRmKGxvYywgeCwgeSwgeiwgdyk7IHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgXCJpbnZhbGlkIGFyZ3VtZW50cyB0byBzZXRVbmlmb3JtZlwiOyBcblx0XHR9XG5cdH0sXG5cblx0Ly9JIGd1ZXNzIHdlIHdvbid0IHN1cHBvcnQgc2VxdWVuY2U8R0xmbG9hdD4gLi4gd2hhdGV2ZXIgdGhhdCBpcyA/P1xuXHRcblx0LyoqXG5cdCAqIEEgY29udmVuaWVuY2UgbWV0aG9kIHRvIHNldCB1bmlmb3JtTmZ2IGZyb20gdGhlIGdpdmVuIEFycmF5QnVmZmVyLlxuXHQgKiBXZSBkZXRlcm1pbmUgd2hpY2ggR0wgY2FsbCB0byBtYWtlIGJhc2VkIG9uIHRoZSBsZW5ndGggb2YgdGhlIGFycmF5IFxuXHQgKiBidWZmZXIuIFxuXHQgKiBcdFxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAgICAgICAgXHRcdHRoZSBuYW1lIG9mIHRoZSB1bmlmb3JtXG5cdCAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGFycmF5QnVmZmVyIHRoZSBhcnJheSBidWZmZXJcblx0ICovXG5cdHNldFVuaWZvcm1mdjogZnVuY3Rpb24obmFtZSwgYXJyYXlCdWZmZXIpIHtcblx0XHR2YXIgZ2wgPSB0aGlzLmdsO1xuXHRcdHZhciBsb2MgPSB0aGlzLmdldFVuaWZvcm1Mb2NhdGlvbihuYW1lKTtcblx0XHRpZiAoIWxvYykgXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0c3dpdGNoIChhcnJheUJ1ZmZlci5sZW5ndGgpIHtcblx0XHRcdGNhc2UgMTogZ2wudW5pZm9ybTFmdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDI6IGdsLnVuaWZvcm0yZnYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAzOiBnbC51bmlmb3JtM2Z2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgNDogZ2wudW5pZm9ybTRmdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBcImludmFsaWQgYXJndW1lbnRzIHRvIHNldFVuaWZvcm1mXCI7IFxuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICogQSBjb252ZW5pZW5jZSBtZXRob2QgdG8gc2V0IHVuaWZvcm1OZnYgZnJvbSB0aGUgZ2l2ZW4gQXJyYXlCdWZmZXIuXG5cdCAqIFdlIGRldGVybWluZSB3aGljaCBHTCBjYWxsIHRvIG1ha2UgYmFzZWQgb24gdGhlIGxlbmd0aCBvZiB0aGUgYXJyYXkgXG5cdCAqIGJ1ZmZlci4gXG5cdCAqIFx0XG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lICAgICAgICBcdFx0dGhlIG5hbWUgb2YgdGhlIHVuaWZvcm1cblx0ICogQHBhcmFtIHtBcnJheUJ1ZmZlcn0gYXJyYXlCdWZmZXIgdGhlIGFycmF5IGJ1ZmZlclxuXHQgKi9cblx0c2V0VW5pZm9ybWl2OiBmdW5jdGlvbihuYW1lLCBhcnJheUJ1ZmZlcikge1xuXHRcdHZhciBnbCA9IHRoaXMuZ2w7XG5cdFx0dmFyIGxvYyA9IHRoaXMuZ2V0VW5pZm9ybUxvY2F0aW9uKG5hbWUpO1xuXHRcdGlmICghbG9jKSBcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRzd2l0Y2ggKGFycmF5QnVmZmVyLmxlbmd0aCkge1xuXHRcdFx0Y2FzZSAxOiBnbC51bmlmb3JtMWl2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgMjogZ2wudW5pZm9ybTJpdihsb2MsIGFycmF5QnVmZmVyKTsgcmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIDM6IGdsLnVuaWZvcm0zaXYobG9jLCBhcnJheUJ1ZmZlcik7IHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSA0OiBnbC51bmlmb3JtNGl2KGxvYywgYXJyYXlCdWZmZXIpOyByZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IFwiaW52YWxpZCBhcmd1bWVudHMgdG8gc2V0VW5pZm9ybWZcIjsgXG5cdFx0fVxuXHR9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBTaGFkZXJQcm9ncmFtOyIsIi8qKlxuICBBdXRvLWdlbmVyYXRlZCBLYW1pIGluZGV4IGZpbGUuXG4gIENyZWF0ZWQgb24gMjAxMy0xMS0yNFxuKi9cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIC8vY29yZSBjbGFzc2VzXG4gICAgJ0Fic3RyYWN0QmF0Y2gnOiAgIHJlcXVpcmUoJy4vQWJzdHJhY3RCYXRjaC5qcycpLFxuICAgICdBc3NldE1hbmFnZXInOiAgICByZXF1aXJlKCcuL0Fzc2V0TWFuYWdlci5qcycpLFxuICAgICdTcHJpdGVCYXRjaCc6ICAgICByZXF1aXJlKCcuL1Nwcml0ZUJhdGNoLmpzJyksXG4gICAgJ1RleHR1cmUnOiAgICAgICAgIHJlcXVpcmUoJy4vVGV4dHVyZS5qcycpLFxuICAgICdXZWJHTENvbnRleHQnOiAgICByZXF1aXJlKCcuL1dlYkdMQ29udGV4dC5qcycpLFxuICAgICdNZXNoJzogICAgICAgICAgICByZXF1aXJlKCcuL2dsdXRpbHMvTWVzaC5qcycpLFxuICAgICdOdW1iZXJVdGlscyc6ICAgICByZXF1aXJlKCcuL2dsdXRpbHMvTnVtYmVyVXRpbHMuanMnKSxcbiAgICAnU2hhZGVyUHJvZ3JhbSc6ICAgcmVxdWlyZSgnLi9nbHV0aWxzL1NoYWRlclByb2dyYW0uanMnKVxufTsiLCJmdW5jdGlvbiBoYXNHZXR0ZXJPclNldHRlcihkZWYpIHtcblx0cmV0dXJuICghIWRlZi5nZXQgJiYgdHlwZW9mIGRlZi5nZXQgPT09IFwiZnVuY3Rpb25cIikgfHwgKCEhZGVmLnNldCAmJiB0eXBlb2YgZGVmLnNldCA9PT0gXCJmdW5jdGlvblwiKTtcbn1cblxuZnVuY3Rpb24gZ2V0UHJvcGVydHkoZGVmaW5pdGlvbiwgaywgaXNDbGFzc0Rlc2NyaXB0b3IpIHtcblx0Ly9UaGlzIG1heSBiZSBhIGxpZ2h0d2VpZ2h0IG9iamVjdCwgT1IgaXQgbWlnaHQgYmUgYSBwcm9wZXJ0eVxuXHQvL3RoYXQgd2FzIGRlZmluZWQgcHJldmlvdXNseS5cblx0XG5cdC8vRm9yIHNpbXBsZSBjbGFzcyBkZXNjcmlwdG9ycyB3ZSBjYW4ganVzdCBhc3N1bWUgaXRzIE5PVCBwcmV2aW91c2x5IGRlZmluZWQuXG5cdHZhciBkZWYgPSBpc0NsYXNzRGVzY3JpcHRvciBcblx0XHRcdFx0PyBkZWZpbml0aW9uW2tdIFxuXHRcdFx0XHQ6IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoZGVmaW5pdGlvbiwgayk7XG5cblx0aWYgKCFpc0NsYXNzRGVzY3JpcHRvciAmJiBkZWYudmFsdWUgJiYgdHlwZW9mIGRlZi52YWx1ZSA9PT0gXCJvYmplY3RcIikge1xuXHRcdGRlZiA9IGRlZi52YWx1ZTtcblx0fVxuXG5cblx0Ly9UaGlzIG1pZ2h0IGJlIGEgcmVndWxhciBwcm9wZXJ0eSwgb3IgaXQgbWF5IGJlIGEgZ2V0dGVyL3NldHRlciB0aGUgdXNlciBkZWZpbmVkIGluIGEgY2xhc3MuXG5cdGlmICggZGVmICYmIGhhc0dldHRlck9yU2V0dGVyKGRlZikgKSB7XG5cdFx0aWYgKHR5cGVvZiBkZWYuZW51bWVyYWJsZSA9PT0gXCJ1bmRlZmluZWRcIilcblx0XHRcdGRlZi5lbnVtZXJhYmxlID0gdHJ1ZTtcblx0XHRpZiAodHlwZW9mIGRlZi5jb25maWd1cmFibGUgPT09IFwidW5kZWZpbmVkXCIpXG5cdFx0XHRkZWYuY29uZmlndXJhYmxlID0gdHJ1ZTtcblx0XHRyZXR1cm4gZGVmO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBoYXNOb25Db25maWd1cmFibGUob2JqLCBrKSB7XG5cdHZhciBwcm9wID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihvYmosIGspO1xuXHRpZiAoIXByb3ApXG5cdFx0cmV0dXJuIGZhbHNlO1xuXG5cdGlmIChwcm9wLnZhbHVlICYmIHR5cGVvZiBwcm9wLnZhbHVlID09PSBcIm9iamVjdFwiKVxuXHRcdHByb3AgPSBwcm9wLnZhbHVlO1xuXG5cdGlmIChwcm9wLmNvbmZpZ3VyYWJsZSA9PT0gZmFsc2UpIFxuXHRcdHJldHVybiB0cnVlO1xuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuLy9UT0RPOiBPbiBjcmVhdGUsIFxuLy9cdFx0T24gbWl4aW4sIFxuXG5mdW5jdGlvbiBleHRlbmQoY3RvciwgZGVmaW5pdGlvbiwgaXNDbGFzc0Rlc2NyaXB0b3IsIGV4dGVuZCkge1xuXHRmb3IgKHZhciBrIGluIGRlZmluaXRpb24pIHtcblx0XHRpZiAoIWRlZmluaXRpb24uaGFzT3duUHJvcGVydHkoaykpXG5cdFx0XHRjb250aW51ZTtcblxuXHRcdHZhciBkZWYgPSBnZXRQcm9wZXJ0eShkZWZpbml0aW9uLCBrLCBpc0NsYXNzRGVzY3JpcHRvcik7XG5cblx0XHRpZiAoZGVmICE9PSBmYWxzZSkge1xuXHRcdFx0Ly9JZiBFeHRlbmRzIGlzIHVzZWQsIHdlIHdpbGwgY2hlY2sgaXRzIHByb3RvdHlwZSB0byBzZWUgaWYgXG5cdFx0XHQvL3RoZSBmaW5hbCB2YXJpYWJsZSBleGlzdHMuXG5cdFx0XHRcblx0XHRcdHZhciBwYXJlbnQgPSBleHRlbmQgfHwgY3Rvcjtcblx0XHRcdGlmIChoYXNOb25Db25maWd1cmFibGUocGFyZW50LnByb3RvdHlwZSwgaykpIHtcblxuXHRcdFx0XHQvL2p1c3Qgc2tpcCB0aGUgZmluYWwgcHJvcGVydHlcblx0XHRcdFx0aWYgKENsYXNzLmlnbm9yZUZpbmFscylcblx0XHRcdFx0XHRjb250aW51ZTtcblxuXHRcdFx0XHQvL1dlIGNhbm5vdCByZS1kZWZpbmUgYSBwcm9wZXJ0eSB0aGF0IGlzIGNvbmZpZ3VyYWJsZT1mYWxzZS5cblx0XHRcdFx0Ly9TbyB3ZSB3aWxsIGNvbnNpZGVyIHRoZW0gZmluYWwgYW5kIHRocm93IGFuIGVycm9yLiBUaGlzIGlzIGJ5XG5cdFx0XHRcdC8vZGVmYXVsdCBzbyBpdCBpcyBjbGVhciB0byB0aGUgZGV2ZWxvcGVyIHdoYXQgaXMgaGFwcGVuaW5nLlxuXHRcdFx0XHQvL1lvdSBjYW4gc2V0IGlnbm9yZUZpbmFscyB0byB0cnVlIGlmIHlvdSBuZWVkIHRvIGV4dGVuZCBhIGNsYXNzXG5cdFx0XHRcdC8vd2hpY2ggaGFzIGNvbmZpZ3VyYWJsZT1mYWxzZTsgaXQgd2lsbCBzaW1wbHkgbm90IHJlLWRlZmluZSBmaW5hbCBwcm9wZXJ0aWVzLlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJjYW5ub3Qgb3ZlcnJpZGUgZmluYWwgcHJvcGVydHkgJ1wiK2tcblx0XHRcdFx0XHRcdFx0K1wiJywgc2V0IENsYXNzLmlnbm9yZUZpbmFscyA9IHRydWUgdG8gc2tpcFwiKTtcblx0XHRcdH1cblxuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGN0b3IucHJvdG90eXBlLCBrLCBkZWYpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdG9yLnByb3RvdHlwZVtrXSA9IGRlZmluaXRpb25ba107XG5cdFx0fVxuXG5cdH1cbn1cblxuLyoqXG4gKi9cbmZ1bmN0aW9uIG1peGluKG15Q2xhc3MsIG1peGlucykge1xuXHRpZiAoIW1peGlucylcblx0XHRyZXR1cm47XG5cblx0aWYgKCFBcnJheS5pc0FycmF5KG1peGlucykpXG5cdFx0bWl4aW5zID0gW21peGluc107XG5cblx0Zm9yICh2YXIgaT0wOyBpPG1peGlucy5sZW5ndGg7IGkrKykge1xuXHRcdGV4dGVuZChteUNsYXNzLCBtaXhpbnNbaV0ucHJvdG90eXBlIHx8IG1peGluc1tpXSk7XG5cdH1cbn1cblxuLyoqXG4gKiBcbiAqL1xuZnVuY3Rpb24gQ2xhc3MoZGVmaW5pdGlvbikge1xuXHRpZiAoIWRlZmluaXRpb24pXG5cdFx0ZGVmaW5pdGlvbiA9IHt9O1xuXG5cdC8vVGhlIHZhcmlhYmxlIG5hbWUgaGVyZSBkaWN0YXRlcyB3aGF0IHdlIHNlZSBpbiBDaHJvbWUgZGVidWdnZXJcblx0dmFyIGluaXRpYWxpemU7XG5cdHZhciBFeHRlbmRzO1xuXG5cdGlmIChkZWZpbml0aW9uLmluaXRpYWxpemUpIHtcblx0XHRpZiAodHlwZW9mIGRlZmluaXRpb24uaW5pdGlhbGl6ZSAhPT0gXCJmdW5jdGlvblwiKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiaW5pdGlhbGl6ZSBtdXN0IGJlIGEgZnVuY3Rpb25cIik7XG5cdFx0aW5pdGlhbGl6ZSA9IGRlZmluaXRpb24uaW5pdGlhbGl6ZTtcblxuXHRcdC8vVXN1YWxseSB3ZSBzaG91bGQgYXZvaWQgXCJkZWxldGVcIiBpbiBWOCBhdCBhbGwgY29zdHMuXG5cdFx0Ly9Ib3dldmVyLCBpdHMgdW5saWtlbHkgdG8gbWFrZSBhbnkgcGVyZm9ybWFuY2UgZGlmZmVyZW5jZVxuXHRcdC8vaGVyZSBzaW5jZSB3ZSBvbmx5IGNhbGwgdGhpcyBvbiBjbGFzcyBjcmVhdGlvbiAoaS5lLiBub3Qgb2JqZWN0IGNyZWF0aW9uKS5cblx0XHRkZWxldGUgZGVmaW5pdGlvbi5pbml0aWFsaXplO1xuXHR9IGVsc2Uge1xuXHRcdGlmIChkZWZpbml0aW9uLkV4dGVuZHMpIHtcblx0XHRcdHZhciBiYXNlID0gZGVmaW5pdGlvbi5FeHRlbmRzO1xuXHRcdFx0aW5pdGlhbGl6ZSA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0YmFzZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdFx0fTsgXG5cdFx0fSBlbHNlIHtcblx0XHRcdGluaXRpYWxpemUgPSBmdW5jdGlvbiAoKSB7fTsgXG5cdFx0fVxuXHR9XG5cblx0aWYgKGRlZmluaXRpb24uRXh0ZW5kcykge1xuXHRcdGluaXRpYWxpemUucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShkZWZpbml0aW9uLkV4dGVuZHMucHJvdG90eXBlKTtcblx0XHRpbml0aWFsaXplLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGluaXRpYWxpemU7XG5cdFx0Ly9mb3IgZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIHRvIHdvcmssIHdlIG5lZWQgdG8gYWN0XG5cdFx0Ly9kaXJlY3RseSBvbiB0aGUgRXh0ZW5kcyAob3IgTWl4aW4pXG5cdFx0RXh0ZW5kcyA9IGRlZmluaXRpb24uRXh0ZW5kcztcblx0XHRkZWxldGUgZGVmaW5pdGlvbi5FeHRlbmRzO1xuXHR9IGVsc2Uge1xuXHRcdGluaXRpYWxpemUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gaW5pdGlhbGl6ZTtcblx0fVxuXG5cdC8vR3JhYiB0aGUgbWl4aW5zLCBpZiB0aGV5IGFyZSBzcGVjaWZpZWQuLi5cblx0dmFyIG1peGlucyA9IG51bGw7XG5cdGlmIChkZWZpbml0aW9uLk1peGlucykge1xuXHRcdG1peGlucyA9IGRlZmluaXRpb24uTWl4aW5zO1xuXHRcdGRlbGV0ZSBkZWZpbml0aW9uLk1peGlucztcblx0fVxuXG5cdC8vRmlyc3QsIG1peGluIGlmIHdlIGNhbi5cblx0bWl4aW4oaW5pdGlhbGl6ZSwgbWl4aW5zKTtcblxuXHQvL05vdyB3ZSBncmFiIHRoZSBhY3R1YWwgZGVmaW5pdGlvbiB3aGljaCBkZWZpbmVzIHRoZSBvdmVycmlkZXMuXG5cdGV4dGVuZChpbml0aWFsaXplLCBkZWZpbml0aW9uLCB0cnVlLCBFeHRlbmRzKTtcblxuXHRyZXR1cm4gaW5pdGlhbGl6ZTtcbn07XG5cbkNsYXNzLmV4dGVuZCA9IGV4dGVuZDtcbkNsYXNzLm1peGluID0gbWl4aW47XG5DbGFzcy5pZ25vcmVGaW5hbHMgPSBmYWxzZTtcblxubW9kdWxlLmV4cG9ydHMgPSBDbGFzczsiLCIvKmpzbGludCBvbmV2YXI6dHJ1ZSwgdW5kZWY6dHJ1ZSwgbmV3Y2FwOnRydWUsIHJlZ2V4cDp0cnVlLCBiaXR3aXNlOnRydWUsIG1heGVycjo1MCwgaW5kZW50OjQsIHdoaXRlOmZhbHNlLCBub21lbjpmYWxzZSwgcGx1c3BsdXM6ZmFsc2UgKi9cbi8qZ2xvYmFsIGRlZmluZTpmYWxzZSwgcmVxdWlyZTpmYWxzZSwgZXhwb3J0czpmYWxzZSwgbW9kdWxlOmZhbHNlLCBzaWduYWxzOmZhbHNlICovXG5cbi8qKiBAbGljZW5zZVxuICogSlMgU2lnbmFscyA8aHR0cDovL21pbGxlcm1lZGVpcm9zLmdpdGh1Yi5jb20vanMtc2lnbmFscy8+XG4gKiBSZWxlYXNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2VcbiAqIEF1dGhvcjogTWlsbGVyIE1lZGVpcm9zXG4gKiBWZXJzaW9uOiAxLjAuMCAtIEJ1aWxkOiAyNjggKDIwMTIvMTEvMjkgMDU6NDggUE0pXG4gKi9cblxuKGZ1bmN0aW9uKGdsb2JhbCl7XG5cbiAgICAvLyBTaWduYWxCaW5kaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8qKlxuICAgICAqIE9iamVjdCB0aGF0IHJlcHJlc2VudHMgYSBiaW5kaW5nIGJldHdlZW4gYSBTaWduYWwgYW5kIGEgbGlzdGVuZXIgZnVuY3Rpb24uXG4gICAgICogPGJyIC8+LSA8c3Ryb25nPlRoaXMgaXMgYW4gaW50ZXJuYWwgY29uc3RydWN0b3IgYW5kIHNob3VsZG4ndCBiZSBjYWxsZWQgYnkgcmVndWxhciB1c2Vycy48L3N0cm9uZz5cbiAgICAgKiA8YnIgLz4tIGluc3BpcmVkIGJ5IEpvYSBFYmVydCBBUzMgU2lnbmFsQmluZGluZyBhbmQgUm9iZXJ0IFBlbm5lcidzIFNsb3QgY2xhc3Nlcy5cbiAgICAgKiBAYXV0aG9yIE1pbGxlciBNZWRlaXJvc1xuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBpbnRlcm5hbFxuICAgICAqIEBuYW1lIFNpZ25hbEJpbmRpbmdcbiAgICAgKiBAcGFyYW0ge1NpZ25hbH0gc2lnbmFsIFJlZmVyZW5jZSB0byBTaWduYWwgb2JqZWN0IHRoYXQgbGlzdGVuZXIgaXMgY3VycmVudGx5IGJvdW5kIHRvLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbC5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzT25jZSBJZiBiaW5kaW5nIHNob3VsZCBiZSBleGVjdXRlZCBqdXN0IG9uY2UuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV0gVGhlIHByaW9yaXR5IGxldmVsIG9mIHRoZSBldmVudCBsaXN0ZW5lci4gKGRlZmF1bHQgPSAwKS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBTaWduYWxCaW5kaW5nKHNpZ25hbCwgbGlzdGVuZXIsIGlzT25jZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwuXG4gICAgICAgICAqIEB0eXBlIEZ1bmN0aW9uXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9saXN0ZW5lciA9IGxpc3RlbmVyO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBiaW5kaW5nIHNob3VsZCBiZSBleGVjdXRlZCBqdXN0IG9uY2UuXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX2lzT25jZSA9IGlzT25jZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgICAgICogQG1lbWJlck9mIFNpZ25hbEJpbmRpbmcucHJvdG90eXBlXG4gICAgICAgICAqIEBuYW1lIGNvbnRleHRcbiAgICAgICAgICogQHR5cGUgT2JqZWN0fHVuZGVmaW5lZHxudWxsXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmNvbnRleHQgPSBsaXN0ZW5lckNvbnRleHQ7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlZmVyZW5jZSB0byBTaWduYWwgb2JqZWN0IHRoYXQgbGlzdGVuZXIgaXMgY3VycmVudGx5IGJvdW5kIHRvLlxuICAgICAgICAgKiBAdHlwZSBTaWduYWxcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3NpZ25hbCA9IHNpZ25hbDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogTGlzdGVuZXIgcHJpb3JpdHlcbiAgICAgICAgICogQHR5cGUgTnVtYmVyXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9wcmlvcml0eSA9IHByaW9yaXR5IHx8IDA7XG4gICAgfVxuXG4gICAgU2lnbmFsQmluZGluZy5wcm90b3R5cGUgPSB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIGJpbmRpbmcgaXMgYWN0aXZlIGFuZCBzaG91bGQgYmUgZXhlY3V0ZWQuXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICovXG4gICAgICAgIGFjdGl2ZSA6IHRydWUsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERlZmF1bHQgcGFyYW1ldGVycyBwYXNzZWQgdG8gbGlzdGVuZXIgZHVyaW5nIGBTaWduYWwuZGlzcGF0Y2hgIGFuZCBgU2lnbmFsQmluZGluZy5leGVjdXRlYC4gKGN1cnJpZWQgcGFyYW1ldGVycylcbiAgICAgICAgICogQHR5cGUgQXJyYXl8bnVsbFxuICAgICAgICAgKi9cbiAgICAgICAgcGFyYW1zIDogbnVsbCxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ2FsbCBsaXN0ZW5lciBwYXNzaW5nIGFyYml0cmFyeSBwYXJhbWV0ZXJzLlxuICAgICAgICAgKiA8cD5JZiBiaW5kaW5nIHdhcyBhZGRlZCB1c2luZyBgU2lnbmFsLmFkZE9uY2UoKWAgaXQgd2lsbCBiZSBhdXRvbWF0aWNhbGx5IHJlbW92ZWQgZnJvbSBzaWduYWwgZGlzcGF0Y2ggcXVldWUsIHRoaXMgbWV0aG9kIGlzIHVzZWQgaW50ZXJuYWxseSBmb3IgdGhlIHNpZ25hbCBkaXNwYXRjaC48L3A+XG4gICAgICAgICAqIEBwYXJhbSB7QXJyYXl9IFtwYXJhbXNBcnJdIEFycmF5IG9mIHBhcmFtZXRlcnMgdGhhdCBzaG91bGQgYmUgcGFzc2VkIHRvIHRoZSBsaXN0ZW5lclxuICAgICAgICAgKiBAcmV0dXJuIHsqfSBWYWx1ZSByZXR1cm5lZCBieSB0aGUgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBleGVjdXRlIDogZnVuY3Rpb24gKHBhcmFtc0Fycikge1xuICAgICAgICAgICAgdmFyIGhhbmRsZXJSZXR1cm4sIHBhcmFtcztcbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZSAmJiAhIXRoaXMuX2xpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgcGFyYW1zID0gdGhpcy5wYXJhbXM/IHRoaXMucGFyYW1zLmNvbmNhdChwYXJhbXNBcnIpIDogcGFyYW1zQXJyO1xuICAgICAgICAgICAgICAgIGhhbmRsZXJSZXR1cm4gPSB0aGlzLl9saXN0ZW5lci5hcHBseSh0aGlzLmNvbnRleHQsIHBhcmFtcyk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2lzT25jZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVyUmV0dXJuO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEZXRhY2ggYmluZGluZyBmcm9tIHNpZ25hbC5cbiAgICAgICAgICogLSBhbGlhcyB0bzogbXlTaWduYWwucmVtb3ZlKG15QmluZGluZy5nZXRMaXN0ZW5lcigpKTtcbiAgICAgICAgICogQHJldHVybiB7RnVuY3Rpb258bnVsbH0gSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsIG9yIGBudWxsYCBpZiBiaW5kaW5nIHdhcyBwcmV2aW91c2x5IGRldGFjaGVkLlxuICAgICAgICAgKi9cbiAgICAgICAgZGV0YWNoIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNCb3VuZCgpPyB0aGlzLl9zaWduYWwucmVtb3ZlKHRoaXMuX2xpc3RlbmVyLCB0aGlzLmNvbnRleHQpIDogbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7Qm9vbGVhbn0gYHRydWVgIGlmIGJpbmRpbmcgaXMgc3RpbGwgYm91bmQgdG8gdGhlIHNpZ25hbCBhbmQgaGF2ZSBhIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgaXNCb3VuZCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAoISF0aGlzLl9zaWduYWwgJiYgISF0aGlzLl9saXN0ZW5lcik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IElmIFNpZ25hbEJpbmRpbmcgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIG9uY2UuXG4gICAgICAgICAqL1xuICAgICAgICBpc09uY2UgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faXNPbmNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0TGlzdGVuZXIgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fbGlzdGVuZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbH0gU2lnbmFsIHRoYXQgbGlzdGVuZXIgaXMgY3VycmVudGx5IGJvdW5kIHRvLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0U2lnbmFsIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NpZ25hbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGVsZXRlIGluc3RhbmNlIHByb3BlcnRpZXNcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9kZXN0cm95IDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX3NpZ25hbDtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9saXN0ZW5lcjtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbnRleHQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge3N0cmluZ30gU3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBvYmplY3QuXG4gICAgICAgICAqL1xuICAgICAgICB0b1N0cmluZyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAnW1NpZ25hbEJpbmRpbmcgaXNPbmNlOicgKyB0aGlzLl9pc09uY2UgKycsIGlzQm91bmQ6JysgdGhpcy5pc0JvdW5kKCkgKycsIGFjdGl2ZTonICsgdGhpcy5hY3RpdmUgKyAnXSc7XG4gICAgICAgIH1cblxuICAgIH07XG5cblxuLypnbG9iYWwgU2lnbmFsQmluZGluZzpmYWxzZSovXG5cbiAgICAvLyBTaWduYWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsIGZuTmFtZSkge1xuICAgICAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoICdsaXN0ZW5lciBpcyBhIHJlcXVpcmVkIHBhcmFtIG9mIHtmbn0oKSBhbmQgc2hvdWxkIGJlIGEgRnVuY3Rpb24uJy5yZXBsYWNlKCd7Zm59JywgZm5OYW1lKSApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3VzdG9tIGV2ZW50IGJyb2FkY2FzdGVyXG4gICAgICogPGJyIC8+LSBpbnNwaXJlZCBieSBSb2JlcnQgUGVubmVyJ3MgQVMzIFNpZ25hbHMuXG4gICAgICogQG5hbWUgU2lnbmFsXG4gICAgICogQGF1dGhvciBNaWxsZXIgTWVkZWlyb3NcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBTaWduYWwoKSB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSBBcnJheS48U2lnbmFsQmluZGluZz5cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX2JpbmRpbmdzID0gW107XG4gICAgICAgIHRoaXMuX3ByZXZQYXJhbXMgPSBudWxsO1xuXG4gICAgICAgIC8vIGVuZm9yY2UgZGlzcGF0Y2ggdG8gYXdheXMgd29yayBvbiBzYW1lIGNvbnRleHQgKCM0NylcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmRpc3BhdGNoID0gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIFNpZ25hbC5wcm90b3R5cGUuZGlzcGF0Y2guYXBwbHkoc2VsZiwgYXJndW1lbnRzKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBTaWduYWwucHJvdG90eXBlID0ge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTaWduYWxzIFZlcnNpb24gTnVtYmVyXG4gICAgICAgICAqIEB0eXBlIFN0cmluZ1xuICAgICAgICAgKiBAY29uc3RcbiAgICAgICAgICovXG4gICAgICAgIFZFUlNJT04gOiAnMS4wLjAnLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBTaWduYWwgc2hvdWxkIGtlZXAgcmVjb3JkIG9mIHByZXZpb3VzbHkgZGlzcGF0Y2hlZCBwYXJhbWV0ZXJzIGFuZFxuICAgICAgICAgKiBhdXRvbWF0aWNhbGx5IGV4ZWN1dGUgbGlzdGVuZXIgZHVyaW5nIGBhZGQoKWAvYGFkZE9uY2UoKWAgaWYgU2lnbmFsIHdhc1xuICAgICAgICAgKiBhbHJlYWR5IGRpc3BhdGNoZWQgYmVmb3JlLlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICBtZW1vcml6ZSA6IGZhbHNlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfc2hvdWxkUHJvcGFnYXRlIDogdHJ1ZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgU2lnbmFsIGlzIGFjdGl2ZSBhbmQgc2hvdWxkIGJyb2FkY2FzdCBldmVudHMuXG4gICAgICAgICAqIDxwPjxzdHJvbmc+SU1QT1JUQU5UOjwvc3Ryb25nPiBTZXR0aW5nIHRoaXMgcHJvcGVydHkgZHVyaW5nIGEgZGlzcGF0Y2ggd2lsbCBvbmx5IGFmZmVjdCB0aGUgbmV4dCBkaXNwYXRjaCwgaWYgeW91IHdhbnQgdG8gc3RvcCB0aGUgcHJvcGFnYXRpb24gb2YgYSBzaWduYWwgdXNlIGBoYWx0KClgIGluc3RlYWQuPC9wPlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICBhY3RpdmUgOiB0cnVlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lclxuICAgICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzT25jZVxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF1cbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV1cbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsQmluZGluZ31cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9yZWdpc3Rlckxpc3RlbmVyIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBpc09uY2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcblxuICAgICAgICAgICAgdmFyIHByZXZJbmRleCA9IHRoaXMuX2luZGV4T2ZMaXN0ZW5lcihsaXN0ZW5lciwgbGlzdGVuZXJDb250ZXh0KSxcbiAgICAgICAgICAgICAgICBiaW5kaW5nO1xuXG4gICAgICAgICAgICBpZiAocHJldkluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGJpbmRpbmcgPSB0aGlzLl9iaW5kaW5nc1twcmV2SW5kZXhdO1xuICAgICAgICAgICAgICAgIGlmIChiaW5kaW5nLmlzT25jZSgpICE9PSBpc09uY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgY2Fubm90IGFkZCcrIChpc09uY2U/ICcnIDogJ09uY2UnKSArJygpIHRoZW4gYWRkJysgKCFpc09uY2U/ICcnIDogJ09uY2UnKSArJygpIHRoZSBzYW1lIGxpc3RlbmVyIHdpdGhvdXQgcmVtb3ZpbmcgdGhlIHJlbGF0aW9uc2hpcCBmaXJzdC4nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJpbmRpbmcgPSBuZXcgU2lnbmFsQmluZGluZyh0aGlzLCBsaXN0ZW5lciwgaXNPbmNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGRCaW5kaW5nKGJpbmRpbmcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZih0aGlzLm1lbW9yaXplICYmIHRoaXMuX3ByZXZQYXJhbXMpe1xuICAgICAgICAgICAgICAgIGJpbmRpbmcuZXhlY3V0ZSh0aGlzLl9wcmV2UGFyYW1zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGJpbmRpbmc7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwYXJhbSB7U2lnbmFsQmluZGluZ30gYmluZGluZ1xuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX2FkZEJpbmRpbmcgOiBmdW5jdGlvbiAoYmluZGluZykge1xuICAgICAgICAgICAgLy9zaW1wbGlmaWVkIGluc2VydGlvbiBzb3J0XG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aDtcbiAgICAgICAgICAgIGRvIHsgLS1uOyB9IHdoaWxlICh0aGlzLl9iaW5kaW5nc1tuXSAmJiBiaW5kaW5nLl9wcmlvcml0eSA8PSB0aGlzLl9iaW5kaW5nc1tuXS5fcHJpb3JpdHkpO1xuICAgICAgICAgICAgdGhpcy5fYmluZGluZ3Muc3BsaWNlKG4gKyAxLCAwLCBiaW5kaW5nKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXJcbiAgICAgICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX2luZGV4T2ZMaXN0ZW5lciA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgY29udGV4dCkge1xuICAgICAgICAgICAgdmFyIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgY3VyO1xuICAgICAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgICAgIGN1ciA9IHRoaXMuX2JpbmRpbmdzW25dO1xuICAgICAgICAgICAgICAgIGlmIChjdXIuX2xpc3RlbmVyID09PSBsaXN0ZW5lciAmJiBjdXIuY29udGV4dCA9PT0gY29udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENoZWNrIGlmIGxpc3RlbmVyIHdhcyBhdHRhY2hlZCB0byBTaWduYWwuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY29udGV4dF1cbiAgICAgICAgICogQHJldHVybiB7Ym9vbGVhbn0gaWYgU2lnbmFsIGhhcyB0aGUgc3BlY2lmaWVkIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgaGFzIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBjb250ZXh0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faW5kZXhPZkxpc3RlbmVyKGxpc3RlbmVyLCBjb250ZXh0KSAhPT0gLTE7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEFkZCBhIGxpc3RlbmVyIHRvIHRoZSBzaWduYWwuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIFNpZ25hbCBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF0gQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV0gVGhlIHByaW9yaXR5IGxldmVsIG9mIHRoZSBldmVudCBsaXN0ZW5lci4gTGlzdGVuZXJzIHdpdGggaGlnaGVyIHByaW9yaXR5IHdpbGwgYmUgZXhlY3V0ZWQgYmVmb3JlIGxpc3RlbmVycyB3aXRoIGxvd2VyIHByaW9yaXR5LiBMaXN0ZW5lcnMgd2l0aCBzYW1lIHByaW9yaXR5IGxldmVsIHdpbGwgYmUgZXhlY3V0ZWQgYXQgdGhlIHNhbWUgb3JkZXIgYXMgdGhleSB3ZXJlIGFkZGVkLiAoZGVmYXVsdCA9IDApXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbEJpbmRpbmd9IEFuIE9iamVjdCByZXByZXNlbnRpbmcgdGhlIGJpbmRpbmcgYmV0d2VlbiB0aGUgU2lnbmFsIGFuZCBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGFkZCA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuICAgICAgICAgICAgdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgJ2FkZCcpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXIobGlzdGVuZXIsIGZhbHNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQWRkIGxpc3RlbmVyIHRvIHRoZSBzaWduYWwgdGhhdCBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBmaXJzdCBleGVjdXRpb24gKHdpbGwgYmUgZXhlY3V0ZWQgb25seSBvbmNlKS5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgU2lnbmFsIGhhbmRsZXIgZnVuY3Rpb24uXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XSBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gW3ByaW9yaXR5XSBUaGUgcHJpb3JpdHkgbGV2ZWwgb2YgdGhlIGV2ZW50IGxpc3RlbmVyLiBMaXN0ZW5lcnMgd2l0aCBoaWdoZXIgcHJpb3JpdHkgd2lsbCBiZSBleGVjdXRlZCBiZWZvcmUgbGlzdGVuZXJzIHdpdGggbG93ZXIgcHJpb3JpdHkuIExpc3RlbmVycyB3aXRoIHNhbWUgcHJpb3JpdHkgbGV2ZWwgd2lsbCBiZSBleGVjdXRlZCBhdCB0aGUgc2FtZSBvcmRlciBhcyB0aGV5IHdlcmUgYWRkZWQuIChkZWZhdWx0ID0gMClcbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsQmluZGluZ30gQW4gT2JqZWN0IHJlcHJlc2VudGluZyB0aGUgYmluZGluZyBiZXR3ZWVuIHRoZSBTaWduYWwgYW5kIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgYWRkT25jZSA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuICAgICAgICAgICAgdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgJ2FkZE9uY2UnKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9yZWdpc3Rlckxpc3RlbmVyKGxpc3RlbmVyLCB0cnVlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlIGEgc2luZ2xlIGxpc3RlbmVyIGZyb20gdGhlIGRpc3BhdGNoIHF1ZXVlLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBIYW5kbGVyIGZ1bmN0aW9uIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQuXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY29udGV4dF0gRXhlY3V0aW9uIGNvbnRleHQgKHNpbmNlIHlvdSBjYW4gYWRkIHRoZSBzYW1lIGhhbmRsZXIgbXVsdGlwbGUgdGltZXMgaWYgZXhlY3V0aW5nIGluIGEgZGlmZmVyZW50IGNvbnRleHQpLlxuICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gTGlzdGVuZXIgaGFuZGxlciBmdW5jdGlvbi5cbiAgICAgICAgICovXG4gICAgICAgIHJlbW92ZSA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgY29udGV4dCkge1xuICAgICAgICAgICAgdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgJ3JlbW92ZScpO1xuXG4gICAgICAgICAgICB2YXIgaSA9IHRoaXMuX2luZGV4T2ZMaXN0ZW5lcihsaXN0ZW5lciwgY29udGV4dCk7XG4gICAgICAgICAgICBpZiAoaSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kaW5nc1tpXS5fZGVzdHJveSgpOyAvL25vIHJlYXNvbiB0byBhIFNpZ25hbEJpbmRpbmcgZXhpc3QgaWYgaXQgaXNuJ3QgYXR0YWNoZWQgdG8gYSBzaWduYWxcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kaW5ncy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbGlzdGVuZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlbW92ZSBhbGwgbGlzdGVuZXJzIGZyb20gdGhlIFNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIHJlbW92ZUFsbCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoO1xuICAgICAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzW25dLl9kZXN0cm95KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9iaW5kaW5ncy5sZW5ndGggPSAwO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtudW1iZXJ9IE51bWJlciBvZiBsaXN0ZW5lcnMgYXR0YWNoZWQgdG8gdGhlIFNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIGdldE51bUxpc3RlbmVycyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9iaW5kaW5ncy5sZW5ndGg7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFN0b3AgcHJvcGFnYXRpb24gb2YgdGhlIGV2ZW50LCBibG9ja2luZyB0aGUgZGlzcGF0Y2ggdG8gbmV4dCBsaXN0ZW5lcnMgb24gdGhlIHF1ZXVlLlxuICAgICAgICAgKiA8cD48c3Ryb25nPklNUE9SVEFOVDo8L3N0cm9uZz4gc2hvdWxkIGJlIGNhbGxlZCBvbmx5IGR1cmluZyBzaWduYWwgZGlzcGF0Y2gsIGNhbGxpbmcgaXQgYmVmb3JlL2FmdGVyIGRpc3BhdGNoIHdvbid0IGFmZmVjdCBzaWduYWwgYnJvYWRjYXN0LjwvcD5cbiAgICAgICAgICogQHNlZSBTaWduYWwucHJvdG90eXBlLmRpc2FibGVcbiAgICAgICAgICovXG4gICAgICAgIGhhbHQgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLl9zaG91bGRQcm9wYWdhdGUgPSBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGlzcGF0Y2gvQnJvYWRjYXN0IFNpZ25hbCB0byBhbGwgbGlzdGVuZXJzIGFkZGVkIHRvIHRoZSBxdWV1ZS5cbiAgICAgICAgICogQHBhcmFtIHsuLi4qfSBbcGFyYW1zXSBQYXJhbWV0ZXJzIHRoYXQgc2hvdWxkIGJlIHBhc3NlZCB0byBlYWNoIGhhbmRsZXIuXG4gICAgICAgICAqL1xuICAgICAgICBkaXNwYXRjaCA6IGZ1bmN0aW9uIChwYXJhbXMpIHtcbiAgICAgICAgICAgIGlmICghIHRoaXMuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcGFyYW1zQXJyID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSxcbiAgICAgICAgICAgICAgICBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGJpbmRpbmdzO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5tZW1vcml6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3ByZXZQYXJhbXMgPSBwYXJhbXNBcnI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghIG4pIHtcbiAgICAgICAgICAgICAgICAvL3Nob3VsZCBjb21lIGFmdGVyIG1lbW9yaXplXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBiaW5kaW5ncyA9IHRoaXMuX2JpbmRpbmdzLnNsaWNlKCk7IC8vY2xvbmUgYXJyYXkgaW4gY2FzZSBhZGQvcmVtb3ZlIGl0ZW1zIGR1cmluZyBkaXNwYXRjaFxuICAgICAgICAgICAgdGhpcy5fc2hvdWxkUHJvcGFnYXRlID0gdHJ1ZTsgLy9pbiBjYXNlIGBoYWx0YCB3YXMgY2FsbGVkIGJlZm9yZSBkaXNwYXRjaCBvciBkdXJpbmcgdGhlIHByZXZpb3VzIGRpc3BhdGNoLlxuXG4gICAgICAgICAgICAvL2V4ZWN1dGUgYWxsIGNhbGxiYWNrcyB1bnRpbCBlbmQgb2YgdGhlIGxpc3Qgb3IgdW50aWwgYSBjYWxsYmFjayByZXR1cm5zIGBmYWxzZWAgb3Igc3RvcHMgcHJvcGFnYXRpb25cbiAgICAgICAgICAgIC8vcmV2ZXJzZSBsb29wIHNpbmNlIGxpc3RlbmVycyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIGFkZGVkIGF0IHRoZSBlbmQgb2YgdGhlIGxpc3RcbiAgICAgICAgICAgIGRvIHsgbi0tOyB9IHdoaWxlIChiaW5kaW5nc1tuXSAmJiB0aGlzLl9zaG91bGRQcm9wYWdhdGUgJiYgYmluZGluZ3Nbbl0uZXhlY3V0ZShwYXJhbXNBcnIpICE9PSBmYWxzZSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEZvcmdldCBtZW1vcml6ZWQgYXJndW1lbnRzLlxuICAgICAgICAgKiBAc2VlIFNpZ25hbC5tZW1vcml6ZVxuICAgICAgICAgKi9cbiAgICAgICAgZm9yZ2V0IDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMuX3ByZXZQYXJhbXMgPSBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZW1vdmUgYWxsIGJpbmRpbmdzIGZyb20gc2lnbmFsIGFuZCBkZXN0cm95IGFueSByZWZlcmVuY2UgdG8gZXh0ZXJuYWwgb2JqZWN0cyAoZGVzdHJveSBTaWduYWwgb2JqZWN0KS5cbiAgICAgICAgICogPHA+PHN0cm9uZz5JTVBPUlRBTlQ6PC9zdHJvbmc+IGNhbGxpbmcgYW55IG1ldGhvZCBvbiB0aGUgc2lnbmFsIGluc3RhbmNlIGFmdGVyIGNhbGxpbmcgZGlzcG9zZSB3aWxsIHRocm93IGVycm9ycy48L3A+XG4gICAgICAgICAqL1xuICAgICAgICBkaXNwb3NlIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVBbGwoKTtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9iaW5kaW5ncztcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9wcmV2UGFyYW1zO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgb2JqZWN0LlxuICAgICAgICAgKi9cbiAgICAgICAgdG9TdHJpbmcgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ1tTaWduYWwgYWN0aXZlOicrIHRoaXMuYWN0aXZlICsnIG51bUxpc3RlbmVyczonKyB0aGlzLmdldE51bUxpc3RlbmVycygpICsnXSc7XG4gICAgICAgIH1cblxuICAgIH07XG5cblxuICAgIC8vIE5hbWVzcGFjZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLyoqXG4gICAgICogU2lnbmFscyBuYW1lc3BhY2VcbiAgICAgKiBAbmFtZXNwYWNlXG4gICAgICogQG5hbWUgc2lnbmFsc1xuICAgICAqL1xuICAgIHZhciBzaWduYWxzID0gU2lnbmFsO1xuXG4gICAgLyoqXG4gICAgICogQ3VzdG9tIGV2ZW50IGJyb2FkY2FzdGVyXG4gICAgICogQHNlZSBTaWduYWxcbiAgICAgKi9cbiAgICAvLyBhbGlhcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgKHNlZSAjZ2gtNDQpXG4gICAgc2lnbmFscy5TaWduYWwgPSBTaWduYWw7XG5cblxuXG4gICAgLy9leHBvcnRzIHRvIG11bHRpcGxlIGVudmlyb25tZW50c1xuICAgIGlmKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCl7IC8vQU1EXG4gICAgICAgIGRlZmluZShmdW5jdGlvbiAoKSB7IHJldHVybiBzaWduYWxzOyB9KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKXsgLy9ub2RlXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gc2lnbmFscztcbiAgICB9IGVsc2UgeyAvL2Jyb3dzZXJcbiAgICAgICAgLy91c2Ugc3RyaW5nIGJlY2F1c2Ugb2YgR29vZ2xlIGNsb3N1cmUgY29tcGlsZXIgQURWQU5DRURfTU9ERVxuICAgICAgICAvKmpzbGludCBzdWI6dHJ1ZSAqL1xuICAgICAgICBnbG9iYWxbJ3NpZ25hbHMnXSA9IHNpZ25hbHM7XG4gICAgfVxuXG59KHRoaXMpKTtcbiJdfQ==
;