//We use browserify to alias the kami-gl namespace,
//this way the code looks exactly the same in regular Node projects

var WebGLContext = require('kami-gl').WebGLContext;
var ShaderProgram = require('kami-gl').ShaderProgram;
var Texture = require('kami-gl').Texture;
var Mesh = require('kami-gl').Mesh;

$(function() {
	var mainContainer = $("body").css({
		background: "#343434"
	});

	var demoContainers = [];
	var currentDemo = null;
	var currentIndex = 0;

	var width = 256;
	var height = 256;

	var canvas = $("<canvas>").css({
		position: "fixed",
		top: 0,
		left: 0,
		overflow: "hidden"
	});

	canvas.appendTo(mainContainer);

	//create our webGL context..
	//this will manage viewport and context loss/restore
	var context = new WebGLContext(width, height, canvas[0]);



	function render() {
		
	}
});