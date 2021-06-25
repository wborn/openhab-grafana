/**
 * openHAB Grafana panel utilities
 *
 * Updates the source URL of Grafana <iframe> panels using openHAB server side events (SSE).
 * OHSubscriber is based on the javascript of the openHAB Basic UI by Vlad Ivanov.
 *
 * @author Wouter Born
 */

/* exported addGrafanaPanel, GrafanaPanel */
/* eslint-env browser */
/* eslint no-undef:2 */
/* eslint no-new:0 */
/* eslint no-underscore-dangle:0 */

"use strict";

var
    OHG_DEFAULTS = {
        // library
        debug: "false",
        render: "false",
        refresh: "0",
        // OH sitemap
        sitemap: "default",
        // Grafana URL
        urlPrefix: "http://grafana:3000",
        panelPath: "/d/",
        renderPanelPath: "/d/",
        // Grafana panel parameters
        from: "now-1d",
        to: "now",
        theme: "light",
        // Grafana render panel parameters
        width: "auto",
        height: "auto"
    };

function queryParams(param) {
    if (!param) {
        return {};
    }

    var
        match,
        url = param.toString(),
        queryIndex = url.indexOf("?"),
        query = queryIndex !== -1 ? url.substring(queryIndex + 1) : "",
        re = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(/\+/g, " ")); },
        result = {};

    do {
        match = re.exec(query);
        if (match) {
           result[decode(match[1])] = decode(match[2]);
        }
    } while (match);

    return result;
}

var
    urlParams = queryParams(window.location),
    parentUrlParams = queryParams(window.parent.location.href);

function resolveParam(params, name) {
    if (params !== undefined && params[name] !== undefined) {
        return params[name];
    } else if (urlParams !== undefined && urlParams[name] !== undefined) {
        return urlParams[name];
    } else if (parentUrlParams !== undefined && parentUrlParams[name] !== undefined) {
        return parentUrlParams[name];
    } else {
        return OHG_DEFAULTS[name];
    }
}

function OHSubscriber(params) {
    var
        p = params,
        initialized = false,
        initializedListeners = [],
        items = {},
        subscription = {
            id: "",
            page: resolveParam(p, "w"),
            sitemap: resolveParam(p, "sitemap")
        };

    this.addItemListener = function(itemName, listener) {
        if (typeof listener !== "function") {
            throw new Error("addItemListener 'listener' is not a function");
        }
        if (items[itemName] !== undefined) {
            if (!items[itemName].listeners.includes(listener)) {
                items[itemName].listeners.push(listener);
            }
        } else {
            items[itemName] = {listeners: [listener], value: undefined};
        }
    };

    this.addInitializedListener = function(listener) {
        if (typeof listener !== "function") {
            throw new Error("addInitializedListener 'listener' is not a function");
        }
        initializedListeners.push(listener);
    };

    this.isInitialized = function() {
        return initialized;
    };

    function ajax(params) {
        var
            p = params,
            type = typeof p.type !== "undefined" ? p.type : "GET",
            data = typeof p.data !== "undefined" ? p.data : "",
            headers = typeof p.headers !== "undefined" ? p.headers : {},
            request = new XMLHttpRequest();

        request.open(type, p.url, true);

        for (var h in headers) {
            request.setRequestHeader(h, headers[h]);
        }

        request.onload = function() {
            if (request.status < 200 || request.status > 400) {
                if (typeof p.error === "function") {
                    p.error(request);
                }
                return;
            }
            if (typeof p.callback === "function") {
                p.callback(request);
            }
        };
        request.onerror = function() {
            if (typeof p.error === "function") {
                p.error(request);
            }
        };
        request.send(data);

        return request;
    }

    function uninitializedItemNames() {
        var result = [];
        for (var itemName in items) {
            if (items[itemName].value === undefined) {
                result.push(itemName);
            }
        }
        return result;
    }

    function areAllItemsInitialized() {
        return uninitializedItemNames().length === 0;
    }

    function updateInitialized() {
        if (!initialized && areAllItemsInitialized()) {
            initialized = true;
            for (var i = 0; i < initializedListeners.length; i++) {
                initializedListeners[i]();
            }
        }
    }

    function updateItem(itemName, value) {
        if (items[itemName].value === value) {
            return;
        }

        items[itemName].value = value;

        var itemListeners = items[itemName].listeners;
        for (var i = 0; i < itemListeners.length; i++) {
            var listener = itemListeners[i];
            listener(itemName, value);
        }

        updateInitialized();
    }

    function ChangeListenerEventsource(subscribeLocation) {
        var
            _t = this;

        _t.navigate = function(){};
        _t.source = new EventSource(subscribeLocation);
        _t.source.addEventListener("event", function(payload) {
            if (_t.paused) {
                return;
            }

            var
                data = JSON.parse(payload.data),
                itemName = data.item.name,
                value;

            if (items[itemName] === undefined) {
                return;
            }

            if (
                (typeof(data.label) === "string") &&
                (data.label.indexOf("[") !== -1) &&
                (data.label.indexOf("]") !== -1)
            ) {
                var
                    pos = data.label.indexOf("[");

                value = data.label.substr(
                    pos + 1,
                    data.label.lastIndexOf("]") - (pos + 1)
                );
            } else {
                value = data.item.state;
            }

            updateItem(itemName, value);
        });
    }

    function ChangeListenerLongpolling() {
        var
            _t = this;

        function applyChanges(response) {
            try {
                response = JSON.parse(response);
            } catch (e) {
                return;
            }

            function walkWidgets(widgets) {
                widgets.forEach(function(widget) {
                    if (widget.item === undefined) {
                        return;
                    }

                    var
                        itemName = widget.item.name,
                        value = widget.item.state;

                    if (items[itemName] !== undefined) {
                        updateItem(itemName, value);
                    }
                });
            }

            if (response.leaf) {
                walkWidgets(response.widgets);
            } else {
                response.widgets.forEach(function(frameWidget) {
                    walkWidgets(frameWidget.widgets);
                });
            }
        }

        function start() {
            var
                cacheSupression = Math.random().toString(16).slice(2);

            _t.request = ajax({
                url: "/rest/sitemaps/" + subscription.sitemap + "/" + subscription.page + "?_=" + cacheSupression,
                headers: {"X-Atmosphere-Transport": "long-polling"},
                callback: function(request) {
                    applyChanges(request.responseText);
                    setTimeout(function() {
                        start();
                    }, 1);
                },
                error: function() {
                    // Wait 1s and restart long-polling
                    setTimeout(function() {
                        start();
                    }, 1000);
                }
            });
        }

        start();
    }

    function ChangeListener() {
        var
            _t = this;

        _t.startSubscriber = function(response) {
            var
                responseJSON,
                subscribeLocation,
                subscribeLocationArray;

            try {
                responseJSON = JSON.parse(response.responseText);
            } catch (e) {
                return;
            }

            if (responseJSON.status !== "CREATED") {
                return;
            }

            try {
                subscribeLocation = responseJSON.context.headers.Location[0];
            } catch (e) {
                return;
            }

            subscribeLocationArray = subscribeLocation.split("/");
            subscription.id = subscribeLocationArray[subscribeLocationArray.length - 1];

            if ("EventSource" in window) {
                ChangeListenerEventsource.call(_t, subscribeLocation +
                    "?sitemap=" + subscription.sitemap +
                    "&pageid=" + subscription.page);
            } else {
                ChangeListenerLongpolling.call(_t);
            }
        };

        ajax({
            url: "/rest/sitemaps/events/subscribe",
            type: "POST",
            callback: _t.startSubscriber
        });
    }

    function ValuesInitializer() {
        var
            _t = this;

        _t.valueHandler = function(response) {
            var
                responseJSON;

            try {
                responseJSON = JSON.parse(response.responseText);
            } catch (e) {
                return;
            }

            updateItem(responseJSON.name, responseJSON.state);
        };

        var itemNames = uninitializedItemNames();
        for (var i = 0; i < itemNames.length; i++) {
            ajax({
                url: "/rest/items/" + itemNames[i],
                type: "GET",
                callback: _t.valueHandler
            });
        }

        updateInitialized();
    }

    function initialize() {
        if (subscription.page === undefined) {
            subscription.page = subscription.sitemap;
        }

        document.addEventListener("DOMContentLoaded", function() {
            subscription.valuesInitializer = new ValuesInitializer();
            subscription.changeListener = new ChangeListener();
        });
    }

    initialize();
}

var ohSubscriber = new OHSubscriber();

function GrafanaPanel(params) {
    var
        p = params,
        refreshTimerId = undefined,
        resizeTimerId = undefined,
        frame = resolveParam(p, "frame"),
        urlPrefix = resolveParam(p, "urlPrefix"),
        panelPath = resolveParam(p, "panelPath"),
        renderPanelPath = resolveParam(p, "renderPanelPath"),
        libVars = {
            debug: {
                value: resolveParam(p, "debug"),
                itemName: resolveParam(p, "debugItem"),
                itemFunction: params.debugItemFunction
            },
            render: {
                value: resolveParam(p, "render"),
                itemName: resolveParam(p, "renderItem"),
                itemFunction: params.renderItemFunction
            },
            refresh: {
                value: resolveParam(p, "refresh"),
                itemName: resolveParam(p, "refreshItem"),
                itemFunction: params.refreshItemFunction
            }
        },
        urlVars = {
            dashboard: {
                value: resolveParam(p, "dashboard"),
                itemName: resolveParam(p, "dashboardItem"),
                itemFunction: params.dashboardItemFunction
            },
            from: {
                key: "from",
                value: resolveParam(p, "from"),
                itemName: resolveParam(p, "fromItem"),
                itemFunction: params.fromItemFunction
            },
            to: {
                key: "to",
                value: resolveParam(p, "to"),
                itemName: resolveParam(p, "toItem"),
                itemFunction: params.toItemFunction
            },
            panel: {
                key: "viewPanel",
                value: resolveParam(p, "panel"),
                itemName: resolveParam(p, "panelItem"),
                itemFunction: params.panelItemFunction
            },
            theme: {
                key: "theme",
                value: resolveParam(p, "theme"),
                itemName: resolveParam(p, "themeItem"),
                itemFunction: params.themeItemFunction
            },
            width: {
                key: "width",
                value: resolveParam(p, "width"),
                itemName: resolveParam(p, "widthItem"),
                itemFunction: params.widthItemFunction
            },
            height: {
                key: "height",
                value: resolveParam(p, "height"),
                itemName: resolveParam(p, "heightItem"),
                itemFunction: params.heightItemFunction
            }
        };

    function updateFrameSourceURL() {
        var debug = libVars.debug.value;
        var render = libVars.render.value;
        var refresh = libVars.refresh.value;

        var iframe = document.getElementById(frame);
        var idocument = iframe.contentWindow.document;

        var url = urlPrefix;
        url += render === "true" ? renderPanelPath : panelPath;
        url += urlVars.dashboard.value;

        var firstParameter = true;
        for (var uvKey in urlVars) {
            var key = urlVars[uvKey].key;
            var value = urlVars[uvKey].value;

            if (key === "width") {
                value = render === "false" ? undefined : (value === "auto" ? idocument.body.clientWidth : value);
            } else if (key === "height") {
                value = render === "false" ? undefined : (value === "auto" ? idocument.body.clientHeight : value);
            }

            if (key !== undefined && value !== undefined) {
                url += (firstParameter ? "?" : "&") + key + "=" + value;
                firstParameter = false;
            }
        }
        
        url += "&" + "kiosk=1";

        if (render === "true") {
            // append cache busting parameter
            url += "&cacheBuster=" + Date.now();
        }
        // update frame content
        if (debug === "true") {
            idocument.open();
            idocument.write("<a href=\"" + url + "\">" + url + "</a>");
            idocument.close();
        } else if (render === "true") {
            var htmlUrl = url.replace(renderPanelPath, panelPath);
            idocument.open();
            idocument.write("<style>body{margin:0px}p{margin:0px}</style>");
            idocument.write("<p style=\"text-align:center;\"><a href=\"" + htmlUrl + "\"><img src=\"" + url + "\"></a></p>");
            idocument.close();
        } else if (document.getElementById(frame).src !== url) {
            // replace the URL so changes are not added to the browser history
            iframe.contentWindow.location.replace(url);
        }

        // schedule/cancel rendered image refresh
        if (render === "true" && refresh > 0) {
            clearTimeout(refreshTimerId);
            refreshTimerId = setTimeout(updateFrameSourceURL, refresh);
        } else if (refreshTimerId !== undefined) {
            clearTimeout(refreshTimerId);
        }
    }

    function updateFrameOnResize() {
        if (libVars.render.value === "true" && (urlVars.width.value === "auto" || urlVars.height.value === "auto")) {
            clearTimeout(resizeTimerId);
            resizeTimerId = setTimeout(updateFrameSourceURL, 500);
        } else {
            clearTimeout(resizeTimerId);
        }
    }

    function updateVarsOnItemUpdate(vars, itemName, value) {
        for (var key in vars) {
            if (vars[key].itemName !== undefined && vars[key].itemName === itemName) {
                if (vars[key].itemFunction) {
                    value = vars[key].itemFunction(value);
                }
                vars[key].value = value;
            }
        }
    }

    function onItemUpdated(itemName, value) {
        updateVarsOnItemUpdate(libVars, itemName, value);
        updateVarsOnItemUpdate(urlVars, itemName, value);

        if (ohSubscriber.isInitialized()) {
            updateFrameSourceURL();
        }
    }

    function assertPropertyDefined(name, value) {
        if (value === undefined) {
            throw new Error("Property '" + name + "' is undefined");
        }
    }

    function assertVarsDefinedOrSubscribeToOH(vars) {
        for (var key in vars) {
            var itemName = vars[key].itemName;
            if (itemName !== undefined) {
                ohSubscriber.addItemListener(itemName, onItemUpdated);
            } else if (vars[key].value === undefined) {
                throw new Error("Property '" + key + "' requires a default value or itemName to obtain the value from");
            }
        }
    }

    function initialize() {
        assertPropertyDefined("frame", frame);
        assertPropertyDefined("urlPrefix", urlPrefix);
        assertPropertyDefined("panelPath", panelPath);
        assertPropertyDefined("renderPanelPath", renderPanelPath);

        assertVarsDefinedOrSubscribeToOH(libVars);
        assertVarsDefinedOrSubscribeToOH(urlVars);

        ohSubscriber.addInitializedListener(updateFrameSourceURL);
        window.addEventListener("resize", updateFrameOnResize);
    }

    initialize();
}

var grafanaPanels = [];

function createGuid()
{
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c === "x" ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function addGrafanaPanel(uniqueId, params) {
    if (uniqueId === undefined) {
        uniqueId = createGuid();
    }

    var div = document.createElement("div");
    div.id = "panel-" + uniqueId + "-container";
    div.className = "panel-container";
    document.body.appendChild(div);

    var frame = document.createElement("iframe");
    frame.id = "panel-" + uniqueId + "-frame";
    frame.className = "panel-frame";
    frame.scrolling = "no";
    div.appendChild(frame);

    if (params === undefined) {
        params = {};
    }

    params.frame = frame.id;

    var panel = new GrafanaPanel(params);
    grafanaPanels.push(panel);
}
