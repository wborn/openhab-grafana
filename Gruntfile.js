/*global module, require */

module.exports = function(grunt) {
	"use strict";

	require("load-grunt-tasks")(grunt);

	grunt.initConfig({
		pkg: grunt.file.readJSON("package.json"),

		clean: {
			all: [
				"example/html/smarthome-grafana.js",
				"web/smarthome-grafana.js",
			]
		},

		eslint: {
			options: {
				configFile: "eslint.json"
			},
			target: ["web-src/smarthome-grafana.js"]
		},

		uglify: {
			all: {
				files: {
					"example/html/smarthome-grafana.js": ["web-src/smarthome-grafana.js"],
					"web/smarthome-grafana.js": ["web-src/smarthome-grafana.js"]
				}
			}
		}
	});

	grunt.registerTask("default", [
		"eslint",
		"uglify"
	]);

	grunt.registerTask("clean", [
		"clean"
	]);
};
