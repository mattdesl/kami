require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"jquery":[function(require,module,exports){
module.exports=require('Bobdef');
},{}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
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
},{"jquery":"Bobdef"}],4:[function(require,module,exports){
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
},{"jquery":"Bobdef"}],5:[function(require,module,exports){
//This is the index of all our demos
//It is simply an array to the require'd modules
module.exports = [
	require('./demo1.js'),
	require('./demo2.js')
];
},{"./demo1.js":3,"./demo2.js":4}],6:[function(require,module,exports){
var $ = require('jquery');

//Get the array of demos we will be showing
var demoList = require('./index.js');

var currentDemo = null,
	parentContainer = null,
	width, height;

function setDemo(demo) {
	currentDemo = demo;

	demo.setup(parentContainer);
	demo.resize(width, height);
	demo.show();
}

function render() {
	currentDemo.render();
	requestAnimationFrame(render);
}

$(function() {
	//we'll just use body as our parent container for demos...
	parentContainer = $("body");
	parentContainer.css("overflow", "hidden");

	//handle resize for current demo
	$(window).resize(function() {
		if (currentDemo) {
			width = $(window).width();
			height = $(window).height();
			currentDemo.resize( width, height );
		}
	});

	//show the first demo in the list
	setDemo(demoList[0]);

	requestAnimationFrame(render);
});
},{"./index.js":5,"jquery":"Bobdef"}]},{},[6])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvcHJvamVjdHMva2FtaS9rYW1pLWRlbW9zL2Jvd2VyX2NvbXBvbmVudHMvanF1ZXJ5L2pxdWVyeS5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWktZGVtb3Mvbm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvX2VtcHR5LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS1kZW1vcy9zcmMvZGVtbzEuanMiLCIvcHJvamVjdHMva2FtaS9rYW1pLWRlbW9zL3NyYy9kZW1vMi5qcyIsIi9wcm9qZWN0cy9rYW1pL2thbWktZGVtb3Mvc3JjL2luZGV4LmpzIiwiL3Byb2plY3RzL2thbWkva2FtaS1kZW1vcy9zcmMvbWFpbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0FDQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJtb2R1bGUuZXhwb3J0cz1yZXF1aXJlKCdCb2JkZWYnKTsiLG51bGwsInZhciAkID0gcmVxdWlyZSgnanF1ZXJ5Jyk7XG5cbi8vV2UgY291bGQgcmVxdWlyZSBUSFJFRS5qcyBsaWtlIHNvXG4vL1RoZSBhbGlhcyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgZ3J1bnQgYnVpbGQgc2NyaXB0XG4vL3ZhciBUSFJFRSA9IHJlcXVpcmUoJ3RocmVlanMnKTtcblxudmFyIGNhbnZhcywgXG5cdGNvbnRleHQsXG5cdHdpZHRoLFxuXHRoZWlnaHQsXG5cdHRpbWVyID0gMCxcblxuXHRlbGVtZW50O1xuXG5tb2R1bGUuZXhwb3J0cy5zZXR1cCA9IGZ1bmN0aW9uKHBhcmVudCkge1xuXHRjYW52YXMgPSAkKFwiPGNhbnZhcz5cIikuY3NzKHtcblx0XHRwb3NpdGlvbjogXCJmaXhlZFwiLFxuXHRcdHRvcDogMCxcblx0XHRsZWZ0OiAwLFxuXHRcdHpJbmRleDogLTEwXG5cdH0pO1xuXHRjb250ZXh0ID0gY2FudmFzWzBdLmdldENvbnRleHQoXCIyZFwiKTtcblxuXHQvL3RyaWdnZXIgYSByZXNpemUgaW1tZWRpYXRlbHlcblx0JCh3aW5kb3cpLnJlc2l6ZSgpO1xuXG5cdFxuXHQvL2EgZHluYW1pYyBET00gZWxlbWVudFxuXHRlbGVtZW50ID0gJChcIjxkaXY+XCIpLnRleHQoXCJDbGljayBtZSFcIikuY3NzKHtcblx0XHRwYWRkaW5nOiA1LFxuXHRcdG1hcmdpbjogNTAsXG5cdFx0YmFja2dyb3VuZENvbG9yOiBcIiNkZGRcIixcblx0XHRkaXNwbGF5OiBcImlubGluZS1ibG9ja1wiXG5cdH0pO1xuXG5cdGVsZW1lbnQuY2xpY2soZnVuY3Rpb24oZXYpIHtcblx0XHRlbGVtZW50XG5cdFx0XHQudHJhbnNpdGlvbih7IHJvdGF0ZTogJzQ1ZGVnJyB9KVxuXHRcdFx0LnRyYW5zaXRpb24oeyByb3RhdGU6ICcwZGVnJyB9KTtcblx0fSk7XG5cblx0cGFyZW50LmFwcGVuZChjYW52YXMpO1xuXHRwYXJlbnQuYXBwZW5kKGVsZW1lbnQpO1xufTtcblxubW9kdWxlLmV4cG9ydHMuc2hvdyA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG5cdGNhbnZhcy5mYWRlSW4oNDAwLCBjYWxsYmFjayk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5oaWRlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcblx0Y2FudmFzLmZhZGVPdXQoNDAwLCBjYWxsYmFjayk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5kaXNwb3NlID0gZnVuY3Rpb24ocGFyZW50KSB7XG5cdGNhbnZhcy5kZXRhY2goKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnJlc2l6ZSA9IGZ1bmN0aW9uKHcsIGgpIHtcblx0d2lkdGggPSBjYW52YXNbMF0ud2lkdGggPSB3O1xuXHRoZWlnaHQgPSBjYW52YXNbMF0uaGVpZ2h0ID0gaDtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnJlbmRlciA9IGZ1bmN0aW9uKCkge1xuXHRjb250ZXh0LmNsZWFyUmVjdCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcblxuXHR0aW1lcisrO1xuXG5cdGNvbnRleHQubGluZVdpZHRoID0gMTU7XG5cdGNvbnRleHQuc3Ryb2tlU3R5bGUgPSAnZ3JheSc7XG5cblx0Y29udGV4dC5iZWdpblBhdGgoKTtcblx0Y29udGV4dC5hcmMoMTUwLCAxNTAsIDI1LCAwLCBNYXRoLnNpbih0aW1lciAqIDAuMDUpICsgTWF0aC5QSSApO1xuXHRjb250ZXh0LnN0cm9rZSgpO1xufTsiLCJ2YXIgJCA9IHJlcXVpcmUoJ2pxdWVyeScpO1xuXG4vLyB2YXIgVEhSRUUgPSByZXF1aXJlKCdUSFJFRS5qcycpO1x0XG5cbnZhciBjYW52YXMsIFxuXHRjb250ZXh0LFxuXHR3aWR0aCxcblx0aGVpZ2h0LFxuXHR0aW1lciA9IDAsXG5cblx0ZWxlbWVudDtcblxubW9kdWxlLmV4cG9ydHMuc2V0dXAgPSBmdW5jdGlvbihwYXJlbnQpIHtcblx0Y2FudmFzID0gJChcIjxjYW52YXM+XCIpLmNzcyh7XG5cdFx0cG9zaXRpb246IFwiYWJzb2x1dGVcIixcblx0XHR0b3A6IDAsXG5cdFx0bGVmdDogMFxuXHR9KTtcblx0Y29udGV4dCA9IGNhbnZhc1swXS5nZXRDb250ZXh0KFwiMmRcIik7XG5cblx0Ly90cmlnZ2VyIGEgcmVzaXplIGltbWVkaWF0ZWx5XG5cdCQod2luZG93KS5yZXNpemUoKTtcblxuXHRcblx0Ly9hIGR5bmFtaWMgRE9NIGVsZW1lbnRcblx0ZWxlbWVudCA9ICQoXCI8ZGl2PlwiKS50ZXh0KFwiSGVsbG8sIHdvcmxkIVwiKS5jc3Moe1xuXHRcdHBhZGRpbmc6IDVcblx0fSk7XG5cblx0cGFyZW50LmFwcGVuZChjYW52YXMpO1xuXHRwYXJlbnQuYXBwZW5kKGVsZW1lbnQpO1xufTtcblxubW9kdWxlLmV4cG9ydHMuc2hvdyA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG5cdGNhbnZhcy5mYWRlSW4oNDAwLCBjYWxsYmFjayk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5oaWRlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcblx0Y2FudmFzLmZhZGVPdXQoNDAwLCBjYWxsYmFjayk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5kaXNwb3NlID0gZnVuY3Rpb24ocGFyZW50KSB7XG5cdGNhbnZhcy5kZXRhY2goKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnJlc2l6ZSA9IGZ1bmN0aW9uKHcsIGgpIHtcblx0d2lkdGggPSBjYW52YXNbMF0ud2lkdGggPSB3O1xuXHRoZWlnaHQgPSBjYW52YXNbMF0uaGVpZ2h0ID0gaDtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnJlbmRlciA9IGZ1bmN0aW9uKCkge1xuXHRjb250ZXh0LmNsZWFyUmVjdCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcblxuXHR0aW1lcisrO1xuXG5cdGNvbnRleHQubGluZVdpZHRoID0gMTU7XG5cdGNvbnRleHQuc3Ryb2tlU3R5bGUgPSAnZ3JheSc7XG5cblx0Y29udGV4dC5iZWdpblBhdGgoKTtcblx0Y29udGV4dC5hcmMoMTUwLCAxNTAsIDI1LCAwLCBNYXRoLnNpbih0aW1lciAqIDAuMDUpICsgTWF0aC5QSSApO1xuXHRjb250ZXh0LnN0cm9rZSgpO1xufTsiLCIvL1RoaXMgaXMgdGhlIGluZGV4IG9mIGFsbCBvdXIgZGVtb3Ncbi8vSXQgaXMgc2ltcGx5IGFuIGFycmF5IHRvIHRoZSByZXF1aXJlJ2QgbW9kdWxlc1xubW9kdWxlLmV4cG9ydHMgPSBbXG5cdHJlcXVpcmUoJy4vZGVtbzEuanMnKSxcblx0cmVxdWlyZSgnLi9kZW1vMi5qcycpXG5dOyIsInZhciAkID0gcmVxdWlyZSgnanF1ZXJ5Jyk7XG5cbi8vR2V0IHRoZSBhcnJheSBvZiBkZW1vcyB3ZSB3aWxsIGJlIHNob3dpbmdcbnZhciBkZW1vTGlzdCA9IHJlcXVpcmUoJy4vaW5kZXguanMnKTtcblxudmFyIGN1cnJlbnREZW1vID0gbnVsbCxcblx0cGFyZW50Q29udGFpbmVyID0gbnVsbCxcblx0d2lkdGgsIGhlaWdodDtcblxuZnVuY3Rpb24gc2V0RGVtbyhkZW1vKSB7XG5cdGN1cnJlbnREZW1vID0gZGVtbztcblxuXHRkZW1vLnNldHVwKHBhcmVudENvbnRhaW5lcik7XG5cdGRlbW8ucmVzaXplKHdpZHRoLCBoZWlnaHQpO1xuXHRkZW1vLnNob3coKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyKCkge1xuXHRjdXJyZW50RGVtby5yZW5kZXIoKTtcblx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKHJlbmRlcik7XG59XG5cbiQoZnVuY3Rpb24oKSB7XG5cdC8vd2UnbGwganVzdCB1c2UgYm9keSBhcyBvdXIgcGFyZW50IGNvbnRhaW5lciBmb3IgZGVtb3MuLi5cblx0cGFyZW50Q29udGFpbmVyID0gJChcImJvZHlcIik7XG5cdHBhcmVudENvbnRhaW5lci5jc3MoXCJvdmVyZmxvd1wiLCBcImhpZGRlblwiKTtcblxuXHQvL2hhbmRsZSByZXNpemUgZm9yIGN1cnJlbnQgZGVtb1xuXHQkKHdpbmRvdykucmVzaXplKGZ1bmN0aW9uKCkge1xuXHRcdGlmIChjdXJyZW50RGVtbykge1xuXHRcdFx0d2lkdGggPSAkKHdpbmRvdykud2lkdGgoKTtcblx0XHRcdGhlaWdodCA9ICQod2luZG93KS5oZWlnaHQoKTtcblx0XHRcdGN1cnJlbnREZW1vLnJlc2l6ZSggd2lkdGgsIGhlaWdodCApO1xuXHRcdH1cblx0fSk7XG5cblx0Ly9zaG93IHRoZSBmaXJzdCBkZW1vIGluIHRoZSBsaXN0XG5cdHNldERlbW8oZGVtb0xpc3RbMF0pO1xuXG5cdHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xufSk7Il19
;