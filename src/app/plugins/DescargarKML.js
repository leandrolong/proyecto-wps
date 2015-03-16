(function(view) {
"use strict";
var Uint8Array = view.Uint8Array
, HTMLCanvasElement = view.HTMLCanvasElement
, is_base64_regex = /\s*;\s*base64\s*(?:;|$)/i
, base64_ranks
, decode_base64 = function(base64) {
var len = base64.length
, buffer = new Uint8Array(len / 4 * 3 | 0)
, i = 0
, outptr = 0
, last = [0, 0]
, state = 0
, save = 0
, rank
, code
, undef
;
while (len--) {
code = base64.charCodeAt(i++);
rank = base64_ranks[code-43];
if (rank !== 255 && rank !== undef) {
last[1] = last[0];
last[0] = code;
save = (save << 6) | rank;
state++;
if (state === 4) {
buffer[outptr++] = save >>> 16;
if (last[1] !== 61 /* padding character */) {
buffer[outptr++] = save >>> 8;
}
if (last[0] !== 61 /* padding character */) {
buffer[outptr++] = save;
}
state = 0;
}
}
}
// 2/3 chance there's going to be some null bytes at the end, but that
// doesn't really matter with most image formats.
// If it somehow matters for you, truncate the buffer up outptr.
return buffer;
}
;
if (Uint8Array) {
base64_ranks = new Uint8Array([
62, -1, -1, -1, 63, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1
, -1, -1, 0, -1, -1, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25
, -1, -1, -1, -1, -1, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35
, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51
]);
}
if (HTMLCanvasElement && !HTMLCanvasElement.prototype.toBlob) {
HTMLCanvasElement.prototype.toBlob = function(callback, type /*,
...args*/) {
if (!type) {
type = "image/png";
} if (this.mozGetAsFile) {
callback(this.mozGetAsFile("canvas", type));
return;
}
var args = Array.prototype.slice.call(arguments, 1)
, dataURI = this.toDataURL.apply(this, args)
, header_end = dataURI.indexOf(",")
, data = dataURI.substring(header_end + 1)
, is_base64 = is_base64_regex.test(dataURI.substring(0,
header_end))
, blob
;
if (Blob.fake) {
// no reason to decode a data: URI that's just going to become a data URI again
blob = new Blob
if (is_base64) {
blob.encoding = "base64";
} else {
blob.encoding = "URI";
}
blob.data = data;
blob.size = data.length;
} else if (Uint8Array) {
if (is_base64) {
blob = new Blob([decode_base64(data)], {type: type});
} else {
blob = new Blob([decodeURIComponent(data)], {type: type});
}
}
callback(blob);
};
}
}(self));
/* FileSaver.js
* A saveAs() FileSaver implementation.
* 2013-01-23
*
* By Eli Grey, http://eligrey.com
* License: X11/MIT
* See LICENSE.md
*/
/*global self */
/*jslint bitwise: true, regexp: true, confusion: true, es5: true, vars:
true, white: true,
plusplus: true */
/*! @source
http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */
var saveAs = saveAs
|| (navigator.msSaveBlob && navigator.msSaveBlob.bind(navigator))
|| (function(view) {
"use strict";
var doc = view.document
// only get URL when necessary in case BlobBuilder.js hasn't overridden it yet
, get_URL = function() {
return view.URL || view.webkitURL || view;
}
, URL = view.URL || view.webkitURL || view
, save_link = doc.createElementNS("http://www.w3.org/1999/xhtml",
"a")
, can_use_save_link = "download" in save_link
, click = function(node) {
var event = doc.createEvent("MouseEvents");
event.initMouseEvent(
"click", true, false, view, 0, 0, 0, 0, 0
, false, false, false, false, 0, null
);
node.dispatchEvent(event);
}
, webkit_req_fs = view.webkitRequestFileSystem
, req_fs = view.requestFileSystem || webkit_req_fs ||
view.mozRequestFileSystem
, throw_outside = function (ex) {
(view.setImmediate || view.setTimeout)(function() {
throw ex;
}, 0);
}
, force_saveable_type = "application/octet-stream"
, fs_min_size = 0
, deletion_queue = []
, process_deletion_queue = function() {
var i = deletion_queue.length;
while (i--) {
var file = deletion_queue[i];
if (typeof file === "string") { // file is an object URL URL.revokeObjectURL(file);
} else { // file is a File
file.remove();
}
}
deletion_queue.length = 0; // clear queue
}
, dispatch = function(filesaver, event_types, event) {
event_types = [].concat(event_types);
var i = event_types.length;
while (i--) {
var listener = filesaver["on" + event_types[i]];
if (typeof listener === "function") {
try {
listener.call(filesaver, event || filesaver);
} catch (ex) {
throw_outside(ex);
}
}
}
}
, FileSaver = function(blob, name) {
// First try a.download, then web filesystem, then object URLs
var filesaver = this
, type = blob.type
, blob_changed = false
, object_url
, target_view
, get_object_url = function() {
var object_url = get_URL().createObjectURL(blob);
deletion_queue.push(object_url);
return object_url;
}
, dispatch_all = function() {
dispatch(filesaver, "writestart progress write writeend".split(" "));
}
// on any filesys errors revert to saving with object URLs
, fs_error = function() {
// don't create more object URLs than needed
if (blob_changed || !object_url) {
object_url = get_object_url(blob);
}
if (target_view) {
target_view.location.href = object_url;
}
filesaver.readyState = filesaver.DONE;
dispatch_all();
}
, abortable = function(func) {
return function() {
if (filesaver.readyState !== filesaver.DONE) {
return func.apply(this, arguments);
}
};
}
, create_if_not_found = {create: true, exclusive: false}
, slice
;
filesaver.readyState = filesaver.INIT;
if (!name) {
name = "download";
}
if (can_use_save_link) {
object_url = get_object_url(blob);
save_link.href = object_url;
save_link.download = name;
click(save_link);
filesaver.readyState = filesaver.DONE;
dispatch_all();
return;
}
// Object and web filesystem URLs have a problem saving in Google Chrome when
// viewed in a tab, so I force save with application/octetstream
// http://code.google.com/p/chromium/issues/detail?id=91158
if (view.chrome && type && type !== force_saveable_type) {
slice = blob.slice || blob.webkitSlice;
blob = slice.call(blob, 0, blob.size, force_saveable_type);
blob_changed = true;
}
// Since I can't be sure that the guessed media type will trigger a download
// in WebKit, I append .download to the filename.
// https://bugs.webkit.org/show_bug.cgi?id=65440
if (webkit_req_fs && name !== "download") {
name += ".download";
}
if (type === force_saveable_type || webkit_req_fs) {
target_view = view;
} else {
target_view = view.open();
}
if (!req_fs) {
fs_error();
return;
}
fs_min_size += blob.size;
req_fs(view.TEMPORARY, fs_min_size, abortable(function(fs) {
fs.root.getDirectory("saved", create_if_not_found,
abortable(function(dir) {
var save = function() {
dir.getFile(name, create_if_not_found,
abortable(function(file) {
file.createWriter(abortable(function(writer) {
writer.onwriteend = function(event) {
target_view.location.href =
file.toURL();
deletion_queue.push(file);
filesaver.readyState = filesaver.DONE;
dispatch(filesaver, "writeend", event);
};
writer.onerror = function() {
var error = writer.error;
if (error.code !== error.ABORT_ERR) {
fs_error();
}
};
"writestart progress write abort".split("").forEach(function(event) {
writer["on" + event] = filesaver["on" +
event];
});
writer.write(blob);
filesaver.abort = function() {
writer.abort();
filesaver.readyState = filesaver.DONE;
};
filesaver.readyState = filesaver.WRITING;
}), fs_error);
}), fs_error);
};
dir.getFile(name, {create: false},
abortable(function(file) {
// delete file if it already exists
file.remove();
save();
}), abortable(function(ex) {
if (ex.code === ex.NOT_FOUND_ERR) {
save();
} else {
fs_error();
}
}));
}), fs_error);
}), fs_error);
}
, FS_proto = FileSaver.prototype
, saveAs = function(blob, name) {
return new FileSaver(blob, name);
}
;
FS_proto.abort = function() {
var filesaver = this;
filesaver.readyState = filesaver.DONE;
dispatch(filesaver, "abort");
};
FS_proto.readyState = FS_proto.INIT = 0;
FS_proto.WRITING = 1;
FS_proto.DONE = 2;
FS_proto.error =
FS_proto.onwritestart =
FS_proto.onprogress =
FS_proto.onwrite =
FS_proto.onabort =
FS_proto.onerror =
FS_proto.onwriteend =
null;
view.addEventListener("unload", process_deletion_queue, false);
return saveAs;
}(self));
var DescargarKML = Ext.extend(gxp.plugins.Tool, {
ptype: 'app_descargarkml',
/** inicio plugin */
init: function(target) {
DescargarKML.superclass.init.apply(this, arguments);
var map = this.target.mapPanel.map;
// Add action buttons when the viewer is ready
target.on('ready', function() {
// Get a reference to the vector layer from app.js
this.layer = target.getLayerRecordFromMap({
name: "sketch",
source: 'ol'
}).getLayer();
// Some defaults
var actionDefaults = {
map: target.mapPanel.map,
enableToggle: true,
toggleGroup: this.ptype,
allowDepress: true
};
this.addActions([
new GeoExt.Action({
text: 'Descargar KML',
handler:function(evt) {
//si existe la capa intersecciuiere decir que hay entidades resultantes, sino no se podrescargar
var me = this;
existe = map.getLayersByName ("Interseccion");
if (existe.length != 0){
var NumInterseccion =
map.getLayersByName("Interseccion")[0].features.length;
if ((NumInterseccion > 0) ){
var format = new OpenLayers.Format.KML({
//'maxDepth':10,
'extractStyles':true,
'internalProjection':
map.baseLayer.projection,
'externalProjection': new
OpenLayers.Projection("EPSG:4326")
});
var s =
format.write(map.getLayersByName("Interseccion")[0].features);
alert(s);
/* FileSaver.js demo script
* 2012-01-23
*
* By Eli Grey, http://eligrey.com
* License: X11/MIT
* See LICENSE.md
*/
/*! @source
http://purl.eligrey.com/github/FileSaver.js/blob/master/demo/demo.js */
(function(view) {
"use strict";
// The canvas drawing portion of the demo is based off the demo at
//http://www.williammalone.com/articles/create-html5-canvas-javascriptdrawing-app/
var document = view.document , $ = function(id) {return document.getElementById(id)
}
, session = view.sessionStorage
// only get URL when necessary in case Blob.js hasn't defined it yet 
, get_blob = function() {
return view.Blob;
}
;
var BB = get_blob();
saveAs(
new BB(
[s] , {type: "text/xml; subtype=gml/3.1.1; charset=" + document.characterSet}), "interseccion.kml");
}(self));
}
else{ alert("Error en la descarga: no existen entidades en la capa Interseccion");}
}
else {alert('no existe la capa Interseccion');}
}
},actionDefaults)
]);
}, this);
},
});
//Ext.preg(myapp.plugins.DescargarKML.prototype.ptype,
myapp.plugins.DescargarKML);
Ext.preg(DescargarKML.prototype.ptype, DescargarKML);

