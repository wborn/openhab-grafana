/*global module, require */

module.exports = function(grunt) {
	"use strict";

	require("load-grunt-tasks")(grunt);

	grunt.initConfig({
		pkg: grunt.file.readJSON("package.json"),

		clean: {
			all: [
				"example/html/openhab-grafana.js",
				"web/openhab-grafana.js",
			]
		},

		eslint: {
			options: {
				configFile: "eslint.json"
			},
			target: ["web-src/openhab-grafana.js"]
		},

		uglify: {
			all: {
				files: {
					"example/html/openhab-grafana.js": ["web-src/openhab-grafana.js"],
					"web/openhab-grafana.js": ["web-src/openhab-grafana.js"]
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
