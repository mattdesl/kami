var Class = require('jsOOP').Class;

var VertexData = new Class({

	initialize: function(context, numVerts, numIndices, drawMode, vertexAttribs) {
		if (!context)
			throw "GL context not specified";
		if (!numVerts)
			throw "numVerts not specified, must be > 0";

		this.context = context;
		this.gl = context.gl;
		
		this.numVerts = numVerts;
		this.numIndices = numIndices || 0;
		this.drawMode = drawMode || this.gl.STATIC_DRAW;
		this.vertexAttribs = vertexAttribs || [];

		//add this VBO to the managed cache
		this.context.addManagedObject(this);

		this.create();
	},

	//recreates the buffers on context loss
	create: function() {
		this.gl = this.context.gl;
	},

	/**
	 * Called to bind this vertex data with the given 
	 * ShaderProgram, enabling any associated attribute
	 * arrays.
	 *
	 * If shader is null or undefined, it's assumed
	 * that the vertex attributes have already been bound. 
	 * This can be used by advanced users to avoid redundant
	 * GL calls.
	 * 
	 * @param  {ShaderProgram} shader the shader that will be used to render this mesh
	 */
	bind: function(shader) {
		if (shader)
			this.bindVertexAttributes(shader);
	},

	//binds this mesh's vertex attributes for the given shader
	bindVertexAttributes: function(shader) {
		//for each attribtue
		for (var i=0; i<this.vertexAttribs.length; i++) {
			var a = this.vertexAttribs[i];

			//determine the location to 
			var loc = a.location === null 
					? shader.getAttributeLocation(a.name)
					: a.location;
		}
	}
});

VertexData.Attrib = new Class({

	name: null,
	numComponents: null,
	location: null,

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
	initialize: function(name, numComponents, location) {
		this.name = name;
		this.numComponents = numComponents;
		this.location = typeof location === "number" ? location : null;
	}
})


module.exports = VertexData;


//flow:
//  



// var attribs = [
// 	new Mesh.Attribute("a_position", 2),
// 	new Mesh.Attribute("a_color", 1)
// ];
// var mesh = new Mesh(context, 4, 6, Mesh.STATIC, attribs);


//Constant Vertex Attrib:
//	e.g. with instancing maybe?
//Only enable vertex attrib if it's used?
//	but we are still sending alpha so WTF
//	would need another buffer, but that can get real ugly.
//  