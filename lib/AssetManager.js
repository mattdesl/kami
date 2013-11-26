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
			this.assets[i].status = AssetManager.Status.QUEUED;

		//copy our assets to a queue which can be popped
		this.tasks = this.assets.slice();

		this.__loadCount = this.__totalItems = this.tasks.length;
	},


	/**
	 * Attempts to extract a mime-type from the given data URI. It will
	 * default to "text/plain" if the string is a data URI with no specified
	 * mime-type. If the string does not begin with "data:", this method 
	 * returns null.
	 *
	 * @method  __getDataType
	 * @private
	 * @param  {String} str the data URI
	 * @return {String}     the mime type
	 */
	__getDataType: function(str) {
		var test = "data:";
		//starts with 'data:'
		var start = str.slice(0, test.length).toLowerCase();
		if (start == test) {
			var data = str.slice(test.length);
			
			var sepIdx = data.indexOf(',');
			if (sepIdx === -1) //malformed data URI scheme
				return null;

			//e.g. "image/gif;base64" => "image/gif"
			var info = data.slice(0, sepIdx).split(';')[0];

			//We might need to handle some special cases here...
			//standardize text/plain to "txt" file extension
			if (!info || info.toLowerCase() == "text/plain")
				return "txt"

			//User specified mime type, try splitting it by '/'
			return info.split('/').pop().toLowerCase();
		}
		return null;
	},

	__extension: function(str) {
		var idx = str.lastIndexOf('.');
		if (idx === -1 || idx === 0 || idx === str.length-1) // does not have a clear file extension
			return "";
		return str.substring(idx+1).toLowerCase();
	},

	/**
	 * Pushes an asset onto this stack. This
	 * attempts to detect the loader for you based
	 * on the asset name's file extension (or data URI scheme). 
	 * If the asset name doesn't have a known file extension,
	 * or if there is no loader registered for that filename,
	 * this method throws an error. If you're trying to use 
	 * generic keys for asset names, use the loadAs method and
	 * specify a loader plugin.
	 * 
	 * This method's arguments are passed to the constructor
	 * of the loader function. 
	 *
	 * The return value of this method is determined by
	 * the loader's processArguments method. For example, the
	 * default Image loader returns a Texture object.
	 *
	 * @example
	 *    //uses ImageLoader to get a new Texture
	 *    var tex = assets.load("tex0.png"); 
	 *
	 *    //or you can specify your own texture
	 *    assets.load("tex1.png", tex1);
	 *
	 *    //the ImageLoader also accepts a path override, 
	 *    //but the asset key is still "frames0.png"
	 *    assets.load("frame0.png", tex1, "path/to/frame1.png");
	 *    
	 * @method  load
	 * @param  {String} name the asset name
	 * @param  {any} args a variable number of optional arguments
	 * @return {any} returns the best type for this asset's loader
	 */
	load: function(name) {
		if (!name)
			throw "No asset name specified for load()";

		var ext = this.__getDataType(name);
		if (ext === null)
			ext = this.__extension(name);

		if (!ext) 
			throw "Asset name does not have a file extension: " + name;
		if (!AssetManager.loaders.hasOwnProperty(ext))
			throw "No known loader for extension "+ext+" in asset "+name;

		var args = [ AssetManager.loaders[ext], name ];
		args = args.concat( Array.prototype.slice.call(arguments, 1) );

		return this.loadAs.apply(this, args);
	},

	/**
	 * Pushes an asset onto this stack. This allows you to
	 * specify a loader function for the asset. This is useful
	 * if you wish to use generic names for your assets (instead of
	 * filenames), or if you want a particular asset to use a specific
	 * loader. 
	 *
	 * The first argument is the loader function, and the second is the asset
	 * name. Like with {{#crossLink "AssetManager/load:method"}}{{/crossLink}}, 
	 * any subsequent arguments will be passed along to the loader.
	 *
	 * The return value of this method is determined by
	 * the loader's getReturnValue() method, if it has one. For example, the
	 * default ImageLoader returns a Texture object. If the loader function
	 * does not implement this method, `undefined` is returned.
	 *
	 * @method  load
	 * @param {Fucntion} loader the loader function
	 * @param {String} name the asset name
	 * @param {Object ...} args a variable number of optional arguments
	 * @return {any} returns the best type for this asset's loader
	 */
	loadAs: function(loader, name) {
		if (!name)
			throw "no name specified to load";
		if (!loader)
			throw "no loader specified for asset "+name;

		var idx = this.__indexOf(this.assets, name);
		if (idx !== -1) //TODO: eventually add support for dependencies and shared assets
			throw "asset already defined in asset manager";

		//grab the arguments, except for the loader function.
		var args = Array.prototype.slice.call(arguments, 1);

		//now we need to create a new Loader object
		//we apply the constructor with the args (context, name, [varargs...])
		var loaderObj = new ( Function.prototype.bind.apply(loader, 
									[null, this.context].concat(args)) );


		//keep hold of this asset and its original name
		var descriptor = new AssetManager.Descriptor(name, loaderObj);
		this.assets.push( descriptor );

		//also add it to our queue of current tasks
		this.tasks.push( descriptor );
		this.__loadCount++;
		this.__totalItems++;

		//try to get a nice return value from the Loader class
		if (typeof loaderObj.getReturnValue === "function")
			return loaderObj.getReturnValue();
		else 
			return undefined;
	},

	__indexOf: function(list, name) {
		for (var i=0; i<list.length; i++) {
			if (list[i].name === name)
				return i;
		}
		return -1;
	},

	__loadCallback: function(name, success) {
		//if 'false' was passed, use it.
		//otherwise treat as 'true'
		success = success !== false;

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

	// TODO.... getStatus and isLoaded
	// isLoaded: function(name) {
	// 	
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

		var cb = this.__loadCallback.bind(this, nextTask.name);

		// var newParams = [ nextTask.name, cb ].concat(nextTask.params);
		loader.load.call(loader, cb);

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
 * The first parameter is a loader function. The second is an array
 * of lower-case extensions (without the period) that
 * should be associated with that loader. This will override other
 * loaders by the same extension. 
 *
 * You can also provide an optional mediaType to support data URI schemes.
 * For example, if the mediaType is specified as "image", and the extensions
 * are ["png", "gif"], then in addition to those extensions being associated with
 * the loader, the mime-types "image/png" and "image/gif" will also be supported.
 *
 * By default, the extensions "png", "jpg", "jpeg", and "gif" and their associated
 * media types are
 * registered to {{#crossLink "AssetManager/ImageLoader:attribute"}}{{/crossLink}}.
 * 
 * @method registerLoader
 * @static
 * @param {Function} loaderFunc the loader function
 * @param {Array} extensions array of extension strings, not including period
 * @param {String} mediaType an optional media type 
 */
AssetManager.registerLoader = function(loaderFunc, extensions, mediaType) {
	if (arguments.length===0)
		throw "must specify at least one extension for the loader";
	
	for (var i=0; i<extensions.length; i++) {
		AssetManager.loaders[ extensions[i] ] = loaderFunc;
		if (mediaType) 
			AssetManager.loaders[ mediaType + '/' + extensions[i] ] = loaderFunc;
	}
};


/**
 * A simple wrapper for assets which will be passed along to the loader;
 * this is used internally.
 * 
 * //@class AssetManager.Descriptor
 */
AssetManager.Descriptor = function(name, loader) {
	this.name = name;
	this.loader = loader;
	this.status = AssetManager.Status.QUEUED;
};

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
 * A Loader plugin is a class which handles the asynchronous loading and provides
 * a convenient return value for the `AssetManager.load()` functions. The loader class
 * is constructed with the following parameters: first, the WebGLContext this AssetManager
 * is using, and second, the name of the asset to be loaded. The subsequent arguments are
 * those that were passed as extra to the `AssetManager.load()` functions.
 *
 * A loader must implement a `load()` function, and it's encouraged to also implement a 
 * `getReturnValue()` function, for convenience.
 * 
 * @class AssetManager.ImageLoader
 * @constructor 
 * @param {WebGLContext} context the context, passed by AssetManager
 * @param {String} name the unique key for this asset
 * @param {String} path the optional path or data URI to use, will default to the name param
 * @param {Texture} texture an optional texture to act on; if undefined, a new texture
 *                          will be created
 */
AssetManager.ImageLoader = new Class({

	initialize: function ImageLoader(context, name, texture, path) {
		this.name = name;
		this.path = path || this.name;
		this.texture = texture || new Texture(context);
	},

	/**
	 * This is the loading function of a AssetManager plugin, 
	 * which handles the asynchronous loading for an asset. 
	 * The function must be implemented in a very
	 * strict manner for the asset manager to work correctly.
	 *
	 * Once the async loading is done, you must call the `finished` callback
	 * that was passed to this method. You can pass the parameter `false` to the
	 * finished callback to indicate the async load has failed. Otherwise, it is assumed
	 * to be successful.
	 * 
	 * If you don't invoke the callback, the asset manager may never finish loading.
	 * 
	 * @method load
	 * @static
	 * @param  {String} name the name of the asset to load
	 * @param {Function} finished the function to call when async loading is complete
	 * @param {Texture} texture the texture to operate on for this asset
	 * @param {String} path the optional image path to use instead of the `name` parameter
	 */
	load: function(finished) {

		var img = new Image();

		var self = this;

		img.onload = function() {
			img.onerror = img.onabort = null; //clear other listeners
			self.texture.uploadImage(img);
			finished();
		};
		img.onerror = function() {
			img.onload = img.onabort = null;
			console.warn("Error loading image: "+self.path);
			//We use null data to avoid WebGL errors
			//TODO: handle fail more smoothly, i.e. with a callback
			//TODO: Should this be pure black, or purely transparent?
			self.texture.uploadData(1, 1); 
			finished(false);
		};
		img.onabort = function() {
			img.onload = img.onerror = null;
			console.warn("Aborted image: "+self.path);
			//We use null data to avoid WebGL errors
			self.texture.uploadData(1, 1);
			finished(false);
		};
		//setup source
		img.src = this.path;
	},

	getReturnValue: function() {
		return this.texture;
	}
});

// Register our default loaders...

AssetManager.registerLoader(AssetManager.ImageLoader, 
			["png", "gif", "jpg", "jpeg"], "image");


module.exports = AssetManager;
