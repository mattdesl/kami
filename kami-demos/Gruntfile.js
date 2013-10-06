var vendor = {
	jquery: 'bower_components/jquery/jquery.js',
	transit: 'bower_components/jquery.transit/jquery.transit.js',
	threejs: 'bower_components/threejs/build/three.js'
};

module.exports = function(grunt) {

	grunt.initConfig({

		pkg: grunt.file.readJSON('package.json'),

		browserify: {
			// Externalize 3rd party libraries for faster builds
			// http://benclinkinbeard.com/blog/2013/08/external-bundles-for-faster-browserify-builds/
			libs: {
				options: {
					shim: {
						jquery: { path: vendor.jquery, exports: '$' },
						threejs: { path: vendor.threejs, exports: 'THREE' },

						//jQuery plugins need to be handled specially... 
						transit: { 
							path: vendor.transit, exports: null, 
							depends: { jquery: '$' }
						},
					}, 
					//Include source maps for libs during development...
					debug: true
				},
				src: [ vendor.jquery, vendor.transit, vendor.threejs ],
				dest: 'js/libs.js'
			},

			//Here is where we bundle our app...
			build: {
				src: ['src/main.js'],
				dest: 'js/bundle.js',

				options: {
					alias: [  //these are what require() will use
						vendor.jquery + ':jquery',
						vendor.threejs + ':threejs'
					],
					external: [
						vendor.jquery,
						vendor.threejs
					], 
					debug: true
				}
			}
		}, 

		watch: {
			js: { 
				//Watch for changes...
				files: ['src/*.js', 'index.html', 'Gruntfile.js'],
				tasks: ['browserify:build'],
				options: { 
					livereload: true
				},
			},
		}
	});
 
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-watch');

	grunt.registerTask('build-all', ['browserify']);
	grunt.registerTask('build', ['browserify:build']); 
	grunt.registerTask('default', ['build-all']);

};