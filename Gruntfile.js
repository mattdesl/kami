module.exports = function(grunt) {
	
	require('load-grunt-tasks')(grunt);

	grunt.initConfig({

		pkg: grunt.file.readJSON('package.json'),

		dirs: {
			dist: 'build',
			src: 'lib',
			demos: 'demos'
		},


		browserify: {
			//We include a UMD build for non-Node people...
			UMD: {
				src: ['./lib/index.js'],
				dest: '<%= dirs.dist %>/kami.umd.js',

				options: {
					standalone: "KAMI"
					// ignore: '<%= pkg.main %>',
					// debug: true
				}
			},
			
			demo_src: {
				src: ['<%= dirs.demos %>/src/index.js'],
				dest: '<%= dirs.demos %>/bundle.js',

				options: {
					//We alias the paths so the demos can have
					//the same syntax as if we just NPM installed Kami
					// aliasMappings: {
					// 	cwd: 'lib/',
					// 	src: ['**/*.js'],
					// 	dest: 'kami/lib'
					// }					
				}
			},


		},

		watch: {
			demos: { 
				//Watch for changes...
				files: ['<%= dirs.src %>/**/*.js', 
						'<%= dirs.demos %>/**/*.js',
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