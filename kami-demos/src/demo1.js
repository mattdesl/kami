var $ = require('jquery');

//We could require THREE.js like so
//The alias can be configured in the grunt build script
//var THREE = require('threejs');

var canvas, 
	context,
	width,
	height,
	timer = 0,

	element;

module.exports.setup = function(parent) {
	canvas = $("<canvas>").css({
		position: "fixed",
		top: 0,
		left: 0,
		zIndex: -10
	});
	context = canvas[0].getContext("2d");

	//trigger a resize immediately
	$(window).resize();

	
	//a dynamic DOM element
	element = $("<div>").text("Click me!").css({
		padding: 5,
		margin: 50,
		backgroundColor: "#ddd",
		display: "inline-block"
	});

	element.click(function(ev) {
		element
			.transition({ rotate: '45deg' })
			.transition({ rotate: '0deg' });
	});

	parent.append(canvas);
	parent.append(element);
};

module.exports.show = function(callback) {
	//TODO: use a parent container for convenience...
	canvas.fadeIn(400, callback);
	element.fadeOut();
};

module.exports.hide = function(callback) {
	canvas.fadeOut(400, callback);
	element.fadeOut();
};

module.exports.dispose = function(parent) {
	canvas.detach();
	element.detach();
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