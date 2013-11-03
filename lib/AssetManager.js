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
	loadProgress: null,


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

		//sets up default loader extensions
		this.setupLoaders();
	},

	setupLoaders: function() {
		
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
		//copy our assets to a queue which can be popped
		this.tasks = this.assets.slice();

		this.__loadCount = this.__totalItems = this.tasks.length;
	},

	/**
	 * Pushes an asset onto this stack. This
	 * attempts to detect the loader for you based
	 * on the asset name's file extension. If the
	 * asset name doesn't have a known file extension,
	 * this method throws an error. 
	 *
	 * For custom loaders you should use addCustom, or 
	 * register a filename with your loader.
	 * 
	 * @param  {[type]} name [description]
	 * @return {[type]}      [description]
	 */
	add: function(name, params) {

		//Increase load count.
	},

	addTyped: function(name, loader) {
		var idx = this.indexOfAsset(name);
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
	},

	indexOfAsset: function(name) {
		for (var i=0; i<this.assets.length; i++) {
			if (this.assets[i].name === name)
				return i;
		}
		return -1;
	},

	__loadCallback: function() {
		this.__loadCount--;
		this.loadProgress.dispatch( (this.__totalItems - this.__loadCount) / this.__totalItems, 
									this.__loadCount, this.__totalItems);
			
		if (this.__loadCount === 0) {
			this.loadFinished.dispatch();
		}
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

AssetManager.Descriptor = new Class({

	name: null,
	loader: null,
	params: null,


	initialize: function(name, loader, params) {
		this.name = name;
		this.loader = loader;
		this.params = params;
	}
});

/**
 * The load method is called with the asset name,
 * a callback to be applied on finish, 
 * and any additional arguments passed to the load
 * function.
 *
 * If the callback is not invoked, the asset manager
 * will never finish! So make sure you invoke it only once
 * per load.
 *
 * @param  {[type]} assetName [description]
 * @return {[type]}           [description]
 */
AssetManager.ImageLoader = function(assetName, finished, texture, path) {
	if (!texture) {
		throw "no texture object specified to the ImageLoader for asset manager";
	}

	//if path is undefined, use the asset name and 
	//assume its a path.
	path = path || assetName;

	var img = new Image();

	img.onload = function() {
		img.onerror = img.onabort = null; //clear other listeners
		texture.uploadImage(img);
		finished();
	};
	img.onerror = function() {
		img.onload = img.onabort = null;
		console.warn("Error loading image: "+path);
		finished();
	};
	img.onabort = function() {
		img.onload = img.onerror = null;
		console.warn("Aborted image: "+path);
		finished();
	};
	img.src = path;
};

module.exports = AssetManager;
