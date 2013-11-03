//This is an index for UMD builds. It includes kami and kami-gl. 

module.exports = {
	//kami core
	Point: require('./Point'),
	AbstractBatch: require('./AbstractBatch'),
	SpriteBatch: require('./SpriteBatch'),
	AssetManager: require('./AssetManager'),

	//kami-gl
	Mesh: require('kami-gl').Mesh,
	ShaderProgram: require('kami-gl').ShaderProgram,
	Texture: require('kami-gl').Texture,
	WebGLContext: require('kami-gl').WebGLContext,

	//dependencies
	jsOOP: require('jsOOP'),
	glmatrix: require('gl-matrix'),
	signals: require('signals')
};

//TODO: Auto-generate this file with a grunt task that
//		is invoked before browserify. This way we can
//		easily include all dependencies on the top-level kami 
//		namespace, like vec2/vec3/Class/Signal/etc. 