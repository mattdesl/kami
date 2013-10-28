var WebGLCanvas = require('kami').WebGLCanvas;
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
	var context = new WebGLCanvas(800, 600, canvas[0], {
		antialias: true	
	});
	
	//create a basic shader..
	var shader = new ShaderProgram(context.gl, $("#vert_shader").html(), $("#frag_shader").html());

	//create a texture from Image
	var tex = new Texture(context.gl);





	//async load an image
	var image = new Image();
	image.src = "img/bunny.png";
	image.onload = function() {
		console.log("image loaded");
		tex.uploadImage(image);
		console.log(tex.width, tex.height);
	}.bind(this);

	requestAnimationFrame(render);

	function render() {
		
		requestAnimationFrame(render);
	}
}); 