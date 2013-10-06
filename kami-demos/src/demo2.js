var $ = require('jquery');

// var THREE = require('THREE.js');	

var canvas, 
	context,
	width,
	height,
	timer = 0,

	element;

module.exports.setup = function(parent) {
	canvas = $("<canvas>").css({
		position: "absolute",
		top: 0,
		left: 0
	});
	context = canvas[0].getContext("2d");

	//trigger a resize immediately
	$(window).resize();

	
	//a dynamic DOM element
	element = $("<div>").text("Hello, world!").css({
		padding: 5
	});

	parent.append(canvas);
	parent.append(element);
};

module.exports.show = function(callback) {
	canvas.fadeIn(400, callback);
};

module.exports.hide = function(callback) {
	canvas.fadeOut(400, callback);
};

module.exports.dispose = function(parent) {
	canvas.detach();
};

module.exports.resize = function(w, h) {
	width = canvas[0].width = w;
	height = canvas[0].height = h;
};

module.exports.render = function() {
	context.clearRect(0, 0, width, height);

	timer++;

	context.lineWidth = 15;
	context.strokeStyle = 'gray';

	context.beginPath();
	context.arc(150, 150, 25, 0, Math.sin(timer * 0.05) + Math.PI );
	context.stroke();
};