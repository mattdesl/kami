module.exports = function(grunt) {
	
	require('load-grunt-tasks')(grunt);

	grunt.initConfig({

		pkg: grunt.file.readJSON('package.json'),

		dirs: {
			build: 'build',

			src: 'lib',

			demos: 'demos', 
			demo_src: 'demos/src',
			demo_build: 'demos/build'
		},


		browserify: {
			//We include a UMD build for non-Node people...
			UMD: {
				src: ['<%= dirs.src %>/index-umd.js'],
				dest: '<%= dirs.build %>/kami.umd.js',
				
				options: {
					standalone: "kami"
					// ignore: '<%= pkg.main %>',
					// debug: true
				}
			},
			
			demos: {
				src: ['<%= dirs.src %>/index.js'],
				dest: '<%= dirs.demo_build %>/bundle.js',
				
				options: {
					debug: true,
					alias: [
						'<%= dirs.src %>/index.js:kami',
						'kami-gl',
						'signals'
					]
				}
			}
		},

		watch: {
			demos: { 
				//Watch for changes...
				files: ['<%= dirs.src %>/**/*.js', 
						'<%= dirs.demo_src %>/**/*.js',
						'<%= dirs.demos %>/**/*.html', 
						'Gruntfile.js'],
				tasks: ['browserify:demos'],
				options: { 
					livereload: true
				},
			},
		}
	});


	grunt.registerTask('default', ['build-all']);

};