
// the prefix that is used for each Grafana panel URL
OHG_DEFAULTS["urlPrefix"] = "http://grafana:3000";

// use "false" so actual pages are loaded (or comment the line)
OHG_DEFAULTS["debug"] = "true";

// use "default" for the default openHAB sitemap (or comment the line)
OHG_DEFAULTS["sitemap"] = "grafana";

if (OHG_DEFAULTS["debug"] === "true") {
    console.log("Using OHG_DEFAULTS = " + JSON.stringify(OHG_DEFAULTS));
}
