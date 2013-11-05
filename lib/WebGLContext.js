/**
 * @module kami
 */

var Class = require('jsOOP').Class;
var Signal = require('signals');

/**
 * A thin wrapper around WebGLRenderingContext which handles
 * context loss and restore with various rendering objects (textures,
 * shaders and buffers). This also handles general viewport management.
 *
 * If the view is not specified, a canvas will be created.
 * 
 * @class  WebGLContext
 * @param {Number} width the width of the GL canvas
 * @param {Number} height the height of the GL canvas
 * @param {HTMLCanvasElement} view the optional DOM canvas element
 * @param {Object} contextAttribuets an object containing context attribs which
 *                                   will be used during GL initialization
 */
var WebGLContext = new Class({
		
	/**
	 * The list of rendering objects (shaders, VBOs, textures, etc) which are 
	 * currently being managed. Any object with a "create" method can be added
	 * to this list. Upon destroying the rendering object, it should be removed.
	 * See addManagedObject and removeManagedObject.
	 * 
	 * @property {Array} managedObjects
	 */
	managedObjects: null,

	/**
	 * The actual GL context. You can use this for
	 * raw GL calls or to access GLenum constants. This
	 * will be updated on context restore. While the WebGLContext
	 * is not `valid`, you should not try to access GL state.
	 * 
	 * @property gl
	 * @type {WebGLRenderingContext}
	 */
	gl: null,

	/**
	 * The width of this canvas.
	 *
	 * @property width
	 * @type {Number}
	 */
	width: null,

	/**
	 * The height of this canvas.
	 * @property height
	 * @type {Number}
	 */
	height: null,

	/**
	 * The canvas DOM element for this context.
	 * @property {Number} view
	 */
	view: null,

	/**
	 * The context attributes for initializing the GL state. This might include
	 * anti-aliasing, alpha settings, verison, and so forth.
	 * 
	 * @property {Object} contextAttributes 
	 */
	contextAttributes: null,
	
	/**
	 * Whether this context is 'valid', i.e. renderable. A context that has been lost
	 * (and not yet restored) is invalid.
	 * 
	 * @property {Boolean} valid
	 */
	valid: false,

	/**
	 * A signal dispatched when GL context is lost. 
	 * 
	 * The first argument passed to the listener is the WebGLContext
	 * managing the context loss.
	 * 
	 * @event {Signal} lost
	 */
	lost: null,

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
	restored: null,

	initialize: function(width, height, view, contextAttributes) {
		this.lost = new Signal();
		this.restored = new Signal();

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

		this.resize(this.width, this.height);
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