(function() {
	"use strict";

	var
		gulp = require("gulp"),
		uglify = require("gulp-uglify"),
		eslint = require("gulp-eslint");

	var
		sources = {
			js: "web-src/openhab-grafana.js",
		};

	gulp.task("eslint", function() {
		return gulp.src(sources.js)
			.pipe(eslint({
				configFile: "eslint.json"
			}))
			.pipe(eslint.format())
			.pipe(eslint.failAfterError());
	});

	gulp.task("js", function() {
		return gulp.src(sources.js)
			.pipe(uglify())
			.pipe(gulp.dest("./example/html"))
			.pipe(gulp.dest("./web"));
	});

	gulp.task("default", [ "eslint", "js" ]);
})();
