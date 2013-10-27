var WebGLCanvas = require('kami/lib/WebGLCanvas');
var ShaderProgram = require('kami/lib/ShaderProgram');

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


	// var renderer = new WebGLRenderer(width, height, canvas[0]);
	
	var context = new WebGLCanvas(800, 600, null, {
		antialias: true	
	});


	var shader = new ShaderProgram($("#vert_shader").html(), $("#frag_shader").html());

	requestAnimationFrame(render);

	function render() {
		
		requestAnimationFrame(render);
	}
}); 