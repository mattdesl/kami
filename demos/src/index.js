var WebGLContext = require('kami').WebGLContext;
var ShaderProgram = require('kami').ShaderProgram;
var Texture = require('kami').Texture;

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

	//create a texture from Image
	// var tex = new Texture(context.gl);

	var pixels = new Uint8Array([255, 255, 0, 255]);

	//create texture from Image (async load)
	// var tex = new Texture(context, "img/bunny.png");

	var tex = new Texture(context, "img/bunny.png", onload);


	requestAnimationFrame(render);

	var loseCtx = context.gl.getExtension("WEBGL_lose_context");

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
		shader.bind();
		tex.bind();
	}
});