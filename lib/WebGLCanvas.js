var Class = require('jsOOP').Class;

var WebGLCanvas = new Class({
	//extend a base class!!	
	
	textureCache: null,
	shaderCache: null,
	
	initialize: function(width, height, view, contextAttributes) {
		//setup defaults
		this.view = view || document.createElement("canvas");

		//default size as per spec:
		//http://www.w3.org/TR/2012/WD-html5-author-20120329/the-canvas-element.html#the-canvas-element
		this.width = this.view.width = width || 300;
		this.height = this.view.height = height || 150;
		
		//setup context lost and restore listeners
		this.view.addEventListener("webglcontextlost", function (ev) {
			this._contextLost(ev);
		}.bind(this));
		this.view.addEventListener("webglcontextrestored", function (ev) {
			this._contextRestored(ev);
		}.bind(this));
		
		try {
			this.gl = this.view.getContext("webgl", contextAttributes) 
						|| this.view.getContext("experimental-webgl", contextAttributes);
		} catch (e) {
			throw "WebGL Context Not Supported -- try enabling it or using a different browser\n"
				+ e; //print err msg
		}
	},

	initGL: function() {

	},

	_contextLost: function(ev) {
		//all textures/shaders/buffers/FBOs have been deleted... 
		//we need to re-create them on restore
	},

	_contextRestored: function(ev) {
		
	}
});

module.exports = WebGLCanvas;