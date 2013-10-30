var WebGLContext = require('kami').WebGLContext;
var ShaderProgram = require('kami').ShaderProgram;
var Texture = require('kami').Texture;
var VertexData = require('kami').VertexData;

$(function() {
	var mainContainer = $("body").css({
		background: "#000"
	});

	var demoContainers = [];
	var currentDemo = null;
	var currentIndex = 0;


	var width = 800;
	var height = 600;

	var canvas = $("<canvas>", {
		width: width,
		height: height
	}).css({
		background: "#343434",  
		position: "fixed",
		top: 0,
		left: 0,
		overflow: "hidden"
	});

	canvas.appendTo(mainContainer);

	//create our webGL context..
	//this will manage viewport and context loss/restore
	var context = new WebGLContext(800, 600, canvas[0]);
	
	//create a basic shader..
	//this will be added to the context and re-compiled on context restore
	var shader = new ShaderProgram(context, $("#vert_shader").html(), $("#frag_shader").html());

	shader.bind();
	context.gl.uniform1i(shader.getUniformLocation("tex0"), 0);

	// console.log(shader.getUniformLocation("tex0"));
	// console.log(shader.getAttributeLocation("TexCoord"));
	// 
	//create a texture from Image
	// var tex = new Texture(context.gl);

	var pixels = new Uint16Array([255, 255, 0, 255]);

	//create texture from Image (async load)
	var tex = new Texture(context, "img/bunny.png");

	// var tex = new Texture(context, "img/bunny.png", onload);

	var vertices = new Float32Array([
		-1, -1,
		0, 0,

		0, -1,
		1, 0,

		0, 0,
		1, 1,

		-1, 0, //xy
		0, 1 //uv
	]);
	
	var indices = new Uint16Array([
		0, 1, 2,
		0, 2, 3,
	]);

	// context.gl.disable(context.gl.CULL_FACE)

	//static = true
	//numVerts = 4
	//numIndices = 6
	//attribs = just position right now...
	var vbo = new VertexData(context, true, 4, 6, [
		new VertexData.Attrib("Position", 2),
		new VertexData.Attrib("TexCoord", 2)
	]);

	//these are initialized already, or we can override them like so:
	vbo.indices = indices;
	vbo.vertices = vertices;
	vbo.dirty = true;

	requestAnimationFrame(render);

	// var loseCtx = context.gl.getExtension("WEBGL_lose_context");

	// setTimeout(function() {
	// 	loseCtx.loseContext();	
		
	// }.bind(this), 1000);

	// setTimeout(function() {
	// 	loseCtx.restoreContext();
	// }.bind(this), 3200);

	function render() {
		requestAnimationFrame(render);

		if (!context.valid) {
			return;
		} 

		var gl = context.gl;

		vbo.dirty = true;
		tex.bind();
		shader.bind();

		vbo.bind(shader);
		vbo.draw(gl.TRIANGLES, 6, 0);
		vbo.unbind(shader);
	}
});