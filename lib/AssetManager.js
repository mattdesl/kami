var Class = require('jsOOP').Class;
var Signal = require('signals');

/**
 * This is a minimal asset loader which is mainly used as 
 * a notification that GL is ready to render all assets.
 * 
 * This needs to play well with context loss.
 */
var AssetManager = new Class({
	
	assets: null,
	loaders: null,
	tasks: null,

	//Private stuff... do not touch!

	__loadCount: 0,
	__totalItems: 0,
	__loadCallbackFunc: null,
	__invalidateFunc: null,

	// Signals 
	
	loadStarted: null,
	loadFinished: null,

	/**
	 * A signal dispatched on progress updates, once an asset
	 * has been loaded in full (i.e. its async task finished).
	 *
	 * This is passed four arguments: 
	 * 
	 *     current - the current number of assets that have been loaded
	 *     total - the total number of assets to load
	 *     name - the asset name which was just loaded
	 * 
	 * @type {[type]}
	 */
	loadProgress: null,

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
	 * @type {Signal}
	 */
	loadError: null,


	initialize: function(context) {
		this.assets = [];
		this.loaders = {};
		this.tasks = [];
		this.__loadCount = this.__totalItems = 0;

		this.loadStarted = new Signal();
		this.loadFinished = new Signal();
		this.loadProgress = new Signal();

		this.__invalidateFunc = this.invalidate.bind(this);
		this.__loadCallbackFunc = this.__loadCallback.bind(this);

		this.context = context;
		this.context.lost.add(this.__invalidateFunc);
	},

	/**
	 * Destroys this asset manager; removing its listeners
	 * with WebGLContext and deleting the assets array.
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
	 * This is generally only called on context loss.
	 * 
	 * @return {[type]} [description]
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
	 * @param  {[type]} name [description]
	 * @return {[type]}      [description]
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
		this.__loadCount--;

		var assetIdx = this.__indexOf(this.assets, name);
		if (assetIdx !== -1) {
			this.assets[assetIdx].loaded = true;
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

	isLoaded: function(name) {
		var assetIdx = this.__indexOf(this.assets, name);
		return assetIdx !== -1 ? this.assets[assetIdx].loaded : false;
	},

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
		loader.apply(this, newParams);

		return (this.__loadCount === 0);
	}
});

/**
 * A set of loader plugins for this asset manager. These might be as simple
 * as pushing HTML Image objects into a Texture, or more complex like decoding
 * a compressed, mip-mapped, or cube-map texture.
 * 
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
 * @method
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

/**
 * This is a "loader function" which handles the asynchronous
 * loading for an asset. The function must be implemented in a very
 * strict manner for the asset manager to work correctly.
 *
 * The first parameter passed to this function is the name of the
 * asset being loaded. The second parameter is a callback that must
 * be invoked after the async task is completed.
 * Any subsequent parameters are those that came from the inital call
 * to load(). 
 *
 * Once the synchronous or asynchronous loading task is completed, the
 * "finished" callback must be invoked with two parameters: first, the
 * name of the asset as passed to this loader. And second, a boolean indicating
 * the success of the load operation. 
 *
 * If you don't invoke the callback, the asset manager may never finish.
 *
 * The function can also have an optional "static method" (i.e. attached to
 * the function) called "processArguments". This is a utility which takes in
 * the arguments and handles them accordingly before allowing them to be passed
 * along to the loader. The return value of this method will be the return value of
 * the load() method, for the user's convenience. This allows users to do the 
 * following:
 *
 *     var tex0 = assetManager.load("img.png"); //returns a new Texture
 *     var tex1 = assetManager.load("img.png", new Texture(context)); //same as above
 *
 *     //also equivalent to this:
 *     var tex2 = new Texture(context);
 *     assetManager.load("img.png", tex2);
 * 
 * @param  {[type]} assetName [description]
 * @return {[type]}           [description]
 */
AssetManager.ImageLoader = function(name, finished, texture, path) {
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
};

//This is a little bit ugly; would it be better with a class that extends 
//a base Loader class? But it would use instance methods...

/**
 * This method is called to 'parse' the arguments before using them for
 * loading. In this case, if the specified texture is null or undefined,
 * we will replace it with a new object.
 *
 * 'params' is an array of arguments that was passed to the loader function.
 *
 * The return value of this method is also the return value of the load()
 * method, for convenience.
 *
 * The method is called bound to the AssetManager, so we can access WebGLContext
 * with "this.context".
 * 
 * @param  {String} name the asset name
 * @param  {Array} params an array of parameters that will be used to load the asset
 * @return {Object} the object the user may expect from the loader, in this case a Texture object
 */
AssetManager.ImageLoader.processArguments = function(name, params) {
	//the first parameter is a texture... if not specified, we need to assign it a new object
	if (params.length === 0 || !params[0])
		return (params[0] = new Texture(this.context));
	else
		return params[0];
};


// Register our default loaders...

AssetManager.registerLoader(AssetManager.ImageLoader, "png", "gif", "jpg", "jpeg");

module.exports = AssetManager;
