var Class = require('jsOOP/lib/Class');

var ShaderProgram = new Class({
	
	vertSource: null,
	fragSource: null,

	vertShader: null,
	fragShader: null,

	program: null,

	initialize: function(gl, vertSource, fragSource, attribLocations) {
		this.gl = gl;
		this.vertSource = vertexSource;
		this.fragSource = fragSource;

		this._compileShaders();
	},

	//Compiles the shaders, throwing an error if the program was invalid.
	_compileShaders: function() {
		this.vertShader = this._loadShader(gl.VERTEX_SHADER, this.vertSource);
		this.fragShader = this._loadShader(gl.FRAGMENT_SHADER, this.fragSource);

		if (!this.vertShader || !this.fragShader)
			throw "Error returned when calling createShader";

		this.program = gl.createProgram();

		if (attribLocations) {
			for (var key in attribLocations) {
				if (attribLocations.hasOwnProperty(key))
		    		gl.bindAttribLocation(this.program, attribLocations[key], key);
			}
		}

		gl.linkProgram(this.program);

		if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS))
			throw gl.getProgramInfoLog(this.program);
	},

	_loadShader: function(type, source) {
		var gl = this.gl;
		var shader = gl.createShader(type);
		if (!shader) //should not occur...
			return -1;

		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw gl.getShaderInfoLog(shader);
		}
		return shader;
	},
	
	setUniform: function(name, type, args) {
		//first look in cache
		//if not found,
	},

	getUniform: function(name) {

	},


	//Checks the cache to see if we've already saved 
	getUniformLocation: function(name) {
		//this.gl.getUniformLocation(this.shaderProgram, name);
	},

	use: function() {
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